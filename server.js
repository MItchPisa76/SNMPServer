const express = require('express');
const cookieParser = require('cookie-parser');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

const app = express();
const server = express();

const sqlite = new Database('./prisma/dev.db');
const adapter = new PrismaBetterSqlite3({ sqlite, url: 'file:./prisma/dev.db' });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;

const PORT = 3080;

const sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
};

const sessions_Data = [];
const snmpQueries = [];

// Configurazione App Dashboard
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inclusione dei Moduli Esterni
const appRoutes = require('./routes/app')(prisma, sessions_Data, snmpQueries);
const githubRoutes = require('./routes/github')(sessions_Data, prisma, sslOptions);

app.use('/', appRoutes);
app.use('/api/github', githubRoutes);
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// Configurazione Server Dati (Ingestion MFP/Hosts)
server.set('json', path.join(__dirname, 'json'));

server.use(express.static(path.join(__dirname, 'json')));
server.use(express.json({ limit: '90mb' }));
server.use(express.urlencoded({ limit: '90mb', extended: true }));

server.post('/mfp', async (req, res) => {
    try {
        const token = req.headers["token"];
        let serial = req.headers["serial"];

        if (!token) return res.status(500).send("Errore token");
        if (token === "PLEASE") return res.status(401).send("WRONG token");
        const tokenI = Buffer.from(req.headers["customertoken"], 'base64').toString();


        const checkCustomer = await prisma.customers.findUnique({
            where: { "tokenI": tokenI },
            select: { tokenI: true },
        });

        if (!checkCustomer) return res.status(401).send("Invalid customerToken:" + req.headers["customertoken"]);

        const map = req.body;
        if (map.lastUpdates && map.lastUpdates.status && map.from)
            map.lastUpdates.status = map.lastUpdates.status + "@" + map.from;

        const jsonStringConsumabili = JSON.stringify(map.maintenanceinfo);
        const jsonStringAlerts = JSON.stringify(map.alertsinfo);
        const jsonStringInfo = JSON.stringify(map.datainfo);

        if (serial == null) {
            serial = "unkown";
        }
        if (map.query) {

            for (const q in map.query) {
                if (map.query[q]) {
                    console.log("query:", q, map.query[q]);
                    if (!snmpQueries[serial])
                        snmpQueries[serial] = {};
                    if (snmpQueries[serial][q])
                        console.log("   updated:" + q);
                    else
                        console.log("   created" + q);
                    snmpQueries[serial][q] = map.query[q];


                    continue;
                }

                console.log("***", q);
            }




        }
        if (map.removetempserial != null) {
            try {
                const nuovoToken = await prisma.dati.delete({
                    where: {
                        serial_token: {
                            serial: map.removetempserial,
                            token: tokenI
                        }
                    }
                });
                console.log("removed:", nuovoToken);
            } catch (error) {
                console.log(map, tokenI);
                console.error(error);
            }
        }


        const update = {
            datainfo: jsonStringInfo,
            "lastUpdates": JSON.stringify(map.lastUpdates),
        };
        const create = {
            serial: serial,
            token: tokenI,
            datainfo: jsonStringInfo,
            "lastUpdates": JSON.stringify(map.lastUpdates),
        };

        if (map.data && serial) {
            const oldData = await prisma.dati.findUnique({
                where: {
                    serial_token: {
                        serial: serial,
                        token: tokenI
                    }
                }, select: {
                    data: true
                }
            });
            if (oldData && oldData.data) {
                try {
                    const oldJsonStr = Buffer.from(oldData.data).toString('utf-8');
                    const oldJson = JSON.parse(oldJsonStr);
                    for (const o in oldJson) {
                        if (oldJson[o] != "exclude") {
                            if ((oldJson[o] == "forced") || (oldJson[o] != null && oldJson[o].startsWith("walk:"))) {
                            } else {
                                oldJson[o] = "ghost";
                            }
                        } else {
                            delete map.data[o];
                        }
                    }
                    Object.assign(oldJson, map.data);
                    map.data = oldJson;
                    //console.log(oldDataF);
                } catch (Error) {
                    console.error(Error);
                }
            }
            const jsonStringData = JSON.stringify(map.data);

            const jsonStringDataB64 = Buffer.from(jsonStringData, 'utf-8').toString('base64');
            update.data = jsonStringDataB64;
            create.data = jsonStringDataB64;
        }
        if (jsonStringConsumabili) {
            const dataconsumabili = Buffer.from(jsonStringConsumabili, 'utf-8').toString('base64');
            update.dataconsumabili = dataconsumabili;
            create.dataconsumabili = dataconsumabili;
        }

        if (jsonStringAlerts) {
            const dataalerts = Buffer.from(jsonStringAlerts, 'utf-8').toString('base64');
            update.dataalerts = dataalerts;
            create.dataalerts = dataalerts;
        }

        const nuovoToken = await prisma.dati.upsert({
            where: {
                serial_token: {
                    serial: serial,
                    token: tokenI
                }
            },
            update,
            create
        });

        if (!nuovoToken)
            return res.status(401).send("Invalid upsert:" + tokenI + " serial:" + serial);

        if (nuovoToken["dataalerts"])
            nuovoToken["dataalerts"] = Buffer.from(nuovoToken["dataalerts"]).toString('utf-8');
        if (nuovoToken["dataconsumabili"])
            nuovoToken["dataconsumabili"] = Buffer.from(nuovoToken["dataconsumabili"]).toString('utf-8');
        if (nuovoToken["data"])
            nuovoToken["data"] = Buffer.from(nuovoToken["data"]).toString('utf-8');
        // nuovoToken[data] = map.data;
        res.send(nuovoToken);
    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
});


server.get('/options', async (req, res) => {
    try {
        const token = req.headers["token"];
        if (!token) return res.status(401).send("Errore token");

        const customerToken = Buffer.from(req.headers["customertoken"], 'base64').toString();
        const nuovoToken = await prisma.hosts.findUnique({
            where: { token: token, "customerID": customerToken },
            select: { options: true },
        });

        if (!nuovoToken) return res.status(401).send("Invalid token:" + token);

        nuovoToken["options"] = Buffer.from(nuovoToken["options"]).toString('utf-8');
        res.send(nuovoToken);
    } catch (error) {
        res.status(500).send(error);
    }
});



server.post('/options', async (req, res) => {
    try {
        const token = req.headers["token"];
        if (!token) return res.status(500).send("Errore token");

        const localData = req.body["localData"];
        delete req.body["localData"];
        const ldo = localData;

        if (token === "PLEASE") {
            req.body["hostToken"] = crypto.randomBytes(32).toString('hex');
            const optionsBuffer = Buffer.from(JSON.stringify(req.body), 'utf-8');
            const customerToken = Buffer.from(req.headers["customertoken"], 'base64').toString();

            const data = {
                hostname: ldo[0]["localHostName"],
                token: req.body["hostToken"],
                "customerID": customerToken,
                options: optionsBuffer,
                "IPV4": JSON.stringify(localData),
            };
            const nuovoToken = await prisma.hosts.create({
                data
            });

            //  await prisma.customers.upsert({
            //      where: { "tokenI": customerToken },
            //      update: {},
            //      create: { "tokenI": customerToken, "name": "APPENA_CREATO" },
            //  });

            nuovoToken["options"] = Buffer.from(nuovoToken["options"]).toString('utf-8');
            nuovoToken["hostToken"] = nuovoToken["token"];
            delete nuovoToken["token"];
            res.send(nuovoToken);
        } else {
            const optionsBuffer = Buffer.from(JSON.stringify(req.body), 'utf-8'); const customerToken = Buffer.from(req.headers["customertoken"], 'base64').toString();
            const nuovoToken = await prisma.hosts.update({
                where: { token: token, "customerID": customerToken },
                data: { hostname: ldo[0]["localHostName"], options: optionsBuffer },
            });
            if (!nuovoToken) return res.status(401).send("Invalid token:" + token);

            nuovoToken["options"] = Buffer.from(nuovoToken["options"]).toString('utf-8');
            nuovoToken["hostToken"] = nuovoToken["token"];
            delete nuovoToken["token"];
            delete nuovoToken["knownhosts"];
            res.send(nuovoToken);
        }
    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
});

server.get('/knownhosts', async (req, res) => {
    try {
        const token = req.headers["token"];
        if (!token) return res.status(500).send("Errore token");
        const customerToken = Buffer.from(req.headers["customertoken"], 'base64').toString();
        const nuovoToken = await prisma.hosts.findUnique({
            where: { token: token, "customerID": customerToken },
            select: { knownhosts: true },
        });

        if (nuovoToken) {
            const kh = nuovoToken["knownhosts"] ? Buffer.from(nuovoToken["knownhosts"], 'base64').toString() : [];
            res.send(kh);
        } else {
            res.send([]);
        }
    } catch (error) {
        console.error(req.headers, error);
        res.status(500).send(error);
    }
});


server.post('/knownhosts', async (req, res) => {
    try {
        const token = req.headers["token"];
        if (!token) return res.status(500).send("Errore token");
        const customerToken = Buffer.from(req.headers["customertoken"], 'base64').toString();
        const knownhosts = Buffer.from(JSON.stringify(req.body)).toString("base64");

        const nuovoToken = await prisma.hosts.update({
            where: { token: token, "customerID": customerToken },
            data: { knownhosts: knownhosts },
        });
        res.send(nuovoToken[knownhosts]);
    } catch (error) {
        console.error(req.headers, error);
        res.status(500).send(error);
    }
});


server.post('/remote', async (req, res) => {
    try {
        const token = req.headers["token"];
        if (!token) return res.status(500).send("Errore token");
        if (token === "PLEASE") return res.status(401).send("WRONG token");
        const tokenI = Buffer.from(req.headers["customertoken"], 'base64').toString();


        const checkCustomer = await prisma.customers.findUnique({
            where: { "tokenI": tokenI },
            select: { tokenI: true },
        });

        if (!checkCustomer) return res.status(401).send("Invalid customerToken:" + req.headers["customertoken"]);

        const nuovoToken = await prisma.hosts.update({
            where: { token: token },
            data: { crawler: JSON.stringify(req.body) },
        });

        res.send(nuovoToken);
    } catch (error) {
        res.status(500).send(error);
    }
});


server.get('/remote', async (req, res) => {
    try {
        const token = req.headers["token"];

        if (!token) return res.status(500).send("Errore token");
        if (token === "PLEASE") return res.status(401).send("WRONG token");
        const tokenI = Buffer.from(req.headers["customertoken"], 'base64').toString();


        const checkCustomer = await prisma.customers.findUnique({
            where: { "tokenI": tokenI },
            select: { tokenI: true },
        });

        if (!checkCustomer) return res.status(401).send("Invalid customerToken:" + req.headers["customertoken"]);

        const nuovoToken = await prisma.hosts.findUnique({
            where: { token: token, "customerID": tokenI },
            select: { crawler: true },
        });

        if (nuovoToken) {
            const crawler = JSON.parse(nuovoToken.crawler);
            if (crawler) {
                crawler.lastOnline = new Date();

                await prisma.hosts.update({
                    where: { token: token, "customerID": tokenI },
                    data: { crawler: JSON.stringify(crawler) },
                });
            }
            res.send(nuovoToken);
        } else {
            res.status(400).send("nuovoTOken-Error");
        }
    } catch (error) {
        console.error(req.headers, error);
        res.status(500).send(error);
    }
});


server.get('/oids/vendor/:vendor', async (req, res) => {
    let vendor = req.params.vendor;
    try {
        const token = req.headers["token"];
        const serial = req.headers["serial"];
        if (!token) return res.status(500).send("Errore token");
        const tokenI = Buffer.from(req.headers["customertoken"], 'base64').toString();


        const filterDati = serial ? (await prisma.dati.findUnique(
            {
                where: {
                    serial_token: {
                        serial: serial,
                        token: tokenI
                    }
                },
                select: {
                    data: true
                }

            })) : null;


        let data = [];
        if (filterDati && filterDati.data) {
            const dataStr = Buffer.from(filterDati.data, 'base64').toString();
            const dataJSON = JSON.parse(dataStr);
            for (const d in dataJSON) {
                if (dataJSON[d] == "exclude") {
                    data.push(d);
                }
            }
            //  console.log(data);
        }


        if (vendor.endsWith("*")) {
            vendor = vendor.substring(0, vendor.length - 2);
            const where = { vendoroid: { startsWith: vendor } };
            if (serial == null) {
                where.OR = [
                    { short: "sysSerial" },
                    { short: "secSysSerial" }
                ]
            } else if (data) {
                where.oid = { notIn: data };
            }
            const nuovoToken = await prisma.oids.groupBy(
                {
                    by: [
                        "vendoroid"
                    ],
                    where
                });

            if (nuovoToken) {
                res.send(nuovoToken);
            } else
                res.status(401).send("NOT FOUND");
            return;
        }
        if (vendor == "-") {
            const where = {
                vendoroid: null
            };
            if (serial == null) {
                where.OR = [
                    { short: "sysSerial" },
                    { short: "secSysSerial" }
                ]
            } else if (data) {
                where.oid = { notIn: data };
            }
            const nuovoToken = await prisma.oids.findMany(
                {
                    where
                });
            if (nuovoToken)
                res.send(nuovoToken);
            else
                res.status(401).send("NOT FOUND");
            return;
        }
        const where = {
            vendoroid: vendor
        };
        if (serial == null) {
            where.OR = [
                { short: "sysSerial" },
                { short: "secSysSerial" }
            ]
        } else if (data) {
            where.oid = { notIn: data };
        }
        const nuovoToken = await prisma.oids.findMany(
            {
                where
            });

        if (nuovoToken) {
            for (const nt of nuovoToken) {
                const oid = nt.oid;

            }
            res.send(nuovoToken);
        } else
            res.status(401).send("NOT FOUND");
    } catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
});

server.post('/snmpquery', async (req, res) => {
    try {
        const token = req.headers["token"];
        const OID = req.headers["OID"];
        if (!token) return res.status(500).send("Errore token");

        const response = await prisma.hosts.update({
            where: { token: token },
            data: { dati: JSON.stringify(req.body) },
        });
        res.send("OKK" + OID);
    } catch (error) {
        res.status(500).send(error);
    }
});


// Cattura gli errori sincroni non gestiti
process.on('uncaughtException', (err) => {
    console.error('Rilevato errore non gestito (Uncaught Exception):', err);
    // Opzionale: logga l'errore su un file o servizio esterno prima di decidere se riavviare
});

// Cattura le Promise rifiutate e non gestite (es. chiamate API fallite)
process.on('unhandledRejection', (reason, promise) => {
    console.error('Rifiuto di Promise non gestito su:', promise, 'motivo:', reason);
});


https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Server app sicuro attivo su https://localhost:${PORT}`);
});
https.createServer(sslOptions, server).listen(PORT + 1, () => {
    console.log(`Server dati sicuro attivo su https://localhost:${PORT + 1}`);
});
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

// Configurazione App Dashboard
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inclusione dei Moduli Esterni
const appRoutes = require('./routes/app')(prisma, sessions_Data);
const githubRoutes = require('./routes/github')(sessions_Data, prisma, sslOptions);

app.use('/', appRoutes);
app.use('/api/github', githubRoutes);
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// Configurazione Server Dati (Ingestion MFP/Hosts)
server.set('json', path.join(__dirname, 'json'));
server.use(express.json());
server.use(express.static(path.join(__dirname, 'json')));

server.post('/mfp', async (req, res) => {
    try {
        const token = req.headers["token"];
        const serial = req.headers["serial"];

        if (!token) return res.status(500).send("Errore token");
        if (token === "PLEASE") return res.status(401).send("WRONG token");
        const tokenI = Buffer.from(req.headers["customertoken"], 'base64').toString();

        const map = req.body;
        const checkCustomer = await prisma.customers.findUnique({
            where: { "tokenI": tokenI },
            select: { tokenI: true },
        });

        if (!checkCustomer) return res.status(401).send("Invalid customerToken:" + req.headers["customertoken"]);

        const jsonStringConsumabili = JSON.stringify(map.dataconsumabili);
        const jsonStringAlerts = JSON.stringify(map.alerts);

        const update = {
            datainfo: JSON.stringify(map.info),
            "lastUpdates": JSON.stringify(map.lastUpdates),
        };
        const create = {
            serial: serial,
            token: tokenI,
            datainfo: JSON.stringify(map.info),
            "lastUpdates": JSON.stringify(map.lastUpdates),
        };
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

        if (!nuovoToken) return res.status(401).send("Invalid token:" + token);

        if (nuovoToken["dataalerts"]) nuovoToken["dataalerts"] = Buffer.from(nuovoToken["dataalerts"]).toString('utf-8');
        if (nuovoToken["dataconsumabili"]) nuovoToken["dataconsumabili"] = Buffer.from(nuovoToken["dataconsumabili"]).toString('utf-8');
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
        const ldo = JSON.parse(localData);

        if (token === "PLEASE") {
            req.body["hostToken"] = crypto.randomBytes(32).toString('hex');
            const optionsBuffer = Buffer.from(JSON.stringify(req.body), 'utf-8');
            const customerToken = Buffer.from(req.headers["customertoken"], 'base64').toString();

            const data = {
                hostname: ldo[0]["localHostName"],
                token: req.body["hostToken"],
                "customerID": customerToken,
                options: optionsBuffer,
                "IPV4": localData,
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

        const kh = nuovoToken["knownhosts"] ? Buffer.from(nuovoToken["knownhosts"], 'base64').toString() : {};
        res.send(kh);
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
        const knownhosts = Buffer.from(await JSON.stringify(req.body)).toString("base64");
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




server.get('/hello', async (req, res) => {
    try {
        const token = req.headers["token"];
        if (!token) return res.status(500).send("Errore token");
        const customerToken = Buffer.from(req.headers["customertoken"], 'base64').toString();
        const nuovoToken = await prisma.hosts.findUnique({
            where: { token: token, "customerID": customerToken },
            select: { crawler: true },
        });
        res.send(nuovoToken);
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
        const knownhosts = Buffer.from(await JSON.stringify(req.body)).toString("base64");
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


server.post('/hello', async (req, res) => {
    try {
        const token = req.headers["token"];
        if (!token) return res.status(500).send("Errore token");

        const nuovoToken = await prisma.hosts.update({
            where: { token: token },
            data: { crawler: JSON.stringify(req.body) },
        });
        res.send(nuovoToken);
    } catch (error) {
        res.status(500).send(error);
    }
});

server.get('/oids/vendor/:vendor', async (req, res) => {
    let vendor = req.params.vendor;
    try {
        const token = req.headers["token"];
        if (!token) return res.status(500).send("Errore token");

        if (vendor.endsWith("*")) {
            vendor = vendor.substring(0, vendor.length - 1);

            const nuovoToken = await prisma.oids.groupBy(
                {
                    by: [
                        "vendoroid"
                    ],
                    where: { vendoroid: { startsWith: vendor } }
                });

            if (nuovoToken)
                res.send(nuovoToken);
            else
                res.status(401).send("NOT FOUND");
            return;
        }
        const nuovoToken = await prisma.oids.findMany(
            {
                where: {
                    vendoroid: vendor
                }
            });

        if (nuovoToken)
            res.send(nuovoToken);
        else
            res.status(401).send("NOT FOUND");
    } catch (error) {
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
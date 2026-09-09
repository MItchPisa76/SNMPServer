const express = require('express');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');    // <-- Nuovo: per leggere i file dei certificati
const https = require('https'); // <-- Nuovo: per creare il server sicuro
const { hostname } = require('os');

const crypto = require('crypto');

const app = express();
const server = express();
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
//const PrismaBetterSqlite = require('@prisma/adapter-better-sqlite3');

const Database = require('better-sqlite3');

// Apre la connessione al file SQLite
const sqlite = new Database('./prisma/dev.db');

console.log(sqlite);
const adapter = new PrismaBetterSqlite3({
    sqlite,
    url: 'file:./prisma/dev.db'
});

// Passa l'adapter al costruttore di PrismaClient
const prisma = new PrismaClient({ adapter });

module.exports = prisma;



// se ci sono problemi usa npx prisma db pull;npx prisma generate




const PORT = 3080; // Rimaniamo sulla porta scelta prima o usa 3443 se preferisci

// Carica i certificati SSL dal disco
const sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
};

// Configurazione motore di template EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware indispensabile per leggere i dati JSON
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/oid/:oid', async (req, res) => {
    const oid = req.params.oid;
    console.log(oid);
    try {

        const resp = await prisma.oids.findMany({
            where: {
                oid: oid
            }
        });
        console.log("   risposta:", resp);

        res.send(resp[0]);

    } catch (error) {
        console.log('Errore:', error);

        res.status(500).send(error);
    }
});

// 1. ROTTA PAGINA INIZIALE
app.get('/', async (req, res) => {
    try {
        // Fetch all hosts
        const hostsList = await prisma.hosts.findMany({
            include: {
                dati: true,
            },
        });

        // Fetch all customers with their hosts and dati
        const customers = await prisma.customers.findMany({
            include: {
                dati: true,
                hosts: true,
            },
        });

        // Parse JSON fields for hosts
        for (const r of hostsList) {
            if (r["IPV4"])
                r["IPV4"] = JSON.parse(r["IPV4"]);
            if (r["crawler"])
                r["crawler"] = JSON.parse(r["crawler"]);
            for (const ld of r.dati) {
                if (ld["dataalerts"])
                    ld["dataalerts"] = JSON.parse(Buffer.from(ld["dataalerts"]).toString('utf-8'));
                if (ld["datainfo"])
                    ld["datainfo"] = JSON.parse(Buffer.from(ld["datainfo"]).toString('utf-8'));
                if (ld["dataconsumabili"])
                    ld["dataconsumabili"] = JSON.parse(Buffer.from(ld["dataconsumabili"]).toString('utf-8'));
            }
        }

        // Parse JSON fields for customers and their hosts
        for (const customer of customers) {
            // Parse customer's dati
            for (const ld of customer.dati) {
                if (ld["dataalerts"])
                    ld["dataalerts"] = JSON.parse(Buffer.from(ld["dataalerts"]).toString('utf-8'));
                if (ld["datainfo"])
                    ld["datainfo"] = JSON.parse(Buffer.from(ld["datainfo"]).toString('utf-8'));
                if (ld["dataconsumabili"])
                    ld["dataconsumabili"] = JSON.parse(Buffer.from(ld["dataconsumabili"]).toString('utf-8'));
            }
            // Parse customer's hosts
            for (const host of customer.hosts) {
                if (host["IPV4"])
                    host["IPV4"] = JSON.parse(host["IPV4"]);
                if (host["crawler"])
                    host["crawler"] = JSON.parse(host["crawler"]);
            }
        }

        console.log('data:', JSON.stringify(customers));
        res.render('index', { hosts: hostsList, customers: customers });
    } catch (error) {

        console.log('Errore:', error);
        res.status(500).send("Errore nel caricamento della pagina:" + error);
    }
});

// 2. ROTTA API JSON
app.post('/api/users', async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) {
        return res.status(400).json({ success: false, error: "Nome e email sono obbligatori" });
    }
    try {
        const newUser = await prisma.user.create({ data: { name, email } });
        res.status(201).json({ success: true, user: newUser });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ success: false, error: "Questa email è già registrata" });
        }
        res.status(500).json({ success: false, error: "Errore interno del server" });
    }
});

app.post('/api/crawler/actions', async (req, res) => {
    const { token, action, value } = req.body;

    try {
        const actions = await prisma.hosts.findUnique({
            where: {
                token: token,
                "customerID": req.headers["customertoken"]
            }, select: {
                crawler: true
            },
        });
        const crawler = JSON.parse(actions["crawler"]);
        crawler[action] = value;
        if (action == "queryoids") {
            crawler["queryoidsAction"] = "once";
            crawler["queryoidsIPv4"] = req.body["ipv4"];
            crawler["queryoidsSerial"] = req.body["serial"];
        }
        const newvalue = await prisma.hosts.update({
            where: {
                token: token,
                "customerID": req.headers["customertoken"],
            }, data: {
                crawler: JSON.stringify(crawler)
            },
        });
        res.status(201).json({ success: true, value: newvalue });
    } catch (error) {
        res.status(500).json({ success: false, error: "Errore interno del server", msg: error });
    }
});

server.set('json', path.join(__dirname, 'json'));
server.use(express.json());
server.use(express.static(path.join(__dirname, 'json')));




server.post('/mfp', async (req, res) => {
    console.log("MFP");
    try {
        const token = req.headers["token"];
        const serial = req.headers["serial"];

        if (token == null) {
            res.status(500).send("Errore token");
            return;
        }

        if (token == "PLEASE") {
            res.status(401).send("WRONG token");
            return;
        }
        const map = req.body;
        const checkCustomer = await prisma.customers.findUnique({
            where: {
                "tokenI": req.headers["customertoken"],
            },
            select: {
                tokenI: true,
            },
        });

        if (!checkCustomer) {
            console.error('Invalid customerToken:' + req.headers["customertoken"]);
            res.status(401).send("Invalid customerToken:" + req.headers["customertoken"]);
            return;
        }

        
        //    const ipv4 = map["ipv4"];
        const jsonStringConsumabili = JSON.stringify(map.maintenace);
        const jsonStringAlerts = JSON.stringify(map.alerts);

        // Conversione in Base64
        const dataconsumabili = Buffer.from(jsonStringConsumabili, 'utf-8').toString('base64');
        const dataalerts = Buffer.from(jsonStringAlerts, 'utf-8').toString('base64');

        const customer = req.headers["customertoken"];
        const nuovoToken = await prisma.dati.upsert({
            where: {
                serial: serial,

            },
            update: {
                datainfo: JSON.stringify(map.info),
                dataconsumabili: dataconsumabili,
                dataalerts: dataalerts,
                token: customer,
                datainfo: JSON.stringify(map.info),
                "lastUpdates": JSON.stringify(map.lastUpdates),
                //   ipv4: ipv4
            },
            create: {
                serial: serial,
                token: customer,
                datainfo: JSON.stringify(map.info),
                dataconsumabili: dataconsumabili,
                dataalerts: dataalerts,
                "lastUpdates": JSON.stringify(map.lastUpdates),
            },
        });

        if (nuovoToken == null) {
            console.log('Invalid token:' + token);
            res.status(401).send("Invalid token:" + token);
            return;
        }
        console.log('Aggiornato con successo:[' + token + "]");
        nuovoToken["dataalerts"] = Buffer.from(nuovoToken["dataalerts"]).toString('utf-8');
        nuovoToken["dataconsumabili"] = Buffer.from(nuovoToken["dataconsumabili"]).toString('utf-8');
        //res.headers["token"] = nuovoToken["token"]
        res.send(nuovoToken);


    } catch (error) {
        console.log('Errore:', error);

        res.status(500).send(error);
    }
});




server.post('/options', async (req, res) => {
    console.log(req);
    try {
        const token = req.headers["token"];
        if (token == null) {
            res.status(500).send("Errore token");
            return;
        }
        const localData = req.body["localData"];
        delete req.body["localData"];

        const ldo = JSON.parse(localData);



        if (token == "PLEASE") {

            //const payloadBase64 = Buffer.from(req.headers["hostname"]).toString('base64url');




            req.body["hostToken"] = crypto.randomBytes(32).toString('hex');
            const optionsBuffer = Buffer.from(JSON.stringify(req.body), 'utf-8');

            const nuovoToken = await prisma.hosts.create({
                data: {
                    hostname: ldo[0]["localHostName"],
                    token: req.body["hostToken"],
                    "customerID": req.headers["customertoken"],
                    options: optionsBuffer,
                    "IPV4": localData
                },
            });


            const customerData = await prisma.customers.upsert({
                where: {
                    "tokenI": req.headers["customertoken"],
                },
                update: {

                },
                create: {
                    "tokenI": req.headers["customertoken"],
                    "name": "APPENA_CREATO"
                },
            });

            if (customerData["name"] == "APPENA_CREATO") {
                const customerData = await prisma.customers.update({
                    where: {
                        "tokenI": req.headers["customertoken"],
                    },
                    data: {
                        "name": "APPENA_CREATO_1"
                    },

                });
            }
            nuovoToken["options"] = Buffer.from(nuovoToken["options"]).toString('utf-8');
            nuovoToken["hostToken"] = nuovoToken["token"];
            delete nuovoToken["token"];
            console.log('Riga inserita con successo:' + nuovoToken["hostToken"] + "\n", nuovoToken);
            //res.headers["token"] = nuovoToken["token"]
            res.send(nuovoToken);
        } else {


            const optionsBuffer = Buffer.from(JSON.stringify(req.body), 'utf-8');
            const nuovoToken = await prisma.hosts.update({
                where: {
                    token: token,
                    "customerID": req.headers["customertoken"]
                },
                data: {
                    hostname: ldo[0]["localHostName"],
                    options: optionsBuffer
                },
            });
            if (nuovoToken == null) {
                console.log('Invalid token:' + token);
                res.status(401).send("Invalid token:" + token);
                return;
            }
            nuovoToken["options"] = Buffer.from(nuovoToken["options"]).toString('utf-8');
            nuovoToken["hostToken"] = nuovoToken["token"];
            delete nuovoToken["token"];
            console.log('Aggiornato con successo:[' + token + "]", nuovoToken);
            //res.headers["token"] = nuovoToken["token"]
            res.send(nuovoToken);
        }

    } catch (error) {
        console.log('Errore:', error);

        res.status(500).send(error);
    }
});

server.get('/options', async (req, res) => {
    console.log(req);
    try {
        const token = req.headers["token"];
        if (token == null) {
            res.status(401).send("Errore token");
            return;
        }

        const nuovoToken = await prisma.hosts.findUnique({
            where: {
                token: token,
                "customerID": req.headers["customertoken"]
            }, select: {
                options: true,
                crawler: true
                // Tutti gli altri campi del modello verranno esclusi dalla risposta
            },
        });
        if (nuovoToken == null) {
            console.log('Invalid token:' + token);
            res.status(401).send("Invalid token:" + token);
            return;
        }
        nuovoToken["options"] = Buffer.from(nuovoToken["options"]).toString('utf-8');

        console.log('   repurato con successo:[' + token + "]", nuovoToken);
        //res.headers["token"] = nuovoToken["token"]
        res.send(nuovoToken);


    } catch (error) {
        console.log('Errore:', error);

        res.status(500).send(error);
    }
});

server.get('/hello', async (req, res) => {
    console.log(req);
    try {
        const token = req.headers["token"];
        if (token == null) {
            res.status(500).send("Errore token");
            return;
        }

        const nuovoToken = await prisma.hosts.findUnique({
            where: {
                token: token,
                "customerID": req.headers["customertoken"]
            }, select: {
                crawler: true
            },
        });
        res.send(nuovoToken);
    } catch (error) {
        console.log('Errore:', error);

        res.status(500).send(error);
    }
});

server.post('/hello', async (req, res) => {
    console.log(req);
    try {
        const token = req.headers["token"];
        if (token == null) {
            res.status(500).send("Errore token");
            return;
        }

        const nuovoToken = await prisma.hosts.update({
            where: {
                token: token
            }, data: {
                crawler: JSON.stringify(req.body)
            },
        });
        res.send(nuovoToken);
    } catch (error) {
        console.log('Errore:', error);

        res.status(500).send(error);
    }
});

server.get('/oids/vendor/:vendor', async (req, res) => {

    const vendor = req.params.vendor;
    console.log(vendor);
    try {
        const token = req.headers["token"];
        if (token == null) {
            res.status(500).send("Errore token");
            return;
        }

        const nuovoToken = await prisma.oids.findMany({
            where: {
                vendoroid: vendor
            }
        });
        console.log('   repurato con successo:[' + token + "]", nuovoToken);
        //res.headers["token"] = nuovoToken["token"]
        res.send(nuovoToken);


    } catch (error) {
        console.log('Errore:', error);

        res.status(500).send(error);
    }
});

server.post('/snmpquery', async (req, res) => {
    console.log(req);
    try {
        const token = req.headers["token"];
        const OID = req.headers["OID"];
        if (token == null) {
            res.status(500).send("Errore token");
            return;
        }

        const res = await prisma.hosts.update({
            where: {
                token: token
            }, data: {
                dati: JSON.stringify(req.body)
            },
        });
        console.log('Good' + OID, res);
        res.send("OKK" + OID);
    } catch (error) {
        console.log('Errore:', error);

        res.status(500).send(error);
    }
});


// MODIFICA: Creiamo il server HTTPS passando i certificati e l'app Express
https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Server app sicuro attivo su https://localhost:${PORT}`);
});
https.createServer(sslOptions, server).listen(PORT + 1, () => {
    console.log(`Server dati sicuro attivo su https://localhost:${PORT + 1}`);
});


//openssl pkcs12 -export -in cert.pem -inkey key.pem -out keystore.p12 -name "mykey"
//openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes -subj '/CN=localhost'
//keytool -importcert -alias resolve-server -file server.crt -keystore "$JAVA_HOME/lib/security/cacerts" -storepass changeit -noprompt

//openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes -subj '/CN=localhost'
//keytool -importcert -alias nodejs-server -file cert.pem -keystore "$JAVA_HOME/lib/security/cacerts" -storepass changeit -noprompt

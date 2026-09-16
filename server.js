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
const githubRoutes = require('./routes/github')(sessions_Data,prisma, sslOptions);

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

        const map = req.body;
        const checkCustomer = await prisma.customers.findUnique({
            where: { "tokenI": req.headers["customertoken"] },
            select: { tokenI: true },
        });

        if (!checkCustomer) return res.status(401).send("Invalid customerToken:" + req.headers["customertoken"]);

        const jsonStringConsumabili = JSON.stringify(map.maintenace);
        const jsonStringAlerts = JSON.stringify(map.alerts);

        const dataconsumabili = Buffer.from(jsonStringConsumabili, 'utf-8').toString('base64');
        const dataalerts = Buffer.from(jsonStringAlerts, 'utf-8').toString('base64');
        const customer = req.headers["customertoken"];

        const nuovoToken = await prisma.dati.upsert({
            where: { serial: serial },
            update: {
                datainfo: JSON.stringify(map.info),
                dataconsumabili: dataconsumabili,
                dataalerts: dataalerts,
                token: customer,
                "lastUpdates": JSON.stringify(map.lastUpdates),
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

        if (!nuovoToken) return res.status(401).send("Invalid token:" + token);

        nuovoToken["dataalerts"] = Buffer.from(nuovoToken["dataalerts"]).toString('utf-8');
        nuovoToken["dataconsumabili"] = Buffer.from(nuovoToken["dataconsumabili"]).toString('utf-8');
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

            const nuovoToken = await prisma.hosts.create({
                data: {
                    hostname: ldo[0]["localHostName"],
                    token: req.body["hostToken"],
                    "customerID": req.headers["customertoken"],
                    options: optionsBuffer,
                    "IPV4": localData
                },
            });

            await prisma.customers.upsert({
                where: { "tokenI": req.headers["customertoken"] },
                update: {},
                create: { "tokenI": req.headers["customertoken"], "name": "APPENA_CREATO" },
            });

            nuovoToken["options"] = Buffer.from(nuovoToken["options"]).toString('utf-8');
            nuovoToken["hostToken"] = nuovoToken["token"];
            delete nuovoToken["token"];
            res.send(nuovoToken);
        } else {
            const optionsBuffer = Buffer.from(JSON.stringify(req.body), 'utf-8');
            const nuovoToken = await prisma.hosts.update({
                where: { token: token, "customerID": req.headers["customertoken"] },
                data: { hostname: ldo[0]["localHostName"], options: optionsBuffer },
            });
            if (!nuovoToken) return res.status(401).send("Invalid token:" + token);

            nuovoToken["options"] = Buffer.from(nuovoToken["options"]).toString('utf-8');
            nuovoToken["hostToken"] = nuovoToken["token"];
            delete nuovoToken["token"];
            res.send(nuovoToken);
        }
    } catch (error) {
        res.status(500).send(error);
    }
});

server.get('/options', async (req, res) => {
    try {
        const token = req.headers["token"];
        if (!token) return res.status(401).send("Errore token");

        const nuovoToken = await prisma.hosts.findUnique({
            where: { token: token, "customerID": req.headers["customertoken"] },
            select: { options: true, crawler: true },
        });

        if (!nuovoToken) return res.status(401).send("Invalid token:" + token);

        nuovoToken["options"] = Buffer.from(nuovoToken["options"]).toString('utf-8');
        res.send(nuovoToken);
    } catch (error) {
        res.status(500).send(error);
    }
});

server.get('/hello', async (req, res) => {
    try {
        const token = req.headers["token"];
        if (!token) return res.status(500).send("Errore token");

        const nuovoToken = await prisma.hosts.findUnique({
            where: { token: token, "customerID": req.headers["customertoken"] },
            select: { crawler: true },
        });
        res.send(nuovoToken);
    } catch (error) {
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
    const vendor = req.params.vendor;
    try {
        const token = req.headers["token"];
        if (!token) return res.status(500).send("Errore token");

        const nuovoToken = await prisma.oids.findMany({ where: { vendoroid: vendor } });
        res.send(nuovoToken);
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
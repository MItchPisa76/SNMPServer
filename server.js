const express = require('express');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');    // <-- Nuovo: per leggere i file dei certificati
const https = require('https'); // <-- Nuovo: per creare il server sicuro
const { hostname } = require('os');

const crypto = require('crypto');

const app = express();
const server = express();
const prisma = new PrismaClient();

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



// 1. ROTTA PAGINA INIZIALE
app.get('/', async (req, res) => {
    try {
        const mfpList = await prisma.hosts.findMany({
            include: {
                listaDati: true, // Esegue la JOIN sulla colonna token
            },
        });

        for (const r of mfpList) {
            if (r["IPV4"])
                r["IPV4"] = JSON.parse(r["IPV4"]);
            if (r["crawler"])
                r["crawler"] = JSON.parse(r["crawler"]);
            for (const ld of r.listaDati) {
                if (ld["dataalerts"])
                    ld["dataalerts"] = JSON.parse(ld["dataalerts"]);
                if (ld["datainfo"])
                    ld["datainfo"] = JSON.parse(ld["datainfo"]);
                if (ld["dataconsumabili"])
                    ld["dataconsumabili"] = JSON.parse(ld["dataconsumabili"]);
            }
        }
        console.log('data:', JSON.stringify(mfpList));
        res.render('index', { hosts: mfpList });
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
                token: token
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
                token: token
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
        const map = req.body;
        const ipv4 = map["ipv4"];
        const jsonString = JSON.stringify(map.maintenace);

        // Conversione in Base64
        const dataconsumabili = Buffer.from(jsonString, 'utf-8').toString('base64');
        const nuovoToken = await prisma.dati.upsert({
            where: {
                serial: serial
            },
            update: {
                token: token,
                datainfo: JSON.stringify(map.info),
                dataconsumabili: dataconsumabili,
                dataalerts: JSON.stringify(map.alerts),
                ipv4: ipv4
            },
            create: {
                serial: serial,
                token: token,
                datainfo: JSON.stringify(map.info),
                dataconsumabili: dataconsumabili,
                dataalerts: JSON.stringify(map.alerts),
                ipv4: ipv4
            },
        });

        console.log('Aggiornato con successo:[' + token + "]");
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
        if (token == "PLEASE") {

            //const payloadBase64 = Buffer.from(req.headers["hostname"]).toString('base64url');
            const localData = req.body["localData"];
            req.body["token"] = crypto.randomBytes(32).toString('hex');
            delete req.body["localData"];
            const nuovoToken = await prisma.hosts.create({
                data: {
                    token: req.body["token"],
                    options: JSON.stringify(req.body),
                    "IPV4": localData
                },
            });

            console.log('Riga inserita con successo:', nuovoToken);
            //res.headers["token"] = nuovoToken["token"]
            res.send(nuovoToken);
        } else {
            const localData = req.body["localData"];
            delete req.body["localData"];
            const nuovoToken = await prisma.hosts.update({
                where: {
                    token: token
                },
                data: {
                    options: JSON.stringify(req.body)
                },
            });
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
            res.status(500).send("Errore token");
            return;
        }

        const nuovoToken = await prisma.hosts.findUnique({
            where: {
                token: token
            }, select: {
                options: true,
                crawler: true
                // Tutti gli altri campi del modello verranno esclusi dalla risposta
            },
        });
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
                token: token
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

// MODIFICA: Creiamo il server HTTPS passando i certificati e l'app Express
https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Server app sicuro attivo su https://localhost:${PORT}`);
});
https.createServer(sslOptions, server).listen(PORT + 1, () => {
    console.log(`Server dati sicuro attivo su https://localhost:${PORT + 1}`);
});

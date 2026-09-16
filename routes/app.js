const express = require('express');
const router = express.Router();
const crypto = require('crypto');

module.exports = function (prisma, sessions_Data) {
    // 1. ROTTA PAGINA INIZIALE
    router.get('/', async (req, res) => {
        try {
            const hostsList = await prisma.hosts.findMany({});
            const customers = await prisma.customers.findMany({
                include: { dati: true, hosts: true },
            });

            for (const r of hostsList) {
                if (r["IPV4"]) r["IPV4"] = JSON.parse(r["IPV4"]);
                if (r["crawler"]) r["crawler"] = JSON.parse(r["crawler"]);
            }

            for (const customer of customers) {
                for (const ld of customer.dati) {
                    if (ld["dataalerts"]) ld["dataalerts"] = JSON.parse(Buffer.from(ld["dataalerts"]).toString('utf-8'));
                    if (ld["datainfo"]) ld["datainfo"] = JSON.parse(Buffer.from(ld["datainfo"]).toString('utf-8'));
                    if (ld["dataconsumabili"]) ld["dataconsumabili"] = JSON.parse(Buffer.from(ld["dataconsumabili"]).toString('utf-8'));
                }
                for (const host of customer.hosts) {
                    if (host["IPV4"]) host["IPV4"] = JSON.parse(host["IPV4"]);
                    if (host["crawler"]) host["crawler"] = JSON.parse(host["crawler"]);
                }
            }

            let userCookie = req.cookies['X-Custom-Context'];
            if (userCookie && !sessions_Data[userCookie]) {
                userCookie = null;
            }
            if (!userCookie) {
                userCookie = crypto.randomBytes(32).toString('hex');
            }
            const userData = { userCookie: userCookie };
            if (sessions_Data[userCookie]) {
                userData["session"] = sessions_Data[userCookie];
            } else {
                sessions_Data[userCookie] = userData;
                res.cookie('X-Custom-Context', userCookie);
            }
            delete userData.customers;
            res.render('index', { hosts: hostsList, customers: customers, userData: userData });
        } catch (error) {
            res.status(500).send("Errore nel caricamento della pagina:" + error);
        }
    });

    // 2 REFRESH VARI
    router.post('/refresh', async (req, res) => {
        try {
            let userCookie = req.cookies['X-Custom-Context'];
            if (!userCookie || !sessions_Data[userCookie]) {
                console.log('Errore:Ivalid cookie:' + userCookie);
                res.status(404).send("Invalid coookie:" + userCookie);
                return;
            }
            if (!sessions_Data[userCookie].lastUpdates)
                sessions_Data[userCookie].lastUpdates = [];
            const lastUpdates = sessions_Data[userCookie].lastUpdates;

            const dati = await prisma.dati.findMany({});
            const toRefresh = [];
            for (const d of dati) {
                const serial = d.serial;
                if (lastUpdates[serial]) {
                    const json = JSON.parse(d.lastUpdates);
                    if (json.lastUpdatedAlerts == lastUpdates[serial].lastUpdatedAlerts) {
                        delete json["lastUpdatedAlerts"];
                    }
                    if (json.lastUpdatedMantained == lastUpdates[serial].lastUpdatedMantained) {
                        delete json.lastUpdatedMantained;
                    }
                    json["serial"] = serial;
                    toRefresh.push(json);
                }
                lastUpdates[serial] = JSON.parse(d.lastUpdates);
            }

            const updateHCW = await prisma.hosts.findMany({
                select: { token: true, crawler: true },
            });

            for (const h of updateHCW) {
                const crawler = JSON.parse(h.crawler);

                if ("" + crawler["updateRemote"] == "true") {
                    crawler["updateRemote"] = false;
                    toRefresh.push(h);
                    await prisma.hosts.update({
                        where: { token: h.token },
                        data: { crawler: JSON.stringify(crawler) },
                    });
                }
            }

            res.send(toRefresh);
        } catch (error) {
            console.log('Errore:', error);
            res.status(500).send("Errore nel caricamento della pagina:" + error);
        }
    });
    // 3 QUERY OID
    router.get('/oid/:oid', async (req, res) => {
        const oid = req.params.oid;
        try {
            const resp = await prisma.oids.findMany({ where: { oid: oid } });
            res.send(resp[0]);
        } catch (error) {
            res.status(500).send(error);
        }
    });



    // GET maintenace data of  :serial
    router.get('/api/mfp/:serial/maintenance', async (req, res) => {
        try {
            let userCookie = req.cookies['X-Custom-Context'];
            if (!userCookie || !sessions_Data[userCookie]) {
                console.log('Errore:Ivalid cookie:' + userCookie);
                res.status(404).send("Invalid coookie:" + userCookie);
                return;
            }

            const serial = req.params.serial;
            const maintainance = await prisma.dati.findUnique({
                where: { serial: serial },
                select: { serial: true, dataconsumabili: true }
            });
            if (!maintainance) return res.status(404).send('maintenance non trovato:' + serial);

            maintainance["dataconsumabili"] = JSON.parse(Buffer.from(maintainance["dataconsumabili"]).toString('utf-8'));
            res.render('partials/mfp-tab-status-maintenance.ejs', { mfp: maintainance });
        } catch (error) {
            res.status(500).send('Errore aggiornamento controlli');
        }
    });
    // GET alerts data of  :serial
    router.get('/api/mfp/:serial/alerts', async (req, res) => {
        try {
            let userCookie = req.cookies['X-Custom-Context'];
            if (!userCookie || !sessions_Data[userCookie]) {
                console.log('Errore:Ivalid cookie:' + userCookie);
                res.status(404).send("Invalid coookie:" + userCookie);
                return;
            }
            const serial = req.params.serial;
            const alerts = await prisma.dati.findUnique({
                where: { serial: serial },
                select: { serial: true, dataalerts: true }
            });
            if (!alerts) return res.status(404).send('alerts non trovato:' + serial);

            alerts["dataalerts"] = JSON.parse(Buffer.from(alerts["dataalerts"]).toString('utf-8'));
            res.render('partials/mfp-tab-status-alerts.ejs', { mfp: alerts });
        } catch (error) {
            res.status(500).send('Errore aggiornamento controlli');
        }
    });
    // GET host controls from :token
    router.get('/api/hosts/:token/controls', async (req, res) => {
        try {
            let userCookie = req.cookies['X-Custom-Context'];
            if (!userCookie || !sessions_Data[userCookie]) {
                console.log('Errore:Ivalid cookie:' + userCookie);
                res.status(404).send("Invalid coookie:" + userCookie);
                return;
            }
            const token = req.params.token;
            const host = await prisma.hosts.findUnique({
                where: { token: token },
                select: { crawler: true, token: true },
            });
            if (!host) return res.status(404).send('Host non trovato:' + token);

            res.render('partials/crawler-controls', { host: host });
        } catch (error) {
            res.status(500).send('Errore aggiornamento controlli');
        }
    });



    router.post('/api/users', async (req, res) => {
        const { name, email } = req.body;
        if (!name || !email) return res.status(400).json({ success: false, error: "Nome e email sono obbligatori" });
        try {
            const newUser = await prisma.user.create({ data: { name, email } });
            res.status(201).json({ success: true, user: newUser });
        } catch (error) {
            if (error.code === 'P2002') return res.status(400).json({ success: false, error: "Questa email è già registrata" });
            res.status(500).json({ success: false, error: "Errore interno del server" });
        }
    });

    router.post('/api/crawler/actions', async (req, res) => {
        const { token, action, value } = req.body;
        try {
            let userCookie = req.cookies['X-Custom-Context'];
            if (!userCookie || !sessions_Data[userCookie]) {
                console.log('Errore:Ivalid cookie:' + userCookie);
                res.status(404).send("Invalid coookie:" + userCookie);
                return;
            }
            const actions = await prisma.hosts.findUnique({
                where: { token: token, "customerID": req.headers["customertoken"] },
                select: { crawler: true },
            });
            const crawler = JSON.parse(actions["crawler"]);
            crawler[action] = value;
            if (action == "queryoids") {
                crawler["queryoidsAction"] = "once";
                crawler["queryoidsIPv4"] = req.body["ipv4"];
                crawler["queryoidsSerial"] = req.body["serial"];
            }
            const newvalue = await prisma.hosts.update({
                where: { token: token, "customerID": req.headers["customertoken"] },
                data: { crawler: JSON.stringify(crawler) },
            });
            res.status(201).json({ success: true, value: newvalue });
        } catch (error) {
            res.status(500).json({ success: false, error: "Errore interno del server", msg: error });
        }
    });

    return router;
};
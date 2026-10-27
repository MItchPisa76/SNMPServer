const express = require('express');
const router = express.Router();
const crypto = require('crypto');

module.exports = function (prisma, sessions_Data, snmpQueries) {
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
                userCookie = {
                    createdAt: new Date().toISOString(),
                    userCookie: crypto.randomBytes(16).toString('hex')
                };
                userCookie = JSON.stringify(userCookie);
                console.log('Cookie creato con successo!', userCookie);

            }
            //const userCookieStr = JSON.stringify(userCookie);
            const userData = { userCookie: userCookie };
            if (sessions_Data[userCookie]) {
                userData["session"] = sessions_Data[userCookie];
            } else {
                sessions_Data[userCookie] = userData;
                sessions_Data[userCookie].lastUpdates = [];
                sessions_Data[userCookie].customers = {};
                // Impostazione del cookie chiamato "userSession"
                res.cookie('X-Custom-Context', userCookie, {
                    maxAge: 7 * 24 * 60 * 60 * 1000, // Durata: 7 giorni (in millisecondi)
                    httpOnly: true,                   // Protegge il cookie da accessi JavaScript via client (XSS)
                    secure: false,                    // Imposta su 'true' in produzione se usi HTTPS
                    sameSite: 'lax'                   // Protezione base contro attacchi CSRF
                });
                //  res.cookie('X-Custom-Context', userCookie);
            }
            delete userData.customers;
            res.render('index', { hosts: hostsList, customers: customers, userData: userData });
        } catch (error) {
            console.error(error);
            res.status(500).send("Errore nel caricamento della pagina:" + error);
        }
    });

    // 2 REFRESH VARI
    router.get('/refresh', async (req, res) => {
        try {
            let userCookie = req.cookies['X-Custom-Context'];
            if (!userCookie || !sessions_Data[userCookie]) {
                console.error('Errore:Ivalid cookie:' + userCookie);
                res.status(404).send("Invalid coookie:" + userCookie);
                return;
            }

            const lastUpdates = sessions_Data[userCookie].lastUpdates;

            const dati = await prisma.dati.findMany({
                select: {
                    lastUpdates: true,
                    serial: true,
                    token: true
                }
            });
            const toRefresh = [];
            for (const d of dati) {
                const serial = d.serial;
                const json = JSON.parse(d.lastUpdates);

                if (lastUpdates[serial]) {
                    for (const lu in lastUpdates[serial]) {
                        if (lu.startsWith("last"))
                            if ((json[lu]) && (json[lu] == lastUpdates[serial][lu])) {
                                delete json[lu];
                            }
                    }
                }

                lastUpdates[serial] = JSON.parse(d.lastUpdates);
                json["serial"] = serial;
                json["token"] = d.token;
                toRefresh.push(json);
            }

            const updateHCW = await prisma.hosts.findMany({
                select: { token: true, crawler: true },
            });

            for (const h of updateHCW) {
                const crawler = JSON.parse(h.crawler);
                if (!crawler)
                    continue;
                if (!sessions_Data[userCookie].crawlerUpdate) {
                    sessions_Data[userCookie].crawlerUpdate = {};
                }
                const lastUpdateRemote = sessions_Data[userCookie].crawlerUpdate[h.token];
                if (lastUpdateRemote != crawler.lastUpdateRemote) {
                    sessions_Data[userCookie].crawlerUpdate[h.token] = crawler.lastUpdateRemote;
                    //   crawler["updateRemote"] = false;
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
    // 3 QUERY OID
    router.get('/oids/:serial/suggestions', async (req, res) => {
        const serial = req.params.serial;
        const filter = req.query;
        const customerToken = req.headers.customertoken;
        try {
            const where = {};
            if (filter.brandShort)
                where.brandShort = {
                    contains: filter.brandShort,
                };
            if (filter.oid)
                where.oid = {
                    contains: filter.oid,
                };
            if (filter.descrizione)
                where.descrizione = {
                    contains: filter.descrizione,
                };
            if (filter.vendor)
                where.vendoroid = {
                    contains: filter.vendor,
                };
            const dati = await prisma.dati.findUnique({
                where: {
                    serial_token: {
                        serial: serial,
                        token: customerToken
                    }
                }
            });
            dati["data"] = Buffer.from(dati["data"]).toString('utf-8');
            const resp = await prisma.oids.findMany({ where });
            const jsonData = JSON.parse(dati["data"]);
            const jsonDataInfo = JSON.parse(dati["datainfo"]);

            const first = req.headers["from"];
            const countR = req.headers["count"];


            const pageResp = resp.slice(first, first + countR);

            for (const oids of pageResp) {

                if (jsonData[oids.oid] != null) {
                    //  oids.present = jsonDataInfo[oids.oid];
                    oids.present = jsonData[oids.oid] != "exclude";
                    oids.exclude = jsonData[oids.oid] == "exclude";
                    oids.forced = jsonData[oids.oid] == "forced";
                    oids.origin = jsonData[oids.oid];
                } else {
                    oids.present = false;
                }
            }
            console.log(pageResp);
            res.render('partials/mfp-queryoids-table.ejs', { oidsList: pageResp });
        } catch (error) {
            console.error(error);
            res.status(500).send(error);
        }
    });
    router.post('/oids/:serial/walk/:baseoid', async (req, res) => {
        try {
            const serial = req.params.serial;
            const baseoid = req.params.baseoid;
            //const filter = req.query;
            const customerToken = req.headers.customertoken;
            let userCookie = req.cookies['X-Custom-Context'];

            const dati = await prisma.dati.findUnique({
                where: {
                    serial_token: {
                        serial: serial,
                        token: customerToken
                    }
                },
                select: {
                    data: true
                }
            });
            dati["data"] = Buffer.from(dati["data"]).toString('utf-8');
            dati["data"] = JSON.parse(dati["data"]);
            dati["data"][baseoid] = "walk:" + userCookie;
            dati["data"] = JSON.stringify(dati["data"]);
            dati["data"] = Buffer.from(dati["data"]).toString("base64");
            const cdati = await prisma.dati.update({
                where: {
                    serial_token: {
                        serial: serial,
                        token: customerToken
                    }
                },
                data: {
                    data: dati.data
                }
            });
            console.log(cdati);
        } catch (error) {
            console.log(error);
        }
        res.send({});
    });

    router.post('/oids/:serial/update', async (req, res) => {
        const serial = req.params.serial;
        //const filter = req.query;
        const customerToken = req.headers.customertoken;
        try {
            const body = await req.body;

            const dati = await prisma.dati.findUnique({
                where: {
                    serial_token: {
                        serial: serial,
                        token: customerToken
                    }
                },
                select: {
                    data: true
                }
            });

            dati["data"] = Buffer.from(dati["data"]).toString('utf-8');
            dati["data"] = JSON.parse(dati["data"]);
            dati["data"][body.oid] = body.id;

            dati["data"] = JSON.stringify(dati["data"]);
            dati["data"] = Buffer.from(dati["data"]).toString("base64");
            const cdati = await prisma.dati.update({
                where: {
                    serial_token: {
                        serial: serial,
                        token: customerToken
                    }
                },
                data: {
                    data: dati.data
                }
            });
            //   console.log(cdati);
            res.send(cdati);
        } catch (error) {
            console.error(error);
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

            const tokenI = req.headers["customertoken"];// Buffer.from(req.headers["customertoken"], 'base64').toString();
            const serial = req.params.serial;
            const maintainance = await prisma.dati.findUnique({
                where: {
                    serial_token: {
                        serial: serial,
                        token: tokenI
                    }
                },
                select: { serial: true, dataconsumabili: true }
            });
            if (!maintainance) return res.status(404).send('maintenance non trovato:' + serial);

            maintainance["dataconsumabili"] = JSON.parse(Buffer.from(maintainance["dataconsumabili"]).toString('utf-8'));
            res.render('partials/mfp-tab-status-maintenance.ejs', { mfp: maintainance });
        } catch (error) {
            console.error(error);
            res.status(500).send('Errore aggiornamento controlli');
        }
    });


    // GET oids data of  :serial
    router.get('/api/mfp/:serial/oids/list', async (req, res) => {  //DEPRECRATEF
        try {
            let userCookie = req.cookies['X-Custom-Context'];
            if (!userCookie || !sessions_Data[userCookie]) {
                console.log('Errore:Ivalid cookie:' + userCookie);
                res.status(404).send("Invalid coookie:" + userCookie);
                return;
            }

            const tokenI = req.headers["customertoken"];// Buffer.from(req.headers["customertoken"], 'base64').toString();
            const serial = req.params.serial;
            const dataInfo = await prisma.dati.findUnique({
                where: {
                    serial_token: {
                        serial: serial,
                        token: tokenI
                    }
                },
                select: { serial: true, datainfo: true }
            });

            if (!dataInfo) return res.status(404).send('dataInfo non trovato:' + serial);

            dataInfo["datainfo"] = JSON.parse(Buffer.from(dataInfo["datainfo"]).toString('utf-8'));
            const jdati = dataInfo["datainfo"];
            const oids = Object.keys(jdati);
            const completa = await prisma.oids.findMany({
                where: { oid: { in: oids } },
            });

            completa.forEach(item => {
                if (jdati[item.oid]) {
                    jdati[item.oid] = {
                        ...jdati[item.oid], // mantiene proprietà esistenti
                        ...item                  // oppure fai merge dei campi: ...item
                    };
                }
            });
            res.render('partials/mfp-tab-info.ejs', { mfp: dataInfo });
        } catch (error) {
            console.error(error);
            res.status(500).send('Errore aggiornamento controlli');
        }
    });

    router.get('/api/mfp/:serial/oids/active', async (req, res) => {
        let userCookie = req.cookies['X-Custom-Context'];
        if (!userCookie || !sessions_Data[userCookie]) {
            console.log('Errore:Ivalid cookie:' + userCookie);
            res.status(404).send("Invalid coookie:" + userCookie);
            return;
        }
        const serial = req.params.serial;

        const queryData = snmpQueries[serial];
        if (queryData == null) {
            res.status(404).send("no query data:" + serial);
            return;            
        }
        const qArray = [];
        for (const qqq in queryData) {
            const qq = queryData[qqq];
            qArray.push({id:qq.oid, tot : Object.keys(qq.value).length})
        }
        res.render('partials/mfp-queryoids-activequeries.ejs', { items: qArray ?? {} });
    });
    router.get('/api/mfp/:serial/oids/query', async (req, res) => {
        try {
            let userCookie = req.cookies['X-Custom-Context'];
            if (!userCookie || !sessions_Data[userCookie]) {
                console.log('Errore:Ivalid cookie:' + userCookie);
                res.status(404).send("Invalid coookie:" + userCookie);
                return;
            }
            const customerToken = req.headers["customertoken"];// Buffer.from(req.headers["customertoken"], 'base64').toString();
            const serial = req.params.serial;
            if (req.query.oid) {
                console.log(req.query);
            }
            const queryData = snmpQueries[serial];
            if (queryData == null) {
                const actions = await prisma.hosts.findMany({
                    where: { customerID: customerToken },
                    select: { token:true,crawler: true },
                });
                for (const action of actions) {
                    const crawler = JSON.parse(action["crawler"]);
                    crawler.updateCookie = "sendUpdateCookie";
                    const newvalue = await prisma.hosts.update({
                        where: { token: action["token"] },
                        data: { crawler: JSON.stringify(crawler) },
                    });
                    // action["crawler"] = JSON.stringify(crawler);
                }

                console.error("QueryData==null");
                res.status(500).send();
                return;
            }

            if (queryData == {}) {
                res.status(500);
                return;
            }

            const dati = await prisma.dati.findUnique({
                where: {
                    serial_token: {
                        serial: serial,
                        token: customerToken
                    }
                }
            });
            dati["data"] = Buffer.from(dati["data"]).toString('utf-8');
            const jsonData = JSON.parse(dati["data"]);
            // const jsonDataInfo = JSON.parse(dati["datainfo"]);
            const qArray = [];
            let count = 0;
            const first = req.headers["from"];
            let countR = req.headers["count"];

            for (const o in queryData) {
                count++;
                if (count <= first)
                    continue;
                countR--;
                const oids = queryData[o];
                if (jsonData[oids.oid] != null) {
                    //  oids.present = jsonDataInfo[oids.oid];
                    oids.present = jsonData[oids.oid] != "exclude";
                    oids.exclude = jsonData[oids.oid] == "exclude";
                    oids.forced = jsonData[oids.oid] == "forced";
                    oids.origin = jsonData[oids.oid];
                } else {
                    oids.present = false;
                }
                qArray.push(oids);
                if (countR <= 0)
                    break;
            }
            console.log(queryData);
            res.render('partials/mfp-queryoids-table.ejs', { oidsList: qArray });






            return;
            res.render('partials/mfp-queryoids-table.ejs', { oidsList: resp });
            return;

            const dataInfo = await prisma.dati.findUnique({
                where: {
                    serial_token: {
                        serial: serial,
                        token: tokenI
                    }
                },
                select: { serial: true, datainfo: true }
            });

            if (!dataInfo) return res.status(404).send('dataInfo non trovato:' + serial);

            dataInfo["datainfo"] = JSON.parse(Buffer.from(dataInfo["datainfo"]).toString('utf-8'));
            const jdati = dataInfo["datainfo"];
            const oids = Object.keys(jdati);
            const completa = await prisma.oids.findMany({
                where: { oid: { in: oids } },
            });

            completa.forEach(item => {
                if (jdati[item.oid]) {
                    jdati[item.oid] = {
                        ...jdati[item.oid], // mantiene proprietà esistenti
                        ...item                  // oppure fai merge dei campi: ...item
                    };
                }
            });
            res.render('partials/mfp-tab-info.ejs', { mfp: dataInfo });
        } catch (error) {
            console.error(error);
            res.status(500).send('Errore aggiornamento controlli');
        }
    });



    // GET maintenace data of  :serial
    router.get('/api/mfp/:serial/info', async (req, res) => {
        try {
            let userCookie = req.cookies['X-Custom-Context'];
            if (!userCookie || !sessions_Data[userCookie]) {
                console.log('Errore:Ivalid cookie:' + userCookie);
                res.status(404).send("Invalid coookie:" + userCookie);
                return;
            }

            const tokenI = req.headers["customertoken"];// Buffer.from(req.headers["customertoken"], 'base64').toString();
            const serial = req.params.serial;
            const dataInfo = await prisma.dati.findUnique({
                where: {
                    serial_token: {
                        serial: serial,
                        token: tokenI
                    }
                },
                select: { serial: true, datainfo: true }
            });
            /*
            const jdati = JSON.parse(d.datainfo)
                            const oids = Object.keys(jdati);
                            const completa = await prisma.oids.findMany({
                                where: { oid: { in: oids } },
                            });
            
                            completa.forEach(item => {
                                if (jdati[item.oid]) {
                                    jdati[item.oid] = {
                                        ...jdati[item.oid], // mantiene proprietà esistenti
                                        ...item                  // oppure fai merge dei campi: ...item
                                    };
                                }
                            });
            */
            if (!dataInfo || !dataInfo["datainfo"])
                return res.status(404).send('dataInfo non trovato:' + serial);

            dataInfo["datainfo"] = JSON.parse(Buffer.from(dataInfo["datainfo"]).toString('utf-8'));
            const jdati = dataInfo["datainfo"];
            const oids = Object.keys(jdati);
            const completa = await prisma.oids.findMany({
                where: { oid: { in: oids } },
            });

            completa.forEach(item => {
                if (jdati[item.oid]) {
                    jdati[item.oid] = {
                        ...jdati[item.oid], // mantiene proprietà esistenti
                        ...item                  // oppure fai merge dei campi: ...item
                    };
                }
            });
            res.render('partials/mfp-tab-info.ejs', { mfp: dataInfo });
        } catch (error) {
            console.error(error);
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

            const tokenI = req.headers["customertoken"];// Buffer.from(req.headers["customertoken"], 'base64').toString();
            const serial = req.params.serial;
            const alerts = await prisma.dati.findUnique({
                where: {
                    serial_token: {
                        serial: serial,
                        token: tokenI
                    }
                },
                select: { serial: true, dataalerts: true }
            });
            if (!alerts) return res.status(404).send('alerts non trovato:' + serial);

            alerts["dataalerts"] = JSON.parse(Buffer.from(alerts["dataalerts"]).toString('utf-8'));
            res.render('partials/mfp-tab-status-alerts.ejs', { mfp: alerts });
        } catch (error) {
            console.error(error);
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

            host.crawler = JSON.parse(host.crawler);
            res.render('partials/crawler-controls', { host: host });
        } catch (error) {
            console.error(error);
            res.status(500).send('Errore aggiornamento controlli');
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
                where: { token: token },
                select: { crawler: true },
            });
            const crawler = JSON.parse(actions["crawler"]);

            if (action == 'resetHost') {
                const re = await prisma.hosts.update({
                    where: { token: token, "customerID": req.headers["customertoken"] },
                    data: { knownhosts: Buffer.from("[]").toString("base64") },
                });

                const rd = await prisma.dati.deleteMany({
                    where: {
                        token: req.headers["customertoken"]
                    },
                });
                //      prisma.dati.update({
                //         where: { token: token, "customerID": req.headers["customertoken"] },
                //        data: { knownhosts: JSON.stringify([]) },
                //   });
                crawler.resetHost = "off";
                console.log(re);
            } else {
                crawler[action] = value;
            }
            if (action == "queryoids") {
                crawler["queryoidsAction"] = "once";
                crawler["queryoidsIPv4"] = req.body["ipv4"];
                crawler["queryoidsSerial"] = req.body["serial"];
            }
            const newvalue = await prisma.hosts.update({
                where: { token: token },
                data: { crawler: JSON.stringify(crawler) },
            });
            res.status(201).json({ success: true, value: newvalue });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, error: "Errore interno del server", msg: error });
        }
    });

    return router;
};
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');    // <-- Nuovo: per leggere i file dei certificati
const https = require('https'); // <-- Nuovo: per creare il server sicuro
const { hostname } = require('os');
const unzipper = require('unzipper');
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

const lastUpdates = [];
// 0 REFRESH VARI
app.post('/refresh', async (req, res) => {
    try {
        // Fetch all hosts
        const dati = await prisma.dati.findMany({
            include: {

            },
        });
        const toRefresh = [];
        for (const d of dati) {
            const serial = d.serial;
            if (lastUpdates[serial]) {

                const json = JSON.parse(d.lastUpdates);
                if (json.lastUpdatedAlerts == lastUpdates[serial].lastUpdatedAlerts) {
                    delete json["lastUpdatedAlerts"];
                } else {
                    console.log("NEW Alert");
                }
                if (json.lastUpdatedMantained == lastUpdates[serial].lastUpdatedMantained) {
                    delete json.lastUpdatedMantained;
                } else {
                    console.log("NEW Maintain");
                }
                json["serial"] = serial;
                toRefresh.push(json);
            }
            lastUpdates[serial] = JSON.parse(d.lastUpdates);
        }
        const updateHCW = await prisma.hosts.findMany({
            select: {
                token: true,
                crawler: true
            },
        });



        for (const h of updateHCW) {
            const crawler = JSON.parse(h.crawler);

            const token = h.token;
            if ("" + crawler["updateRemote"] == "true") {
                crawler["updateRemote"] = false;
                toRefresh.push(h);
                const updateHCW = await prisma.hosts.update({
                    where: {
                        token: h.token
                    },
                    data: {
                        crawler: JSON.stringify(crawler)
                    },
                });
            }
        }

        console.log('ref:', toRefresh);
        res.send(toRefresh);
    } catch (error) {

        console.log('Errore:', error);
        res.status(500).send("Errore nel caricamento della pagina:" + error);
    }
});

app.get('/api/mfp/:serial/maintenance', async (req, res) => {
    try {
        const serial = req.params.serial;
        const maintainance = await prisma.dati.findUnique({
            where: {
                serial: serial,
            }, select: {
                serial: true,
                dataconsumabili: true
            }
        });
        if (!maintainance) {
            return res.status(404).send('maintenance non trovato:' + serial);
        }


        // 2. Renderizza ed invia SOLO il partial EJS
        //  alerts["dataalerts"] = JSON.parse(Buffer.from(alerts["dataalerts"]).toString('utf-8'));
        maintainance["dataconsumabili"] = JSON.parse(Buffer.from(maintainance["dataconsumabili"]).toString('utf-8'));
        res.render('partials/mfp-tab-status-maintenance.ejs', { mfp: maintainance });
    } catch (error) {
        console.error(error);
        res.status(500).send('Errore aggiornamento controlli');
    }
});



app.get('/api/mfp/:serial/alerts', async (req, res) => {
    try {
        const serial = req.params.serial;
        const alerts = await prisma.dati.findUnique({
            where: {
                serial: serial,
            }, select: {
                serial: true,
                dataalerts: true
            }
        });
        if (!alerts) {
            return res.status(404).send('alerts non trovato:' + serial);
        }

        const str = JSON.stringify(alerts);
        // 2. Renderizza ed invia SOLO il partial EJS
        alerts["dataalerts"] = JSON.parse(Buffer.from(alerts["dataalerts"]).toString('utf-8'));
        res.render('partials/mfp-tab-status-alerts.ejs', { mfp: alerts });
    } catch (error) {
        console.error(error);
        res.status(500).send('Errore aggiornamento controlli');
    }
});

app.get('/api/hosts/:token/controls', async (req, res) => {
    try {
        const token = req.params.token;
        const host = await prisma.hosts.findUnique({
            where: {
                token: token,
            }, select: {
                crawler: true,
                token: true
            },
        });
        if (!host) {
            return res.status(404).send('Host non trovato:' + token);
        }


        // 2. Renderizza ed invia SOLO il partial EJS
        res.render('partials/crawler-controls', { host: host });
    } catch (error) {
        console.error(error);
        res.status(500).send('Errore aggiornamento controlli');
    }
});

// 1. ROTTA PAGINA INIZIALE
app.get('/', async (req, res) => {
    try {
        // Fetch all hosts
        const hostsList = await prisma.hosts.findMany({
            include: {

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
            /*
            for (const ld of r.dati) {
                if (ld["dataalerts"])
                    ld["dataalerts"] = JSON.parse(Buffer.from(ld["dataalerts"]).toString('utf-8'));
                if (ld["datainfo"])
                    ld["datainfo"] = JSON.parse(Buffer.from(ld["datainfo"]).toString('utf-8'));
                if (ld["dataconsumabili"])
                    ld["dataconsumabili"] = JSON.parse(Buffer.from(ld["dataconsumabili"]).toString('utf-8'));
            }
                */
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

    try {
        const token = req.headers["token"];
        const serial = req.headers["serial"];

        console.log("MFP:" + serial + ":" + token);
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


// In server.js (usa 'app' invece di 'server' e correggi la chiamata GET a GitHub)
app.get('/api/github/releases', async (req, res) => {
    const owner = 'MitchPisa76';
    const repo = 'MFPCrawler';

    const options = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/releases`,
        method: 'GET',
        headers: {
            'User-Agent': 'JNODE-MFPCrawler-Dashboard',
            'Accept': 'application/vnd.github+json'
            // Se la repo è privata:
            // 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
        }
    };

    const request = https.request(options, (githubRes) => {
        let body = '';
        githubRes.on('data', chunk => body += chunk);
        githubRes.on('end', () => {
            try {
                const data = JSON.parse(body);
                res.json(data);
            } catch (err) {
                res.status(500).json({ error: 'Errore nel parsing della risposta GitHub' });
            }
        });
    });

    request.on('error', (err) => {
        res.status(500).json({ error: err.message });
    });

    request.end();
});


const GITHUB_TOKEN = "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"
// 1. Trigger della Action via POST
app.post('/api/github/trigger-build', async (req, res) => {
    const { target_version, param_a, param_b } = req.body;
    const owner = 'MItchPisa76';
    const repo = 'MFPCrawler-distribution';
    const workflowId = 'generate-custom-installer-remote.yml';

    const ssl_cert = Buffer.from(sslOptions.cert).toString();

    const data = JSON.stringify({
        ref: 'main',
        inputs: { target_version, param_a, param_b, ssl_cert }
    });

    const options = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
        method: 'POST',
        headers: {
            'User-Agent': 'JNODE-MFPCrawler-Dashboard',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GITHUB_TOKEN}`
        }
    };

    const request = https.request(options, (githubRes) => {
        if (githubRes.statusCode === 204) {
            res.status(200).json({ success: true, timestamp: Date.now() });
        } else {
            console.log(githubRes);
            res.status(githubRes.statusCode).json({ error: 'Errore invio a GitHub' });
        }
    });
    request.write(data);
    request.end();
    request.on('error', (err) => {
        console.log(err);
        res.status(500).json({ error: err.message });
    });

});

let loopOut = false;
app.get('/api/github/build-status', async (req, res) => {
    const owner = 'MItchPisa76';
    const repo = 'MFPCrawler-distribution';

    const options = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/actions/runs?per_page=1`,
        method: 'GET',
        headers: {
            'User-Agent': 'JNODE-MFPCrawler-Dashboard',
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${GITHUB_TOKEN}`
        }
    };

    const request = https.request(options, (githubRes) => {
        let body = '';
        githubRes.on('data', chunk => body += chunk);
        githubRes.on('end', async () => {
            try {
                const data = JSON.parse(body);

                if (data.workflow_runs && data.workflow_runs.length > 0) {
                    const run = data.workflow_runs[0];
                    let fileSavedPath = null;

                    // Se la build è completata con successo, scarichiamo e salviamo l'artifact in locale
                    if (run.status === 'completed' && run.conclusion === 'success' && !loopOut) {
                        try {
                            loopOut = true;
                            fileSavedPath = await downloadAndExtractArtifact(run.artifacts_url);
                        } catch (saveErr) {
                            
                            console.error('Errore durante il salvataggio dell artifact:', saveErr.message);
                        }
                        loopOut = false;
                    }

                    // Risposta unica in formato JSON al client
                    return res.json({
                        status: run.status,
                        conclusion: run.conclusion,
                        html_url: run.html_url,
                        savedLocally: !!fileSavedPath,
                        savedPath: fileSavedPath
                    });

                } else {
                    return res.status(404).json({ error: 'Nessuna run trovata' });
                }
            } catch (err) {
                return res.status(500).json({ error: 'Errore parsing JSON: ' + err.message });
            }
        });
    });

    request.on('error', (err) => res.status(500).json({ error: err.message }));
    request.end();
});
/**
 * Recupera il JSON degli artifacts, estrae archive_download_url e salva il file estratto su disco
 */
function downloadAndExtractArtifact(artifactsUrl) {
    return new Promise((resolve, reject) => {
        const fetchOptions = {
            headers: {
                'User-Agent': 'JNODE-MFPCrawler-Dashboard',
                'Authorization': `Bearer ${GITHUB_TOKEN}`
            }
        };

        // Step 1: Richiesta GET a run.artifacts_url
        https.get(artifactsUrl, fetchOptions, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const artifactsJson = JSON.parse(body);

                    if (!artifactsJson.artifacts || artifactsJson.artifacts.length === 0) {
                        return reject(new Error('Nessun artifact presente per questa run.'));
                    }

                    // Step 2: Estrazione della proprietà archive_download_url
                    const zipDownloadUrl = artifactsJson.artifacts[0].archive_download_url;

                    // Cartella di destinazione locale
                    const outputDir = path.join(__dirname, 'downloads');
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }

                    function streamHandler(zipStream) {
                        // 1. Gestione del Redirect (301/302) da GitHub verso AWS S3
                        if (zipStream.statusCode === 301 || zipStream.statusCode === 302) {
                            const redirectUrl = zipStream.headers.location;

                            // IMPORTANTE:
                            // - Usiamo l'URL completo restituito dall'header location
                            // - Inviamo l'User-Agent (richiesto da molte API)
                            // - OMETTIAMO rigorosamente 'Authorization' perché AWS S3 la rifiuta se l'URL ha già i token di firma
                            const redirectOptions = {
                                headers: {
                                    'User-Agent': 'JNODE-MFPCrawler-Dashboard'
                                }
                            };

                            return https.get(redirectUrl, redirectOptions, streamHandler)
                                .on('error', err => {
                                    reject(err)
                                });
                        }

                        // 2. Controllo che S3 abbia risposto 200 OK prima di passare lo stream ad unzipper
                        if (zipStream.statusCode !== 200) {
                            let errorBody = '';
                            zipStream.on('data', chunk => errorBody += chunk);
                            zipStream.on('end', () => {
                                // Questo log ti mostrerà esattamente cosa risponde AWS S3 o GitHub se fallisce
                                reject(new Error(`Download fallito con status HTTP ${zipStream.statusCode}: ${errorBody}`));
                            });
                            return;
                        }

                        // 3. Estrazione dello Zip se la risposta è valida (HTTP 200)
                        let savedFilePath = null;
                        const parser = unzipper.Parse();

                        parser.on('entry', (entry) => {
                            const fileName = path.basename(entry.path);

                            if (entry.type === 'File' && !savedFilePath) {
                                savedFilePath = path.join(outputDir, fileName);

                                if (fs.existsSync(savedFilePath)) {
                                    entry.autodrain();
                                    return resolve(savedFilePath);
                                }

                                const writeStream = fs.createWriteStream(savedFilePath);
                                entry.pipe(writeStream);

                                writeStream.on('finish', () => resolve(savedFilePath));
                                writeStream.on('error', err => reject(err));
                            } else {
                                entry.autodrain();
                            }
                        });

                        parser.on('error', (err) => {
                            reject(new Error('Errore durante il parsing del file ZIP: ' + err.message));
                        });

                        zipStream.pipe(parser);
                    }

                    https.get(zipDownloadUrl, fetchOptions, streamHandler)
                        .on('error', (err) => {
                            reject(err)
                        });

                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', (err) => reject(err));
    });
}

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

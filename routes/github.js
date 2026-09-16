const express = require('express');
const router = express.Router();
const https = require('https');
const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');

const { pipeline } = require('stream/promises');
const GITHUB_TOKEN = "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";
const owner = 'MitchPisa76';
const repo_crawler = 'MFPCrawler';
const repo_dist = 'MFPCrawler-distribution';

module.exports = function (sessions_Data, prisma, sslOptions) {

    // Rotta per recuperare le release di GitHub
    router.get('/releases', async (req, res) => {
        try {
            const userCookie = req.cookies['X-Custom-Context'];
            if (!userCookie || !sessions_Data[userCookie]) {
                console.log('Errore:Ivalid cookie 1:' + userCookie);
                res.status(404).send("Invalid cookie 1:" + userCookie);
                return;
            }
            const githubRes = await fetch(`https://api.github.com/repos/${owner}/${repo_crawler}/releases`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'JNODE-MFPCrawler-Dashboard',
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${GITHUB_TOKEN}`
                }
            });

            if (!githubRes.ok) {
                throw new Error(`GH /releases HTTP Error: ${githubRes.status}`);
            }

            const data = await githubRes.json();
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }

    });

    // Rotta per avviare il trigger della build via Actions
    router.post('/trigger-build/:customer', async (req, res) => {
        const customer = req.params["customer"];
        const { target_version, param_a, param_b, token_extra } = req.body;
        const workflowId = 'generate-custom-installer-remote.yml';

        const ssl_cert = Buffer.from(sslOptions.cert).toString();
        const userCookie = req.cookies['X-Custom-Context'];
        if (!userCookie || !sessions_Data[userCookie]) {
            console.log('Errore:Ivalid cookie 2:' + userCookie);
            res.status(404).send("Invalid cookie 2:" + userCookie);
            return;
        }
        if (!target_version) {
            console.log('Errore:Ivalid target_version 2:' + target_version);
            res.status(404).send("Invalid targetversion:" + target_version);
            return;
        }
        let sessionExist = sessions_Data[userCookie];
        if (!sessionExist.customers)
            sessionExist.customers = {};
        if (!sessionExist.customers[customer])
            sessionExist.customers[customer] = { build: {} };
        if (sessionExist.customers[customer].build[target_version]) {
            if ((sessionExist.customers[customer].build[target_version].status != "done")) {
                res.status(500).json({ error: "Build already requested for:" + target_version + ":" + customer + ":" + token_extra });
                return;
            } else {
                sessionExist.customers[customer].build = {};
            }
        } else {
            sessionExist.customers[customer].build[target_version] = {};
            sessions_Data[userCookie] = sessionExist;
        }

        const data = JSON.stringify({
            ref: 'main',
            inputs: { target_version, param_a, param_b, token_extra, ssl_cert },
            return_run_details: true
        });


        const githubRes = await fetch(`https://api.github.com/repos/${owner}/${repo_dist}/actions/workflows/${workflowId}/dispatches`, {
            method: 'POST',
            headers: {
                'User-Agent': 'JNODE-MFPCrawler-Dashboard',
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GITHUB_TOKEN}`
            },
            body: data
        });

        if (!githubRes.ok) {
            console.log(`GH /trigger build HTTP Error: ${githubRes.status}`);
            return;
        }
        if (githubRes.status === 200) {
            const json = await githubRes.json();
            console.log(json);

            sessionExist.customers[customer].build[target_version].json = json;
            sessionExist.customers[customer].build[target_version].status = "started";
            sessionExist.customers[customer].build[target_version].token_extra = token_extra;
            const payload = sessionExist.customers[customer];
            const optionsBuffer = Buffer.from(JSON.stringify(payload)).toString('base64');

            const nuovoToken = await prisma.customers.update({
                where: { tokenI: customer },
                data: { builds: optionsBuffer },
            });

            res.status(200).json({ success: true, timestamp: Date.now(), json });
        } else {
            console.log("Error triggerBuild:", githubRes);
            sessionExist.customers[customer].build[target_version].json = await githubRes.json();
            sessionExist.customers[customer].build[target_version].status = "error_req";
            sessionExist.customers[customer].build[target_version].token_extra = token_extra;
            const payload = sessionExist.customers[customer];
            const optionsBuffer = Buffer.from(JSON.stringify(payload)).toString('base64');

            const nuovoToken = await prisma.customers.update({
                where: { tokenI: customer },
                data: { builds: optionsBuffer },
            });

            res.status(githubRes.statusCode).json({ error: 'Errore invio a GitHub' });
        }

    });

    // Rotta per verificare lo stato della build
    router.get('/build-status/:customer/:target', async (req, res) => {
        const customer = req.params["customer"];
        const target = req.params["target"];
        const userCookie = req.cookies['X-Custom-Context'];
        if (!userCookie || !sessions_Data[userCookie]) {
            console.log('Errore:Ivalid cookie 3:' + userCookie);
            res.status(404).send("Invalid coookie 3:" + userCookie);
            return;
        }

        const session_data = sessions_Data[userCookie];

        if (!session_data) {
            res.status(500).json({ error: "no session token" });
            return;
        }
        if (!session_data.customers) {
            session_data.customers = [];
            const nuovoToken = await prisma.customers.findUnique({
                where: { tokenI: customer },
                select: { builds: true },
            });
            const str = Buffer.from(nuovoToken.builds).toString();
            session_data.customers[customer] = JSON.parse(str);
        }
        if (!session_data.customers[customer]) {
            res.status(204).json({ error: "wrong customer token" });
            return;
        }
        const gitData = session_data.customers[customer];
        if (gitData["retriving-build-status"]) {
            res.status(500).json({ error: "already run" });
            return;
        }
        if (!gitData.build && !gitData.build[target]) {
            res.status(204).json({ error: "no customer" });
            return;
        }
        if (!gitData.build[target].json && !gitData.build[target].json.run_url) {
            console.log(gitData.build);
            res.status(500).json({ error: "bad build" });
            return;
        }
        const run_url = gitData.build[target].json.run_url;
        gitData["retriving-build-status"] = true;



        const githubRes = await fetch(run_url, {
            method: 'GET',
            headers: {
                'User-Agent': 'JNODE-MFPCrawler-Dashboard',
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${GITHUB_TOKEN}`
            }
        });

        if (!githubRes.ok) {
            gitData["retriving-build-status"] = false;
            throw new Error(`GH /trigger build HTTP Error: ${githubRes.status}`);
        }

        if (githubRes.status === 200) {
            const run = await githubRes.json();
            let jobstatus = null;


            let fileSavedPath = null;
            // 1. Recupera la lista dei job associati a quel run
            if (gitData.build[target].status === "done") {
                jobstatus = gitData.build[target].status;
                console.log("jobstatus", jobstatus);
            } else if (gitData.build[target].status === "downloading") {
                jobstatus = gitData.build[target].statuss;
                console.log("jobstatus", jobstatus);
            } else if (run.status === 'completed' && run.conclusion === 'success') {
                // Se il download non è ancora mai partito, lo avviamo SENZA fare 'await' per non bloccare la risposta HTTP

                downloadAndExtractArtifact(
                    run.artifacts_url,
                    target, customer,
                    gitData.build[target]
                ).catch(err => console.error("Errore background download:", err));


                // Rispondi al client con lo stato e il progresso aggiornato in tempo reale
                jobstatus = `Starting.....`;
            } else if (gitData.build[target].status === "unzipping") {
                gitData.build[target];
            } else {
                const jobsRes = await fetch(`https://api.github.com/repos/${owner}/${repo_dist}/actions/runs/${run.id}/jobs`, {
                    headers: {
                        'User-Agent': 'JNODE-MFPCrawler-Dashboard',
                        'Accept': 'application/vnd.github+json',
                        'Authorization': `Bearer ${GITHUB_TOKEN}`
                    }
                });

                if (jobsRes.ok) {

                    const jobsData = await jobsRes.json();


                    // 2. Prendi il job attualmente in esecuzione (o il primo della lista)
                    const activeJob = jobsData.jobs[0];

                    if (activeJob && (activeJob.status != "completed")) {
                        console.log(`Stato Job generale: ${activeJob.status}`); // es. "in_progress"

                        // Scansiona i singoli step per vedere cosa è già finito e cosa è attivo
                        activeJob.steps.forEach(step => {
                            if (step.status == 'in_progress')
                                jobstatus = step.name;
                            //console.log(`Step: ${step.name} | Stato: ${step.status} | Conclusione: ${step.conclusion}`);
                        });
                    }
                }

            }

            gitData["retriving-build-status"] = false;
            return res.json({
                job: jobstatus,
                status: run.status,
                conclusion: run.conclusion,
                html_url: run.html_url,
            });

        } else {
            gitData["retriving-build-status"] = false;
            return res.status(404).json({ error: 'Nessuna run trovata' });
        }



        gitData["retriving-build-status"] = false;

        throw new Error(`GH /trigger build HTTP Error EOF: ${githubRes.status}`);
    });

    // Rotta per scaricare i file dalla cartella downloads
    router.get('/download/:customer/:version/:filename', async (req, res) => {
        try {
            // 1. Controllo di autenticazione e sessione (Coerente con le altre rotte)
            const userCookie = req.cookies['X-Custom-Context'];
            if (!userCookie || !sessions_Data[userCookie]) {
                console.log('Errore: Invalid cookie download:' + userCookie);
                return res.status(404).send("Invalid cookie:" + userCookie);
            }

            const { customer, version, filename } = req.params;

            // 2. Definizione del percorso base e del percorso file richiesto
            const downloadsBaseDir = path.resolve(__dirname, '../downloads');
            const filePath = path.join(downloadsBaseDir, customer, version, filename);

            // 3. Sicurezza Anti-Path-Traversal (impedisce l'uso di ../ per uscire dalla cartella)
            if (!filePath.startsWith(downloadsBaseDir)) {
                console.log('Tentativo di accesso non autorizzato:', filePath);
                return res.status(403).json({ error: 'Accesso negato: percorso non valido' });
            }

            // 4. Verifica dell'esistenza del file
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File non trovato' });
            }

            // 5. Avvio del download sicuro del file
            res.download(filePath, filename, (err) => {
                if (err && !res.headersSent) {
                    console.error('Errore durante l\'invio del file:', err);
                    res.status(500).json({ error: 'Errore durante il download del file' });
                }
            });

        } catch (err) {
            console.error('Errore nella rotta di download:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Errore interno del server' });
            }
        }
    });
    
    // Rotta per ottenere l'elenco dei file scaricati organizzati per param_a e target_version
    router.get('/files-table/:customer', (req, res) => {
        const customer = req.params["customer"];
        const downloadsDir = path.join(__dirname, '../downloads', customer);
        if (!fs.existsSync(downloadsDir)) {
            return res.json([]);
        }

        const result = [];
        try {
            const versionsDir = fs.readdirSync(downloadsDir);

            versionsDir.forEach(version => {
                const builddir = path.join(downloadsDir, version);
                if (fs.statSync(builddir).isDirectory()) {
                    const builds = fs.readdirSync(builddir);
                    builds.forEach(build => {
                        const versionPath = path.join(builddir, build);
                        result.push({
                            customer,
                            version,
                            build,
                            
                            fileName: versionPath
                        });

                    });
                }
            });

            res.json(result);
        } catch (err) {
            console.error('Errore lettura cartella downloads:', err);
            res.status(500).json({ error: 'Errore durante la scansione della cartella downloads' });
        }
    });

    async function downloadAndExtractArtifact(artifactsUrl, target_version, customer, gd) {
        const fetchHeaders = {
            'User-Agent': 'JNODE-MFPCrawler-Dashboard',
            'Authorization': `Bearer ${GITHUB_TOKEN}`
        };

        const res = await fetch(artifactsUrl, { headers: fetchHeaders });
        if (!res.ok) throw new Error(`Errore recupero artifacts: ${res.status}`);

        const artifactsJson = await res.json();
        if (!artifactsJson.artifacts?.length) throw new Error('Nessun artifact.');

        const zipDownloadUrl = artifactsJson.artifacts[0].archive_download_url;
        const outputDir = path.join(__dirname, '../downloads', customer, target_version);
        fs.mkdirSync(outputDir, { recursive: true });

        gd.status = "downloading";
        gd.progress = 0;
        gd.statuss = `downloading`;
        // AVOIL BLOCCO: Avviamo il consumo del generatore in background SENZA 'await'
        (async () => {
            try {
                const generator = downloadWProgress(zipDownloadUrl, outputDir, gd);

                for await (const update of generator) {
                    if (update.tipo === 'progresso') {
                        // Il ciclo va alla massima velocità e aggiorna l'oggetto in memoria
                        gd.progress = update.percentuale;
                        gd.statuss = `downloading (${update.percentuale}%)`;
                        await new Promise(resolve => setImmediate(resolve));
                    } else if (update.tipo === 'completato') {
                        gd.status = "done";
                        gd.progress = 100;
                        gd.savedPath = update.savedPath;
                    }
                }
            } catch (err) {
                console.error("Errore durante il download in background:", err);
                gd.status = "error";
                gd.error = err.message;
            }
        })();

        return null; // Ritorna subito al chiamante, il download lavora in background
    }


    async function* downloadWProgress(url, outputDir, gd) {
        const fetchHeaders = {
            'User-Agent': 'JNODE-MFPCrawler-Dashboard',
            'Authorization': `Bearer ${GITHUB_TOKEN}`
        };

        const response = await fetch(url, { headers: fetchHeaders });
        if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);

        const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
        let loadedBytes = 0;

        // Configurazione Parser ZIP e scrittura su disco
        let extractedFilePath = null;
        let writePromise = Promise.resolve();
        const parser = unzipper.Parse();

        parser.on('entry', async (entry) => {
            const baseName = path.basename(entry.path);
            const i = baseName.lastIndexOf(".");
            const tagExtra = gd.token_extra;
            const fileName = baseName.substring(0, i) + (tagExtra ?? "") + baseName.substring(i);

            if (entry.type === 'File' && !extractedFilePath) {
                extractedFilePath = path.join(outputDir, fileName);

                try {
                    await fs.promises.access(extractedFilePath);
                    entry.autodrain();
                } catch {
                    const writeStream = fs.createWriteStream(extractedFilePath);
                    writePromise = new Promise((resolve, reject) => {
                        writeStream.on('finish', resolve);
                        writeStream.on('error', reject);
                    });
                    entry.pipe(writeStream);
                }
            } else {
                entry.autodrain();
            }
        });

        // Legge lo stream HTTP e invia i chunk direttamente al parser senza accumulare RAM
        for await (const chunk of response.body) {
            loadedBytes += chunk.length;
            parser.write(chunk);

            const percentuale = totalBytes ? Math.round((loadedBytes / totalBytes) * 100) : 0;

            // Emette l'aggiornamento di progresso
            yield { tipo: 'progresso', percentuale, loadedBytes, totalBytes };
        }

        parser.end();
        await writePromise;

        if (!extractedFilePath) {
            throw new Error('Nessun file estratto dallo ZIP.');
        }

        yield { tipo: 'completato', savedPath: extractedFilePath };
    }

    return router;
};
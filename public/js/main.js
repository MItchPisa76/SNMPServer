// Caricamento releases e gestione invio form GitHub
document.addEventListener('DOMContentLoaded', () => {
    const versionSelect = document.getElementById('github-release-select');
    const githubTagBadge = document.getElementById('github-release-tag');
    const githubForm = document.getElementById('github-action-form');
    const feedbackDiv = document.getElementById('github-action-feedback');
    const customerInput = document.getElementById('github-customer-input');
    const tokenInput = document.getElementById('github-token-input');
    const btnTrigger = document.getElementById('btn-trigger-github');
    const statusSpan = document.getElementById('github-build-status');
    let buildPollInterval = null;

    if (btnTrigger) {
        btnTrigger.addEventListener('click', async () => {
            const version = document.getElementById('github-release-select').value;
            const customer = document.getElementById('github-customer-input').value.trim();
            const token = document.getElementById('github-token-input').value.trim();

            if (!version || !customer || !token) {
                alert('Compilare tutti i campi!');
                return;
            }

            btnTrigger.disabled = true;
            btnTrigger.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Avvio...';
            statusSpan.innerHTML = '<span class="badge bg-secondary"><i class="bi bi-hourglass-split"></i> Inizializzazione...</span>';

            try {
                const res = await fetch('/api/github/trigger-build', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target_version: version, param_a: customer, param_b: token })
                });

                if (res.ok) {
                    // Avvia il polling dello stato ogni 5 secondi
                    pollBuildStatus();
                } else {
                    throw new Error('Errore avvio workflow');
                }
            } catch (err) {
                btnTrigger.disabled = false;
                btnTrigger.innerHTML = '<i class="bi bi-rocket-takeoff-fill"></i> Avvia Build';
                statusSpan.innerHTML = '<span class="badge bg-danger">Errore Avvio</span>';
            }
        });
    }

    function pollBuildStatus() {
        if (buildPollInterval) clearInterval(buildPollInterval);

        buildPollInterval = setInterval(async () => {
            try {
                const res = await fetch('/api/github/build-status');
                const data = await res.json();

                if (data.status === 'queued' || data.status === 'in_progress') {
                    btnTrigger.disabled = true;
                    btnTrigger.innerHTML = '<span class="spinner-border spinner-border-sm"></span> In corso...';
                    statusSpan.innerHTML = '<span class="badge bg-warning text-dark"><i class="bi bi-gear-wide-connected spin"></i> Build in corso...</span>';
                } else if (data.status === 'completed') {
                    clearInterval(buildPollInterval);
                    btnTrigger.disabled = false;
                    btnTrigger.innerHTML = '<i class="bi bi-rocket-takeoff-fill"></i> Avvia Build';

                    if (data.conclusion === 'success') {
                        statusSpan.innerHTML = `
                        <a href="${data.html_url}" target="_blank" class="btn btn-success btn-sm d-inline-flex align-items-center gap-1">
                            <i class="bi bi-download"></i> Download / Vedi Build
                        </a>`;
                    } else {
                        statusSpan.innerHTML = '<span class="badge bg-danger"><i class="bi bi-x-circle"></i> Build Fallita</span>';
                    }
                }
            } catch (err) {
                console.error('Errore polling status:', err);
            }
        }, 5000);
    }



    // 1. Inserisce il tokenI del cliente se viene selezionato dalla datalist
    if (customerInput) {
        customerInput.addEventListener('input', (e) => {
            const val = e.target.value;
            const option = document.querySelector(`#customers-datalist option[value="${CSS.escape(val)}"]`);
            if (option && option.dataset.token) {
                tokenInput.value = option.dataset.token;
            }
        });
    }

    // 2. Fetch delle Release da GitHub tramite la rotta del server Express
    async function loadGithubReleases() {
        if (!versionSelect) return;

        try {
            const res = await fetch('/api/github/releases');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const releases = await res.json();
            versionSelect.innerHTML = '';

            if (Array.isArray(releases) && releases.length > 0) {
                releases.forEach((rel, index) => {
                    const opt = document.createElement('option');
                    opt.value = rel.tag_name;
                    opt.textContent = `${rel.tag_name} ${rel.prerelease ? '(Pre-release)' : ''}`;
                    if (index === 0) opt.selected = true;
                    versionSelect.appendChild(opt);
                });

                if (githubTagBadge) {
                    githubTagBadge.textContent = releases[0].tag_name;
                    githubTagBadge.className = 'badge bg-success';
                }
            } else {
                versionSelect.innerHTML = '<option value="">Nessuna release trovata</option>';
            }
        } catch (err) {
            console.error('Errore recupero releases GitHub:', err);
            versionSelect.innerHTML = '<option value="">Errore caricamento versioni</option>';
            if (githubTagBadge) {
                githubTagBadge.textContent = 'Errore';
                githubTagBadge.className = 'badge bg-danger';
            }
        }
    }

    loadGithubReleases();

    // 3. Invio della richiesta di Trigger del Workflow
    if (githubForm) {
        githubForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const target_version = versionSelect.value;
            const param_a = customerInput.value.trim();
            const param_b = tokenInput.value.trim();
            const submitBtn = document.getElementById('btn-trigger-github-action');

            if (!target_version || !param_a || !param_b) {
                alert('Compilare tutti i campi prima di procedere.');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Invio in corso...';
            feedbackDiv.style.display = 'none';

            try {
                const response = await fetch('/api/github/trigger-build', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target_version, param_a, param_b })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    feedbackDiv.className = 'mt-2 alert alert-success p-2 small';
                    feedbackDiv.textContent = ' Richiesta inviata con successo a GitHub Actions!';
                } else {
                    throw new Error(data.error || 'Errore durante l\'invio della richiesta.');
                }
            } catch (err) {
                feedbackDiv.className = 'mt-2 alert alert-danger p-2 small';
                feedbackDiv.textContent = `❌ ${err.message}`;
            } finally {
                feedbackDiv.style.display = 'block';
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="bi bi-play-circle-fill"></i> Invia a GitHub Actions';
            }
        });
    }

    // ==========================================
    // 1. SISTEMA DI REFRESH PAGINA
    // ==========================================
    const refreshBtn = document.getElementById('btn-refresh-now');
    const refreshSelect = document.getElementById('auto-refresh-select');
    const lastUpdateSpan = document.getElementById('last-update-time');
    let refreshTimer = null;

    // Imposta l'orario dell'ultimo aggiornamento
    if (lastUpdateSpan) {
        lastUpdateSpan.textContent = `Ultimo aggiornamento: ${new Date().toLocaleTimeString()}`;
    }

    // Refresh manuale
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => location.reload());
    }


    async function updateRefreshAlerts(serial) {
        const container = document.getElementById(`alerts-container-${serial}`);
        if (!container) return;

        try {
            // Effettua la chiamata alla rotta partial
            const response = await fetch(`/api/mfp/${serial}/alerts`);

            if (!response.ok) {
                throw new Error(`Errore HTTP: ${response.status}`);
            }

            // Ottiene l'HTML parziale restituito dal server
            const updatedHtml = await response.text();

            // Inietta l'HTML aggiornato direttamente nel DOM senza refresh
            container.innerHTML = updatedHtml;

        } catch (error) {
            console.error(`Errore durante il refresh dell'mfp alert ${serial}:`, error);
        }
    }

    async function updateRefreshMantained(serial) {
        const container = document.getElementById(`maintenance-container-${serial}`);
        if (!container) return;

        try {
            // Effettua la chiamata alla rotta partial
            const response = await fetch(`/api/mfp/${serial}/maintenance`);

            if (!response.ok) {
                throw new Error(`Errore HTTP: ${response.status}`);
            }

            // Ottiene l'HTML parziale restituito dal server
            const updatedHtml = await response.text();

            // Inietta l'HTML aggiornato direttamente nel DOM senza refresh
            container.innerHTML = updatedHtml;

        } catch (error) {
            console.error(`Errore durante il refresh dell'mfp alert ${serial}:`, error);
        }
    }

    // Gestione timer auto-refresh
    function startAutoRefresh(seconds) {
        if (refreshTimer) clearInterval(refreshTimer);
        if (seconds > 0) {
            refreshTimer = setInterval(async () => {

                const res = await fetch('/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: ""
                });
                if (res.ok) {
                    //console.log(await res.body);
                    const content = await res.json();
                    for (const c of content) {
                        if (c["crawler"]) {
                            updateRefreshControls(c["token"]);
                            console.log("CRAWLER", c);
                        }
                        if (c["lastUpdatedAlerts"]) {
                            updateRefreshAlerts(c["serial"]);
                            console.log("ALERT", c);
                        }

                        if (c["lastUpdatedMantained"]) {
                            updateRefreshMantained(c["serial"]);
                            console.log("ALERT", c);
                        }

                    }

                }
                //  location.reload();
            }, seconds * 1000);
        }
    }

    if (refreshSelect) {
        // Ripristina preferenza salvata in localStorage se presente
        const savedInterval = localStorage.getItem('mfp_refresh_interval1');
        if (savedInterval !== null) {
            refreshSelect.value = savedInterval;
        }

        startAutoRefresh(parseInt(refreshSelect.value, 10));

        refreshSelect.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            localStorage.setItem('mfp_refresh_interval1', val);
            startAutoRefresh(val);
        });
    }

    // ==========================================
    // 2. RIPRISTINO E SALVATAGGIO STATO COLLAPSE
    // ==========================================
    // Mantiene aperte le sezioni stampante che l'utente ha espanso prima del refresh
    const collapseElements = document.querySelectorAll('.collapse[id^="collapse-mfp-"]');

    collapseElements.forEach(el => {
        const id = el.getAttribute('id');
        if (localStorage.getItem(id) === 'open') {
            const bsCollapse = new bootstrap.Collapse(el, { show: true });
        }

        el.addEventListener('shown.bs.collapse', () => {
            localStorage.setItem(id, 'open');
        });

        el.addEventListener('hidden.bs.collapse', () => {
            localStorage.setItem(id, 'closed');
        });
    });




    function updateButtonStyles(allButtons, clickedButton, value) {
        allButtons.forEach(b => {
            b.classList.remove('active', 'btn-success', 'btn-secondary', 'btn-info', 'text-white');
            b.classList.add('btn-outline-secondary');
        });

        clickedButton.classList.remove('btn-outline-secondary');
        clickedButton.classList.add('active');

        if (value === 'true') clickedButton.classList.add('btn-success');
        else if (value === 'false') clickedButton.classList.add('btn-secondary');
        else if (value === 'once') clickedButton.classList.add('btn-info', 'text-white');
    }


    async function updateRefreshControlsEvent(event) {
        const btn = event.currentTarget;
        const token = btn.dataset.token;
        const action = btn.dataset.action;
        const value = btn.dataset.value;

        if (btn.classList.contains('active')) return;

        const btnGroup = btn.closest('.btn-group');
        const siblingButtons = btnGroup.querySelectorAll('.crawler-btn');

        try {
            const response = await fetch('/api/crawler/actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, action, value })
            });

            if (!response.ok) throw new Error(`Errore risposta server: ${response.status}`);

            siblingButtons.forEach(b => b.classList.add('disabled'));

            updateButtonStyles(siblingButtons, btn, value);
        } catch (error) {
            console.error('Errore nell\'aggiornamento del parametro crawler:', error);
            alert('Impossibile aggiornare lo stato del crawler.');
        } finally {
            siblingButtons.forEach(b => b.classList.remove('disabled'));
        }
    }

    async function updateRefreshControls(hostToken) {
        const container = document.getElementById(`crawler-controls-${hostToken}`);
        if (!container) return;

        try {
            // Effettua la chiamata alla rotta partial
            const response = await fetch(`/api/hosts/${hostToken}/controls`);

            if (!response.ok) {
                throw new Error(`Errore HTTP: ${response.status}`);
            }

            // Ottiene l'HTML parziale restituito dal server
            const updatedHtml = await response.text();

            // Inietta l'HTML aggiornato direttamente nel DOM senza refresh
            container.innerHTML = updatedHtml;
            const crawlerButtons = container.querySelectorAll('.crawler-btn');

            crawlerButtons.forEach(button => {
                button.addEventListener('click', updateRefreshControlsEvent);
            });
        } catch (error) {
            console.error(`Errore durante il refresh dell'host ${hostToken}:`, error);
        }
    }

    const crawlerButtons = document.querySelectorAll('.crawler-btn');

    crawlerButtons.forEach(button => {
        button.addEventListener('click', updateRefreshControlsEvent);
    });
});

if (1 == 0)
    document.addEventListener('DOMContentLoaded', () => {

        // Cache in memoria per evitare di richiamare lo stesso OID più volte
        const oidCache = {};

        /**
         * Funzione per caricare le informazioni di un singolo OID dall'API /oid/:oid
         */
        async function fetchOidDetails(rowElement) {
            const oid = rowElement.dataset.oid;
            const shortCell = rowElement.querySelector('.oid-short');
            const brandCell = rowElement.querySelector('.oid-brand');
            const descCell = rowElement.querySelector('.oid-desc');

            if (!oid) return;

            try {
                let data;

                // Se l'OID è già stato scaricato, usiamo la cache
                if (oidCache[oid]) {
                    data = oidCache[oid];
                } else {
                    const response = await fetch(`/oid/${encodeURIComponent(oid)}`);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    data = await response.json();
                    oidCache[oid] = data; // Salva in cache
                }

                // Popola i campi della tabella con i dati ricevuti
                shortCell.textContent = data.short || '-';
                brandCell.textContent = data.brandShort || '-';
                descCell.textContent = data.descrizione || data.description || '-';

                // Rimuovi la classe text-muted una volta caricato
                shortCell.classList.remove('text-muted');
                brandCell.classList.remove('text-muted');
                descCell.classList.remove('text-muted');

            } catch (error) {
                console.warn(`Impossibile recuperare info per l'OID ${oid}:`, error);
                shortCell.textContent = 'N/D';
                brandCell.textContent = 'N/D';
                descCell.textContent = 'Non trovato';
            }
        }

        /**
         * Cicla su tutte le righe OID della pagina e recupera le informazioni
         */
        function initOidLookups() {
            const oidRows = document.querySelectorAll('.oid-row');
            oidRows.forEach(row => {
                fetchOidDetails(row);
            });
        }

        // Esegui il lookup degli OID al caricamento della pagina
        initOidLookups();

        // ==========================================
        // 1. GESTIONE PULSANTI CRAWLER HOST (ON/OFF/ONCE)
        // ==========================================
        const crawlerButtons = document.querySelectorAll('.crawler-btn');

        crawlerButtons.forEach(button => {
            button.addEventListener('click', updateRefreshControls);


            // ==========================================
            // 2. GESTIONE FORM QUERY OIDs (PER SINGOLA MFP)
            // ==========================================
            const queryOidsForms = document.querySelectorAll('.queryoids-form');

            queryOidsForms.forEach(form => {
                form.addEventListener('submit', async (event) => {
                    event.preventDefault();

                    const token = form.dataset.token;
                    const serial = form.dataset.serial;
                    const ipv4 = form.dataset.ipv4;
                    const inputField = form.querySelector('.queryoids-input');
                    const submitBtn = form.querySelector('button[type="submit"]');
                    const queryoidsValue = inputField.value.trim();

                    if (!queryoidsValue) {
                        alert('Inserisci almeno un OID prima di inviare.');
                        return;
                    }

                    const originalBtnHTML = submitBtn.innerHTML;
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Invio...';

                    try {
                        const response = await fetch('/api/crawler/actions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                token,
                                serial,
                                action: 'queryoids',
                                value: queryoidsValue,
                                ipv4
                            })
                        });

                        if (!response.ok) throw new Error(`Errore Server: ${response.status}`);

                    } catch (error) {
                        console.error('Errore durante il salvataggio degli OID:', error);
                        alert('Impossibile salvare il campo Query OIDs.');
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnHTML;
                    }
                });
            });

        })
    });
document.addEventListener('DOMContentLoaded', () => {

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
                            console.log("CRAWLER",c);
                        }
                        if (c["lastUpdatedAlerts"]) {
                            updateRefreshAlerts(c["serial"]);
                            console.log("ALERT",c);
                        }

                        if (c["lastUpdatedMantained"]) {
                            updateRefreshMantained(c["serial"]);
                            console.log("ALERT",c);
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
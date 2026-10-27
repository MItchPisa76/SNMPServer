// Caricamento releases e gestione invio form GitHub
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


    async function updateRefreshAlerts(serial, tokenCustomer) {
        const container = document.getElementById(`alerts-container-${serial}`);
        if (!container) return;

        try {
            // Effettua la chiamata alla rotta partial
            const response = await fetch(`/api/mfp/${serial}/alerts`, {
                headers: { "customertoken": tokenCustomer }
            });

            if (!response.ok) {
                throw new Error(`Errore HTTP: ${response.status}`);
            }

            // Ottiene l'HTML parziale restituito dal server
            const updatedHtml = await response.text();

            container.classList.remove('show');

            setTimeout(() => {
                container.innerHTML = updatedHtml;
                if (container.classList.contains('active'))
                    container.classList.add('show');
            }, 150);

        } catch (error) {
            console.error(`Errore durante il refresh dell'mfp alert ${serial}:`, error);
        }
    }

    async function updateRefreshMantained(serial, tokenCustomer) {
        const container = document.getElementById(`maintenance-container-${serial}`);
        if (!container) return;

        try {
            // Effettua la chiamata alla rotta partial
            const response = (await fetch(`/api/mfp/${serial}/maintenance`, {
                headers: { "customertoken": tokenCustomer }
            }));

            if (!response.ok) {
                throw new Error(`Errore HTTP: ${response.status}`);
            }

            // Ottiene l'HTML parziale restituito dal server
            const updatedHtml = await response.text();

            container.classList.remove('show');

            setTimeout(() => {
                // 2. Aggiorna contenuto e riattiva fade-in
                //    console.log(updatedHtml);
                container.innerHTML = updatedHtml;
                if (container.classList.contains('active'))
                    container.classList.add('show');
            }, 150);
            // Inietta l'HTML aggiornato direttamente nel DOM senza refresh


        } catch (error) {
            console.error(`Errore durante il refresh dell'mfp alert ${serial}:`, error);
        }
    }

    async function updateRefreshInfotab(serial, tokenCustomer) {
        const container = document.getElementById(`info-pane-${serial}`);
        // const tabPane = document.getElementById(`mfp-tab-${serial}`);

        if (!container) return;


        try {
            // Effettua la chiamata alla rotta partial
            const response = (await fetch(`/api/mfp/${serial}/info`, {
                headers: { "customertoken": tokenCustomer }
            }));

            if (!response.ok) {
                throw new Error(`Errore HTTP: ${response.status}`);
            }

            // Ottiene l'HTML parziale restituito dal server
            const updatedHtml = await response.text();

            // Inietta l'HTML aggiornato direttamente nel DOM senza refresh

            container.classList.remove('show');

            setTimeout(() => {
                // 2. Aggiorna contenuto e riattiva fade-in
                //      console.log(updatedHtml);
                container.innerHTML = updatedHtml;
                if (container.classList.contains('active'))
                    container.classList.add('show');
            }, 150);

        } catch (error) {
            console.error(`Errore durante il refresh dell'mfp alert ${serial}:`, error);
        }
    }

    async function updateRefreshOIDStab(serial, tokenCustomer) {
        const container = document.getElementById(`queryoids-pane-${serial}`);
        // const tabPane = document.getElementById(`mfp-tab-${serial}`);

        if (!container) return;


        try {
            // Effettua la chiamata alla rotta partial
            const response = (await fetch(`/api/mfp/${serial}/oids/list`, {
                headers: { "customertoken": tokenCustomer }
            }));

            if (!response.ok) {
                throw new Error(`Errore HTTP: ${response.status}`);
            }

            // Ottiene l'HTML parziale restituito dal server
            const updatedHtml = await response.text();

            // Inietta l'HTML aggiornato direttamente nel DOM senza refresh

            container.classList.remove('show');

            setTimeout(() => {
                // 2. Aggiorna contenuto e riattiva fade-in
                //      console.log(updatedHtml);
                container.innerHTML = updatedHtml;
                if (container.classList.contains('active'))
                    container.classList.add('show');
            }, 150);

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
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },

                });
                if (res.ok) {
                    //console.log(await res.body);
                    const content = await res.json();

                    for (const c of content) {
                        if (c["serial"] && c["status"]) {
                            console.log(c);
                            const container = document.getElementById(`mfp-online-${c["serial"]}`);
                            if (container != null) {
                                container.innerHTML = c["status"];
                            }
                        } else {
                            console.error(c);
                        }

                        if (c["crawler"]) {
                            updateRefreshControls(c["token"]);
                            console.log("CRAWLER", c);
                        }
                        if (c["lastUpdatedAlert"]) {
                            updateRefreshAlerts(c["serial"], c["token"]);
                            console.log("ALERT", c);
                        }

                        if (c["lastUpdatedMaintenance"]) {
                            updateRefreshMantained(c["serial"], c["token"]);
                            console.log("Maintein", c);
                        }
                        if (c["lastUpdatedInfo"]) {
                            updateRefreshInfotab(c["serial"], c["token"]);
                        }
                        if (c["lastUpdatedQuery"]) {
                            console.log("**************PUPPAAAA**********:" + c["serial"]);
                            updateQueryOIDStab(c["serial"], c["token"]);
                        }
                    }

                }
                //  location.reload();
            }, seconds * 1000);
        }
    }

    async function updateQueryOIDStab(serial, tokenCustomer) {
        const parentContainer = document.getElementById(`queryoids-pane-${serial}`);
        const container = parentContainer.querySelector("tbody");
        const paginatorPage = parentContainer.querySelector("tfoot [data-action='from']");
        const paginatorCount = parentContainer.querySelector("tfoot [data-action='count']");
        const list = parentContainer.querySelectorAll('thead input');

        // const tabPane = document.getElementById(`mfp-tab-${serial}`);

        console.log(paginatorPage.value, paginatorCount.value);
        if (!container) return;


        try {
            // Effettua la chiamata alla rotta partial
            const response = (await fetch(`/api/mfp/${serial}/oids/query`, {
                headers: { "customertoken": tokenCustomer, from: paginatorPage.value, count: paginatorCount.value }
            }));

            if (!response.ok) {
                throw new Error(`Errore HTTP: ${response.status}`);
            }

            // Ottiene l'HTML parziale restituito dal server
            const updatedHtml = await response.text();

            // Inietta l'HTML aggiornato direttamente nel DOM senza refresh

            container.classList.remove('show');

            setTimeout(() => {
                // 2. Aggiorna contenuto e riattiva fade-in
                //      console.log(updatedHtml);
                container.innerHTML = updatedHtml;
                if (container.classList.contains('active'))
                    container.classList.add('show');
            }, 150);

        } catch (error) {
            console.error(`Errore durante il refresh dell'mfp alert ${serial}:`, error);
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
        else if (value.includes('once')) clickedButton.classList.add('btn-info', 'text-white');
    }
    async function updateOIDRequest(params) {

        const id = params.target.dataset.command;
        const serialBase = params.target.closest('.serial-base');
        const serial = serialBase.dataset.serial;


        const customerDiv = params.target.closest('.customer-card-root');
        const tokenCustomer = customerDiv.dataset.customerToken;

        const baseOidInput = params.target.closest("tr").querySelector(".f-oid");
        const baseoid = baseOidInput.value;
        if (id == "walk") {
            params.target.classList.add("active", "disabled");
            params.target.dataset.walkoid = baseoid;
            const response = (await fetch(`/oids/${serial}/walk/${baseoid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', "customertoken": tokenCustomer },
                body: JSON.stringify({
                    id
                })
            }));
            console.log(response);
        }
    }
    async function updateOIDStatusEvent(params) {

        const id = params.target.dataset.value;//.substring(params.target.name.lastIndexOf("-") + 1);


        const customerDiv = params.target.closest('.customer-card-root');
        const tokenCustomer = customerDiv.dataset.customerToken;
        const serialBase = params.target.closest('.serial-base');
        const serial = serialBase.dataset.serial;
        const OIDDiv = params.target.closest("div");
        OIDDiv.querySelectorAll('label').forEach(input => {
            input.classList.remove('active');
            if (input.dataset.name == id)
                input.classList.add("active");
        });

        const oid = OIDDiv.dataset.oid;
        const response = (await fetch(`/oids/${serial}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', "customertoken": tokenCustomer },
            body: JSON.stringify({
                id,
                oid
            })
        }));
        console.log(params);
    }

    async function updateOidsQueryPaginator(event) {
        const btn = event.target;
        const serialtfoot = btn.closest('tfoot');
        const customerDiv = btn.closest('.customer-card-root');
        const tokenCustomer = customerDiv.dataset.customerToken;
        const serial = serialtfoot.closest('table').dataset.serial;
        const action = btn.closest("button").dataset["action"];
        console.log(">>", serial, btn.dataset, action, tokenCustomer);
        if (action == "next") {
            const paginatorPage = serialtfoot.querySelector("[data-action='from']");
            const paginatorCount = serialtfoot.querySelector("[data-action='count']").value;
            paginatorPage.value = parseInt(paginatorPage.value) + parseInt(paginatorCount);

        }

        if (action == "prev") {
            const paginatorPage = serialtfoot.querySelector("[data-action='from']");
            const paginatorCount = serialtfoot.querySelector("[data-action='count']").value;
            paginatorPage.value = parseInt(paginatorPage.value) - parseInt(paginatorCount)
            paginatorPage.value = parseInt(paginatorPage.value) < 0 ? 0 : paginatorPage.value;
        }


        //     updateQueryOIDStab(serial, tokenCustomer);
        updateOidsDatalist(btn.closest('table'));
    }

    async function updateOidsDatalistEvent(event) {
        const btn = event.currentTarget;
        const table = btn.closest('table');
        updateOidsDatalist(table);
    }

    async function updateOidsDatalist(table) {

        const walkButton = table.querySelector('thead [data-command="walk"]');

        const customerDiv = table.closest('.customer-card-root');
        const container = table.querySelector('tbody');
        const containerH = table.querySelector('thead');
        const list = containerH.querySelectorAll('input');


        const paginatorPage = table.querySelector("tfoot [data-action='from']");
        const paginatorCount = table.querySelector("tfoot [data-action='count']");

        const tokenCustomer = customerDiv.dataset.customerToken;
        const serial = table.dataset.serial;

        const data = {};
        for (const l of list) {
            if (l.dataset.target)
                data[l.dataset.target] = l.value;
        }

        console.log(data);
        const query = new URLSearchParams(
            data
        ).toString();
        if (!data["oid"].startsWith(walkButton.dataset.walkoid)) {

            const response = (await fetch(`/oids/${serial}/suggestions?` + query, {
                headers: { 'Content-Type': 'application/json', "customertoken": tokenCustomer, from: paginatorPage.value, count: paginatorCount.value },
            }));
            if (!response.ok) throw new Error(`Errore risposta server: ${response.status}`);
            const updatedHtml = await response.text();
            setTimeout(() => {
                // 2. Aggiorna contenuto e riattiva fade-in
                //      console.log(updatedHtml);
                container.innerHTML = updatedHtml;
                if (container.classList.contains('active'))
                    container.classList.add('show');
                walkButton.classList.remove("active", "disabled");
            }, 150);
            // Inietta l'HTML aggiornato direttamente nel DOM senza refresh
            //  container.innerHTML = updatedHtml;

        } else {
            try {
                // Effettua la chiamata alla rotta partial
                const response = (await fetch(`/api/mfp/${serial}/oids/query?+query`, {
                    headers: { "customertoken": tokenCustomer, from: paginatorPage.value, count: paginatorCount.value, walkoid:walkButton.dataset.walkoid }
                }));

                if (!response.ok) {
                    throw new Error(`Errore HTTP: ${response.status}`);
                }

                // Ottiene l'HTML parziale restituito dal server
                const updatedHtml = await response.text();

                // Inietta l'HTML aggiornato direttamente nel DOM senza refresh

                container.classList.remove('show');

                setTimeout(() => {
                    // 2. Aggiorna contenuto e riattiva fade-in
                    //      console.log(updatedHtml);
                    container.innerHTML = updatedHtml;
                    if (container.classList.contains('active'))
                        container.classList.add('show');
                }, 150);

            } catch (error) {
                console.error(`Errore durante il refresh dell'mfp query ${serial}:`, error);
            }
        }
        const tributtons = container.querySelectorAll('.oid-status-tributton label');
        for (const b of tributtons) {
            b.addEventListener('click', updateOIDStatusEvent);
        }


        const listButtonsH = containerH.querySelectorAll('button');
        for (const b of listButtonsH) {
            b.addEventListener('click', updateOIDRequest);
        }
    }

    async function updateRefreshControlsEvent(event) {
        const btn = event.currentTarget;
        const token = btn.dataset.token;
        const action = btn.dataset.action;
        const value = btn.dataset.value;

        if (btn.classList.contains('active')) return;

        const customerDiv = btn.closest('.customer-card-root');
        const customertoken = customerDiv.dataset.customerToken;

        const btnGroup = btn.closest('.btn-group');
        const siblingButtons = btnGroup.querySelectorAll('.crawler-btn');

        try {
            const response = await fetch('/api/crawler/actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', customertoken },
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

    const oidsQueryTextOid = document.querySelectorAll('.f-oid');
    oidsQueryTextOid.forEach(text => {
        text.addEventListener('input', updateOidsDatalistEvent);
    });

    const oidsQueryTextShort = document.querySelectorAll('.f-short');
    oidsQueryTextShort.forEach(text => {
        text.addEventListener('input', updateOidsDatalistEvent);
    });

    const oidsQueryTextBrandShort = document.querySelectorAll('.f-brandShort');
    oidsQueryTextBrandShort.forEach(text => {
        text.addEventListener('input', updateOidsDatalistEvent);
    });


    const oidsQueryTextVendor = document.querySelectorAll('.f-vendor');
    oidsQueryTextVendor.forEach(text => {
        text.addEventListener('input', updateOidsDatalistEvent);
    });

    const oidsQueryTextDescrizione = document.querySelectorAll('.f-descrizione');
    oidsQueryTextDescrizione.forEach(text => {
        text.addEventListener('input', updateOidsDatalistEvent);
    });

    const oidsQueryPaginator = document.querySelectorAll('.table-paginator');
    oidsQueryPaginator.forEach(tr => {
        const paginatorAction = tr.querySelectorAll('button');
        paginatorAction.forEach(td => {
            td.addEventListener('click', updateOidsQueryPaginator);
        });
    });

    const oidsQueriesRegitered = document.querySelectorAll('.querylist');
    oidsQueriesRegitered.forEach(async (item) => {
        const serial = item.dataset.serial;
        //   console.log(serial);
        const response = await fetch(`/api/mfp/${serial}/oids/active`);

        if (!response.ok) {
            throw new Error(`Errore HTTP: ${response.status}`);
        }

        const updatedHtml = await response.text();
        item.innerHTML = updatedHtml;
        const oidsQueriesButtons = item.querySelectorAll('.oid-walk');
        oidsQueriesButtons.forEach(lab => {
            lab.addEventListener('click', (event) => {
                const table = lab.closest('div.tab-pane').querySelector("table");
                const walkButton = table.querySelector('thead [data-command="walk"]');
                walkButton.dataset.walkoid = lab.dataset.id;
                updateOidsDatalist(table);
            });
        });
    });
});
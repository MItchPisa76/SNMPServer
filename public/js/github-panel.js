document.addEventListener('DOMContentLoaded', () => {
    // Seleziona tutti i pannelli GitHub presenti nella pagina
    const githubPanels = document.querySelectorAll('.github-panel-container');

    githubPanels.forEach(panel => {
        // Riferimenti locali al singolo pannello cliente
        const versionSelect = panel.querySelector('.github-release-select');
        const soSelect = panel.querySelector('.github-so-select');
        const tokenInput = panel.querySelector('.github-token-input');
        const btnTrigger = panel.querySelector('.btn-trigger-github');
        const statusSpan = panel.querySelector('.github-build-status');
        const errorContainer = panel.querySelector('.github-panel-error-container');
        const errorText = panel.querySelector('.github-panel-error-text');



        // Dati del cliente iniettati dal dataset HTML

        const parentPanel = panel.closest('.customer-card-root');
        const btnToggleFiles = parentPanel.querySelector('.btn-toggle-files');
        const collapseElement = parentPanel.querySelector('.customer-files-collapse');

        const customerName = parentPanel.dataset.customerName;
        const customerToken = parentPanel.dataset.customerToken;


        console.log(customerName, customerToken);


        let bsCollapse = null;
        const filesContainer = parentPanel.querySelector('.customer-files-container');

        let buildPollInterval = null;


        // Inizializza l'istanza programmata del Collapse di Bootstrap 5
        if (collapseElement) {
            bsCollapse = new bootstrap.Collapse(collapseElement, { toggle: false });
        }
        function showError(message) {
            if (errorContainer && errorText) {
                errorText.textContent = message;
                errorContainer.style.display = 'block';
            }
        }

        function clearError() {
            if (errorContainer) {
                errorContainer.style.display = 'none';
            }
        }


        // GESTIONE DEL BOTTONE: Click manuale dell'utente
        if (btnToggleFiles && bsCollapse) {
            btnToggleFiles.addEventListener('click', () => {
                // Controlla lo stato attuale dell'accordion (se contiene la classe 'show' è aperto)
                const isOpened = collapseElement.classList.contains('show');

                if (isOpened) {
                    bsCollapse.hide();
                } else {
                    bsCollapse.show();
                    // Quando l'utente lo apre manualmente, aggiorna subito i file
                    refreshCustomerFilesTable(filesContainer, customerToken, customerName);
                }
            });
        }

        function pollBuildStatus() {
            if (buildPollInterval) clearInterval(buildPollInterval);


            buildPollInterval = setInterval(async () => {
                try {
                    const version = versionSelect.value;
                    const res = await fetch('/api/github/build-status/' + customerToken + "/" + version, {
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    });
                    if (res.status != 200) {
                        clearInterval(buildPollInterval);
                        return;
                    }
                    const data = await res.json();

                    if (data.job && data.job != "done") {
                        const value = data.job;
                        btnTrigger.disabled = true;
                        btnTrigger.innerHTML = '<span class="spinner-border spinner-border-sm"></span> In corso...';

                        console.log(value);
                        statusSpan.innerHTML = `<span class="badge bg-warning text-light"><i class="bi bi-gear-wide-connected spin"></i> ${value}</span>`;

                    } else if (data.status === 'queued' || data.status === 'in_progress') {
                        btnTrigger.disabled = true;
                        btnTrigger.innerHTML = '<span class="spinner-border spinner-border-sm"></span> In corso...';
                        if (data.job) {
                            statusSpan.innerHTML = `<span class="badge bg-warning text-light"><i class="bi bi-gear-wide-connected spin"></i> ${data.job}</span>`;
                        } else {
                            statusSpan.innerHTML = '<span class="badge bg-warning text-dark"><i class="bi bi-gear-wide-connected spin"></i> Build in corso...</span>';
                        }
                    } else if (data.status === 'completed') {
                        clearInterval(buildPollInterval);
                        btnTrigger.disabled = false;
                        btnTrigger.innerHTML = '<i class="bi bi-rocket-takeoff-fill"></i> Avvia Build';

                        if (data.conclusion === 'success') {
                            statusSpan.innerHTML = `<i class="bi bi-check2-circle text-success"></i> OK`;
                        } else {
                            statusSpan.innerHTML = '<span class="badge bg-danger"><i class="bi bi-x-circle"></i> Fallita</span>';
                            showError('La build di GitHub è fallita.');
                        }
                    }
                } catch (err) {
                    console.error('Errore polling status:', err);
                    showError('Errore di comunicazione durante il polling dello stato.');
                }
            }, 5000);
        }

        if (btnTrigger) {
            btnTrigger.addEventListener('click', async () => {
                clearError();
                const so = soSelect.value;
                const version = versionSelect.value;
                const tokenExtra = tokenInput.value.trim();

                if (!version || !customerName || !customerToken) {
                    showError('Impossibile avviare la build: dati mancanti.');
                    return;
                }

                btnTrigger.disabled = true;
                btnTrigger.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Avvio...';
                statusSpan.innerHTML = '<span class="badge bg-secondary"><i class="bi bi-hourglass-split"></i> Inizializzazione...</span>';

                const buildPayload = {
                    target_version: version,
                    param_a: customerName,
                    param_b: customerToken,
                    token_extra: tokenExtra,
                    so: so
                };

                try {
                    const res = await fetch('/api/github/trigger-build/' + customerToken, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(buildPayload)
                    });

                    if (res.ok) {
                        pollBuildStatus();
                    } else {
                        const errorData = await res.json().catch(() => ({}));
                        throw new Error(errorData.error || 'Errore durante l\'avvio del workflow');
                    }
                } catch (err) {
                    btnTrigger.disabled = false;
                    btnTrigger.innerHTML = '<i class="bi bi-rocket-takeoff-fill"></i> Avvia Build';
                    statusSpan.innerHTML = '<span class="badge bg-danger">Errore Avvio</span>';
                    showError(err.message);
                }
            });
        }

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
                } else {
                    versionSelect.innerHTML = '<option value="">Nessuna release trovata</option>';
                }
            } catch (err) {
                console.error('Errore recupero releases GitHub:', err);
                showError('Impossibile caricare l\'elenco delle release.');
                versionSelect.innerHTML = '<option value="">Errore caricamento</option>';
            }
        }

        // Funzione per ricaricare la tabella file per un determinato cliente
        async function refreshCustomerFilesTable(container, customerToken, customerName) {

            if (!container) return;

            const tableBody = container.querySelector('.files-table-body');
            if (tableBody) {
                tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-muted py-2">
                    <span class="spinner-border spinner-border-sm me-1"></span> Aggiornamento in corso...
                </td>
            </tr>`;
            }

            try {
                const response = await fetch('/api/github/files-table/' + customerToken);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const files = await response.json();

                if (Array.isArray(files) && files.length > 0) {
                    let htmlRows = '';
                    files.forEach(file => {
                        htmlRows += `
                    <tr>
                        <td><span class="badge bg-primary">${file.version}</span></td>
                        <td class="text-truncate" style="max-width: 180px;" title="${file.fileName}">
                            <i class="bi bi-file-earmark-zip text-secondary me-1"></i>${file.build}
                        </td>
                        <td><span class="badge bg-secondary">${file.so}</span></td>
                        <td class="text-end">
                            <a href="/api/github/download/${customerToken}/${file.version}/${file.build}" class="btn btn-sm btn-outline-success py-0 px-2" download>
                                <i class="bi bi-download"></i> Scarica
                            </a>
                        </td>
                    </tr>`;
                    });
                    tableBody.innerHTML = htmlRows;
                } else {
                    tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted py-2">
                        Nessun file scaricato disponibile.
                    </td>
                </tr>`;
                }
            } catch (err) {
                console.error('Errore durante il refresh della tabella file:', err);
                if (tableBody) {
                    tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-danger py-2">
                        Errore durante il caricamento dei file.
                    </td>
                </tr>`;
                }
            }
        }

        // listener del bottone "Aggiorna Lista" all'interno del pannello
        const accordion = panel.closest('.collapse');
        if (accordion) {
            const refreshBtn = accordion.querySelector('.btn-refresh-files');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    refreshCustomerFilesTable(customerToken, customerName);
                });
            }
        }
        // Avvia il caricamento delle release e il check iniziale di polling per lo specifico cliente
        loadGithubReleases();
        pollBuildStatus({ target_version: versionSelect.value });
    });
});

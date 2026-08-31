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
        button.addEventListener('click', async (event) => {
            const btn = event.currentTarget;
            const token = btn.dataset.token;
            const action = btn.dataset.action;
            const value = btn.dataset.value;

            if (btn.classList.contains('active')) return;

            const btnGroup = btn.closest('.btn-group');
            const siblingButtons = btnGroup.querySelectorAll('.crawler-btn');
            siblingButtons.forEach(b => b.classList.add('disabled'));

            try {
                const response = await fetch('/api/crawler/actions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, action, value })
                });

                if (!response.ok) throw new Error(`Errore risposta server: ${response.status}`);

                updateButtonStyles(siblingButtons, btn, value);
            } catch (error) {
                console.error('Errore nell\'aggiornamento del parametro crawler:', error);
                alert('Impossibile aggiornare lo stato del crawler.');
            } finally {
                siblingButtons.forEach(b => b.classList.remove('disabled'));
            }
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

});
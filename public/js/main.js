document.addEventListener('DOMContentLoaded', () => {

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

            // Se il pulsante è già attivo, interrompi l'esecuzione
            if (btn.classList.contains('active')) {
                return;
            }

            // Disabilita i pulsanti del gruppo durante il caricamento
            const btnGroup = btn.closest('.btn-group');
            const siblingButtons = btnGroup.querySelectorAll('.crawler-btn');
            siblingButtons.forEach(b => b.classList.add('disabled'));

            try {
                const response = await fetch('/api/crawler/actions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        token: token,
                        action: action,
                        value: value
                    })
                });

                if (!response.ok) {
                    throw new Error(`Errore risposta server: ${response.status}`);
                }

                const result = await response.json();

                // Aggiorna visivamente lo stato dei bottoni Bootstrap
                updateButtonStyles(siblingButtons, btn, value);

            } catch (error) {
                console.error('Errore nell\'aggiornamento del parametro crawler:', error);
                alert('Impossibile aggiornare lo stato del crawler. Verificare la connessione.');
            } finally {
                // Riabilita i pulsanti
                siblingButtons.forEach(b => b.classList.remove('disabled'));
            }
        });
    });

    /**
     * Helper per aggiornare le classi visive dei bottoni di stato
     */
    function updateButtonStyles(allButtons, clickedButton, value) {
        allButtons.forEach(b => {
            b.classList.remove('active', 'btn-success', 'btn-secondary', 'btn-info', 'text-white');
            b.classList.add('btn-outline-secondary');
        });

        clickedButton.classList.remove('btn-outline-secondary');
        clickedButton.classList.add('active');

        if (value === 'true') {
            clickedButton.classList.add('btn-success');
        } else if (value === 'false') {
            clickedButton.classList.add('btn-secondary');
        } else if (value === 'once') {
            clickedButton.classList.add('btn-info', 'text-white');
        }
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

            // Feedback visivo sul pulsante di submit
            const originalBtnHTML = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Invio...';

            try {
                const response = await fetch('/api/crawler/actions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        token: token,
                        serial: serial,
                        action: 'queryoids',
                        value: queryoidsValue,
                        ipv4:ipv4
                    })
                });

                if (!response.ok) {
                    throw new Error(`Errore Server: ${response.status}`);
                }

                const result = await response.json();
                
                // Notifica di successo
              
            } catch (error) {
                console.error('Errore durante il salvataggio degli OID:', error);
                alert('Impossibile salvare il campo Query OIDs.');
            } finally {
                // Ripristina lo stato iniziale del pulsante
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHTML;
            }
        });
    });

});
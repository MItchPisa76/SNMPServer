#!/bin/bash

# Array con i nomi delle 4 VM da creare
VMS=("snmp-node-6" "snmp-node-2" "snmp-node-3" "snmp-node-4")
CLOUD_INIT_FILE="snmp-config.yaml"

echo "=== Avvio del deployment di 4 VM con Server SNMP ==="

multipass set local.driver=virtualbox

for VM_NAME in "${VMS[@]}"; do
    echo "------------------------------------------------"
    echo "Creazione e configurazione di: $VM_NAME..."
    
    # Lancia la VM applicando la configurazione SNMP al volo
    multipass launch --name "$VM_NAME" --cloud-init "$CLOUD_INIT_FILE"
    
    # Recupera l'IP univoco assegnato alla VM
    VM_IP=$(multipass info "$VM_NAME" | grep "IPv4" | awk '{print $2}')
    
    echo "[OK] $VM_NAME è attiva con IP: $VM_IP"
done

echo "------------------------------------------------"
echo "=== Elenco finale delle Macchine Virtuali attive ==="
multipass list

# MFPServer
## Primo Passo
 nvm install 24.0
 
 nvm use 24.0
 
## Poi
 npx prisma generate
 
 npx prisma db pull
# creare chiave SSH (Linux)

LOCAL_IP=$(hostname -I | awk '{print $1}')

openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes -subj "/CN=$LOCAL_IP" -addext "subjectAltName=IP:$LOCAL_IP,DNS:localhost"



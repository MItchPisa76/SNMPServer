# MFPServer
## Primo Passo
 nvm install 24.0
 nvm use 24.0
## Poi
 npx prisma generate
 npx prisma db pull

openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes -subj '/CN=192.168.2.210

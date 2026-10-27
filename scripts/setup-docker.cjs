const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const destino = path.join(root, '.env');
const exemplo = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
try {
  fs.writeFileSync(destino, exemplo
    .replace(/^MONGO_ROOT_PASSWORD=$/m, `MONGO_ROOT_PASSWORD=${crypto.randomBytes(32).toString('hex')}`)
    .replace(/^JWT_SECRET=$/m, `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`),
  { flag: 'wx', mode: 0o600 });
  console.log('.env criado com segredos aleatórios. Inicie com docker compose up --build -d --wait.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env existente preservado. Confira as variáveis exigidas em .env.example.');
}

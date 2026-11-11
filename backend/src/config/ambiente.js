const path = require('path');
const dotenv = require('dotenv');
const { lerConfiancaProxy } = require('../utils/ipCliente');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const jwtSecret = String(process.env.JWT_SECRET || '').trim();
if (!jwtSecret) {
  throw new Error(
    'JWT_SECRET não configurado. Copie .env.example para .env e defina uma chave segura.'
  );
}

module.exports = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/workly',

  jwtSecret,

  frontendUrl: process.env.FRONTEND_URL || '*',

  trustProxy: lerConfiancaProxy(process.env.TRUST_PROXY),

  cookieSeguro: ['true', 'false'].includes(String(process.env.COOKIE_SECURE).toLowerCase())
    ? String(process.env.COOKIE_SECURE).toLowerCase() === 'true'
    : null,

  autoSeed: String(process.env.AUTO_SEED || 'false').toLowerCase() === 'true'
};

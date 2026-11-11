const path = require('path');
const dotenv = require('dotenv');
const { lerConfiancaProxy } = require('../utils/ipCliente');

// carrega o .env local. O segredo JWT é obrigatório para impedir tokens previsíveis.
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

  // com * fica tranquilo testar com live server. em produção, coloque o domínio do frontend.
  frontendUrl: process.env.FRONTEND_URL || '*',

  // proxies confiáveis para X-Forwarded-For (veja utils/ipCliente.js). Sem a variável, nenhum.
  trustProxy: lerConfiancaProxy(process.env.TRUST_PROXY),

  // controla se o banco vai receber os dados demo automaticamente ao iniciar o servidor.
  autoSeed: String(process.env.AUTO_SEED || 'false').toLowerCase() === 'true'
};

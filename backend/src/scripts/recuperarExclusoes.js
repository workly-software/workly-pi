const mongoose = require('mongoose');
const connectDatabase = require('../config/db');
const { recuperarExclusoesPendentes } = require('../services/contaService');

(async () => {
  try {
    await connectDatabase();
    const { exclusoesConcluidas, contratosCancelados } = await recuperarExclusoesPendentes();
    console.log(`Exclusões concluídas: ${exclusoesConcluidas}. Contratos ativos cancelados: ${contratosCancelados}.`);
  } catch (error) {
    console.error('Erro ao recuperar exclusões:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();

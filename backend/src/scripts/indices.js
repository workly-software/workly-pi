// instala os índices de contrato e avaliação sem subir a API (útil em deploy): node src/scripts/indices.js
const mongoose = require('mongoose');
const connectDatabase = require('../config/db');
const { garantirIndicesContrato, relatarProblemaIndice } = require('../models/Contrato');
const { garantirIndicesAvaliacao } = require('../models/Avaliacao');

(async () => {
  try {
    await connectDatabase();
    const resultado = await garantirIndicesContrato();
    if (resultado.instalado) {
      console.log('Índices de contrato instalados e verificados.');
    } else {
      relatarProblemaIndice(resultado);
      process.exitCode = 1;
    }
    if (await garantirIndicesAvaliacao()) {
      console.log('Índices de avaliação instalados e verificados.');
    } else {
      console.error('Índice único de avaliações não instalado.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Erro ao instalar índices:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();

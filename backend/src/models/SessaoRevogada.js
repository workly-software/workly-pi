const mongoose = require('mongoose');

// sessões encerradas pelo logout antes de expirar. Cada registro some sozinho quando o token
// expiraria de qualquer forma (índice TTL), então a coleção não cresce sem limite.
const sessaoRevogadaSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expiraEm: { type: Date, required: true }
});

sessaoRevogadaSchema.index({ expiraEm: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SessaoRevogada', sessaoRevogadaSchema, 'sessoes_revogadas');

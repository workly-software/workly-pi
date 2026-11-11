const mongoose = require('mongoose');

const sessaoRevogadaSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expiraEm: { type: Date, required: true }
});

sessaoRevogadaSchema.index({ expiraEm: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SessaoRevogada', sessaoRevogadaSchema, 'sessoes_revogadas');

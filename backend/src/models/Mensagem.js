const mongoose = require('mongoose');

const mensagemSchema = new mongoose.Schema(
  {
    contrato: { type: mongoose.Schema.Types.ObjectId, ref: 'Contrato', required: true },
    remetente: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    texto: { type: String, required: true, trim: true, maxlength: 2000 },
    lida: { type: Boolean, default: false }
  },
  { timestamps: true }
);

mensagemSchema.index({ contrato: 1, createdAt: 1 });
mensagemSchema.index({ contrato: 1, remetente: 1, lida: 1 });
mensagemSchema.index({ lida: 1, remetente: 1, contrato: 1 });

module.exports = mongoose.model('Mensagem', mensagemSchema, 'mensagens');

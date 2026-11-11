const mongoose = require('mongoose');

const servicoSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    descricao: { type: String, required: true, trim: true },
    preco: { type: Number, default: null, min: 0.01 },
    precoNegociavel: { type: Boolean, default: false },
    valorCombinar: { type: Boolean, default: false },
    extra: { type: String, default: '', trim: true },
    imagemServico: { type: String, default: '/uploads/servicos/servico_padrao.svg' },
    categoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Categoria', required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    removido: { type: Boolean, default: false },
    removidoEm: { type: Date, default: null },
    removendoDesde: { type: Date, default: null }
  },
  { timestamps: true }
);

servicoSchema.index({ categoria: 1, createdAt: -1 });
servicoSchema.index({ freelancer: 1, createdAt: -1 });
servicoSchema.index({ preco: 1, createdAt: -1 });
servicoSchema.index({ nome: 'text', descricao: 'text', extra: 'text' });

module.exports = mongoose.model('Servico', servicoSchema);

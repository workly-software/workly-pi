const mongoose = require('mongoose');

const TIPOS_VALIDOS = [
  'contrato_novo',
  'proposta_nova',
  'proposta_aceita',
  'proposta_recusada',
  'proposta_valor',
  'valor_aprovado',
  'ajuste_solicitado',
  'trabalho_iniciado',
  'entrega_realizada',
  'entrega_confirmada',
  'contrato_cancelado',
  'avaliacao_recebida',
  'mensagem_nova'
];

const notificacaoSchema = new mongoose.Schema(
  {
    destinatario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    tipo: { type: String, enum: TIPOS_VALIDOS, required: true },
    titulo: { type: String, required: true, trim: true },
    mensagem: { type: String, required: true, trim: true },
    lida: { type: Boolean, default: false },
    referenciaId: { type: mongoose.Schema.Types.ObjectId, default: null },
    tipoReferencia: {
      type: String,
      enum: ['contrato', 'avaliacao', 'mensagem', null],
      default: null
    }
  },
  { timestamps: true }
);

notificacaoSchema.index({ destinatario: 1, lida: 1, createdAt: -1 });
notificacaoSchema.index({ destinatario: 1, tipo: 1, referenciaId: 1, lida: 1 });

module.exports = mongoose.model('Notificacao', notificacaoSchema, 'notificacoes');

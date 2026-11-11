const mongoose = require('mongoose');

const avaliacaoSchema = new mongoose.Schema(
  {
    autor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    servico: { type: mongoose.Schema.Types.ObjectId, ref: 'Servico', required: true },
    contrato: { type: mongoose.Schema.Types.ObjectId, ref: 'Contrato', required: true },
    notaServico: { type: Number, min: 1, max: 5, required: true },
    notaFreelancer: { type: Number, min: 1, max: 5, required: true },
    comentario: { type: String, default: '', trim: true },
    unicaPorServico: { type: Boolean }
  },
  { timestamps: true }
);

const INDICE_AVALIACAO_UNICA = 'avaliacao_unica_por_cliente_servico';

avaliacaoSchema.index({ autor: 1, contrato: 1 }, { unique: true });
avaliacaoSchema.index(
  { autor: 1, servico: 1 },
  { unique: true, name: INDICE_AVALIACAO_UNICA, partialFilterExpression: { unicaPorServico: true } }
);
avaliacaoSchema.index({ servico: 1 });
avaliacaoSchema.index({ freelancer: 1, createdAt: -1 });

const Avaliacao = mongoose.model('Avaliacao', avaliacaoSchema, 'avaliacoes');

let indiceVerificado = false;

async function garantirIndicesAvaliacao() {
  try {
    await Avaliacao.createIndexes();
    const indice = (await Avaliacao.collection.indexes()).find((item) => item.name === INDICE_AVALIACAO_UNICA);
    indiceVerificado = Boolean(
      indice &&
        indice.unique === true &&
        JSON.stringify(indice.key) === JSON.stringify({ autor: 1, servico: 1 }) &&
        JSON.stringify(indice.partialFilterExpression) === JSON.stringify({ unicaPorServico: true })
    );
  } catch (error) {
    console.error('Falha ao instalar o índice único de avaliações:', error?.message || error);
    indiceVerificado = false;
  }
  return indiceVerificado;
}

async function protecaoAvaliacoesDisponivel() {
  return indiceVerificado || garantirIndicesAvaliacao();
}

module.exports = Avaliacao;
module.exports.INDICE_AVALIACAO_UNICA = INDICE_AVALIACAO_UNICA;
module.exports.garantirIndicesAvaliacao = garantirIndicesAvaliacao;
module.exports.protecaoAvaliacoesDisponivel = protecaoAvaliacoesDisponivel;

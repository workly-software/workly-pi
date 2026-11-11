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
    // gravado em toda avaliação nova: coloca o documento no índice único por cliente e serviço.
    // avaliações antigas não têm o campo, ficam fora do índice e não são alteradas.
    unicaPorServico: { type: Boolean }
  },
  { timestamps: true }
);

const INDICE_AVALIACAO_UNICA = 'avaliacao_unica_por_cliente_servico';

avaliacaoSchema.index({ autor: 1, contrato: 1 }, { unique: true });
// um cliente avalia cada serviço uma vez, mesmo contratando o serviço de novo. O banco garante a regra
// contra pedidos simultâneos; o filtro parcial deixa de fora duplicações antigas, que não são apagadas.
avaliacaoSchema.index(
  { autor: 1, servico: 1 },
  { unique: true, name: INDICE_AVALIACAO_UNICA, partialFilterExpression: { unicaPorServico: true } }
);
avaliacaoSchema.index({ servico: 1 });
avaliacaoSchema.index({ freelancer: 1, createdAt: -1 });

// terceiro parâmetro força o mongodb a usar exatamente "avaliacoes".
// sem isso, o mongoose pluraliza "avaliacao" como "avaliacaos".
const Avaliacao = mongoose.model('Avaliacao', avaliacaoSchema, 'avaliacoes');

let indiceVerificado = false;

// instala os índices e confere o único por cliente e serviço. Sem ele não há garantia contra pedidos
// simultâneos, então novas avaliações ficam bloqueadas até a instalação dar certo.
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

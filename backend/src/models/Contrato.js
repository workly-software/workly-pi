const mongoose = require('mongoose');

const STATUS_ATIVOS = ['pendente', 'proposta_pendente', 'proposta_aceita', 'em_andamento', 'entregue'];
const INDICE_CONTRATO_ATIVO = 'contrato_ativo_unico_por_cliente_servico';

const TIPOS_EVENTO = ['proposta', 'contraproposta', 'aceite', 'entrega', 'ajuste_solicitado'];
const eventoSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: TIPOS_EVENTO, required: true },
    autor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    papel: { type: String, enum: ['cliente', 'freelancer'], required: true },
    valor: { type: Number, default: null },
    justificativa: { type: String, default: '', maxlength: 1000 },
    data: { type: Date, default: Date.now }
  },
  { _id: false }
);

const contratoSchema = new mongoose.Schema(
  {
    cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    servico: { type: mongoose.Schema.Types.ObjectId, ref: 'Servico', required: true },
    preco: { type: Number, default: null, min: 0.01 },
    precoProposto: { type: Number, default: null, min: 0.01 },
    mensagem: { type: String, default: '', trim: true },
    detalhesPedido: { type: String, default: '', trim: true },
    prazoDesejado: { type: String, default: '', trim: true },
    referencias: { type: String, default: '', trim: true },
    tipoContratacao: { type: String, enum: ['fixo', 'negociavel', 'combinar'], default: 'fixo' },
    negociacao: {
      estado: { type: String, enum: ['aguardando_freelancer', 'aguardando_cliente', 'fechado'], default: undefined }
    },
    historico: { type: [eventoSchema], default: undefined },
    status: {
      type: String,
      enum: [
        'pendente',
        'proposta_pendente',
        'proposta_aceita',
        'em_andamento',
        'entregue',
        'concluido',
        'cancelado',
        'encerrado'
      ],
      default: 'pendente'
    }
  },
  { timestamps: true }
);

contratoSchema.index({ cliente: 1, servico: 1, status: 1 });
contratoSchema.index(
  { cliente: 1, servico: 1 },
  {
    unique: true,
    name: INDICE_CONTRATO_ATIVO,
    partialFilterExpression: { status: { $in: STATUS_ATIVOS } }
  }
);
contratoSchema.set('autoIndex', false);
contratoSchema.index({ freelancer: 1, status: 1, createdAt: -1 });
contratoSchema.index({ freelancer: 1, createdAt: -1 });
contratoSchema.index({ cliente: 1, createdAt: -1 });
contratoSchema.index({ servico: 1, status: 1, createdAt: -1 });

const Contrato = mongoose.model('Contrato', contratoSchema);

async function encontrarContratosAtivosDuplicados() {
  return Contrato.aggregate([
    { $match: { status: { $in: STATUS_ATIVOS } } },
    { $group: { _id: { cliente: '$cliente', servico: '$servico' }, contratos: { $push: '$_id' } } },
    { $match: { 'contratos.1': { $exists: true } } }
  ]);
}

async function verificarIndiceContratoAtivo() {
  let indices;
  try {
    indices = await Contrato.collection.indexes();
  } catch (error) {
    if (error?.codeName === 'NamespaceNotFound') return false;
    throw error;
  }
  const indice = indices.find((item) => item.name === INDICE_CONTRATO_ATIVO);
  if (!indice || indice.unique !== true) return false;
  const chaves = Object.entries(indice.key || {});
  if (chaves.length !== 2 || indice.key.cliente !== 1 || indice.key.servico !== 1) return false;
  const filtro = indice.partialFilterExpression || {};
  const status = filtro.status?.$in;
  return (
    Object.keys(filtro).length === 1 &&
    Object.keys(filtro.status || {}).length === 1 &&
    Array.isArray(status) &&
    status.length === STATUS_ATIVOS.length &&
    STATUS_ATIVOS.every((item) => status.includes(item))
  );
}

const protecao = { disponivel: false, motivo: 'nao_verificado', verificadoEm: 0, emAndamento: null };
const intervalos = { novaTentativaMs: 60 * 1000, revalidacaoMs: 5 * 60 * 1000 };

async function garantirIndicesContrato() {
  let resultado;
  try {
    const duplicados = await encontrarContratosAtivosDuplicados();
    if (duplicados.length) {
      resultado = { instalado: false, motivo: 'duplicados', duplicados };
    } else {
      await Contrato.createIndexes();
      resultado = (await verificarIndiceContratoAtivo())
        ? { instalado: true, motivo: null, duplicados: [] }
        : { instalado: false, motivo: 'definicao_incorreta', duplicados: [] };
    }
  } catch (error) {
    resultado = { instalado: false, motivo: 'falha_instalacao', duplicados: [], erro: error };
  }
  protecao.disponivel = resultado.instalado;
  protecao.motivo = resultado.motivo;
  protecao.verificadoEm = Date.now();
  return resultado;
}

function relatarProblemaIndice(resultado, registrar = console.error) {
  if (!resultado || resultado.instalado) return;
  registrar(
    `ATENÇÃO: proteção contra contratos duplicados indisponível (${resultado.motivo}). ` +
      'Novos pedidos e propostas ficarão bloqueados. Corrija os conflitos e execute node src/scripts/indices.js.'
  );
  for (const item of resultado.duplicados || []) {
    registrar(`  cliente ${item._id.cliente} / serviço ${item._id.servico}: ${item.contratos.join(', ')}`);
  }
  if (resultado.erro) {
    registrar(`  erro: ${resultado.erro.codeName || resultado.erro.name}: ${resultado.erro.message}`);
  }
}

async function protecaoContratosDisponivel() {
  if (protecao.emAndamento) return protecao.emAndamento;
  const decorrido = Date.now() - protecao.verificadoEm;
  if (protecao.disponivel && decorrido < intervalos.revalidacaoMs) return true;
  if (!protecao.disponivel && decorrido < intervalos.novaTentativaMs) return false;

  protecao.emAndamento = (async () => {
    try {
      if (protecao.disponivel) {
        let valido = false;
        try {
          valido = await verificarIndiceContratoAtivo();
        } catch (error) {
          relatarProblemaIndice({ instalado: false, motivo: 'falha_verificacao', erro: error });
        }
        protecao.verificadoEm = Date.now();
        if (valido) return true;
        protecao.disponivel = false;
        protecao.motivo = 'indice_ausente';
      }
      const resultado = await garantirIndicesContrato();
      relatarProblemaIndice(resultado);
      return resultado.instalado;
    } finally {
      protecao.emAndamento = null;
    }
  })();
  return protecao.emAndamento;
}

function estadoProtecaoContratos() {
  return { disponivel: protecao.disponivel, motivo: protecao.motivo };
}

function configurarProtecaoParaTeste({ novaTentativaMs, revalidacaoMs, expirar } = {}) {
  if (novaTentativaMs !== undefined) intervalos.novaTentativaMs = novaTentativaMs;
  if (revalidacaoMs !== undefined) intervalos.revalidacaoMs = revalidacaoMs;
  if (expirar) protecao.verificadoEm = 0;
}

module.exports = Contrato;
module.exports.STATUS_ATIVOS = STATUS_ATIVOS;
module.exports.TIPOS_EVENTO = TIPOS_EVENTO;
module.exports.INDICE_CONTRATO_ATIVO = INDICE_CONTRATO_ATIVO;
module.exports.encontrarContratosAtivosDuplicados = encontrarContratosAtivosDuplicados;
module.exports.verificarIndiceContratoAtivo = verificarIndiceContratoAtivo;
module.exports.garantirIndicesContrato = garantirIndicesContrato;
module.exports.relatarProblemaIndice = relatarProblemaIndice;
module.exports.protecaoContratosDisponivel = protecaoContratosDisponivel;
module.exports.estadoProtecaoContratos = estadoProtecaoContratos;
module.exports.configurarProtecaoParaTeste = configurarProtecaoParaTeste;

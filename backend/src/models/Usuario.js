const mongoose = require('mongoose');
const { normalizarCpf, validarCpf } = require('../utils/cpfUtils');

function ocultarCamposInternos(_doc, ret) {
  delete ret.redefinicaoSenha;
  return ret;
}

const usuarioSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    senha: { type: String, required: true },
    cpf: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      set: normalizarCpf,
      validate: {
        validator: function (valor) {
          const documento = typeof this?.isModified === 'function' ? this : null;
          if (documento && !documento.isNew && !documento.isModified('cpf')) return true;
          return validarCpf(valor);
        },
        message: 'CPF inválido.'
      }
    },
    telefone: { type: String, default: '', trim: true },
    tipoConta: { type: String, enum: ['Freelancer', 'Contratante'], required: true },
    areaAtuacao: { type: String, default: '', trim: true },
    fotoPerfil: { type: String, default: '/uploads/perfis/perfil_padrao.svg' },
    tituloProfissional: { type: String, default: '', trim: true },
    bio: { type: String, default: '', trim: true },
    localizacao: { type: String, default: '', trim: true },
    site: { type: String, default: '', trim: true },
    linkedin: { type: String, default: '', trim: true },
    github: { type: String, default: '', trim: true },
    instagram: { type: String, default: '', trim: true },
    portfolioTitulo: { type: String, default: '', trim: true },
    portfolioDescricao: { type: String, default: '', trim: true },
    portfolioUrl: { type: String, default: '', trim: true },
    disponibilidade: { type: String, default: '', trim: true },
    precoHora: { type: String, default: '', trim: true },
    metodoPagamento: { type: String, default: '', trim: true },
    chavePix: { type: String, default: '', trim: true },
    banco: { type: String, default: '', trim: true },
    notificacoesEmail: { type: Boolean, default: true },
    notificacoesPropostas: { type: Boolean, default: true },
    notificacoesMarketing: { type: Boolean, default: false },
    versaoSessao: { type: Number, default: 0, min: 0 },
    removido: { type: Boolean, default: false },
    removidoEm: { type: Date, default: null },
    removendoDesde: { type: Date, default: null },
    exclusaoConfirmadaEm: { type: Date, default: null },
    avaliacaoMedia: { type: Number, default: 0 },
    totalAvaliacoes: { type: Number, default: 0 },
    redefinicaoSenha: {
      hash: { type: String, default: undefined, select: false },
      expiraEm: { type: Date, default: undefined, select: false }
    }
  },
  {
    timestamps: true,
    toJSON: { transform: ocultarCamposInternos },
    toObject: { transform: ocultarCamposInternos }
  }
);

usuarioSchema.index({ 'redefinicaoSenha.hash': 1 }, { sparse: true });

usuarioSchema.index({ tipoConta: 1, localizacao: 1 });
usuarioSchema.index({ tipoConta: 1, disponibilidade: 1 });
usuarioSchema.index({ avaliacaoMedia: -1, totalAvaliacoes: -1 });

const Usuario = mongoose.model('Usuario', usuarioSchema);

const protecao = { disponivel: false, verificadoEm: 0, emAndamento: null };
const intervalos = { novaTentativaMs: 30 * 1000 };

async function garantirIndicesUsuario() {
  try {
    await Usuario.createIndexes();
    const unicos = (await Usuario.collection.indexes()).filter((indice) => indice.unique && !indice.partialFilterExpression);
    const temUnico = (campo) =>
      unicos.some((indice) => Object.keys(indice.key).length === 1 && indice.key[campo] === 1);
    protecao.disponivel = temUnico('email') && temUnico('cpf');
    if (!protecao.disponivel) console.error('ATENÇÃO: índices únicos de e-mail e CPF com definição inesperada.');
  } catch (error) {
    console.error(
      'ATENÇÃO: índices únicos de e-mail e CPF não instalados; novos cadastros ficarão bloqueados.',
      error?.message || error
    );
    protecao.disponivel = false;
  }
  protecao.verificadoEm = Date.now();
  return protecao.disponivel;
}

async function protecaoCadastroDisponivel() {
  if (protecao.disponivel) return true;
  if (protecao.emAndamento) return protecao.emAndamento;
  if (protecao.verificadoEm && Date.now() - protecao.verificadoEm < intervalos.novaTentativaMs) return false;
  protecao.emAndamento = garantirIndicesUsuario().finally(() => {
    protecao.emAndamento = null;
  });
  return protecao.emAndamento;
}

function configurarProtecaoCadastroParaTeste({ novaTentativaMs, expirar } = {}) {
  if (novaTentativaMs !== undefined) intervalos.novaTentativaMs = novaTentativaMs;
  if (expirar) Object.assign(protecao, { disponivel: false, verificadoEm: 0 });
}

module.exports = Usuario;
module.exports.garantirIndicesUsuario = garantirIndicesUsuario;
module.exports.protecaoCadastroDisponivel = protecaoCadastroDisponivel;
module.exports.configurarProtecaoCadastroParaTeste = configurarProtecaoCadastroParaTeste;

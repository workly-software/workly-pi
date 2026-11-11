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
    // CPF armazenado apenas com dígitos, validado no model e único no banco.
    cpf: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      set: normalizarCpf,
      validate: {
        // CPF novo ou alterado precisa ser válido. Contas antigas cadastradas antes da checagem dos
        // dígitos verificadores continuam salvando outros campos sem quebrar.
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
    // incrementada ao trocar a senha: tokens emitidos com versão anterior deixam de valer.
    // usuários antigos sem o campo contam como versão 0, assim os tokens atuais continuam válidos.
    versaoSessao: { type: Number, default: 0, min: 0 },
    // exclusão de conta é uma anonimização: o registro fica para o histórico da outra parte.
    // documentos antigos sem estes campos contam como contas ativas.
    removido: { type: Boolean, default: false },
    removidoEm: { type: Date, default: null },
    // fase 1 da exclusão: verificação de contratos ativos (expira se o processo cair).
    removendoDesde: { type: Date, default: null },
    // fase 2: exclusão confirmada, sem volta. A conta fica encerrada até a anonimização terminar.
    exclusaoConfirmadaEm: { type: Date, default: null },
    avaliacaoMedia: { type: Number, default: 0 },
    totalAvaliacoes: { type: Number, default: 0 },
    // recuperação de senha: só o hash SHA-256 do token fica salvo, com validade curta e uso único.
    // uma nova solicitação substitui o token anterior; usar o token remove o campo.
    // nunca sai em consultas comuns (select: false) nem na serialização (transform abaixo);
    // o fluxo de redefinição filtra por ele sem precisar lê-lo.
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

module.exports = mongoose.model('Usuario', usuarioSchema);

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');
const Servico = require('../models/Servico');
const Contrato = require('../models/Contrato');
const Favorito = require('../models/Favorito');
const Mensagem = require('../models/Mensagem');
const Avaliacao = require('../models/Avaliacao');
const Notificacao = require('../models/Notificacao');
const { removerArquivoSeExistir } = require('../utils/arquivoUtils');
const { TEMPLATES } = require('../utils/notificacaoUtils');

const FOTO_PADRAO = '/uploads/perfis/perfil_padrao.svg';
const NOME_REMOVIDO = 'Usuário removido';
const MARCA_EXPIRADA_MS = 5 * 60 * 1000;

function camposAnonimizados(id) {
  return {
    nome: NOME_REMOVIDO,
    email: `removido+${id}@conta-removida.invalid`,
    cpf: `removido:${id}`,
    senha: `!removido:${crypto.randomBytes(16).toString('hex')}`,
    telefone: '',
    areaAtuacao: '',
    fotoPerfil: FOTO_PADRAO,
    tituloProfissional: '',
    bio: '',
    localizacao: '',
    site: '',
    linkedin: '',
    github: '',
    instagram: '',
    portfolioTitulo: '',
    portfolioDescricao: '',
    portfolioUrl: '',
    disponibilidade: '',
    precoHora: '',
    metodoPagamento: '',
    chavePix: '',
    banco: '',
    notificacoesEmail: false,
    notificacoesPropostas: false,
    notificacoesMarketing: false,
    removido: true,
    removidoEm: new Date(),
    removendoDesde: null
  };
}

function contaEncerrada(usuario) {
  return Boolean(usuario?.removido || usuario?.exclusaoConfirmadaEm);
}

async function anonimizarNotificacoes(usuarioId) {
  const [mensagens, avaliacoes] = await Promise.all([
    Mensagem.find({ remetente: usuarioId }).select('_id').lean(),
    Avaliacao.find({ autor: usuarioId }).select('_id notaFreelancer').lean()
  ]);
  if (mensagens.length) {
    await Notificacao.updateMany(
      { tipo: 'mensagem_nova', tipoReferencia: 'mensagem', referenciaId: { $in: mensagens.map((m) => m._id) } },
      { $set: { titulo: TEMPLATES.mensagem_nova(NOME_REMOVIDO, '').titulo } }
    );
  }
  if (avaliacoes.length) {
    await Notificacao.bulkWrite(
      avaliacoes.map((avaliacao) => ({
        updateMany: {
          filter: { tipo: 'avaliacao_recebida', tipoReferencia: 'avaliacao', referenciaId: avaliacao._id },
          update: { $set: TEMPLATES.avaliacao_recebida(NOME_REMOVIDO, Number(avaliacao.notaFreelancer)) }
        }
      }))
    );
  }
  await Notificacao.deleteMany({ destinatario: usuarioId });
}

async function cancelarContratosAtivosDe(ids) {
  if (!ids.length) return 0;
  const resultado = await Contrato.updateMany(
    { $or: [{ cliente: { $in: ids } }, { freelancer: { $in: ids } }], status: { $in: Contrato.STATUS_ATIVOS } },
    { $set: { status: 'cancelado' } }
  );
  return resultado.modifiedCount || 0;
}

async function concluirExclusao(usuarioId) {
  const usuario = await Usuario.findById(usuarioId).select('removido exclusaoConfirmadaEm fotoPerfil').lean();
  if (!usuario || !contaEncerrada(usuario)) return false;

  await cancelarContratosAtivosDe([usuario._id]);
  const servicos = await Servico.find({ freelancer: usuario._id, removido: { $ne: true } }).select('_id').lean();
  const servicoIds = servicos.map((servico) => servico._id);
  if (servicoIds.length) {
    await Servico.updateMany({ _id: { $in: servicoIds } }, { $set: { removido: true, removidoEm: new Date() } });
  }
  const todosServicos = await Servico.find({ freelancer: usuario._id }).select('_id').lean();
  await Favorito.deleteMany({
    $or: [{ usuario: usuario._id }, { servico: { $in: todosServicos.map((servico) => servico._id) } }]
  });
  await anonimizarNotificacoes(usuario._id);
  if (usuario.removido) return true;

  const foto = usuario.fotoPerfil;
  if (foto && foto.startsWith('/uploads/perfis/perfil_') && foto !== FOTO_PADRAO) {
    try {
      removerArquivoSeExistir(foto);
    } catch (error) {
      console.error('Falha ao remover foto de conta excluída:', error?.message || error);
    }
  }

  await Usuario.collection.updateOne(
    { _id: usuario._id, removido: { $ne: true } },
    { $set: camposAnonimizados(String(usuario._id)) }
  );
  await cancelarContratosAtivosDe([usuario._id]);
  return true;
}

async function excluirConta(usuarioId, senhaAtual) {
  if (typeof senhaAtual !== 'string' || !senhaAtual) {
    return { status: 400, mensagem: 'Informe sua senha atual para excluir a conta.' };
  }
  const usuario = await Usuario.findById(usuarioId).select('senha removido exclusaoConfirmadaEm');
  if (!usuario || contaEncerrada(usuario)) return { status: 404, mensagem: 'Usuário não encontrado.' };

  let senhaCorreta = false;
  try {
    senhaCorreta = await bcrypt.compare(senhaAtual, usuario.senha);
  } catch {
    senhaCorreta = false;
  }
  if (!senhaCorreta) return { status: 403, mensagem: 'Senha atual incorreta.' };

  const marca = new Date();
  const marcado = await Usuario.findOneAndUpdate(
    {
      _id: usuario._id,
      removido: { $ne: true },
      exclusaoConfirmadaEm: null,
      $or: [{ removendoDesde: null }, { removendoDesde: { $lt: new Date(Date.now() - MARCA_EXPIRADA_MS) } }]
    },
    { $set: { removendoDesde: marca } }
  );
  if (!marcado) return { status: 409, mensagem: 'A exclusão desta conta já está em andamento.' };
  const liberarMarca = () =>
    Usuario.updateOne({ _id: usuario._id, removendoDesde: marca }, { $set: { removendoDesde: null } });

  let confirmado;
  try {
    const ativo = await Contrato.exists({
      $or: [{ cliente: usuario._id }, { freelancer: usuario._id }],
      status: { $in: Contrato.STATUS_ATIVOS }
    });
    if (ativo) {
      await liberarMarca();
      return {
        status: 409,
        mensagem:
          'Você possui contratos em andamento. Conclua ou cancele esses contratos antes de excluir a conta.'
      };
    }
    confirmado = await Usuario.findOneAndUpdate(
      { _id: usuario._id, removendoDesde: marca, exclusaoConfirmadaEm: null },
      { $set: { exclusaoConfirmadaEm: new Date() }, $inc: { versaoSessao: 1 } }
    );
  } catch (error) {
    await liberarMarca().catch(() => {});
    throw error;
  }
  if (!confirmado) return { status: 409, mensagem: 'A exclusão desta conta já está em andamento.' };

  await concluirExclusao(usuario._id);
  return { ok: true };
}

async function recuperarExclusoesPendentes() {
  const pendentes = await Usuario.find({ exclusaoConfirmadaEm: { $ne: null }, removido: { $ne: true } })
    .select('_id')
    .lean();
  for (const { _id } of pendentes) await concluirExclusao(_id);
  const encerradas = await Usuario.find({ $or: [{ removido: true }, { exclusaoConfirmadaEm: { $ne: null } }] })
    .select('_id')
    .lean();
  let contratosCancelados = await cancelarContratosAtivosDe(encerradas.map((usuario) => usuario._id));
  const jaConcluidas = new Set(pendentes.map(({ _id }) => String(_id)));
  for (const { _id } of encerradas) if (!jaConcluidas.has(String(_id))) await concluirExclusao(_id);
  contratosCancelados += await cancelarContratosAtivosDe(encerradas.map((usuario) => usuario._id));
  const retirados = await Servico.find({ removido: true }).select('_id').lean();
  const canceladosDeRetirados = retirados.length ? await Contrato.updateMany(
    { servico: { $in: retirados.map(({ _id }) => _id) }, status: { $in: Contrato.STATUS_ATIVOS } },
    { $set: { status: 'cancelado' } }
  ) : null;
  return { exclusoesConcluidas: pendentes.length, contratosCancelados: contratosCancelados + (canceladosDeRetirados?.modifiedCount || 0) };
}

async function contaPodeContratar(usuarioId) {
  const usuario = await Usuario.findById(usuarioId)
    .select('removido exclusaoConfirmadaEm removendoDesde')
    .lean();
  if (!usuario || contaEncerrada(usuario)) return false;
  const emVerificacao =
    usuario.removendoDesde && Date.now() - new Date(usuario.removendoDesde).getTime() < MARCA_EXPIRADA_MS;
  return !emVerificacao;
}

module.exports = {
  excluirConta,
  concluirExclusao,
  recuperarExclusoesPendentes,
  anonimizarNotificacoes,
  contaPodeContratar,
  contaEncerrada,
  FOTO_PADRAO,
  MARCA_EXPIRADA_MS,
  NOME_REMOVIDO
};

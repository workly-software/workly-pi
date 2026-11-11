const Notificacao = require('../models/Notificacao');
const Mensagem = require('../models/Mensagem');
const Contrato = require('../models/Contrato');
const { sucesso, erro } = require('../utils/apiResponse');
const { idMongoValido } = require('../utils/requisicaoUtils');

function usuarioId(req) {
  return req.user.id_usuario || req.user.idUsuario;
}

async function contratosDoUsuario(userId) {
  const contratos = await Contrato.find({
    $or: [{ cliente: userId }, { freelancer: userId }]
  })
    .select('_id')
    .lean();

  return contratos.map((item) => item._id);
}

function normalizarContexto(value = '') {
  const contexto = String(value || '')
    .trim()
    .toLowerCase();
  if (['contrato', 'contratos'].includes(contexto)) return 'contratos';
  if (['mensagem', 'mensagens', 'chat'].includes(contexto)) return 'mensagens';
  return '';
}

function deveExcluirNotificacoesDeMensagem(req) {
  const valor = req.query.excluirMensagens ?? req.query.excludeMessages ?? req.query.semMensagens;
  return ['true', '1', 'sim', 'yes'].includes(
    String(valor || '')
      .trim()
      .toLowerCase()
  );
}

exports.listar = async (req, res) => {
  try {
    const userId = usuarioId(req);
    const filtro = { destinatario: userId };

    if (req.query.lida === 'false') filtro.lida = false;
    if (req.query.lida === 'true') filtro.lida = true;

    if (deveExcluirNotificacoesDeMensagem(req)) {
      filtro.tipo = { $ne: 'mensagem_nova' };
    }

    const pagina = Math.max(Number(req.query.page || 1), 1);
    const limite = Math.min(Number(req.query.limit || 20), 50);

    const [notificacoes, total] = await Promise.all([
      Notificacao.find(filtro)
        .sort({ createdAt: -1 })
        .skip((pagina - 1) * limite)
        .limit(limite)
        .lean(),
      Notificacao.countDocuments(filtro)
    ]);

    return sucesso(res, 200, 'Notificações carregadas.', notificacoes, {
      pagination: { page: pagina, limit: limite, total, totalPages: Math.ceil(total / limite) }
    });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao buscar notificações.');
  }
};

exports.contarNaoLidas = async (req, res) => {
  try {
    const total = await Notificacao.countDocuments({
      destinatario: usuarioId(req),
      lida: false,
      tipo: { $ne: 'mensagem_nova' }
    });

    return sucesso(res, 200, 'Contagem carregada.', { naoLidas: total });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao contar notificações.');
  }
};

exports.marcarLida = async (req, res) => {
  try {
    const userId = usuarioId(req);
    if (!idMongoValido(req.params.id)) return erro(res, 400, 'Identificador de notificação inválido.');
    const notificacao = await Notificacao.findOneAndUpdate(
      { _id: req.params.id, destinatario: userId },
      { lida: true },
      { new: true }
    );

    if (!notificacao) return erro(res, 404, 'Notificação não encontrada.');

    if (notificacao.tipo === 'mensagem_nova' && notificacao.referenciaId) {
      await Mensagem.updateOne(
        { _id: notificacao.referenciaId, remetente: { $ne: userId }, lida: false },
        { lida: true }
      );
    }

    return sucesso(res, 200, 'Notificação marcada como lida.', notificacao);
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao atualizar notificação.');
  }
};

exports.marcarContextoLidas = async (req, res) => {
  try {
    const userId = usuarioId(req);
    const contexto = normalizarContexto(req.body.contexto || req.query.contexto);
    const referenciaBruta = req.body?.referenciaId ?? req.query.referenciaId ?? null;

    if (!contexto) {
      return erro(res, 400, 'Contexto inválido para limpar notificações.');
    }

    if (referenciaBruta !== null && referenciaBruta !== '' && !idMongoValido(referenciaBruta)) {
      return erro(res, 400, 'Referência inválida.');
    }
    const referenciaId = referenciaBruta || null;

    let notificacoesAtualizadas = 0;
    let mensagensAtualizadas = 0;

    if (contexto === 'contratos') {
      const filtro = {
        destinatario: userId,
        lida: false,
        tipoReferencia: 'contrato'
      };

      if (referenciaId) filtro.referenciaId = referenciaId;

      const resultado = await Notificacao.updateMany(filtro, { lida: true });
      notificacoesAtualizadas = resultado.modifiedCount || 0;
    }

    if (contexto === 'mensagens') {
      const filtroNotificacao = {
        destinatario: userId,
        lida: false,
        tipo: 'mensagem_nova'
      };

      if (referenciaId) filtroNotificacao.referenciaId = referenciaId;

      const resultadoNotificacoes = await Notificacao.updateMany(filtroNotificacao, { lida: true });
      notificacoesAtualizadas = resultadoNotificacoes.modifiedCount || 0;

      const contratoIds = await contratosDoUsuario(userId);
      if (referenciaId) {
        const resultadoMensagem = contratoIds.length
          ? await Mensagem.updateOne(
              { _id: referenciaId, contrato: { $in: contratoIds }, remetente: { $ne: userId }, lida: false },
              { lida: true }
            )
          : { modifiedCount: 0 };
        mensagensAtualizadas = resultadoMensagem.modifiedCount || 0;
      } else {
        if (contratoIds.length) {
          const resultadoMensagens = await Mensagem.updateMany(
            { contrato: { $in: contratoIds }, remetente: { $ne: userId }, lida: false },
            { lida: true }
          );
          mensagensAtualizadas = resultadoMensagens.modifiedCount || 0;
        }
      }
    }

    return sucesso(res, 200, 'Notificações marcadas como lidas.', {
      contexto,
      notificacoesAtualizadas,
      mensagensAtualizadas
    });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao limpar notificações.');
  }
};

exports.marcarTodasLidas = async (req, res) => {
  try {
    const userId = usuarioId(req);
    const contratoIds = await contratosDoUsuario(userId);

    const [resultadoNotificacoes, resultadoMensagens] = await Promise.all([
      Notificacao.updateMany({ destinatario: userId, lida: false }, { lida: true }),
      contratoIds.length
        ? Mensagem.updateMany(
            { contrato: { $in: contratoIds }, remetente: { $ne: userId }, lida: false },
            { lida: true }
          )
        : Promise.resolve({ modifiedCount: 0 })
    ]);

    return sucesso(res, 200, 'Notificações marcadas como lidas.', {
      atualizadas: resultadoNotificacoes.modifiedCount || 0,
      mensagensAtualizadas: resultadoMensagens.modifiedCount || 0
    });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao atualizar notificações.');
  }
};

exports.remover = async (req, res) => {
  try {
    if (!idMongoValido(req.params.id)) return erro(res, 400, 'Identificador de notificação inválido.');
    const notificacao = await Notificacao.findOneAndDelete({
      _id: req.params.id,
      destinatario: usuarioId(req)
    });
    if (!notificacao) return erro(res, 404, 'Notificação não encontrada.');
    return sucesso(res, 200, 'Notificação removida.', { removida: true });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao remover notificação.');
  }
};

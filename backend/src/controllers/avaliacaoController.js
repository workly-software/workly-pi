const Avaliacao = require('../models/Avaliacao');
const Contrato = require('../models/Contrato');
const Usuario = require('../models/Usuario');
const { sucesso, erro } = require('../utils/apiResponse');
const { mapAvaliacao } = require('../utils/mapeadoresResposta');
const { notificarAvaliacaoRecebida } = require('../utils/notificacaoUtils');
const { idMongoValido } = require('../utils/requisicaoUtils');

const MENSAGEM_CONTRATO_AVALIADO = 'Este contrato já foi avaliado.';
const MENSAGEM_SERVICO_AVALIADO = 'Você já avaliou este serviço em outra contratação.';

async function recalcularFreelancer(freelancerId) {
  const avaliacoes = await Avaliacao.find({ freelancer: freelancerId });
  const total = avaliacoes.length;
  const media = total
    ? avaliacoes.reduce((s, a) => s + Number(a.notaFreelancer || 0), 0) / total
    : 0;
  await Usuario.findByIdAndUpdate(freelancerId, { avaliacaoMedia: media, totalAvaliacoes: total });
}

exports.criar = async (req, res) => {
  try {
    const userId = req.user.id_usuario || req.user.idUsuario;
    const { contratoId, notaServico, notaFreelancer, comentario } = req.body;

    if (!contratoId || !notaServico || !notaFreelancer)
      return erro(res, 400, 'Informe contrato e notas.');
    if (!idMongoValido(contratoId)) return erro(res, 400, 'Identificador de contrato inválido.');
    const notaServicoNumerica = Number(notaServico);
    const notaFreelancerNumerica = Number(notaFreelancer);
    if (
      !Number.isFinite(notaServicoNumerica) ||
      notaServicoNumerica < 1 ||
      notaServicoNumerica > 5 ||
      !Number.isFinite(notaFreelancerNumerica) ||
      notaFreelancerNumerica < 1 ||
      notaFreelancerNumerica > 5
    ) {
      return erro(res, 400, 'As notas devem ser números entre 1 e 5.');
    }

    const contrato = await Contrato.findById(contratoId);
    if (!contrato) return erro(res, 404, 'Contrato não encontrado.');
    if (String(contrato.cliente) !== String(userId))
      return erro(res, 403, 'Apenas o contratante pode avaliar.');
    if (contrato.status !== 'concluido')
      return erro(res, 400, 'Só é possível avaliar contratos concluídos.');

    const jaAvaliado = await Avaliacao.findOne({
      autor: userId,
      $or: [{ contrato: contrato._id }, { servico: contrato.servico }]
    }).select('contrato');
    if (jaAvaliado) {
      const mesmoContrato = String(jaAvaliado.contrato) === String(contrato._id);
      return erro(res, 400, mesmoContrato ? MENSAGEM_CONTRATO_AVALIADO : MENSAGEM_SERVICO_AVALIADO);
    }
    if (!(await Avaliacao.protecaoAvaliacoesDisponivel())) {
      return erro(res, 503, 'Avaliações estão temporariamente indisponíveis. Tente novamente mais tarde.');
    }

    const avaliacaoCriada = await Avaliacao.create({
      autor: userId,
      contrato: contrato._id,
      freelancer: contrato.freelancer,
      servico: contrato.servico,
      notaServico: notaServicoNumerica,
      notaFreelancer: notaFreelancerNumerica,
      comentario: String(comentario || '').trim(),
      unicaPorServico: true
    });

    const avaliacao = await Avaliacao.findById(avaliacaoCriada._id)
      .populate('autor')
      .populate('freelancer')
      .populate({ path: 'servico', populate: [{ path: 'categoria' }, { path: 'freelancer' }] });

    await recalcularFreelancer(contrato.freelancer);
    const nomeCliente = avaliacao.autor?.nome || 'O contratante';
    notificarAvaliacaoRecebida(
      contrato.freelancer,
      avaliacaoCriada._id,
      nomeCliente,
      Number(notaFreelancer)
    ).catch(() => {});
    return sucesso(
      res,
      201,
      'Avaliação salva com sucesso. Contrato concluído.',
      mapAvaliacao(req, avaliacao)
    );
  } catch (error) {
    if (error && error.code === 11000) {
      return erro(res, 400, error.keyPattern?.servico ? MENSAGEM_SERVICO_AVALIADO : MENSAGEM_CONTRATO_AVALIADO);
    }
    console.error(error);
    return erro(res, 500, 'Erro ao salvar avaliação.');
  }
};

exports.minhas = async (req, res) => {
  try {
    const userId = req.user.id_usuario || req.user.idUsuario;
    const avaliacoes = await Avaliacao.find({ $or: [{ autor: userId }, { freelancer: userId }] })
      .populate('autor')
      .populate('freelancer')
      .populate({ path: 'servico', populate: [{ path: 'categoria' }, { path: 'freelancer' }] })
      .sort({ createdAt: -1 });
    return sucesso(
      res,
      200,
      'Avaliações carregadas.',
      avaliacoes.map((a) => mapAvaliacao(req, a))
    );
  } catch {
    return erro(res, 500, 'Erro ao buscar avaliações.');
  }
};

exports.porServico = async (req, res) => {
  try {
    if (!idMongoValido(req.params.servicoId))
      return erro(res, 400, 'Identificador de serviço inválido.');
    const avaliacoes = await Avaliacao.find({ servico: req.params.servicoId })
      .populate('autor')
      .populate('freelancer')
      .populate({ path: 'servico', populate: [{ path: 'categoria' }, { path: 'freelancer' }] })
      .sort({ createdAt: -1 });
    return sucesso(
      res,
      200,
      'Avaliações do serviço carregadas.',
      avaliacoes.map((a) => mapAvaliacao(req, a))
    );
  } catch {
    return erro(res, 500, 'Erro ao buscar avaliações.');
  }
};

const bcrypt = require('bcryptjs');
const { motivoNovaSenhaInvalida } = require('../utils/senhaUtils');
const Servico = require('../models/Servico');
const Usuario = require('../models/Usuario');
const Avaliacao = require('../models/Avaliacao');
const Contrato = require('../models/Contrato');
const Favorito = require('../models/Favorito');
const {
  mapServico,
  mapUsuario,
  mapUsuarioPublico,
  mapAvaliacao,
  mapContrato
} = require('../utils/mapeadoresResposta');
const { sucesso, erro } = require('../utils/apiResponse');
const {
  obterCampo,
  normalizarTipoConta: normalizarTipoContaValor,
  idMongoValido
} = require('../utils/requisicaoUtils');
const { removerArquivoSeExistir } = require('../utils/arquivoUtils');
const { validarAtualizacaoPerfil } = require('../utils/validacaoPerfil');
const { emitirToken } = require('../utils/tokenSessao');
const { definirCookieSessao, limparCookieSessao } = require('../utils/cookieSessao');
const { excluirConta } = require('../services/contaService');

const PUBLICADOS = { removido: { $ne: true } };

function ehArquivoPadrao(caminho = '') {
  return (
    String(caminho).endsWith('perfil_padrao.png') ||
    String(caminho).endsWith('perfil_padrao.svg') ||
    String(caminho).endsWith('servico_padrao.svg')
  );
}

function obterMesesRecentes(quantidade = 6) {
  const hoje = new Date();
  const meses = [];
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const key = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
    const label = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    meses.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), inicio: data });
  }
  return meses;
}

function obterChaveMes(data) {
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function valorContrato(contrato) {
  const valor = contrato.precoProposto ?? contrato.preco ?? 0;
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? numero : 0;
}

function contratoTemValorConfirmado(contrato) {
  return ['concluido', 'encerrado'].includes(String(contrato?.status));
}

function statusLegivel(status) {
  const labels = {
    pendente: 'Aguardando início',
    proposta_pendente: 'Proposta pendente',
    proposta_aceita: 'Proposta aceita',
    em_andamento: 'Em andamento',
    concluido: 'Concluído',
    encerrado: 'Concluído',
    cancelado: 'Cancelado'
  };
  return labels[status] || 'Pendente';
}

function ordenarAtividades(atividades, limite = 3) {
  return atividades
    .filter((item) => item && item.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limite);
}

function normalizarTipoConta(tipoConta = '') {
  return String(tipoConta || '')
    .trim()
    .toLowerCase();
}

function usuarioEhFreelancer(usuario, totalServicosPublicados = 0) {
  const tipo = normalizarTipoConta(usuario?.tipoConta);
  return tipo.includes('freelancer') || tipo.includes('freela') || totalServicosPublicados > 0;
}

function usuarioEhContratante(usuario) {
  const tipo = normalizarTipoConta(usuario?.tipoConta);
  return tipo.includes('contratante') || tipo.includes('cliente');
}

async function anexarResumoAvaliacoesServicos(servicos = []) {
  const lista = Array.isArray(servicos) ? servicos : [servicos];
  const ids = lista.map((servico) => servico?._id).filter(Boolean);

  if (!ids.length) return Array.isArray(servicos) ? [] : null;

  const resumo = await Avaliacao.aggregate([
    { $match: { servico: { $in: ids } } },
    { $group: { _id: '$servico', total: { $sum: 1 }, media: { $avg: '$notaServico' } } }
  ]);

  const porServico = new Map(resumo.map((item) => [String(item._id), item]));

  const comResumo = lista.map((servico) => {
    const base = servico?.toObject ? servico.toObject() : servico;
    const item = porServico.get(String(base._id)) || { total: 0, media: 0 };

    return {
      ...base,
      avaliacaoMediaServico: item.total ? Number(Number(item.media || 0).toFixed(1)) : 0,
      totalAvaliacoesServico: item.total || 0
    };
  });

  return Array.isArray(servicos) ? comResumo : comResumo[0];
}

async function montarDashboardPerfil(req, usuario, totalServicosPublicados = 0) {
  const usuarioId = usuario._id;
  const isFreelancer = usuarioEhFreelancer(usuario, totalServicosPublicados);
  const isContratante = usuarioEhContratante(usuario);
  const meses = obterMesesRecentes(6);
  const indiceMeses = new Map(meses.map((mes, index) => [mes.key, index]));

  const contratos = await Contrato.find({
    $or: [{ freelancer: usuarioId }, { cliente: usuarioId }]
  })
    .populate({ path: 'servico', populate: [{ path: 'categoria' }, { path: 'freelancer' }] })
    .populate('cliente')
    .populate('freelancer')
    .sort({ updatedAt: -1, createdAt: -1 });

  const avaliacoes = await Avaliacao.find({
    $or: [{ freelancer: usuarioId }, { autor: usuarioId }]
  })
    .populate('autor')
    .populate('freelancer')
    .populate({ path: 'servico', populate: [{ path: 'categoria' }, { path: 'freelancer' }] })
    .sort({ createdAt: -1 })
    .limit(20);

  const favoritos = await Favorito.find({ usuario: usuarioId })
    .populate({ path: 'servico', populate: [{ path: 'categoria' }, { path: 'freelancer' }] })
    .sort({ createdAt: -1 })
    .limit(20);

  const servicosPublicados = await Servico.find({ freelancer: usuarioId, ...PUBLICADOS })
    .populate('categoria')
    .sort({ createdAt: -1 })
    .limit(20);

  const primaryData = meses.map(() => 0);
  const expenseData = meses.map(() => 0);
  let gastosTotal = 0;
  const secondaryData = meses.map(() => 0);
  const revenueByLabel = new Map();
  let valorTotal = 0;
  let quantidadeContratos = 0;
  let quantidadePropostas = 0;

  contratos.forEach((contrato) => {
    const userIsFreelancerInContract =
      String(contrato.freelancer?._id || contrato.freelancer) === String(usuarioId);
    const userIsClientInContract =
      String(contrato.cliente?._id || contrato.cliente) === String(usuarioId);
    const createdIndex = indiceMeses.get(obterChaveMes(contrato.createdAt));
    const status = String(contrato.status || 'pendente');
    const tipoContratacao = String(contrato.tipoContratacao || 'fixo');
    const valor = valorContrato(contrato);

    if (createdIndex !== undefined) secondaryData[createdIndex] += 1;
    if (tipoContratacao === 'fixo') quantidadeContratos += 1;
    else quantidadePropostas += 1;

    const valorConfirmado = contratoTemValorConfirmado(contrato);

    if (valorConfirmado && valor > 0 && (userIsFreelancerInContract || userIsClientInContract)) {
      const index = indiceMeses.get(obterChaveMes(contrato.updatedAt || contrato.createdAt));
      if (userIsClientInContract && !userIsFreelancerInContract) {
        if (index !== undefined) expenseData[index] += valor;
        gastosTotal += valor;
        return;
      }
      if (index !== undefined) primaryData[index] += valor;
      valorTotal += valor;

      const label = userIsFreelancerInContract
        ? contrato.servico?.nome || 'Serviço'
        : contrato.servico?.categoria?.nome || contrato.servico?.nome || 'Serviço';
      revenueByLabel.set(label, (revenueByLabel.get(label) || 0) + valor);
    }
  });

  servicosPublicados.forEach((servico) => {
    const index = indiceMeses.get(obterChaveMes(servico.createdAt));
    if (index !== undefined) secondaryData[index] += 1;
  });

  avaliacoes.forEach((avaliacao) => {
    const index = indiceMeses.get(obterChaveMes(avaliacao.createdAt));
    if (index !== undefined) secondaryData[index] += 1;
  });

  favoritos.forEach((favorito) => {
    const index = indiceMeses.get(obterChaveMes(favorito.createdAt));
    if (index !== undefined) secondaryData[index] += 1;
  });

  const atividades = [];

  contratos.slice(0, 20).forEach((contrato) => {
    const userIsFreelancerInContract =
      String(contrato.freelancer?._id || contrato.freelancer) === String(usuarioId);
    const servicoNome = contrato.servico?.nome || 'Serviço';
    const outraPessoa = userIsFreelancerInContract
      ? contrato.cliente?.nome
      : contrato.freelancer?.nome;
    const tipo = contrato.tipoContratacao === 'fixo' ? 'contrato' : 'proposta';
    atividades.push({
      tipo: 'contrato',
      icon: tipo === 'proposta' ? 'fa-handshake' : 'fa-file-signature',
      titulo: userIsFreelancerInContract
        ? tipo === 'proposta'
          ? 'Proposta recebida'
          : 'Contratação recebida'
        : tipo === 'proposta'
          ? 'Proposta enviada'
          : 'Contratação criada',
      descricao: `${outraPessoa || 'Usuário'} · ${servicoNome}`,
      status: statusLegivel(contrato.status),
      valor: valorContrato(contrato),
      date: contrato.updatedAt || contrato.createdAt,
      createdAt: contrato.createdAt,
      updatedAt: contrato.updatedAt
    });
  });

  avaliacoes.slice(0, 12).forEach((avaliacao) => {
    const userIsFreelancerInReview =
      String(avaliacao.freelancer?._id || avaliacao.freelancer) === String(usuarioId);
    const servicoNome = avaliacao.servico?.nome || 'Serviço';
    const pessoa = userIsFreelancerInReview ? avaliacao.autor?.nome : avaliacao.freelancer?.nome;
    atividades.push({
      tipo: 'avaliacao',
      icon: 'fa-star',
      titulo: userIsFreelancerInReview ? 'Avaliação recebida' : 'Avaliação enviada',
      descricao: `${pessoa || 'Usuário'} · ${servicoNome}`,
      status: `${userIsFreelancerInReview ? avaliacao.notaFreelancer : avaliacao.notaServico} estrelas`,
      valor: null,
      date: avaliacao.createdAt,
      createdAt: avaliacao.createdAt
    });
  });

  favoritos.slice(0, 12).forEach((favorito) => {
    if (!favorito.servico) return;
    atividades.push({
      tipo: 'favorito',
      icon: 'fa-heart',
      titulo: 'Serviço favoritado',
      descricao: favorito.servico.nome || 'Serviço',
      status: favorito.servico.categoria?.nome || 'Favorito',
      valor: null,
      date: favorito.createdAt,
      createdAt: favorito.createdAt
    });
  });

  servicosPublicados.slice(0, 12).forEach((servico) => {
    atividades.push({
      tipo: 'servico',
      icon: 'fa-briefcase',
      titulo: 'Serviço publicado',
      descricao: servico.nome || 'Serviço',
      status: servico.categoria?.nome || 'Publicado',
      valor: Number(servico.preco || 0),
      date: servico.createdAt,
      createdAt: servico.createdAt
    });
  });

  const distributionEntries = Array.from(revenueByLabel.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const weeklyLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const weeklyData = [0, 0, 0, 0, 0, 0, 0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  atividades.forEach((atividade) => {
    const data = new Date(atividade.date || atividade.createdAt);
    if (Number.isNaN(data.getTime()) || data < sevenDaysAgo) return;
    const index = data.getDay() === 0 ? 6 : data.getDay() - 1;
    weeklyData[index] += 1;
  });

  const totalAtividades = atividades.filter((item) => item && item.date).length;
  const atividadesOrdenadas = ordenarAtividades(atividades, 3);

  return {
    summary: {
      valorTotal: Number(valorTotal.toFixed(2)),
      gastosTotal: Number(gastosTotal.toFixed(2)),
      contratos: quantidadeContratos,
      propostas: quantidadePropostas,
      servicosPublicados: servicosPublicados.length,
      atividades: totalAtividades,
      modo:
        isFreelancer && !isContratante
          ? 'freelancer'
          : isContratante && !isFreelancer
            ? 'contratante'
            : 'misto'
    },
    monthlyPerformance: {
      labels: meses.map((mes) => mes.label),
      primaryLabel: 'Receita de serviços concluídos (R$)',
      expenseLabel: 'Gastos com serviços concluídos (R$)',
      expenseData: expenseData.map((valor) => Number(valor.toFixed(2))),
      primaryData: primaryData.map((valor) => Number(valor.toFixed(2))),
      secondaryLabel: 'Atividades',
      secondaryData
    },
    revenueDistribution: {
      title: 'Receita por serviço concluído',
      labels: distributionEntries.length
        ? distributionEntries.map(([label]) => label)
        : ['Sem movimentação ainda'],
      data: distributionEntries.length
        ? distributionEntries.map(([, valor]) => Number(valor.toFixed(2)))
        : [0],
      empty: distributionEntries.length === 0
    },
    weeklyActivity: {
      labels: weeklyLabels,
      data: weeklyData
    },
    recentActivities: atividadesOrdenadas
  };
}

exports.buscarPerfil = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.user.id_usuario);
    if (!usuario) {
      return erro(res, 404, 'Usuário não encontrado.');
    }

    let servicos = [];
    let avaliacoes = [];
    let leads = [];
    let resumoAvaliacoes = {
      total: Number(usuario.totalAvaliacoes || 0),
      mediaFreelancer: Number(usuario.avaliacaoMedia || 0),
      mediaServico: 0,
      distribuicao: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    };

    const totalServicosPublicados = await Servico.countDocuments({ freelancer: usuario._id, ...PUBLICADOS });
    const perfilFreelancer = usuarioEhFreelancer(usuario, totalServicosPublicados);

    if (perfilFreelancer) {
      const servicosDoUsuario = await Servico.find({ freelancer: usuario._id, ...PUBLICADOS })
        .populate('categoria')
        .populate('freelancer')
        .sort({ createdAt: -1 });
      servicos = servicosDoUsuario.map((servico) => mapServico(req, servico));

      const avaliacoesRecebidas = await Avaliacao.find({ freelancer: usuario._id })
        .populate('autor')
        .populate('freelancer')
        .populate({ path: 'servico', populate: [{ path: 'categoria' }, { path: 'freelancer' }] })
        .sort({ createdAt: -1 });

      avaliacoes = avaliacoesRecebidas.map((avaliacao) => mapAvaliacao(req, avaliacao));
      const total = avaliacoesRecebidas.length;
      const somaFreelancer = avaliacoesRecebidas.reduce(
        (acc, avaliacao) => acc + Number(avaliacao.notaFreelancer || 0),
        0
      );
      const somaServico = avaliacoesRecebidas.reduce(
        (acc, avaliacao) => acc + Number(avaliacao.notaServico || 0),
        0
      );
      const distribuicao = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      avaliacoesRecebidas.forEach((avaliacao) => {
        const nota = Math.max(1, Math.min(5, Math.round(Number(avaliacao.notaFreelancer || 0))));
        distribuicao[nota] += 1;
      });

      resumoAvaliacoes = {
        total,
        mediaFreelancer: total ? Number((somaFreelancer / total).toFixed(1)) : 0,
        mediaServico: total ? Number((somaServico / total).toFixed(1)) : 0,
        distribuicao
      };

      if (
        Number(usuario.avaliacaoMedia || 0).toFixed(1) !==
          resumoAvaliacoes.mediaFreelancer.toFixed(1) ||
        Number(usuario.totalAvaliacoes || 0) !== total
      ) {
        await Usuario.findByIdAndUpdate(usuario._id, {
          avaliacaoMedia: resumoAvaliacoes.mediaFreelancer,
          totalAvaliacoes: total
        });
        usuario.avaliacaoMedia = resumoAvaliacoes.mediaFreelancer;
        usuario.totalAvaliacoes = total;
      }

      const contratosRecebidos = await Contrato.find({ freelancer: usuario._id })
        .populate({ path: 'servico', populate: [{ path: 'categoria' }, { path: 'freelancer' }] })
        .populate('cliente')
        .populate('freelancer')
        .sort({ createdAt: -1 })
        .limit(3);

      leads = contratosRecebidos.map((contrato) => mapContrato(req, contrato, usuario._id));
    }

    const dashboard = await montarDashboardPerfil(req, usuario, totalServicosPublicados);

    return sucesso(res, 200, 'Perfil carregado com sucesso.', null, {
      user: mapUsuario(req, usuario),
      services: servicos,
      reviews: avaliacoes,
      reviewSummary: resumoAvaliacoes,
      leads,
      dashboard
    });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao buscar usuário.');
  }
};

exports.buscarPerfilPublico = async (req, res) => {
  try {
    if (!idMongoValido(req.params.id)) return erro(res, 400, 'Identificador de usuário inválido.');
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario || usuario.removido || usuario.exclusaoConfirmadaEm)
      return erro(res, 404, 'Este perfil não está disponível.');

    const servicosDoUsuario = await Servico.find({ freelancer: usuario._id, ...PUBLICADOS })
      .populate('categoria')
      .populate('freelancer')
      .sort({ createdAt: -1 });

    const [avaliacoesRecebidas, resumoAgregado] = await Promise.all([
      Avaliacao.find({ freelancer: usuario._id })
        .populate('autor')
        .populate('freelancer')
        .populate({ path: 'servico', populate: [{ path: 'categoria' }, { path: 'freelancer' }] })
        .sort({ createdAt: -1 })
        .limit(12),
      Avaliacao.aggregate([
        { $match: { freelancer: usuario._id } },
        {
          $facet: {
            geral: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  mediaFreelancer: { $avg: '$notaFreelancer' }
                }
              }
            ],
            porNota: [{ $group: { _id: { $round: ['$notaFreelancer', 0] }, total: { $sum: 1 } } }]
          }
        }
      ])
    ]);

    const geral = resumoAgregado[0]?.geral?.[0] || { total: 0, mediaFreelancer: 0 };
    const total = Number(geral.total || 0);
    const distribuicao = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    (resumoAgregado[0]?.porNota || []).forEach((item) => {
      const nota = Math.max(1, Math.min(5, Number(item._id || 0)));
      distribuicao[nota] = Number(item.total || 0);
    });
    const resumoAvaliacoes = {
      total,
      mediaFreelancer: total ? Number(Number(geral.mediaFreelancer || 0).toFixed(1)) : 0,
      distribuicao
    };

    const servicosComResumo = await anexarResumoAvaliacoesServicos(servicosDoUsuario);

    return sucesso(res, 200, 'Perfil público carregado com sucesso.', null, {
      user: mapUsuarioPublico(req, usuario),
      services: servicosComResumo.map((servico) => mapServico(req, servico)),
      reviews: avaliacoesRecebidas.map((avaliacao) => mapAvaliacao(req, avaliacao)),
      reviewSummary: resumoAvaliacoes,
      modo: usuarioEhFreelancer(usuario, servicosDoUsuario.length) ? 'freelancer' : 'contratante'
    });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao carregar perfil público.');
  }
};

async function trocarEmail(req, res, atual, campos) {
  const senhaAtual = obterCampo(req.body, ['senhaAtual', 'currentPassword']);
  if (typeof senhaAtual !== 'string' || !senhaAtual) {
    return erro(res, 400, 'Informe sua senha atual para alterar o e-mail.');
  }
  const versao = Number(req.user.sv || 0);
  if (Number(atual.versaoSessao || 0) !== versao) {
    return erro(res, 409, 'Suas credenciais foram atualizadas. Entre novamente antes de alterar o e-mail.');
  }
  const senhaCorreta = await bcrypt.compare(senhaAtual, atual.senha).catch(() => false);
  if (!senhaCorreta) return erro(res, 403, 'Senha atual incorreta.');

  const emUso = await Usuario.exists({ email: campos.email, _id: { $ne: atual._id } });
  if (emUso) return erro(res, 409, 'Já existe um usuário cadastrado com este e-mail.');

  const atualizado = await Usuario.findOneAndUpdate(
    {
      _id: atual._id,
      email: atual.email,
      senha: atual.senha,
      removido: { $ne: true },
      exclusaoConfirmadaEm: null,
      ...(versao === 0 ? { $or: [{ versaoSessao: 0 }, { versaoSessao: { $exists: false } }] } : { versaoSessao: versao })
    },
    { $set: campos, $inc: { versaoSessao: 1 } },
    { new: true, runValidators: true }
  );
  if (!atualizado) {
    return erro(res, 409, 'Suas credenciais foram atualizadas durante esta operação. Entre novamente.');
  }
  definirCookieSessao(req, res, emitirToken(atualizado));
  return sucesso(res, 200, 'E-mail atualizado. As outras sessões foram encerradas.', null, {
    user: mapUsuario(req, atualizado)
  });
}

exports.atualizarPerfil = async (req, res) => {
  try {
    const { campos, erro: mensagemInvalida } = validarAtualizacaoPerfil(req.body);
    if (mensagemInvalida) return erro(res, 400, mensagemInvalida);

    const atual = await Usuario.findById(req.user.id_usuario).select('email senha versaoSessao');
    if (!atual) return erro(res, 404, 'Usuário não encontrado.');

    if (campos.email && campos.email !== atual.email) {
      return trocarEmail(req, res, atual, campos);
    }
    delete campos.email;

    const usuario = await Usuario.findByIdAndUpdate(req.user.id_usuario, campos, {
      new: true,
      runValidators: true
    });
    if (!usuario) {
      return erro(res, 404, 'Usuário não encontrado.');
    }

    return sucesso(res, 200, 'Perfil atualizado com sucesso!', null, {
      user: mapUsuario(req, usuario)
    });
  } catch (error) {
    if (error?.code === 11000 && (error.keyPattern?.email || error.keyValue?.email)) {
      return erro(res, 409, 'Já existe um usuário cadastrado com este e-mail.');
    }
    if (error?.name === 'ValidationError' || error?.name === 'CastError') {
      return erro(res, 400, 'Dados do perfil inválidos.');
    }
    console.error(error);
    return erro(res, 500, 'Erro ao atualizar perfil.');
  }
};

exports.alterarTipoConta = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.user.id_usuario);
    if (!usuario) {
      return erro(res, 404, 'Usuário não encontrado.');
    }

    const novoTipo = normalizarTipoContaValor(obterCampo(req.body, ['tipoConta', 'tipo_conta']));
    const areaAtuacao = String(
      obterCampo(req.body, ['areaAtuacao', 'area_atuacao'], '') || ''
    ).trim();

    if (!novoTipo) {
      return erro(res, 400, 'Tipo de conta inválido.');
    }

    if (usuario.tipoConta === novoTipo) {
      if (novoTipo === 'Freelancer' && areaAtuacao) {
        usuario.areaAtuacao = areaAtuacao;
        await usuario.save();
      }

      return sucesso(res, 200, 'Tipo de conta mantido.', null, {
        user: mapUsuario(req, usuario)
      });
    }

    if (novoTipo === 'Freelancer') {
      if (!areaAtuacao) {
        return erro(res, 400, 'Área de atuação é obrigatória para virar freelancer.');
      }

      usuario.tipoConta = 'Freelancer';
      usuario.areaAtuacao = areaAtuacao;
      if (!usuario.tituloProfissional) usuario.tituloProfissional = 'Freelancer';
      await usuario.save();

      return sucesso(res, 200, 'Conta alterada para freelancer.', null, {
        user: mapUsuario(req, usuario)
      });
    }

    const servicosAtivos = await Servico.countDocuments({ freelancer: usuario._id, ...PUBLICADOS });
    const contratosAtivos = await Contrato.countDocuments({
      freelancer: usuario._id,
      status: { $in: Contrato.STATUS_ATIVOS }
    });

    if (servicosAtivos > 0 || contratosAtivos > 0) {
      return erro(
        res,
        409,
        'Você possui serviços publicados ou contratos ativos. Remova ou finalize esses vínculos antes de virar contratante.'
      );
    }

    usuario.tipoConta = 'Contratante';
    usuario.areaAtuacao = '';
    usuario.tituloProfissional = '';
    usuario.precoHora = '';
    usuario.disponibilidade = '';
    await usuario.save();

    return sucesso(res, 200, 'Conta alterada para contratante.', null, {
      user: mapUsuario(req, usuario)
    });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao alterar tipo da conta.');
  }
};

exports.atualizarFoto = async (req, res) => {
  try {
    if (!req.file) {
      return erro(res, 400, 'Nenhuma imagem enviada.');
    }

    const usuarioAnterior = await Usuario.findById(req.user.id_usuario);
    if (!usuarioAnterior) {
      removerArquivoSeExistir(`/uploads/perfis/${req.file.filename}`);
      return erro(res, 404, 'Usuário não encontrado.');
    }

    const caminhoBanco = `/uploads/perfis/${req.file.filename}`;
    const usuario = await Usuario.findByIdAndUpdate(
      req.user.id_usuario,
      { fotoPerfil: caminhoBanco },
      { new: true }
    );

    if (usuarioAnterior.fotoPerfil && !ehArquivoPadrao(usuarioAnterior.fotoPerfil)) {
      removerArquivoSeExistir(usuarioAnterior.fotoPerfil);
    }

    return sucesso(res, 200, 'Foto de perfil atualizada com sucesso!', null, {
      filePath: `${req.protocol}://${req.get('host')}${caminhoBanco}`,
      user: mapUsuario(req, usuario)
    });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao atualizar a foto de perfil.');
  }
};

exports.atualizarSenha = async (req, res) => {
  try {
    const senhaAtual = obterCampo(req.body, ['senhaAtual', 'currentPassword']);
    const novaSenha = obterCampo(req.body, ['novaSenha', 'newPassword']);
    const confirmarSenha = obterCampo(req.body, ['confirmarSenha', 'confirmPassword']);

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      return erro(res, 400, 'Preencha a senha atual, a nova senha e a confirmação.');
    }

    if ([senhaAtual, novaSenha, confirmarSenha].some((valor) => typeof valor !== 'string')) {
      return erro(res, 400, 'Senhas inválidas.');
    }

    const motivoSenha = motivoNovaSenhaInvalida(novaSenha);
    if (motivoSenha) return erro(res, 400, motivoSenha);

    if (String(novaSenha) !== String(confirmarSenha)) {
      return erro(res, 400, 'A confirmação da senha não confere.');
    }

    const usuario = await Usuario.findById(req.user.id_usuario);
    if (!usuario) return erro(res, 404, 'Usuário não encontrado.');

    const versao = Number(req.user.sv || 0);
    if (Number(usuario.versaoSessao || 0) !== versao) {
      return erro(res, 409, 'Suas credenciais foram atualizadas. Entre novamente antes de alterar a senha.');
    }
    const senhaCorreta = await bcrypt.compare(String(senhaAtual), usuario.senha);
    if (!senhaCorreta) return erro(res, 401, 'Senha atual incorreta.');

    const senha = await bcrypt.hash(novaSenha, 10);
    const atualizado = await Usuario.findOneAndUpdate(
      {
        _id: usuario._id,
        senha: usuario.senha,
        removido: { $ne: true },
        exclusaoConfirmadaEm: null,
        ...(versao === 0 ? { $or: [{ versaoSessao: 0 }, { versaoSessao: { $exists: false } }] } : { versaoSessao: versao })
      },
      { $set: { senha }, $inc: { versaoSessao: 1 }, $unset: { redefinicaoSenha: 1 } },
      { new: true }
    );
    if (!atualizado) return erro(res, 409, 'Suas credenciais foram atualizadas durante esta operação. Entre novamente.');

    definirCookieSessao(req, res, emitirToken(atualizado));
    return sucesso(res, 200, 'Senha atualizada com sucesso!', null, {
      user: mapUsuario(req, atualizado)
    });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao atualizar senha.');
  }
};

exports.excluirPerfil = async (req, res) => {
  try {
    const senhaAtual = obterCampo(req.body || {}, ['senhaAtual', 'senha', 'currentPassword']);
    const resultado = await excluirConta(req.user.id_usuario, senhaAtual);
    if (!resultado.ok) return erro(res, resultado.status, resultado.mensagem);
    limparCookieSessao(req, res);
    return sucesso(res, 200, 'Conta excluída com sucesso.');
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao excluir a conta.');
  }
};

exports.getPublicProfile = exports.buscarPerfilPublico;

exports.getProfile = exports.buscarPerfil;

exports.updateProfile = exports.atualizarPerfil;

exports.updatePhoto = exports.atualizarFoto;

exports.updatePassword = exports.atualizarSenha;

exports.deleteProfile = exports.excluirPerfil;

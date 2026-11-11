const Contrato = require('../models/Contrato');
const Servico = require('../models/Servico');
const Avaliacao = require('../models/Avaliacao');
const { sucesso, erro } = require('../utils/apiResponse');
const { mapContrato } = require('../utils/mapeadoresResposta');
const { idMongoValido } = require('../utils/requisicaoUtils');
const { contaPodeContratar } = require('../services/contaService');
const { servicoPodeContratar } = require('../services/servicoService');
const {
  estadoAcordo,
  vezNaNegociacao,
  validarValor,
  validarJustificativa,
  valorValido
} = require('../utils/acordoContrato');
const {
  notificarContratoNovo,
  notificarPropostaAceita,
  notificarPropostaRecusada,
  notificarTrabalhoIniciado,
  notificarEntregaRealizada,
  notificarContratoCancelado,
  notificarPropostaValor,
  notificarValorAprovado,
  notificarEntregaConfirmada,
  notificarAjusteSolicitado
} = require('../utils/notificacaoUtils');

const { STATUS_ATIVOS } = Contrato;
const MENSAGEM_DUPLICADO = 'Você já possui uma contratação ativa para este serviço.';
const MENSAGEM_SERVICO_INDISPONIVEL = 'Este serviço não está mais disponível para contratação.';
const MENSAGEM_INDISPONIVEL =
  'Novos pedidos e propostas estão temporariamente indisponíveis. Tente novamente mais tarde.';
const STATUS_FINAIS = ['cancelado', 'concluido', 'encerrado'];

function popularContrato(query) {
  const camposUsuario =
    'nome fotoPerfil tipoConta areaAtuacao tituloProfissional bio localizacao site linkedin github instagram avaliacaoMedia totalAvaliacoes removido';
  return query
    .populate({
      path: 'servico',
      populate: [
        { path: 'categoria', select: 'legacyId nome slug' },
        { path: 'freelancer', select: camposUsuario }
      ]
    })
    .populate({ path: 'cliente', select: camposUsuario })
    .populate({ path: 'freelancer', select: camposUsuario });
}

function usuarioDoToken(req) {
  return req.user.id_usuario || req.user.idUsuario;
}

function ehCliente(contrato, userId) {
  return String(contrato.cliente) === String(userId);
}

function ehFreelancer(contrato, userId) {
  return String(contrato.freelancer) === String(userId);
}

// busca nome do serviço para notificação: usa o dado já populado se disponível,
// senão faz uma query leve só com o campo nome.
async function obterNomeServico(contrato) {
  if (contrato?.servico?.nome) return contrato.servico.nome;
  const s = await Servico.findById(contrato.servico).select('nome');
  return s?.nome || 'Serviço';
}

// carrega o contrato e já confere se o usuário logado participa dele.
// isso evita repetir a mesma checagem em aceitar, cancelar, iniciar e entregar.
async function carregarContratoAutorizado(req, res) {
  const userId = usuarioDoToken(req);
  if (!idMongoValido(req.params.id)) {
    erro(res, 400, 'Identificador de contrato inválido.');
    return null;
  }
  const contrato = await Contrato.findById(req.params.id);
  if (!contrato) {
    erro(res, 404, 'Contrato não encontrado.');
    return null;
  }

  if (!ehCliente(contrato, userId) && !ehFreelancer(contrato, userId)) {
    erro(res, 403, 'Sem permissão para alterar este contrato.');
    return null;
  }

  if (STATUS_FINAIS.includes(contrato.status)) {
    erro(res, 400, 'Este contrato não pode mais ser alterado.');
    return null;
  }

  return { contrato, userId };
}

// cria uma contratação nova.
// aqui também nasce o fluxo de proposta quando o serviço é valor a combinar.
exports.criar = async (req, res) => {
  try {
    // a consulta prévia abaixo não basta contra pedidos simultâneos: sem o índice único verificado, nada é criado.
    if (!(await Contrato.protecaoContratosDisponivel())) {
      return erro(res, 503, MENSAGEM_INDISPONIVEL);
    }
    const { servicoId } = req.body;
    const mensagem = String(req.body.mensagem || '').trim();
    const detalhesPedido = String(req.body.detalhesPedido || req.body.detalhes_pedido || '').trim();
    const prazoDesejado = String(req.body.prazoDesejado || req.body.prazo_desejado || '').trim();
    const referencias = String(req.body.referencias || '').trim();
    const precoPropostoRaw =
      req.body.precoProposto ?? req.body.preco_proposto ?? req.body.valorProposto;
    const informouValor = precoPropostoRaw !== undefined && precoPropostoRaw !== null && precoPropostoRaw !== '';
    const validacaoValor = informouValor ? validarValor(precoPropostoRaw) : { valor: null };

    if (!servicoId) return erro(res, 400, 'Serviço não informado.');
    if (!idMongoValido(servicoId)) return erro(res, 400, 'Identificador de serviço inválido.');
    const servico = await Servico.findById(servicoId).populate('freelancer');
    if (!servico) return erro(res, 404, 'Serviço não encontrado.');
    // serviço retirado, ou de freelancer removido/inexistente, não aceita novos pedidos.
    if (servico.removido || !servico.freelancer || servico.freelancer.removido) {
      return erro(res, 409, MENSAGEM_SERVICO_INDISPONIVEL);
    }

    const userId = usuarioDoToken(req);
    if (String(servico.freelancer._id) === String(userId))
      return erro(res, 400, 'Você não pode contratar o próprio serviço.');

    const tipoContratacao = servico.valorCombinar ? 'combinar' : 'fixo';

    if (tipoContratacao === 'combinar' && !mensagem) {
      return erro(res, 400, 'Envie uma mensagem para combinar o valor com o freelancer.');
    }

    if (tipoContratacao === 'fixo' && !detalhesPedido) {
      return erro(res, 400, 'Informe os detalhes do serviço antes de concluir a contratação.');
    }

    // no preço fixo o valor vem do serviço e qualquer valor enviado pelo cliente é ignorado.
    if (tipoContratacao === 'combinar' && validacaoValor.erro) {
      return erro(res, 400, validacaoValor.erro);
    }
    if (tipoContratacao === 'fixo' && !valorValido(servico.preco)) {
      return erro(res, 409, MENSAGEM_SERVICO_INDISPONIVEL);
    }
    const precoProposto = tipoContratacao === 'combinar' ? validacaoValor.valor : null;

    const existente = await Contrato.findOne({
      cliente: userId,
      servico: servico._id,
      status: { $in: STATUS_ATIVOS }
    });
    if (existente) {
      return erro(res, 409, MENSAGEM_DUPLICADO);
    }

    const partes = [userId, servico.freelancer._id];
    if (!(await Promise.all([...partes.map(contaPodeContratar), servicoPodeContratar(servico._id)])).every(Boolean)) {
      return erro(res, 409, MENSAGEM_SERVICO_INDISPONIVEL);
    }

    // a combinar: preco só é preenchido quando as duas partes aprovarem um valor.
    const contrato = await Contrato.create({
      cliente: userId,
      freelancer: servico.freelancer._id,
      servico: servico._id,
      preco: tipoContratacao === 'fixo' ? servico.preco : null,
      precoProposto,
      mensagem,
      detalhesPedido,
      prazoDesejado,
      referencias,
      tipoContratacao,
      status: tipoContratacao === 'fixo' ? 'pendente' : 'proposta_pendente',
      ...(tipoContratacao === 'combinar'
        ? {
            negociacao: { estado: 'aguardando_freelancer' },
            historico: precoProposto
              ? [{ tipo: 'proposta', autor: userId, papel: 'cliente', valor: precoProposto }]
              : []
          }
        : {})
    });

    // Exclusão de conta e retirada de anúncio marcam o recurso antes de procurar contratos ativos.
    // Se uma marca apareceu durante a gravação, este pedido recém-criado é desfeito antes de responder.
    if (!(await Promise.all([...partes.map(contaPodeContratar), servicoPodeContratar(servico._id)])).every(Boolean)) {
      await Contrato.deleteOne({ _id: contrato._id });
      return erro(res, 409, MENSAGEM_SERVICO_INDISPONIVEL);
    }

    // a notificação só sai depois que o contrato existe; uma falha nela não desfaz o pedido.
    await notificarDepois(() =>
      notificarContratoNovo(servico.freelancer._id, contrato._id, servico.nome, tipoContratacao)
    );
    const completo = await popularContrato(Contrato.findById(contrato._id));
    return sucesso(
      res,
      201,
      tipoContratacao === 'fixo'
        ? 'Contratação criada com sucesso.'
        : 'Proposta enviada com sucesso.',
      mapContrato(req, completo, userId)
    );
  } catch (error) {
    // pedidos simultâneos: o índice único parcial deixa passar só o primeiro.
    if (error?.code === 11000) return erro(res, 409, MENSAGEM_DUPLICADO);
    console.error(error);
    return erro(res, 500, 'Erro ao criar contratação.');
  }
};

exports.meus = async (req, res) => {
  try {
    const userId = usuarioDoToken(req);
    const contratos = await popularContrato(
      Contrato.find({ $or: [{ cliente: userId }, { freelancer: userId }] }).sort({ createdAt: -1 })
    ).lean();
    const avaliacoes = await Avaliacao.find({
      autor: userId,
      $or: [
        { contrato: { $in: contratos.map((c) => c._id) } },
        { servico: { $in: contratos.map((c) => c.servico?._id || c.servico).filter(Boolean) } }
      ]
    })
      .select('contrato servico')
      .lean();

    const contratosAvaliados = new Set(avaliacoes.map((a) => String(a.contrato)));
    // o cliente avalia cada serviço uma vez: um novo contrato do mesmo serviço não abre outra avaliação.
    const servicosAvaliados = new Set(avaliacoes.map((a) => String(a.servico)));
    return sucesso(
      res,
      200,
      'Contratos carregados com sucesso.',
      contratos.map((c) => {
        const servicoJaAvaliado = servicosAvaliados.has(String(c.servico?._id || c.servico));
        return {
          ...mapContrato(req, c, userId),
          jaAvaliado: contratosAvaliados.has(String(c._id)),
          ja_avaliado: contratosAvaliados.has(String(c._id)),
          servicoJaAvaliado,
          servico_ja_avaliado: servicoJaAvaliado
        };
      })
    );
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao buscar contratos.');
  }
};


// mensagem única para quando outra requisição mudou o contrato entre a leitura e a gravação.
const MENSAGEM_CONFLITO =
  'Este contrato acabou de ser atualizado por outra ação. Atualize a página para ver a situação atual.';
const MENSAGEM_SEM_ACORDO =
  'O valor deste contrato ainda não foi aprovado pelas duas partes. Combine o valor antes de continuar.';
const MENSAGEM_ACORDO_FECHADO =
  'O valor deste contrato já foi aprovado pelas duas partes e não pode mais ser alterado.';

const PODE_CANCELAR = {
  cliente: ['pendente', 'proposta_pendente', 'proposta_aceita'],
  freelancer: ['pendente', 'proposta_pendente', 'proposta_aceita', 'em_andamento']
};

// notificações só depois da gravação. Se falharem, a transição continua válida e só registramos a falha,
// para o cliente da API não repetir uma ação que já foi aplicada.
async function notificarDepois(enviar) {
  try {
    await enviar();
  } catch (error) {
    console.error('Falha ao notificar transição de contrato:', error?.message || error);
  }
}

async function notificarEResponder(req, res, atualizado, userId, mensagem, notificar) {
  if (notificar) {
    const nomeServico = await obterNomeServico(atualizado).catch(() => 'Serviço');
    await notificarDepois(() => notificar(atualizado, userId, nomeServico));
  }
  const completo = await popularContrato(Contrato.findById(atualizado._id));
  return sucesso(res, 200, mensagem, mapContrato(req, completo || atualizado, userId));
}

// aplica uma transição de forma atômica: só grava se o contrato ainda estiver no status lido
// e o usuário continuar no papel exigido. Assim duas ações concorrentes nunca se sobrescrevem.
// definicao: { papel(contrato, userId) -> 'cliente' | 'freelancer' | null, erroPapel,
//   de(papel) -> status permitidos, erroStatus, codigoErroStatus, exigeAcordo, validar(req) -> { erro } | dados,
//   para(contrato), extra(contrato), evento(contrato, entrada) -> item do histórico,
//   mensagem(contrato), notificar(contrato, userId, nomeServico) }
async function executarTransicao(req, res, definicao, dadosCarregados) {
  const dados = dadosCarregados || (await carregarContratoAutorizado(req, res));
  if (!dados) return;
  const { contrato, userId } = dados;

  const papel = definicao.papel(contrato, userId);
  if (!papel) return erro(res, 403, definicao.erroPapel);
  if (!definicao.de(papel).includes(contrato.status)) {
    return erro(res, definicao.codigoErroStatus || 400, definicao.erroStatus);
  }
  // um acordo fechado nunca volta atrás, então a leitura basta para esta checagem.
  if (definicao.exigeAcordo && estadoAcordo(contrato).estado !== 'fechado') {
    return erro(res, 409, MENSAGEM_SEM_ACORDO);
  }
  const entrada = definicao.validar ? definicao.validar(req) : null;
  if (entrada?.erro) return erro(res, 400, entrada.erro);

  const evento = definicao.evento
    ? { ...definicao.evento(contrato, entrada), autor: userId, papel, data: new Date() }
    : null;
  const atualizado = await Contrato.findOneAndUpdate(
    { _id: contrato._id, status: contrato.status, [papel]: userId },
    {
      $set: { status: definicao.para(contrato), ...(definicao.extra ? definicao.extra(contrato) : {}) },
      ...(evento ? { $push: { historico: evento } } : {})
    },
    { new: true }
  );
  if (!atualizado) return erro(res, 409, MENSAGEM_CONFLITO);

  return notificarEResponder(req, res, atualizado, userId, definicao.mensagem(contrato), definicao.notificar);
}

// negociação de valor dos contratos a combinar. Só quem está na vez propõe ou aprova
// (no contrato antigo pendente de acordo, qualquer parte propõe e ninguém aprova sozinho).
// A gravação é condicionada ao status, ao estado da negociação e aos valores lidos: duas ações simultâneas
// nunca se sobrepõem, e o valor aprovado é exatamente o que estava na mesa.
async function negociarValor(req, res, acao, dados) {
  const { contrato, userId } = dados;
  const papel = ehCliente(contrato, userId) ? 'cliente' : 'freelancer';
  if (contrato.tipoContratacao !== 'combinar') {
    return erro(res, 400, 'Este contrato tem preço fixo definido pelo serviço e não aceita negociação de valor.');
  }
  const acordo = estadoAcordo(contrato);
  if (acordo.estado === 'fechado') return erro(res, 409, MENSAGEM_ACORDO_FECHADO);
  const vez = vezNaNegociacao(contrato, acordo);
  if (vez !== 'ambos' && vez !== papel) {
    return erro(res, 409, 'Aguarde a resposta da outra parte sobre o valor em negociação.');
  }

  let alteracoes, evento, mensagem;
  if (acao === 'propor') {
    const { valor, erro: erroValor } = validarValor(req.body?.valor);
    if (erroValor) return erro(res, 400, erroValor);
    if (valor === acordo.valorEmNegociacao) {
      return erro(res, 400, 'Esse já é o valor em negociação. Para concordar com ele, aprove a proposta.');
    }
    alteracoes = {
      precoProposto: valor,
      'negociacao.estado': papel === 'cliente' ? 'aguardando_freelancer' : 'aguardando_cliente'
    };
    evento = { tipo: papel === 'cliente' ? 'proposta' : 'contraproposta', valor };
    mensagem =
      papel === 'cliente'
        ? 'Proposta enviada. Aguardando resposta do freelancer.'
        : 'Contraproposta enviada. Aguardando aprovação do cliente.';
  } else {
    if (vez === 'ambos' || !acordo.valorEmNegociacao) {
      return erro(res, 409, 'Ainda não há um valor proposto para aprovar. Envie uma proposta de valor.');
    }
    // quem aprova pode mandar o valor que viu na tela; se for outro, nada é gravado.
    const visto = req.body?.valor;
    if (visto !== undefined && visto !== null && visto !== '') {
      const conferido = validarValor(visto);
      if (conferido.erro || conferido.valor !== acordo.valorEmNegociacao) return erro(res, 409, MENSAGEM_CONFLITO);
    }
    alteracoes = {
      preco: acordo.valorEmNegociacao,
      precoProposto: null,
      'negociacao.estado': 'fechado',
      ...(contrato.status === 'proposta_pendente' ? { status: 'proposta_aceita' } : {})
    };
    evento = { tipo: 'aceite', valor: acordo.valorEmNegociacao };
    mensagem = 'Valor aprovado. O acordo está fechado.';
  }

  const atualizado = await Contrato.findOneAndUpdate(
    {
      _id: contrato._id,
      status: contrato.status,
      [papel]: userId,
      'negociacao.estado': contrato.negociacao?.estado ?? null,
      precoProposto: contrato.precoProposto ?? null,
      preco: contrato.preco ?? null
    },
    { $set: alteracoes, $push: { historico: { ...evento, autor: userId, papel, data: new Date() } } },
    { new: true }
  );
  if (!atualizado) return erro(res, 409, MENSAGEM_CONFLITO);

  const outraParte = papel === 'cliente' ? atualizado.freelancer : atualizado.cliente;
  const notificar =
    acao === 'propor'
      ? (c, _u, nomeServico) => notificarPropostaValor(outraParte, c._id, nomeServico, papel === 'freelancer')
      : papel === 'freelancer'
        ? (c, _u, nomeServico) => notificarPropostaAceita(c.cliente, c._id, nomeServico)
        : (c, _u, nomeServico) => notificarValorAprovado(c.freelancer, c._id, nomeServico);
  return notificarEResponder(req, res, atualizado, userId, mensagem, notificar);
}

// o freelancer aceita a proposta de um contrato a combinar: é a aprovação do valor que está na mesa.
async function aceitarPropostaACombinar(req, res, dados, erroStatus) {
  if (!ehFreelancer(dados.contrato, dados.userId)) {
    return erro(res, 403, 'Somente o freelancer pode aceitar a proposta.');
  }
  if (dados.contrato.status !== 'proposta_pendente') return erro(res, 400, erroStatus);
  return negociarValor(req, res, 'aceitar', dados);
}

const somenteFreelancer = (erroPapel) => ({
  papel: (contrato, userId) => (ehFreelancer(contrato, userId) ? 'freelancer' : null),
  erroPapel
});
const somenteCliente = (erroPapel) => ({
  papel: (contrato, userId) => (ehCliente(contrato, userId) ? 'cliente' : null),
  erroPapel
});

const TRANSICOES = {
  // freelancer aceita um pedido de preço fixo, que já entra em andamento.
  // contratos a combinar passam por aceitarPropostaACombinar.
  aceitar: {
    ...somenteFreelancer('Somente o freelancer pode aceitar a proposta.'),
    de: () => ['proposta_pendente', 'pendente'],
    erroStatus: 'Este contrato não está aguardando início.',
    exigeAcordo: true,
    para: (contrato) => (contrato.tipoContratacao === 'fixo' ? 'em_andamento' : 'proposta_aceita'),
    mensagem: (contrato) =>
      contrato.tipoContratacao === 'fixo' ? 'Contrato iniciado.' : 'Proposta aceita.',
    notificar: (contrato, _userId, nomeServico) =>
      (contrato.tipoContratacao === 'fixo' ? notificarTrabalhoIniciado : notificarPropostaAceita)(
        contrato.cliente,
        contrato._id,
        nomeServico
      )
  },
  recusar: {
    ...somenteFreelancer('Somente o freelancer pode recusar a proposta.'),
    de: () => ['proposta_pendente', 'pendente'],
    erroStatus: 'Este contrato não pode ser recusado agora.',
    para: () => 'cancelado',
    mensagem: () => 'Proposta recusada.',
    notificar: (contrato, _userId, nomeServico) =>
      notificarPropostaRecusada(contrato.cliente, contrato._id, nomeServico)
  },
  iniciar: {
    ...somenteFreelancer('Somente o freelancer pode iniciar o trabalho.'),
    de: () => ['pendente', 'proposta_aceita'],
    erroStatus: 'Este contrato não pode ser iniciado agora.',
    exigeAcordo: true,
    para: () => 'em_andamento',
    mensagem: () => 'Trabalho iniciado.',
    notificar: (contrato, _userId, nomeServico) =>
      notificarTrabalhoIniciado(contrato.cliente, contrato._id, nomeServico)
  },
  // o freelancer entrega (de novo, depois de um ajuste); só o cliente confirma o recebimento.
  entregar: {
    ...somenteFreelancer('Somente o freelancer pode finalizar a entrega.'),
    de: () => ['proposta_aceita', 'em_andamento'],
    erroStatus: 'Este contrato não pode ser finalizado agora.',
    exigeAcordo: true,
    para: () => 'entregue',
    evento: () => ({ tipo: 'entrega' }),
    mensagem: () => 'Entrega enviada. Aguardando confirmação do cliente.',
    notificar: (contrato, _userId, nomeServico) =>
      notificarEntregaRealizada(contrato.cliente, contrato._id, nomeServico)
  },
  // confirmar e solicitar ajuste partem de "entregue" e gravam condicionados a esse status:
  // se as duas chegarem juntas, só uma vence e a outra recebe 409 (ou 400, se chegar depois).
  confirmar: {
    ...somenteCliente('Somente o cliente pode confirmar a entrega.'),
    de: () => ['entregue'],
    erroStatus: 'Este contrato não possui uma entrega aguardando confirmação.',
    exigeAcordo: true,
    para: () => 'concluido',
    mensagem: () => 'Entrega confirmada. Contrato concluído.',
    // executarTransicao só chama notificar depois que a gravação condicional venceu.
    notificar: (contrato, _userId, nomeServico) =>
      notificarEntregaConfirmada(contrato.freelancer, contrato._id, nomeServico)
  },
  solicitarAjuste: {
    ...somenteCliente('Somente o cliente pode solicitar ajustes.'),
    de: () => ['entregue'],
    erroStatus: 'Só é possível solicitar ajustes enquanto a entrega aguarda confirmação.',
    validar: (req) => validarJustificativa(req.body?.justificativa),
    para: () => 'em_andamento',
    evento: (_contrato, entrada) => ({ tipo: 'ajuste_solicitado', justificativa: entrada.texto }),
    mensagem: () => 'Ajuste solicitado. O freelancer pode enviar uma nova entrega.',
    notificar: (contrato, _userId, nomeServico) =>
      notificarAjusteSolicitado(contrato.freelancer, contrato._id, nomeServico)
  },
  cancelar: {
    papel: (contrato, userId) =>
      ehCliente(contrato, userId) ? 'cliente' : ehFreelancer(contrato, userId) ? 'freelancer' : null,
    erroPapel: 'Este contrato não pode ser cancelado por você neste momento.',
    de: (papel) => PODE_CANCELAR[papel],
    erroStatus: 'Este contrato não pode ser cancelado por você neste momento.',
    codigoErroStatus: 403,
    para: () => 'cancelado',
    mensagem: () => 'Contrato cancelado.',
    notificar: (contrato, userId, nomeServico) => {
      const canceladoPeloCliente = ehCliente(contrato, userId);
      return notificarContratoCancelado(
        canceladoPeloCliente ? contrato.freelancer : contrato.cliente,
        contrato._id,
        nomeServico,
        canceladoPeloCliente ? 'O contratante' : 'O freelancer'
      );
    }
  }
};

function rotaDeTransicao(nome, mensagemErro) {
  return async (req, res) => {
    try {
      return await executarTransicao(req, res, TRANSICOES[nome]);
    } catch (error) {
      console.error(error);
      return erro(res, 500, mensagemErro);
    }
  };
}

function rotaDeNegociacao(acao, mensagemErro) {
  return async (req, res) => {
    try {
      const dados = await carregarContratoAutorizado(req, res);
      if (!dados) return;
      return await negociarValor(req, res, acao, dados);
    } catch (error) {
      console.error(error);
      return erro(res, 500, mensagemErro);
    }
  };
}

exports.aceitar = async (req, res) => {
  try {
    const dados = await carregarContratoAutorizado(req, res);
    if (!dados) return;
    if (dados.contrato.tipoContratacao === 'combinar') {
      return await aceitarPropostaACombinar(req, res, dados, TRANSICOES.aceitar.erroStatus);
    }
    return await executarTransicao(req, res, TRANSICOES.aceitar, dados);
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao aceitar contrato.');
  }
};
exports.recusar = rotaDeTransicao('recusar', 'Erro ao recusar contrato.');
exports.iniciar = rotaDeTransicao('iniciar', 'Erro ao iniciar contrato.');
exports.entregar = rotaDeTransicao('entregar', 'Erro ao finalizar entrega.');
exports.confirmarEntrega = rotaDeTransicao('confirmar', 'Erro ao confirmar entrega.');
exports.solicitarAjuste = rotaDeTransicao('solicitarAjuste', 'Erro ao solicitar ajuste.');
exports.cancelar = rotaDeTransicao('cancelar', 'Erro ao cancelar contrato.');
exports.proporValor = rotaDeNegociacao('propor', 'Erro ao enviar proposta de valor.');
exports.aprovarValor = rotaDeNegociacao('aceitar', 'Erro ao aprovar valor.');

// compatibilidade com o front antigo: PATCH /status vira uma das transições acima,
// com as mesmas permissões, mensagens, regras de acordo e a mesma gravação atômica.
const ACEITAR_PROPOSTA_ANTIGA = {
  ...somenteFreelancer('Sem permissão para fazer esta ação.'),
  de: () => ['proposta_pendente'],
  erroStatus: 'Apenas propostas pendentes podem ser aceitas.',
  exigeAcordo: true,
  para: () => 'proposta_aceita',
  mensagem: () => 'Proposta aceita com sucesso.',
  notificar: (contrato, _userId, nomeServico) =>
    notificarPropostaAceita(contrato.cliente, contrato._id, nomeServico)
};
const INICIAR_ANTIGO = {
  ...somenteFreelancer('Sem permissão para fazer esta ação.'),
  de: () => ['pendente', 'proposta_aceita'],
  erroStatus: 'Este contrato não pode ser iniciado neste momento.',
  exigeAcordo: true,
  para: () => 'em_andamento',
  mensagem: () => 'Contrato iniciado.',
  notificar: TRANSICOES.iniciar.notificar
};
// no fluxo antigo, "em andamento" sobre proposta pendente significa aceitar a proposta.
const EM_ANDAMENTO_ANTIGO = {
  ...INICIAR_ANTIGO,
  de: () => ['pendente', 'proposta_aceita', 'proposta_pendente'],
  para: (contrato) => (contrato.status === 'proposta_pendente' ? 'proposta_aceita' : 'em_andamento'),
  mensagem: (contrato) =>
    contrato.status === 'proposta_pendente' ? 'Proposta aceita com sucesso.' : 'Contrato iniciado.',
  notificar: (contrato, userId, nomeServico) =>
    (contrato.status === 'proposta_aceita' ? ACEITAR_PROPOSTA_ANTIGA : INICIAR_ANTIGO).notificar(
      contrato,
      userId,
      nomeServico
    )
};
const STATUS_ROTA_ANTIGA = ['cancelado', 'concluido', 'proposta_aceita', 'em_andamento'];

exports.atualizarStatus = async (req, res) => {
  try {
    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    if (!STATUS_ROTA_ANTIGA.includes(status)) return erro(res, 400, 'Status inválido.');
    const dados = await carregarContratoAutorizado(req, res);
    if (!dados) return;
    if (status === 'cancelado') return await executarTransicao(req, res, TRANSICOES.cancelar, dados);
    if (status === 'concluido') return await executarTransicao(req, res, TRANSICOES.confirmar, dados);
    const { contrato } = dados;
    // aceitar proposta a combinar pela rota antiga segue a mesma regra de acordo da rota nova.
    if (contrato.tipoContratacao === 'combinar' && (status === 'proposta_aceita' || contrato.status === 'proposta_pendente')) {
      return await aceitarPropostaACombinar(req, res, dados, ACEITAR_PROPOSTA_ANTIGA.erroStatus);
    }
    if (status === 'proposta_aceita') return await executarTransicao(req, res, ACEITAR_PROPOSTA_ANTIGA, dados);
    return await executarTransicao(req, res, EM_ANDAMENTO_ANTIGO, dados);
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao atualizar contrato.');
  }
};

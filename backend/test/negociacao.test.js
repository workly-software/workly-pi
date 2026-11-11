const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarAmbiente } = require('./helpers/apiTeste');

let amb, Contrato, Servico, Categoria, Notificacao, Mensagem;
let freelancer, cliente, terceiro, categoria;

test.before(async () => {
  amb = await iniciarAmbiente('negociacao');
  if (!amb) return;
  Contrato = require('../src/models/Contrato');
  Servico = require('../src/models/Servico');
  Categoria = require('../src/models/Categoria');
  Notificacao = require('../src/models/Notificacao');
  Mensagem = require('../src/models/Mensagem');
  assert.equal((await Contrato.garantirIndicesContrato()).instalado, true);
  freelancer = await amb.criarUsuario('Freelancer');
  cliente = await amb.criarUsuario();
  terceiro = await amb.criarUsuario();
  categoria = await Categoria.create({ legacyId: 1, nome: 'Design', slug: 'design' });
});
test.after(async () => amb?.encerrar());

const pular = (t) => (!amb ? t.skip('MongoDB local indisponível') : false);
const servicoACombinar = () =>
  Servico.create({ nome: 'Identidade visual', descricao: 'd', preco: null, valorCombinar: true, categoria: categoria._id, freelancer: freelancer._id });
const servicoFixo = () =>
  Servico.create({ nome: 'Logotipo', descricao: 'd', preco: 200, categoria: categoria._id, freelancer: freelancer._id });
const rota = (contrato, acao) => `/api/contratos/${contrato.idContrato || contrato._id}/${acao}`;
async function notificacoes(contratoId, tipo, destinatario) {
  const lista = await Notificacao.find({ referenciaId: contratoId, tipo }).lean();
  assert.deepEqual(
    lista.map((n) => String(n.destinatario)),
    lista.map(() => String(destinatario._id)),
    `destinatário de ${tipo}`
  );
  return lista.length;
}

async function proposta(valor) {
  const servico = await servicoACombinar();
  const corpo = { servicoId: String(servico._id), mensagem: 'Preciso de uma marca nova.' };
  if (valor !== undefined) corpo.precoProposto = valor;
  const resposta = await amb.chamar('POST', '/api/contratos', cliente, corpo);
  assert.equal(resposta.status, 201);
  return resposta.dados.dados;
}

test('aceite direto: o freelancer aceita o valor do cliente e o acordo fecha', async (t) => {
  if (pular(t)) return;
  const criado = await proposta(300);
  assert.equal(criado.preco, null, 'sem acordo, não há preço aprovado');
  assert.equal(criado.precoProposto, 300);
  assert.deepEqual(
    { estado: criado.negociacao.estado, vez: criado.negociacao.vez },
    { estado: 'aguardando_freelancer', vez: 'freelancer' }
  );
  assert.equal((await amb.chamar('POST', rota(criado, 'iniciar'), freelancer)).status, 400);

  const aceite = await amb.chamar('POST', rota(criado, 'aceitar'), freelancer);
  assert.equal(aceite.status, 200);
  assert.equal(aceite.dados.dados.status, 'proposta_aceita');
  assert.equal(aceite.dados.dados.preco, 300);
  assert.equal(aceite.dados.dados.negociacao.estado, 'fechado');

  const salvo = await Contrato.findById(criado.idContrato).lean();
  assert.equal(salvo.preco, 300);
  assert.equal(salvo.precoProposto, null);
  assert.deepEqual(
    salvo.historico.map((e) => [e.tipo, e.papel, e.valor, String(e.autor)]),
    [
      ['proposta', 'cliente', 300, String(cliente._id)],
      ['aceite', 'freelancer', 300, String(freelancer._id)]
    ]
  );
  assert.ok(salvo.historico.every((e) => e.data instanceof Date));
  assert.equal(await notificacoes(salvo._id, 'proposta_aceita', cliente), 1);
  assert.equal((await amb.chamar('POST', rota(criado, 'iniciar'), freelancer)).status, 200);
});

test('contraproposta: o cliente precisa aprovar explicitamente o valor do freelancer', async (t) => {
  if (pular(t)) return;
  const criado = await proposta(300);
  const contra = await amb.chamar('POST', rota(criado, 'propor-valor'), freelancer, { valor: 450 });
  assert.equal(contra.status, 200);
  assert.equal(contra.dados.dados.status, 'proposta_pendente');
  assert.equal(contra.dados.dados.negociacao.vez, 'cliente');
  assert.equal(contra.dados.dados.precoProposto, 450);
  assert.equal(await notificacoes(criado.idContrato, 'proposta_valor', cliente), 1);

  assert.equal((await amb.chamar('POST', rota(criado, 'aceitar'), freelancer)).status, 409);
  assert.equal((await amb.chamar('POST', rota(criado, 'aprovar-valor'), freelancer)).status, 409);
  assert.equal((await amb.chamar('POST', rota(criado, 'iniciar'), freelancer)).status, 400);
  assert.equal((await amb.chamar('POST', rota(criado, 'aprovar-valor'), cliente, { valor: 300 })).status, 409);
  assert.equal((await Contrato.findById(criado.idContrato)).negociacao.estado, 'aguardando_cliente');

  const aprovado = await amb.chamar('POST', rota(criado, 'aprovar-valor'), cliente, { valor: 450 });
  assert.equal(aprovado.status, 200);
  assert.equal(aprovado.dados.dados.status, 'proposta_aceita');
  assert.equal(aprovado.dados.dados.preco, 450);
  const salvo = await Contrato.findById(criado.idContrato).lean();
  assert.deepEqual(salvo.historico.map((e) => [e.tipo, e.papel, e.valor]), [
    ['proposta', 'cliente', 300],
    ['contraproposta', 'freelancer', 450],
    ['aceite', 'cliente', 450]
  ]);
  assert.equal(await notificacoes(salvo._id, 'valor_aprovado', freelancer), 1);
  assert.equal(aprovado.dados.dados.historico.length, 3);
});

test('alteração unilateral: ninguém muda o valor fora da vez nem depois do acordo', async (t) => {
  if (pular(t)) return;
  const criado = await proposta(300);
  assert.equal((await amb.chamar('POST', rota(criado, 'propor-valor'), cliente, { valor: 100 })).status, 409);
  assert.equal((await amb.chamar('POST', rota(criado, 'aprovar-valor'), cliente)).status, 409);
  assert.equal((await amb.chamar('POST', rota(criado, 'propor-valor'), freelancer, { valor: 500 })).status, 200);
  assert.equal((await amb.chamar('POST', rota(criado, 'propor-valor'), freelancer, { valor: 900 })).status, 409);
  for (const valor of [-5, 0, 'abc', 10.555, '1e3', { $gt: 0 }, [500], null, 2000000]) {
    const resposta = await amb.chamar('POST', rota(criado, 'propor-valor'), cliente, { valor });
    assert.equal(resposta.status, 400, `valor ${JSON.stringify(valor)}`);
  }
  assert.equal((await amb.chamar('POST', rota(criado, 'aprovar-valor'), cliente, { valor: 500 })).status, 200);

  for (const usuario of [cliente, freelancer]) {
    assert.equal((await amb.chamar('POST', rota(criado, 'propor-valor'), usuario, { valor: 1 })).status, 409);
    assert.equal((await amb.chamar('POST', rota(criado, 'aprovar-valor'), usuario)).status, 409);
  }
  assert.equal((await amb.chamar('POST', rota(criado, 'aceitar'), freelancer)).status, 400);
  await amb.chamar('PATCH', rota(criado, 'status'), freelancer, { status: 'em_andamento', preco: 1, precoProposto: 1 });
  const salvo = await Contrato.findById(criado.idContrato).lean();
  assert.equal(salvo.preco, 500);
  assert.equal(salvo.status, 'em_andamento');

  const semValor = await proposta();
  assert.equal(semValor.precoProposto, null);
  const aceite = await amb.chamar('POST', rota(semValor, 'aceitar'), freelancer);
  assert.equal(aceite.status, 409);
  assert.match(aceite.dados.mensagem, /valor proposto/);
  const legado = await amb.chamar('PATCH', rota(semValor, 'status'), freelancer, { status: 'em_andamento' });
  assert.equal(legado.status, 409);
  assert.equal((await Contrato.findById(semValor.idContrato)).status, 'proposta_pendente');
});

test('aceitar e contrapropor ao mesmo tempo: só uma ação vence', async (t) => {
  if (pular(t)) return;
  for (let rodada = 0; rodada < 6; rodada += 1) {
    const criado = await proposta(300);
    const [aceite, contra] = await Promise.all([
      amb.chamar('POST', rota(criado, 'aceitar'), freelancer),
      amb.chamar('POST', rota(criado, 'propor-valor'), freelancer, { valor: 700 })
    ]);
    assert.equal([aceite, contra].filter((r) => r.status === 200).length, 1);
    const salvo = await Contrato.findById(criado.idContrato).lean();
    if (aceite.status === 200) {
      assert.deepEqual([salvo.negociacao.estado, salvo.preco, salvo.precoProposto], ['fechado', 300, null]);
    } else {
      assert.deepEqual([salvo.negociacao.estado, salvo.preco, salvo.precoProposto], ['aguardando_cliente', null, 700]);
    }
    assert.equal(salvo.historico.length, 2);
  }
});

test('preço fixo: definido pelo servidor, sem negociação', async (t) => {
  if (pular(t)) return;
  const servico = await servicoFixo();
  const criado = await amb.chamar('POST', '/api/contratos', cliente, {
    servicoId: String(servico._id), detalhesPedido: 'logo', preco: 1, precoProposto: 1
  });
  assert.equal(criado.status, 201);
  const contrato = criado.dados.dados;
  assert.equal(contrato.preco, 200);
  assert.equal(contrato.precoProposto, null);
  assert.equal(contrato.negociacao.estado, 'fechado');
  assert.equal(contrato.negociacao.vez, null);
  for (const usuario of [cliente, freelancer]) {
    assert.equal((await amb.chamar('POST', rota(contrato, 'propor-valor'), usuario, { valor: 1 })).status, 400);
  }
  assert.equal((await amb.chamar('POST', rota(contrato, 'aceitar'), freelancer)).status, 200);
  assert.equal((await Contrato.findById(contrato.idContrato)).preco, 200);
});

test('contrato antigo sem preço fica pendente de acordo; concluídos não são alterados', async (t) => {
  if (pular(t)) return;
  const raw = Contrato.collection;
  const base = { cliente: cliente._id, freelancer: freelancer._id, tipoContratacao: 'combinar', createdAt: new Date(), updatedAt: new Date() };
  const { insertedId: antigoId } = await raw.insertOne({ ...base, servico: (await servicoACombinar())._id, status: 'em_andamento', preco: null, precoProposto: null });
  const { insertedId: concluidoId } = await raw.insertOne({ ...base, servico: (await servicoACombinar())._id, status: 'concluido', preco: null, precoProposto: null });
  const concluidoAntes = await raw.findOne({ _id: concluidoId });

  const meus = await amb.chamar('GET', '/api/contratos/meus', cliente);
  const antigo = meus.dados.dados.find((c) => c.idContrato === String(antigoId));
  assert.equal(antigo.negociacao.estado, 'pendente_acordo');
  assert.equal(antigo.preco, null);
  const concluido = meus.dados.dados.find((c) => c.idContrato === String(concluidoId));
  assert.equal(concluido.negociacao.estado, 'pendente_acordo');
  assert.deepEqual(await raw.findOne({ _id: concluidoId }), concluidoAntes, 'leitura não grava nada');
  assert.equal((await amb.chamar('POST', rota({ _id: concluidoId }, 'propor-valor'), freelancer, { valor: 100 })).status, 400);
  assert.deepEqual(await raw.findOne({ _id: concluidoId }), concluidoAntes);

  assert.equal((await amb.chamar('POST', rota({ _id: antigoId }, 'entregar'), freelancer)).status, 409);
  assert.equal((await amb.chamar('POST', rota({ _id: antigoId }, 'aprovar-valor'), freelancer)).status, 409);
  assert.equal((await amb.chamar('POST', rota({ _id: antigoId }, 'propor-valor'), freelancer, { valor: 500 })).status, 200);
  assert.equal((await amb.chamar('POST', rota({ _id: antigoId }, 'aprovar-valor'), cliente, { valor: 500 })).status, 200);
  const acordado = await Contrato.findById(antigoId).lean();
  assert.deepEqual([acordado.status, acordado.preco, acordado.negociacao.estado], ['em_andamento', 500, 'fechado']);
  assert.equal((await amb.chamar('POST', rota({ _id: antigoId }, 'entregar'), freelancer)).status, 200);

  const { insertedId: aceitoId } = await raw.insertOne({ ...base, servico: (await servicoACombinar())._id, status: 'proposta_aceita', preco: 250, precoProposto: 250 });
  assert.equal((await amb.chamar('POST', rota({ _id: aceitoId }, 'iniciar'), freelancer)).status, 200);
  assert.equal((await Contrato.findById(aceitoId)).preco, 250);
});

async function contratoEntregue() {
  const servico = await servicoFixo();
  return Contrato.create({ cliente: cliente._id, freelancer: freelancer._id, servico: servico._id, preco: 200, tipoContratacao: 'fixo', status: 'entregue' });
}

test('ajustes: o cliente justifica, o contrato volta para em andamento e aceita nova entrega', async (t) => {
  if (pular(t)) return;
  const contrato = await contratoEntregue();
  const justificativa = 'As cores não seguem o manual da marca.';
  assert.equal((await amb.chamar('POST', rota(contrato, 'solicitar-ajuste'), cliente, {})).status, 400);
  assert.equal((await amb.chamar('POST', rota(contrato, 'solicitar-ajuste'), cliente, { justificativa: 'curta' })).status, 400);
  assert.equal((await amb.chamar('POST', rota(contrato, 'solicitar-ajuste'), cliente, { justificativa: { $ne: '' } })).status, 400);
  assert.equal((await amb.chamar('POST', rota(contrato, 'solicitar-ajuste'), freelancer, { justificativa })).status, 403);
  assert.equal((await Contrato.findById(contrato._id)).status, 'entregue');

  const ajuste = await amb.chamar('POST', rota(contrato, 'solicitar-ajuste'), cliente, { justificativa });
  assert.equal(ajuste.status, 200);
  assert.equal(ajuste.dados.dados.status, 'em_andamento');
  assert.equal(await notificacoes(contrato._id, 'ajuste_solicitado', freelancer), 1);
  assert.equal((await amb.chamar('POST', rota(contrato, 'solicitar-ajuste'), cliente, { justificativa })).status, 400);

  assert.equal((await amb.chamar('POST', rota(contrato, 'entregar'), freelancer)).status, 200);
  const salvo = await Contrato.findById(contrato._id).lean();
  assert.equal(salvo.status, 'entregue');
  assert.deepEqual(salvo.historico.map((e) => [e.tipo, e.papel, e.justificativa]), [
    ['ajuste_solicitado', 'cliente', justificativa],
    ['entrega', 'freelancer', '']
  ]);
  assert.equal((await amb.chamar('POST', rota(contrato, 'confirmar'), cliente)).status, 200);
});

test('corrida entre confirmar entrega e solicitar ajuste: só uma vence', async (t) => {
  if (pular(t)) return;
  const venceu = { confirmar: 0, ajuste: 0 };
  for (let rodada = 0; rodada < 12; rodada += 1) {
    const contrato = await contratoEntregue();
    const chamadas = [
      () => amb.chamar('POST', rota(contrato, 'confirmar'), cliente),
      () => amb.chamar('POST', rota(contrato, 'solicitar-ajuste'), cliente, { justificativa: 'Faltou a versão em preto e branco.' })
    ];
    const ordem = rodada % 2 ? [1, 0] : [0, 1];
    const respostas = await Promise.all(ordem.map((i) => chamadas[i]()));
    const [confirmar, ajuste] = ordem[0] === 0 ? respostas : [respostas[1], respostas[0]];
    assert.equal([confirmar, ajuste].filter((r) => r.status === 200).length, 1);
    assert.ok([confirmar, ajuste].some((r) => [400, 409].includes(r.status)));
    const salvo = await Contrato.findById(contrato._id).lean();
    const ajusteVenceu = ajuste.status === 200;
    venceu[ajusteVenceu ? 'ajuste' : 'confirmar'] += 1;
    assert.equal(salvo.status, ajusteVenceu ? 'em_andamento' : 'concluido');
    assert.equal((salvo.historico || []).filter((e) => e.tipo === 'ajuste_solicitado').length, ajusteVenceu ? 1 : 0);
    assert.equal(await notificacoes(contrato._id, 'ajuste_solicitado', freelancer), ajusteVenceu ? 1 : 0);
  }
  t.diagnostic(`vitórias: confirmar ${venceu.confirmar}, ajuste ${venceu.ajuste}`);
});

test('corrida determinística: confirmação gravada entre a leitura e a gravação do ajuste vence', async (t) => {
  if (pular(t)) return;
  for (const [perdedora, vencedora, statusFinal] of [
    ['solicitar-ajuste', { status: 'concluido' }, 'concluido'],
    ['confirmar', { status: 'em_andamento' }, 'em_andamento']
  ]) {
    const contrato = await contratoEntregue();
    const original = Contrato.findOneAndUpdate;
    const mock = t.mock.method(Contrato, 'findOneAndUpdate', async function (...args) {
      await Contrato.updateOne({ _id: contrato._id, status: 'entregue' }, { $set: vencedora });
      return original.apply(this, args);
    });
    const resposta = await amb.chamar('POST', rota(contrato, perdedora), cliente, { justificativa: 'Faltou a versão em preto e branco.' });
    mock.mock.restore();
    assert.equal(resposta.status, 409);
    const salvo = await Contrato.findById(contrato._id).lean();
    assert.equal(salvo.status, statusFinal);
    assert.equal(salvo.historico, undefined, 'a ação perdedora não deixa rastro no histórico');
  }
});

test('chat: leitura continua depois do encerramento e novos envios são bloqueados', async (t) => {
  if (pular(t)) return;
  const criado = await proposta(300);
  const enviar = (usuario) => amb.chamar('POST', '/api/mensagens', usuario, { contratoId: criado.idContrato, texto: 'Olá!' });
  assert.equal((await enviar(cliente)).status, 201);
  assert.equal((await amb.chamar('POST', rota(criado, 'cancelar'), cliente)).status, 200);

  for (const usuario of [cliente, freelancer]) {
    const bloqueado = await enviar(usuario);
    assert.equal(bloqueado.status, 409);
    assert.match(bloqueado.dados.mensagem, /histórico continua disponível/);
    const leitura = await amb.chamar('GET', `/api/mensagens/contrato/${criado.idContrato}`, usuario);
    assert.equal(leitura.status, 200);
    assert.deepEqual(leitura.dados.dados.map((m) => m.texto), ['Olá!']);
  }
  assert.equal(await Mensagem.countDocuments({ contrato: criado.idContrato }), 1);

  const concluido = await contratoEntregue();
  await Contrato.updateOne({ _id: concluido._id }, { status: 'concluido' });
  assert.equal((await amb.chamar('POST', '/api/mensagens', freelancer, { contratoId: String(concluido._id), texto: 'oi' })).status, 409);
});

test('autorização: terceiros não negociam, não pedem ajuste e não acessam o chat', async (t) => {
  if (pular(t)) return;
  const criado = await proposta(300);
  const entregue = await contratoEntregue();
  const tentativas = [
    ['POST', rota(criado, 'aceitar')],
    ['POST', rota(criado, 'propor-valor'), { valor: 10 }],
    ['POST', rota(criado, 'aprovar-valor'), { valor: 300 }],
    ['PATCH', rota(criado, 'status'), { status: 'proposta_aceita' }],
    ['POST', rota(entregue, 'solicitar-ajuste'), { justificativa: 'Quero mudar tudo agora.' }],
    ['POST', rota(entregue, 'confirmar')],
    ['GET', `/api/mensagens/contrato/${criado.idContrato}`],
    ['POST', '/api/mensagens', { contratoId: criado.idContrato, texto: 'intruso' }]
  ];
  for (const [metodo, caminho, corpo] of tentativas) {
    const resposta = await amb.chamar(metodo, caminho, terceiro, corpo);
    assert.equal(resposta.status, 403, `${metodo} ${caminho}`);
  }
  const salvo = await Contrato.findById(criado.idContrato).lean();
  assert.deepEqual([salvo.status, salvo.precoProposto, salvo.historico.length], ['proposta_pendente', 300, 1]);
  assert.equal((await Contrato.findById(entregue._id)).status, 'entregue');
  assert.equal(await Mensagem.countDocuments({ contrato: criado.idContrato }), 0);
  assert.equal((await amb.chamar('POST', rota(criado, 'aceitar'), cliente)).status, 403);
  assert.equal((await amb.chamar('POST', rota(criado, 'aprovar-valor'), cliente)).status, 409);
});

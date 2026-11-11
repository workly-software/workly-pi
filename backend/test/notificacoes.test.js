const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarAmbiente } = require('./helpers/apiTeste');
const { TIPOS_ESSENCIAIS, PREFERENCIA_POR_TIPO } = require('../src/utils/notificacaoUtils');

let amb, Contrato, Servico, Categoria, Notificacao, Mensagem, Usuario;
let categoria;

test.before(async () => {
  amb = await iniciarAmbiente('notificacoes');
  if (!amb) return;
  Contrato = require('../src/models/Contrato');
  Servico = require('../src/models/Servico');
  Categoria = require('../src/models/Categoria');
  Notificacao = require('../src/models/Notificacao');
  Mensagem = require('../src/models/Mensagem');
  Usuario = require('../src/models/Usuario');
  assert.equal((await Contrato.garantirIndicesContrato()).instalado, true);
  categoria = await Categoria.create({ legacyId: 1, nome: 'Design', slug: 'design' });
});
test.after(async () => amb?.encerrar());

const pular = (t) => (!amb ? t.skip('MongoDB local indisponível') : false);
const silenciar = (t) => {
  const original = console.error;
  console.error = () => {};
  t.after(() => (console.error = original));
};

async function cenario({ freelancerAvisos = true, clienteAvisos = true } = {}) {
  const freelancer = await amb.criarUsuario('Freelancer');
  const cliente = await amb.criarUsuario();
  for (const [usuario, ligado] of [[freelancer, freelancerAvisos], [cliente, clienteAvisos]]) {
    const resposta = await amb.chamar('PUT', '/api/usuarios/perfil', usuario, { notificacoesPropostas: ligado });
    assert.equal(resposta.status, 200);
  }
  const servico = await Servico.create({ nome: 'Logotipo', descricao: 'd', preco: 200, categoria: categoria._id, freelancer: freelancer._id });
  return { freelancer, cliente, servico };
}
const pedir = (cliente, servico) =>
  amb.chamar('POST', '/api/contratos', cliente, { servicoId: String(servico._id), detalhesPedido: 'logo novo' });
const doTipo = (tipo, referenciaId) => Notificacao.find({ tipo, ...(referenciaId ? { referenciaId } : {}) }).lean();

test('cada tipo de notificação é essencial ou tem uma preferência, nunca as duas coisas', () => {
  const tipos = require('../src/models/Notificacao').schema.path('tipo').enumValues;
  for (const tipo of tipos) {
    const essencial = TIPOS_ESSENCIAIS.includes(tipo);
    const comPreferencia = Boolean(PREFERENCIA_POR_TIPO[tipo]);
    assert.ok(essencial !== comPreferencia, `tipo ${tipo}`);
  }
  assert.deepEqual([...new Set(Object.values(PREFERENCIA_POR_TIPO))], ['notificacoesPropostas']);
});

test('preferência desligada suprime pedidos e mensagens; ligada entrega ao destinatário certo', async (t) => {
  if (pular(t)) return;
  const desligado = await cenario({ freelancerAvisos: false, clienteAvisos: false });
  const pedido = await pedir(desligado.cliente, desligado.servico);
  assert.equal(pedido.status, 201, 'a ação continua funcionando');
  const contratoId = pedido.dados.dados.idContrato;
  assert.equal((await doTipo('contrato_novo', contratoId)).length, 0);
  const mensagem = await amb.chamar('POST', '/api/mensagens', desligado.cliente, { contratoId, texto: 'Oi!' });
  assert.equal(mensagem.status, 201);
  assert.equal(await Mensagem.countDocuments({ contrato: contratoId }), 1);
  assert.equal((await Notificacao.find({ destinatario: desligado.freelancer._id, tipo: 'mensagem_nova' })).length, 0);

  const ligado = await cenario();
  const outro = await pedir(ligado.cliente, ligado.servico);
  const novos = await doTipo('contrato_novo', outro.dados.dados.idContrato);
  assert.deepEqual(novos.map((n) => String(n.destinatario)), [String(ligado.freelancer._id)]);
  await amb.chamar('POST', '/api/mensagens', ligado.freelancer, { contratoId: outro.dados.dados.idContrato, texto: 'Olá' });
  const mensagens = await Notificacao.find({ tipo: 'mensagem_nova', destinatario: { $in: [ligado.cliente._id, ligado.freelancer._id] } }).lean();
  assert.deepEqual(mensagens.map((n) => String(n.destinatario)), [String(ligado.cliente._id)]);
});

test('notificações essenciais chegam mesmo com a preferência desligada', async (t) => {
  if (pular(t)) return;
  const { freelancer, cliente, servico } = await cenario({ freelancerAvisos: false, clienteAvisos: false });
  const contratoId = (await pedir(cliente, servico)).dados.dados.idContrato;
  const rota = (acao) => `/api/contratos/${contratoId}/${acao}`;
  assert.equal((await amb.chamar('POST', rota('aceitar'), freelancer)).status, 200);
  assert.equal((await amb.chamar('POST', rota('entregar'), freelancer)).status, 200);
  assert.equal(
    (await amb.chamar('POST', rota('solicitar-ajuste'), cliente, { justificativa: 'Faltou a versão horizontal.' })).status,
    200
  );
  const para = async (tipo) => (await doTipo(tipo, contratoId)).map((n) => String(n.destinatario));
  assert.deepEqual(await para('trabalho_iniciado'), [String(cliente._id)]);
  assert.deepEqual(await para('entrega_realizada'), [String(cliente._id)]);
  assert.deepEqual(await para('ajuste_solicitado'), [String(freelancer._id)]);
  assert.equal((await amb.chamar('POST', rota('cancelar'), freelancer)).status, 200);
  assert.deepEqual(await para('contrato_cancelado'), [String(cliente._id)]);
});

test('terceiro não marca como lida nem remove a notificação de outro usuário', async (t) => {
  if (pular(t)) return;
  const { freelancer, cliente, servico } = await cenario();
  const terceiro = await amb.criarUsuario();
  const contratoId = (await pedir(cliente, servico)).dados.dados.idContrato;
  const [alvo] = await doTipo('contrato_novo', contratoId);
  assert.ok(alvo);
  assert.equal((await amb.chamar('PATCH', `/api/notificacoes/${alvo._id}/lida`, terceiro)).status, 404);
  assert.equal((await amb.chamar('DELETE', `/api/notificacoes/${alvo._id}`, terceiro)).status, 404);
  assert.equal((await amb.chamar('PATCH', `/api/notificacoes/${alvo._id}/lida`, cliente)).status, 404, 'a outra parte do contrato também não');
  const salvo = await Notificacao.findById(alvo._id).lean();
  assert.equal(salvo.lida, false);
  const lista = await amb.chamar('GET', '/api/notificacoes', terceiro);
  assert.ok(!lista.dados.dados.some((n) => String(n._id) === String(alvo._id)));
  assert.equal((await amb.chamar('PATCH', `/api/notificacoes/${alvo._id}/lida`, freelancer)).status, 200);
  assert.equal((await Notificacao.findById(alvo._id)).lida, true);
});

test('"marcar todas como lidas" afeta só o usuário autenticado', async (t) => {
  if (pular(t)) return;
  const { freelancer, cliente, servico } = await cenario();
  const contratoId = (await pedir(cliente, servico)).dados.dados.idContrato;
  await amb.chamar('POST', `/api/contratos/${contratoId}/aceitar`, freelancer);
  assert.equal(await Notificacao.countDocuments({ destinatario: freelancer._id, lida: false }), 1);
  assert.equal(await Notificacao.countDocuments({ destinatario: cliente._id, lida: false }), 1);
  assert.equal((await amb.chamar('PATCH', '/api/notificacoes/todas-lidas', cliente)).status, 200);
  assert.equal(await Notificacao.countDocuments({ destinatario: cliente._id, lida: false }), 0);
  assert.equal(await Notificacao.countDocuments({ destinatario: freelancer._id, lida: false }), 1);
});

test('nenhuma notificação é criada quando a gravação da ação falha', async (t) => {
  if (pular(t)) return;
  silenciar(t);
  const { freelancer, cliente, servico } = await cenario();

  const criacao = t.mock.method(Contrato, 'create', async () => {
    throw new Error('banco indisponível');
  });
  assert.equal((await pedir(cliente, servico)).status, 500);
  criacao.mock.restore();
  assert.equal(await Notificacao.countDocuments({ destinatario: freelancer._id }), 0);

  const contratoId = (await pedir(cliente, servico)).dados.dados.idContrato;
  await amb.chamar('POST', `/api/contratos/${contratoId}/aceitar`, freelancer);
  const transicao = t.mock.method(Contrato, 'findOneAndUpdate', async () => {
    throw new Error('banco indisponível');
  });
  assert.equal((await amb.chamar('POST', `/api/contratos/${contratoId}/entregar`, freelancer)).status, 500);
  transicao.mock.restore();
  assert.equal((await doTipo('entrega_realizada', contratoId)).length, 0);
  assert.equal((await Contrato.findById(contratoId)).status, 'em_andamento');

  const envio = t.mock.method(Mensagem, 'create', async () => {
    throw new Error('banco indisponível');
  });
  assert.equal((await amb.chamar('POST', '/api/mensagens', cliente, { contratoId, texto: 'Oi' })).status, 500);
  envio.mock.restore();
  assert.equal(await Notificacao.countDocuments({ tipo: 'mensagem_nova', destinatario: freelancer._id }), 0);
});

test('perfil: salvar só a preferência de propostas não altera e-mail nem marketing', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  await Usuario.updateOne({ _id: usuario._id }, { notificacoesEmail: true, notificacoesMarketing: true });
  assert.equal((await amb.chamar('PUT', '/api/usuarios/perfil', usuario, { notificacoesPropostas: false })).status, 200);
  const salvo = await Usuario.findById(usuario._id).lean();
  assert.deepEqual([salvo.notificacoesPropostas, salvo.notificacoesEmail, salvo.notificacoesMarketing], [false, true, true]);
});

test('sino: com a preferência desligada não conta mensagens, e o chat continua contando', async (t) => {
  if (pular(t)) return;
  const desligado = await cenario({ freelancerAvisos: false });
  const contratoId = (await pedir(desligado.cliente, desligado.servico)).dados.dados.idContrato;
  assert.equal((await amb.chamar('POST', '/api/mensagens', desligado.cliente, { contratoId, texto: 'Oi!' })).status, 201);
  const sino = await amb.chamar('GET', '/api/mensagens/nao-lidas?contexto=sino', desligado.freelancer);
  assert.equal(sino.dados.dados.naoLidas, 0);
  const real = await amb.chamar('GET', '/api/mensagens/nao-lidas', desligado.freelancer);
  assert.equal(real.dados.dados.naoLidas, 1, 'sem o contexto do sino, a contagem real continua');
  const resumo = await amb.chamar('GET', '/api/mensagens/resumo', desligado.freelancer);
  assert.deepEqual(resumo.dados.dados.map((r) => [r.contratoId, r.naoLidas]), [[contratoId, 1]]);

  const ligado = await cenario();
  const outro = (await pedir(ligado.cliente, ligado.servico)).dados.dados.idContrato;
  await amb.chamar('POST', '/api/mensagens', ligado.cliente, { contratoId: outro, texto: 'Oi!' });
  const sinoLigado = await amb.chamar('GET', '/api/mensagens/nao-lidas?contexto=sino', ligado.freelancer);
  assert.equal(sinoLigado.dados.dados.naoLidas, 1);
});

async function contratoEntregue(preferencias) {
  const partes = await cenario(preferencias);
  const contratoId = (await pedir(partes.cliente, partes.servico)).dados.dados.idContrato;
  assert.equal((await amb.chamar('POST', `/api/contratos/${contratoId}/aceitar`, partes.freelancer)).status, 200);
  assert.equal((await amb.chamar('POST', `/api/contratos/${contratoId}/entregar`, partes.freelancer)).status, 200);
  return { ...partes, contratoId };
}

test('confirmar a entrega avisa o freelancer, mesmo com a preferência desligada', async (t) => {
  if (pular(t)) return;
  const { freelancer, cliente, contratoId } = await contratoEntregue({ freelancerAvisos: false, clienteAvisos: false });
  assert.equal((await amb.chamar('POST', `/api/contratos/${contratoId}/confirmar`, cliente)).status, 200);
  const avisos = await doTipo('entrega_confirmada', contratoId);
  assert.deepEqual(avisos.map((n) => String(n.destinatario)), [String(freelancer._id)]);
});

test('confirmação que perde a corrida para o ajuste não cria entrega_confirmada', async (t) => {
  if (pular(t)) return;
  const { cliente, contratoId } = await contratoEntregue();
  const original = Contrato.findOneAndUpdate;
  const mock = t.mock.method(Contrato, 'findOneAndUpdate', async function (...args) {
    await Contrato.updateOne({ _id: contratoId, status: 'entregue' }, { $set: { status: 'em_andamento' } });
    return original.apply(this, args);
  });
  const resposta = await amb.chamar('POST', `/api/contratos/${contratoId}/confirmar`, cliente);
  mock.mock.restore();
  assert.equal(resposta.status, 409);
  assert.equal((await doTipo('entrega_confirmada', contratoId)).length, 0);
  assert.equal((await Contrato.findById(contratoId)).status, 'em_andamento');
});

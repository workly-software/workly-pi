const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarAmbiente } = require('./helpers/apiTeste');

let amb, Contrato, Servico, Categoria, Notificacao, Avaliacao;
let freelancer, cliente, categoria;

test.before(async () => {
  amb = await iniciarAmbiente('concorrencia');
  if (!amb) return;
  Contrato = require('../src/models/Contrato');
  Servico = require('../src/models/Servico');
  Categoria = require('../src/models/Categoria');
  Notificacao = require('../src/models/Notificacao');
  Avaliacao = require('../src/models/Avaliacao');
  const instalacao = await Contrato.garantirIndicesContrato();
  assert.equal(instalacao.instalado, true);
  await Avaliacao.init();
  freelancer = await amb.criarUsuario('Freelancer');
  cliente = await amb.criarUsuario();
  categoria = await Categoria.create({ legacyId: 1, nome: 'Design', slug: 'design' });
});
test.after(async () => amb?.encerrar());

const pular = (t) => (!amb ? t.skip('MongoDB local indisponível') : false);
const novoServico = (extra = {}) =>
  Servico.create({ nome: 'Serviço', descricao: 'd', preco: 200, categoria: categoria._id, freelancer: freelancer._id, ...extra });
const contagem = (lista) => lista.reduce((mapa, r) => ({ ...mapa, [r.status]: (mapa[r.status] || 0) + 1 }), {});
const notificacoes = (contratoId, tipo) => Notificacao.countDocuments({ referenciaId: contratoId, ...(tipo ? { tipo } : {}) });

test('índice único parcial está instalado com os status ativos, incluindo entregue', async (t) => {
  if (pular(t)) return;
  const indice = (await Contrato.collection.indexes()).find((item) => item.name === Contrato.INDICE_CONTRATO_ATIVO);
  assert.ok(indice);
  assert.equal(indice.unique, true);
  assert.deepEqual(indice.partialFilterExpression.status.$in.sort(), [...Contrato.STATUS_ATIVOS].sort());
  assert.ok(Contrato.STATUS_ATIVOS.includes('entregue'));
});

test('pedidos simultâneos criam exatamente um contrato e uma notificação', async (t) => {
  if (pular(t)) return;
  const servico = await novoServico();
  const respostas = await Promise.all(
    Array.from({ length: 12 }, () =>
      amb.chamar('POST', '/api/contratos', cliente, { servicoId: String(servico._id), detalhesPedido: 'pedido simultâneo de teste' })
    )
  );
  assert.deepEqual(contagem(respostas), { 201: 1, 409: 11 });
  assert.ok(respostas.filter((r) => r.status === 409).every((r) => /contratação ativa/.test(r.dados.mensagem)));
  const contratos = await Contrato.find({ cliente: cliente._id, servico: servico._id });
  assert.equal(contratos.length, 1);
  assert.equal(await notificacoes(contratos[0]._id, 'contrato_novo'), 1);
});

test('propostas simultâneas também criam uma só, e entregue continua bloqueando', async (t) => {
  if (pular(t)) return;
  const servico = await novoServico({ preco: null, valorCombinar: true });
  const respostas = await Promise.all(
    Array.from({ length: 8 }, () =>
      amb.chamar('POST', '/api/contratos', cliente, { servicoId: String(servico._id), mensagem: 'proposta simultânea', precoProposto: 150 })
    )
  );
  assert.deepEqual(contagem(respostas), { 201: 1, 409: 7 });
  await Contrato.updateOne({ cliente: cliente._id, servico: servico._id }, { status: 'entregue' });
  const bloqueado = await amb.chamar('POST', '/api/contratos', cliente, { servicoId: String(servico._id), mensagem: 'outra' });
  assert.equal(bloqueado.status, 409);
});

test('após cancelamento ou conclusão, uma nova contratação é permitida', async (t) => {
  if (pular(t)) return;
  const servico = await novoServico();
  const corpo = { servicoId: String(servico._id), detalhesPedido: 'pedido que será cancelado' };
  const primeiro = await amb.chamar('POST', '/api/contratos', cliente, corpo);
  assert.equal((await amb.chamar('POST', `/api/contratos/${primeiro.dados.dados.idContrato}/cancelar`, cliente)).status, 200);
  const segundo = await amb.chamar('POST', '/api/contratos', cliente, corpo);
  assert.equal(segundo.status, 201);
  await Contrato.updateOne({ _id: segundo.dados.dados.idContrato }, { status: 'concluido' });
  assert.equal((await amb.chamar('POST', '/api/contratos', cliente, corpo)).status, 201);
  assert.equal(await Contrato.countDocuments({ cliente: cliente._id, servico: servico._id, status: { $in: Contrato.STATUS_ATIVOS } }), 1);
});

async function contratoEm(status, extra = {}) {
  const servico = await novoServico();
  return Contrato.create({ cliente: cliente._id, freelancer: freelancer._id, servico: servico._id, preco: 200, status, tipoContratacao: 'combinar', ...extra });
}

const perdeu = (resposta) => [400, 403, 409].includes(resposta.status);

test('cancelar contra iniciar: uma vence, a outra é recusada, e só a vencedora notifica', async (t) => {
  if (pular(t)) return;
  let conflitos = 0;
  for (let rodada = 0; rodada < 10; rodada += 1) {
    const contrato = await contratoEm('proposta_aceita');
    const [cancelar, iniciar] = await Promise.all([
      amb.chamar('POST', `/api/contratos/${contrato._id}/cancelar`, cliente),
      amb.chamar('POST', `/api/contratos/${contrato._id}/iniciar`, freelancer)
    ]);
    assert.equal([cancelar, iniciar].filter((r) => r.status === 200).length, 1);
    assert.ok([cancelar, iniciar].some(perdeu));
    const final = (await Contrato.findById(contrato._id)).status;
    const venceuCancelar = cancelar.status === 200;
    assert.equal(final, venceuCancelar ? 'cancelado' : 'em_andamento');
    assert.equal((venceuCancelar ? cancelar : iniciar).dados.dados.status, final);
    assert.equal(await notificacoes(contrato._id, 'contrato_cancelado'), venceuCancelar ? 1 : 0);
    assert.equal(await notificacoes(contrato._id, 'trabalho_iniciado'), venceuCancelar ? 0 : 1);
    const perdedora = venceuCancelar ? iniciar : cancelar;
    if (perdedora.status === 409) {
      conflitos += 1;
      assert.match(perdedora.dados.mensagem, /atualizado por outra ação/);
    }
  }
  t.diagnostic(`rodadas com 409 (corrida entre leitura e gravação): ${conflitos}/10`);
});

test('entregar contra cancelar e confirmações duplicadas não sobrescrevem o estado', async (t) => {
  if (pular(t)) return;
  const emAndamento = await contratoEm('em_andamento');
  const [entregar, cancelar] = await Promise.all([
    amb.chamar('POST', `/api/contratos/${emAndamento._id}/entregar`, freelancer),
    amb.chamar('POST', `/api/contratos/${emAndamento._id}/cancelar`, freelancer)
  ]);
  assert.equal([entregar, cancelar].filter((r) => r.status === 200).length, 1);
  assert.ok([entregar, cancelar].some(perdeu));
  const final = (await Contrato.findById(emAndamento._id)).status;
  assert.equal(final, entregar.status === 200 ? 'entregue' : 'cancelado');

  const entregue = await contratoEm('entregue');
  const confirmacoes = await Promise.all(
    Array.from({ length: 4 }, () => amb.chamar('POST', `/api/contratos/${entregue._id}/confirmar`, cliente))
  );
  assert.equal(confirmacoes.filter((r) => r.status === 200).length, 1);
  assert.ok(confirmacoes.every((r) => [200, 409, 400].includes(r.status)));
  assert.equal((await Contrato.findById(entregue._id)).status, 'concluido');
});

test('rota antiga PATCH /status usa a mesma gravação atômica', async (t) => {
  if (pular(t)) return;
  const contrato = await contratoEm('proposta_aceita');
  const [cancelar, iniciar] = await Promise.all([
    amb.chamar('PATCH', `/api/contratos/${contrato._id}/status`, cliente, { status: 'cancelado' }),
    amb.chamar('PATCH', `/api/contratos/${contrato._id}/status`, freelancer, { status: 'em_andamento' })
  ]);
  assert.equal([cancelar, iniciar].filter((r) => r.status === 200).length, 1);
  assert.ok([cancelar, iniciar].some(perdeu));
  assert.equal((await Contrato.findById(contrato._id)).status, cancelar.status === 200 ? 'cancelado' : 'em_andamento');
  const pendente = await contratoEm('proposta_pendente');
  const aceitar = await amb.chamar('PATCH', `/api/contratos/${pendente._id}/status`, freelancer, { status: 'em_andamento' });
  assert.equal(aceitar.status, 200);
  assert.equal((await Contrato.findById(pendente._id)).status, 'proposta_aceita');
  assert.equal(await notificacoes(pendente._id, 'proposta_aceita'), 1);
  const invasor = await amb.chamar('PATCH', `/api/contratos/${pendente._id}/status`, cliente, { status: 'em_andamento' });
  assert.equal(invasor.status, 403);
  const objeto = await amb.chamar('PATCH', `/api/contratos/${pendente._id}/status`, freelancer, { status: { $ne: '' } });
  assert.equal(objeto.status, 400);
});

test('regras preservadas: freelancer entrega, cliente confirma e só então avalia', async (t) => {
  if (pular(t)) return;
  const contrato = await contratoEm('em_andamento', { tipoContratacao: 'fixo' });
  const rota = `/api/contratos/${contrato._id}`;
  assert.equal((await amb.chamar('POST', `${rota}/entregar`, cliente)).status, 403);
  assert.equal((await amb.chamar('POST', `${rota}/entregar`, freelancer)).status, 200);
  assert.equal((await amb.chamar('POST', `${rota}/confirmar`, freelancer)).status, 403);
  const avaliarCedo = await amb.chamar('POST', '/api/avaliacoes', cliente, { contratoId: String(contrato._id), notaServico: 5, notaFreelancer: 5 });
  assert.equal(avaliarCedo.status, 400);
  assert.equal((await amb.chamar('POST', `${rota}/confirmar`, cliente)).status, 200);
  const avaliacoes = await Promise.all(
    Array.from({ length: 3 }, () =>
      amb.chamar('POST', '/api/avaliacoes', cliente, { contratoId: String(contrato._id), notaServico: 5, notaFreelancer: 4 })
    )
  );
  assert.equal(avaliacoes.filter((r) => r.status === 201).length, 1);
  assert.equal(await Avaliacao.countDocuments({ contrato: contrato._id }), 1);
});

test('falha ao notificar depois de gravar não desfaz nem repete a transição', async (t) => {
  if (pular(t)) return;
  const contrato = await contratoEm('em_andamento');
  const original = console.error;
  console.error = () => {};
  t.mock.method(Notificacao, 'create', async () => {
    throw new Error('fila de notificações fora do ar');
  });
  const resposta = await amb.chamar('POST', `/api/contratos/${contrato._id}/entregar`, freelancer);
  console.error = original;
  assert.equal(resposta.status, 200);
  assert.equal((await Contrato.findById(contrato._id)).status, 'entregue');
  const repetida = await amb.chamar('POST', `/api/contratos/${contrato._id}/entregar`, freelancer);
  assert.equal(repetida.status, 400);
});

test('instalação do índice relata duplicações antigas sem alterar registros', async (t) => {
  if (pular(t)) return;
  const servico = await novoServico();
  await Contrato.collection.dropIndex(Contrato.INDICE_CONTRATO_ATIVO);
  const base = { cliente: cliente._id, freelancer: freelancer._id, servico: servico._id, preco: 200, tipoContratacao: 'fixo' };
  const { insertedIds } = await Contrato.collection.insertMany([
    { ...base, status: 'pendente' },
    { ...base, status: 'em_andamento' }
  ]);
  const relatorio = await Contrato.garantirIndicesContrato();
  assert.equal(relatorio.instalado, false);
  assert.equal(relatorio.duplicados.length, 1);
  assert.deepEqual(relatorio.duplicados[0].contratos.map(String).sort(), Object.values(insertedIds).map(String).sort());
  assert.equal(await Contrato.countDocuments({ servico: servico._id }), 2);
  assert.ok(!(await Contrato.collection.indexes()).some((item) => item.name === Contrato.INDICE_CONTRATO_ATIVO));
  await Contrato.collection.deleteMany({ _id: { $in: Object.values(insertedIds) } });
  assert.equal((await Contrato.garantirIndicesContrato()).instalado, true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarAmbiente } = require('./helpers/apiTeste');

let amb;
let Avaliacao;
let Contrato;
let Servico;
let Usuario;
let Categoria;

test.before(async () => {
  amb = await iniciarAmbiente('avaliacao_unica');
  if (!amb) return;
  Avaliacao = require('../src/models/Avaliacao');
  Contrato = require('../src/models/Contrato');
  Servico = require('../src/models/Servico');
  Usuario = require('../src/models/Usuario');
  Categoria = require('../src/models/Categoria');
  if (typeof Avaliacao.garantirIndicesAvaliacao === 'function') await Avaliacao.garantirIndicesAvaliacao();
  await Contrato.garantirIndicesContrato();
});

test.after(async () => {
  if (amb) await amb.encerrar();
});

function pular(t) {
  if (!amb) {
    t.skip('MongoDB indisponível');
    return true;
  }
  return false;
}

let categoria;
async function cenario() {
  categoria = categoria || (await Categoria.create({ legacyId: 900 + Math.floor(Math.random() * 1e6), nome: 'Teste', slug: `teste-${Date.now()}-${Math.random()}` }));
  const freelancer = await amb.criarUsuario('Freelancer');
  const cliente = await amb.criarUsuario('Contratante');
  const servico = await Servico.create({ nome: 'Logo', descricao: 'd', preco: 100, categoria: categoria._id, freelancer: freelancer._id });
  return { freelancer, cliente, servico };
}

function contrato({ cliente, freelancer, servico }, status = 'concluido') {
  return Contrato.create({ cliente: cliente._id, freelancer: freelancer._id, servico: servico._id, preco: 100, tipoContratacao: 'fixo', status, detalhesPedido: 'x' });
}

const avaliar = (usuario, contratoId, extra = {}) =>
  amb.chamar('POST', '/api/avaliacoes', usuario, { contratoId: String(contratoId), notaServico: 5, notaFreelancer: 5, comentario: 'ok', ...extra });

test('a primeira avaliação de um contrato concluído é aceita e atualiza as médias', async (t) => {
  if (pular(t)) return;
  const c = await cenario();
  const k = await contrato(c);
  const r = await avaliar(c.cliente, k._id, { notaServico: 4, notaFreelancer: 3 });
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  const freela = await Usuario.findById(c.freelancer._id).lean();
  assert.equal(freela.totalAvaliacoes, 1);
  assert.equal(freela.avaliacaoMedia, 3);
});

test('o mesmo contrato não é avaliado duas vezes', async (t) => {
  if (pular(t)) return;
  const c = await cenario();
  const k = await contrato(c);
  assert.equal((await avaliar(c.cliente, k._id)).status, 201);
  const r = await avaliar(c.cliente, k._id);
  assert.equal(r.status, 400);
  assert.match(r.dados.mensagem, /contrato já foi avaliado/);
});

test('recontratar o mesmo serviço é permitido, mas a segunda avaliação do serviço é recusada', async (t) => {
  if (pular(t)) return;
  const c = await cenario();
  const primeiro = await contrato(c);
  const segundo = await contrato(c);
  assert.equal((await avaliar(c.cliente, primeiro._id)).status, 201);
  const r = await avaliar(c.cliente, segundo._id);
  assert.equal(r.status, 400, 'a segunda avaliação do mesmo serviço não pode ser aceita');
  assert.equal(r.dados.sucesso, false);
  assert.match(r.dados.mensagem, /já avaliou este serviço/);
  assert.equal(await Avaliacao.countDocuments({ autor: c.cliente._id, servico: c.servico._id }), 1);
});

test('outro cliente avalia o mesmo serviço de forma independente', async (t) => {
  if (pular(t)) return;
  const c = await cenario();
  const outro = await amb.criarUsuario('Contratante');
  assert.equal((await avaliar(c.cliente, (await contrato(c))._id)).status, 201);
  const r = await avaliar(outro, (await contrato({ ...c, cliente: outro }))._id);
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  assert.equal(await Avaliacao.countDocuments({ servico: c.servico._id }), 2);
});

test('o mesmo cliente avalia serviços diferentes do mesmo freelancer', async (t) => {
  if (pular(t)) return;
  const c = await cenario();
  const outroServico = await Servico.create({ nome: 'Site', descricao: 'd', preco: 200, categoria: categoria._id, freelancer: c.freelancer._id });
  assert.equal((await avaliar(c.cliente, (await contrato(c))._id)).status, 201);
  assert.equal((await avaliar(c.cliente, (await contrato({ ...c, servico: outroServico }))._id)).status, 201);
});

test('contratos não concluídos não são avaliados', async (t) => {
  if (pular(t)) return;
  const c = await cenario();
  for (const status of ['pendente', 'proposta_pendente', 'proposta_aceita', 'em_andamento', 'entregue', 'cancelado']) {
    const servico = await Servico.create({ nome: status, descricao: 'd', preco: 100, categoria: categoria._id, freelancer: c.freelancer._id });
    const r = await avaliar(c.cliente, (await contrato({ ...c, servico }, status))._id);
    assert.equal(r.status, 400, status);
    assert.match(r.dados.mensagem, /concluídos/);
  }
  assert.equal(await Avaliacao.countDocuments({ autor: c.cliente._id }), 0);
});

test('ninguém avalia o contrato de outro cliente, nem o próprio freelancer', async (t) => {
  if (pular(t)) return;
  const c = await cenario();
  const intruso = await amb.criarUsuario('Contratante');
  const k = await contrato(c);
  for (const usuario of [intruso, c.freelancer]) {
    const r = await avaliar(usuario, k._id);
    assert.equal(r.status, 403);
  }
  assert.equal((await amb.chamar('POST', '/api/avaliacoes', null, { contratoId: String(k._id), notaServico: 5, notaFreelancer: 5 })).status, 401);
  assert.equal(await Avaliacao.countDocuments({ contrato: k._id }), 0);
  assert.equal((await avaliar(c.cliente, k._id)).status, 201, 'o dono do contrato continua podendo avaliar');
});

test('identificadores inválidos ou inexistentes são recusados', async (t) => {
  if (pular(t)) return;
  const { cliente } = await cenario();
  assert.equal((await avaliar(cliente, 'abc')).status, 400);
  assert.equal((await avaliar(cliente, { $ne: null })).status, 400);
  assert.equal((await avaliar(cliente, '0123456789abcdef01234567')).status, 404);
});

test('ids de autor, freelancer e serviço enviados no corpo são ignorados', async (t) => {
  if (pular(t)) return;
  const alvo = await cenario();
  const atacante = await cenario();
  const k = await contrato(atacante);
  const r = await avaliar(atacante.cliente, k._id, {
    autor: String(alvo.cliente._id),
    freelancer: String(alvo.freelancer._id),
    servico: String(alvo.servico._id),
    cliente: String(alvo.cliente._id)
  });
  assert.equal(r.status, 201);
  const salva = await Avaliacao.findById(r.dados.dados.idAvaliacao).lean();
  assert.equal(String(salva.autor), String(atacante.cliente._id));
  assert.equal(String(salva.freelancer), String(atacante.freelancer._id));
  assert.equal(String(salva.servico), String(atacante.servico._id));
  assert.equal(await Avaliacao.countDocuments({ servico: alvo.servico._id }), 0);
  const r2 = await avaliar(atacante.cliente, (await contrato(alvo))._id, { autor: String(alvo.cliente._id) });
  assert.equal(r2.status, 403);
});

test('pedidos simultâneos em contratos diferentes do mesmo serviço criam uma única avaliação', async (t) => {
  if (pular(t)) return;
  const c = await cenario();
  const contratos = await Promise.all(Array.from({ length: 6 }, () => contrato(c)));
  const respostas = await Promise.all(
    Array.from({ length: 24 }, (_, i) => avaliar(c.cliente, contratos[i % contratos.length]._id))
  );
  const status = respostas.map((r) => r.status);
  assert.equal(status.filter((s) => s === 201).length, 1, `exatamente uma deve vencer: ${status}`);
  assert.ok(status.every((s) => s === 201 || s === 400), `as demais devem ser 400, sem 500: ${status}`);
  assert.equal(await Avaliacao.countDocuments({ autor: c.cliente._id, servico: c.servico._id }), 1);
  const freela = await Usuario.findById(c.freelancer._id).lean();
  assert.equal(freela.totalAvaliacoes, 1, 'a média do freelancer não pode contar avaliações recusadas');
});

test('pedidos simultâneos no mesmo contrato criam uma única avaliação', async (t) => {
  if (pular(t)) return;
  const c = await cenario();
  const k = await contrato(c);
  const status = (await Promise.all(Array.from({ length: 15 }, () => avaliar(c.cliente, k._id)))).map((r) => r.status);
  assert.equal(status.filter((s) => s === 201).length, 1, String(status));
  assert.ok(status.every((s) => s === 201 || s === 400), String(status));
  assert.equal(await Avaliacao.countDocuments({ contrato: k._id }), 1);
});

test('fluxo completo pela API: contratar, entregar, confirmar, avaliar; recontratar sem nova avaliação', async (t) => {
  if (pular(t)) return;
  const c = await cenario();
  async function ciclo() {
    const criado = await amb.chamar('POST', '/api/contratos', c.cliente, { servicoId: String(c.servico._id), detalhesPedido: 'pedido' });
    assert.equal(criado.status, 201, JSON.stringify(criado.dados));
    const id = criado.dados.dados.idContrato;
    assert.equal((await amb.chamar('POST', `/api/contratos/${id}/aceitar`, c.freelancer)).status, 200);
    assert.equal((await amb.chamar('POST', `/api/contratos/${id}/entregar`, c.freelancer)).status, 200);
    assert.equal((await amb.chamar('POST', `/api/contratos/${id}/confirmar`, c.cliente)).status, 200);
    return id;
  }
  const primeiro = await ciclo();
  assert.equal((await avaliar(c.cliente, primeiro)).status, 201);
  const segundo = await ciclo();
  assert.equal((await avaliar(c.cliente, segundo)).status, 400);

  const meus = await amb.chamar('GET', '/api/contratos/meus', c.cliente);
  const porId = new Map(meus.dados.dados.map((k) => [k.idContrato, k]));
  assert.equal(porId.get(primeiro).jaAvaliado, true);
  assert.equal(porId.get(segundo).jaAvaliado, false);
  assert.equal(porId.get(segundo).servicoJaAvaliado, true);
  assert.equal(porId.get(segundo).servico_ja_avaliado, true);
});

test('médias e contagens ficam consistentes depois de pedidos recusados', async (t) => {
  if (pular(t)) return;
  const c = await cenario();
  const k1 = await contrato(c);
  const k2 = await contrato(c);
  await avaliar(c.cliente, k1._id, { notaServico: 2, notaFreelancer: 2 });
  for (let i = 0; i < 3; i += 1) assert.equal((await avaliar(c.cliente, k2._id, { notaServico: 5, notaFreelancer: 5 })).status, 400);
  const freela = await Usuario.findById(c.freelancer._id).lean();
  assert.equal(freela.totalAvaliacoes, 1);
  assert.equal(freela.avaliacaoMedia, 2);
  const servico = await amb.chamar('GET', `/api/servicos/${c.servico._id}`);
  assert.equal(servico.dados.dados.totalAvaliacoesServico, 1);
  assert.equal(servico.dados.dados.avaliacaoMediaServico, 2);
  const publico = await amb.chamar('GET', `/api/usuarios/publico/${c.freelancer._id}`);
  assert.equal(publico.dados.reviewSummary.total, 1);
  assert.equal(publico.dados.reviewSummary.mediaFreelancer, 2);
});

test('índice único parcial: instalado, compatível com avaliações antigas duplicadas e sem alterá-las', async (t) => {
  if (pular(t)) return;
  const indices = await Avaliacao.collection.indexes();
  const indice = indices.find((i) => i.name === 'avaliacao_unica_por_cliente_servico');
  assert.ok(indice, `índice ausente: ${indices.map((i) => i.name)}`);
  assert.equal(indice.unique, true);
  assert.deepEqual(indice.key, { autor: 1, servico: 1 });
  assert.deepEqual(indice.partialFilterExpression, { unicaPorServico: true });

  const c = await cenario();
  const [k1, k2, k3] = await Promise.all([contrato(c), contrato(c), contrato(c)]);
  const base = { autor: c.cliente._id, freelancer: c.freelancer._id, servico: c.servico._id, notaServico: 5, notaFreelancer: 5 };
  await Avaliacao.collection.insertMany([{ ...base, contrato: k1._id }, { ...base, contrato: k2._id }]);
  await Avaliacao.garantirIndicesAvaliacao();
  assert.equal(await Avaliacao.countDocuments({ autor: c.cliente._id, servico: c.servico._id }), 2);
  const r = await avaliar(c.cliente, k3._id);
  assert.equal(r.status, 400);
  assert.match(r.dados.mensagem, /já avaliou este serviço/);
});

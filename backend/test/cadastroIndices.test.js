process.env.TRUST_PROXY = 'loopback';

const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarAmbiente, cpfValido } = require('./helpers/apiTeste');

let amb;
let Usuario;
let ip = 0;
test.before(async () => {
  amb = await iniciarAmbiente('cadastro_indices');
  if (amb) Usuario = require('../src/models/Usuario');
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

async function cadastrar({ email, cpf }) {
  const r = await fetch(amb.base + '/api/autenticacao/cadastro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${(ip += 1) % 250}` },
    body: JSON.stringify({ nome: 'Pessoa', email, senha: 'senha-forte-1', cpf, tipoConta: 'Contratante' })
  });
  return { status: r.status, dados: await r.json() };
}

async function semIndices() {
  await Usuario.collection.drop().catch(() => {});
  Usuario.configurarProtecaoCadastroParaTeste?.({ expirar: true });
}
const indicesUnicos = async () =>
  (await Usuario.collection.indexes()).filter((i) => i.unique).map((i) => Object.keys(i.key).join(',')).sort();

test('base sem índices: duplicatas antigas bloqueiam o cadastro (503) até serem resolvidas', async (t) => {
  if (pular(t)) return;
  await semIndices();
  Usuario.configurarProtecaoCadastroParaTeste?.({ novaTentativaMs: 0 });
  t.after(() => Usuario.configurarProtecaoCadastroParaTeste?.({ novaTentativaMs: 30000 }));
  const repetido = cpfValido(4242);
  await Usuario.collection.insertMany([
    { nome: 'a', email: 'antiga1@teste.local', senha: 'x', cpf: repetido, tipoConta: 'Contratante' },
    { nome: 'b', email: 'antiga2@teste.local', senha: 'x', cpf: repetido, tipoConta: 'Contratante' }
  ]);
  const r = await cadastrar({ email: 'nova@teste.local', cpf: cpfValido(4343) });
  assert.equal(r.status, 503, JSON.stringify(r.dados));
  assert.equal(r.dados.sucesso, false);
  assert.equal(await Usuario.countDocuments({ email: 'nova@teste.local' }), 0, 'nada é gravado sem a proteção');

  await Usuario.collection.deleteOne({ email: 'antiga2@teste.local' });
  assert.equal((await cadastrar({ email: 'nova@teste.local', cpf: cpfValido(4343) })).status, 201);
  assert.deepEqual(await indicesUnicos(), ['cpf', 'email']);
});

test('base sem índices: cadastros simultâneos com o mesmo CPF criam uma única conta', async (t) => {
  if (pular(t)) return;
  await semIndices();
  const cpf = cpfValido(5151);
  const status = (await Promise.all(Array.from({ length: 8 }, (_, i) => cadastrar({ email: `cpf${i}@teste.local`, cpf })))).map((r) => r.status);
  assert.equal(status.filter((s) => s === 201).length, 1, String(status));
  assert.ok(status.every((s) => s === 201 || s === 409), String(status));
  assert.equal(await Usuario.countDocuments({ cpf }), 1);
  assert.deepEqual(await indicesUnicos(), ['cpf', 'email']);
});

test('base sem índices: cadastros simultâneos com o mesmo e-mail criam uma única conta', async (t) => {
  if (pular(t)) return;
  await semIndices();
  const status = (await Promise.all(Array.from({ length: 8 }, (_, i) => cadastrar({ email: 'mesmo@teste.local', cpf: cpfValido(6000 + i * 37) })))).map((r) => r.status);
  assert.equal(status.filter((s) => s === 201).length, 1, String(status));
  assert.ok(status.every((s) => s === 201 || s === 409), String(status));
  assert.equal(await Usuario.countDocuments({ email: 'mesmo@teste.local' }), 1);
});

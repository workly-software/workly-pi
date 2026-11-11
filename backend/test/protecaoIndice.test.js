const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarAmbiente } = require('./helpers/apiTeste');

let amb, Contrato, Servico, Categoria;
let freelancer, cliente, categoria;
const silenciar = (t) => t.mock.method(console, 'error', () => {});

test.before(async () => {
  amb = await iniciarAmbiente('protecao');
  if (!amb) return;
  Contrato = require('../src/models/Contrato');
  Servico = require('../src/models/Servico');
  Categoria = require('../src/models/Categoria');
  freelancer = await amb.criarUsuario('Freelancer');
  cliente = await amb.criarUsuario();
  categoria = await Categoria.create({ legacyId: 1, nome: 'Design', slug: 'design' });
});
test.after(async () => amb?.encerrar());

const pular = (t) => (!amb ? t.skip('MongoDB local indisponível') : false);
const servicoFixo = () =>
  Servico.create({ nome: 'Fixo', descricao: 'd', preco: 100, categoria: categoria._id, freelancer: freelancer._id });
const servicoCombinar = () =>
  Servico.create({ nome: 'Combinar', descricao: 'd', preco: null, valorCombinar: true, categoria: categoria._id, freelancer: freelancer._id });
const pedir = (servico) =>
  amb.chamar('POST', '/api/contratos', cliente, { servicoId: String(servico._id), detalhesPedido: 'pedido de teste da proteção' });
const propor = (servico) =>
  amb.chamar('POST', '/api/contratos', cliente, { servicoId: String(servico._id), mensagem: 'proposta de teste', precoProposto: 90 });
async function removerIndice() {
  await Contrato.collection.dropIndex(Contrato.INDICE_CONTRATO_ATIVO).catch(() => {});
}
async function consultasDisponiveis() {
  assert.equal((await amb.chamar('GET', '/api/contratos/meus', cliente)).status, 200);
  assert.equal((await amb.chamar('GET', '/api/servicos')).status, 200);
}
function bloqueado(resposta) {
  assert.equal(resposta.status, 503);
  assert.match(resposta.dados.mensagem, /temporariamente indisponíveis/);
  assert.doesNotMatch(JSON.stringify(resposta.dados), /índice|duplicad|[a-f\d]{24}/i);
}

test('a proteção começa fechada e nada é criado sem verificação bem-sucedida', async (t) => {
  if (pular(t)) return;
  silenciar(t);
  assert.deepEqual(Contrato.estadoProtecaoContratos(), { disponivel: false, motivo: 'nao_verificado' });
  const falha = t.mock.method(Contrato, 'createIndexes', async () => {
    throw new Error('instalação indisponível');
  });
  bloqueado(await pedir(await servicoFixo()));
  assert.equal(await Contrato.countDocuments({}), 0);
  assert.equal(falha.mock.callCount(), 1);
  falha.mock.restore();
});

test('índice disponível: verificado com a definição exata e pedidos/propostas funcionam', async (t) => {
  if (pular(t)) return;
  const resultado = await Contrato.garantirIndicesContrato();
  assert.equal(resultado.instalado, true);
  assert.equal(await Contrato.verificarIndiceContratoAtivo(), true);
  assert.deepEqual(Contrato.estadoProtecaoContratos(), { disponivel: true, motivo: null });
  assert.equal((await pedir(await servicoFixo())).status, 201);
  assert.equal((await propor(await servicoCombinar())).status, 201);
});

test('duplicações preexistentes: nada é alterado, criação bloqueada e liberada após correção manual', async (t) => {
  if (pular(t)) return;
  silenciar(t);
  const servico = await servicoFixo();
  await removerIndice();
  const base = { cliente: cliente._id, freelancer: freelancer._id, servico: servico._id, preco: 100, tipoContratacao: 'fixo' };
  const { insertedIds } = await Contrato.collection.insertMany([
    { ...base, status: 'pendente' },
    { ...base, status: 'entregue' }
  ]);
  const ids = Object.values(insertedIds).map(String).sort();
  const antes = await Contrato.collection.find({ _id: { $in: Object.values(insertedIds) } }).toArray();

  const resultado = await Contrato.garantirIndicesContrato();
  assert.equal(resultado.instalado, false);
  assert.equal(resultado.motivo, 'duplicados');
  assert.deepEqual(resultado.duplicados[0].contratos.map(String).sort(), ids);
  const linhas = [];
  Contrato.relatarProblemaIndice(resultado, (linha) => linhas.push(linha));
  assert.ok(ids.every((id) => linhas.join('\n').includes(id)), 'os IDs em conflito ficam no log do servidor');
  assert.deepEqual(await Contrato.collection.find({ _id: { $in: Object.values(insertedIds) } }).toArray(), antes);
  assert.equal(await Contrato.verificarIndiceContratoAtivo(), false);

  bloqueado(await pedir(await servicoFixo()));
  bloqueado(await propor(await servicoCombinar()));
  const simultaneos = await Promise.all(Array.from({ length: 6 }, async () => pedir(await servicoFixo())));
  simultaneos.forEach(bloqueado);
  await consultasDisponiveis();

  await Contrato.collection.updateOne({ _id: insertedIds[1] }, { $set: { status: 'cancelado' } });
  Contrato.configurarProtecaoParaTeste({ novaTentativaMs: 0, expirar: true });
  assert.equal((await pedir(await servicoFixo())).status, 201);
  assert.equal(Contrato.estadoProtecaoContratos().disponivel, true);
  assert.equal(await Contrato.verificarIndiceContratoAtivo(), true);
});

test('falha de instalação bloqueia a criação sem afetar consultas', async (t) => {
  if (pular(t)) return;
  silenciar(t);
  await removerIndice();
  const falha = t.mock.method(Contrato, 'createIndexes', async () => {
    throw Object.assign(new Error('servidor de banco recusou a operação'), { codeName: 'Unauthorized' });
  });
  const resultado = await Contrato.garantirIndicesContrato();
  assert.equal(resultado.instalado, false);
  assert.equal(resultado.motivo, 'falha_instalacao');
  Contrato.configurarProtecaoParaTeste({ novaTentativaMs: 60 * 60 * 1000 });
  bloqueado(await pedir(await servicoFixo()));
  bloqueado(await propor(await servicoCombinar()));
  await consultasDisponiveis();

  falha.mock.restore();
  Contrato.configurarProtecaoParaTeste({ novaTentativaMs: 0, expirar: true });
  assert.equal((await propor(await servicoCombinar())).status, 201);
});

test('índice com a definição errada não é aceito nem removido automaticamente', async (t) => {
  if (pular(t)) return;
  silenciar(t);
  await removerIndice();
  await Contrato.collection.createIndex({ cliente: 1, servico: 1 }, { name: Contrato.INDICE_CONTRATO_ATIVO });
  const resultado = await Contrato.garantirIndicesContrato();
  assert.equal(resultado.instalado, false);
  assert.equal(await Contrato.verificarIndiceContratoAtivo(), false);
  const existente = (await Contrato.collection.indexes()).find((item) => item.name === Contrato.INDICE_CONTRATO_ATIVO);
  assert.ok(existente && !existente.unique, 'o índice incorreto continua lá para análise manual');
  Contrato.configurarProtecaoParaTeste({ novaTentativaMs: 60 * 60 * 1000 });
  bloqueado(await pedir(await servicoFixo()));

  await removerIndice();
  Contrato.configurarProtecaoParaTeste({ novaTentativaMs: 0, expirar: true });
  assert.equal((await pedir(await servicoFixo())).status, 201);
});

test('índice removido com a API no ar é detectado na revalidação e reinstalado', async (t) => {
  if (pular(t)) return;
  silenciar(t);
  assert.equal((await Contrato.garantirIndicesContrato()).instalado, true);
  await removerIndice();
  Contrato.configurarProtecaoParaTeste({ revalidacaoMs: 0, novaTentativaMs: 0, expirar: true });
  assert.equal((await pedir(await servicoFixo())).status, 201);
  assert.equal(await Contrato.verificarIndiceContratoAtivo(), true);
  Contrato.configurarProtecaoParaTeste({ revalidacaoMs: 5 * 60 * 1000 });
});

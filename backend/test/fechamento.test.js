const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { iniciarAmbiente } = require('./helpers/apiTeste');

let amb, Usuario, Servico, Categoria, Contrato, Avaliacao, categoria;
test.before(async () => {
  amb = await iniciarAmbiente('fechamento');
  if (!amb) return;
  Usuario = require('../src/models/Usuario');
  Servico = require('../src/models/Servico');
  Categoria = require('../src/models/Categoria');
  Contrato = require('../src/models/Contrato');
  Avaliacao = require('../src/models/Avaliacao');
  assert.equal((await Contrato.garantirIndicesContrato()).instalado, true);
  categoria = await Categoria.create({ legacyId: 1, nome: 'Design', slug: 'design' });
});
test.after(async () => amb?.encerrar());
const skip = (t) => { if (!amb) { t.skip('MongoDB local indisponível'); return true; } return false; };
const service = (user, extra = {}) => Servico.create({ nome: 'Serviço', descricao: 'Descrição', preco: 100, categoria: categoria._id, freelancer: user._id, ...extra });
const change = (user, password) => amb.chamar('PUT', '/api/usuarios/perfil/senha', user, { senhaAtual: 'senha-forte-1', novaSenha: password, confirmarSenha: password });

test('duas trocas de senha que leram a mesma credencial não podem vencer juntas', async (t) => {
  if (skip(t)) return;
  const user = await amb.criarUsuario();
  const original = bcrypt.hash;
  let reached = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  t.mock.method(bcrypt, 'hash', async (...args) => {
    reached += 1;
    if (reached === 2) release();
    await gate;
    return original(...args);
  });
  const results = await Promise.all([change(user, 'nova-senha-A'), change(user, 'nova-senha-B')]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const saved = await Usuario.findById(user._id);
  assert.equal(saved.versaoSessao, 1);
  const winner = results.findIndex((r) => r.status === 200);
  assert.equal(await bcrypt.compare(winner === 0 ? 'nova-senha-A' : 'nova-senha-B', saved.senha), true);
  assert.equal((await amb.chamar('GET', '/api/usuarios/perfil', user)).status, 401);
});

test('troca de senha de conta legada revoga link pendente e conserva sessão nova', async (t) => {
  if (skip(t)) return;
  const user = await amb.criarUsuario();
  await Usuario.collection.updateOne({ _id: user._id }, { $unset: { versaoSessao: '' }, $set: { redefinicaoSenha: { hash: 'h', expiraEm: new Date(Date.now() + 60000) } } });
  const result = await change(user, 'senha-legada-nova');
  assert.equal(result.status, 200);
  const saved = await Usuario.collection.findOne({ _id: user._id });
  assert.equal(saved.versaoSessao, 1);
  assert.equal(saved.redefinicaoSenha, undefined);
  const response = await fetch(amb.base + '/api/usuarios/perfil', { headers: { Authorization: `Bearer ${result.sessao}` } });
  assert.equal(result.dados.token, undefined, 'M-04: o token vai só no cookie HttpOnly');
  assert.equal(response.status, 200);
});

test('senha nova que excede 72 bytes é recusada sem truncar Unicode', async (t) => {
  if (skip(t)) return;
  const user = await amb.criarUsuario();
  assert.equal((await change(user, 'á'.repeat(37))).status, 400);
  assert.equal((await change(user, 'á'.repeat(36))).status, 200);
});

test('troca já em curso não sobrescreve uma redefinição de senha posterior', async (t) => {
  if (skip(t)) return;
  const user = await amb.criarUsuario();
  const recovery = require('../src/services/recuperacaoSenhaService');
  const token = 'b'.repeat(64);
  await Usuario.updateOne({ _id: user._id }, { $set: { redefinicaoSenha: { hash: recovery.hashToken(token), expiraEm: new Date(Date.now() + 60000) } } });
  const original = bcrypt.hash;
  let release, reached;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { reached = resolve; });
  t.mock.method(bcrypt, 'hash', async (...args) => {
    if (args[0] === 'troca-obsoleta') { reached(); await gate; }
    return original(...args);
  });
  const changing = change(user, 'troca-obsoleta');
  await started;
  try {
    assert.equal((await amb.chamar('POST', '/api/autenticacao/redefinir-senha', undefined, { token, novaSenha: 'senha-recuperada', confirmarSenha: 'senha-recuperada' })).status, 200);
  } finally { release(); }
  assert.equal((await changing).status, 409);
  const saved = await Usuario.findById(user._id);
  assert.equal(await bcrypt.compare('senha-recuperada', saved.senha), true);
  assert.equal(saved.versaoSessao, 1);
});

test('troca já em curso não grava credenciais após exclusão confirmada', async (t) => {
  if (skip(t)) return;
  const user = await amb.criarUsuario();
  const original = bcrypt.hash;
  let release, reached;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { reached = resolve; });
  t.mock.method(bcrypt, 'hash', async (...args) => {
    if (args[0] === 'troca-na-exclusao') { reached(); await gate; }
    return original(...args);
  });
  const changing = change(user, 'troca-na-exclusao');
  await started;
  try { assert.equal((await amb.chamar('DELETE', '/api/usuarios/perfil', user, { senhaAtual: 'senha-forte-1' })).status, 200); }
  finally { release(); }
  const result = await changing;
  assert.equal(result.status, 409);
  assert.equal(result.sessao, '', 'conflito não cria sessão nova');
  assert.equal((await Usuario.findById(user._id)).removido, true);
});

test('requisição admitida antes do reset não usa uma versão de sessão que leu depois', async (t) => {
  if (skip(t)) return;
  const user = await amb.criarUsuario();
  const recovery = require('../src/services/recuperacaoSenhaService');
  const token = 'd'.repeat(64);
  await Usuario.updateOne({ _id: user._id }, { $set: { redefinicaoSenha: { hash: recovery.hashToken(token), expiraEm: new Date(Date.now() + 60000) } } });
  const original = Usuario.findById.bind(Usuario);
  let reads = 0, release, reached;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { reached = resolve; });
  t.mock.method(Usuario, 'findById', (...args) => {
    const query = original(...args);
    if (++reads === 2) {
      const exec = query.exec.bind(query);
      query.exec = async (...values) => { reached(); await gate; return exec(...values); };
    }
    return query;
  });
  const changing = change(user, 'nova-senha-atrasada');
  await started;
  try { assert.equal((await amb.chamar('POST', '/api/autenticacao/redefinir-senha', undefined, { token, novaSenha: 'senha-do-reset', confirmarSenha: 'senha-do-reset' })).status, 200); }
  finally { release(); }
  assert.equal((await changing).status, 409);
  assert.equal(await bcrypt.compare('senha-do-reset', (await Usuario.findById(user._id)).senha), true);
});

test('alias de troca de senha mantém os campos em inglês e aceita exatamente 72 bytes', async (t) => {
  if (skip(t)) return;
  const user = await amb.criarUsuario();
  const password = 'x'.repeat(72);
  const result = await amb.chamar('PUT', '/api/usuarios/profile/password', user, { currentPassword: 'senha-forte-1', newPassword: password, confirmPassword: password });
  assert.equal(result.status, 200);
  assert.equal(await bcrypt.compare(password, (await Usuario.findById(user._id)).senha), true);
});

test('política de bytes vale no cadastro e reset, sem bloquear login legado', async (t) => {
  if (skip(t)) return;
  const user = await amb.criarUsuario();
  const long = 'a'.repeat(73);
  const registration = await amb.chamar('POST', '/api/autenticacao/cadastro', undefined, { nome: 'Teste', email: 'bytes@teste.local', senha: long, cpf: user.cpf, tipoConta: 'Contratante' });
  assert.equal(registration.status, 400);
  assert.match(registration.dados.mensagem, /72 bytes/);
  const recovery = require('../src/services/recuperacaoSenhaService');
  const token = 'c'.repeat(64);
  await Usuario.updateOne({ _id: user._id }, { $set: { senha: await bcrypt.hash(long, 4), redefinicaoSenha: { hash: recovery.hashToken(token), expiraEm: new Date(Date.now() + 60000) } } });
  assert.equal((await amb.chamar('POST', '/api/autenticacao/login', undefined, { email: user.email, senha: long })).status, 200);
  assert.equal((await amb.chamar('POST', '/api/autenticacao/redefinir-senha', undefined, { token, novaSenha: long, confirmarSenha: long })).status, 400);
  assert.equal((await amb.chamar('POST', '/api/autenticacao/redefinir-senha', undefined, { token, novaSenha: 'senha-permitida', confirmarSenha: 'senha-permitida' })).status, 200);
});

test('contratação já em curso não conclui depois de retirar o serviço', async (t) => {
  if (skip(t)) return;
  const seller = await amb.criarUsuario('Freelancer'), buyer = await amb.criarUsuario();
  const item = await service(seller);
  const original = Contrato.create.bind(Contrato);
  t.mock.method(Contrato, 'create', async (...args) => {
    const removed = await amb.chamar('DELETE', `/api/servicos/${item._id}`, seller);
    assert.equal(removed.status, 200);
    return original(...args);
  });
  const result = await amb.chamar('POST', '/api/contratos', buyer, { servicoId: String(item._id), detalhesPedido: 'pedido de teste' });
  assert.equal(result.status, 409);
  assert.equal(await Contrato.countDocuments({ servico: item._id, status: { $in: Contrato.STATUS_ATIVOS } }), 0);
});

test('retirada em verificação bloqueia contratação antes de procurar contratos', async (t) => {
  if (skip(t)) return;
  const seller = await amb.criarUsuario('Freelancer'), buyer = await amb.criarUsuario();
  const item = await service(seller);
  const original = Contrato.countDocuments.bind(Contrato);
  let request;
  t.mock.method(Contrato, 'countDocuments', async (query) => {
    const count = await original(query);
    if (String(query.servico) === String(item._id)) {
      request = await amb.chamar('POST', '/api/contratos', buyer, { servicoId: String(item._id), detalhesPedido: 'pedido durante retirada' });
    }
    return count;
  });
  assert.equal((await amb.chamar('DELETE', `/api/servicos/${item._id}`, seller)).status, 200);
  assert.equal(request.status, 409);
});

test('anúncio iniciado antes da exclusão não permanece publicado depois dela', async (t) => {
  if (skip(t)) return;
  const seller = await amb.criarUsuario('Freelancer');
  const original = Servico.create.bind(Servico);
  t.mock.method(Servico, 'create', async (...args) => {
    const deleted = await amb.chamar('DELETE', '/api/usuarios/perfil', seller, { senhaAtual: 'senha-forte-1' });
    assert.equal(deleted.status, 200);
    return original(...args);
  });
  const result = await amb.chamar('POST', '/api/servicos', seller, { nome: 'Anúncio em curso', descricao: 'Descrição', preco: 100, categoriaId: 1 });
  assert.equal(result.status, 409);
  assert.equal(await Servico.countDocuments({ freelancer: seller._id, removido: { $ne: true } }), 0);
});

test('recuperação retira anúncio tardio de conta já anonimizada', async (t) => {
  if (skip(t)) return;
  const seller = await amb.criarUsuario('Freelancer');
  assert.equal((await amb.chamar('DELETE', '/api/usuarios/perfil', seller, { senhaAtual: 'senha-forte-1' })).status, 200);
  const late = await service(seller);
  await require('../src/services/contaService').recuperarExclusoesPendentes();
  assert.equal((await Servico.findById(late._id)).removido, true);
});

test('recuperação cancela pedido de serviço retirado se o processo caiu antes da conferência', async (t) => {
  if (skip(t)) return;
  const seller = await amb.criarUsuario('Freelancer'), buyer = await amb.criarUsuario();
  const item = await service(seller, { removido: true, removidoEm: new Date() });
  const late = await Contrato.create({ cliente: buyer._id, freelancer: seller._id, servico: item._id, preco: 100, status: 'pendente' });
  const done = await Contrato.create({ cliente: buyer._id, freelancer: seller._id, servico: item._id, preco: 100, status: 'concluido' });
  await require('../src/services/contaService').recuperarExclusoesPendentes();
  assert.equal((await Contrato.findById(late._id)).status, 'cancelado');
  assert.equal((await Contrato.findById(done._id)).status, 'concluido');
});

test('catálogo pagina todos os resultados e ordena avaliação antes de limitar', async (t) => {
  if (skip(t)) return;
  await Servico.deleteMany({});
  const seller = await amb.criarUsuario('Freelancer'), buyer = await amb.criarUsuario();
  const items = [];
  for (let i = 0; i < 26; i++) items.push(await service(seller, { nome: `Item ${i}`, createdAt: new Date(2020, 0, i + 1) }));
  await Avaliacao.create({ autor: buyer._id, freelancer: seller._id, servico: items[0]._id, contrato: new amb.mongoose.Types.ObjectId(), notaServico: 5, notaFreelancer: 5 });
  const first = await amb.chamar('GET', '/api/servicos?ordenar=avaliacao&page=1&limit=24');
  assert.equal(first.dados.dados[0].idServico, String(items[0]._id));
  assert.equal(first.dados.pagination.total, 26);
  const second = await amb.chamar('GET', '/api/servicos?page=2&limit=24');
  assert.equal(second.dados.dados.length, 2);
  const rated = await amb.chamar('GET', '/api/servicos?avaliacaoMin=4.5&ordenar=avaliacao');
  assert.equal(rated.dados.pagination.total, 1);
  assert.equal(rated.dados.dados[0].idServico, String(items[0]._id));
  const categoryPage = await amb.chamar('GET', '/api/servicos/categoria/1?page=2&limit=24');
  assert.equal(categoryPage.dados.dados.length, 2);
  assert.equal(categoryPage.dados.pagination.total, 26);
  const invalidPage = await amb.chamar('GET', '/api/servicos?page=Infinity&limit=1.5');
  assert.equal(invalidPage.status, 200);
  assert.equal(invalidPage.dados.pagination.page, 1);
  assert.equal(invalidPage.dados.pagination.limit, 1);
});

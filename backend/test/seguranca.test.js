// Regressões do bloco de segurança: uploads, sessões, mensagens lidas, validação/erros e rota removida.
// Usa um banco descartável próprio (nunca o banco "workly") e um segredo JWT só do teste.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET_TEST || crypto.randomBytes(32).toString('hex');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const DB_URI =
  process.env.MONGO_TEST_URI || `mongodb://127.0.0.1:27017/workly_test_seguranca_${process.pid}`;
const PASTA_PERFIS = path.resolve(__dirname, '../uploads/perfis');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 1)
]);

let app, server, base, Usuario, Servico, Categoria, Contrato, Mensagem;
let disponivel = true;
const criados = new Set();

test.before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 1500 });
  } catch {
    disponivel = false;
    return;
  }
  assert.match(mongoose.connection.name, /^workly_test_/);
  await mongoose.connection.dropDatabase();
  app = require('../src/app');
  ({ default: Usuario } = { default: require('../src/models/Usuario') });
  Servico = require('../src/models/Servico');
  Categoria = require('../src/models/Categoria');
  Contrato = require('../src/models/Contrato');
  Mensagem = require('../src/models/Mensagem');
  await Usuario.init();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  for (const arquivo of fs.existsSync(PASTA_PERFIS) ? fs.readdirSync(PASTA_PERFIS) : []) {
    if ([...criados].some((id) => arquivo.includes(id))) fs.unlinkSync(path.join(PASTA_PERFIS, arquivo));
  }
  if (!disponivel) return;
  server?.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

// gera CPFs válidos distintos para cada usuário de teste.
function cpfValido(n) {
  const base = String(100000000 + n).slice(-9).split('').map(Number);
  const digito = (numeros) => {
    const soma = numeros.reduce((total, d, i) => total + d * (numeros.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join('');
}
let sequencia = 0;
async function criarUsuario(tipoConta = 'Contratante', extra = {}) {
  const i = sequencia++;
  const usuario = await Usuario.create({
    nome: `Usuário ${i}`,
    email: `usuario${i}@teste.local`,
    senha: await bcrypt.hash('senha-forte-1', 4),
    cpf: cpfValido(4242 + i * 7919),
    tipoConta,
    areaAtuacao: tipoConta === 'Freelancer' ? 'Design' : '',
    ...extra
  });
  criados.add(String(usuario._id));
  return usuario;
}
function token(usuario, payload = {}, opcoes = {}) {
  return jwt.sign(
    { id_usuario: String(usuario._id), nome: usuario.nome, tipo: usuario.tipoConta, sv: usuario.versaoSessao || 0, ...payload },
    process.env.JWT_SECRET,
    { expiresIn: '1h', ...opcoes }
  );
}
async function chamar(metodo, rota, { auth, json, form, bruto, tipo } = {}) {
  const headers = {};
  if (auth) headers.Authorization = `Bearer ${auth}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (bruto !== undefined) {
    headers['Content-Type'] = tipo || 'application/json';
    body = bruto;
  } else if (form) body = form;
  const resposta = await fetch(base + rota, { method: metodo, headers, body });
  const texto = await resposta.text();
  let dados = null;
  try {
    dados = JSON.parse(texto);
  } catch {}
  return { status: resposta.status, dados, headers: resposta.headers };
}
function formulario(campo, conteudo, tipo, nome) {
  const form = new FormData();
  form.append(campo, new Blob([conteudo], { type: tipo }), nome);
  return form;
}
const arquivosDe = (usuario) =>
  fs.readdirSync(PASTA_PERFIS).filter((arquivo) => arquivo.includes(String(usuario._id)));

test('uploads: recusa conteúdo que não é imagem real e não deixa arquivo no disco', async (t) => {
  if (!disponivel) return t.skip('MongoDB local indisponível');
  const usuario = await criarUsuario();
  const auth = token(usuario);
  const html = formulario('nova_foto', '<script>alert(1)</script>', 'image/png', 'x.html');
  const disfarcado = await chamar('POST', '/api/usuarios/perfil/foto', { auth, form: html });
  assert.equal(disfarcado.status, 400, JSON.stringify(disfarcado.dados));
  const gif = await chamar('POST', '/api/usuarios/perfil/foto', {
    auth,
    form: formulario('nova_foto', 'GIF89a......', 'image/gif', 'a.gif')
  });
  assert.equal(gif.status, 400);
  const grande = await chamar('POST', '/api/usuarios/perfil/foto', {
    auth,
    form: formulario('nova_foto', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), 'image/png', 'g.png')
  });
  assert.equal(grande.status, 400);
  assert.deepEqual(arquivosDe(usuario), []);
  assert.equal((await Usuario.findById(usuario._id)).fotoPerfil, '/uploads/perfis/perfil_padrao.svg');
});

test('uploads: imagem válida ganha nome e extensão do servidor e é servida com nosniff', async (t) => {
  if (!disponivel) return t.skip('MongoDB local indisponível');
  const usuario = await criarUsuario();
  const resposta = await chamar('POST', '/api/usuarios/perfil/foto', {
    auth: token(usuario),
    form: formulario('nova_foto', PNG, 'image/png', '../../evil.html')
  });
  assert.equal(resposta.status, 200);
  const foto = (await Usuario.findById(usuario._id)).fotoPerfil;
  assert.match(foto, /^\/uploads\/perfis\/perfil_[a-f\d]{24}_\d+_[a-f\d]{12}\.png$/);
  const servido = await fetch(base + foto);
  assert.equal(servido.status, 200);
  assert.equal(servido.headers.get('content-type'), 'image/png');
  assert.equal(servido.headers.get('x-content-type-options'), 'nosniff');
  assert.match(servido.headers.get('content-security-policy'), /sandbox/);
  const padrao = await fetch(base + '/uploads/perfis/perfil_padrao.svg');
  assert.equal(padrao.status, 200);
  assert.equal((await fetch(base + '/uploads/perfis/qualquer.html')).status, 404);
});

test('uploads: serviço com arquivo falso é recusado antes de criar o anúncio', async (t) => {
  if (!disponivel) return t.skip('MongoDB local indisponível');
  const freelancer = await criarUsuario('Freelancer');
  await Categoria.create({ legacyId: 1, nome: 'Design', slug: 'design' });
  const form = formulario('imagem_servico', '<svg onload=alert(1)>', 'image/webp', 'a.svg');
  form.append('nome', 'Serviço');
  form.append('descricao', 'Descrição');
  form.append('preco', '100');
  form.append('categoriaId', '1');
  const resposta = await chamar('POST', '/api/servicos', { auth: token(freelancer), form });
  assert.equal(resposta.status, 400);
  assert.equal(await Servico.countDocuments({ freelancer: freelancer._id }), 0);
});

test('sessões: algoritmo fixo, token legado sem versão e conta excluída', async (t) => {
  if (!disponivel) return t.skip('MongoDB local indisponível');
  const usuario = await criarUsuario();
  const legado = jwt.sign(
    { id_usuario: String(usuario._id), nome: usuario.nome, tipo: usuario.tipoConta },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  assert.equal((await chamar('GET', '/api/usuarios/perfil', { auth: legado })).status, 200);
  const hs512 = token(usuario, {}, { algorithm: 'HS512' });
  assert.equal((await chamar('GET', '/api/usuarios/perfil', { auth: hs512 })).status, 401);
  const semAssinatura = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
    JSON.stringify({ id_usuario: String(usuario._id) })
  ).toString('base64url')}.`;
  assert.equal((await chamar('GET', '/api/usuarios/perfil', { auth: semAssinatura })).status, 401);

  const auth = token(usuario);
  assert.equal((await chamar('DELETE', '/api/usuarios/perfil', { auth, json: { senhaAtual: 'senha-forte-1' } })).status, 200);
  const depois = await chamar('GET', '/api/contratos/meus', { auth });
  assert.equal(depois.status, 401);
  assert.match(depois.dados.mensagem, /token/i);
});

test('sessões: trocar a senha revoga tokens antigos e devolve um token novo', async (t) => {
  if (!disponivel) return t.skip('MongoDB local indisponível');
  const usuario = await criarUsuario();
  const antigo = token(usuario);
  const outroDispositivo = token(usuario);
  const troca = await chamar('PUT', '/api/usuarios/perfil/senha', {
    auth: antigo,
    json: { senhaAtual: 'senha-forte-1', novaSenha: 'senha-nova-22', confirmarSenha: 'senha-nova-22' }
  });
  assert.equal(troca.status, 200);
  assert.ok(troca.dados.token);
  assert.equal(troca.dados.user.versaoSessao, undefined);
  for (const velho of [antigo, outroDispositivo]) {
    const negado = await chamar('GET', '/api/usuarios/perfil', { auth: velho });
    assert.equal(negado.status, 401);
    assert.match(negado.dados.mensagem, /token/i);
  }
  assert.equal((await chamar('GET', '/api/usuarios/perfil', { auth: troca.dados.token })).status, 200);
  const login = await chamar('POST', '/api/autenticacao/login', {
    json: { email: usuario.email, senha: 'senha-nova-22' }
  });
  assert.equal(login.status, 200);
  assert.equal(jwt.decode(login.dados.token, { complete: true }).header.alg, 'HS256');
  assert.equal((await chamar('GET', '/api/usuarios/perfil', { auth: login.dados.token })).status, 200);
  const tipoInvalido = await chamar('PUT', '/api/usuarios/perfil/senha', {
    auth: login.dados.token,
    json: { senhaAtual: { $ne: '' }, novaSenha: 'senha-nova-33', confirmarSenha: 'senha-nova-33' }
  });
  assert.equal(tipoInvalido.status, 400);
});

test('mensagens lidas: só participantes marcam mensagens recebidas; operadores são recusados', async (t) => {
  if (!disponivel) return t.skip('MongoDB local indisponível');
  const [freelancer, cliente, estranho] = [
    await criarUsuario('Freelancer'),
    await criarUsuario(),
    await criarUsuario()
  ];
  const categoria = await Categoria.findOneAndUpdate(
    { legacyId: 2 },
    { nome: 'Programação', slug: 'programacao' },
    { upsert: true, new: true }
  );
  const servico = await Servico.create({ nome: 'S', descricao: 'd', preco: 10, categoria: categoria._id, freelancer: freelancer._id });
  const contrato = await Contrato.create({ cliente: cliente._id, freelancer: freelancer._id, servico: servico._id, preco: 10, status: 'em_andamento' });
  const recebida = await Mensagem.create({ contrato: contrato._id, remetente: cliente._id, texto: 'oi' });
  const outra = await Mensagem.create({ contrato: contrato._id, remetente: cliente._id, texto: 'oi de novo' });
  const rota = '/api/notificacoes/contexto/lidas';

  const deFora = await chamar('PATCH', rota, { auth: token(estranho), json: { contexto: 'mensagens', referenciaId: String(recebida._id) } });
  assert.equal(deFora.status, 200);
  assert.equal(deFora.dados.dados.mensagensAtualizadas, 0);
  const operador = await chamar('PATCH', rota, { auth: token(estranho), json: { contexto: 'mensagens', referenciaId: { $ne: null } } });
  assert.equal(operador.status, 400);
  const lista = await chamar('PATCH', rota, { auth: token(freelancer), json: { contexto: 'contratos', referenciaId: [String(contrato._id)] } });
  assert.equal(lista.status, 400);
  const remetente = await chamar('PATCH', rota, { auth: token(cliente), json: { contexto: 'mensagens', referenciaId: String(recebida._id) } });
  assert.equal(remetente.dados.dados.mensagensAtualizadas, 0);
  assert.equal((await Mensagem.findById(recebida._id)).lida, false);

  const destinatario = await chamar('PATCH', rota, { auth: token(freelancer), json: { contexto: 'mensagens', referenciaId: String(recebida._id) } });
  assert.equal(destinatario.dados.dados.mensagensAtualizadas, 1);
  assert.equal((await Mensagem.findById(recebida._id)).lida, true);
  assert.equal((await Mensagem.findById(outra._id)).lida, false);
  assert.equal((await chamar('PATCH', '/api/notificacoes/abc/lida', { auth: token(freelancer) })).status, 400);
  assert.equal((await chamar('DELETE', '/api/notificacoes/abc', { auth: token(freelancer) })).status, 400);
});

test('perfil: valida tipos e formatos, devolve 409 para e-mail em uso e salva dados válidos', async (t) => {
  if (!disponivel) return t.skip('MongoDB local indisponível');
  const [usuario, outro] = [await criarUsuario(), await criarUsuario()];
  const auth = token(usuario);
  const casos = [
    [{ nome: { $gt: '' } }, 400],
    [{ email: 'sem-arroba' }, 400],
    [{ email: ['a@b.com'] }, 400],
    [{ site: 'javascript:alert(1)' }, 400],
    [{ bio: 'x'.repeat(1001) }, 400],
    [{ notificacoesEmail: 'talvez' }, 400],
    [{ nome: '   ' }, 400],
    // M-02: trocar o e-mail exige a senha atual; sem ela, a rota não confirma se o e-mail já existe.
    [{ email: outro.email.toUpperCase() }, 400],
    [{ email: outro.email.toUpperCase(), senhaAtual: 'senha-forte-1' }, 409]
  ];
  for (const [corpo, esperado] of casos) {
    const resposta = await chamar('PUT', '/api/usuarios/perfil', { auth, json: corpo });
    assert.equal(resposta.status, esperado, JSON.stringify(corpo));
    assert.ok(resposta.dados.mensagem);
  }
  const valido = await chamar('PUT', '/api/usuarios/perfil', {
    auth,
    json: { nome: 'Nome Novo', email: 'NOVO@teste.local', senhaAtual: 'senha-forte-1', site: 'meusite.com.br', notificacoesEmail: 'false', tipoConta: 'Freelancer' }
  });
  assert.equal(valido.status, 200);
  const salvo = await Usuario.findById(usuario._id);
  assert.equal(salvo.nome, 'Nome Novo');
  assert.equal(salvo.email, 'novo@teste.local');
  assert.equal(salvo.notificacoesEmail, false);
  assert.equal(salvo.tipoConta, 'Contratante');
});

test('erros: JSON malformado é 400 e erro interno não vaza detalhes', async (t) => {
  if (!disponivel) return t.skip('MongoDB local indisponível');
  const usuario = await criarUsuario();
  const malformado = await chamar('PUT', '/api/usuarios/perfil', { auth: token(usuario), bruto: '{"nome":' });
  assert.equal(malformado.status, 400);
  const original = console.error;
  console.error = () => {};
  t.mock.method(Usuario, 'findById', () => {
    throw new Error('detalhe-interno-secreto');
  });
  const falha = await chamar('GET', '/api/contratos/meus', { auth: token(usuario) });
  console.error = original;
  assert.equal(falha.status, 500);
  assert.doesNotMatch(JSON.stringify(falha.dados), /detalhe-interno-secreto/);
});

test('dashboard público foi removido', async (t) => {
  if (!disponivel) return t.skip('MongoDB local indisponível');
  assert.equal((await chamar('GET', '/api/dashboard/mongo')).status, 404);
});

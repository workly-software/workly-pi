process.env.TRUST_PROXY = 'loopback';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { iniciarAmbiente, sessaoDoCookie } = require('./helpers/apiTeste');

const SENHA = 'senha-forte-1';
let amb;
let Usuario;
let SessaoRevogada;
let ip = 0;
test.before(async () => {
  amb = await iniciarAmbiente('sessao_cookie');
  if (!amb) return;
  Usuario = require('../src/models/Usuario');
  SessaoRevogada = require('../src/models/SessaoRevogada');
  await SessaoRevogada.createIndexes();
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

async function req(metodo, rota, { cookie, bearer, corpo, aplicativo = true, form, extra = {} } = {}) {
  const headers = { 'X-Forwarded-For': `198.19.0.${(ip += 1) % 250}`, ...extra };
  if (aplicativo) headers['X-Workly-Requisicao'] = '1';
  if (cookie) headers.Cookie = `workly_sessao=${encodeURIComponent(cookie)}`;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  let body;
  if (corpo !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(corpo);
  } else if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  const r = await fetch(amb.base + rota, { method: metodo, headers, body });
  return { status: r.status, dados: await r.json().catch(() => null), sessao: sessaoDoCookie(r), setCookie: r.headers.getSetCookie() };
}
const entrar = (email, opcoes = {}) => req('POST', '/api/autenticacao/login', { corpo: { email, senha: SENHA }, ...opcoes });
const perfil = (opcoes) => req('GET', '/api/usuarios/perfil', opcoes);

test('login: token só no cookie HttpOnly, SameSite=Strict, Path=/api, 24 h; nada no corpo', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const r = await entrar(usuario.email);
  assert.equal(r.status, 200);
  assert.equal(r.dados.token, undefined, 'o corpo não pode expor o token a scripts da página');
  assert.equal(JSON.stringify(r.dados).includes(r.sessao), false);
  const cookie = r.setCookie.find((c) => c.startsWith('workly_sessao='));
  assert.ok(cookie, 'login deve criar o cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\/api/);
  assert.match(cookie, /Max-Age=86400/);
  assert.doesNotMatch(cookie, /Secure/i, 'em HTTP simples o cookie não é Secure');
  const dados = jwt.decode(r.sessao);
  assert.equal(dados.exp - dados.iat, 86400, 'a sessão vale 24 horas');
  assert.ok(dados.jti, 'cada sessão tem identificador próprio');
  assert.notEqual(jwt.decode((await entrar(usuario.email)).sessao).jti, dados.jti);
});

test('atrás de proxy HTTPS confiável o cookie é Secure', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const r = await entrar(usuario.email, { extra: { 'X-Forwarded-Proto': 'https' } });
  assert.match(r.setCookie.find((c) => c.startsWith('workly_sessao=')), /Secure/);
});

test('sessão por cookie exige o cabeçalho da aplicação (CSRF); Bearer continua para clientes de API', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const { sessao } = await entrar(usuario.email);
  assert.equal((await perfil({ cookie: sessao })).status, 200);
  const semCabecalho = await perfil({ cookie: sessao, aplicativo: false });
  assert.equal(semCabecalho.status, 403, 'pedido disparado por outro site (sem o cabeçalho) é recusado');
  const forjado = await req('PUT', '/api/usuarios/perfil', { cookie: sessao, aplicativo: false, corpo: { bio: 'csrf' } });
  assert.equal(forjado.status, 403);
  assert.notEqual((await Usuario.findById(usuario._id).lean()).bio, 'csrf');
  assert.equal((await perfil({ bearer: sessao, aplicativo: false })).status, 200, 'Authorization não depende do cabeçalho');
  assert.equal((await perfil({})).status, 401, 'sem cookie nem Authorization');
});

test('login por formulário de outro site (sem o cabeçalho) é recusado e não cria cookie', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const r = await req('POST', '/api/autenticacao/login', { aplicativo: false, form: { email: usuario.email, senha: SENHA } });
  assert.equal(r.status, 403);
  assert.equal(r.sessao, '');
});

test('logout revoga só esta sessão, apaga o cookie e mantém os outros aparelhos', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const aqui = (await entrar(usuario.email)).sessao;
  const outro = (await entrar(usuario.email)).sessao;
  const r = await req('POST', '/api/autenticacao/logout', { cookie: aqui });
  assert.equal(r.status, 200);
  const apagado = r.setCookie.find((c) => c.startsWith('workly_sessao='));
  assert.match(apagado, /workly_sessao=;/);
  assert.match(apagado, /Expires=Thu, 01 Jan 1970/);
  const reuso = await perfil({ cookie: aqui });
  assert.equal(reuso.status, 401, 'o token copiado antes do logout deixa de valer');
  assert.match(reuso.dados.mensagem, /token/i);
  assert.equal((await perfil({ bearer: aqui })).status, 401, 'nem como Authorization');
  assert.equal((await perfil({ cookie: outro })).status, 200, 'o outro aparelho continua conectado');
  const revogada = await SessaoRevogada.findOne({ jti: jwt.decode(aqui).jti }).lean();
  assert.equal(revogada.expiraEm.getTime(), jwt.decode(aqui).exp * 1000, 'o registro some quando o token expiraria');
});

test('logout sem o cabeçalho da aplicação é recusado e a sessão continua', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const { sessao } = await entrar(usuario.email);
  assert.equal((await req('POST', '/api/autenticacao/logout', { cookie: sessao, aplicativo: false })).status, 403);
  assert.equal((await perfil({ cookie: sessao })).status, 200);
});

test('logout sem sessão, com token inválido ou repetido responde 200', async (t) => {
  if (pular(t)) return;
  assert.equal((await req('POST', '/api/autenticacao/logout', {})).status, 200);
  assert.equal((await req('POST', '/api/autenticacao/logout', { cookie: 'lixo.invalido.x' })).status, 200);
  const usuario = await amb.criarUsuario();
  const { sessao } = await entrar(usuario.email);
  assert.equal((await req('POST', '/api/autenticacao/logout', { cookie: sessao })).status, 200);
  assert.equal((await req('POST', '/api/autenticacao/logout', { cookie: sessao })).status, 200);
  assert.equal(await SessaoRevogada.countDocuments({ jti: jwt.decode(sessao).jti }), 1);
});

test('token antigo sem jti: o logout encerra todas as sessões da conta', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const antigo = amb.token(usuario);
  assert.equal(jwt.decode(antigo).jti, undefined);
  assert.equal((await perfil({ bearer: antigo })).status, 200);
  assert.equal((await req('POST', '/api/autenticacao/logout', { bearer: antigo })).status, 200);
  assert.equal((await perfil({ bearer: antigo })).status, 401);
  assert.equal((await Usuario.findById(usuario._id).lean()).versaoSessao, 1);
});

test('troca de senha pelo navegador: cookie novo, o anterior deixa de valer', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const { sessao } = await entrar(usuario.email);
  const r = await req('PUT', '/api/usuarios/perfil/senha', {
    cookie: sessao,
    corpo: { senhaAtual: SENHA, novaSenha: 'senha-nova-44', confirmarSenha: 'senha-nova-44' }
  });
  assert.equal(r.status, 200);
  assert.equal(r.dados.token, undefined);
  assert.ok(r.sessao);
  assert.equal((await perfil({ cookie: sessao })).status, 401);
  assert.equal((await perfil({ cookie: r.sessao })).status, 200);
});

test('excluir a conta apaga o cookie', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const { sessao } = await entrar(usuario.email);
  const r = await req('DELETE', '/api/usuarios/perfil', { cookie: sessao, corpo: { senhaAtual: SENHA } });
  assert.equal(r.status, 200);
  assert.match(r.setCookie.find((c) => c.startsWith('workly_sessao=')), /Expires=Thu, 01 Jan 1970/);
  assert.equal((await perfil({ cookie: sessao })).status, 401);
});

test('a coleção de sessões revogadas expira sozinha (índice TTL)', async (t) => {
  if (pular(t)) return;
  const indice = (await SessaoRevogada.collection.indexes()).find((i) => i.key.expiraEm === 1);
  assert.equal(indice?.expireAfterSeconds, 0);
});

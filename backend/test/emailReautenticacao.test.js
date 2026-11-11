// M-02: trocar o e-mail exige a senha atual e encerra as outras sessões; editar o resto do perfil não exige.
process.env.TRUST_PROXY = 'loopback';

const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarAmbiente, sessaoDoCookie } = require('./helpers/apiTeste');

const SENHA = 'senha-forte-1';
let amb;
let Usuario;
let ip = 0;
test.before(async () => {
  amb = await iniciarAmbiente('email_reauth');
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

async function req(metodo, rota, token, corpo) {
  const headers = { 'X-Workly-Requisicao': '1', 'X-Forwarded-For': `198.18.0.${(ip += 1) % 250}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(amb.base + rota, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, dados: await r.json().catch(() => null), sessao: sessaoDoCookie(r) };
}
const perfil = (token, corpo) => req('PUT', '/api/usuarios/perfil', token, corpo);
const login = (email, senha = SENHA) => req('POST', '/api/autenticacao/login', null, { email, senha });

async function contaLogada() {
  const usuario = await amb.criarUsuario();
  const r = await login(usuario.email);
  assert.equal(r.status, 200);
  return { usuario, token: r.sessao };
}

test('trocar o e-mail sem a senha atual é recusado e nada muda', async (t) => {
  if (pular(t)) return;
  const { usuario, token } = await contaLogada();
  for (const corpo of [{ email: 'novo1@teste.local' }, { email: 'novo1@teste.local', senhaAtual: '' }, { email: 'novo1@teste.local', senhaAtual: { $ne: null } }]) {
    const r = await perfil(token, corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.match(r.dados.mensagem, /senha atual/i);
  }
  const salvo = await Usuario.findById(usuario._id).lean();
  assert.equal(salvo.email, usuario.email);
  assert.equal((await login(usuario.email)).status, 200, 'o dono continua entrando com o e-mail original');
});

test('senha atual errada: 403 (não 401, que derrubaria a sessão no frontend) e nada muda', async (t) => {
  if (pular(t)) return;
  const { usuario, token } = await contaLogada();
  const r = await perfil(token, { email: 'novo2@teste.local', senhaAtual: 'senha-errada-9', bio: 'tentativa' });
  assert.equal(r.status, 403);
  assert.equal(r.dados.mensagem, 'Senha atual incorreta.');
  const salvo = await Usuario.findById(usuario._id).lean();
  assert.equal(salvo.email, usuario.email);
  assert.notEqual(salvo.bio, 'tentativa', 'nenhum campo é gravado quando a senha está errada');
  assert.equal((await req('GET', '/api/usuarios/perfil', token)).status, 200, 'a sessão atual continua válida');
});

test('com a senha certa o e-mail muda, as outras sessões caem e a resposta traz um token novo', async (t) => {
  if (pular(t)) return;
  const { usuario, token } = await contaLogada();
  const outroAparelho = (await login(usuario.email)).sessao;
  const r = await perfil(token, { email: ' Novo3@Teste.local ', senhaAtual: SENHA, bio: 'junto com o e-mail' });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.ok(r.sessao, 'a sessão atual recebe um cookie novo');
  assert.equal(r.dados.token, undefined, 'M-04: o token não aparece no corpo');
  assert.equal(r.dados.user.email, 'novo3@teste.local');
  assert.equal(r.dados.user.bio, 'junto com o e-mail');

  assert.equal((await req('GET', '/api/usuarios/perfil', token)).status, 401, 'o token antigo deixa de valer');
  assert.equal((await req('GET', '/api/usuarios/perfil', outroAparelho)).status, 401, 'outras sessões são encerradas');
  assert.equal((await req('GET', '/api/usuarios/perfil', r.sessao)).status, 200);
  assert.equal((await login(usuario.email)).status, 401);
  assert.equal((await login('novo3@teste.local')).status, 200);
});

test('o mesmo e-mail (com outra caixa ou espaços) não exige senha nem derruba sessões', async (t) => {
  if (pular(t)) return;
  const { usuario, token } = await contaLogada();
  const r = await perfil(token, { email: `  ${usuario.email.toUpperCase()} `, bio: 'só a bio' });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.sessao, '', 'sem troca de e-mail não há sessão nova');
  assert.equal(r.dados.user.bio, 'só a bio');
  assert.equal((await req('GET', '/api/usuarios/perfil', token)).status, 200);
  const salvo = await Usuario.findById(usuario._id).lean();
  assert.equal(salvo.versaoSessao || 0, 0);
});

test('editar o perfil sem o campo e-mail continua sem pedir senha', async (t) => {
  if (pular(t)) return;
  const { token } = await contaLogada();
  const r = await perfil(token, { telefone: '11999990000', localizacao: 'São Paulo' });
  assert.equal(r.status, 200);
  assert.equal(r.dados.user.localizacao, 'São Paulo');
  assert.equal((await req('GET', '/api/usuarios/perfil', token)).status, 200);
});

test('e-mail de outra conta: só revela o conflito depois da senha certa', async (t) => {
  if (pular(t)) return;
  const outra = await amb.criarUsuario();
  const { usuario, token } = await contaLogada();
  assert.equal((await perfil(token, { email: outra.email })).status, 400, 'sem senha não confirma que o e-mail existe');
  assert.equal((await perfil(token, { email: outra.email, senhaAtual: 'errada-123' })).status, 403);
  const r = await perfil(token, { email: outra.email, senhaAtual: SENHA });
  assert.equal(r.status, 409);
  assert.equal((await Usuario.findById(usuario._id).lean()).email, usuario.email);
  assert.equal((await req('GET', '/api/usuarios/perfil', token)).status, 200, 'conflito não encerra a sessão');
});

test('trocas simultâneas com o mesmo token: só uma vence', async (t) => {
  if (pular(t)) return;
  const { usuario, token } = await contaLogada();
  const respostas = await Promise.all(
    Array.from({ length: 6 }, (_, i) => perfil(token, { email: `corrida${i}-${usuario._id}@teste.local`, senhaAtual: SENHA }))
  );
  const status = respostas.map((r) => r.status);
  assert.equal(status.filter((s) => s === 200).length, 1, String(status));
  assert.ok(status.every((s) => s === 200 || s === 409 || s === 401), String(status));
  const salvo = await Usuario.findById(usuario._id).lean();
  assert.equal(salvo.versaoSessao, 1, 'a versão da sessão sobe uma única vez');
  const vencedora = respostas.find((r) => r.status === 200);
  assert.equal(salvo.email, vencedora.dados.user.email);
});

// H-01: limites de login e cadastro por cliente, com IP real atrás do proxy confiável e sem falsificação.
// A API sobe confiando no loopback, como o nginx do Docker em relação à rede interna: cada requisição
// traz X-Forwarded-For com o IP do "cliente", como o nginx envia depois de sobrescrever o cabeçalho.
process.env.TRUST_PROXY = 'loopback';

const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarAmbiente, cpfValido } = require('./helpers/apiTeste');
const { lerConfiancaProxy, chaveIpCliente } = require('../src/utils/ipCliente');

const LIMITE = 10;
let amb;
let ipSeq = 0;
// cada teste usa IPs próprios (documentação: 203.0.113.0/24 e 2001:db8::/32), então os contadores não se misturam.
const novoIp = () => `203.0.113.${++ipSeq}`;

test.before(async () => {
  amb = await iniciarAmbiente('limite');
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

async function enviar(rota, corpo, xff) {
  const headers = { 'Content-Type': 'application/json' };
  if (xff !== undefined) headers['X-Forwarded-For'] = xff;
  const resposta = await fetch(amb.base + rota, { method: 'POST', headers, body: JSON.stringify(corpo) });
  let dados = null;
  try {
    dados = await resposta.json();
  } catch {}
  return { status: resposta.status, dados, headers: resposta.headers };
}

const loginErrado = (xff) =>
  enviar('/api/autenticacao/login', { email: 'ninguem@teste.local', senha: 'senha-errada-1' }, xff);
// corpo incompleto: responde 400 sem criar conta, mas conta no limite do cadastro.
const cadastroInvalido = (xff, rota = '/api/autenticacao/cadastro') => enviar(rota, { nome: 'x' }, xff);

async function esgotar(fn, xff) {
  const status = [];
  for (let i = 0; i < LIMITE; i += 1) status.push((await fn(xff)).status);
  return status;
}

test('TRUST_PROXY: vazio desliga, lista é aceita, "true" e saltos são recusados', () => {
  assert.equal(lerConfiancaProxy(undefined), false);
  assert.equal(lerConfiancaProxy('  '), false);
  assert.equal(lerConfiancaProxy('false'), false);
  assert.deepEqual(lerConfiancaProxy('loopback, 10.0.0.5 ,172.16.0.0/12'), ['loopback', '10.0.0.5', '172.16.0.0/12']);
  assert.throws(() => lerConfiancaProxy('true'), /TRUST_PROXY/);
  assert.throws(() => lerConfiancaProxy('TRUE'), /TRUST_PROXY/);
  assert.throws(() => lerConfiancaProxy('1'), /TRUST_PROXY/);
});

test('chave do limite: IPv4 mapeado vira IPv4 e IPv6 é agrupado por /64', () => {
  assert.equal(chaveIpCliente('203.0.113.7'), '203.0.113.7');
  assert.equal(chaveIpCliente('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(chaveIpCliente('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
  assert.equal(chaveIpCliente('2001:0db8:0001:0002:ffff:ffff:ffff:ffff'), '2001:db8:1:2::/64');
  assert.equal(chaveIpCliente('::1'), '0:0:0:0::/64');
  assert.equal(chaveIpCliente('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.notEqual(chaveIpCliente('2001:db8:1:2::1'), chaveIpCliente('2001:db8:1:3::1'));
  assert.equal(chaveIpCliente(undefined), 'desconhecido');
});

test('clientes atrás do mesmo proxy têm contadores independentes de login', async (t) => {
  if (pular(t)) return;
  const a = novoIp();
  const b = novoIp();
  assert.deepEqual(await esgotar(loginErrado, a), Array(LIMITE).fill(401));
  const bloqueado = await loginErrado(a);
  assert.equal(bloqueado.status, 429);
  assert.equal((await loginErrado(b)).status, 401, 'outro cliente atrás do mesmo proxy não pode ser bloqueado');
});

test('429 consistente: envelope de erro da API e cabeçalhos RateLimit', async (t) => {
  if (pular(t)) return;
  const ip = novoIp();
  await esgotar(loginErrado, ip);
  const r = await loginErrado(ip);
  assert.equal(r.status, 429);
  assert.equal(r.dados.sucesso, false);
  assert.match(r.dados.mensagem, /Muitas tentativas de login/);
  assert.equal(r.dados.message, r.dados.mensagem);
  assert.ok(r.headers.get('ratelimit-limit'));
  assert.equal(r.headers.get('ratelimit-remaining'), '0');
  assert.ok(Number(r.headers.get('retry-after')) > 0);

  const c = novoIp();
  await esgotar(cadastroInvalido, c);
  const rc = await cadastroInvalido(c);
  assert.equal(rc.status, 429);
  assert.equal(rc.dados.sucesso, false);
  assert.match(rc.dados.mensagem, /Muitas tentativas de cadastro/);
});

test('login esgotado não consome o limite do cadastro', async (t) => {
  if (pular(t)) return;
  const ip = novoIp();
  await esgotar(loginErrado, ip);
  assert.equal((await loginErrado(ip)).status, 429);
  assert.equal((await cadastroInvalido(ip)).status, 400, 'cadastro deve seguir disponível');
});

test('cadastro esgotado não consome o limite do login; /register divide o contador do cadastro', async (t) => {
  if (pular(t)) return;
  const ip = novoIp();
  for (let i = 0; i < LIMITE / 2; i += 1) assert.equal((await cadastroInvalido(ip)).status, 400);
  for (let i = 0; i < LIMITE / 2; i += 1) assert.equal((await cadastroInvalido(ip, '/api/autenticacao/register')).status, 400);
  assert.equal((await cadastroInvalido(ip)).status, 429);
  assert.equal((await cadastroInvalido(ip, '/api/autenticacao/register')).status, 429);
  assert.equal((await loginErrado(ip)).status, 401, 'login deve seguir disponível');
});

test('cadastros bem-sucedidos contam no limite do cadastro', async (t) => {
  if (pular(t)) return;
  const ip = novoIp();
  for (let i = 0; i < LIMITE; i += 1) {
    const r = await enviar(
      '/api/autenticacao/cadastro',
      { nome: `Novo ${i}`, email: `limite-novo-${ipSeq}-${i}@teste.local`, senha: 'senha-forte-1', cpf: cpfValido(500000 + ipSeq * 100 + i), tipoConta: 'Contratante' },
      ip
    );
    assert.equal(r.status, 201, JSON.stringify(r.dados));
  }
  assert.equal((await cadastroInvalido(ip)).status, 429);
});

test('logins bem-sucedidos não consomem o limite; falhas continuam bloqueadas', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const ip = novoIp();
  for (let i = 0; i < LIMITE + 5; i += 1) {
    const r = await enviar('/api/autenticacao/login', { email: usuario.email, senha: 'senha-forte-1' }, ip);
    assert.equal(r.status, 200, `login legítimo ${i + 1} foi bloqueado`);
  }
  assert.deepEqual(await esgotar(loginErrado, ip), Array(LIMITE).fill(401));
  assert.equal((await loginErrado(ip)).status, 429);
  // força bruta bloqueada também para a senha certa enquanto a janela durar.
  assert.equal((await enviar('/api/autenticacao/login', { email: usuario.email, senha: 'senha-forte-1' }, ip)).status, 429);
});

test('X-Forwarded-For encadeado: vale o endereço acrescentado pelo proxy confiável, não o forjado', async (t) => {
  if (pular(t)) return;
  const real = novoIp();
  const status = [];
  for (let i = 0; i < LIMITE + 1; i += 1) {
    // o cliente forja um IP diferente a cada tentativa; um proxy que acrescenta (em vez de sobrescrever)
    // deixa o valor forjado à esquerda e o endereço real à direita.
    status.push((await loginErrado(`198.51.100.${i + 1}, ${real}`)).status);
  }
  assert.equal(status.at(-1), 429, `rotacionar o IP forjado não pode burlar o limite: ${status}`);
});

test('conexão de fora dos proxies confiáveis: X-Forwarded-For é ignorado', async (t) => {
  if (pular(t)) return;
  const app = require('../src/app');
  const anterior = app.get('trust proxy');
  // nenhum proxy confiável (acesso direto à API): o IP é o da conexão, qualquer que seja o cabeçalho.
  app.set('trust proxy', false);
  t.after(() => app.set('trust proxy', anterior));
  const status = [];
  for (let i = 0; i < LIMITE + 1; i += 1) status.push((await loginErrado(`192.0.2.${i + 1}`)).status);
  assert.equal(status.at(-1), 429, `XFF falso a cada tentativa não pode criar baldes novos: ${status}`);
  // o mesmo vale para o cadastro, que tem o próprio contador.
  assert.equal((await cadastroInvalido('192.0.2.200')).status, 400);
});

test('IPv6: endereços da mesma /64 dividem o limite; outra /64 e IPv4 mapeado são tratados à parte', async (t) => {
  if (pular(t)) return;
  const status = [];
  for (let i = 0; i < LIMITE + 1; i += 1) status.push((await loginErrado(`2001:db8:aa:1::${(i + 1).toString(16)}`)).status);
  assert.equal(status.at(-1), 429, `trocar o sufixo dentro da mesma /64 não pode burlar o limite: ${status}`);
  assert.equal((await loginErrado('2001:db8:aa:2::1')).status, 401, 'outra /64 é outro cliente');

  const v4 = novoIp();
  await esgotar(loginErrado, v4);
  assert.equal((await loginErrado(`::ffff:${v4}`)).status, 429, 'IPv4 mapeado em IPv6 é o mesmo cliente');
});

test('o cliente volta a poder tentar depois da janela de 15 minutos', async (t) => {
  if (pular(t)) return;
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const ip = novoIp();
  await esgotar(loginErrado, ip);
  assert.equal((await loginErrado(ip)).status, 429);
  t.mock.timers.tick(14 * 60 * 1000);
  assert.equal((await loginErrado(ip)).status, 429, 'ainda dentro da janela');
  t.mock.timers.tick(60 * 1000 + 1);
  assert.equal((await loginErrado(ip)).status, 401, 'depois da janela a tentativa volta a ser avaliada');
});

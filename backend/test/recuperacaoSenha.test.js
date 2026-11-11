process.env.RECUPERACAO_SENHA_LIMITE_IP = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { iniciarAmbiente } = require('./helpers/apiTeste');

let amb, Usuario;
test.before(async () => {
  amb = await iniciarAmbiente('recuperacao');
  if (!amb) return;
  Usuario = require('../src/models/Usuario');
});
test.after(async () => amb?.encerrar());

const pular = (t) => (!amb ? t.skip('MongoDB local indisponível') : false);
const SOLICITAR = '/api/autenticacao/recuperar-senha';
const REDEFINIR = '/api/autenticacao/redefinir-senha';
const sha256 = (valor) => crypto.createHash('sha256').update(valor).digest('hex');
const noBanco = (id) => Usuario.collection.findOne({ _id: id });

function ambienteDeTeste(t, { nodeEnv, devLink }) {
  const anterior = { NODE_ENV: process.env.NODE_ENV, PASSWORD_RESET_DEV_LINK: process.env.PASSWORD_RESET_DEV_LINK };
  const definir = (chave, valor) => (valor === undefined ? delete process.env[chave] : (process.env[chave] = valor));
  definir('NODE_ENV', nodeEnv);
  definir('PASSWORD_RESET_DEV_LINK', devLink);
  const registros = [];
  for (const metodo of ['info', 'log', 'warn', 'error', 'debug']) {
    t.mock.method(console, metodo, (...args) => registros.push(args.join(' ')));
  }
  t.after(() => {
    definir('NODE_ENV', anterior.NODE_ENV);
    definir('PASSWORD_RESET_DEV_LINK', anterior.PASSWORD_RESET_DEV_LINK);
  });
  return registros;
}
const modoDev = (t) => ambienteDeTeste(t, { nodeEnv: 'development', devLink: 'console' });
const tokenDoLog = (registros) => {
  const linhas = registros.filter((linha) => linha.includes('/redefinir-senha#token='));
  return linhas.length ? linhas.at(-1).match(/token=([a-f0-9]{64})/)[1] : null;
};
async function solicitarToken(t, usuario, registros = modoDev(t)) {
  const resposta = await amb.chamar('POST', SOLICITAR, undefined, { email: usuario.email });
  assert.equal(resposta.status, 200);
  return { token: tokenDoLog(registros), resposta, registros };
}
const redefinir = (token, novaSenha = 'nova-senha-forte', confirmarSenha = novaSenha) =>
  amb.chamar('POST', REDEFINIR, undefined, { token, novaSenha, confirmarSenha });

test('resposta idêntica para e-mail existente e inexistente; só o hash fica no banco', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const registros = modoDev(t);
  const existente = await amb.chamar('POST', SOLICITAR, undefined, { email: ` ${usuario.email.toUpperCase()} ` });
  const token = tokenDoLog(registros);
  const inexistente = await amb.chamar('POST', SOLICITAR, undefined, { email: 'ninguem@teste.local' });
  assert.equal(existente.status, 200);
  assert.deepEqual(inexistente, existente);
  assert.match(existente.dados.mensagem, /Se houver uma conta com esse e-mail/);
  assert.doesNotMatch(JSON.stringify(existente.dados), /enviad|token|http/i);
  assert.ok(token, 'o link só aparece no console de desenvolvimento');
  assert.equal(registros.filter((linha) => linha.includes('token=')).length, 1, 'e-mail inexistente não gera link');

  const salvo = await noBanco(usuario._id);
  assert.equal(salvo.redefinicaoSenha.hash, sha256(token));
  assert.ok(!JSON.stringify(salvo).includes(token), 'o token puro não é gravado');
  const validade = salvo.redefinicaoSenha.expiraEm.getTime() - Date.now();
  assert.ok(validade > 29 * 60 * 1000 && validade <= 30 * 60 * 1000);
  assert.deepEqual(await amb.chamar('POST', SOLICITAR, undefined, { email: { $ne: '' } }), existente);
});

test('token expirado é recusado', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const { token } = await solicitarToken(t, usuario);
  await Usuario.updateOne({ _id: usuario._id }, { 'redefinicaoSenha.expiraEm': new Date(Date.now() - 1000) });
  const resposta = await redefinir(token);
  assert.equal(resposta.status, 400);
  assert.match(resposta.dados.mensagem, /inválido ou expirou/);
  const login = await amb.chamar('POST', '/api/autenticacao/login', undefined, { email: usuario.email, senha: 'senha-forte-1' });
  assert.equal(login.status, 200, 'a senha antiga continua valendo');
});

test('token usado não funciona de novo, e dois usos simultâneos têm um único sucesso', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const { token } = await solicitarToken(t, usuario);
  const respostas = await Promise.all(
    Array.from({ length: 5 }, (_, i) => redefinir(token, `senha-paralela-${i}`))
  );
  assert.equal(respostas.filter((r) => r.status === 200).length, 1);
  assert.ok(respostas.filter((r) => r.status !== 200).every((r) => r.status === 400));
  assert.equal((await redefinir(token, 'outra-senha-forte')).status, 400);
  const salvo = await noBanco(usuario._id);
  assert.equal(salvo.redefinicaoSenha, undefined, 'o token foi consumido');
  assert.equal(salvo.versaoSessao, 1, 'só uma redefinição foi aplicada');
});

test('nova solicitação invalida o token anterior', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const registros = modoDev(t);
  const { token: primeiro } = await solicitarToken(t, usuario, registros);
  const { token: segundo } = await solicitarToken(t, usuario, registros);
  assert.notEqual(primeiro, segundo);
  assert.equal((await redefinir(primeiro)).status, 400);
  assert.equal((await redefinir(segundo)).status, 200);
});

test('senha fraca ou confirmação diferente é recusada sem consumir o token', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const { token } = await solicitarToken(t, usuario);
  for (const [senha, confirmacao] of [['curta', 'curta'], ['x'.repeat(129), 'x'.repeat(129)], [12345678, 12345678], ['senha-forte-ok', 'outra-coisa']]) {
    assert.equal((await redefinir(token, senha, confirmacao)).status, 400);
  }
  assert.equal((await redefinir('nao-e-token')).status, 400);
  assert.equal((await redefinir(token)).status, 200, 'o token continuava válido');
});

test('depois da redefinição as sessões antigas caem e só a senha nova entra', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  assert.equal((await amb.chamar('GET', '/api/usuarios/perfil', usuario)).status, 200);
  const { token } = await solicitarToken(t, usuario);
  const resposta = await redefinir(token, 'senha-nova-123');
  assert.equal(resposta.status, 200);
  assert.equal(resposta.dados.token, undefined, 'a redefinição não abre sessão');
  assert.equal((await amb.chamar('GET', '/api/usuarios/perfil', usuario)).status, 401);
  const antiga = await amb.chamar('POST', '/api/autenticacao/login', undefined, { email: usuario.email, senha: 'senha-forte-1' });
  assert.equal(antiga.status, 401);
  const nova = await amb.chamar('POST', '/api/autenticacao/login', undefined, { email: usuario.email, senha: 'senha-nova-123' });
  assert.equal(nova.status, 200);
});

test('limite por e-mail na solicitação', async (t) => {
  if (pular(t)) return;
  ambienteDeTeste(t, { nodeEnv: 'production', devLink: undefined });
  const corpo = { email: 'limite-por-email@teste.local' };
  const respostas = [];
  for (let i = 0; i < 6; i += 1) respostas.push(await amb.chamar('POST', SOLICITAR, undefined, corpo));
  assert.deepEqual(respostas.map((r) => r.status), [503, 503, 503, 503, 503, 429]);
  assert.equal((await amb.chamar('POST', SOLICITAR, undefined, { email: 'outro-email@teste.local' })).status, 503);
});

test('canal de desenvolvimento exige NODE_ENV=development e a variável explícita; fora disso nada é registrado', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  for (const combinacao of [
    { nodeEnv: 'development', devLink: undefined },
    { nodeEnv: 'development', devLink: 'true' },
    { nodeEnv: 'test', devLink: 'console' },
    { nodeEnv: 'production', devLink: 'console' },
    { nodeEnv: undefined, devLink: 'console' }
  ]) {
    await t.test(JSON.stringify(combinacao), async (st) => {
      const registros = ambienteDeTeste(st, combinacao);
      const resposta = await amb.chamar('POST', SOLICITAR, undefined, { email: usuario.email });
      assert.equal(resposta.status, 503);
      assert.deepEqual(registros, [], 'nada vai para o console');
    });
  }
  assert.equal((await noBanco(usuario._id)).redefinicaoSenha, undefined, 'nenhum token criado');
});

test('produção sem provedor: indisponível, igual para qualquer e-mail, sem token e sem dizer que enviou', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  ambienteDeTeste(t, { nodeEnv: 'production', devLink: undefined });
  const existente = await amb.chamar('POST', SOLICITAR, undefined, { email: usuario.email });
  const inexistente = await amb.chamar('POST', SOLICITAR, undefined, { email: 'nao-existe@teste.local' });
  assert.equal(existente.status, 503);
  assert.deepEqual(inexistente, existente);
  assert.match(existente.dados.mensagem, /indisponível no momento/);
  assert.doesNotMatch(existente.dados.mensagem, /enviad/i);
  assert.equal((await noBanco(usuario._id)).redefinicaoSenha, undefined);
});

test('o token ativo não aparece na serialização do usuário nem nas rotas de perfil e login', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  const { token } = await solicitarToken(t, usuario);
  const hash = sha256(token);
  assert.equal((await noBanco(usuario._id)).redefinicaoSenha.hash, hash, 'o token existe no banco');

  const comum = await Usuario.findById(usuario._id);
  const explicito = await Usuario.findById(usuario._id).select('+redefinicaoSenha.hash +redefinicaoSenha.expiraEm');
  assert.equal(explicito.redefinicaoSenha.hash, hash, 'o fluxo ainda consegue ler pedindo com +');
  for (const doc of [comum, explicito]) {
    assert.equal(doc.toJSON().redefinicaoSenha, undefined);
    assert.equal(doc.toObject().redefinicaoSenha, undefined);
    assert.ok(!JSON.stringify(doc).includes(hash));
  }
  assert.equal((await Usuario.findById(usuario._id).lean()).redefinicaoSenha?.hash, undefined);

  const perfil = await amb.chamar('GET', '/api/usuarios/perfil', usuario);
  const login = await amb.chamar('POST', '/api/autenticacao/login', undefined, { email: usuario.email, senha: 'senha-forte-1' });
  for (const resposta of [perfil, login]) {
    assert.equal(resposta.status, 200);
    const corpo = JSON.stringify(resposta.dados);
    assert.ok(!corpo.includes('redefinicao') && !corpo.includes(hash) && !corpo.includes(token));
  }
});

test('limite configurável só aceita inteiro positivo; o resto usa o padrão', () => {
  const { lerLimitePositivo } = require('../src/utils/limiteConfiguravel');
  for (const bruto of ['Infinity', '1e309', '0', '-5', 'abc', '', '1.5', ' ', '0x10', '9007199254740993', undefined, null, 50]) {
    assert.equal(lerLimitePositivo(bruto, 20), 20, `valor ${JSON.stringify(bruto)}`);
  }
  assert.equal(lerLimitePositivo('50', 20), 50);
  assert.equal(lerLimitePositivo(' 7 ', 20), 7);
});

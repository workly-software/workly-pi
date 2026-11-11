import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../src/services/apiClient.js';
import {
  buscarUsuarioAtual,
  obterUsuario,
  salvarSessao,
  login,
  cadastrar,
  iniciarSessao,
  sessaoIniciada,
  sair
} from '../src/services/authService.js';

function setup(t, values = {}) {
  const data = new Map(Object.entries(values));
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  );
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
      removeItem: (key) => data.delete(key)
    }
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  return data;
}

test('login posts only official credentials and normalizes official response aliases', async (t) => {
  setup(t);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/autenticacao/login');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { email: 'qa@example.invalid', senha: 'password' });
    return Response.json({
      sucesso: true,
      mensagem: 'Login realizado com sucesso.',
      dados: { usuario: { id_usuario: 'qa', tipo_conta: 'Contratante' } }
    });
  });
  const result = await login({ email: 'qa@example.invalid', senha: 'password' });
  assert.equal('token' in result, false);
  assert.equal(result.user.idUsuario, 'qa');
  assert.equal(result.user.tipoConta, 'Contratante');
});

test('registration posts the supplied official payload without creating a session', async (t) => {
  const storage = setup(t);
  const data = { nome: 'QA', senha: ' password ', tipoConta: 'Freelancer', areaAtuacao: 'Design' };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/autenticacao/cadastro');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), data);
    return Response.json({ sucesso: true, mensagem: 'Conta criada.' }, { status: 201 });
  });
  assert.equal((await cadastrar(data)).mensagem, 'Conta criada.');
  assert.equal(storage.has('token'), false);
  assert.equal(storage.has('user'), false);
});

test('auth services retain credential and duplicate-email error messages', async (t) => {
  setup(t);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ sucesso: false, mensagem: 'Credenciais inválidas.' }, { status: 401 })
  );
  await assert.rejects(
    login({ email: 'qa@example.invalid', senha: 'password' }),
    (e) => e.status === 401 && e.message === 'Credenciais inválidas.'
  );
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { sucesso: false, mensagem: 'Já existe um usuário cadastrado com este e-mail.' },
      { status: 409 }
    )
  );
  await assert.rejects(
    cadastrar({}),
    (e) => e.status === 409 && e.message === 'Já existe um usuário cadastrado com este e-mail.'
  );
});

test('API preserves the official envelope, sends the app header and never a stored token (M-04)', async (t) => {
  setup(t, { token: 'leftover-legacy-token', sessao: 's1' });
  const envelope = {
    sucesso: true,
    mensagem: 'Perfil carregado.',
    dados: null,
    user: { idUsuario: 'user-id' }
  };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/usuarios/perfil');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['X-Workly-Requisicao'], '1');
    assert.equal(options.credentials, 'same-origin');
    return Response.json(envelope);
  });
  assert.deepEqual(await apiRequest('/api/usuarios/perfil'), envelope);
});

test('API keeps explicit authorization and lets the browser set multipart content type', async (t) => {
  setup(t, { token: 'stored-token' });
  const body = new FormData();
  body.append('nova_foto', 'test');
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer explicit-token');
    assert.equal(options.headers['Content-Type'], undefined);
    assert.equal(options.body, body);
    return Response.json({ sucesso: true });
  });
  await apiRequest('/api/usuarios/perfil/foto', {
    method: 'POST',
    headers: { Authorization: 'Bearer explicit-token' },
    body
  });
});

test('API exposes the official error message, HTTP status and response body', async (t) => {
  setup(t);
  const envelope = { sucesso: false, mensagem: 'Acesso negado. Token nao informado.' };
  t.mock.method(globalThis, 'fetch', async () => Response.json(envelope, { status: 401 }));
  await assert.rejects(apiRequest('/api/usuarios/perfil'), (error) => {
    assert.equal(error.message, envelope.mensagem);
    assert.equal(error.status, 401);
    assert.equal(error.response.status, 401);
    assert.deepEqual(error.data, envelope);
    return true;
  });
});

test('API handles non-JSON error bodies without masking the HTTP failure', async (t) => {
  setup(t);
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('Service unavailable', { status: 503 })
  );
  await assert.rejects(
    apiRequest('/api/usuarios/perfil'),
    (error) => error.status === 503 && error.message === 'Service unavailable'
  );
});

test('fetchCurrentUser clears only session keys on 401, preserving the theme', async (t) => {
  const data = setup(t, {
    sessao: 's1',
    user: JSON.stringify({ idUsuario: 'user-id' }),
    darkMode: 'enabled'
  });
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ mensagem: 'Token invalido ou expirado.' }, { status: 401 })
  );
  assert.equal(await buscarUsuarioAtual(true), null);
  assert.equal(data.has('sessao'), false);
  assert.equal(data.has('user'), false);
  assert.equal(data.get('darkMode'), 'enabled');
});

test('fetchCurrentUser retains the cached user on network failure, as the legacy client does', async (t) => {
  setup(t, { sessao: 's1' });
  salvarSessao({ user: { id_usuario: 'user-id', tipo_conta: 'Freelancer' } });
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  assert.equal((await buscarUsuarioAtual(true)).idUsuario, 'user-id');
  assert.equal(obterUsuario().tipoConta, 'Freelancer');
});

test('M-04: login starts a session marker, drops any legacy token and stores no secret', (t) => {
  const data = setup(t, { token: 'legacy-token-from-old-version' });
  iniciarSessao({ id_usuario: 'qa', tipo_conta: 'Contratante' });
  assert.equal(data.has('token'), false);
  assert.ok(sessaoIniciada());
  assert.equal(obterUsuario().idUsuario, 'qa');
  const marker = sessaoIniciada();
  iniciarSessao({ id_usuario: 'qa' });
  assert.notEqual(sessaoIniciada(), marker, 'each login gets its own marker');
});

test('M-04: sair revokes the session on the API and clears local state, even offline', async (t) => {
  const data = setup(t, { sessao: 's1', user: '{}', darkMode: 'enabled' });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.method, options.headers['X-Workly-Requisicao']]);
    return Response.json({ sucesso: true });
  });
  await sair();
  assert.deepEqual(calls, [['/api/autenticacao/logout', 'POST', '1']]);
  assert.equal(data.has('sessao'), false);
  assert.equal(data.has('user'), false);
  assert.equal(data.get('darkMode'), 'enabled');

  data.set('sessao', 's2');
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  await sair();
  assert.equal(data.has('sessao'), false, 'a network failure still signs the browser out');
});

test('L-01: a late 401 from an older login does not clear a newer session through fetchCurrentUser', async (t) => {
  const data = setup(t, { sessao: 'old-login' });
  let finish;
  t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { finish = resolve; }));
  const pending = buscarUsuarioAtual(true);
  await new Promise((resolve) => setImmediate(resolve));
  iniciarSessao({ id_usuario: 'new' });
  const newer = data.get('sessao');
  finish(Response.json({ mensagem: 'Token inválido ou expirado.' }, { status: 401 }));
  await pending;
  assert.equal(data.get('sessao'), newer);
  assert.equal(obterUsuario().idUsuario, 'new');
});

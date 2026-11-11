import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../src/services/apiClient.js';
import { contractMessages } from '../src/services/messageService.js';
import { createRequestScope } from '../src/services/requestScope.js';

function storage(t) {
  const data = new Map([
    ['sessao', 'old-login'],
    ['user', '{}'],
    ['darkMode', 'enabled']
  ]);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key) => data.get(key), removeItem: (key) => data.delete(key) }
  });
  t.after(() =>
    original
      ? Object.defineProperty(globalThis, 'localStorage', original)
      : delete globalThis.localStorage
  );
  return data;
}

test('an expired token clears the session on a protected request and preserves preferences', async (t) => {
  const data = storage(t);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ mensagem: 'Token inválido ou expirado.' }, { status: 401 })
  );
  await assert.rejects(apiRequest('/api/contratos/meus'), { status: 401 });
  assert.equal(data.has('sessao'), false);
  assert.equal(data.has('user'), false);
  assert.equal(data.get('darkMode'), 'enabled');
});

test('an incorrect current password does not log the user out', async (t) => {
  const data = storage(t);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ mensagem: 'Senha atual incorreta.' }, { status: 401 })
  );
  await assert.rejects(apiRequest('/api/usuarios/perfil/senha'), { status: 401 });
  assert.equal(data.get('sessao'), 'old-login');
});

test('a late 401 from an old session does not clear a new login', async (t) => {
  const data = storage(t);
  let finish;
  t.mock.method(
    globalThis,
    'fetch',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const request = apiRequest('/api/contratos/meus');
  // M-04/L-01: the marker of the newer login is what protects it now (the token is an HttpOnly cookie).
  data.set('sessao', 'new-login');
  finish(Response.json({ mensagem: 'Token inválido ou expirado.' }, { status: 401 }));
  await assert.rejects(request, { status: 401 });
  assert.equal(data.get('sessao'), 'new-login');
});

test('switching conversations discards a delayed result and invalidates sends', async () => {
  const scope = createRequestScope();
  let finish;
  const oldCurrent = scope.begin();
  const late = new Promise((resolve) => {
    finish = resolve;
  }).then((value) => (oldCurrent() ? value : null));
  const current = scope.begin();
  finish('old messages');
  assert.equal(await late, null);
  assert.equal(current(), true);
  scope.invalidate();
  assert.equal(current(), false);
});

test('message reads forward cancellation to fetch', async (t) => {
  storage(t);
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return Response.json({ dados: [] });
  });
  assert.deepEqual(await contractMessages('contract', { signal: controller.signal }), []);
  controller.abort();
  await assert.rejects(contractMessages('contract', { signal: controller.signal }), {
    name: 'AbortError'
  });
});

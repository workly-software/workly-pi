import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearResetToken,
  newPasswordProblem,
  requestPasswordReset,
  resetPassword,
  takeResetToken
} from '../src/services/authService.js';

function fakeWindow(url) {
  const parsed = new URL(url);
  const win = {
    location: { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash },
    history: {
      state: { key: 'k' },
      calls: [],
      replaceState(state, _title, next) {
        this.calls.push([state, next]);
        const updated = new URL(next, 'http://workly.local');
        Object.assign(win.location, { pathname: updated.pathname, search: updated.search, hash: updated.hash });
      }
    }
  };
  return win;
}
const href = (win) => win.location.pathname + win.location.search + win.location.hash;

test('reset token leaves the URL on first read and stays in memory for the submit', async (t) => {
  t.after(clearResetToken);
  const token = 'b'.repeat(64);
  const win = fakeWindow(`http://workly.local/redefinir-senha#token=${token}`);
  assert.equal(takeResetToken(win), token);
  assert.equal(href(win), '/redefinir-senha');
  assert.ok(!href(win).includes(token));
  assert.deepEqual(win.history.calls, [[{ key: 'k' }, '/redefinir-senha']], 'replaces, never pushes, keeping router state');
  assert.equal(takeResetToken(win), token);

  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  t.after(() => (old ? Object.defineProperty(globalThis, 'localStorage', old) : delete globalThis.localStorage));
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return Response.json({ mensagem: 'ok' });
  });
  await resetPassword({ token: takeResetToken(win), novaSenha: 'nova-senha-1', confirmarSenha: 'nova-senha-1' });
  assert.equal(bodies[0].token, token);

  clearResetToken();
  assert.equal(takeResetToken(fakeWindow('http://workly.local/redefinir-senha')), '');
  const legacy = fakeWindow(`http://workly.local/redefinir-senha?token=${token}&x=1`);
  assert.equal(takeResetToken(legacy), token);
  assert.equal(href(legacy), '/redefinir-senha?x=1');
});

function storage(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  t.after(() => (original ? Object.defineProperty(globalThis, 'localStorage', original) : delete globalThis.localStorage));
}

test('password reset posts to the recovery endpoints and surfaces the unavailable state', async (t) => {
  storage(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.method, JSON.parse(options.body)]);
    return Response.json({ mensagem: 'ok' });
  });
  await requestPasswordReset('ana@teste.local');
  await resetPassword({ token: 'a'.repeat(64), novaSenha: 'nova-senha-1', confirmarSenha: 'nova-senha-1' });
  assert.deepEqual(calls, [
    ['/api/autenticacao/recuperar-senha', 'POST', { email: 'ana@teste.local' }],
    ['/api/autenticacao/redefinir-senha', 'POST', { token: 'a'.repeat(64), novaSenha: 'nova-senha-1', confirmarSenha: 'nova-senha-1' }]
  ]);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ mensagem: 'A recuperação de senha está indisponível no momento.' }, { status: 503 })
  );
  await assert.rejects(requestPasswordReset('ana@teste.local'), (error) => error.status === 503 && /indisponível/.test(error.message));
});

test('client-side password check mirrors the server rule', () => {
  assert.equal(newPasswordProblem('', ''), 'Informe a nova senha.');
  assert.match(newPasswordProblem('curta', 'curta'), /pelo menos 8/);
  assert.match(newPasswordProblem('x'.repeat(129), 'x'.repeat(129)), /no máximo 128/);
  assert.match(newPasswordProblem('senha-boa-1', 'outra'), /não confere/);
  assert.equal(newPasswordProblem('senha-boa-1', 'senha-boa-1'), '');
  assert.match(newPasswordProblem('á'.repeat(37), 'á'.repeat(37)), /72 bytes/);
  assert.equal(newPasswordProblem('á'.repeat(36), 'á'.repeat(36)), '');
});

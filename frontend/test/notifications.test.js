import test from 'node:test';
import assert from 'node:assert/strict';
import {
  notificationCounts,
  notificationList,
  markAllNotificationsRead,
  markNotificationRead
} from '../src/services/notificationService.js';
import { routeAliases, aliasDestination } from '../src/routes/routeDefinitions.js';

function storage(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null }
  });
  t.after(() =>
    original
      ? Object.defineProperty(globalThis, 'localStorage', original)
      : delete globalThis.localStorage
  );
}

test('all supported URL aliases preserve query/hash, including catalog destinations', () => {
  for (const [path, route] of Object.entries(routeAliases)) {
    assert.equal(aliasDestination(`${path}?id=a%2Fb#test`), `${route}?id=a%2Fb#test`);
  }
  assert.equal(aliasDestination('/pages/todos-servicos.html'), '/todos-servicos');
  assert.equal(aliasDestination('/pages/sobre.html'), '/sobre');
  assert.equal(aliasDestination('/pages/detalhe-servico.html.extra'), null);
});
test('notification contracts sum unread counts, filter message entries and preserve failure fallback', async (t) => {
  storage(t);
  t.mock.method(globalThis, 'fetch', async (url) =>
    Response.json(
      url.includes('/mensagens/')
        ? { dados: { naoLidas: 3 } }
        : url.includes('?')
          ? { dados: [{ tipo: 'mensagem_nova' }, { tipo: 'contrato_novo' }] }
          : { naoLidas: 2 }
    )
  );
  assert.equal(await notificationCounts(), 5);
  assert.deepEqual(await notificationList(), { items: [{ tipo: 'contrato_novo' }], messages: 3 });
  const urls = globalThis.fetch.mock.calls.map((call) => call.arguments[0]);
  const messageUrls = urls.filter((url) => url.includes('/api/mensagens/'));
  assert.equal(messageUrls.length, 2);
  assert.ok(messageUrls.every((url) => url.endsWith('/api/mensagens/nao-lidas?contexto=sino')));
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ mensagem: 'Indisponível' }, { status: 500 })
  );
  assert.equal(await notificationCounts(), 0);
  assert.deepEqual(await notificationList(), { items: [], messages: 0 });
});
test('notification read uses official PATCH endpoints and optional context payload', async (t) => {
  storage(t);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push([url, options.method, options.body]);
    return Response.json({ sucesso: true });
  });
  await markAllNotificationsRead();
  await markNotificationRead({ id: 'a/b', contexto: 'contratos', referenciaId: 'c' });
  await markNotificationRead({ contexto: 'mensagens' });
  assert.deepEqual(requests, [
    ['/api/notificacoes/todas-lidas', 'PATCH', undefined],
    ['/api/notificacoes/a%2Fb/lida', 'PATCH', undefined],
    ['/api/notificacoes/contexto/lidas', 'PATCH', '{"contexto":"contratos","referenciaId":"c"}'],
    ['/api/notificacoes/contexto/lidas', 'PATCH', '{"contexto":"mensagens"}']
  ]);
});

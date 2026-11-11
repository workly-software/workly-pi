import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeService,
  formatCurrency,
  serviceDate,
  isNewToday,
  serviceRating,
  serviceSummary,
  featuredServices,
  categoryServices,
  categoryServicePage,
  serviceDetail,
  favoriteStatus,
  updateFavorite
} from '../src/services/catalogService.js';

function storage(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'test-token' }
  });
  t.after(() =>
    original
      ? Object.defineProperty(globalThis, 'localStorage', original)
      : delete globalThis.localStorage
  );
}
test('catalog normalizes only official aliases and preserves negotiable-price behavior', () => {
  const result = normalizeService({
    id_servico: 'a',
    genero_id: '2',
    nome_genero: 'Programação',
    id_usuario: 'b',
    valor_combinar: true,
    precoNegociavel: true,
    mediaAvaliacoes: '4.8',
    totalAvaliacoes: '3'
  });
  assert.equal(result.idServico, 'a');
  assert.equal(result.categoriaId, '2');
  assert.equal(result.idUsuario, 'b');
  assert.equal(result.precoNegociavel, false);
  assert.equal(result.valorCombinar, true);
  assert.equal(serviceRating(result), '4,8 (3)');
  assert.equal(serviceRating({}), 'Sem avaliações');
  assert.equal(formatCurrency(1234.5), 'R$ 1234,50');
});
test('catalog dates and summaries match official fallback and truncation', () => {
  assert.equal(serviceDate({ createdAt: 'invalid' }), '--/--/----');
  assert.equal(serviceDate({}, 'Recentemente'), 'Recentemente');
  const date = new Date(2026, 8, 30, 12);
  assert.equal(isNewToday({ created_at: date.toISOString() }, date), true);
  assert.equal(isNewToday({}, date), false);
  assert.equal(serviceSummary('word '.repeat(50), 'QA', 'Design').length, 170);
  assert.equal(
    serviceSummary('', 'QA', 'Design'),
    'QA publicou este serviço na categoria Design. Confira a descrição e combine os detalhes antes de contratar.'
  );
});
test('featured/category/detail use exact official GET paths and envelope', async (t) => {
  storage(t);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(url);
    // M-04: no stored bearer token; the session cookie travels on its own with the app header.
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['X-Workly-Requisicao'], '1');
    return Response.json({
      dados:
        url.includes('/categoria/') || url.includes('?')
          ? Array.from({ length: 8 }, (_, id) => ({ id }))
          : { id_servico: 'detail' }
    });
  });
  assert.equal((await featuredServices()).length, 6);
  assert.equal((await categoryServices('7')).length, 8);
  assert.equal((await serviceDetail('detail')).service.idServico, 'detail');
  assert.deepEqual(requests, [
    '/api/servicos?avaliacaoMin=4.5&ordenar=recentes',
    '/api/servicos/categoria/7',
    '/api/servicos/detail'
  ]);
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/api/servicos/categoria/7?page=2&limit=24');
    return Response.json({ dados: [{ id_servico: 'restante' }], pagination: { page: 2, limit: 24, total: 25, totalPages: 2 } });
  });
  const page = await categoryServicePage('7', 2);
  assert.equal(page.services[0].idServico, 'restante');
  assert.equal(page.pagination.total, 25);
  assert.equal(page.pagination.page, 2);
});
test('favorites retain official methods payload and response, expose API failure', async (t) => {
  storage(t);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push([url, options.method, options.body]);
    return Response.json({ dados: { favoritado: true } });
  });
  assert.equal(await favoriteStatus('s'), true);
  await updateFavorite('s', false);
  await updateFavorite('s', true);
  assert.deepEqual(requests, [
    ['/api/favoritos/servico/s', undefined, undefined],
    ['/api/favoritos', 'POST', '{"servicoId":"s"}'],
    ['/api/favoritos/servico/s', 'DELETE', undefined]
  ]);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ mensagem: 'Serviço não encontrado.' }, { status: 404 })
  );
  await assert.rejects(
    serviceDetail('missing'),
    (error) => error.status === 404 && error.message === 'Serviço não encontrado.'
  );
});

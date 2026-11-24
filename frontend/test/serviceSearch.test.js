import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readServiceFilters,
  serviceSearchParams,
  serviceSearchTitle,
  searchServices,
  searchServicePage,
  servicePageNumber,
  paginationItems
} from '../src/services/serviceSearchService.js';

test('service search preserves URL aliases, requested page and select choices', () => {
  const filters = readServiceFilters(
    new URLSearchParams(
      'busca= logo &id_categoria=1&precoMin=20&precoMax=200&avaliacaoMin=4.5&ordenar=avaliacao&page=4'
    )
  );
  assert.equal(
    serviceSearchParams(filters).toString(),
    'q=logo&categoria=1&min=20&max=200&avaliacaoMin=4.5&ordenar=avaliacao&page=4&limit=24'
  );
  assert.equal(
    readServiceFilters(new URLSearchParams('categoria=unknown&ordenar=invalid')).categoria,
    ''
  );
  assert.equal(readServiceFilters(new URLSearchParams()).ordenar, 'recentes');
  for (const invalid of ['Infinity', 'NaN', '-1', '1.5', '0', '']) assert.equal(servicePageNumber(invalid), 1);
});
test('service search preserves title fallback when original query is cleared', () => {
  const original = new URLSearchParams('q=logo&categoria=1');
  assert.deepEqual(serviceSearchTitle({ q: '', categoria: '' }, original), {
    heading: 'Resultados para "logo" em Design',
    title: 'Workly - Busca'
  });
  assert.equal(
    serviceSearchTitle({ q: '', categoria: '' }, new URLSearchParams()).heading,
    'Todos os Serviços'
  );
});
test('service search uses GET, official envelope and API errors', async (t) => {
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
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/servicos?ordenar=recentes&page=1&limit=24');
    assert.equal(options.method, undefined);
    return Response.json({ dados: [{ id_servico: 's' }], pagination: { total: 99 } });
  });
  const filters = readServiceFilters(new URLSearchParams());
  assert.equal((await searchServices(filters))[0].idServico, 's');
  const page = await searchServicePage(filters);
  assert.equal(page.pagination.total, 99);
  assert.equal(page.services[0].idServico, 's');
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ mensagem: 'Erro ao buscar serviços.' }, { status: 500 })
  );
  await assert.rejects(searchServices(filters), {
    message: 'Erro ao buscar serviços.',
    status: 500
  });
});

test('pagination shows 1 2 3 at the edges, neighbours in the middle and gaps for two or more pages', () => {
  assert.deepEqual(paginationItems(1, 1), [1]);
  assert.deepEqual(paginationItems(1, 2), [1, 2]);
  assert.deepEqual(paginationItems(1, 4), [1, 2, 3, 4]);
  assert.deepEqual(paginationItems(1, 7), [1, 2, 3, 'gap-end', 7]);
  assert.deepEqual(paginationItems(1, 52), [1, 2, 3, 'gap-end', 52]);
  assert.deepEqual(paginationItems(2, 52), [1, 2, 3, 'gap-end', 52]);
  assert.deepEqual(paginationItems(3, 52), [1, 2, 3, 4, 'gap-end', 52]);
  assert.deepEqual(paginationItems(4, 52), [1, 2, 3, 4, 5, 'gap-end', 52]);
  assert.deepEqual(paginationItems(20, 52), [1, 'gap-start', 19, 20, 21, 'gap-end', 52]);
  assert.deepEqual(paginationItems(51, 52), [1, 'gap-start', 50, 51, 52]);
  assert.deepEqual(paginationItems(52, 52), [1, 'gap-start', 50, 51, 52]);
});

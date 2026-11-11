import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canReview,
  contractActions,
  contractPrice,
  contractStatus,
  contractFeedback,
  createContract,
  myContracts,
  contractAction,
  reviewContract
} from '../src/services/contractService.js';
import { aliasDestination } from '../src/routes/routeDefinitions.js';

test('contract actions require client confirmation before review', () => {
  assert.deepEqual(contractActions({ papel: 'cliente', status: 'em_andamento' }), []);
  assert.deepEqual(contractActions({ papel: 'freelancer', status: 'pendente' }), [
    ['aceitar', 'Aceitar/Iniciar'],
    ['cancelar', 'Cancelar']
  ]);
  assert.deepEqual(
    contractActions({ papel: 'freelancer', status: 'proposta_aceita' }).map((item) => item[0]),
    ['iniciar', 'entregar', 'cancelar']
  );
  for (const status of ['concluido', 'cancelado', 'encerrado'])
    for (const papel of ['cliente', 'freelancer'])
      assert.deepEqual(contractActions({ papel, status }), []);
  assert.deepEqual(contractActions({ papel: 'cliente', status: 'entregue' }), [
    ['confirmar', 'Confirmar recebimento']
  ]);
  assert.deepEqual(contractActions({ papel: 'freelancer', status: 'entregue' }), []);
  assert.equal(canReview({ papel: 'cliente', status: 'entregue' }), false);
  assert.equal(contractStatus('entregue'), 'Aguardando confirmação do cliente');
  assert.equal(contractStatus('concluido'), 'Entrega concluída');
  assert.equal(contractStatus('encerrado'), 'Concluído');
});
test('review availability, feedback and price aliases match legacy', () => {
  assert.equal(canReview({ papel: 'cliente', status: 'concluido' }), true);
  assert.equal(canReview({ papel: 'cliente', status: 'concluido', ja_avaliado: true }), false);
  assert.equal(canReview({ papel: 'freelancer', status: 'concluido' }), false);
  assert.equal(contractPrice({ tipoContratacao: 'combinar' })[1], 'Valor a combinar');
  assert.equal(contractPrice({ preco_proposto: 25 })[1], 'Proposta: R$ 25,00');
  assert.equal(
    contractFeedback({ papel: 'freelancer', status: 'encerrado' })[1],
    'Serviço avaliado pelo contratante.'
  );
});
test('a new contract for an already reviewed service offers no second review (M-01)', () => {
  const rehired = { papel: 'cliente', status: 'concluido', jaAvaliado: false, servicoJaAvaliado: true };
  assert.equal(canReview(rehired), false);
  assert.equal(canReview({ ...rehired, servicoJaAvaliado: undefined, servico_ja_avaliado: true }), false);
  assert.match(contractFeedback(rehired)[1], /já avaliou este serviço/);
  assert.equal(
    contractFeedback({ ...rehired, jaAvaliado: true })[1],
    'Avaliação enviada. Contrato encerrado.'
  );
  assert.equal(canReview({ ...rehired, servicoJaAvaliado: false }), true);
});
test('contract API keeps raw review/proposal field types, POST actions and backend errors', async (t) => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null }
  });
  t.after(() =>
    old ? Object.defineProperty(globalThis, 'localStorage', old) : delete globalThis.localStorage
  );
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options]);
    return Response.json({ dados: [] });
  });
  await myContracts();
  await createContract({ servicoId: 's', precoProposto: '', mensagem: 'QA' });
  await contractAction('c', 'entregar');
  await reviewContract({ contratoId: 'c', notaServico: '5', notaFreelancer: '4', comentario: '' });
  assert.deepEqual(
    calls.map(([url, opts]) => [url, opts.method || 'GET']),
    [
      ['/api/contratos/meus', 'GET'],
      ['/api/contratos', 'POST'],
      ['/api/contratos/c/entregar', 'POST'],
      ['/api/avaliacoes', 'POST']
    ]
  );
  assert.equal(JSON.parse(calls[1][1].body).precoProposto, '');
  assert.equal(JSON.parse(calls[3][1].body).notaServico, '5');
  assert.equal(calls[2][1].body, undefined);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { mensagem: 'Você já possui uma contratação ativa para este serviço.' },
      { status: 409 }
    )
  );
  await assert.rejects(
    createContract({}),
    (error) =>
      error.status === 409 &&
      error.message === 'Você já possui uma contratação ativa para este serviço.'
  );
  assert.equal(
    aliasDestination('/pages/contratos.html?notificacoes=contratos&contrato=c#x'),
    '/contratos?notificacoes=contratos&contrato=c#x'
  );
});
test('value negotiation: only agreed contracts move on, and labels follow whose turn it is', async (t) => {
  const { negotiationOpen, historyEntry, proposeValue, approveValue, requestAdjustment } = await import(
    '../src/services/contractService.js'
  );
  const open = (vez, extra = {}) => ({
    tipoContratacao: 'combinar',
    status: 'proposta_pendente',
    negociacao: { estado: vez === 'cliente' ? 'aguardando_cliente' : 'aguardando_freelancer', vez, valorEmNegociacao: 450 },
    precoProposto: 450,
    ...extra
  });
  assert.equal(negotiationOpen(open('cliente')), true);
  assert.deepEqual(contractActions({ ...open('freelancer'), papel: 'freelancer' }), [['recusar', 'Recusar']]);
  assert.equal(contractPrice(open('cliente'))[1], 'Contraproposta: R$ 450,00');
  assert.equal(contractFeedback({ ...open('cliente'), papel: 'cliente' }), null);
  const legacy = {
    tipoContratacao: 'combinar',
    status: 'em_andamento',
    papel: 'freelancer',
    negociacao: { estado: 'pendente_acordo', vez: 'ambos' }
  };
  assert.deepEqual(contractActions(legacy).map(([a]) => a), ['cancelar']);
  assert.equal(contractPrice(legacy)[1], 'Valor pendente de acordo');
  assert.equal(negotiationOpen({ ...legacy, status: 'cancelado' }), false);
  const closed = { tipoContratacao: 'combinar', status: 'proposta_aceita', papel: 'freelancer', preco: 450, negociacao: { estado: 'fechado' } };
  assert.equal(negotiationOpen(closed), false);
  assert.deepEqual(contractActions(closed).map(([a]) => a), ['iniciar', 'entregar', 'cancelar']);
  assert.equal(contractPrice(closed)[1], 'R$ 450,00');
  assert.equal(historyEntry({ tipo: 'contraproposta', papel: 'freelancer', valor: 450 }, 'cliente'), 'Freelancer fez contraproposta de R$ 450,00');
  assert.equal(historyEntry({ tipo: 'aceite', papel: 'cliente', valor: 450 }, 'cliente'), 'Você aprovou R$ 450,00');

  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  t.after(() => (old ? Object.defineProperty(globalThis, 'localStorage', old) : delete globalThis.localStorage));
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.method, JSON.parse(options.body)]);
    return Response.json({ dados: {} });
  });
  await proposeValue('c', 500);
  await approveValue('c', 500);
  await requestAdjustment('c', 'Faltou a versão em preto e branco.');
  assert.deepEqual(calls, [
    ['/api/contratos/c/propor-valor', 'POST', { valor: 500 }],
    ['/api/contratos/c/aprovar-valor', 'POST', { valor: 500 }],
    ['/api/contratos/c/solicitar-ajuste', 'POST', { justificativa: 'Faltou a versão em preto e branco.' }]
  ]);
});

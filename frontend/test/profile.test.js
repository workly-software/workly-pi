import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readProfile,
  profilePayload,
  updateProfile,
  updateAccountType,
  updatePassword,
  uploadPhoto,
  deleteAccount,
  emailChanged
} from '../src/services/profileService.js';
import {
  mergeDashboardWithFallback,
  formatContractStatus
} from '../src/services/profileDashboard.js';
import { aliasDestination } from '../src/routes/routeDefinitions.js';

test('profile response preserves public twelve-review summary and official aliases', () => {
  const result = profilePayload({
    dados: {
      user: { id_usuario: 'u', tipo_conta: 'Freelancer' },
      services: [{ id_servico: 's' }],
      reviews: Array(12).fill({ notaFreelancer: 5 }),
      reviewSummary: { total: 12, mediaFreelancer: 4.5 }
    }
  });
  assert.equal(result.user.idUsuario, 'u');
  assert.equal(result.services[0].idServico, 's');
  assert.equal(result.reviewSummary.total, 12);
});
test('profile services use official endpoints, bearer, partial fields and crop upload name', async (t) => {
  const values = new Map([['token', 'qa']]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) }
  });
  t.after(() =>
    previous
      ? Object.defineProperty(globalThis, 'localStorage', previous)
      : delete globalThis.localStorage
  );
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push([url, options]);
    return Response.json({
      user: { nome: 'QA', tipoConta: 'Freelancer', doisFatores: true },
      services: []
    });
  });
  await readProfile('u');
  assert.equal(values.has('user'), false);
  await readProfile();
  assert.equal(JSON.parse(values.get('user')).doisFatores, true);
  await updateProfile({ doisFatores: false });
  await updateAccountType({ tipoConta: 'Contratante', areaAtuacao: '' });
  await updatePassword({ senhaAtual: 'a', novaSenha: 'senha-nova-valida', confirmarSenha: 'senha-nova-valida' });
  await uploadPhoto(new Blob(['qa'], { type: 'image/webp' }));
  await deleteAccount();
  assert.deepEqual(
    requests.map(([url, options]) => [url, options.method || 'GET']),
    [
      ['/api/usuarios/publico/u', 'GET'],
      ['/api/usuarios/perfil', 'GET'],
      ['/api/usuarios/perfil', 'PUT'],
      ['/api/usuarios/tipo-conta', 'PATCH'],
      ['/api/usuarios/perfil/senha', 'PUT'],
      ['/api/usuarios/perfil/foto', 'POST'],
      ['/api/usuarios/perfil', 'DELETE']
    ]
  );
  assert.equal(requests[2][1].body, '{"doisFatores":false}');
  assert.equal(requests[5][1].body.get('nova_foto').name, 'foto-perfil.webp');
  for (const [, options] of requests) {
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['X-Workly-Requisicao'], '1');
  }
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ mensagem: 'Senha atual incorreta.' }, { status: 401 })
  );
  await assert.rejects(
    updatePassword({ senhaAtual: 'senha-atual', novaSenha: 'senha-nova-valida', confirmarSenha: 'senha-nova-valida' }),
    (error) => error.status === 401 && error.message === 'Senha atual incorreta.'
  );
  assert.equal(values.get('token'), 'qa');
});
test('changing the login e-mail is detected like the backend does (M-02)', () => {
  assert.equal(emailChanged('ana@x.com', ' ANA@x.com '), false);
  assert.equal(emailChanged('ana@x.com', 'outra@x.com'), true);
  assert.equal(emailChanged(undefined, 'ana@x.com'), true);
  assert.equal(emailChanged('ana@x.com', ''), false);
});
test('e-mail change sends the current password, keeps the session on 403 and refreshes the cached user', async (t) => {
  const values = new Map([['sessao', 's1']]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    }
  });
  t.after(() =>
    previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete globalThis.localStorage
  );
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return Response.json({ sucesso: false, mensagem: 'Senha atual incorreta.' }, { status: 403 });
  });
  await assert.rejects(updateProfile({ email: 'novo@x.com', senhaAtual: 'errada' }), (e) => e.status === 403);
  assert.equal(values.get('sessao'), 's1', 'a wrong password must not end the session');
  assert.deepEqual(bodies[0], { email: 'novo@x.com', senhaAtual: 'errada' });

  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ sucesso: true, user: { nome: 'Ana', email: 'novo@x.com' } })
  );
  await updateProfile({ email: 'novo@x.com', senhaAtual: 'certa' });
  assert.equal(values.has('token'), false);
  assert.equal(values.get('sessao'), 's1', 'this session keeps working');
  assert.equal(JSON.parse(values.get('user')).email, 'novo@x.com');
});
test('dashboard fallback excludes pending contracts and uses useful official dashboard', () => {
  const leads = [
    {
      tipoContratacao: 'combinar',
      status: 'proposta_pendente',
      precoProposto: 100,
      createdAt: new Date().toISOString()
    },
    { tipoContratacao: 'fixo', status: 'pendente', preco: 50, createdAt: new Date().toISOString() }
  ];
  assert.equal(mergeDashboardWithFallback({}, [], [], leads).summary.valorTotal, 0);
  const backend = { summary: { valorTotal: 123 }, recentActivities: [{ titulo: 'API' }] };
  assert.equal(mergeDashboardWithFallback(backend, [], [], leads).summary.valorTotal, 123);
  assert.equal(formatContractStatus('encerrado'), 'Concluído');
});
test('profile URL aliases preserve id/hash without intercepting unknown documents', () => {
  assert.equal(aliasDestination('/pages/perfil-publico.html?id=abc#x'), '/perfil-publico?id=abc#x');
  assert.equal(aliasDestination('/pages/perfil.html#services'), '/perfil#services');
  assert.equal(aliasDestination('/pages/perfil.html.extra'), null);
});

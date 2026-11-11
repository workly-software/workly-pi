const test = require('node:test');
const assert = require('node:assert/strict');
const Contrato = require('../src/models/Contrato');
const Notificacao = require('../src/models/Notificacao');
const controller = require('../src/controllers/contratoController');
const id = '507f1f77bcf86cd799439011';
function response() {
  return {
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}
function request(user) {
  return {
    params: { id },
    user: { id_usuario: user },
    body: {},
    protocol: 'http',
    get: () => 'localhost:3000'
  };
}
function setup(t, status) {
  const contract = {
    _id: id,
    cliente: 'client',
    freelancer: 'freelancer',
    servico: { nome: 'Serviço' },
    tipoContratacao: 'fixo',
    preco: 100,
    status,
    save: async () => {}
  };
  const query = {
    populate() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(contract).then(resolve, reject);
    }
  };
  t.mock.method(Contrato, 'findById', () => query);
  t.mock.method(Contrato, 'findOneAndUpdate', async (filter, update) => {
    const matches = Object.entries(filter).every(([key, value]) => String(contract[key]) === String(value));
    if (!matches) return null;
    Object.assign(contract, update.$set);
    return contract;
  });
  t.mock.method(Notificacao, 'create', async () => ({}));
  return contract;
}
test('delivery waits for client confirmation', async (t) => {
  const contract = setup(t, 'em_andamento');
  let res = response();
  await controller.entregar(request('freelancer'), res);
  assert.equal(res.code, 200);
  assert.equal(contract.status, 'entregue');
  res = response();
  await controller.confirmarEntrega(request('client'), res);
  assert.equal(res.code, 200);
  assert.equal(contract.status, 'concluido');
});
test('freelancer cannot confirm their own delivery', async (t) => {
  const contract = setup(t, 'entregue'),
    res = response();
  await controller.confirmarEntrega(request('freelancer'), res);
  assert.equal(res.code, 403);
  assert.equal(contract.status, 'entregue');
});
test('client cannot confirm unfinished work', async (t) => {
  const contract = setup(t, 'em_andamento'),
    res = response();
  await controller.confirmarEntrega(request('client'), res);
  assert.equal(res.code, 400);
  assert.equal(contract.status, 'em_andamento');
});
test('a third party cannot change the contract', async (t) => {
  const contract = setup(t, 'em_andamento'),
    res = response();
  await controller.entregar(request('stranger'), res);
  assert.equal(res.code, 403);
  assert.equal(contract.status, 'em_andamento');
});
test('legacy status endpoint cannot bypass client confirmation', async (t) => {
  const contract = setup(t, 'em_andamento'),
    res = response(),
    req = request('freelancer');
  req.body.status = 'concluido';
  await controller.atualizarStatus(req, res);
  assert.equal(res.code, 403);
  assert.equal(contract.status, 'em_andamento');
});

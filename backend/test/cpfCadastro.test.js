// M-03: CPF com dígitos verificadores, sem truncamento e compatível com contas antigas.
// Cada cadastro sai de um IP próprio (proxy de loopback confiável) para não esbarrar no limite de cadastro.
process.env.TRUST_PROXY = 'loopback';

const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarAmbiente } = require('./helpers/apiTeste');
const { validarCpf, motivoCpfInvalido, normalizarCpf } = require('../src/utils/cpfUtils');

// referência independente: algoritmo oficial dos dígitos verificadores.
function referencia(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i += 1) soma += Number(cpf[i]) * (n + 1 - i);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}
function gerarValido(semente) {
  const base = String(semente).padStart(9, '0').slice(-9);
  for (let d1 = 0; d1 < 10; d1 += 1)
    for (let d2 = 0; d2 < 10; d2 += 1) if (referencia(base + d1 + d2)) return base + d1 + d2;
  return null;
}
const sequencial = (cpf) => '01234567890123456789'.includes(cpf.slice(0, 9)) || '98765432109876543210'.includes(cpf.slice(0, 9));

let amb;
let ip = 0;
let seq = 0;
test.before(async () => {
  amb = await iniciarAmbiente('cpf');
});
test.after(async () => {
  if (amb) await amb.encerrar();
});
function pular(t) {
  if (!amb) {
    t.skip('MongoDB indisponível');
    return true;
  }
  return false;
}

async function cadastrar(cpf, extra = {}) {
  seq += 1;
  const resposta = await fetch(amb.base + '/api/autenticacao/cadastro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${(ip += 1) % 250}` },
    body: JSON.stringify({ nome: 'Pessoa', email: `cpf${seq}-${Date.now()}@teste.local`, senha: 'senha-forte-1', cpf, tipoConta: 'Contratante', ...extra })
  });
  return { status: resposta.status, dados: await resposta.json() };
}

test('validarCpf coincide com a referência em 5000 CPFs aleatórios e 2000 válidos', () => {
  for (let i = 0; i < 5000; i += 1) {
    const cpf = String(Math.floor(Math.random() * 1e11)).padStart(11, '0');
    assert.equal(validarCpf(cpf), referencia(cpf) && !sequencial(cpf), cpf);
  }
  for (let i = 0; i < 2000; i += 1) {
    const cpf = gerarValido(Math.floor(Math.random() * 1e9));
    assert.equal(validarCpf(cpf), !sequencial(cpf), cpf);
    // trocar qualquer dígito verificador invalida.
    const errado = cpf.slice(0, 10) + ((Number(cpf[10]) + 1) % 10);
    assert.equal(validarCpf(errado), false, errado);
  }
});

test('motivoCpfInvalido: mensagens por tipo de erro', () => {
  assert.equal(motivoCpfInvalido(''), 'CPF é obrigatório.');
  assert.equal(motivoCpfInvalido({ $ne: null }), 'CPF é obrigatório.');
  assert.equal(motivoCpfInvalido('529.982.247-25'), '');
  assert.equal(motivoCpfInvalido(' 529 982 247 25 '), '');
  assert.equal(motivoCpfInvalido(52998224725), '');
  assert.equal(motivoCpfInvalido('12345678900'), 'CPF inválido.');
  assert.equal(motivoCpfInvalido('123.456.789-09'), 'CPF inválido.');
  assert.equal(motivoCpfInvalido('11111111111'), 'CPF não pode ter todos os números iguais.');
  assert.equal(motivoCpfInvalido('5299822472599'), 'CPF deve ter 11 números.');
  assert.equal(motivoCpfInvalido('529a982b247c25'), 'CPF inválido.');
  assert.equal(normalizarCpf('529.982.247-2599'), '5299822472599', 'normalizar não pode truncar');
});

test('cadastro com CPF válido (com ou sem pontuação) é aceito e gravado só com números', async (t) => {
  if (pular(t)) return;
  const cpf = gerarValido(111222333);
  const r = await cadastrar(`${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`);
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  const Usuario = require('../src/models/Usuario');
  assert.equal((await Usuario.findOne({ cpf }).lean())?.cpf, cpf);
});

test('cadastro com dígitos verificadores errados é recusado sem criar conta', async (t) => {
  if (pular(t)) return;
  const Usuario = require('../src/models/Usuario');
  const antes = await Usuario.countDocuments();
  for (const cpf of ['12345678900', '123.456.789-00', '52998224726', '00000000191'.replace(/1$/, '2')]) {
    const r = await cadastrar(cpf);
    assert.equal(r.status, 400, cpf);
    assert.equal(r.dados.mensagem, 'CPF inválido.', cpf);
  }
  assert.equal(await Usuario.countDocuments(), antes);
});

test('CPF sequencial ou repetido é recusado mesmo com dígitos verificadores corretos', async (t) => {
  if (pular(t)) return;
  assert.equal(referencia('12345678909'), true, 'premissa: 123.456.789-09 tem dígitos corretos');
  assert.equal((await cadastrar('123.456.789-09')).status, 400);
  assert.equal((await cadastrar('98765432100')).status, 400);
  assert.equal((await cadastrar('00000000000')).status, 400);
});

test('CPF com mais de 11 dígitos é recusado, não truncado', async (t) => {
  if (pular(t)) return;
  const valido = gerarValido(444555666);
  const r = await cadastrar(valido + '99');
  assert.equal(r.status, 400);
  assert.equal(r.dados.mensagem, 'CPF deve ter 11 números.');
  const Usuario = require('../src/models/Usuario');
  assert.equal(await Usuario.countDocuments({ cpf: valido }), 0, 'os 11 primeiros dígitos não podem ser gravados');
  assert.equal((await cadastrar(valido)).status, 201, 'o CPF correto continua livre para o dono');
});

test('caracteres estranhos e tipos não textuais são recusados', async (t) => {
  if (pular(t)) return;
  const valido = gerarValido(777888999);
  const comLetras = valido.split('').join('x');
  assert.equal((await cadastrar(comLetras)).status, 400);
  assert.equal((await cadastrar({ $gt: '' })).status, 400);
  assert.equal((await cadastrar([valido])).status, 400);
});

test('o mesmo CPF com outra pontuação continua duplicado (409)', async (t) => {
  if (pular(t)) return;
  const cpf = gerarValido(321654987);
  assert.equal((await cadastrar(cpf)).status, 201);
  const r = await cadastrar(`${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`);
  assert.equal(r.status, 409);
  assert.equal(r.dados.mensagem, MENSAGEM_CPF);
});

// a resposta para CPF já cadastrado não confirma que o CPF existe na base.
const MENSAGEM_CPF =
  'Não foi possível concluir o cadastro com os dados informados. Confira as informações ou, se já possui uma conta, tente entrar ou recuperar sua senha.';

test('cadastros simultâneos com o mesmo CPF: um vence, os outros recebem a mesma mensagem neutra', async (t) => {
  if (pular(t)) return;
  const cpf = gerarValido(246813579);
  const respostas = await Promise.all(Array.from({ length: 6 }, () => cadastrar(cpf)));
  const status = respostas.map((r) => r.status);
  assert.equal(status.filter((s) => s === 201).length, 1, String(status));
  for (const r of respostas.filter((x) => x.status !== 201)) {
    assert.equal(r.status, 409);
    assert.equal(r.dados.mensagem, MENSAGEM_CPF);
    assert.doesNotMatch(r.dados.mensagem, /CPF/);
  }
});

test('o modelo também recusa CPF inválido em contas novas (defesa em profundidade)', async (t) => {
  if (pular(t)) return;
  const Usuario = require('../src/models/Usuario');
  await assert.rejects(
    Usuario.create({ nome: 'x', email: `modelo${Date.now()}@teste.local`, senha: 'h', cpf: '12345678900', tipoConta: 'Contratante' }),
    (e) => e.name === 'ValidationError' && Boolean(e.errors.cpf)
  );
  await assert.rejects(
    Usuario.create({ nome: 'x', email: `modelo2${Date.now()}@teste.local`, senha: 'h', cpf: gerarValido(135792468) + '1', tipoConta: 'Contratante' }),
    (e) => e.name === 'ValidationError' && Boolean(e.errors.cpf)
  );
});

test('conta antiga com CPF inválido continua entrando e salvando outros dados', async (t) => {
  if (pular(t)) return;
  const Usuario = require('../src/models/Usuario');
  const bcrypt = require('bcryptjs');
  const email = `antiga${Date.now()}@teste.local`;
  // gravada direto no banco, como as contas criadas antes da validação dos dígitos.
  const { insertedId } = await Usuario.collection.insertOne({
    nome: 'Antiga', email, senha: await bcrypt.hash('senha-forte-1', 4), cpf: '12345678900', tipoConta: 'Contratante',
    versaoSessao: 0, removido: false, exclusaoConfirmadaEm: null, removendoDesde: null, createdAt: new Date(), updatedAt: new Date()
  });
  const login = await fetch(amb.base + '/api/autenticacao/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.77' },
    body: JSON.stringify({ email, senha: 'senha-forte-1' })
  });
  assert.equal(login.status, 200);
  const usuario = await Usuario.findById(insertedId);
  // alterarTipoConta usa save(), que valida todos os campos obrigatórios.
  const r = await amb.chamar('PATCH', '/api/usuarios/tipo-conta', usuario, { tipoConta: 'Freelancer', areaAtuacao: 'Design' });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const p = await amb.chamar('PUT', '/api/usuarios/perfil', usuario, { bio: 'continua funcionando' });
  assert.equal(p.status, 200, JSON.stringify(p.dados));
  const salvo = await Usuario.findById(insertedId).lean();
  assert.equal(salvo.cpf, '12345678900', 'o CPF antigo não é alterado');
  assert.equal(salvo.tipoConta, 'Freelancer');
  // mas trocar o CPF da conta antiga por outro inválido não passa.
  usuario.cpf = '11122233300';
  await assert.rejects(usuario.save(), (e) => e.name === 'ValidationError');
});

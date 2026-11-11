// Ambiente de testes de integração: banco descartável próprio, segredo JWT do teste e servidor HTTP real.
// Sem MongoDB local os testes são pulados; com WORKLY_EXIGIR_MONGO=1 a ausência vira falha.
const crypto = require('node:crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET_TEST || crypto.randomBytes(32).toString('hex');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function cpfValido(n) {
  const base = String(100000000 + n).slice(-9).split('').map(Number);
  const digito = (numeros) => {
    const soma = numeros.reduce((total, d, i) => total + d * (numeros.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join('');
}

// token do cookie de sessão definido pela resposta (vazio quando a resposta não cria sessão).
function sessaoDoCookie(resposta) {
  const cookies = typeof resposta.headers.getSetCookie === 'function' ? resposta.headers.getSetCookie() : [];
  const valor = cookies.map((c) => c.match(/^workly_sessao=([^;]*)/)).find(Boolean)?.[1];
  return valor ? decodeURIComponent(valor) : '';
}

async function iniciarAmbiente(nome) {
  const uri = process.env.MONGO_TEST_URI || `mongodb://127.0.0.1:27017/workly_test_${nome}_${process.pid}`;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
  } catch (error) {
    if (process.env.WORKLY_EXIGIR_MONGO === '1') throw error;
    return null;
  }
  if (!/^workly_test_/.test(mongoose.connection.name)) throw new Error('Banco de teste inesperado.');
  await mongoose.connection.dropDatabase();
  const app = require('../../src/app');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let sequencia = 0;

  const Usuario = require('../../src/models/Usuario');
  async function criarUsuario(tipoConta = 'Contratante') {
    const i = sequencia++;
    return Usuario.create({
      nome: `${nome} ${i}`,
      email: `${nome}${i}@teste.local`,
      senha: await bcrypt.hash('senha-forte-1', 4),
      cpf: cpfValido(1000 + i * 7919 + nome.length * 131),
      tipoConta,
      areaAtuacao: tipoConta === 'Freelancer' ? 'Design' : ''
    });
  }
  const token = (usuario) =>
    jwt.sign(
      { id_usuario: String(usuario._id), nome: usuario.nome, tipo: usuario.tipoConta, sv: usuario.versaoSessao || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  // envia o cabeçalho da aplicação, como o frontend; "sessao" traz o token do cookie definido pela resposta.
  async function chamar(metodo, rota, usuario, json) {
    const headers = { 'X-Workly-Requisicao': '1', ...(usuario ? { Authorization: `Bearer ${token(usuario)}` } : {}) };
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    const resposta = await fetch(base + rota, {
      method: metodo,
      headers,
      body: json !== undefined ? JSON.stringify(json) : undefined
    });
    let dados = null;
    try {
      dados = await resposta.json();
    } catch {}
    return { status: resposta.status, dados, sessao: sessaoDoCookie(resposta), headers: resposta.headers };
  }
  async function encerrar() {
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  return { base, mongoose, criarUsuario, token, chamar, encerrar };
}

module.exports = { iniciarAmbiente, cpfValido, sessaoDoCookie };

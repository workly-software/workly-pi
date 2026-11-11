const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const ambiente = require('../config/ambiente');

const ALGORITMO = 'HS256';
const DURACAO_SESSAO_MS = 24 * 60 * 60 * 1000;

function emitirToken(usuario) {
  return jwt.sign(
    {
      id_usuario: usuario._id.toString(),
      nome: usuario.nome,
      tipo: usuario.tipoConta,
      sv: Number(usuario.versaoSessao || 0)
    },
    ambiente.jwtSecret,
    { expiresIn: DURACAO_SESSAO_MS / 1000, algorithm: ALGORITMO, jwtid: crypto.randomUUID() }
  );
}

function verificarToken(token) {
  return jwt.verify(token, ambiente.jwtSecret, { algorithms: [ALGORITMO] });
}

module.exports = { emitirToken, verificarToken, ALGORITMO, DURACAO_SESSAO_MS };

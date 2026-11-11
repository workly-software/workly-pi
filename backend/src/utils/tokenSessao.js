const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const ambiente = require('../config/ambiente');

const ALGORITMO = 'HS256';
// a sessão vale 24 horas; o cookie expira junto com o token.
const DURACAO_SESSAO_MS = 24 * 60 * 60 * 1000;

// tokens sem "sv" (emitidos antes desta versão) são tratados como versão 0.
// "jti" identifica a sessão, para o logout revogar só este token sem derrubar os outros aparelhos.
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

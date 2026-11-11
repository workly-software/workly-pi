const ambiente = require('../config/ambiente');
const { DURACAO_SESSAO_MS } = require('./tokenSessao');

const NOME_COOKIE = 'workly_sessao';
const CABECALHO_APLICATIVO = 'x-workly-requisicao';

function opcoesCookie(req) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/api',
    secure: ambiente.cookieSeguro ?? req.secure
  };
}

function definirCookieSessao(req, res, token) {
  res.cookie(NOME_COOKIE, token, { ...opcoesCookie(req), maxAge: DURACAO_SESSAO_MS });
}

function limparCookieSessao(req, res) {
  res.clearCookie(NOME_COOKIE, opcoesCookie(req));
}

function lerCookieSessao(req) {
  const cabecalho = req.headers.cookie;
  if (typeof cabecalho !== 'string') return '';
  for (const parte of cabecalho.split(';')) {
    const separador = parte.indexOf('=');
    if (separador > 0 && parte.slice(0, separador).trim() === NOME_COOKIE) {
      try {
        return decodeURIComponent(parte.slice(separador + 1).trim());
      } catch {
        return '';
      }
    }
  }
  return '';
}

function requisicaoDoAplicativo(req) {
  return req.get(CABECALHO_APLICATIVO) === '1';
}

module.exports = {
  NOME_COOKIE,
  CABECALHO_APLICATIVO,
  definirCookieSessao,
  limparCookieSessao,
  lerCookieSessao,
  requisicaoDoAplicativo
};

const ambiente = require('../config/ambiente');
const { DURACAO_SESSAO_MS } = require('./tokenSessao');

// o token da sessão do navegador fica num cookie HttpOnly: scripts da página não conseguem lê-lo.
// SameSite=Strict e Path=/api: o navegador só o envia nas chamadas da própria aplicação à API.
const NOME_COOKIE = 'workly_sessao';
// requisições autenticadas por cookie precisam deste cabeçalho. Outro site não consegue enviá-lo
// sem passar pelo CORS, que só libera o frontend configurado: é a proteção contra CSRF.
const CABECALHO_APLICATIVO = 'x-workly-requisicao';

function opcoesCookie(req) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/api',
    // COOKIE_SECURE=true força Secure (produção com HTTPS); sem a variável, segue o protocolo da requisição.
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

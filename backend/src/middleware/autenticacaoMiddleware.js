const Usuario = require('../models/Usuario');
const SessaoRevogada = require('../models/SessaoRevogada');
const { verificarToken } = require('../utils/tokenSessao');
const { idMongoValido } = require('../utils/requisicaoUtils');
const { erro } = require('../utils/apiResponse');
const { lerCookieSessao, requisicaoDoAplicativo } = require('../utils/cookieSessao');

// lê o token da requisição: Authorization (clientes de API) ou o cookie HttpOnly do navegador.
function tokenDaRequisicao(req) {
  const cabecalhoAutorizacao = req.header('Authorization');
  if (cabecalhoAutorizacao) {
    return { token: cabecalhoAutorizacao.replace(/^Bearer\s+/i, '').trim(), origem: 'cabecalho' };
  }
  return { token: lerCookieSessao(req), origem: 'cookie' };
}

// middleware das rotas protegidas: exige jwt válido de um usuário que ainda existe,
// cuja versão de sessão não foi invalidada (troca de senha ou e-mail) e que não saiu desta sessão (logout).
// as mensagens de 401 citam "token" porque o frontend usa isso para encerrar a sessão local.
module.exports = async function autenticacaoMiddleware(req, res, next) {
  const { token, origem } = tokenDaRequisicao(req);
  if (!token) {
    return erro(res, 401, 'Acesso negado. Token não informado.');
  }
  // o navegador envia o cookie sozinho; o cabeçalho próprio prova que a chamada veio da aplicação (CSRF).
  if (origem === 'cookie' && !requisicaoDoAplicativo(req)) {
    return erro(res, 403, 'Requisição recusada.');
  }

  let usuarioDecodificado;
  try {
    usuarioDecodificado = verificarToken(token);
  } catch (_error) {
    return erro(res, 401, 'Token inválido ou expirado.');
  }

  const idUsuario = usuarioDecodificado?.id_usuario;
  if (!idMongoValido(idUsuario)) {
    return erro(res, 401, 'Token inválido ou expirado.');
  }

  try {
    const usuario = await Usuario.findById(idUsuario).select('nome tipoConta versaoSessao removido exclusaoConfirmadaEm').lean();
    if (!usuario || usuario.removido || usuario.exclusaoConfirmadaEm) {
      return erro(res, 401, 'Sessão encerrada: token de uma conta que não existe mais.');
    }
    if (Number(usuarioDecodificado.sv || 0) !== Number(usuario.versaoSessao || 0)) {
      return erro(res, 401, 'Sessão encerrada: token revogado. Entre novamente.');
    }
    if (usuarioDecodificado.jti && (await SessaoRevogada.exists({ jti: usuarioDecodificado.jti }))) {
      return erro(res, 401, 'Sessão encerrada: token revogado. Entre novamente.');
    }

    // tipo e nome vêm do banco, não do token, para refletir mudanças recentes.
    req.user = {
      ...usuarioDecodificado,
      id_usuario: idUsuario,
      idUsuario,
      nome: usuario.nome,
      tipo: usuario.tipoConta,
      tipoConta: usuario.tipoConta
    };
    return next();
  } catch (error) {
    return next(error);
  }
};

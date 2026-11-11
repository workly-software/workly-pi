const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');
const ambiente = require('../config/ambiente');
const { motivoNovaSenhaInvalida } = require('../utils/senhaUtils');

const VALIDADE_MS = 30 * 60 * 1000;
const REGEX_TOKEN = /^[a-f0-9]{64}$/;

const MENSAGEM_SOLICITADA =
  'Se houver uma conta com esse e-mail, as instruções de redefinição serão disponibilizadas.';
const MENSAGEM_INDISPONIVEL =
  'A recuperação de senha está indisponível no momento. Se você está conectado, altere a senha nas configurações do perfil.';
const MENSAGEM_TOKEN_INVALIDO = 'Este link de redefinição é inválido ou expirou. Solicite um novo.';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function urlBaseFrontend() {
  const configurada = String(process.env.PASSWORD_RESET_URL_BASE || '').trim();
  if (configurada) return configurada.replace(/\/+$/, '');
  return ambiente.frontendUrl && ambiente.frontendUrl !== '*' ? ambiente.frontendUrl.replace(/\/+$/, '') : 'http://localhost:5173';
}

function canalDeEntrega() {
  if (process.env.NODE_ENV === 'development' && process.env.PASSWORD_RESET_DEV_LINK === 'console') {
    return {
      enviar: async (email, link) => {
        console.info(`[recuperação de senha][somente desenvolvimento] link para ${email}: ${link}`);
      }
    };
  }
  return null;
}

function normalizarEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function motivoSenhaInvalida(senha, confirmacao) {
  const motivo = motivoNovaSenhaInvalida(senha);
  if (motivo) return motivo;
  if (confirmacao !== undefined && confirmacao !== senha) return 'A confirmação da senha não confere.';
  return null;
}

async function solicitar(emailBruto) {
  const canal = canalDeEntrega();
  if (!canal) return { status: 503, mensagem: MENSAGEM_INDISPONIVEL };

  const email = normalizarEmail(emailBruto);
  const token = crypto.randomBytes(32).toString('hex');
  if (email) {
    const usuario = await Usuario.findOneAndUpdate(
      { email, removido: { $ne: true }, exclusaoConfirmadaEm: null },
      { $set: { redefinicaoSenha: { hash: hashToken(token), expiraEm: new Date(Date.now() + VALIDADE_MS) } } },
      { projection: { email: 1 } }
    );
    if (usuario) {
      const link = `${urlBaseFrontend()}/redefinir-senha#token=${token}`;
      try {
        await canal.enviar(usuario.email, link);
      } catch (error) {
        console.error('Falha ao entregar o link de redefinição:', error?.message || error);
      }
    }
  }
  return { status: 200, mensagem: MENSAGEM_SOLICITADA };
}

async function redefinir(tokenBruto, senha, confirmacao) {
  const token = typeof tokenBruto === 'string' ? tokenBruto.trim().toLowerCase() : '';
  if (!REGEX_TOKEN.test(token)) return { status: 400, mensagem: MENSAGEM_TOKEN_INVALIDO };
  const motivo = motivoSenhaInvalida(senha, confirmacao);
  if (motivo) return { status: 400, mensagem: motivo };

  const novaSenha = await bcrypt.hash(senha, 10);
  const usuario = await Usuario.findOneAndUpdate(
    {
      'redefinicaoSenha.hash': hashToken(token),
      'redefinicaoSenha.expiraEm': { $gt: new Date() },
      removido: { $ne: true },
      exclusaoConfirmadaEm: null
    },
    { $set: { senha: novaSenha }, $inc: { versaoSessao: 1 }, $unset: { redefinicaoSenha: 1 } },
    { projection: { _id: 1 } }
  );
  if (!usuario) return { status: 400, mensagem: MENSAGEM_TOKEN_INVALIDO };
  return { status: 200, mensagem: 'Senha redefinida. Entre com a nova senha.' };
}

module.exports = {
  solicitar,
  redefinir,
  hashToken,
  canalDeEntrega,
  VALIDADE_MS,
  MENSAGEM_SOLICITADA,
  MENSAGEM_INDISPONIVEL,
  MENSAGEM_TOKEN_INVALIDO
};

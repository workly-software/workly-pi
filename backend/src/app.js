const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const ambiente = require('./config/ambiente');
const rotasAutenticacao = require('./routes/autenticacaoRoutes');
const rotasServico = require('./routes/servicoRoutes');
const rotasUsuario = require('./routes/usuarioRoutes');
const rotasContrato = require('./routes/contratoRoutes');
const rotasFavorito = require('./routes/favoritoRoutes');
const rotasAvaliacao = require('./routes/avaliacaoRoutes');
const rotasNotificacao = require('./routes/notificacaoRoutes');
const rotasMensagem = require('./routes/mensagemRoutes');
const { erro } = require('./utils/apiResponse');
const { lerLimitePositivo } = require('./utils/limiteConfiguravel');
const { chaveIpCliente } = require('./utils/ipCliente');

const app = express();

app.set('trust proxy', ambiente.trustProxy);

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => chaveIpCliente(req.ip),
  handler: (_req, res) =>
    erro(res, 429, 'Muitas tentativas de login. Tente novamente em 15 minutos.')
});

const limitadorCadastro = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => chaveIpCliente(req.ip),
  handler: (_req, res) =>
    erro(res, 429, 'Muitas tentativas de cadastro. Tente novamente em 15 minutos.')
});

const limiteRecuperacaoIp = lerLimitePositivo(process.env.RECUPERACAO_SENHA_LIMITE_IP, 20);
const respostaLimiteRecuperacao = (_req, res) =>
  erro(res, 429, 'Muitas tentativas de recuperação de senha. Tente novamente mais tarde.');
const limitadorRecuperacaoIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: limiteRecuperacaoIp,
  standardHeaders: true,
  legacyHeaders: false,
  handler: respostaLimiteRecuperacao
});
const limitadorRecuperacaoEmail = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => `email:${typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''}`,
  handler: respostaLimiteRecuperacao
});

app.use(cors({ origin: ambiente.frontendUrl === '*' ? true : ambiente.frontendUrl }));

app.use(express.json({ limit: '1mb' }));

app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const EXTENSOES_PUBLICAS = /\.(jpe?g|png|webp|svg)$/i;
app.use(
  '/uploads',
  (req, res, next) => (EXTENSOES_PUBLICAS.test(req.path) ? next() : erro(res, 404, 'Arquivo não encontrado.')),
  express.static(path.resolve(__dirname, '../uploads'), {
    maxAge: '7d',
    etag: true,
    immutable: true,
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  })
);

app.use('/api/autenticacao/login', limitadorLogin);

app.use('/api/autenticacao/cadastro', limitadorCadastro);

app.use('/api/autenticacao/register', limitadorCadastro);

app.use('/api/autenticacao/recuperar-senha', limitadorRecuperacaoIp, limitadorRecuperacaoEmail);

app.use('/api/autenticacao/redefinir-senha', limitadorRecuperacaoIp);

app.use('/api/autenticacao', rotasAutenticacao);

app.use('/api/servicos', rotasServico);

app.use('/api/usuarios', rotasUsuario);

app.use('/api/contratos', rotasContrato);

app.use('/api/favoritos', rotasFavorito);

app.use('/api/avaliacoes', rotasAvaliacao);

app.use('/api/notificacoes', rotasNotificacao);

app.use('/api/mensagens', rotasMensagem);

app.get('/', (_req, res) => {
  res.json({
    sucesso: true,
    mensagem: 'API Workly v2.1 — com notificações e chat.',
    message: 'API Workly v2.1'
  });
});

app.use((_req, res) => erro(res, 404, 'Rota não encontrada.'));

app.use((error, req, res, _next) => {
  if (error?.type === 'entity.parse.failed') return erro(res, 400, 'Corpo da requisição inválido.');
  if (error?.type === 'entity.too.large') return erro(res, 413, 'Corpo da requisição muito grande.');
  if (error?.name === 'MulterError') return erro(res, 400, 'Erro no upload do arquivo.');
  console.error(`[${req.method} ${req.originalUrl.split('?')[0]}]`, error);
  return erro(res, 500, 'Erro interno do servidor.');
});

module.exports = app;

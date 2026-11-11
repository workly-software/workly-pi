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

// req.ip só usa X-Forwarded-For quando a conexão vem de um proxy listado em TRUST_PROXY.
// Atrás do nginx, cada cliente tem o próprio IP; em acesso direto o cabeçalho é ignorado.
app.set('trust proxy', ambiente.trustProxy);

// login e cadastro têm contadores próprios: um não esgota o outro.
// login: 10 tentativas com falha por cliente em 15 minutos (entradas bem-sucedidas não contam).
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

// cadastro: 10 pedidos por cliente em 15 minutos, com ou sem sucesso.
const limitadorCadastro = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => chaveIpCliente(req.ip),
  handler: (_req, res) =>
    erro(res, 429, 'Muitas tentativas de cadastro. Tente novamente em 15 minutos.')
});

// recuperação de senha: limite por IP nas duas rotas e, na solicitação, também por e-mail informado
// (a chave é o texto enviado, então o limite não revela se a conta existe).
// RECUPERACAO_SENHA_LIMITE_IP só existe para ajuste operacional; o padrão é 20 por IP em 15 minutos.
// valores que não sejam inteiro positivo (Infinity, 1e309, 0, -5, 1.5, vazio) ficam no padrão.
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

// uploads só servem imagens: outras extensões viram 404 e o navegador não tenta adivinhar o tipo.
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
      // SVGs padrão também ficam sem execução de script.
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  })
);

// rate limit cobre login e cadastro (o alias /register divide o contador do cadastro)
app.use('/api/autenticacao/login', limitadorLogin);

app.use('/api/autenticacao/cadastro', limitadorCadastro);

app.use('/api/autenticacao/register', limitadorCadastro);

// o limite por e-mail lê o corpo, por isso fica depois do express.json acima.
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
  // JSON malformado ou corpo grande demais são erros do cliente.
  if (error?.type === 'entity.parse.failed') return erro(res, 400, 'Corpo da requisição inválido.');
  if (error?.type === 'entity.too.large') return erro(res, 413, 'Corpo da requisição muito grande.');
  if (error?.name === 'MulterError') return erro(res, 400, 'Erro no upload do arquivo.');
  console.error(`[${req.method} ${req.originalUrl.split('?')[0]}]`, error);
  return erro(res, 500, 'Erro interno do servidor.');
});

module.exports = app;

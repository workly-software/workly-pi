# Relatório de Auditoria Adversarial — Workly

- **Data:** 2026-11-11
- **Commit auditado:** `1458769` (branch `main`, árvore limpa)
- **Escopo:** backend (Express 5 + Mongoose 8), frontend (React 19 + Vite 8), configuração Docker/nginx, CI.
- **Modo:** somente auditoria. Nenhum arquivo de código, teste ou configuração da aplicação foi alterado.

---

## 1. Resumo executivo

| Severidade | Quantidade |
|---|---|
| CRITICAL | 0 |
| HIGH | 1 (H-01 corrigido; ver seção 11) |
| MEDIUM | 6 (M-01, M-02 e M-04 corrigidos, M-03 parcial; ver seção 11) |
| LOW | 15 |
| INFORMATIONAL | 5 |
| Falsos positivos investigados | 14 |

Não encontrei nenhum caminho de bypass de autenticação, IDOR, injeção NoSQL, XSS explorável nem upload malicioso. Tentei todos e os controles resistiram (seção 9). Os problemas reais estão em quatro áreas:

1. **Disponibilidade da autenticação (HIGH).** O limitador de login é global por IP e compartilhado com o cadastro. O backend não confia no proxy, então, atrás do nginx do Docker, **todos os usuários dividem um único balde de 10 requisições a cada 15 minutos**. Reproduzi isso pela UI: um usuário que nunca tinha tentado logar recebeu 429.
2. **Integridade das avaliações (MEDIUM).** Uma única conta cliente pode gerar um número ilimitado de avaliações 5 estrelas para o mesmo serviço, repetindo contratações. Como o CPF não valida dígito verificador, contas falsas são ilimitadas.
3. **Gestão de sessão (MEDIUM).** O JWT dura 7 dias e fica no `localStorage`, e o logout só apaga o token no navegador. Quem tiver o token troca o e-mail da conta sem senha, e a vítima fica sem conseguir entrar.
4. **Validação de entrada e robustez (MEDIUM/LOW).** Campos de texto aceitam até ~1 MB. Cinco endpoints retornam 500 quando o corpo está ausente. A validação de preço do serviço é inconsistente. Há dependências com avisos HIGH.

**Prioridade de correção recomendada:** H-01 → M-01/M-03 → M-02/M-04 → M-05/M-06 → itens LOW.

---

## 2. Visão geral da arquitetura

```
Navegador (React SPA, token JWT em localStorage)
   │  Authorization: Bearer <jwt>
   ▼
nginx (frontend/deploy/nginx.docker.conf)  ── /api/*, /uploads/* ──►  Express 5 (backend/src/app.js)
   │  SPA fallback para index.html                                     │  rate-limit (login/cadastro/recuperação)
   │                                                                   │  autenticacaoMiddleware (JWT HS256 + versaoSessao)
   ▼                                                                   ▼
arquivos estáticos                                               MongoDB 8 (Mongoose)
                                                                 uploads/ (multer em memória → disco)
```

- **Autenticação:** JWT HS256 com algoritmo fixado, `sv` (versão de sessão) conferida no banco a cada requisição, conta removida bloqueada. Validade de 7 dias.
- **Autorização:** checagens por recurso nos controllers (contrato: cliente/freelancer; serviço: dono; mensagens: partes do contrato; notificações: destinatário).
- **Concorrência:** gravações condicionais (`findOneAndUpdate` com status esperado), índice único parcial para contratos ativos, exclusão de conta em duas fases.
- **Uploads:** validação por bytes mágicos (JPG/PNG/WEBP), nome gerado pelo servidor, servidos com `nosniff` + CSP `sandbox`.

## 3. Inventário da superfície de ataque

| Grupo | Rotas | Auth |
|---|---|---|
| Autenticação | `POST /api/autenticacao/{cadastro,register,login,recuperar-senha,redefinir-senha}` | pública (com rate limit) |
| Serviços | `GET /api/servicos`, `/categoria/:id`, `/category/:id`, `/:id` | pública |
| | `POST /api/servicos`, `PUT/DELETE /api/servicos/:id` (multipart) | JWT + dono |
| Usuários | `GET /api/usuarios/publico/:id` | pública |
| | `GET/PUT/DELETE /api/usuarios/perfil` (+ aliases `/profile`), `PATCH /tipo-conta`, `POST /perfil/foto`, `PUT /perfil/senha` | JWT |
| Contratos | `POST /api/contratos`, `GET /meus`, `POST /:id/{aceitar,recusar,iniciar,entregar,confirmar,solicitar-ajuste,propor-valor,aprovar-valor,cancelar}`, `PATCH /:id/status` | JWT + parte |
| Avaliações | `POST /api/avaliacoes`, `GET /minhas` / `GET /servico/:id` (pública) | JWT / pública |
| Favoritos | `GET/POST /api/favoritos`, `GET/DELETE /servico/:id` | JWT |
| Mensagens | `POST /api/mensagens`, `GET /nao-lidas`, `/resumo`, `/contrato/:id` | JWT + parte |
| Notificações | `GET /`, `/nao-lidas`, `PATCH /todas-lidas`, `/contexto/lidas`, `/:id/lida`, `DELETE /:id` | JWT + destinatário |
| Estáticos | `GET /uploads/*` (só `.jpg/.jpeg/.png/.webp/.svg`) | pública |
| Scripts operacionais | `backup`, `restore`, `indices`, `recuperarExclusoes`, `seed` | linha de comando |

---

## 4. Achados

### HIGH

#### H-01 — Limitador de login global: atrás do proxy, todos os usuários compartilham 10 tentativas a cada 15 min
- **Severidade / confiança:** HIGH / CONFIRMED
- **Local:** `backend/src/app.js:20-27` (instância `limitadorLogin`), `backend/src/app.js:78-82` (mesma instância montada em `/login`, `/cadastro` e `/register`); ausência de `app.set('trust proxy', …)`; `frontend/deploy/nginx.docker.conf:14-18` (não envia `X-Forwarded-For`).
- **Descrição:** o `express-rate-limit` usa `req.ip` como chave. Sem `trust proxy`, `req.ip` é o endereço do socket. No deploy Docker, esse endereço é sempre o do container nginx. As três rotas usam **a mesma instância**, então login, cadastro e `register` somam no mesmo contador.
- **Explicação técnica:** a cada 15 minutos, as 10 primeiras requisições de autenticação de **qualquer** usuário esgotam o balde de todos. Basta um atacante enviar 10 logins errados a cada 15 minutos para impedir login e cadastro da plataforma inteira. Cadastros legítimos também consomem a cota de login.
- **Reprodução:**
  1. Faça 12 requisições `POST /api/autenticacao/login` com credenciais erradas, alternando `X-Forwarded-For`. Resultado: `401,401,401,401,429,…`. As 5 anteriores vieram de cadastros e logins de outra parte da sondagem, o que mostra o balde compartilhado. O XFF é ignorado.
  2. Logo em seguida, um cadastro legítimo também retorna `429`.
  3. Pela UI (navegador → proxy do Vite → API, a mesma topologia do nginx), o login de um usuário demo **que nunca tinha tentado entrar** retornou `429 "Muitas tentativas de login…"`.
  4. O mesmo usuário conseguiu entrar por `http://[::1]:3100`, outro IP de socket. Isso confirma que a chave é só o IP.
- **Impacto:** negação de serviço trivial e sem autenticação sobre login e cadastro em produção. Em uso normal, picos de acesso já bloqueiam usuários legítimos.
- **Correção:** configurar `app.set('trust proxy', 1)` e fazer o nginx enviar `X-Forwarded-For`/`X-Real-IP`. Usar instâncias separadas para login e cadastro. Combinar a chave por IP com uma chave por conta (e-mail normalizado) no login. Considerar `skipSuccessfulRequests: true` no login.
- **Reproduzido:** sim (API e navegador).
- **Status: CORRIGIDO** na branch `fix/security-h01-rate-limiting` (2026-11-11; ainda sem commit). Detalhes e evidências na seção 11.

### MEDIUM

#### M-01 — Inflação ilimitada de avaliações por uma única conta
- **Severidade / confiança:** MEDIUM / CONFIRMED
- **Local:** `backend/src/controllers/avaliacaoController.js:18-59`; `backend/src/controllers/contratoController.js:148-155` (bloqueia só contrato *ativo* duplicado); índice `{autor, contrato}` em `backend/src/models/Avaliacao.js`.
- **Descrição:** cada contrato concluído dá direito a uma avaliação, e nada impede o mesmo cliente de contratar o mesmo serviço de novo depois de concluir. Um freelancer com uma conta "laranja" de cliente repete o ciclo criar → aceitar → entregar → confirmar → avaliar 5★ quantas vezes quiser.
- **Reprodução:** a mesma conta cliente fez 3 ciclos no mesmo serviço e gerou 3 avaliações 5★ (cada etapa respondeu `201,200,200,200,201`). O perfil público passou a mostrar `totalAvaliacoes=3`. Somado a M-03, o número de contas laranja também é ilimitado.
- **Impacto:** a média e o total de avaliações, usados para ranking (`ordenar=avaliacao`, filtro `avaliacaoMin`), deixam de ser confiáveis.
- **Correção:** limitar a uma avaliação por par (cliente, serviço), ou ponderar repetições. Exigir valor mínimo ou intervalo entre contratos. Validar o CPF (M-03). Considerar sinais antifraude (mesmo IP ou dispositivo do freelancer).
- **Reproduzido:** sim.
- **Status: CORRIGIDO** na branch `fix/security-h01-rate-limiting` (2026-11-11; ainda sem commit). Detalhes e evidências na seção 11. A parte que depende de contas falsas continua em M-03.

#### M-02 — Troca de e-mail sem reautenticação e sem invalidar sessões (sequestro/bloqueio de conta)
- **Severidade / confiança:** MEDIUM / CONFIRMED
- **Local:** `backend/src/controllers/usuarioController.js:517-530`; `backend/src/utils/validacaoPerfil.js` (campo `email`).
- **Descrição:** `PUT /api/usuarios/perfil` aceita um novo `email` só com o bearer token, sem pedir a senha atual, sem confirmar o novo endereço e sem incrementar `versaoSessao`.
- **Reprodução:** com o token da vítima, `PUT /api/usuarios/perfil {"email":"attacker…@evil.local"}` → `200`. Login com o e-mail original → `401`. Login com o novo e-mail e a mesma senha → `200`. O token antigo continua válido → `200`.
- **Impacto:** quem obtém o token (XSS futuro, máquina compartilhada, extensão maliciosa, M-04) tira a vítima da própria conta. Quando a recuperação de senha por e-mail for ligada, o atacante assume a conta de forma definitiva.
- **Correção:** exigir a senha atual para trocar o e-mail, confirmar o novo endereço por link, incrementar `versaoSessao` e avisar o e-mail antigo.
- **Reproduzido:** sim.
- **Status: CORRIGIDO** na `main` (2026-11-11; ainda sem commit): senha atual exigida e sessões encerradas. A confirmação por link e o aviso ao e-mail antigo dependem de um provedor de e-mail (seção 11).

#### M-03 — CPF sem dígito verificador, truncado, e enumerável
- **Severidade / confiança:** MEDIUM / CONFIRMED
- **Local:** `backend/src/utils/cpfUtils.js:1` (`normalizarCpf` corta em 11 dígitos), `backend/src/utils/cpfUtils.js:41` (`validarCpf` só checa tamanho e repetição); `backend/src/controllers/autenticacaoController.js:52-58` (mensagem 409 específica de CPF).
- **Descrição:** qualquer sequência de 11 dígitos é aceita, inclusive CPFs inválidos. Entradas mais longas são truncadas em silêncio. O CPF é único no banco.
- **Reprodução:** `cpf=12345678900` (DV inválido) → `201`. Um CPF de 17 dígitos → `201`. Reusar um CPF existente → `409 "Já existe um usuário cadastrado com este CPF."`. Teste de propriedade: **2000/2000** sequências aleatórias de 11 dígitos aceitas.
- **Impacto:** (a) contas falsas ilimitadas (alimenta M-01); (b) quem conhece o CPF de uma pessoa pode registrá-lo antes e impedir o cadastro dela; (c) qualquer pessoa descobre se um CPF está cadastrado (dado pessoal, LGPD).
- **Correção:** validar os dígitos verificadores (a função `calcularDigito` já existe), rejeitar entradas com mais de 11 dígitos em vez de truncar e devolver uma mensagem genérica de conflito no cadastro.
- **Reproduzido:** sim.
- **Status: PARCIALMENTE CORRIGIDO** na branch `fix/security-h01-rate-limiting` (2026-11-11; ainda sem commit). Dígitos verificadores, truncamento e bases sequenciais foram corrigidos. Contas falsas com CPF calculado e a enumeração continuam abertas e dependem de decisão de produto (seção 11).

#### M-04 — Sessão de 7 dias em `localStorage`, sem revogação no logout
- **Severidade / confiança:** MEDIUM / CONFIRMED
- **Local:** `backend/src/utils/tokenSessao.js:16` (`expiresIn: '7d'`); `frontend/src/services/authService.js:94-102`; `frontend/src/components/catalog/UserMenu.jsx:62-66` (logout só chama `limparSessao()`).
- **Descrição:** o token fica acessível a qualquer script da origem. O logout não avisa o servidor, embora já exista o mecanismo `versaoSessao` para revogar.
- **Reprodução:** o token emitido pelo login real tem `exp - iat = 604800 s`. O "Sair" da UI não gera requisição à API, então um token copiado continua valendo 7 dias.
- **Impacto:** amplia qualquer vazamento de token. Combinado com M-02, permite tomar a conta.
- **Correção:** criar `POST /api/autenticacao/logout` que incremente `versaoSessao` (ou uma lista de revogação). Reduzir a validade com refresh token. Preferir cookie `HttpOnly; Secure; SameSite` (com proteção CSRF) a `localStorage`.
- **Reproduzido:** sim (validade e comportamento do logout).
- **Status: CORRIGIDO** na `main` (2026-11-11; ainda sem commit): cookie HttpOnly de 24 h, proteção CSRF e logout com revogação no servidor (seção 11).

#### M-05 — Campos de texto sem limite de tamanho (contratos e avaliações públicas)
- **Severidade / confiança:** MEDIUM / CONFIRMED
- **Local:** `backend/src/controllers/contratoController.js:106-110` (`mensagem`, `detalhesPedido`, `prazoDesejado`, `referencias`); `backend/src/controllers/avaliacaoController.js:58` (`comentario`); schemas sem `maxlength` em `Contrato.js` e `Avaliacao.js`. Também `nome`, `descricao` e `extra` do serviço.
- **Descrição:** o único limite é o de 1 MB do `express.json`.
- **Reprodução:** um contrato com `detalhesPedido` de 900.000 caracteres → `201`, armazenado inteiro. Uma avaliação com `comentario` de 200.000 caracteres → `201`.
- **Impacto:** crescimento descontrolado do banco. Respostas públicas e sem autenticação (`GET /api/avaliacoes/servico/:id`, `GET /api/usuarios/publico/:id`) ficam enormes, o que amplifica o consumo de banda e CPU (OWASP API4).
- **Correção:** adicionar `maxlength` nos schemas e validação nos controllers (por exemplo, 2000 caracteres para textos livres e 1000 para o comentário).
- **Reproduzido:** sim.

#### M-06 — Dependências com avisos HIGH, uma delas alcançável
- **Severidade / confiança:** MEDIUM / LIKELY (body-parser); POTENTIAL (mongoose); LOW (multer, vite)
- **Local:** `backend/package-lock.json`, `frontend/package-lock.json`.
- **Saída do `npm audit`:**
  - backend: `body-parser 2.0.0–2.3.0` (GHSA-27r3-jxmh-p828, DoS com bytes após um corpo comprimido); `mongoose 8.24.5` (GHSA-gg4r-jv3p-qx3c, -wr5m-5jph-8m96, -8332-j7wj-wjw4, -6972-9mcm-vhwj); `multer 2.4.0` (GHSA-q7qp-rjg7-q26m).
  - frontend: `vite 8.0.16` (GHSA-9jrq-w75r-8gcw, -rq7h-c2jc-7f22 e avisos do `launch-editor`).
- **Alcance:**
  - body-parser: corpos gzip são aceitos (`Content-Encoding: gzip` → `201` em `/api/favoritos`), então o caminho vulnerável é alcançável. Não reproduzi o DoS em si.
  - mongoose: o projeto não usa `sanitizeFilter` nem discriminators. Os corpos de requisição passam por validadores antes de `set`/`findByIdAndUpdate` (tentativa de mass assignment bloqueada, ver FP-05). Alcance não demonstrado.
  - multer: o aviso exige um `fileFilter` assíncrono pendente; o deste projeto é síncrono. Provavelmente não explorável.
  - vite: afeta só o servidor de desenvolvimento.
- **Correção:** `npm audit fix` / atualizar `express` (que puxa o body-parser), `mongoose` ≥ 8.24.7, `multer` ≥ 2.4.1 e `vite` ≥ 8.1.6. Rodar a suíte de novo depois.
- **Reproduzido:** só o alcance (gzip aceito). Os exploits dos avisos não foram executados.

### LOW

#### L-01 — Um 401 atrasado de sessão antiga apaga um login novo (`authService`)
- **Confiança:** CONFIRMED. **Local:** `frontend/src/services/authService.js:113-115`.
- `buscarUsuarioAtual` chama `limparSessao()` em todo 401 e ignora a proteção do `apiClient.js:23`, que compara o token. Se o usuário fizer login enquanto um `GET /api/usuarios/perfil` com token antigo ainda está em andamento, a resposta 401 atrasada apaga o login novo.
- **Reprodução:** teste isolado `authRace.test.mjs` (no scratchpad da auditoria). O controle com `apiRequest` passou e preservou `new-login`. O caso com `buscarUsuarioAtual(true)` falhou com `actual: undefined, expected: 'new-login'`.
- **Correção:** remover o `if (error.status === 401) limparSessao();` e deixar o `apiClient` como único responsável por encerrar a sessão.
- **Status: CORRIGIDO** junto com o M-04: a limpeza incondicional foi removida e a proteção contra o 401 atrasado passou a usar o marcador de sessão (seção 11).

#### L-02 — Corpo ausente gera 500 em 5 endpoints
- **Confiança:** CONFIRMED. **Local:** `contratoController.js:106` (`req.body.servicoId`), `mensagemController.js` (`enviar`, `req.body.contratoId`), `avaliacaoController.js:21`, `favoritoController.js` (`criar`), `notificacaoController.js:130`.
- No Express 5, `req.body` é `undefined` quando não há corpo, e a desestruturação lança exceção. Testado sem corpo: `contratos=500 mensagens=500 avaliacoes=500 favoritos=500 contexto=500`.
- **Correção:** `const corpo = req.body || {}` (como `excluirPerfil` já faz) e responder 400.

#### L-03 — Validação de preço do serviço inconsistente
- **Confiança:** CONFIRMED. **Local:** `backend/src/services/servicoService.js:465-467` e `:516-519`; schema `Servico.preco` com `min: 0.01`.
- `preco=0.001` passa no controller e falha no schema, gerando `500`. `preco=1e300` → `201`. `preco=10.999` → `201`. Já o contrato a combinar limita o valor a 1.000.000 com 2 casas (`acordoContrato.js` `validarValor`), mas o preço fixo é copiado do serviço sem esse limite.
- **Correção:** reutilizar `validarValor` na criação e edição do serviço.

#### L-04 — Cabeçalho `Host` refletido em URLs absolutas; protocolo errado atrás de TLS
- **Confiança:** CONFIRMED. **Local:** `backend/src/utils/mapeadoresResposta.js:3-7`, `mensagemController.js` (`mapMensagem`), `usuarioController.js:650`.
- `curl -H "Host: evil.example" /api/servicos?limit=1` → `imagemServico=http://evil.example/uploads/...`. Sem `trust proxy`, `req.protocol` é sempre `http`, o que gera conteúdo misto atrás de HTTPS.
- **Impacto:** envenenamento de cache, se houver CDN ou cache intermediário, e imagens quebradas sob HTTPS.
- **Correção:** devolver caminhos relativos ou uma URL base configurada (`PUBLIC_BASE_URL`).

#### L-05 — Cabeçalhos de segurança ausentes (API e SPA)
- **Confiança:** CONFIRMED (API), código (nginx). **Local:** `backend/src/app.js` (sem helmet), `frontend/deploy/nginx.docker.conf`.
- A API responde com `X-Powered-By: Express` e sem `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, CSP ou HSTS. O nginx do SPA também não define CSP nem proteção contra clickjacking.
- **Correção:** `helmet()` na API, `app.disable('x-powered-by')` e cabeçalhos `add_header` no nginx (CSP restritiva, `frame-ancestors 'none'`, HSTS quando houver TLS).

#### L-06 — Path traversal do lado do cliente nos serviços do frontend
- **Confiança:** CONFIRMED (manipulação do caminho); impacto destrutivo NÃO demonstrado. **Local:** `frontend/src/services/catalogService.js:146,154,157,162,167`, `contractService.js:16`, `messageService.js:29`, `serviceEditorService.js:18`.
- Os ids vindos da URL (`?id=`) são interpolados sem `encodeURIComponent`. `/detalhe-servico?id=../../etc/passwd` faz o navegador normalizar a requisição para fora de `/api/servicos/`. O SPA recebe o `index.html` e mostra um serviço "fantasma" ("Serviço sem título / Freelancer Workly") em vez de um erro. Também testei o encadeamento até `DELETE /api/servicos/:id` pelo botão "Salvar" e ele **não** funcionou: virou `POST /api/favoritos` com corpo inválido.
- **Impacto:** um link malicioso faz o navegador da vítima disparar GETs autenticados para outros endpoints. Hoje o efeito colateral é limitado (por exemplo, marcar mensagens como lidas).
- **Correção:** `encodeURIComponent(id)` em todos os caminhos (como `notificationService.js:30` já faz) e validar `^[a-f0-9]{24}$` antes da requisição.

#### L-07 — Enumeração de contas por e-mail e diferença de tempo no login
- **Confiança:** CONFIRMED (cadastro); POTENTIAL (tempo). **Local:** `autenticacaoController.js:57` (409 específico de e-mail), `:100-101` (o `bcrypt.compare` só roda se o usuário existir).
- O comentário do login promete não revelar se a conta existe, mas o cadastro revela, e o tempo de resposta também tende a revelar.
- **Correção:** mensagem genérica no cadastro e `bcrypt.compare` contra um hash fictício quando o usuário não existir.

#### L-08 — Verificação de senha atual sem limite de tentativas (troca de senha e exclusão de conta)
- **Confiança:** CONFIRMED pelo código (não exercitado em volume). **Local:** `usuarioController.js:660-689`, `contaService.js:138-152`; nenhum limitador em `/api/usuarios/perfil/senha` nem em `DELETE /api/usuarios/perfil`.
- Quem tem o token pode testar senhas sem limite. **Correção:** rate limit por usuário nessas rotas.

#### L-09 — 401 para "Senha atual incorreta" contraria a regra do próprio projeto
- **Confiança:** CONFIRMED pelo código. **Local:** `usuarioController.js:689` versus `contaService.js:151`.
- Hoje não derruba a sessão, porque a rota é `/perfil/senha` e a mensagem não contém "token". Mas qualquer mudança no texto ou na rota passaria a deslogar o usuário. **Correção:** responder 403, como a exclusão de conta faz, e ajustar `frontend/test/release.test.js:40`.

#### L-10 — O frontend decide o fim da sessão pelo texto da mensagem
- **Confiança:** CONFIRMED pelo código. **Local:** `frontend/src/services/apiClient.js:19-22` + o comentário em `autenticacaoMiddleware.js:8`.
- `/token/i.test(message)` acopla o encerramento da sessão ao texto. Se uma mensagem do middleware mudar, sessões expiradas deixam de ser limpas sem ninguém perceber. **Correção:** um campo estruturado (`codigo: 'SESSAO_INVALIDA'`).

#### L-11 — `referencias` do contrato renderizada como link sem validação
- **Confiança:** CONFIRMED. **Local:** `frontend/src/components/messages/ContractDetails.jsx:47-56`; `contratoController.js:110`.
- O cliente grava qualquer texto e ele vira `href` no modal do freelancer. `javascript:` é bloqueado pelo React 19 (ver FP-02), mas URLs de phishing são exibidas como links clicáveis. **Correção:** validar como http(s) (reusar `urlValida`) ou exibir como texto.

#### L-12 — Paginação de notificações aceita valores inválidos
- **Confiança:** CONFIRMED. **Local:** `notificacaoController.js:57-58,70`.
- `limit=-3` → resposta com `limit=-3` e `totalPages=-3`. `page=abc` → `200` sem erro de validação. **Correção:** reutilizar a lógica de `obterPaginacao` de `servicoService.js`.

#### L-13 — Listagens sem paginação nem limite
- **Confiança:** CONFIRMED pelo código; com o volume demo (100 usuários, 220 contratos) os tempos foram baixos (`/api/usuarios/perfil` 35 ms, `?ordenar=avaliacao` 39 ms).
- **Local:** `contratoController.meus`, `mensagemController.listarPorContrato`, `avaliacaoController.minhas/porServico`, `usuarioController.buscarPerfil` (avaliações recebidas e dashboard com `populate` profundo de todos os contratos), `favoritoController.listar`, `servicoService.montarFiltro` (carrega todos os ids de freelancers para `$in`).
- **Impacto:** a memória e a latência crescem sem limite com o volume de dados. **Correção:** paginação e projeções.

#### L-14 — Condição de corrida (TOCTOU) entre mudança de tipo de conta e publicação de serviço
- **Confiança:** POTENTIAL. **Local:** `usuarioController.js:595-615` (conta e depois salva) versus `servicoController.js:52-53`.
- Um freelancer que publica um serviço e muda para "Contratante" ao mesmo tempo pode terminar como contratante com anúncio publicado. Não reproduzi. **Correção:** usar uma marca de transição, como na exclusão de conta, ou gravação condicional.

#### L-15 — Dados de demonstração com senha fixa, sem trava de produção
- **Confiança:** CONFIRMED pelo código. **Local:** `backend/src/seed.js:16` (`SENHA_DEMO = '12345678'`), `server.js:38-41`.
- Com `AUTO_SEED=true`, 100 contas com senha conhecida são criadas e a senha é impressa no log, mesmo com `NODE_ENV=production`. O padrão é `false` e o Compose força `false`. **Correção:** recusar o seed quando `NODE_ENV=production`.

### INFORMATIONAL

- **I-01 — Testes de integração pulam sem MongoDB.** `backend/test/helpers/apiTeste.js:26` retorna `null` e os testes viram "skip", a menos que `WORKLY_EXIGIR_MONGO=1`. Sem `JWT_SECRET` no ambiente, vários arquivos falham ao carregar `config/ambiente.js`. Em um `npm test` local sem esses pré-requisitos, o resultado não reflete a cobertura real. O CI define os dois.
- **I-02 — CORS padrão `*`.** `config/ambiente.js:21`: sem `FRONTEND_URL`, qualquer origem é aceita. Como a autenticação é por bearer (não cookie), o risco é baixo; o Compose define a variável.
- **I-03 — Efeitos colaterais em GET.** `GET /api/mensagens/contrato/:id` marca mensagens como lidas e `GET /api/usuarios/perfil` regrava `avaliacaoMedia`. Combinado com L-06, um link pode causar "leituras" indesejadas.
- **I-04 — `favicon.ico` 404** no dev server (único erro de console na home).
- **I-05 — Campos de perfil sem uso na UI.** `site`, `linkedin`, `github`, `instagram` e `portfolioUrl` são gravados (`site` sem esquema fica cru, por exemplo `evil.com/path`), mas nenhuma página os renderiza como link hoje. Validar esses campos antes de passar a exibi-los.

---

## 5. Funcionalidades e fluxos testados

| Fluxo | Como | Resultado |
|---|---|---|
| Cadastro (CPF inválido/truncado, duplicado) | API | M-03 |
| Login, rate limit, XFF, IPv4/IPv6 | API + navegador via proxy | H-01 |
| JWT `alg=none`, token forjado no `localStorage` | API + navegador | bloqueado (FP-07) |
| Rotas protegidas sem sessão (`/perfil`, `/anuncio`, `/contratos`, `/mensagens`, `/contratar-servico`, `/favoritos`) | navegador | todas redirecionam para `/login` |
| Sessão expirada/forjada → limpeza do token | navegador | token removido, redireciona |
| Corrida de 401 atrasado no frontend | teste isolado | L-01 |
| Contrato preço fixo: criar → aceitar → entregar → confirmar → avaliar | API | funciona; M-01 |
| Avaliação repetida por contratos sucessivos | API | M-01 |
| IDOR: outsider lê/envia mensagens, cancela contrato, edita/apaga serviço; freelancer confirma a própria entrega | API | todos 403 (FP-04) |
| Injeção de operadores Mongo (login, reset, filtro de busca, `referenciaId`) | API | bloqueado (FP-03) |
| Mass assignment no perfil (`tipoConta`, `avaliacaoMedia`, `removido`, `versaoSessao`) | API | ignorado (FP-05) |
| Troca de e-mail sem senha | API | M-02 |
| Upload poliglota PNG+HTML, SVG disfarçado | API | seguro (FP-06) |
| Traversal em `/uploads` (4 variações) | API | 404 (FP-08) |
| Gzip bomb de 50 MB | API | 413 em 7 ms (FP-10) |
| 20 favoritos concorrentes | API | 20×201, sem duplicata nem 500 (FP-11) |
| Corpo ausente em 5 POST/PATCH | API | L-02 |
| Paginação inválida | API | L-12 |
| Falha de rede na página de contratos | navegador (rota abortada) | mensagem "Erro ao carregar / Failed to fetch" exibida |
| `id` inválido e path traversal em `/detalhe-servico` | navegador | L-06 |
| `javascript:` em Referências do contrato | navegador | bloqueado pelo React (FP-02); L-11 |
| Host header | curl | L-04 |

## 6. Testes executados e resultados reais

| Suíte | Comando | Resultado |
|---|---|---|
| Backend (MongoDB real em `127.0.0.1:27017`; ver nota sobre o ambiente abaixo) | `JWT_SECRET=<aleatório> WORKLY_EXIGIR_MONGO=1 npm test` | **116 testes: 114 pass, 0 fail, 2 skipped** (ida e volta de backup exige `mongodump`/`mongorestore`, ausentes) |
| Frontend | `npm test` | **61 testes: 61 pass, 0 fail** |
| Sondagem adversarial da API (`probe.mjs`) | 17 verificações | resultados nos achados acima |
| Sondagem 2 (`probe2.mjs`) | upload, traversal, gzip, concorrência, tempos | resultados nos achados e falsos positivos |
| Reprodução do bug de sessão (`authRace.test.mjs`) | `node --test` | 1 pass (controle), **1 fail (bug confirmado)** |
| Testes de propriedade (`props.test.cjs`, fast-check 3.23.2, 5000 execuções) | `node --test` | 6 pass. Validadores de valor, URL, limite configurável e política de senha aprovados. CPF aceita 2000/2000 sequências aleatórias (M-03) |
| Navegador (Playwright CLI 0.1.22, Chromium) | `browser.js`, `svc.js`, `cspt.js` | resultados na seção 5 |

**Nota sobre o ambiente (corrigida depois):** a intenção era usar um MongoDB 8.0.4 descartável (`mongodb-memory-server`) na porta 27017. A máquina, porém, tem um serviço Windows `MongoDB` 9.0.4 com início automático na mesma porta, e o Windows aceitou os dois binds. Por isso, parte do tráfego (pelo menos a sondagem da fase 1, que deixou o banco `workly_audit` nesse serviço) foi para o MongoDB local do desenvolvedor. Os resultados continuam válidos, porque foram obtidos contra um MongoDB real, mas não dá para garantir qual das duas instâncias atendeu cada execução local. O banco `workly` do serviço não foi alterado (0 usuários de teste ou sondagem). A execução isolada e reproduzível é a do perfil de testes do CI no Docker (seção 11).

Observação: na primeira execução do backend, sem `JWT_SECRET`, vários arquivos falharam ao carregar a configuração. O `exit 0` mostrado naquela vez veio do `tail` no pipe, não do npm. O resultado válido é o da tabela.

Os scripts de auditoria ficaram fora do repositório, em
`C:\Users\vitor\AppData\Local\Temp\claude\C--Users-vitor-Downloads-workly-workly-pi\5aad280d-40da-4c07-a617-49fe89de9570\scratchpad\`.

## 7. Ferramentas de segurança executadas

- `npm audit` (backend e frontend): M-06.
- Revisão manual de código de todas as rotas, controllers, serviços, middlewares, modelos e dos serviços do frontend.
- Playwright CLI para testes no navegador real.
- fast-check para testes de propriedade.
- curl para manipulação de cabeçalhos.
- **Não executados:** Semgrep e CodeQL (não instalados nesta máquina) e mutation testing (as ferramentas mewt/muton do plugin não atendem JavaScript).

## 8. Áreas não testadas e motivos

- **Deploy Docker/nginx real:** o daemon do Docker não estava rodando. H-01 foi reproduzido com o proxy do Vite, que tem a mesma topologia, e a configuração do nginx foi verificada no código.
- **Backup/restore com `mongodump`:** Database Tools ausentes; 2 testes pulados.
- **Recuperação de senha por e-mail:** não há provedor; testei só o canal de console de desenvolvimento e a resistência a injeção no token.
- **Testes de carga e DoS volumétrico:** não executados, por decisão de não estressar o ambiente. Os tempos foram medidos só no volume demo.
- **Exploits dos avisos das dependências (M-06):** só o alcance foi verificado.
- **Layout responsivo e acessibilidade:** fora do foco desta rodada.
- **Navegação voltar/avançar e refresh durante operações:** coberta apenas parcialmente (redirecionamentos e falha de rede).

## 9. Falsos positivos investigados

| ID | Hipótese | Conclusão |
|---|---|---|
| FP-01 | XSS via SweetAlert2 (`title` e `html` são HTML) | Todos os `title` são literais; o único `html` é estático (`ProfileSettings.jsx:251`). |
| FP-02 | XSS por `href={c.referencias}` com `javascript:` | O React 19 substitui por `javascript:throw new Error('React has blocked…')`; o clique abriu `about:blank`. Restou L-11. |
| FP-03 | Injeção NoSQL (login, reset, busca, `referenciaId`) | `String()` / `idMongoValido` / regex escapada. Login `{$ne}` → 401, reset `{$gt}` → 400, contexto → 400. |
| FP-04 | IDOR em contratos, mensagens e serviços | Cinco tentativas de terceiros → 403. O freelancer não confirma a própria entrega (403). |
| FP-05 | Mass assignment no perfil | `validarAtualizacaoPerfil` usa lista de campos permitidos; `tipoConta`, `avaliacaoMedia`, `removido` e `versaoSessao` foram ignorados. |
| FP-06 | Upload malicioso (poliglota, SVG) | Validação por bytes mágicos; SVG → 400; poliglota servido como `image/png` com `nosniff` e CSP `sandbox`. |
| FP-07 | JWT `alg=none` ou token forjado | Algoritmo fixado em HS256 → 401; o frontend limpa o token e redireciona. |
| FP-08 | Traversal em `/uploads` | Quatro variações → 404 (filtro de extensão + `express.static` + `dotfiles: deny`). |
| FP-09 | Exclusão arbitrária de arquivo em `removerArquivoSeExistir` | Os caminhos são sempre gerados pelo servidor (nome do multer ou valor gravado pelo próprio servidor); não há entrada do usuário. |
| FP-10 | Gzip bomb | 50 MB descomprimidos → 413 em 7 ms. |
| FP-11 | Corrida em favoritos | 20 POSTs simultâneos → 20×201, um único documento. |
| FP-12 | Corridas em transições de contrato e pedidos duplicados | Gravações condicionais e índice único parcial; os testes de concorrência do projeto passaram contra o Mongo real. |
| FP-13 | ReDoS na busca | `escaparRegex` aplicado; busca de 8000 caracteres respondeu em 9 ms. |
| FP-14 | DoS do multer (GHSA-q7qp) | Exige `fileFilter` assíncrono; o deste projeto é síncrono. |

## 10. Avaliação geral de risco

**Risco geral: MÉDIO.** O núcleo de segurança está acima da média para um projeto deste porte: autorização por recurso consistente, defesa contra injeção, uploads robustos e um cuidado incomum com concorrência e exclusão de conta. Mesmo assim, **o projeto não deve ir para produção com H-01 aberto**, porque a autenticação pode ser derrubada por qualquer pessoa sem credenciais. Logo depois vêm a integridade das avaliações (M-01 + M-03) e o endurecimento de sessão (M-02 + M-04), que juntos permitem fraude de reputação e tomada de conta a partir de um token vazado.

**Ordem de correção sugerida:**
1. H-01: `trust proxy`, limitadores separados e chave por conta.
2. M-03 e M-01: dígito verificador do CPF; uma avaliação por cliente e serviço.
3. M-02 e M-04: reautenticação na troca de e-mail, logout no servidor, validade menor.
4. M-05 e M-06: limites de tamanho; atualizar dependências.
5. LOW, começando por L-01 (o bug relatado no `apiClient`/`authService`), L-02 e L-06.

Na auditoria inicial, nenhuma correção foi implementada. As correções autorizadas depois estão registradas na seção 11.

---

## 11. Registro de correções

### H-01 — CORRIGIDO (branch `fix/security-h01-rate-limiting`, sem commit)

**Causa raiz:** (1) uma única instância de `express-rate-limit` montada em `/login`, `/cadastro` e `/register`; (2) sem `trust proxy`, `req.ip` era o endereço do nginx para todos os clientes; (3) o nginx não informava o IP do cliente.

**Alterações:**

| Arquivo | Mudança |
|---|---|
| `backend/src/utils/ipCliente.js` (novo) | `lerConfiancaProxy`: lê `TRUST_PROXY` como lista de endereços, sub-redes ou presets; vazio significa nenhum proxy; `true` e contagem de saltos são recusados com erro na inicialização. `chaveIpCliente`: normaliza a chave (IPv4 mapeado → IPv4; IPv6 → prefixo /64). |
| `backend/src/config/ambiente.js` | expõe `trustProxy`. |
| `backend/src/app.js` | `app.set('trust proxy', ambiente.trustProxy)`; `limitadorLogin` (10 falhas por cliente em 15 min, `skipSuccessfulRequests`) e `limitadorCadastro` separado (10 por cliente em 15 min; `/cadastro` e o alias `/register` dividem o mesmo contador); os dois usam `chaveIpCliente`. |
| `frontend/deploy/nginx.docker.conf`, `frontend/deploy/nginx.conf.example` | `/api/`: `proxy_set_header X-Forwarded-For $remote_addr` (sobrescreve, descartando o valor do cliente) e `X-Real-IP`. O exemplo documenta `TRUST_PROXY` e o uso de `realip` se houver outro proxy na frente. |
| `docker-compose.yml` | `TRUST_PROXY: uniquelocal` no backend (a API não publica porta; só containers da rede do compose a alcançam). |
| `backend/.env.example` | documenta `TRUST_PROXY` (padrão vazio = acesso direto seguro). |
| `backend/test/limiteAutenticacao.test.js` (novo) | 12 testes de regressão. |

**Evidências:**

| Verificação | Antes | Depois |
|---|---|---|
| Testes novos contra o `app.js` original | — | 8 de 12 falham (a regressão é detectada) |
| Testes novos com a correção (Mongo real) | — | 12/12 pass |
| Suíte backend local (MongoDB real em 127.0.0.1:27017, ver nota da seção 6; `WORKLY_EXIGIR_MONGO=1`) | 116: 114 pass, 2 skip | 128: 126 pass, 0 fail, 2 skip (os mesmos, falta `mongodump` no Windows) |
| Suíte frontend | 61/61 | 61/61 |
| Perfil de testes do CI no Docker (`backend-test`, com `mongodump`) | não executado na auditoria | 128/128 pass, 0 skip |
| Perfil de testes do CI no Docker (`frontend-test`) | não executado na auditoria | 61/61 pass |
| Docker real: cliente A (172.19.0.5) faz 11 logins errados via nginx | todos dividiam um balde | `401×10, 429` |
| Docker real: cliente B (172.19.0.6), mesmo nginx | bloqueado junto | `401` (independente) |
| Docker real: A forja `X-Forwarded-For` rotativo | XFF ignorado, balde global | `429×5` (o nginx sobrescreve; não há como escapar) |
| Docker real: host envia `X-Forwarded-For: 172.19.0.5` (IP de A) | — | `401`: o valor forjado não herda nem contorna o bloqueio de A |
| Docker real: A tenta cadastro depois de bloqueado no login | `429` | `400` (contador próprio) |
| `scripts/smoke-docker.mjs` contra a stack | — | aprovado |
| Logs do backend | — | nenhum erro de validação do `express-rate-limit` |

**Limitações restantes:**

1. **Fronteira de confiança no Docker:** `uniquelocal` confia em qualquer container da rede do compose. Um container dessa rede que fale direto com `backend:3000` escolhe o IP informado (verificado: `401,401,401` com XFF forjado). Hoje essa rede só tem os serviços do projeto e a API não publica porta. Quem adicionar serviços à rede deve trocar para o IP fixo do nginx.
2. **Proxy na frente do nginx:** o compose publica o nginx só em `127.0.0.1`. Se um proxy, TLS ou CDN do host ficar na frente dele, o nginx passa a ver só esse proxy e o problema volta, a menos que se configure `ngx_http_realip_module` para ele (documentado em `nginx.conf.example`).
3. **Desenvolvimento (Vite):** o proxy do Vite não envia `X-Forwarded-For` e o padrão é não confiar em proxy, então em `npm run dev` todos os acessos locais dividem o balde de `127.0.0.1`. É seguro (nada é falsificável) e afeta só o desenvolvimento local.
4. **Estado em memória:** os contadores ficam no `MemoryStore` do processo. Com mais de uma instância da API, cada uma conta separado, e reiniciar a API zera os contadores. Hoje o compose roda uma instância; para escalar, usar um store compartilhado (Redis ou Mongo).
5. **Força bruta distribuída:** o limite é por cliente (IP ou /64). Um atacante com muitos IPs ainda tenta senhas em paralelo contra uma conta. Um limite adicional por conta ficou de fora de propósito, porque cria um vetor de bloqueio da vítima e merece decisão própria.
6. **Mudança de comportamento intencional:** logins bem-sucedidos não contam mais no limite de login (antes contavam). Falhas continuam bloqueando, inclusive a senha certa, enquanto a janela durar.

### M-01 — CORRIGIDO (branch `fix/security-h01-rate-limiting`, sem commit)

**Causa raiz:** a única restrição era o índice único `{autor, contrato}`: uma avaliação por *contrato*. Como recontratar um serviço concluído cria um contrato novo, o mesmo cliente avaliava o mesmo serviço quantas vezes repetisse o ciclo. Além disso, a checagem era uma consulta antes de gravar, sem proteção contra pedidos simultâneos.

**Regra adotada:** **uma avaliação por cliente e serviço** (`autor` + `servico`).
- Uma avaliação pertence a um contrato, mas alimenta a nota do serviço (`notaServico`, agregada por serviço) e a do freelancer (`notaFreelancer`). Um freelancer pode ter vários serviços.
- Recontratar o mesmo serviço continua permitido: o índice de contratos só impede dois contratos *ativos* ao mesmo tempo, e esse fluxo não muda. Só a segunda avaliação do mesmo serviço é recusada.
- A alternativa `autor + freelancer` foi descartada porque impediria avaliar serviços diferentes do mesmo profissional, que são relações distintas no modelo.
- **Ambiguidade que permanece:** a regra não permite reavaliar um serviço quando a experiência de uma recontratação for diferente. Se o produto quiser isso, o caminho é permitir *editar* a avaliação existente, não criar outra.

**Alterações:**

| Arquivo | Mudança |
|---|---|
| `backend/src/models/Avaliacao.js` | campo `unicaPorServico` (gravado em toda avaliação nova); índice único parcial `avaliacao_unica_por_cliente_servico` em `{autor: 1, servico: 1}` com `partialFilterExpression: {unicaPorServico: true}`; `garantirIndicesAvaliacao()` (instala e confere a definição exata) e `protecaoAvaliacoesDisponivel()`. |
| `backend/src/controllers/avaliacaoController.js` | a consulta prévia passa a cobrir contrato **ou** serviço (pega avaliações antigas, fora do índice); grava `unicaPorServico: true`; sem índice verificado responde 503 (falha fechada); erro 11000 vira 400 com mensagem por `keyPattern` ("Este contrato já foi avaliado." / "Você já avaliou este serviço em outra contratação."). Autenticação, posse do contrato, status `concluido` e a origem de `freelancer`/`servico` (sempre do contrato, nunca do corpo) foram mantidos. |
| `backend/src/controllers/contratoController.js` | `GET /api/contratos/meus` acrescenta `servicoJaAvaliado` / `servico_ja_avaliado`; `jaAvaliado` mantém o significado por contrato. |
| `backend/src/server.js`, `backend/src/scripts/indices.js` | instalam e verificam o índice na inicialização e no script de deploy. |
| `frontend/src/services/contractService.js` | `canReview` não oferece o formulário quando o serviço já foi avaliado; mensagem própria para esse caso. |
| `backend/test/avaliacaoUnica.test.js` (novo), `frontend/test/contracts.test.js` | 14 testes de backend e 1 de frontend. |

**Índice:** `avaliacao_unica_por_cliente_servico`, único e parcial. O índice antigo `{autor, contrato}` continua igual.

**Compatibilidade com dados existentes:**
- Avaliações antigas não têm `unicaPorServico`, ficam fora do índice e **não são apagadas nem alteradas**. Por isso a criação do índice nunca falha por duplicação antiga.
- Testado com duas avaliações antigas do mesmo cliente para o mesmo serviço: o índice foi instalado, as duas foram preservadas e um terceiro contrato não conseguiu avaliar, porque a consulta prévia enxerga as antigas.
- Duplicações antigas continuam contando nas médias, como antes; removê-las é decisão de produto.

**Isolamento do banco (exigência desta fase):**
- Todos os testes locais rodaram contra um container `mongo:8.0` dedicado (`workly-m01-mongo`, `127.0.0.1:27118`, volume anônimo removido no fim).
- Antes de rodar, conferi que o servidor respondia com hostname igual ao ID do container (`831cb3a2dfad`), versão 8.0.34 (o serviço do host é 9.0.4) e só bancos de sistema.
- O MongoDB do host não foi acessado nesta fase.
- A suíte completa rodou pelo perfil de testes do CI no Docker (`-p workly-m01`, rede e banco `db-test` próprios, derrubados com `down --volumes`).

**Testes e resultados:**

| Verificação | Resultado |
|---|---|
| Testes novos (14) contra o código **original** | 9 pass, **5 fail**: recontratação, concorrência entre contratos, fluxo completo, médias e índice (vulnerabilidade reproduzida) |
| Testes novos com a correção | **14/14 pass** |
| Concorrência: 24 pedidos simultâneos, 6 contratos concluídos do mesmo serviço | antes: **6 avaliações** criadas (`201×6`); depois: **1** (`201×1, 400×23`, nenhum 500) |
| Concorrência: 15 pedidos simultâneos no mesmo contrato | 1 criada, 14 × 400 |
| Experimento: índice removido depois da verificação | voltam **6 avaliações**: o índice, não a consulta prévia, garante a regra |
| Médias depois de pedidos recusados | `totalAvaliacoes`, `avaliacaoMedia`, resumo do serviço e perfil público inalterados |
| Fluxo completo pela API (contratar → aceitar → entregar → confirmar → avaliar; recontratar) | 1ª avaliação 201; recontratação 201; 2ª avaliação 400; `meus` marca `servicoJaAvaliado` |
| Backend local isolado (15 arquivos, `--test-concurrency=1`, sem os 2 de backup com 27017 fixo) | **126/126 pass** |
| Perfil de testes do CI no Docker, backend (suíte inteira, com `mongodump`) | **142/142 pass**, 0 skip (era 128 depois do H-01; +14 novos) |
| Frontend (local e no Docker) | **62/62 pass** (+1 novo) |

Uma execução local intermediária teve 2 falhas em `exclusoes.test.js` e `seguranca.test.js`. A causa foi ambiental: `backend/uploads/` tinha sido apagado na limpeza da fase anterior e as imagens padrão não existiam. Depois de `npm run prepare:assets`, os dois arquivos passaram (16/16), e a execução completa seguinte deu 126/126.

**Antes e depois:**
- **Mesma conta, mesmo serviço, várias recontratações:** antes eram N avaliações 5★; depois, uma só, e as seguintes recebem 400.
- **Pedidos simultâneos:** antes criavam várias; depois, uma.
- **Inalterado:** outro cliente avaliando o mesmo serviço, o mesmo cliente avaliando outro serviço do mesmo freelancer, e recontratar o mesmo serviço.

**Limitações restantes:**
1. **Contas falsas (M-03):** a regra vale por conta. Enquanto o CPF não validar o dígito verificador, contas novas continuam podendo avaliar. M-01 resolve a repetição pela mesma conta; a fraude com várias contas depende de M-03.
2. **Vários serviços do mesmo freelancer:** uma conta avalia uma vez cada serviço, então a nota do freelancer ainda pode receber uma avaliação por serviço que ele publicar. É coerente com a regra adotada; restringir por freelancer seria outra decisão de produto.
3. **Índice removido em produção:** a proteção fica em cache depois da primeira verificação. Se alguém apagar o índice com a API no ar, a falha fechada só volta a valer depois de reiniciar a API. (O índice de contratos revalida a cada 5 minutos; aqui não há revalidação.)
4. **Duplicações antigas** continuam no banco e nas médias, intencionalmente.

**Problema encontrado à parte (não corrigido, fora do escopo):**
- **T-01 — Testes de backup usam o MongoDB do host.** `backend/test/backupRestore.test.js:18-19` e `backend/test/backupRestoreIntegracao.test.js:14` fixam `mongodb://127.0.0.1:27017/...` e ignoram `MONGO_TEST_URI`. O primeiro sempre conecta e cria/apaga uma base `workly_test_backup_<pid>` no Mongo que estiver na 27017. Numa máquina com o serviço MongoDB instalado, isso é o banco local do desenvolvedor, o que explica parte das sobras `workly_test_*` encontradas nele. As operações destrutivas se limitam a nomes `workly_test_*`, mas o isolamento depende só do nome. Recomendação: respeitar `MONGO_TEST_URI` (só trocando o nome da base) e rodar localmente apenas com Mongo isolado.

### M-03 — PARCIALMENTE CORRIGIDO (branch `fix/security-h01-rate-limiting`, sem commit)

**Causa raiz:**
- `validarCpf` conferia só o tamanho e se todos os dígitos eram iguais. O comentário dizia que os dígitos verificadores não eram checados "para não travar CPF de teste".
- `normalizarCpf` cortava a entrada em 11 dígitos, então um CPF longo demais era gravado truncado.
- O frontend repetia a mesma regra.

**O que foi corrigido:**
1. **Dígitos verificadores** passam a ser validados no cadastro, no modelo (defesa em profundidade) e no formulário do frontend.
2. **Sem truncamento:** `normalizarCpf` só remove pontuação; mais de 11 dígitos responde 400 `CPF deve ter 11 números.`.
3. **Entrada só com números e pontuação usual** (ponto, hífen, espaço); letras, objetos e listas são recusados.
4. **Bases repetidas ou sequenciais** são recusadas (reaproveita o `cpfSequencial` que existia sem uso), mesmo quando os dígitos verificadores estão certos, como `123.456.789-09`.
5. **Contas antigas:** o validador do modelo só age quando o CPF é novo ou alterado. Sem essa guarda, qualquer `save()` numa conta antiga com CPF inválido falharia; isso foi verificado em experimento (o `save()` sem a guarda deu `ValidationError cpf`). Nenhum CPF existente é alterado.

**Alterações:**

| Arquivo | Mudança |
|---|---|
| `backend/src/utils/cpfUtils.js` | `normalizarCpf` sem `slice`; `validarCpf` com dígitos verificadores e bases sequenciais; `motivoCpfInvalido` recebe o valor bruto e devolve `CPF inválido.` para dígitos errados ou caracteres estranhos. |
| `backend/src/controllers/autenticacaoController.js` | valida o valor recebido antes de normalizar. |
| `backend/src/models/Usuario.js` | validador do CPF com guarda para contas antigas. |
| `frontend/src/services/authValidation.js` | mesma regra no formulário (`CPF inválido`). |
| `frontend/test/auth.test.js` | a asserção que exigia aceitar `12345678900` (DV inválido) foi trocada pela regra nova; ela documentava justamente o comportamento corrigido. Foram acrescentados casos de CPF válido, sequencial e com DV errado. |
| `backend/test/cpfCadastro.test.js` (novo) | 10 testes, incluindo comparação com uma implementação de referência independente em 5000 CPFs aleatórios e 2000 válidos. |

**Isolamento do banco:**
- Container `mongo:8.0` dedicado (`workly-m03-mongo`, `127.0.0.1:27118`). Antes dos testes, conferi que o hostname do servidor era o ID do container (`41d947277b8b`), versão 8.0.34, só bancos de sistema.
- O MongoDB do host não foi acessado.
- A suíte completa rodou pelo perfil de testes do CI no Docker (`-p workly-m03`), derrubado com `down --volumes`.

**Testes e resultados:**

| Verificação | Resultado |
|---|---|
| Testes novos (10) contra o código **original** | 2 pass, **8 fail** (DV inválido aceito, truncamento, sequencial, caracteres estranhos, modelo, comparação com a referência) |
| Testes novos com a correção | **10/10 pass** (11/11 depois do teste da mensagem neutra) |
| Backend local isolado (16 arquivos, sem os 2 de backup com 27017 fixo) | **136/136 pass** |
| Perfil de testes do CI no Docker, backend (suíte inteira) | **152/152 pass**, 0 skip |
| Frontend (local e no Docker) | **62/62 pass** |

**Antes e depois:**

| Entrada | Antes | Depois |
|---|---|---|
| `12345678900` (DV inválido) | 201 | 400 `CPF inválido.` |
| CPF válido + `99` (13 dígitos) | 201, gravado truncado | 400 `CPF deve ter 11 números.`; o CPF real continua livre |
| `123.456.789-09` (DV válido, sequencial) | 201 | 400 |
| CPF com letras entre os dígitos | 201 | 400 |
| CPF válido, com ou sem pontuação | 201 | 201 (gravado só com números) |
| Conta antiga com CPF inválido: login, troca de tipo, edição de perfil | funcionava | continua funcionando; o CPF não é alterado |
| CPF já cadastrado | 409 `Já existe um usuário cadastrado com este CPF.` | 409 com mensagem neutra (item 3 abaixo) |

**O que continua aberto (por isso "parcial"):**
1. **(a) Contas falsas:** qualquer pessoa calcula um CPF com dígitos verificadores corretos a partir de 9 dígitos aleatórios. A validação elimina erros de digitação e números inventados sem cálculo, mas **não impede** criar contas falsas em série. O freio atual é o limite de cadastro do H-01 (10 por IP a cada 15 minutos). Resolver de verdade exige verificar a identidade: confirmação por e-mail (depende de contratar o provedor de e-mail) ou consulta do CPF a um serviço oficial ou de KYC.
2. **(b) Ocupar o CPF de outra pessoa:** quem souber o CPF real de alguém ainda pode cadastrá-lo antes dela. Exige a mesma verificação de identidade, ou um processo de suporte para contestação.
3. **(c) Enumeração — mensagem trocada por decisão do produto:**
   - CPF já cadastrado agora responde `409 Não foi possível concluir o cadastro com os dados informados. Confira as informações ou, se já possui uma conta, tente entrar ou recuperar sua senha.`, na checagem prévia e no caminho de pedidos simultâneos (erro de chave duplicada). A mensagem não cita o CPF; o teste `cadastros simultâneos com o mesmo CPF` confere isso (6 pedidos: 1 × 201, 5 × 409 com a mensagem exata).
   - **Risco residual:** o código 409 e a diferença em relação a outros erros ainda indicam que algum dado já existe, e testar um CPF com um e-mail novo a cada vez continua revelando se o CPF está na base. O freio segue sendo o limite de cadastro do H-01.
   - O e-mail duplicado continua com a mensagem específica `Já existe um usuário cadastrado com este e-mail.` (fora do pedido). Ele é checado antes do CPF.
   - A mensagem sugere "recuperar sua senha", mas a recuperação por e-mail responde "indisponível" enquanto não houver provedor de e-mail.
4. **CPFs inválidos já gravados** continuam no banco (intencional, para não bloquear contas existentes).

### N-01 — Unicidade de e-mail e CPF dependia do `autoIndex` — CORRIGIDO (`main`, sem commit)

**Como apareceu:** depois de integrar H-01, M-01 e M-03 na `main`, a suíte completa no Docker falhou em 3 de 3 rodadas (152/153). O teste "cadastros simultâneos com o mesmo CPF" do M-03 criou 3 contas com o mesmo CPF; rodando o arquivo sozinho, passava.

**Causa raiz (confirmada por diagnóstico):**
- Os índices únicos de `email` e `cpf` eram criados só pelo `autoIndex` do Mongoose, em segundo plano, logo depois de a API conectar.
- Se cadastros simultâneos chegam antes do índice existir, duplicatas entram. Com duplicatas no banco, a criação do índice único **falha e não é tentada de novo, sem aviso**.
- No diagnóstico (suíte completa), depois da rajada só existia o índice `_id_`, e `cpf_1` não apareceu em 10 s. Rodando sozinho, o índice ficou pronto em 352 ms e a rajada respondeu `201, 409×5`.
- O problema é anterior ao M-03; o teste novo só o expôs. Em produção, o risco maior é numa base nova ou restaurada, ou com contas duplicadas antigas: o banco fica sem a garantia de unicidade e ninguém percebe.

**Correção (mesmo padrão dos índices de contrato e avaliação):**

| Arquivo | Mudança |
|---|---|
| `backend/src/models/Usuario.js` | `garantirIndicesUsuario()` instala (`createIndexes`) e confere os índices únicos de `email` e `cpf`; `protecaoCadastroDisponivel()` guarda o resultado e, se falhar, tenta de novo no máximo uma vez a cada 30 s (evita disparar uma criação de índice por requisição durante um ataque); `configurarProtecaoCadastroParaTeste()` só para testes. |
| `backend/src/controllers/autenticacaoController.js` | sem os índices verificados, o cadastro responde **503** e nada é gravado (falha fechada). |
| `backend/src/server.js`, `backend/src/scripts/indices.js` | instalam os índices antes de a API aceitar requisições e registram o resultado. |
| `backend/test/cadastroIndices.test.js` (novo) | 3 testes com a coleção começando **sem índices**: rajada de 8 cadastros com o mesmo CPF; rajada com o mesmo e-mail; contas antigas duplicadas bloqueando o cadastro (503) até o operador resolver, com volta automática sem reiniciar a API. |

**Isolamento do banco:** testes locais contra o container `workly-idx-mongo` (`127.0.0.1:27118`); antes de rodar, conferi que o hostname do servidor era o ID do container (`1f72194d0425`). A suíte completa e a subida da stack rodaram em projetos Docker próprios, derrubados com `down --volumes`. O MongoDB do host não foi acessado.

**Testes e resultados:**

| Verificação | Resultado |
|---|---|
| Testes novos (3) contra o código **sem a correção** | **3 fail**: 8 contas com o mesmo CPF, 8 com o mesmo e-mail, e cadastro gravado (201) mesmo com duplicatas antigas |
| Testes novos com a correção | **3/3 pass** |
| Backend local isolado (17 arquivos, sem os 2 de backup com 27017 fixo) | **140/140 pass** |
| Perfil de testes do CI no Docker, suíte completa | **156/156 pass em 3 de 3 rodadas** (antes: 152/153) |
| Subida real da stack no Docker | log mostra "Proteção contra e-mail e CPF duplicados ativa."; smoke do CI aprovado |

**Limitações restantes:**
1. **Bases com contas duplicadas antigas:** o índice único não pode ser criado, então **novos cadastros ficam bloqueados (503)** até alguém resolver as duplicatas. É a escolha segura: a alternativa seria aceitar cadastros sem garantia de unicidade. O motivo e a chave repetida aparecem no log.
2. **Troca de e-mail no perfil** (`PUT /api/usuarios/perfil`) também depende do índice único de `email` contra pedidos simultâneos, mas não foi bloqueada por esta proteção. Com o índice instalado na inicialização, o caso normal está coberto; ficou fora do escopo.
3. **Índice removido com a API no ar:** a proteção fica em cache depois de verificada; só é revalidada depois de reiniciar a API.

### M-02 — CORRIGIDO (`main`, sem commit)

**Causa raiz:** `PUT /api/usuarios/perfil` aplicava o novo `email` só com o token, sem conferir a senha, sem encerrar outras sessões e confirmando, para qualquer portador do token, se um e-mail já existia (409).

**Regra adotada:**
- **Trocar** o e-mail exige a senha atual. Reenviar o mesmo e-mail (o formulário sempre manda o campo), mesmo com outra caixa ou espaços, não exige nada; os outros campos do perfil continuam sem senha.
- Com a senha certa, o e-mail muda, `versaoSessao` é incrementada (todos os outros tokens deixam de valer) e a resposta traz um token novo para a sessão atual.
- Senha errada responde **403**, não 401, porque o frontend trata 401 nessa rota como sessão expirada. Nenhum campo é gravado.
- O conflito "e-mail já cadastrado" (409) só é revelado depois da senha certa.
- A gravação é condicionada à versão da sessão, ao e-mail e à senha lidos: duas trocas simultâneas não passam juntas.

**Alterações:**

| Arquivo | Mudança |
|---|---|
| `backend/src/controllers/usuarioController.js` | `atualizarPerfil` separa a troca real de e-mail para `trocarEmail` (senha, versão da sessão, gravação condicional, `$inc versaoSessao`, token novo); sem troca, o fluxo anterior segue igual. |
| `frontend/src/services/profileService.js` | `emailChanged(atual, novo)`, mesma comparação do backend. O `mutate` já gravava o token novo. |
| `frontend/src/components/profile/ProfileSettings.jsx` | quando o e-mail muda, um modal pede a senha atual antes de salvar; cancelar não envia nada. |
| `backend/test/emailReautenticacao.test.js` (novo), `frontend/test/profile.test.js` | 7 testes de backend e 2 de frontend. |
| `backend/test/seguranca.test.js` | o teste de perfil exigia o comportamento antigo (trocar o e-mail sem senha → 200, e 409 sem senha). Atualizado para enviar `senhaAtual` quando o e-mail muda, com um caso a mais: sem senha → 400. As outras asserções (tipos, formatos, 409, dados salvos) foram mantidas. |

**Isolamento do banco:** testes locais e o teste no navegador rodaram contra containers `mongo:8.0` dedicados em `127.0.0.1:27118`, conferidos pelo hostname antes de cada uso; a suíte completa rodou no perfil de testes do CI no Docker. O MongoDB do host não foi acessado.

**Testes e resultados:**

| Verificação | Resultado |
|---|---|
| Testes novos (7) contra o código **original** | 2 pass (fluxos legítimos sem troca de e-mail), **5 fail** (vulnerabilidade reproduzida) |
| Testes novos com a correção | **7/7 pass** |
| Trocas simultâneas com o mesmo token (6 pedidos) | 1 × 200; `versaoSessao` sobe uma única vez |
| Navegador (Playwright, API + Vite reais): salvar só a bio | sem pedido de senha, "Perfil atualizado!" |
| Navegador: trocar o e-mail com senha errada | modal "Confirme sua senha" → "Senha atual incorreta."; continua logado |
| Navegador: trocar com a senha certa | "E-mail atualizado. As outras sessões foram encerradas."; token trocado; sessão paralela → 401; login com e-mail antigo → 401, com o novo → 200 |
| Backend local isolado (18 arquivos) | **147/147 pass** |
| Perfil de testes do CI no Docker, backend | **163/163 pass** (2 de 2 rodadas) |
| Frontend (local e Docker) + build | **64/64 pass**, build ok |

**Antes e depois:**

| Cenário | Antes | Depois |
|---|---|---|
| Token roubado troca o e-mail | 200; dono perde o login | 400 sem senha, 403 com senha errada |
| Dono troca o e-mail com a senha | 200; outros tokens seguem válidos | 200; outros tokens → 401; esta sessão recebe token novo |
| Portador do token testa se um e-mail existe | 409 imediato | só depois da senha certa |
| Editar bio/telefone (com o mesmo e-mail no corpo) | 200 | 200, sem senha |

**Limitações restantes:**
1. **Confirmação do novo endereço e aviso ao e-mail antigo** dependem de um provedor de e-mail, que o projeto não tem. Hoje quem sabe a senha troca o e-mail para qualquer endereço sem prová-lo.
2. **Tentativas de senha sem limite** nesta rota, como já era em troca de senha e exclusão de conta (L-08): quem tem o token pode testar senhas. Fica para o L-08.
3. **Token em `localStorage` e logout só no navegador** continuam (M-04).

### M-04 — CORRIGIDO (`main`, sem commit) — inclui L-01

**Causa raiz:** o JWT de 7 dias era devolvido no corpo do login e guardado no `localStorage`, legível por qualquer script da página. O "Sair" só apagava a cópia local; o token copiado continuava valendo até expirar.

**Decisões do produto:** sessão de **24 horas** e migração **agora** para cookie `HttpOnly`.

**Como ficou:**
- **Cookie `workly_sessao`:** `HttpOnly`, `SameSite=Strict`, `Path=/api`, `Max-Age` de 24 h. `Secure` quando a requisição chega por HTTPS (`req.secure`) ou com `COOKIE_SECURE=true`. O token **não aparece em nenhuma resposta** (login, troca de senha, troca de e-mail).
- **CSRF:** sessões por cookie, o login (contra login CSRF) e o logout exigem o cabeçalho `X-Workly-Requisicao: 1`. Outro site não consegue enviá-lo sem passar pelo CORS; somado ao `SameSite=Strict`, um pedido forjado é recusado com 403.
- **Bearer** continua aceito para clientes de API (não depende do cabeçalho).
- **Logout:** `POST /api/autenticacao/logout` revoga só o token desta sessão (lista `sessoes_revogadas` por `jti`, com índice TTL que apaga o registro quando o token expiraria) e apaga o cookie. Os outros aparelhos seguem conectados. Responde 200 mesmo sem sessão. Tokens antigos, sem `jti`, não podem ser revogados um a um: para eles, todas as sessões da conta são encerradas.
- **Troca de senha e de e-mail** renovam o cookie; **excluir a conta** o apaga.
- **Frontend:** não guarda mais o token. O `localStorage` mantém só o cache do usuário e `sessao`, um marcador sem valor secreto que indica login e protege contra o 401 atrasado (corrige o **L-01**). O token deixado por versões anteriores é apagado ao carregar a aplicação. O "Sair" chama o logout do servidor.

**Alterações:**

| Arquivo | Mudança |
|---|---|
| `backend/src/utils/tokenSessao.js` | validade de 24 h; `jti` por sessão. |
| `backend/src/utils/cookieSessao.js` (novo) | criar, apagar e ler o cookie; checagem do cabeçalho da aplicação. |
| `backend/src/models/SessaoRevogada.js` (novo) | sessões revogadas, com TTL. |
| `backend/src/middleware/autenticacaoMiddleware.js` | token do `Authorization` ou do cookie (este exige o cabeçalho); recusa `jti` revogado. |
| `backend/src/controllers/autenticacaoController.js`, `routes/autenticacaoRoutes.js` | login define o cookie e exige o cabeçalho; novo `sair` (logout). |
| `backend/src/controllers/usuarioController.js` | troca de senha/e-mail renovam o cookie; exclusão o apaga. |
| `backend/src/config/ambiente.js`, `backend/.env.example` | `COOKIE_SECURE`. |
| `frontend/src/services/apiClient.js` | cabeçalho da aplicação, `credentials: 'same-origin'`, sem Bearer; encerramento local pelo marcador. |
| `frontend/src/services/authService.js` | `iniciarSessao`, `sessaoIniciada`, `sair`; remove o token legado; `buscarUsuarioAtual` sem limpeza incondicional (L-01). |
| `profileService.js`, `LoginPage.jsx`, `UserMenu.jsx`, `AuthFooter.jsx`, `CatalogShell.jsx`, `useSession.js`, `ServiceDetailPage.jsx`, `ServiceEditorPage.jsx` | uso da nova sessão. |
| `backend/test/sessaoCookie.test.js` (novo) | 11 testes. |
| Testes existentes ajustados | backend: `helpers/apiTeste.js` (envia o cabeçalho e lê o token do cookie), `seguranca`, `fechamento`, `emailReautenticacao`, `limiteAutenticacao`, `cpfCadastro`. Frontend: `apiClient`, `release`, `catalog`, `profile`. Eles verificavam o token no corpo ou o Bearer lido do `localStorage`, exatamente o comportamento substituído. O teste da corrida do 401 atrasado (`release.test.js`) passava **por acaso** depois da mudança, porque ainda usava a chave `token`; foi atualizado para o marcador e voltou a verificar a proteção. Foram acrescentados 3 testes de frontend (início de sessão, `sair` com e sem rede, e o L-01 por `buscarUsuarioAtual`). |

**Isolamento do banco:** testes locais e navegador contra containers `mongo:8.0` dedicados em `127.0.0.1:27118`, conferidos pelo hostname antes de cada uso; a suíte completa e a stack com nginx em projetos Docker próprios, derrubados com `down --volumes`. O MongoDB do host não foi acessado.

**Testes e resultados:**

| Verificação | Resultado |
|---|---|
| `sessaoCookie.test.js` (11) contra o backend **original** | **11 fail** (a maioria na preparação, porque o modelo de revogação não existia; o de login falha porque o token vem no corpo e não há cookie) |
| `sessaoCookie.test.js` com a correção | **11/11 pass** |
| Backend local isolado (19 arquivos) | **158/158 pass** |
| Perfil de testes do CI no Docker, backend | **174/174 pass** (2 de 2 rodadas) |
| Frontend (local e Docker) + build | **67/67 pass**, build ok |
| Navegador real (Playwright, API + Vite): login | corpo sem token; cookie `HttpOnly`, `Strict`, `/api`, 24 h; `document.cookie` não o vê; `localStorage` só com `sessao` e `user`; token legado apagado; nenhum JWT no storage |
| Navegador: `/perfil` e recarregar | continua logado |
| Navegador: `fetch` sem o cabeçalho / com o cabeçalho | 403 / 200 |
| Navegador: "Sair" | logout 200; cookie e storage limpos; `/perfil` → `/login`; **token copiado antes do logout → 401**; outro aparelho → 200 |
| Stack Docker com nginx | cookie atravessa o proxy com os atributos; perfil 200; logout 200; mesmo cookie depois → 401; smoke aprovado |

**Antes e depois:**

| Cenário | Antes | Depois |
|---|---|---|
| Script na página (XSS) lê a sessão | lia o token no `localStorage` | não consegue: cookie `HttpOnly` |
| Token copiado depois do "Sair" | válido por até 7 dias | 401 imediato |
| Validade da sessão | 7 dias | 24 horas |
| Pedido forjado por outro site | não se aplicava (Bearer) | 403 (cabeçalho ausente + `SameSite=Strict`) |
| 401 atrasado de login antigo | apagava o login novo via `buscarUsuarioAtual` (L-01) | ignorado |

**Limitações restantes:**
1. **XSS ainda age dentro da página:** o cookie não pode ser lido, mas um script injetado pode fazer chamadas autenticadas enquanto a página estiver aberta. A defesa contra isso é CSP e cuidado com a saída (L-05).
2. **Sem renovação automática:** depois de 24 horas o usuário precisa entrar de novo, mesmo em uso contínuo.
3. **Mesma origem obrigatória:** com `SameSite=Strict` e `credentials: 'same-origin'`, a API precisa estar na mesma origem do frontend (como no nginx do Docker e no proxy do Vite). Um `VITE_API_URL` em outro domínio deixaria de enviar o cookie.
4. **`Secure` atrás de TLS externo:** se o HTTPS terminar antes do nginx, `req.secure` vê HTTP; nesse caso é preciso `COOKIE_SECURE=true` (documentado no `.env.example`).
5. **Tokens antigos:** quem estava logado antes da atualização perde a sessão ao carregar a nova versão (o token legado é apagado) e precisa entrar de novo. Tokens antigos copiados ainda valem até expirar (no máximo 7 dias), a menos que o dono faça logout ou troque a senha.
6. **Revogação depende do banco:** cada requisição autenticada faz uma consulta a mais (`sessoes_revogadas` por `jti`, indexada).

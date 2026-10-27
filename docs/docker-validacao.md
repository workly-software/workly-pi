# Validação da dockerização

Validação local em 27/10/2026, no Docker Desktop com engine Linux/WSL 2,
na branch `codex/dockerizacao-workly`.

| Verificação | Resultado |
| --- | --- |
| `docker compose config --quiet` | Aprovado |
| Build das quatro imagens (aplicação e testes) | Aprovado |
| Frontend em container | 61 testes aprovados, zero falhas e zero pulados |
| Backend em container com MongoDB separado | 116 testes aprovados, zero falhas e zero pulados |
| Backup/restore de integração | Executado com Database Tools 100.14.1 |
| Build React e referências estáticas | 50 referências verificadas |
| `up -d --wait` | web, backend e db saudáveis |
| `node scripts/smoke-docker.mjs` | SPA, JavaScript, imagens, uploads, API e MongoDB aprovados |
| `node scripts/test-docker-persistence.mjs` | Documento e arquivo preservados após down/up; marcadores removidos |
| Preservação do `.env` | Segunda execução do gerador manteve o mesmo hash do arquivo |
| Imagem da API | Sem `.env`, processo executado como UID 1000 |
| actionlint | Workflow aprovado |
| `git diff --check` | Aprovado |

O teste de persistência também verificou a reinicialização com volume existente.
O banco da aplicação não publica porta no host. Os testes usam outro MongoDB,
sem credenciais reais ou dados da aplicação. A configuração Docker não importa
o banco ou os uploads da execução nativa.

Os arquivos package.json e package-lock.json foram preservados. Durante o build,
o npm audit apontou avisos já presentes nessas dependências: body-parser e multer
no backend (dois avisos de severidade alta) e Vite no ambiente de build/frontend
(um aviso de severidade alta). Atualizações dessas dependências exigem avaliação
separada da mudança de infraestrutura. Esses avisos não foram tratados como
aprovação de segurança nem ocultados pelo pipeline.

A referência local e remota de `main` na validação foi
`557cf6ae669934eb0b69ee054719870ba9cf168c`. A dockerização não altera essa branch.

O workflow reproduz os testes em GitHub Actions ao enviar a branch ou abrir PR.
Os resultados locais acima não substituem a indicação de sucesso da execução
na nuvem, que deve ser conferida na aba Actions do repositório.

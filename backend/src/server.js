const app = require('./app');
const connectDatabase = require('./config/db');
const ambiente = require('./config/ambiente');
const { popularBancoDemo } = require('./seed');
const { garantirIndicesContrato, relatarProblemaIndice } = require('./models/Contrato');
const { garantirIndicesAvaliacao } = require('./models/Avaliacao');
const { recuperarExclusoesPendentes } = require('./services/contaService');

const INTERVALO_RECUPERACAO_MS = 10 * 60 * 1000;

// retoma exclusões de conta interrompidas por queda do processo. Falhas só vão para o log.
async function recuperarExclusoes() {
  try {
    const { exclusoesConcluidas, contratosCancelados } = await recuperarExclusoesPendentes();
    if (exclusoesConcluidas || contratosCancelados) {
      console.log(`Recuperação de exclusões: ${exclusoesConcluidas} concluída(s), ${contratosCancelados} contrato(s) cancelado(s).`);
    }
  } catch (error) {
    console.error('Falha ao recuperar exclusões de conta pendentes:', error?.message || error);
  }
}

// instala e verifica índices críticos sem depender do autoIndex. Sem o índice único a API continua
// no ar para consultas, mas recusa novos pedidos e propostas (503) até a proteção ser restabelecida.
async function prepararIndices() {
  const resultado = await garantirIndicesContrato();
  if (resultado.instalado) console.log('Proteção contra contratos duplicados ativa.');
  else relatarProblemaIndice(resultado);
  // sem o índice de avaliações, novas avaliações respondem 503 até a instalação dar certo.
  if (await garantirIndicesAvaliacao()) console.log('Proteção contra avaliações repetidas ativa.');
  else console.error('ATENÇÃO: índice único de avaliações indisponível; novas avaliações ficarão bloqueadas.');
}

// ponto de partida do backend: conecta no mongo, prepara os dados demo se estiver ligado e sobe a api
(async () => {
  try {
    await connectDatabase();
    await prepararIndices();
    await recuperarExclusoes();
    setInterval(recuperarExclusoes, INTERVALO_RECUPERACAO_MS).unref();

    if (ambiente.autoSeed) {
      // banco já começa com categorias/serviços de exemplo.
      await popularBancoDemo();
    }

    app.listen(ambiente.port, () => {
      console.log(`Servidor rodando em http://localhost:${ambiente.port}`);
    });
  } catch (error) {
    console.error('Erro ao iniciar a aplicação:', error);
    process.exit(1);
  }
})();

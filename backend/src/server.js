const app = require('./app');
const connectDatabase = require('./config/db');
const ambiente = require('./config/ambiente');
const { popularBancoDemo } = require('./seed');
const { garantirIndicesContrato, relatarProblemaIndice } = require('./models/Contrato');
const { garantirIndicesAvaliacao } = require('./models/Avaliacao');
const { garantirIndicesUsuario } = require('./models/Usuario');
const { recuperarExclusoesPendentes } = require('./services/contaService');

const INTERVALO_RECUPERACAO_MS = 10 * 60 * 1000;

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

async function prepararIndices() {
  if (await garantirIndicesUsuario()) console.log('Proteção contra e-mail e CPF duplicados ativa.');
  const resultado = await garantirIndicesContrato();
  if (resultado.instalado) console.log('Proteção contra contratos duplicados ativa.');
  else relatarProblemaIndice(resultado);
  if (await garantirIndicesAvaliacao()) console.log('Proteção contra avaliações repetidas ativa.');
  else console.error('ATENÇÃO: índice único de avaliações indisponível; novas avaliações ficarão bloqueadas.');
}

(async () => {
  try {
    await connectDatabase();
    await prepararIndices();
    await recuperarExclusoes();
    setInterval(recuperarExclusoes, INTERVALO_RECUPERACAO_MS).unref();

    if (ambiente.autoSeed) {
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

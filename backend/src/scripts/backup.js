const { gerarBackup, mascarar, segredosDa } = require('./backupRestore');

function lerArgumentos(argv) {
  const opcoes = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--saida') opcoes.pastaBackups = argv[(i += 1)];
    else throw new Error(`Opção desconhecida: ${argv[i]}`);
  }
  return opcoes;
}

async function principal() {
  const { mongoUri } = require('../config/ambiente');
  let segredos = [];
  try {
    segredos = segredosDa(mongoUri);
    await gerarBackup({ uri: mongoUri, ...lerArgumentos(process.argv.slice(2)) });
  } catch (error) {
    console.error(`Backup não concluído: ${mascarar(error?.message || error, segredos)}`);
    process.exitCode = 1;
  }
}

if (require.main === module) principal();

module.exports = { lerArgumentos };

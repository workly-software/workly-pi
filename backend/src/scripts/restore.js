const { restaurarBackup, mascarar, segredosDa } = require('./backupRestore');

function lerArgumentos(argv) {
  const opcoes = {};
  const valor = (i, nome) => {
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`${nome} precisa de um valor.`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--confirmar') opcoes.confirmar = valor(i++, arg);
    else if (arg === '--manutencao-confirmada') opcoes.manutencaoConfirmada = true;
    else if (arg === '--incluir-uploads') opcoes.incluirUploads = true;
    else if (arg === '--permitir-reintroducao-excluidos') opcoes.permitirReintroducao = true;
    else if (arg === '--confirmar-reintroducao') opcoes.confirmacaoReintroducao = valor(i++, arg);
    else if (arg.startsWith('--')) throw new Error(`Opção desconhecida: ${arg}`);
    else if (!opcoes.pasta) opcoes.pasta = arg;
    else throw new Error(`Argumento a mais: ${arg}`);
  }
  return opcoes;
}

async function principal() {
  const { mongoUri } = require('../config/ambiente');
  let segredos = [];
  try {
    segredos = segredosDa(mongoUri);
    await restaurarBackup({ uri: mongoUri, ...lerArgumentos(process.argv.slice(2)) });
  } catch (error) {
    console.error(`Restore não concluído: ${mascarar(error?.message || error, segredos)}`);
    process.exitCode = 1;
  }
}

if (require.main === module) principal();

module.exports = { lerArgumentos };

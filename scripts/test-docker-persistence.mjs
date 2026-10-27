import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Execute depois de subir o Compose: este teste remove/recria seus containers,
// preserva os volumes e grava apenas dois marcadores temporários próprios.
const cwd = fileURLToPath(new URL('../', import.meta.url));
const id = randomUUID();
const arquivo = `uploads/perfis/docker_test_${id}.svg`;
function compose(args, capturar = false) {
  return execFileSync('docker', ['compose', ...args], {
    cwd, encoding: 'utf8', stdio: capturar ? 'pipe' : 'inherit'
  });
}
function noBackend(codigo) {
  return compose(['exec', '-T', 'backend', 'node', '-e', codigo], true).trim();
}
const conectar = "const c=new (require('mongoose').mongo.MongoClient)(process.env.MONGO_URI);";
const chave = JSON.stringify(id);
const caminho = JSON.stringify(arquivo);
console.log('Verificando persistência: recriando containers, sem remover volumes.');
noBackend(`${conectar}(async()=>{try{await c.connect();await c.db().collection('__docker_persistence_tests').insertOne({_id:${chave}});}finally{await c.close();}})().catch(e=>{console.error(e);process.exit(1)});`);
noBackend(`require('node:fs').writeFileSync(${caminho},${chave},{flag:'wx'});`);
compose(['--profile', 'test', 'down']);
compose(['up', '-d', '--wait', '--wait-timeout', '180']);
assert.equal(noBackend(`${conectar}(async()=>{try{await c.connect();console.log(await c.db().collection('__docker_persistence_tests').countDocuments({_id:${chave}}));}finally{await c.close();}})().catch(e=>{console.error(e);process.exit(1)});`), '1');
assert.equal(noBackend(`console.log(require('node:fs').readFileSync(${caminho},'utf8'));`), id);
noBackend(`${conectar}(async()=>{try{await c.connect();await c.db().collection('__docker_persistence_tests').deleteOne({_id:${chave}});}finally{await c.close();}})().catch(e=>{console.error(e);process.exit(1)});`);
noBackend(`require('node:fs').unlinkSync(${caminho});`);
console.log('Persistência aprovada: documento e upload sobreviveram a down/up. Marcadores removidos.');

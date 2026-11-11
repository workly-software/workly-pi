const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mongoose = require('mongoose');
const br = require('../src/scripts/backupRestore');

const { EJSON } = mongoose.mongo.BSON;
const BASE = `workly_test_bkint_${process.pid}`;
const URI = `mongodb://127.0.0.1:27017/${BASE}`;

function versao(comando) {
  const r = spawnSync(comando, ['--version'], { shell: false, encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || '').split(/\r?\n/).find(Boolean)?.trim() || 'desconhecida';
}
const ferramentas = { mongodump: versao('mongodump'), mongorestore: versao('mongorestore') };
const faltando = Object.entries(ferramentas).filter(([, v]) => !v).map(([n]) => n);

let cliente = null;
test.before(async () => {
  if (faltando.length) return;
  const candidato = new mongoose.mongo.MongoClient(URI, { serverSelectionTimeoutMS: 1500 });
  try {
    await candidato.connect();
    cliente = candidato;
  } catch (error) {
    if (process.env.WORKLY_EXIGIR_MONGO === '1') throw error;
  }
});
test.after(async () => {
  if (!cliente) return;
  const { databases } = await cliente.db('admin').command({ listDatabases: 1, nameOnly: true });
  for (const { name } of databases) if (name.startsWith(BASE)) await cliente.db(name).dropDatabase();
  await cliente.close();
});
function pular(t) {
  if (faltando.length) {
    t.skip(`${faltando.join(' e ')} não encontrado(s) no PATH: instale o MongoDB Database Tools para rodar a ida e volta`);
    return true;
  }
  if (!cliente) {
    t.skip('MongoDB local indisponível');
    return true;
  }
  t.diagnostic(`mongodump: ${ferramentas.mongodump}; mongorestore: ${ferramentas.mongorestore}`);
  return false;
}
async function pasta(t) {
  const p = await fsp.mkdtemp(path.join(os.tmpdir(), 'workly-teste-bkint-'));
  t.after(() => fsp.rm(p, { recursive: true, force: true }));
  return p;
}
const silencio = { registrar: () => {}, registrarErro: () => {} };
const opcoesRestore = { confirmar: BASE, manutencaoConfirmada: true, ...silencio };
const conteudo = async (db, nome) =>
  EJSON.stringify(await db.collection(nome).find().sort({ _id: 1 }).toArray(), { relaxed: false });

async function semear() {
  const db = cliente.db(BASE);
  await db.dropDatabase();
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  await db.collection('usuarios').insertMany([
    { _id: ids[0], email: 'a@teste.local', criadoEm: new Date('2026-01-02T03:04:05.678Z'), removido: false },
    { _id: ids[1], email: 'b@teste.local', criadoEm: new Date('2026-02-03T04:05:06.789Z'), removido: false }
  ]);
  await db.collection('usuarios').createIndex({ email: 1 }, { unique: true, name: 'email_1' });
  await db.collection('contratos').insertOne({ cliente: ids[0], freelancer: ids[1], status: 'em_andamento', preco: 150.5 });
  await db.collection('contratos').createIndex(
    { cliente: 1, servico: 1 },
    { unique: true, name: 'contrato_ativo_unico_por_cliente_servico', partialFilterExpression: { status: { $in: ['pendente', 'em_andamento'] } } }
  );
  return db;
}

test('ida e volta: dados, ObjectId, datas, contagens e índices voltam iguais; anteriores preservadas', async (t) => {
  if (pular(t)) return;
  const db = await semear();
  const antes = { usuarios: await conteudo(db, 'usuarios'), contratos: await conteudo(db, 'contratos') };
  const uploadsOrigem = await pasta(t);
  await fsp.mkdir(path.join(uploadsOrigem, 'perfis'));
  await fsp.writeFile(path.join(uploadsOrigem, 'perfis', 'foto.png'), 'imagem');
  const backups = await pasta(t);
  const { pasta: pastaBackup, manifesto } = await br.gerarBackup({ uri: URI, pastaBackups: backups, pastaUploads: uploadsOrigem, ...silencio });
  assert.deepEqual(manifesto.colecoes.map((c) => [c.nome, c.documentos]).sort(), [['contratos', 1], ['usuarios', 2]]);
  assert.ok(manifesto.colecoes.find((c) => c.nome === 'usuarios').indices.some((i) => i.nome === 'email_1' && i.unico));
  assert.deepEqual(manifesto.uploads.arquivos.map((a) => a.caminho), ['perfis/foto.png']);
  assert.ok(!JSON.stringify(manifesto).includes('a@teste.local'), 'o manifesto não carrega conteúdo de documentos');

  await db.collection('usuarios').deleteMany({});
  await db.collection('contratos').insertOne({ status: 'cancelado' });
  const uploadsDestino = await pasta(t);
  const resultado = await br.restaurarBackup({ uri: URI, pasta: pastaBackup, incluirUploads: true, pastaUploads: uploadsDestino, ...opcoesRestore });
  assert.equal(await conteudo(db, 'usuarios'), antes.usuarios);
  assert.equal(await conteudo(db, 'contratos'), antes.contratos);
  const indices = await db.collection('contratos').indexes();
  assert.ok(indices.some((i) => i.unique && i.partialFilterExpression));
  assert.equal(resultado.preservadas.length, 2);
  for (const nome of resultado.preservadas) assert.ok(await db.listCollections({ name: nome }).hasNext(), `${nome} preservada`);
  assert.equal(await fsp.readFile(path.join(uploadsDestino, 'perfis', 'foto.png'), 'utf8'), 'imagem');
  const sobras = (await cliente.db('admin').command({ listDatabases: 1, nameOnly: true })).databases.filter((d) => d.name.startsWith(`${BASE}_rtmp_`));
  assert.deepEqual(sobras, [], 'a base temporária vazia é removida no fim');
});

test('falha simulada no meio da troca deixa o relatório e as cópias anteriores', async (t) => {
  if (pular(t)) return;
  const db = await semear();
  const backups = await pasta(t);
  const { pasta: pastaBackup } = await br.gerarBackup({ uri: URI, pastaBackups: backups, pastaUploads: await pasta(t), ...silencio });
  await db.collection('usuarios').insertOne({ email: 'nova@teste.local' });
  const erro = await br
    .restaurarBackup({
      uri: URI,
      pasta: pastaBackup,
      ...opcoesRestore,
      antesDeTrocar: async (nome) => {
        if (nome === 'usuarios') throw new Error('queda simulada');
      }
    })
    .then(() => null, (e) => e);
  assert.ok(erro instanceof br.ErroTrocaParcial, erro?.message);
  assert.deepEqual(erro.trocadas.map((x) => x.nome), ['contratos']);
  assert.equal(erro.falha.nome, 'usuarios');
  assert.equal(await db.collection('usuarios').countDocuments(), 3, 'usuarios ficou como estava');
  assert.ok(await cliente.db(erro.baseTemporaria).listCollections({ name: 'usuarios' }).hasNext(), 'a cópia restaurada continua na base temporária');
});

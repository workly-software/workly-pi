const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const mongoose = require('mongoose');
const br = require('../src/scripts/backupRestore');

const { BSON } = mongoose.mongo;
const BASE = `workly_test_backup_${process.pid}`;
const URI_TESTE = `mongodb://127.0.0.1:27017/${BASE}`;
const URI_COM_SENHA = `mongodb://ana:S3gr3d0%40x@127.0.0.1:27017/${BASE}?retryWrites=true`;

let cliente = null;
test.before(async () => {
  const candidato = new mongoose.mongo.MongoClient(URI_TESTE, { serverSelectionTimeoutMS: 1500 });
  try {
    await candidato.connect();
    cliente = candidato;
    await cliente.db(BASE).dropDatabase();
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
const semMongo = (t) => {
  if (cliente) return false;
  t.skip('MongoDB local indisponível');
  return true;
};

async function pastaTemporaria(t) {
  const pasta = await fsp.mkdtemp(path.join(os.tmpdir(), 'workly-teste-backup-'));
  t.after(() => fsp.rm(pasta, { recursive: true, force: true }));
  return pasta;
}

function spawnFalso({ versao = 'mongotool version: 100.9.0', aoExecutar } = {}) {
  const chamadas = [];
  const spawnFn = (comando, args, opcoes) => {
    chamadas.push({ comando, args: [...args], opcoes });
    const proc = new EventEmitter();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    setImmediate(async () => {
      let codigo = 0;
      if (args[0] === '--version') proc.stdout.write(`${versao}\n`);
      else if (aoExecutar) codigo = (await aoExecutar({ comando, args, proc })) ?? 0;
      proc.stdout.end();
      proc.stderr.end();
      setImmediate(() => proc.emit('close', codigo));
    });
    return proc;
  };
  return { spawnFn, chamadas };
}

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

async function criarBackupFalso(pasta, { inicio = new Date(Date.now() - 60 * 60 * 1000), uploads = [] } = {}) {
  const dados = path.join(pasta, 'dump', BASE);
  await fsp.mkdir(dados, { recursive: true });
  const docs = [{ _id: new mongoose.Types.ObjectId(), nome: 'A' }, { _id: new mongoose.Types.ObjectId(), nome: 'B' }];
  const bson = Buffer.concat(docs.map((d) => BSON.serialize(d)));
  const conteudo = zlib.gzipSync(bson);
  await fsp.writeFile(path.join(dados, 'usuarios.bson.gz'), conteudo);
  const arquivosUpload = [];
  for (const [caminho, texto] of uploads) {
    const destino = path.join(pasta, 'uploads', ...caminho.split('/'));
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    await fsp.writeFile(destino, texto);
    arquivosUpload.push({ caminho, bytes: Buffer.byteLength(texto), sha256: sha256(Buffer.from(texto)) });
  }
  const manifesto = {
    formato: 'workly-backup',
    versao: 1,
    dump: { inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 1000).toISOString(), ferramenta: 'mongodump', versaoFerramenta: 'x', gzip: true },
    origem: { base: BASE, hosts: '127.0.0.1:27017' },
    colecoes: [{ nome: 'usuarios', documentos: 2, indices: [{ nome: '_id_', chave: [['_id', 1]], unico: false, esparso: false, parcial: null, expiraAposSegundos: null }], opcoes: {} }],
    arquivos: [{ caminho: `dump/${BASE}/usuarios.bson.gz`, bytes: conteudo.length, sha256: sha256(conteudo) }],
    uploads: { arquivos: arquivosUpload, ignorados: [] },
    exclusoes: { contasRemovidas: 0, ultimaRemocao: null },
    avisos: []
  };
  await fsp.writeFile(path.join(pasta, 'manifesto.json'), JSON.stringify(manifesto, null, 2));
  return manifesto;
}

const confirmacoes = { confirmar: BASE, manutencaoConfirmada: true };
const silencio = { registrar: () => {}, registrarErro: () => {} };

async function semearDestino() {
  const db = cliente.db(BASE);
  await db.dropDatabase();
  await db.collection('usuarios').insertMany([{ nome: 'atual 1' }, { nome: 'atual 2' }, { nome: 'atual 3' }]);
  return async () => (await db.collection('usuarios').find({}, { projection: { _id: 0 } }).toArray()).map((u) => u.nome);
}

test('credenciais: a URI vai num arquivo temporário apagado depois, nunca nos argumentos', async (t) => {
  const pasta = await pastaTemporaria(t);
  let config = null;
  const falso = spawnFalso({
    aoExecutar: async ({ args }) => {
      config = args[args.indexOf('--config') + 1];
      const conteudo = await fsp.readFile(config, 'utf8');
      assert.match(conteudo, /^uri: "mongodb:\/\/ana:S3gr3d0%40x@127\.0\.0\.1:27017\/\?retryWrites=true&authSource=/);
      if (process.platform !== 'win32') assert.equal((await fsp.stat(config)).mode & 0o077, 0, 'só o dono lê');
      return 0;
    }
  });
  await assert.rejects(
    br.gerarBackup({ uri: URI_COM_SENHA, pastaBackups: pasta, pastaUploads: path.join(pasta, 'nao-existe'), spawnFn: falso.spawnFn, ...silencio }),
    /não gerou nenhuma coleção/
  );
  assert.ok(config, 'o mongodump recebeu --config');
  assert.equal(fs.existsSync(config), false, 'o arquivo de configuração foi apagado');
  for (const chamada of falso.chamadas) {
    assert.equal(chamada.opcoes.shell, false);
    const texto = chamada.args.join(' ');
    assert.ok(!texto.includes('S3gr3d0') && !texto.includes('ana:') && !texto.includes('mongodb://'), texto);
  }
  assert.deepEqual(falso.chamadas[1].args.slice(2), ['--db', BASE, '--out', falso.chamadas[1].args[5], '--gzip']);

  let config2 = null;
  const falha = spawnFalso({
    aoExecutar: async ({ args }) => {
      config2 = args[args.indexOf('--config') + 1];
      return 1;
    }
  });
  await assert.rejects(
    br.gerarBackup({ uri: URI_COM_SENHA, pastaBackups: path.join(pasta, 'b'), spawnFn: falha.spawnFn, ...silencio }),
    /mongodump terminou com código 1/
  );
  assert.equal(fs.existsSync(config2), false);
});

test('logs: credenciais mascaradas, inclusive no stderr repassado das ferramentas', async () => {
  const segredos = br.segredosDa(URI_COM_SENHA);
  assert.equal(br.mascarar(`falhou em ${URI_COM_SENHA}`, segredos).includes('S3gr3d0'), false);
  assert.equal(br.mascarar('mongodb+srv://joao:outra@cluster.x/db', []), 'mongodb+srv://***@cluster.x/db');
  const registros = [];
  const falso = spawnFalso({
    aoExecutar: async ({ proc }) => {
      proc.stderr.write(`erro ao conectar em ${URI_COM_SENHA} com senha S3gr3d0@x\n`);
      return 1;
    }
  });
  await assert.rejects(
    br.executarFerramenta('mongorestore', ['--config', 'x'], {
      segredos,
      spawnFn: falso.spawnFn,
      registrar: (l) => registros.push(l),
      registrarErro: (l) => registros.push(l)
    })
  );
  assert.ok(registros.length);
  assert.ok(registros.every((linha) => !linha.includes('S3gr3d0') && !linha.includes('ana:')), registros.join('\n'));
});

test('restore recusa base que não é de teste, a menos que liberada pelo nome exato', async (t) => {
  const pasta = await pastaTemporaria(t);
  const falso = spawnFalso();
  for (const ambiente of [{}, { WORKLY_RESTORE_BASE_LIBERADA: 'outra' }, { WORKLY_RESTORE_BASE_LIBERADA: '' }]) {
    await assert.rejects(
      br.restaurarBackup({ uri: 'mongodb://127.0.0.1:27017/workly', pasta, confirmar: 'workly', manutencaoConfirmada: true, ambiente, spawnFn: falso.spawnFn, ...silencio }),
      /não é uma base de teste/
    );
  }
  await assert.rejects(
    br.restaurarBackup({ uri: 'mongodb://127.0.0.1:27017/workly', pasta, confirmar: 'workly', manutencaoConfirmada: true, ambiente: { WORKLY_RESTORE_BASE_LIBERADA: 'workly' }, spawnFn: falso.spawnFn, ...silencio }),
    /Manifesto não encontrado/
  );
  assert.equal(falso.chamadas.length, 0);
});

test('restore sem confirmação, com nome errado, sem manutenção ou com reintrodução sem texto não altera nada', async (t) => {
  if (semMongo(t)) return;
  const pasta = await pastaTemporaria(t);
  await criarBackupFalso(pasta);
  const nomes = await semearDestino();
  const falso = spawnFalso();
  const casos = [
    [{ manutencaoConfirmada: true }, /--confirmar/],
    [{ confirmar: 'workly_test_outra', manutencaoConfirmada: true }, /--confirmar/],
    [{ confirmar: BASE }, /--manutencao-confirmada/],
    [{ ...confirmacoes, permitirReintroducao: true }, /--confirmar-reintroducao/],
    [{ ...confirmacoes, permitirReintroducao: true, confirmacaoReintroducao: 'sim' }, /--confirmar-reintroducao/]
  ];
  for (const [opcoes, erro] of casos) {
    await assert.rejects(br.restaurarBackup({ uri: URI_TESTE, pasta, spawnFn: falso.spawnFn, ...silencio, ...opcoes }), erro);
  }
  assert.equal(falso.chamadas.length, 0);
  assert.deepEqual(await nomes(), ['atual 1', 'atual 2', 'atual 3']);
});

test('manifesto inválido ou corrompido é recusado antes de qualquer gravação', async (t) => {
  if (semMongo(t)) return;
  const nomes = await semearDestino();
  const falso = spawnFalso();
  const variantes = [
    ['sem manifesto', async (p) => fsp.rm(path.join(p, 'manifesto.json')), /não encontrado/],
    ['JSON quebrado', async (p) => fsp.writeFile(path.join(p, 'manifesto.json'), '{"formato":'), /corrompido/],
    ['versão desconhecida', async (p, m) => salvar(p, { ...m, versao: 99 }), /formato ou versão/],
    ['data inválida', async (p, m) => salvar(p, { ...m, dump: { ...m.dump, inicio: 'ontem' } }), /datas/],
    ['data no futuro', async (p, m) => salvar(p, { ...m, dump: { ...m.dump, fim: new Date(Date.now() + 864e5).toISOString() } }), /futuro/],
    ['contagem negativa', async (p, m) => salvar(p, { ...m, colecoes: [{ ...m.colecoes[0], documentos: -1 }] }), /contagem/],
    ['arquivo alterado', async (p) => fsp.appendFile(path.join(p, 'dump', BASE, 'usuarios.bson.gz'), 'x'), /alterado/],
    ['arquivo extra', async (p) => fsp.writeFile(path.join(p, 'dump', BASE, 'intrusa.bson.gz'), 'x'), /não registrado/],
    ['upload com travessia', async (p, m) => salvar(p, { ...m, uploads: { arquivos: [{ caminho: '../fora.png', sha256: 'a'.repeat(64) }], ignorados: [] } }), /upload inválida/]
  ];
  const salvar = (p, m) => fsp.writeFile(path.join(p, 'manifesto.json'), JSON.stringify(m));
  for (const [descricao, estragar, erro] of variantes) {
    const pasta = await pastaTemporaria(t);
    const manifesto = await criarBackupFalso(pasta);
    await assert.doesNotReject(br.validarManifesto(pasta), 'o backup íntegro passa');
    await estragar(pasta, manifesto);
    await assert.rejects(br.restaurarBackup({ uri: URI_TESTE, pasta, ...confirmacoes, spawnFn: falso.spawnFn, ...silencio }), erro, descricao);
  }
  assert.equal(falso.chamadas.length, 0);
  assert.deepEqual(await nomes(), ['atual 1', 'atual 2', 'atual 3']);
});

test('uploads: recusa travessia e links, nunca sobrescreve e só cria o que falta', async (t) => {
  const backup = await pastaTemporaria(t);
  const destino = await pastaTemporaria(t);
  const manifesto = await criarBackupFalso(backup, { uploads: [['perfis/nova.png', 'nova'], ['servicos/existente.png', 'do backup']] });
  await fsp.mkdir(path.join(destino, 'servicos'), { recursive: true });
  await fsp.writeFile(path.join(destino, 'servicos', 'existente.png'), 'atual');

  for (const caminho of ['../fora.png', '/abs.png', 'C:/x.png', 'a\\b.png', 'a/./b.png', 'a/../../b.png', '', 'a//b.png']) {
    assert.equal(br.caminhoUploadSeguro(caminho), false, caminho);
    await assert.rejects(
      br.restaurarUploads({ pastaBackup: backup, arquivos: [{ caminho, sha256: 'a'.repeat(64) }], pastaUploads: destino, registrar: () => {} }),
      /recusado/
    );
  }
  await assert.rejects(
    br.restaurarUploads({ pastaBackup: backup, arquivos: [{ ...manifesto.uploads.arquivos[0], sha256: 'b'.repeat(64) }], pastaUploads: destino, registrar: () => {} }),
    /alterado/
  );
  assert.equal(fs.existsSync(path.join(destino, 'perfis', 'nova.png')), false, 'nada foi criado nas recusas');

  const resultado = await br.restaurarUploads({ pastaBackup: backup, arquivos: manifesto.uploads.arquivos, pastaUploads: destino, registrar: () => {} });
  assert.deepEqual(resultado, { criados: ['perfis/nova.png'], mantidos: ['servicos/existente.png'] });
  assert.equal(await fsp.readFile(path.join(destino, 'servicos', 'existente.png'), 'utf8'), 'atual', 'não sobrescreveu');
  assert.equal(await fsp.readFile(path.join(destino, 'perfis', 'nova.png'), 'utf8'), 'nova');

  const fora = await pastaTemporaria(t);
  const destino2 = await pastaTemporaria(t);
  let linkCriado = true;
  try {
    await fsp.symlink(fora, path.join(destino2, 'perfis'), 'junction');
  } catch {
    linkCriado = false;
  }
  if (linkCriado) {
    await assert.rejects(
      br.restaurarUploads({ pastaBackup: backup, arquivos: [manifesto.uploads.arquivos[0]], pastaUploads: destino2, registrar: () => {} }),
      /Link ou tipo inesperado no caminho de destino/
    );
    assert.deepEqual(await fsp.readdir(fora), [], 'nada escrito fora');
  } else t.diagnostic('link de pasta indisponível neste sistema; caso do link no destino não verificado');

  const backup2 = await pastaTemporaria(t);
  const m2 = await criarBackupFalso(backup2, { uploads: [['perfis/link.png', 'x']] });
  await fsp.rm(path.join(backup2, 'uploads', 'perfis', 'link.png'));
  try {
    await fsp.symlink(path.join(fora, 'alvo.png'), path.join(backup2, 'uploads', 'perfis', 'link.png'), 'file');
    await assert.rejects(
      br.restaurarUploads({ pastaBackup: backup2, arquivos: m2.uploads.arquivos, pastaUploads: destino, registrar: () => {} }),
      /com link no caminho do backup/
    );
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
    t.diagnostic('links de arquivo exigem privilégio neste Windows; caso do link no backup não verificado');
  }
});

async function junction(alvo, link) {
  try {
    await fsp.symlink(alvo, link, 'junction');
    return true;
  } catch {
    return false;
  }
}

test('uploads: links nos diretórios intermediários, inclusive internos, são recusados sem gravar nada', async (t) => {
  const fora = await pastaTemporaria(t);
  const avisoSemLink = 'junction indisponível neste sistema; caso não verificado';

  const backup = await pastaTemporaria(t);
  const manifesto = await criarBackupFalso(backup, { uploads: [['perfis/foto.png', 'conteudo']] });
  await fsp.rm(path.join(backup, 'uploads', 'perfis'), { recursive: true });
  await fsp.writeFile(path.join(fora, 'foto.png'), 'conteudo');
  if (await junction(fora, path.join(backup, 'uploads', 'perfis'))) {
    const destino = await pastaTemporaria(t);
    await assert.rejects(
      br.restaurarUploads({ pastaBackup: backup, arquivos: manifesto.uploads.arquivos, pastaUploads: destino, registrar: () => {} }),
      /com link no caminho do backup/
    );
    assert.deepEqual(await fsp.readdir(destino), [], 'nada criado no destino');
  } else t.diagnostic(avisoSemLink);

  const backupInterno = await pastaTemporaria(t);
  const mInterno = await criarBackupFalso(backupInterno, { uploads: [['real/foto.png', 'conteudo'], ['atalho/foto.png', 'conteudo']] });
  await fsp.rm(path.join(backupInterno, 'uploads', 'atalho'), { recursive: true });
  if (await junction(path.join(backupInterno, 'uploads', 'real'), path.join(backupInterno, 'uploads', 'atalho'))) {
    const destino = await pastaTemporaria(t);
    await assert.rejects(
      br.restaurarUploads({ pastaBackup: backupInterno, arquivos: mInterno.uploads.arquivos, pastaUploads: destino, registrar: () => {} }),
      /com link no caminho do backup/
    );
    assert.deepEqual(await fsp.readdir(destino), [], 'nem o arquivo válido foi gravado');
  } else t.diagnostic(avisoSemLink);

  const backupFundo = await pastaTemporaria(t);
  const mFundo = await criarBackupFalso(backupFundo, { uploads: [['a/b/c/foto.png', 'conteudo']] });
  const destino = await pastaTemporaria(t);
  const foraDestino = await pastaTemporaria(t);
  await fsp.mkdir(path.join(destino, 'a'));
  if (await junction(foraDestino, path.join(destino, 'a', 'b'))) {
    await assert.rejects(
      br.restaurarUploads({ pastaBackup: backupFundo, arquivos: mFundo.uploads.arquivos, pastaUploads: destino, registrar: () => {} }),
      /Link ou tipo inesperado no caminho de destino/
    );
    assert.deepEqual(await fsp.readdir(foraDestino), [], 'nenhuma pasta criada fora de uploads/');
  } else t.diagnostic(avisoSemLink);

  const destinoInterno = await pastaTemporaria(t);
  await fsp.mkdir(path.join(destinoInterno, 'outra'));
  await fsp.mkdir(path.join(destinoInterno, 'a'));
  if (await junction(path.join(destinoInterno, 'outra'), path.join(destinoInterno, 'a', 'b'))) {
    await assert.rejects(
      br.restaurarUploads({ pastaBackup: backupFundo, arquivos: mFundo.uploads.arquivos, pastaUploads: destinoInterno, registrar: () => {} }),
      /Link ou tipo inesperado no caminho de destino/
    );
    assert.deepEqual(await fsp.readdir(path.join(destinoInterno, 'outra')), []);
  } else t.diagnostic(avisoSemLink);

  const limpo = await pastaTemporaria(t);
  const ok = await br.restaurarUploads({ pastaBackup: backupFundo, arquivos: mFundo.uploads.arquivos, pastaUploads: limpo, registrar: () => {} });
  assert.deepEqual(ok.criados, ['a/b/c/foto.png']);
});

test('logs: segredo dividido entre blocos da saída continua mascarado', async () => {
  const uriSrv = 'mongodb+srv://joao:Xy%2Fz9@cluster0.exemplo.net/workly';
  const segredos = [...br.segredosDa(URI_COM_SENHA), ...br.segredosDa(uriSrv)];
  const blocos = [
    'progresso 50%\nconectando em mongodb://an',
    'a:S3gr3',
    'd0%4',
    '0x@127.0.0.1:27',
    '017/base ok\nsenha usada: S3gr3d0',
    '@x fim\noutro destino mongodb+sr',
    'v://joao:Xy%2',
    'Fz9@cluster0.exem',
    'plo.net/workly\núltima linha sem quebra'
  ];
  const registros = [];
  const falso = spawnFalso({
    aoExecutar: async ({ proc }) => {
      for (const bloco of blocos) {
        proc.stderr.write(bloco);
        await new Promise((r) => setImmediate(r));
      }
      return 0;
    }
  });
  await br.executarFerramenta('mongorestore', ['--config', 'x'], {
    segredos,
    spawnFn: falso.spawnFn,
    registrar: (l) => registros.push(l),
    registrarErro: (l) => registros.push(l)
  });
  const texto = registros.join('\n');
  for (const proibido of ['S3gr3d0', 'S3gr3', 'ana:', 'joao:', 'Xy%2Fz9', 'Xy/z9', '%40x']) {
    assert.ok(!texto.includes(proibido), `vazou "${proibido}":\n${texto}`);
  }
  assert.ok(texto.includes('progresso 50%'), 'conteúdo comum continua aparecendo');
  assert.ok(texto.includes('última linha sem quebra'), 'o resto é emitido ao fechar');
  assert.ok(texto.includes('outro destino ***'), texto);
});

test('logs: linha acima de 64 KB vira só um aviso, sem nenhum trecho do segredo', async () => {
  const AVISO = '[saída da ferramenta omitida: linha acima de 64 KB]';
  const uriSrv = 'mongodb+srv://joao:Xy%2Fz9@cluster0.exemplo.net/workly';
  const variantes = [
    ['senha simples', 'Pw9xK2mQ7z', ['Pw9xK', '2mQ7z'], ['Pw9xK2mQ7z']],
    ['senha com %xx partido', 'Ab%2Fcd%40ef', ['Ab%2', 'Fcd%40ef'], ['Ab%2Fcd%40ef', 'Ab/cd@ef']],
    ['URI mongodb+srv', uriSrv, ['mongodb+srv://joao:Xy%', '2Fz9@cluster0.exemplo.net/workly'], ['joao:Xy', 'Xy%2Fz9', 'Xy/z9']]
  ];
  for (const [descricao, segredo, [inicio, fim], proibidos] of variantes) {
    const segredos = segredo === uriSrv ? br.segredosDa(uriSrv) : [segredo, decodeURIComponent(segredo)];
    const blocos = ['linha comum antes\n', 'x'.repeat(64 * 1024 - inicio.length + 3) + inicio, fim + ' resto da linha longa\n', 'linha normal depois\n'];
    const registros = [];
    const falso = spawnFalso({
      aoExecutar: async ({ proc }) => {
        for (const bloco of blocos) {
          proc.stderr.write(bloco);
          await new Promise((r) => setImmediate(r));
        }
        return 0;
      }
    });
    await br.executarFerramenta('mongorestore', ['--config', 'x'], {
      segredos,
      spawnFn: falso.spawnFn,
      registrar: (l) => registros.push(l),
      registrarErro: (l) => registros.push(l)
    });
    const texto = registros.join('\n');
    for (const proibido of [...proibidos, inicio, fim]) assert.ok(!texto.includes(proibido), `${descricao}: vazou "${proibido}"`);
    assert.deepEqual(registros, ['linha comum antes', AVISO, 'linha normal depois'], descricao);
  }

  const registros = [];
  const semQuebra = spawnFalso({
    aoExecutar: async ({ proc }) => {
      proc.stdout.write('ok\n');
      for (let i = 0; i < 3; i += 1) {
        proc.stdout.write('y'.repeat(30 * 1024) + (i === 1 ? 'Pw9xK' : ''));
        await new Promise((r) => setImmediate(r));
      }
      proc.stdout.write('2mQ7z');
      return 0;
    }
  });
  await br.executarFerramenta('mongodump', ['--config', 'x'], {
    segredos: ['Pw9xK2mQ7z'],
    spawnFn: semQuebra.spawnFn,
    registrar: (l) => registros.push(l),
    registrarErro: (l) => registros.push(l)
  });
  assert.deepEqual(registros, ['ok', AVISO]);
});

test('base temporária que já existe não é apagada nem alterada; a criada por esta execução é removida na falha', async (t) => {
  if (semMongo(t)) return;
  const pasta = await pastaTemporaria(t);
  await criarBackupFalso(pasta);
  const nomes = await semearDestino();

  const ocupada = `${BASE}_rtmp_colisao`;
  await cliente.db(ocupada).collection('usuarios').insertOne({ nome: 'de outra execução' });
  const avisos = [];
  const colisao = spawnFalso();
  await assert.rejects(
    br.restaurarBackup({ uri: URI_TESTE, pasta, ...confirmacoes, baseTemporaria: ocupada, spawnFn: colisao.spawnFn, registrar: () => {}, registrarErro: (l) => avisos.push(l) }),
    /já existe e não foi criada por esta execução/
  );
  assert.deepEqual(colisao.chamadas.map((c) => c.args[0]), ['--version'], 'o mongorestore não rodou');
  assert.deepEqual((await cliente.db(ocupada).collection('usuarios').find({}, { projection: { _id: 0 } }).toArray()), [{ nome: 'de outra execução' }]);
  assert.ok(avisos.some((l) => /não foi tocada/.test(l)));
  assert.deepEqual(await nomes(), ['atual 1', 'atual 2', 'atual 3']);

  let criada = null;
  const falhaDepois = spawnFalso({
    aoExecutar: async ({ args }) => {
      criada = args[args.indexOf('--nsTo') + 1].replace(/\.\*$/, '');
      await cliente.db(criada).collection('usuarios').insertOne({ nome: 'parcial' });
      return 1;
    }
  });
  await assert.rejects(
    br.restaurarBackup({ uri: URI_TESTE, pasta, ...confirmacoes, spawnFn: falhaDepois.spawnFn, ...silencio }),
    /mongorestore terminou com código 1/
  );
  assert.ok(criada);
  assert.equal((await cliente.db(criada).listCollections().toArray()).length, 0, 'base temporária desta execução removida');
  assert.deepEqual(await nomes(), ['atual 1', 'atual 2', 'atual 3']);
});

test('contas excluídas depois do backup bloqueiam o restore, inclusive sem informação suficiente', async (t) => {
  if (semMongo(t)) return;
  const db = cliente.db(BASE);
  const inicio = new Date(Date.now() - 60 * 60 * 1000);
  const manifesto = { dump: { inicio: inicio.toISOString() } };
  const casos = [
    [[{ removido: true, removidoEm: new Date(inicio.getTime() - 1000) }], []],
    [[{ removido: true, removidoEm: new Date() }], [/depois do backup/]],
    [[{ removido: false, exclusaoConfirmadaEm: new Date() }], [/depois do backup/]],
    [[{ removido: true }], [/sem data/]],
    [[{ removido: false, removendoDesde: new Date(inicio.getTime() - 5000) }], [/em andamento/]]
  ];
  for (const [usuarios, esperados] of casos) {
    await db.dropDatabase();
    await db.collection('usuarios').insertMany(usuarios.map((u) => ({ nome: 'x', ...u })));
    const { motivos } = await br.verificarExclusoesPosteriores(db, manifesto);
    assert.equal(motivos.length, esperados.length, JSON.stringify({ usuarios, motivos }));
    esperados.forEach((regex, i) => assert.match(motivos[i], regex));
  }
  const semData = await br.verificarExclusoesPosteriores(db, { dump: {} });
  assert.ok(semData.motivos.some((m) => /data de backup confiável/.test(m)));

  const id = new mongoose.Types.ObjectId();
  const temporaria = cliente.db(`${BASE}_tmpcheck`);
  await temporaria.collection('usuarios').insertOne({ _id: id, removido: false, nome: 'dados antigos' });
  assert.equal(await br.contasReintroduzidas(temporaria, [id]), 1);
  await temporaria.collection('usuarios').updateOne({ _id: id }, { $set: { removido: true } });
  assert.equal(await br.contasReintroduzidas(temporaria, [id]), 0);
});

test('restore completo: bloqueio de excluídos por padrão e exceção só com flag e texto digitado', async (t) => {
  if (semMongo(t)) return;
  const pasta = await pastaTemporaria(t);
  await criarBackupFalso(pasta);
  const db = cliente.db(BASE);
  await db.dropDatabase();
  await db.collection('usuarios').insertOne({ nome: 'excluída hoje', removido: true, removidoEm: new Date() });

  const bloqueio = spawnFalso();
  await assert.rejects(
    br.restaurarBackup({ uri: URI_TESTE, pasta, ...confirmacoes, spawnFn: bloqueio.spawnFn, ...silencio }),
    /contas excluídas/
  );
  assert.deepEqual(bloqueio.chamadas.map((c) => c.args[0]), ['--version'], 'mongorestore não chegou a restaurar');

  const excecao = spawnFalso({ aoExecutar: async () => 1 });
  await assert.rejects(
    br.restaurarBackup({
      uri: URI_TESTE,
      pasta,
      ...confirmacoes,
      permitirReintroducao: true,
      confirmacaoReintroducao: br.CONFIRMACAO_REINTRODUCAO,
      spawnFn: excecao.spawnFn,
      ...silencio
    }),
    /mongorestore terminou com código 1/
  );
  const restore = excecao.chamadas.find((c) => c.args[0] === '--config');
  assert.ok(restore, 'o mongorestore foi chamado');
  const nsTo = restore.args[restore.args.indexOf('--nsTo') + 1];
  assert.match(nsTo, new RegExp(`^${BASE}_rtmp_\\d+_[a-f0-9]{8}\\.\\*$`), 'restaura numa base temporária com sufixo aleatório');
  assert.ok(!restore.args.includes('--drop'));
  assert.equal(await db.collection('usuarios').countDocuments(), 1);
});

test('base temporária é conferida contra o manifesto: contagem, índices e validadores', async (t) => {
  if (semMongo(t)) return;
  const temporaria = cliente.db(`${BASE}_tmpvalida`);
  await temporaria.dropDatabase();
  await temporaria.createCollection('usuarios', { validator: { nome: { $type: 'string' } } });
  await temporaria.collection('usuarios').insertMany([{ nome: 'a' }, { nome: 'b' }]);
  await temporaria.collection('usuarios').createIndex({ email: 1 }, { unique: true, sparse: true, name: 'email_1' });
  const indices = (await temporaria.collection('usuarios').indexes()).map(br.normalizarIndice);
  const manifesto = {
    colecoes: [{ nome: 'usuarios', documentos: 2, indices, opcoes: { validator: { nome: { $type: 'string' } } } }]
  };
  assert.deepEqual(await br.validarBaseTemporaria(temporaria, manifesto), []);
  const errado = (mudanca) => ({ colecoes: [{ ...manifesto.colecoes[0], ...mudanca }] });
  assert.match((await br.validarBaseTemporaria(temporaria, errado({ documentos: 3 })))[0], /documentos/);
  assert.match(
    (await br.validarBaseTemporaria(temporaria, errado({ indices: indices.map((i) => ({ ...i, unico: false })) })))[0],
    /índices/
  );
  assert.match((await br.validarBaseTemporaria(temporaria, errado({ opcoes: {} })))[0], /validadores/);
  await temporaria.collection('sobra').insertOne({ x: 1 });
  assert.ok((await br.validarBaseTemporaria(temporaria, manifesto)).some((p) => /inesperada: sobra/.test(p)));
});

test('falha no meio da troca: para, informa o que foi trocado e preserva as coleções anteriores', async (t) => {
  if (semMongo(t)) return;
  const destino = cliente.db(BASE);
  const baseTemporaria = `${BASE}_tmptroca`;
  const temporaria = cliente.db(baseTemporaria);
  await destino.dropDatabase();
  await temporaria.dropDatabase();
  for (const nome of ['a', 'b', 'c']) {
    await destino.collection(nome).insertOne({ origem: 'atual' });
    await temporaria.collection(nome).insertOne({ origem: 'backup' });
  }
  const erro = await br
    .trocarColecoes({
      cliente,
      base: BASE,
      baseTemporaria,
      colecoes: ['a', 'b', 'c'],
      carimboTroca: '20261015-120000',
      antesDeTrocar: async (nome) => {
        if (nome === 'b') throw new Error('queda simulada');
      }
    })
    .then(() => null, (e) => e);
  assert.ok(erro instanceof br.ErroTrocaParcial);
  assert.deepEqual(erro.trocadas, [{ nome: 'a', preservada: 'a_pre_restore_20261015-120000' }]);
  assert.deepEqual([erro.falha.nome, erro.falha.etapa], ['b', 'preservar']);
  assert.deepEqual(erro.pendentes, ['c']);
  assert.match(erro.message, /não é atômica/);
  assert.match(erro.message, /renameCollection\('a'\)/);
  const origem = async (db, nome) => (await db.collection(nome).findOne()).origem;
  assert.equal(await origem(destino, 'a'), 'backup');
  assert.equal(await origem(destino, 'a_pre_restore_20261015-120000'), 'atual');
  assert.equal(await origem(destino, 'b'), 'atual');
  assert.equal(await origem(destino, 'c'), 'atual');
  assert.equal(await origem(temporaria, 'b'), 'backup', 'as cópias não trocadas ficam na base temporária');

  const trocadas = await br.trocarColecoes({ cliente, base: BASE, baseTemporaria, colecoes: ['b', 'c'], carimboTroca: '20261015-120001' });
  assert.deepEqual(trocadas.map((x) => x.preservada), ['b_pre_restore_20261015-120001', 'c_pre_restore_20261015-120001']);
  assert.equal(await origem(destino, 'c'), 'backup');
  assert.equal(await origem(destino, 'c_pre_restore_20261015-120001'), 'atual');
});

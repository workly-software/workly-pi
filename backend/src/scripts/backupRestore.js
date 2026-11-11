const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const mongoose = require('mongoose');

const { EJSON } = mongoose.mongo.BSON;

const FORMATO = 'workly-backup';
const VERSAO_FORMATO = 1;
const PASTA_UPLOADS_PADRAO = path.resolve(__dirname, '../../uploads');
const PASTA_BACKUPS_PADRAO = path.resolve(__dirname, '../../backups');
const CONFIRMACAO_REINTRODUCAO = 'REINTRODUZIR CONTAS EXCLUIDAS';
const VARIAVEL_LIBERACAO = 'WORKLY_RESTORE_BASE_LIBERADA';

const LIMITE_LINHA = 64 * 1024;
const AVISO_LINHA_LONGA = '[saída da ferramenta omitida: linha acima de 64 KB]';

class ErroBackup extends Error {}

function analisarUri(uri) {
  const m = /^(mongodb(?:\+srv)?:\/\/)(?:([^@/]*)@)?([^/?]+)(?:\/([^?]*))?(?:\?(.*))?$/.exec(String(uri || '').trim());
  if (!m) throw new ErroBackup('URI do MongoDB inválida.');
  const credenciais = m[2] || null;
  const senha = credenciais && credenciais.includes(':') ? credenciais.slice(credenciais.indexOf(':') + 1) : null;
  return {
    esquema: m[1],
    credenciais,
    senha,
    hosts: m[3],
    base: decodeURIComponent(m[4] || ''),
    parametros: m[5] || ''
  };
}

function uriSemBase(info) {
  const parametros = new URLSearchParams(info.parametros);
  if (info.credenciais && info.base && !parametros.has('authSource')) parametros.set('authSource', info.base);
  const consulta = parametros.toString();
  return `${info.esquema}${info.credenciais ? `${info.credenciais}@` : ''}${info.hosts}/${consulta ? `?${consulta}` : ''}`;
}

function segredosDa(uri) {
  const info = analisarUri(uri);
  const segredos = [String(uri).trim(), uriSemBase(info)];
  if (info.credenciais) segredos.push(info.credenciais);
  if (info.senha) {
    segredos.push(info.senha);
    try {
      segredos.push(decodeURIComponent(info.senha));
    } catch {}
  }
  return segredos.filter((s) => s && s.length >= 3);
}

function mascarar(texto, segredos = []) {
  let saida = String(texto);
  for (const segredo of [...segredos].sort((a, b) => b.length - a.length)) saida = saida.split(segredo).join('***');
  return saida.replace(/(mongodb(?:\+srv)?:\/\/)[^@/\s]+@/gi, '$1***@');
}

function executarFerramenta(comando, argumentos, opcoes = {}) {
  const { segredos = [], spawnFn = spawn, registrar = console.log, registrarErro = console.error } = opcoes;
  return new Promise((resolve, reject) => {
    let processo;
    try {
      processo = spawnFn(comando, argumentos, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      reject(error);
      return;
    }
    let saida = '';
    const emitir = (destino, texto) => {
      const mascarado = mascarar(texto, segredos);
      saida += `${mascarado}\n`;
      const linha = mascarado.replace(/\s+$/, '');
      if (linha) destino(linha);
    };
    const repassar = (stream, destino) => {
      if (!stream) return;
      let pendente = '';
      let suprimindo = false;
      stream.setEncoding?.('utf8');
      stream.on('data', (pedaco) => {
        let texto = String(pedaco);
        while (texto) {
          const quebra = texto.search(/\r?\n/);
          if (quebra === -1) {
            if (!suprimindo) {
              pendente += texto;
              if (pendente.length > LIMITE_LINHA) {
                pendente = '';
                suprimindo = true;
              }
            }
            return;
          }
          const tamanhoQuebra = texto[quebra] === '\r' ? 2 : 1;
          const resto = texto.slice(0, quebra);
          texto = texto.slice(quebra + tamanhoQuebra);
          if (suprimindo || pendente.length + resto.length > LIMITE_LINHA) {
            emitir(destino, AVISO_LINHA_LONGA);
            suprimindo = false;
          } else emitir(destino, pendente + resto);
          pendente = '';
        }
      });
      stream.on('end', () => {
        if (suprimindo) emitir(destino, AVISO_LINHA_LONGA);
        else if (pendente) emitir(destino, pendente);
        pendente = '';
        suprimindo = false;
      });
    };
    repassar(processo.stdout, registrar);
    repassar(processo.stderr, registrarErro);
    processo.on('error', (error) => {
      if (error?.code === 'ENOENT') {
        reject(new ErroBackup(`${comando} não foi encontrado. Instale o MongoDB Database Tools (dependência externa).`));
      } else reject(new ErroBackup(`Falha ao iniciar ${comando}: ${mascarar(error?.message || error, segredos)}`));
    });
    processo.on('close', (codigo) =>
      codigo === 0 ? resolve(saida) : reject(new ErroBackup(`${comando} terminou com código ${codigo}.`))
    );
  });
}

async function versaoFerramenta(comando, opcoes = {}) {
  const saida = await executarFerramenta(comando, ['--version'], { ...opcoes, registrar: () => {}, registrarErro: () => {} });
  return saida.split(/\r?\n/).find(Boolean)?.trim() || 'desconhecida';
}

async function comConfigTemporaria(uri, executar) {
  const pasta = await fsp.mkdtemp(path.join(os.tmpdir(), 'workly-mongo-'));
  const arquivo = path.join(pasta, 'config.yaml');
  try {
    await fsp.writeFile(arquivo, `uri: ${JSON.stringify(uri)}\n`, { mode: 0o600, flag: 'wx' });
    return await executar(arquivo);
  } finally {
    await fsp.rm(pasta, { recursive: true, force: true });
  }
}

async function sha256Arquivo(arquivo) {
  const hash = crypto.createHash('sha256');
  for await (const pedaco of fs.createReadStream(arquivo)) hash.update(pedaco);
  return hash.digest('hex');
}

async function listarArquivos(raiz, relativo = '') {
  const encontrados = [];
  const ignorados = [];
  let entradas;
  try {
    entradas = await fsp.readdir(path.join(raiz, relativo), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { encontrados, ignorados };
    throw error;
  }
  for (const entrada of entradas) {
    const rel = relativo ? `${relativo}/${entrada.name}` : entrada.name;
    const info = await fsp.lstat(path.join(raiz, rel));
    if (info.isSymbolicLink()) ignorados.push({ caminho: rel, motivo: 'link simbólico' });
    else if (info.isDirectory()) {
      const sub = await listarArquivos(raiz, rel);
      encontrados.push(...sub.encontrados);
      ignorados.push(...sub.ignorados);
    } else if (info.isFile()) encontrados.push({ caminho: rel, bytes: info.size });
    else ignorados.push({ caminho: rel, motivo: 'tipo de arquivo não suportado' });
  }
  return { encontrados, ignorados };
}

function contarDocumentosBson(buffer) {
  let total = 0;
  let posicao = 0;
  while (posicao < buffer.length) {
    if (posicao + 4 > buffer.length) throw new ErroBackup('Arquivo BSON truncado.');
    const tamanho = buffer.readInt32LE(posicao);
    if (tamanho < 5 || posicao + tamanho > buffer.length) throw new ErroBackup('Arquivo BSON inválido.');
    posicao += tamanho;
    total += 1;
  }
  return total;
}

function lerBson(arquivo) {
  const bruto = fs.readFileSync(arquivo);
  return arquivo.endsWith('.gz') ? zlib.gunzipSync(bruto) : bruto;
}

function normalizarValor(valor) {
  if (typeof valor === 'number') return valor;
  if (valor && typeof valor === 'object' && typeof valor.valueOf === 'function') {
    const numero = Number(valor.valueOf());
    if (Number.isFinite(numero)) return numero;
  }
  return valor;
}

function normalizarIndice(indice) {
  return {
    nome: indice.name,
    chave: Object.entries(indice.key || {}).map(([campo, valor]) => [campo, normalizarValor(valor)]),
    unico: Boolean(indice.unique),
    esparso: Boolean(indice.sparse),
    parcial: indice.partialFilterExpression ? EJSON.stringify(indice.partialFilterExpression, { relaxed: true }) : null,
    expiraAposSegundos: indice.expireAfterSeconds ?? null
  };
}

const ordenarIndices = (lista) => [...lista].sort((a, b) => a.nome.localeCompare(b.nome));

function normalizarOpcoes(opcoes = {}) {
  const escolhidas = {};
  for (const campo of ['validator', 'validationLevel', 'validationAction', 'capped', 'size', 'max', 'collation']) {
    if (opcoes[campo] !== undefined) escolhidas[campo] = opcoes[campo];
  }
  return JSON.parse(EJSON.stringify(escolhidas, { relaxed: true }));
}

function caminhoUploadSeguro(caminho) {
  if (typeof caminho !== 'string' || !caminho || caminho.length > 500) return false;
  if (caminho.includes('\\') || caminho.includes('\0') || caminho.includes(':')) return false;
  if (path.posix.isAbsolute(caminho) || path.win32.isAbsolute(caminho)) return false;
  return caminho.split('/').every((parte) => parte && parte !== '.' && parte !== '..');
}

const dentroDe = (raiz, alvo) => alvo === raiz || alvo.startsWith(raiz.endsWith(path.sep) ? raiz : raiz + path.sep);

async function lstatOuNulo(caminho) {
  try {
    return await fsp.lstat(caminho);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function conferirOrigemUpload(raiz, raizReal, item) {
  const partes = item.caminho.split('/');
  let atual = raiz;
  for (let i = 0; i < partes.length; i += 1) {
    atual = path.join(atual, partes[i]);
    const info = await lstatOuNulo(atual);
    const ultimo = i === partes.length - 1;
    if (!info || info.isSymbolicLink() || (ultimo ? !info.isFile() : !info.isDirectory())) {
      throw new ErroBackup(`Upload ausente, inválido ou com link no caminho do backup: ${item.caminho}`);
    }
  }
  if (!dentroDe(raizReal, await fsp.realpath(atual))) {
    throw new ErroBackup(`Upload fora da pasta uploads do backup: ${item.caminho}`);
  }
  if ((await sha256Arquivo(atual)) !== item.sha256) throw new ErroBackup(`Upload alterado no backup: ${item.caminho}`);
  return atual;
}

async function conferirDestinoUpload(raizDestino, item) {
  const infoRaiz = await lstatOuNulo(raizDestino);
  if (!infoRaiz) return;
  if (infoRaiz.isSymbolicLink() || !infoRaiz.isDirectory()) {
    throw new ErroBackup('A pasta de uploads de destino é um link ou não é uma pasta: restauração das imagens recusada.');
  }
  const partes = item.caminho.split('/');
  let atual = raizDestino;
  for (let i = 0; i < partes.length; i += 1) {
    atual = path.join(atual, partes[i]);
    const info = await lstatOuNulo(atual);
    if (!info) return;
    const ultimo = i === partes.length - 1;
    if (info.isSymbolicLink() || (ultimo ? !info.isFile() : !info.isDirectory())) {
      throw new ErroBackup(`Link ou tipo inesperado no caminho de destino do upload: ${item.caminho}`);
    }
  }
}

async function validarUploads({ pastaBackup, arquivos, pastaUploads = PASTA_UPLOADS_PADRAO }) {
  const raizOrigem = path.join(pastaBackup, 'uploads');
  for (const item of arquivos) {
    if (!caminhoUploadSeguro(item?.caminho)) throw new ErroBackup(`Caminho de upload recusado: ${JSON.stringify(item?.caminho)}`);
  }
  if (arquivos.length) {
    const infoRaiz = await lstatOuNulo(raizOrigem);
    if (!infoRaiz || infoRaiz.isSymbolicLink() || !infoRaiz.isDirectory()) {
      throw new ErroBackup('A pasta uploads do backup está ausente, é um link ou não é uma pasta.');
    }
  }
  const raizOrigemReal = arquivos.length ? await fsp.realpath(raizOrigem) : null;
  for (const item of arquivos) {
    await conferirOrigemUpload(raizOrigem, raizOrigemReal, item);
    await conferirDestinoUpload(pastaUploads, item);
  }
}

async function restaurarUploads({ pastaBackup, arquivos, pastaUploads = PASTA_UPLOADS_PADRAO, registrar = console.log }) {
  await validarUploads({ pastaBackup, arquivos, pastaUploads });
  const resultado = { criados: [], mantidos: [] };
  if (!arquivos.length) return resultado;
  if (!(await lstatOuNulo(pastaUploads))) await fsp.mkdir(pastaUploads, { recursive: true });
  const infoRaiz = await lstatOuNulo(pastaUploads);
  if (!infoRaiz || infoRaiz.isSymbolicLink() || !infoRaiz.isDirectory()) {
    throw new ErroBackup('A pasta de uploads de destino é um link ou não é uma pasta: restauração das imagens recusada.');
  }
  const raiz = await fsp.realpath(pastaUploads);
  const recusar = (item) => {
    throw new ErroBackup(`Link ou caminho fora da pasta de uploads no destino: ${item.caminho}`);
  };
  for (const item of arquivos) {
    const partes = item.caminho.split('/');
    let atual = pastaUploads;
    for (const parte of partes.slice(0, -1)) {
      atual = path.join(atual, parte);
      let info = await lstatOuNulo(atual);
      if (!info) {
        await fsp.mkdir(atual).catch((error) => {
          if (error.code !== 'EEXIST') throw error;
        });
        info = await lstatOuNulo(atual);
      }
      if (!info || info.isSymbolicLink() || !info.isDirectory()) recusar(item);
      if (!dentroDe(raiz, await fsp.realpath(atual))) recusar(item);
    }
    const destino = path.join(atual, partes.at(-1));
    const existente = await lstatOuNulo(destino);
    if (existente) {
      if (existente.isSymbolicLink() || !existente.isFile()) recusar(item);
      resultado.mantidos.push(item.caminho);
      continue;
    }
    const dados = await fsp.readFile(path.join(pastaBackup, 'uploads', ...partes));
    if (crypto.createHash('sha256').update(dados).digest('hex') !== item.sha256) {
      throw new ErroBackup(`Upload alterado no backup: ${item.caminho}`);
    }
    try {
      await fsp.writeFile(destino, dados, { flag: 'wx' });
      resultado.criados.push(item.caminho);
    } catch (error) {
      if (error.code === 'EEXIST') resultado.mantidos.push(item.caminho);
      else throw error;
    }
  }
  registrar(`Uploads: ${resultado.criados.length} criados, ${resultado.mantidos.length} já existiam e foram mantidos.`);
  return resultado;
}

function carimbo(data = new Date()) {
  const p = (v) => String(v).padStart(2, '0');
  return `${data.getFullYear()}${p(data.getMonth() + 1)}${p(data.getDate())}-${p(data.getHours())}${p(data.getMinutes())}${p(data.getSeconds())}`;
}

const ehHash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const ehDataIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v;

async function validarManifesto(pastaBackup, { agora = new Date() } = {}) {
  let manifesto;
  try {
    manifesto = JSON.parse(await fsp.readFile(path.join(pastaBackup, 'manifesto.json'), 'utf8'));
  } catch (error) {
    throw new ErroBackup(
      error.code === 'ENOENT' ? 'Manifesto não encontrado na pasta do backup.' : 'Manifesto ilegível ou corrompido.'
    );
  }
  const problema = (texto) => {
    throw new ErroBackup(`Manifesto inválido: ${texto}.`);
  };
  if (!manifesto || typeof manifesto !== 'object') problema('conteúdo não é um objeto');
  if (manifesto.formato !== FORMATO || manifesto.versao !== VERSAO_FORMATO) problema('formato ou versão desconhecidos');
  const dump = manifesto.dump || {};
  if (!ehDataIso(dump.inicio) || !ehDataIso(dump.fim) || Date.parse(dump.fim) < Date.parse(dump.inicio)) {
    problema('datas do backup ausentes ou incoerentes');
  }
  if (Date.parse(dump.fim) > agora.getTime() + 5 * 60 * 1000) problema('data do backup no futuro');
  if (typeof manifesto.origem?.base !== 'string' || !manifesto.origem.base) problema('base de origem ausente');
  if (!Array.isArray(manifesto.colecoes) || !manifesto.colecoes.length) problema('lista de coleções vazia');
  const nomes = new Set();
  for (const colecao of manifesto.colecoes) {
    if (typeof colecao?.nome !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(colecao.nome) || colecao.nome.startsWith('system.')) {
      problema('nome de coleção inválido');
    }
    if (nomes.has(colecao.nome)) problema('coleção repetida');
    nomes.add(colecao.nome);
    if (!Number.isSafeInteger(colecao.documentos) || colecao.documentos < 0) problema(`contagem inválida em ${colecao.nome}`);
    if (!Array.isArray(colecao.indices)) problema(`índices ausentes em ${colecao.nome}`);
  }
  if (!Array.isArray(manifesto.arquivos) || !manifesto.arquivos.length) problema('lista de arquivos do dump vazia');
  const prefixo = `dump/${manifesto.origem.base}/`;
  const listados = new Set();
  for (const arquivo of manifesto.arquivos) {
    if (!caminhoUploadSeguro(arquivo?.caminho) || !arquivo.caminho.startsWith('dump/') || !ehHash(arquivo.sha256)) {
      problema('entrada de arquivo do dump inválida');
    }
    listados.add(arquivo.caminho);
  }
  for (const colecao of manifesto.colecoes) {
    if (!listados.has(`${prefixo}${colecao.nome}.bson.gz`)) problema(`arquivo de dados ausente para ${colecao.nome}`);
  }
  const uploads = manifesto.uploads?.arquivos;
  if (!Array.isArray(uploads)) problema('lista de uploads ausente');
  for (const item of uploads) {
    if (!caminhoUploadSeguro(item?.caminho) || !ehHash(item.sha256)) problema(`entrada de upload inválida: ${JSON.stringify(item?.caminho)}`);
  }
  for (const arquivo of manifesto.arquivos) {
    const local = path.join(pastaBackup, ...arquivo.caminho.split('/'));
    const info = await fsp.lstat(local).catch(() => null);
    if (!info || !info.isFile()) problema(`arquivo do dump ausente: ${arquivo.caminho}`);
    if ((await sha256Arquivo(local)) !== arquivo.sha256) problema(`arquivo do dump alterado: ${arquivo.caminho}`);
  }
  const { encontrados } = await listarArquivos(path.join(pastaBackup, 'dump'));
  for (const extra of encontrados) {
    if (/\.bson(\.gz)?$/.test(extra.caminho) && !listados.has(`dump/${extra.caminho}`)) {
      problema(`arquivo de dados não registrado: dump/${extra.caminho}`);
    }
  }
  return manifesto;
}

async function gerarBackup(opcoes = {}) {
  const {
    uri,
    pastaBackups = PASTA_BACKUPS_PADRAO,
    pastaUploads = PASTA_UPLOADS_PADRAO,
    spawnFn,
    registrar = console.log,
    registrarErro = console.error,
    agora = () => new Date()
  } = opcoes;
  const info = analisarUri(uri);
  if (!info.base) throw new ErroBackup('A URI precisa indicar o nome da base (ex.: mongodb://host:27017/workly).');
  const segredos = segredosDa(uri);
  const ferramenta = { segredos, spawnFn, registrar, registrarErro };
  const versao = await versaoFerramenta('mongodump', ferramenta);

  const inicio = agora();
  await fsp.mkdir(pastaBackups, { recursive: true });
  const pasta = path.join(pastaBackups, `workly-backup-${carimbo(inicio)}`);
  await fsp.mkdir(pasta);
  registrar(`Backup da base "${info.base}" em ${pasta}`);

  await comConfigTemporaria(uriSemBase(info), (config) =>
    executarFerramenta(
      'mongodump',
      ['--config', config, '--db', info.base, '--out', path.join(pasta, 'dump'), '--gzip'],
      ferramenta
    )
  );
  const fim = agora();

  const pastaDados = path.join(pasta, 'dump', info.base);
  const { encontrados: arquivosDump } = await listarArquivos(path.join(pasta, 'dump'));
  const colecoes = [];
  for (const arquivo of arquivosDump.filter((a) => a.caminho.startsWith(`${info.base}/`) && a.caminho.endsWith('.bson.gz'))) {
    const nome = arquivo.caminho.slice(info.base.length + 1, -'.bson.gz'.length);
    if (nome.includes('/') || nome.startsWith('system.')) continue;
    const metadadosArquivo = path.join(pastaDados, `${nome}.metadata.json.gz`);
    const metadados = fs.existsSync(metadadosArquivo)
      ? EJSON.parse(zlib.gunzipSync(fs.readFileSync(metadadosArquivo)).toString('utf8'), { relaxed: true })
      : {};
    colecoes.push({
      nome,
      documentos: contarDocumentosBson(lerBson(path.join(pastaDados, `${nome}.bson.gz`))),
      indices: ordenarIndices((metadados.indexes || []).map(normalizarIndice)),
      opcoes: normalizarOpcoes(metadados.options)
    });
  }
  if (!colecoes.length) throw new ErroBackup('O mongodump não gerou nenhuma coleção. Confira o nome da base.');

  let contasRemovidas = 0;
  let ultimaRemocao = null;
  if (colecoes.some((c) => c.nome === 'usuarios')) {
    const bruto = lerBson(path.join(pastaDados, 'usuarios.bson.gz'));
    for (let posicao = 0; posicao < bruto.length; ) {
      const tamanho = bruto.readInt32LE(posicao);
      const usuario = mongoose.mongo.BSON.deserialize(bruto.subarray(posicao, posicao + tamanho), {
        promoteValues: true
      });
      posicao += tamanho;
      if (usuario.removido === true) {
        contasRemovidas += 1;
        if (usuario.removidoEm instanceof Date && (!ultimaRemocao || usuario.removidoEm > ultimaRemocao)) {
          ultimaRemocao = usuario.removidoEm;
        }
      }
    }
  }

  const arquivos = [];
  for (const arquivo of arquivosDump) {
    arquivos.push({
      caminho: `dump/${arquivo.caminho}`,
      bytes: arquivo.bytes,
      sha256: await sha256Arquivo(path.join(pasta, 'dump', ...arquivo.caminho.split('/')))
    });
  }

  const { encontrados: uploadsEncontrados, ignorados } = await listarArquivos(pastaUploads);
  const uploads = [];
  for (const item of uploadsEncontrados) {
    if (!caminhoUploadSeguro(item.caminho)) {
      ignorados.push({ caminho: item.caminho, motivo: 'nome de arquivo não suportado' });
      continue;
    }
    const origem = path.join(pastaUploads, ...item.caminho.split('/'));
    const destino = path.join(pasta, 'uploads', ...item.caminho.split('/'));
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    await fsp.copyFile(origem, destino, fs.constants.COPYFILE_EXCL);
    uploads.push({ caminho: item.caminho, bytes: item.bytes, sha256: await sha256Arquivo(destino) });
  }

  const manifesto = {
    formato: FORMATO,
    versao: VERSAO_FORMATO,
    dump: { inicio: inicio.toISOString(), fim: fim.toISOString(), ferramenta: 'mongodump', versaoFerramenta: versao, gzip: true },
    origem: { base: info.base, hosts: info.hosts },
    colecoes,
    arquivos,
    uploads: { arquivos: uploads, ignorados },
    exclusoes: { contasRemovidas, ultimaRemocao: ultimaRemocao ? ultimaRemocao.toISOString() : null },
    avisos: [
      'Contém hashes de senha e dados pessoais: guarde em local com acesso restrito e criptografado.',
      'Um dump feito com a aplicação gravando pode não ser consistente entre coleções.',
      'Restaurar este backup pode trazer de volta dados de contas excluídas depois dele.'
    ]
  };
  await fsp.writeFile(path.join(pasta, 'manifesto.json'), JSON.stringify(manifesto, null, 2), { flag: 'wx' });
  registrar(`Backup concluído: ${colecoes.length} coleções, ${uploads.length} uploads.`);
  if (ignorados.length) registrar(`Uploads ignorados: ${ignorados.length} (links simbólicos ou nomes não suportados).`);
  return { pasta, manifesto };
}

function verificarBaseDestino(base, ambiente = process.env) {
  if (!base) throw new ErroBackup('A URI precisa indicar o nome da base de destino.');
  if (/^workly_test_/.test(base)) return;
  if (ambiente[VARIAVEL_LIBERACAO] && ambiente[VARIAVEL_LIBERACAO] === base) return;
  throw new ErroBackup(
    `Restore recusado: a base "${base}" não é uma base de teste (workly_test_*). ` +
      `Para restaurar nela, defina ${VARIAVEL_LIBERACAO}=${base} conscientemente.`
  );
}

async function verificarExclusoesPosteriores(dbAtual, manifesto) {
  const motivos = [];
  const inicio = Date.parse(manifesto?.dump?.inicio);
  if (!ehDataIso(manifesto?.dump?.inicio)) motivos.push('o manifesto não tem uma data de backup confiável');
  const usuarios = await dbAtual
    .collection('usuarios')
    .find(
      { $or: [{ removido: true }, { exclusaoConfirmadaEm: { $ne: null } }, { removendoDesde: { $ne: null } }] },
      { projection: { removido: 1, removidoEm: 1, exclusaoConfirmadaEm: 1, removendoDesde: 1 } }
    )
    .toArray();
  let semData = 0;
  let posteriores = 0;
  let emAndamento = 0;
  const ids = [];
  for (const usuario of usuarios) {
    ids.push(usuario._id);
    if (usuario.removendoDesde) emAndamento += 1;
    const datas = [usuario.removidoEm, usuario.exclusaoConfirmadaEm, usuario.removendoDesde].filter(
      (d) => d instanceof Date && !Number.isNaN(d.getTime())
    );
    if (usuario.removido === true && !(usuario.removidoEm instanceof Date) && !(usuario.exclusaoConfirmadaEm instanceof Date)) {
      semData += 1;
    } else if (Number.isFinite(inicio) && datas.some((d) => d.getTime() >= inicio)) posteriores += 1;
  }
  if (posteriores) motivos.push(`${posteriores} conta(s) foram excluídas ou anonimizadas depois do backup`);
  if (semData) motivos.push(`${semData} conta(s) removidas sem data de exclusão registrada`);
  if (emAndamento) motivos.push(`${emAndamento} conta(s) com exclusão em andamento`);
  return { motivos, idsExcluidos: ids };
}

async function contasReintroduzidas(dbTemporaria, idsExcluidos) {
  if (!idsExcluidos.length) return 0;
  return dbTemporaria.collection('usuarios').countDocuments({ _id: { $in: idsExcluidos }, removido: { $ne: true } });
}

async function validarBaseTemporaria(db, manifesto) {
  const problemas = [];
  const existentes = await db.listCollections({}, { nameOnly: false }).toArray();
  const porNome = new Map(existentes.filter((c) => !c.name.startsWith('system.')).map((c) => [c.name, c]));
  for (const esperado of manifesto.colecoes) {
    const atual = porNome.get(esperado.nome);
    if (!atual) {
      problemas.push(`coleção ausente: ${esperado.nome}`);
      continue;
    }
    const colecao = db.collection(esperado.nome);
    const total = await colecao.countDocuments();
    if (total !== esperado.documentos) problemas.push(`${esperado.nome}: ${total} documentos, manifesto diz ${esperado.documentos}`);
    const indices = ordenarIndices((await colecao.indexes()).map(normalizarIndice));
    if (JSON.stringify(indices) !== JSON.stringify(ordenarIndices(esperado.indices))) {
      problemas.push(`${esperado.nome}: índices diferentes do manifesto`);
    }
    if (JSON.stringify(normalizarOpcoes(atual.options)) !== JSON.stringify(esperado.opcoes || {})) {
      problemas.push(`${esperado.nome}: validadores ou opções diferentes do manifesto`);
    }
    if (esperado.documentos > 0) {
      try {
        if (!(await colecao.findOne({}, { projection: { _id: 1 } }))) problemas.push(`${esperado.nome}: leitura sem documentos`);
      } catch {
        problemas.push(`${esperado.nome}: falha ao ler documentos`);
      }
    }
  }
  for (const nome of porNome.keys()) {
    if (!manifesto.colecoes.some((c) => c.nome === nome)) problemas.push(`coleção inesperada: ${nome}`);
  }
  return problemas;
}

class ErroTrocaParcial extends ErroBackup {
  constructor({ base, baseTemporaria, carimboTroca, trocadas, falha, pendentes, causa }) {
    const linhas = [
      `Restore interrompido no meio da troca de coleções em "${base}". A troca não é atômica: a base ficou parcial.`,
      `Já trocadas (com o conteúdo do backup): ${trocadas.map((t) => t.nome).join(', ') || 'nenhuma'}.`,
      `Falhou em: ${falha.nome} (etapa: ${falha.etapa === 'preservar' ? 'renomear a coleção atual' : 'mover a coleção restaurada'}).`,
      `Não tocadas: ${pendentes.join(', ') || 'nenhuma'}. As cópias restauradas delas continuam em "${baseTemporaria}".`,
      'Nada foi apagado. Para voltar ao estado anterior, no mongosh conectado à base de destino:'
    ];
    for (const t of trocadas) {
      linhas.push(`  db.getCollection('${t.nome}').renameCollection('${t.nome}_restaurada_${carimboTroca}')`);
      if (t.preservada) linhas.push(`  db.getCollection('${t.preservada}').renameCollection('${t.nome}')`);
    }
    if (falha.etapa === 'mover' && falha.preservada) {
      linhas.push(`  db.getCollection('${falha.preservada}').renameCollection('${falha.nome}')`);
    }
    linhas.push('Depois de conferir, apague manualmente as coleções *_restaurada_* e a base temporária, se quiser.');
    super(linhas.join('\n'));
    Object.assign(this, { base, baseTemporaria, trocadas, falha, pendentes, causa });
  }
}

async function trocarColecoes({ cliente, base, baseTemporaria, colecoes, carimboTroca, antesDeTrocar }) {
  const destino = cliente.db(base);
  const admin = cliente.db('admin');
  const existentes = new Set((await destino.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const trocadas = [];
  for (let i = 0; i < colecoes.length; i += 1) {
    const nome = colecoes[i];
    const falha = { nome, etapa: 'preservar', preservada: null };
    try {
      if (antesDeTrocar) await antesDeTrocar(nome);
      if (existentes.has(nome)) {
        const preservada = `${nome}_pre_restore_${carimboTroca}`;
        await destino.collection(nome).rename(preservada);
        falha.preservada = preservada;
      }
      falha.etapa = 'mover';
      await admin.command({ renameCollection: `${baseTemporaria}.${nome}`, to: `${base}.${nome}` });
      trocadas.push({ nome, preservada: falha.preservada });
    } catch (causa) {
      throw new ErroTrocaParcial({ base, baseTemporaria, carimboTroca, trocadas, falha, pendentes: colecoes.slice(i + 1), causa });
    }
  }
  return trocadas;
}

function verificarOpcoesRestore(opcoes, base) {
  if (opcoes.confirmar !== base) {
    throw new ErroBackup(`Restore recusado: confirme digitando o nome da base de destino (--confirmar ${base}).`);
  }
  if (opcoes.manutencaoConfirmada !== true) {
    throw new ErroBackup(
      'Restore recusado: confirme que a aplicação está parada ou em manutenção, sem gravações na base de destino ' +
        '(--manutencao-confirmada). Essa garantia é responsabilidade de quem opera.'
    );
  }
  if (opcoes.permitirReintroducao && opcoes.confirmacaoReintroducao !== CONFIRMACAO_REINTRODUCAO) {
    throw new ErroBackup(
      `Restore recusado: --permitir-reintroducao-excluidos exige também --confirmar-reintroducao "${CONFIRMACAO_REINTRODUCAO}".`
    );
  }
}

async function restaurarBackup(opcoes = {}) {
  const {
    uri,
    pasta,
    pastaUploads = PASTA_UPLOADS_PADRAO,
    incluirUploads = false,
    spawnFn,
    registrar = console.log,
    registrarErro = console.error,
    ambiente = process.env,
    agora = () => new Date(),
    antesDeTrocar
  } = opcoes;
  const info = analisarUri(uri);
  const base = info.base;
  verificarBaseDestino(base, ambiente);
  verificarOpcoesRestore(opcoes, base);
  if (!pasta) throw new ErroBackup('Informe a pasta do backup.');
  const pastaBackup = path.resolve(pasta);
  const manifesto = await validarManifesto(pastaBackup, { agora: agora() });
  if (incluirUploads) await validarUploads({ pastaBackup, arquivos: manifesto.uploads.arquivos, pastaUploads });
  const reintroducaoPermitida = opcoes.permitirReintroducao === true;

  const segredos = segredosDa(uri);
  const ferramenta = { segredos, spawnFn, registrar, registrarErro };
  const versao = await versaoFerramenta('mongorestore', ferramenta);

  const cliente = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await cliente.connect();
  let baseTemporaria = null;
  let criadaPorEstaExecucao = false;
  let trocaIniciada = false;
  try {
    const destino = cliente.db(base);
    const { motivos, idsExcluidos } = await verificarExclusoesPosteriores(destino, manifesto);
    if (motivos.length && !reintroducaoPermitida) {
      throw new ErroBackup(
        `Restore recusado: ele pode trazer de volta dados de contas excluídas (${motivos.join('; ')}). ` +
          'A exceção --permitir-reintroducao-excluidos pode restaurar dados de contas já excluídas.'
      );
    }
    if (motivos.length) registrarErro(`ATENÇÃO: restaurando mesmo assim (${motivos.join('; ')}).`);

    const carimboTroca = carimbo(agora());
    baseTemporaria =
      opcoes.baseTemporaria || `${base.slice(0, 40)}_rtmp_${carimboTroca.replace('-', '')}_${crypto.randomBytes(4).toString('hex')}`;
    const temporaria = cliente.db(baseTemporaria);
    const vazia = async () => !(await temporaria.listCollections({}, { nameOnly: true }).toArray()).length;
    if (!(await vazia())) {
      throw new ErroBackup(
        `A base temporária ${baseTemporaria} já existe e não foi criada por esta execução: nada foi apagado nem alterado.`
      );
    }
    registrar(`Restaurando na base temporária ${baseTemporaria} (mongorestore ${versao})...`);
    const origem = manifesto.origem.base;
    try {
      await comConfigTemporaria(uriSemBase(info), (config) =>
        executarFerramenta(
          'mongorestore',
          [
            '--config', config,
            '--gzip',
            '--stopOnError',
            '--nsInclude', `${origem}.*`,
            '--nsFrom', `${origem}.*`,
            '--nsTo', `${baseTemporaria}.*`,
            '--dir', path.join(pastaBackup, 'dump')
          ],
          ferramenta
        )
      );
    } finally {
      criadaPorEstaExecucao = !(await vazia().catch(() => true));
    }

    const problemas = await validarBaseTemporaria(temporaria, manifesto);
    if (problemas.length) {
      throw new ErroBackup(`A cópia restaurada não confere com o manifesto: ${problemas.join('; ')}. O destino não foi alterado.`);
    }
    const reintroduzidas = await contasReintroduzidas(temporaria, idsExcluidos);
    if (reintroduzidas && !reintroducaoPermitida) {
      throw new ErroBackup(
        `Restore recusado: ${reintroduzidas} conta(s) hoje excluídas voltariam sem anonimização. O destino não foi alterado.`
      );
    }

    trocaIniciada = true;
    const colecoes = manifesto.colecoes.map((c) => c.nome).sort();
    const trocadas = await trocarColecoes({ cliente, base, baseTemporaria, colecoes, carimboTroca, antesDeTrocar });
    if (criadaPorEstaExecucao && (await vazia())) await temporaria.dropDatabase();
    const preservadas = trocadas.filter((t) => t.preservada).map((t) => t.preservada);
    registrar(`Restore concluído em "${base}": ${trocadas.length} coleções trocadas.`);
    if (preservadas.length) {
      registrar(`Coleções anteriores preservadas (apague manualmente depois de conferir): ${preservadas.join(', ')}`);
    }
    const extras = (await destino.listCollections({}, { nameOnly: true }).toArray())
      .map((c) => c.name)
      .filter((n) => !colecoes.includes(n) && !n.includes('_pre_restore_') && !n.startsWith('system.'));
    if (extras.length) registrar(`Coleções do destino fora do backup, mantidas como estavam: ${extras.join(', ')}`);

    let uploads = null;
    if (incluirUploads) uploads = await restaurarUploads({ pastaBackup, arquivos: manifesto.uploads.arquivos, pastaUploads, registrar });
    return { base, trocadas, preservadas, uploads };
  } catch (error) {
    if (baseTemporaria && criadaPorEstaExecucao && !trocaIniciada) {
      await cliente.db(baseTemporaria).dropDatabase().catch(() => {
        registrarErro(`Não foi possível remover a base temporária ${baseTemporaria}; remova manualmente.`);
      });
    } else if (baseTemporaria && !criadaPorEstaExecucao) {
      registrarErro(`A base temporária ${baseTemporaria} não foi criada por esta execução e não foi tocada.`);
    }
    throw error;
  } finally {
    await cliente.close();
  }
}

module.exports = {
  CONFIRMACAO_REINTRODUCAO,
  VARIAVEL_LIBERACAO,
  ErroBackup,
  ErroTrocaParcial,
  analisarUri,
  uriSemBase,
  segredosDa,
  mascarar,
  executarFerramenta,
  versaoFerramenta,
  comConfigTemporaria,
  caminhoUploadSeguro,
  restaurarUploads,
  validarManifesto,
  verificarBaseDestino,
  verificarExclusoesPosteriores,
  contasReintroduzidas,
  validarBaseTemporaria,
  trocarColecoes,
  normalizarIndice,
  gerarBackup,
  restaurarBackup
};

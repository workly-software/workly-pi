const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { erro } = require('../utils/apiResponse');

const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const TIPOS_DECLARADOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);

function detectarImagem(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  return null;
}

function criarUpload(pasta, prefixo) {
  const destino = path.resolve(__dirname, `../../uploads/${pasta}`);
  fs.mkdirSync(destino, { recursive: true });

  const receber = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: TAMANHO_MAXIMO, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!TIPOS_DECLARADOS.has(file.mimetype)) {
        return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'tipo'));
      }
      callback(null, true);
    }
  });

  return {
    single(campo) {
      const etapa = receber.single(campo);
      return (req, res, next) => {
        etapa(req, res, (falha) => {
          if (falha) {
            const mensagem =
              falha.code === 'LIMIT_FILE_SIZE'
                ? 'A imagem deve ter no máximo 5 MB.'
                : 'Envie uma imagem JPG, PNG ou WEBP válida.';
            return erro(res, 400, mensagem);
          }
          if (!req.file) return next();

          const extensao = detectarImagem(req.file.buffer);
          if (!extensao) {
            req.file = undefined;
            return erro(res, 400, 'Envie uma imagem JPG, PNG ou WEBP válida.');
          }

          const idUsuario = String(req.user?.id_usuario || req.user?.idUsuario || 'anon').replace(
            /[^a-f\d]/gi,
            ''
          );
          const nome = `${prefixo}_${idUsuario}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${extensao}`;
          const caminho = path.join(destino, nome);
          fs.writeFile(caminho, req.file.buffer, { flag: 'wx' }, (falhaEscrita) => {
            if (falhaEscrita) return next(falhaEscrita);
            req.file = {
              ...req.file,
              buffer: undefined,
              filename: nome,
              path: caminho,
              destination: destino,
              mimetype: extensao === 'jpg' ? 'image/jpeg' : `image/${extensao}`
            };
            next();
          });
        });
      };
    }
  };
}

module.exports = {
  detectarImagem,
  uploadPerfil: criarUpload('perfis', 'perfil'),
  uploadServico: criarUpload('servicos', 'servico')
};

const express = require('express');
const controller = require('../controllers/usuarioController');
const autenticacaoMiddleware = require('../middleware/autenticacaoMiddleware');
const { uploadPerfil } = require('../middleware/uploadArquivoMiddleware');

const router = express.Router();

router.get('/perfil', autenticacaoMiddleware, controller.buscarPerfil);

router.get('/publico/:id', controller.buscarPerfilPublico);

router.put('/perfil', autenticacaoMiddleware, controller.atualizarPerfil);

router.patch('/tipo-conta', autenticacaoMiddleware, controller.alterarTipoConta);

router.post(
  '/perfil/foto',
  autenticacaoMiddleware,
  uploadPerfil.single('nova_foto'),
  controller.atualizarFoto
);

router.put('/perfil/senha', autenticacaoMiddleware, controller.atualizarSenha);

router.delete('/perfil', autenticacaoMiddleware, controller.excluirPerfil);

router.get('/profile', autenticacaoMiddleware, controller.buscarPerfil);

router.put('/profile', autenticacaoMiddleware, controller.atualizarPerfil);

router.patch('/account-type', autenticacaoMiddleware, controller.alterarTipoConta);

router.post(
  '/profile/photo',
  autenticacaoMiddleware,
  uploadPerfil.single('nova_foto'),
  controller.atualizarFoto
);

router.put('/profile/password', autenticacaoMiddleware, controller.atualizarSenha);

router.delete('/profile', autenticacaoMiddleware, controller.excluirPerfil);

module.exports = router;

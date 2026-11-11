const express = require('express');
const controller = require('../controllers/notificacaoController');
const auth = require('../middleware/autenticacaoMiddleware');

const router = express.Router();

router.get('/', auth, controller.listar);

router.get('/nao-lidas', auth, controller.contarNaoLidas);

router.patch('/todas-lidas', auth, controller.marcarTodasLidas);

router.patch('/contexto/lidas', auth, controller.marcarContextoLidas);

router.patch('/:id/lida', auth, controller.marcarLida);

router.delete('/:id', auth, controller.remover);

module.exports = router;

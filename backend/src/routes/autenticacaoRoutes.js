const express = require('express');
const controller = require('../controllers/autenticacaoController');

const router = express.Router();

router.post('/cadastro', controller.cadastrar);

router.post('/login', controller.entrar);

router.post('/logout', controller.sair);

router.post('/recuperar-senha', controller.solicitarRedefinicao);

router.post('/redefinir-senha', controller.redefinirSenha);

router.post('/register', controller.cadastrar);

module.exports = router;

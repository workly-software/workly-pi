const express = require('express');
const controller = require('../controllers/autenticacaoController');

const router = express.Router();

// cadastro e login.
router.post('/cadastro', controller.cadastrar);

router.post('/login', controller.entrar);

router.post('/logout', controller.sair);

// recuperação de senha (limites por IP e por e-mail aplicados em app.js).
router.post('/recuperar-senha', controller.solicitarRedefinicao);

router.post('/redefinir-senha', controller.redefinirSenha);

// alias antigos para não quebrar integrações já existentes.
router.post('/register', controller.cadastrar);

module.exports = router;

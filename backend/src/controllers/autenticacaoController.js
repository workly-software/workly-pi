const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');
const { emitirToken, verificarToken } = require('../utils/tokenSessao');
const SessaoRevogada = require('../models/SessaoRevogada');
const {
  definirCookieSessao,
  limparCookieSessao,
  lerCookieSessao,
  requisicaoDoAplicativo
} = require('../utils/cookieSessao');
const { mapUsuario } = require('../utils/mapeadoresResposta');
const { sucesso, erro } = require('../utils/apiResponse');
const { obterCampo, normalizarTipoConta, idMongoValido } = require('../utils/requisicaoUtils');
const { normalizarCpf, motivoCpfInvalido } = require('../utils/cpfUtils');
const recuperacaoSenha = require('../services/recuperacaoSenhaService');
const { motivoNovaSenhaInvalida } = require('../utils/senhaUtils');

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MENSAGEM_CPF_INDISPONIVEL =
  'Não foi possível concluir o cadastro com os dados informados. Confira as informações ou, se já possui uma conta, tente entrar ou recuperar sua senha.';

exports.cadastrar = async (req, res) => {
  try {
    const nome = obterCampo(req.body, ['nome']);
    const email = obterCampo(req.body, ['email']);
    const senha = obterCampo(req.body, ['senha']);
    const cpf = obterCampo(req.body, ['cpf']);
    const telefone = obterCampo(req.body, ['telefone']);
    const tipoContaRecebido = obterCampo(req.body, ['tipoConta', 'tipo_conta']);
    const areaAtuacaoRecebida = obterCampo(req.body, ['areaAtuacao', 'area_atuacao']);

    if (!nome || !email || !senha || !cpf || !tipoContaRecebido) {
      return erro(res, 400, 'Todos os campos obrigatórios devem ser preenchidos.');
    }

    if (!REGEX_EMAIL.test(String(email).trim())) {
      return erro(res, 400, 'Informe um endereço de e-mail válido.');
    }

    const erroSenha = motivoNovaSenhaInvalida(senha);
    if (erroSenha) return erro(res, 400, erroSenha);

    const erroCpf = motivoCpfInvalido(cpf);
    const cpfNormalizado = normalizarCpf(cpf);
    if (erroCpf) {
      return erro(res, 400, erroCpf);
    }

    const tipoContaNormalizado = normalizarTipoConta(tipoContaRecebido);
    if (!tipoContaNormalizado) {
      return erro(res, 400, 'Tipo de conta inválido.');
    }

    if (tipoContaNormalizado === 'Freelancer' && !areaAtuacaoRecebida) {
      return erro(res, 400, 'Área de atuação é obrigatória para freelancers.');
    }

    const [emailExistente, cpfExistente] = await Promise.all([
      Usuario.findOne({ email: String(email).toLowerCase().trim() }),
      Usuario.findOne({ cpf: cpfNormalizado })
    ]);

    if (emailExistente) return erro(res, 409, 'Já existe um usuário cadastrado com este e-mail.');
    if (cpfExistente) return erro(res, 409, MENSAGEM_CPF_INDISPONIVEL);

    if (!(await Usuario.protecaoCadastroDisponivel())) {
      return erro(res, 503, 'Novos cadastros estão temporariamente indisponíveis. Tente novamente mais tarde.');
    }

    await Usuario.create({
      nome: String(nome).trim(),
      email: String(email).toLowerCase().trim(),
      senha: await bcrypt.hash(String(senha), 10),
      cpf: cpfNormalizado,
      telefone: telefone ? String(telefone).trim() : '',
      tipoConta: tipoContaNormalizado,
      areaAtuacao:
        tipoContaNormalizado === 'Freelancer' ? String(areaAtuacaoRecebida || '').trim() : ''
    });

    return sucesso(res, 201, 'Cadastro realizado com sucesso!');
  } catch (error) {
    if (error?.code === 11000) {
      if (error.keyPattern?.cpf || error.keyValue?.cpf) {
        return erro(res, 409, MENSAGEM_CPF_INDISPONIVEL);
      }
      if (error.keyPattern?.email || error.keyValue?.email) {
        return erro(res, 409, 'Já existe um usuário cadastrado com este e-mail.');
      }
    }

    console.error(error);
    return erro(res, 500, 'Erro ao cadastrar usuário.');
  }
};

exports.entrar = async (req, res) => {
  try {
    if (!requisicaoDoAplicativo(req)) return erro(res, 403, 'Requisição recusada.');
    const email = obterCampo(req.body, ['email']);
    const senha = obterCampo(req.body, ['senha']);

    if (!email || !senha) {
      return erro(res, 400, 'E-mail e senha são obrigatórios.');
    }

    const usuario = await Usuario.findOne({ email: String(email).toLowerCase().trim() });
    const ativo = usuario && !usuario.removido && !usuario.exclusaoConfirmadaEm;
    const senhaCorreta = ativo ? await bcrypt.compare(String(senha), usuario.senha).catch(() => false) : false;

    if (!ativo || !senhaCorreta) {
      return erro(res, 401, 'Credenciais inválidas.');
    }

    definirCookieSessao(req, res, emitirToken(usuario));

    return sucesso(res, 200, 'Login realizado com sucesso.', null, {
      user: mapUsuario(req, usuario)
    });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro no servidor.');
  }
};

exports.sair = async (req, res) => {
  try {
    const cabecalho = req.header('Authorization');
    const token = cabecalho ? cabecalho.replace(/^Bearer\s+/i, '').trim() : lerCookieSessao(req);
    if (!cabecalho && !requisicaoDoAplicativo(req)) return erro(res, 403, 'Requisição recusada.');
    let dados = null;
    try {
      dados = token ? verificarToken(token) : null;
    } catch {
      dados = null;
    }
    if (dados?.jti && dados.exp) {
      await SessaoRevogada.updateOne(
        { jti: dados.jti },
        { $setOnInsert: { jti: dados.jti, expiraEm: new Date(dados.exp * 1000) } },
        { upsert: true }
      );
    } else if (idMongoValido(dados?.id_usuario)) {
      const versao = Number(dados.sv || 0);
      await Usuario.updateOne(
        {
          _id: dados.id_usuario,
          ...(versao === 0 ? { $or: [{ versaoSessao: 0 }, { versaoSessao: { $exists: false } }] } : { versaoSessao: versao })
        },
        { $inc: { versaoSessao: 1 } }
      );
    }
    limparCookieSessao(req, res);
    return sucesso(res, 200, 'Sessão encerrada.');
  } catch (error) {
    console.error('Erro ao encerrar sessão:', error?.message || error);
    return erro(res, 500, 'Erro no servidor.');
  }
};

exports.solicitarRedefinicao = async (req, res) => {
  try {
    const { status, mensagem } = await recuperacaoSenha.solicitar(req.body?.email);
    return status === 200 ? sucesso(res, 200, mensagem) : erro(res, status, mensagem);
  } catch (error) {
    console.error('Erro ao solicitar redefinição de senha:', error?.message || error);
    return erro(res, 500, 'Erro no servidor.');
  }
};

exports.redefinirSenha = async (req, res) => {
  try {
    const { token, novaSenha, confirmarSenha } = req.body || {};
    const { status, mensagem } = await recuperacaoSenha.redefinir(token, novaSenha, confirmarSenha);
    return status === 200 ? sucesso(res, 200, mensagem) : erro(res, status, mensagem);
  } catch (error) {
    console.error('Erro ao redefinir senha:', error?.message || error);
    return erro(res, 500, 'Erro no servidor.');
  }
};

exports.register = exports.cadastrar;

exports.login = exports.entrar;

const Usuario = require('../models/Usuario');
const { mapServico } = require('../utils/mapeadoresResposta');
const { sucesso, erro } = require('../utils/apiResponse');
const { obterCampo, idMongoValido } = require('../utils/requisicaoUtils');
const { removerArquivoSeExistir } = require('../utils/arquivoUtils');
const servicoService = require('../services/servicoService');

exports.listarTodos = async (req, res) => {
  try {
    const { servicos, pagination } = await servicoService.listar(req.query);
    return sucesso(
      res,
      200,
      'Serviços carregados com sucesso.',
      servicos.map((servico) => mapServico(req, servico)),
      { pagination }
    );
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao buscar serviços.');
  }
};

exports.buscarPorCategoria = async (req, res) => {
  try {
    const resultado = await servicoService.buscarPorCategoria(req.params.id, req.query);
    if (!resultado) {
      return sucesso(res, 200, 'Categoria não encontrada.', []);
    }

    return sucesso(
      res,
      200,
      'Serviços da categoria carregados com sucesso.',
      resultado.servicos.map((servico) => mapServico(req, servico)),
      { pagination: resultado.pagination }
    );
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao buscar serviços por categoria.');
  }
};

exports.criar = async (req, res) => {
  let criacaoConcluida = false;
  try {
    const usuario = await Usuario.findById(req.user.id_usuario);
    if (!usuario || usuario.tipoConta !== 'Freelancer') {
      if (req.file) removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
      return erro(res, 403, 'Acesso negado. Este usuário não é um freelancer.');
    }

    const nome = obterCampo(req.body, ['nome']);
    const descricao = obterCampo(req.body, ['descricao']);
    const preco = obterCampo(req.body, ['preco']);
    const valorCombinar =
      obterCampo(req.body, ['valorCombinar', 'priceByContact']) === 'on' ||
      obterCampo(req.body, ['valorCombinar', 'priceByContact']) === 'true' ||
      obterCampo(req.body, ['valorCombinar', 'priceByContact']) === true;
    const categoriaIdRecebido = obterCampo(req.body, ['categoriaId', 'genero_id']);
    const extra = obterCampo(req.body, ['extra']);

    const imagemServico = req.file
      ? `/uploads/servicos/${req.file.filename}`
      : '/uploads/servicos/servico_padrao.svg';
    const resultado = await servicoService.criar({
      nome,
      descricao,
      preco,
      valorCombinar,
      extra,
      imagemServico,
      categoriaIdRecebido,
      freelancerId: usuario._id
    });

    if (resultado.erro === 'campos_incompletos') {
      if (req.file) removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
      return erro(res, 400, 'Campos incompletos.');
    }

    if (resultado.erro === 'preco_invalido') {
      if (req.file) removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
      return erro(res, 400, 'Informe um preço válido maior que zero.');
    }

    if (resultado.erro === 'categoria_invalida') {
      if (req.file) removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
      return erro(res, 400, 'Categoria inválida.');
    }

    if (resultado.erro === 'conta_indisponivel') {
      if (req.file) removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
      return erro(res, 409, 'Esta conta não está disponível para publicar serviços.');
    }
    criacaoConcluida = true;
    const servicoComResumo = await servicoService.buscarPorId(resultado.servico._id);
    return sucesso(res, 201, 'Serviço criado com sucesso!', mapServico(req, servicoComResumo));
  } catch (error) {
    console.error(error);
    if (req.file && !criacaoConcluida)
      removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
    return erro(res, 500, 'Erro ao criar o serviço.');
  }
};

exports.buscarPorId = async (req, res) => {
  try {
    if (!idMongoValido(req.params.id)) return erro(res, 400, 'Identificador de serviço inválido.');
    const servico = await servicoService.buscarPorId(req.params.id);
    if (!servico) {
      return erro(res, 404, 'Serviço não encontrado.');
    }

    return sucesso(res, 200, 'Serviço carregado com sucesso.', mapServico(req, servico));
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao buscar serviço.');
  }
};

async function carregarServicoDoFreelancer(req, res) {
  if (!idMongoValido(req.params.id)) {
    if (req.file) removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
    erro(res, 400, 'Identificador de serviço inválido.');
    return null;
  }
  const servico = await servicoService.buscarDocumentoPorId(req.params.id);
  if (!servico) {
    if (req.file) removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
    erro(res, 404, 'Serviço não encontrado.');
    return null;
  }
  const userId = req.user.id_usuario || req.user.idUsuario;
  if (String(servico.freelancer?._id || servico.freelancer) !== String(userId)) {
    if (req.file) removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
    erro(res, 403, 'Você só pode editar serviços criados por você.');
    return null;
  }
  return servico;
}

exports.atualizar = async (req, res) => {
  let atualizacaoConcluida = false;
  try {
    const servico = await carregarServicoDoFreelancer(req, res);
    if (!servico) return;

    const nome = obterCampo(req.body, ['nome']);
    const descricao = obterCampo(req.body, ['descricao']);
    const preco = obterCampo(req.body, ['preco']);
    const valorCombinarCampo = obterCampo(req.body, ['valorCombinar', 'priceByContact']);
    const categoriaIdRecebido = obterCampo(req.body, ['categoriaId', 'genero_id']);
    const extra = obterCampo(req.body, ['extra']);

    const resultado = await servicoService.aplicarAtualizacao(servico, {
      nome,
      descricao,
      preco,
      valorCombinarCampo,
      categoriaIdRecebido,
      extra,
      imagemServico: req.file ? `/uploads/servicos/${req.file.filename}` : null
    });

    if (resultado.erro === 'categoria_invalida') {
      if (req.file) removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
      return erro(res, 400, 'Categoria inválida.');
    }

    if (resultado.erro === 'preco_invalido') {
      if (req.file) removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
      return erro(res, 400, 'Informe um preço válido maior que zero.');
    }

    if (resultado.erro === 'preco_ou_valor_combinar_obrigatorio') {
      if (req.file) removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
      return erro(res, 400, 'Informe um preço válido ou marque valor a combinar.');
    }

    const imagemAnterior = resultado.imagemAnterior;
    const servicoSalvo = await servicoService.salvarAtualizacao(servico);
    atualizacaoConcluida = true;
    if (req.file && imagemAnterior && !String(imagemAnterior).includes('servico_padrao.svg')) {
      removerArquivoSeExistir(imagemAnterior);
    }
    const comResumo = await servicoService.buscarPorId(servicoSalvo._id);
    return sucesso(res, 200, 'Serviço atualizado com sucesso.', mapServico(req, comResumo));
  } catch (error) {
    console.error(error);
    if (req.file && !atualizacaoConcluida)
      removerArquivoSeExistir(`/uploads/servicos/${req.file.filename}`);
    return erro(res, 500, 'Erro ao atualizar serviço.');
  }
};

exports.remover = async (req, res) => {
  try {
    const servico = await carregarServicoDoFreelancer(req, res);
    if (!servico) return;
    const resultado = await servicoService.remover(servico);
    if (resultado.indisponivel) return erro(res, 409, 'Este anúncio já foi alterado ou está sendo retirado. Atualize a página.');
    if (resultado.contratosAtivos)
      return erro(res, 400, 'Não é possível remover um serviço com contratos ativos.');
    return sucesso(res, 200, 'Serviço removido com sucesso.', { idServico: req.params.id });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao remover serviço.');
  }
};

exports.getAll = exports.listarTodos;

exports.getByCategoria = exports.buscarPorCategoria;

exports.getById = exports.buscarPorId;

exports.create = exports.criar;

exports.update = exports.atualizar;

exports.delete = exports.remover;

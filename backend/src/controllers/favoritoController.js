const Favorito = require('../models/Favorito');
const Servico = require('../models/Servico');
const { sucesso, erro } = require('../utils/apiResponse');
const { mapFavorito } = require('../utils/mapeadoresResposta');
const { idMongoValido } = require('../utils/requisicaoUtils');

function usuarioId(req) {
  return req.user.id_usuario || req.user.idUsuario;
}

function popular(query) {
  return query.populate({
    path: 'servico',
    populate: [{ path: 'categoria' }, { path: 'freelancer' }]
  });
}

exports.listar = async (req, res) => {
  try {
    const favoritos = await popular(
      Favorito.find({ usuario: usuarioId(req) }).sort({ createdAt: -1 })
    );
    return sucesso(
      res,
      200,
      'Favoritos carregados.',
      favoritos.filter((f) => f.servico && !f.servico.removido).map((f) => mapFavorito(req, f))
    );
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao buscar favoritos.');
  }
};

exports.verificar = async (req, res) => {
  try {
    if (!idMongoValido(req.params.servicoId))
      return erro(res, 400, 'Identificador de serviço inválido.');
    const favorito = await Favorito.findOne({
      usuario: usuarioId(req),
      servico: req.params.servicoId
    });
    return sucesso(res, 200, 'Status carregado.', { favoritado: Boolean(favorito) });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao verificar favorito.');
  }
};

exports.criar = async (req, res) => {
  try {
    const userId = usuarioId(req);
    const { servicoId } = req.body;

    if (!servicoId) return erro(res, 400, 'Serviço não informado.');
    if (!idMongoValido(servicoId)) return erro(res, 400, 'Identificador de serviço inválido.');

    const servico = await Servico.findById(servicoId);
    if (!servico || servico.removido) return erro(res, 404, 'Serviço não encontrado.');

    await Favorito.updateOne(
      { usuario: userId, servico: servicoId },
      { usuario: userId, servico: servicoId },
      { upsert: true }
    );

    const favorito = await popular(Favorito.findOne({ usuario: userId, servico: servicoId }));
    return sucesso(res, 201, 'Serviço adicionado aos favoritos.', mapFavorito(req, favorito));
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao favoritar serviço.');
  }
};

exports.removerPorServico = async (req, res) => {
  try {
    if (!idMongoValido(req.params.servicoId))
      return erro(res, 400, 'Identificador de serviço inválido.');
    await Favorito.deleteOne({ usuario: usuarioId(req), servico: req.params.servicoId });
    return sucesso(res, 200, 'Serviço removido dos favoritos.', { removido: true });
  } catch (error) {
    console.error(error);
    return erro(res, 500, 'Erro ao remover favorito.');
  }
};

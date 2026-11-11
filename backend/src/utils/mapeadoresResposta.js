const { estadoAcordo, vezNaNegociacao } = require('./acordoContrato');

function montarUrlImagem(req, caminho) {
  if (!caminho) return '';
  if (caminho.startsWith('http')) return caminho;
  return `${req.protocol}://${req.get('host')}${caminho}`;
}

function montarBaseUsuario(req, usuario) {
  const base = {
    idUsuario: usuario._id.toString(),
    nome: usuario.nome,
    email: usuario.email,
    cpf: usuario.cpf,
    telefone: usuario.telefone || '',
    tipoConta: usuario.tipoConta,
    areaAtuacao: usuario.areaAtuacao || '',
    fotoPerfil: montarUrlImagem(req, usuario.fotoPerfil || '/uploads/perfis/perfil_padrao.svg'),
    tituloProfissional: usuario.tituloProfissional || '',
    bio: usuario.bio || '',
    localizacao: usuario.localizacao || '',
    site: usuario.site || '',
    linkedin: usuario.linkedin || '',
    github: usuario.github || '',
    instagram: usuario.instagram || '',
    portfolioTitulo: usuario.portfolioTitulo || '',
    portfolioDescricao: usuario.portfolioDescricao || '',
    portfolioUrl: usuario.portfolioUrl || '',
    disponibilidade: usuario.disponibilidade || '',
    precoHora: usuario.precoHora || '',
    metodoPagamento: usuario.metodoPagamento || '',
    chavePix: usuario.chavePix || '',
    banco: usuario.banco || '',
    notificacoesEmail: usuario.notificacoesEmail !== false,
    notificacoesPropostas: usuario.notificacoesPropostas !== false,
    notificacoesMarketing: Boolean(usuario.notificacoesMarketing),
    avaliacaoMedia: Number(usuario.avaliacaoMedia || 0),
    totalAvaliacoes: Number(usuario.totalAvaliacoes || 0),
    createdAt: usuario.createdAt,
    updatedAt: usuario.updatedAt
  };

  return {
    ...base,
    id_usuario: base.idUsuario,
    tipo_conta: base.tipoConta,
    area_atuacao: base.areaAtuacao,
    foto_perfil: base.fotoPerfil,
    professional_title: base.tituloProfissional,
    location: base.localizacao,
    website: base.site,
    portfolio_titulo: base.portfolioTitulo,
    portfolio_descricao: base.portfolioDescricao,
    portfolio_url: base.portfolioUrl,
    preco_hora: base.precoHora,
    metodo_pagamento: base.metodoPagamento,
    chave_pix: base.chavePix,
    notificacoes_email: base.notificacoesEmail,
    notificacoes_propostas: base.notificacoesPropostas,
    notificacoes_marketing: base.notificacoesMarketing,
    avaliacao_media: base.avaliacaoMedia,
    total_avaliacoes: base.totalAvaliacoes,
    created_at: base.createdAt,
    updated_at: base.updatedAt
  };
}

function removerDadosSensiveis(usuarioMapeado) {
  if (!usuarioMapeado) return null;
  const publico = { ...usuarioMapeado };

  [
    'email',
    'cpf',
    'telefone',
    'metodoPagamento',
    'metodo_pagamento',
    'chavePix',
    'chave_pix',
    'banco',
    'notificacoesEmail',
    'notificacoes_email',
    'notificacoesPropostas',
    'notificacoes_propostas',
    'notificacoesMarketing',
    'notificacoes_marketing'
  ].forEach((campo) => delete publico[campo]);

  return publico;
}

function mapUsuario(req, usuario) {
  return montarBaseUsuario(req, usuario);
}

function mapUsuarioPublico(req, usuario) {
  return { ...removerDadosSensiveis(montarBaseUsuario(req, usuario)), removido: Boolean(usuario?.removido) };
}

const mapUsuarioPrivado = mapUsuario;

function mapServico(req, servico) {
  const freelancer = servico.freelancer || {};
  const categoria = servico.categoria || {};

  const base = {
    idServico: servico._id.toString(),
    nome: servico.nome,
    descricao: servico.descricao,
    preco: servico.preco,
    precoNegociavel: false,
    valorCombinar: Boolean(servico.valorCombinar),
    extra: servico.extra || '',
    imagemServico: montarUrlImagem(
      req,
      servico.imagemServico || '/uploads/servicos/servico_padrao.svg'
    ),
    categoriaId: categoria.legacyId || null,
    nomeCategoria: categoria.nome || '',
    slugCategoria: categoria.slug || '',
    idUsuario: freelancer._id ? freelancer._id.toString() : null,
    nomeFreelancer: freelancer.nome || '',
    fotoPerfil: montarUrlImagem(req, freelancer.fotoPerfil || '/uploads/perfis/perfil_padrao.svg'),
    avaliacaoMediaFreelancer: Number(freelancer.avaliacaoMedia || 0),
    totalAvaliacoesFreelancer: Number(freelancer.totalAvaliacoes || 0),
    avaliacaoMediaServico: Number(servico.avaliacaoMediaServico || 0),
    totalAvaliacoesServico: Number(servico.totalAvaliacoesServico || 0),
    createdAt: servico.createdAt,
    updatedAt: servico.updatedAt
  };

  return {
    ...base,
    id_servico: base.idServico,
    id: base.idServico,
    imagem_servico: base.imagemServico,
    genero_id: base.categoriaId,
    nome_genero: base.nomeCategoria,
    id_usuario: base.idUsuario,
    nome_freelancer: base.nomeFreelancer,
    foto_perfil: base.fotoPerfil,
    avaliacao_media_freelancer: base.avaliacaoMediaFreelancer,
    total_avaliacoes_freelancer: base.totalAvaliacoesFreelancer,
    avaliacao_media_servico: base.avaliacaoMediaServico,
    total_avaliacoes_servico: base.totalAvaliacoesServico,
    mediaAvaliacoes: base.totalAvaliacoesServico > 0 ? base.avaliacaoMediaServico : 0,
    totalAvaliacoes: base.totalAvaliacoesServico,
    created_at: base.createdAt,
    updated_at: base.updatedAt,
    preco_negociavel: base.precoNegociavel,
    valor_combinar: base.valorCombinar
  };
}

function mapContrato(req, contrato, usuarioAtualId = null) {
  const servico = contrato.servico || {};
  const statusNormalizado = contrato.status === 'encerrado' ? 'concluido' : contrato.status;
  const cliente = contrato.cliente || {};
  const freelancer = contrato.freelancer || servico.freelancer || {};
  const acordo = estadoAcordo(contrato);
  const base = {
    idContrato: contrato._id.toString(),
    idServico: servico._id ? servico._id.toString() : '',
    nomeServico: servico.nome || 'Serviço removido',
    servicoDisponivel: Boolean(servico._id) && !servico.removido,
    descricaoServico: servico.descricao || '',
    imagemServico: montarUrlImagem(
      req,
      servico.imagemServico || '/uploads/servicos/servico_padrao.svg'
    ),
    preco: acordo.valorAcordado,
    precoProposto: acordo.valorEmNegociacao,
    negociacao: {
      estado: acordo.estado,
      vez: vezNaNegociacao(contrato, acordo),
      valorAcordado: acordo.valorAcordado,
      valorEmNegociacao: acordo.valorEmNegociacao
    },
    historico: (contrato.historico || []).map((evento) => ({
      tipo: evento.tipo,
      papel: evento.papel,
      valor: evento.valor ?? null,
      justificativa: evento.justificativa || '',
      data: evento.data
    })),
    mensagem: contrato.mensagem || '',
    detalhesPedido: contrato.detalhesPedido || '',
    prazoDesejado: contrato.prazoDesejado || '',
    referencias: contrato.referencias || '',
    tipoContratacao:
      contrato.tipoContratacao === 'negociavel' ? 'fixo' : contrato.tipoContratacao || 'fixo',
    status: statusNormalizado,
    papel: usuarioAtualId
      ? String(cliente._id) === String(usuarioAtualId)
        ? 'cliente'
        : 'freelancer'
      : '',
    cliente: cliente._id ? mapUsuarioPublico(req, cliente) : null,
    freelancer: freelancer._id ? mapUsuarioPublico(req, freelancer) : null,
    categoria: servico.categoria?.nome || '',
    createdAt: contrato.createdAt,
    updatedAt: contrato.updatedAt
  };
  return {
    ...base,
    id_contrato: base.idContrato,
    id_servico: base.idServico,
    nome_servico: base.nomeServico,
    imagem_servico: base.imagemServico,
    preco_proposto: base.precoProposto,
    tipo_contratacao: base.tipoContratacao,
    detalhes_pedido: base.detalhesPedido,
    prazo_desejado: base.prazoDesejado
  };
}

function mapFavorito(req, favorito) {
  return {
    idFavorito: favorito._id.toString(),
    id_favorito: favorito._id.toString(),
    servico: favorito.servico ? mapServico(req, favorito.servico) : null,
    createdAt: favorito.createdAt,
    created_at: favorito.createdAt
  };
}

function mapAvaliacao(req, avaliacao) {
  const base = {
    idAvaliacao: avaliacao._id.toString(),
    autor: avaliacao.autor?._id ? mapUsuarioPublico(req, avaliacao.autor) : null,
    freelancer: avaliacao.freelancer?._id ? mapUsuarioPublico(req, avaliacao.freelancer) : null,
    servico: avaliacao.servico?._id ? mapServico(req, avaliacao.servico) : null,
    contratoId: avaliacao.contrato ? avaliacao.contrato.toString() : '',
    notaServico: avaliacao.notaServico,
    notaFreelancer: avaliacao.notaFreelancer,
    comentario: avaliacao.comentario || '',
    createdAt: avaliacao.createdAt
  };
  return {
    ...base,
    id_avaliacao: base.idAvaliacao,
    contrato_id: base.contratoId,
    nota_servico: base.notaServico,
    nota_freelancer: base.notaFreelancer
  };
}

module.exports = {
  mapUsuario,
  mapUsuarioPrivado,
  mapUsuarioPublico,
  mapServico,
  mapContrato,
  mapFavorito,
  mapAvaliacao
};

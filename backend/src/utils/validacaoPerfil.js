const { obterCampo } = require('./requisicaoUtils');

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TEXTOS = [
  ['nome', ['nome'], 120, 'obrigatorio'],
  ['email', ['email'], 160, 'email'],
  ['telefone', ['telefone'], 30],
  ['tituloProfissional', ['tituloProfissional', 'professional_title'], 120],
  ['bio', ['bio'], 1000],
  ['localizacao', ['localizacao', 'location'], 120],
  ['site', ['site', 'website'], 300, 'url'],
  ['linkedin', ['linkedin'], 200],
  ['github', ['github'], 200],
  ['instagram', ['instagram'], 200],
  ['areaAtuacao', ['areaAtuacao', 'area_atuacao'], 80],
  ['portfolioTitulo', ['portfolioTitulo', 'portfolio_titulo'], 120],
  ['portfolioDescricao', ['portfolioDescricao', 'portfolio_descricao'], 1500],
  ['portfolioUrl', ['portfolioUrl', 'portfolio_url'], 300, 'url'],
  ['disponibilidade', ['disponibilidade'], 80],
  ['precoHora', ['precoHora', 'preco_hora'], 60],
  ['metodoPagamento', ['metodoPagamento', 'metodo_pagamento'], 60],
  ['chavePix', ['chavePix', 'chave_pix'], 140],
  ['banco', ['banco'], 120]
];

const BOOLEANOS = [
  ['notificacoesEmail', ['notificacoesEmail', 'notificacoes_email']],
  ['notificacoesPropostas', ['notificacoesPropostas', 'notificacoes_propostas']],
  ['notificacoesMarketing', ['notificacoesMarketing', 'notificacoes_marketing']]
];

const ROTULOS = {
  nome: 'Nome',
  email: 'E-mail',
  site: 'Website',
  portfolioUrl: 'Link do portfólio'
};

function urlValida(valor) {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(valor) ? valor : `https://${valor}`);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname.includes('.'));
  } catch {
    return false;
  }
}

function validarAtualizacaoPerfil(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    return { erro: 'Dados do perfil inválidos.' };
  }
  const campos = {};

  for (const [campo, aliases, maximo, formato] of TEXTOS) {
    const bruto = obterCampo(corpo, aliases);
    if (bruto === undefined || bruto === null) continue;
    const rotulo = ROTULOS[campo] || 'Campo';
    if (typeof bruto !== 'string') return { erro: `${rotulo} deve ser um texto.` };
    const valor = bruto.trim();
    if (valor.length > maximo) return { erro: `${rotulo} deve ter no máximo ${maximo} caracteres.` };
    if (formato === 'obrigatorio' && !valor) return { erro: 'Informe seu nome.' };
    if (formato === 'email') {
      if (!REGEX_EMAIL.test(valor)) return { erro: 'Informe um endereço de e-mail válido.' };
      campos.email = valor.toLowerCase();
      continue;
    }
    if (formato === 'url' && valor && !urlValida(valor)) {
      return { erro: `${rotulo} deve ser um endereço http(s) válido.` };
    }
    campos[campo] = valor;
  }

  for (const [campo, aliases] of BOOLEANOS) {
    const bruto = obterCampo(corpo, aliases);
    if (bruto === undefined || bruto === null) continue;
    if (bruto === true || bruto === 'true') campos[campo] = true;
    else if (bruto === false || bruto === 'false') campos[campo] = false;
    else return { erro: 'Preferências de notificação inválidas.' };
  }

  return { campos };
}

module.exports = { validarAtualizacaoPerfil, urlValida };

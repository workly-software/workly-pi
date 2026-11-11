const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const connectDatabase = require('./config/db');
const Categoria = require('./models/Categoria');
const Servico = require('./models/Servico');
const Usuario = require('./models/Usuario');
const Contrato = require('./models/Contrato');
const Favorito = require('./models/Favorito');
const Avaliacao = require('./models/Avaliacao');
const Mensagem = require('./models/Mensagem');
const Notificacao = require('./models/Notificacao');
const { gerarCpfValido } = require('./utils/cpfUtils');

const SENHA_DEMO = '12345678';
const DOMINIO_DEMO = '@demo.workly';
const TOTAL_USUARIOS_DEMO = 100;
const TOTAL_FREELANCERS = 60;
const TOTAL_CONTRATANTES = TOTAL_USUARIOS_DEMO - TOTAL_FREELANCERS;

const AREAS = [
  'Design',
  'Programação',
  'Vídeo/Edição',
  'Inteligência Artificial',
  'Tradução/Escritor',
  'Fotografia',
  'Áudio/Música'
];

const CIDADES = [
  'Jaú - SP',
  'Bauru - SP',
  'Botucatu - SP',
  'Marília - SP',
  'São Carlos - SP',
  'Ribeirão Preto - SP',
  'Campinas - SP',
  'São Paulo - SP',
  'Araraquara - SP',
  'Sorocaba - SP'
];

const NOMES = [
  'Ana Clara Martins',
  'Bruno Henrique Lima',
  'Camila Rocha',
  'Diego Nascimento',
  'Eduarda Ferreira',
  'Felipe Andrade',
  'Gabriela Moura',
  'Henrique Barros',
  'Isabela Costa',
  'João Pedro Souza',
  'Larissa Almeida',
  'Matheus Oliveira',
  'Rafaela Gomes',
  'Lucas Pereira',
  'Mariana Santos',
  'Caio Ribeiro',
  'Beatriz Nunes',
  'Thiago Carvalho',
  'Patrícia Duarte',
  'Gustavo Moreira',
  'Renata Barbosa',
  'Vinícius Cardoso',
  'Carolina Mendes',
  'André Luiz Silva',
  'Letícia Freitas',
  'Pedro Henrique Alves',
  'Sofia Teixeira',
  'Murilo Azevedo',
  'Bianca Fernandes',
  'Rodrigo Martins',
  'Natália Vieira',
  'Fábio Correia',
  'Juliana Castro',
  'Leonardo Ramos',
  'Amanda Lopes',
  'Igor Batista',
  'Priscila Moraes',
  'Daniel Costa',
  'Helena Monteiro',
  'Vitor Hugo Reis',
  'Clara Sales',
  'Eduardo Tavares',
  'Mirella Campos',
  'Rafael Dias',
  'Yasmin Farias',
  'Samuel Araújo',
  'Luana Nogueira',
  'César Augusto',
  'Paula Siqueira',
  'Otávio Pinheiro',
  'Manuela Pires',
  'Fernando Rocha',
  'Alice Macedo',
  'Renan Melo',
  'Giovana Leal',
  'Davi Martins',
  'Melissa Correia',
  'Bernardo Lima',
  'Laura Batista',
  'Arthur Barbosa',
  'Valentina Cunha',
  'Enzo Gabriel',
  'Heloísa Duarte',
  'Miguel Ribeiro',
  'Lívia Fernandes',
  'Cauã de Moraes',
  'Isadora Vieira',
  'Pietro Azevedo',
  'Maria Eduarda',
  'Joana Queiroz',
  'Erick Almeida',
  'Nicole Prado',
  'Sérgio Figueiredo',
  'Aline Pacheco',
  'Danilo Rezende',
  'Tainá Borges',
  'Marcelo Viana',
  'Rebeca Furtado',
  'Júlio César',
  'Mônica Neves',
  'Cristian Soares',
  'Débora Machado',
  'Alexandre Torres',
  'Nicolas Martins',
  'Ester Cardoso',
  'Wesley Carvalho',
  'Flávia Rezende',
  'Leandro Moraes',
  'Sara Albuquerque',
  'Raul Henrique',
  'Tatiane Fonseca',
  'Márcio Amaral',
  'Cecília Ramos',
  'Jonathan Ferreira',
  'Karen Dias',
  'Adriano Batista',
  'Nayara Lopes',
  'Emanuel Costa',
  'Lorena Reis',
  'Jéssica Martins'
];

const SERVICOS_POR_AREA = {
  Design: [
    [
      'Identidade visual completa',
      'Logo, paleta de cores, tipografia e kit de posts para redes sociais.',
      980
    ],
    [
      'Protótipo UI para aplicativo',
      'Protótipo navegável com telas principais, componentes e guia visual.',
      1200
    ],
    [
      'Design de landing page',
      'Layout moderno para landing page com foco em conversão e responsividade.',
      760
    ],
    [
      'Banner e artes para campanha',
      'Pacote de peças para redes sociais, anúncios e divulgação digital.',
      340
    ],
    [
      'Redesign de site institucional',
      'Atualização visual de páginas existentes com melhor usabilidade.',
      1450
    ],
    [
      'Apresentação comercial premium',
      'Deck visual para vendas, pitch e apresentação institucional.',
      520
    ]
  ],
  Programação: [
    [
      'Landing page profissional',
      'Criação de landing page responsiva com formulário, SEO básico e WhatsApp.',
      750
    ],
    [
      'Dashboard administrativo',
      'Painel com login, gráficos, tabelas, filtros e CRUD completo.',
      1450
    ],
    [
      'API REST para sistema web',
      'Backend com autenticação, rotas, validações e integração com banco.',
      1800
    ],
    [
      'Correção de bugs em site',
      'Análise, diagnóstico e correção de erros em páginas ou sistemas web.',
      260
    ],
    [
      'Sistema de agendamento',
      'Agenda com cadastro de clientes, horários, confirmação e painel de controle.',
      2100
    ],
    [
      'Integração de pagamento',
      'Integração com gateway de pagamento e fluxo básico de checkout.',
      1300
    ]
  ],
  'Vídeo/Edição': [
    [
      'Edição de Reels e TikToks',
      'Pacote com cortes dinâmicos, legenda, trilha e finalização para redes.',
      320
    ],
    [
      'Vídeo institucional',
      'Edição de vídeo institucional com abertura, cortes, trilha e finalização.',
      900
    ],
    [
      'Thumbnail para YouTube',
      'Criação de thumbnail chamativa com composição, contraste e texto de impacto.',
      120
    ],
    ['Vinheta animada curta', 'Animação de abertura para vídeos, cursos e redes sociais.', 480],
    [
      'Pacote de cortes para podcast',
      'Cortes verticais com legenda e acabamento para TikTok, Reels e Shorts.',
      680
    ],
    [
      'Tratamento de áudio e cor',
      'Correção básica de som, cor, enquadramento e exportação final.',
      360
    ]
  ],
  'Inteligência Artificial': [
    [
      'Chatbot com IA',
      'Configuração de chatbot para atendimento inicial e respostas frequentes.',
      1600
    ],
    ['Automação de planilhas', 'Automação de tarefas repetitivas em planilhas e relatórios.', 690],
    [
      'Prompt engineering para equipe',
      'Criação de prompts e treinamento rápido para uso produtivo de IA.',
      520
    ],
    [
      'Classificador de mensagens',
      'Fluxo para organizar leads, mensagens e prioridades com apoio de IA.',
      1100
    ],
    [
      'Resumo automático de documentos',
      'Automação para resumir PDFs, textos longos e relatórios internos.',
      1250
    ],
    [
      'Análise de dados com IA',
      'Limpeza, análise e visualização de dados com insights automatizados.',
      1750
    ]
  ],
  'Tradução/Escritor': [
    [
      'Copy para página de vendas',
      'Texto persuasivo para landing page, anúncios e chamada de ação.',
      540
    ],
    [
      'Tradução PT/EN revisada',
      'Tradução de textos institucionais, artigos e materiais comerciais.',
      420
    ],
    [
      'Artigos para blog com SEO',
      'Pacote de artigos otimizados para ranqueamento, clareza e conversão.',
      620
    ],
    [
      'Roteiro para vídeo comercial',
      'Roteiro objetivo para vídeos curtos, campanhas e apresentação de produto.',
      300
    ],
    [
      'Revisão textual profissional',
      'Correção gramatical, clareza, coesão e adequação de linguagem.',
      220
    ],
    ['Descrição de produtos', 'Textos comerciais para catálogo, loja virtual e marketplaces.', 280]
  ],
  Fotografia: [
    [
      'Ensaio fotográfico profissional',
      'Sessão de fotos com tratamento, direção simples e entrega digital.',
      850
    ],
    [
      'Fotografia de produtos',
      'Fotos para ecommerce, catálogo e redes sociais com edição básica.',
      720
    ],
    ['Tratamento de imagens', 'Correção de cor, recorte, limpeza e padronização visual.', 260],
    [
      'Cobertura de evento pequeno',
      'Registro fotográfico para eventos corporativos, workshops e encontros.',
      1100
    ],
    [
      'Fotos para perfil profissional',
      'Retratos para LinkedIn, currículo, portfólio e marca pessoal.',
      390
    ],
    [
      'Banco de imagens para marca',
      'Pacote de fotos para uso em site, posts e materiais institucionais.',
      980
    ]
  ],
  'Áudio/Música': [
    [
      'Jingle comercial curto',
      'Criação de jingle para marca, campanha ou chamada promocional.',
      700
    ],
    [
      'Locução profissional',
      'Gravação de voz para vídeo, anúncio, treinamento ou apresentação.',
      250
    ],
    [
      'Edição de podcast',
      'Tratamento de áudio, cortes, vinheta e exportação para publicação.',
      480
    ],
    [
      'Trilha sonora curta',
      'Composição simples para vídeo, apresentação ou conteúdo digital.',
      620
    ],
    ['Mixagem e masterização básica', 'Ajuste de volume, equalização e finalização de áudio.', 540],
    [
      'Remoção de ruídos',
      'Limpeza de áudio, redução de chiado e melhoria de inteligibilidade.',
      180
    ]
  ]
};

function montarExtraServico(area, valorCombinar = false) {
  const extrasPorArea = {
    Design:
      'Inclui briefing visual, arquivos finais nos formatos combinados e 1 rodada de ajustes. O cliente deve enviar referências, textos e medidas das peças.',
    Programação:
      'Inclui implementação do escopo combinado, testes básicos e 1 rodada de ajustes. O cliente deve enviar regras de negócio, referências, acessos e conteúdos necessários.',
    'Vídeo/Edição':
      'Inclui cortes, acabamento simples, legenda quando combinado e exportação final. O cliente deve enviar arquivos brutos, identidade visual e referências de ritmo/estilo.',
    'Inteligência Artificial':
      'Inclui configuração inicial, testes de fluxo e orientação de uso. O cliente deve enviar exemplos, base de conhecimento, regras do processo e acessos necessários.',
    'Tradução/Escritor':
      'Inclui produção ou revisão textual, ajustes de clareza e 1 rodada de alterações. O cliente deve enviar objetivo, público, tom de voz e materiais de apoio.',
    Fotografia:
      'Inclui sessão ou tratamento conforme combinado, seleção das melhores imagens e edição básica. O cliente deve informar local, quantidade de fotos/produtos e referências.',
    'Áudio/Música':
      'Inclui limpeza, cortes, equalização simples e exportação final. O cliente deve enviar áudio bruto, roteiro/vinheta quando houver e referência de qualidade desejada.'
  };

  const textoBase =
    extrasPorArea[area] ||
    'Inclui alinhamento inicial, entrega do material combinado e 1 rodada de ajustes.';
  return valorCombinar
    ? `${textoBase} Valor final definido após entender escopo, prazo e quantidade de entregáveis.`
    : textoBase;
}

const COMENTARIOS = [
  'Entrega excelente, comunicação clara e resultado acima do esperado.',
  'O serviço ficou muito profissional e foi entregue dentro do prazo.',
  'Gostei bastante da organização, dos detalhes e da atenção aos ajustes.',
  'Resultado muito bom. O freelancer entendeu bem a necessidade do projeto.',
  'Atendimento rápido, processo tranquilo e entrega de qualidade.',
  'Fez exatamente o que eu precisava e ainda sugeriu melhorias úteis.',
  'Bom custo-benefício e ótima comunicação durante todo o processo.',
  'Serviço bem executado, com cuidado visual e explicações claras.',
  'Voltaria a contratar. A entrega ficou alinhada com o combinado.',
  'O resultado ficou bom e os pequenos ajustes foram resolvidos rapidamente.'
];

function dataMesesAtras(meses, dia = 10) {
  const data = new Date();
  data.setMonth(data.getMonth() - meses);
  data.setDate(dia);
  data.setHours(10, 0, 0, 0);
  return data;
}

function escolher(lista, indice) {
  return lista[indice % lista.length];
}

function slug(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .toLowerCase();
}

function gerarCpf(prefixo, numero) {
  const grupo = Number(String(prefixo).replace(/\D/g, '').slice(0, 3)) || 900;
  const baseNumerica = grupo * 1000000 + Number(numero || 1);
  return gerarCpfValido(baseNumerica);
}

function garantirArquivosDemo() {
  const uploadsRoot = path.resolve(__dirname, '../uploads');
  const servicosDir = path.join(uploadsRoot, 'servicos');
  const perfisDir = path.join(uploadsRoot, 'perfis');

  fs.mkdirSync(servicosDir, { recursive: true });
  fs.mkdirSync(perfisDir, { recursive: true });

  const servicoPadrao = path.join(servicosDir, 'servico_padrao.svg');
  const perfilPadrao = path.join(perfisDir, 'perfil_padrao.svg');

  if (!fs.existsSync(servicoPadrao)) {
    fs.writeFileSync(
      servicoPadrao,
      `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0b1729"/>
      <stop offset="1" stop-color="#064e3b"/>
    </linearGradient>
  </defs>
  <rect width="900" height="560" rx="36" fill="url(#g)"/>
  <circle cx="720" cy="110" r="90" fill="rgba(255,255,255,.10)"/>
  <circle cx="150" cy="450" r="120" fill="rgba(255,255,255,.08)"/>
  <path d="M420 210h-70v140h70c45 0 78-27 78-70s-33-70-78-70z" fill="#04BF55"/>
  <path d="M310 190h250M285 280h310M330 370h240" stroke="#04BF55" stroke-width="10" stroke-linecap="round" opacity=".55"/>
  <text x="415" y="455" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fff">Workly</text>
  <text x="415" y="490" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="rgba(255,255,255,.72)">Serviço freelancer</text>
</svg>`.trim()
    );
  }

  if (!fs.existsSync(perfilPadrao)) {
    fs.writeFileSync(
      perfilPadrao,
      `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <rect width="400" height="400" rx="200" fill="#0f2e22"/>
  <circle cx="200" cy="145" r="72" fill="#16c784"/>
  <path d="M80 340c18-82 73-125 120-125s102 43 120 125" fill="#16c784" opacity=".9"/>
</svg>`.trim()
    );
  }
}

async function obterCategorias() {
  const categorias = await Categoria.find({}).sort({ legacyId: 1 });
  return Object.fromEntries(categorias.map((categoria) => [categoria.nome, categoria]));
}

async function criarUsuarioSeNaoExistir(dados, senhaHash) {
  const usuarioExistente = await Usuario.findOne({
    $or: [{ email: dados.email }, { cpf: dados.cpf }]
  });

  if (usuarioExistente) {
    await Usuario.updateOne(
      { _id: usuarioExistente._id },
      { $set: { ...dados, senha: usuarioExistente.senha } }
    );
    return Usuario.findById(usuarioExistente._id);
  }

  return Usuario.create({
    ...dados,
    senha: senhaHash,
    fotoPerfil: '/uploads/perfis/perfil_padrao.svg'
  });
}

async function criarServicoSeNaoExistir(dados) {
  const servicoExistente = await Servico.findOne({
    nome: dados.nome,
    freelancer: dados.freelancer
  });
  if (servicoExistente) {
    await Servico.updateOne(
      { _id: servicoExistente._id },
      {
        $set: {
          ...dados,
          imagemServico: servicoExistente.imagemServico || '/uploads/servicos/servico_padrao.svg'
        }
      }
    );
    return Servico.findById(servicoExistente._id);
  }

  return Servico.create({
    ...dados,
    imagemServico: '/uploads/servicos/servico_padrao.svg'
  });
}

async function criarContratoSeNaoExistir(dados) {
  const contratoExistente = await Contrato.findOne({
    cliente: dados.cliente,
    servico: dados.servico,
    status: dados.status
  });
  if (contratoExistente) {
    await Contrato.updateOne({ _id: contratoExistente._id }, { $set: dados });
    return Contrato.findById(contratoExistente._id);
  }
  return Contrato.create(dados);
}

async function criarFavoritoSeNaoExistir(usuario, servico) {
  await Favorito.updateOne(
    { usuario, servico },
    { $setOnInsert: { usuario, servico } },
    { upsert: true }
  );
}

async function criarAvaliacaoSeNaoExistir(dados) {
  const existente = await Avaliacao.findOne({ autor: dados.autor, contrato: dados.contrato });
  if (existente) return existente;
  return Avaliacao.create(dados);
}

async function criarMensagemDemoSeNaoExistir(dados) {
  const existente = await Mensagem.findOne({
    contrato: dados.contrato,
    remetente: dados.remetente,
    texto: dados.texto
  });

  if (existente) return existente;

  return Mensagem.create(dados);
}

async function criarNotificacaoDemoSeNaoExistir(dados) {
  const existente = await Notificacao.findOne({
    destinatario: dados.destinatario,
    tipo: dados.tipo,
    referenciaId: dados.referenciaId,
    titulo: dados.titulo
  });

  if (existente) return existente;

  return Notificacao.create(dados);
}

async function recalcularAvaliacoesFreelancers(freelancers) {
  for (const freelancer of freelancers) {
    const avaliacoes = await Avaliacao.find({ freelancer: freelancer._id });
    const total = avaliacoes.length;
    const media = total
      ? avaliacoes.reduce((soma, avaliacao) => soma + Number(avaliacao.notaFreelancer || 0), 0) /
        total
      : 0;

    await Usuario.findByIdAndUpdate(freelancer._id, {
      avaliacaoMedia: Number(media.toFixed(1)),
      totalAvaliacoes: total
    });
  }
}

async function popularBancoDemo() {
  garantirArquivosDemo();

  const categorias = await obterCategorias();
  const senhaHash = await bcrypt.hash(SENHA_DEMO, 10);

  await Contrato.updateMany({ status: 'encerrado' }, { $set: { status: 'concluido' } });

  const usuariosDemoExistentes = await Usuario.countDocuments({
    email: new RegExp(`${DOMINIO_DEMO.replace('.', '\\.')}\\s*$`, 'i')
  });
  const usuariosDemoComEmailAntigo = await Usuario.countDocuments({
    email: /\.(freela|cliente)\d{2}@demo\.workly$/i
  });
  const servicosDemoExistentes = await Servico.countDocuments({ nome: /^Demo Workly -/ });
  const contratosDemoExistentes = await Contrato.countDocuments({
    detalhesPedido: /Pedido demonstrativo criado pelo seed/i
  });
  const mensagensDemoExistentes = await Mensagem.countDocuments({ texto: /^Demo Workly:/ });
  const avaliacoesDemoExistentes = await Avaliacao.countDocuments({
    comentario: { $in: COMENTARIOS }
  });
  const favoritosDemoExistentes = await Favorito.countDocuments({});

  if (
    usuariosDemoExistentes >= TOTAL_USUARIOS_DEMO &&
    servicosDemoExistentes >= 120 &&
    contratosDemoExistentes >= 120 &&
    mensagensDemoExistentes >= 100 &&
    avaliacoesDemoExistentes >= 100 &&
    favoritosDemoExistentes >= 100 &&
    usuariosDemoComEmailAntigo === 0
  ) {
    console.log('Seed demo completa já existe. Nenhum dado duplicado foi criado.');
    return;
  }

  const freelancers = [];
  for (let i = 0; i < TOTAL_FREELANCERS; i += 1) {
    const nome = NOMES[i];
    const areaAtuacao = escolher(AREAS, i);
    freelancers.push(
      await criarUsuarioSeNaoExistir(
        {
          nome,
          email: `${slug(nome)}${DOMINIO_DEMO}`,
          cpf: gerarCpf('900', i + 1),
          telefone: `(14) 98888-${String(1000 + i).slice(-4)}`,
          tipoConta: 'Freelancer',
          areaAtuacao,
          tituloProfissional: `${areaAtuacao} Freelancer`,
          bio: `Profissional de ${areaAtuacao} com foco em entregas objetivas, comunicação clara e soluções para pequenos negócios.`,
          localizacao: escolher(CIDADES, i),
          site: i % 5 === 0 ? `https://portfolio.workly.dev/${slug(nome)}` : '',
          linkedin: i % 4 === 0 ? slug(nome).replaceAll('.', '-') : '',
          github: areaAtuacao === 'Programação' ? slug(nome).replaceAll('.', '') : '',
          instagram: i % 3 === 0 ? `@${slug(nome).replaceAll('.', '')}` : '',
          portfolioTitulo: `Portfólio de ${areaAtuacao}`,
          portfolioDescricao: `Projetos demonstrativos e entregas recentes em ${areaAtuacao}.`,
          disponibilidade:
            i % 2 === 0 ? 'Disponível para novos projetos' : 'Agenda com vagas limitadas',
          precoHora: String(45 + ((i * 13) % 140)),
          metodoPagamento: 'Pix',
          chavePix: `${slug(nome)}${DOMINIO_DEMO}`,
          banco: 'Banco Workly Demo',
          notificacoesEmail: true,
          notificacoesPropostas: true,
          notificacoesMarketing: i % 2 === 0
        },
        senhaHash
      )
    );
  }

  const contratantes = [];
  for (let i = 0; i < TOTAL_CONTRATANTES; i += 1) {
    const nome = NOMES[TOTAL_FREELANCERS + i];
    const segmento = escolher(
      [
        'Comércio',
        'Educação',
        'Saúde',
        'Eventos',
        'Marketing',
        'Tecnologia',
        'Serviços',
        'Alimentação'
      ],
      i
    );
    contratantes.push(
      await criarUsuarioSeNaoExistir(
        {
          nome,
          email: `${slug(nome)}${DOMINIO_DEMO}`,
          cpf: gerarCpf('901', i + 1),
          telefone: `(14) 97777-${String(1000 + i).slice(-4)}`,
          tipoConta: 'Contratante',
          areaAtuacao: segmento,
          tituloProfissional: `Contratante • ${segmento}`,
          bio: `Busca freelancers para projetos de ${segmento.toLowerCase()}, marketing e soluções digitais.`,
          localizacao: escolher(CIDADES, i + 3),
          notificacoesEmail: true,
          notificacoesPropostas: true,
          notificacoesMarketing: i % 3 === 0
        },
        senhaHash
      )
    );
  }

  const servicos = [];
  for (let i = 0; i < freelancers.length; i += 1) {
    const freelancer = freelancers[i];
    const area = freelancer.areaAtuacao;
    const modelos = SERVICOS_POR_AREA[area] || SERVICOS_POR_AREA.Programação;
    const quantidade = 2 + (i % 2);

    for (let j = 0; j < quantidade; j += 1) {
      const modelo = escolher(modelos, i + j);
      const [titulo, descricao, precoBase] = modelo;
      const numero = String(i + 1).padStart(2, '0') + '-' + String(j + 1);
      const precoNegociavel = false;
      const valorCombinar = (i + j) % 13 === 0;
      const preco = valorCombinar ? null : precoBase + ((i * 17 + j * 53) % 420);

      servicos.push(
        await criarServicoSeNaoExistir({
          nome: `Demo Workly - ${titulo} ${numero}`,
          descricao,
          preco,
          precoNegociavel,
          valorCombinar,
          extra: montarExtraServico(area, valorCombinar),
          categoria: categorias[area]?._id || Object.values(categorias)[0]?._id,
          freelancer: freelancer._id
        })
      );
    }
  }

  const contratos = [];
  const statusCiclo = [
    'concluido',
    'concluido',
    'em_andamento',
    'concluido',
    'pendente',
    'concluido'
  ];
  const contratosParaCriar = Math.min(220, servicos.length * 2);

  for (let i = 0; i < contratosParaCriar; i += 1) {
    const servico = servicos[i % servicos.length];
    const freelancer = servico.freelancer;
    const cliente = contratantes[(i * 7) % contratantes.length];
    const tipoContratacao = servico.valorCombinar ? 'combinar' : 'fixo';
    const statusBase = statusCiclo[i % statusCiclo.length];
    const status =
      tipoContratacao === 'fixo' && statusBase.startsWith('proposta_') ? 'pendente' : statusBase;
    const precoBase = servico.preco || 350 + ((i * 29) % 1700);
    const precoProposto = tipoContratacao === 'fixo' ? null : precoBase + (i % 5) * 80;
    const meses = 5 - (i % 6);
    const dia = 2 + (i % 24);

    contratos.push(
      await criarContratoSeNaoExistir({
        cliente: cliente._id,
        freelancer,
        servico: servico._id,
        preco: precoBase,
        precoProposto,
        tipoContratacao,
        mensagem:
          tipoContratacao === 'fixo'
            ? ''
            : 'Olá! Gostaria de negociar escopo, prazo e valor para este projeto.',
        detalhesPedido:
          'Pedido demonstrativo criado pelo seed para popular contratos, dashboards, leads e histórico da plataforma.',
        prazoDesejado: escolher(
          [
            'Urgente: 2 a 3 dias',
            'Até 7 dias',
            'Até 15 dias',
            'Sem pressa',
            'A combinar com o freelancer'
          ],
          i
        ),
        referencias: i % 4 === 0 ? 'https://exemplo.com/referencia-demo' : '',
        status,
        createdAt: dataMesesAtras(meses, dia),
        updatedAt: dataMesesAtras(Math.max(0, meses - 1), Math.min(27, dia + 3))
      })
    );
  }

  const contratosAvaliaveis = contratos.filter((contrato) => contrato.status === 'concluido');
  for (let i = 0; i < contratosAvaliaveis.length; i += 1) {
    const contrato = contratosAvaliaveis[i];
    const notaServico = [5, 5, 5, 4, 4, 5, 3][i % 7];
    const notaFreelancer = [5, 5, 4, 5, 4, 5, 3][i % 7];

    await criarAvaliacaoSeNaoExistir({
      autor: contrato.cliente,
      freelancer: contrato.freelancer,
      servico: contrato.servico,
      contrato: contrato._id,
      notaServico,
      notaFreelancer,
      comentario: escolher(COMENTARIOS, i),
      createdAt: contrato.updatedAt || dataMesesAtras(i % 6, 18),
      updatedAt: contrato.updatedAt || dataMesesAtras(i % 6, 18)
    });
  }

  for (let i = 0; i < 320; i += 1) {
    const cliente = contratantes[i % contratantes.length];
    const servico = servicos[(i * 11) % servicos.length];
    await criarFavoritoSeNaoExistir(cliente._id, servico._id);
  }

  const statusChatAtivo = ['pendente', 'proposta_pendente', 'proposta_aceita', 'em_andamento'];
  const contratosComChat = contratos
    .filter((contrato) => statusChatAtivo.includes(contrato.status))
    .slice(0, 120);
  for (let i = 0; i < contratosComChat.length; i += 1) {
    const contrato = contratosComChat[i];
    const criadaEm = dataMesesAtras(i % 6, 5 + (i % 20));

    await criarMensagemDemoSeNaoExistir({
      contrato: contrato._id,
      remetente: contrato.cliente,
      texto: `Demo Workly: Olá! Enviei os detalhes do projeto #${String(i + 1).padStart(3, '0')}.`,
      lida: true,
      createdAt: criadaEm,
      updatedAt: criadaEm
    });

    await criarMensagemDemoSeNaoExistir({
      contrato: contrato._id,
      remetente: contrato.freelancer,
      texto: `Demo Workly: Recebi o pedido e já vou analisar o escopo #${String(i + 1).padStart(3, '0')}.`,
      lida: i % 9 !== 0,
      createdAt: dataMesesAtras(i % 6, 6 + (i % 20)),
      updatedAt: dataMesesAtras(i % 6, 6 + (i % 20))
    });
  }

  for (let i = 0; i < 12; i += 1) {
    const contrato = contratos[i];
    await criarNotificacaoDemoSeNaoExistir({
      destinatario: contrato.freelancer,
      tipo: i % 2 === 0 ? 'contrato_novo' : 'proposta_nova',
      titulo: i % 2 === 0 ? 'Nova contratação recebida' : 'Nova proposta recebida',
      mensagem: 'Notificação demonstrativa criada pelo seed para validar o fluxo do sininho.',
      lida: i % 3 === 0,
      referenciaId: contrato._id,
      tipoReferencia: 'contrato',
      createdAt: dataMesesAtras(i % 2, 12 + i),
      updatedAt: dataMesesAtras(i % 2, 12 + i)
    });
  }

  await recalcularAvaliacoesFreelancers(freelancers);

  const [totalMensagensDemo, totalAvaliacoesDemo, totalFavoritosDemo] = await Promise.all([
    Mensagem.countDocuments({ texto: /^Demo Workly:/ }),
    Avaliacao.countDocuments({ comentario: { $in: COMENTARIOS } }),
    Favorito.countDocuments({})
  ]);

  console.log('Seed demo criada/atualizada com sucesso.');
  console.log(
    `Usuários demo: ${TOTAL_FREELANCERS} freelancers + ${TOTAL_CONTRATANTES} contratantes = ${TOTAL_USUARIOS_DEMO}.`
  );
  console.log(
    `Serviços demo: ${servicos.length}. Contratos demo: ${contratos.length}. Avaliações demo: ${totalAvaliacoesDemo}.`
  );
  console.log(
    `Mensagens demo: ${totalMensagensDemo}. Favoritos: ${totalFavoritosDemo}. Notificações demo: 12.`
  );
  console.log(`Senha de todos os usuários demo: ${SENHA_DEMO}`);
}

async function executarSeed() {
  await connectDatabase();
  await popularBancoDemo();
  process.exit(0);
}

if (require.main === module) {
  executarSeed().catch((error) => {
    console.error('Erro ao executar seed:', error);
    process.exit(1);
  });
}

module.exports = { popularBancoDemo };

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { iniciarAmbiente } = require('./helpers/apiTeste');

let amb, mongoose, Usuario, Servico, Categoria, Contrato, Avaliacao, Favorito, Mensagem, categoria;
const PERFIS = path.resolve(__dirname, '../uploads/perfis');
const fotosCriadas = [];

test.before(async () => {
  amb = await iniciarAmbiente('exclusoes');
  if (!amb) return;
  ({ mongoose } = amb);
  Usuario = require('../src/models/Usuario');
  Servico = require('../src/models/Servico');
  Categoria = require('../src/models/Categoria');
  Contrato = require('../src/models/Contrato');
  Avaliacao = require('../src/models/Avaliacao');
  Favorito = require('../src/models/Favorito');
  Mensagem = require('../src/models/Mensagem');
  assert.equal((await Contrato.garantirIndicesContrato()).instalado, true);
  await Promise.all([Usuario.init(), Avaliacao.init(), Favorito.init()]);
  categoria = await Categoria.create({ legacyId: 1, nome: 'Design', slug: 'design' });
});
test.after(async () => {
  for (const foto of fotosCriadas) fs.rmSync(path.join(PERFIS, foto), { force: true });
  await amb?.encerrar();
});

const pular = (t) => (!amb ? t.skip('MongoDB local indisponível') : false);
const SENHA = 'senha-forte-1';
const novoServico = (freelancer, extra = {}) =>
  Servico.create({ nome: 'Logotipo completo', descricao: 'd', preco: 300, categoria: categoria._id, freelancer: freelancer._id, ...extra });
const contrato = (cliente, freelancer, servico, status, extra = {}) =>
  Contrato.create({ cliente: cliente._id, freelancer: freelancer._id, servico: servico._id, preco: 300, status, ...extra });
const excluir = (usuario, senhaAtual = SENHA) => amb.chamar('DELETE', '/api/usuarios/perfil', usuario, { senhaAtual });

test('exclusão exige a senha atual correta e não altera nada quando falha', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario();
  assert.equal((await amb.chamar('DELETE', '/api/usuarios/perfil', usuario)).status, 400);
  assert.equal((await excluir(usuario, { $ne: '' })).status, 400);
  const errada = await excluir(usuario, 'senha-errada-9');
  assert.equal(errada.status, 403, 'senha errada não pode virar 401, que o frontend trata como sessão expirada');
  const salvo = await Usuario.findById(usuario._id).lean();
  assert.equal(salvo.removido, false);
  assert.equal(salvo.email, usuario.email);
  assert.equal(salvo.removendoDesde, null);
});

test('contratos ativos como cliente ou freelancer, inclusive entregues, bloqueiam a exclusão', async (t) => {
  if (pular(t)) return;
  const [freelancer, cliente] = [await amb.criarUsuario('Freelancer'), await amb.criarUsuario()];
  const servico = await novoServico(freelancer);
  const entregue = await contrato(cliente, freelancer, servico, 'entregue');
  for (const usuario of [cliente, freelancer]) {
    const resposta = await excluir(usuario);
    assert.equal(resposta.status, 409);
    assert.match(resposta.dados.mensagem, /contratos em andamento/);
    const salvo = await Usuario.findById(usuario._id).lean();
    assert.equal(salvo.removido, false);
    assert.equal(salvo.removendoDesde, null, 'a marca de exclusão é liberada');
  }
  assert.equal((await Servico.findById(servico._id)).removido, false);
  await Contrato.updateOne({ _id: entregue._id }, { status: 'concluido' });
});

test('exclusão anonimiza, encerra sessões, retira serviços e preserva o histórico da outra parte', async (t) => {
  if (pular(t)) return;
  const [freelancer, cliente, fa] = [
    await amb.criarUsuario('Freelancer'),
    await amb.criarUsuario(),
    await amb.criarUsuario()
  ];
  const foto = `perfil_${freelancer._id}_1_abcdefabcdef.png`;
  fs.writeFileSync(path.join(PERFIS, foto), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fotosCriadas.push(foto);
  await Usuario.updateOne(
    { _id: freelancer._id },
    { fotoPerfil: `/uploads/perfis/${foto}`, chavePix: 'pix@exemplo', banco: 'Banco X', bio: 'bio', telefone: '1499' }
  );
  const servico = await novoServico(freelancer);
  const concluido = await contrato(cliente, freelancer, servico, 'concluido');
  await contrato(cliente, freelancer, servico, 'cancelado');
  await Avaliacao.create({ autor: cliente._id, freelancer: freelancer._id, servico: servico._id, contrato: concluido._id, notaServico: 4, notaFreelancer: 4 });
  await Usuario.updateOne({ _id: freelancer._id }, { avaliacaoMedia: 4, totalAvaliacoes: 1 });
  await Mensagem.create({ contrato: concluido._id, remetente: freelancer._id, texto: 'entregue!' });
  await Favorito.create({ usuario: fa._id, servico: servico._id });

  const resposta = await excluir(freelancer);
  assert.equal(resposta.status, 200);

  const salvo = await Usuario.findById(freelancer._id).lean();
  assert.equal(salvo.removido, true);
  assert.equal(salvo.nome, 'Usuário removido');
  assert.notEqual(salvo.email, freelancer.email);
  assert.notEqual(salvo.cpf, freelancer.cpf);
  for (const campo of ['chavePix', 'banco', 'bio', 'telefone']) assert.equal(salvo[campo], '');
  assert.equal(salvo.fotoPerfil, '/uploads/perfis/perfil_padrao.svg');
  assert.equal(fs.existsSync(path.join(PERFIS, foto)), false, 'a foto própria é apagada');
  assert.equal(fs.existsSync(path.join(PERFIS, 'perfil_padrao.svg')), true, 'a imagem padrão continua');

  const antigo = await amb.chamar('GET', '/api/contratos/meus', freelancer);
  assert.equal(antigo.status, 401);
  assert.match(antigo.dados.mensagem, /token/i);
  const login = await amb.chamar('POST', '/api/autenticacao/login', undefined, { email: freelancer.email, senha: SENHA });
  assert.equal(login.status, 401);

  assert.equal((await Servico.findById(servico._id)).removido, true);
  const catalogo = await amb.chamar('GET', '/api/servicos');
  assert.ok(!catalogo.dados.dados.some((item) => item.idServico === String(servico._id)));
  assert.equal((await amb.chamar('GET', `/api/servicos/${servico._id}`)).status, 404);
  assert.equal(await Favorito.countDocuments({ servico: servico._id }), 0);
  const pedido = await amb.chamar('POST', '/api/contratos', cliente, { servicoId: String(servico._id), detalhesPedido: 'novo pedido' });
  assert.equal(pedido.status, 409);
  assert.equal((await amb.chamar('GET', `/api/usuarios/publico/${freelancer._id}`)).status, 404);

  const meus = await amb.chamar('GET', '/api/contratos/meus', cliente);
  assert.equal(meus.status, 200);
  const historico = meus.dados.dados.find((item) => item.idContrato === String(concluido._id));
  assert.equal(historico.freelancer.nome, 'Usuário removido');
  assert.equal(historico.freelancer.removido, true);
  assert.equal(historico.nomeServico, 'Logotipo completo');
  assert.equal(historico.servicoDisponivel, false);
  assert.equal(historico.freelancer.email, undefined);
  assert.equal(await Avaliacao.countDocuments({ freelancer: freelancer._id }), 1);
  assert.equal(await Mensagem.countDocuments({ contrato: concluido._id }), 1);
  assert.equal(await Contrato.countDocuments({ freelancer: freelancer._id }), 2);
  const chat = await amb.chamar('GET', `/api/mensagens/contrato/${concluido._id}`, cliente);
  assert.equal(chat.status, 200, 'chat de contrato encerrado continua legível');
  assert.equal(chat.dados.dados.length, 1);
  assert.equal(chat.dados.dados[0].remetente.nome, 'Usuário removido');
  const envio = await amb.chamar('POST', '/api/mensagens', cliente, { contratoId: String(concluido._id), texto: 'oi' });
  assert.equal(envio.status, 409);
  assert.equal(await Mensagem.countDocuments({ contrato: concluido._id }), 1);
  assert.equal((await amb.chamar('GET', '/api/usuarios/perfil', cliente)).status, 200);

  const recadastro = await amb.chamar('POST', '/api/autenticacao/cadastro', undefined, {
    nome: 'Nova conta', email: freelancer.email, senha: SENHA, cpf: freelancer.cpf, tipoConta: 'Contratante'
  });
  assert.equal(recadastro.status, 201);
});

test('serviço retirado preserva contratos e avaliações, e o contrato concluído ainda pode ser avaliado', async (t) => {
  if (pular(t)) return;
  const [freelancer, cliente, outro] = [await amb.criarUsuario('Freelancer'), await amb.criarUsuario(), await amb.criarUsuario()];
  const servico = await novoServico(freelancer, { imagemServico: '/uploads/servicos/servico_padrao.svg' });
  const ativo = await contrato(outro, freelancer, servico, 'em_andamento');
  assert.equal((await amb.chamar('DELETE', `/api/servicos/${servico._id}`, freelancer)).status, 400, 'contrato ativo impede retirar');
  await Contrato.updateOne({ _id: ativo._id }, { status: 'concluido' });
  const concluido = await contrato(cliente, freelancer, servico, 'concluido');
  await Favorito.create({ usuario: cliente._id, servico: servico._id });
  await Avaliacao.create({ autor: outro._id, freelancer: freelancer._id, servico: servico._id, contrato: ativo._id, notaServico: 2, notaFreelancer: 2 });

  assert.equal((await amb.chamar('DELETE', `/api/servicos/${servico._id}`, cliente)).status, 403);
  assert.equal((await amb.chamar('DELETE', `/api/servicos/${servico._id}`, freelancer)).status, 200);
  const retirado = await Servico.findById(servico._id).lean();
  assert.equal(retirado.removido, true);
  assert.equal(retirado.nome, 'Logotipo completo');
  assert.equal((await amb.chamar('GET', `/api/servicos/${servico._id}`)).status, 404);
  assert.equal((await amb.chamar('PUT', `/api/servicos/${servico._id}`, freelancer, { nome: 'x' })).status, 404);
  assert.equal(await Favorito.countDocuments({ servico: servico._id }), 0);
  assert.equal((await amb.chamar('POST', '/api/favoritos', cliente, { servicoId: String(servico._id) })).status, 404);
  assert.equal((await amb.chamar('POST', '/api/contratos', cliente, { servicoId: String(servico._id), detalhesPedido: 'x' })).status, 409);

  const avaliacao = { contratoId: String(concluido._id), notaServico: 4, notaFreelancer: 5 };
  assert.equal((await amb.chamar('POST', '/api/avaliacoes', outro, avaliacao)).status, 403, 'só o cliente do contrato avalia');
  assert.equal((await amb.chamar('POST', '/api/avaliacoes', cliente, avaliacao)).status, 201);
  assert.equal((await amb.chamar('POST', '/api/avaliacoes', cliente, avaliacao)).status, 400);
  const atualizado = await Usuario.findById(freelancer._id).lean();
  assert.equal(atualizado.totalAvaliacoes, 2);
  assert.equal(atualizado.avaliacaoMedia, 3.5);
  const doServico = await amb.chamar('GET', `/api/avaliacoes/servico/${servico._id}`);
  assert.equal(doServico.dados.dados.length, 2);
  const meus = await amb.chamar('GET', '/api/contratos/meus', cliente);
  const item = meus.dados.dados.find((c) => c.idContrato === String(concluido._id));
  assert.equal(item.nomeServico, 'Logotipo completo');
  assert.equal(item.servicoDisponivel, false);
  const perfil = await amb.chamar('GET', `/api/usuarios/publico/${freelancer._id}`);
  assert.equal(perfil.status, 200);
  assert.ok(!perfil.dados.services.some((s) => s.idServico === String(servico._id)));
});

test('referências antigas ausentes produzem respostas controladas, nunca 500', async (t) => {
  if (pular(t)) return;
  const cliente = await amb.criarUsuario();
  const ausente = () => new mongoose.Types.ObjectId();
  const raw = Contrato.collection;
  const { insertedId: concluidoId } = await raw.insertOne({
    cliente: cliente._id, freelancer: ausente(), servico: ausente(), preco: 100, status: 'concluido', tipoContratacao: 'fixo', createdAt: new Date(), updatedAt: new Date()
  });
  const { insertedId: ativoId } = await raw.insertOne({
    cliente: cliente._id, freelancer: ausente(), servico: ausente(), preco: 100, status: 'em_andamento', tipoContratacao: 'fixo', createdAt: new Date(), updatedAt: new Date()
  });
  await Mensagem.collection.insertOne({ contrato: ativoId, remetente: ausente(), texto: 'antiga', lida: false, createdAt: new Date(), updatedAt: new Date() });
  await Favorito.collection.insertOne({ usuario: cliente._id, servico: ausente(), createdAt: new Date() });

  const chamadas = [
    ['GET', '/api/contratos/meus'],
    ['GET', '/api/usuarios/perfil'],
    ['GET', '/api/favoritos'],
    ['GET', '/api/mensagens/resumo'],
    ['GET', `/api/mensagens/contrato/${ativoId}`],
    ['GET', `/api/mensagens/contrato/${concluidoId}`],
    ['POST', '/api/mensagens', { contratoId: String(ativoId), texto: 'oi' }],
    ['POST', '/api/avaliacoes', { contratoId: String(concluidoId), notaServico: 5, notaFreelancer: 5 }],
    ['POST', `/api/contratos/${ativoId}/cancelar`]
  ];
  for (const [metodo, rota, corpo] of chamadas) {
    const resposta = await amb.chamar(metodo, rota, cliente, corpo);
    assert.ok(resposta.status < 500, `${metodo} ${rota} -> ${resposta.status}`);
  }
  const chat = await amb.chamar('GET', `/api/mensagens/contrato/${concluidoId}`, cliente);
  assert.equal(chat.status, 200);
  assert.deepEqual(chat.dados.dados, []);
  const meus = await amb.chamar('GET', '/api/contratos/meus', cliente);
  const legado = meus.dados.dados.find((c) => c.idContrato === String(concluidoId));
  assert.equal(legado.nomeServico, 'Serviço removido');
  assert.equal(legado.servicoDisponivel, false);
  const favoritos = await amb.chamar('GET', '/api/favoritos', cliente);
  assert.deepEqual(favoritos.dados.dados, []);
});

test('exclusão de conta e criação de contrato em paralelo nunca deixam contrato ativo com conta removida', async (t) => {
  if (pular(t)) return;
  const resultados = { exclusao: 0, pedido: 0 };
  for (let rodada = 0; rodada < 12; rodada += 1) {
    const [freelancer, cliente] = [await amb.criarUsuario('Freelancer'), await amb.criarUsuario()];
    const servico = await novoServico(freelancer);
    const excluido = rodada % 2 ? cliente : freelancer;
    const [exclusao, pedido] = await Promise.all([
      excluir(excluido),
      amb.chamar('POST', '/api/contratos', cliente, { servicoId: String(servico._id), detalhesPedido: 'pedido em paralelo' })
    ]);
    if (exclusao.status === 200) resultados.exclusao += 1;
    if (pedido.status === 201) resultados.pedido += 1;
    assert.ok([200, 409].includes(exclusao.status), `exclusão: ${exclusao.status}`);
    assert.ok([201, 401, 409].includes(pedido.status), `pedido: ${pedido.status}`);
    const removido = (await Usuario.findById(excluido._id).lean()).removido;
    const ativos = await Contrato.countDocuments({ servico: servico._id, status: { $in: Contrato.STATUS_ATIVOS } });
    assert.ok(!(removido && ativos > 0), `rodada ${rodada}: conta removida com contrato ativo`);
    assert.equal(exclusao.status === 200, removido);
    if (pedido.status === 201) assert.equal(ativos, 1);
  }
  t.diagnostic(`exclusões concluídas: ${resultados.exclusao}/12, pedidos criados: ${resultados.pedido}/12`);
});

test('pedido gravado depois que a exclusão começou é desfeito pela segunda checagem', async (t) => {
  if (pular(t)) return;
  const [freelancer, cliente] = [await amb.criarUsuario('Freelancer'), await amb.criarUsuario()];
  const servico = await novoServico(freelancer);
  const criarOriginal = Contrato.create.bind(Contrato);
  t.mock.method(Contrato, 'create', async (...args) => {
    const criado = await criarOriginal(...args);
    await Usuario.updateOne({ _id: freelancer._id }, { removendoDesde: new Date() });
    return criado;
  });
  const pedido = await amb.chamar('POST', '/api/contratos', cliente, { servicoId: String(servico._id), detalhesPedido: 'corrida' });
  assert.equal(pedido.status, 409);
  assert.equal(await Contrato.countDocuments({ servico: servico._id }), 0, 'o pedido recém-criado foi desfeito');
  t.mock.restoreAll();
  await Usuario.updateOne({ _id: freelancer._id }, { removendoDesde: null });
  assert.equal((await excluir(freelancer)).status, 200);
});

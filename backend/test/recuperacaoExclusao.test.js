const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarAmbiente } = require('./helpers/apiTeste');

let amb, Usuario, Servico, Categoria, Contrato, Favorito, Mensagem, Avaliacao, Notificacao, conta, categoria;
test.before(async () => {
  amb = await iniciarAmbiente('recuperacao');
  if (!amb) return;
  Usuario = require('../src/models/Usuario');
  Servico = require('../src/models/Servico');
  Categoria = require('../src/models/Categoria');
  Contrato = require('../src/models/Contrato');
  Favorito = require('../src/models/Favorito');
  Mensagem = require('../src/models/Mensagem');
  Avaliacao = require('../src/models/Avaliacao');
  Notificacao = require('../src/models/Notificacao');
  conta = require('../src/services/contaService');
  assert.equal((await Contrato.garantirIndicesContrato()).instalado, true);
  await Promise.all([Usuario.init(), Avaliacao.init(), Favorito.init()]);
  categoria = await Categoria.create({ legacyId: 1, nome: 'Design', slug: 'design' });
});
test.after(async () => amb?.encerrar());

const pular = (t) => (!amb ? t.skip('MongoDB local indisponível') : false);
const SENHA = 'senha-forte-1';
const novoServico = (freelancer) =>
  Servico.create({ nome: 'Ilustração', descricao: 'd', preco: 120, categoria: categoria._id, freelancer: freelancer._id });
const pedir = (cliente, servico) =>
  amb.chamar('POST', '/api/contratos', cliente, { servicoId: String(servico._id), detalhesPedido: 'pedido de teste' });
const login = (usuario) => amb.chamar('POST', '/api/autenticacao/login', undefined, { email: usuario.email, senha: SENHA });
const silenciar = (t) => t.mock.method(console, 'error', () => {});

test('notificações: só os textos que citam a conta removida mudam, com o contexto preservado', async (t) => {
  if (pular(t)) return;
  const [removida, outra, cliente] = [await amb.criarUsuario('Freelancer'), await amb.criarUsuario(), await amb.criarUsuario()];
  await Usuario.updateOne({ _id: outra._id }, { nome: removida.nome });
  const servico = await novoServico(removida);
  const contrato = await Contrato.create({ cliente: cliente._id, freelancer: removida._id, servico: servico._id, preco: 120, status: 'concluido' });
  const deRemovida = await Mensagem.create({ contrato: contrato._id, remetente: removida._id, texto: 'oi' });
  const deOutra = await Mensagem.create({ contrato: contrato._id, remetente: outra._id, texto: 'oi' });
  const avaliacaoDeOutra = await Avaliacao.create({ autor: outra._id, freelancer: removida._id, servico: servico._id, contrato: contrato._id, notaServico: 5, notaFreelancer: 5 });
  const base = { lida: false };
  const [nMsgRemovida, nMsgOutra, nAvaliacao, nContrato] = await Notificacao.create([
    { ...base, destinatario: cliente._id, tipo: 'mensagem_nova', titulo: `Mensagem de ${removida.nome}`, mensagem: 'Nova mensagem no contrato de "Ilustração".', referenciaId: deRemovida._id, tipoReferencia: 'mensagem' },
    { ...base, destinatario: cliente._id, tipo: 'mensagem_nova', titulo: `Mensagem de ${removida.nome}`, mensagem: 'Nova mensagem no contrato de "Ilustração".', referenciaId: deOutra._id, tipoReferencia: 'mensagem' },
    { ...base, destinatario: removida._id, tipo: 'avaliacao_recebida', titulo: 'Você recebeu uma avaliação!', mensagem: `${removida.nome} avaliou seu serviço com nota 5.`, referenciaId: avaliacaoDeOutra._id, tipoReferencia: 'avaliacao' },
    { ...base, destinatario: cliente._id, tipo: 'entrega_realizada', titulo: 'Entrega realizada', mensagem: 'O freelancer entregou "Ilustração".', referenciaId: contrato._id, tipoReferencia: 'contrato' }
  ]);
  const servicoOutra = await novoServico(outra);
  const contratoComoCliente = await Contrato.create({ cliente: removida._id, freelancer: outra._id, servico: servicoOutra._id, preco: 50, status: 'concluido' });
  const avaliacaoDaRemovida = await Avaliacao.create({ autor: removida._id, freelancer: outra._id, servico: servicoOutra._id, contrato: contratoComoCliente._id, notaServico: 4, notaFreelancer: 3 });
  const nAvaliacaoDaRemovida = await Notificacao.create({ ...base, destinatario: outra._id, tipo: 'avaliacao_recebida', titulo: 'Você recebeu uma avaliação!', mensagem: `${removida.nome} avaliou seu serviço com nota 3.`, referenciaId: avaliacaoDaRemovida._id, tipoReferencia: 'avaliacao' });

  assert.equal((await amb.chamar('DELETE', '/api/usuarios/perfil', removida, { senhaAtual: SENHA })).status, 200);
  const ler = async (n) => Notificacao.findById(n._id).lean();
  assert.equal((await ler(nMsgRemovida)).titulo, 'Mensagem de Usuário removido');
  assert.equal((await ler(nMsgRemovida)).mensagem, 'Nova mensagem no contrato de "Ilustração".');
  assert.equal((await ler(nMsgOutra)).titulo, `Mensagem de ${removida.nome}`, 'mensagem do homônimo não muda');
  assert.equal(await ler(nAvaliacao), null, 'notificações da própria conta removida são apagadas');
  assert.equal((await ler(nAvaliacaoDaRemovida)).mensagem, 'Usuário removido avaliou seu serviço com nota 3.');
  assert.equal((await ler(nContrato)).mensagem, 'O freelancer entregou "Ilustração".');
  await conta.anonimizarNotificacoes(removida._id);
  assert.equal((await ler(nAvaliacaoDaRemovida)).mensagem, 'Usuário removido avaliou seu serviço com nota 3.');
});

test('queda antes da confirmação: a marca expira e a conta volta ao normal, sem nada alterado', async (t) => {
  if (pular(t)) return;
  const [usuario, cliente] = [await amb.criarUsuario('Freelancer'), await amb.criarUsuario()];
  const servico = await novoServico(usuario);
  await Usuario.updateOne({ _id: usuario._id }, { removendoDesde: new Date() });
  assert.equal((await pedir(cliente, servico)).status, 409, 'durante a verificação, nada é contratado');
  await Usuario.updateOne({ _id: usuario._id }, { removendoDesde: new Date(Date.now() - conta.MARCA_EXPIRADA_MS - 1000) });
  assert.equal((await login(usuario)).status, 200);
  assert.equal((await Servico.findById(servico._id)).removido, false);
  assert.equal((await pedir(cliente, servico)).status, 201, 'marca expirada não bloqueia mais');
  await Contrato.updateMany({ servico: servico._id }, { status: 'cancelado' });
  assert.equal((await amb.chamar('DELETE', '/api/usuarios/perfil', usuario, { senhaAtual: SENHA })).status, 200, 'a exclusão pode ser refeita');
  assert.equal((await Usuario.findById(usuario._id).lean()).removido, true);
});

test('queda depois da confirmação: conta fica encerrada e a recuperação conclui de forma repetível', async (t) => {
  if (pular(t)) return;
  silenciar(t);
  const [usuario, cliente] = [await amb.criarUsuario('Freelancer'), await amb.criarUsuario()];
  const servico = await novoServico(usuario);
  await Favorito.create({ usuario: cliente._id, servico: servico._id });
  const original = Usuario.collection.updateOne.bind(Usuario.collection);
  const queda = t.mock.method(Usuario.collection, 'updateOne', async (filtro, atualizacao, ...resto) => {
    if (atualizacao?.$set?.removido === true) throw new Error('processo interrompido');
    return original(filtro, atualizacao, ...resto);
  });
  const resposta = await amb.chamar('DELETE', '/api/usuarios/perfil', usuario, { senhaAtual: SENHA });
  assert.equal(resposta.status, 500);
  queda.mock.restore();

  const parcial = await Usuario.findById(usuario._id).lean();
  assert.ok(parcial.exclusaoConfirmadaEm, 'a confirmação ficou gravada');
  assert.equal(parcial.removido, false);
  assert.equal((await Servico.findById(servico._id)).removido, true, 'passos anteriores já aplicados');
  await Usuario.updateOne({ _id: usuario._id }, { removendoDesde: new Date(0) });
  assert.equal((await login(usuario)).status, 401);
  assert.equal((await amb.chamar('GET', '/api/contratos/meus', usuario)).status, 401);
  assert.equal(await conta.contaPodeContratar(usuario._id), false);
  assert.equal((await amb.chamar('GET', `/api/usuarios/publico/${usuario._id}`)).status, 404);

  const primeira = await conta.recuperarExclusoesPendentes();
  assert.equal(primeira.exclusoesConcluidas, 1);
  const final = await Usuario.findById(usuario._id).lean();
  assert.equal(final.removido, true);
  assert.equal(final.nome, 'Usuário removido');
  assert.equal(await Favorito.countDocuments({ servico: servico._id }), 0);
  const segunda = await conta.recuperarExclusoesPendentes();
  assert.deepEqual(segunda, { exclusoesConcluidas: 0, contratosCancelados: 0 });
  assert.deepEqual(await Usuario.findById(usuario._id).lean(), final, 'repetir não muda nada');
});

test('pedido gravado e processo caído antes da segunda checagem: a recuperação cancela o contrato', async (t) => {
  if (pular(t)) return;
  const [usuario, cliente, terceiro] = [await amb.criarUsuario('Freelancer'), await amb.criarUsuario(), await amb.criarUsuario()];
  const servico = await novoServico(usuario);
  const servicoTerceiro = await novoServico(terceiro);
  assert.equal((await amb.chamar('DELETE', '/api/usuarios/perfil', usuario, { senhaAtual: SENHA })).status, 200);
  const orfao = await Contrato.collection.insertOne({ cliente: cliente._id, freelancer: usuario._id, servico: servico._id, preco: 120, status: 'pendente', tipoContratacao: 'fixo', createdAt: new Date(), updatedAt: new Date() });
  const alheio = await Contrato.create({ cliente: cliente._id, freelancer: terceiro._id, servico: servicoTerceiro._id, preco: 50, status: 'pendente' });

  const resultado = await conta.recuperarExclusoesPendentes();
  assert.equal(resultado.contratosCancelados, 1);
  assert.equal((await Contrato.findById(orfao.insertedId).lean()).status, 'cancelado', 'cancelado, não apagado');
  assert.equal((await Contrato.findById(alheio._id).lean()).status, 'pendente', 'contratos de outras contas não mudam');
  assert.equal(
    await Contrato.countDocuments({ freelancer: usuario._id, status: { $in: Contrato.STATUS_ATIVOS } }),
    0
  );
});

test('recuperação na inicialização também cobre contas confirmadas sem nenhum passo aplicado', async (t) => {
  if (pular(t)) return;
  const usuario = await amb.criarUsuario('Freelancer');
  const servico = await novoServico(usuario);
  await Usuario.updateOne({ _id: usuario._id }, { exclusaoConfirmadaEm: new Date() });
  assert.equal((await pedir(await amb.criarUsuario(), servico)).status, 409);
  await conta.recuperarExclusoesPendentes();
  assert.equal((await Usuario.findById(usuario._id).lean()).removido, true);
  assert.equal((await Servico.findById(servico._id).lean()).removido, true);
});

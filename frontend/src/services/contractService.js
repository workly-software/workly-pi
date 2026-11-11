import { apiRequest } from './apiClient.js';
import { formatCurrency } from './catalogService.js';

const json = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
export function createContract(payload) {
  return apiRequest('/api/contratos', json(payload));
}
export async function myContracts() {
  return (await apiRequest('/api/contratos/meus')).dados || [];
}
export function contractAction(id, action, body) {
  return apiRequest(`/api/contratos/${id}/${action}`, body ? json(body) : { method: 'POST' });
}
export function proposeValue(id, valor) {
  return contractAction(id, 'propor-valor', { valor });
}
export function approveValue(id, valor) {
  return contractAction(id, 'aprovar-valor', { valor });
}
export function requestAdjustment(id, justificativa) {
  return contractAction(id, 'solicitar-ajuste', { justificativa });
}
export function reviewContract(payload) {
  return apiRequest('/api/avaliacoes', json(payload));
}
export const finalStatuses = ['concluido', 'cancelado', 'encerrado'];
export function contractStatus(status = '') {
  return (
    {
      pendente: 'Aguardando início',
      proposta_pendente: 'Proposta pendente',
      proposta_aceita: 'Proposta aceita',
      em_andamento: 'Em andamento',
      entregue: 'Aguardando confirmação do cliente',
      concluido: 'Entrega concluída',
      cancelado: 'Cancelado',
      encerrado: 'Concluído'
    }[status] || String(status).replace('_', ' ')
  );
}
export function negotiationOpen(c) {
  return (
    c.tipoContratacao === 'combinar' &&
    !finalStatuses.includes(c.status) &&
    Boolean(c.negociacao) &&
    c.negociacao.estado !== 'fechado'
  );
}
const needsAgreement = ['aceitar', 'iniciar', 'entregar', 'confirmar'];
export function contractActions(c) {
  if (finalStatuses.includes(c.status)) return [];
  const actions = baseActions(c);
  return negotiationOpen(c) ? actions.filter(([action]) => !needsAgreement.includes(action)) : actions;
}
function baseActions(c) {
  if (c.papel === 'freelancer') {
    return (
      {
        proposta_pendente: [
          ['aceitar', 'Aceitar proposta'],
          ['recusar', 'Recusar']
        ],
        pendente: [
          ['aceitar', 'Aceitar/Iniciar'],
          ['cancelar', 'Cancelar']
        ],
        proposta_aceita: [
          ['iniciar', 'Iniciar trabalho'],
          ['entregar', 'Finalizar entrega'],
          ['cancelar', 'Cancelar']
        ],
        em_andamento: [
          ['entregar', 'Finalizar entrega'],
          ['cancelar', 'Cancelar']
        ]
      }[c.status] || []
    );
  }
  if (c.papel === 'cliente' && c.status === 'entregue')
    return [['confirmar', 'Confirmar recebimento']];
  return ['pendente', 'proposta_pendente', 'proposta_aceita'].includes(c.status)
    ? [['cancelar', 'Cancelar contratação']]
    : [];
}
export function contractPrice(c) {
  if (c.tipoContratacao === 'combinar' && c.negociacao?.estado === 'pendente_acordo')
    return ['fa-comments-dollar', 'Valor pendente de acordo'];
  if (c.negociacao?.estado === 'aguardando_cliente' && c.precoProposto)
    return ['fa-hand-holding-dollar', `Contraproposta: ${formatCurrency(c.precoProposto)}`];
  if (c.tipoContratacao === 'combinar' && !c.preco && !c.precoProposto && !c.preco_proposto)
    return ['fa-comments-dollar', 'Valor a combinar'];
  if (c.precoProposto || c.preco_proposto)
    return [
      'fa-hand-holding-dollar',
      `Proposta: ${formatCurrency(c.precoProposto || c.preco_proposto)}`
    ];
  return ['fa-money-bill-wave', formatCurrency(c.preco || 0)];
}
const serviceReviewed = (c) => Boolean(c.servicoJaAvaliado || c.servico_ja_avaliado);
export function canReview(c) {
  return (
    c.papel === 'cliente' &&
    c.status === 'concluido' &&
    !c.jaAvaliado &&
    !c.ja_avaliado &&
    !serviceReviewed(c)
  );
}
export function contractFeedback(c) {
  if (negotiationOpen(c)) return null;
  if (c.papel === 'cliente' && (c.status === 'encerrado' || c.jaAvaliado || c.ja_avaliado))
    return ['fa-circle-check', 'Avaliação enviada. Contrato encerrado.', true];
  if (c.papel === 'cliente' && c.status === 'concluido' && serviceReviewed(c))
    return ['fa-circle-check', 'Contrato concluído. Você já avaliou este serviço em outra contratação.', true];
  if (c.papel === 'freelancer' && c.status === 'encerrado')
    return ['fa-circle-check', 'Serviço avaliado pelo contratante.', true];
  if (c.status === 'entregue')
    return [
      'fa-clock',
      c.papel === 'cliente'
        ? 'Confira o serviço e confirme o recebimento.'
        : 'Entrega enviada. Aguardando confirmação do cliente.',
      false
    ];
  if (c.papel === 'cliente' && c.status === 'concluido')
    return ['fa-star', 'Contrato concluído. Você já pode avaliar o serviço.', false];
  if (c.papel === 'cliente' && c.status === 'proposta_pendente')
    return ['fa-clock', 'Aguardando resposta do freelancer.', false];
  return null;
}
const historyVerbs = {
  proposta: 'propôs',
  contraproposta: 'fez contraproposta de',
  aceite: 'aprovou',
  entrega: 'enviou a entrega',
  ajuste_solicitado: 'pediu ajustes'
};
export function historyEntry(event, papel) {
  const who = event.papel === papel ? 'Você' : event.papel === 'cliente' ? 'Cliente' : 'Freelancer';
  const value = event.valor ? ` ${formatCurrency(event.valor)}` : '';
  return `${who} ${historyVerbs[event.tipo] || event.tipo}${value}`;
}

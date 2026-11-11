import { apiRequest } from './apiClient.js';

const unreadCount = (response) => Number(response.dados?.naoLidas || response.naoLidas || 0);
const BELL_MESSAGES = '/api/mensagens/nao-lidas?contexto=sino';
export async function notificationCounts() {
  const [notifications, messages] = await Promise.all([
    apiRequest('/api/notificacoes/nao-lidas').catch(() => ({ dados: { naoLidas: 0 } })),
    apiRequest(BELL_MESSAGES).catch(() => ({ dados: { naoLidas: 0 } }))
  ]);
  return unreadCount(notifications) + unreadCount(messages);
}
export async function notificationList() {
  const [notifications, messages] = await Promise.all([
    apiRequest('/api/notificacoes?lida=false&limit=8&excluirMensagens=true').catch(() => ({
      dados: []
    })),
    apiRequest(BELL_MESSAGES).catch(() => ({ dados: { naoLidas: 0 } }))
  ]);
  return {
    items: (notifications.dados || []).filter((item) => item.tipo !== 'mensagem_nova'),
    messages: unreadCount(messages)
  };
}
export function markAllNotificationsRead() {
  return apiRequest('/api/notificacoes/todas-lidas', { method: 'PATCH' });
}
export async function markNotificationRead({ id, contexto, referenciaId }) {
  if (id) await apiRequest(`/api/notificacoes/${encodeURIComponent(id)}/lida`, { method: 'PATCH' });
  if (['mensagens', 'contratos'].includes(contexto))
    await apiRequest('/api/notificacoes/contexto/lidas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contexto, referenciaId: referenciaId || undefined })
    });
}

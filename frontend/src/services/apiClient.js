const API_BASE_URL = String(import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');

// The session token lives in an HttpOnly cookie that scripts cannot read; the browser sends it with
// same-origin requests. The header below proves the call came from this app (CSRF protection).
// localStorage only keeps "sessao", a non-secret marker of the current login, and the cached user.
export async function apiRequest(path, options = {}) {
  const session = localStorage.getItem('sessao');
  const headers = { 'X-Workly-Requisicao': '1', ...(options.headers || {}) };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'same-origin',
    ...options,
    headers
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      data?.mensagem ||
      data?.message ||
      (typeof data === 'string' ? data : 'Erro na requisi\u00e7\u00e3o.');
    const isSessionFailure =
      response.status === 401 &&
      session &&
      (path === '/api/usuarios/perfil' || /token/i.test(message));
    // a late 401 from an older login must not end a newer one.
    if (isSessionFailure && localStorage.getItem('sessao') === session) {
      localStorage.removeItem('sessao');
      localStorage.removeItem('user');
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('workly:session-expired'));
    }
    const error = new Error(message);
    error.status = response.status;
    error.response = response;
    error.data = data;
    throw error;
  }
  return data;
}

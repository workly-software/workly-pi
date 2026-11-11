import { apiRequest } from './apiClient.js';
export { newPasswordProblem } from './passwordValidation.js';

export async function login({ email, senha }) {
  const response = await apiRequest('/api/autenticacao/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha })
  });
  const payload = response?.dados || response;
  return {
    user: normalizarUsuario(
      payload?.user || response?.user || payload?.usuario || response?.usuario
    ),
    mensagem: response?.mensagem || 'Login realizado com sucesso.'
  };
}

export function cadastrar(dados) {
  return apiRequest('/api/autenticacao/cadastro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados)
  });
}

export function requestPasswordReset(email) {
  return apiRequest('/api/autenticacao/recuperar-senha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
}

export function resetPassword({ token, novaSenha, confirmarSenha }) {
  return apiRequest('/api/autenticacao/redefinir-senha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, novaSenha, confirmarSenha })
  });
}

let pendingResetToken = '';
export function takeResetToken(win = window) {
  const { pathname, search, hash } = win.location;
  const query = new URLSearchParams(search);
  const found = new URLSearchParams(hash.replace(/^#/, '')).get('token') || query.get('token');
  if (found) {
    pendingResetToken = found;
    query.delete('token');
    const rest = query.toString();
    win.history.replaceState(win.history.state, '', pathname + (rest ? `?${rest}` : ''));
  }
  return pendingResetToken;
}
export function clearResetToken() {
  pendingResetToken = '';
}

try {
  globalThis.localStorage?.removeItem('token');
} catch {}

export function sessaoIniciada() {
  return localStorage.getItem('sessao');
}

export function iniciarSessao(user) {
  localStorage.removeItem('token');
  localStorage.setItem('sessao', `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  salvarSessao({ user });
}

export function normalizarUsuario(user) {
  if (!user) return null;
  return {
    ...user,
    idUsuario: user.idUsuario || user.id_usuario || '',
    tipoConta: user.tipoConta || user.tipo_conta || '',
    areaAtuacao: user.areaAtuacao || user.area_atuacao || '',
    fotoPerfil: user.fotoPerfil || user.foto_perfil || '/assets/img/perfis/perfil_padrao.svg',
    tituloProfissional: user.tituloProfissional || user.professional_title || '',
    localizacao: user.localizacao || user.location || '',
    site: user.site || user.website || ''
  };
}

export function obterUsuario() {
  try {
    return normalizarUsuario(JSON.parse(localStorage.getItem('user')));
  } catch {
    return null;
  }
}

export function salvarSessao({ user }) {
  if (user) localStorage.setItem('user', JSON.stringify(normalizarUsuario(user)));
}

export function limparSessao() {
  localStorage.removeItem('token');
  localStorage.removeItem('sessao');
  localStorage.removeItem('user');
}

export async function sair() {
  try {
    await apiRequest('/api/autenticacao/logout', { method: 'POST' });
  } catch {
  } finally {
    limparSessao();
  }
}

export async function buscarUsuarioAtual(force = false) {
  if (!sessaoIniciada()) return null;
  const stored = obterUsuario();
  if (!force && stored) return stored;
  try {
    const response = await apiRequest('/api/usuarios/perfil');
    const user = normalizarUsuario(response.user || response.dados?.user);
    salvarSessao({ user });
    return user;
  } catch {
    return obterUsuario();
  }
}

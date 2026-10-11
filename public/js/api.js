/**
 * API Client & Gerenciamento de Autenticação / Sessão
 */

const API_BASE = '/api';

const Auth = {
  getToken() {
    return localStorage.getItem('ponto_token') || null;
  },
  getUser() {
    const raw = localStorage.getItem('ponto_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setSession(token, user) {
    localStorage.setItem('ponto_token', token);
    localStorage.setItem('ponto_user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('ponto_token');
    localStorage.removeItem('ponto_user');
  },
  isAuthenticated() {
    return !!this.getToken();
  },
  isAdmin() {
    const u = this.getUser();
    return u && u.role === 'admin';
  }
};

/**
 * Utilitário de requisições autenticadas
 */
const api = {
  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const token = Auth.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      // Se token expirou ou inválido, desloga
      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        Auth.clearSession();
        window.location.reload();
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.message || `Erro na requisição (${response.status})`);
      }

      return data;
    } catch (err) {
      throw err;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
};

/**
 * Sistema de Notificações Toast
 */
const Toast = {
  show(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><div style="flex:1;">${message}</div>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); }
};

/**
 * Utilitários de Formatação
 */
function formatTimeBR(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateBR(dateStr) {
  if (!dateStr) return '--/--/----';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

/**
 * HealthSphere API Client Layer
 * Reusable, centralized HTTP communication handling tokens, errors, and toast messages.
 */

const API_BASE = '/api';

export function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✅',
    danger: '⚠️',
    warning: '🔔',
    info: 'ℹ️',
  };

  toast.innerHTML = `
    <span style="font-size: 1.1rem;">${iconMap[type] || 'ℹ️'}</span>
    <div style="flex: 1;">
      <div>${message}</div>
    </div>
    <button style="background:none;border:none;cursor:pointer;color:inherit;font-size:1.1rem;" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function getToken() {
  return localStorage.getItem('healthsphere_token');
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('healthsphere_token', token);
  } else {
    localStorage.removeItem('healthsphere_token');
  }
}

/**
 * Core HTTP fetch wrapper
 */
async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        // Clear token on authentication failure
        setToken(null);
        // Only redirect to login if we are on a protected dashboard or page
        const isAuthPage = window.location.pathname.includes('login') || window.location.pathname.includes('register') || window.location.pathname === '/' || window.location.pathname.endsWith('index.html');
        if (!isAuthPage) {
          window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
        }
      }
      const errorMsg = data.error || `Request failed with status ${response.status}`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    console.error(`API Error on ${url}:`, err);
    throw err;
  }
}

export const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

// UI State Render Helpers
export function renderLoading(container, text = 'Loading data...') {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return;
  container.innerHTML = `
    <div class="state-container">
      <div class="spinner"></div>
      <p style="font-weight: 600;">${text}</p>
    </div>
  `;
}

export function renderEmpty(container, text = 'No records found.', icon = '📂') {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return;
  container.innerHTML = `
    <div class="state-container">
      <div class="state-icon">${icon}</div>
      <p style="font-weight: 600; color: var(--text-main); font-size: 1.05rem;">${text}</p>
      <p style="font-size: 0.875rem;">Check back later or adjust your filters.</p>
    </div>
  `;
}

export function renderError(container, text = 'Unable to load data. Please try again.', retryFn = null) {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return;
  container.innerHTML = `
    <div class="state-container" style="border-color: var(--danger-border); background: var(--danger-light);">
      <div class="state-icon">⚠️</div>
      <p style="font-weight: 700; color: var(--danger); font-size: 1.05rem;">${text}</p>
      ${retryFn ? `<button class="btn btn-sm btn-primary" style="margin-top: 0.75rem;" id="state-retry-btn">Retry</button>` : ''}
    </div>
  `;
  if (retryFn) {
    document.getElementById('state-retry-btn')?.addEventListener('click', retryFn);
  }
}

export function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatTime(timeStr) {
  if (!timeStr) return '';
  // if format is HH:MM
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    let hour = parseInt(parts[0], 10);
    const min = parts[1];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${min} ${ampm}`;
  }
  return timeStr;
}

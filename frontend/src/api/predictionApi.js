// src/api/predictionApi.js
import logger from '../utils/logger.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

function getToken() {
  // Check 'token' key (current storage format)
  const t = localStorage.getItem('token');
  if (t && t !== 'undefined' && t !== 'null') return t;

  // Fallback: check 'auth' key (JSON object with token property)
  const a = localStorage.getItem('auth');
  if (a) {
    try {
      const { token } = JSON.parse(a);
      if (token && typeof token === 'string') return token;
    } catch {}
  }

  // Fallback: check 'authToken' key
  const at = localStorage.getItem('authToken');
  return (at && at !== 'undefined' && at !== 'null') ? at : null;
}

async function authedGet(path) {
  const token = getToken();
  if (!token) {
    logger.warn('API GET failed - no token', { path });
    throw new Error('You\'re signed out. Please sign in again.');
  }

  const url = `${API_BASE}${path}`;
  logger.api('GET', url);

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { error: text }; }

  if (r.status === 401) {
    logger.apiError('GET', url, new Error('Unauthorized'));
    throw new Error(json.error || 'Invalid token');
  }
  if (!r.ok) {
    logger.apiError('GET', url, new Error(json.error || r.statusText), { status: r.status });
    throw new Error(json.error || `${r.status} ${r.statusText}`);
  }

  logger.apiSuccess('GET', url, { status: r.status });
  return json;
}

async function authedPost(path, body) {
  const token = getToken();
  if (!token) {
    logger.warn('API POST failed - no token', { path });
    throw new Error('You\'re signed out. Please sign in again.');
  }

  const url = `${API_BASE}${path}`;
  logger.api('POST', url, { body });

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { error: text }; }

  if (r.status === 401) {
    logger.apiError('POST', url, new Error('Unauthorized'));
    throw new Error(json.error || 'Invalid token');
  }
  if (!r.ok) {
    logger.apiError('POST', url, new Error(json.error || r.statusText), { status: r.status });
    throw new Error(json.error || `${r.status} ${r.statusText}`);
  }

  logger.apiSuccess('POST', url, { status: r.status });
  return json;
}

export const predictionApi = {
  getForGp: (gpId) => authedGet(`/api/predictions/${gpId}`),
  upsert:   (payload) => authedPost('/api/predictions/upsert', payload),
};

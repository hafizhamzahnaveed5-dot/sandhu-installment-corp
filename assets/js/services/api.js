/**
 * api.js — Central fetch wrapper
 *
 * All HTTP calls go through this module. Never call fetch() directly
 * in service or page files.
 *
 * When MOCK_MODE is true, calls resolve from mock data via the service
 * layer (not from this file — api.js is still called, but services
 * short-circuit before reaching fetch()).
 *
 * When connecting a real backend:
 * 1. Set Config.FEATURE_FLAGS.MOCK_MODE = false
 * 2. Ensure Config.API_BASE_URL points to the backend
 * 3. The Auth token is automatically sent in the Authorization header
 */

import { Config } from '../config.js';

/** Standard API response shape: { success, data, error, pagination? } */

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * Core request function. All service files call this.
 * @param {string} path — e.g. '/customers' or '/customers/123'
 * @param {object} options — fetch options (method, body, etc.)
 * @returns {Promise<{success: boolean, data: any, error: string|null, pagination?: object}>}
 */
export async function apiRequest(path, options = {}) {
  const url = `${Config.API_BASE_URL}${path}`;

  // Attach auth token from session storage
  // DECISION: Using sessionStorage for token during frontend-only phase.
  // Upgrade path: switch to reading from a cookie (with httpOnly flag set
  // by the backend) so the token is never accessible to JS at all.
  const token = sessionStorage.getItem(Config.AUTH.TOKEN_KEY);

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      ...options,
      headers,
      // DECISION: Using 'same-origin' during dev. Switch to 'include'
      // once the backend is on a different subdomain and sets CORS headers.
      credentials: 'same-origin',
    });

    const contentType = response.headers.get('content-type') || '';
    let body;
    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = { success: false, data: null, error: await response.text() };
    }

    if (!response.ok) {
      throw new ApiError(body.error || `HTTP ${response.status}`, response.status, body);
    }

    return body;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Network error
    throw new ApiError(err.message || 'Network error', 0, null);
  }
}

/** Convenience wrappers */
export const api = {
  get:    (path, params)  => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiRequest(path + qs);
  },
  post:   (path, body)    => apiRequest(path, { method: 'POST', body: JSON.stringify(body) }),
  put:    (path, body)    => apiRequest(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch:  (path, body)    => apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path)          => apiRequest(path, { method: 'DELETE' }),
};

export { ApiError };

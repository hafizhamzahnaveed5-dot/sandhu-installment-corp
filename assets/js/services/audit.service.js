/**
 * audit.service.js — Audit log entry point
 * Every create/update/delete action calls this service.
 * In mock mode, logs to console (non-sensitive format only).
 * In real mode: POST /api/audit-logs
 *
 * SECURITY: Never log CNIC numbers, passwords, or raw PII here.
 */

import { Config } from '../config.js';
import { api } from './api.js';
import AuthService from './auth.service.js';
import { MOCK_AUDIT_LOGS } from '../mock/products.mock.js';

const mockLogs = [...MOCK_AUDIT_LOGS];

const AuditService = {
  /**
   * Record an audit log entry.
   * @param {string} action — 'CREATE' | 'UPDATE' | 'DELETE'
   * @param {string} entityType — 'Customer' | 'InstallmentPlan' | 'Payment' | ...
   * @param {string} entityId
   * @param {string} details — human-readable description (no raw PII)
   */
  async log(action, entityType, entityId, details) {
    const user = AuthService.getUser();
    const entry = {
      id: `audit-${Date.now()}`,
      userId: user?.id || 'system',
      action,
      entityType,
      entityId,
      timestamp: new Date().toISOString(),
      details,
    };

    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      // SECURITY: In dev mode, only log non-sensitive details
      console.log('[AUDIT]', action, entityType, entityId, details);
      mockLogs.push(entry);
      return;
    }
    // Real API call — fire and forget (don't block UI on audit failure)
    api.post('/audit-logs', entry).catch(err => {
      console.warn('[AUDIT] Failed to log audit entry:', err.message);
    });
  },

  /** List audit logs (admin only) */
  async list({ page = 1, pageSize = Config.DEFAULT_PAGE_SIZE } = {}) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      const sorted = [...mockLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const items = sorted.slice((page - 1) * pageSize, page * pageSize);
      return { success: true, data: items, error: null };
    }
    return api.get('/audit-logs', { page, pageSize });
  },
};

export default AuditService;

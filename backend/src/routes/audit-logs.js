import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { mapAudit } from '../services/mappers.js';
import { asyncHandler, ok, pagination, paginationParams } from '../utils/respond.js';

const router = express.Router();

router.use(authenticate);

router.get('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = paginationParams(req);
  const count = await pool.query('SELECT count(*)::int AS total FROM audit_logs');
  const result = await pool.query(
    'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2',
    [pageSize, offset]
  );
  return ok(res, result.rows.map(mapAudit), pagination(page, pageSize, count.rows[0].total));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { action, entityType, entityId, details } = req.body || {};
  await withTransaction(async (client) => {
    await writeAudit(client, req.user.id, action || 'SYSTEM', entityType || 'Client', entityId || 'unknown', details || 'Client audit entry');
  });
  return ok(res, null);
}));

export default router;

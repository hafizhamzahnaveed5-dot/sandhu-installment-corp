import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { asyncHandler, fail, ok } from '../utils/respond.js';

const router = express.Router();

const ALLOWED_KEYS = new Set(['business', 'web_content']);

router.get('/', asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT key, value, updated_at FROM site_settings WHERE key = ANY($1::text[])`,
    [[...ALLOWED_KEYS]]
  );
  const data = {};
  for (const row of result.rows) data[row.key] = row.value;
  return ok(res, data);
}));

router.get('/:key', asyncHandler(async (req, res) => {
  if (!ALLOWED_KEYS.has(req.params.key)) return fail(res, 404, 'Unknown settings key.');
  const result = await pool.query('SELECT key, value, updated_at FROM site_settings WHERE key = $1', [req.params.key]);
  if (!result.rowCount) return ok(res, {});
  return ok(res, result.rows[0].value);
}));

router.put('/:key', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  if (!ALLOWED_KEYS.has(req.params.key)) return fail(res, 404, 'Unknown settings key.');
  const value = req.body?.value ?? req.body;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(res, 400, 'Settings value must be a JSON object.');
  }

  const row = await withTransaction(async (client) => {
    const updated = await client.query(
      `INSERT INTO site_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by
       RETURNING key, value, updated_at`,
      [req.params.key, JSON.stringify(value), req.user.id]
    );
    await writeAudit(client, req.user.id, 'UPDATE', 'SiteSettings', req.params.key, `Updated site settings: ${req.params.key}`);
    return updated.rows[0];
  });

  return ok(res, row.value);
}));

export default router;

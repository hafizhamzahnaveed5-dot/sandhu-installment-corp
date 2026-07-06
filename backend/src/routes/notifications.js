import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, requireMinRole } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { mapNotification, mapSmsLog } from '../services/mappers.js';
import { runDueSmsSweep } from '../services/sms.js';
import { asyncHandler, fail, ok } from '../utils/respond.js';

const router = express.Router();

router.use(authenticate);

router.get('/sms-log', requireMinRole('manager'), asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT l.*, c.full_name AS customer_name
     FROM sms_notifications_log l
     LEFT JOIN customers c ON c.id = l.customer_id
     ORDER BY l.created_at DESC
     LIMIT 100`
  );
  return ok(res, result.rows.map(mapSmsLog));
}));

router.post('/sms-sweep', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const summary = await runDueSmsSweep({ dueSoonDays: Number(req.body?.dueSoonDays || 2) });
  await writeAudit(pool, req.user.id, 'SYSTEM', 'SMS', 'due-sweep', `Manual SMS sweep: ${summary.sent} sent, ${summary.failed} failed`);
  return ok(res, summary);
}));

router.get('/', asyncHandler(async (req, res) => {
  const requestedUserId = req.query.userId || req.user.id;
  if (req.user.role !== 'admin' && requestedUserId !== req.user.id) {
    return fail(res, 403, 'You can only access your own notifications.');
  }
  const result = await pool.query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
    [requestedUserId]
  );
  return ok(res, result.rows.map(mapNotification));
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const notification = await client.query('SELECT * FROM notifications WHERE id = $1', [req.params.id]);
    if (!notification.rowCount) return null;
    if (req.user.role !== 'admin' && notification.rows[0].user_id !== req.user.id) return false;
    const updated = await client.query(
      'UPDATE notifications SET is_read = COALESCE($2, is_read) WHERE id = $1 RETURNING *',
      [req.params.id, req.body?.isRead]
    );
    await writeAudit(client, req.user.id, 'UPDATE', 'Notification', req.params.id, 'Updated notification state');
    return updated.rows[0];
  });
  if (result === null) return fail(res, 404, 'Notification not found.');
  if (result === false) return fail(res, 403, 'You can only update your own notifications.');
  return ok(res, mapNotification(result));
}));

router.post('/mark-all-read', asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    await client.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
    await writeAudit(client, req.user.id, 'UPDATE', 'Notification', req.user.id, 'Marked all notifications read');
  });
  return ok(res, null);
}));

export default router;

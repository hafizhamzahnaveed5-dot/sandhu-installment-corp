import bcrypt from 'bcryptjs';
import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { mapUser } from '../services/mappers.js';
import { newId } from '../utils/ids.js';
import { permissionsFor } from '../utils/permissions.js';
import { asyncHandler, fail, ok, pagination, paginationParams } from '../utils/respond.js';

const router = express.Router();

router.use(authenticate);

router.put('/me/password', asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return fail(res, 400, 'currentPassword and newPassword are required.');
  if (String(newPassword).length < 8) return fail(res, 400, 'New password must be at least 8 characters.');

  const existing = await pool.query('SELECT id, password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!existing.rowCount) return fail(res, 404, 'User not found.');

  const matches = await bcrypt.compare(currentPassword, existing.rows[0].password_hash);
  if (!matches) return fail(res, 400, 'Current password is incorrect.');

  if (!currentPassword || !newPassword) return fail(res, 400, 'Current and new passwords are required.');
  if (newPassword.length < 8) return fail(res, 400, 'New password must be at least 8 characters long.');

  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!result.rowCount) return fail(res, 404, 'User not found.');

  const matches = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!matches) return fail(res, 401, 'Incorrect current password.');

  const newHash = await bcrypt.hash(newPassword, 12);

  await withTransaction(async (client) => {
    await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [newHash, req.user.id]);
    await writeAudit(client, req.user.id, 'UPDATE', 'User', req.user.id, 'User changed their own password');
  });

  return ok(res, { message: 'Password updated successfully' });
}));

router.use(requireRole('admin'));

router.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = paginationParams(req);
  const count = await pool.query('SELECT count(*)::int AS total FROM users');
  const result = await pool.query(
    'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [pageSize, offset]
  );
  return ok(res, result.rows.map(mapUser), pagination(page, pageSize, count.rows[0].total));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, email, password, role = 'agent' } = req.body || {};
  let customerId = req.body.customerId || null;

  if (!name || !email || !password) return fail(res, 400, 'name, email, and password are required.');
  if (!['admin', 'manager', 'agent', 'customer'].includes(role)) return fail(res, 400, 'Invalid user role.');
  
  if (role !== 'customer') {
    customerId = null;
  } else if (!customerId) {
    return fail(res, 400, 'customerId is required for customer users.');
  }

  const id = newId('user');
  const passwordHash = await bcrypt.hash(password, 12);
  const permissions = permissionsFor(role);

  const row = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO users (id, name, email, password_hash, role, permissions, status, customer_id)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7)
       RETURNING *`,
      [id, name, email, passwordHash, role, JSON.stringify(permissions), customerId]
    );
    await writeAudit(client, req.user.id, 'CREATE', 'User', id, `Created user: ${email}`);
    return inserted.rows[0];
  }).catch((error) => {
    if (error.code === '23505') {
      if (error.constraint === 'users_email_key' || error.constraint === 'users_email_unique') {
        return Object.assign(new Error('Email already exists.'), { status: 409 });
      }
      if (error.constraint === 'idx_users_customer_id_unique') {
        return Object.assign(new Error('This customer already has a linked user account.'), { status: 400 });
      }
      // generic fallback for other unique violations
      return Object.assign(new Error('A unique constraint violation occurred.'), { status: 409 });
    }
    if (error.code === '23503') return Object.assign(new Error('Referenced customer does not exist.'), { status: 400 });
    throw error;
  });

  if (row instanceof Error) return fail(res, row.status, row.message);
  return ok(res, mapUser(row));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, role, status } = req.body;
  if (!name || !role || !status) return fail(res, 400, 'name, role, and status are required.');
  if (!['admin', 'manager', 'agent', 'customer'].includes(role)) return fail(res, 400, 'Invalid user role.');
  if (!['active', 'inactive'].includes(status)) return fail(res, 400, 'Invalid status.');

  const existing = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) return fail(res, 404, 'User not found.');

  // Prevent demoting or deactivating the last active admin
  if (existing.rows[0].role === 'admin' && (role !== 'admin' || status !== 'active')) {
    const adminCount = await pool.query(`SELECT count(*) FROM users WHERE role = 'admin' AND status = 'active' AND id != $1`, [req.params.id]);
    if (parseInt(adminCount.rows[0].count) === 0) {
      return fail(res, 400, 'Cannot demote or deactivate the last active admin account.');
    }
  }

  const permissions = permissionsFor(role);
  const row = await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE users SET name=$1, role=$2, status=$3, permissions=$4, updated_at=now() WHERE id=$5 RETURNING *`,
      [name, role, status, JSON.stringify(permissions), req.params.id]
    );
    await writeAudit(client, req.user.id, 'UPDATE', 'User', req.params.id, `Updated user: ${updated.rows[0].email}`);
    return updated.rows[0];
  });
  return ok(res, mapUser(row));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return fail(res, 400, 'You cannot delete your own account.');
  }

  const existing = await pool.query('SELECT role, email FROM users WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) return fail(res, 404, 'User not found.');

  if (existing.rows[0].role === 'admin') {
    const adminCount = await pool.query(`SELECT count(*) FROM users WHERE role = 'admin' AND status = 'active'`);
    if (parseInt(adminCount.rows[0].count) <= 1) {
      return fail(res, 400, 'Cannot delete the last active admin account.');
    }
  }

  const row = await withTransaction(async (client) => {
    const deleted = await client.query('DELETE FROM users WHERE id = $1 RETURNING *', [req.params.id]);
    await writeAudit(client, req.user.id, 'DELETE', 'User', req.params.id, `Deleted user: ${deleted.rows[0].email}`);
    return deleted.rows[0];
  });
  
  return ok(res, mapUser(row));
}));

export default router;

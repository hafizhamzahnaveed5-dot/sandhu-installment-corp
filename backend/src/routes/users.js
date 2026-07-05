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
  const { name, email, password, role = 'agent', customerId = null } = req.body || {};
  if (!name || !email || !password) return fail(res, 400, 'name, email, and password are required.');
  if (!['admin', 'manager', 'agent', 'customer'].includes(role)) return fail(res, 400, 'Invalid user role.');
  if (role === 'customer' && !customerId) return fail(res, 400, 'customerId is required for customer users.');

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
    if (error.code === '23505') return Object.assign(new Error('Email already exists.'), { status: 409 });
    if (error.code === '23503') return Object.assign(new Error('Referenced customer does not exist.'), { status: 400 });
    throw error;
  });

  if (row instanceof Error) return fail(res, row.status, row.message);
  return ok(res, mapUser(row));
}));

export default router;

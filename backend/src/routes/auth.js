import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool, withTransaction } from '../db.js';
import { config } from '../config.js';
import { asyncHandler, fail, ok } from '../utils/respond.js';
import { mapUser } from '../services/mappers.js';
import { writeAudit } from '../services/audit.js';

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 400, 'Email and password are required.');

  const result = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1) AND status = $2', [email, 'active']);
  const user = result.rows[0];
  if (!user) return fail(res, 401, 'Invalid email or password.');

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) return fail(res, 401, 'Invalid email or password.');

  const safeUser = mapUser(user);
  await withTransaction(async (client) => {
    await client.query('UPDATE users SET last_login = now(), updated_at = now() WHERE id = $1', [user.id]);
    await writeAudit(client, user.id, 'LOGIN', 'User', user.id, `User logged in: ${user.email}`);
  });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, customerId: user.customer_id },
    config.jwtSecret,
    { expiresIn: '8h' }
  );

  return ok(res, { user: { ...safeUser, lastLogin: new Date().toISOString() }, token });
}));

router.post('/forgot-password', asyncHandler(async (_req, res) => {
  return ok(res, null);
}));

export default router;

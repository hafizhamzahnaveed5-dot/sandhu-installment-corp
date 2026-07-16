import express from 'express';
import { pool } from '../db.js';
import { authenticate, requireMinRole, requireRole } from '../middleware/auth.js';
import { asyncHandler, fail, ok } from '../utils/respond.js';
import { newId } from '../utils/ids.js';
import { pgDateOnly, todayDateOnly, toDateOnly } from '../utils/dates.js';

const router = express.Router();

router.use(authenticate);
router.use(requireMinRole('agent'));

function normalizeType(value) {
  if (value === 'purchase' || value === 'expense' || value === 'payment_received') return value;
  return 'expense';
}

function parseDate(value) {
  return toDateOnly(value);
}

router.get('/', asyncHandler(async (req, res) => {
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  const type = String(req.query.type || 'all').toLowerCase();
  const allowedType = type === 'purchase' || type === 'expense' || type === 'payment_received' ? type : 'all';

  const values = [];
  const where = [];

  if (from) {
    values.push(from);
    where.push(`entry_date >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    where.push(`entry_date <= $${values.length}`);
  }
  if (allowedType !== 'all') {
    values.push(allowedType);
    where.push(`type = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT r.*, u.name AS created_by_name
     FROM roznamcha_entries r
     LEFT JOIN users u ON u.id = r.created_by
     ${whereSql}
     ORDER BY r.entry_date DESC, r.created_at DESC, r.id DESC`,
    values
  );

  return ok(res, result.rows.map((row) => ({
    id: row.id,
    entryDate: pgDateOnly(row.entry_date),
    type: row.type,
    description: row.description,
    amount: Number(row.amount),
    referencePlanId: row.reference_plan_id,
    referencePaymentId: row.reference_payment_id,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })));
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const today = todayDateOnly();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  const dateFilter = from || to;

  const summaryResult = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END), 0)::numeric AS purchase_total,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)::numeric AS expense_total,
       COALESCE(SUM(CASE WHEN type = 'payment_received' THEN amount ELSE 0 END), 0)::numeric AS payment_total,
       COALESCE(SUM(amount), 0)::numeric AS combined_total
     FROM roznamcha_entries
     WHERE ($1::date IS NULL OR entry_date >= $1)
       AND ($2::date IS NULL OR entry_date <= $2)`,
    [from, to]
  );
  const todayResult = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END), 0)::numeric AS purchase_total,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)::numeric AS expense_total,
       COALESCE(SUM(CASE WHEN type = 'payment_received' THEN amount ELSE 0 END), 0)::numeric AS payment_total,
       COALESCE(SUM(amount), 0)::numeric AS combined_total
     FROM roznamcha_entries
     WHERE entry_date = $1`,
    [today]
  );
  const monthlyResult = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END), 0)::numeric AS monthly_purchase_total,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)::numeric AS monthly_expense_total,
       COALESCE(SUM(CASE WHEN type = 'payment_received' THEN amount ELSE 0 END), 0)::numeric AS monthly_payment_total,
       COALESCE(SUM(amount), 0)::numeric AS monthly_combined_total
     FROM roznamcha_entries
     WHERE entry_date >= $1`,
    [monthStart]
  );
  const row = summaryResult.rows[0];
  const todayRow = todayResult.rows[0];
  const monthlyRow = monthlyResult.rows[0];
  return ok(res, {
    period: {
      purchaseTotal: Number(row.purchase_total || 0),
      expenseTotal: Number(row.expense_total || 0),
      paymentTotal: Number(row.payment_total || 0),
      combinedTotal: Number(row.combined_total || 0),
      net: Number((row.payment_total || 0) - ((row.purchase_total || 0) + (row.expense_total || 0))),
      label: dateFilter ? `${from || 'Start'} → ${to || 'Today'}` : 'Selected period',
    },
    today: {
      purchaseTotal: Number(todayRow.purchase_total || 0),
      expenseTotal: Number(todayRow.expense_total || 0),
      paymentTotal: Number(todayRow.payment_total || 0),
      combinedTotal: Number(todayRow.combined_total || 0),
      net: Number((todayRow.payment_total || 0) - ((todayRow.purchase_total || 0) + (todayRow.expense_total || 0))),
    },
    thisMonth: {
      purchaseTotal: Number(monthlyRow.monthly_purchase_total || 0),
      expenseTotal: Number(monthlyRow.monthly_expense_total || 0),
      paymentTotal: Number(monthlyRow.monthly_payment_total || 0),
      combinedTotal: Number(monthlyRow.monthly_combined_total || 0),
      net: Number((monthlyRow.monthly_payment_total || 0) - ((monthlyRow.monthly_purchase_total || 0) + (monthlyRow.monthly_expense_total || 0))),
    },
  });
}));

router.post('/', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const { date, description, amount, type } = req.body || {};
  const entryDate = parseDate(date || todayDateOnly());
  const normalizedType = normalizeType(type);
  const numericAmount = Number(amount || 0);

  if (!entryDate) return fail(res, 400, 'A valid date is required.');
  if (!description || String(description).trim() === '') return fail(res, 400, 'Description is required.');
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return fail(res, 400, 'Amount must be greater than 0.');

  const id = newId('roz');
  const result = await pool.query(
    `INSERT INTO roznamcha_entries (id, entry_date, type, description, amount, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, entryDate, normalizedType, String(description).trim(), numericAmount, req.user.id]
  );

  return ok(res, {
    id: result.rows[0].id,
    entryDate: pgDateOnly(result.rows[0].entry_date),
    type: result.rows[0].type,
    description: result.rows[0].description,
    amount: Number(result.rows[0].amount),
    referencePlanId: result.rows[0].reference_plan_id,
    createdBy: result.rows[0].created_by,
    createdAt: result.rows[0].created_at,
    updatedAt: result.rows[0].updated_at,
  });
}));

router.put('/:id', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const entryResult = await pool.query('SELECT * FROM roznamcha_entries WHERE id = $1', [req.params.id]);
  if (!entryResult.rowCount) return fail(res, 404, 'Entry not found.');
  const entry = entryResult.rows[0];
  if (entry.reference_plan_id || entry.reference_payment_id) {
    return fail(res, 400, 'Linked ledger entries are read-only. Edit the source payment or plan instead.');
  }

  const { date, description, amount } = req.body || {};
  const entryDate = parseDate(date || entry.entry_date);
  const numericAmount = Number(amount ?? entry.amount);
  if (!entryDate) return fail(res, 400, 'A valid date is required.');
  if (!description || String(description).trim() === '') return fail(res, 400, 'Description is required.');
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return fail(res, 400, 'Amount must be greater than 0.');

  const updated = await pool.query(
    `UPDATE roznamcha_entries
     SET entry_date = $1, description = $2, amount = $3, updated_at = now()
     WHERE id = $4
     RETURNING *`,
    [entryDate, String(description).trim(), numericAmount, req.params.id]
  );

  return ok(res, {
    id: updated.rows[0].id,
    entryDate: pgDateOnly(updated.rows[0].entry_date),
    type: updated.rows[0].type,
    description: updated.rows[0].description,
    amount: Number(updated.rows[0].amount),
    referencePlanId: updated.rows[0].reference_plan_id,
    createdBy: updated.rows[0].created_by,
    createdAt: updated.rows[0].created_at,
    updatedAt: updated.rows[0].updated_at,
  });
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const entryResult = await pool.query('SELECT * FROM roznamcha_entries WHERE id = $1', [req.params.id]);
  if (!entryResult.rowCount) return fail(res, 404, 'Entry not found.');
  const entry = entryResult.rows[0];
  if (entry.reference_plan_id || entry.reference_payment_id) {
    return fail(res, 400, 'Linked ledger entries cannot be deleted directly.');
  }

  await pool.query('DELETE FROM roznamcha_entries WHERE id = $1', [req.params.id]);
  return ok(res, { deleted: true, id: req.params.id });
}));

export default router;

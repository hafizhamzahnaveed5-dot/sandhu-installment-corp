import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, customerOwns, requireMinRole } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { mapPlan, mapSchedule } from '../services/mappers.js';
import { asyncHandler, fail, ok, pagination, paginationParams } from '../utils/respond.js';
import { newId } from '../utils/ids.js';

const router = express.Router();

router.use(authenticate);

function addPeriod(startDate, frequency, index) {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (frequency === 'daily') date.setUTCDate(date.getUTCDate() + index);
  else if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + index * 7);
  else date.setUTCMonth(date.getUTCMonth() + index);
  return date.toISOString().slice(0, 10);
}

async function ensurePlanAccess(req, planId) {
  const result = await pool.query('SELECT customer_id FROM installment_plans WHERE id = $1', [planId]);
  if (!result.rowCount) return { found: false, allowed: false };
  return { found: true, allowed: customerOwns(result.rows[0].customer_id, req), customerId: result.rows[0].customer_id };
}

router.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = paginationParams(req);
  const values = [];
  const where = [];

  if (req.user.role === 'customer') {
    values.push(req.user.customerId);
    where.push(`p.customer_id = $${values.length}`);
  } else if (req.query.customerId) {
    values.push(req.query.customerId);
    where.push(`p.customer_id = $${values.length}`);
  }
  if (req.query.status) {
    values.push(req.query.status);
    where.push(`p.status = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await pool.query(`SELECT count(*)::int AS total FROM installment_plans p ${whereSql}`, values);
  const rows = await pool.query(
    `SELECT p.*, c.full_name AS customer_name,
            (SELECT COALESCE(sum(markup_earned), 0) FROM installment_schedules WHERE plan_id = p.id) AS total_markup_earned
     FROM installment_plans p
     JOIN customers c ON c.id = p.customer_id
     ${whereSql}
     ORDER BY p.created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset]
  );

  return ok(res, rows.rows.map(mapPlan), pagination(page, pageSize, count.rows[0].total));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const access = await ensurePlanAccess(req, req.params.id);
  if (!access.found) return fail(res, 404, 'Plan not found.');
  if (!access.allowed) return fail(res, 403, 'Customers can only access their own installment plans.');

  const result = await pool.query(
    `SELECT p.*, c.full_name AS customer_name
     FROM installment_plans p
     JOIN customers c ON c.id = p.customer_id
     WHERE p.id = $1`,
    [req.params.id]
  );
  return ok(res, mapPlan(result.rows[0]));
}));

router.post('/', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const required = ['customerId', 'principalAmount', 'downPayment', 'numberOfInstallments', 'installmentAmount', 'frequency', 'startDate'];
  const missing = required.filter((field) => req.body?.[field] === undefined || req.body?.[field] === '');
  if (missing.length) return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

  const id = newId('plan');
  const principalAmount = Number(req.body.principalAmount);
  const downPayment = Number(req.body.downPayment);
  const installmentAmount = Number(req.body.installmentAmount);
  const numInstallments = Number(req.body.numberOfInstallments);
  const markup = Number(req.body.interestOrMarkup || 0);
  const markupShare = markup / numInstallments;
  const amountDuePerInstallment = installmentAmount + markupShare;
  const outstandingBalance = (installmentAmount * numInstallments) + markup;
  const netFinanced = Math.max(principalAmount - downPayment, 0);
  const principalShare = Number((netFinanced / numInstallments).toFixed(2));

  const row = await withTransaction(async (client) => {
    const customer = await client.query('SELECT id FROM customers WHERE id = $1', [req.body.customerId]);
    if (!customer.rowCount) throw Object.assign(new Error('Customer not found.'), { status: 404 });

    const inserted = await client.query(
      `INSERT INTO installment_plans
       (id, customer_id, product_id, principal_amount, down_payment, number_of_installments,
        installment_amount, frequency, start_date, status, interest_or_markup, markup_amount, outstanding_balance, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12,$13)
       RETURNING *`,
      [
        id, req.body.customerId, req.body.productId || null, req.body.principalAmount, req.body.downPayment,
        req.body.numberOfInstallments, req.body.installmentAmount, req.body.frequency, req.body.startDate,
        markup, markup, outstandingBalance, req.user.id,
      ]
    );

    for (let i = 1; i <= numInstallments; i += 1) {
      const principalDue = i === numInstallments
        ? Number((netFinanced - principalShare * (numInstallments - 1)).toFixed(2))
        : principalShare;
      await client.query(
        `INSERT INTO installment_schedules
         (id, plan_id, installment_number, due_date, amount_due, amount_paid, principal_due, principal_paid, markup_amount, markup_earned, status)
         VALUES ($1,$2,$3,$4,$5,0,$6,0,$7,0,'pending')`,
        [newId('sch'), id, i, addPeriod(req.body.startDate, req.body.frequency, i - 1), amountDuePerInstallment, principalDue, markupShare]
      );
    }

    await client.query(
      `UPDATE customers
       SET total_outstanding = (
         SELECT COALESCE(sum(outstanding_balance), 0) FROM installment_plans WHERE customer_id = $1
       ), updated_at = now()
       WHERE id = $1`,
      [req.body.customerId]
    );
    await writeAudit(client, req.user.id, 'CREATE', 'InstallmentPlan', id, `Created plan for customer ${req.body.customerId}`);
    return inserted.rows[0];
  }).catch((error) => {
    if (error.status) return error;
    throw error;
  });

  if (row instanceof Error) return fail(res, row.status, row.message);
  return ok(res, mapPlan(row));
}));

router.get('/:id/schedule', asyncHandler(async (req, res) => {
  const access = await ensurePlanAccess(req, req.params.id);
  if (!access.found) return fail(res, 404, 'Plan not found.');
  if (!access.allowed) return fail(res, 403, 'Customers can only access their own schedule.');

  const result = await pool.query(
    'SELECT * FROM installment_schedules WHERE plan_id = $1 ORDER BY installment_number ASC',
    [req.params.id]
  );
  return ok(res, result.rows.map(mapSchedule));
}));

export default router;

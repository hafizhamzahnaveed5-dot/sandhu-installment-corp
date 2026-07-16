import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, customerOwns, requireMinRole } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { mapPayment, mapPlan, mapSchedule } from '../services/mappers.js';
import { calculateSettlementBreakdown, performEarlySettlement } from '../services/settlement.js';
import { asyncHandler, fail, ok, pagination, paginationParams } from '../utils/respond.js';
import { newId } from '../utils/ids.js';
import { todayDateOnly, toDateOnly } from '../utils/dates.js';

const router = express.Router();

router.use(authenticate);

function addPeriod(startDate, frequency, index) {
  const base = toDateOnly(startDate);
  if (!base) throw Object.assign(new Error('Invalid start date.'), { status: 400 });
  const date = new Date(`${base}T00:00:00.000Z`);
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

function translateSqlError(error) {
  if (!error || typeof error !== 'object') return null;

  // PostgreSQL undefined column error code
  if (error.code === '42703') {
    if (typeof error.message === 'string' && /file_fee/i.test(error.message)) {
      return Object.assign(new Error('Database schema missing required column file_fee. Run the latest migration and redeploy the backend.'), { status: 500 });
    }
    return Object.assign(new Error('Database schema is missing a required column. Run migrations and retry.'), { status: 500 });
  }

  return null;
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
    if (req.query.status === 'overdue') {
      where.push(`EXISTS (
        SELECT 1 FROM installment_schedules s
        WHERE s.plan_id = p.id
          AND s.status NOT IN ('paid', 'settled')
          AND s.due_date < CURRENT_DATE
      )`);
    } else if (req.query.status === 'due-soon') {
      where.push(`EXISTS (
        SELECT 1 FROM installment_schedules s
        WHERE s.plan_id = p.id
          AND s.status NOT IN ('paid', 'settled')
          AND s.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '2 days'
      )`);
    } else {
      values.push(req.query.status);
      where.push(`p.status = $${values.length}`);
    }
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

router.delete('/:id', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const access = await ensurePlanAccess(req, req.params.id);
  if (!access.found) return fail(res, 404, 'Plan not found.');
  if (!access.allowed) return fail(res, 403, 'Customers can only access their own installment plans.');

  const deleted = await withTransaction(async (client) => {
    const planResult = await client.query('SELECT id, customer_id FROM installment_plans WHERE id = $1', [req.params.id]);
    if (!planResult.rowCount) throw Object.assign(new Error('Plan not found.'), { status: 404 });

    const plan = planResult.rows[0];
    const paymentCheck = await client.query(
      `SELECT count(*)::int AS payment_count,
              COALESCE(sum(amount), 0)::numeric AS collected_amount
       FROM payments
       WHERE plan_id = $1`,
      [req.params.id]
    );
    const paymentCount = Number(paymentCheck.rows[0].payment_count || 0);
    const collectedAmount = Number(paymentCheck.rows[0].collected_amount || 0);

    if (paymentCount > 0 || collectedAmount > 0) {
      throw Object.assign(new Error('This plan has recorded payment history and cannot be deleted. Please contact support or handle it manually.'), { status: 409 });
    }

    await client.query('DELETE FROM roznamcha_entries WHERE reference_plan_id = $1 OR reference_payment_id IN (SELECT id FROM payments WHERE plan_id = $1)', [req.params.id]);
    await client.query('DELETE FROM installment_schedules WHERE plan_id = $1', [req.params.id]);
    await client.query('DELETE FROM installment_plans WHERE id = $1', [req.params.id]);

    await client.query(
      `UPDATE customers
       SET total_outstanding = (
         SELECT COALESCE(sum(outstanding_balance), 0) FROM installment_plans WHERE customer_id = $1
       ), updated_at = now()
       WHERE id = $1`,
      [plan.customer_id]
    );

    await writeAudit(client, req.user.id, 'DELETE', 'InstallmentPlan', req.params.id, `Deleted plan for customer ${plan.customer_id}`);
    return { deletedPlanId: req.params.id, customerId: plan.customer_id };
  }).catch((error) => {
    if (error.status) return error;
    const translated = translateSqlError(error);
    if (translated) return translated;
    throw error;
  });

  if (deleted instanceof Error) return fail(res, deleted.status, deleted.message);
  return ok(res, deleted);
}));

router.post('/', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const required = ['customerId', 'principalAmount', 'purchaseCost', 'downPayment', 'installmentAmount', 'frequency', 'startDate'];
  const missing = required.filter((field) => req.body?.[field] === undefined || req.body?.[field] === '');
  if (missing.length) return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

  const round2 = (value) => Number(Number(value || 0).toFixed(2));

  // Plan ID matches customer's manual account/customer ID when available
  const customerRow = await pool.query('SELECT account_number FROM customers WHERE id = $1', [req.body.customerId]);
  if (!customerRow.rowCount) return fail(res, 404, 'Customer not found.');
  const accountNumber = String(customerRow.rows[0].account_number || '').trim();
  let id = accountNumber || newId('plan');
  if (accountNumber) {
    const taken = await pool.query('SELECT id FROM installment_plans WHERE id = $1', [accountNumber]);
    if (taken.rowCount) {
      let n = 2;
      while (n < 1000) {
        const candidate = `${accountNumber}-${n}`;
        const exists = await pool.query('SELECT id FROM installment_plans WHERE id = $1', [candidate]);
        if (!exists.rowCount) { id = candidate; break; }
        n += 1;
      }
      if (n >= 1000) id = newId('plan');
    }
  }

  const principalAmount    = Number(req.body.principalAmount);
  const discountAmount     = Number(req.body.discountAmount ?? 0);
  const purchaseCost       = Number(req.body.purchaseCost ?? req.body.principalAmount ?? 0);
  const fileFee            = Number(req.body.fileFee || 0);
  const downPayment        = Number(req.body.downPayment);
  const installmentAmount  = Number(req.body.installmentAmount);
  const interestRate       = Number(req.body.interestOrMarkup || 0); // percentage, e.g. 5.4

  if (discountAmount < 0) {
    return fail(res, 400, 'Discount amount must be zero or a positive number.');
  }
  if (discountAmount > principalAmount) {
    return fail(res, 400, 'Discount amount cannot exceed the invoice price.');
  }
  if (purchaseCost < 0 || purchaseCost > principalAmount) {
    return fail(res, 400, 'Purchase cost must be zero or positive and cannot exceed the invoice price.');
  }
  if (fileFee < 0) {
    return fail(res, 400, 'File fee must be zero or a positive number.');
  }
  if (installmentAmount <= 0) {
    return fail(res, 400, 'Installment amount must be greater than 0.');
  }

  const netFinanced        = round2(Math.max(principalAmount - downPayment, 0));
  const totalMarkup        = round2(principalAmount * interestRate / 100);
  const grossPayable       = round2(netFinanced + totalMarkup + fileFee);
  if (discountAmount >= grossPayable) {
    return fail(res, 400, 'Discount cannot be greater than or equal to the total payable amount.');
  }

  if (grossPayable <= 0) {
    return fail(res, 400, 'Total payable amount must be greater than 0.');
  }

  const regularInstallments = Math.floor(grossPayable / installmentAmount);
  const remainder = round2(grossPayable - (regularInstallments * installmentAmount));
  const numberOfInstallments = remainder > 0 ? regularInstallments + 1 : regularInstallments;
  const scheduleAmounts = Array(regularInstallments).fill(installmentAmount);
  if (remainder > 0) scheduleAmounts.push(remainder);
  if (scheduleAmounts.length === 0 && grossPayable > 0) scheduleAmounts.push(grossPayable);

  let discountRemaining = discountAmount;
  for (let i = scheduleAmounts.length - 1; i >= 0 && discountRemaining > 0; i -= 1) {
    const reduction = Math.min(scheduleAmounts[i], discountRemaining);
    scheduleAmounts[i] = round2(scheduleAmounts[i] - reduction);
    discountRemaining = round2(discountRemaining - reduction);
  }
  if (discountRemaining > 0) {
    return fail(res, 400, 'Discount cannot be applied without making the last installment invalid.');
  }

  const totalPayable = round2(scheduleAmounts.reduce((sum, amount) => sum + amount, 0));
  if (totalPayable <= 0) {
    return fail(res, 400, 'Total payable amount must be greater than 0.');
  }
  if (installmentAmount > totalPayable) {
    return fail(res, 400, 'Installment amount cannot be greater than total amount.');
  }

  const outstandingBalance = totalPayable;

  let markupAllocated = 0;
  const scheduleRows = scheduleAmounts.map((amountDue, idx) => {
    const isLast = idx === scheduleAmounts.length - 1;
    const markupAmount = isLast
      ? round2(totalMarkup - markupAllocated)
      : round2(totalMarkup * (amountDue / totalPayable));
    markupAllocated = round2(markupAllocated + markupAmount);
    const principalDue = round2(amountDue - markupAmount);
    if (principalDue < 0) {
      throw Object.assign(new Error('Installment amount is too small to cover markup.'), { status: 400 });
    }
    return { amountDue, markupAmount, principalDue };
  });

  const row = await withTransaction(async (client) => {
    const customer = await client.query('SELECT id FROM customers WHERE id = $1', [req.body.customerId]);
    if (!customer.rowCount) throw Object.assign(new Error('Customer not found.'), { status: 404 });

    const fileFeeColumn = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2
       LIMIT 1`,
      ['installment_plans', 'file_fee']
    );
    const hasFileFeeColumn = fileFeeColumn.rowCount > 0;

    const insertSqlWithFileFee = `INSERT INTO installment_plans
      (id, customer_id, product_id, principal_amount, purchase_cost, file_fee, down_payment, number_of_installments,
       installment_amount, frequency, start_date, status, interest_or_markup, markup_amount, outstanding_balance, discount_amount, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,$13,$14,$15,$16)
      RETURNING *`;

    const insertSqlWithoutFileFee = `INSERT INTO installment_plans
      (id, customer_id, product_id, principal_amount, purchase_cost, down_payment, number_of_installments,
       installment_amount, frequency, start_date, status, interest_or_markup, markup_amount, outstanding_balance, discount_amount, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12,$13,$14,$15)
      RETURNING *`;

    const insertParamsWithFileFee = [
      id, req.body.customerId, req.body.productId || null, req.body.principalAmount, purchaseCost, fileFee, req.body.downPayment,
      numberOfInstallments, req.body.installmentAmount, req.body.frequency, req.body.startDate,
      interestRate, totalMarkup, outstandingBalance, discountAmount, req.user.id,
    ];

    const insertParamsWithoutFileFee = [
      id, req.body.customerId, req.body.productId || null, req.body.principalAmount, purchaseCost, req.body.downPayment,
      numberOfInstallments, req.body.installmentAmount, req.body.frequency, req.body.startDate,
      interestRate, totalMarkup, outstandingBalance, discountAmount, req.user.id,
    ];

    const inserted = await client.query(
      hasFileFeeColumn ? insertSqlWithFileFee : insertSqlWithoutFileFee,
      hasFileFeeColumn ? insertParamsWithFileFee : insertParamsWithoutFileFee
    );

    const today = todayDateOnly();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 2);
    const dueSoonCutoff = toDateOnly(cutoff);
    const planStartDate = toDateOnly(req.body.startDate) || today;

    for (let i = 0; i < scheduleRows.length; i += 1) {
      const dueDate = addPeriod(planStartDate, req.body.frequency, i);
      const initialStatus = dueDate < today
        ? 'overdue'
        : dueDate <= dueSoonCutoff
          ? 'due-soon'
          : 'pending';

      await client.query(
        `INSERT INTO installment_schedules
         (id, plan_id, installment_number, due_date, amount_due, amount_paid, principal_due, principal_paid, markup_amount, markup_earned, status)
         VALUES ($1,$2,$3,$4,$5,0,$6,0,$7,0,$8)`,
        [newId('sch'), id, i + 1, dueDate, scheduleRows[i].amountDue, scheduleRows[i].principalDue, scheduleRows[i].markupAmount, initialStatus]
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

    try {
      await client.query(
        `INSERT INTO roznamcha_entries (id, entry_date, type, description, amount, reference_plan_id, created_by)
         VALUES ($1, $2, 'purchase', $3, $4, $5, $6)`,
        [newId('roz'), planStartDate, `Purchase cost for plan ${id}`, purchaseCost, id, req.user.id]
      );
    } catch (error) {
      console.error('Roznamcha auto-entry failed for plan creation:', error);
    }

    await writeAudit(client, req.user.id, 'CREATE', 'InstallmentPlan', id, `Created plan for customer ${req.body.customerId}`);
    return inserted.rows[0];
  }).catch((error) => {
    if (error.status) return error;
    const translated = translateSqlError(error);
    if (translated) return translated;
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

/**
 * GET /api/installment-plans/:id/settlement-preview
 * Returns the breakdown a staff member sees before confirming early settlement.
 * Accessible to managers and above (agents cannot initiate settlements).
 */
router.get('/:id/settlement-preview', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const access = await ensurePlanAccess(req, req.params.id);
  if (!access.found) return fail(res, 404, 'Plan not found.');
  if (!access.allowed) return fail(res, 403, 'Access denied.');

  const planResult = await pool.query('SELECT * FROM installment_plans WHERE id = $1', [req.params.id]);
  const plan = planResult.rows[0];
  if (plan.status === 'completed') return fail(res, 400, 'Plan is already completed.');

  // Use a single connection (not a transaction) for the read-only preview
  const client = await pool.connect();
  try {
    const breakdown = await calculateSettlementBreakdown(client, req.params.id);
    return ok(res, breakdown);
  } finally {
    client.release();
  }
}));

/**
 * POST /api/installment-plans/:id/settle
 * Execute a dedicated early settlement: one consolidated payment, all rows closed, plan completed.
 * Body: { method: 'cash'|'bank'|'online', notes?: string }
 */
router.post('/:id/settle', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const { method, notes, paidAt } = req.body || {};
  if (!method) return fail(res, 400, 'Payment method is required.');
  if (!['cash', 'bank', 'online'].includes(method)) return fail(res, 400, 'Invalid payment method.');

  const access = await ensurePlanAccess(req, req.params.id);
  if (!access.found) return fail(res, 404, 'Plan not found.');

  const planResult = await pool.query(
    'SELECT * FROM installment_plans WHERE id = $1',
    [req.params.id]
  );
  const plan = planResult.rows[0];
  if (plan.status === 'completed') return fail(res, 400, 'Plan is already completed.');
  if (plan.status === 'cancelled') return fail(res, 400, 'Cannot settle a cancelled plan.');

  const payment = await withTransaction(async (client) => {
    const asOf = paidAt || new Date();
    const breakdown = await calculateSettlementBreakdown(client, req.params.id, asOf);

    if (!breakdown.hasOpenRows) {
      throw Object.assign(new Error('All installments are already paid — nothing to settle.'), { status: 400 });
    }

    const result = await performEarlySettlement(client, {
      planId: req.params.id,
      customerId: plan.customer_id,
      amount: breakdown.settlementAmount,
      method,
      userId: req.user.id,
      notes,
      breakdown,
      paidAt: asOf,
    });

    return result;
  }).catch((err) => {
    if (err.status) return err;
    throw err;
  });

  if (payment instanceof Error) return fail(res, payment.status, payment.message);
  return ok(res, mapPayment(payment));
}));

export default router;

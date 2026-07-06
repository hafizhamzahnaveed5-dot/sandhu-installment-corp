import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, customerOwns, requireMinRole, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { mapCustomer, mapPayment, mapPlan } from '../services/mappers.js';
import { sendPaymentConfirmation } from '../services/sms.js';
import { newId, receiptNumber } from '../utils/ids.js';
import { asyncHandler, fail, ok, pagination, paginationParams } from '../utils/respond.js';

const router = express.Router();

router.use(authenticate);

function statusForUnpaidDueDateSql(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return `CASE
    WHEN ${prefix}due_date < CURRENT_DATE THEN 'overdue'
    WHEN ${prefix}due_date <= CURRENT_DATE + INTERVAL '2 days' THEN 'due-soon'
    ELSE 'pending'
  END`;
}

async function recalculateBalances(client, planId) {
  const sums = await client.query(
    `SELECT
       COALESCE(sum(amount_due), 0)::numeric AS total_due,
       COALESCE(sum(amount_paid), 0)::numeric AS total_paid
     FROM installment_schedules
     WHERE plan_id = $1`,
    [planId]
  );
  const outstanding = Number(sums.rows[0].total_due) - Number(sums.rows[0].total_paid);
  const status = outstanding <= 0 ? 'completed' : 'active';

  const plan = await client.query(
    `UPDATE installment_plans
     SET outstanding_balance = $2, status = $3, updated_at = now()
     WHERE id = $1
     RETURNING customer_id`,
    [planId, Math.max(outstanding, 0), status]
  );

  await client.query(
    `UPDATE customers
     SET total_outstanding = (
       SELECT COALESCE(sum(outstanding_balance), 0) FROM installment_plans WHERE customer_id = $1
     ), updated_at = now()
     WHERE id = $1`,
    [plan.rows[0].customer_id]
  );
}

router.post('/', requireMinRole('agent'), asyncHandler(async (req, res) => {
  const { planId, scheduleId, amount, method } = req.body || {};
  if (!planId || !scheduleId || !amount || !method) {
    return fail(res, 400, 'planId, scheduleId, amount, and method are required.');
  }

  const payment = await withTransaction(async (client) => {
    const schedule = await client.query(
      `SELECT s.*, p.customer_id, p.number_of_installments
       FROM installment_schedules s
       JOIN installment_plans p ON p.id = s.plan_id
       WHERE s.id = $1 AND s.plan_id = $2
       FOR UPDATE`,
      [scheduleId, planId]
    );
    if (!schedule.rowCount) throw Object.assign(new Error('Schedule row not found for this plan.'), { status: 404 });

    const scheduleRow = schedule.rows[0];
    if (scheduleRow.status === 'settled') throw Object.assign(new Error('This schedule row was closed by early settlement.'), { status: 400 });

    const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
    const paidAtDate = paidAt.toISOString().slice(0, 10);

    const schedules = await client.query(
      `SELECT *
       FROM installment_schedules
       WHERE plan_id = $1
       ORDER BY installment_number ASC
       FOR UPDATE`,
      [planId]
    );

    const principalTotal = schedules.rows.reduce((sum, row) => sum + Number(row.principal_due || 0), 0);
    const markupEarnedThroughPaymentDate = schedules.rows
      .filter((row) => String(row.due_date?.toISOString?.().slice(0, 10) || row.due_date) <= paidAtDate)
      .reduce((sum, row) => sum + Number(row.markup_amount || 0), 0);
    const paidBefore = schedules.rows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
    const settlementRequired = principalTotal + markupEarnedThroughPaymentDate;
    const futureOpenRows = schedules.rows.filter((row) => {
      const dueDate = String(row.due_date?.toISOString?.().slice(0, 10) || row.due_date);
      return dueDate > paidAtDate && row.status !== 'paid' && row.status !== 'settled';
    });
    const isEarlySettlement = futureOpenRows.length > 0 && paidBefore + Number(amount) >= settlementRequired;

    const sequence = await client.query(`SELECT nextval('payment_receipt_seq')::int AS next_number`);
    const inserted = await client.query(
      `INSERT INTO payments
       (id, plan_id, schedule_id, customer_id, amount, method, received_by, receipt_number, paid_at, notes, is_early_settlement, markup_waived)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz, now()),$10,$11,$12)
       RETURNING *`,
      [
        newId('pay'), planId, scheduleId, scheduleRow.customer_id, amount, method, req.user.id,
        receiptNumber(sequence.rows[0].next_number), req.body.paidAt || null, req.body.notes || '',
        isEarlySettlement, 0,
      ]
    );

    if (isEarlySettlement) {
      const waiveResult = await client.query(
        `UPDATE installment_schedules
         SET amount_due = principal_due,
             amount_paid = principal_due,
             principal_paid = principal_due,
             markup_earned = 0,
             markup_waived = markup_amount,
             status = 'settled',
             paid_date = COALESCE(paid_date, $2),
             closed_reason = 'early-settlement',
             updated_at = now()
         WHERE plan_id = $1
           AND due_date > $3::date
           AND status <> 'paid'
         RETURNING markup_waived`,
        [planId, paidAt, paidAtDate]
      );
      const markupWaived = waiveResult.rows.reduce((sum, row) => sum + Number(row.markup_waived || 0), 0);

      await client.query(
        `UPDATE installment_schedules
         SET amount_paid = amount_due,
             principal_paid = principal_due,
             markup_earned = markup_amount,
             status = 'paid',
             paid_date = COALESCE(paid_date, $2),
             closed_reason = COALESCE(closed_reason, 'early-settlement-paid-through-date'),
             updated_at = now()
         WHERE plan_id = $1
           AND due_date <= $3::date
           AND status <> 'settled'`,
        [planId, paidAt, paidAtDate]
      );

      await client.query(
        `UPDATE payments
         SET markup_waived = $2
         WHERE id = $1`,
        [inserted.rows[0].id, markupWaived]
      );
      inserted.rows[0].markup_waived = markupWaived;

      await client.query(
        `UPDATE installment_plans
         SET outstanding_balance = 0,
             status = 'completed',
             markup_waived = $2,
             settled_early_at = $3,
             settlement_note = $4,
             updated_at = now()
         WHERE id = $1`,
        [planId, markupWaived, paidAt, 'Plan settled early; remaining future markup waived.']
      );

      await client.query(
        `UPDATE customers
         SET total_outstanding = (
           SELECT COALESCE(sum(outstanding_balance), 0) FROM installment_plans WHERE customer_id = $1
         ), updated_at = now()
         WHERE id = $1`,
        [scheduleRow.customer_id]
      );

      await writeAudit(client, req.user.id, 'UPDATE', 'InstallmentPlan', planId, `Plan settled early; PKR ${markupWaived} markup waived`);
      await writeAudit(client, req.user.id, 'CREATE', 'Payment', inserted.rows[0].id, `Early settlement payment of PKR ${amount} recorded`);
      return inserted.rows[0];
    }

    const nextPaid = Number(scheduleRow.amount_paid) + Number(amount);
    const amountDue = Number(scheduleRow.amount_due);
    const principalDue = Number(scheduleRow.principal_due || 0);
    const markupDue = Number(scheduleRow.markup_amount || 0);
    const paidRatio = amountDue > 0 ? Math.min(nextPaid / amountDue, 1) : 0;
    const principalPaid = Number((principalDue * paidRatio).toFixed(2));
    const markupEarned = Number((markupDue * paidRatio).toFixed(2));
    const nextStatus = nextPaid >= amountDue ? 'paid' : 'partial';
    const paidDate = nextStatus === 'paid' ? paidAt : null;

    await client.query(
      `UPDATE installment_schedules
       SET amount_paid = $2,
           principal_paid = $3,
           markup_earned = $4,
           status = $5,
           paid_date = COALESCE($6, paid_date),
           closed_reason = NULL,
           updated_at = now()
       WHERE id = $1`,
      [scheduleId, nextPaid, principalPaid, markupEarned, nextStatus, paidDate]
    );
    await recalculateBalances(client, planId);
    await writeAudit(client, req.user.id, 'CREATE', 'Payment', inserted.rows[0].id, `Payment of PKR ${amount} recorded`);
    return inserted.rows[0];
  }).catch((error) => {
    if (error.status) return error;
    throw error;
  });

  if (payment instanceof Error) return fail(res, payment.status, payment.message);
  sendPaymentConfirmation(payment).catch((error) => {
    console.error('[sms] payment confirmation failed:', error);
  });
  return ok(res, mapPayment(payment));
}));

router.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = paginationParams(req);
  const values = [];
  const where = [];

  if (req.user.role === 'customer') {
    values.push(req.user.customerId);
    where.push(`p.customer_id = $${values.length}`);
  }
  if (req.query.planId) {
    values.push(req.query.planId);
    where.push(`p.plan_id = $${values.length}`);
  }
  if (req.query.dateFrom) {
    values.push(req.query.dateFrom);
    where.push(`p.paid_at >= $${values.length}`);
  }
  if (req.query.dateTo) {
    values.push(req.query.dateTo);
    where.push(`p.paid_at <= $${values.length}`);
  }

  where.push(`p.status = 'posted'`);
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const count = await pool.query(`SELECT count(*)::int AS total FROM payments p ${whereSql}`, values);
  const result = await pool.query(
    `SELECT p.*,
       latest_sms.status AS sms_status
     FROM payments p
     LEFT JOIN LATERAL (
       SELECT status
       FROM sms_notifications_log l
       WHERE l.reference_type = 'payment'
         AND l.reference_id = p.id
         AND l.alert_type = 'payment-confirmation'
       ORDER BY l.created_at DESC
       LIMIT 1
     ) latest_sms ON true
     ${whereSql}
     ORDER BY p.paid_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset]
  );

  return ok(res, result.rows.map(mapPayment), pagination(page, pageSize, count.rows[0].total));
}));

router.put('/:id/reverse', requireRole('admin'), asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) return fail(res, 400, 'A reversal reason of at least 5 characters is required.');

  const payment = await withTransaction(async (client) => {
    const paymentResult = await client.query(
      `SELECT *
       FROM payments
       WHERE id = $1
       FOR UPDATE`,
      [req.params.id]
    );
    if (!paymentResult.rowCount) throw Object.assign(new Error('Payment not found.'), { status: 404 });
    const row = paymentResult.rows[0];
    if (row.status === 'reversed') throw Object.assign(new Error('Payment is already reversed.'), { status: 400 });

    const scheduleResult = await client.query(
      `SELECT *
       FROM installment_schedules
       WHERE id = $1
       FOR UPDATE`,
      [row.schedule_id]
    );
    if (!scheduleResult.rowCount) throw Object.assign(new Error('Payment schedule row not found.'), { status: 404 });

    const schedule = scheduleResult.rows[0];
    const nextPaid = Math.max(Number(schedule.amount_paid || 0) - Number(row.amount || 0), 0);
    const amountDue = Number(schedule.amount_due || 0);
    const paidRatio = amountDue > 0 ? Math.min(nextPaid / amountDue, 1) : 0;
    const principalPaid = Number((Number(schedule.principal_due || 0) * paidRatio).toFixed(2));
    const markupEarned = Number((Number(schedule.markup_amount || 0) * paidRatio).toFixed(2));
    const nextStatus = nextPaid > 0 ? 'partial' : null;

    await client.query(
      `UPDATE payments
       SET status = 'reversed',
           reversed_at = now(),
           reversed_by = $2,
           reversal_reason = $3
       WHERE id = $1`,
      [row.id, req.user.id, reason]
    );

    if (row.is_early_settlement) {
      await client.query(
        `UPDATE installment_schedules
         SET amount_paid = 0,
             amount_due = principal_due + markup_amount,
             principal_paid = 0,
             markup_earned = 0,
             markup_waived = 0,
             status = ${statusForUnpaidDueDateSql()},
             paid_date = NULL,
             closed_reason = NULL,
             updated_at = now()
         WHERE plan_id = $1
           AND closed_reason IN ('early-settlement', 'early-settlement-paid-through-date')`,
        [row.plan_id]
      );

      await client.query(
        `UPDATE installment_plans
         SET markup_waived = 0,
             settled_early_at = NULL,
             settlement_note = NULL,
             status = 'active',
             updated_at = now()
         WHERE id = $1`,
        [row.plan_id]
      );
    } else {
      await client.query(
        `UPDATE installment_schedules
         SET amount_paid = $2,
             principal_paid = $3,
             markup_earned = $4,
             status = COALESCE($5, ${statusForUnpaidDueDateSql()}),
             paid_date = CASE WHEN $2 <= 0 THEN NULL ELSE paid_date END,
             updated_at = now()
         WHERE id = $1`,
        [row.schedule_id, nextPaid, principalPaid, markupEarned, nextStatus]
      );
    }

    await recalculateBalances(client, row.plan_id);
    await writeAudit(client, req.user.id, 'UPDATE', 'Payment', row.id, `Reversed payment ${row.receipt_number}. Reason: ${reason}`);

    const updated = await client.query('SELECT * FROM payments WHERE id = $1', [row.id]);
    return updated.rows[0];
  }).catch((error) => {
    if (error.status) return error;
    throw error;
  });

  if (payment instanceof Error) return fail(res, payment.status, payment.message);
  return ok(res, mapPayment(payment));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT p.*,
       latest_sms.status AS sms_status
     FROM payments p
     LEFT JOIN LATERAL (
       SELECT status
       FROM sms_notifications_log l
       WHERE l.reference_type = 'payment'
         AND l.reference_id = p.id
         AND l.alert_type = 'payment-confirmation'
       ORDER BY l.created_at DESC
       LIMIT 1
     ) latest_sms ON true
     WHERE p.id = $1`,
    [req.params.id]
  );
  if (!result.rowCount) return fail(res, 404, 'Payment not found.');
  const payment = result.rows[0];
  if (!customerOwns(payment.customer_id, req)) return fail(res, 403, 'Customers can only access their own payments.');

  const plan = await pool.query(
    `SELECT p.*, c.full_name AS customer_name FROM installment_plans p JOIN customers c ON c.id = p.customer_id WHERE p.id = $1`,
    [payment.plan_id]
  );
  const customer = await pool.query('SELECT * FROM customers WHERE id = $1', [payment.customer_id]);
  return ok(res, { ...mapPayment(payment), plan: mapPlan(plan.rows[0]), customer: mapCustomer(customer.rows[0]) });
}));

export default router;

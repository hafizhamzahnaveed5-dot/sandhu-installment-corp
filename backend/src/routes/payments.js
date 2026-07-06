import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, customerOwns, requireMinRole } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { mapCustomer, mapPayment, mapPlan } from '../services/mappers.js';
import { sendPaymentConfirmation } from '../services/sms.js';
import { newId, receiptNumber } from '../utils/ids.js';
import { asyncHandler, fail, ok, pagination, paginationParams } from '../utils/respond.js';

const router = express.Router();

router.use(authenticate);

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
      `SELECT s.*, p.customer_id
       FROM installment_schedules s
       JOIN installment_plans p ON p.id = s.plan_id
       WHERE s.id = $1 AND s.plan_id = $2
       FOR UPDATE`,
      [scheduleId, planId]
    );
    if (!schedule.rowCount) throw Object.assign(new Error('Schedule row not found for this plan.'), { status: 404 });

    const scheduleRow = schedule.rows[0];
    const nextPaid = Number(scheduleRow.amount_paid) + Number(amount);
    const nextStatus = nextPaid >= Number(scheduleRow.amount_due) ? 'paid' : 'partial';
    const paidDate = nextStatus === 'paid' ? new Date() : null;

    const sequence = await client.query(`SELECT nextval('payment_receipt_seq')::int AS next_number`);
    const inserted = await client.query(
      `INSERT INTO payments
       (id, plan_id, schedule_id, customer_id, amount, method, received_by, receipt_number, paid_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz, now()),$10)
       RETURNING *`,
      [
        newId('pay'), planId, scheduleId, scheduleRow.customer_id, amount, method, req.user.id,
        receiptNumber(sequence.rows[0].next_number), req.body.paidAt || null, req.body.notes || '',
      ]
    );

    await client.query(
      `UPDATE installment_schedules
       SET amount_paid = $2, status = $3, paid_date = COALESCE($4, paid_date), updated_at = now()
       WHERE id = $1`,
      [scheduleId, nextPaid, nextStatus, paidDate]
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

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
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

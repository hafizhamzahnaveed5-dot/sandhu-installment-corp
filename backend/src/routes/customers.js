import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, customerOwns, requireMinRole, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { mapCustomer } from '../services/mappers.js';
import { asyncHandler, fail, ok, pagination, paginationParams } from '../utils/respond.js';
import { newId } from '../utils/ids.js';

const router = express.Router();
const activePlanStatuses = ['active', 'overdue', 'due-soon', 'pending', 'defaulted'];

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = paginationParams(req);
  const values = [];
  const where = [];
  const viewCosts = req.query.view === 'costs';

  if (req.user.role === 'customer') {
    values.push(req.user.customerId);
    where.push(`c.id = $${values.length}`);
  }
  if (req.query.search) {
    values.push(`%${req.query.search}%`);
    where.push(`(c.full_name ILIKE $${values.length} OR c.phone ILIKE $${values.length} OR c.city ILIKE $${values.length} OR c.account_number ILIKE $${values.length})`);
  }
  if (req.query.status) {
    values.push(req.query.status);
    where.push(`c.status = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await pool.query(`SELECT count(*)::int AS total FROM customers c ${whereSql}`, values);

  const rows = await pool.query(
    viewCosts
      ? `SELECT c.*, COALESCE(tc.total_purchase_cost, 0)::numeric AS total_purchase_cost, COALESCE(tc.total_cost_gap, 0)::numeric AS total_cost_gap
         FROM customers c
         LEFT JOIN (
           SELECT customer_id, SUM(purchase_cost)::numeric AS total_purchase_cost,
                  SUM(principal_amount - purchase_cost)::numeric AS total_cost_gap
           FROM installment_plans
           GROUP BY customer_id
         ) tc ON tc.customer_id = c.id
         ${whereSql}
         ORDER BY c.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`
      : `SELECT c.* FROM customers c ${whereSql} ORDER BY c.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset]
  );

  return ok(res, rows.rows.map(mapCustomer), pagination(page, pageSize, count.rows[0].total));
}));

/** Admin-only: list customers with zero outstanding (candidates for cleanup). */
router.get('/admin/zero-outstanding', requireRole('admin'), asyncHandler(async (_req, res) => {
  const result = await pool.query(`
    SELECT c.*,
           (SELECT count(*)::int FROM installment_plans WHERE customer_id = c.id) AS plan_count,
           (SELECT count(*)::int FROM payments WHERE customer_id = c.id) AS payment_count
    FROM customers c
    WHERE COALESCE(c.total_outstanding, 0) = 0
    ORDER BY c.full_name ASC
  `);
  return ok(res, result.rows.map((row) => ({
    ...mapCustomer(row),
    planCount: row.plan_count,
    paymentCount: row.payment_count,
  })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  if (!customerOwns(req.params.id, req)) return fail(res, 403, 'Customers can only access their own customer record.');
  const result = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!result.rowCount) return fail(res, 404, 'Customer not found.');
  return ok(res, mapCustomer(result.rows[0]));
}));

router.post('/', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const { fullName, phone } = req.body || {};
  if (!fullName || !phone) return fail(res, 400, 'Customer fullName and phone are required.');

  const customer = {
    id: newId('cust'),
    fullName,
    accountNumber: req.body.accountNumber || null,
    cnicOrId: req.body.cnicOrId || null,
    phone,
    email: req.body.email || null,
    address: req.body.address || null,
    city: req.body.city || null,
    status: req.body.status || 'active',
    guarantorName: req.body.guarantorName || null,
    guarantorPhone: req.body.guarantorPhone || null,
    documents: req.body.documents || [],
    creditScore: req.body.creditScore || 0,
    totalOutstanding: req.body.totalOutstanding || 0,
    smsAlertsEnabled: req.body.smsAlertsEnabled ?? true,
    notes: req.body.notes || null,
  };

  if (customer.accountNumber) {
    const existing = await pool.query('SELECT id FROM customers WHERE account_number = $1', [customer.accountNumber]);
    if (existing.rowCount) {
      return fail(res, 409, 'Account Number already exists. Please choose a unique Account Number.');
    }
  }

  const row = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO customers
       (id, full_name, account_number, cnic_or_id, phone, email, address, city, status, guarantor_name, guarantor_phone, documents, credit_score, total_outstanding, sms_alerts_enabled, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        customer.id, customer.fullName, customer.accountNumber, customer.cnicOrId, customer.phone, customer.email, customer.address,
        customer.city, customer.status, customer.guarantorName, customer.guarantorPhone,
        JSON.stringify(customer.documents), customer.creditScore, customer.totalOutstanding, customer.smsAlertsEnabled, customer.notes,
      ]
    );
    await writeAudit(client, req.user.id, 'CREATE', 'Customer', customer.id, `Created customer: ${customer.fullName}`);
    return inserted.rows[0];
  });

  return ok(res, mapCustomer(row));
}));

router.put('/:id', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const existing = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) return fail(res, 404, 'Customer not found.');

  const source = { ...mapCustomer(existing.rows[0]), ...req.body };
  const row = await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE customers SET
        full_name=$2, account_number=$3, cnic_or_id=$4, phone=$5, email=$6, address=$7, city=$8, status=$9,
        guarantor_name=$10, guarantor_phone=$11, documents=$12, credit_score=$13,
        total_outstanding=$14, sms_alerts_enabled=$15, notes=$16, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [
        req.params.id, source.fullName, source.accountNumber || null, source.cnicOrId, source.phone, source.email, source.address,
        source.city, source.status, source.guarantorName, source.guarantorPhone,
        JSON.stringify(source.documents || []), source.creditScore || 0, source.totalOutstanding || 0,
        source.smsAlertsEnabled ?? true, source.notes,
      ]
    );
    await writeAudit(client, req.user.id, 'UPDATE', 'Customer', req.params.id, `Updated customer: ${source.fullName}`);
    return updated.rows[0];
  });

  return ok(res, mapCustomer(row));
}));

router.delete('/:id', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const existing = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) return fail(res, 404, 'Customer not found.');

  const outstanding = Number(existing.rows[0].total_outstanding || 0);
  const forceZero = req.query.forceZero === 'true' || req.body?.forceZero === true;

  // Admin may purge fully settled customers (outstanding = 0) including history.
  if (forceZero) {
    if (req.user.role !== 'admin') {
      return fail(res, 403, 'Only admins can delete settled customers with history.');
    }
    if (outstanding > 0) {
      return fail(res, 409, 'Customer still has outstanding balance and cannot be deleted.');
    }

    const row = await withTransaction(async (client) => {
      const locked = await client.query(
        `SELECT * FROM customers WHERE id = $1 AND COALESCE(total_outstanding, 0) = 0 FOR UPDATE`,
        [req.params.id]
      );
      if (!locked.rowCount) {
        throw Object.assign(new Error('Customer outstanding changed; delete aborted.'), { status: 409 });
      }

      const plans = await client.query('SELECT id FROM installment_plans WHERE customer_id = $1', [req.params.id]);
      const planIds = plans.rows.map((r) => r.id);
      const payments = await client.query('SELECT id FROM payments WHERE customer_id = $1', [req.params.id]);
      const paymentIds = payments.rows.map((r) => r.id);

      if (paymentIds.length) {
        await client.query('DELETE FROM roznamcha_entries WHERE reference_payment_id = ANY($1)', [paymentIds]);
      }
      if (planIds.length) {
        await client.query('DELETE FROM roznamcha_entries WHERE reference_plan_id = ANY($1)', [planIds]);
        await client.query('DELETE FROM installment_schedules WHERE plan_id = ANY($1)', [planIds]);
      }
      await client.query('DELETE FROM payments WHERE customer_id = $1', [req.params.id]);
      await client.query('DELETE FROM installment_plans WHERE customer_id = $1', [req.params.id]);
      await client.query('DELETE FROM sms_notifications_log WHERE customer_id = $1', [req.params.id]);
      await client.query('UPDATE users SET customer_id = NULL WHERE customer_id = $1', [req.params.id]);

      const deleted = await client.query('DELETE FROM customers WHERE id = $1 RETURNING *', [req.params.id]);
      await writeAudit(client, req.user.id, 'DELETE', 'Customer', req.params.id, `Deleted settled customer (0 outstanding): ${deleted.rows[0].full_name}`);
      return deleted.rows[0];
    });

    return ok(res, mapCustomer(row));
  }

  const active = await pool.query(
    'SELECT id FROM installment_plans WHERE customer_id = $1 AND status = ANY($2::text[]) LIMIT 1',
    [req.params.id, activePlanStatuses]
  );
  if (active.rowCount) {
    return fail(res, 409, 'This customer has active installment plans and cannot be deleted. Resolve or cancel those plans first.');
  }

  const planHistory = await pool.query(
    'SELECT id FROM installment_plans WHERE customer_id = $1 LIMIT 1',
    [req.params.id]
  );
  const paymentHistory = await pool.query(
    'SELECT id FROM payments WHERE customer_id = $1 LIMIT 1',
    [req.params.id]
  );
  if (planHistory.rowCount || paymentHistory.rowCount) {
    return fail(res, 409, 'This customer has installment history and cannot be permanently deleted. Mark them inactive instead.');
  }

  const row = await withTransaction(async (client) => {
    const deleted = await client.query('DELETE FROM customers WHERE id = $1 RETURNING *', [req.params.id]);
    if (!deleted.rowCount) return null;
    await writeAudit(client, req.user.id, 'DELETE', 'Customer', req.params.id, `Deleted customer: ${deleted.rows[0].full_name}`);
    return deleted.rows[0];
  });

  if (!row) return fail(res, 404, 'Customer not found.');
  return ok(res, mapCustomer(row));
}));

export default router;

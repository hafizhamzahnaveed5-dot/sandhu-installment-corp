import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, customerOwns, requireMinRole } from '../middleware/auth.js';
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

  if (req.user.role === 'customer') {
    values.push(req.user.customerId);
    where.push(`id = $${values.length}`);
  }
  if (req.query.search) {
    values.push(`%${req.query.search}%`);
    where.push(`(full_name ILIKE $${values.length} OR phone ILIKE $${values.length} OR city ILIKE $${values.length})`);
  }
  if (req.query.status) {
    values.push(req.query.status);
    where.push(`status = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await pool.query(`SELECT count(*)::int AS total FROM customers ${whereSql}`, values);
  const rows = await pool.query(
    `SELECT * FROM customers ${whereSql} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset]
  );

  return ok(res, rows.rows.map(mapCustomer), pagination(page, pageSize, count.rows[0].total));
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

  const row = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO customers
       (id, full_name, cnic_or_id, phone, email, address, city, status, guarantor_name, guarantor_phone, documents, credit_score, total_outstanding, sms_alerts_enabled, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        customer.id, customer.fullName, customer.cnicOrId, customer.phone, customer.email, customer.address,
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
        full_name=$2, cnic_or_id=$3, phone=$4, email=$5, address=$6, city=$7, status=$8,
        guarantor_name=$9, guarantor_phone=$10, documents=$11, credit_score=$12,
        total_outstanding=$13, sms_alerts_enabled=$14, notes=$15, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [
        req.params.id, source.fullName, source.cnicOrId, source.phone, source.email, source.address,
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

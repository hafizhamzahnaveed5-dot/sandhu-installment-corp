/**
 * Deletes ONLY customers with total_outstanding = 0.
 * Customers with any outstanding balance are never touched.
 */
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const APPLY = process.argv.includes('--apply');

async function main() {
  const client = await pool.connect();
  try {
    const targets = await client.query(`
      SELECT c.id, c.full_name, c.account_number, c.total_outstanding, c.status,
             (SELECT count(*)::int FROM installment_plans WHERE customer_id = c.id) AS plans,
             (SELECT count(*)::int FROM payments WHERE customer_id = c.id) AS payments
      FROM customers c
      WHERE COALESCE(c.total_outstanding, 0) = 0
      ORDER BY c.full_name
    `);

    console.log(`Found ${targets.rowCount} zero-outstanding customer(s).`);
    for (const row of targets.rows) {
      console.log(`  ${row.full_name} | plans=${row.plans} payments=${row.payments} status=${row.status}`);
    }

    if (!targets.rowCount) {
      console.log('Nothing to delete.');
      return;
    }

    if (!APPLY) {
      console.log('\nDry-run only. Re-run with --apply to delete these customers and their related history.');
      return;
    }

    await client.query('BEGIN');
    const ids = targets.rows.map((r) => r.id);

    // Safety: re-check outstanding inside the transaction
    const unsafe = await client.query(
      `SELECT id, full_name, total_outstanding
       FROM customers
       WHERE id = ANY($1)
         AND COALESCE(total_outstanding, 0) <> 0
       FOR UPDATE`,
      [ids]
    );
    if (unsafe.rowCount) {
      throw new Error(`Abort: some customers now have outstanding > 0: ${unsafe.rows.map((r) => r.full_name).join(', ')}`);
    }

    const locked = await client.query(
      `SELECT id FROM customers WHERE id = ANY($1) AND COALESCE(total_outstanding, 0) = 0 FOR UPDATE`,
      [ids]
    );
    const safeIds = locked.rows.map((r) => r.id);

    const planIds = await client.query(
      `SELECT id FROM installment_plans WHERE customer_id = ANY($1)`,
      [safeIds]
    );
    const planIdList = planIds.rows.map((r) => r.id);

    const paymentIds = await client.query(
      `SELECT id FROM payments WHERE customer_id = ANY($1)`,
      [safeIds]
    );
    const paymentIdList = paymentIds.rows.map((r) => r.id);

    if (paymentIdList.length) {
      await client.query(
        `DELETE FROM roznamcha_entries WHERE reference_payment_id = ANY($1)`,
        [paymentIdList]
      );
    }
    if (planIdList.length) {
      await client.query(
        `DELETE FROM roznamcha_entries WHERE reference_plan_id = ANY($1)`,
        [planIdList]
      );
    }

    await client.query(`DELETE FROM payments WHERE customer_id = ANY($1)`, [safeIds]);
    if (planIdList.length) {
      await client.query(`DELETE FROM installment_schedules WHERE plan_id = ANY($1)`, [planIdList]);
    }
    await client.query(`DELETE FROM installment_plans WHERE customer_id = ANY($1)`, [safeIds]);
    await client.query(`DELETE FROM sms_notifications_log WHERE customer_id = ANY($1)`, [safeIds]);
    await client.query(`UPDATE users SET customer_id = NULL WHERE customer_id = ANY($1)`, [safeIds]);
    await client.query(
      `DELETE FROM audit_logs WHERE entity_type = 'Customer' AND entity_id = ANY($1)`,
      [safeIds]
    );

    const deleted = await client.query(
      `DELETE FROM customers WHERE id = ANY($1) AND COALESCE(total_outstanding, 0) = 0 RETURNING id, full_name`,
      [safeIds]
    );

    await client.query('COMMIT');
    console.log(`\nDeleted ${deleted.rowCount} zero-outstanding customer(s):`);
    for (const row of deleted.rows) console.log(`  - ${row.full_name}`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

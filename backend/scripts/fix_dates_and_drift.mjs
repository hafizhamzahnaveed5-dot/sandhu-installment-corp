import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const paymentMismatches = await client.query(`
      SELECT r.id AS roz_id, r.entry_date::date AS roz_date, p.paid_at::date AS paid_date,
             c.full_name, p.amount
      FROM roznamcha_entries r
      JOIN payments p ON p.id = r.reference_payment_id
      JOIN customers c ON c.id = p.customer_id
      WHERE r.type = 'payment_received'
        AND r.reference_payment_id IS NOT NULL
        AND r.entry_date::date <> p.paid_at::date
      ORDER BY p.paid_at
    `);
    console.log(`Payment date mismatches: ${paymentMismatches.rowCount}`);
    for (const row of paymentMismatches.rows.slice(0, 20)) {
      console.log(`  ${row.full_name} | roz=${row.roz_date?.toISOString?.().slice(0,10) || row.roz_date} → paid=${row.paid_date?.toISOString?.().slice(0,10) || row.paid_date} | ${row.amount}`);
    }

    const paymentFix = await client.query(`
      UPDATE roznamcha_entries r
      SET entry_date = p.paid_at::date,
          updated_at = now()
      FROM payments p
      WHERE r.type = 'payment_received'
        AND r.reference_payment_id = p.id
        AND r.entry_date::date <> p.paid_at::date
      RETURNING r.id
    `);
    console.log(`Fixed payment_received entry dates: ${paymentFix.rowCount}`);

    const purchaseFix = await client.query(`
      UPDATE roznamcha_entries r
      SET entry_date = p.start_date,
          updated_at = now()
      FROM installment_plans p
      WHERE r.type = 'purchase'
        AND r.reference_plan_id = p.id
        AND r.entry_date::date <> p.start_date::date
      RETURNING r.id
    `);
    console.log(`Fixed purchase entry dates: ${purchaseFix.rowCount}`);

    const driftBefore = await client.query(`
      SELECT c.id, c.full_name, c.total_outstanding,
             COALESCE((SELECT SUM(outstanding_balance) FROM installment_plans WHERE customer_id = c.id), 0) AS computed
      FROM customers c
      WHERE COALESCE(c.total_outstanding, 0) <> COALESCE((
        SELECT SUM(outstanding_balance) FROM installment_plans WHERE customer_id = c.id
      ), 0)
    `);
    console.log(`Outstanding drift before: ${driftBefore.rowCount}`);
    for (const row of driftBefore.rows) {
      console.log(`  ${row.full_name} | stored=${row.total_outstanding} computed=${row.computed}`);
    }

    const driftFix = await client.query(`
      UPDATE customers c
      SET total_outstanding = COALESCE((
            SELECT SUM(outstanding_balance) FROM installment_plans WHERE customer_id = c.id
          ), 0),
          updated_at = now()
      WHERE COALESCE(c.total_outstanding, 0) <> COALESCE((
        SELECT SUM(outstanding_balance) FROM installment_plans WHERE customer_id = c.id
      ), 0)
      RETURNING id, full_name, total_outstanding
    `);
    console.log(`Fixed outstanding drift: ${driftFix.rowCount}`);

    await client.query('COMMIT');
    console.log('All date/drift corrections committed.');
  } catch (err) {
    await client.query('ROLLBACK');
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

import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function q(label, sql, params = []) {
  const r = await pool.query(sql, params);
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(r.rows, null, 2));
  return r;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }
  console.log('DB connected (secrets redacted)');

  await q('customers', 'SELECT count(*)::int AS customers FROM customers');
  await q(
    'zero_outstanding',
    `SELECT count(*)::int AS zero_outstanding
     FROM customers
     WHERE COALESCE(total_outstanding, 0) = 0`
  );
  await q(
    'zero_outstanding_sample',
    `SELECT id, full_name, account_number, total_outstanding, status
     FROM customers
     WHERE COALESCE(total_outstanding, 0) = 0
     ORDER BY full_name
     LIMIT 20`
  );
  await q(
    'payment_date_mismatch',
    `SELECT count(*)::int AS payment_date_mismatch
     FROM roznamcha_entries r
     JOIN payments p ON p.id = r.reference_payment_id
     WHERE r.type = 'payment_received'
       AND r.entry_date::date <> p.paid_at::date`
  );
  await q(
    'purchase_date_mismatch',
    `SELECT count(*)::int AS purchase_date_mismatch
     FROM roznamcha_entries r
     JOIN installment_plans p ON p.id = r.reference_plan_id
     WHERE r.type = 'purchase'
       AND r.entry_date::date <> p.start_date::date`
  );
  await q(
    'roznamcha_by_type',
    `SELECT type, count(*)::int AS n FROM roznamcha_entries GROUP BY type ORDER BY type`
  );
  await q(
    'payments_without_roznamcha',
    `SELECT count(*)::int AS missing
     FROM payments p
     LEFT JOIN roznamcha_entries r ON r.reference_payment_id = p.id AND r.type = 'payment_received'
     WHERE p.status = 'posted' AND r.id IS NULL`
  );
  await q(
    'plans_without_roznamcha',
    `SELECT count(*)::int AS missing
     FROM installment_plans p
     LEFT JOIN roznamcha_entries r ON r.reference_plan_id = p.id AND r.type = 'purchase'
     WHERE r.id IS NULL`
  );
  await q(
    'outstanding_drift',
    `SELECT count(*)::int AS drifted
     FROM customers c
     WHERE COALESCE(c.total_outstanding, 0) <> COALESCE((
       SELECT SUM(outstanding_balance) FROM installment_plans WHERE customer_id = c.id
     ), 0)`
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

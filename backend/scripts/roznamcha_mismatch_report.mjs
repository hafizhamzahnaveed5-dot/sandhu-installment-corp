import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function toDateOnly(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

async function main() {
  console.log('Roznamcha mismatch dry-run report');
  console.log('Database:', process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ':***@') || 'not set');
  console.log('');

  const purchaseRows = await pool.query(`
    SELECT r.id AS roz_id,
           r.entry_date::date AS roz_entry_date,
           p.id AS plan_id,
           p.start_date::date AS plan_start_date,
           c.full_name AS customer_name,
           p.purchase_cost AS amount
    FROM roznamcha_entries r
    JOIN installment_plans p ON p.id = r.reference_plan_id
    JOIN customers c ON c.id = p.customer_id
    WHERE r.type = 'purchase' AND r.reference_plan_id IS NOT NULL
    ORDER BY p.start_date, r.entry_date, p.id
  `);

  const purchaseMismatches = purchaseRows.rows.filter((row) => {
    return toDateOnly(row.roz_entry_date) !== toDateOnly(row.plan_start_date);
  });

  console.log(`Purchase entry mismatches: ${purchaseMismatches.length}`);
  if (purchaseMismatches.length > 0) {
    console.log('plan_id | customer_name | roz_id | current_entry_date | expected_start_date | amount');
    for (const row of purchaseMismatches) {
      console.log(`${row.plan_id} | ${row.customer_name || ''} | ${row.roz_id} | ${toDateOnly(row.roz_entry_date)} | ${toDateOnly(row.plan_start_date)} | ${row.amount}`);
    }
  }

  console.log('');

  const paymentRows = await pool.query(`
    SELECT r.id AS roz_id,
           r.entry_date::date AS roz_entry_date,
           pay.id AS payment_id,
           pay.paid_at::date AS payment_paid_at,
           pay.plan_id,
           c.full_name AS customer_name,
           pay.amount
    FROM roznamcha_entries r
    JOIN payments pay ON pay.id = r.reference_payment_id
    JOIN customers c ON c.id = pay.customer_id
    WHERE r.type = 'payment_received' AND r.reference_payment_id IS NOT NULL
    ORDER BY pay.paid_at, r.entry_date, pay.id
  `);

  const paymentMismatches = paymentRows.rows.filter((row) => {
    return toDateOnly(row.roz_entry_date) !== toDateOnly(row.payment_paid_at);
  });

  console.log(`Payment_received entry mismatches: ${paymentMismatches.length}`);
  if (paymentMismatches.length > 0) {
    console.log('payment_id | customer_name | roz_id | current_entry_date | payment_paid_at | amount');
    for (const row of paymentMismatches) {
      console.log(`${row.payment_id} | ${row.customer_name || ''} | ${row.roz_id} | ${toDateOnly(row.roz_entry_date)} | ${toDateOnly(row.payment_paid_at)} | ${row.amount}`);
    }
  }

  await pool.end();
}

main().catch((error) => {
  console.error('Report failed:', error);
  process.exit(1);
});

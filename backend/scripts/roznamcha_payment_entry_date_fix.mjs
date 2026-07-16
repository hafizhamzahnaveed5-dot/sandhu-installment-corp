import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('Dry-run payment_received Roznamcha mismatch report and fix script');
  console.log('Database:', process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ':***@') || 'not set');

  const rows = await pool.query(`
    SELECT r.id AS roz_id,
           r.entry_date::date AS roz_date,
           p.id AS payment_id,
           p.paid_at::date AS paid_date,
           p.paid_at,
           c.full_name AS customer_name,
           p.amount
    FROM roznamcha_entries r
    JOIN payments p ON p.id = r.reference_payment_id
    JOIN customers c ON c.id = p.customer_id
    WHERE r.type = 'payment_received'
      AND r.reference_payment_id IS NOT NULL
      AND r.entry_date::date <> p.paid_at::date
    ORDER BY p.paid_at, r.entry_date
  `);

  console.log(`Found ${rows.rowCount} mismatches.`);
  for (const row of rows.rows) {
    console.log(`${row.payment_id} | ${row.customer_name || ''} | ${row.roz_id} | current_entry_date=${row.roz_date} | paid_at=${row.paid_date} | amount=${row.amount}`);
  }

  await pool.end();
}

main().catch((error) => {
  console.error('Payment mismatch report failed:', error);
  process.exit(1);
});
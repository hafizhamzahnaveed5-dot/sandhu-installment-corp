import dotenv from 'dotenv';
import pg from 'pg';
import { newId } from '../src/utils/ids.js';

dotenv.config({ path: 'backend/.env' });
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const missing = await pool.query(`
    SELECT p.id, p.amount, p.plan_id, p.customer_id, p.received_by,
           (p.paid_at AT TIME ZONE 'Asia/Karachi')::date AS entry_date,
           c.full_name AS customer_name
    FROM payments p
    LEFT JOIN roznamcha_entries r ON r.reference_payment_id = p.id
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE r.id IS NULL
      AND p.amount > 0
  `);

  console.log('Missing ledger rows:', missing.rowCount);
  let created = 0;
  for (const p of missing.rows) {
    const entryDate = typeof p.entry_date === 'string'
      ? p.entry_date.slice(0, 10)
      : p.entry_date?.toISOString?.().slice(0, 10);
    await pool.query(
      `INSERT INTO roznamcha_entries
         (id, entry_date, type, description, amount, reference_plan_id, reference_payment_id, created_by)
       VALUES ($1, $2::date, 'payment_received', $3, $4, $5, $6, $7)`,
      [
        newId('roz'),
        entryDate,
        `Installment payment received from ${p.customer_name || 'customer'} - Plan ${p.plan_id}`,
        p.amount,
        p.plan_id,
        p.id,
        p.received_by,
      ]
    );
    created += 1;
    console.log('Backfilled', p.id, p.amount, entryDate);
  }
  console.log('Done. Created', created);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await pool.end();
}

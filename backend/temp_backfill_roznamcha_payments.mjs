import crypto from 'crypto';
import 'dotenv/config';
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const dryRun = !apply;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function formatCurrency(amount) {
  return Number(amount || 0).toFixed(2);
}

async function main() {
  console.log(`Running Roznamcha payments backfill (${dryRun ? 'dry-run' : 'apply'})...`);
  console.log(`Database: ${process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ':***@') || 'not set'}`);

  const paymentsRes = await pool.query(`
    SELECT p.id, p.plan_id, p.amount, p.paid_at::date AS paid_date, c.full_name AS customer_name
    FROM payments p
    LEFT JOIN customers c ON c.id = p.customer_id
    ORDER BY p.paid_at ASC
  `);

  const payments = paymentsRes.rows;
  const toInsert = [];
  let existingCount = 0;

  for (const payment of payments) {
    const existing = await pool.query('SELECT id FROM roznamcha_entries WHERE reference_payment_id = $1 LIMIT 1', [payment.id]);
    if (existing.rowCount > 0) { existingCount += 1; continue; }
    toInsert.push({
      paymentId: payment.id,
      planId: payment.plan_id,
      customerName: payment.customer_name || 'Unknown',
      amount: Number(payment.amount || 0),
      entryDate: payment.paid_date ? payment.paid_date.toISOString().slice(0,10) : null,
      description: `Installment payment received from ${payment.customer_name || 'customer'} - Plan ${payment.plan_id}`,
    });
  }

  console.log(`Total payments: ${payments.length}`);
  console.log(`Payments already in Roznamcha: ${existingCount}`);
  console.log(`Payments missing Roznamcha entries: ${toInsert.length}`);

  if (toInsert.length === 0) {
    console.log('No missing entries found.');
    await pool.end();
    return;
  }

  console.log('\nWould insert the following entries:');
  for (const item of toInsert) {
    console.log(`- payment=${item.paymentId} | plan=${item.planId} | customer=${item.customerName} | amount=${formatCurrency(item.amount)} | date=${item.entryDate || 'unknown'} | desc=${item.description}`);
  }

  if (dryRun) {
    console.log('\nDry run complete. No rows were inserted.');
    await pool.end();
    return;
  }

  let insertedCount = 0;
  for (const item of toInsert) {
    const id = `roz-${crypto.randomUUID()}`;
    await pool.query(
      `INSERT INTO roznamcha_entries (id, entry_date, type, description, amount, reference_plan_id, reference_payment_id)
       VALUES ($1, $2, 'payment_received', $3, $4, $5, $6)`,
      [id, item.entryDate, item.description, item.amount, item.planId, item.paymentId]
    );
    insertedCount += 1;
  }

  console.log(`\nInserted ${insertedCount} Roznamcha payment entries.`);
  await pool.end();
}

main().catch((error) => {
  console.error('Roznamcha payments backfill failed:', error);
  process.exit(1);
});

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

function buildDescription(planId, customerName) {
  const safeName = customerName || 'customer';
  return `Purchase cost for ${safeName}'s plan ${planId}`;
}

function toDateOnly(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  return String(value).slice(0, 10);
}

async function main() {
  console.log(`Running Roznamcha backfill (${dryRun ? 'dry-run' : 'apply'})...`);
  console.log(`Database: ${process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ':***@') || 'not set'}`);

  const plansResult = await pool.query(`
    SELECT p.id,
           p.customer_id,
           p.purchase_cost,
           p.created_at,
           -- preferred_entry_date is computed in SQL to avoid JS timezone shifts
           TO_CHAR(
             COALESCE(
               p.start_date,
               (SELECT MIN(s.due_date) FROM installment_schedules s WHERE s.plan_id = p.id),
               p.created_at::date
             ),
             'YYYY-MM-DD'
           ) AS preferred_entry_date,
           c.full_name AS customer_name
    FROM installment_plans p
    LEFT JOIN customers c ON c.id = p.customer_id
    ORDER BY COALESCE(p.start_date, p.created_at) ASC
  `);

  const plans = plansResult.rows;
  const toInsert = [];
  let existingCount = 0;

  for (const plan of plans) {
    const existingResult = await pool.query(
      'SELECT id FROM roznamcha_entries WHERE reference_plan_id = $1 LIMIT 1',
      [plan.id]
    );

    if (existingResult.rowCount > 0) {
      existingCount += 1;
      continue;
    }

    const preferredDate = plan.preferred_entry_date || null;
    toInsert.push({
      planId: plan.id,
      customerName: plan.customer_name || 'Unknown',
      purchaseCost: Number(plan.purchase_cost || 0),
      entryDate: preferredDate,
      description: buildDescription(plan.id, plan.customer_name),
    });
  }

  console.log(`Total installment plans: ${plans.length}`);
  console.log(`Plans already linked to Roznamcha: ${existingCount}`);
  console.log(`Plans missing Roznamcha entries: ${toInsert.length}`);

  if (toInsert.length === 0) {
    console.log('No missing entries found.');
    await pool.end();
    return;
  }

  console.log('\nWould insert the following entries:');
  for (const item of toInsert) {
    console.log(`- plan=${item.planId} | customer=${item.customerName} | amount=${formatCurrency(item.purchaseCost)} | date=${item.entryDate || 'unknown'} | description=${item.description}`);
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
      `INSERT INTO roznamcha_entries (id, entry_date, type, description, amount, reference_plan_id)
       VALUES ($1, $2, 'purchase', $3, $4, $5)`,
      [id, item.entryDate, item.description, item.purchaseCost, item.planId]
    );
    insertedCount += 1;
  }

  console.log(`\nInserted ${insertedCount} Roznamcha entries.`);
  const verifyCount = await pool.query('SELECT count(*)::int AS total FROM roznamcha_entries WHERE type = $1 AND reference_plan_id IS NOT NULL', ['purchase']);
  console.log(`Linked purchase entries now present: ${verifyCount.rows[0].total}`);
  await pool.end();
}

main().catch((error) => {
  console.error('Roznamcha backfill failed:', error);
  process.exit(1);
});

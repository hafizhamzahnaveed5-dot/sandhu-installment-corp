import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('Fixing Roznamcha purchase entry dates using linked plan start_date...');
  console.log('Database:', process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ':***@') || 'not set');

  const before = await pool.query(`
    SELECT count(*)::int AS count
    FROM roznamcha_entries r
    JOIN installment_plans p ON p.id = r.reference_plan_id
    WHERE r.type = 'purchase'
      AND r.reference_plan_id IS NOT NULL
      AND r.entry_date::date <> p.start_date::date
  `);

  console.log('Mismatch count before update:', before.rows[0].count);

  const result = await pool.query(`
    UPDATE roznamcha_entries r
    SET entry_date = p.start_date
    FROM installment_plans p
    WHERE r.type = 'purchase'
      AND r.reference_plan_id = p.id
      AND r.entry_date::date <> p.start_date::date
    RETURNING r.id, r.reference_plan_id AS plan_id, r.entry_date, p.start_date
  `);

  console.log('Updated rows count:', result.rowCount);
  if (result.rowCount > 0) {
    console.log('Sample updated rows:');
    for (const row of result.rows.slice(0, 10)) {
      console.log(`${row.id} | plan=${row.plan_id} | new_entry_date=${row.entry_date?.toISOString?.().slice(0,10) || row.entry_date} | start_date=${row.start_date?.toISOString?.().slice(0,10) || row.start_date}`);
    }
  }

  const after = await pool.query(`
    SELECT count(*)::int AS count
    FROM roznamcha_entries r
    JOIN installment_plans p ON p.id = r.reference_plan_id
    WHERE r.type = 'purchase'
      AND r.reference_plan_id IS NOT NULL
      AND r.entry_date::date <> p.start_date::date
  `);
  console.log('Mismatch count after update:', after.rows[0].count);

  await pool.end();
}

main().catch((error) => {
  console.error('Purchase entry correction failed:', error);
  process.exit(1);
});
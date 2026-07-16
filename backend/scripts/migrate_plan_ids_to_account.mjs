/**
 * Rename legacy plan-{uuid} IDs to customer account numbers,
 * cascade FKs, and rewrite Roznamcha descriptions.
 *
 * Run: node scripts/migrate_plan_ids_to_account.mjs
 */
import { pool } from '../src/db.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure FK updates cascade when plan PK changes
    await client.query(`
      ALTER TABLE installment_schedules
        DROP CONSTRAINT IF EXISTS installment_schedules_plan_id_fkey;
      ALTER TABLE installment_schedules
        ADD CONSTRAINT installment_schedules_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES installment_plans(id)
        ON UPDATE CASCADE ON DELETE CASCADE;

      ALTER TABLE payments
        DROP CONSTRAINT IF EXISTS payments_plan_id_fkey;
      ALTER TABLE payments
        ADD CONSTRAINT payments_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES installment_plans(id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

      ALTER TABLE roznamcha_entries
        DROP CONSTRAINT IF EXISTS roznamcha_entries_reference_plan_id_fkey;
      ALTER TABLE roznamcha_entries
        ADD CONSTRAINT roznamcha_entries_reference_plan_id_fkey
        FOREIGN KEY (reference_plan_id) REFERENCES installment_plans(id)
        ON UPDATE CASCADE ON DELETE SET NULL;
    `);

    const plans = await client.query(`
      SELECT p.id AS old_id, p.created_at, c.id AS customer_id, c.account_number, c.full_name
      FROM installment_plans p
      JOIN customers c ON c.id = p.customer_id
      WHERE p.id LIKE 'plan-%'
      ORDER BY c.account_number ASC, p.created_at ASC, p.id ASC
    `);

    const used = new Set();
    const taken = await client.query(`SELECT id FROM installment_plans WHERE id NOT LIKE 'plan-%'`);
    for (const row of taken.rows) used.add(row.id);

    const mapping = [];
    const perAccount = new Map();

    for (const row of plans.rows) {
      const account = String(row.account_number || '').trim();
      if (!account) {
        throw new Error(`Plan ${row.old_id} has no account_number (customer ${row.customer_id})`);
      }

      const n = (perAccount.get(account) || 0) + 1;
      perAccount.set(account, n);

      let newId = n === 1 ? account : `${account}-${n}`;
      // Avoid collisions with already-renamed or non-uuid ids
      while (used.has(newId)) {
        const next = (perAccount.get(account) || n) + 1;
        perAccount.set(account, next);
        newId = `${account}-${next}`;
      }
      used.add(newId);
      mapping.push({ ...row, newId });
    }

    console.log(`Renaming ${mapping.length} plans…`);

    for (const m of mapping) {
      await client.query('UPDATE installment_plans SET id = $1, updated_at = now() WHERE id = $2', [m.newId, m.old_id]);
      // Rewrite ledger descriptions that embedded the old UUID
      await client.query(
        `UPDATE roznamcha_entries
         SET description = replace(description, $1, $2),
             updated_at = now()
         WHERE reference_plan_id = $2
            OR description LIKE '%' || $1 || '%'`,
        [m.old_id, m.newId]
      );
      console.log(`  ${m.old_id}  →  ${m.newId}  (${m.full_name})`);
    }

    // Normalize descriptions that say "Plan Plan X" or "plan plan-"
    await client.query(`
      UPDATE roznamcha_entries
      SET description = regexp_replace(description, 'Plan\\s+Plan\\s+', 'Plan ', 'gi'),
          updated_at = now()
      WHERE description ~* 'Plan\\s+Plan\\s+'
    `);

    const leftover = await client.query(`SELECT count(*)::int AS n FROM installment_plans WHERE id LIKE 'plan-%'`);
    if (leftover.rows[0].n > 0) {
      throw new Error(`Still have ${leftover.rows[0].n} UUID plan ids after migration`);
    }

    await client.query('COMMIT');
    console.log('Done. All plan IDs now use customer account numbers.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

/**
 * settlement.js — Shared early-settlement service
 *
 * Two exported functions, both callable within an existing pg transaction client:
 *
 *   calculateSettlementBreakdown(client, planId, asOfDate?)
 *     → returns { remainingPrincipal, markupEarnedToDate, markupToWaive, settlementAmount, ... }
 *
 *   performEarlySettlement(client, { planId, customerId, amount, method, userId, notes, breakdown, paidAt? })
 *     → inserts one payment row, settles/closes all open schedule rows, marks plan 'completed'
 *
 * These are reused by:
 *   - POST /api/payments   (existing auto-detection path — continues to work unchanged)
 *   - GET  /api/installment-plans/:id/settlement-preview
 *   - POST /api/installment-plans/:id/settle
 */

import { newId, receiptNumber } from '../utils/ids.js';
import { writeAudit } from './audit.js';

/**
 * Calculate settlement numbers for a plan as of a given date.
 *
 * @param {import('pg').PoolClient} client
 * @param {string} planId
 * @param {Date|string} [asOfDate=today]
 */
export async function calculateSettlementBreakdown(client, planId, asOfDate = new Date()) {
  const asOfStr = (asOfDate instanceof Date ? asOfDate : new Date(asOfDate))
    .toISOString()
    .slice(0, 10);

  const { rows } = await client.query(
    `SELECT * FROM installment_schedules WHERE plan_id = $1 ORDER BY installment_number ASC`,
    [planId],
  );

  const dueDateOf = (r) =>
    String(r.due_date?.toISOString?.().slice(0, 10) ?? r.due_date).slice(0, 10);

  const openRows = rows.filter((r) => r.status !== 'paid' && r.status !== 'settled');

  // Remaining principal = principal not yet paid across all non-settled rows
  const remainingPrincipal = openRows.reduce(
    (sum, r) => sum + Math.max(0, Number(r.principal_due || 0) - Number(r.principal_paid || 0)),
    0,
  );

  // Markup earned to date = markup on open rows whose period has already arrived (due_date <= today)
  // These periods are considered "earned" by the business even if not collected yet.
  const markupEarnedToDate = openRows
    .filter((r) => dueDateOf(r) <= asOfStr)
    .reduce((sum, r) => sum + Number(r.markup_amount || 0), 0);

  // Markup to waive = markup on open rows whose period is in the future (due_date > today)
  const markupToWaive = openRows
    .filter((r) => dueDateOf(r) > asOfStr)
    .reduce((sum, r) => sum + Number(r.markup_amount || 0), 0);

  // Total the customer must pay right now to fully settle the plan
  const settlementAmount = remainingPrincipal + markupEarnedToDate;

  return {
    planId,
    asOfDate: asOfStr,
    remainingPrincipal: +remainingPrincipal.toFixed(2),
    markupEarnedToDate: +markupEarnedToDate.toFixed(2),
    markupToWaive: +markupToWaive.toFixed(2),
    settlementAmount: +settlementAmount.toFixed(2),
    hasOpenRows: openRows.length > 0,
    openRowCount: openRows.length,
  };
}

/**
 * Execute early settlement for a plan within an existing transaction.
 * Inserts one consolidated payment, closes all open schedule rows, marks plan 'completed'.
 *
 * @param {import('pg').PoolClient} client
 * @param {{ planId, customerId, amount, method, userId, notes, breakdown, paidAt? }} opts
 */
export async function performEarlySettlement(client, {
  planId,
  customerId,
  amount,
  method,
  userId,
  notes,
  breakdown,
  paidAt = new Date(),
}) {
  const paidAtTs = paidAt instanceof Date ? paidAt : new Date(paidAt);
  const paidAtDate = paidAtTs.toISOString().slice(0, 10);
  const paymentId = newId('pay');

  // Allocate a receipt number from the shared sequence
  const seq = await client.query(`SELECT nextval('payment_receipt_seq')::int AS n`);
  const receipt = receiptNumber(seq.rows[0].n);

  // ── 1. Insert one consolidated payment (schedule_id is NULL — covers all rows) ──
  const inserted = await client.query(
    `INSERT INTO payments
       (id, plan_id, schedule_id, customer_id, amount, method, received_by,
        receipt_number, paid_at, notes, is_early_settlement, markup_waived, status)
     VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, true, $10, 'posted')
     RETURNING *`,
    [
      paymentId, planId, customerId, amount, method,
      userId, receipt, paidAtTs,
      notes || 'Early settlement — remaining balance cleared',
      breakdown.markupToWaive,
    ],
  );

  // ── 2. Settle future rows (waive their markup) ──
  await client.query(
    `UPDATE installment_schedules
     SET amount_due      = principal_due,
         amount_paid     = principal_due,
         principal_paid  = principal_due,
         markup_earned   = 0,
         markup_waived   = markup_amount,
         status          = 'settled',
         paid_date       = $2,
         closed_reason   = 'early-settlement',
         updated_at      = now()
     WHERE plan_id = $1
       AND due_date > $3::date
       AND status NOT IN ('paid', 'settled')`,
    [planId, paidAtTs, paidAtDate],
  );

  // ── 3. Mark past-due / today's unpaid rows as paid (markup earned, already baked into amount) ──
  await client.query(
    `UPDATE installment_schedules
     SET amount_paid     = amount_due,
         principal_paid  = principal_due,
         markup_earned   = markup_amount,
         markup_waived   = 0,
         status          = 'paid',
         paid_date       = COALESCE(paid_date, $2),
         closed_reason   = COALESCE(closed_reason, 'early-settlement-paid-through-date'),
         updated_at      = now()
     WHERE plan_id = $1
       AND due_date <= $3::date
       AND status NOT IN ('paid', 'settled')`,
    [planId, paidAtTs, paidAtDate],
  );

  // ── 4. Mark plan completed ──
  await client.query(
    `UPDATE installment_plans
     SET outstanding_balance = 0,
         status              = 'completed',
         markup_waived       = $2,
         settled_early_at    = $3,
         settlement_note     = $4,
         updated_at          = now()
     WHERE id = $1`,
    [
      planId,
      breakdown.markupToWaive,
      paidAtTs,
      `Settled early via dedicated action; PKR ${breakdown.markupToWaive} markup waived.`,
    ],
  );

  // ── 5. Sync customer outstanding ──
  await client.query(
    `UPDATE customers
     SET total_outstanding = (
       SELECT COALESCE(sum(outstanding_balance), 0)
       FROM   installment_plans
       WHERE  customer_id = $1
     ), updated_at = now()
     WHERE id = $1`,
    [customerId],
  );

  // ── 6. Audit trail ──
  await writeAudit(
    client, userId, 'UPDATE', 'InstallmentPlan', planId,
    `Early settlement: PKR ${amount} received; PKR ${breakdown.markupToWaive} markup waived.`,
  );
  await writeAudit(
    client, userId, 'CREATE', 'Payment', paymentId,
    `Early settlement payment PKR ${amount}; receipt ${receipt}; markup waived PKR ${breakdown.markupToWaive}.`,
  );

  return { ...inserted.rows[0], receipt_number: receipt };
}

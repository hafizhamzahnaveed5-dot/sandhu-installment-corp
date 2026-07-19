/**
 * Shared helpers to keep Roznamcha in sync with payments / plans.
 * These run inside the same DB transaction as the source action so a
 * successful payment always has a matching ledger line.
 */

import { newId } from '../utils/ids.js';

/**
 * Insert a payment_received ledger row linked to a payment.
 * Safe to call multiple times: skips if reference_payment_id already exists.
 */
export async function insertPaymentReceivedEntry(client, {
  entryDate,
  amount,
  planId,
  paymentId,
  customerName,
  createdBy,
  description,
}) {
  if (!paymentId || !entryDate || !(Number(amount) > 0)) return null;

  const existing = await client.query(
    `SELECT id FROM roznamcha_entries WHERE reference_payment_id = $1 LIMIT 1`,
    [paymentId]
  );
  if (existing.rowCount) return existing.rows[0];

  const desc = description
    || `Installment payment received from ${customerName || 'customer'} - Plan ${planId}`;

  const inserted = await client.query(
    `INSERT INTO roznamcha_entries
       (id, entry_date, type, description, amount, reference_plan_id, reference_payment_id, created_by)
     VALUES ($1, $2::date, 'payment_received', $3, $4, $5, $6, $7)
     RETURNING *`,
    [newId('roz'), entryDate, desc, amount, planId || null, paymentId, createdBy || null]
  );
  return inserted.rows[0];
}

/**
 * Insert a purchase ledger row linked to a plan (skip zero / duplicate).
 */
export async function insertPurchaseEntry(client, {
  entryDate,
  amount,
  planId,
  createdBy,
  description,
}) {
  if (!planId || !entryDate || !(Number(amount) > 0)) return null;

  const existing = await client.query(
    `SELECT id FROM roznamcha_entries
     WHERE reference_plan_id = $1 AND type = 'purchase'
     LIMIT 1`,
    [planId]
  );
  if (existing.rowCount) return existing.rows[0];

  const inserted = await client.query(
    `INSERT INTO roznamcha_entries
       (id, entry_date, type, description, amount, reference_plan_id, created_by)
     VALUES ($1, $2::date, 'purchase', $3, $4, $5, $6)
     RETURNING *`,
    [
      newId('roz'),
      entryDate,
      description || `Purchase cost for plan ${planId}`,
      amount,
      planId,
      createdBy || null,
    ]
  );
  return inserted.rows[0];
}

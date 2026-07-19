-- Ensure each payment can only create one Roznamcha payment_received row
CREATE UNIQUE INDEX IF NOT EXISTS idx_roznamcha_unique_payment_ref
  ON roznamcha_entries (reference_payment_id)
  WHERE reference_payment_id IS NOT NULL;

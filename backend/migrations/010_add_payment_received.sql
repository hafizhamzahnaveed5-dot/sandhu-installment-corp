-- Migration: add payment_received type and reference_payment_id to roznamcha_entries

-- Drop existing type check constraint if present and recreate including payment_received
ALTER TABLE roznamcha_entries
  DROP CONSTRAINT IF EXISTS roznamcha_entries_type_check;

ALTER TABLE roznamcha_entries
  ADD CONSTRAINT roznamcha_entries_type_check
  CHECK (type IN ('purchase', 'expense', 'payment_received'));

-- Add reference to payments
ALTER TABLE roznamcha_entries
  ADD COLUMN IF NOT EXISTS reference_payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roznamcha_entries_reference_payment_id ON roznamcha_entries (reference_payment_id);

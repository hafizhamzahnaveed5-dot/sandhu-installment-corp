-- Migration: add file_fee to installment_plans

ALTER TABLE installment_plans
  ADD COLUMN IF NOT EXISTS file_fee NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN installment_plans.file_fee IS 'Optional administrative or file fee applied to the installment plan.';

CREATE INDEX IF NOT EXISTS idx_installment_plans_file_fee ON installment_plans (file_fee);

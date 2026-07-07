ALTER TABLE installment_plans
  ADD COLUMN IF NOT EXISTS purchase_cost NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Preserve existing records by defaulting purchase cost to the current invoice/principal amount.
UPDATE installment_plans
SET purchase_cost = principal_amount
WHERE purchase_cost = 0;

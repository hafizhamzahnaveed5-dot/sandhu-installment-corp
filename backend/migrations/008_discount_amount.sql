ALTER TABLE installment_plans
  ADD COLUMN discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN installment_plans.discount_amount IS 'Discount applied to the original invoice price before calculating financed amount and markup.';

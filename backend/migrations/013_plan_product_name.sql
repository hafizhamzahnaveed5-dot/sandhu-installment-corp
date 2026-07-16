-- Free-text product name on installment plans (no inventory catalog required)

ALTER TABLE installment_plans
  ADD COLUMN IF NOT EXISTS product_name TEXT;

COMMENT ON COLUMN installment_plans.product_name IS
  'Product description entered when creating a plan (shop purchase on the spot).';

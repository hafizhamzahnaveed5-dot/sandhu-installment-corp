ALTER TABLE installment_plans
  ADD COLUMN IF NOT EXISTS markup_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_waived NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settled_early_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_note TEXT;

UPDATE installment_plans
SET markup_amount = ROUND(GREATEST(principal_amount - down_payment, 0) * (interest_or_markup / 100.0), 2)
WHERE markup_amount = 0 AND interest_or_markup > 0;

ALTER TABLE installment_schedules
  ADD COLUMN IF NOT EXISTS principal_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS principal_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_waived NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_reason TEXT;

UPDATE installment_schedules s
SET
  markup_amount = ROUND(p.markup_amount / NULLIF(p.number_of_installments, 0), 2),
  principal_due = GREATEST(s.amount_due - ROUND(p.markup_amount / NULLIF(p.number_of_installments, 0), 2), 0)
FROM installment_plans p
WHERE p.id = s.plan_id
  AND s.principal_due = 0
  AND s.markup_amount = 0;

UPDATE installment_schedules
SET
  principal_paid = LEAST(amount_paid, principal_due),
  markup_earned = CASE
    WHEN amount_due > 0 THEN LEAST(markup_amount, ROUND(amount_paid * (markup_amount / amount_due), 2))
    ELSE 0
  END
WHERE amount_paid > 0;

ALTER TABLE installment_plans
  DROP CONSTRAINT IF EXISTS installment_plans_frequency_check;

ALTER TABLE installment_plans
  ADD CONSTRAINT installment_plans_frequency_check
  CHECK (frequency IN ('daily', 'weekly', 'monthly'));

ALTER TABLE installment_schedules
  DROP CONSTRAINT IF EXISTS installment_schedules_status_check;

ALTER TABLE installment_schedules
  ADD CONSTRAINT installment_schedules_status_check
  CHECK (status IN ('pending', 'due-soon', 'overdue', 'partial', 'paid', 'settled'));

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_early_settlement BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS markup_waived NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('posted', 'reversed'));

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_installment_plans_settled_early_at ON installment_plans (settled_early_at);

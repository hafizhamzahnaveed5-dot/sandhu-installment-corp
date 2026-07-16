-- Migration: Fix markup calculation for all existing plans
-- Previous migration (003) used wrong formula: markup on (principal - downPayment)
-- Correct formula: markup on full principal amount
-- This migration recalculates markup for all affected plans

-- Step 1: Recalculate markup_amount for all installment plans
-- Only affects plans where the old formula would have created wrong values
UPDATE installment_plans
SET markup_amount = ROUND(principal_amount * (interest_or_markup / 100.0), 2)
WHERE interest_or_markup > 0
  AND markup_amount != ROUND(principal_amount * (interest_or_markup / 100.0), 2);

-- Step 2: Recalculate markup_amount for all installment schedules
-- These depend on the plan's markup_amount
UPDATE installment_schedules s
SET
  markup_amount = ROUND(p.markup_amount / NULLIF(p.number_of_installments, 0), 2),
  principal_due = GREATEST(s.amount_due - ROUND(p.markup_amount / NULLIF(p.number_of_installments, 0), 2), 0)
FROM installment_plans p
WHERE p.id = s.plan_id
  AND p.interest_or_markup > 0;

-- Step 3: Audit log (optional - depends on audit_logs table existence)
-- Document which plans were corrected
INSERT INTO audit_logs (user_id, action, entity_type, entity_id, timestamp, details)
SELECT
  'SYSTEM',
  'UPDATE',
  'InstallmentPlan',
  ip.id,
  NOW(),
  'Fixed markup calculation: old markup=' || ROUND((ip.principal_amount - ip.down_payment) * (ip.interest_or_markup / 100.0), 2)::text || ', new markup=' || ip.markup_amount::text
FROM installment_plans ip
WHERE ip.interest_or_markup > 0
  AND ip.down_payment > 0;

-- Allow settlement payments to have no specific schedule_id
-- (the dedicated "Settle Remaining Balance" endpoint closes all rows at once)
ALTER TABLE payments
  ALTER COLUMN schedule_id DROP NOT NULL;

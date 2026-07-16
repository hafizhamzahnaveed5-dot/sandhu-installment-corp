-- Separate father name field for customers

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS father_name TEXT;

COMMENT ON COLUMN customers.father_name IS 'Father / guardian name (shown as S/O on customer records).';

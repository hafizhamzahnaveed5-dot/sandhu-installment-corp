-- 003_unique_customer_users.sql
-- Enforce a 1-to-1 mapping between customer records and their login accounts

CREATE UNIQUE INDEX idx_users_customer_id_unique 
ON users (customer_id) 
WHERE customer_id IS NOT NULL;

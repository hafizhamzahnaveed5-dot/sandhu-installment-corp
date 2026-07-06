ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS sms_alerts_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS sms_notifications_log (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('payment-confirmation', 'due-soon', 'overdue')),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('payment', 'schedule')),
  reference_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  provider TEXT NOT NULL DEFAULT 'twilio',
  provider_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_log_customer_id ON sms_notifications_log (customer_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_reference ON sms_notifications_log (reference_type, reference_id, alert_type);
CREATE INDEX IF NOT EXISTS idx_sms_log_created_at ON sms_notifications_log (created_at DESC);

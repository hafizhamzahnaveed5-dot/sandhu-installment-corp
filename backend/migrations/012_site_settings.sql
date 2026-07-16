-- Site settings & web content for owner admin controls
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

INSERT INTO site_settings (key, value) VALUES
  ('business', '{
    "name": "Sandhu Installment Corporation",
    "tagline": "Smart Installments. Secure Future.",
    "phone": "+923001234567",
    "whatsapp": "923001234567",
    "email": "info@sandhuinstallments.com",
    "address": "Lahore, Punjab, Pakistan",
    "currency": "PKR"
  }'::jsonb),
  ('web_content', '{
    "announcement": "",
    "supportHours": "Mon–Sat, 10:00 AM – 6:00 PM",
    "supportMessage": "For help with payments, plans, or account updates, contact our office.",
    "receiptFooter": "This is a computer-generated receipt and is valid without a physical stamp.",
    "homeWelcome": "Welcome to Sandhu Installment Corporation"
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

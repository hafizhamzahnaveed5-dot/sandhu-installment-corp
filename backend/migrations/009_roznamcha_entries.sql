CREATE TABLE IF NOT EXISTS roznamcha_entries (
  id TEXT PRIMARY KEY,
  entry_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'expense')),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  reference_plan_id TEXT REFERENCES installment_plans(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roznamcha_entries_entry_date ON roznamcha_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_roznamcha_entries_type ON roznamcha_entries (type);
CREATE INDEX IF NOT EXISTS idx_roznamcha_entries_reference_plan_id ON roznamcha_entries (reference_plan_id);
CREATE INDEX IF NOT EXISTS idx_roznamcha_entries_created_at ON roznamcha_entries (created_at DESC);

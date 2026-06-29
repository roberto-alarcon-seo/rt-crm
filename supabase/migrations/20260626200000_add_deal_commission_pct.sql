-- Add commission percentage field to deals for revenue tracking
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS commission_pct numeric
  CHECK (commission_pct >= 0 AND commission_pct <= 100);

COMMENT ON COLUMN deals.commission_pct IS 'Commission % agreed with client (0-100). Used to calculate expected agency revenue: offered_price_mxn * commission_pct / 100.';

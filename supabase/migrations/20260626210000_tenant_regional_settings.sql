-- Add regional settings JSONB column to tenants
-- Stores: timezone, currency, locale, country_code, phone_prefix, credit_types
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;

-- Seed Mexico defaults for existing tenants that don't have settings yet
UPDATE tenants
SET settings = '{
  "timezone": "America/Mexico_City",
  "currency": "MXN",
  "currency_symbol": "$",
  "locale": "es-MX",
  "country_code": "MX",
  "phone_prefix": "+52",
  "credit_types": [
    { "value": "INFONAVIT",  "label": "Infonavit" },
    { "value": "COFINAVIT",  "label": "Cofinavit" },
    { "value": "FOVISSSTE",  "label": "Fovissste" },
    { "value": "ISFAM",      "label": "ISFAM" },
    { "value": "CFE",        "label": "CFE" },
    { "value": "BANK",       "label": "Bancario" },
    { "value": "CASH",       "label": "Contado" }
  ]
}'::jsonb
WHERE settings = '{}'::jsonb OR settings IS NULL;

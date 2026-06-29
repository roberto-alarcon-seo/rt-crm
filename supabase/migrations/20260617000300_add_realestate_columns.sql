-- Properties: columnas necesarias para portal inmobiliario
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS latitude    NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude   NUMERIC,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS city        TEXT,
  ADD COLUMN IF NOT EXISTS stratum     INTEGER,
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE INDEX IF NOT EXISTS idx_properties_city        ON public.properties (tenant_id, city);
CREATE INDEX IF NOT EXISTS idx_properties_external_id ON public.properties (external_id) WHERE external_id IS NOT NULL;

-- Profiles: teléfono del asesor
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone             TEXT,
  ADD COLUMN IF NOT EXISTS phone_country_code TEXT;

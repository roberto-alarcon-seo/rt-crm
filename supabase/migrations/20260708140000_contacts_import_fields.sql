-- ─── Campos para importación inteligente de contactos (HubSpot / CSV) ─────────
-- El CSV de HubSpot trae Nombre y Apellidos por separado, un ID de registro
-- (para deduplicar en re-importaciones) y un "Estado del lead". El modelo solo
-- tenía `name` único. Se agregan columnas sin romper lo existente: `name` sigue
-- siendo el nombre completo para toda la app.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS first_name  TEXT,
  ADD COLUMN IF NOT EXISTS last_name   TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT,   -- ID de registro de origen (ej. HubSpot)
  ADD COLUMN IF NOT EXISTS lead_status TEXT;   -- Estado del lead de origen (ej. Nuevo, En curso)

-- Dedup por origen: un external_id no se repite dentro de un tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_tenant_external_id
  ON public.contacts (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

-- Búsqueda de duplicados por correo dentro del tenant.
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_email
  ON public.contacts (tenant_id, lower(email))
  WHERE email IS NOT NULL;

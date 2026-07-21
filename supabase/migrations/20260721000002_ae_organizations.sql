-- ═════════════════════════════════════════════════════════════════════════════
-- Account Executives: de "solo Google" a cualquier organización
--
-- El módulo nació soldado a Google Cloud (tabla `gcp_account_executives`), pero
-- un lead puede venir acompañado de un AE de Salesforce, Oracle, AWS o SAP.
-- Aquí se generaliza: los AEs pasan a pertenecer a una organización.
--
-- Nombre: `ae_organizations` y NO "partners"/"vendors" — ambos ya significan
-- otra cosa en este esquema (`partners` = reseller white-label del CRM;
-- `vendor_registration_processes` = alta como proveedor ante el cliente).
--
-- Una empresa puede tener AEs de VARIAS organizaciones a la vez: la puente
-- account_executives_link ya lo permite y el selector de organización actúa
-- como filtro de búsqueda, no como candado.
--
-- Idempotente: se puede re-aplicar sin efectos secundarios.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CATÁLOGO DE ORGANIZACIONES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ae_organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  website    text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ae_orgs_tenant_name
  ON public.ae_organizations (tenant_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_ae_orgs_tenant
  ON public.ae_organizations (tenant_id, is_active);

ALTER TABLE public.ae_organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ae_orgs_tenant_isolation" ON public.ae_organizations;
CREATE POLICY "ae_orgs_tenant_isolation" ON public.ae_organizations
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ae_organizations TO authenticated, service_role;


-- Semilla para los tenants que ya existen. Los tenants nuevos arrancan con el
-- catálogo vacío y crean su organización desde el propio selector.
INSERT INTO public.ae_organizations (tenant_id, name, website)
SELECT t.id, o.name, o.website
  FROM public.tenants t
 CROSS JOIN (VALUES
   ('Google Cloud',          'https://cloud.google.com'),
   ('Amazon Web Services',   'https://aws.amazon.com'),
   ('Microsoft Azure',       'https://azure.microsoft.com'),
   ('Salesforce',            'https://salesforce.com'),
   ('Oracle',                'https://oracle.com'),
   ('SAP',                   'https://sap.com'),
   ('IBM',                   'https://ibm.com')
 ) AS o(name, website)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RENOMBRAR gcp_account_executives → account_executives
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'gcp_account_executives'
     ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'account_executives'
     )
  THEN
    ALTER TABLE public.gcp_account_executives RENAME TO account_executives;
  END IF;
END $$;

-- Por si la tabla nunca existió (instalación limpia sin la migración anterior)
CREATE TABLE IF NOT EXISTS public.account_executives (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  email      text,
  phone      text,
  region     text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_executives
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.ae_organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title text;

COMMENT ON COLUMN public.account_executives.organization_id
  IS 'Organización a la que pertenece el AE (Google Cloud, Oracle, …). Nullable por compatibilidad: la UI lo exige al capturar.';

CREATE INDEX IF NOT EXISTS idx_ae_organization ON public.account_executives (organization_id);

ALTER TABLE public.account_executives ENABLE ROW LEVEL SECURITY;

-- La política sobrevive al RENAME pero conserva el nombre viejo; se rehace
-- para que el nombre no mienta sobre a qué tabla aplica.
DROP POLICY IF EXISTS "gcp_ae_tenant_isolation" ON public.account_executives;
DROP POLICY IF EXISTS "account_executives_tenant_isolation" ON public.account_executives;
CREATE POLICY "account_executives_tenant_isolation" ON public.account_executives
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_executives TO authenticated, service_role;

-- Los índices heredan el nombre viejo tras el RENAME
ALTER INDEX IF EXISTS idx_gcp_ae_tenant_email     RENAME TO idx_ae_tenant_email;
ALTER INDEX IF EXISTS idx_gcp_ae_tenant           RENAME TO idx_ae_tenant;
ALTER INDEX IF EXISTS gcp_account_executives_pkey RENAME TO account_executives_pkey;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ae_tenant_email
  ON public.account_executives (tenant_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. BACKFILL: todo lo que existe hoy vino de Google
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.account_executives ae
   SET organization_id = org.id
  FROM public.ae_organizations org
 WHERE org.tenant_id = ae.tenant_id
   AND org.name = 'Google Cloud'
   AND ae.organization_id IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Recargar el caché de esquema de PostgREST
--    Sin esto, el cliente sigue viendo la tabla con el nombre viejo hasta el
--    siguiente reinicio y las consultas fallan con 404 / PGRST205.
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

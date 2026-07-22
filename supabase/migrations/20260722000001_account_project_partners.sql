-- ═════════════════════════════════════════════════════════════════════════════
-- Empresas a cargo de un proyecto (reemplazo de ae_organizations/account_executives)
--
-- El modelo viejo tenía un catálogo aparte (ae_organizations: Google, AWS…) y una
-- tabla de personas (account_executives) desconectada de Empresas y Contactos.
-- Era redundante y no escalaba: Google no vivía en tus Empresas y sus AEs no eran
-- tus Contactos.
--
-- Nuevo modelo: la "empresa a cargo" es una EMPRESA real del CRM (accounts) y los
-- ejecutivos son sus CONTACTOS (contacts.account_id). Un proyecto puede tener
-- VARIAS empresas a cargo a la vez (p.ej. el proveedor + un tercero que refirió),
-- cada una con su rol.
--
-- Las tablas ae_organizations / account_executives / account_executives_link se
-- DEPRECAN (no se borran, por si hay que consultarlas) pero dejan de usarse.
--
-- Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. account_project_partners: una empresa a cargo de una cuenta/proyecto
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_project_partners (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id         uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  partner_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  role               text NOT NULL DEFAULT 'proveedor'
                       CHECK (role IN ('proveedor','referidor','otro')),
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Una empresa aparece una sola vez por proyecto
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_unique
  ON public.account_project_partners(account_id, partner_account_id);
CREATE INDEX IF NOT EXISTS idx_app_tenant  ON public.account_project_partners(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_account ON public.account_project_partners(account_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. account_partner_contacts: contactos de esa empresa asignados al proyecto
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_partner_contacts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_partner_id uuid NOT NULL REFERENCES public.account_project_partners(id) ON DELETE CASCADE,
  contact_id         uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_apc_unique
  ON public.account_partner_contacts(project_partner_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_apc_tenant ON public.account_partner_contacts(tenant_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_app_updated_at ON public.account_project_partners;
CREATE TRIGGER trg_app_updated_at BEFORE UPDATE ON public.account_project_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — aislamiento por tenant (mismo patrón que account_executives_link:
--    lo gestionan los usuarios del tenant) + acceso super_admin
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.account_project_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_partner_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_tenant_isolation" ON public.account_project_partners;
CREATE POLICY "app_tenant_isolation" ON public.account_project_partners
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "app_super_admin" ON public.account_project_partners;
CREATE POLICY "app_super_admin" ON public.account_project_partners
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "apc_tenant_isolation" ON public.account_partner_contacts;
CREATE POLICY "apc_tenant_isolation" ON public.account_partner_contacts
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "apc_super_admin" ON public.account_partner_contacts;
CREATE POLICY "apc_super_admin" ON public.account_partner_contacts
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_project_partners TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_partner_contacts TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Deprecación (documental) del modelo viejo
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.account_executives IS
  'DEPRECATED (2026-07-22): reemplazado por account_project_partners + account_partner_contacts (empresas y contactos reales del CRM).';
COMMENT ON TABLE public.ae_organizations IS
  'DEPRECATED (2026-07-22): las organizaciones a cargo ahora son accounts (empresas del CRM).';

NOTIFY pgrst, 'reload schema';

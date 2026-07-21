-- ═════════════════════════════════════════════════════════════════════════════
-- Módulo Empresas — nivel enterprise
--
-- 1. Campos fiscales, firmográficos, comerciales y de contacto en accounts
-- 2. Catálogo de Account Executives de Google + puente N:N con accounts
-- 3. Documentos adjuntos por empresa + bucket privado
--
-- Todo idempotente: se puede re-aplicar sin efectos secundarios.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. COLUMNAS NUEVAS EN public.accounts
--    Todas nullable: no rompen las filas existentes ni los inserts actuales.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.accounts
  -- Fiscales / legales
  ADD COLUMN IF NOT EXISTS legal_name            text,
  ADD COLUMN IF NOT EXISTS tax_id                text,
  ADD COLUMN IF NOT EXISTS tax_regime            text,
  ADD COLUMN IF NOT EXISTS fiscal_street         text,
  ADD COLUMN IF NOT EXISTS fiscal_ext_number     text,
  ADD COLUMN IF NOT EXISTS fiscal_int_number     text,
  ADD COLUMN IF NOT EXISTS fiscal_neighborhood   text,
  ADD COLUMN IF NOT EXISTS fiscal_zip            text,
  ADD COLUMN IF NOT EXISTS fiscal_state          text,
  ADD COLUMN IF NOT EXISTS fiscal_country        text,
  ADD COLUMN IF NOT EXISTS incorporation_country text,

  -- Firmográficos
  ADD COLUMN IF NOT EXISTS annual_revenue        numeric,
  ADD COLUMN IF NOT EXISTS revenue_currency      text,
  ADD COLUMN IF NOT EXISTS locations_count       integer,
  ADD COLUMN IF NOT EXISTS parent_company        text,
  ADD COLUMN IF NOT EXISTS stock_ticker          text,
  ADD COLUMN IF NOT EXISTS founded_year          integer,
  ADD COLUMN IF NOT EXISTS linkedin_url          text,

  -- Comerciales / CRM  (el owner interno reutiliza assigned_to, que ya existe)
  ADD COLUMN IF NOT EXISTS account_tier          text,
  ADD COLUMN IF NOT EXISTS lifecycle_stage       text,
  ADD COLUMN IF NOT EXISTS lead_source           text,
  ADD COLUMN IF NOT EXISTS preferred_currency    text,

  -- Contacto / operación
  ADD COLUMN IF NOT EXISTS main_phone            text,
  ADD COLUMN IF NOT EXISTS general_email         text,
  ADD COLUMN IF NOT EXISTS email_domains         text[],
  ADD COLUMN IF NOT EXISTS timezone              text;

COMMENT ON COLUMN public.accounts.legal_name    IS 'Razón social (el nombre legal, distinto del comercial en `name`)';
COMMENT ON COLUMN public.accounts.tax_id        IS 'RFC en México / Tax ID equivalente en otros países';
COMMENT ON COLUMN public.accounts.email_domains IS 'Dominios de correo corporativos, para auto-vincular contactos';
COMMENT ON COLUMN public.accounts.gcp_ae_name   IS 'LEGACY: sustituido por gcp_account_executives + account_executives_link. Se conserva por compatibilidad.';
COMMENT ON COLUMN public.accounts.gcp_ae_email  IS 'LEGACY: ver gcp_ae_name.';

-- Sin UNIQUE sobre tax_id a propósito: puede haber duplicados históricos
-- legítimos y una migración que falle a media aplicación es peor que el
-- duplicado. El aviso de duplicado se da en la UI, sin bloquear.
CREATE INDEX IF NOT EXISTS idx_accounts_tax_id  ON public.accounts (tenant_id, tax_id);
CREATE INDEX IF NOT EXISTS idx_accounts_tier    ON public.accounts (tenant_id, account_tier);
CREATE INDEX IF NOT EXISTS idx_accounts_domains ON public.accounts USING gin (email_domains);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CATÁLOGO DE ACCOUNT EXECUTIVES DE GOOGLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gcp_account_executives (
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

-- Un AE se identifica por su email dentro del tenant. NULL no colisiona en
-- UNIQUE, así que varios AEs sin email conviven sin problema.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gcp_ae_tenant_email
  ON public.gcp_account_executives (tenant_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS idx_gcp_ae_tenant ON public.gcp_account_executives (tenant_id, is_active);

ALTER TABLE public.gcp_account_executives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gcp_ae_tenant_isolation" ON public.gcp_account_executives;
CREATE POLICY "gcp_ae_tenant_isolation" ON public.gcp_account_executives
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gcp_account_executives TO authenticated, service_role;


-- Puente N:N — una empresa tiene varios AEs, un AE atiende varias empresas
CREATE TABLE IF NOT EXISTS public.account_executives_link (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  ae_id      uuid NOT NULL REFERENCES public.gcp_account_executives(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, ae_id)
);

CREATE INDEX IF NOT EXISTS idx_ae_link_account ON public.account_executives_link (account_id);
CREATE INDEX IF NOT EXISTS idx_ae_link_ae      ON public.account_executives_link (ae_id);

-- Como mucho un AE principal por empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_ae_link_one_primary
  ON public.account_executives_link (account_id)
  WHERE is_primary;

ALTER TABLE public.account_executives_link ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ae_link_tenant_isolation" ON public.account_executives_link;
CREATE POLICY "ae_link_tenant_isolation" ON public.account_executives_link
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_executives_link TO authenticated, service_role;


-- ─── Backfill: los AEs que hoy viven como texto suelto en accounts ───────────
-- Las columnas gcp_ae_name/gcp_ae_email NO se borran: AccountDetailPanel.tsx y
-- posibles consumidores externos las siguen leyendo.

INSERT INTO public.gcp_account_executives (tenant_id, name, email)
SELECT DISTINCT ON (a.tenant_id, lower(coalesce(nullif(trim(a.gcp_ae_email), ''), trim(a.gcp_ae_name))))
       a.tenant_id,
       coalesce(nullif(trim(a.gcp_ae_name), ''), trim(a.gcp_ae_email)),
       nullif(trim(a.gcp_ae_email), '')
  FROM public.accounts a
 WHERE coalesce(nullif(trim(a.gcp_ae_name), ''), nullif(trim(a.gcp_ae_email), '')) IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.account_executives_link (account_id, ae_id, tenant_id, is_primary)
SELECT a.id, ae.id, a.tenant_id, true
  FROM public.accounts a
  JOIN public.gcp_account_executives ae
    ON ae.tenant_id = a.tenant_id
   AND (
        (nullif(trim(a.gcp_ae_email), '') IS NOT NULL AND lower(ae.email) = lower(trim(a.gcp_ae_email)))
     OR (nullif(trim(a.gcp_ae_email), '') IS NULL     AND ae.name = trim(a.gcp_ae_name))
   )
 WHERE coalesce(nullif(trim(a.gcp_ae_name), ''), nullif(trim(a.gcp_ae_email), '')) IS NOT NULL
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DOCUMENTOS POR EMPRESA
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.account_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  file_path    text NOT NULL,
  file_name    text NOT NULL,
  file_type    text,
  file_size    bigint,
  doc_category text NOT NULL DEFAULT 'otro',
  uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Guardamos file_path y NO file_url: el bucket es privado, así que una URL
-- persistida caduca. La URL firmada se genera al momento de ver/descargar.
COMMENT ON COLUMN public.account_documents.file_path IS 'Ruta en el bucket account-documents: {tenant_id}/{account_id}/{uuid}-{nombre}';

CREATE INDEX IF NOT EXISTS idx_account_docs_account ON public.account_documents (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_docs_tenant  ON public.account_documents (tenant_id);

ALTER TABLE public.account_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_docs_tenant_isolation" ON public.account_documents;
CREATE POLICY "account_docs_tenant_isolation" ON public.account_documents
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_documents TO authenticated, service_role;


-- ─── Bucket privado (mismo patrón que kb-files) ─────────────────────────────
-- Sin límite en la CANTIDAD de documentos; 50 MB por archivo porque el request
-- de subida muere de todos modos por encima de eso.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'account-documents',
  'account-documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed'
  ]
) ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas de storage: el primer segmento de la ruta es el tenant_id
DROP POLICY IF EXISTS "account_docs_tenant_upload" ON storage.objects;
CREATE POLICY "account_docs_tenant_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'account-documents'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );

DROP POLICY IF EXISTS "account_docs_tenant_read" ON storage.objects;
CREATE POLICY "account_docs_tenant_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'account-documents'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );

DROP POLICY IF EXISTS "account_docs_tenant_delete" ON storage.objects;
CREATE POLICY "account_docs_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'account-documents'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );

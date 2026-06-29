-- ─── credit_type en deals ────────────────────────────────────────────────────
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS credit_type text DEFAULT 'contado'
  CHECK (credit_type IN ('contado', 'banco', 'infonavit', 'fovissste', 'cofinavit', 'otro'));

-- ─── party en deal_documents (cliente vs inmueble) ────────────────────────────
ALTER TABLE public.deal_documents
  ADD COLUMN IF NOT EXISTS party text NOT NULL DEFAULT 'client'
  CHECK (party IN ('client', 'property'));

-- ─── Tabla: document_templates ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  deal_type   text        NOT NULL CHECK (deal_type IN ('compra', 'renta', 'captacion')),
  credit_type text        CHECK (credit_type IN ('contado', 'banco', 'infonavit', 'fovissste', 'cofinavit', 'otro')),
  is_default  boolean     NOT NULL DEFAULT false,
  country     text        NOT NULL DEFAULT 'MX',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Tabla: document_template_items ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_template_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid        NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  deal_stage  text        NOT NULL,
  party       text        NOT NULL DEFAULT 'client' CHECK (party IN ('client', 'property')),
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_templates_tenant    ON public.document_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_template_items_tmpl ON public.document_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_doc_template_items_tnt  ON public.document_template_items(tenant_id);

-- ─── RLS: document_templates ─────────────────────────────────────────────────
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_doc_templates" ON public.document_templates
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "admin_write_doc_templates" ON public.document_templates
  FOR ALL USING (
    (
      tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
      AND has_any_tenant_role(auth.uid(), ARRAY['owner'::tenant_role, 'administrador'::tenant_role])
    )
    OR is_super_admin(auth.uid())
  );

-- ─── RLS: document_template_items ────────────────────────────────────────────
ALTER TABLE public.document_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_doc_template_items" ON public.document_template_items
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "admin_write_doc_template_items" ON public.document_template_items
  FOR ALL USING (
    (
      tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
      AND has_any_tenant_role(auth.uid(), ARRAY['owner'::tenant_role, 'administrador'::tenant_role])
    )
    OR is_super_admin(auth.uid())
  );

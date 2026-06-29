-- ============================================================
-- Módulo de Clientes y Expedientes (Deals)
-- Separa leads de clientes activos en negociación
-- ============================================================

-- 1. lifecycle en contacts: lead → client → past_client
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'lead'
    CHECK (lifecycle IN ('lead', 'client', 'past_client'));

-- 2. entry_source: cómo llegó el contacto al sistema
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'digital'
    CHECK (entry_source IN ('digital', 'site_visit', 'referral', 'walk_in'));

-- 3. Tabla deals (Expedientes de negociación)
CREATE TABLE IF NOT EXISTS public.deals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  property_id   uuid REFERENCES public.properties(id) ON DELETE SET NULL,

  title         text NOT NULL,
  deal_type     text NOT NULL DEFAULT 'compra'
                  CHECK (deal_type IN ('compra', 'renta', 'captacion')),

  -- Etapas del proceso de cierre
  stage         text NOT NULL DEFAULT 'contrato_compraventa'
                  CHECK (stage IN (
                    'contrato_compraventa',
                    'valuacion',
                    'apertura_credito',
                    'procesos_notariales',
                    'entrega_inmueble',
                    'cerrado_ganado',
                    'cerrado_perdido'
                  )),

  offered_price_mxn     numeric,
  expected_close_date   date,
  closed_at             timestamp with time zone,

  assigned_agent_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'won', 'lost')),
  lost_reason   text,
  notes         text,

  -- Origen del deal (puede venir de visita en sitio o conversión de pipeline)
  origin        text NOT NULL DEFAULT 'pipeline_conversion'
                  CHECK (origin IN ('pipeline_conversion', 'site_visit', 'manual')),

  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now()
);

-- 4. Tabla deal_documents (Checklist de documentos por expediente)
CREATE TABLE IF NOT EXISTS public.deal_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  document_type text NOT NULL,   -- 'ine', 'comprobante_domicilio', 'carta_preaprobacion', etc.
  label         text NOT NULL,   -- Nombre legible: "INE / Pasaporte"

  -- Etapa del deal a la que pertenece este documento
  deal_stage    text NOT NULL
                  CHECK (deal_stage IN (
                    'contrato_compraventa',
                    'valuacion',
                    'apertura_credito',
                    'procesos_notariales',
                    'entrega_inmueble'
                  )),

  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'received', 'validated', 'expired')),

  received_at   timestamp with time zone,
  expires_at    date,
  reference_link text,   -- Link a Drive, WhatsApp, Dropbox, etc.
  notes         text,
  sort_order    int NOT NULL DEFAULT 0,

  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now()
);

-- 5. Índices de performance
CREATE INDEX IF NOT EXISTS idx_deals_tenant_id      ON public.deals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deals_contact_id     ON public.deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_status         ON public.deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_stage          ON public.deals(stage);
CREATE INDEX IF NOT EXISTS idx_deal_docs_deal_id    ON public.deal_documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle   ON public.contacts(lifecycle);
CREATE INDEX IF NOT EXISTS idx_contacts_entry_source ON public.contacts(entry_source);

-- 6. Trigger updated_at en deals
CREATE OR REPLACE FUNCTION public.set_deals_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_updated_at ON public.deals;
CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_deals_updated_at();

DROP TRIGGER IF EXISTS trg_deal_docs_updated_at ON public.deal_documents;
CREATE TRIGGER trg_deal_docs_updated_at
  BEFORE UPDATE ON public.deal_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_deals_updated_at();

-- 7. RLS en deals
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_deals_select" ON public.deals
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "tenant_deals_insert" ON public.deals
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "tenant_deals_update" ON public.deals
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "tenant_deals_delete" ON public.deals
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    AND has_any_tenant_role(auth.uid(), ARRAY['owner'::tenant_role, 'administrador'::tenant_role])
  );

-- 8. RLS en deal_documents
ALTER TABLE public.deal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_deal_docs_select" ON public.deal_documents
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "tenant_deal_docs_insert" ON public.deal_documents
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "tenant_deal_docs_update" ON public.deal_documents
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "tenant_deal_docs_delete" ON public.deal_documents
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

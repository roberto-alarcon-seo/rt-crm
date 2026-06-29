-- ─── 1. Ampliar deals.stage con etapas de renta ──────────────────────────────
DO $$ DECLARE v text; BEGIN
  SELECT constraint_name INTO v FROM information_schema.table_constraints
  WHERE table_schema='public' AND table_name='deals' AND constraint_type='CHECK' AND constraint_name ILIKE '%stage%';
  IF v IS NOT NULL THEN EXECUTE 'ALTER TABLE public.deals DROP CONSTRAINT ' || quote_ident(v); END IF;
END $$;

ALTER TABLE public.deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN (
    -- Compra / Captación
    'contrato_compraventa','valuacion','apertura_credito','procesos_notariales','entrega_inmueble',
    -- Renta
    'revision_docs','aprobacion_propietario','firma_contrato','entrega_llaves',
    -- Cierre compartido
    'cerrado_ganado','cerrado_perdido'
  ));

-- ─── 2. Ampliar deal_documents.deal_stage con etapas de renta ─────────────────
DO $$ DECLARE v text; BEGIN
  SELECT constraint_name INTO v FROM information_schema.table_constraints
  WHERE table_schema='public' AND table_name='deal_documents' AND constraint_type='CHECK' AND constraint_name ILIKE '%deal_stage%';
  IF v IS NOT NULL THEN EXECUTE 'ALTER TABLE public.deal_documents DROP CONSTRAINT ' || quote_ident(v); END IF;
END $$;

ALTER TABLE public.deal_documents ADD CONSTRAINT deal_documents_deal_stage_check
  CHECK (deal_stage IN (
    'contrato_compraventa','valuacion','apertura_credito','procesos_notariales','entrega_inmueble',
    'revision_docs','aprobacion_propietario','firma_contrato','entrega_llaves'
  ));

-- ─── 3. Ampliar document_template_items.deal_stage ────────────────────────────
-- (no tiene CHECK constraint, es texto libre — no requiere migración)

-- ─── 4. Agregar 'rentas' a contacts.pipeline_type si existe constraint ─────────
DO $$ DECLARE v text; BEGIN
  SELECT constraint_name INTO v FROM information_schema.table_constraints
  WHERE table_schema='public' AND table_name='contacts' AND constraint_type='CHECK' AND constraint_name ILIKE '%pipeline_type%';
  IF v IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.contacts DROP CONSTRAINT ' || quote_ident(v);
    EXECUTE 'ALTER TABLE public.contacts ADD CONSTRAINT contacts_pipeline_type_check CHECK (pipeline_type IN (''calificacion'', ''captacion'', ''rentas''))';
  END IF;
END $$;

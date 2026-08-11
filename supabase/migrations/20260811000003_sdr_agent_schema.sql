-- ═════════════════════════════════════════════════════════════════════════════
-- Agente SDR: configuración real, criterios con peso y catálogo de productos
--
-- La pantalla /settings/sdr-agent era una maqueta: no había tabla, ni hook, y
-- "Guardar" era un setTimeout con un toast. Los 6 criterios de calificación
-- eran un array constante con un Badge decorativo que decía "Activo", y los
-- productos un array literal de solo lectura.
--
-- El documento de setup (§3.2) pide algo que no existía en ninguna capa:
--   · un PESO por criterio (20/20/20/15/15/10)
--   · un UMBRAL de score (≥70 caliente, 40–69 nutrir, <40 baja frecuencia)
--   · que cada score se guarde CON SU RAZÓN
--
-- Y (§3.3) que las descripciones de los productos se corrijan; las que estaban
-- hardcodeadas en la UI describían productos distintos a los reales.
--
-- Idempotente: se puede re-aplicar sin efectos secundarios.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CONFIGURACIÓN DEL AGENTE SDR (una fila por tenant)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_sdr_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled             boolean NOT NULL DEFAULT false,
  tone                text    NOT NULL DEFAULT 'professional',
  system_prompt       text,
  -- Umbrales del §3.2. hot > nurture siempre (constraint abajo).
  hot_threshold       integer NOT NULL DEFAULT 70 CHECK (hot_threshold     BETWEEN 1 AND 100),
  nurture_threshold   integer NOT NULL DEFAULT 40 CHECK (nurture_threshold BETWEEN 0 AND 99),
  -- Al cruzar hot_threshold: avisar al comercial asignado y proponer demo.
  notify_owner_on_hot boolean NOT NULL DEFAULT true,
  demo_sla_hours      integer NOT NULL DEFAULT 48 CHECK (demo_sla_hours BETWEEN 1 AND 336),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_sdr_settings DROP CONSTRAINT IF EXISTS tenant_sdr_settings_tone_chk;
ALTER TABLE public.tenant_sdr_settings
  ADD CONSTRAINT tenant_sdr_settings_tone_chk
  CHECK (tone IN ('professional', 'friendly', 'consultative', 'adaptive'));

ALTER TABLE public.tenant_sdr_settings DROP CONSTRAINT IF EXISTS tenant_sdr_settings_thresholds_chk;
ALTER TABLE public.tenant_sdr_settings
  ADD CONSTRAINT tenant_sdr_settings_thresholds_chk
  CHECK (hot_threshold > nurture_threshold);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CRITERIOS DE CALIFICACIÓN CON PESO
--    weight es la aportación máxima del criterio al score 0–100. La suma de los
--    activos debería dar 100; no se fuerza por constraint porque el usuario
--    necesita poder ajustar un peso a la vez sin que la fila intermedia falle.
--    La UI muestra la suma y avisa cuando no da 100.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sdr_qualification_criteria (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  criterion_key  text NOT NULL,
  label          text NOT NULL,
  guide_question text NOT NULL DEFAULT '',
  weight         integer NOT NULL DEFAULT 0 CHECK (weight BETWEEN 0 AND 100),
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, criterion_key)
);

CREATE INDEX IF NOT EXISTS idx_sdr_criteria_tenant
  ON public.sdr_qualification_criteria(tenant_id, sort_order);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CATÁLOGO DE PRODUCTOS QUE EL AGENTE PUEDE PRESENTAR
--    entry_signal es la regla de mapeo dolor → puerta de entrada del §3.4: le
--    dice al agente cuándo proponer este producto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sdr_products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  entry_signal text NOT NULL DEFAULT '',
  url          text,
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sdr_products_tenant
  ON public.sdr_products(tenant_id, sort_order);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RAZÓN DEL SCORE EN EL CONTACTO
--    ai-lead-scoring ya pedía al modelo un `reasoning` y lo devolvía en la
--    respuesta HTTP, pero el UPDATE a contacts solo escribía lead_score y
--    lead_temperature: la explicación se perdía en cada corrida.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lead_score_reason     text,
  ADD COLUMN IF NOT EXISTS lead_score_source     text,
  ADD COLUMN IF NOT EXISTS lead_score_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_score_breakdown  jsonb;

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_lead_score_source_chk;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_lead_score_source_chk
  CHECK (lead_score_source IS NULL OR lead_score_source IN ('manual', 'ai'));

COMMENT ON COLUMN public.contacts.lead_score_reason     IS 'Por qué el lead tiene ese score. El §3.2 del setup lo exige: "todo score se guarda con su razón".';
COMMENT ON COLUMN public.contacts.lead_score_source     IS 'manual = lo escribió una persona; ai = lo calculó el Agente SDR.';
COMMENT ON COLUMN public.contacts.lead_score_breakdown  IS 'Puntos obtenidos por criterio: {criterion_key: {awarded, weight}}.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Triggers updated_at
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_tenant_sdr_settings_updated_at ON public.tenant_sdr_settings;
CREATE TRIGGER trg_tenant_sdr_settings_updated_at BEFORE UPDATE ON public.tenant_sdr_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sdr_criteria_updated_at ON public.sdr_qualification_criteria;
CREATE TRIGGER trg_sdr_criteria_updated_at BEFORE UPDATE ON public.sdr_qualification_criteria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sdr_products_updated_at ON public.sdr_products;
CREATE TRIGGER trg_sdr_products_updated_at BEFORE UPDATE ON public.sdr_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS — SELECT abierto al tenant; escritura solo owner/administrador
--    (mismo patrón que pipelines / pipeline_stages)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_sdr_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sdr_qualification_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sdr_products               ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_sdr_settings','sdr_qualification_criteria','sdr_products']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()))
    $f$, t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL
        USING (tenant_id = public.get_user_tenant_id(auth.uid())
               AND public.has_any_tenant_role(auth.uid(), ARRAY['owner','administrador']::public.tenant_role[]))
        WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
               AND public.has_any_tenant_role(auth.uid(), ARRAY['owner','administrador']::public.tenant_role[]))
    $f$, t || '_write', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_super_admin', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL USING (public.is_super_admin(auth.uid()))
                WITH CHECK (public.is_super_admin(auth.uid()))
    $f$, t || '_super_admin', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_sdr_settings        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sdr_qualification_criteria TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sdr_products               TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Semilla por tenant: los 6 criterios del §3.2 con sus pesos
--    Se siembra para todos los tenants existentes y se deja idempotente por
--    (tenant_id, criterion_key), así que re-aplicar no duplica ni pisa los
--    pesos que el usuario haya ajustado a mano.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.sdr_qualification_criteria
  (tenant_id, criterion_key, label, guide_question, weight, sort_order)
SELECT t.id, c.criterion_key, c.label, c.guide_question, c.weight, c.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  ('size',           'Tamaño de empresa',    '¿Cuántos empleados / qué escala de operación de marketing?', 20, 10),
  ('budget',         'Presupuesto',          '¿Tienen budget aprobado o en proceso?',                      20, 20),
  ('decision_maker', 'Rol del contacto',     '¿Decide o influye en la compra? (CMO, VP, Data/IT)',         20, 30),
  ('urgency',        'Urgencia',             '¿Cuándo necesitan arrancar?',                                15, 40),
  ('product_fit',    'Fit de producto',      '¿Su caso encaja con alguno de los productos o servicios?',   15, 50),
  ('country',        'Cobertura geográfica', '¿Operan en un mercado donde entregamos?',                    10, 60)
) AS c(criterion_key, label, guide_question, weight, sort_order)
ON CONFLICT (tenant_id, criterion_key) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Fila de configuración por tenant, para que la pantalla abra con defaults
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tenant_sdr_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

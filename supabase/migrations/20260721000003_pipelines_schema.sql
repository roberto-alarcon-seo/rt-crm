-- ═════════════════════════════════════════════════════════════════════════════
-- Pipelines dinámicos configurables por tenant (estilo Kommo)
--
-- Hasta ahora "Oportunidades" era un funnel FIJO: 12 etapas hardcodeadas en el
-- frontend (PIPELINE_STAGES) y duplicadas como enum `opportunity_stage` en la BD.
-- El negocio ya no cabe en un solo funnel (Software, Consultoría de Marketing,
-- Nube de Google + captación) y el CRM se vende a otros clientes, así que cada
-- tenant necesita definir sus propios pipelines y etapas a demanda.
--
-- Este archivo crea el catálogo configurable: `pipelines` y `pipeline_stages`.
-- La tarjeta que se mueve por las etapas es una `opportunity` (ver migración
-- siguiente 20260721000004_opportunities_dynamic_stage.sql).
--
-- Permisos: TODOS los usuarios del tenant LEEN pipelines/etapas (para operar el
-- kanban); solo owner/administrador pueden CREAR/EDITAR la estructura. Por eso
-- las policies se separan por comando (SELECT abierto, escritura restringida).
--
-- Idempotente: se puede re-aplicar sin efectos secundarios.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. ENUM de semántica de cierre de una etapa
--    'open'  → etapa en proceso (cuenta en el forecast)
--    'won'   → cierre ganado
--    'lost'  → cierre perdido
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.pipeline_stage_type AS ENUM ('open','won','lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PIPELINES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pipelines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_default  boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_tenant
  ON public.pipelines(tenant_id, sort_order);

-- Un solo pipeline por defecto por tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipelines_one_default
  ON public.pipelines(tenant_id) WHERE is_default;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PIPELINE_STAGES
--    color es un hex (#RRGGBB): el kanban ya no depende de clases Tailwind bg-*.
--    legacy_stage_key mantiene el slug histórico (etapa_0_captacion…) para el
--    puente con contacts.pipeline_stage y con la maquinaria Meta/CAPI que está
--    indexada por ese slug (meta_event_mappings.pipeline_stage, etc.).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pipeline_id         uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name                text NOT NULL,
  color               text NOT NULL DEFAULT '#64748b',
  sort_order          integer NOT NULL DEFAULT 0,
  stage_type          public.pipeline_stage_type NOT NULL DEFAULT 'open',
  probability_default integer NOT NULL DEFAULT 0 CHECK (probability_default BETWEEN 0 AND 100),
  legacy_stage_key    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stages_pipeline
  ON public.pipeline_stages(pipeline_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_stages_tenant
  ON public.pipeline_stages(tenant_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Triggers updated_at (función helper compartida ya existente)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_pipelines_updated_at ON public.pipelines;
CREATE TRIGGER trg_pipelines_updated_at BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pipeline_stages_updated_at ON public.pipeline_stages;
CREATE TRIGGER trg_pipeline_stages_updated_at BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — SELECT abierto al tenant; escritura solo owner/administrador
--    Postgres evalúa policies permisivas con OR. Como el SELECT tiene su propia
--    policy abierta, un asesor lee; pero INSERT/UPDATE/DELETE solo los cubre la
--    policy de escritura, que exige el rol. La policy super_admin es el estándar
--    del proyecto para soporte cross-tenant.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pipelines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

-- pipelines
DROP POLICY IF EXISTS "pipelines_select" ON public.pipelines;
CREATE POLICY "pipelines_select" ON public.pipelines
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "pipelines_write" ON public.pipelines;
CREATE POLICY "pipelines_write" ON public.pipelines
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_any_tenant_role(auth.uid(), ARRAY['owner','administrador']::public.tenant_role[]))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_any_tenant_role(auth.uid(), ARRAY['owner','administrador']::public.tenant_role[]));

DROP POLICY IF EXISTS "pipelines_super_admin" ON public.pipelines;
CREATE POLICY "pipelines_super_admin" ON public.pipelines
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- pipeline_stages
DROP POLICY IF EXISTS "pipeline_stages_select" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_select" ON public.pipeline_stages
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "pipeline_stages_write" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_write" ON public.pipeline_stages
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_any_tenant_role(auth.uid(), ARRAY['owner','administrador']::public.tenant_role[]))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_any_tenant_role(auth.uid(), ARRAY['owner','administrador']::public.tenant_role[]));

DROP POLICY IF EXISTS "pipeline_stages_super_admin" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_super_admin" ON public.pipeline_stages
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipelines       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

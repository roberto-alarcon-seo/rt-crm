-- ═════════════════════════════════════════════════════════════════════════════
-- Reactivar `opportunities` con etapa DINÁMICA (FK a pipeline_stages)
--
-- La tabla `opportunities` existía huérfana (cero uso en el frontend, ver comment
-- en useRTDashboard.ts). Su columna `stage` era el enum fijo `opportunity_stage`.
-- Aquí pasa a ser la tarjeta real del kanban dinámico: apunta a un pipeline y a
-- una etapa configurables, y lleva `position` (orden dentro de la columna) y
-- `status` (open/won/lost) derivado de la etapa por trigger.
--
-- El enum viejo `opportunity_stage` y la columna `stage` se DEPRECAN (no se
-- borran) para no arriesgar dependencias; se eliminan físicamente en una fase 2.
--
-- Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columnas nuevas (nullable para poder backfillear en la migración de seed)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS stage_id    uuid REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'open'
      CHECK (status IN ('open','won','lost')),
  ADD COLUMN IF NOT EXISTS position    integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_opps_pipeline_stage
  ON public.opportunities(tenant_id, pipeline_id, stage_id, position);
CREATE INDEX IF NOT EXISTS idx_opps_primary_contact
  ON public.opportunities(primary_contact_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Deprecar la columna enum `stage` (no se escribe más; no se borra)
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.opportunities.stage IS
  'DEPRECATED: reemplazada por stage_id (pipeline_stages). Se mantiene por compatibilidad; no escribir.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger: derivar `status` desde el stage_type de la etapa destino y
--    setear/limpiar actual_close_date al cerrar/reabrir. Una sola fuente de
--    verdad: el status NUNCA se escribe a mano, siempre lo pone la etapa.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.opportunity_sync_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_type public.pipeline_stage_type;
BEGIN
  IF NEW.stage_id IS NULL THEN
    RETURN NEW;  -- sin etapa: dejar status por defecto
  END IF;

  SELECT stage_type INTO v_type
    FROM public.pipeline_stages
   WHERE id = NEW.stage_id;

  IF v_type IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.status := v_type::text;

  IF v_type IN ('won','lost') AND NEW.actual_close_date IS NULL THEN
    NEW.actual_close_date := CURRENT_DATE;
  ELSIF v_type = 'open' THEN
    NEW.actual_close_date := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_opp_sync_status ON public.opportunities;
CREATE TRIGGER trg_opp_sync_status
  BEFORE INSERT OR UPDATE OF stage_id ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.opportunity_sync_status();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants (RLS de opportunities ya existe: opportunities_tenant_isolation,
--    FOR ALL por tenant — mover tarjetas se permite a todos los roles; la
--    restricción owner/admin es solo para la ESTRUCTURA de pipelines).
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

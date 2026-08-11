-- ═════════════════════════════════════════════════════════════════════════════
-- Agente de Oportunidades: configuración real y loops que sí corren
--
-- La pantalla /settings/opportunity-agent era una maqueta: sin tabla, sin hook,
-- "Guardar" era un setTimeout. Los 4 loops eran <Switch defaultChecked> no
-- controlados, así que encender el "loop de recordatorio de propuesta" (que el
-- §4.1 del documento pide encender) no tenía ningún efecto.
--
-- Además se corrige un bug de infraestructura: los cron jobs de este proyecto
-- POSTean a la URL de OTRO proyecto (kzhetgbegdytnoexbmev, MLS LATAM) porque la
-- migración original la dejó hardcodeada. En dev, el agente de seguimiento, el
-- de citas y el sync de plantillas nunca corrieron contra los datos propios.
-- Ahora los crons resuelven la URL desde system_config.supabase_url, y si no
-- está configurada simplemente no disparan (en lugar de pegarle a otro cliente).
--
-- Idempotente: se puede re-aplicar sin efectos secundarios.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CONFIGURACIÓN DEL AGENTE DE OPORTUNIDADES (una fila por tenant)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_opportunity_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled     boolean NOT NULL DEFAULT false,

  -- Umbrales del §4.1
  stale_after_days integer NOT NULL DEFAULT 7  CHECK (stale_after_days BETWEEN 1 AND 90),
  alert_after_days integer NOT NULL DEFAULT 14 CHECK (alert_after_days BETWEEN 1 AND 180),

  -- Los 4 loops, ahora como banderas reales
  loop_followup_enabled          boolean NOT NULL DEFAULT true,
  loop_stall_alert_enabled       boolean NOT NULL DEFAULT true,
  -- El §4.1 pide ENCENDER este, que en la maqueta estaba apagado.
  loop_proposal_reminder_enabled boolean NOT NULL DEFAULT true,
  loop_probability_update_enabled boolean NOT NULL DEFAULT true,

  -- Cada cuántos días se recuerda una propuesta enviada, hasta respuesta o Perdida
  proposal_reminder_days integer NOT NULL DEFAULT 3 CHECK (proposal_reminder_days BETWEEN 1 AND 30),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_opportunity_settings IS
  'Configuración del Agente de Oportunidades: umbrales de inactividad y qué loops corren.';

DROP TRIGGER IF EXISTS trg_tenant_opportunity_settings_updated_at ON public.tenant_opportunity_settings;
CREATE TRIGGER trg_tenant_opportunity_settings_updated_at
  BEFORE UPDATE ON public.tenant_opportunity_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_opportunity_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_opportunity_settings_select" ON public.tenant_opportunity_settings;
CREATE POLICY "tenant_opportunity_settings_select" ON public.tenant_opportunity_settings
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "tenant_opportunity_settings_write" ON public.tenant_opportunity_settings;
CREATE POLICY "tenant_opportunity_settings_write" ON public.tenant_opportunity_settings
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_any_tenant_role(auth.uid(), ARRAY['owner','administrador']::public.tenant_role[]))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_any_tenant_role(auth.uid(), ARRAY['owner','administrador']::public.tenant_role[]));

DROP POLICY IF EXISTS "tenant_opportunity_settings_super_admin" ON public.tenant_opportunity_settings;
CREATE POLICY "tenant_opportunity_settings_super_admin" ON public.tenant_opportunity_settings
  FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_opportunity_settings TO authenticated, service_role;

INSERT INTO public.tenant_opportunity_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rastreo de recordatorios de propuesta en la oportunidad
--    Sin esto el loop no sabría cuándo mandó el último recordatorio y repetiría
--    en cada corrida del cron.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS proposal_sent_at            timestamptz,
  ADD COLUMN IF NOT EXISTS last_proposal_reminder_at   timestamptz,
  ADD COLUMN IF NOT EXISTS proposal_reminder_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_stage_change_at        timestamptz,
  ADD COLUMN IF NOT EXISTS stall_alerted_at            timestamptz;

COMMENT ON COLUMN public.opportunities.proposal_sent_at          IS 'Cuándo entró a la etapa de propuesta. Lo usa el loop de recordatorio de propuesta.';
COMMENT ON COLUMN public.opportunities.last_stage_change_at      IS 'Último cambio de etapa. Base del loop de alerta de estancamiento.';
COMMENT ON COLUMN public.opportunities.stall_alerted_at          IS 'Cuándo se avisó al manager por estancamiento, para no repetir la alerta.';

-- Sella la fecha del cambio de etapa para que los loops tengan de dónde medir.
CREATE OR REPLACE FUNCTION public.fn_opportunity_stage_stamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_key text;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.last_stage_change_at := now();
    -- Al cambiar de etapa la alerta de estancamiento se rearma.
    NEW.stall_alerted_at := NULL;

    SELECT legacy_stage_key INTO v_stage_key
    FROM public.pipeline_stages WHERE id = NEW.stage_id;

    IF v_stage_key = 'etapa_5_propuesta' THEN
      -- Solo la primera vez que entra a propuesta: si vuelve a entrar tras
      -- retroceder, se reinicia el conteo de recordatorios.
      NEW.proposal_sent_at := now();
      NEW.proposal_reminder_count := 0;
      NEW.last_proposal_reminder_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_opportunity_stage_stamps ON public.opportunities;
CREATE TRIGGER trg_opportunity_stage_stamps
  BEFORE INSERT OR UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.fn_opportunity_stage_stamps();

-- Retrollena las oportunidades existentes para que los loops no las traten como
-- estancadas desde el día uno.
UPDATE public.opportunities
SET last_stage_change_at = COALESCE(last_stage_change_at, updated_at, created_at)
WHERE last_stage_change_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Crons auto-referenciales
--    Antes: la URL del proyecto estaba hardcodeada en la migración, así que
--    todos los proyectos que aplicaron estas migraciones quedaron disparando
--    contra el proyecto de MLS LATAM. Ahora la URL sale de system_config y, si
--    no está configurada, el SELECT no devuelve filas y no se dispara nada.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_job record;
  v_specs text[][] := ARRAY[
    ARRAY['ai-followup-agent',     '*/5 * * * *'],
    ARRAY['ai-appointment-agent',  '*/30 * * * *'],
    ARRAY['sync-template-status',  '0 * * * *'],
    ARRAY['ai-opportunity-agent',  '17 * * * *']
  ];
  v_name text;
  v_sched text;
  i integer;
BEGIN
  FOR i IN 1 .. array_length(v_specs, 1) LOOP
    v_name  := v_specs[i][1];
    v_sched := v_specs[i][2];

    FOR v_job IN SELECT jobid FROM cron.job WHERE jobname = v_name LOOP
      PERFORM cron.unschedule(v_job.jobid);
    END LOOP;

    PERFORM cron.schedule(
      v_name,
      v_sched,
      format($cmd$
        SELECT net.http_post(
          url     := value || '/functions/v1/%s',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body    := '{"source":"pg_cron"}'::jsonb
        )
        FROM public.system_config
        WHERE key = 'supabase_url' AND value IS NOT NULL AND value <> '';
      $cmd$, v_name)
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

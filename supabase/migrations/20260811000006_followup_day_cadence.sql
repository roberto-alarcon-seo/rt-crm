-- ═════════════════════════════════════════════════════════════════════════════
-- Agente de Seguimiento: cadencia en días y franja de envío en hora del lead
--
-- El modelo de cadencia estaba pensado solo para la ventana de 24 h de WhatsApp:
-- los pasos se expresan en minutos con tope de 1440 y el agente filtraba las
-- conversaciones a las últimas 24 h. La cadencia comercial del §4.2 (día 2,
-- día 5, día 12) no cabía ahí, y además pasada la ventana Meta no permite
-- mensajes libres: solo plantillas aprobadas.
--
-- Solución: cada paso del followup_schedule puede llevar un `template_name`.
-- Los pasos que exceden las 24 h REQUIEREN plantilla; los que caben en la
-- ventana siguen siendo texto redactado por el agente, igual que hasta hoy.
-- Los tenants existentes no cambian de comportamiento: sus pasos son todos
-- cortos y sin plantilla.
--
-- El §4.2 pide además enviar solo entre 9:00 y 19:00 en la HORA LOCAL DEL LEAD.
-- Lo que existía (respect_business_hours) usa el horario del TENANT, que no es
-- lo mismo cuando el lead está en otro país.
--
-- Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tenant_followup_settings
  ADD COLUMN IF NOT EXISTS send_window_start_hour integer NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS send_window_end_hour   integer NOT NULL DEFAULT 19;

ALTER TABLE public.tenant_followup_settings DROP CONSTRAINT IF EXISTS tenant_followup_send_window_chk;
ALTER TABLE public.tenant_followup_settings
  ADD CONSTRAINT tenant_followup_send_window_chk
  CHECK (
    send_window_start_hour BETWEEN 0 AND 23
    AND send_window_end_hour BETWEEN 1 AND 24
    AND send_window_end_hour > send_window_start_hour
  );

COMMENT ON COLUMN public.tenant_followup_settings.send_window_start_hour IS
  'Hora local DEL LEAD a partir de la cual se puede enviar seguimiento (§4.2: 9). Distinto de respect_business_hours, que usa el horario del tenant.';
COMMENT ON COLUMN public.tenant_followup_settings.send_window_end_hour IS
  'Hora local DEL LEAD hasta la que se puede enviar seguimiento (§4.2: 19).';

COMMENT ON COLUMN public.tenant_followup_settings.followup_schedule IS
  'Arreglo de pasos [{delay_minutes, template_name?}]. delay_minutes > 1440 exige template_name: fuera de la ventana de 24 h de WhatsApp solo se pueden enviar plantillas aprobadas.';

-- El tope legacy de delay_minutes (5..360) bloqueaba cualquier cadencia larga en
-- la columna suelta que quedó de la primera versión del agente.
ALTER TABLE public.tenant_followup_settings DROP CONSTRAINT IF EXISTS tenant_followup_settings_delay_minutes_check;
ALTER TABLE public.tenant_followup_settings
  ADD CONSTRAINT tenant_followup_settings_delay_minutes_check
  CHECK (delay_minutes BETWEEN 5 AND 43200);

NOTIFY pgrst, 'reload schema';

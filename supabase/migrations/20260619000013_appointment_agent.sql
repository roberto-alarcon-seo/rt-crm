-- ── Agente de Agendamiento ────────────────────────────────────────────────────

-- Settings del agente por tenant
CREATE TABLE IF NOT EXISTS public.tenant_appointment_agent_settings (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled     boolean     NOT NULL DEFAULT false,
  hours_before integer    NOT NULL DEFAULT 24,
  include_address      boolean NOT NULL DEFAULT true,
  include_recommendations boolean NOT NULL DEFAULT true,
  custom_context text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

ALTER TABLE public.tenant_appointment_agent_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_appointment_agent_settings"
  ON public.tenant_appointment_agent_settings FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Track confirmation state on events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS confirmation_sent_at              timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_conversation_id      uuid REFERENCES public.conversations(id);

-- Link conversation to the pending event during the agendamiento flow
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS pending_event_id uuid REFERENCES public.events(id);

-- pg_cron: check for upcoming appointments every 30 minutes
SELECT cron.schedule(
  'ai-appointment-agent',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://kzhetgbegdytnoexbmev.supabase.co/functions/v1/ai-appointment-agent',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{"source":"pg_cron"}'::jsonb
  );
  $$
);

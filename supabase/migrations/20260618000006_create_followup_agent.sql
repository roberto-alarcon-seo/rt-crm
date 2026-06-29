-- Follow-up Agent: settings + tracking columns

CREATE TABLE IF NOT EXISTS public.tenant_followup_settings (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled               boolean     NOT NULL DEFAULT false,
  delay_minutes         integer     NOT NULL DEFAULT 30 CHECK (delay_minutes BETWEEN 5 AND 360),
  max_followups         integer     NOT NULL DEFAULT 2 CHECK (max_followups BETWEEN 1 AND 5),
  escalate_after_max    boolean     NOT NULL DEFAULT true,
  respect_business_hours boolean    NOT NULL DEFAULT false,
  followup_style        text        NOT NULL DEFAULT 'warm'
                        CHECK (followup_style IN ('warm', 'professional', 'casual')),
  custom_context        text        DEFAULT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

COMMENT ON TABLE public.tenant_followup_settings IS
  'Configuration for the Follow-up Agent — re-engages silent leads within the 24h WhatsApp window.';

ALTER TABLE public.tenant_followup_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_all_followup_settings"
  ON public.tenant_followup_settings FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Tracking columns on conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS followup_count  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followup_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.conversations.followup_count  IS 'Number of follow-up messages sent in this session.';
COMMENT ON COLUMN public.conversations.last_followup_at IS 'Timestamp of the last follow-up message sent.';

-- pg_cron job: call the Edge Function every 5 minutes
-- Uses pg_net to POST to the deployed function (verify_jwt = false)
SELECT cron.schedule(
  'ai-followup-agent',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://kzhetgbegdytnoexbmev.supabase.co/functions/v1/ai-followup-agent',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{"source":"pg_cron"}'::jsonb
  );
  $$
);

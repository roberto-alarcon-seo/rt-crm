-- Replace fixed delay_minutes/max_followups with a per-step schedule
ALTER TABLE public.tenant_followup_settings
  ADD COLUMN IF NOT EXISTS followup_schedule jsonb NOT NULL
    DEFAULT '[{"delay_minutes":30},{"delay_minutes":60},{"delay_minutes":720}]',
  ADD COLUMN IF NOT EXISTS mark_as_lost boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalate_to_human boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenant_followup_settings.followup_schedule IS
  'Ordered array of follow-up steps, each with a delay_minutes field. Step 1 delay is relative to last customer message; subsequent steps are relative to the previous follow-up sent.';
COMMENT ON COLUMN public.tenant_followup_settings.mark_as_lost IS
  'When all steps are exhausted, move the contact to the pipeline lost stage.';
COMMENT ON COLUMN public.tenant_followup_settings.escalate_to_human IS
  'When all steps are exhausted, assign conversation to a human advisor.';

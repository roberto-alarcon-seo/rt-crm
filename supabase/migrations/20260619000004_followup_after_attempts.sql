-- Replace two independent booleans with a single mutually-exclusive action
ALTER TABLE public.tenant_followup_settings
  ADD COLUMN IF NOT EXISTS after_attempts text NOT NULL DEFAULT 'escalate'
    CHECK (after_attempts IN ('escalate', 'lost', 'nothing'));

-- Migrate existing data: if mark_as_lost was true → 'lost', else keep 'escalate'
UPDATE public.tenant_followup_settings
  SET after_attempts = 'lost'
  WHERE mark_as_lost = true;

COMMENT ON COLUMN public.tenant_followup_settings.after_attempts IS
  'Action when all follow-up steps are exhausted: escalate (assign to human), lost (move to lost stage), nothing (stop silently).';

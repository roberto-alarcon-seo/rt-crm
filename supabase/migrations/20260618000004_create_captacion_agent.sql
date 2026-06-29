-- Captación Agent: settings table + step tracking on conversations

CREATE TABLE IF NOT EXISTS public.tenant_captacion_settings (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled       boolean     NOT NULL DEFAULT true,
  agent_name    text        NOT NULL DEFAULT 'Sofía',
  operation_focus text      NOT NULL DEFAULT 'both'
                            CHECK (operation_focus IN ('sale', 'rent', 'both')),
  greeting_message text     NOT NULL DEFAULT '¡Hola! Me da mucho gusto que nos contactes. Me gustaría conocer un poco más sobre tu inmueble para conectarte con el asesor ideal. ¿Me permites hacerte algunas preguntas? 🏡',
  questions     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  completion_message text   NOT NULL DEFAULT '¡Excelente! Ya tenemos toda la información necesaria. Un asesor especializado en captación se pondrá en contacto contigo muy pronto. ¡Gracias por tu confianza! 🙌',
  handoff_message text      NOT NULL DEFAULT 'Ya registré los datos de tu inmueble. Un asesor te contactará a la brevedad para continuar el proceso.',
  auto_escalate boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

COMMENT ON TABLE public.tenant_captacion_settings IS
  'Configuration for the Captación Agent (seller qualification flow).';

COMMENT ON COLUMN public.tenant_captacion_settings.questions IS
  'JSONB array of CaptacionQuestion: {id, label, question, type, options?, required, enabled, order}';

COMMENT ON COLUMN public.tenant_captacion_settings.operation_focus IS
  'Which operations the agent covers: sale, rent, or both.';

ALTER TABLE public.tenant_captacion_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_all_captacion_settings"
  ON public.tenant_captacion_settings
  FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Track which question index the conversation is currently on
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS captacion_step integer DEFAULT NULL;

COMMENT ON COLUMN public.conversations.captacion_step IS
  'Current step index in captacion questionnaire. NULL=not started, 0..N=active, -1=completed.';

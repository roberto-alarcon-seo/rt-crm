-- Add confirmation template set to appointment agent settings.
-- The agent picks the most appropriate approved template from this list
-- when the 24-hour WhatsApp window is not active (first contact case).
ALTER TABLE public.tenant_appointment_agent_settings
  ADD COLUMN IF NOT EXISTS confirmation_template_ids uuid[] NOT NULL DEFAULT '{}';

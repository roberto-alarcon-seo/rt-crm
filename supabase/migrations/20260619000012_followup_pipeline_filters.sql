-- Add per-pipeline toggles to tenant_followup_settings.
-- enable_captacion: run follow-ups for the seller pipeline (captacion)
-- enable_venta:     run follow-ups for the buyer/sales pipeline (calificacion)
-- Both default to true so existing tenants keep the current behaviour (follow all pipelines).
ALTER TABLE public.tenant_followup_settings
  ADD COLUMN IF NOT EXISTS enable_captacion boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_venta     boolean NOT NULL DEFAULT true;

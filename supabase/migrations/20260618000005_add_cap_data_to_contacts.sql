-- Structured seller data captured by the Captación Agent questionnaire
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS cap_data jsonb DEFAULT NULL;

COMMENT ON COLUMN public.contacts.cap_data IS
  'Answers collected by the Captacion Agent: {cap_tipo_propiedad, cap_ubicacion, cap_caracteristicas, cap_estado, cap_precio, cap_urgencia, ...}';

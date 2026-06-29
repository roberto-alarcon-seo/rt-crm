-- Expand pipeline_stage constraint to include captación (seller) stages
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_pipeline_stage_chk;

ALTER TABLE public.contacts ADD CONSTRAINT contacts_pipeline_stage_chk CHECK (
  pipeline_stage IN (
    -- Buyer stages (calificacion)
    'new_lead',
    'interest_confirmed',
    'financial_validation',
    'searching',
    'visit_scheduled',
    'visit_done',
    'follow_up',
    'negotiation',
    'closed_won',
    'closed_lost',
    -- Seller stages (captacion)
    'captacion_new',
    'captacion_valuation',
    'captacion_signed',
    'captacion_listed',
    'captacion_offers',
    'captacion_sold',
    'captacion_lost'
  )
);

-- Add pipeline_type column — defaults to calificacion so all existing contacts stay in the buyer pipeline
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS pipeline_type TEXT NOT NULL DEFAULT 'calificacion'
  CHECK (pipeline_type IN ('calificacion', 'captacion'));

CREATE INDEX IF NOT EXISTS idx_contacts_pipeline_type ON public.contacts(pipeline_type);

COMMENT ON COLUMN public.contacts.pipeline_type IS
  'Determines which pipeline the contact belongs to: calificacion (buyer) or captacion (seller).
   Set automatically by the dispatcher when the first message is classified.';

-- ─── Ampliar contacts.pipeline_stage CHECK con las etapas B2B del RT CRM ──────
-- El refactor RT CRM (20260630000003_rt_crm_base_schema) pasó los contactos al
-- pipeline B2B (etapa_0_captacion … cerrada_perdida) pero no actualizó el
-- constraint contacts_pipeline_stage_chk, que seguía admitiendo solo las etapas
-- inmobiliarias/renta. Resultado: todo INSERT de contacto fallaba con 23514.
-- Se recrea el constraint incluyendo las etapas B2B y conservando las heredadas
-- para no invalidar filas existentes.
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_pipeline_stage_chk;

ALTER TABLE public.contacts ADD CONSTRAINT contacts_pipeline_stage_chk CHECK (
  pipeline_stage IN (
    -- B2B stages (RT CRM) — coinciden con el enum public.opportunity_stage
    'etapa_0_captacion',
    'etapa_1_calificacion',
    'etapa_2_nurturing',
    'etapa_3_demo',
    'etapa_4_oportunidad',
    'etapa_5_propuesta',
    'etapa_6_negociacion',
    'etapa_7_compras_legal',
    'etapa_8_alta_proveedor',
    'etapa_9_contrato',
    'cerrada_ganada',
    'cerrada_perdida',
    -- Legacy buyer stages (calificacion)
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
    -- Legacy seller stages (captacion)
    'captacion_new',
    'captacion_valuation',
    'captacion_signed',
    'captacion_listed',
    'captacion_offers',
    'captacion_sold',
    'captacion_lost',
    -- Legacy renta stages
    'renta_nuevo',
    'renta_calificacion',
    'renta_busqueda',
    'renta_visita',
    'renta_solicitud',
    'renta_cerrado',
    'renta_perdido'
  )
);

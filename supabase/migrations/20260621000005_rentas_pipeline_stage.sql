-- ─── Ampliar contacts.pipeline_stage CHECK con etapas de renta ────────────────
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
    'captacion_lost',
    -- Renta stages
    'renta_nuevo',
    'renta_calificacion',
    'renta_busqueda',
    'renta_visita',
    'renta_solicitud',
    'renta_cerrado',
    'renta_perdido'
  )
);

-- ─── Ampliar contacts.pipeline_type CHECK con 'rentas' ────────────────────────
-- La columna fue creada con un CHECK inline (sin nombre separado), así que
-- buscamos el constraint por todas las formas posibles y lo reemplazamos.
DO $$ DECLARE v text; BEGIN
  SELECT constraint_name INTO v
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'contacts'
    AND constraint_type = 'CHECK'
    AND constraint_name ILIKE '%pipeline_type%';
  IF v IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.contacts DROP CONSTRAINT ' || quote_ident(v);
  END IF;
  -- Recreate with 'rentas' included
  EXECUTE 'ALTER TABLE public.contacts ADD CONSTRAINT contacts_pipeline_type_chk CHECK (pipeline_type IN (''calificacion'', ''captacion'', ''rentas''))';
END $$;

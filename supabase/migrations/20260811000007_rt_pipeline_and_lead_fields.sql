-- ═════════════════════════════════════════════════════════════════════════════
-- Pipeline comercial del §7.2 y campos personalizados del §7.1
--
-- El pipeline sembrado tenía 12 etapas que no coincidían con las 11 que pide el
-- documento: faltaban "Calificado", "Demo realizada" y "Cliente activo", y
-- "Compras/Legal" y "Alta Proveedor" estaban separadas cuando el documento las
-- trata como una sola. Nurturing estaba en medio del flujo (posición 2) en lugar
-- de ser un estado lateral.
--
-- De los 12 legacy_stage_key solo 4 estaban en uso (captación, calificación,
-- oportunidad y ganada), así que el resto se puede renombrar o retirar sin
-- dejar oportunidades huérfanas. La migración verifica el uso antes de borrar.
--
-- Los 11 campos del §7.1 se crean con el motor de campos personalizados que ya
-- existía pero arrancaba vacío en cada tenant.
--
-- Todo acotado a partner_id = 'randomtruffle': Brokia24 y MLS LATAM comparten
-- este código y su pipeline es otro.
--
-- Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Nuevos slugs de etapa admitidos en contacts.pipeline_stage
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint WHERE conname = 'contacts_pipeline_stage_chk';

  IF v_def IS NOT NULL AND v_def NOT LIKE '%etapa_1b_calificado%' THEN
    ALTER TABLE public.contacts DROP CONSTRAINT contacts_pipeline_stage_chk;
    -- Se reconstruye añadiendo los 3 slugs nuevos y conservando todos los
    -- anteriores, incluidos los legacy inmobiliarios que otros partners usan.
    EXECUTE 'ALTER TABLE public.contacts ADD CONSTRAINT contacts_pipeline_stage_chk CHECK ('
      || 'pipeline_stage IS NULL OR pipeline_stage = ANY (ARRAY['
      || '''etapa_0_captacion'',''etapa_1_calificacion'',''etapa_1b_calificado'','
      || '''etapa_2_nurturing'',''etapa_3_demo'',''etapa_3b_demo_realizada'','
      || '''etapa_4_oportunidad'',''etapa_5_propuesta'',''etapa_6_negociacion'','
      || '''etapa_7_compras_legal'',''etapa_8_alta_proveedor'',''etapa_9_contrato'','
      || '''etapa_10_cliente_activo'',''cerrada_ganada'',''cerrada_perdida'','
      || '''new_lead'',''interest_confirmed'',''financial_validation'',''searching'','
      || '''visit_scheduled'',''visit_done'',''follow_up'',''negotiation'','
      || '''closed_won'',''closed_lost'',''captacion_new'',''captacion_valuation'','
      || '''captacion_signed'',''captacion_listed'',''captacion_offers'','
      || '''captacion_sold'',''captacion_lost'',''renta_nuevo'',''renta_calificacion'','
      || '''renta_busqueda'',''renta_visita'',''renta_solicitud'',''renta_cerrado'','
      || '''renta_perdido'']::text[]))';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reestructura del pipeline por defecto de Random Truffle al §7.2
--    Nurturing y Perdido quedan al final: el modelo no tiene un concepto de
--    "estado lateral" distinto de una etapa, así que se representan como las
--    últimas del tablero para que no se lean como parte del avance.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pipeline uuid;
  v_tenant   uuid;
  v_spec     record;
  v_in_use   integer;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants WHERE partner_id = 'randomtruffle' LOOP
    SELECT id INTO v_pipeline
    FROM public.pipelines
    WHERE tenant_id = v_tenant AND is_default
    LIMIT 1;

    IF v_pipeline IS NULL THEN CONTINUE; END IF;

    -- Renombra / reordena / crea las etapas del documento
    FOR v_spec IN
      SELECT * FROM (VALUES
        ('etapa_0_captacion',       'Nuevo lead',                          'open',  5,   10),
        ('etapa_1_calificacion',    'En calificación',                     'open',  10,  20),
        ('etapa_1b_calificado',     'Calificado',                          'open',  20,  30),
        ('etapa_3_demo',            'Demo agendada',                       'open',  30,  40),
        ('etapa_3b_demo_realizada', 'Demo realizada',                      'open',  40,  50),
        ('etapa_4_oportunidad',     'Oportunidad abierta',                 'open',  45,  60),
        ('etapa_5_propuesta',       'Propuesta enviada',                   'open',  55,  70),
        ('etapa_6_negociacion',     'Negociación',                         'open',  70,  80),
        ('etapa_7_compras_legal',   'Compras / Legal / Alta de proveedor', 'open',  80,  90),
        ('cerrada_ganada',          'Ganado — Firma',                      'won',   100, 100),
        ('etapa_10_cliente_activo', 'Cliente activo',                      'won',   100, 110),
        -- Estados laterales, al final del tablero
        ('etapa_2_nurturing',       'Nurturing',                           'open',  15,  120),
        ('cerrada_perdida',         'Perdido',                             'lost',  0,   130)
      ) AS t(legacy_key, stage_name, stage_kind, prob, ord)
    LOOP
      UPDATE public.pipeline_stages
      SET name = v_spec.stage_name,
          sort_order = v_spec.ord,
          stage_type = v_spec.stage_kind::public.pipeline_stage_type,
          probability_default = v_spec.prob,
          updated_at = now()
      WHERE tenant_id = v_tenant
        AND pipeline_id = v_pipeline
        AND legacy_stage_key = v_spec.legacy_key;

      IF NOT FOUND THEN
        INSERT INTO public.pipeline_stages
          (tenant_id, pipeline_id, name, sort_order, stage_type, probability_default, legacy_stage_key, color)
        VALUES
          (v_tenant, v_pipeline, v_spec.stage_name, v_spec.ord,
           v_spec.stage_kind::public.pipeline_stage_type, v_spec.prob, v_spec.legacy_key, '#64748b');
      END IF;
    END LOOP;

    -- Retira las dos etapas que el documento fusiona, solo si nadie las usa.
    FOR v_spec IN
      SELECT unnest(ARRAY['etapa_8_alta_proveedor','etapa_9_contrato']) AS legacy_key
    LOOP
      SELECT count(*) INTO v_in_use
      FROM public.opportunities o
      JOIN public.pipeline_stages s ON s.id = o.stage_id
      WHERE s.tenant_id = v_tenant AND s.legacy_stage_key = v_spec.legacy_key;

      IF v_in_use = 0 THEN
        DELETE FROM public.pipeline_stages
        WHERE tenant_id = v_tenant AND pipeline_id = v_pipeline
          AND legacy_stage_key = v_spec.legacy_key;
      ELSE
        RAISE NOTICE 'Etapa % conservada: tiene % oportunidades', v_spec.legacy_key, v_in_use;
      END IF;
    END LOOP;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Campos personalizados del §7.1
--    El motor (contact_custom_fields) existía pero ningún tenant traía campos.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.contact_custom_fields
  (tenant_id, name, key, data_type, is_required, is_visible_in_list, sort_order, category)
SELECT t.id, f.name, f.key, f.data_type::public.custom_field_type, false, f.visible, f.ord, f.category
FROM public.tenants t
CROSS JOIN (VALUES
  ('País',                 'pais',              'select',     true,  10, 'Ubicación'),
  ('Ciudad',               'ciudad',            'short_text', false, 20, 'Ubicación'),
  ('Tipo de relación',     'tipo_relacion',     'select',     false, 30, 'Relación'),
  ('Partner asociado',     'partner_asociado',  'short_text', false, 40, 'Relación'),
  ('AE de Google Cloud',   'ae_google_cloud',   'short_text', false, 50, 'Relación'),
  ('Canal de origen',      'canal_origen',      'select',     true,  60, 'Origen'),
  ('Interés principal',    'interes_principal', 'select',     true,  70, 'Calificación'),
  ('Tamaño de empresa',    'tamano_empresa',    'select',     true,  80, 'Calificación'),
  ('Presupuesto',          'presupuesto',       'select',     false, 90, 'Calificación'),
  ('Urgencia',             'urgencia',          'select',     false, 100, 'Calificación')
) AS f(name, key, data_type, visible, ord, category)
WHERE t.partner_id = 'randomtruffle'
ON CONFLICT (tenant_id, key) DO NOTHING;

-- Opciones de las listas
INSERT INTO public.contact_custom_field_options (field_id, value, label, sort_order)
SELECT cf.id, o.value, o.label, o.ord
FROM public.contact_custom_fields cf
JOIN public.tenants t ON t.id = cf.tenant_id
JOIN (VALUES
  ('pais', 'MX', 'México', 10),
  ('pais', 'CO', 'Colombia', 20),
  ('pais', 'CL', 'Chile', 30),
  ('pais', 'AR', 'Argentina', 40),
  ('pais', 'PE', 'Perú', 50),
  ('pais', 'US', 'Estados Unidos', 60),
  ('pais', 'CENTROAMERICA', 'Centroamérica', 70),
  ('pais', 'OTRO', 'Otro', 80),

  ('tipo_relacion', 'cliente_directo',     'Cliente directo', 10),
  ('tipo_relacion', 'partner_nos_contrata', 'Partner nos contrata', 20),
  ('tipo_relacion', 'venta_via_partner',   'Venta vía partner', 30),

  ('canal_origen', 'gcp_ae',      'GCP / AE de Google', 10),
  ('canal_origen', 'inbound_web', 'Inbound web', 20),
  ('canal_origen', 'linkedin',    'LinkedIn', 30),
  ('canal_origen', 'paid',        'Paid', 40),
  ('canal_origen', 'whatsapp',    'WhatsApp', 50),
  ('canal_origen', 'referido',    'Referido', 60),
  ('canal_origen', 'partner',     'Partner', 70),
  ('canal_origen', 'evento',      'Evento', 80),

  ('interes_principal', 'nexus',                'Nexus', 10),
  ('interes_principal', 'aura',                 'Aura', 20),
  ('interes_principal', 'prism',                'Prism', 30),
  ('interes_principal', 'radian',               'Radian', 40),
  ('interes_principal', 'plataforma_completa',  'Plataforma completa', 50),
  ('interes_principal', 'servicios_rt',         'Servicios RT', 60),
  ('interes_principal', 'servicios_gcp',        'Servicios GCP', 70),
  ('interes_principal', 'consolas_gcp',         'Consolas GCP', 80),

  ('tamano_empresa', 'lt50',     'Menos de 50', 10),
  ('tamano_empresa', '50_200',   '50 – 200', 20),
  ('tamano_empresa', '200_1000', '200 – 1000', 30),
  ('tamano_empresa', 'gt1000',   'Más de 1000', 40),

  ('presupuesto', 'aprobado',    'Aprobado', 10),
  ('presupuesto', 'en_proceso',  'En proceso', 20),
  ('presupuesto', 'sin_definir', 'Sin definir', 30),

  ('urgencia', 'inmediata',      'Inmediata', 10),
  ('urgencia', 'este_trimestre', 'Este trimestre', 20),
  ('urgencia', 'este_ano',       'Este año', 30),
  ('urgencia', 'explorando',     'Explorando', 40)
) AS o(field_key, value, label, ord) ON o.field_key = cf.key
WHERE t.partner_id = 'randomtruffle'
  AND NOT EXISTS (
    SELECT 1 FROM public.contact_custom_field_options x
    WHERE x.field_id = cf.id AND x.value = o.value
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tope de leads activos por comercial (§7.4: sugerido 25)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.assignment_rules ar
SET max_active_leads_per_agent = 25, updated_at = now()
FROM public.tenants t
WHERE t.id = ar.tenant_id
  AND t.partner_id = 'randomtruffle'
  AND ar.max_active_leads_per_agent IS NULL;

NOTIFY pgrst, 'reload schema';

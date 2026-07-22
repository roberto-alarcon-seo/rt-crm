-- ═════════════════════════════════════════════════════════════════════════════
-- Seed del pipeline por defecto + backfill de oportunidades desde contactos
--
-- (a) Cada tenant existente estrena un "Pipeline Comercial B2B" por defecto con
--     las 12 etapas que hoy están hardcodeadas en Pipeline.tsx. Cada etapa guarda
--     su legacy_stage_key (el slug histórico) para el puente de compatibilidad.
-- (b) Por cada contacto activo con pipeline_stage se crea UNA oportunidad en la
--     etapa correspondiente (aplicando el mapeo legacy inmobiliario→B2B que hoy
--     hace LEGACY_STAGE_MAP en el frontend), heredando la empresa del contacto.
--
-- El trigger opportunity_sync_status deriva `status` (open/won/lost) en el INSERT.
-- Idempotente: guards NOT EXISTS evitan duplicar en re-ejecuciones.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- (a.1) Pipeline por defecto por tenant
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.pipelines (tenant_id, name, description, is_default, sort_order)
SELECT t.id, 'Pipeline Comercial B2B', 'Pipeline por defecto (migrado desde el funnel fijo)', true, 0
  FROM public.tenants t
 WHERE NOT EXISTS (
   SELECT 1 FROM public.pipelines p WHERE p.tenant_id = t.id AND p.is_default
 );


-- ─────────────────────────────────────────────────────────────────────────────
-- (a.2) Las 12 etapas del pipeline por defecto
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.pipeline_stages
  (tenant_id, pipeline_id, name, color, sort_order, stage_type, probability_default, legacy_stage_key)
SELECT p.tenant_id, p.id, s.name, s.color, s.ord,
       s.stype::public.pipeline_stage_type, s.prob, s.legacy
  FROM public.pipelines p
 CROSS JOIN (VALUES
   ('Captación',      '#64748b',  0, 'open',   5, 'etapa_0_captacion'),
   ('Calificación',   '#3b82f6',  1, 'open',  10, 'etapa_1_calificacion'),
   ('Nurturing',      '#6366f1',  2, 'open',  20, 'etapa_2_nurturing'),
   ('Demo Agendada',  '#8b5cf6',  3, 'open',  30, 'etapa_3_demo'),
   ('Oportunidad',    '#7c3aed',  4, 'open',  40, 'etapa_4_oportunidad'),
   ('Propuesta',      '#ec4899',  5, 'open',  55, 'etapa_5_propuesta'),
   ('Negociación',    '#f97316',  6, 'open',  70, 'etapa_6_negociacion'),
   ('Compras/Legal',  '#f59e0b',  7, 'open',  80, 'etapa_7_compras_legal'),
   ('Alta Proveedor', '#eab308',  8, 'open',  85, 'etapa_8_alta_proveedor'),
   ('Contrato/Firma', '#84cc16',  9, 'open',  95, 'etapa_9_contrato'),
   ('Ganada',         '#22c55e', 10, 'won',  100, 'cerrada_ganada'),
   ('Perdida',        '#ef4444', 11, 'lost',   0, 'cerrada_perdida')
 ) AS s(name, color, ord, stype, prob, legacy)
 WHERE p.is_default
   AND NOT EXISTS (
     SELECT 1 FROM public.pipeline_stages ps WHERE ps.pipeline_id = p.id
   );


-- ─────────────────────────────────────────────────────────────────────────────
-- (b) Backfill: una oportunidad por contacto activo con etapa
--     - LEGACY_STAGE_MAP inmobiliario→B2B replicado en SQL
--     - assigned_to solo si el agente existe en profiles (evita violar la FK)
-- ─────────────────────────────────────────────────────────────────────────────
WITH legacy_map(src, dst) AS (VALUES
  ('new_lead',             'etapa_0_captacion'),
  ('interest_confirmed',   'etapa_1_calificacion'),
  ('financial_validation', 'etapa_2_nurturing'),
  ('searching',            'etapa_3_demo'),
  ('visit_scheduled',      'etapa_4_oportunidad'),
  ('visit_done',           'etapa_5_propuesta'),
  ('follow_up',            'etapa_6_negociacion'),
  ('negotiation',          'etapa_7_compras_legal'),
  ('closed_won',           'cerrada_ganada'),
  ('closed_lost',          'cerrada_perdida')
)
INSERT INTO public.opportunities
  (tenant_id, name, account_id, primary_contact_id, pipeline_id, stage_id,
   assigned_to, origin_channel, currency, created_at)
SELECT c.tenant_id,
       'Oportunidad — ' || c.name,
       c.account_id,
       c.id,
       p.id,
       st.id,
       (SELECT pr.id FROM public.profiles pr WHERE pr.id = c.assigned_agent_id),
       c.source,
       'USD',
       now()
  FROM public.contacts c
  JOIN public.pipelines p
    ON p.tenant_id = c.tenant_id AND p.is_default
  JOIN public.pipeline_stages st
    ON st.pipeline_id = p.id
   AND st.legacy_stage_key = COALESCE(
         (SELECT dst FROM legacy_map WHERE src = c.pipeline_stage),
         c.pipeline_stage,
         'etapa_0_captacion')
 WHERE c.status <> 'deleted'
   AND c.pipeline_stage IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.opportunities o
      WHERE o.primary_contact_id = c.id AND o.pipeline_id = p.id
   );

NOTIFY pgrst, 'reload schema';

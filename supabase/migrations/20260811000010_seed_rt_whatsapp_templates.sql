-- ═════════════════════════════════════════════════════════════════════════════
-- Librería de plantillas de WhatsApp de Random Truffle (§5 del documento)
--
-- El tenant no tenía ninguna plantilla. Las 3 que el repo sembraba vía
-- master_templates son inmobiliarias ({{propiedad}}, "agendar una visita") y
-- además seed-tenant-templates copia TODAS las master activas sin filtrar por
-- partner, así que meter las de Random Truffle ahí se las habría enviado también
-- a Brokia24 y MLS LATAM. Por eso se cargan directo en templates del tenant.
--
-- Quedan en 'draft': el paso 8 del checklist del documento es enviarlas a
-- aprobación de Meta desde la propia pantalla.
--
-- Nota de redacción: el documento escribe varias plantillas empezando por
-- {{nombre}}, pero WhatsApp no acepta que el cuerpo empiece con una variable
-- (y el formulario del CRM lo valida). Se les añadió "Hola " al inicio; el
-- resto del texto es el del documento.
--
-- Los `label` usan los grupos con los que la lista de plantillas agrupa
-- (Bienvenida, Seguimiento, Citas), no las etiquetas del formulario, que estaban
-- desalineadas y hacían que todo cayera en "Sin grupo".
--
-- Acotado a partner_id = 'randomtruffle'. Idempotente por (tenant_id, name).
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO public.templates (
  tenant_id, name, display_name, category, label,
  header_type, body, footer, buttons, variables,
  approval_status, is_system, created_source, created_by_module
)
SELECT
  t.id, s.name, s.display_name, s.category, s.label,
  'none', s.body, NULL, '[]'::jsonb, s.variables,
  'draft', false, 'manual', 'rt_setup_seed'
FROM public.tenants t
CROSS JOIN (VALUES
  (
    'rt_bienvenida_web',
    'Bienvenida post-formulario web',
    'utility',
    'Bienvenida',
    'Hola {{nombre}}, soy Ruffle, el agente de AI de Random Truffle. Vi tu registro desde {{origen}}. ¿Te hago una pregunta rápida para orientarte mejor?',
    ARRAY['nombre','origen']
  ),
  (
    'rt_confirmacion_demo',
    'Confirmación de demo',
    'utility',
    'Citas',
    'Hola {{nombre}}, quedó agendada tu demo de Random Truffle: {{fecha}} a las {{hora}} ({{zona}}), con {{comercial}}. Te llega la invitación con liga de Meet. ¿Algún tema que quieras que preparemos?',
    ARRAY['nombre','fecha','hora','zona','comercial']
  ),
  (
    'rt_recordatorio_demo_24h',
    'Recordatorio de demo (24 h antes)',
    'utility',
    'Citas',
    'Hola {{nombre}}, mañana es tu demo de Random Truffle a las {{hora}} ({{zona}}). Si te sirve mover el horario, dime y lo reagendo en un minuto.',
    ARRAY['nombre','hora','zona']
  ),
  (
    'rt_followup_toque1',
    'Follow-up toque 1 (día 2) — con valor',
    'marketing',
    'Seguimiento',
    'Hola {{nombre}}, te dejo el one-pager de {{agente}} con el detalle de lo que platicamos: {{liga}}. Si te hace sentido, te propongo 30 min con el equipo. ¿Esta semana o la próxima?',
    ARRAY['nombre','agente','liga']
  ),
  (
    'rt_followup_toque2',
    'Follow-up toque 2 (día 5) — caso',
    'marketing',
    'Seguimiento',
    'Hola {{nombre}}, un dato del tema que traías: un líder de telecomunicaciones en México activó 50+ audiencias estratégicas con Random Truffle. ¿Te muestro cómo aplicaría a {{empresa}}?',
    ARRAY['nombre','empresa']
  ),
  (
    'rt_reengagement_nurturing',
    'Re-engagement / nurturing',
    'marketing',
    'Seguimiento',
    'Hola {{nombre}}, hace un tiempo platicamos de {{tema}}. Publicamos algo nuevo que te puede servir: {{liga}}. Si el tema sigue en tu radar, aquí ando.',
    ARRAY['nombre','tema','liga']
  ),
  (
    'rt_seguimiento_propuesta',
    'Seguimiento de propuesta',
    'marketing',
    'Seguimiento',
    'Hola {{nombre}}, ¿cómo van con la propuesta que les enviamos el {{fecha}}? Si hay dudas del alcance o del esquema, agendo 20 min con {{comercial}} y las resolvemos.',
    ARRAY['nombre','fecha','comercial']
  )
) AS s(name, display_name, category, label, body, variables)
WHERE t.partner_id = 'randomtruffle'
  AND NOT EXISTS (
    SELECT 1 FROM public.templates x WHERE x.tenant_id = t.id AND x.name = s.name
  );

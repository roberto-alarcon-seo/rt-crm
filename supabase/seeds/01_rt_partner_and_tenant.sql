-- ═══════════════════════════════════════════════════════════════
-- RT CRM — Seed inicial
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Proyecto: rt-crm-prd (intsmpmsvrwigdnpmvaj)
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. PARTNER — Random Truffle
--    (solo puede existir 1 por instancia por el índice único)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.partners (
  id,
  name,
  primary_domain,
  alt_domains,
  country_code,
  logo_url,
  primary_color_hex,
  primary_color_hsl,
  email_sender_name,
  email_sender_address,
  email_footer_text,
  is_active,
  auth_mode,
  external_sync_enabled
) VALUES (
  'randomtruffle',
  'Random Truffle',
  'crm.randomtruffle.com',
  ARRAY['localhost', '127.0.0.1'],
  'MX',
  '/assets/rt-logo.png',
  '#6366F1',
  '239 84% 67%',
  'Random Truffle',
  'no-reply@randomtruffle.com',
  '© Random Truffle. Todos los derechos reservados.',
  true,
  'direct',
  false
)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. TENANT — Random Truffle (instancia interna)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.tenants (
  id,
  name,
  partner_id,
  plan,
  status,
  billing_state,
  message_credits,
  enabled_features
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- UUID fijo para RT
  'Random Truffle',
  'randomtruffle',
  'enterprise',
  'active',
  'SUBSCRIBED_ACTIVE',
  0,
  ARRAY[
    'whatsapp', 'ai_followup', 'ai_sdr', 'campaigns',
    'automations', 'segments', 'pipeline', 'accounts',
    'opportunities', 'ai_studio', 'reports'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  status          = EXCLUDED.status,
  billing_state   = EXCLUDED.billing_state,
  message_credits = EXCLUDED.message_credits,
  enabled_features= EXCLUDED.enabled_features;

-- ─────────────────────────────────────────────────────────────
-- Verifica que quedaron bien
-- ─────────────────────────────────────────────────────────────
SELECT 'partner' AS tipo, id, name FROM public.partners
UNION ALL
SELECT 'tenant'  AS tipo, id, name FROM public.tenants WHERE partner_id = 'randomtruffle';

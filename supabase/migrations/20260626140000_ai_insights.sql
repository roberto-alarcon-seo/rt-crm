-- ── Phase 6: Proactive Insights ─────────────────────────────────────────────

-- conversation_type: 'user' (chat normal) | 'system' (generada por el cron)
ALTER TABLE public.ai_conversations
  ADD COLUMN IF NOT EXISTS conversation_type text DEFAULT 'user'
    CHECK (conversation_type IN ('user', 'system')),
  ADD COLUMN IF NOT EXISTS unread boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- Index para que los admins busquen rápido sus conversaciones de sistema
CREATE INDEX IF NOT EXISTS idx_ai_conversations_system
  ON public.ai_conversations (tenant_id, conversation_type, updated_at DESC);

-- RLS: admins y managers del tenant pueden ver conversaciones de sistema
CREATE POLICY "Admins see system conversations"
  ON public.ai_conversations FOR SELECT
  USING (
    conversation_type = 'system'
    AND tenant_id = get_user_tenant_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_role IN ('administrador', 'manager')
    )
  );

-- Log de insights enviados — evita duplicados en el mismo día
CREATE TABLE IF NOT EXISTS public.ai_insights_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  insight_type text        NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  summary      text
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_log_tenant_date
  ON public.ai_insights_log (tenant_id, insight_type, sent_at DESC);

ALTER TABLE public.ai_insights_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage insights log"
  ON public.ai_insights_log FOR ALL
  USING (is_super_admin(auth.uid()));

-- ── pg_cron setup ─────────────────────────────────────────────────────────────
-- PREREQUISITO: habilitar extensiones pg_cron y pg_net desde el Dashboard de
-- Supabase → Database → Extensions antes de ejecutar este bloque.
--
-- Una vez habilitadas, ejecutar en el SQL Editor:
--
-- SELECT cron.schedule(
--   'brokia-ai-insights-daily',
--   '0 14 * * 1-5',   -- 8am hora México (UTC-6) de lunes a viernes
--   $$
--   SELECT net.http_post(
--     url     := 'https://feawjjmgevmbxjuvhikv.supabase.co/functions/v1/ai-studio-insights',
--     headers := jsonb_build_object(
--       'Content-Type',    'application/json',
--       'X-Cron-Secret',   'brokia-insights-2026'
--     ),
--     body := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );

-- AI Studio: tablas de conversaciones y mensajes
-- Fase 1 de Brokia IA Studio

CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_conversations_tenant_user
  ON public.ai_conversations (tenant_id, user_id, created_at DESC);

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_messages_conversation
  ON public.ai_messages (conversation_id, created_at ASC);

-- RLS
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own conversations"
  ON public.ai_conversations FOR SELECT
  USING (user_id = auth.uid() AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users manage their own conversations"
  ON public.ai_conversations FOR ALL
  USING (user_id = auth.uid() AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users see messages of their conversations"
  ON public.ai_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.ai_conversations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert messages in their conversations"
  ON public.ai_messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.ai_conversations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Super admins manage all AI data"
  ON public.ai_conversations FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins manage all AI messages"
  ON public.ai_messages FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM public.ai_conversations
    ) AND is_super_admin(auth.uid())
  );

-- GRANTs explícitos requeridos (pg_dump no los incluye)
GRANT ALL ON public.ai_conversations TO service_role;
GRANT ALL ON public.ai_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT, INSERT ON public.ai_messages TO authenticated;
GRANT SELECT ON public.ai_conversations TO anon;

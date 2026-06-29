-- Add agent_mode to conversations for multi-agent dispatcher routing
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS agent_mode text
  CHECK (agent_mode IN ('calificacion', 'captacion', 'seguimiento'));

COMMENT ON COLUMN public.conversations.agent_mode IS
  'Agent assigned by dispatcher: calificacion (buyer), captacion (seller), seguimiento (follow-up). NULL = unclassified.';

CREATE INDEX IF NOT EXISTS idx_conversations_agent_mode
  ON public.conversations (tenant_id, agent_mode)
  WHERE agent_mode IS NOT NULL;

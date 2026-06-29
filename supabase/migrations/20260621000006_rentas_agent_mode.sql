-- Ampliar conversations.agent_mode CHECK para incluir 'rentas'
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_agent_mode_check;

ALTER TABLE public.conversations ADD CONSTRAINT conversations_agent_mode_check
  CHECK (agent_mode IN ('calificacion', 'captacion', 'seguimiento', 'rentas'));

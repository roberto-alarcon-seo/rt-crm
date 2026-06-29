-- Feedback column for AI messages (thumbs up / down)
ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS feedback text
  CHECK (feedback IN ('positive', 'negative'));

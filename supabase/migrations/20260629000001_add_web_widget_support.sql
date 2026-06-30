-- Web Chat Widget support
-- Adds widget_settings, widget_sessions tables and extends conversations/messages for web_chat channel

-- 1. Add channel column to conversations (default 'whatsapp' preserves all existing rows)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

-- 2. Make customer_whatsapp nullable so web_chat conversations don't need a phone
ALTER TABLE public.conversations
  ALTER COLUMN customer_whatsapp DROP NOT NULL;

-- 3. Make from_number / to_number nullable in messages (web_chat has no phone numbers)
ALTER TABLE public.messages
  ALTER COLUMN from_number DROP NOT NULL;

ALTER TABLE public.messages
  ALTER COLUMN to_number DROP NOT NULL;

-- 4. Widget settings (one row per tenant)
CREATE TABLE IF NOT EXISTS public.widget_settings (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled             boolean     NOT NULL DEFAULT false,
  widget_token        text        NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  greeting_name       text        NOT NULL DEFAULT 'Asistente',
  greeting_message    text        NOT NULL DEFAULT '¡Hola! ¿En qué puedo ayudarte hoy?',
  primary_color       text        DEFAULT NULL,
  capture_name        boolean     NOT NULL DEFAULT true,
  capture_email       boolean     NOT NULL DEFAULT true,
  capture_phone       boolean     NOT NULL DEFAULT true,
  position            text        NOT NULL DEFAULT 'bottom-right',
  initial_suggestions jsonb       NOT NULL DEFAULT '["¿Cuáles son sus precios?","¿Cómo funciona?","Quiero una demo"]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT widget_settings_tenant_id_key UNIQUE (tenant_id)
);

-- 5. Widget sessions (anonymous visitor sessions with UTMs and conversation history)
CREATE TABLE IF NOT EXISTS public.widget_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_token     text        NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  contact_id        uuid        REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id   uuid        REFERENCES public.conversations(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'active',
  visitor_name      text,
  visitor_email     text,
  visitor_phone     text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_content       text,
  utm_term          text,
  landing_page      text,
  referrer          text,
  messages          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ai_turns          int         NOT NULL DEFAULT 0,
  lead_captured_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 6. RLS for widget_settings (tenant users manage their own row)
ALTER TABLE public.widget_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can manage their widget settings"
  ON public.widget_settings FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

-- widget_sessions has no RLS - accessed only via service role from edge functions

-- 7. updated_at auto-trigger for widget_settings
CREATE OR REPLACE FUNCTION public.set_widget_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER widget_settings_updated_at
  BEFORE UPDATE ON public.widget_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_widget_settings_updated_at();

-- 8. updated_at auto-trigger for widget_sessions
CREATE OR REPLACE FUNCTION public.set_widget_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER widget_sessions_updated_at
  BEFORE UPDATE ON public.widget_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_widget_sessions_updated_at();

-- 9. Indexes for fast token lookups
CREATE INDEX IF NOT EXISTS widget_settings_widget_token_idx ON public.widget_settings(widget_token);
CREATE INDEX IF NOT EXISTS widget_sessions_session_token_idx ON public.widget_sessions(session_token);
CREATE INDEX IF NOT EXISTS widget_sessions_tenant_id_idx ON public.widget_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS conversations_channel_idx ON public.conversations(channel);

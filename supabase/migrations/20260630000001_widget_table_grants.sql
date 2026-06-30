-- Grant access to widget tables
-- Required because Supabase doesn't auto-grant on tables created via raw SQL migrations

-- Frontend (authenticated users managing their widget config)
GRANT SELECT, INSERT, UPDATE ON public.widget_settings TO authenticated;

-- Frontend stats queries
GRANT SELECT ON public.widget_sessions TO authenticated;

-- Edge functions (service_role) — widget-init and widget-chat
GRANT SELECT ON public.widget_settings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.widget_sessions TO service_role;

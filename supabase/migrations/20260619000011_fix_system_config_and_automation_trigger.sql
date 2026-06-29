-- Populate system_config with the current Supabase project URL and anon key.
-- trigger_automation_worker() reads these to call the automation-worker Edge Function via pg_net.
-- Without them the url argument is NULL, violating http_request_queue's NOT NULL constraint.
INSERT INTO public.system_config (key, value)
VALUES
  ('supabase_url',      'https://kzhetgbegdytnoexbmev.supabase.co'),
  ('supabase_anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6aGV0Z2JlZ2R5dG5vZXhibWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjI5NTUsImV4cCI6MjA5NzI5ODk1NX0.7WnPMlQeSZXKDiCFcCacMBw7woBNYX_Achs3Vu9jDLY')
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = now();

-- Add a null-guard to trigger_automation_worker so a missing config row never
-- causes a NOT NULL violation in http_request_queue (defensive, belt-and-suspenders).
CREATE OR REPLACE FUNCTION public.trigger_automation_worker() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _supabase_url TEXT;
  _anon_key TEXT;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT value INTO _supabase_url
    FROM public.system_config
    WHERE key = 'supabase_url'
    LIMIT 1;

    SELECT value INTO _anon_key
    FROM public.system_config
    WHERE key = 'supabase_anon_key'
    LIMIT 1;

    -- Guard: if config is missing, skip silently rather than crashing the transaction.
    IF _supabase_url IS NULL OR _anon_key IS NULL THEN
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url     := _supabase_url || '/functions/v1/automation-worker',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        _anon_key,
        'Authorization', 'Bearer ' || _anon_key
      ),
      body := jsonb_build_object('event_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

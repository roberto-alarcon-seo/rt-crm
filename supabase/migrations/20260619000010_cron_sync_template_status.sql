-- pg_cron job: sync WhatsApp template approval status for ALL tenants every hour.
-- Uses pg_net to POST to the Edge Function (verify_jwt = false).
--
-- NOTE: The URL contains the Supabase project ref (kzhetgbegdytnoexbmev).
-- If this project is migrated to a new Supabase instance, update the URL here
-- and re-apply, or edit the job directly in the Supabase dashboard under
-- Database → Cron Jobs.

SELECT cron.schedule(
  'sync-template-status',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://kzhetgbegdytnoexbmev.supabase.co/functions/v1/sync-template-status',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{"source":"pg_cron"}'::jsonb
  );
  $$
);

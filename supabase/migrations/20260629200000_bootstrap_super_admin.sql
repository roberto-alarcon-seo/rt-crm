-- Bootstrap first super admin
-- User: roberto@randomtruffle.com (be7ce511-f723-40ee-a955-eb0dff3557d1)
UPDATE public.profiles SET status = 'active'
WHERE id = 'be7ce511-f723-40ee-a955-eb0dff3557d1';

UPDATE public.user_roles
SET global_role = 'super_admin', tenant_role = NULL
WHERE user_id = 'be7ce511-f723-40ee-a955-eb0dff3557d1';

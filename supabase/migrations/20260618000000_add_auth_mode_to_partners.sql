-- Add auth_mode to partners table to control login strategy per partner.
-- 'sso'    → users must enter via SSO token from an external platform (current default)
-- 'direct' → users log in with email/password on a branded /login page
-- 'hybrid' → both methods available
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'sso'
  CHECK (auth_mode IN ('sso', 'direct', 'hybrid'));

-- Brokia24 operates as a direct-login partner (sells directly, no external SSO platform)
UPDATE public.partners SET auth_mode = 'direct' WHERE id = 'brokia';

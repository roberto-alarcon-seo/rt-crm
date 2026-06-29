-- Fix: the previous migration used WHERE id='brokia' but in a single-partner-per-instance
-- setup the partner row has a different id. Update whatever partner exists.
UPDATE public.partners SET auth_mode = 'direct';

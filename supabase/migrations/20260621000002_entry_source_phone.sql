-- Agrega 'phone' al CHECK constraint de entry_source en contacts
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'contacts'
    AND constraint_type = 'CHECK'
    AND constraint_name ILIKE '%entry_source%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.contacts DROP CONSTRAINT ' || quote_ident(v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_entry_source_check
  CHECK (entry_source IN ('digital', 'site_visit', 'referral', 'walk_in', 'phone'));

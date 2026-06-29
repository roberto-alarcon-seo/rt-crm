-- Enforce exactly 1 partner per Supabase instance.
-- Removes Lovable seed partners (brokia, mls_latam, responde) that were
-- inserted by migration 20260426180920 and are irrelevant in new instances.
-- Only deletes if no tenants are attached (safe for any environment).

DELETE FROM public.partners
WHERE id IN ('brokia', 'mls_latam', 'responde')
  AND NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE partner_id = partners.id
  );

-- Unique index on constant expression (true) means only 1 row can ever exist.
-- Second INSERT raises unique_violation, preventing accidental multi-partner setups.
CREATE UNIQUE INDEX IF NOT EXISTS one_partner_per_instance
  ON public.partners ((true));

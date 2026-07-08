-- ─── delete_account_cascade ───────────────────────────────────────────────────
-- Borra una empresa (account) y TODO lo relacionado en una transacción,
-- respetando el orden de FKs y el aislamiento por tenant.
--
-- Relaciones a accounts:
--   account_relationships           -> CASCADE (automático)
--   attribution.account_id          -> NO ACTION (se borra explícito)
--   contacts.account_id             -> NO ACTION (se borra explícito; cascada a sus hijos)
--   opportunities.account_id / partner_account_id -> NO ACTION
--   vendor_registration_processes.account_id      -> NO ACTION
-- Relaciones a contacts (bloqueantes): attribution.contact_id y
--   opportunities.primary_contact_id son NO ACTION, por eso se borran antes.

CREATE OR REPLACE FUNCTION public.delete_account_cascade(p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_user_tenant    uuid;
  v_account_tenant uuid;
  v_is_super       boolean;
  v_contacts       int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_account_tenant FROM public.accounts WHERE id = p_account_id;
  IF v_account_tenant IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_user_tenant := public.get_user_tenant_id(v_uid);
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND global_role = 'super_admin'
  ) INTO v_is_super;

  -- Solo el propio tenant (o un super admin) puede borrar la empresa.
  IF NOT v_is_super AND v_account_tenant IS DISTINCT FROM v_user_tenant THEN
    RAISE EXCEPTION 'FORBIDDEN_WRONG_TENANT' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_contacts FROM public.contacts WHERE account_id = p_account_id;

  -- 1. vendor_registration_processes (referencia account y opportunities)
  DELETE FROM public.vendor_registration_processes
  WHERE account_id = p_account_id
     OR opportunity_id IN (
       SELECT id FROM public.opportunities
       WHERE account_id = p_account_id OR partner_account_id = p_account_id
     );

  -- 2. opportunities (opportunity_lines cascada). Incluye las que referencian
  --    contactos de esta empresa como primary_contact_id.
  DELETE FROM public.opportunities
  WHERE account_id = p_account_id
     OR partner_account_id = p_account_id
     OR primary_contact_id IN (SELECT id FROM public.contacts WHERE account_id = p_account_id);

  -- 3. attribution (referencia account y contactos)
  DELETE FROM public.attribution
  WHERE account_id = p_account_id
     OR contact_id IN (SELECT id FROM public.contacts WHERE account_id = p_account_id);

  -- 4. contacts de la empresa (cascada a conversations, deals, notes, consents,
  --    campaign_*, etc.; SET NULL en messages/assignment_logs/widget_sessions).
  DELETE FROM public.contacts WHERE account_id = p_account_id;

  -- 5. relaciones partner<->cliente (CASCADE de todos modos, explícito por claridad)
  DELETE FROM public.account_relationships
  WHERE partner_account_id = p_account_id OR client_account_id = p_account_id;

  -- 6. la empresa
  DELETE FROM public.accounts WHERE id = p_account_id;

  RETURN jsonb_build_object('deleted', true, 'deleted_contacts', v_contacts);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_account_cascade(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_account_cascade(uuid) TO authenticated;

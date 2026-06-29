-- Add auth_mode to the partner_update_settings whitelist so the admin UI can save it.
CREATE OR REPLACE FUNCTION public.partner_update_settings(_partner_id text, _patch jsonb)
RETURNS public.partners
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_global_super boolean;
  v_row public.partners;
  v_new_primary text;
  v_new_alt text[];
  v_auth_mode text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND global_role = 'super_admin' AND partner_scope IS NULL
  ) INTO v_is_global_super;

  IF NOT v_is_global_super THEN
    RAISE EXCEPTION 'FORBIDDEN_GLOBAL_SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.partners WHERE id = _partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Validate domain uniqueness if provided
  IF _patch ? 'primary_domain' THEN
    v_new_primary := lower(btrim(_patch->>'primary_domain'));
    IF v_new_primary = '' OR v_new_primary !~ '^[a-z0-9.-]+\.[a-z]{2,}$' THEN
      RAISE EXCEPTION 'INVALID_PRIMARY_DOMAIN' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.partners
      WHERE id <> _partner_id
        AND (primary_domain = v_new_primary OR v_new_primary = ANY(alt_domains))
    ) THEN
      RAISE EXCEPTION 'PRIMARY_DOMAIN_ALREADY_USED' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF _patch ? 'alt_domains' THEN
    SELECT array_agg(lower(btrim(d)))
    INTO v_new_alt
    FROM jsonb_array_elements_text(_patch->'alt_domains') d
    WHERE btrim(d) <> '';
    v_new_alt := COALESCE(v_new_alt, ARRAY[]::text[]);

    IF EXISTS (
      SELECT 1 FROM unnest(v_new_alt) x
      WHERE x !~ '^[a-z0-9.-]+\.[a-z]{2,}$'
    ) THEN
      RAISE EXCEPTION 'INVALID_ALT_DOMAIN' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.partners p, unnest(v_new_alt) x
      WHERE p.id <> _partner_id
        AND (p.primary_domain = x OR x = ANY(p.alt_domains))
    ) THEN
      RAISE EXCEPTION 'ALT_DOMAIN_ALREADY_USED' USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Validate auth_mode if provided
  IF _patch ? 'auth_mode' THEN
    v_auth_mode := _patch->>'auth_mode';
    IF v_auth_mode NOT IN ('sso', 'direct', 'hybrid') THEN
      RAISE EXCEPTION 'INVALID_AUTH_MODE' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.partners SET
    name                  = COALESCE(_patch->>'name', name),
    country_code          = COALESCE(_patch->>'country_code', country_code),
    primary_domain        = COALESCE(v_new_primary, primary_domain),
    alt_domains           = COALESCE(v_new_alt, alt_domains),
    dashboard_url         = CASE WHEN _patch ? 'dashboard_url' THEN NULLIF(_patch->>'dashboard_url','') ELSE dashboard_url END,
    non_sso_redirect_url  = CASE WHEN _patch ? 'non_sso_redirect_url' THEN NULLIF(_patch->>'non_sso_redirect_url','') ELSE non_sso_redirect_url END,
    logout_redirect_url   = CASE WHEN _patch ? 'logout_redirect_url' THEN NULLIF(_patch->>'logout_redirect_url','') ELSE logout_redirect_url END,
    is_active             = COALESCE((_patch->>'is_active')::boolean, is_active),
    external_sync_enabled = COALESCE((_patch->>'external_sync_enabled')::boolean, external_sync_enabled),
    auth_mode             = COALESCE(v_auth_mode, auth_mode),
    updated_at            = now()
  WHERE id = _partner_id
  RETURNING * INTO v_row;

  -- Update wallet threshold if provided
  IF _patch ? 'low_balance_threshold' THEN
    UPDATE public.partner_super_wallets
    SET low_balance_threshold = GREATEST(0, (_patch->>'low_balance_threshold')::int),
        updated_at = now()
    WHERE partner_id = _partner_id;
  END IF;

  INSERT INTO public.security_events (user_id, event_type, metadata)
  VALUES (v_uid, 'partner_settings_change',
    jsonb_build_object('partner_id', _partner_id, 'patch_keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(_patch) k)));

  RETURN v_row;
END;
$$;

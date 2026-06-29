-- Fix: can_send_message blocked tenants with CREDITS_EXHAUSTED even when message_credits > 0.
-- Root cause: billing_state can desync from actual credit balance if credits are added directly
-- or if fn_apply_credit_movement deducted before initial credits were assigned.
-- fn_apply_credit_movement already auto-heals billing_state during debits, but it never ran
-- because can_send_message blocked first.
-- Fix: also allow sending when billing_state = CREDITS_EXHAUSTED but message_credits > 0.
-- The next fn_apply_credit_movement call will correct billing_state automatically.

CREATE OR REPLACE FUNCTION public.can_send_message(p_tenant_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_state public.tenant_billing_state;
  v_credits integer;
BEGIN
  SELECT billing_state, message_credits
  INTO v_state, v_credits
  FROM public.tenants
  WHERE id = p_tenant_id;

  -- Subscribers can always send
  IF v_state = 'SUBSCRIBED_ACTIVE' THEN
    RETURN true;
  END IF;

  -- Active with credits: normal case
  IF v_state = 'ACTIVE_WITH_CREDITS' AND v_credits > 0 THEN
    RETURN true;
  END IF;

  -- Auto-heal path: billing_state is CREDITS_EXHAUSTED but credits are actually available.
  -- This happens when credits are granted without going through fn_apply_credit_movement,
  -- or when an early debit set the state before the initial credit grant.
  -- fn_apply_credit_movement will correct billing_state to ACTIVE_WITH_CREDITS on the next debit.
  IF v_state = 'CREDITS_EXHAUSTED' AND v_credits > 0 THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

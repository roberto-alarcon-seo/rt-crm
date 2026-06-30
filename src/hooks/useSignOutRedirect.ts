import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePartnerBranding } from "@/contexts/PartnerBrandingContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a sign-out handler that chooses the post-logout destination:
 *
 * 1. logoutRedirectUrl (explicit DB override) → always respected
 * 2. Otherwise                                → /login (local login page)
 */
export function useSignOutRedirect() {
  const { signOut } = useAuth();
  const { partner } = usePartnerBranding();

  return useCallback(async () => {
    try {
      await signOut();
    } catch {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }

    // Explicit override always wins
    if (partner?.logoutRedirectUrl) {
      window.location.href = partner.logoutRedirectUrl;
      return;
    }

    window.location.href = "/login";
  }, [signOut, partner?.logoutRedirectUrl]);
}

import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePartnerBranding } from "@/contexts/PartnerBrandingContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a sign-out handler that chooses the post-logout destination
 * based on the partner's auth_mode and logout_redirect_url:
 *
 * 1. logoutRedirectUrl (explicit DB override) → always respected
 * 2. authMode 'direct' | 'hybrid'            → /login  (local branded page)
 * 3. authMode 'sso'                          → /welcome (SSO landing)
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

    // For direct/hybrid partners, stay on the local login page
    if (partner?.authMode === "direct" || partner?.authMode === "hybrid") {
      window.location.href = "/login";
      return;
    }

    // SSO partners: show the public landing (user re-enters via their platform)
    window.location.href = "/welcome";
  }, [signOut, partner?.logoutRedirectUrl, partner?.authMode]);
}

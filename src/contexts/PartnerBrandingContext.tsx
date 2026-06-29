import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PARTNER_ID,
  PARTNERS,
  type PartnerStaticConfig,
  resolvePartnerByHostname,
} from "@/config/partnerConfig";
import {
  applyPartnerTheme,
  buildDefaultTheme,
  type PartnerTheme,
} from "@/lib/partnerTheme";

export interface PartnerBranding {
  id: string;
  name: string;
  primaryDomain: string;
  altDomains: string[];
  countryCode: string;
  logoUrl: string;
  logoMarkUrl: string | null;
  /**
   * Horizontal/full logo shown when the sidebar is expanded.
   * Stored inside `partners.branding.sidebar_logo_expanded_url`.
   * Null → fallback to `logoUrl`.
   */
  sidebarLogoExpandedUrl: string | null;
  /** Light-sidebar variant of the collapsed (icon) logo. */
  logoCollapsedLightUrl: string | null;
  /** Light-sidebar variant of the expanded (horizontal) logo. */
  logoExpandedLightUrl: string | null;
  primaryColorHex: string;
  primaryColorHsl: string;
  accentColorHex: string | null;
  emailSenderName: string;
  emailSenderAddress: string;
  emailFooterText: string | null;
  /**
   * URL of the partner's master Core dashboard. Tenant users are redirected
   * here from the CRM landing page, since access to the CRM is SSO-only.
   */
  dashboardUrl: string | null;
  /** Optional redirect for unauthenticated users hitting the landing page. */
  nonSsoRedirectUrl: string | null;
  /** Optional redirect after the user signs out. */
  logoutRedirectUrl: string | null;
  /** Full design tokens for this partner (loaded from `partners.branding`). */
  theme: PartnerTheme;
  /** Light-mode theme for this partner. */
  lightTheme: PartnerTheme;
  /** Dark-mode theme for this partner. */
  darkTheme: PartnerTheme;
  /**
   * Login strategy for this partner.
   * 'sso'    → tenant users must enter via SSO from an external platform
   * 'direct' → tenant users log in with email/password on this app's /login page
   * 'hybrid' → both methods available
   */
  authMode: 'sso' | 'direct' | 'hybrid';
}

interface PartnerBrandingContextValue {
  partner: PartnerBranding;
  isLoading: boolean;
  /**
   * Apply a theme on the fly (without persisting). Useful for the
   * Partner Settings preview while the user tweaks tokens.
   * Pass `null` to revert to the saved partner theme.
   */
  setLiveTheme: (theme: PartnerTheme | null) => void;
  /**
   * Update the context's cached partner theme after a successful save so the
   * app reflects the new branding without a full page reload.
   */
  updatePartnerTheme: (theme: PartnerTheme) => void;
  /**
   * Switch the active partner branding to a specific partner_id.
   * Used by the auth bridge to apply the theme of the tenant's partner
   * once the user is authenticated. Pass `null` to revert to the
   * hostname-resolved partner (anonymous default).
   */
  setActivePartnerId: (partnerId: string | null) => void;
}

const PartnerBrandingContext = createContext<PartnerBrandingContextValue | undefined>(
  undefined,
);

function staticToBranding(p: PartnerStaticConfig): PartnerBranding {
  return {
    id: p.id,
    name: p.name,
    primaryDomain: p.primaryDomain,
    altDomains: p.altDomains,
    countryCode: p.countryCode,
    logoUrl: p.logoUrl,
    logoMarkUrl: p.logoMarkUrl ?? null,
    sidebarLogoExpandedUrl: null,
    logoCollapsedLightUrl: null,
    logoExpandedLightUrl: null,
    primaryColorHex: p.primaryColorHex,
    primaryColorHsl: p.primaryColorHsl,
    accentColorHex: p.accentColorHex ?? null,
    emailSenderName: p.emailSenderName,
    emailSenderAddress: p.emailSenderAddress,
    emailFooterText: p.emailFooterText ?? null,
    // Static fallback: assume the dashboard lives at the partner's primary
    // domain. The DB value (when available) takes precedence.
    dashboardUrl: p.primaryDomain ? `https://${p.primaryDomain}` : null,
    nonSsoRedirectUrl: null,
    logoutRedirectUrl: null,
    lightTheme: buildDefaultTheme(p.primaryColorHsl, p.defaultLightPreset, p.defaultDarkPreset, "light"),
    darkTheme: buildDefaultTheme(p.primaryColorHsl, p.defaultLightPreset, p.defaultDarkPreset, "dark"),
    theme: buildDefaultTheme(p.primaryColorHsl, p.defaultLightPreset, p.defaultDarkPreset, "light"),
    authMode: p.authMode ?? 'sso',
  };
}

function applyMetaTags(partner: PartnerBranding) {
  document.title = partner.name;
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = partner.primaryColorHex;
}

export function PartnerBrandingProvider({ children }: { children: ReactNode }) {
  // Resolve initial partner synchronously from hostname (no flash)
  const initialStatic = useMemo(() => {
    if (typeof window === "undefined") return PARTNERS[DEFAULT_PARTNER_ID];
    return resolvePartnerByHostname(window.location.hostname);
  }, []);

  const [partner, setPartner] = useState<PartnerBranding>(() =>
    staticToBranding(initialStatic),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [liveTheme, setLiveThemeState] = useState<PartnerTheme | null>(null);
  // Track original HTML class so we can restore it when preview ends
  const inPreviewRef = useRef(false);
  const prevHtmlClassRef = useRef<"dark" | "light">("dark");
  // Active partner_id requested by the auth bridge. When set, overrides
  // the hostname-based resolution so each tenant sees its own branding
  // even when multiple tenants share the same domain (e.g. *.lovable.app).
  const [activePartnerId, setActivePartnerIdState] = useState<string | null>(
    null,
  );

  // Live-preview only: apply a temporary theme while the user tweaks tokens
  // in settings. ThemeContext owns the normal apply path and will correct
  // itself when liveTheme is cleared (partner.lightTheme / darkTheme update).
  useEffect(() => {
    if (!liveTheme) {
      inPreviewRef.current = false;
      return;
    }
    if (!inPreviewRef.current) {
      prevHtmlClassRef.current = document.documentElement.classList.contains("light")
        ? "light"
        : "dark";
      inPreviewRef.current = true;
    }
    applyPartnerTheme(liveTheme);
    const lightnessMatch = liveTheme.app_bg.trim().match(/(\d+(?:\.\d+)?)%\s*$/);
    const isLight =
      liveTheme.mode === "light" ||
      (!!lightnessMatch && parseFloat(lightnessMatch[1]) >= 50);
    const cls = isLight ? "light" : "dark";
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(cls);
    document.body.classList.remove("dark", "light");
  }, [liveTheme]);

  // Hydrate partner branding from DB. Re-runs whenever the auth bridge
  // requests a different active partner so the theme follows the tenant.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const hostname = window.location.hostname
          .toLowerCase()
          .replace(/:\d+$/, "");

        const { data, error } = await supabase
          .from("partners")
          .select("*")
          .eq("is_active", true);

        if (cancelled || error || !data) {
          setIsLoading(false);
          return;
        }

        // Dev override: ?partner=xxx guarda el id en localStorage.
        // Si el partner NO existe en esta DB (ej: brokia en mlslatam-dev),
        // usamos el static config directamente sin necesidad de un row en DB.
        const devOverride = localStorage.getItem("rtcrm-partner-dev") ?? localStorage.getItem("brokia-partner-dev");
        if (devOverride && PARTNERS[devOverride] && !data.find((p) => p.id === devOverride)) {
          if (!cancelled) setPartner(staticToBranding(PARTNERS[devOverride]));
          setIsLoading(false);
          return;
        }

        // Resolution priority:
        //   1. Explicit activePartnerId (from authenticated tenant).
        //   2. Dev override (localhost testing via ?partner=xxx).
        //   3. Hostname match (primary_domain or alt_domains).
        //   4. DEFAULT_PARTNER_ID fallback (legacy seed data).
        //   5. First active partner — single-partner-per-instance model.
        const match =
          (activePartnerId
            ? data.find((p) => p.id === activePartnerId)
            : null) ??
          (devOverride ? data.find((p) => p.id === devOverride) : null) ??
          data.find(
            (p) =>
              p.primary_domain === hostname ||
              (p.alt_domains as string[] | null)?.includes(hostname),
          ) ??
          data.find((p) => p.id === DEFAULT_PARTNER_ID) ??
          data[0];

        if (match) {
          const savedTheme = (match.branding ?? null) as Partial<PartnerTheme> | null;
          const staticCfg = Object.values(PARTNERS).find((p) => p.id === match.id);
          const baseLightTheme = buildDefaultTheme(match.primary_color_hsl, staticCfg?.defaultLightPreset, staticCfg?.defaultDarkPreset, "light");
          const baseDarkTheme = buildDefaultTheme(match.primary_color_hsl, staticCfg?.defaultLightPreset, staticCfg?.defaultDarkPreset, "dark");
          const mergedTheme: PartnerTheme = {
            ...baseLightTheme,
            ...(savedTheme && typeof savedTheme === "object" ? savedTheme : {}),
            primary_color: savedTheme?.primary_color || match.primary_color_hsl,
          };
          setPartner({
            id: match.id,
            name: match.name,
            primaryDomain: match.primary_domain,
            altDomains: (match.alt_domains as string[]) ?? [],
            countryCode: match.country_code,
            logoUrl: match.logo_url,
            logoMarkUrl: match.logo_mark_url,
            sidebarLogoExpandedUrl:
              (mergedTheme as { sidebar_logo_expanded_url?: string | null })
                .sidebar_logo_expanded_url ?? null,
            logoCollapsedLightUrl:
              (mergedTheme as { logo_collapsed_light_url?: string | null })
                .logo_collapsed_light_url ?? null,
            logoExpandedLightUrl:
              (mergedTheme as { logo_expanded_light_url?: string | null })
                .logo_expanded_light_url ?? null,
            primaryColorHex: match.primary_color_hex,
            primaryColorHsl: match.primary_color_hsl,
            accentColorHex: match.accent_color_hex,
            emailSenderName: match.email_sender_name,
            emailSenderAddress: match.email_sender_address,
            emailFooterText: match.email_footer_text,
            dashboardUrl:
              (match as { dashboard_url?: string | null }).dashboard_url ??
              (match.primary_domain ? `https://${match.primary_domain}` : null),
            nonSsoRedirectUrl:
              (match as { non_sso_redirect_url?: string | null })
                .non_sso_redirect_url ?? null,
            logoutRedirectUrl:
              (match as { logout_redirect_url?: string | null })
                .logout_redirect_url ?? null,
            lightTheme: { ...baseLightTheme, primary_color: mergedTheme.primary_color },
            darkTheme: { ...baseDarkTheme, primary_color: mergedTheme.primary_color },
            theme: mergedTheme,
            authMode:
              ((match as { auth_mode?: string }).auth_mode as 'sso' | 'direct' | 'hybrid') ?? 'sso',
          });
        }
      } catch (e) {
        console.warn("[PartnerBranding] hydrate failed", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePartnerId]);

  const updatePartnerTheme = useCallback((theme: PartnerTheme) => {
    setPartner((prev) => ({ ...prev, theme }));
  }, []);

  // Keep <title> and theme-color meta in sync with the active partner.
  useEffect(() => { applyMetaTags(partner); }, [partner]);

  // Realtime: re-apply branding whenever the partner row changes in the DB.
  // Covers the case where an admin saves new branding from another tab/session.
  useEffect(() => {
    if (isLoading || !partner.id) return;

    const channel = supabase
      .channel(`partner-branding-${partner.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "partners", filter: `id=eq.${partner.id}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const savedTheme = (row.branding ?? null) as Partial<PartnerTheme> | null;
          const staticCfgRt = Object.values(PARTNERS).find((p) => p.id === (row.id as string));
          const hsl = row.primary_color_hsl as string | null;
          const baseLightRt = buildDefaultTheme(hsl, staticCfgRt?.defaultLightPreset, staticCfgRt?.defaultDarkPreset, "light");
          const baseDarkRt = buildDefaultTheme(hsl, staticCfgRt?.defaultLightPreset, staticCfgRt?.defaultDarkPreset, "dark");
          const mergedTheme: PartnerTheme = {
            ...baseLightRt,
            ...(savedTheme && typeof savedTheme === "object" ? savedTheme : {}),
            primary_color: savedTheme?.primary_color || hsl || baseLightRt.primary_color,
          };
          setPartner((prev) => ({
            ...prev,
            primaryColorHex: (row.primary_color_hex as string) ?? prev.primaryColorHex,
            logoUrl: (row.logo_url as string) ?? prev.logoUrl,
            sidebarLogoExpandedUrl: (mergedTheme as { sidebar_logo_expanded_url?: string | null }).sidebar_logo_expanded_url ?? prev.sidebarLogoExpandedUrl,
            logoCollapsedLightUrl: (mergedTheme as { logo_collapsed_light_url?: string | null }).logo_collapsed_light_url ?? prev.logoCollapsedLightUrl,
            logoExpandedLightUrl: (mergedTheme as { logo_expanded_light_url?: string | null }).logo_expanded_light_url ?? prev.logoExpandedLightUrl,
            lightTheme: { ...baseLightRt, primary_color: mergedTheme.primary_color },
            darkTheme: { ...baseDarkRt, primary_color: mergedTheme.primary_color },
            theme: mergedTheme,
          }));
          setLiveThemeState(null);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partner.id, isLoading]);

  const value = useMemo<PartnerBrandingContextValue>(
    () => ({
      partner,
      isLoading,
      setLiveTheme: (theme) => setLiveThemeState(theme),
      updatePartnerTheme,
      setActivePartnerId: (id) => setActivePartnerIdState(id),
    }),
    [partner, isLoading, updatePartnerTheme],
  );

  return (
    <PartnerBrandingContext.Provider value={value}>
      {children}
    </PartnerBrandingContext.Provider>
  );
}

export function usePartnerBranding(): PartnerBrandingContextValue {
  const ctx = useContext(PartnerBrandingContext);
  if (!ctx) {
    throw new Error(
      "usePartnerBranding must be used within PartnerBrandingProvider",
    );
  }
  return ctx;
}
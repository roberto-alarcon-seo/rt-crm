/**
 * Configuración estática de partners (white-label).
 *
 * Sirve como fallback para el primer paint (antes de que `usePartnerBranding`
 * pueda hacer fetch a la tabla `partners`). En runtime, los datos de la base
 * de datos sobreescriben estos valores si están disponibles.
 *
 * IMPORTANTE: Mantener sincronizado con la migración seed.
 */

export interface PartnerStaticConfig {
  id: string;
  name: string;
  primaryDomain: string;
  altDomains: string[];
  countryCode: string;
  logoUrl: string;
  logoMarkUrl?: string;
  primaryColorHex: string;
  primaryColorHsl: string; // formato "H S% L%" para CSS variables
  accentColorHex?: string;
  emailSenderName: string;
  emailSenderAddress: string;
  emailFooterText?: string;
  defaultLightPreset?: string;
  defaultDarkPreset?: string;
  authMode?: 'sso' | 'direct' | 'hybrid';
}

export const PARTNERS: Record<string, PartnerStaticConfig> = {
  randomtruffle: {
    id: "randomtruffle",
    name: "RT CRM",
    primaryDomain: "crm.randomtruffle.com",
    altDomains: ["localhost", "127.0.0.1"],
    countryCode: "MX",
    logoUrl: "https://intsmpmsvrwigdnpmvaj.supabase.co/storage/v1/object/public/partner-logos/randomtruffle/logo-1782775189649.png",
    logoMarkUrl: "https://intsmpmsvrwigdnpmvaj.supabase.co/storage/v1/object/public/partner-logos/randomtruffle/logo-collapsed-light-1782775194403.png",
    primaryColorHex: "#6366F1",
    primaryColorHsl: "239 84% 67%",
    emailSenderName: "RT CRM",
    emailSenderAddress: "no-reply@randomtruffle.com",
    emailFooterText: "© Random Truffle. Todos los derechos reservados.",
    defaultLightPreset: "rt_light",
    defaultDarkPreset: "rt_dark",
    authMode: "direct",
  },
  brokia: {
    id: "brokia",
    name: "Brokia24",
    primaryDomain: "app.brokia24.com",
    altDomains: [
      "linkasa.brokia24.com",
      "notyfive-app-realstate.lovable.app",
      "id-preview--d1cabd58-4d71-4307-9859-d54faa575f1e.lovable.app",
    ],
    countryCode: "MX",
    logoUrl: "/assets/brokia-logo.png",
    primaryColorHex: "#942CCC",
    primaryColorHsl: "279 65% 49%",
    emailSenderName: "Brokia24",
    emailSenderAddress: "no-reply@notifications.brokia24.com",
    emailFooterText: "© Brokia24. Todos los derechos reservados.",
    defaultLightPreset: "brokia_light",
    defaultDarkPreset: "brokia_dark",
    authMode: "direct",
  },
  mlslatam: {
    id: "mlslatam",
    name: "MLS LATAM",
    primaryDomain: "crm.mlslatam.com",
    altDomains: ["mlslatam-crm.vercel.app"],
    countryCode: "MX",
    logoUrl: "/assets/logo_mlslatam.jpg",
    primaryColorHex: "#E8412A",
    primaryColorHsl: "9 78% 54%",
    emailSenderName: "MLS LATAM",
    emailSenderAddress: "no-reply@notifications.mlslatam.com",
    emailFooterText: "© MLS LATAM. Todos los derechos reservados.",
    defaultLightPreset: "mls_latam_light",
    defaultDarkPreset: "mls_latam_dark",
    authMode: "sso",
  },
  responde: {
    id: "responde",
    name: "Responde",
    primaryDomain: "app.responde.mx",
    altDomains: [],
    countryCode: "MX",
    logoUrl: "/lovable-uploads/270634a4-1594-477d-817e-976a47e63473.png",
    primaryColorHex: "#7C3AED",
    primaryColorHsl: "262 83% 58%",
    emailSenderName: "Responde",
    emailSenderAddress: "no-reply@notifications.responde.mx",
    emailFooterText: "© Responde. Todos los derechos reservados.",
  },
};

export const DEFAULT_PARTNER_ID = "randomtruffle";

/**
 * Resuelve el partner activo a partir del hostname del browser.
 * Coincide contra `primaryDomain` o cualquier `altDomains`.
 * Fallback: DEFAULT_PARTNER_ID.
 */
const DEV_OVERRIDE_KEY = "rtcrm-partner-dev";

/**
 * Emulación de marca en localhost.
 *
 * Abre la app con ?partner=mlslatam  → queda guardado en localStorage.
 * Para volver a brokia usa  ?partner=brokia  o  ?partner=reset.
 * En producción el hostname siempre hace match antes de llegar al override.
 */
function applyDevOverride(): void {
  if (typeof window === "undefined") return;
  const param = new URLSearchParams(window.location.search).get("partner");
  if (!param) return;
  if (param === "reset") {
    localStorage.removeItem(DEV_OVERRIDE_KEY);
  } else if (PARTNERS[param]) {
    localStorage.setItem(DEV_OVERRIDE_KEY, param);
  }
}
applyDevOverride();

export function resolvePartnerByHostname(hostname: string): PartnerStaticConfig {
  const normalized = hostname.toLowerCase().replace(/:\d+$/, "");

  // Hostname hace match exacto → siempre gana (producción normal).
  for (const partner of Object.values(PARTNERS)) {
    if (partner.primaryDomain === normalized) return partner;
    if (partner.altDomains.includes(normalized)) return partner;
  }

  // En localhost/dev: leer override guardado por ?partner=xxx
  if (typeof window !== "undefined") {
    const override = localStorage.getItem(DEV_OVERRIDE_KEY);
    if (override && PARTNERS[override]) return PARTNERS[override];
  }

  // Fallback: RT CRM
  return PARTNERS[DEFAULT_PARTNER_ID];
}

export function getPartnerById(id: string | null | undefined): PartnerStaticConfig {
  if (!id) return PARTNERS[DEFAULT_PARTNER_ID];
  return PARTNERS[id] ?? PARTNERS[DEFAULT_PARTNER_ID];
}
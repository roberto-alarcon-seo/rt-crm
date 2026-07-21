/**
 * Catálogos del módulo de Empresas.
 *
 * Antes estaban duplicados literalmente en AccountEditor.tsx y AccountInfoCard.tsx,
 * lo que hacía que cambiar un rango en un lado dejara el otro desincronizado.
 * Cualquier catálogo nuevo de empresas va aquí.
 */

export interface Option {
  value: string;
  label: string;
  /** Valor heredado: se sigue mostrando en lectura pero ya no se ofrece al capturar. */
  legacy?: boolean;
}

export const ACCOUNT_TYPES: Option[] = [
  { value: "lead",              label: "Lead" },
  { value: "prospect",          label: "Prospecto" },
  { value: "cliente",           label: "Cliente" },
  { value: "partner",           label: "Partner" },
  { value: "partner_y_cliente", label: "Partner y Cliente" },
];

export const INDUSTRIES: Option[] = [
  { value: "tecnologia",         label: "Tecnología" },
  { value: "telecomunicaciones", label: "Telecomunicaciones" },
  { value: "retail",             label: "Retail / Comercio" },
  { value: "consumo_masivo",     label: "Consumo Masivo" },
  { value: "manufactura",        label: "Manufactura" },
  { value: "servicios",          label: "Servicios profesionales" },
  { value: "salud",              label: "Salud" },
  { value: "educacion",          label: "Educación" },
  { value: "finanzas",           label: "Finanzas / Banca" },
  { value: "logistica",          label: "Logística / Transporte" },
  { value: "gobierno",           label: "Gobierno / Sector público" },
  { value: "media",              label: "Media / Entretenimiento" },
  { value: "energia",            label: "Energía" },
  { value: "construccion",       label: "Construcción / Inmobiliario" },
  { value: "otro",               label: "Otro" },
];

/**
 * Rangos pensados para venta a corporativos (BBVA ~120k empleados,
 * Bimbo ~135k). Los tres primeros rangos originales quedan marcados como
 * legacy: no se ofrecen al capturar, pero siguen renderizando en empresas
 * que ya los tenían guardados.
 */
export const EMPLOYEE_RANGES: Option[] = [
  { value: "1-10",           label: "1-10 empleados",            legacy: true },
  { value: "11-50",          label: "11-50 empleados",           legacy: true },
  { value: "1-50",           label: "1-50 empleados" },
  { value: "51-200",         label: "51-200 empleados" },
  { value: "201-500",        label: "201-500 empleados" },
  { value: "501-1000",       label: "501-1,000 empleados" },
  { value: "1000+",          label: "1,000+ empleados",          legacy: true },
  { value: "1001-5000",      label: "1,001-5,000 empleados" },
  { value: "5001-10000",     label: "5,001-10,000 empleados" },
  { value: "10001-25000",    label: "10,001-25,000 empleados" },
  { value: "25001-50000",    label: "25,001-50,000 empleados" },
  { value: "50001-100000",   label: "50,001-100,000 empleados" },
  { value: "100000+",        label: "100,000+ empleados" },
];

/** Solo los rangos vigentes, en el orden en que deben aparecer en el select. */
export const EMPLOYEE_RANGES_SELECTABLE = EMPLOYEE_RANGES.filter(r => !r.legacy);

export const COUNTRIES: Option[] = [
  { value: "MX", label: "🇲🇽 México" },
  { value: "CO", label: "🇨🇴 Colombia" },
  { value: "CL", label: "🇨🇱 Chile" },
  { value: "AR", label: "🇦🇷 Argentina" },
  { value: "PE", label: "🇵🇪 Perú" },
  { value: "BR", label: "🇧🇷 Brasil" },
  { value: "ES", label: "🇪🇸 España" },
  { value: "US", label: "🇺🇸 Estados Unidos" },
  { value: "CA", label: "🇨🇦 Canadá" },
];

export const ACCOUNT_TIERS: Option[] = [
  { value: "estrategica", label: "Estratégica" },
  { value: "enterprise",  label: "Enterprise" },
  { value: "mid_market",  label: "Mid-Market" },
  { value: "smb",         label: "SMB" },
];

export const LIFECYCLE_STAGES: Option[] = [
  { value: "suscriptor",     label: "Suscriptor" },
  { value: "lead",           label: "Lead" },
  { value: "lead_calificado", label: "Lead calificado" },
  { value: "oportunidad",    label: "Oportunidad" },
  { value: "cliente",        label: "Cliente" },
  { value: "evangelista",    label: "Evangelista" },
  { value: "inactivo",       label: "Inactivo" },
];

export const LEAD_SOURCES: Option[] = [
  { value: "referido",        label: "Referido" },
  { value: "google_partner",  label: "Google / Partner Network" },
  { value: "evento",          label: "Evento / Conferencia" },
  { value: "outbound",        label: "Prospección outbound" },
  { value: "inbound_web",     label: "Inbound — sitio web" },
  { value: "linkedin",        label: "LinkedIn" },
  { value: "licitacion",      label: "Licitación / RFP" },
  { value: "campana",         label: "Campaña de marketing" },
  { value: "otro",            label: "Otro" },
];

export const CURRENCIES: Option[] = [
  { value: "MXN", label: "MXN — Peso mexicano" },
  { value: "USD", label: "USD — Dólar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "COP", label: "COP — Peso colombiano" },
  { value: "CLP", label: "CLP — Peso chileno" },
  { value: "ARS", label: "ARS — Peso argentino" },
  { value: "BRL", label: "BRL — Real" },
];

/** Régimen fiscal — catálogo SAT abreviado a los casos de persona moral. */
export const TAX_REGIMES: Option[] = [
  { value: "601", label: "601 — General de Ley Personas Morales" },
  { value: "603", label: "603 — Personas Morales con Fines no Lucrativos" },
  { value: "620", label: "620 — Sociedades Cooperativas de Producción" },
  { value: "622", label: "622 — Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras" },
  { value: "623", label: "623 — Opcional para Grupos de Sociedades" },
  { value: "624", label: "624 — Coordinados" },
  { value: "626", label: "626 — Régimen Simplificado de Confianza" },
  { value: "extranjero", label: "Entidad extranjera (no aplica SAT)" },
];

export const DOC_CATEGORIES: Option[] = [
  { value: "contrato",  label: "Contrato" },
  { value: "nda",       label: "NDA" },
  { value: "rfp",       label: "RFP / Licitación" },
  { value: "fiscal",    label: "Fiscal" },
  { value: "propuesta", label: "Propuesta" },
  { value: "legal",     label: "Legal" },
  { value: "otro",      label: "Otro" },
];

/**
 * Etiqueta legible de un valor. Si el valor no está en el catálogo lo devuelve
 * tal cual en lugar de vacío — así un dato heredado o venido de un import
 * externo se sigue viendo en pantalla.
 */
export const labelOf = (opts: Option[], v?: string | null): string | null =>
  opts.find(o => o.value === v)?.label ?? v ?? null;

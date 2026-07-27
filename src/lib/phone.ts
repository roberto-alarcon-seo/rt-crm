// Utilidades de teléfono compartidas por los formularios que capturan un número
// (ficha de contacto, alta rápida por origen, etc.).
//
// El teléfono se guarda siempre como `${code}${digits}` sin separadores, p. ej.
// "+525512345678".

export type PhoneCode = {
  code: string;
  label: string;
  country: string;
  digits: number;
};

export const PHONE_CODES: readonly PhoneCode[] = [
  { code: "+52", label: "🇲🇽 +52", country: "México",   digits: 10 },
  { code: "+57", label: "🇨🇴 +57", country: "Colombia", digits: 10 },
  { code: "+51", label: "🇵🇪 +51", country: "Perú",     digits: 9  },
  { code: "+1",  label: "🇺🇸 +1",  country: "EEUU",     digits: 10 },
] as const;

export const DEFAULT_PHONE_CODE = "+52";

export function phoneCodeInfo(code: string): PhoneCode {
  return PHONE_CODES.find(pc => pc.code === code)
    ?? PHONE_CODES.find(pc => pc.code === DEFAULT_PHONE_CODE)!;
}

export function phoneDigitsFor(code: string): number {
  return phoneCodeInfo(code).digits;
}

/** Códigos de país más largos primero, para que "+52" gane antes que "+1" al comparar. */
const CODES_BY_LENGTH = [...PHONE_CODES].sort((a, b) => b.code.length - a.code.length);

/**
 * Separa un teléfono ya almacenado ("+525512345678") en código + dígitos.
 * Si no reconoce el código de país asume el default.
 */
export function parsePhoneValue(phone: string): { code: string; digits: string } {
  const stripped = (phone ?? "").replace(/\s/g, "");
  for (const pc of CODES_BY_LENGTH) {
    if (stripped.startsWith(pc.code)) {
      return { code: pc.code, digits: stripped.slice(pc.code.length).replace(/\D/g, "") };
    }
  }
  return { code: DEFAULT_PHONE_CODE, digits: stripped.replace(/\D/g, "") };
}

/**
 * Normaliza lo que el usuario escribe o pega en el campo de dígitos.
 *
 * Tolera separadores ("55 1234 5678", "(55) 1234-5678"), prefijo internacional
 * ("+52…", "0052…") y el "1" que WhatsApp mete en los números de México
 * ("+52 1 55 1234 5678"). Cuando detecta un código de país lo devuelve para que
 * el selector se acomode solo.
 *
 * @param raw          texto crudo del input (o del portapapeles)
 * @param currentCode  código seleccionado hoy en el formulario
 */
export function normalizePhoneInput(
  raw: string,
  currentCode: string = DEFAULT_PHONE_CODE,
): { code: string; digits: string } {
  const text = (raw ?? "").trim();
  const compact = text.replace(/[\s().-]/g, "");

  // "+52…" o "0052…" son señales explícitas de que viene con código de país.
  const explicitIntl = compact.startsWith("+") || /^00\d/.test(compact);
  let digits = compact.replace(/\D/g, "");
  if (explicitIntl && digits.startsWith("00")) digits = digits.slice(2);

  for (const pc of CODES_BY_LENGTH) {
    const bare = pc.code.slice(1);
    if (!digits.startsWith(bare)) continue;

    let rest = digits.slice(bare.length);
    // México: WhatsApp antepone un "1" al número nacional (+52 1 55 …).
    if (pc.code === "+52" && rest.length === pc.digits + 1 && rest.startsWith("1")) {
      rest = rest.slice(1);
    }

    // Sin "+" solo aceptamos el prefijo si el largo cuadra exacto; si no,
    // "5512345678" (un celular de CDMX válido) se leería como código + 8 dígitos.
    const matches = explicitIntl ? rest.length <= pc.digits : rest.length === pc.digits;
    if (matches) return { code: pc.code, digits: rest.slice(0, pc.digits) };
  }

  // No se reconoció ningún código: se queda con el país ya seleccionado.
  return { code: currentCode, digits: clampPhoneDigits(digits, currentCode) };
}

/** Recorta los dígitos al largo del país (útil al cambiar de código en el selector). */
export function clampPhoneDigits(digits: string, code: string): string {
  return (digits ?? "").replace(/\D/g, "").slice(0, phoneDigitsFor(code));
}

/** Agrupación de dígitos para leer el número. México usa lada de 2 o 3 dígitos. */
function displayGroups(code: string, digits: string): number[] {
  switch (code) {
    case "+52": return /^(55|33|81)/.test(digits) ? [2, 4, 4] : [3, 3, 4];
    case "+57": return [3, 3, 4];
    case "+51": return [3, 3, 3];
    case "+1":  return [3, 3, 4];
    default:    return [];
  }
}

/**
 * Formatea un teléfono guardado para mostrarlo: "+525512345678" → "+52 55 1234 5678".
 * Si el número no tiene el largo esperado lo devuelve tal cual, sin inventar
 * agrupaciones sobre datos que no cuadran.
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  const { code, digits } = parsePhoneValue(phone);
  if (!digits) return phone;
  if (digits.length !== phoneDigitsFor(code)) return phone;

  const groups = displayGroups(code, digits);
  if (!groups.length) return `${code} ${digits}`;

  const parts: string[] = [];
  let i = 0;
  for (const g of groups) {
    parts.push(digits.slice(i, i + g));
    i += g;
  }
  if (i < digits.length) parts.push(digits.slice(i));
  return `${code} ${parts.join(" ")}`;
}

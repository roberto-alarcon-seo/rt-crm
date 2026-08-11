/**
 * Detección de bajas ("BAJA", "STOP"…) en mensajes entrantes.
 *
 * Esta es la implementación canónica y la que está cubierta por pruebas. La
 * edge function `twilio-inbound-webhook` mantiene una copia equivalente porque
 * Deno no puede importar desde `src/`; si cambias las reglas aquí, cámbialas
 * también allá.
 *
 * La regla importante es la de los falsos positivos: dar de baja a alguien por
 * error significa dejar de poder escribirle, así que no se usa una búsqueda de
 * subcadena. "bajarle al presupuesto" no es una baja; "BAJA" sí.
 */

const DIACRITICS = /[̀-ͯ]/g;
const NON_WORD = /[^\p{L}\p{N}\s]/gu;

/** Minúsculas, sin acentos y sin puntuación, para comparar de forma estable. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(NON_WORD, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * ¿Este mensaje pide la baja?
 *
 * Coincide si el mensaje completo ES la palabra clave (el caso normal: el
 * cliente responde solo "BAJA") o si la palabra clave aparece delimitada por
 * espacios. Nunca a media palabra.
 */
export function matchesOptOut(messageBody: string, keywords: string[]): boolean {
  const text = normalizeForMatch(messageBody);
  if (!text) return false;

  return keywords.some((raw) => {
    const keyword = normalizeForMatch(raw);
    if (!keyword) return false;
    if (text === keyword) return true;
    return new RegExp(`(?:^|\\s)${escapeRegExp(keyword)}(?:\\s|$)`, 'u').test(text);
  });
}

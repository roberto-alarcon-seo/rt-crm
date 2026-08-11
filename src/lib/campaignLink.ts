/**
 * Enlaces wa.me de campaña que no rompen el hilo de atribución.
 *
 * El problema que resuelve (nota del §1 del documento de setup): un enlace
 * wa.me normal abre WhatsApp y pierde por completo los UTMs de la campaña, así
 * que el lead entra sin origen. WhatsApp no admite parámetros propios: lo único
 * que viaja es el texto prellenado. Por eso la atribución se codifica DENTRO del
 * texto, como un marcador corto al final, que el webhook de entrada lee y borra
 * antes de guardar el mensaje.
 *
 * Formato del marcador: `[rt:src=linkedin|med=social|cmp=q3|cnt=post1|trm=crm]`
 * Claves cortas para no ensuciar el mensaje que el usuario ve.
 *
 * La edge function `twilio-inbound-webhook` tiene una copia de `parseTrackingTag`
 * porque Deno no puede importar desde `src/`; si cambias el formato, cámbialo en
 * los dos lados.
 */

export interface CampaignAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

const KEY_TO_UTM: Record<string, keyof CampaignAttribution> = {
  src: 'utm_source',
  med: 'utm_medium',
  cmp: 'utm_campaign',
  cnt: 'utm_content',
  trm: 'utm_term',
};

const UTM_TO_KEY: Record<keyof CampaignAttribution, string> = {
  utm_source: 'src',
  utm_medium: 'med',
  utm_campaign: 'cmp',
  utm_content: 'cnt',
  utm_term: 'trm',
};

/** Los separadores del marcador no pueden aparecer dentro de un valor. */
function sanitizeValue(value: string): string {
  return value.trim().replace(/[[\]|=]/g, '').replace(/\s+/g, '-');
}

/** `+52 55 1234 5678` → `525512345678`, que es lo que wa.me espera. */
export function normalizePhoneForWaMe(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Construye el marcador de atribución, o cadena vacía si no hay nada que marcar. */
export function buildTrackingTag(attribution: CampaignAttribution): string {
  const parts = (Object.keys(UTM_TO_KEY) as (keyof CampaignAttribution)[])
    .filter((utm) => (attribution[utm] ?? '').trim().length > 0)
    .map((utm) => `${UTM_TO_KEY[utm]}=${sanitizeValue(attribution[utm] as string)}`);

  return parts.length > 0 ? `[rt:${parts.join('|')}]` : '';
}

/**
 * Arma el enlace wa.me completo.
 * @param phone teléfono del negocio, en cualquier formato
 * @param message texto que verá el usuario antes de enviar
 */
export function buildWaMeLink(
  phone: string,
  message: string,
  attribution: CampaignAttribution,
): string {
  const digits = normalizePhoneForWaMe(phone);
  const tag = buildTrackingTag(attribution);
  const text = [message.trim(), tag].filter(Boolean).join(' ');
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/**
 * Extrae la atribución de un mensaje entrante y devuelve el texto ya limpio.
 * Si no hay marcador, devuelve el mensaje intacto y atribución vacía.
 */
export function parseTrackingTag(messageBody: string): {
  attribution: CampaignAttribution;
  cleanBody: string;
} {
  const match = messageBody.match(/\[rt:([^\]]*)\]/);
  if (!match) return { attribution: {}, cleanBody: messageBody };

  const attribution: CampaignAttribution = {};
  for (const pair of match[1].split('|')) {
    const [key, ...rest] = pair.split('=');
    const utm = KEY_TO_UTM[key?.trim()];
    const value = rest.join('=').trim();
    if (utm && value) attribution[utm] = value;
  }

  const cleanBody = messageBody.replace(match[0], '').replace(/\s+/g, ' ').trim();
  return { attribution, cleanBody };
}

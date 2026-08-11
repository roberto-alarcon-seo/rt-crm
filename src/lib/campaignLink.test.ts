import { describe, it, expect } from 'vitest';
import {
  buildTrackingTag,
  buildWaMeLink,
  normalizePhoneForWaMe,
  parseTrackingTag,
} from './campaignLink';

describe('normalizePhoneForWaMe', () => {
  it('deja solo dígitos', () => {
    expect(normalizePhoneForWaMe('+52 55 1234 5678')).toBe('525512345678');
    expect(normalizePhoneForWaMe('(55) 1234-5678')).toBe('5512345678');
  });
});

describe('buildTrackingTag', () => {
  it('arma el marcador con las claves cortas', () => {
    expect(buildTrackingTag({ utm_source: 'linkedin', utm_campaign: 'q3' }))
      .toBe('[rt:src=linkedin|cmp=q3]');
  });

  it('devuelve vacío si no hay atribución', () => {
    expect(buildTrackingTag({})).toBe('');
    expect(buildTrackingTag({ utm_source: '   ' })).toBe('');
  });

  it('quita los caracteres que romperían el formato', () => {
    // Los separadores [ ] | = no pueden viajar dentro de un valor.
    expect(buildTrackingTag({ utm_campaign: 'q3|black[friday]=x' }))
      .toBe('[rt:cmp=q3blackfridayx]');
  });

  it('convierte espacios en guiones', () => {
    expect(buildTrackingTag({ utm_campaign: 'black friday' })).toBe('[rt:cmp=black-friday]');
  });
});

describe('buildWaMeLink', () => {
  it('incluye el mensaje y el marcador codificados', () => {
    const link = buildWaMeLink('+52 55 1234 5678', 'Hola, quiero una demo', {
      utm_source: 'linkedin',
      utm_medium: 'social',
    });
    expect(link.startsWith('https://wa.me/525512345678?text=')).toBe(true);
    const text = decodeURIComponent(link.split('?text=')[1]);
    expect(text).toBe('Hola, quiero una demo [rt:src=linkedin|med=social]');
  });

  it('sin mensaje ni atribución deja el enlace simple', () => {
    expect(buildWaMeLink('5512345678', '', {})).toBe('https://wa.me/5512345678');
  });
});

describe('parseTrackingTag', () => {
  it('recupera los UTMs y limpia el mensaje', () => {
    const { attribution, cleanBody } = parseTrackingTag(
      'Hola, quiero una demo [rt:src=linkedin|med=social|cmp=q3]',
    );
    expect(attribution).toEqual({
      utm_source: 'linkedin',
      utm_medium: 'social',
      utm_campaign: 'q3',
    });
    expect(cleanBody).toBe('Hola, quiero una demo');
  });

  it('deja el mensaje intacto si no hay marcador', () => {
    const { attribution, cleanBody } = parseTrackingTag('Hola, quiero una demo');
    expect(attribution).toEqual({});
    expect(cleanBody).toBe('Hola, quiero una demo');
  });

  it('ignora claves desconocidas y valores vacíos', () => {
    const { attribution } = parseTrackingTag('hola [rt:src=|xyz=1|cmp=q3]');
    expect(attribution).toEqual({ utm_campaign: 'q3' });
  });

  it('es la inversa de buildWaMeLink', () => {
    const attribution = { utm_source: 'meta', utm_campaign: 'demo-q4', utm_content: 'video1' };
    const link = buildWaMeLink('5512345678', 'Quiero información', attribution);
    const text = decodeURIComponent(link.split('?text=')[1]);
    const parsed = parseTrackingTag(text);
    expect(parsed.attribution).toEqual(attribution);
    expect(parsed.cleanBody).toBe('Quiero información');
  });
});

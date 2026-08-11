import { describe, it, expect } from 'vitest';
import { matchesOptOut, normalizeForMatch } from './optOut';

const KEYWORDS = ['baja', 'stop', 'alto', 'cancelar', 'unsubscribe', 'no molestar'];

describe('normalizeForMatch', () => {
  it('quita acentos y baja a minúsculas', () => {
    expect(normalizeForMatch('BÁJA')).toBe('baja');
    expect(normalizeForMatch('  Alto!  ')).toBe('alto');
  });

  it('convierte la puntuación en separación de palabras', () => {
    expect(normalizeForMatch('baja, por favor')).toBe('baja por favor');
  });
});

describe('matchesOptOut', () => {
  it('detecta la palabra sola, como llega normalmente', () => {
    expect(matchesOptOut('BAJA', KEYWORDS)).toBe(true);
    expect(matchesOptOut('stop', KEYWORDS)).toBe(true);
    expect(matchesOptOut('  Alto  ', KEYWORDS)).toBe(true);
  });

  it('detecta la palabra dentro de una frase', () => {
    expect(matchesOptOut('quiero baja de estos mensajes', KEYWORDS)).toBe(true);
    expect(matchesOptOut('por favor cancelar todo', KEYWORDS)).toBe(true);
  });

  it('detecta palabras clave de varias palabras', () => {
    expect(matchesOptOut('no molestar', KEYWORDS)).toBe(true);
    expect(matchesOptOut('porfa no molestar mas', KEYWORDS)).toBe(true);
  });

  it('tolera acentos y signos', () => {
    expect(matchesOptOut('¡BÁJA!', KEYWORDS)).toBe(true);
    expect(matchesOptOut('baja.', KEYWORDS)).toBe(true);
  });

  // Lo importante: una baja por error deja al comercial sin poder escribirle.
  it('no da de baja por coincidencias a media palabra', () => {
    expect(matchesOptOut('podemos bajarle al presupuesto?', KEYWORDS)).toBe(false);
    expect(matchesOptOut('trabajo en una empresa grande', KEYWORDS)).toBe(false);
    expect(matchesOptOut('necesito rebajar costos', KEYWORDS)).toBe(false);
    expect(matchesOptOut('mi altorreferente es otro', KEYWORDS)).toBe(false);
  });

  it('no detecta nada con mensaje vacío o sin palabras clave', () => {
    expect(matchesOptOut('', KEYWORDS)).toBe(false);
    expect(matchesOptOut('   ', KEYWORDS)).toBe(false);
    expect(matchesOptOut('BAJA', [])).toBe(false);
    expect(matchesOptOut('BAJA', ['   '])).toBe(false);
  });

  it('no revienta con palabras clave que traen caracteres de regex', () => {
    expect(() => matchesOptOut('hola', ['(baja)', 'a+b'])).not.toThrow();
    expect(matchesOptOut('hola', ['(baja)'])).toBe(false);
  });
});

/**
 * Signing copy in both languages: every `sign` key exists in English and
 * Spanish, templates carry the same placeholders, and the quill postcard
 * alt stays a literal sentence in each language.
 */
import { en } from '../i18n/en';
import { es } from '../i18n/es';

function placeholders(t: string): string[] {
  return [...t.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).sort();
}

function walk(a: unknown, b: unknown, path: string, missing: string[]): void {
  if (typeof a === 'string') {
    if (typeof b !== 'string') {
      missing.push(`${path}: missing or not a string in es`);
      return;
    }
    const pa = placeholders(a);
    const pb = placeholders(b);
    if (pa.join(',') !== pb.join(',')) {
      missing.push(`${path}: placeholders differ (en {${pa.join(',')}} vs es {${pb.join(',')}})`);
    }
    return;
  }
  if (a && typeof b && typeof a === 'object' && typeof b === 'object') {
    for (const k of Object.keys(a as Record<string, unknown>)) {
      walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k, missing);
    }
    for (const k of Object.keys(b as Record<string, unknown>)) {
      if (!(k in (a as Record<string, unknown>))) missing.push(`${path ? `${path}.` : ''}${k}: extra key in es`);
    }
  }
}

describe('sign dictionary parity', () => {
  it('keeps every sign key in both languages with matching placeholders', () => {
    const missing: string[] = [];
    walk(en.sign, es.sign, 'sign', missing);
    expect(missing).toEqual([]);
  });

  it('names the document and its hash in the acceptance sentence', () => {
    expect(placeholders(en.sign.acceptTemplate)).toEqual(['hash', 'title']);
    expect(placeholders(es.sign.acceptTemplate)).toEqual(['hash', 'title']);
    expect(en.sign.acceptTemplate).toContain('{title}');
    expect(en.sign.acceptTemplate).toContain('{hash}');
  });

  it('threads the link and the hashes through the mail bodies', () => {
    expect(placeholders(en.sign.mailInviteBody)).toContain('link');
    expect(placeholders(en.sign.mailSignedBody)).toContain('hash');
  });

  it('carries the request id in the evidence templates', () => {
    expect(placeholders(en.sign.evidenceRequest)).toEqual(['v']);
    expect(placeholders(es.sign.evidenceRequest)).toEqual(['v']);
  });

  it('gives the quill postcard a literal alt over 40 chars, different per language', () => {
    expect(en.postcards.sign.length).toBeGreaterThan(40);
    expect(es.postcards.sign.length).toBeGreaterThan(40);
    expect(en.postcards.sign).not.toBe(es.postcards.sign);
  });
});

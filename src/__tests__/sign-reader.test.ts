/**
 * The signing reader's pure helpers: the toolbar page label and the
 * SHA-256 comparison that guards the rendered bytes. The pdfjs bundle is
 * mocked out: these tests pin the helpers, not the renderer.
 *
 * @jest-environment node
 */
import { hashesEqual, pageLabel, resolveReaderSrc } from '../lib/sign/reader';

jest.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: jest.fn() }), { virtual: true });
jest.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => 'worker.js', { virtual: true });

describe('pageLabel', () => {
  it('fills the current and total page numbers', () => {
    expect(pageLabel(2, 9, 'Page {current} of {total}')).toBe('Page 2 of 9');
  });

  it('fills the Spanish template the same way', () => {
    expect(pageLabel(1, 3, 'Página {current} de {total}')).toBe('Página 1 de 3');
  });

  it('leaves a template without placeholders untouched', () => {
    expect(pageLabel(1, 2, 'pages')).toBe('pages');
  });
});

describe('resolveReaderSrc', () => {
  it('prefers data-src, the audit page route', () => {
    expect(resolveReaderSrc({ src: '/audits/acme/2026-01/assets/report.pdf' } as DOMStringMap))
      .toBe('/audits/acme/2026-01/assets/report.pdf');
  });

  it('falls back to the data-id sign-file route', () => {
    expect(resolveReaderSrc({ id: 'abc 123' } as DOMStringMap)).toBe('/api/sign-file?id=abc%20123');
  });

  it('resolves to empty when neither is present', () => {
    expect(resolveReaderSrc({} as DOMStringMap)).toBe('');
  });
});

describe('hashesEqual', () => {
  it('matches identical digests', () => {
    expect(hashesEqual('ab'.repeat(32), 'ab'.repeat(32))).toBe(true);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(hashesEqual(`  ${'AB'.repeat(32)}\n`, 'ab'.repeat(32))).toBe(true);
  });

  it('rejects different bytes', () => {
    expect(hashesEqual('ab'.repeat(32), `ab${'cd'.repeat(31)}`)).toBe(false);
  });

  it('rejects an empty digest', () => {
    expect(hashesEqual('', 'ab'.repeat(32))).toBe(false);
  });
});

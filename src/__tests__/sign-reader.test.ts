/**
 * The signing reader's pure helpers: the toolbar page label and the
 * SHA-256 comparison that guards the rendered bytes. The pdfjs bundle is
 * mocked out: these tests pin the helpers, not the renderer.
 *
 * @jest-environment node
 */
import { clampPage, fitPage, fitScale, hashesEqual, isSpread, pageLabel, parsePageInput, resolveReaderSrc, spreadLabel, spreadPages } from '../lib/sign/reader';

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

describe('isSpread', () => {
  it('shows two facing pages at 1080px and up', () => {
    expect(isSpread(1080)).toBe(true);
    expect(isSpread(1920)).toBe(true);
  });

  it('shows one page below 1080px', () => {
    expect(isSpread(1079)).toBe(false);
    expect(isSpread(390)).toBe(false);
  });
});

describe('spreadPages', () => {
  it('stands the cover alone', () => {
    expect(spreadPages(1, 45)).toEqual([1]);
  });

  it('pairs even with next', () => {
    expect(spreadPages(2, 45)).toEqual([2, 3]);
    expect(spreadPages(44, 45)).toEqual([44, 45]);
  });

  it('pairs odd with previous', () => {
    expect(spreadPages(3, 45)).toEqual([2, 3]);
    expect(spreadPages(45, 45)).toEqual([44, 45]);
  });

  it('stands a lone last page alone at the end', () => {
    expect(spreadPages(4, 4)).toEqual([4]);
    expect(spreadPages(44, 44)).toEqual([44]);
  });

  it('clamps out-of-range pages into the book', () => {
    expect(spreadPages(0, 45)).toEqual([1]);
    expect(spreadPages(99, 45)).toEqual([44, 45]);
    expect(spreadPages(99, 1)).toEqual([1]);
  });
});

describe('spreadLabel', () => {
  it('names the facing pages in English', () => {
    expect(spreadLabel([2, 3], 45, 'Pages {first}–{last} of {total}')).toBe('Pages 2–3 of 45');
  });

  it('names the facing pages in Spanish', () => {
    expect(spreadLabel([2, 3], 45, 'Páginas {first}–{last} de {total}')).toBe('Páginas 2–3 de 45');
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

describe('fitScale', () => {
  it('fits the 680px sheet into the 1120px page at fit-to-width', () => {
    expect(fitScale(680, 1120)).toBeCloseTo(680 / 1120, 10);
  });

  it('falls back to 1 when there is no width to measure', () => {
    expect(fitScale(0, 1120)).toBe(1);
  });

  it.each([360, 680, 1120, 1920])(
    'never renders wider than a %dpx sheet at fit-to-width',
    (sheetW) => {
      expect(fitScale(sheetW, 1120) * 1120).toBeLessThanOrEqual(sheetW);
    },
  );
});

describe('clampPage', () => {
  it('clamps below the first page up to 1', () => {
    expect(clampPage(0, 9)).toBe(1);
    expect(clampPage(-4, 9)).toBe(1);
  });

  it('clamps past the last page down to the total', () => {
    expect(clampPage(10, 9)).toBe(9);
    expect(clampPage(45, 45)).toBe(45);
  });

  it('keeps a page inside the range', () => {
    expect(clampPage(3, 9)).toBe(3);
  });
});

describe('parsePageInput', () => {
  it('parses a valid page jump', () => {
    expect(parsePageInput('7', 45, 1)).toBe(7);
  });

  it('keeps the current page on invalid or out-of-range input', () => {
    expect(parsePageInput('abc', 45, 4)).toBe(4);
    expect(parsePageInput('0', 45, 4)).toBe(4);
    expect(parsePageInput('46', 45, 4)).toBe(4);
  });

  it('keeps the current page on empty input', () => {
    expect(parsePageInput('', 45, 4)).toBe(4);
    expect(parsePageInput('   ', 45, 4)).toBe(4);
  });
});

describe('fitPage', () => {
  it('fits the whole page by the tighter dimension', () => {
    expect(fitPage(680, 630, 1120, 1450)).toBeCloseTo(Math.min(680 / 1120, 630 / 1450), 10);
  });

  it('falls back to 1 when a size is missing', () => {
    expect(fitPage(0, 630, 1120, 1450)).toBe(1);
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

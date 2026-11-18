/**
 * The designed seal page: one language, both signatures with dates, and a
 * QR code pointing at the public verification URL — sized like the
 * document's last page.
 *
 * @jest-environment node
 */
import { PDFDocument, PDFPage } from 'pdf-lib';
import jsQR from 'jsqr';
import { drawQr, qrMatrix, sealLines, sealPage, type QrMatrix } from '../lib/sign/seal';
import type { EvidenceInput } from '../lib/sign/evidence';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const URL = `https://univerlab.org/sign/verify/${ID}`;

function evidence(lang: 'en' | 'es'): EvidenceInput {
  return {
    signerName: 'María López',
    idNumber: '12345678',
    verifiedEmail: 'maria@example.com',
    signedAt: new Date('2026-11-13T19:05:07.000Z'),
    ip: '200.1.2.3',
    userAgent: 'TestAgent/1.0',
    origHash: 'a'.repeat(64),
    labAcceptedAt: '2026-11-13T18:00:00.000Z',
    requestId: ID,
    issuerName: 'UniverLab',
    issuerId: '901234567-8',
    issuerEmail: 'owner@univerlab.org',
    issuerSignedAt: '2026-11-13T18:00:00.000Z',
    lang,
    verifyUrl: `https://univerlab.org${lang === 'es' ? '/es' : ''}/sign/verify/${ID}`,
  };
}

/** Rasterize a module matrix (quiet zone included) and decode it the way a
 *  phone would, so the test reads the symbol, not a string we also built. */
function decode(m: QrMatrix, scale = 6): string | null {
  const quiet = 4;
  const dim = (m.size + quiet * 2) * scale;
  const px = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let row = 0; row < m.size; row += 1) {
    for (let col = 0; col < m.size; col += 1) {
      if (!m.data[row * m.size + col]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const i = (((row + quiet) * scale + dy) * dim + ((col + quiet) * scale + dx)) * 4;
          px[i] = 0;
          px[i + 1] = 0;
          px[i + 2] = 0;
          px[i + 3] = 255;
        }
      }
    }
  }
  return jsQR(px, dim, dim)?.data ?? null;
}

describe('sealLines', () => {
  it('renders the request language only, never both', () => {
    const english = sealLines(evidence('en'), en.sign).join('\n');
    expect(english).toContain('Sealed signatures');
    expect(english).not.toContain('Firmas selladas');
    const spanish = sealLines(evidence('es'), es.sign).join('\n');
    expect(spanish).toContain('Firmas selladas');
    expect(spanish).not.toContain('Sealed signatures');
    expect(spanish).toContain('Agente de usuario: TestAgent/1.0');
    expect(spanish).not.toContain('User agent:');
  });

  it('names both parties with dates, method and the verification URL', () => {
    const text = sealLines(evidence('en'), en.sign).join('\n');
    expect(text).toContain('UniverLab');
    expect(text).toContain('901234567-8');
    expect(text).toContain('owner@univerlab.org');
    expect(text).toContain('María López');
    expect(text).toContain('12345678');
    expect(text).toContain('maria@example.com');
    expect(text).toContain('Verified email via Access');
    expect(text).toContain(URL);
    // Colombia wall clock for both signatures.
    expect(text).toContain('2026-11-13 14:05:07 UTC-05:00');
  });

  it('records where the signer signed from', () => {
    const text = sealLines(evidence('en'), en.sign).join('\n');
    expect(text).toContain('IP: 200.1.2.3');
    expect(text).toContain('User agent: TestAgent/1.0');
  });
});

describe('qrMatrix', () => {
  it('encodes the verification URL and decodes back to it', () => {
    const m = qrMatrix(URL);
    expect(m.size).toBeGreaterThan(20);
    expect(m.data.length).toBe(m.size * m.size);
    expect(decode(m)).toBe(URL);
  });

  it('is deterministic per URL and distinct across URLs', () => {
    const a = qrMatrix(URL);
    expect(Array.from(qrMatrix(URL).data)).toEqual(Array.from(a.data));
    expect(Array.from(qrMatrix(`${URL}?x=1`).data)).not.toEqual(Array.from(a.data));
  });
});

describe('drawQr', () => {
  it('paints one plate and one square per dark module, and the drawn grid decodes', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const m = qrMatrix(URL);
    const side = 200;
    const x0 = 40;
    const y0 = 40;
    type Rect = { x: number; y: number; width: number; height: number };
    const spy = jest.spyOn(PDFPage.prototype, 'drawRectangle');
    let calls: Rect[] = [];
    try {
      drawQr(page, m, x0, y0, side);
      calls = spy.mock.calls.map((c) => c[0] as unknown as Rect);
    } finally {
      spy.mockRestore();
    }
    const dark = Array.from(m.data).filter((v) => v !== 0).length;
    expect(calls.length).toBe(dark + 1);
    expect(calls[0].width).toBe(side);

    // Invert the geometry back into a matrix: the page drew exactly the
    // modules the encoder chose, at the right places.
    const unit = side / (m.size + 8);
    const grid = new Uint8Array(m.size * m.size);
    for (const rect of calls.slice(1)) {
      expect(rect.width).toBeCloseTo(unit);
      const col = Math.round((rect.x - x0) / unit) - 4;
      const row = m.size - 1 - (Math.round((rect.y - y0) / unit) - 4);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(row).toBeGreaterThanOrEqual(0);
      grid[row * m.size + col] = 1;
    }
    expect(Array.from(grid)).toEqual(Array.from(m.data));
    expect(decode({ size: m.size, data: grid })).toBe(URL);
  });
});

describe('sealPage', () => {
  it('draws both signatures with their identifiers, method and verification URL', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595.28, 841.89]);
    const spy = jest.spyOn(PDFPage.prototype, 'drawText');
    let drawn = '';
    try {
      await sealPage(doc, evidence('en'), en.sign);
      drawn = spy.mock.calls.map((c) => String(c[0])).join('\n');
    } finally {
      spy.mockRestore();
    }
    // The issuer's signature block.
    expect(drawn).toContain('Name: UniverLab');
    expect(drawn).toContain('ID: 901234567-8');
    expect(drawn).toContain('Email: owner@univerlab.org');
    // The signer's signature block.
    expect(drawn).toContain('Name: María López');
    expect(drawn).toContain('ID: 12345678');
    expect(drawn).toContain('Email: maria@example.com');
    // One method line per party, plus the verification label.
    expect(drawn.match(/Verified email via Access/g)).toHaveLength(2);
    expect(drawn).toContain('Verify this document:');
  });

  it('draws the signer network evidence on the page', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595.28, 841.89]);
    const spy = jest.spyOn(PDFPage.prototype, 'drawText');
    let drawn = '';
    try {
      await sealPage(doc, evidence('en'), en.sign);
      drawn = spy.mock.calls.map((c) => String(c[0])).join('\n');
    } finally {
      spy.mockRestore();
    }
    expect(drawn).toContain('IP: 200.1.2.3');
    expect(drawn).toContain('User agent: TestAgent/1.0');
  });

  it('draws the QR on the page', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595.28, 841.89]);
    const spy = jest.spyOn(PDFPage.prototype, 'drawRectangle');
    let rects = 0;
    try {
      await sealPage(doc, evidence('en'), en.sign);
      rects = spy.mock.calls.length;
    } finally {
      spy.mockRestore();
    }
    // The plate and the dark modules: far more than the gold rule alone.
    expect(rects).toBeGreaterThan(100);
  });

  it('matches the last page size, portrait or landscape', async () => {
    for (const [w, h] of [
      [595.28, 841.89],
      [612, 792],
      [792, 612],
    ]) {
      const doc = await PDFDocument.create();
      doc.addPage([595.28, 841.89]);
      doc.addPage([w, h]);
      const page = await sealPage(doc, evidence('en'), en.sign);
      expect([page.getSize().width, page.getSize().height]).toEqual([w, h]);
    }
  });
});

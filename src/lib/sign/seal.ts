// The designed seal page that closes a signed PDF (FR2): one page in the
// request's language, the same size as the document's last page, with both
// parties' signatures and a QR code pointing at the public verification
// page. Pure pdf-lib drawing plus the pinned qrcode library (no network),
// so it runs unchanged in workerd and in jest.
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { formatBogota, type EvidenceInput } from './evidence';

/** The `sign` dictionary slice the seal page needs (mirrors i18n dicts). */
export interface SealStrings {
  sealTitle: string;
  sealIssuer: string;
  sealSigner: string;
  sealMethod: string;
  sealName: string;
  sealEmail: string;
  sealId: string;
  sealDate: string;
  sealIp: string;
  sealAgent: string;
  sealVerify: string;
}

const fill = (t: string, v: string): string => t.replace('{v}', v);

/** Every text line the seal page draws, in order: the contract the PDF
 *  rendering keeps, and what the tests pin without parsing PDF bytes. */
export function sealLines(e: EvidenceInput, t: SealStrings): string[] {
  return [
    t.sealTitle,
    t.sealIssuer,
    fill(t.sealName, e.issuerName),
    fill(t.sealId, e.issuerId),
    fill(t.sealEmail, e.issuerEmail),
    fill(t.sealDate, formatBogota(new Date(e.issuerSignedAt))),
    t.sealMethod,
    t.sealSigner,
    fill(t.sealName, e.signerName),
    fill(t.sealId, e.idNumber),
    fill(t.sealEmail, e.verifiedEmail),
    fill(t.sealDate, formatBogota(e.signedAt)),
    t.sealMethod,
    fill(t.sealIp, e.ip),
    fill(t.sealAgent, e.userAgent),
    fill(t.sealVerify, e.verifyUrl),
  ];
}

/** The QR module matrix for a verification URL, from the pinned library's
 *  pure core. Never a renderer: the package's browser build (which wrangler's
 *  esbuild picks for Pages Functions) draws through a canvas that workerd
 *  does not have. Deterministic: the same URL always yields the same matrix. */
export interface QrMatrix {
  size: number;
  data: Uint8Array;
}

export function qrMatrix(url: string): QrMatrix {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  return { size: qr.modules.size, data: qr.modules.data };
}

/** The quiet zone around the symbols, in modules: scanners need four. */
const QR_QUIET = 4;

/** Draw the matrix as vector squares inside a `side`-pt square whose
 *  bottom-left corner is (x, y). A white plate keeps the code on its own
 *  ground, whatever the document prints underneath. */
export function drawQr(page: PDFPage, m: QrMatrix, x: number, y: number, side: number): void {
  const unit = side / (m.size + QR_QUIET * 2);
  page.drawRectangle({ x, y, width: side, height: side, color: rgb(1, 1, 1) });
  for (let row = 0; row < m.size; row += 1) {
    for (let col = 0; col < m.size; col += 1) {
      if (!m.data[row * m.size + col]) continue;
      page.drawRectangle({
        x: x + (col + QR_QUIET) * unit,
        y: y + side - (row + QR_QUIET + 1) * unit,
        width: unit,
        height: unit,
        color: rgb(0, 0, 0),
      });
    }
  }
}

/** Wrap A4 text: Helvetica has no layout engine, so lines break on spaces. */
function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    let line = raw;
    while (line.length > max) {
      let cut = line.lastIndexOf(' ', max);
      if (cut < max / 2) cut = max;
      out.push(line.slice(0, cut));
      line = line.slice(cut).replace(/^ /, '');
    }
    out.push(line);
  }
  return out;
}

const GOLD = rgb(0.62, 0.47, 0.14);
const INK = rgb(0.14, 0.13, 0.11);

/** Draw the seal page onto a fresh page of `doc` sized like its last page
 *  (A4 or Letter, portrait or landscape kept), and return that page. */
export async function sealPage(doc: PDFDocument, e: EvidenceInput, t: SealStrings): Promise<PDFPage> {
  const last = doc.getPage(doc.getPageCount() - 1);
  const { width, height } = last.getSize();
  const page = doc.addPage([width, height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = Math.min(width, height) * 0.09;
  const inner = width - margin * 2;
  // Roughly as many characters as fit across the text column at size 10.
  const maxChars = Math.max(24, Math.floor(inner / 5.6));
  let y = height - margin;

  // The gold rule and the seal mark open the page.
  page.drawRectangle({ x: margin, y: y - 4, width: inner, height: 2.5, color: GOLD });
  y -= 14;
  const sealR = 17;
  page.drawCircle({ x: margin + sealR, y: y - sealR, size: sealR, borderColor: GOLD, borderWidth: 2 });
  page.drawText('UL', { x: margin + sealR - 9, y: y - sealR - 5, size: 11, font: bold, color: GOLD });
  page.drawText(t.sealTitle, { x: margin + sealR * 2 + 12, y: y - sealR - 5, size: 17, font: bold, color: INK });
  y -= sealR * 2 + 18;

  const line = (text: string, size: number, f: typeof font, color = INK, gap = 14): void => {
    for (const part of wrap(text, maxChars)) {
      if (y < margin + 40) return;
      page.drawText(part === '' ? ' ' : part, { x: margin, y, size, font: f, color });
      y -= gap;
    }
  };

  // The issuer signed at creation; the signer signs today. One language.
  line(t.sealIssuer, 13, bold, GOLD, 18);
  line(fill(t.sealName, e.issuerName), 10, font);
  line(fill(t.sealId, e.issuerId), 10, font);
  line(fill(t.sealEmail, e.issuerEmail), 10, font);
  line(fill(t.sealDate, formatBogota(new Date(e.issuerSignedAt))), 10, font);
  line(t.sealMethod, 10, font);
  y -= 8;
  line(t.sealSigner, 13, bold, GOLD, 18);
  line(fill(t.sealName, e.signerName), 10, font);
  line(fill(t.sealId, e.idNumber), 10, font);
  line(fill(t.sealEmail, e.verifiedEmail), 10, font);
  line(fill(t.sealDate, formatBogota(e.signedAt)), 10, font);
  line(t.sealMethod, 10, font);
  line(fill(t.sealIp, e.ip), 10, font);
  line(fill(t.sealAgent, e.userAgent), 10, font);
  y -= 8;

  // The QR code points at the public verification page; its URL stays
  // readable beside it for a reader with no scanner.
  const qrSize = Math.min(150, inner * 0.32);
  const qrX = width - margin - qrSize;
  for (const part of wrap(fill(t.sealVerify, e.verifyUrl), maxChars)) {
    if (y < margin + qrSize + 30) break;
    page.drawText(part === '' ? ' ' : part, { x: margin, y, size: 9, font, color: INK });
    y -= 12;
  }
  drawQr(page, qrMatrix(e.verifyUrl), qrX, margin, qrSize);
  return page;
}

// The public signature verification page (FR3): anyone with the QR code or
// the short URL sees the document title, both signatures with dates, the
// SHA-256 of the original (and of the signed file, once signed) and the
// status. Names and masked emails are the only personal data it shows: no
// IDs, no IPs, no user agents. Pure string building; the edge sets noindex
// and private,no-store around it.
import { esc } from '../audit/escape';
import { formatBogota, linkState, type SigningRequest } from './evidence';
import { maskEmail } from './page';

/** The `sign` dictionary slice the verify page needs (mirrors i18n dicts). */
export interface VerifyStrings {
  verifyTitle: string;
  verifyStatusSigned: string;
  verifyStatusPending: string;
  verifyStatusExpired: string;
  verifyStatusRevoked: string;
  verifyOrigHash: string;
  verifySignedHash: string;
  sealIssuer: string;
  sealSigner: string;
  sealName: string;
  sealEmail: string;
  sealDate: string;
}

const fill = (t: string, v: string): string => t.replace('{v}', v);

/** The public verification URL for a request: the QR code and the short
 *  link point here, in the request's language. */
export function verifyUrlFor(origin: string, lang: 'en' | 'es', id: string): string {
  return `${origin}${lang === 'es' ? '/es' : ''}/sign/verify/${id}`;
}

/** The `#sign` container content for a verification lookup. The status is
 *  the request's real state, so an old pending link reads as expired. A
 *  pending request shows no signed hash: there is no signed file yet. */
export function verifyHtml(req: SigningRequest, lang: 'en' | 'es', s: VerifyStrings): string {
  const state = linkState(req);
  const signed = state === 'signed';
  const status =
    state === 'signed'
      ? s.verifyStatusSigned
      : state === 'revoked'
        ? s.verifyStatusRevoked
        : state === 'expired'
          ? s.verifyStatusExpired
          : s.verifyStatusPending;
  const signedRow =
    signed && req.signedHash
      ? `<p class="sign-verify-hash">${esc(fill(s.verifySignedHash, req.signedHash))}</p>`
      : '';
  return (
    `<div class="sign-verify" lang="${lang}">` +
    `<h1>${esc(s.verifyTitle)}</h1>` +
    `<p class="sign-verify-title">${esc(req.title)}</p>` +
    `<p class="sign-verify-status">${esc(status)}</p>` +
    `<h2>${esc(s.sealIssuer)}</h2>` +
    `<p>${esc(fill(s.sealName, req.issuerName))}</p>` +
    `<p>${esc(fill(s.sealEmail, maskEmail(req.issuerEmail)))}</p>` +
    `<p>${esc(fill(s.sealDate, formatBogota(new Date(req.issuerSignedAt))))}</p>` +
    `<h2>${esc(s.sealSigner)}</h2>` +
    `<p>${esc(fill(s.sealName, req.signerName))}</p>` +
    `<p>${esc(fill(s.sealEmail, maskEmail(req.signerEmail)))}</p>` +
    (req.signedAt ? `<p>${esc(fill(s.sealDate, formatBogota(new Date(req.signedAt))))}</p>` : '') +
    `<p class="sign-verify-hash">${esc(fill(s.verifyOrigHash, req.origHash))}</p>` +
    signedRow +
    `</div>`
  );
}

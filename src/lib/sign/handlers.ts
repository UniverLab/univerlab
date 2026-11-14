// The signing API core (FR1, FR6, FR7): create, list, complete and serve
// files. Pure orchestration over injected dependencies — the Pages Function
// files under functions/api/ are thin adapters, so these handlers run
// unchanged in jest with a fake bucket, a stub verifier and a stub fetch.

import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  canSign,
  formatBogota,
  formatUtc,
  linkState,
  newRequestId,
  sha256Hex,
  signedNotice,
  type EvidenceInput,
  type SigningRequest,
} from './evidence';
import { isRequestId, listRequests, loadRequest, originalKey, saveRequest, signedKey, type SignBucket } from './store';
import { inviteMail, sendMail, signedCopyMail } from './mail';
import { en } from '../../i18n/en';
import { es } from '../../i18n/es';

export interface SignEnv {
  SIGN_DOCS?: SignBucket;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  SIGN_OWNER_EMAILS?: string;
  RESEND_API_KEY?: string;
  SIGN_NOTIFY_URL?: string;
  SIGN_NOTIFY_SECRET?: string;
}

export interface SignDeps {
  verify: (token: string, env: { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string }) => Promise<string | null>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  uuid?: () => string;
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

/** The Access JWT: the `Cf-Access-Jwt-Assertion` header, or the
 *  `CF_Authorization` cookie browsers carry after the email OTP (FR3). */
export function readToken(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === 'CF_Authorization' && rest.length > 0) return rest.join('=').trim();
  }
  return null;
}

function ownerAllowlist(env: SignEnv): string[] {
  return (env.SIGN_OWNER_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== '');
}

export function isOwnerEmail(email: string, env: SignEnv): boolean {
  return ownerAllowlist(env).includes(email.toLowerCase());
}

async function authedEmail(request: Request, env: SignEnv, deps: SignDeps): Promise<string | null> {
  const token = readToken(request);
  if (!token) return null;
  return deps.verify(token, env);
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

/** The evidence page lines in one language, from one dictionary. */
export function evidenceLines(e: EvidenceInput, t: {
  evidenceTitle: string; evidenceSigner: string; evidenceId: string; evidenceEmail: string;
  evidenceCo: string; evidenceUtc: string; evidenceIp: string; evidenceUa: string;
  evidenceOrig: string; evidenceAccepted: string; evidenceRequest: string;
}): string[] {
  return [
    t.evidenceTitle,
    t.evidenceSigner.replace('{v}', e.signerName),
    t.evidenceId.replace('{v}', e.idNumber),
    t.evidenceEmail.replace('{v}', e.verifiedEmail),
    t.evidenceCo.replace('{v}', formatBogota(e.signedAt)),
    t.evidenceUtc.replace('{v}', formatUtc(e.signedAt)),
    t.evidenceIp.replace('{v}', e.ip),
    t.evidenceUa.replace('{v}', e.userAgent),
    t.evidenceOrig.replace('{v}', e.origHash),
    t.evidenceAccepted.replace('{v}', e.labAcceptedAt),
    t.evidenceRequest.replace('{v}', e.requestId),
  ];
}

/** The signed PDF: the original pages unchanged plus a final bilingual
 *  evidence page (FR6). */
export async function buildSignedPdf(original: Uint8Array, e: EvidenceInput): Promise<Uint8Array> {
  const src = await PDFDocument.load(original, { ignoreEncryption: true });
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(src, src.getPageIndices());
  for (const p of copied) doc.addPage(p);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const lines: Array<{ text: string; bold: boolean }> = [];
  for (const line of evidenceLines(e, en.sign)) lines.push({ text: line, bold: line === en.sign.evidenceTitle });
  lines.push({ text: '', bold: false });
  for (const line of evidenceLines(e, es.sign)) lines.push({ text: line, bold: line === es.sign.evidenceTitle });
  let y = 800;
  for (const line of lines) {
    for (const part of wrap(line.text, 92)) {
      if (y < 50) break;
      page.drawText(part === '' ? ' ' : part, { x: 50, y, size: line.bold ? 12 : 10, font: line.bold ? bold : font });
      y -= 15;
    }
  }
  return new Uint8Array(await doc.save());
}

/** POST /api/sign-request: the owner creates a request (FR1). Multipart
 *  form: pdf, title, name, email, auditSlug?, lang?. */
export async function handleCreateRequest(request: Request, env: SignEnv, deps: SignDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const uuid = deps.uuid ?? newRequestId;
  const email = await authedEmail(request, env, deps);
  if (!email) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isOwnerEmail(email, env)) return json({ ok: false, error: 'forbidden' }, 403);
  if (!env.SIGN_DOCS) return json({ ok: false, error: 'unavailable' }, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const file = form.get('pdf');
  const title = String(form.get('title') ?? '').trim();
  const name = String(form.get('name') ?? '').trim();
  const signerEmail = String(form.get('email') ?? '').trim().toLowerCase();
  const auditSlug = String(form.get('auditSlug') ?? '').trim();
  const lang = form.get('lang') === 'en' ? 'en' : 'es';

  if (!(file instanceof File)) return json({ ok: false, error: 'pdf' }, 400);
  if (file.size <= 0 || file.size > MAX_PDF_BYTES) return json({ ok: false, error: 'pdf' }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    return json({ ok: false, error: 'pdf' }, 400);
  }
  if (title === '' || title.length > 140) return json({ ok: false, error: 'title' }, 400);
  if (name.length < 2 || name.length > 120 || name.includes('\n')) return json({ ok: false, error: 'name' }, 400);
  if (!EMAIL_RE.test(signerEmail)) return json({ ok: false, error: 'email' }, 400);
  if (auditSlug !== '' && !SLUG_RE.test(auditSlug)) return json({ ok: false, error: 'audit' }, 400);

  const createdAt = new Date(now()).toISOString();
  const req: SigningRequest = {
    id: uuid(),
    title,
    signerName: name,
    signerEmail,
    auditSlug: auditSlug === '' ? null : auditSlug,
    origHash: await sha256Hex(bytes),
    createdAt,
    labAcceptedAt: createdAt,
    status: 'pending',
    signedAt: null,
    signedHash: null,
  };
  try {
    await env.SIGN_DOCS.put(originalKey(req.id), bytes, { httpMetadata: { contentType: 'application/pdf' } });
    await saveRequest(env.SIGN_DOCS, req);
  } catch {
    return json({ ok: false, error: 'store' }, 500);
  }
  const origin = new URL(request.url).origin;
  const link = `${origin}${lang === 'es' ? '/es' : ''}/sign/${req.id}`;
  const dict = lang === 'es' ? es.sign : en.sign;
  await sendMail(env, inviteMail(dict, { to: signerEmail, signerName: name, title, link, lang }), deps.fetchImpl);
  return json({ ok: true, id: req.id, link });
}

/** GET /api/sign-request: the owner's private list (FR8). */
export async function handleListRequests(request: Request, env: SignEnv, deps: SignDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const email = await authedEmail(request, env, deps);
  if (!email) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isOwnerEmail(email, env)) return json({ ok: false, error: 'forbidden' }, 403);
  if (!env.SIGN_DOCS) return json({ ok: false, error: 'unavailable' }, 503);
  const reqs = await listRequests(env.SIGN_DOCS);
  return json({
    ok: true,
    requests: reqs.map((r) => ({
      id: r.id,
      title: r.title,
      signerName: r.signerName,
      signerEmail: r.signerEmail,
      auditSlug: r.auditSlug,
      origHash: r.origHash,
      createdAt: r.createdAt,
      labAcceptedAt: r.labAcceptedAt,
      state: linkState(r, now()),
      signedHash: r.signedHash,
    })),
  });
}

function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ?? '';
}

/** POST /api/sign-complete: the signer signs (FR5, FR6). JSON body:
 *  id, name, idNumber, accept, hash. */
export async function handleSignComplete(request: Request, env: SignEnv, deps: SignDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const { id, name, idNumber, accept, hash } = body as {
    id?: unknown; name?: unknown; idNumber?: unknown; accept?: unknown; hash?: unknown;
  };
  if (!isRequestId(id)) return json({ ok: false, error: 'invalid' }, 400);
  if (!env.SIGN_DOCS) return json({ ok: false, error: 'unavailable' }, 503);
  const req = await loadRequest(env.SIGN_DOCS, id);
  if (!req) return json({ ok: false, error: 'missing' }, 404);
  if (req.status === 'signed') return json({ ok: false, error: 'signed' }, 409);
  if (!canSign(req, now())) {
    if (req.status !== 'expired') {
      try {
        await saveRequest(env.SIGN_DOCS, { ...req, status: 'expired' });
      } catch {
        // The expiry mark is a courtesy; the link stays expired regardless.
      }
    }
    return json({ ok: false, error: 'expired' }, 410);
  }
  const email = await authedEmail(request, env, deps);
  if (!email) return json({ ok: false, error: 'unauthorized' }, 401);
  if (email.toLowerCase() !== req.signerEmail.toLowerCase()) return json({ ok: false, error: 'forbidden' }, 403);
  const fullName = typeof name === 'string' ? name.trim() : '';
  const idNum = typeof idNumber === 'string' ? idNumber.trim() : '';
  if (fullName.length < 2 || fullName.length > 120 || fullName.includes('\n')) {
    return json({ ok: false, error: 'name' }, 400);
  }
  if (idNum === '' || idNum.length > 60 || idNum.includes('\n')) return json({ ok: false, error: 'id' }, 400);
  if (accept !== true) return json({ ok: false, error: 'accept' }, 400);
  if (typeof hash !== 'string' || hash.toLowerCase() !== req.origHash) {
    // A changed document needs a new request: the hash must match exactly.
    return json({ ok: false, error: 'hash' }, 422);
  }
  let original: Uint8Array;
  try {
    const obj = await env.SIGN_DOCS.get(originalKey(req.id));
    if (!obj) return json({ ok: false, error: 'missing' }, 404);
    original = new Uint8Array(await obj.arrayBuffer());
  } catch {
    return json({ ok: false, error: 'store' }, 500);
  }
  const signedAt = new Date(now());
  const evidence: EvidenceInput = {
    signerName: fullName,
    idNumber: idNum,
    verifiedEmail: email.toLowerCase(),
    signedAt,
    ip: clientIp(request),
    userAgent: request.headers.get('User-Agent') ?? '',
    origHash: req.origHash,
    labAcceptedAt: req.labAcceptedAt,
    requestId: req.id,
  };
  let signed: Uint8Array;
  try {
    signed = await buildSignedPdf(original, evidence);
  } catch {
    return json({ ok: false, error: 'pdf' }, 500);
  }
  const signedHash = await sha256Hex(signed);
  try {
    await env.SIGN_DOCS.put(signedKey(req.id), signed, { httpMetadata: { contentType: 'application/pdf' } });
    await saveRequest(env.SIGN_DOCS, { ...req, status: 'signed', signedAt: signedAt.toISOString(), signedHash });
  } catch {
    return json({ ok: false, error: 'store' }, 500);
  }
  // The evidence page carries both languages (see buildSignedPdf); the
  // mailed copy follows the signer's page language, Spanish by default.
  const lang: 'en' | 'es' = body.lang === 'en' ? 'en' : 'es';
  await sendMail(
    env,
    signedCopyMail(lang === 'es' ? es.sign : en.sign, {
      to: req.signerEmail,
      title: req.title,
      signedHash,
      lang,
      pdf: signed,
    }),
    deps.fetchImpl,
  );
  if (env.SIGN_NOTIFY_URL) {
    try {
      await (deps.fetchImpl ?? fetch)(env.SIGN_NOTIFY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.SIGN_NOTIFY_SECRET ? { Authorization: `Bearer ${env.SIGN_NOTIFY_SECRET}` } : {}),
        },
        body: JSON.stringify({ text: signedNotice(req.title, req.id) }),
      });
    } catch {
      // The signature stands without the notice; the operator misses one line.
    }
  }
  return json({ ok: true, signedHash });
}

/** GET /api/sign-file?id=&signed=: the original or the signed PDF (FR4, FR6).
 *  The signer sees it only with the request's verified email; the owner with
 *  any owner-allowlisted address. */
export async function handleSignFile(request: Request, env: SignEnv, deps: SignDeps): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const wantSigned = url.searchParams.get('signed') === '1';
  if (!isRequestId(id)) return json({ ok: false, error: 'invalid' }, 400);
  if (!env.SIGN_DOCS) return json({ ok: false, error: 'unavailable' }, 503);
  const req = await loadRequest(env.SIGN_DOCS, id);
  if (!req) return json({ ok: false, error: 'missing' }, 404);
  const email = await authedEmail(request, env, deps);
  if (!email) return json({ ok: false, error: 'unauthorized' }, 401);
  const allowed = isOwnerEmail(email, env) || email.toLowerCase() === req.signerEmail.toLowerCase();
  if (!allowed) return json({ ok: false, error: 'forbidden' }, 403);
  if (wantSigned && req.status !== 'signed') return json({ ok: false, error: 'missing' }, 404);
  let bytes: Uint8Array;
  try {
    const obj = await env.SIGN_DOCS.get(wantSigned ? signedKey(id) : originalKey(id));
    if (!obj) return json({ ok: false, error: 'missing' }, 404);
    bytes = new Uint8Array(await obj.arrayBuffer());
  } catch {
    return json({ ok: false, error: 'store' }, 500);
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/pdf',
    'Content-Length': String(bytes.length),
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex',
  };
  if (wantSigned) headers['Content-Disposition'] = 'attachment; filename="signed-document.pdf"';
  // A fresh view: Response wants a real ArrayBuffer, never a shared one.
  const view = new Uint8Array(bytes.length);
  view.set(bytes);
  return new Response(view, { status: 200, headers });
}

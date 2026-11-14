import type { Env } from './env';
import { SERVICE_LABEL } from './intake';
import { contactKey } from './limits';
import type { Lang } from './lang';
import { calendarCall } from './reservations';
import { formatSlot } from './schedule';
import { hashAddress } from './gate';
import { nameBase, postNote } from './registry';
import { changeLine, sameDayAfterAgenda } from './daybook';

/**
 * The public HTTP door to the free 15-minute first call, served at
 * `https://agenda.univerlab.org` next to the WhatsApp webhook: slot reads,
 * Turnstile-guarded bookings and signed cancel links. It shares the one
 * serialized calendar owner and the same configuration and rules as the
 * agent's offers, and no text, voice or vision model is called anywhere in
 * this path: client input is validated, stored in the event and shown to
 * the operator, never interpreted.
 */

const SITE = 'https://univerlab.org';
const AGENDA = 'https://agenda.univerlab.org';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const CANCEL_HMAC_PREFIX = 'univerlab-cancel:';
const MAX_BODY = 8192;
const SLOTS_TTL_MS = 60000;

export type AgendaReason =
  | 'verification'
  | 'invalid'
  | 'slot-taken'
  | 'limit'
  | 'unavailable';

/** Fixed refusal reasons; nothing is created in the calendar on a refusal. */
function refused(reason: AgendaReason, status: number, origin: string | null): Response {
  return json({ ok: false, reason }, status, origin);
}

function isLang(value: unknown): value is Lang {
  return value === 'es' || value === 'en';
}

function allowedOrigin(origin: string | null, route: 'slots' | 'book' | 'cancel', self: string): boolean {
  if (origin === null) return true;
  if (origin === SITE) return true;
  // The cancel page posts its confirmation form back to the host that served
  // it; that is the one other origin this route accepts.
  if (route === 'cancel' && origin === self) return true;
  if (route === 'slots') return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return false;
}

function json(data: unknown, status: number, origin: string | null): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    vary: 'Origin',
  };
  if (origin !== null) headers['access-control-allow-origin'] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

function page(title: string, lang: Lang, body: string, status: number, origin: string | null): Response {
  const headers: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    vary: 'Origin',
  };
  if (origin !== null) headers['access-control-allow-origin'] = origin;
  return new Response(
    '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + escapeHtml(title) + '</title></head><body><main>' + body + '</main></body></html>',
    { status, headers }
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Bilingual cancel-link page copy, fixed strings like every other worker text. */
const CANCEL_COPY: Record<
  Lang,
  { title: string; heading: string; confirm: string; done: string; gone: string; bad: string; down: string }
> = {
  es: {
    title: 'Cancelar primera llamada',
    heading: 'Cancelar tu primera llamada del {slot}',
    confirm: 'Sí, cancela mi llamada',
    done: 'Listo, tu primera llamada del {slot} quedó cancelada. El espacio vuelve a estar libre.',
    gone: 'Esta reserva ya no existe o la llamada ya empezó: no hay nada que cancelar.',
    bad: 'Este enlace de cancelación no es válido.',
    down: 'La agenda no responde ahora mismo: intenta de nuevo en unos minutos.',
  },
  en: {
    title: 'Cancel first call',
    heading: 'Cancel your first call on {slot}',
    confirm: 'Yes, cancel my call',
    done: 'Done, your first call on {slot} is cancelled. The slot is free again.',
    gone: 'This booking no longer exists or the call already started: there is nothing to cancel.',
    bad: 'This cancel link is not valid.',
    down: 'The calendar is not responding right now: try again in a few minutes.',
  },
};

function renderCopy(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const key of Object.keys(vars)) out = out.split('{' + key + '}').join(vars[key]);
  return out;
}

export interface ParsedBooking {
  name: string;
  email: string;
  lang: Lang;
  note: string;
  slot: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Field rules in code: name on one line, well-formed email, known language, short note, canonical slot. */
export function parseBooking(input: unknown): ParsedBooking | null {
  if (typeof input !== 'object' || input === null) return null;
  const b = input as Record<string, unknown>;
  if (typeof b.name !== 'string') return null;
  const name = b.name.trim();
  if (name.length < 2 || name.length > 80 || /[\r\n]/.test(name)) return null;
  if (typeof b.email !== 'string') return null;
  const email = b.email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  if (!isLang(b.lang)) return null;
  let note = '';
  if (b.note !== undefined) {
    if (typeof b.note !== 'string') return null;
    note = b.note.trim();
    if (note.length > 500) return null;
  }
  if (typeof b.slot !== 'string') return null;
  const ms = Date.parse(b.slot);
  if (!Number.isFinite(ms)) return null;
  // Canonical UTC ISO only, exactly as the slot read offers it.
  if (b.slot !== new Date(ms).toISOString()) return null;
  return { name, email, lang: b.lang, note, slot: b.slot };
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(t: string): string | null {
  try {
    let b64 = t.replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(CANCEL_HMAC_PREFIX + secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CancelClaim {
  /** Contact key (`web:<email>`) the booking was stored under. */
  k: string;
  /** Booked slot start, the exact UTC ISO the owner compares. */
  s: string;
  n: string;
  l: Lang;
}

/** Sign a cancel link that cannot be guessed and dies with its secret. */
export async function signCancelToken(claim: CancelClaim, secret: string): Promise<string> {
  const body = b64urlEncode(JSON.stringify(claim));
  return body + '.' + (await hmacHex(secret, body));
}

/** Open a cancel link; null when it was never signed with this secret. */
export async function openCancelToken(token: string, secret: string): Promise<CancelClaim | null> {
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[0-9a-f]{64}$/.test(sig)) return null;
  const expected = await hmacHex(secret, body);
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  const raw = b64urlDecode(body);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.k !== 'string' || !parsed.k) return null;
    if (typeof parsed.s !== 'string' || !Number.isFinite(Date.parse(parsed.s))) return null;
    if (typeof parsed.n !== 'string') return null;
    if (!isLang(parsed.l)) return null;
    return { k: parsed.k, s: parsed.s, n: parsed.n, l: parsed.l };
  } catch {
    return null;
  }
}

/** Verify the Turnstile token with Cloudflare; any failure is `verification`. */
export async function verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean> {
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    return false;
  }
}

function bookingDescription(f: ParsedBooking, cancelUrl: string): string {
  const serviceLabel = SERVICE_LABEL[f.lang]['first-call'];
  const langLabel = f.lang === 'es' ? 'español' : 'English';
  const lines = [
    'UniverLab · ' + f.name + ' <' + f.email + '>',
    (f.lang === 'es' ? 'Idioma: ' : 'Language: ') + langLabel + ' · ' +
      (f.lang === 'es' ? 'Servicio: ' : 'Service: ') + serviceLabel,
    f.lang === 'es' ? 'Canal: web' : 'Channel: web',
  ];
  if (f.note) lines.push((f.lang === 'es' ? 'Nota: ' : 'Note: ') + f.note);
  lines.push((f.lang === 'es' ? 'Cancela aquí: ' : 'Cancel here: ') + cancelUrl);
  return lines.join('\n');
}

async function gateAllow(
  env: Env,
  addr: string,
  bucket: string,
  limit: number,
  windowMs: number,
  now: number
): Promise<boolean> {
  try {
    const ns = env.GATE;
    if (!ns) return true;
    const stub = ns.get(ns.idFromName('gate'));
    const res = await stub.fetch(
      new Request('https://gate/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'check', addr, bucket, limit, windowMs, now }),
      })
    );
    const data = (await res.json()) as { ok?: unknown };
    return data.ok === true;
  } catch {
    return true;
  }
}

let slotsCache: { at: number; slots: string[] } | null = null;

async function handleSlots(req: Request, env: Env, origin: string | null, ip: string): Promise<Response> {
  const now = Date.now();
  const addr = await hashAddress(ip, env.TURNSTILE_SECRET ?? env.WA_APP_SECRET ?? 'univerlab-agenda');
  if (!(await gateAllow(env, addr, 'read', 30, 60000, now))) {
    return refused('limit', 429, origin);
  }
  if (slotsCache && now - slotsCache.at < SLOTS_TTL_MS) {
    return json({ ok: true, slots: slotsCache.slots }, 200, origin);
  }
  const res = await calendarCall(env, { action: 'quote', now });
  const slots = (res as { slots?: unknown }).slots;
  if (!res.ok || !Array.isArray(slots)) {
    return refused('unavailable', 503, origin);
  }
  slotsCache = { at: now, slots: slots as string[] };
  return json({ ok: true, slots }, 200, origin);
}

async function handleBook(req: Request, env: Env, origin: string | null, ip: string): Promise<Response> {
  const secret = env.TURNSTILE_SECRET;
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return refused('invalid', 400, origin);
  }
  if (raw.length > MAX_BODY) return refused('invalid', 400, origin);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return refused('invalid', 400, origin);
  }
  if (!secret) return refused('unavailable', 503, origin);
  if (typeof body !== 'object' || body === null) return refused('invalid', 400, origin);
  const token = (body as Record<string, unknown>).turnstileToken;
  if (typeof token !== 'string' || !token) return refused('verification', 403, origin);
  if (!(await verifyTurnstile(secret, token, ip))) return refused('verification', 403, origin);
  const now = Date.now();
  const addr = await hashAddress(ip, secret);
  if (!(await gateAllow(env, addr, 'book', 3, 3600000, now))) {
    return refused('limit', 429, origin);
  }
  const fields = parseBooking(body);
  if (!fields) return refused('invalid', 400, origin);
  const key = contactKey('web', fields.email);
  const cancelToken = await signCancelToken(
    { k: key, s: fields.slot, n: fields.name, l: fields.lang },
    secret
  );
  const res = await calendarCall(env, {
    action: 'reserve',
    service: 'first-call',
    minutes: 15,
    contactKey: key,
    attendee: fields.email,
    conference: true,
    sendUpdates: 'all',
    summary: SERVICE_LABEL[fields.lang]['first-call'] + ' · ' + fields.name,
    description: bookingDescription(fields, AGENDA + '/cancel?t=' + cancelToken),
    startIso: fields.slot,
    now,
  });
  if (res.ok) {
    // A web booking for a later day waits for that day's agenda; a
    // same-day booking after the agenda went out still goes at once.
    if (await sameDayAfterAgenda(env, fields.slot, now)) {
      await postNote(env, {
        name: nameBase(fields.email),
        text: changeLine('Primera llamada agendada (web)', 'first-call', fields.slot, fields.name, true),
        tag: 'CITA',
        priority: 'normal',
      });
    }
    const meet = typeof res.meet === 'string' ? res.meet : '';
    return json({ ok: true, slot: fields.slot, meet }, 200, origin);
  }
  if (res.reason === 'slot-taken') return refused('slot-taken', 409, origin);
  if (res.reason === 'calendar-down') return refused('unavailable', 503, origin);
  return refused('limit', 429, origin);
}

async function handleCancelGet(
  url: URL,
  env: Env,
  origin: string | null,
  now: number
): Promise<Response> {
  const secret = env.TURNSTILE_SECRET ?? '';
  // No secret means no web booking was ever signed: never verify against a
  // blank, publicly known key, and say so like every other outage.
  if (!secret) {
    return page(CANCEL_COPY.es.title, 'es', '<p>' + escapeHtml(CANCEL_COPY.es.down) + '</p>', 503, origin);
  }
  const claim = await openCancelToken(url.searchParams.get('t') ?? '', secret);
  if (!claim) {
    return page(CANCEL_COPY.es.bad, 'es', '<p>' + escapeHtml(CANCEL_COPY.es.bad) + '</p>', 400, origin);
  }
  const copy = CANCEL_COPY[claim.l];
  const slotText = formatSlot(claim.s, claim.l);
  if (now >= Date.parse(claim.s)) {
    return page(copy.title, claim.l, '<p>' + escapeHtml(copy.gone) + '</p>', 410, origin);
  }
  const heading = renderCopy(copy.heading, { slot: slotText || claim.s });
  return page(
    copy.title,
    claim.l,
    '<p>' + escapeHtml(heading) + '</p>' +
      '<form method="post" action="/cancel">' +
      '<input type="hidden" name="t" value="' +
      escapeHtml(url.searchParams.get('t') ?? '') +
      '">' +
      '<button type="submit">' + escapeHtml(copy.confirm) + '</button></form>',
    200,
    origin
  );
}

async function handleCancelPost(req: Request, env: Env, origin: string | null): Promise<Response> {
  const secret = env.TURNSTILE_SECRET ?? '';
  if (!secret) {
    return page(CANCEL_COPY.es.title, 'es', '<p>' + escapeHtml(CANCEL_COPY.es.down) + '</p>', 503, origin);
  }
  const contentType = req.headers.get('content-type') ?? '';
  let token = '';
  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      token = new URLSearchParams(await req.text()).get('t') ?? '';
    } else {
      const body = (await req.json()) as { t?: unknown };
      if (typeof body.t === 'string') token = body.t;
    }
  } catch {
    return page(CANCEL_COPY.es.bad, 'es', '<p>' + escapeHtml(CANCEL_COPY.es.bad) + '</p>', 400, origin);
  }
  const claim = await openCancelToken(token, secret);
  if (!claim) {
    return page(CANCEL_COPY.es.bad, 'es', '<p>' + escapeHtml(CANCEL_COPY.es.bad) + '</p>', 400, origin);
  }
  const copy = CANCEL_COPY[claim.l];
  const slotText = formatSlot(claim.s, claim.l);
  const now = Date.now();
  if (now >= Date.parse(claim.s)) {
    return page(copy.title, claim.l, '<p>' + escapeHtml(copy.gone) + '</p>', 410, origin);
  }
  const res = await calendarCall(env, {
    action: 'cancel',
    contactKey: claim.k,
    startIso: claim.s,
    now,
  });
  if (res.ok) {
    const email = claim.k.startsWith('web:') ? claim.k.slice(4) : claim.k;
    // A later-day web cancellation waits for that day's agenda; a
    // same-day one after the agenda went out still goes at once.
    if (await sameDayAfterAgenda(env, claim.s, now)) {
      await postNote(env, {
        name: nameBase(email),
        text: changeLine('Cita cancelada (web)', 'first-call', claim.s, claim.n, false),
        tag: 'CITA',
        priority: 'normal',
      });
    }
    return page(
      copy.title,
      claim.l,
      '<p>' + escapeHtml(renderCopy(copy.done, { slot: slotText || claim.s })) + '</p>',
      200,
      origin
    );
  }
  if (res.reason === 'no-booking' || res.reason === 'started') {
    return page(copy.title, claim.l, '<p>' + escapeHtml(copy.gone) + '</p>', 410, origin);
  }
  if (res.reason === 'calendar-down') {
    return page(copy.title, claim.l, '<p>' + escapeHtml(copy.down) + '</p>', 503, origin);
  }
  return page(copy.title, claim.l, '<p>' + escapeHtml(copy.down) + '</p>', 503, origin);
}

/**
 * Answer the public agenda routes, or null when this request is not one:
 * the worker keeps serving the WhatsApp webhook and the health check, and
 * works when the WhatsApp secrets are missing or that side is failing.
 */
export async function handleAgenda(req: Request, env: Env): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path !== '/slots' && path !== '/book' && path !== '/cancel') return null;
  const route = path === '/slots' ? 'slots' : path === '/book' ? 'book' : 'cancel';
  const origin = req.headers.get('origin');
  if (!allowedOrigin(origin, route, url.origin)) return refused('invalid', 403, origin);
  if (req.method === 'OPTIONS') {
    const headers: Record<string, string> = {
      'access-control-allow-origin': origin ?? '',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
      vary: 'Origin',
    };
    if (origin === null) delete headers['access-control-allow-origin'];
    return new Response(null, { status: 204, headers });
  }
  const ip = req.headers.get('cf-connecting-ip') ?? '';
  if (route === 'slots') {
    if (req.method !== 'GET') return refused('invalid', 405, origin);
    return handleSlots(req, env, origin, ip);
  }
  if (route === 'book') {
    if (req.method !== 'POST') return refused('invalid', 405, origin);
    return handleBook(req, env, origin, ip);
  }
  if (req.method === 'GET') return handleCancelGet(url, env, origin, Date.now());
  if (req.method === 'POST') return handleCancelPost(req, env, origin);
  return refused('invalid', 405, origin);
}

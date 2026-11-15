/** @jest-environment node */
jest.mock(
  'cloudflare:workers',
  () => ({
    DurableObject: class {
      ctx: unknown;
      env: unknown;
      constructor(ctx: unknown, env: unknown) {
        this.ctx = ctx;
        this.env = env;
      }
    },
  }),
  { virtual: true }
);

import {
  handleAgenda,
  openCancelToken,
  parseBooking,
  signCancelToken,
} from '../src/agenda';
import type { Env } from '../src/env';

const SECRET = 'turnstile-secret-for-tests';
const NOW = Date.UTC(2026, 10, 17, 12, 0);
const SLOT = '2026-11-19T15:00:00.000Z';

function fakeNs(handler: (body: Record<string, unknown>) => Record<string, unknown>) {
  return {
    idFromName: (name: string) => name,
    get: (_id: string) => ({
      fetch: async (req: Request) => Response.json(handler((await req.json()) as Record<string, unknown>)),
    }),
  };
}

interface Scenario {
  calendar?: (body: Record<string, unknown>) => Record<string, unknown>;
  gate?: (body: Record<string, unknown>) => Record<string, unknown>;
  turnstile?: boolean;
  secret?: string | null;
  agendaSent?: boolean;
}

function makeEnv(s: Scenario): {
  env: Env;
  seen: Record<string, unknown>[];
  gateSeen: Record<string, unknown>[];
  notes: Record<string, unknown>[];
} {
  const seen: Record<string, unknown>[] = [];
  const gateSeen: Record<string, unknown>[] = [];
  const notes: Record<string, unknown>[] = [];
  const calendar = s.calendar ?? (() => ({ ok: false, reason: 'calendar-down' }));
  const gate = s.gate ?? (() => ({ ok: true }));
  return {
    seen,
    gateSeen,
    notes,
    env: {
      CALENDAR: fakeNs((body) => {
        seen.push(body);
        return calendar(body);
      }),
      GATE: fakeNs((body) => {
        gateSeen.push(body);
        return gate(body);
      }),
      REGISTRY: fakeNs((body) => {
        if (body.action === 'note') notes.push(body);
        if (body.action === 'agendaSent') return { sent: s.agendaSent === true };
        return { name: 'ana' };
      }),
      OPERATOR_PHONE: '+57 300 999 8888',
      ...(s.secret === null ? {} : { TURNSTILE_SECRET: s.secret ?? SECRET }),
      WA_APP_SECRET: 'wa-secret',
    } as unknown as Env,
  };
}

async function call(path: string, env: Env, init?: Omit<RequestInit, 'headers'> & { origin?: string | null; ip?: string; headers?: Record<string, string> }): Promise<Response> {
  const headers: Record<string, string> = { ...(init?.headers ?? {}) };
  if (init?.origin !== undefined && init?.origin !== null) headers.origin = init.origin;
  headers['cf-connecting-ip'] = init?.ip ?? '203.0.113.7';
  const res = (await handleAgenda(
    new Request('https://agenda.univerlab.org' + path, { ...init, headers }),
    env
  )) as Response | null;
  if (!res) throw new Error('expected a route response for ' + path);
  return res;
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    Response.json({ success: true })
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('unknown paths fall through to the webhook, they are not agenda routes', async () => {
  const { env } = makeEnv({});
  await expect(
    handleAgenda(new Request('https://agenda.univerlab.org/webhook'), env)
  ).resolves.toBeNull();
  await expect(
    handleAgenda(new Request('https://agenda.univerlab.org/health'), env)
  ).resolves.toBeNull();
});

test('parseBooking accepts the booking form and lowercases the email contact', () => {
  expect(
    parseBooking({ name: ' Ana ', email: 'ANA@Example.COM', lang: 'es', note: ' hola ', slot: SLOT })
  ).toEqual({ name: 'Ana', email: 'ana@example.com', lang: 'es', note: 'hola', slot: SLOT });
  expect(parseBooking({ name: 'Ana', email: 'a@b.co', lang: 'en', slot: SLOT })?.note).toBe('');
});

test('parseBooking rejects every bad field on its own', () => {
  const good = { name: 'Ana', email: 'ana@example.com', lang: 'es', slot: SLOT };
  expect(parseBooking({ ...good, name: 'A' })).toBeNull();
  expect(parseBooking({ ...good, name: 'x'.repeat(81) })).toBeNull();
  expect(parseBooking({ ...good, name: 'An\na' })).toBeNull();
  expect(parseBooking({ ...good, email: 'not-an-email' })).toBeNull();
  expect(parseBooking({ ...good, email: 'a@b.c' })).toBeNull();
  expect(parseBooking({ ...good, email: 'a@b.co'.padEnd(255, 'x') })).toBeNull();
  expect(parseBooking({ ...good, lang: 'fr' })).toBeNull();
  expect(parseBooking({ ...good, note: 'x'.repeat(501) })).toBeNull();
  expect(parseBooking({ ...good, note: 5 })).toBeNull();
  // The same instant without milliseconds is valid ISO but not canonical.
  expect(parseBooking({ ...good, slot: '2026-11-19T15:00:00Z' })).toBeNull();
  expect(parseBooking({ ...good, slot: 'tomorrow' })).toBeNull();
  expect(parseBooking(null)).toBeNull();
});

test('cancel tokens round-trip and cannot be forged or moved across secrets', async () => {
  const claim = { k: 'web:ana@example.com', s: SLOT, n: 'Ana', l: 'es' as const };
  const token = await signCancelToken(claim, SECRET);
  await expect(openCancelToken(token, SECRET)).resolves.toEqual(claim);
  await expect(openCancelToken(token, 'other-secret')).resolves.toBeNull();
  await expect(openCancelToken(token.slice(0, -2) + 'ff', SECRET)).resolves.toBeNull();
  await expect(openCancelToken('no-dot', SECRET)).resolves.toBeNull();
  await expect(openCancelToken('', SECRET)).resolves.toBeNull();
});

test('slot reads allow the site and local previews, never another origin', async () => {
  const { env } = makeEnv({ calendar: () => ({ ok: true, slots: [SLOT] }) });
  for (const origin of [undefined, 'https://univerlab.org', 'http://localhost:3000', 'http://127.0.0.1:5173']) {
    const res = await call('/slots', env, origin === undefined ? {} : { origin });
    expect(res.status).toBe(200);
  }
  const evil = await call('/slots', env, { origin: 'https://evil.com' });
  expect(evil.status).toBe(403);
  expect(await evil.json()).toEqual({ ok: false, reason: 'invalid' });
  // Booking and cancel are never local: only the site may drive them.
  const local = await call('/cancel?t=x', env, { origin: 'http://localhost:3000' });
  expect(local.status).toBe(403);
});

test('the cancel page confirms from the agenda host it is served on', async () => {
  const claim = { k: 'web:ana@example.com', s: SLOT, n: 'Ana', l: 'es' as const };
  const token = await signCancelToken(claim, SECRET);
  const { env } = makeEnv({ calendar: (body) => ({ ok: body.action === 'cancel', start: SLOT }) });
  // A browser posting the confirmation form sends the agenda origin itself.
  const res = await call('/cancel', env, {
    method: 'POST',
    origin: 'https://agenda.univerlab.org',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 't=' + encodeURIComponent(token),
  });
  expect(res.status).toBe(200);
  // Another host is still refused, and booking is never allowed from the agenda host.
  const other = await call('/cancel', env, {
    method: 'POST',
    origin: 'https://agenda.evil.com',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 't=' + encodeURIComponent(token),
  });
  expect(other.status).toBe(403);
  const fromAgenda = await call('/book', env, {
    method: 'POST',
    origin: 'https://agenda.univerlab.org',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  expect(fromAgenda.status).toBe(403);
});

test('slot reads quote the owner and answer unavailable when it is down', async () => {
  const up = makeEnv({ calendar: (body) => (body.action === 'quote' ? { ok: true, slots: [SLOT] } : { ok: false, reason: 'calendar-down' }) });
  // Past the 60-second cache: the read reaches the owner with a quote.
  jest.spyOn(Date, 'now').mockReturnValue(NOW + 120000);
  const res = await call('/slots', up.env);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, slots: [SLOT] });
  expect(up.seen[0]).toMatchObject({ action: 'quote' });
  const down = makeEnv({ calendar: () => ({ ok: false, reason: 'calendar-down' }) });
  jest.spyOn(Date, 'now').mockReturnValue(NOW + 240000);
  const res2 = await call('/slots', down.env);
  expect(res2.status).toBe(503);
  expect(await res2.json()).toEqual({ ok: false, reason: 'unavailable' });
});

test('thirty reads a minute per address, the thirty-first waits', async () => {
  let hits = 0;
  const { env } = makeEnv({
    calendar: () => ({ ok: true, slots: [] }),
    gate: () => (++hits <= 30 ? { ok: true } : { ok: false }),
  });
  // The cache is per isolate, so every read still counts against the limit.
  for (let i = 0; i < 30; i++) {
    jest.spyOn(Date, 'now').mockReturnValue(NOW + i * 1000);
    expect((await call('/slots', env)).status).toBe(200);
  }
  jest.spyOn(Date, 'now').mockReturnValue(NOW + 31 * 1000);
  const limited = await call('/slots', env);
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({ ok: false, reason: 'limit' });
});

test('booking without the deploy secret is unavailable, slots still work', async () => {
  const { env } = makeEnv({ secret: null, calendar: () => ({ ok: true, slots: [SLOT] }) });
  const slots = await call('/slots', env);
  expect(slots.status).toBe(200);
  const res = await call('/book', env, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', lang: 'es', slot: SLOT, turnstileToken: 't' }),
  });
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ ok: false, reason: 'unavailable' });
});

test('booking verifies the token before anything else', async () => {
  const { env, seen } = makeEnv({ calendar: () => ({ ok: true, eventId: 'e1', meet: 'm' }) });
  const post = (body: unknown) =>
    call('/book', env, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  // A failing siteverify refuses even a perfect form, and touches nothing.
  (globalThis.fetch as jest.Mock).mockImplementation(async () => Response.json({ success: false }));
  const bad = await post({ name: 'Ana', email: 'ana@example.com', lang: 'es', slot: SLOT, turnstileToken: 'bad' });
  expect(bad.status).toBe(403);
  expect(await bad.json()).toEqual({ ok: false, reason: 'verification' });
  expect(seen).toHaveLength(0);
  // A missing token is the same refusal, not an invalid field.
  (globalThis.fetch as jest.Mock).mockImplementation(async () => Response.json({ success: true }));
  const missing = await post({ name: 'Ana', email: 'ana@example.com', lang: 'es', slot: SLOT });
  expect(missing.status).toBe(403);
  expect(await missing.json()).toEqual({ ok: false, reason: 'verification' });
  // Oversize and unparseable bodies are invalid without reaching the owner.
  const big = await post('{' + ' '.repeat(9000));
  expect(big.status).toBe(400);
  expect(await big.json()).toEqual({ ok: false, reason: 'invalid' });
  const broken = await post('{nope');
  expect(broken.status).toBe(400);
  const badField = await post({ name: 'A', email: 'ana@example.com', lang: 'es', slot: SLOT, turnstileToken: 't' });
  expect(badField.status).toBe(400);
  expect(await badField.json()).toEqual({ ok: false, reason: 'invalid' });
  // A parsed body that is not an object is a field refusal, not a crash.
  const nullBody = await post('null');
  expect(nullBody.status).toBe(400);
  expect(await nullBody.json()).toEqual({ ok: false, reason: 'invalid' });
  expect(seen).toHaveLength(0);
});

test('a booking reserves through the shared owner and answers slot and meet', async () => {
  const { env, seen } = makeEnv({
    calendar: () => ({ ok: true, eventId: 'ev9', start: SLOT, end: SLOT, kind: 'booked', meet: 'https://meet.google.com/x' }),
  });
  const res = await call('/book', env, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana', email: 'ANA@Example.com', lang: 'es', note: 'quiero hablar', slot: SLOT, turnstileToken: 't' }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, slot: SLOT, meet: 'https://meet.google.com/x' });
  expect(seen[0]).toMatchObject({
    action: 'reserve',
    service: 'first-call',
    minutes: 15,
    contactKey: 'web:ana@example.com',
    attendee: 'ana@example.com',
    conference: true,
    sendUpdates: 'all',
    startIso: SLOT,
  });
  const sent = seen[0] as Record<string, string>;
  expect(sent.summary).toContain('Ana');
  expect(sent.description).toContain('ana@example.com');
  expect(sent.description).toContain('web');
  expect(sent.description).toContain('/cancel?t=');
});

test('a same-day web booking tells the operator at once after the agenda', async () => {
  // The slot is 10:00 Bogota on Nov 19, so the clock is pinned to that same morning.
  jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 19, 12, 0));
  const { env, notes } = makeEnv({
    calendar: () => ({ ok: true, eventId: 'ev9', start: SLOT, end: SLOT, kind: 'booked', meet: 'https://meet.google.com/x' }),
    agendaSent: true,
  });
  const res = await call('/book', env, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', lang: 'es', note: 'quiero hablar', slot: SLOT, turnstileToken: 't' }),
  });
  expect(res.status).toBe(200);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ name: 'ana', tag: 'CITA', priority: 'normal' });
  const text = String((notes[0] as { text?: unknown }).text ?? '');
  expect(text).toContain('Primera llamada agendada (web)');
  expect(text).toContain('10:00');
});

test('a later-day web booking waits for its agenda instead of an immediate note', async () => {
  // The default clock is Nov 17 while the slot is Nov 19: a later day.
  const { env, notes } = makeEnv({
    calendar: () => ({ ok: true, eventId: 'ev9', start: SLOT, end: SLOT, kind: 'booked', meet: 'https://meet.google.com/x' }),
    agendaSent: true,
  });
  const res = await call('/book', env, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', lang: 'es', note: 'quiero hablar', slot: SLOT, turnstileToken: 't' }),
  });
  expect(res.status).toBe(200);
  expect(notes).toHaveLength(0);
});

test('a same-day web cancellation tells the operator at once after the agenda', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 19, 12, 0));
  const claim = { k: 'web:ana@example.com', s: SLOT, n: 'Ana', l: 'es' as const };
  const token = await signCancelToken(claim, SECRET);
  const { env, notes } = makeEnv({ calendar: () => ({ ok: true, start: SLOT }), agendaSent: true });
  const res = await call('/cancel', env, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ t: token }),
  });
  expect(res.status).toBe(200);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ name: 'ana', tag: 'CITA', priority: 'normal' });
  const text = String((notes[0] as { text?: unknown }).text ?? '');
  expect(text).toContain('Cita cancelada (web)');
  expect(text).toContain('10:00');
});

test('refusals map to their fixed statuses and create nothing', async () => {
  const table: Array<[Record<string, unknown>, number, string]> = [
    [{ ok: false, reason: 'slot-taken' }, 409, 'slot-taken'],
    [{ ok: false, reason: 'existing' }, 429, 'limit'],
    [{ ok: false, reason: 'free-limit' }, 429, 'limit'],
    [{ ok: false, reason: 'day-cap' }, 429, 'limit'],
    [{ ok: false, reason: 'calendar-down' }, 503, 'unavailable'],
  ];
  for (const [reply, status, reason] of table) {
    const { env, seen } = makeEnv({ calendar: () => reply });
    const res = await call('/book', env, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', lang: 'es', slot: SLOT, turnstileToken: 't' }),
    });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, reason });
    // Only the reserve was attempted: a refusal never creates a second call.
    expect(seen).toHaveLength(1);
    expect(seen[0].action).toBe('reserve');
  }
});

test('the rate gate counts a hashed address, never the raw IP', async () => {
  const { env, gateSeen } = makeEnv({ calendar: () => ({ ok: true, slots: [SLOT] }) });
  await call('/slots', env, { ip: '198.51.100.9' });
  expect(gateSeen[0]).toMatchObject({ action: 'check', bucket: 'read', limit: 30, windowMs: 60000 });
  expect(String(gateSeen[0].addr)).toMatch(/^[0-9a-f]{64}$/);
  expect(String(gateSeen[0].addr)).not.toContain('198.51.100.9');

  const booking = makeEnv({ calendar: () => ({ ok: true, eventId: 'e1', meet: 'm' }) });
  await call('/book', booking.env, {
    method: 'POST',
    ip: '198.51.100.9',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', lang: 'es', slot: SLOT, turnstileToken: 't' }),
  });
  expect(booking.gateSeen[0]).toMatchObject({ bucket: 'book', limit: 3, windowMs: 3600000 });
  expect(String(booking.gateSeen[0].addr)).toBe(String(gateSeen[0].addr));
});

test('a booking refused by the address limit never reaches the owner', async () => {
  const { env, seen } = makeEnv({
    calendar: () => ({ ok: true, eventId: 'e1', meet: 'm' }),
    gate: (body) => (body.bucket === 'book' ? { ok: false } : { ok: true }),
  });
  const res = await call('/book', env, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', lang: 'es', slot: SLOT, turnstileToken: 't' }),
  });
  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({ ok: false, reason: 'limit' });
  expect(seen).toHaveLength(0);
});

test('the cancel link shows the booking, confirms it, and dies afterwards', async () => {
  const future = '2026-11-19T15:00:00.000Z';
  const claim = { k: 'web:ana@example.com', s: future, n: 'Ana', l: 'es' as const };
  const token = await signCancelToken(claim, SECRET);
  const cancelled: string[] = [];
  const { env } = makeEnv({
    calendar: (body) => {
      if (body.action === 'cancel') {
        cancelled.push(String(body.startIso));
        return { ok: true, start: body.startIso };
      }
      return { ok: false, reason: 'calendar-down' };
    },
  });
  const shown = await call('/cancel?t=' + encodeURIComponent(token), env);
  expect(shown.status).toBe(200);
  expect(shown.headers.get('content-type')).toContain('text/html');
  const html = await shown.text();
  expect(html).toContain('<form');
  expect(html).toContain('noviembre');
  expect(html).toContain(encodeURIComponent(token).slice(0, 20));
  const done = await call('/cancel', env, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 't=' + encodeURIComponent(token),
  });
  expect(done.status).toBe(200);
  expect(await done.text()).toContain('cancelada');
  expect(cancelled).toEqual([future]);
  // A forged start finds no booking; a started call is gone, not cancelled.
  const bad = await call('/cancel?t=' + encodeURIComponent(token.slice(0, -2) + 'ff'), env);
  expect(bad.status).toBe(400);
  const pastClaim = { k: 'web:ana@example.com', s: '2026-11-10T15:00:00.000Z', n: 'Ana', l: 'en' as const };
  const past = await signCancelToken(pastClaim, SECRET);
  const gone = await call('/cancel?t=' + encodeURIComponent(past), env);
  expect(gone.status).toBe(410);
  const gonePost = await call('/cancel', env, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ t: past }),
  });
  expect(gonePost.status).toBe(410);
});

test('cancel without the deploy secret refuses instead of trusting a blank key', async () => {
  const claim = { k: 'web:ana@example.com', s: SLOT, n: 'Ana', l: 'es' as const };
  // Signed with the empty key anyone could guess: it must not be honoured.
  const forged = await signCancelToken(claim, '');
  const { env } = makeEnv({ secret: null });
  const shown = await call('/cancel?t=' + encodeURIComponent(forged), env);
  expect(shown.status).toBe(503);
  const confirmed = await call('/cancel', env, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 't=' + encodeURIComponent(forged),
  });
  expect(confirmed.status).toBe(503);
});

test('cancel answers unavailable when the owner is down', async () => {
  const claim = { k: 'web:ana@example.com', s: SLOT, n: 'Ana', l: 'es' as const };
  const token = await signCancelToken(claim, SECRET);
  const { env } = makeEnv({ calendar: () => ({ ok: false, reason: 'calendar-down' }) });
  const res = await call('/cancel', env, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ t: token }),
  });
  expect(res.status).toBe(503);
});

test('nothing in this path calls a language model', async () => {
  const { env } = makeEnv({
    calendar: (body) => {
      if (body.action === 'quote') return { ok: true, slots: [SLOT] };
      return { ok: true, eventId: 'e1', meet: '' };
    },
  });
  await call('/slots', env);
  await call('/book', env, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', lang: 'es', slot: SLOT, turnstileToken: 't' }),
  });
  // The only fetch the worker makes is the Turnstile siteverify.
  for (const c of (globalThis.fetch as jest.Mock).mock.calls) {
    expect(String(c[0])).toContain('challenges.cloudflare.com');
  }
});

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

jest.mock('../src/daybook', () => ({ runBookingDigest: jest.fn(async () => undefined) }));

import worker from '../src/index';
import { runBookingDigest } from '../src/daybook';

function calendarNs(handler: (body: Record<string, unknown>) => Record<string, unknown>) {
  const seen: Record<string, unknown>[] = [];
  return {
    seen,
    ns: {
      idFromName: (name: string) => name,
      get: (_id: string) => ({
        fetch: async (req: Request) => {
          const body = (await req.json()) as Record<string, unknown>;
          seen.push(body);
          return Response.json(handler(body));
        },
      }),
    },
  };
}

test('the health check answers without touching the calendar', async () => {
  const cal = calendarNs(() => ({ ok: true }));
  const res = await worker.fetch(
    new Request('https://booking.univerlab.org/health'),
    { CALENDAR: cal.ns } as never,
    {} as ExecutionContext
  );
  expect(res.status).toBe(200);
  expect(cal.seen).toHaveLength(0);
});

const SECRET = 'internal-call-secret-for-tests';

function agentReq(body: unknown, secret: string | null = SECRET): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== null) headers.authorization = `Bearer ${secret}`;
  return new Request('https://booking.univerlab.org/internal/call', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function agentEnv(cal: { ns: unknown }) {
  return { CALENDAR: cal.ns, INTERNAL_CALL_SECRET: SECRET } as never;
}

test('the agent door forwards the action envelope to the calendar owner', async () => {
  const cal = calendarNs((body) =>
    body.action === 'quote' ? { ok: true, slots: ['s1'] } : { ok: false, reason: 'calendar-down' }
  );
  const res = await worker.fetch(agentReq({ action: 'quote', now: 42 }), agentEnv(cal), {} as ExecutionContext);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, slots: ['s1'] });
  expect(cal.seen).toEqual([{ action: 'quote', now: 42 }]);
});

test('the agent door refuses a missing, wrong or unconfigured shared secret', async () => {
  const cal = calendarNs(() => ({ ok: true }));
  const env = agentEnv(cal);
  const noHeader = await worker.fetch(
    new Request('https://booking.univerlab.org/internal/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'quote' }),
    }),
    env,
    {} as ExecutionContext
  );
  expect(noHeader.status).toBe(401);
  expect(await noHeader.json()).toEqual({ ok: false, reason: 'calendar-down' });
  const wrong = await worker.fetch(agentReq({ action: 'quote' }, 'nope'), env, {} as ExecutionContext);
  expect(wrong.status).toBe(401);
  const unconfigured = await worker.fetch(agentReq({ action: 'quote' }), { CALENDAR: cal.ns } as never, {} as ExecutionContext);
  expect(unconfigured.status).toBe(401);
  expect(cal.seen).toHaveLength(0);
});

test('the agent door refuses a missing action or body without reaching the owner', async () => {
  const cal = calendarNs(() => ({ ok: true }));
  const env = agentEnv(cal);
  const ctx = {} as ExecutionContext;
  const missing = await worker.fetch(agentReq({ now: 42 }), env, ctx);
  expect(missing.status).toBe(400);
  const broken = await worker.fetch(agentReq('{nope'), env, ctx);
  expect(broken.status).toBe(400);
  expect(cal.seen).toHaveLength(0);
});

test('the agent door is calendar-down without its binding', async () => {
  const res = await worker.fetch(
    agentReq({ action: 'quote' }),
    { INTERNAL_CALL_SECRET: SECRET } as never,
    {} as ExecutionContext
  );
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ ok: false, reason: 'calendar-down' });
});

test('the agent door is not a public booking route', async () => {
  const cal = calendarNs(() => ({ ok: false, reason: 'calendar-down' }));
  const res = await worker.fetch(
    agentReq({ action: 'reserve', turnstileToken: 't' }),
    agentEnv(cal),
    {} as ExecutionContext
  );
  // No Turnstile is checked here: the owner answers the action as sent.
  expect(cal.seen).toEqual([{ action: 'reserve', turnstileToken: 't' }]);
  expect(res.status).toBe(200);
});

test('unknown paths are not found', async () => {
  const cal = calendarNs(() => ({ ok: true }));
  const res = await worker.fetch(
    new Request('https://booking.univerlab.org/webhook'),
    { CALENDAR: cal.ns } as never,
    {} as ExecutionContext
  );
  expect(res.status).toBe(404);
});

test('the Cron Trigger hands every scheduled wake to the digest run', async () => {
  const waits: Array<Promise<unknown>> = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as ExecutionContext;
  const env = {};
  const at = Date.UTC(2026, 10, 9, 11, 30);

  await worker.scheduled({ scheduledTime: at }, env as never, ctx);
  await Promise.all(waits);

  expect(runBookingDigest).toHaveBeenCalledTimes(1);
  expect(runBookingDigest).toHaveBeenCalledWith(env, at);
});

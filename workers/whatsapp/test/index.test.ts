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

import worker from '../src/index';

function registryNs(handler: (body: Record<string, unknown>) => unknown) {
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

const CTX = {} as ExecutionContext;

function notify(body: unknown, env: unknown) {
  return worker.fetch(
    new Request('https://agent/internal/booking-notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env as never,
    CTX
  );
}

test('the health check answers without touching the registry', async () => {
  const reg = registryNs(() => ({ ok: true }));
  const res = await worker.fetch(
    new Request('https://agent/health'),
    { REGISTRY: reg.ns } as never,
    CTX
  );
  expect(res.status).toBe(200);
  expect(reg.seen).toHaveLength(0);
});

test('the notify door forwards digest queries to the operator registry', async () => {
  const reg = registryNs((body) => (body.action === 'bookingDigestSent' ? { sent: true } : { ok: false }));
  const res = await notify({ type: 'digestSent', dateKey: '2026-11-09' }, { REGISTRY: reg.ns });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ sent: true });
  expect(reg.seen).toEqual([{ action: 'bookingDigestSent', dateKey: '2026-11-09' }]);
});

test('the notify door forwards the digest and operator notes', async () => {
  const reg = registryNs(() => ({ sent: true, ok: true }));
  const digest = await notify({ type: 'digest', dateKey: '2026-11-09', text: 'Agenda de hoy (1):\n07:00 · X' }, { REGISTRY: reg.ns });
  expect(digest.status).toBe(200);
  const note = await notify({ type: 'note', name: 'ana', text: 'Cita agendada · 07:00' }, { REGISTRY: reg.ns });
  expect(note.status).toBe(200);
  expect(reg.seen).toEqual([
    { action: 'bookingDigest', dateKey: '2026-11-09', text: 'Agenda de hoy (1):\n07:00 · X' },
    { action: 'note', name: 'ana', text: 'Cita agendada · 07:00', tag: 'CITA', priority: 'normal' },
  ]);
});

test('the notify door refuses forged shapes and needs its registry', async () => {
  const reg = registryNs(() => ({ ok: true }));
  const env = { REGISTRY: reg.ns };
  for (const bad of [
    '{nope',
    { type: 'note', name: '', text: 'x' },
    { type: 'note', name: 'ana', text: '' },
    { type: 'note', name: 'ana', text: 'x'.repeat(2001) },
    { type: 'digestSent', dateKey: 'tomorrow' },
    { type: 'digest', dateKey: '2026-11-09', text: 5 },
    { type: 'other', dateKey: '2026-11-09' },
  ]) {
    const res = await notify(bad, env);
    expect(res.status).toBe(400);
  }
  expect(reg.seen).toHaveLength(0);
  const missing = await notify({ type: 'note', name: 'ana', text: 'x' }, {});
  expect(missing.status).toBe(400);
});

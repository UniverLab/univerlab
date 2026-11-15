/** @jest-environment node */
import { Gate, hashAddress } from '../src/gate';

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

interface Hit {
  addr: string;
  bucket: string;
  at: number;
}

function makeGate() {
  const hits: Hit[] = [];
  const sql = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exec: (query: string, ...params: any[]) => {
      const q = query.replace(/\s+/g, ' ').trim();
      let rows: unknown[] = [];
      if (q.startsWith('DELETE FROM hits')) {
        const [cutoff] = params;
        for (let i = hits.length - 1; i >= 0; i--) {
          if (hits[i].at < cutoff) hits.splice(i, 1);
        }
      } else if (q.startsWith('INSERT INTO hits')) {
        const [addr, bucket, at] = params;
        hits.push({ addr, bucket, at });
      } else if (q.startsWith('SELECT at FROM hits')) {
        const [addr, bucket, since] = params;
        rows = hits.filter((h) => h.addr === addr && h.bucket === bucket && h.at > since);
      }
      return { toArray: () => rows };
    },
  };
  const ctx = {
    storage: { sql },
    blockConcurrencyWhile: (fn: () => unknown) => {
      fn();
    },
  };
  return { hits, gate: new Gate(ctx as never, {} as never) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function check(gate: Gate, body: any): Promise<any> {
  const res = await gate.fetch(
    new Request('https://gate/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return (await res.json()) as unknown;
}

test('addresses hash to stable salted hex, never the raw address', async () => {
  const a = await hashAddress('203.0.113.7', 's1');
  const b = await hashAddress(' 203.0.113.7 ', 's1');
  expect(a).toBe(b);
  expect(a).toMatch(/^[0-9a-f]{64}$/);
  expect(a).not.toContain('203.0.113');
  await expect(hashAddress('203.0.113.7', 's2')).resolves.not.toBe(a);
  await expect(hashAddress('203.0.113.8', 's1')).resolves.not.toBe(a);
});

test('the third booking in the hour is refused and other buckets are untouched', async () => {
  const { gate } = makeGate();
  const body = { action: 'check', addr: 'aa', bucket: 'book', limit: 3, windowMs: 3600000, now: 1000 };
  expect(await check(gate, body)).toEqual({ ok: true });
  expect(await check(gate, { ...body, now: 2000 })).toEqual({ ok: true });
  expect(await check(gate, { ...body, now: 3000 })).toEqual({ ok: true });
  expect(await check(gate, { ...body, now: 4000 })).toEqual({ ok: false });
  // Another address, another bucket, or a later window starts over.
  expect(await check(gate, { ...body, addr: 'bb', now: 4000 })).toEqual({ ok: true });
  expect(await check(gate, { ...body, bucket: 'read', now: 4000 })).toEqual({ ok: true });
  expect(await check(gate, { ...body, now: 4000 + 3600000 })).toEqual({ ok: true });
});

test('hashes older than 24 hours are pruned and forgotten', async () => {
  const { gate, hits } = makeGate();
  const body = { action: 'check', addr: 'aa', bucket: 'read', limit: 30, windowMs: 60000, now: 1000 };
  expect(await check(gate, body)).toEqual({ ok: true });
  expect(hits).toHaveLength(1);
  // A day later the old hit is gone: the store keeps nothing past 24 hours.
  expect(await check(gate, { ...body, now: 1000 + 25 * 3600 * 1000 })).toEqual({ ok: true });
  expect(hits).toHaveLength(1);
});

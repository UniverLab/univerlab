import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

/** Addresses are kept only as salted hashes, never as raw IPs. */
export async function hashAddress(ip: string, secret: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('ip:' + secret + ':' + ip.trim().toLowerCase())
  );
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Sql = {
  exec(query: string, ...params: unknown[]): { toArray(): unknown[] };
};

/**
 * The one serialized owner of the public agenda rate limits. Every slot
 * read and every web booking passes through this object (`Gate` bound
 * under the fixed name `gate`), so a burst of requests has exactly one
 * counter: at most `limit` hits per `bucket` inside `windowMs`, with
 * address hashes pruned after 24 hours.
 */
export class Gate extends DurableObject<Env> {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ensureSchema();
    });
  }

  private ensureSchema(): void {
    const sql = this.ctx.storage.sql as unknown as Sql;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS hits (
        addr TEXT NOT NULL,
        bucket TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    sql.exec(`CREATE INDEX IF NOT EXISTS hits_addr_bucket_at ON hits (addr, bucket, at)`);
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn) as Promise<T>;
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async fetch(req: Request): Promise<Response> {
    this.ensureSchema();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, reason: 'unavailable' }, { status: 400 });
    }
    try {
      if (typeof body !== 'object' || body === null) {
        return Response.json({ ok: false, reason: 'unavailable' }, { status: 400 });
      }
      const args = body as Record<string, unknown>;
      if (args.action !== 'check') {
        return Response.json({ ok: false, reason: 'unavailable' }, { status: 400 });
      }
      return Response.json(await this.serial(() => this.opCheck(args)));
    } catch {
      return Response.json({ ok: false, reason: 'unavailable' });
    }
  }

  private async opCheck(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const addr = typeof args.addr === 'string' ? args.addr : '';
    const bucket = typeof args.bucket === 'string' ? args.bucket : '';
    const limit = typeof args.limit === 'number' ? args.limit : NaN;
    const windowMs = typeof args.windowMs === 'number' ? args.windowMs : NaN;
    const now = typeof args.now === 'number' ? args.now : Date.now();
    if (!addr || !bucket || !Number.isFinite(limit) || !Number.isFinite(windowMs)) {
      return { ok: false, reason: 'unavailable' };
    }
    const sql = this.ctx.storage.sql as unknown as Sql;
    sql.exec('DELETE FROM hits WHERE at < ?', now - 24 * 3600 * 1000);
    const rows = sql
      .exec('SELECT at FROM hits WHERE addr = ? AND bucket = ? AND at > ?', addr, bucket, now - windowMs)
      .toArray() as Array<{ at: number }>;
    if (rows.length >= limit) return { ok: false };
    sql.exec('INSERT INTO hits (addr, bucket, at) VALUES (?, ?, ?)', addr, bucket, now);
    return { ok: true };
  }
}

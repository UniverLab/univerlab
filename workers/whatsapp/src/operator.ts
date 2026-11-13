import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { sendText, markRead, type Inbound } from './meta';
import { bogotaDateKey, formatSlot } from './schedule';
import { guardConfig, bogotaHourKey, OPERATOR_DAILY, type GuardConfig } from './guard';
import { HELP, parseCommand, shortCode } from './registry';

interface RegistryRow {
  code: string;
  phone: string;
  name: string;
  lang: string;
  kind: string;
  service: string;
  start: string | null;
  event_id: string | null;
}

export class Operator extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ensureSchema();
    });
  }

  private ensureSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS registry (
        code TEXT PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        lang TEXT NOT NULL DEFAULT 'es',
        kind TEXT NOT NULL DEFAULT 'handoff',
        service TEXT NOT NULL DEFAULT '',
        start TEXT,
        event_id TEXT,
        created_at INTEGER NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS guard (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  private guardGet(key: string): string | null {
    const rows = this.ctx.storage.sql
      .exec('SELECT value FROM guard WHERE key = ? LIMIT 1', key)
      .toArray() as Array<{ value: string }>;
    return rows.length > 0 ? rows[0].value : null;
  }

  private guardSet(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO guard (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value
    );
  }

  private guardNum(key: string): number {
    const n = Number(this.guardGet(key));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  /** Registry HTTP entry: register/release calls from Conversation objects. */
  async fetch(req: Request): Promise<Response> {
    this.ensureSchema();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false }, { status: 400 });
    }
    if (typeof body !== 'object' || body === null) {
      return Response.json({ ok: false }, { status: 400 });
    }
    const { action } = body as { action?: unknown };
    if (action === 'register') {
      const code = this.upsert(body as Record<string, unknown>);
      return Response.json({ code });
    }
    if (action === 'release') {
      const phone = (body as { phone?: unknown }).phone;
      if (typeof phone === 'string' && phone) {
        this.ctx.storage.sql.exec('DELETE FROM registry WHERE phone = ?', phone);
      }
      return Response.json({ ok: true });
    }
    if (action === 'guard') {
      return Response.json(await this.guard(body as Record<string, unknown>));
    }
    return Response.json({ ok: false }, { status: 400 });
  }

  /**
   * Worker-wide spending counters, one serialized owner so concurrent
   * messages from different numbers count exactly once. The check and the
   * increment run in the same serialized fetch: admitted calls are counted,
   * denied calls never run.
   */
  private async guard(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const cfg: GuardConfig = guardConfig(this.env);
    const now = typeof body['now'] === 'number' && Number.isFinite(body['now']) ? (body['now'] as number) : Date.now();
    const op = body['op'];
    if (op === 'model') {
      const day = bogotaDateKey(now);
      const key = 'guard:model:' + day;
      if (this.guardNum(key) >= cfg.modelsPerDay) {
        const notified = 'guard:modelNotified:' + day;
        if (!this.guardGet(notified)) {
          this.guardSet(notified, '1');
          const lang = body['lang'] === 'en' ? 'en' : 'es';
          try {
            await sendText(this.env, this.env.OPERATOR_PHONE.replace(/\D/g, ''), OPERATOR_DAILY[lang]);
          } catch {
            /* the denial stands even when the notice fails */
          }
        }
        return { ok: false };
      }
      this.guardSet(key, String(this.guardNum(key) + 1));
      return { ok: true };
    }
    if (op === 'handoff') {
      const client = typeof body['client'] === 'string' ? body['client'] : '';
      if (!client) return { ok: true };
      const key = 'guard:handoff:' + client;
      const last = this.guardNum(key);
      if (last > 0 && now - last < cfg.handoffMs) return { ok: false };
      this.guardSet(key, String(now));
      return { ok: true };
    }
    if (op === 'opmsg') {
      const key = 'guard:opmsg:' + bogotaHourKey(now);
      const n = this.guardNum(key) + 1;
      this.guardSet(key, String(n));
      return { send: n <= cfg.opMsgsPerHour, firstOver: n === cfg.opMsgsPerHour + 1, waiting: Math.max(0, n - cfg.opMsgsPerHour) };
    }
    return { ok: false };
  }

  private upsert(body: Record<string, unknown>): string {
    const phone = typeof body['phone'] === 'string' ? body['phone'] : '';
    if (!phone) return '';
    const code = shortCode(phone);
    const str = (key: string): string => (typeof body[key] === 'string' ? (body[key] as string) : '');
    // One phone keeps one row even under a short-code collision: the old row
    // goes first, then the deterministic code row is replaced.
    this.ctx.storage.sql.exec('DELETE FROM registry WHERE phone = ?', phone);
    this.ctx.storage.sql.exec(
      'INSERT INTO registry (code, phone, name, lang, kind, service, start, event_id, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(code) DO UPDATE SET phone = excluded.phone, name = excluded.name, ' +
        'lang = excluded.lang, kind = excluded.kind, service = excluded.service, ' +
        'start = excluded.start, event_id = excluded.event_id, created_at = excluded.created_at',
      code,
      phone,
      str('name'),
      str('lang') || 'es',
      str('kind') || 'handoff',
      str('service'),
      typeof body['start'] === 'string' ? (body['start'] as string) : null,
      typeof body['eventId'] === 'string' ? (body['eventId'] as string) : null,
      Date.now()
    );
    return code;
  }

  private lookup(code: string): RegistryRow | null {
    const rows = this.ctx.storage.sql
      .exec('SELECT code, phone, name, lang, kind, service, start, event_id FROM registry WHERE code = ? LIMIT 1', code)
      .toArray() as unknown as RegistryRow[];
    return rows.length > 0 ? rows[0] : null;
  }

  private async control(
    phone: string,
    action: Record<string, unknown>
  ): Promise<{ ok: boolean }> {
    try {
      const stub = this.env.CONVERSATION.get(this.env.CONVERSATION.idFromName(phone));
      const res = await stub.fetch(
        new Request('https://conversation/control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(action),
        })
      );
      const data = (await res.json()) as { ok?: unknown };
      return { ok: data.ok === true };
    } catch {
      return { ok: false };
    }
  }

  /** An operator message from OPERATOR_PHONE: a command, never a conversation. */
  async command(m: Inbound): Promise<void> {
    this.ensureSchema();
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    if (m.from !== operator) return;
    try {
      await markRead(this.env, m.id);
    } catch {
      /* ignored */
    }
    const parsed = parseCommand(m.text ?? '');
    if (!parsed) {
      await sendText(this.env, m.from, HELP);
      return;
    }
    if (parsed.cmd === 'ayuda') {
      await sendText(this.env, m.from, HELP);
      return;
    }
    if (parsed.cmd === 'pendientes') {
      await sendText(this.env, m.from, this.pendingList());
      return;
    }
    const row = this.lookup(parsed.code as string);
    if (!row) {
      await sendText(this.env, m.from, HELP);
      return;
    }
    if (parsed.cmd === 'responder') {
      const text = parsed.text as string;
      let sent = false;
      try {
        sent = await sendText(this.env, row.phone, text);
      } catch {
        sent = false;
      }
      if (!sent) {
        await sendText(this.env, m.from, 'No pude enviar el mensaje a ' + parsed.code + '.');
        return;
      }
      await this.control(row.phone, { action: 'operatorMessage', text });
      await sendText(this.env, m.from, 'Enviado a ' + parsed.code + '.');
      return;
    }
    if (parsed.cmd === 'tomar') {
      await this.control(row.phone, { action: 'take', code: row.code });
      await sendText(this.env, m.from, 'Tomado ' + row.code + ': el agente queda en pausa para ese cliente.');
      return;
    }
    if (parsed.cmd === 'soltar') {
      await this.control(row.phone, { action: 'releaseTake' });
      await sendText(this.env, m.from, 'Soltado ' + row.code + ': el agente retoma.');
      return;
    }
    const res = await this.control(row.phone, {
      action: parsed.cmd === 'confirmar' ? 'operatorConfirm' : 'operatorCancel',
    });
    if (!res.ok) {
      await sendText(
        this.env,
        m.from,
        'No pude ' +
          (parsed.cmd === 'confirmar' ? 'confirmar' : 'cancelar') +
          ' ' +
          row.code +
          '. Intenta de nuevo en un momento.'
      );
      return;
    }
    this.ctx.storage.sql.exec('DELETE FROM registry WHERE code = ?', row.code);
    await sendText(
      this.env,
      m.from,
      parsed.cmd === 'confirmar' ? 'Confirmado ' + row.code + '.' : 'Cancelado ' + row.code + '.'
    );
  }

  private pendingList(): string {
    const rows = this.ctx.storage.sql
      .exec(
        'SELECT code, phone, name, lang, kind, service, start, event_id FROM registry ORDER BY created_at ASC, rowid ASC'
      )
      .toArray() as unknown as RegistryRow[];
    if (rows.length === 0) return 'Sin pendientes.';
    return rows
      .map((r) => {
        const slot = r.start ? ' · ' + (formatSlot(r.start, 'es') || r.start) : '';
        const service = r.service ? ': ' + r.service : '';
        return '· ' + r.code + ' · ' + r.name + ' +' + r.phone + service + slot;
      })
      .join('\n');
  }
}

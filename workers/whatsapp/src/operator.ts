import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { sendText, markRead, type Inbound } from './meta';
import { formatSlot } from './schedule';
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
    return Response.json({ ok: false }, { status: 400 });
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

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { sendText, markRead, type Inbound } from './meta';
import { bogotaDateKey, formatSlot } from './schedule';
import { guardConfig, bogotaHourKey, OPERATOR_DAILY, operatorQueue, type GuardConfig } from './guard';
import { HELP, parseCommand, looksLegacy, err, type Parsed } from './commands';
import { nameBase, formatNote } from './registry';
import { modelConfig, runModel } from './brain';
import { recapPrompt, recapData, parseRecap } from './recap';

interface RegistryRow {
  name: string;
  phone: string;
  lang: string;
  kind: string;
  service: string;
  start: string | null;
  event_id: string | null;
  created_at: number;
  tag: string | null;
  priority: string | null;
}

interface Pass {
  name: string;
  phone: string;
  at: number;
}

interface QueuedNote {
  name: string;
  text: string;
  tag: string;
  priority: string;
}

type Priority = 'high' | 'normal' | 'low';

const PRIO_WORD: Record<Priority, string> = { high: 'alta', normal: 'normal', low: 'baja' };

function prioRank(p: string | null): number {
  if (p === 'high') return 0;
  if (p === 'low') return 2;
  return 1;
}

function asPriority(p: unknown): Priority {
  return p === 'high' || p === 'low' ? p : 'normal';
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
      CREATE TABLE IF NOT EXISTS conversations (
        phone TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        lang TEXT NOT NULL DEFAULT 'es',
        kind TEXT NOT NULL DEFAULT 'handoff',
        service TEXT NOT NULL DEFAULT '',
        start TEXT,
        event_id TEXT,
        created_at INTEGER NOT NULL,
        tag TEXT,
        priority TEXT
      )
    `);
    this.ctx.storage.sql.exec(`DROP TABLE IF EXISTS registry`);
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

  private getPass(): Pass | null {
    try {
      const raw = this.guardGet('pass');
      if (!raw) return null;
      const p = JSON.parse(raw) as Partial<Pass>;
      if (typeof p.name !== 'string' || !p.name || typeof p.phone !== 'string' || !p.phone) return null;
      if (typeof p.at !== 'number' || !Number.isFinite(p.at)) return null;
      return { name: p.name, phone: p.phone, at: p.at };
    } catch {
      return null;
    }
  }

  private setPass(pass: Pass | null): void {
    if (!pass) {
      this.ctx.storage.sql.exec('DELETE FROM guard WHERE key = ?', 'pass');
      return;
    }
    this.guardSet('pass', JSON.stringify(pass));
  }

  private getQueue(): QueuedNote[] {
    try {
      const raw = this.guardGet('passQueue');
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (q): q is QueuedNote =>
          typeof q === 'object' &&
          q !== null &&
          typeof (q as QueuedNote).name === 'string' &&
          typeof (q as QueuedNote).text === 'string' &&
          typeof (q as QueuedNote).tag === 'string'
      );
    } catch {
      return [];
    }
  }

  private setQueue(queue: QueuedNote[]): void {
    this.guardSet('passQueue', JSON.stringify(queue));
  }

  /** Registry HTTP entry: register/release/note calls from Conversation objects. */
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
      const name = this.upsert(body as Record<string, unknown>);
      return Response.json({ name });
    }
    if (action === 'release') {
      const phone = (body as { phone?: unknown }).phone;
      if (typeof phone === 'string' && phone) {
        this.ctx.storage.sql.exec('DELETE FROM conversations WHERE phone = ?', phone);
      }
      return Response.json({ ok: true });
    }
    if (action === 'guard') {
      return Response.json(await this.guard(body as Record<string, unknown>));
    }
    if (action === 'note') {
      await this.onNote(body as Record<string, unknown>);
      return Response.json({ ok: true });
    }
    if (action === 'passAlive') {
      const b = body as { name?: unknown; at?: unknown };
      const pass = this.getPass();
      if (pass && typeof b.name === 'string' && b.name === pass.name && typeof b.at === 'number') {
        this.setPass({ ...pass, at: b.at });
      }
      return Response.json({ ok: true });
    }
    if (action === 'passExpired') {
      const b = body as { name?: unknown };
      const pass = this.getPass();
      if (pass && typeof b.name === 'string' && b.name === pass.name) {
        await this.expirePass(Date.now(), false);
      } else if (!pass) {
        await this.flush();
      }
      return Response.json({ ok: true });
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
      // While a passthrough is open the agent sends nothing about other
      // conversations: their sends are denied here and queued as notes.
      const pass = this.getPass();
      const phone = typeof body['phone'] === 'string' ? body['phone'] : '';
      if (pass && phone && phone !== pass.phone) return { send: false, firstOver: false, waiting: 0 };
      const key = 'guard:opmsg:' + bogotaHourKey(now);
      const n = this.guardNum(key) + 1;
      this.guardSet(key, String(n));
      return { send: n <= cfg.opMsgsPerHour, firstOver: n === cfg.opMsgsPerHour + 1, waiting: Math.max(0, n - cfg.opMsgsPerHour) };
    }
    return { ok: false };
  }

  private emailLocal(email: string): string {
    const at = email.indexOf('@');
    return (at >= 0 ? email.slice(0, at) : email).trim();
  }

  private upsert(body: Record<string, unknown>): string {
    const phone = typeof body['phone'] === 'string' ? body['phone'] : '';
    if (!phone) return '';
    const str = (key: string): string => (typeof body[key] === 'string' ? (body[key] as string) : '');
    // The same phone keeps its name for the life of the stored conversation.
    const existing = this.ctx.storage.sql
      .exec('SELECT name FROM conversations WHERE phone = ? LIMIT 1', phone)
      .toArray() as Array<{ name: string }>;
    if (existing.length > 0) {
      this.ctx.storage.sql.exec(
        'UPDATE conversations SET lang = ?, kind = ?, service = ?, start = ?, event_id = ? WHERE phone = ?',
        str('lang') || 'es',
        str('kind') || 'handoff',
        str('service'),
        typeof body['start'] === 'string' ? (body['start'] as string) : null,
        typeof body['eventId'] === 'string' ? (body['eventId'] as string) : null,
        phone
      );
      return existing[0].name;
    }
    const taken = new Set(
      (
        this.ctx.storage.sql.exec('SELECT name FROM conversations').toArray() as Array<{ name: string }>
      ).map((r) => r.name)
    );
    const base = nameBase(str('name') || this.emailLocal(str('email')));
    let candidate = base;
    let i = 2;
    while (taken.has(candidate)) {
      const suffix = '-' + i;
      // Drop a hyphen the cut may leave so a suffix never reads `name--2`.
      candidate = base.slice(0, 16 - suffix.length).replace(/-+$/, '') + suffix;
      i += 1;
    }
    this.ctx.storage.sql.exec(
      'INSERT INTO conversations (phone, name, lang, kind, service, start, event_id, created_at, tag, priority) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      phone,
      candidate,
      str('lang') || 'es',
      str('kind') || 'handoff',
      str('service'),
      typeof body['start'] === 'string' ? (body['start'] as string) : null,
      typeof body['eventId'] === 'string' ? (body['eventId'] as string) : null,
      Date.now(),
      null,
      null
    );
    return candidate;
  }

  private lookup(name: string): RegistryRow | null {
    const rows = this.ctx.storage.sql
      .exec('SELECT name, phone, lang, kind, service, start, event_id, created_at, tag, priority FROM conversations WHERE name = ? LIMIT 1', name)
      .toArray() as unknown as RegistryRow[];
    return rows.length > 0 ? rows[0] : null;
  }

  private async onNote(body: Record<string, unknown>): Promise<void> {
    const name = typeof body['name'] === 'string' ? body['name'] : '';
    const text = typeof body['text'] === 'string' ? body['text'] : '';
    const tag = typeof body['tag'] === 'string' && body['tag'] ? body['tag'] : 'AVISO';
    const priority = asPriority(body['priority']);
    if (!name || !text) return;
    if (this.lookup(name)) {
      this.ctx.storage.sql.exec('UPDATE conversations SET tag = ?, priority = ? WHERE name = ?', tag, priority, name);
    }
    await this.deliver({ name, text, tag, priority });
  }

  /** One agent note toward the operator: queued while a passthrough is open. */
  private async deliver(note: QueuedNote): Promise<void> {
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    if (this.getPass()) {
      this.setQueue([...this.getQueue(), note]);
      return;
    }
    const body = formatNote(note.name, note.text, note.tag, asPriority(note.priority));
    if (note.priority === 'high') {
      // High-priority notes are never dropped by the operator-notice limits.
      try {
        await sendText(this.env, operator, body);
      } catch {
        /* the client reply below still runs */
      }
      return;
    }
    const grant = await this.guard({ op: 'opmsg', now: Date.now() });
    if (grant.send) {
      try {
        await sendText(this.env, operator, body);
      } catch {
        /* ignored */
      }
    } else if (grant.firstOver) {
      try {
        await sendText(this.env, operator, operatorQueue('es', Number(grant.waiting) || 0));
      } catch {
        /* ignored */
      }
    }
  }

  /** Queued notes go out in order, highest priority first. */
  private async flush(): Promise<void> {
    const queue = this.getQueue();
    if (queue.length === 0) return;
    this.setQueue([]);
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    const ordered = queue
      .map((q, idx) => ({ q, idx }))
      .sort((a, b) => prioRank(a.q.priority) - prioRank(b.q.priority) || a.idx - b.idx)
      .map(({ q }) => q);
    for (const note of ordered) {
      const body = formatNote(note.name, note.text, note.tag, asPriority(note.priority));
      try {
        await sendText(this.env, operator, body);
      } catch {
        /* one note never blocks the rest */
      }
    }
  }

  /**
   * Close an idle passthrough: the client notice, the queued notes, and the
   * agent takes over again. Runs before every command and on the alarm.
   */
  private async expirePass(now: number, tellConversation = true): Promise<void> {
    const pass = this.getPass();
    if (!pass) return;
    const idle = guardConfig(this.env).passthroughIdleMs;
    if (!(now >= pass.at + idle)) return;
    this.setPass(null);
    try {
      await this.ctx.storage.deleteAlarm();
    } catch {
      /* an alarm that is not there needs no clearing */
    }
    if (tellConversation) {
      await this.control(pass.phone, { action: 'releaseTake' });
    }
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    try {
      await sendText(this.env, operator, '[' + pass.name + '] liberada por inactividad');
    } catch {
      /* the queued notes below still follow */
    }
    await this.flush();
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

  private async controlData<T>(phone: string, action: Record<string, unknown>): Promise<T | null> {
    try {
      const stub = this.env.CONVERSATION.get(this.env.CONVERSATION.idFromName(phone));
      const res = await stub.fetch(
        new Request('https://conversation/control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(action),
        })
      );
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  async alarm(): Promise<void> {
    this.ensureSchema();
    await this.expirePass(Date.now());
    const pass = this.getPass();
    if (pass) {
      const idle = guardConfig(this.env).passthroughIdleMs;
      try {
        await this.ctx.storage.setAlarm(pass.at + idle);
      } catch {
        /* without an alarm the next command still expires the pass */
      }
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
    await this.expirePass(Date.now());
    const text = m.text ?? '';
    const parsed: Parsed | null = parseCommand(text);
    if (!parsed) {
      if (looksLegacy(text)) {
        await sendText(this.env, m.from, HELP);
        return;
      }
      // Anything that reads as a command is answered here, even while a
      // passthrough is open: a command never reaches the client.
      if (text.trim().startsWith('/')) {
        await sendText(this.env, m.from, err('No reconozco ese comando.'));
        return;
      }
      // Plain operator text outside a passthrough has nowhere to go.
      const pass = this.getPass();
      if (pass && text.trim()) {
        await this.relayToPass(m.from, pass, text);
        return;
      }
      await sendText(this.env, m.from, HELP);
      return;
    }
    if (parsed.cmd === 'help') {
      await sendText(this.env, m.from, HELP);
      return;
    }
    if (parsed.cmd === 'recap' && !parsed.name) {
      await sendText(this.env, m.from, await this.recapList(Date.now()));
      return;
    }
    if (parsed.cmd === 'recap' && parsed.name) {
      await this.recapOne(m.from, parsed.name);
      return;
    }
    if (parsed.cmd === 'release') {
      await this.releasePass(m.from);
      return;
    }
    const row = this.lookup(parsed.name as string);
    if (!row) {
      await sendText(this.env, m.from, err('No hay conversación abierta con [' + (parsed.name as string) + '].'));
      return;
    }
    if (parsed.cmd === 'response') {
      const body = parsed.text as string;
      let sent = false;
      try {
        sent = await sendText(this.env, row.phone, body);
      } catch {
        sent = false;
      }
      if (!sent) {
        await sendText(this.env, m.from, 'No pude enviar el mensaje a [' + row.name + '].');
        return;
      }
      // The agent stays in charge: it keeps answering and may hand off again.
      await this.control(row.phone, { action: 'operatorMessage', text: body });
      await sendText(this.env, m.from, 'Enviado a [' + row.name + '].');
      return;
    }
    if (parsed.cmd === 'take') {
      const pass = this.getPass();
      if (pass) {
        await sendText(this.env, m.from, 'Ya está abierto [' + pass.name + ']. Usa /release.');
        return;
      }
      const at = Date.now();
      this.setPass({ name: row.name, phone: row.phone, at });
      try {
        await this.ctx.storage.setAlarm(at + guardConfig(this.env).passthroughIdleMs);
      } catch {
        /* without an alarm the next command still expires the pass */
      }
      const opened = await this.control(row.phone, { action: 'take', name: row.name });
      if (!opened.ok) {
        // No silent half-open passthrough: without the conversation side the
        // agent would keep answering while the operator thinks it is taken.
        this.setPass(null);
        try {
          await this.ctx.storage.deleteAlarm();
        } catch {
          /* an alarm that is not there needs no clearing */
        }
        await sendText(this.env, m.from, 'No pude abrir [' + row.name + ']. Intenta de nuevo en un momento.');
        return;
      }
      await sendText(this.env, m.from, 'Abierto [' + row.name + ']: lo que escribas (que no sea un comando) va al cliente.');
      return;
    }
    if (parsed.cmd === 'delivery') {
      const delivered = await this.controlData<{ ok?: unknown; already?: unknown }>(row.phone, {
        action: 'operatorDelivery',
        phone: row.phone,
        name: row.name,
        lang: row.lang,
      });
      if (!delivered || delivered.ok !== true) {
        await sendText(this.env, m.from, err('No pude autorizar la entrega de [' + row.name + '].'));
        return;
      }
      // The authorisation stays open: the row is only released by a cancel.
      if (delivered.already === true) {
        await sendText(this.env, m.from, '[' + row.name + '] ya tiene su entrega agendada.');
        return;
      }
      await sendText(this.env, m.from, 'Entrega autorizada para [' + row.name + '].');
      return;
    }
    const res = await this.control(row.phone, {
      action: parsed.cmd === 'confirm' ? 'operatorConfirm' : 'operatorCancel',
    });
    if (!res.ok) {
      await sendText(
        this.env,
        m.from,
        'No pude ' +
          (parsed.cmd === 'confirm' ? 'confirmar' : 'cancelar') +
          ' [' +
          row.name +
          ']. Intenta de nuevo en un momento.'
      );
      return;
    }
    this.ctx.storage.sql.exec('DELETE FROM conversations WHERE name = ?', row.name);
    await sendText(
      this.env,
      m.from,
      parsed.cmd === 'confirm' ? 'Confirmado [' + row.name + '].' : 'Cancelado [' + row.name + '].'
    );
  }

  /** Plain operator text while a passthrough is open goes to the client as is. */
  private async relayToPass(operator: string, pass: Pass, text: string): Promise<void> {
    let sent = false;
    try {
      sent = await sendText(this.env, pass.phone, text);
    } catch {
      sent = false;
    }
    if (!sent) {
      await sendText(this.env, operator, 'No pude enviar el mensaje a [' + pass.name + '].');
      return;
    }
    // Storing the message restarts the idle clock on the conversation side.
    await this.control(pass.phone, { action: 'operatorMessage', text });
    this.setPass({ ...pass, at: Date.now() });
  }

  private async releasePass(operator: string): Promise<void> {
    const pass = this.getPass();
    if (!pass) {
      await sendText(this.env, operator, err('No hay ningún directo abierto.'));
      return;
    }
    const released = await this.control(pass.phone, { action: 'releaseTake' });
    if (!released.ok) {
      // The conversation still relays: keeping the pass open matches it.
      await sendText(this.env, operator, 'No pude liberar [' + pass.name + ']. Intenta de nuevo en un momento.');
      return;
    }
    this.setPass(null);
    try {
      await this.ctx.storage.deleteAlarm();
    } catch {
      /* an alarm that is not there needs no clearing */
    }
    await sendText(this.env, operator, 'Liberado [' + pass.name + ']: el agente retoma.');
    await this.flush();
  }

  private async recapList(now: number): Promise<string> {
    const rows = this.ctx.storage.sql
      .exec(
        'SELECT name, phone, lang, kind, service, start, event_id, created_at, tag, priority FROM conversations ORDER BY created_at ASC, rowid ASC'
      )
      .toArray() as unknown as RegistryRow[];
    if (rows.length === 0) return 'Sin conversaciones abiertas.';
    const enriched = await Promise.all(
      rows.map(async (r) => {
        const data = await this.controlData<{ lastAt?: unknown; phase?: unknown }>(r.phone, { action: 'summary' });
        const lastAt = typeof data?.lastAt === 'number' && Number.isFinite(data.lastAt) ? data.lastAt : null;
        const phase = typeof data?.phase === 'string' && data.phase ? data.phase : null;
        return { r, lastAt, phase };
      })
    );
    enriched.sort(
      (a, b) => prioRank(a.r.priority) - prioRank(b.r.priority) || a.r.created_at - b.r.created_at
    );
    return enriched
      .map(({ r, lastAt, phase }) => {
        const ago = lastAt === null ? '—' : 'hace ' + Math.max(0, Math.floor((now - lastAt) / 60000)) + ' min';
        const slot = r.start ? ' · ' + (formatSlot(r.start, 'es') || r.start) : '';
        const booking = phase ? ' · ' + phase : '';
        const tag = r.tag ?? '—';
        const prio = r.priority ? PRIO_WORD[asPriority(r.priority)] : '—';
        return '· [' + r.name + '] ' + tag + ' · ' + prio + ' · ' + ago + booking + slot;
      })
      .join('\n');
  }

  private async recapOne(operator: string, name: string): Promise<void> {
    const row = this.lookup(name);
    if (!row) {
      await sendText(this.env, operator, err('No hay conversación abierta con [' + name + '].'));
      return;
    }
    const data = await this.controlData<{ turns?: unknown; last?: unknown }>(row.phone, { action: 'recapData' });
    const turns = Array.isArray(data?.turns)
      ? (data.turns as Array<{ role?: unknown; text?: unknown }>)
          .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
          .map((t) => ({ role: t.role as 'user' | 'assistant', text: t.text as string }))
      : [];
    const last = typeof data?.last === 'string' && data.last ? data.last : '';
    // The recap is an internal model call: it never runs past the daily
    // limit, and it never goes through the operator-message path.
    const granted = await this.guard({ op: 'model', now: Date.now(), lang: 'es' });
    if (!granted.ok) {
      await sendText(this.env, operator, 'No pude generar el resumen de [' + name + '] ahora, intenta de nuevo en un momento.');
      return;
    }
    try {
      const ai = this.env.AI;
      const raw = await runModel(
        { run: ai.run.bind(ai) } as never,
        modelConfig(this.env),
        [
          { role: 'system', content: recapPrompt() },
          { role: 'user', content: recapData(turns) },
        ],
        800
      );
      await sendText(this.env, operator, parseRecap(raw, last));
    } catch {
      await sendText(this.env, operator, 'No pude generar el resumen de [' + name + '] ahora, intenta de nuevo en un momento.');
    }
  }
}

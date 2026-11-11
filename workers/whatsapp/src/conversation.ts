import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { markRead, sendText, type Inbound } from './meta';
import { answer, FALLBACK, modelConfig, type Turn } from './brain';
import {
  brief,
  CONFIRM_SLOT,
  formatBrief,
  intake,
  INTAKE_ASK,
  INTAKE_FOLLOWUP,
  type IntakeState,
} from './intake';
import { detectLang, type Lang } from './lang';
import { alarmAt, deletionRequest, ERASED, operatorErased } from './erase';

export const NON_TEXT = {
  es: 'Por ahora solo leo mensajes de texto. Le paso esto a una persona del laboratorio.',
  en: 'For now I only read text messages. I am passing this to someone at the lab.',
};

export class Conversation extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ensureSchema();
    });
  }

  private ensureSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        role TEXT NOT NULL,
        type TEXT NOT NULL,
        text TEXT,
        media_id TEXT
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS briefs (
        id INTEGER PRIMARY KEY,
        at INTEGER NOT NULL,
        phone TEXT NOT NULL,
        name TEXT NOT NULL,
        lang TEXT NOT NULL,
        service TEXT NOT NULL,
        bullets TEXT NOT NULL
      )
    `);
  }

  private state(key: string): string | null;
  private state(key: string, value: string | null): void;
  private state(key: string, value?: string | null): string | null | void {
    if (value === undefined) {
      const rows = this.ctx.storage.sql
        .exec('SELECT value FROM state WHERE key = ? LIMIT 1', key)
        .toArray() as Array<{ value: string }>;
      return rows.length > 0 ? rows[0].value : null;
    }
    if (value === null) {
      this.ctx.storage.sql.exec('DELETE FROM state WHERE key = ?', key);
    } else {
      this.ctx.storage.sql.exec(
        'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value
      );
    }
  }

  private briefs(
    id: number,
    at: number,
    phone: string,
    name: string,
    lang: string,
    service: string,
    bullets: string
  ): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO briefs (id, at, phone, name, lang, service, bullets) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET at = excluded.at, phone = excluded.phone, name = excluded.name, ' +
        'lang = excluded.lang, service = excluded.service, bullets = excluded.bullets',
      id,
      at,
      phone,
      name,
      lang,
      service,
      bullets
    );
  }

  private storeAssistant(at: number, id: string, text: string): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO messages (id, at, role, type, text, media_id) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      at,
      'assistant',
      'text',
      text,
      null
    );
  }

  private async erase(m: Inbound, lang: Lang): Promise<void> {
    const handedOff = this.state('handoff') !== null;
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    try {
      await markRead(this.env, m.id);
    } catch {
      /* ignored */
    }
    await sendText(this.env, m.from, ERASED[lang]);
    if (handedOff && m.from !== operator) {
      try {
        await sendText(this.env, operator, operatorErased(m.from));
      } catch {
        /* ignored */
      }
    }
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
  }

  private async finishBooking(m: Inbound, st: IntakeState): Promise<void> {
    this.state('handoff', '1');
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    const b = await brief(this.env.AI, st, modelConfig(this.env));
    this.briefs(1, m.timestamp, m.from, m.name ?? '', st.lang, st.service, JSON.stringify(b.bullets));
    const note = formatBrief({
      name: m.name ?? '',
      phone: m.from,
      lang: st.lang,
      service: st.service,
      bullets: b.bullets,
    });
    await sendText(this.env, operator, note);
    const confirm = CONFIRM_SLOT[st.lang];
    await sendText(this.env, m.from, confirm);
    this.storeAssistant(m.timestamp, 'a-' + m.id + '-confirm', confirm);
    this.state('intake', null);
  }

  async receive(m: Inbound): Promise<void> {
    this.ensureSchema();
    if (m.type === 'text') {
      const erased = deletionRequest(m.text ?? '');
      if (erased) {
        await this.erase(m, erased);
        return;
      }
    }
    const existing = this.ctx.storage.sql
      .exec('SELECT 1 FROM messages WHERE id = ? LIMIT 1', m.id)
      .toArray();
    if (existing.length > 0) return;
    this.ctx.storage.sql.exec(
      'INSERT INTO messages (id, at, role, type, text, media_id) VALUES (?, ?, ?, ?, ?, ?)',
      m.id,
      m.timestamp,
      'user',
      m.type,
      m.text ?? null,
      m.mediaId ?? null
    );
    await this.ctx.storage.setAlarm(alarmAt(m.timestamp));
    await markRead(this.env, m.id);
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    if (m.from === operator) return;
    if (m.type === 'text') {
      const lang = detectLang(m.text ?? '');
      const saved = this.state('intake');
      if (saved) {
        const st = JSON.parse(saved) as IntakeState;
        const res = await intake(this.env.AI, st, m.text ?? '', modelConfig(this.env));
        if (res.status === 'handoff') {
          this.state('intake', null);
          const fallback = FALLBACK[lang];
          await sendText(this.env, m.from, fallback);
          this.storeAssistant(m.timestamp, 'a-' + m.id, fallback);
          await this.notify(m);
          return;
        }
        st.answers.push((m.text ?? '').slice(0, 500));
        st.answers = st.answers.slice(-8);
        if (res.status === 'more' && st.asks < 2) {
          const follow = res.reply || INTAKE_FOLLOWUP[st.lang];
          await sendText(this.env, m.from, follow);
          this.storeAssistant(m.timestamp, 'a-' + m.id, follow);
          st.asks += 1;
          this.state('intake', JSON.stringify(st));
          return;
        }
        await this.finishBooking(m, st);
        return;
      }
      const rows = this.ctx.storage.sql
        .exec('SELECT role, text FROM messages WHERE text IS NOT NULL ORDER BY rowid DESC LIMIT 12')
        .toArray() as Array<{ role: string; text: string }>;
      const history = rows
        .reverse()
        .map((r) => ({ role: r.role as Turn['role'], text: r.text }));
      const a = await answer(this.env.AI, history, lang, modelConfig(this.env));
      if (a.booking) {
        const ask = INTAKE_ASK[lang];
        await sendText(this.env, m.from, ask);
        this.storeAssistant(m.timestamp, 'a-' + m.id, ask);
        const st: IntakeState = {
          lang,
          service: a.service,
          opening: (m.text ?? '').slice(0, 500),
          answers: [],
          asks: 1,
        };
        this.state('intake', JSON.stringify(st));
        return;
      }
      await sendText(this.env, m.from, a.reply);
      this.storeAssistant(m.timestamp, 'a-' + m.id, a.reply);
      if (a.handoff) await this.notify(m);
    } else {
      this.state('intake', null);
      const lang = 'es' as const;
      await sendText(this.env, m.from, NON_TEXT[lang]);
      this.storeAssistant(m.timestamp, 'a-' + m.id, NON_TEXT[lang]);
      await this.notify(m);
    }
  }

  private async notify(m: Inbound): Promise<void> {
    this.state('handoff', '1');
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    const text = (
      'UniverLab · ' + (m.name ? m.name + ' ' : '') + '+' + m.from + ': ' + (m.text ?? '[' + m.type + ']')
    ).slice(0, 900);
    try {
      await sendText(this.env, operator, text);
    } catch {
      /* ignored */
    }
  }
}


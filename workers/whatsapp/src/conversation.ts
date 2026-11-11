import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { markRead, sendText, type Inbound } from './meta';
import { answer, modelConfig, type Turn } from './brain';
import { detectLang } from './lang';

export const NON_TEXT = {
  es: 'Por ahora solo leo mensajes de texto. Le paso esto a una persona del laboratorio.',
  en: 'For now I only read text messages. I am passing this to someone at the lab.',
};

export class Conversation extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
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
    });
  }

  async receive(m: Inbound): Promise<void> {
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
    await markRead(this.env, m.id);
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    if (m.from === operator) return;
    if (m.type === 'text') {
      const rows = this.ctx.storage.sql
        .exec('SELECT role, text FROM messages WHERE text IS NOT NULL ORDER BY rowid DESC LIMIT 12')
        .toArray() as Array<{ role: string; text: string }>;
      const history = rows
        .reverse()
        .map((r) => ({ role: r.role as Turn['role'], text: r.text }));
      const lang = detectLang(m.text ?? '');
      const a = await answer(this.env.AI, history, lang, modelConfig(this.env));
      await sendText(this.env, m.from, a.reply);
      this.ctx.storage.sql.exec(
        'INSERT INTO messages (id, at, role, type, text, media_id) VALUES (?, ?, ?, ?, ?, ?)',
        'a-' + m.id,
        m.timestamp,
        'assistant',
        'text',
        a.reply,
        null
      );
      if (a.handoff) await this.notify(m);
    } else {
      const lang = 'es' as const;
      await sendText(this.env, m.from, NON_TEXT[lang]);
      this.ctx.storage.sql.exec(
        'INSERT INTO messages (id, at, role, type, text, media_id) VALUES (?, ?, ?, ?, ?, ?)',
        'a-' + m.id,
        m.timestamp,
        'assistant',
        'text',
        NON_TEXT[lang],
        null
      );
      await this.notify(m);
    }
  }

  private async notify(m: Inbound): Promise<void> {
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

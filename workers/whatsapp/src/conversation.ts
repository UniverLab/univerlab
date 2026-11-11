import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { markRead, sendText, type Inbound } from './meta';

export const ACK =
  'Hola, soy el asistente de UniverLab. Recibí tu mensaje; en breve te responde una persona del laboratorio.';

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
    const before = this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM messages').toArray() as Array<{
      n: number;
    }>;
    const count = before.length > 0 ? before[0].n : 0;
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
    if (count === 0) {
      await sendText(this.env, m.from, ACK);
      this.ctx.storage.sql.exec(
        'INSERT INTO messages (id, at, role, type, text, media_id) VALUES (?, ?, ?, ?, ?, ?)',
        'ack-' + m.id,
        m.timestamp,
        'assistant',
        'text',
        ACK,
        null
      );
    }
  }
}

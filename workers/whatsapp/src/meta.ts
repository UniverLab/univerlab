export const GRAPH = 'https://graph.facebook.com/v25.0';

function hexOf(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifySignature(
  body: string,
  header: string | null,
  appSecret: string
): Promise<boolean> {
  if (header === null || !header.startsWith('sha256=')) return false;
  const given = header.slice(7);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const computed = hexOf(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  if (computed.length !== given.length) return false;
  let diff = 0;
  const n = Math.max(computed.length, given.length);
  for (let i = 0; i < n; i++) {
    diff |= computed.charCodeAt(i % computed.length) ^ given.charCodeAt(i % given.length);
  }
  return diff === 0;
}

export interface Inbound {
  id: string;
  from: string;
  name?: string;
  timestamp: number;
  type: string;
  text?: string;
  mediaId?: string;
  mime?: string;
  duration?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const MEDIA_KEYS = ['image', 'audio', 'video', 'document', 'sticker'];

export function parseInbound(payload: unknown): Inbound[] {
  try {
    if (!isPlainObject(payload)) return [];
    const entries = payload['entry'];
    if (!Array.isArray(entries)) return [];
    const out: Inbound[] = [];
    for (const entry of entries) {
      if (!isPlainObject(entry)) continue;
      const changes = entry['changes'];
      if (!Array.isArray(changes)) continue;
      for (const change of changes) {
        if (!isPlainObject(change)) continue;
        const value = change['value'];
        if (!isPlainObject(value)) continue;
        const messages = value['messages'];
        if (!Array.isArray(messages)) continue;
        const contacts = Array.isArray(value['contacts']) ? value['contacts'] : [];
        for (const msg of messages) {
          if (!isPlainObject(msg)) continue;
          const { id, from, type } = msg as Record<string, unknown>;
          if (typeof id !== 'string' || !id || typeof from !== 'string' || !from) continue;
          if (typeof type !== 'string' || !type) continue;
          const inbound: Inbound = {
            id,
            from,
            type,
            timestamp: Number((msg as Record<string, unknown>)['timestamp']) || 0,
          };
          const text = (msg as Record<string, unknown>)['text'];
          if (isPlainObject(text) && typeof text['body'] === 'string') {
            inbound.text = text['body'] as string;
          }
          for (const key of MEDIA_KEYS) {
            const media = (msg as Record<string, unknown>)[key];
            if (isPlainObject(media) && typeof media['id'] === 'string') {
              inbound.mediaId = media['id'] as string;
              if (typeof media['mime_type'] === 'string') inbound.mime = media['mime_type'] as string;
              const duration = media['duration'];
              if (typeof duration === 'number' && Number.isFinite(duration)) {
                inbound.duration = duration;
              } else if (typeof duration === 'string' && duration.trim() !== '') {
                const parsed = Number(duration);
                if (Number.isFinite(parsed)) inbound.duration = parsed;
              }
              break;
            }
          }
          const contact = contacts.find(
            (c): c is Record<string, unknown> => isPlainObject(c) && c['wa_id'] === from
          );
          if (contact) {
            const profile = contact['profile'];
            if (isPlainObject(profile) && typeof profile['name'] === 'string') {
              inbound.name = profile['name'] as string;
            }
          }
          out.push(inbound);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

interface SendEnv {
  WA_ACCESS_TOKEN: string;
  WA_PHONE_NUMBER_ID: string;
}

export async function sendText(env: SendEnv, to: string, body: string): Promise<boolean> {
  const res = await fetch(`${GRAPH}/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  return res.ok;
}

async function postRead(env: SendEnv, messageId: string, withTyping: boolean): Promise<boolean> {
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };
  if (withTyping) body.typing_indicator = { type: 'text' };
  const res = await fetch(`${GRAPH}/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function markRead(env: SendEnv, messageId: string): Promise<boolean> {
  // The typing indicator rides on the read receipt when the Cloud API offers
  // it. When the API rejects the field, the plain receipt is retried so the
  // message is still marked as read and nothing changes for the client.
  try {
    if (await postRead(env, messageId, true)) return true;
  } catch {
    return false;
  }
  try {
    return await postRead(env, messageId, false);
  } catch {
    return false;
  }
}

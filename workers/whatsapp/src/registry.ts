import type { Env } from './env';
import { cleanName, sendText } from './meta';

/**
 * A conversation's short name: the client's cleaned profile name (or the
 * local part of a web booking email) lowercased, without accents, spaces as
 * hyphens, at most 16 characters. Another open conversation already using it
 * gets `-2`, `-3` and so on; the name is stable for the stored conversation
 * and released when the conversation is erased.
 */
export function nameBase(raw: string): string {
  const emailLocal = raw.includes('@') ? raw.split('@')[0] : raw;
  const base = cleanName(emailLocal)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-')
    .slice(0, 16)
    .replace(/^-+|-+$/g, '');
  return base || 'cliente';
}

export type RegistryAction =
  | {
      action: 'register';
      phone: string;
      name: string;
      lang: string;
      kind: 'handoff' | 'hold';
      service: string;
      start?: string;
      eventId?: string;
      email?: string;
    }
  | { action: 'release'; phone: string };

/** POST an action to the Operator registry; {name:''} when unavailable. */
export async function registryCall(env: Env, req: RegistryAction): Promise<{ name: string }> {
  try {
    const ns = env.REGISTRY;
    if (!ns) return { name: '' };
    const stub = ns.get(ns.idFromName('operator'));
    const res = await stub.fetch(
      new Request('https://registry/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      })
    );
    const data = (await res.json()) as { name?: unknown };
    return { name: typeof data.name === 'string' ? data.name : '' };
  } catch {
    return { name: '' };
  }
}

export interface RegisterInput {
  phone: string;
  name: string;
  lang: string;
  kind: 'handoff' | 'hold';
  service: string;
  start?: string;
  eventId?: string;
  email?: string;
}

/** Register a client; falls back to the local name when no registry binds. */
export async function register(env: Env, input: RegisterInput): Promise<string> {
  const { name } = await registryCall(env, { action: 'register', ...input });
  if (name) return name;
  return nameBase(input.name || input.email || '');
}

/** Drop a client from the registry; a no-op when no registry binds. */
export async function release(env: Env, phone: string): Promise<void> {
  await registryCall(env, { action: 'release', phone });
}

export interface NoteInput {
  name: string;
  text: string;
  tag: string;
  priority: 'high' | 'normal' | 'low';
}

const PRIO_WORD: Record<NoteInput['priority'], string> = { high: 'alta', normal: 'normal', low: 'baja' };

/** Every agent note starts with the conversation's name, the tag and the priority. */
export function formatNote(name: string, text: string, tag: string, priority: NoteInput['priority']): string {
  return '[' + name + '] ' + tag + ' · ' + PRIO_WORD[priority] + '\n' + text;
}

/** Post one agent note toward the operator; never throws. */
export async function postNote(env: Env, input: NoteInput): Promise<void> {
  if (!input.name) return;
  try {
    const ns = env.REGISTRY;
    if (!ns) {
      // No registry binds (tests, a degraded deploy): deliver straight to
      // the operator in the same shape instead of dropping the note.
      const operator = (env.OPERATOR_PHONE ?? '').replace(/\D/g, '');
      if (!operator) return;
      await sendText(env, operator, formatNote(input.name, input.text, input.tag, input.priority));
      return;
    }
    const stub = ns.get(ns.idFromName('operator'));
    await stub.fetch(
      new Request('https://registry/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'note', ...input }),
      })
    );
  } catch {
    /* the note is best effort */
  }
}

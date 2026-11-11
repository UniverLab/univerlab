import type { Env } from './env';

/** Short client code: the phone digits modulo 36^4, as 4 base-36 chars. */
export function shortCode(phone: string): string {
  const digits = phone.replace(/\D/g, '') || '0';
  const mod = Number(BigInt(digits) % BigInt(36 ** 4));
  return mod.toString(36).padStart(4, '0');
}

export type CommandName =
  | 'ayuda'
  | 'pendientes'
  | 'responder'
  | 'tomar'
  | 'soltar'
  | 'confirmar'
  | 'cancelar';

export interface ParsedCommand {
  cmd: CommandName;
  code?: string;
  text?: string;
}

function normWord(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const WORDS: Record<string, CommandName> = {
  ayuda: 'ayuda',
  help: 'ayuda',
  pendientes: 'pendientes',
  pending: 'pendientes',
  responder: 'responder',
  reply: 'responder',
  tomar: 'tomar',
  take: 'tomar',
  soltar: 'soltar',
  release: 'soltar',
  confirmar: 'confirmar',
  confirm: 'confirmar',
  cancelar: 'cancelar',
  cancel: 'cancelar',
};

function normCode(raw: string): string | null {
  const code = normWord(raw);
  return /^[0-9a-z]{4}$/.test(code) ? code : null;
}

/** Parse an operator command; null means unknown or malformed (gets HELP). */
export function parseCommand(text: string): ParsedCommand | null {
  const parts = (text ?? '').trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const cmd = WORDS[normWord(parts[0])];
  if (!cmd) return null;
  if (cmd === 'ayuda' || cmd === 'pendientes') {
    return parts.length === 1 ? { cmd } : null;
  }
  if (cmd === 'responder') {
    if (parts.length < 3) return null;
    const code = normCode(parts[1]);
    if (!code) return null;
    const body = parts.slice(2).join(' ').trim();
    if (!body) return null;
    return { cmd, code, text: body };
  }
  if (parts.length !== 2) return null;
  const code = normCode(parts[1]);
  return code ? { cmd, code } : null;
}

export const HELP =
  'Comandos:\n' +
  '· ayuda — muestra esta lista\n' +
  '· pendientes — handoffs y apartados abiertos\n' +
  '· responder <código> <texto> — escribe al cliente\n' +
  '· tomar <código> — pausas el agente para ese cliente\n' +
  '· soltar <código> — el agente retoma\n' +
  '· confirmar <código> — confirma el apartado\n' +
  '· cancelar <código> — cancela la cita';

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
    }
  | { action: 'release'; phone: string };

/** POST an action to the Operator registry; {code:''} when unavailable. */
export async function registryCall(env: Env, req: RegistryAction): Promise<{ code: string }> {
  try {
    const ns = env.REGISTRY;
    if (!ns) return { code: '' };
    const stub = ns.get(ns.idFromName('operator'));
    const res = await stub.fetch(
      new Request('https://registry/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      })
    );
    const data = (await res.json()) as { code?: unknown };
    return { code: typeof data.code === 'string' ? data.code : '' };
  } catch {
    return { code: '' };
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
}

/** Register a client; falls back to the local code when no registry binds. */
export async function register(env: Env, input: RegisterInput): Promise<string> {
  const { code } = await registryCall(env, { action: 'register', ...input });
  return code || shortCode(input.phone);
}

/** Drop a client from the registry; a no-op when no registry binds. */
export async function release(env: Env, phone: string): Promise<void> {
  await registryCall(env, { action: 'release', phone });
}

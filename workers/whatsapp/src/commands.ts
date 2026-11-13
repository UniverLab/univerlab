/** The operator's command language: English slash commands, one live
 *  conversation at a time. Anything else gets the help text. */

export type Cmd = 'help' | 'recap' | 'response' | 'take' | 'release' | 'confirm' | 'cancel' | 'delivery';

export interface Parsed {
  cmd: Cmd;
  name?: string;
  text?: string;
}

export const HELP =
  '/help — muestra esta lista\n' +
  '/recap [nombre] — abiertas, o el resumen de una conversación\n' +
  '/response <nombre> <texto> — envía ese texto al cliente una vez\n' +
  '/take <nombre> — abres el directo con ese cliente\n' +
  '/release — cierras el directo y el agente retoma\n' +
  '/confirm <nombre> — confirma su consulta en espera\n' +
  '/cancel <nombre> — cancela su cita\n' +
  '/delivery <nombre> — autoriza su sesión de entrega';

function normWord(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** A conversation name travels lowercased and without accents. */
export function normName(raw: string): string {
  return normWord(raw);
}

const NAMES: Record<string, Cmd> = {
  help: 'help',
  recap: 'recap',
  response: 'response',
  take: 'take',
  release: 'release',
  confirm: 'confirm',
  cancel: 'cancel',
  delivery: 'delivery',
};

/** Words of the retired language: they are no longer commands and get HELP. */
const LEGACY = new Set(['ayuda', 'pendientes', 'responder', 'tomar', 'soltar', 'confirmar', 'cancelar']);

export function looksLegacy(text: string): boolean {
  const parts = (text ?? '').trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0 || parts[0].startsWith('/')) return false;
  return LEGACY.has(normWord(parts[0]));
}

function validName(raw: string): string | null {
  const name = normName(raw);
  return /^[a-z0-9-]{1,32}$/.test(name) ? name : null;
}

/** Parse an operator command; null means unknown or malformed (gets HELP). */
export function parseCommand(text: string): Parsed | null {
  const raw = (text ?? '').trim();
  if (!raw.startsWith('/')) return null;
  const parts = raw.slice(1).split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const cmd = NAMES[normWord(parts[0])];
  if (!cmd) return null;
  const rest = parts.slice(1);
  if (cmd === 'help' || cmd === 'release') {
    return rest.length === 0 ? { cmd } : null;
  }
  if (cmd === 'recap') {
    if (rest.length === 0) return { cmd };
    if (rest.length === 1) {
      const name = validName(rest[0]);
      return name ? { cmd, name } : null;
    }
    return null;
  }
  if (cmd === 'response') {
    // The body is everything after the name, line breaks included: what the
    // operator typed is what the client receives.
    const afterCmd = raw.slice(1 + parts[0].length).trimStart();
    const spaceAt = afterCmd.search(/\s/);
    if (spaceAt <= 0) return null;
    const name = validName(afterCmd.slice(0, spaceAt));
    if (!name) return null;
    const body = afterCmd.slice(spaceAt).trim();
    if (!body) return null;
    return { cmd, name, text: body };
  }
  if (rest.length !== 1) return null;
  const name = validName(rest[0]);
  return name ? { cmd, name } : null;
}

/** One line saying what was wrong, pointing at /help. */
export function err(why: string): string {
  return why + ' · /help';
}

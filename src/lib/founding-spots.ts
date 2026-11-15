// The founding-audit places left: total 5, kept in Cloudflare KV so the
// operator can change it without a deploy. One module for every reader:
// the site (functions/founding-spots.ts), the announcements worker and the
// WhatsApp worker share the key, the total, the parsing and the fetch.

/** How many founding audits exist in total; the copy names this number. */
export const FOUNDING_TOTAL = 5;

/** KV key holding how many founding places are left, as a plain integer. */
export const FOUNDING_KV_KEY = 'founding-audits-left';

/** Public read of the live count, served by the announcements worker. */
export const FOUNDING_API = 'https://announcements.univerlab.org/founding-spots';

/** A KV-like reader: only `get` is needed, so workers pass their binding. */
export interface FoundingKv {
  get(key: string): Promise<string | null>;
}

/** A KV-like writer for the operator command. */
export interface FoundingKvWriter {
  put(key: string, value: string): Promise<unknown>;
}

/** Parse a stored or served value: an integer 0..FOUNDING_TOTAL, else null. */
export function parseFoundingLeft(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 0 && raw <= FOUNDING_TOTAL ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = parseInt(trimmed, 10);
  return n >= 0 && n <= FOUNDING_TOTAL ? n : null;
}

/** Read the live count from KV; null when missing or unreadable. */
export async function readFoundingLeft(kv: FoundingKv | undefined | null): Promise<number | null> {
  if (!kv) return null;
  try {
    return parseFoundingLeft(await kv.get(FOUNDING_KV_KEY));
  } catch {
    return null;
  }
}

/** Store the live count in KV. The operator validates the range first. */
export async function writeFoundingLeft(kv: FoundingKvWriter, left: number): Promise<void> {
  await kv.put(FOUNDING_KV_KEY, String(left));
}

/** Format the live count line in both languages, given the template. */
export function formatFoundingLeft(template: string, left: number): string {
  return template.replace('{n}', String(left)).replace('{total}', String(FOUNDING_TOTAL));
}

/** A fetch option carrying the workers-only edge-cache hint. */
type FetchInitWithCache = RequestInit & { cf?: { cacheTtl: number } };

/** Fetch the live count from the announcements API at view time: a GET
 *  cached 60 s at the edge with a 1.5 s deadline. Returns an integer
 *  0..FOUNDING_TOTAL, or null when it cannot be read — the page then shows
 *  the founding offer with no number rather than a wrong one. */
export async function fetchFoundingLeft(fetchImpl: typeof fetch): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const init: FetchInitWithCache = { cf: { cacheTtl: 60 }, signal: ctrl.signal };
    const res = await fetchImpl(FOUNDING_API, init);
    if (!res.ok) return null;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return null;
    }
    const left = (body as { left?: unknown } | null)?.left;
    return parseFoundingLeft(left);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

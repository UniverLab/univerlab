import type { Env } from './env';
import type { Lang } from './lang';
import { bogotaDateKey, bogotaParts } from './schedule';

/** How much one number and all numbers together may spend, in counters. */
export interface GuardConfig {
  /** Answered bursts per rolling 60 minutes, per number. */
  burstsPerHour: number;
  /** Answered bursts per Bogota calendar day, per number. */
  burstsPerDay: number;
  /** Voice transcriptions per Bogota calendar day, per number. */
  voicePerDay: number;
  /** Receipt readings per hold, per number. */
  proofsPerHold: number;
  /** Client text reaching any model per burst, in characters. */
  burstChars: number;
  /** Client text reaching any model per history turn, in characters. */
  historyChars: number;
  /** Model calls per Bogota calendar day, whole Worker. */
  modelsPerDay: number;
  /** Minimum ms between two handoff notices for one client. */
  handoffMs: number;
  /** Agent messages to the operator per Bogota clock hour, all clients. */
  opMsgsPerHour: number;
  /** A passthrough with no message in either direction closes on its own. */
  passthroughIdleMs: number;
}

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  burstsPerHour: 12,
  burstsPerDay: 40,
  voicePerDay: 5,
  proofsPerHold: 3,
  burstChars: 2000,
  historyChars: 1000,
  modelsPerDay: 1500,
  handoffMs: 10 * 60 * 1000,
  opMsgsPerHour: 30,
  passthroughIdleMs: 15 * 60 * 1000,
};

function validCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

/** Parse the GUARD_CONFIG deploy variable; any missing or invalid field falls back. */
export function guardConfig(env: { GUARD_CONFIG?: string }): GuardConfig {
  const base: GuardConfig = { ...DEFAULT_GUARD_CONFIG };
  const raw = env.GUARD_CONFIG?.trim();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as {
      burstsPerHour?: unknown;
      burstsPerDay?: unknown;
      voicePerDay?: unknown;
      proofsPerHold?: unknown;
      burstChars?: unknown;
      historyChars?: unknown;
      modelsPerDay?: unknown;
      handoffMs?: unknown;
      opMsgsPerHour?: unknown;
      passthroughIdleMs?: unknown;
    };
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return base;
    for (const key of [
      'burstsPerHour',
      'burstsPerDay',
      'voicePerDay',
      'proofsPerHold',
      'burstChars',
      'historyChars',
      'modelsPerDay',
      'handoffMs',
      'opMsgsPerHour',
      'passthroughIdleMs',
    ] as const) {
      const v = validCount(parsed[key]);
      if (v !== null) base[key] = v;
    }
    return base;
  } catch {
    return base;
  }
}

/** Cap the joined burst before it reaches any model; storage keeps the full text. */
export function capBurst(cfg: GuardConfig, text: string): string {
  return text.length > cfg.burstChars ? text.slice(0, cfg.burstChars) : text;
}

/** Cap one history turn before it reaches any model; storage keeps the full text. */
export function capTurn(cfg: GuardConfig, text: string): string {
  return text.length > cfg.historyChars ? text.slice(0, cfg.historyChars) : text;
}

/** Bogota clock-hour key (YYYY-MM-DDTHH) of a timestamp. */
export function bogotaHourKey(ms: number): string {
  const p = bogotaParts(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return p.year + '-' + pad(p.month) + '-' + pad(p.day) + 'T' + pad(p.hour);
}

export type BurstWindow = 'hour' | 'day';

/**
 * Decide a burst against the per-number counters: at most 12 answered
 * bursts in the last rolling 60 minutes and 40 in the Bogota day.
 */
export function burstLimit(
  nowMs: number,
  answeredMs: number[],
  cfg: GuardConfig
): { ok: true } | { ok: false; window: BurstWindow } {
  const recent = answeredMs.filter((t) => t > nowMs - 3600 * 1000);
  if (recent.length >= cfg.burstsPerHour) return { ok: false, window: 'hour' };
  const today = bogotaDateKey(nowMs);
  const dayCount = answeredMs.filter((t) => bogotaDateKey(t) === today).length;
  if (dayCount >= cfg.burstsPerDay) return { ok: false, window: 'day' };
  return { ok: true };
}

export interface PausedNotice {
  hourMs: number | null;
  dayKey: string | null;
}

/** One fixed notice per window: the first limited burst, then silence. */
export function pausedNoticeDue(nowMs: number, window: BurstWindow, last: PausedNotice | null): boolean {
  if (!last) return true;
  if (window === 'hour') {
    return last.hourMs === null || nowMs - last.hourMs >= 3600 * 1000;
  }
  return last.dayKey !== bogotaDateKey(nowMs);
}

/** Told to the client instead of an answer while their number is over a limit. */
export const GUARD_PAUSED: Record<Lang, string> = {
  es: 'Recibí tus mensajes. Por el volumen de mensajes, una persona del laboratorio te va a responder por aquí.',
  en: 'I received your messages. Due to the message volume, someone from the lab will reply to you here.',
};

/** Told once to the operator when the Worker reaches its daily model-call limit. */
export const OPERATOR_DAILY: Record<Lang, string> = {
  es: 'UniverLab · se alcanzó el límite diario de llamadas al modelo: los clientes reciben la respuesta fija y un aviso hasta mañana.',
  en: 'UniverLab · the daily model-call limit was reached: clients get the fixed reply and a handoff until tomorrow.',
};

/** Told once per hour to the operator when agent messages pass the hourly cap. */
export function operatorQueue(lang: Lang, waiting: number): string {
  return lang === 'es'
    ? 'UniverLab · hay ' + waiting + ' conversaciones más en espera: no envío más avisos esta hora.'
    : 'UniverLab · there are ' + waiting + ' more conversations waiting: no further notices this hour.';
}

/** Marker thrown past the Worker-wide limit so the burst falls back without a model call. */
export const GUARD_OVER = 'guard-global-over';

export function isGuardOver(e: unknown): boolean {
  return e instanceof Error && e.message === GUARD_OVER;
}

interface GuardFetchEnv {
  REGISTRY?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(req: Request): Promise<Response> };
  };
}

async function guardFetch(env: GuardFetchEnv, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const ns = env.REGISTRY;
    if (!ns) return null;
    const stub = ns.get(ns.idFromName('operator'));
    const res = await stub.fetch(
      new Request('https://guard/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Take one Worker-wide model call. Denied past the daily limit; allowed
 * when no registry binds or the check itself fails, so a missing owner
 * never silences the agent.
 */
export async function guardModelTake(env: Env, lang: Lang, now?: number): Promise<boolean> {
  const res = await guardFetch(env, { action: 'guard', op: 'model', now: now ?? Date.now(), lang });
  return res === null || res.ok !== false;
}

/** Whether this client's handoff notice may reach the operator now. */
export async function guardHandoff(env: Env, client: string, now?: number): Promise<boolean> {
  const res = await guardFetch(env, { action: 'guard', op: 'handoff', client, now: now ?? Date.now() });
  return res === null || res.ok !== false;
}

export interface OpMsgGrant {
  send: boolean;
  firstOver: boolean;
  waiting: number;
}

/** Whether one more agent message may reach the operator this hour. */
export async function guardOpMsg(env: Env, phone?: string, now?: number): Promise<OpMsgGrant> {
  const none = { send: true, firstOver: false, waiting: 0 };
  if (typeof phone === 'number') {
    now = phone;
    phone = undefined;
  }
  const res = await guardFetch(env, { action: 'guard', op: 'opmsg', phone, now: now ?? Date.now() });
  if (!res || typeof res.send !== 'boolean') return none;
  return {
    send: res.send,
    firstOver: res.firstOver === true,
    waiting: typeof res.waiting === 'number' && Number.isFinite(res.waiting) ? Math.max(0, Math.floor(res.waiting)) : 0,
  };
}

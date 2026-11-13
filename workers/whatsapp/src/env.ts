export interface Env {
  AI: Ai;
  SITE_STATE?: KVNamespace;
  CONVERSATION: DurableObjectNamespace<import('./conversation').Conversation>;
  REGISTRY?: DurableObjectNamespace<import('./operator').Operator>;
  CALENDAR?: DurableObjectNamespace<import('./calendar').Calendar>;
  GATE?: DurableObjectNamespace<import('./gate').Gate>;
  TURNSTILE_SECRET?: string;
  WA_APP_SECRET: string;
  WA_VERIFY_TOKEN: string;
  WA_ACCESS_TOKEN: string;
  WA_PHONE_NUMBER_ID: string;
  OPERATOR_PHONE: string;
  TEXT_MODEL?: string;
  TEXT_MODEL_OPTIONS?: string;
  VOICE_MODEL?: string;
  VOICE_MODEL_OPTIONS?: string;
  VOICE_MAX_SECONDS?: string;
  PROOF_MODEL?: string;
  PROOF_MODEL_OPTIONS?: string;
  BURST_QUIET_MS?: string;
  BURST_MAX_MS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  WORKBENCH_CALENDAR_ID?: string;
  BOOKING_CONFIG?: string;
  GUARD_CONFIG?: string;
  AGENDA_CONFIG?: string;
}

/** How long the agent waits for a burst of client messages before answering. */
export interface BurstConfig {
  /** Quiet window after the last message before the burst is answered. */
  quietMs: number;
  /** Longest a burst may stay open after its first message. */
  maxMs: number;
}

export const DEFAULT_BURST_QUIET_MS = 7000;
export const DEFAULT_BURST_MAX_MS = 25000;

/** The burst window is deploy configuration with these defaults as fallback,
 *  following the TEXT_MODEL pattern in brain.ts. */
export function burstConfig(env: { BURST_QUIET_MS?: string; BURST_MAX_MS?: string }): BurstConfig {
  const quiet = Number(env.BURST_QUIET_MS);
  const max = Number(env.BURST_MAX_MS);
  return {
    quietMs: Number.isFinite(quiet) && quiet >= 0 ? quiet : DEFAULT_BURST_QUIET_MS,
    maxMs: Number.isFinite(max) && max > 0 ? max : DEFAULT_BURST_MAX_MS,
  };
}

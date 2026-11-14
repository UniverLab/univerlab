import { GRAPH } from './meta';
import type { Lang } from './lang';

/** Used when the deploy sets no VOICE_MODEL. The speech model is
 *  configuration, like the text model in brain.ts: the production
 *  environment's WA_VOICE_MODEL / WA_VOICE_MODEL_OPTIONS variables
 *  reach the Worker as VOICE_MODEL / VOICE_MODEL_OPTIONS (see README). */
export const DEFAULT_VOICE_MODEL = '@cf/openai/whisper';

/** Notes longer than this are handed to the operator untranscribed. */
export const DEFAULT_VOICE_MAX_SECONDS = 180;

export interface VoiceConfig {
  model: string;
  /** Extra request fields for this model, merged into the AI.run input. */
  options: Record<string, unknown>;
  /** Longest note transcribed, in seconds. */
  maxSeconds: number;
}

/** The speech model and its limit are deploy configuration with these
 *  defaults as fallback, following the TEXT_MODEL pattern in brain.ts
 *  and the burst window pattern in env.ts. */
export function voiceConfig(env: {
  VOICE_MODEL?: string;
  VOICE_MODEL_OPTIONS?: string;
  VOICE_MAX_SECONDS?: string;
}): VoiceConfig {
  const model = env.VOICE_MODEL?.trim() || DEFAULT_VOICE_MODEL;
  let options: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(env.VOICE_MODEL_OPTIONS?.trim() || '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      options = parsed as Record<string, unknown>;
    }
  } catch {
    // A malformed value falls back to no options rather than breaking replies.
  }
  const max = Number(env.VOICE_MAX_SECONDS);
  return {
    model,
    options,
    maxSeconds: Number.isFinite(max) && max > 0 ? max : DEFAULT_VOICE_MAX_SECONDS,
  };
}

/** Told to the client when their voice note goes to a person untranscribed. */
export const VOICE_HANDOFF: Record<Lang, string> = {
  es: 'No pude escuchar tu nota de voz. Una persona del laboratorio la escuchará y te responde pronto.',
  en: 'I could not listen to your voice note. Someone at the lab will listen to it and reply soon.',
};

export type Transcription = { ok: true; text: string } | { ok: false };

interface VoiceEnv {
  AI: { run(model: string, input: unknown): Promise<unknown> };
  WA_ACCESS_TOKEN: string;
}

/** Download a voice note from the WhatsApp Cloud API media endpoint and
 *  transcribe it with the speech-to-text model on Cloudflare Workers AI.
 *  The audio itself is never stored: only the returned transcript is kept.
 *  Any failure (download or transcription) resolves to { ok: false } so the
 *  caller hands the note to the operator instead of throwing. */
export async function transcribe(
  env: VoiceEnv,
  cfg: VoiceConfig,
  mediaId: string,
  fetchFn: typeof fetch = fetch
): Promise<Transcription> {
  try {
    const bytes = await downloadAudio(env, mediaId, fetchFn);
    if (bytes === null) return { ok: false };
    const res = (await env.AI.run(cfg.model, {
      ...cfg.options,
      audio: bytes,
    })) as { text?: unknown };
    if (!res || typeof res.text !== 'string') return { ok: false };
    const text = res.text.trim();
    if (text === '') return { ok: false };
    return { ok: true, text };
  } catch {
    return { ok: false };
  }
}

/** Fetch the note's bytes. The media endpoint answers with the bytes, or
 *  with a JSON document carrying the download url, which is followed once. */
async function downloadAudio(
  env: VoiceEnv,
  mediaId: string,
  fetchFn: typeof fetch
): Promise<Uint8Array | null> {
  const headers = { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}` };
  const meta = await fetchFn(`${GRAPH}/${mediaId}`, { headers });
  if (!meta.ok) return null;
  const buf = new Uint8Array(await meta.arrayBuffer());
  if (buf.length === 0) return null;
  const url = metaUrlOf(buf);
  if (url === null) return bytesOf(buf);
  const audio = await fetchFn(url, { headers });
  if (!audio.ok) return null;
  return bytesOf(new Uint8Array(await audio.arrayBuffer()));
}

/** The url out of a JSON media document, else null (the body is the audio). */
function metaUrlOf(buf: Uint8Array): string | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(buf)) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const url = (parsed as Record<string, unknown>)['url'];
      if (typeof url === 'string' && url !== '') return url;
    }
  } catch {
    /* not JSON: the body is the audio itself */
  }
  return null;
}

function bytesOf(buf: Uint8Array): Uint8Array | null {
  return buf.length > 0 ? buf : null;
}

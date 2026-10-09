/**
 * The WebMCP origin trial (Chrome) for https://univerlab.org.
 *
 * Origin-trial tokens are public by design: Chrome only honours one on the
 * origin it was issued for, so it ships in the page as a meta tag. The token
 * expires; `src/__tests__/origin-trial.test.ts` fails the suite two weeks
 * before that so it is renewed instead of silently dropping WebMCP.
 */
export const WEBMCP_ORIGIN_TRIAL_TOKEN =
  'AizHC/PWjQ0/r3OwTDFj1WaT1kZRfWMR473f+x+IvfNBClC5ENT1tgduT6eao2Cn5bVDFAUNmmzd85WC7Zm7VwEAAABNeyJvcmlnaW4iOiJodHRwczovL3VuaXZlcmxhYi5vcmc6NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTgwNjM2NDgwMH0=';

export interface OriginTrialPayload {
  origin: string;
  feature: string;
  /** Seconds since the epoch. */
  expiry: number;
}

/**
 * Reads the signed payload out of a token: one version byte, a 64-byte
 * signature, a big-endian 4-byte length, then the JSON payload.
 */
export function decodeOriginTrialToken(token: string): OriginTrialPayload {
  const bytes = Uint8Array.from(atob(token), (c) => c.charCodeAt(0));
  if (bytes.length < 69) throw new Error('origin-trial token too short');
  const length = new DataView(bytes.buffer).getUint32(65);
  const json = new TextDecoder().decode(bytes.slice(69, 69 + length));
  return JSON.parse(json) as OriginTrialPayload;
}

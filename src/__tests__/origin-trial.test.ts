/**
 * @jest-environment node
 *
 * The WebMCP origin-trial token expires. This suite fails 14 days before the
 * expiry (renew it at developer.chrome.com/origintrials) and warns from 30.
 */
import {
  WEBMCP_ORIGIN_TRIAL_TOKEN,
  decodeOriginTrialToken,
} from '../lib/origin-trial';

const FAIL_DAYS = 14;
const WARN_DAYS = 30;
const DAY = 86_400;

/** Builds a token with the real layout and a zeroed signature. */
function syntheticToken(payload: object): string {
  const json = Buffer.from(JSON.stringify(payload));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  return Buffer.concat([Buffer.from([3]), Buffer.alloc(64), length, json]).toString('base64');
}

describe('decodeOriginTrialToken', () => {
  it('reads origin, feature and expiry out of the payload', () => {
    const payload = { origin: 'https://example.org:443', feature: 'WebMCP', expiry: 1_900_000_000 };
    expect(decodeOriginTrialToken(syntheticToken(payload))).toEqual(payload);
  });

  it('rejects a token too short to hold a payload', () => {
    expect(() => decodeOriginTrialToken(Buffer.alloc(10).toString('base64'))).toThrow('too short');
  });
});

describe('the shipped WebMCP token', () => {
  const payload = decodeOriginTrialToken(WEBMCP_ORIGIN_TRIAL_TOKEN);

  it('is issued for univerlab.org and the WebMCP feature', () => {
    expect(payload.origin).toBe('https://univerlab.org:443');
    expect(payload.feature).toBe('WebMCP');
  });

  it(`has more than ${FAIL_DAYS} days left`, () => {
    const daysLeft = (payload.expiry - Date.now() / 1000) / DAY;
    if (daysLeft <= WARN_DAYS) {
      console.warn(
        `WebMCP origin-trial token expires in ${Math.floor(daysLeft)} days ` +
          `(${new Date(payload.expiry * 1000).toISOString().slice(0, 10)}): renew it.`,
      );
    }
    expect(daysLeft).toBeGreaterThan(FAIL_DAYS);
  });
});

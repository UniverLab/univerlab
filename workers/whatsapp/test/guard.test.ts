/** @jest-environment node */
import {
  bogotaHourKey,
  burstLimit,
  capBurst,
  capTurn,
  DEFAULT_GUARD_CONFIG,
  GUARD_PAUSED,
  guardConfig,
  guardHandoff,
  guardModelTake,
  guardOpMsg,
  isGuardOver,
  GUARD_OVER,
  OPERATOR_DAILY,
  operatorQueue,
  pausedNoticeDue,
} from '../src/guard';

test('defaults bound one number and all numbers together', () => {
  expect(DEFAULT_GUARD_CONFIG).toMatchObject({
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
  });
});

test('guardConfig parses the deploy JSON and falls back per field', () => {
  expect(guardConfig({})).toEqual(DEFAULT_GUARD_CONFIG);
  expect(guardConfig({ GUARD_CONFIG: 'not-json' })).toEqual(DEFAULT_GUARD_CONFIG);
  expect(guardConfig({ GUARD_CONFIG: '[1,2]' })).toEqual(DEFAULT_GUARD_CONFIG);
  const cfg = guardConfig({
    GUARD_CONFIG: JSON.stringify({ burstsPerHour: 3, burstChars: 'huge', modelsPerDay: 10 }),
  });
  expect(cfg.burstsPerHour).toBe(3);
  expect(cfg.modelsPerDay).toBe(10);
  expect(cfg.burstChars).toBe(2000);
  expect(cfg.burstsPerDay).toBe(40);
  expect(cfg.passthroughIdleMs).toBe(15 * 60 * 1000);
  expect(guardConfig({ GUARD_CONFIG: JSON.stringify({ passthroughIdleMs: 60000 }) }).passthroughIdleMs).toBe(60000);
});

test('capBurst and capTurn cut model input and pass short text through', () => {
  const cfg = guardConfig({});
  expect(capBurst(cfg, 'x'.repeat(2000))).toHaveLength(2000);
  expect(capBurst(cfg, 'x'.repeat(2500))).toHaveLength(2000);
  expect(capBurst(cfg, 'hola')).toBe('hola');
  expect(capTurn(cfg, 'y'.repeat(1000))).toHaveLength(1000);
  expect(capTurn(cfg, 'y'.repeat(1500))).toHaveLength(1000);
});

test('burstLimit allows below the caps and names the window past them', () => {
  const cfg = guardConfig({});
  // Date.now in the focused tests pins to 2026-11-09 13:00 Bogota.
  const now = Date.UTC(2026, 10, 9, 18, 0, 0);
  const eleven = Array.from({ length: 11 }, (_, i) => now - (i + 1) * 60 * 1000);
  expect(burstLimit(now, eleven, cfg)).toEqual({ ok: true });
  const twelve = [...eleven, now - 30 * 60 * 1000];
  expect(burstLimit(now, twelve, cfg)).toEqual({ ok: false, window: 'hour' });
  // An hour-old burst no longer counts: the window resets.
  const stale = twelve.map((t) => t - 61 * 60 * 1000);
  expect(burstLimit(now, stale, cfg)).toEqual({ ok: true });
  // Forty answers earlier the same Bogota day block a new one.
  const day = Array.from({ length: 40 }, (_, i) => now - (61 + i) * 60 * 1000);
  expect(burstLimit(now, day, cfg)).toEqual({ ok: false, window: 'day' });
  // Yesterday's answers never count toward today.
  const yesterday = Date.UTC(2026, 10, 9, 4, 59, 0);
  expect(burstLimit(now, Array.from({ length: 40 }, () => yesterday), cfg)).toEqual({ ok: true });
});

test('pausedNoticeDue sends one notice per window', () => {
  const now = Date.UTC(2026, 10, 9, 18, 0, 0);
  expect(pausedNoticeDue(now, 'hour', null)).toBe(true);
  expect(pausedNoticeDue(now, 'hour', { hourMs: now - 10 * 60 * 1000, dayKey: null })).toBe(false);
  expect(pausedNoticeDue(now, 'hour', { hourMs: now - 61 * 60 * 1000, dayKey: null })).toBe(true);
  expect(pausedNoticeDue(now, 'day', { hourMs: null, dayKey: '2026-11-09' })).toBe(false);
  expect(pausedNoticeDue(now, 'day', { hourMs: null, dayKey: '2026-11-08' })).toBe(true);
});

test('fixed notices exist in Spanish and English and name the lab', () => {
  expect(GUARD_PAUSED.es).toContain('laboratorio');
  expect(GUARD_PAUSED.en).toContain('lab');
  expect(OPERATOR_DAILY.es).toContain('UniverLab');
  expect(OPERATOR_DAILY.en).toContain('UniverLab');
  expect(operatorQueue('es', 3)).toContain('3');
  expect(operatorQueue('en', 3)).toContain('3');
});

test('bogotaHourKey follows Bogota wall time, not UTC', () => {
  // 00:30 UTC is still the previous Bogota evening.
  expect(bogotaHourKey(Date.UTC(2026, 10, 9, 0, 30, 0))).toBe('2026-11-08T19');
  expect(bogotaHourKey(Date.UTC(2026, 10, 9, 18, 0, 0))).toBe('2026-11-09T13');
});

test('guard fetch helpers fail open without a registry', async () => {
  const env = {} as never;
  await expect(guardModelTake(env, 'es')).resolves.toBe(true);
  await expect(guardHandoff(env, '573001112222')).resolves.toBe(true);
  await expect(guardOpMsg(env)).resolves.toEqual({ send: true, firstOver: false, waiting: 0 });
});

test('guard fetch helpers deny only on an explicit refusal', async () => {
  const refused = {
    REGISTRY: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async () => new Response(JSON.stringify({ ok: false }), { status: 200 }),
      }),
    },
  } as never;
  await expect(guardModelTake(refused, 'es')).resolves.toBe(false);
  await expect(guardHandoff(refused, '573001112222')).resolves.toBe(false);
  const allowed = {
    REGISTRY: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async () => new Response(JSON.stringify({ code: 'zz99' }), { status: 200 }),
      }),
    },
  } as never;
  await expect(guardModelTake(allowed, 'es')).resolves.toBe(true);
  await expect(guardHandoff(allowed, '573001112222')).resolves.toBe(true);
  await expect(guardOpMsg(allowed)).resolves.toEqual({ send: true, firstOver: false, waiting: 0 });
});

test('isGuardOver matches only the guard marker', () => {
  expect(isGuardOver(new Error(GUARD_OVER))).toBe(true);
  expect(isGuardOver(new Error('boom'))).toBe(false);
});

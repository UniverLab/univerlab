/** @jest-environment node */
import {
  brief,
  CONFIRM_SLOT,
  formatBrief,
  intake,
  INTAKE_ASK,
  INTAKE_FOLLOWUP,
  normalizeService,
  parseBrief,
  parseIntake,
  type IntakeState,
} from '../src/intake';
import { modelConfig } from '../src/brain';

function state(over: Partial<IntakeState> = {}): IntakeState {
  return {
    lang: 'es',
    service: 'consultation',
    opening: 'quiero agendar una consulta',
    answers: [],
    asks: 1,
    ...over,
  };
}

test('INTAKE_ASK, FOLLOWUP and CONFIRM exist in both languages', () => {
  for (const lang of ['es', 'en'] as const) {
    expect(INTAKE_ASK[lang].length).toBeGreaterThan(0);
    expect(INTAKE_FOLLOWUP[lang].length).toBeGreaterThan(0);
    expect(CONFIRM_SLOT[lang].length).toBeGreaterThan(0);
  }
});

test('normalizeService maps known services and defaults to other', () => {
  expect(normalizeService('consultation')).toBe('consultation');
  expect(normalizeService(' first-call ')).toBe('first-call');
  expect(normalizeService('audit')).toBe('audit-flow');
  expect(normalizeService('flow')).toBe('audit-flow');
  expect(normalizeService('')).toBe('other');
  expect(normalizeService('pago')).toBe('other');
});

test('parseIntake accepts every valid status', () => {
  expect(parseIntake('{"status":"more","reply":"¿A qué te dedicas?"}')).toEqual({
    status: 'more',
    reply: '¿A qué te dedicas?',
  });
  expect(parseIntake('{"status":"ready","reply":""}')).toEqual({ status: 'ready', reply: '' });
  expect(parseIntake('{"status":"declined","reply":""}')).toEqual({ status: 'declined', reply: '' });
  expect(parseIntake('{"status":"handoff","reply":""}')).toEqual({ status: 'handoff', reply: '' });
});

test('parseIntake falls back to handoff on bad json or bad status', () => {
  expect(parseIntake('nonsense')).toEqual({ status: 'handoff', reply: '' });
  expect(parseIntake('{"status":"maybe","reply":"x"}')).toEqual({ status: 'handoff', reply: '' });
  expect(parseIntake('{"reply":"x"}')).toEqual({ status: 'handoff', reply: '' });
});

test('intake sends the configured model and its options', async () => {
  let model = '';
  let sent: Record<string, unknown> = {};
  const ai = {
    run: async (m: string, input: unknown) => {
      model = m;
      sent = input as Record<string, unknown>;
      return { response: '{"status":"more","reply":"¿Qué usas hoy?"}' };
    },
  };
  const cfg = modelConfig({
    TEXT_MODEL: '@cf/qwen/qwen3.8-27b',
    TEXT_MODEL_OPTIONS: '{"reasoning_effort":"low"}',
  });
  const res = await intake(ai, state(), 'uso sheets', cfg);
  expect(model).toBe('@cf/qwen/qwen3.8-27b');
  expect(sent.reasoning_effort).toBe('low');
  expect((sent.messages as unknown[]).length).toBe(2);
  expect(res).toEqual({ status: 'more', reply: '¿Qué usas hoy?' });
});

test('intake falls back to handoff when ai throws', async () => {
  const ai = {
    run: async () => {
      throw new Error('down');
    },
  };
  await expect(intake(ai, state(), 'hola')).resolves.toEqual({ status: 'handoff', reply: '' });
});

test('parseBrief caps bullets at six and 200 chars', () => {
  const many = Array.from({ length: 8 }, (_, i) => 'point ' + i);
  const parsed = parseBrief(JSON.stringify({ bullets: many }));
  expect(parsed.bullets).toHaveLength(6);
  const long = parseBrief(JSON.stringify({ bullets: ['x'.repeat(300)] }));
  expect(long.bullets[0]).toBe('x'.repeat(200));
  expect(parseBrief('nonsense')).toEqual({ bullets: [] });
  expect(parseBrief('{"bullets":"nope"}')).toEqual({ bullets: [] });
});

test('brief sends the configured model and its options', async () => {
  let model = '';
  let sent: Record<string, unknown> = {};
  const ai = {
    run: async (m: string, input: unknown) => {
      model = m;
      sent = input as Record<string, unknown>;
      return { response: '{"bullets":["automatizar reportes","usa sheets"]}' };
    },
  };
  const cfg = modelConfig({
    TEXT_MODEL: '@cf/qwen/qwen3.8-27b',
    TEXT_MODEL_OPTIONS: '{"reasoning_effort":"low"}',
  });
  const res = await brief(ai, state({ answers: ['quiero automatizar reportes', 'uso sheets'] }), cfg);
  expect(model).toBe('@cf/qwen/qwen3.8-27b');
  expect(sent.reasoning_effort).toBe('low');
  expect(res).toEqual({ bullets: ['automatizar reportes', 'usa sheets'] });
});

test('brief falls back to the last answers when the model output is invalid', async () => {
  const ai = { run: async () => ({ response: 'nonsense' }) };
  const answers = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
  const res = await brief(ai, state({ answers }));
  expect(res).toEqual({ bullets: ['a2', 'a3', 'a4', 'a5', 'a6', 'a7'] });
});

test('brief falls back to empty bullets when ai throws and nothing was said', async () => {
  const ai = {
    run: async () => {
      throw new Error('down');
    },
  };
  await expect(brief(ai, state())).resolves.toEqual({ bullets: [] });
});

test('formatBrief carries the header and the client bullets', () => {
  const out = formatBrief({
    name: 'María',
    phone: '573001234567',
    lang: 'es',
    service: 'consultation',
    bullets: ['automatizar reportes', 'usa sheets hoy', 'ya probó macros'],
  });
  expect(out).toContain('María');
  expect(out).toContain('+573001234567');
  expect(out).toContain('español');
  expect(out).toContain('Consultoría');
  expect(out).toContain('- automatizar reportes');
  expect(out.length).toBeLessThanOrEqual(1600);
});

test('formatBrief pads to three bullets without inventing facts', () => {
  const out = formatBrief({ name: '', phone: '15551234567', lang: 'en', service: 'other', bullets: [] });
  const lines = out.split('\n').filter((l) => l.startsWith('- '));
  expect(lines.length).toBe(3);
  for (const l of lines) expect(l).toContain('No further details shared');
  expect(out).toContain('+15551234567');
});

test('formatBrief caps long input at 1600 chars and six bullets', () => {
  const out = formatBrief({
    name: 'Ana',
    phone: '573001234567',
    lang: 'es',
    service: 'first-call',
    bullets: Array.from({ length: 10 }, () => 'x'.repeat(300)),
  });
  expect(out.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(6);
  expect(out.length).toBeLessThanOrEqual(1600);
  expect(out).toContain('Primera llamada');
});

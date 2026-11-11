/** @jest-environment node */
import { answer, DEFAULT_MODEL, FALLBACK, modelConfig, parseAnswer } from '../src/brain';

test('parseAnswer accepts a bare object with booking fields', () => {
  expect(
    parseAnswer('{"reply":"Hola","handoff":false,"booking":false,"service":""}', 'es')
  ).toEqual({ reply: 'Hola', handoff: false, booking: false, service: '' });
});

test('parseAnswer accepts a booking answer', () => {
  expect(
    parseAnswer('{"reply":"Vamos","handoff":true,"booking":true,"service":"consultation"}', 'es')
  ).toEqual({ reply: 'Vamos', handoff: true, booking: true, service: 'consultation' });
});

test('parseAnswer slices a long service to 40 chars', () => {
  const r = parseAnswer(
    '{"reply":"Hi","handoff":true,"booking":true,"service":"' + 'x'.repeat(50) + '"}',
    'en'
  );
  expect(r.service).toBe('x'.repeat(40));
});

test('parseAnswer accepts prose and fenced json', () => {
  expect(
    parseAnswer('here you go {"reply":"Hola","handoff":false,"booking":false,"service":""} bye', 'es')
  ).toEqual({ reply: 'Hola', handoff: false, booking: false, service: '' });
  expect(
    parseAnswer('```json\n{"reply":"Hola","handoff":true,"booking":true,"service":"other"}\n```', 'es')
  ).toEqual({ reply: 'Hola', handoff: true, booking: true, service: 'other' });
});

test('parseAnswer falls back on nonsense, empty reply or missing booking', () => {
  expect(parseAnswer('nonsense', 'es')).toEqual({
    reply: FALLBACK.es,
    handoff: true,
    booking: false,
    service: '',
  });
  expect(parseAnswer('{"reply":"","handoff":false,"booking":false,"service":""}', 'es')).toEqual({
    reply: FALLBACK.es,
    handoff: true,
    booking: false,
    service: '',
  });
  expect(parseAnswer('{"reply":"Hola","handoff":false}', 'es')).toEqual({
    reply: FALLBACK.es,
    handoff: true,
    booking: false,
    service: '',
  });
});

test('parseAnswer ignores braces inside inline thinking', () => {
  expect(
    parseAnswer(
      '<think>maybe {"reply":"no"} or {x}</think>{"reply":"Hola","handoff":false,"booking":false,"service":""}',
      'es'
    )
  ).toEqual({ reply: 'Hola', handoff: false, booking: false, service: '' });
});

test('answer reads choices content', async () => {
  const ai = {
    run: async () => ({
      choices: [{ message: { content: '{"reply":"Hi","handoff":true,"booking":false,"service":""}' } }],
    }),
  };
  await expect(answer(ai, [], 'en')).resolves.toEqual({
    reply: 'Hi',
    handoff: true,
    booking: false,
    service: '',
  });
});

test('answer reads response field', async () => {
  const ai = {
    run: async () => ({ response: '{"reply":"Hi","handoff":false,"booking":false,"service":""}' }),
  };
  await expect(answer(ai, [], 'en')).resolves.toEqual({
    reply: 'Hi',
    handoff: false,
    booking: false,
    service: '',
  });
});

test('answer falls back when ai throws', async () => {
  const ai = {
    run: async () => {
      throw new Error('down');
    },
  };
  await expect(answer(ai, [], 'en')).resolves.toEqual({
    reply: FALLBACK.en,
    handoff: true,
    booking: false,
    service: '',
  });
});

test('system prompt carries knowledge in spanish and the booking json shape', async () => {
  let sent: unknown;
  const ai = {
    run: async (_model: string, input: unknown) => {
      sent = input;
      return { response: '{"reply":"Hola","handoff":false,"booking":false,"service":""}' };
    },
  };
  await answer(ai, [], 'es');
  const messages = (sent as { messages: Array<{ role: string; content: string }> }).messages;
  const system = messages[0].content;
  expect(system).toContain('KNOWLEDGE:');
  expect(system).toContain('150.000 COP');
  expect(system).toContain('"booking"');
  expect(system).toContain('"service"');
  expect(system).toContain('first-call');
});

test('modelConfig falls back to the default model and no options', () => {
  expect(modelConfig({})).toEqual({ model: DEFAULT_MODEL, options: {} });
  expect(modelConfig({ TEXT_MODEL: '  ', TEXT_MODEL_OPTIONS: '' })).toEqual({ model: DEFAULT_MODEL, options: {} });
  expect(modelConfig({ TEXT_MODEL_OPTIONS: 'not json' }).options).toEqual({});
  expect(modelConfig({ TEXT_MODEL_OPTIONS: '[1]' }).options).toEqual({});
});

test('answer sends the configured model and its options, never overriding messages', async () => {
  let model = '';
  let sent: Record<string, unknown> = {};
  const ai = {
    run: async (m: string, input: unknown) => {
      model = m;
      sent = input as Record<string, unknown>;
      return { response: '{"reply":"Hi","handoff":false,"booking":false,"service":""}' };
    },
  };
  const cfg = modelConfig({
    TEXT_MODEL: '@cf/qwen/qwen3.8-27b',
    TEXT_MODEL_OPTIONS: '{"reasoning_effort":"low","max_tokens":800,"messages":[]}',
  });
  await answer(ai, [{ role: 'user', text: 'hola' }], 'es', cfg);
  expect(model).toBe('@cf/qwen/qwen3.8-27b');
  expect(sent.reasoning_effort).toBe('low');
  expect(sent.max_tokens).toBe(800);
  expect((sent.messages as unknown[]).length).toBe(2);
});

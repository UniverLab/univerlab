/** @jest-environment node */
import { answer, FALLBACK, parseAnswer } from '../src/brain';

test('parseAnswer accepts a bare object', () => {
  expect(parseAnswer('{"reply":"Hola","handoff":false}', 'es')).toEqual({
    reply: 'Hola',
    handoff: false,
  });
});

test('parseAnswer accepts prose and fenced json', () => {
  expect(parseAnswer('here you go {"reply":"Hola","handoff":false} bye', 'es')).toEqual({
    reply: 'Hola',
    handoff: false,
  });
  expect(
    parseAnswer('```json\n{"reply":"Hola","handoff":true}\n```', 'es')
  ).toEqual({ reply: 'Hola', handoff: true });
});

test('parseAnswer falls back on nonsense or empty reply', () => {
  expect(parseAnswer('nonsense', 'es')).toEqual({ reply: FALLBACK.es, handoff: true });
  expect(parseAnswer('{"reply":"","handoff":false}', 'es')).toEqual({
    reply: FALLBACK.es,
    handoff: true,
  });
});

test('parseAnswer ignores braces inside inline thinking', () => {
  expect(
    parseAnswer('<think>maybe {"reply":"no"} or {x}</think>{"reply":"Hola","handoff":false}', 'es')
  ).toEqual({ reply: 'Hola', handoff: false });
});

test('answer reads choices content', async () => {
  const ai = {
    run: async () => ({ choices: [{ message: { content: '{"reply":"Hi","handoff":true}' } }] }),
  };
  await expect(answer(ai, [], 'en')).resolves.toEqual({ reply: 'Hi', handoff: true });
});

test('answer reads response field', async () => {
  const ai = {
    run: async () => ({ response: '{"reply":"Hi","handoff":false}' }),
  };
  await expect(answer(ai, [], 'en')).resolves.toEqual({ reply: 'Hi', handoff: false });
});

test('answer falls back when ai throws', async () => {
  const ai = {
    run: async () => {
      throw new Error('down');
    },
  };
  await expect(answer(ai, [], 'en')).resolves.toEqual({ reply: FALLBACK.en, handoff: true });
});

test('system prompt carries knowledge in spanish', async () => {
  let sent: unknown;
  const ai = {
    run: async (_model: string, input: unknown) => {
      sent = input;
      return { response: '{"reply":"Hola","handoff":false}' };
    },
  };
  await answer(ai, [], 'es');
  const messages = (sent as { messages: Array<{ role: string; content: string }> }).messages;
  const system = messages[0].content;
  expect(system).toContain('KNOWLEDGE:');
  expect(system).toContain('150.000 COP');
});

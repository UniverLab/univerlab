/** @jest-environment node */
import { recapPrompt, recapData, parseRecap, cleanRecap, RECAP_MAX } from '../src/recap';

test('recapPrompt asks for a short Spanish summary as JSON', () => {
  const prompt = recapPrompt();
  expect(prompt).toContain('Spanish');
  expect(prompt).toContain('{"recap"');
});

test('recapData marks the client-written turns', () => {
  const data = recapData([
    { role: 'user', text: 'quiero una cita' },
    { role: 'assistant', text: 'claro' },
  ]);
  expect(data).toContain('cliente: quiero una cita');
  expect(data).toContain('agente: claro');
});

test('cleanRecap strips reasoning and squeezes whitespace', () => {
  expect(cleanRecap('<think>hmm</think>  hola   mundo ')).toBe('hola mundo');
});

test('parseRecap reads the JSON summary and ends with the last client message verbatim', () => {
  const last = 'quiero la consulta del lunes, ¿sí?';
  const out = parseRecap('{"recap": "El cliente quiere una consulta."}', last);
  expect(out).toBe('El cliente quiere una consulta.\nÚltimo mensaje del cliente: «' + last + '»');
  expect(out.length).toBeLessThanOrEqual(RECAP_MAX);
});

test('parseRecap salvages plain text and never passes 800 characters', () => {
  const last = 'dime el precio';
  const out = parseRecap('un resumen ' + 'largo '.repeat(300), last);
  expect(out.endsWith('Último mensaje del cliente: «' + last + '»')).toBe(true);
  expect(out.length).toBeLessThanOrEqual(RECAP_MAX);
  expect(out.length).toBe(RECAP_MAX);
});

test('parseRecap keeps a very long last message inside the cap', () => {
  const out = parseRecap('{"recap": "corto"}', 'x'.repeat(2000));
  expect(out.endsWith('»')).toBe(true);
  expect(out.length).toBeLessThanOrEqual(RECAP_MAX);
});

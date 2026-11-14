/** @jest-environment node */
import { detectLang } from '../src/lang';

test('spanish question detected as es', () => {
  expect(detectLang('Hola, ¿cuánto cuesta?')).toBe('es');
});

test('english question detected as en', () => {
  expect(detectLang('How much is a session?')).toBe('en');
});

test('short neutral text falls back to es', () => {
  expect(detectLang('ok')).toBe('es');
});

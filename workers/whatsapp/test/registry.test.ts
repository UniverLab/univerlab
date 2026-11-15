/** @jest-environment node */
import { nameBase, register, formatNote } from '../src/registry';

test('nameBase cleans, lowercases and hyphenates the profile name', () => {
  expect(nameBase('María Gómez')).toBe('maria-gomez');
  expect(nameBase('  JUAN   Pérez  ')).toBe('juan-perez');
  expect(nameBase('Ana')).toBe('ana');
});

test('nameBase caps at 16 characters and falls back to cliente', () => {
  expect(nameBase('Alexandra Del Carmen Rodríguez')).toBe('alexandra-del-ca');
  expect(nameBase('Alexandra Del Carmen Rodríguez')).toHaveLength(16);
  expect(nameBase('')).toBe('cliente');
  expect(nameBase('!!!')).toBe('cliente');
  expect(nameBase('[Ana]')).toBe('ana');
});

test('nameBase keeps the email local part for a web booking', () => {
  expect(nameBase('maria.gomez@example.com')).toBe('mariagomez');
});

test('register falls back to the local name without a binding', async () => {
  await expect(
    register({} as never, { phone: '573001112222', name: 'María G', lang: 'es', kind: 'handoff', service: '' })
  ).resolves.toBe('maria-g');
  await expect(
    register({} as never, { phone: '573001112222', name: '', lang: 'es', kind: 'handoff', service: '', email: 'juan@example.com' })
  ).resolves.toBe('juan');
});

test('formatNote starts with the name, tag and priority', () => {
  expect(formatNote('maria-g', 'hola', 'SOPORTE', 'high')).toBe('[maria-g] SOPORTE · alta\nhola');
  expect(formatNote('juan-2', 'hola', 'CITA', 'normal')).toBe('[juan-2] CITA · normal\nhola');
  expect(formatNote('luz', 'hola', 'COLABORACIÓN', 'low')).toBe('[luz] COLABORACIÓN · baja\nhola');
});

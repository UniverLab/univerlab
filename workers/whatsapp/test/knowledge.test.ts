/** @jest-environment node */
import { knowledge } from '../src/knowledge';

test('spanish knowledge quotes pesos for a Colombian number and dollars otherwise', () => {
  const co = knowledge('es', '573001234567');
  for (const s of [
    '150.000 COP',
    '900.000 COP',
    'Reservas y pagas',
    'Trabajamos tu caso',
    '30 días de soporte',
    '24 horas',
    'Ley 1480 de 2011',
    'siguen abiertos',
    'https://univerlab.org/es/workbench/',
    'canopy:',
  ]) {
    expect(co).toContain(s);
  }
  expect(co).not.toContain('USD 45');
  expect(co).not.toContain('USD 250');
  const abroad = knowledge('es', '14155552671');
  expect(abroad).toContain('USD 45');
  expect(abroad).toContain('USD 250');
  expect(abroad).not.toContain('150.000 COP');
  expect(abroad).not.toContain('900.000 COP');
});

test('knowledge without a phone number defaults to dollars', () => {
  const k = knowledge('es');
  expect(k).toContain('USD 45');
  expect(k).toContain('USD 250');
  expect(k).not.toContain('150.000 COP');
  expect(k).not.toContain('900.000 COP');
});

test('both languages carry the publishing offers from the same dictionaries', () => {
  const es = knowledge('es', '573001234567');
  for (const s of [
    'Auditorías fundadoras',
    'Audita en público',
    'Reauditoría',
    '50 %',
    '20 %',
    '30 % menos',
    'no se acumulan',
  ]) {
    expect(es).toContain(s);
  }
  const en = knowledge('en', '14155552671');
  for (const s of [
    'Founding audits',
    'Audit in public',
    'Re-audit',
    '50 %',
    '20 %',
    '30 % less',
    'do not stack',
  ]) {
    expect(en).toContain(s);
  }
});

test('english knowledge quotes pesos for a Colombian number and dollars otherwise', () => {
  const co = knowledge('en', '+573001234567');
  expect(co).toContain('COP 150,000');
  expect(co).toContain('COP 900,000');
  expect(co).not.toContain('USD 45');
  expect(co).not.toContain('USD 250');
  const abroad = knowledge('en', '14155552671');
  for (const s of [
    'USD 45',
    'USD 250',
    'You book and pay',
    'We work your case',
    '30 days of support',
    'Right of retraction',
    'stay open',
    'https://univerlab.org/workbench/',
    'canopy:',
  ]) {
    expect(abroad).toContain(s);
  }
  expect(abroad).not.toContain('COP 150,000');
  expect(abroad).not.toContain('COP 900,000');
});

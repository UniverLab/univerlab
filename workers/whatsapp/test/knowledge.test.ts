/** @jest-environment node */
import { knowledge } from '../src/knowledge';

test('spanish knowledge carries workbench copy', () => {
  const k = knowledge('es');
  for (const s of [
    '150.000 COP',
    'Desde 900.000 COP',
    'USD 45',
    'Bre-B',
    'PayPal',
    'Reservas y pagas',
    'Trabajamos tu caso',
    '30 días de soporte',
    '24 horas',
    'Ley 1480 de 2011',
    'siguen abiertos',
    'https://univerlab.org/es/workbench/',
    'canopy:',
  ]) {
    expect(k).toContain(s);
  }
});

test('english knowledge carries workbench copy', () => {
  const k = knowledge('en');
  for (const s of [
    'COP 150,000',
    'From COP 900,000',
    'USD 45',
    'You book and pay',
    'We work your case',
    '30 days of support',
    'Right of retraction',
    'stay open',
    'https://univerlab.org/workbench/',
    'canopy:',
  ]) {
    expect(k).toContain(s);
  }
});

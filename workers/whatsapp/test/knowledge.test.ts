/** @jest-environment node */
import { knowledge } from '../src/knowledge';

test('spanish knowledge carries workbench copy', () => {
  const k = knowledge('es');
  for (const s of [
    '150.000 COP',
    'USD 45',
    'Bre-B',
    'Nequi',
    'PayPal',
    '24 horas',
    'Ley 1480 de 2011',
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
    'USD 45',
    'Right of retraction',
    'https://univerlab.org/workbench/',
    'canopy:',
  ]) {
    expect(k).toContain(s);
  }
});

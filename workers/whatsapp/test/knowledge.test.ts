/** @jest-environment node */
import { knowledge } from '../src/knowledge';

test('spanish knowledge quotes pesos for a Colombian number and dollars otherwise', () => {
  const co = knowledge('es', '573001234567');
  for (const s of [
    '150.000 COP',
    '550.000 COP',
    '1.500.000 COP',
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
  expect(co).not.toContain('USD 400');
  const abroad = knowledge('es', '14155552671');
  expect(abroad).toContain('USD 45');
  expect(abroad).toContain('USD 150');
  expect(abroad).toContain('USD 400');
  expect(abroad).not.toContain('150.000 COP');
  expect(abroad).not.toContain('1.500.000 COP');
});

test('knowledge without a phone number defaults to dollars', () => {
  const k = knowledge('es');
  expect(k).toContain('USD 45');
  expect(k).toContain('USD 150');
  expect(k).toContain('USD 400');
  expect(k).not.toContain('150.000 COP');
  expect(k).not.toContain('1.500.000 COP');
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
  expect(co).toContain('COP 550,000');
  expect(co).toContain('COP 1,500,000');
  expect(co).not.toContain('USD 45');
  expect(co).not.toContain('USD 400');
  const abroad = knowledge('en', '14155552671');
  for (const s of [
    'USD 45',
    'USD 150',
    'USD 400',
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
  expect(abroad).not.toContain('COP 1,500,000');
});

test('knowledge shows the live founding count, drops the offer at zero, keeps it when unreadable', () => {
  const withCount = knowledge('es', '573001234567', 3);
  expect(withCount).toContain('Auditorías fundadoras');
  expect(withCount).toContain('Quedan 3 de 5');
  const enCount = knowledge('en', '14155552671', 3);
  expect(enCount).toContain('Founding audits');
  expect(enCount).toContain('3 of 5 left');
  const taken = knowledge('es', '573001234567', 0);
  expect(taken).not.toContain('Auditorías fundadoras');
  expect(taken).toContain('Audita en público');
  for (const lang of ['es', 'en'] as const) {
    const unknown = knowledge(lang, '14155552671', null);
    expect(unknown).toContain(lang === 'es' ? 'Auditorías fundadoras' : 'Founding audits');
    expect(unknown).not.toContain('Quedan');
    expect(unknown).not.toContain('of 5 left');
    const legacy = knowledge(lang, '14155552671');
    expect(legacy).toContain(lang === 'es' ? 'Auditorías fundadoras' : 'Founding audits');
  }
});

test('knowledge carries the audits lede, scope, deliverables, method and limits', () => {
  for (const lang of ['es', 'en'] as const) {
    const k = knowledge(lang, '14155552671');
    expect(k).toContain(lang === 'es' ? 'sin indulgencia' : 'without indulgence');
    expect(k).toContain(lang === 'es' ? 'Acceso y sesiones' : 'Access and sessions');
    expect(k).toContain('TeXForge');
    expect(k).toContain(lang === 'es' ? '6 meses' : '6 months');
    expect(k).not.toContain('60 d');
    expect(k).not.toMatch(/12 months|12 meses/);
    expect(k).toContain('DOI');
    expect(k).toContain(lang === 'es' ? 'Tres fuentes' : 'Three sources');
    expect(k).toContain(lang === 'es' ? 'Lo que una auditoría no es' : 'What an audit is not');
  }
});

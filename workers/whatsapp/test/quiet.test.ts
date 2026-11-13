/** @jest-environment node */
import { guardConfig } from '../src/guard';
import {
  awayNotice,
  formatHeldSummary,
  isQuietHour,
  nextBusinessMorning,
  nextQuietEnd,
} from '../src/quiet';

// 2026-01-05 is a business Monday; Bogota stays at UTC-5 all year.
const BOGOTA = (day: number, hour: number, minute: number): number =>
  Date.UTC(2026, 0, day, hour + 5, minute, 0);

test('quiet hours wrap midnight: 19:00 starts, 07:00 ends', () => {
  const cfg = guardConfig({});
  expect(isQuietHour(BOGOTA(5, 6, 59), cfg)).toBe(true);
  expect(isQuietHour(BOGOTA(5, 7, 0), cfg)).toBe(false);
  expect(isQuietHour(BOGOTA(5, 12, 0), cfg)).toBe(false);
  expect(isQuietHour(BOGOTA(5, 18, 59), cfg)).toBe(false);
  expect(isQuietHour(BOGOTA(5, 19, 0), cfg)).toBe(true);
  expect(isQuietHour(BOGOTA(5, 23, 30), cfg)).toBe(true);
});

test('the morning alarm is the next 07:00 Bogota', () => {
  const cfg = guardConfig({});
  expect(nextQuietEnd(BOGOTA(5, 20, 0), cfg)).toBe(BOGOTA(6, 7, 0));
  expect(nextQuietEnd(BOGOTA(5, 6, 59), cfg)).toBe(BOGOTA(5, 7, 0));
});

test('the next business morning skips the weekend', () => {
  // Friday 2026-01-16 20:00 Bogota -> Monday 2026-01-19 07:00 Bogota.
  // (The 9th is avoided: Reyes Magos moves to Monday the 12th that year.)
  expect(nextBusinessMorning(Date.UTC(2026, 0, 17, 1, 0, 0))).toBe(Date.UTC(2026, 0, 19, 12, 0, 0));
});

test('the next business morning skips Colombian holidays', () => {
  // 2026-01-01 (Thursday) is a fixed holiday: from New Year's Eve night the
  // next morning a person answers is Friday 07:00 Bogota.
  expect(nextBusinessMorning(Date.UTC(2026, 0, 1, 1, 0, 0))).toBe(Date.UTC(2026, 0, 2, 12, 0, 0));
});

test('before 07:00 on a business day the morning is today', () => {
  expect(nextBusinessMorning(BOGOTA(5, 6, 0))).toBe(BOGOTA(5, 7, 0));
});

test('awayNotice names the date in both languages', () => {
  expect(awayNotice('es', 'lunes 12 de enero, 07:00 (hora Colombia)')).toContain(
    'lunes 12 de enero, 07:00 (hora Colombia)'
  );
  expect(awayNotice('en', 'Monday, January 12, 07:00 (Colombia time)')).toContain(
    'Monday, January 12, 07:00 (Colombia time)'
  );
});

test('the held summary groups oldest first, then the pending names', () => {
  const body = formatHeldSummary([
    { name: 'beto', text: 'primero', tag: 'MENSAJE', priority: 'normal' },
    { name: 'ana', text: 'hola', tag: 'CITA', priority: 'high' },
    { name: 'beto', text: 'segundo', tag: 'MENSAJE', priority: 'normal' },
  ]);
  expect(body).toBe(
    [
      'UniverLab · mensajes en espera',
      '[beto] MENSAJE · normal\nprimero',
      '[beto] MENSAJE · normal\nsegundo',
      '[ana] CITA · alta\nhola',
      'Pendientes: ana',
    ].join('\n')
  );
});

test('a summary without high-priority notes has no pending line', () => {
  const body = formatHeldSummary([
    { name: 'beto', text: 'primero', tag: 'MENSAJE', priority: 'normal' },
  ]);
  expect(body).toBe('UniverLab · mensajes en espera\n[beto] MENSAJE · normal\nprimero');
});

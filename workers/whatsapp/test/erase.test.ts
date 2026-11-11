/** @jest-environment node */
import {
  alarmAt,
  deletionRequest,
  ERASED,
  operatorErased,
  retentionDeadline,
} from '../src/erase';

test('spanish deletion command detected as es', () => {
  expect(deletionRequest('BORRAR MIS DATOS')).toBe('es');
});

test('spanish deletion command with accents and punctuation detected as es', () => {
  expect(deletionRequest(' Bórrar mis datos!!! ')).toBe('es');
});

test('spanish deletion command wrapped in question marks detected as es', () => {
  expect(deletionRequest('¿borrar mis datos?')).toBe('es');
});

test('english deletion command detected as en', () => {
  expect(deletionRequest('delete my data')).toBe('en');
});

test('english deletion command with case and punctuation detected as en', () => {
  expect(deletionRequest(' Delete My Data! ')).toBe('en');
});

test('near-miss phrases are not deletion requests', () => {
  expect(deletionRequest('quiero borrar mis datos')).toBeNull();
  expect(deletionRequest('delete my data now')).toBeNull();
  expect(deletionRequest('')).toBeNull();
});

test('retention deadline is six months after the message', () => {
  expect(retentionDeadline(Date.UTC(2026, 0, 15, 12))).toBe(Date.UTC(2026, 6, 15, 12));
});

test('alarm converts Meta seconds to milliseconds', () => {
  expect(alarmAt(1767225600)).toBe(retentionDeadline(1767225600000));
});

test('alarm falls back to now for missing timestamps', () => {
  const now = Date.UTC(2026, 2, 10, 8);
  expect(alarmAt(0, now)).toBe(retentionDeadline(now));
});

test('erased confirmations mention WhatsApp and differ by language', () => {
  expect(ERASED.es).toMatch(/WhatsApp/);
  expect(ERASED.en).toMatch(/WhatsApp/);
  expect(ERASED.es).not.toBe(ERASED.en);
});

test('operator notice names the phone number', () => {
  expect(operatorErased('573001234567')).toContain('573001234567');
});

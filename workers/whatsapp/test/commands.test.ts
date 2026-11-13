/** @jest-environment node */
import { parseCommand, looksLegacy, normName, err, HELP } from '../src/commands';

test('HELP lists every command on its own line', () => {
  const lines = HELP.split('\n');
  expect(lines).toHaveLength(7);
  for (const cmd of ['/help', '/recap', '/response', '/take', '/release', '/confirm', '/cancel']) {
    expect(lines.some((l) => l.startsWith(cmd))).toBe(true);
  }
});

test('parseCommand accepts every command, case-insensitive', () => {
  expect(parseCommand('/help')).toEqual({ cmd: 'help' });
  expect(parseCommand('/HELP')).toEqual({ cmd: 'help' });
  expect(parseCommand('  /Recap  ')).toEqual({ cmd: 'recap' });
  expect(parseCommand('/recap maria-g')).toEqual({ cmd: 'recap', name: 'maria-g' });
  expect(parseCommand('/RECAP María')).toEqual({ cmd: 'recap', name: 'maria' });
  expect(parseCommand('/response maria-g hola Ana')).toEqual({ cmd: 'response', name: 'maria-g', text: 'hola Ana' });
  expect(parseCommand('/response maria-g hola\nsegunda línea')).toEqual({
    cmd: 'response',
    name: 'maria-g',
    text: 'hola\nsegunda línea',
  });
  expect(parseCommand('/take juan-2')).toEqual({ cmd: 'take', name: 'juan-2' });
  expect(parseCommand('/release')).toEqual({ cmd: 'release' });
  expect(parseCommand('/confirm maria-g')).toEqual({ cmd: 'confirm', name: 'maria-g' });
  expect(parseCommand('/cancel juan-2')).toEqual({ cmd: 'cancel', name: 'juan-2' });
});

test('parseCommand rejects unknown or malformed commands', () => {
  expect(parseCommand('hola')).toBeNull();
  expect(parseCommand('')).toBeNull();
  expect(parseCommand('/')).toBeNull();
  expect(parseCommand('/bailar')).toBeNull();
  expect(parseCommand('/take')).toBeNull();
  expect(parseCommand('/take a b')).toBeNull();
  expect(parseCommand('/take María Gómez!')).toBeNull();
  expect(parseCommand('/response maria-g')).toBeNull();
  expect(parseCommand('/recap a b')).toBeNull();
  expect(parseCommand('/release x')).toBeNull();
  expect(parseCommand('/help x')).toBeNull();
  // The old Spanish words are no longer commands, with or without a slash.
  expect(parseCommand('ayuda')).toBeNull();
  expect(parseCommand('tomar ab12')).toBeNull();
  expect(parseCommand('/tomar ab12')).toBeNull();
  expect(parseCommand('/responder ab12 hola')).toBeNull();
  expect(parseCommand('/confirmar ab12')).toBeNull();
});

test('looksLegacy spots the retired language', () => {
  for (const word of ['ayuda', 'pendientes', 'responder', 'tomar', 'soltar', 'confirmar', 'cancelar', 'AYUDA']) {
    expect(looksLegacy(word)).toBe(true);
  }
  expect(looksLegacy('hola qué tal')).toBe(false);
  expect(looksLegacy('/take maria-g')).toBe(false);
  expect(looksLegacy('')).toBe(false);
});

test('normName lowercases and strips accents', () => {
  expect(normName('María')).toBe('maria');
  expect(normName('JUAN-2')).toBe('juan-2');
});

test('err says what was wrong and points at /help', () => {
  expect(err('No hay conversación abierta con [x].')).toBe('No hay conversación abierta con [x]. · /help');
});

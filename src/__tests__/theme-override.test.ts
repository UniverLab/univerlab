/**
 * A manual theme (the sky body or /theme) holds only until the clock's next
 * own turn — sunrise or sunset — then the page is circadian again. This runs
 * BaseLayout's head script itself under a fake clock, so the expiry is
 * checked as behaviour, not as source text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LAYOUT = readFileSync(resolve(__dirname, '..', 'layouts', 'BaseLayout.astro'), 'utf8');
const start = LAYOUT.indexOf('(function () {\n        // A manual theme');
const end = LAYOUT.indexOf('</script>', start);
const HEAD_SCRIPT = LAYOUT.slice(start, end);

type ThemeApi = { set(mode: string): void; clear(): void; read(): string | null };

function boot(at: Date): ThemeApi {
  jest.setSystemTime(at);
  new Function(HEAD_SCRIPT)();
  return (window as unknown as { univerlabTheme: ThemeApi }).univerlabTheme;
}

describe('a manual theme lasts until the next sunrise or sunset', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => jest.useRealTimers());

  it('finds the head script', () => {
    expect(start).toBeGreaterThan(-1);
  });

  it('keeps a night chosen at noon through the afternoon, drops it after sunset', () => {
    const theme = boot(new Date(2026, 9, 26, 12, 0));
    theme.set('night');
    expect(theme.read()).toBe('night');
    jest.setSystemTime(new Date(2026, 9, 26, 16, 0));
    expect(theme.read()).toBe('night');
    jest.setSystemTime(new Date(2026, 9, 26, 20, 0));
    expect(theme.read()).toBeNull();
    expect(localStorage.getItem('univerlab-theme')).toBeNull();
    expect(localStorage.getItem('univerlab-theme-until')).toBeNull();
  });

  it('does not survive to the next day at the same hour', () => {
    const theme = boot(new Date(2026, 9, 26, 10, 0));
    theme.set('night');
    jest.setSystemTime(new Date(2026, 9, 27, 10, 0));
    expect(theme.read()).toBeNull();
  });

  it('keeps a day chosen at night until the next sunrise', () => {
    const theme = boot(new Date(2026, 9, 26, 22, 0));
    theme.set('day');
    jest.setSystemTime(new Date(2026, 9, 27, 3, 0));
    expect(theme.read()).toBe('day');
    jest.setSystemTime(new Date(2026, 9, 27, 9, 0));
    expect(theme.read()).toBeNull();
  });

  it('treats an old key with no expiry as already expired', () => {
    localStorage.setItem('univerlab-theme', 'night');
    const theme = boot(new Date(2026, 9, 26, 12, 0));
    expect(theme.read()).toBeNull();
    expect(document.documentElement.dataset.celestial).toBe('sun');
  });

  it('paints a live override at boot', () => {
    const theme = boot(new Date(2026, 9, 26, 12, 0));
    theme.set('night');
    new Function(HEAD_SCRIPT)();
    expect(document.documentElement.dataset.celestial).toBe('moon');
  });
});

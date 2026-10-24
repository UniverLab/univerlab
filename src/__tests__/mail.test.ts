import {
  enqueue,
  readOpened,
  writeOpened,
  isSeen,
  markSeen,
  firstParagraph,
  labLetters,
  pastLetter,
  pastLetterParts,
  dailyFact,
  letterMode,
  boxLabel,
  LAB_MAIL_MAX_AGE_MS,
  type Announcement,
  type ExperimentInfo,
  type MailLetter,
  type PastLetter,
} from '../lib/mail';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPool, letterPool, type Fact } from '../lib/science-filter';

const DAY = 86400000;
const NOW = new Date('2026-10-24T12:00:00Z');

// The mailbox's own script, read as text: it owns the letter AND the science
// pool warm-up the header used to run before it stopped opening letters.
const MAIL_SRC = readFileSync(resolve(__dirname, '..', 'scripts', 'mail.ts'), 'utf8');

const EXP_CANOPY: ExperimentInfo = {
  id: 'canopy',
  name: 'Canopy',
  number: 'EXP-001',
  essenceHex: '#00a9a0',
};

function ann(id: string, daysAgo: number, topic: string | null = 'canopy'): Announcement {
  return {
    id,
    date: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    title: `Entry ${id}`,
    body: `First paragraph of ${id}.\n\nSecond paragraph.`,
    type: 'lanzamiento',
    topic,
    link: null,
  };
}

const COPY = {
  open: 'Mailbox: {n} new letters',
  openOne: 'Mailbox: one new letter',
  openNone: 'Mailbox: no new letters',
};

describe('the queue', () => {
  it('puts an arriving entry first (an SSE arrival goes to the front)', () => {
    const queue: MailLetter[] = [
      pastLetter({ year: '1928', text: 'penicillin', link: 'https://x' }, NOW),
    ];
    const arrival = labLetters([ann('a1', 0)], [], NOW, [EXP_CANOPY])[0];
    const next = enqueue(queue, arrival);
    expect(next.map((l) => l.id)).toEqual(['a1', 'past-2026-10-24']);
    // A second arrival of the same id never duplicates the letter.
    expect(enqueue(next, arrival)).toHaveLength(2);
  });
});

describe('opened letters are remembered per day', () => {
  it('reads back what was written for the same day and nothing for another', () => {
    localStorage.clear();
    writeOpened(['past-2026-10-24'], '2026-10-24');
    expect(readOpened('2026-10-24')).toEqual(['past-2026-10-24']);
    expect(readOpened('2026-10-23')).toEqual([]);
  });

  it('survives a corrupted value', () => {
    localStorage.setItem('univerlab-mail-2026-10-24', '{oops');
    expect(readOpened('2026-10-24')).toEqual([]);
  });

  it('marks a letter seen without losing the ones already marked', () => {
    const opened = markSeen('a1', ['past-2026-10-24']);
    expect(opened).toEqual(['past-2026-10-24', 'a1']);
    expect(markSeen('a1', opened)).toBe(opened);
    expect(isSeen('a1', opened)).toBe(true);
    expect(isSeen('a2', opened)).toBe(false);
  });
});

describe('letterMode', () => {
  const past = pastLetter({ year: '1928', text: 'penicillin', link: 'https://x' }, NOW);

  it('performs the ritual the first time and opens straight onto the letter once opened today', () => {
    expect(letterMode(past, [], false)).toBe('ritual');
    expect(letterMode(past, [past.id], false)).toBe('straight');
  });

  it('opens straight onto the letter under reduced motion', () => {
    expect(letterMode(past, [], true)).toBe('straight');
  });
});

describe('labLetters', () => {
  it('keeps entries from the last 7 days that are unopened, newest first, wearing their experiment', () => {
    const entries = [ann('a-1d', 1), ann('a-3d', 3), ann('a-now', 0)];
    const letters = labLetters(entries, [], NOW, [EXP_CANOPY]);
    expect(letters.map((l) => l.id)).toEqual(['a-now', 'a-1d', 'a-3d']);
    expect(letters[0].exp).toEqual(EXP_CANOPY);
    expect(letters[0].body).toBe('First paragraph of a-now.');
  });

  it('skips an entry published more than 7 days ago', () => {
    expect(labLetters([ann('too-old', 8)], [], NOW, [EXP_CANOPY])).toHaveLength(0);
    // The boundary itself counts as within the week.
    expect(labLetters([ann('edge', LAB_MAIL_MAX_AGE_MS / DAY)], [], NOW, [EXP_CANOPY])).toHaveLength(1);
  });

  it('skips an entry this browser has already opened', () => {
    expect(labLetters([ann('seen', 1)], ['seen'], NOW, [EXP_CANOPY])).toHaveLength(0);
  });

  it('leaves an entry that names no experiment without an experiment line', () => {
    const [general] = labLetters([ann('g1', 1, 'general')], [], NOW, [EXP_CANOPY]);
    expect(general.exp).toBeUndefined();
    expect(general.link).toBe('/status/');
    const [canopy] = labLetters([ann('g2', 1, 'canopy')], [], NOW, [EXP_CANOPY]);
    expect(canopy.link).toBe('/status/?topic=canopy');
  });
});

describe('the letter from the past', () => {
  it('is one per day, its id bound to the calendar day', () => {
    const a = pastLetter({ year: '1928', text: 'penicillin', link: 'https://x' }, NOW);
    const b = pastLetter({ year: '1833', text: 'Nobel', link: 'https://y' }, NOW);
    expect(a.id).toBe('past-2026-10-24');
    expect(b.id).toBe('past-2026-10-24');
    expect(dailyFact(['one', 'two', 'three'], NOW)).toBe(dailyFact(['one', 'two', 'three'], NOW));
    expect(dailyFact([], NOW)).toBeNull();
    expect(dailyFact(null as unknown as string[], NOW)).toBeNull();
  });

  it('draws nothing when the day has no event: the mailbox queues no past letter', () => {
    // A pool of filtered births and deaths only — the letter must never
    // fall back to either of them.
    const pool = buildPool(
      {
        events: [],
        births: [{ year: 1833, text: 'Alfred Nobel, Swedish chemist and inventor of dynamite, is born.' }],
        deaths: [{ year: 1962, text: 'Niels Bohr, Danish physicist, dies.' }],
      },
      'en',
    );
    expect(pool.filter((f) => f.kind === 'born')).toHaveLength(1);
    expect(pool.filter((f) => f.kind === 'died')).toHaveLength(1);
    expect(letterPool(pool)).toEqual([]);
    expect(dailyFact<Fact>(letterPool(pool), NOW)).toBeNull();
    // The script's early return on a null fact is what keeps the queue (and
    // the flag) untouched that day.
    expect(MAIL_SRC).toMatch(
      /const fact = dailyFact<Fact>\(letterPool\(pool\), new Date\(\)\);\s*if \(!fact\) return;/,
    );
  });
});

describe('the letter from the past carries a summary', () => {
  const COPY2 = { readWikipedia: 'Read on Wikipedia →', continuesWikipedia: 'Continues on Wikipedia →' };

  it('pastLetter copies both summary fields', () => {
    const l = pastLetter(
      { year: '2007', text: 'China lanza la sonda lunar.', link: 'https://x', summary: 'Cuerpo.', summaryCut: true },
      NOW,
    );
    expect(l.summary).toBe('Cuerpo.');
    expect(l.summaryCut).toBe(true);
    const plain = pastLetter({ year: '1928', text: 'penicillin', link: 'https://x' }, NOW);
    expect(plain.summary).toBeUndefined();
    expect(plain.summaryCut).toBeUndefined();
  });

  it('parts print headline + summary with the continue label when cut', () => {
    const l: PastLetter = {
      kind: 'past',
      id: 'past-2026-10-24',
      year: '2007',
      text: 'China lanza la sonda lunar.',
      link: 'https://x',
      summary: 'Chang\u2019e 1 fue la primera sonda lunar de China. Fue lanzada en 2007.',
      summaryCut: true,
    };
    const parts = pastLetterParts(l, COPY2);
    expect(parts.headline).toBe('China lanza la sonda lunar.');
    expect(parts.body.endsWith('…')).toBe(true);
    expect(parts.body).toContain('Chang\u2019e 1');
    expect(parts.linkLabel).toBe('Continues on Wikipedia →');
  });

  it('parts print the text as the body with the read label and no headline without a summary', () => {
    const l = pastLetter({ year: '1928', text: 'penicillin', link: 'https://x' }, NOW);
    const parts = pastLetterParts(l, COPY2);
    expect(parts.headline).toBe('');
    expect(parts.body).toBe('penicillin');
    expect(parts.linkLabel).toBe('Read on Wikipedia →');
  });

  it('an uncut summary keeps the read label', () => {
    const l = pastLetter(
      { year: '2007', text: 'Titular.', link: 'https://x', summary: 'Cuerpo corto.', summaryCut: false },
      NOW,
    );
    expect(pastLetterParts(l, COPY2).linkLabel).toBe('Read on Wikipedia →');
  });

  it('the mailbox script renders the parts: headline h2, summary body, continue label', () => {
    expect(MAIL_SRC).toMatch(/pastLetterParts\(m, copy\)/);
    expect(MAIL_SRC).toMatch(/parts\.headline/);
    expect(MAIL_SRC).toMatch(/parts\.linkLabel/);
    expect(MAIL_SRC).toContain('continuesWikipedia');
  });
});

/* The rest of the papers. */
describe('the rest of the papers', () => {
  it('takes the first paragraph of an entry', () => {
    expect(firstParagraph('A line.\n\nAnother.\nAnd more.')).toBe('A line.');
    expect(firstParagraph('  padded  \n\n body ')).toBe('padded');
    expect(firstParagraph('')).toBe('');
  });

  it('names the count in the accessible label', () => {
    expect(boxLabel(COPY, 0)).toBe('Mailbox: no new letters');
    expect(boxLabel(COPY, 1)).toBe('Mailbox: one new letter');
    expect(boxLabel(COPY, 3)).toBe('Mailbox: 3 new letters');
  });
});

describe('the science pool warm-up', () => {
  it('lives in the mailbox script so the first letter opens without the network', () => {
    // Moved here from Header.astro, which no longer opens letters: the pool
    // is warmed off the critical path under the same idle schedule as before.
    expect(MAIL_SRC).toMatch(
      /const warmLang: FilterLang = document\.documentElement\.lang === 'es' \? 'es' : 'en'/,
    );
    expect(MAIL_SRC).toMatch(/if \(!readOtdCache\(warmLang\)\)/);
    expect(MAIL_SRC).toMatch(/requestIdleCallback\(warm, \{ timeout: 5000 \}\)/);
    expect(MAIL_SRC).toMatch(/setTimeout\(warm, 4000\)/);
    // The mailbox keeps the only letter hook the site has.
    expect(MAIL_SRC).toMatch(/univerlabOpenMail/);
  });
});

describe('the letter\u2019s open state belongs to the mailbox', () => {
  it('stops marking the sky body expanded — the celestial button switches themes now', () => {
    // Since the header dropped openMail (FR2), an aria-expanded written on
    // .celestial-btn would announce the letter on the theme button. The state
    // stays on the box that owns the letter.
    expect(MAIL_SRC).not.toMatch(/celestial\.setAttribute\('aria-expanded'/);
    expect(MAIL_SRC).toMatch(/box\.setAttribute\('aria-expanded', 'true'\)/);
    expect(MAIL_SRC).toMatch(/box\.setAttribute\('aria-expanded', 'false'\)/);
    // The outside-pointer close keeps its guard for the dialog and the box.
    expect(MAIL_SRC).toMatch(/!pop\.contains\(t\) && !box\.contains\(t\)/);
  });
});

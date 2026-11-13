import {
  enqueue,
  readOpened,
  writeOpened,
  readLabSeen,
  writeLabSeen,
  LAB_SEEN_MAX,
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
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const DAY = 86400000;
const NOW = new Date('2026-10-24T12:00:00Z');

// The mailbox's own script, read as text: it owns the letter, and it fetches
// the past letter lazily on the first open — never during load.
const MAIL_SRC = readFileSync(resolve(__dirname, '..', 'scripts', 'mail.ts'), 'utf8');
const MAIL_CSS = readFileSync(resolve(__dirname, '..', 'styles', 'mail.css'), 'utf8');

/** The declarations of one exact stylesheet rule: matching the selector alone
 *  would confuse `.letter p` with `.letter.past p`. */
function rule(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${esc}\\s*\\{([^}]*)\\}`).exec(MAIL_CSS)?.[1] ?? '';
}

/** A custom property's value, as declared on `:root`. */
function token(name: string): string {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(MAIL_CSS)?.[1].trim() ?? '';
}

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

describe('opened lab letters are remembered across days', () => {
  it('keeps a release letter out of tomorrow\'s mail once it was opened', () => {
    localStorage.clear();
    writeLabSeen(['rel-canopy']);
    const now = new Date('2026-10-26T12:00:00Z');
    const entries: Announcement[] = [
      { id: 'rel-canopy', date: '2026-10-24T10:00:00Z', title: 'canopy', body: 'b' },
      { id: 'rel-quorum', date: '2026-10-23T10:00:00Z', title: 'quorum', body: 'b' },
    ];
    const opened = readOpened('2026-10-26').concat(readLabSeen());
    expect(labLetters(entries, opened, now, []).map((l) => l.id)).toEqual(['rel-quorum']);
  });

  it('keeps only the newest ids', () => {
    localStorage.clear();
    const ids = Array.from({ length: LAB_SEEN_MAX + 5 }, (_, i) => `e${i}`);
    writeLabSeen(ids);
    const kept = readLabSeen();
    expect(kept).toHaveLength(LAB_SEEN_MAX);
    expect(kept[kept.length - 1]).toBe(`e${LAB_SEEN_MAX + 4}`);
  });

  it('survives a corrupted value', () => {
    localStorage.setItem('univerlab-mail-lab', '{oops');
    expect(readLabSeen()).toEqual([]);
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
    expect(general.link).toBe('/newspaper/#lab');
    const [canopy] = labLetters([ann('g2', 1, 'canopy')], [], NOW, [EXP_CANOPY]);
    expect(canopy.link).toBe('/newspaper/?topic=canopy#lab');
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
    // The typed body comes from the summary too: without this branch the
    // letter would still print the one line twice.
    expect(MAIL_SRC).toMatch(/if \(m\.summary\) return summaryText\(m\);/);
  });
});

/* The two touches on the past letter: it links to the newspaper and it reads
   in its period hand. build() is closure-local, so both halves are asserted on
   the sources the dialog renders from — the class branch and the stylesheet. */
describe('a letter from the past', () => {
  it('carries the past class on its letter node; the lab letter does not', () => {
    // One ternary, chosen by the lab branch, written on the article — remove
    // either half and the past letter loses its class.
    expect(MAIL_SRC).toMatch(/const letterCls = lab \? 'letter' : 'letter past';/);
    expect(MAIL_SRC).toMatch(/<article class="\$\{letterCls\}">/);
    expect(MAIL_SRC).not.toMatch(/<article class="letter">/);
    // The lab branch is the plain class: no "past" reaches a lab letter.
    expect(MAIL_SRC).toMatch(/const letterCls = lab \? 'letter' :/);
  });

  it('sets the past headline and body in the period hand and leaves lab letters in mono', () => {
    // The hand sits on the past-only rules — remove either half and the past
    // letter loses its face.
    expect(rule('.mail-pop .letter.past h2')).toMatch(/font-family:\s*var\(--mail-hand\)/);
    expect(rule('.mail-pop .letter.past p')).toMatch(/font-family:\s*var\(--mail-hand\)/);
    // Ceiling: the hand is smaller than today's text, which is the point of it.
    const head = parseFloat(token('--mail-past-head'));
    const body = parseFloat(token('--mail-past-body'));
    expect(head).toBeLessThan(parseFloat(token('--mail-head')));
    expect(body).toBeLessThan(parseFloat(token('--mail-body')));
    // The sizes are read from those tokens, never written inline in the rule.
    expect(rule('.mail-pop .letter.past h2')).toMatch(/font-size:\s*var\(--mail-past-head\)/);
    expect(rule('.mail-pop .letter.past p')).toMatch(/font-size:\s*var\(--mail-past-body\)/);
    // No hand on the shared rules: a lab letter stays upright in mono.
    expect(rule('.mail-pop .letter p')).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(rule('.mail-pop .letter h2')).toMatch(/font-family:\s*var\(--font-serif\)/);
    // Meta and links keep the site's type so dates and links stay legible.
    expect(rule('.mail-pop .letter .meta')).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(rule('.mail-pop .letter a')).toMatch(/font-family:\s*var\(--font-mono\)/);
    // The italic is gone from letter text: the hand carries the period now.
    // (The address side keeps its own italic, which is not letter text.)
    expect(rule('.mail-pop .letter.past p')).not.toMatch(/font-style/);
    expect(rule('.mail-pop .letter.past h2')).not.toMatch(/font-style/);
    expect(rule('.mail-pop .letter p')).not.toMatch(/font-style/);
    expect(rule('.mail-pop .letter h2')).not.toMatch(/font-style/);
  });

  it('gives the hand the leading its ink needs', () => {
    // Homemade Apple's ascender-to-descender ink is ~1.8em, so a wrapped
    // headline at the shared 1.15 collides with itself. The past rules set
    // their own, and it is looser than the shared one.
    const shared = parseFloat(/line-height:\s*([\d.]+)/.exec(rule('.mail-pop .letter h2'))?.[1] ?? '0');
    const past = parseFloat(/line-height:\s*([\d.]+)/.exec(rule('.mail-pop .letter.past h2'))?.[1] ?? '0');
    expect(past).toBeGreaterThan(shared);
    expect(parseFloat(/line-height:\s*([\d.]+)/.exec(rule('.mail-pop .letter.past p'))?.[1] ?? '0')).toBeGreaterThan(1.5);
  });

  it('says "See the newspaper" under the letter in both languages', () => {
    expect(en.header.mailbox.allToday).toBe('See the newspaper →');
    expect(es.header.mailbox.allToday).toBe('Ver el periódico →');
    // The past letter alone renders the link, to /newspaper/ — the newspaper.
    expect(MAIL_SRC).toMatch(/copy\.allToday/);
    expect(MAIL_SRC).toMatch(/const todayHref = lang === 'es' \? '\/es\/newspaper\/' : '\/newspaper\/';/);
  });
});

/* The sheet keeps a letter page's proportions at every width, and the hand
   is self-hosted. */
describe('the sheet keeps a letter page', () => {
  it('holds portrait proportions with the body scrolling inside', () => {
    // The sheet is a page near 1 : 1.3, never a strip that stretches.
    const ratio = /aspect-ratio:\s*([\d.]+)\s*\/\s*([\d.]+)/.exec(rule('.mail-pop .letter'));
    expect(ratio).not.toBeNull();
    expect(parseFloat(ratio![2]) / parseFloat(ratio![1])).toBeCloseTo(1.3, 2);
    expect(MAIL_CSS).not.toMatch(/min-height:\s*118%/);
    // A long body scrolls inside the sheet instead of stretching it.
    expect(rule('.mail-pop .letter p')).toMatch(/overflow-y:\s*auto/);
    // A flex item only shrinks below its content with min-height:0. A floor
    // here (the old 6.2em) let a long headline push the links past the
    // fixed-height sheet, where overflow:hidden clipped them.
    expect(rule('.mail-pop .letter p')).toMatch(/min-height:\s*0/);
    expect(rule('.mail-pop .letter p')).not.toMatch(/min-height:\s*6\.2em/);
    // The sheet clips its own edges for the deckle, so nothing may escape it.
    expect(rule('.mail-pop .letter')).toMatch(/overflow:\s*hidden/);
    // An unbroken token wraps instead of forcing a sideways scroll.
    expect(rule('.mail-pop .letter p')).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('keeps the typed line in view while the body scrolls', () => {
    // Typing happens inside a now-scrollable body: without moving the page
    // with the caret, everything after the first screenful types off-screen.
    expect(MAIL_SRC).toMatch(/const typed = \$\('\.typed'\)[^\n]*\.letter p'\)/);
    expect(MAIL_SRC).toMatch(
      /typed\.textContent = text\.slice\(0, i\);\s*body\.scrollTop = body\.scrollHeight;/,
    );
  });

  it('types the whole body and cuts nothing to fit', () => {
    // fitBody cut the text on a word to fit a stretching sheet; the sheet now
    // scrolls instead, so the full text is typed.
    expect(MAIL_SRC).not.toMatch(/fitBody/);
    expect(MAIL_SRC).not.toMatch(/MIN_WORDS/);
    expect(MAIL_SRC).toMatch(/const text = bodyOf\(letter\)/);
  });
});

describe('the past hand is self-hosted', () => {
  it('declares the face in mail.css and ships the file, loading nothing on first paint', () => {
    expect(MAIL_CSS).toMatch(/@font-face/);
    expect(MAIL_CSS).toMatch(/\/fonts\/HomemadeApple-Regular\.ttf/);
    expect(MAIL_CSS).toMatch(/font-display:\s*swap/);
    // The token only the letter's past rules use — so no other rule can pull
    // the file onto the first paint.
    expect(token('--mail-hand')).toMatch(/'Homemade Apple'/);
    // The file the face points at is really on disk, and it is a TrueType
    // font whose embedded notices name the licence it actually ships under.
    const ttf = readFileSync(
      resolve(__dirname, '..', '..', 'public', 'fonts', 'HomemadeApple-Regular.ttf'),
    );
    expect(ttf.length).toBeGreaterThan(0);
    expect(ttf.toString('latin1').includes('Homemade Apple')).toBe(true);
    expect(ttf.toString('latin1')).toMatch(/Apache License, Version 2\.0/);
    // The licence text ships beside it, and it is the Apache one the font
    // declares — not an OFL text that contradicts the embedded notices.
    const lic = readFileSync(
      resolve(__dirname, '..', '..', 'public', 'fonts', 'HomemadeApple-LICENSE.txt'),
      'utf8',
    );
    expect(lic).toMatch(/Apache License/);
    // No preload: the face is used only by letter text, so it is fetched
    // the first time a letter opens, adding nothing to the first load.
    const layout = readFileSync(resolve(__dirname, '..', 'layouts', 'BaseLayout.astro'), 'utf8');
    expect(layout).not.toMatch(/HomemadeApple/);
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
  it('is gone: no feed downloads until the visitor opens the mailbox', () => {
    // The warm block used to fetch the Wikipedia pool during load. Now the
    // first open fetches the past letter once and opens it when it lands.
    expect(MAIL_SRC).not.toMatch(/warmLang/);
    expect(MAIL_SRC).not.toMatch(/requestIdleCallback\(warm/);
    expect(MAIL_SRC).not.toContain('void loadPast();');
    expect(MAIL_SRC).toContain('let pastRequested = false;');
    expect(MAIL_SRC).toMatch(/if \(!pastRequested\)/);
    expect(MAIL_SRC).toMatch(/pastRequested = true/);
    expect(MAIL_SRC).toMatch(/void loadPast\(\)\.then/);
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

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
import { buildPool, collectFacts, letterPool, type Fact } from '../lib/science-filter';
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
  openOne: 'Mailbox: 1 new letter',
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

  it('reads the Spanish text when asked and translated, else English', () => {
    const translated: Announcement = {
      ...ann('t-1d', 1),
      title_es: 'Titular',
      body_es: 'Primer párrafo.\n\nSegundo párrafo.',
    };
    const [es] = labLetters([translated], [], NOW, [EXP_CANOPY], 'es');
    expect(es.title).toBe('Titular');
    expect(es.body).toBe('Primer párrafo.');
    // English is unchanged by the translation.
    const [en] = labLetters([translated], [], NOW, [EXP_CANOPY]);
    expect(en.title).toBe('Entry t-1d');
    expect(en.body).toBe('First paragraph of t-1d.');
    // No translation falls back to English, even in Spanish.
    const [fallback] = labLetters([ann('u-1d', 1)], [], NOW, [EXP_CANOPY], 'es');
    expect(fallback.title).toBe('Entry u-1d');
    expect(fallback.body).toBe('First paragraph of u-1d.');
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

  it('the mailbox script types the passages when there is no summary', () => {
    expect(MAIL_SRC).toMatch(/if \(m\.passages\?\.length\) return passagesText\(m\.passages\);/);
  });
});

describe('the letter from the past carries passages', () => {
  const COPY2 = { readWikipedia: 'Read on Wikipedia →', continuesWikipedia: 'Continues on Wikipedia →' };
  // The recorded 18 November 2026 Spanish edition: the Diesel event has no
  // text of its own, so the letter must carry its linked page's passage.
  const OTD18 = JSON.parse(
    readFileSync(resolve(__dirname, 'fixtures', 'paper', '2026-11-18.es.otd.json'), 'utf8'),
  );
  const diesel = () => buildPool(OTD18, 'es').find((f) => f.year === '1990' && /Diesel/.test(f.text));

  it('the Diesel event carries a passage naming its source page', () => {
    const fact = diesel();
    expect(fact).toBeDefined();
    expect(fact!.summary).toBeUndefined();
    expect(fact!.long).toBeUndefined();
    expect(fact!.passages).toBeDefined();
    expect(fact!.passages!.length).toBeGreaterThan(0);
    expect(fact!.passages![0].page).toBe('Eric Walter Elst');
    expect(fact!.passages![0].text).toContain('astrónomo belga');
  });

  it('parts print the line as headline and the passages as body with the read label', () => {
    const fact = diesel()!;
    const parts = pastLetterParts(pastLetter(fact, NOW), COPY2);
    expect(parts.headline).toBe(fact.text);
    expect(parts.body).toContain('Eric Walter Elst — ');
    expect(parts.body).not.toBe(parts.headline);
    expect(parts.linkLabel).toBe('Read on Wikipedia →');
  });

  it('a passage never repeats its own page name', () => {
    // The Elst extract opens with its subject, so attributing it would read
    // the name twice; the passage keeps the name once, in the attribution.
    const fact = diesel()!;
    expect(fact.passages![0].text.startsWith(fact.passages![0].page)).toBe(false);
    const parts = pastLetterParts(pastLetter(fact, NOW), COPY2);
    expect(parts.body).toContain('Eric Walter Elst — fue un astrónomo belga');
  });

  it('each passage names the page it comes from', () => {
    const l = pastLetter(
      {
        year: '1990',
        text: 'El astrónomo Eric Elst descubre el asteroide (10093) Diesel.',
        link: 'https://x',
        passages: [
          { page: 'Eric Walter Elst', text: 'Fue un astrónomo belga.' },
          { page: '(10093) Diesel', text: 'Es un asteroide del cinturón principal.' },
        ],
      },
      NOW,
    );
    const parts = pastLetterParts(l, COPY2);
    expect(parts.headline).toBe('El astrónomo Eric Elst descubre el asteroide (10093) Diesel.');
    expect(parts.body).toContain('Eric Walter Elst — Fue un astrónomo belga.');
    expect(parts.body).toContain('(10093) Diesel — Es un asteroide del cinturón principal.');
    expect(parts.linkLabel).toBe('Read on Wikipedia →');
  });

  it('with no linked text anywhere the letter falls back to its title alone', () => {
    // An entry whose pages carry neither extract nor description: no
    // passages, so the letter types the line as its body with no headline.
    const [fact] = collectFacts(
      [
        {
          year: 1990,
          text: 'El astrónomo Eric Elst descubre el asteroide (10093) Diesel.',
          pages: [{ titles: { normalized: 'Eric Walter Elst' } }],
        },
      ],
      'event',
      'es',
    );
    expect(fact.passages).toBeUndefined();
    const parts = pastLetterParts(pastLetter(fact, NOW), COPY2);
    expect(parts.headline).toBe('');
    expect(parts.body).toBe('El astrónomo Eric Elst descubre el asteroide (10093) Diesel.');
    expect(parts.linkLabel).toBe('Read on Wikipedia →');
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

  it('sets the past headline and body in the period hand and leaves lab letters in serif', () => {
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
    // No hand on the shared rules: a lab letter stays upright in serif.
    expect(rule('.mail-pop .letter p')).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(rule('.mail-pop .letter .body')).toMatch(/font-family:\s*var\(--font-serif\)/);
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

/* A lab letter reads as a letter: place and date at the top right, a
   salutation, the serif body, a closing with the lab's signature, the kind
   as a postscript and the link after the signature. The close stays a
   plain ×, and no mono reaches the lab sheet. */
describe('a lab letter reads as a letter', () => {
  it('opens with the place and date at the top right, in both languages', () => {
    // The dateline is composed from the sent date with its year — remove
    // either half and the "Bogotá, 12 de noviembre de 2026" line is gone.
    expect(MAIL_SRC).toMatch(/class="dateline"/);
    expect(MAIL_SRC).toMatch(/copy\.datelinePlace/);
    expect(MAIL_SRC).toMatch(/sent\.getFullYear\(\)/);
    expect(en.header.mailbox.datelinePlace).toBe('Bogotá');
    expect(es.header.mailbox.datelinePlace).toBe('Bogotá');
    // Right-aligned, clear of the × like the meta row was.
    expect(rule('.mail-pop .letter .dateline')).toMatch(/text-align:\s*right/);
    expect(rule('.mail-pop .letter .dateline')).toMatch(/padding-right:\s*22px/);
    // The salutation and signature close the letter in each language.
    expect(en.header.mailbox.greet).toBe('Dear reader,');
    expect(es.header.mailbox.greet).toBe('Estimada lectora, estimado lector,');
    expect(en.header.mailbox.closing).toBe('With regards,');
    expect(es.header.mailbox.closing).toBe('Saludos cordiales,');
    expect(en.header.mailbox.sign).toBe('The UniverLab laboratory');
    expect(es.header.mailbox.sign).toBe('El laboratorio UniverLab');
    expect(rule('.mail-pop .letter .greet')).toMatch(/font-style:\s*italic/);
    expect(rule('.mail-pop .letter .sign')).toMatch(/margin-top:\s*auto/);
  });

  it('shows the kind as a postscript, not a UI label', () => {
    // The type reaches the sheet only through the postscript — remove this
    // branch and the kind is nowhere on the letter.
    expect(MAIL_SRC).toMatch(/fmt\(copy\.psLab, \{ type: copy\.types\?\.\[m\.type\] \?\? m\.type \}\)/);
    expect(MAIL_SRC).toMatch(/class="ps"/);
    expect(en.header.mailbox.psLab).toContain('{type}');
    expect(es.header.mailbox.psLab).toContain('{type}');
    // The label row is gone from the lab sheet: no meta spans remain there.
    expect(MAIL_SRC).not.toMatch(/m\.exp \? `\$\{m\.exp\.number\}/);
    expect(rule('.mail-pop .letter .ps')).toMatch(/font-size:\s*12px/);
  });

  it('keeps the announcement link after the signature', () => {
    // Order in the sheet source: greeting, title, body, signature,
    // postscript, then the link — move the link up and it stops reading
    // as part of the letter.
    expect(MAIL_SRC).toMatch(/class="greet"[\s\S]*\$\{heading\}[\s\S]*class="body"[\s\S]*class="sign"[\s\S]*class="ps"[\s\S]*class="links"/);
    // The link itself is unchanged: same copy, same destination.
    expect(MAIL_SRC).toMatch(/copy\.readAnnouncement/);
    expect(en.header.mailbox.readAnnouncement).toBe('Read the full announcement →');
    expect(es.header.mailbox.readAnnouncement).toBe('Leer el anuncio completo →');
  });

  it('keeps the close a plain × with its accessible name', () => {
    expect(MAIL_SRC).toMatch(/class="close" aria-label="\$\{esc\(copy\.close\)\}">×/);
    // No chip: no background, no border on the close rule.
    expect(rule('.mail-pop .close')).toMatch(/border:\s*0/);
    expect(rule('.mail-pop .close')).toMatch(/background:\s*none/);
    expect(rule('.mail-pop .close')).not.toMatch(/background:\s*var\(/);
  });

  it('sets no monospace on the lab sheet', () => {
    // The shared paragraph rule, the typed body and the greeting all stay
    // clear of the mono token — a mono declaration on any of them puts the
    // UI card back on the letter.
    expect(rule('.mail-pop .letter p')).not.toMatch(/font-mono/);
    expect(rule('.mail-pop .letter .body')).not.toMatch(/font-mono/);
    expect(rule('.mail-pop .letter .greet')).not.toMatch(/font-mono/);
    expect(rule('.mail-pop .letter .sign')).not.toMatch(/font-mono/);
    expect(rule('.mail-pop .letter .ps')).not.toMatch(/font-mono/);
    // The body reads at a letter's measure and leading.
    expect(rule('.mail-pop .letter .body')).toMatch(/line-height:\s*1\.65/);
    expect(rule('.mail-pop .letter .body')).toMatch(/max-width:\s*60ch/);
    // A long body still scrolls inside the sheet, capped to the viewport.
    expect(rule('.mail-pop .letter .body')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.mail-pop .letter')).toMatch(/max-height:\s*calc\(100dvh - 120px\)/);
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
    // The scroll target prefers the scrollable .body with the past sheet's
    // paragraph as fallback: a lab sheet holds other paragraphs (dateline,
    // greeting) before the body, so a group selector would land on the
    // dateline and the typed line would scroll out of view.
    expect(MAIL_SRC).toMatch(/querySelector\('\.letter \.body'\) \?\? .*querySelector\('\.letter p'\)/);
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
    expect(boxLabel(COPY, 1)).toBe('Mailbox: 1 new letter');
    expect(boxLabel(COPY, 3)).toBe('Mailbox: 3 new letters');
  });

  it('names the badge digit in the accessible label, both languages', () => {
    // label-content-name-mismatch: the badge shows the digit, so the name
    // must contain it — "one"/"una" would not contain the visible "1".
    for (const copy of [en.header.mailbox, es.header.mailbox]) {
      expect(boxLabel(copy, 1)).toContain('1');
      expect(boxLabel(copy, 2)).toContain('2');
    }
    expect(en.header.mailbox.openOne).toBe('Mailbox: 1 new letter');
    expect(es.header.mailbox.openOne).toBe('Buzón: 1 carta nueva');
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

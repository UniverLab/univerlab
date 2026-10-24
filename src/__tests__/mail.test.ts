import {
  enqueue,
  readOpened,
  writeOpened,
  isSeen,
  markSeen,
  firstParagraph,
  labLetters,
  pastLetter,
  dailyFact,
  letterMode,
  boxLabel,
  LAB_MAIL_MAX_AGE_MS,
  type Announcement,
  type ExperimentInfo,
  type MailLetter,
} from '../lib/mail';

const DAY = 86400000;
const NOW = new Date('2026-10-24T12:00:00Z');

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
});

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

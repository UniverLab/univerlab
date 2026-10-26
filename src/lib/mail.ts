// The mail queue — pure decisions about what waits in the mailbox, what has
// been opened today and what each letter carries. No DOM here; the mailbox
// script runs these and paints the result.

import { dayKey, summaryText } from './science-filter';

/** One announcement of the public feed (GET https://announcements.univerlab.org). */
export interface Announcement {
  id: string;
  /** ISO timestamp of publication. */
  date: string;
  title: string;
  body: string;
  type?: string | null;
  topic?: string | null;
  link?: string | null;
}

/** What a lab letter needs to know about the experiment it belongs to. */
export interface ExperimentInfo {
  id: string;
  name: string;
  number: string;
  essenceHex: string;
}

/** Lab mail: an announcement from the lab, airmail-bordered in its
 *  experiment's colour (or the lab's own garnet when it names no experiment). */
export interface LabLetter {
  kind: 'lab';
  id: string;
  title: string;
  /** First paragraph of the entry, ready to type. */
  body: string;
  type: string;
  link: string;
  /** ISO publication date — its postmark carries today, its age is this. */
  date: string;
  /** The experiment of the entry's topic, when the topic is one. */
  exp?: ExperimentInfo;
}

/** A letter from the past: today's science fact, written the day it happened
 *  and many years on its way. */
export interface PastLetter {
  kind: 'past';
  id: string;
  year: string;
  text: string;
  link: string;
  /** The event's own page summary, when the feed carried one. */
  summary?: string;
  /** True when the extract held more than `summary` shows. */
  summaryCut?: boolean;
}

export type MailLetter = LabLetter | PastLetter;

const DAY = 86400000;
/** Lab mail stays fresh a week: older entries are not worth the slot. */
export const LAB_MAIL_MAX_AGE_MS = 7 * DAY;

/** A new arrival goes first in the queue (and never duplicates an id). */
export function enqueue(queue: MailLetter[], letter: MailLetter): MailLetter[] {
  return [letter, ...queue.filter((l) => l.id !== letter.id)];
}

/** Letter ids opened on `day`, remembered per day in localStorage. */
export function readOpened(day: string = dayKey()): string[] {
  try {
    const raw = localStorage.getItem(`univerlab-mail-${day}`);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch (e) {
    return [];
  }
}

export function writeOpened(ids: string[], day: string = dayKey()): void {
  try {
    localStorage.setItem(`univerlab-mail-${day}`, JSON.stringify(ids));
  } catch (e) {}
}

/** Lab letters opened in this browser, kept across days: a release letter
 *  opened once never comes back the next morning. Only the newest ids are
 *  kept — the API's own window (7 days, 5 entries) is far smaller. */
export const LAB_SEEN_KEY = 'univerlab-mail-lab';
export const LAB_SEEN_MAX = 50;

export function readLabSeen(): string[] {
  try {
    const raw = localStorage.getItem(LAB_SEEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch (e) {
    return [];
  }
}

export function writeLabSeen(ids: string[]): void {
  try {
    localStorage.setItem(LAB_SEEN_KEY, JSON.stringify(ids.slice(-LAB_SEEN_MAX)));
  } catch (e) {}
}

export function isSeen(id: string, opened: string[]): boolean {
  return opened.indexOf(id) !== -1;
}

/** Remember one more opened letter without losing the ones already marked. */
export function markSeen(id: string, opened: string[]): string[] {
  return isSeen(id, opened) ? opened : opened.concat(id);
}

/** The entry's first paragraph — what the letter types out. */
export function firstParagraph(body: string): string {
  const text = (body || '').trim();
  if (!text) return '';
  return text.split(/\n{2,}/)[0].trim();
}

/** Today's lab mail: the entries published in the last 7 days that this
 *  browser has not opened, newest first, each wearing its experiment. */
export function labLetters(
  entries: Announcement[],
  opened: string[],
  now: Date,
  exps: ExperimentInfo[],
): LabLetter[] {
  const floor = now.getTime() - LAB_MAIL_MAX_AGE_MS;
  return (entries || [])
    .filter((e) => {
      const t = Date.parse(e?.date || '');
      return Number.isFinite(t) && t >= floor && !isSeen(e.id, opened);
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((e) => {
      const topic = typeof e.topic === 'string' ? e.topic.toLowerCase() : '';
      const exp = exps.find((x) => x.id === topic);
      return {
        kind: 'lab' as const,
        id: e.id,
        title: e.title || '',
        body: firstParagraph(e.body),
        type: e.type || '',
        link: exp ? `/status/?topic=${exp.id}` : '/status/',
        date: e.date,
        exp,
      };
    });
}

/** Today's letter from the past: one per day, id bound to the calendar day. */
export function pastLetter(
  fact: { year: string; text: string; link: string; summary?: string; summaryCut?: boolean },
  now: Date,
): PastLetter {
  return {
    kind: 'past',
    id: `past-${dayKey(now)}`,
    year: fact.year,
    text: fact.text,
    link: fact.link,
    ...(fact.summary !== undefined ? { summary: fact.summary } : {}),
    ...(fact.summaryCut !== undefined ? { summaryCut: fact.summaryCut } : {}),
  };
}

/** How a past letter prints: with a summary, the one-line text is the
 *  headline and the summary the body; without one, the text is the body. */
export interface PastLetterParts {
  headline: string;
  body: string;
  linkLabel: string;
}

export function pastLetterParts(
  l: PastLetter,
  copy: { readWikipedia: string; continuesWikipedia: string },
): PastLetterParts {
  const headline = l.summary ? l.text : '';
  const body = l.summary ? summaryText(l) : l.text;
  const linkLabel = l.summary && l.summaryCut ? copy.continuesWikipedia : copy.readWikipedia;
  return { headline, body, linkLabel };
}

/** One fact per day: the pool is shuffled per click in the old popup, but the
 *  letter must be stable all day (and across reloads), so the day picks it. */
export function dailyFact<T>(items: T[], now: Date): T | null {
  if (!items || !items.length) return null;
  const key = dayKey(now);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return items[h % items.length];
}

/** A letter opened today opens straight onto the letter: the ritual (out of
 *  the slot, turn, seal) is for the first time only, and reduced motion
 *  always skips it. */
export function letterMode(
  letter: MailLetter,
  opened: string[],
  reducedMotion: boolean,
): 'ritual' | 'straight' {
  return reducedMotion || isSeen(letter.id, opened) ? 'straight' : 'ritual';
}

/** The mailbox's accessible name: the count of unopened letters. */
export function boxLabel(
  copy: { open: string; openOne: string; openNone: string },
  n: number,
): string {
  if (n === 0) return copy.openNone;
  if (n === 1) return copy.openOne;
  return copy.open.replace('{n}', String(n));
}

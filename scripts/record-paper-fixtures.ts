// Records the fixed editions `npm run check:paper` measures: for each date
// the exact "On this day" pool the page fetches (both languages) plus the
// lab list, captured once from the live sources so the check is deterministic
// and offline. It also records the built page's web fonts (paper-fonts.ts), so
// the browser measures the real typefaces instead of fallback metrics.
// Refresh: `npm run record:paper` (requires a build for the font capture).
//
// Runs on plain Node (24+) via native type-stripping. Wired as
// `record:paper`; nothing else runs it automatically. Only
// `src/lib/science-filter.ts` is imported: it has no imports of its own, so
// plain Node resolves it, while the rest of the lib chain uses
// extensionless specifiers Node cannot load. The three date helpers below
// mirror `today-edition.ts` (`editionYmd`, `otdUrl`, `todayLead` via
// `mail.ts dailyFact`) and `lab-feed.ts` (`entriesUpTo`); they only pick the
// three coverage dates, never the shipped contract (the fixtures are the
// verbatim responses).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  buildPool,
  dayKey,
  letterPool,
  type Fact,
  type FilterLang,
} from '../src/lib/science-filter.ts';
import { recordPaperFonts } from './paper-fonts.ts';

/** Wikipedia text carries invisible format characters (U+200E, U+2060, ...)
 *  that the repo's commit hook rejects. In the recorded JSON they only occur
 *  inside strings, so writing them as \\uXXXX escapes keeps every parsed
 *  value byte-identical while the file itself stays free of them. */
export function escapeInvisible(json: string): string {
  return json.replace(
    /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'),
  );
}


const OUT = 'src/__tests__/fixtures/paper';
const ANNOUNCEMENTS_API = 'https://announcements.univerlab.org';

/** The seven spec-fixed dates, all past editions `?d=` accepts. */
const FIXED = [
  '2026-07-22',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14',
  '2026-11-15',
  '2026-11-16',
  '2026-11-17',
  '2026-11-18',
];

/** Candidate scan window for the three coverage dates (all past editions). */
const SCAN_START = '2026-09-15';
const SCAN_END = '2026-11-11';

const noon = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

const ymdOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

/** Mirrors `editionYmd` in today-edition.ts: Bogotá (UTC−5) calendar day. */
const editionYmd = (now: Date): string => {
  const b = new Date(now.getTime() - 5 * 3600 * 1000);
  return ymdOf(new Date(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 12, 0, 0));
};

/** Mirrors `otdUrl` in today-edition.ts (month/day only, no year). */
const otdUrl = (lang: FilterLang, date: Date): string => {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`;
};

/** Mirrors `todayLead` (today-edition.ts) via `dailyFact` (mail.ts). */
const leadOf = (facts: Fact[], date: Date): Fact | null => {
  const items = letterPool(facts);
  if (!items.length) return null;
  const key = dayKey(date);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return items[h % items.length];
};

interface LabRow {
  date: string;
  [k: string]: unknown;
}

/** Mirrors `entriesUpTo` (lab-feed.ts) + `todayLabBoxes` (today-edition.ts). */
const labBoxesOf = (lab: LabRow[], date: Date): LabRow[] => {
  const ymd = ymdOf(date);
  const cutoff = Date.parse(`${ymd}T23:59:59.999-05:00`);
  return lab
    .filter((e) => {
      const t = Date.parse(e?.date || '');
      return Number.isFinite(t) && t <= cutoff && editionYmd(new Date(t)) === ymd;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function get(url: string, attempt = 0): Promise<string> {
  // One request at a time with a pause between days; the feed answers 429
  // when asked in parallel, so back off and retry instead of failing.
  await sleep(400);
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'univerlab-record-paper/1 (https://univerlab.org)',
    },
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await res.text().catch(() => '');
    await sleep(2000 * 2 ** attempt);
    return get(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return res.text();
}

interface DayStats {
  ymd: string;
  enPool: number;
  esPool: number;
  enLetters: number;
  leadW: number | null;
  leadH: number | null;
  leadLang: 'en' | 'es' | null;
  labCount: number;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const main = async (): Promise<void> => {
  // The font capture reads the built pages' font links: fail before writing
  // any edition if the build is missing, so a refresh never leaves a
  // half-recorded fixture set.
  if (!existsSync('dist/newspaper/index.html')) {
    throw new Error(
      'dist/newspaper/index.html is missing; run npm run build before record:paper',
    );
  }
  // The lab list is one fetch for every edition; the page filters it by `?d=`.
  const labText = await get(`${ANNOUNCEMENTS_API}/?limit=100`);
  const labAll = (JSON.parse(labText)?.entries ?? []) as LabRow[];

  const otdCache = new Map<string, { en: string; es: string }>();
  const fetchDay = async (ymd: string): Promise<{ en: string; es: string }> => {
    const hit = otdCache.get(ymd);
    if (hit) return hit;
    const d = noon(ymd);
    const en = await get(otdUrl('en', d));
    const es = await get(otdUrl('es', d));
    const both = { en, es };
    otdCache.set(ymd, both);
    return both;
  };

  // Scan every candidate day: pool sizes, lead photo orientation, lab boxes.
  const days: string[] = [];
  for (let t = noon(SCAN_START); ymdOf(t) <= SCAN_END; t = new Date(t.getTime() + 86400000)) {
    days.push(ymdOf(t));
  }
  const stats: DayStats[] = [];
  for (const ymd of days) {
    const { en, es } = await fetchDay(ymd);
    const d = noon(ymd);
    const enFacts = buildPool(JSON.parse(en), 'en');
    const esFacts = buildPool(JSON.parse(es), 'es');
    if (!enFacts.length || !esFacts.length) {
      throw new Error(
        `no pool for ${ymd} (en=${enFacts.length} es=${esFacts.length}); extend the scan window`,
      );
    }
    const enLead = leadOf(enFacts, d);
    const esLead = leadOf(esFacts, d);
    const picked = enLead?.thumb ? { lead: enLead, lang: 'en' as const }
      : esLead?.thumb ? { lead: esLead, lang: 'es' as const }
      : null;
    stats.push({
      ymd,
      enPool: enFacts.length,
      esPool: esFacts.length,
      enLetters: letterPool(enFacts).length,
      leadW: picked?.lead.thumb?.w ?? null,
      leadH: picked?.lead.thumb?.h ?? null,
      leadLang: picked?.lang ?? (enLead || esLead ? (enLead ? 'en' : 'es') : null),
      labCount: labBoxesOf(labAll, d).length,
    });
  }

  const med = median(stats.map((s) => s.enPool + s.esPool));
  // (i) a landscape lead photo (wider than tall).
  const landscape = stats.find(
    (s) => s.leadW != null && s.leadH != null && s.leadW > s.leadH,
  );
  // (ii) a lead without photo.
  const noPhoto = stats.find((s) => s.leadLang != null && s.leadW == null);
  // (iii) a day with a lab story and many letters (above the median).
  const labMany = [...stats]
    .filter((s) => s.labCount > 0 && s.enPool + s.esPool > med)
    .sort((a, b) => b.enPool + b.esPool - (a.enPool + a.esPool))[0];
  if (!landscape || !noPhoto || !labMany) {
    throw new Error(
      `coverage not found (landscape=${landscape?.ymd} noPhoto=${noPhoto?.ymd} labMany=${labMany?.ymd}); extend the scan window`,
    );
  }
  const extra = [landscape.ymd, noPhoto.ymd, labMany.ymd];
  if (new Set(extra).size !== 3 || extra.some((d) => FIXED.includes(d))) {
    throw new Error(`coverage dates overlap (${extra.join(', ')}); extend the scan window`);
  }

  const dates = [...FIXED, ...extra];
  mkdirSync(OUT, { recursive: true });
  for (const ymd of dates) {
    const { en, es } = await fetchDay(ymd);
    writeFileSync(`${OUT}/${ymd}.en.otd.json`, escapeInvisible(en));
    writeFileSync(`${OUT}/${ymd}.es.otd.json`, escapeInvisible(es));
    writeFileSync(`${OUT}/${ymd}.lab.json`, escapeInvisible(labText));
  }
  const coverage = {
    landscape: { date: landscape.ymd, lang: landscape.leadLang },
    noPhoto: { date: noPhoto.ymd, lang: noPhoto.leadLang },
    labMany: {
      date: labMany.ymd,
      labStories: labMany.labCount,
      lettersEn: labMany.enLetters,
    },
  };
  writeFileSync(
    `${OUT}/manifest.json`,
    JSON.stringify({ recordedAt: new Date().toISOString(), dates, coverage }, null, 2) +
      '\n',
  );
  // Fixed dates print too, so a refresh that empties a pool is caught here.
  for (const ymd of FIXED) {
    const { en, es } = await fetchDay(ymd);
    const d = noon(ymd);
    const nEn = buildPool(JSON.parse(en), 'en').length;
    const nEs = buildPool(JSON.parse(es), 'es').length;
    const nLab = labBoxesOf(labAll, d).length;
    console.log(`${ymd}: pool en=${nEn} es=${nEs} lab=${nLab}`);
    if (!nEn || !nEs) throw new Error(`no pool for fixed date ${ymd}`);
  }
  console.log(`coverage: ${JSON.stringify(coverage)}`);
  console.log(`wrote ${dates.length} editions to ${OUT}/`);
  // The page's typefaces, read from the built pages: the check serves them
  // offline so line breaks and column flow match what a reader sees.
  const fonts = await recordPaperFonts({ outDir: OUT, distDir: 'dist' });
  console.log(`wrote ${fonts} font URLs to ${OUT}/fonts.json`);
};

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});

// The science filter for Wikipedia's "On this day" feed — one source of truth
// for the header's letter from the past and the /today newspaper. Stems are
// matched with indexOf against the lowercased text, so 'physic' catches
// physics/physicist and 'descubr' caught descubrió/descubrimiento. We keep an
// event only when it mentions science AND mentions no war/politics/religion/
// sport term — that second list is what keeps battles and coronations out.

export type FilterLang = 'en' | 'es';

export const SCIENCE_EN = [
  'science', 'scientist', 'physic', 'chemist', 'chemistry', 'biolog',
  'astronom', 'telescope', 'observatory', 'planet', 'comet', 'asteroid',
  'spacecraft', 'satellite', 'rocket', 'orbit', 'space probe', 'astronaut',
  'cosmonaut', 'galaxy', 'supernova', 'eclipse', 'nasa', 'space station',
  'mathematic', 'theorem', 'invent', 'patent', 'discover', 'experiment',
  'laborator', 'vaccine', 'antibiotic', 'medicine', 'surgery', 'genome',
  'dna', 'atom', 'nuclear reactor', 'electron', 'quantum', 'relativity',
  'evolution', 'fossil', 'dinosaur', 'geolog', 'microscope', 'electricity',
  'transistor', 'computer', 'internet', 'engineer', 'particle', 'x-ray',
  'periodic table', 'nobel prize in physics', 'nobel prize in chemistry',
  'nobel prize in physiology', 'naturalist', 'observation of',
];

export const SCIENCE_ES = [
  'ciencia', 'científic', 'físic', 'químic', 'biolog',
  'astronom', 'telescopio', 'observatorio', 'planeta', 'cometa', 'asteroide',
  'nave espacial', 'satélite', 'cohete', 'órbita', 'sonda',
  'astronauta', 'cosmonauta', 'galaxia', 'supernova', 'eclipse',
  'estación espacial', 'matemátic', 'teorema', 'invent', 'patente',
  'descubr', 'experimento', 'laboratorio', 'vacuna', 'antibiótic',
  'medicina', 'cirugía', 'genoma', 'adn', 'átomo', 'reactor nuclear',
  'electrón', 'cuántic', 'relatividad', 'evolución', 'fósil',
  'dinosaurio', 'geolog', 'microscopio', 'electricidad', 'transistor',
  'computador', 'ordenador', 'internet', 'ingenier', 'partícula',
  'rayos x', 'tabla periódica', 'naturalista', 'premio nobel de física',
  'premio nobel de química', 'premio nobel de medicina',
];

// War, politics, religion and sport terms that veto an event even if it also
// trips a science word (e.g. "nuclear weapon" in a war, a royal coronation).
export const POLITICS_EN = [
  'war', 'battle', 'treaty', 'election', 'president', 'king', 'queen',
  'emperor', 'monarch', 'parliament', 'congress', 'army', 'military',
  'troops', 'invasion', 'coup', 'revolution', 'independence', 'empire',
  'dynasty', 'siege', 'rebellion', 'riot', 'massacre', 'genocide',
  'dictator', 'assassinat', 'weapon', 'bombing', 'pope', 'bishop',
  'saint', 'church', 'politician', 'senator', 'governor', 'minister',
  // Sport & entertainment (substrings chosen to avoid collisions like
  // 'cup'→occupied, 'league'→colleague, 'sport'→transport).
  'championship', 'tournament', 'olympic', 'football', 'soccer',
  'basketball', 'baseball', 'tennis', 'cricket', 'rugby', 'hockey',
  'boxing', 'marathon', 'fifa', 'world cup', 'stadium', 'goalkeeper',
  'midfielder', 'striker', 'film festival', 'box office',
];

export const POLITICS_ES = [
  'guerra', 'batalla', 'tratado', 'elección', 'elecciones', 'presidente',
  'rey', 'reina', 'emperador', 'monarca', 'parlamento', 'congreso',
  'ejército', 'militar', 'tropas', 'invasión', 'golpe de estado',
  'revolución', 'independencia', 'imperio', 'dinastía', 'asedio',
  'rebelión', 'disturbio', 'masacre', 'genocidio', 'dictador',
  'asesinat', 'arma', 'bombardeo', 'papa', 'obispo', 'santo', 'iglesia',
  'político', 'política', 'senador', 'gobernador', 'ministro',
  // Deporte y espectáculo. 'deportiv' cubre deportivo/deportiva; evito
  // 'liga' (obliga), 'gol' (golfo) y 'copa' suelto por colisiones.
  'campeonato', 'torneo', 'olímpic', 'deportiv', 'fútbol', 'futbol',
  'baloncesto', 'béisbol', 'tenis', 'críquet', 'boxeo', 'maratón',
  'fifa', 'mundial', 'copa del mundo', 'estadio', 'goleador',
  'futbolista', 'delantero', 'festival de cine', 'taquilla',
];

/** Drop narrative-length entries (e.g. long match reports). */
export const MAX_LEN = 200;

const CACHE_KEY = 'univerlab-otd-2';

/** One normalized fact of the day's pool. */
export interface Fact {
  year: string;
  text: string;
  link: string;
  kind: 'event' | 'born' | 'died';
  /** Wikipedia page title, when the feed carried one. */
  page: string;
  /** The event's own page summary, at most 2 sentences and 260 chars. */
  summary?: string;
  /** True when the extract held more than `summary` shows. */
  summaryCut?: boolean;
  /** The entry's photo, kept only when it is a real Commons image (a
   *  `/wikipedia/commons/` URL that is not an `.svg`): events never print
   *  photos — theirs are generic or wrong — so the newspaper only reads this
   *  for the lead story and for people. */
  thumb?: { src: string; w?: number; h?: number };
}

function keywordsFor(lang: FilterLang): string[] {
  return lang === 'es' ? SCIENCE_ES : SCIENCE_EN;
}

function politicsFor(lang: FilterLang): string[] {
  return lang === 'es' ? POLITICS_ES : POLITICS_EN;
}

/** True when the entry's text is science and not war/politics/sport. */
export function passesScience(text: string, lang: FilterLang): boolean {
  if (!text || text.length > MAX_LEN) return false;
  const low = text.toLowerCase();
  const hasScience = keywordsFor(lang).some((k) => low.includes(k));
  const hasPolitics = politicsFor(lang).some((k) => low.includes(k));
  return hasScience && !hasPolitics;
}

export interface FeedPage {
  titles?: { normalized?: string; display?: string };
  content_urls?: { desktop?: { page?: string } };
  thumbnail?: { source?: string; width?: number; height?: number };
  extract?: string;
}

export interface FeedEntry {
  year?: number;
  text?: string;
  pages?: FeedPage[];
}

/** The summary budget: whole sentences, at most two, at most this long. */
export const SUMMARY_MAX = 260;

function stripTags(s: string): string {
  return (s || '').replace(/<[^>]*>/g, '');
}

function pageTitle(p: FeedPage): string {
  const raw = p.titles?.normalized || stripTags(p.titles?.display || '');
  return (raw || '').replace(/_/g, ' ').trim();
}

/** Lowercased, whitespace-collapsed: the live feed writes a non-breaking
 *  space inside some titles ("Chang\u00a01"), so a raw substring compare
 *  would miss the page the event is about. */
function comparable(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The entry's own page (events only): among the pages, the one whose
 *  title occurs in the entry's text — the object's match starts last —
 *  else the first page whose extract holds the year, else pages[0].
 *  Returns undefined when the entry carries no pages. */
export function mainPage(entry: FeedEntry): FeedPage | undefined {
  const pages = entry?.pages || [];
  if (!pages.length) return undefined;
  const text = comparable(entry.text || '');
  let best: FeedPage | undefined;
  let bestIdx = -1;
  for (const p of pages) {
    const t = comparable(pageTitle(p));
    if (!t) continue;
    const idx = text.lastIndexOf(t);
    if (idx >= 0 && idx > bestIdx) {
      best = p;
      bestIdx = idx;
    }
  }
  if (best) return best;
  const year = String(entry.year ?? '');
  if (year && year !== '?') {
    const re = new RegExp(`(^|\\D)${year}(\\D|$)`);
    for (const p of pages) {
      if (p.extract && re.test(p.extract)) return p;
    }
  }
  return pages[0];
}

/** Shorten an extract to a letter body: whole sentences from the start, at
 *  most 2 and at most SUMMARY_MAX chars. A sentence ends at `.`, `!` or `?`
 *  followed by a space or the end — never inside a number, never after a
 *  single capital initial. Returns null when there is nothing to carry
 *  (empty, or only repeating the headline). */
export function shortSummary(
  extract: string | undefined,
  headline: string,
): { summary: string; cut: boolean } | null {
  const flat = (extract || '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  if (flat.toLowerCase() === (headline || '').replace(/\s+/g, ' ').trim().toLowerCase()) return null;
  const ends: number[] = [];
  for (let i = 0; i < flat.length; i++) {
    const c = flat[i];
    if (c !== '.' && c !== '!' && c !== '?') continue;
    const next = flat[i + 1];
    const atEnd = i + 1 >= flat.length;
    if (!atEnd && next !== ' ') continue;
    if (c === '.') {
      const prev = flat[i - 1] || '';
      const after = flat[i + 1] || '';
      if (/\d/.test(prev) && /\d/.test(after)) continue;
      const slice = flat.slice(Math.max(0, i - 2), i + 1);
      if (/(^|\s)[A-Z]\.$/.test(slice)) continue;
    }
    ends.push(i);
  }
  if (!ends.length) {
    if (flat.length <= SUMMARY_MAX) return { summary: flat, cut: false };
    const cutAt = flat.slice(0, SUMMARY_MAX).lastIndexOf(' ');
    const summary = cutAt > 0 ? flat.slice(0, cutAt) : flat.slice(0, SUMMARY_MAX);
    return { summary, cut: true };
  }
  const sentences: string[] = [];
  let start = 0;
  for (const e of ends) {
    sentences.push(flat.slice(start, e + 1).trim());
    start = e + 1;
  }
  let summary = '';
  for (let k = 0; k < Math.min(2, sentences.length); k++) {
    const cand = summary ? summary + ' ' + sentences[k] : sentences[k];
    if (cand.length <= SUMMARY_MAX) summary = cand;
    else break;
  }
  if (!summary) {
    const cutAt = flat.slice(0, SUMMARY_MAX).lastIndexOf(' ');
    const s = cutAt > 0 ? flat.slice(0, cutAt) : flat.slice(0, SUMMARY_MAX);
    return { summary: s, cut: true };
  }
  const rest = flat.slice(summary.length).trim();
  return { summary, cut: rest.length > 0 };
}

/** The summary as printed: when cut, trailing stops and spaces give way to
 *  a single ellipsis. */
export function summaryText(f: { summary?: string; summaryCut?: boolean }): string {
  const s = f.summary || '';
  if (!f.summaryCut) return s;
  return s.replace(/[.!?…\s]+$/u, '') + '…';
}

/** Turn one feed category into normalized, length-sorted pool entries. */
export function collectFacts(
  list: FeedEntry[] | undefined,
  kind: Fact['kind'],
  lang: FilterLang,
  limit = 0,
): Fact[] {
  const arr = (list || [])
    .filter((e) => passesScience(e.text || '', lang))
    .map((e) => {
      const chosen: FeedPage | undefined =
        kind === 'event' ? mainPage(e) : e.pages?.[0];
      let link = '';
      let title = '';
      try {
        link = chosen!.content_urls!.desktop!.page!;
        title = chosen!.titles?.normalized || stripTags(chosen!.titles?.display || '');
      } catch (x) {}
      // A photo only when it is a real Commons image: hot-linked from
      // upload.wikimedia.org under /wikipedia/commons/, never an .svg
      // (flags, coats of arms and diagrams print wrong in halftone).
      // The feed's URLs carry `?utm_source=…`, and a Commons SVG usually
      // arrives rasterised as `…/File.svg/330px-File.svg.png`, so the vector
      // check reads the path, not the tail of the whole URL.
      let thumb: Fact['thumb'];
      try {
        const src = chosen!.thumbnail?.source || '';
        const path = src.split('?')[0];
        const vector = /\.svg(\/|$|\.png$)/i.test(path);
        if (src.includes('/wikipedia/commons/') && !vector) {
          thumb = { src };
          const w = chosen!.thumbnail?.width;
          const h = chosen!.thumbnail?.height;
          if (typeof w === 'number') thumb.w = w;
          if (typeof h === 'number') thumb.h = h;
        }
      } catch (x) {}
      let summary: string | undefined;
      let summaryCut: boolean | undefined;
      if (kind === 'event' && chosen?.extract) {
        const short = shortSummary(chosen.extract, e.text || '');
        if (short) {
          summary = short.summary;
          summaryCut = short.cut;
        }
      }
      return {
        year: String(e.year || '?'),
        text: e.text || '',
        link,
        kind,
        page: title,
        ...(summary !== undefined ? { summary } : {}),
        ...(summaryCut !== undefined ? { summaryCut } : {}),
        ...(thumb ? { thumb } : {}),
      };
    });
  arr.sort((a, b) => a.text.length - b.text.length);
  return limit ? arr.slice(0, limit) : arr;
}

export interface PoolLimits {
  events?: number;
  births?: number;
  deaths?: number;
}

/** The newspaper's pool: everything the day's feed kept. A missing kind
 *  means "all" (and 0 means "all" for events too), so this is also
 *  fetchPool's default and what the cache always stores — a header warm
 *  can never shrink what /today renders. */
export const FULL_POOL: PoolLimits = { events: 0 };

/** The whole filtered day: every science event plus every filtered birth
 *  and death, each kind sorted shortest first. */
export function buildPool(
  data: { events?: FeedEntry[]; births?: FeedEntry[]; deaths?: FeedEntry[] },
  lang: FilterLang,
): Fact[] {
  return collectFacts(data.events, 'event', lang)
    .concat(collectFacts(data.births, 'born', lang))
    .concat(collectFacts(data.deaths, 'died', lang));
}

/** The letter's pool: only the day's events — births and deaths belong to
 *  the newspaper's Nacimientos/Defunciones columns, never to the letter. A
 *  missing limit means "all"; an explicit 0 means none for births/deaths
 *  and (as always) all for events. Shaped from the cached whole day, so the
 *  mailbox and the newspaper read the same cache and draw the same event. */
export function letterPool(items: Fact[], limits: PoolLimits = { births: 0, deaths: 0 }): Fact[] {
  const take = (kind: Fact['kind'], n: number | undefined): Fact[] => {
    const arr = items.filter((f) => f.kind === kind);
    if (n == null) return arr;
    if (kind === 'event') return n ? arr.slice(0, n) : arr;
    return n ? arr.slice(0, n) : [];
  };
  return take('event', limits.events)
    .concat(take('born', limits.births))
    .concat(take('died', limits.deaths));
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/** Today's cached pool, or null when it is missing, stale or empty. */
export function readOtdCache(lang: FilterLang): Fact[] | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!c || c.date !== dayKey() || c.lang !== lang || !c.items || !c.items.length) return null;
    return c.items as Fact[];
  } catch (e) {
    return null;
  }
}

/** Fetch the day's feed, filter it to science and cache the whole day for
 *  today. `limits` only slices what this caller gets back (via letterPool);
 *  the cache always keeps everything, so /today renders the full newspaper
 *  even when the header warmed the cache first. */
export function fetchPool(
  fetchImpl: typeof fetch,
  lang: FilterLang,
  day: Date = new Date(),
  limits: PoolLimits = FULL_POOL,
): Promise<Fact[]> {
  const mm = String(day.getMonth() + 1).padStart(2, '0');
  const dd = String(day.getDate()).padStart(2, '0');
  const url = `https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`;
  return fetchImpl(url, { headers: { Accept: 'application/json' } })
    .then((res) => {
      if (!res.ok) throw new Error('API ' + res.status);
      return res.json();
    })
    .then((data: { events?: FeedEntry[]; births?: FeedEntry[]; deaths?: FeedEntry[] }) => {
      const all = buildPool(data, lang);
      if (all.length) {
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ date: dayKey(day), lang, items: all }),
          );
        } catch (e) {}
      }
      return letterPool(all, limits);
    });
}

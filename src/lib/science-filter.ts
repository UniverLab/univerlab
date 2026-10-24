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

const CACHE_KEY = 'univerlab-otd';

/** One normalized fact of the day's pool. */
export interface Fact {
  year: string;
  text: string;
  link: string;
  kind: 'event' | 'born' | 'died';
  /** Wikipedia page title, when the feed carried one. */
  page: string;
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

interface FeedEntry {
  year?: number;
  text?: string;
  pages?: Array<{
    titles?: { normalized?: string; display?: string };
    content_urls?: { desktop?: { page?: string } };
    thumbnail?: { source?: string; width?: number; height?: number };
  }>;
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
      let link = '';
      let page = '';
      try {
        link = e.pages![0].content_urls!.desktop!.page!;
        page = e.pages![0].titles?.normalized || e.pages![0].titles?.display || '';
      } catch (x) {}
      // A photo only when it is a real Commons image: hot-linked from
      // upload.wikimedia.org under /wikipedia/commons/, never an .svg
      // (flags, coats of arms and diagrams print wrong in halftone).
      // The feed's URLs carry `?utm_source=…`, and a Commons SVG usually
      // arrives rasterised as `…/File.svg/330px-File.svg.png`, so the vector
      // check reads the path, not the tail of the whole URL.
      let thumb: Fact['thumb'];
      try {
        const src = e.pages![0].thumbnail?.source || '';
        const path = src.split('?')[0];
        const vector = /\.svg(\/|$|\.png$)/i.test(path);
        if (src.includes('/wikipedia/commons/') && !vector) {
          thumb = { src };
          const w = e.pages![0].thumbnail?.width;
          const h = e.pages![0].thumbnail?.height;
          if (typeof w === 'number') thumb.w = w;
          if (typeof h === 'number') thumb.h = h;
        }
      } catch (x) {}
      return {
        year: String(e.year || '?'),
        text: e.text || '',
        link,
        kind,
        page,
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

/** The newspaper's pool: everything the day's feed kept. 0 means "no cap",
 *  so this is also fetchPool's default and what the cache always stores —
 *  a header warm can never shrink what /today renders. */
export const FULL_POOL: PoolLimits = { events: 0, births: 0, deaths: 0 };

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

/** The letter's pool (the header's limits): all filtered events — the day's
 *  real science — plus a handful of the shortest scientist births and deaths
 *  for variety. Shaped from the cached whole day, so the mailbox and the
 *  newspaper read the same cache and the letter stays short. */
export function letterPool(items: Fact[], limits: PoolLimits = {}): Fact[] {
  const ev = limits.events ?? 0;
  const bi = limits.births ?? 6;
  const de = limits.deaths ?? 4;
  const take = (kind: Fact['kind'], n: number) => {
    const arr = items.filter((f) => f.kind === kind);
    return n ? arr.slice(0, n) : arr;
  };
  return take('event', ev).concat(take('born', bi)).concat(take('died', de));
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
 *  today. `limits` slices only what this caller gets back (via letterPool);
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

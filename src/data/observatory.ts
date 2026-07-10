/** Static data for the Continuity Observatory — manifesto section.
 *  All series are manually curated from public sources and baked at build time.
 *  No runtime network requests. Attribution is embedded per series. */

export interface DataPoint {
  year: number;
  value: number;
}

export type Family = 'flourishing' | 'knowledge' | 'fragility';

export interface Series {
  id: string;
  family: Family;
  points: DataPoint[];
  unit: string;
  source: string;
  sourceUrl: string;
  license: string;
}

export const series: Series[] = [
  {
    id: 'wikipedia',
    family: 'knowledge',
    // English Wikipedia article count (thousands). Key milestones.
    // Source: Wikimedia Foundation / en.wikipedia.org/wiki/Wikipedia:Size_of_Wikipedia
    points: [
      { year: 2002, value: 50 },
      { year: 2004, value: 400 },
      { year: 2006, value: 1400 },
      { year: 2008, value: 2400 },
      { year: 2010, value: 3200 },
      { year: 2012, value: 3900 },
      { year: 2014, value: 4500 },
      { year: 2016, value: 5100 },
      { year: 2018, value: 5700 },
      { year: 2020, value: 6200 },
      { year: 2022, value: 6600 },
      { year: 2024, value: 6900 },
    ],
    unit: 'thousand articles',
    source: 'Wikimedia Foundation',
    sourceUrl: 'https://en.wikipedia.org/wiki/Wikipedia:Size_of_Wikipedia',
    license: 'CC BY-SA 4.0',
  },
  {
    id: 'life-expectancy',
    family: 'flourishing',
    // Global average life expectancy at birth, years.
    // Source: Our World in Data / UN World Population Prospects
    points: [
      { year: 1950, value: 47 },
      { year: 1960, value: 52 },
      { year: 1970, value: 57 },
      { year: 1980, value: 62 },
      { year: 1990, value: 65 },
      { year: 2000, value: 67 },
      { year: 2010, value: 71 },
      { year: 2015, value: 72 },
      { year: 2019, value: 73 },
      { year: 2021, value: 71 },
      { year: 2022, value: 72.3 },
    ],
    unit: 'years',
    source: 'Our World in Data / UN',
    sourceUrl: 'https://ourworldindata.org/life-expectancy',
    license: 'CC BY 4.0',
  },
  {
    id: 'literacy',
    family: 'flourishing',
    // Global adult literacy rate (% of population 15+).
    // Source: Our World in Data / UNESCO Institute for Statistics
    points: [
      { year: 1976, value: 68.0 },
      { year: 1985, value: 72.0 },
      { year: 1990, value: 75.4 },
      { year: 1995, value: 78.0 },
      { year: 2000, value: 81.0 },
      { year: 2005, value: 83.0 },
      { year: 2010, value: 84.7 },
      { year: 2015, value: 86.2 },
      { year: 2019, value: 86.9 },
      { year: 2022, value: 87.5 },
    ],
    unit: '% of adults',
    source: 'Our World in Data / UNESCO',
    sourceUrl: 'https://ourworldindata.org/literacy',
    license: 'CC BY 4.0',
  },
  {
    id: 'living-planet',
    family: 'fragility',
    // Living Planet Index — average vertebrate population abundance, 1970 = 100.
    // Source: WWF Living Planet Report / Zoological Society of London, via OWID
    points: [
      { year: 1970, value: 100 },
      { year: 1975, value: 93 },
      { year: 1980, value: 85 },
      { year: 1985, value: 77 },
      { year: 1990, value: 67 },
      { year: 1995, value: 58 },
      { year: 2000, value: 50 },
      { year: 2005, value: 43 },
      { year: 2010, value: 40 },
      { year: 2014, value: 35 },
      { year: 2018, value: 32 },
      { year: 2020, value: 31 },
    ],
    unit: 'index (1970 = 100)',
    source: 'WWF Living Planet Report / Our World in Data',
    sourceUrl: 'https://ourworldindata.org/biodiversity',
    license: 'CC BY 4.0',
  },
];

/** SVG canvas constants — shared between build-time template and runtime JS. */
export const SVG_W = 280;
export const SVG_H = 84;
export const SVG_LPAD = 38; // left margin: Y-axis labels
export const SVG_TPAD = 4;
export const SVG_RPAD = 4;
export const SVG_BPAD = 14; // bottom margin: X-axis labels

export interface SvgCoord {
  year: number;
  value: number;
  x: number;
  y: number;
}

/** Map data points to SVG coordinates. Returns array with x/y for each point. */
export function toSvgCoords(pts: DataPoint[]): SvgCoord[] {
  const vals = pts.map((p) => p.value);
  const yMin = Math.min(...vals);
  const yMax = Math.max(...vals);
  const xMin = pts[0].year;
  const xMax = pts[pts.length - 1].year;
  const yRange = yMax - yMin || 1;
  const xRange = xMax - xMin || 1;
  const cw = SVG_W - SVG_LPAD - SVG_RPAD;
  const ch = SVG_H - SVG_TPAD - SVG_BPAD;
  return pts.map((p) => ({
    year: p.year,
    value: p.value,
    x: SVG_LPAD + ((p.year - xMin) / xRange) * cw,
    y: SVG_TPAD + (1 - (p.value - yMin) / yRange) * ch,
  }));
}

/** Coords array → SVG polyline points string. */
export function toSvgPoints(coords: SvgCoord[]): string {
  return coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
}

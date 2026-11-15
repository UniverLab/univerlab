// One icon as a server-rendered string: pages are static Astro markup, so
// every icon ships as inline SVG in the HTML — no icon font, no sprite
// request, no layout shift (width/height are always set).
//
// `iconSvg(node)` renders the Lucide `IconNode` to a whole `<svg>`:
// `currentColor` strokes, width 2, round caps and joins, hidden from
// assistive tech unless a label is given — then it carries `role="img"` and
// a `<title>`.

/** Lucide's `IconNode` shape, structural so this module needs no lucide type. */
export type IconNode = ReadonlyArray<
  readonly [tag: string, attrs: Readonly<Record<string, string | number | undefined>>]
>;

export interface IconSvgOptions {
  /** Drawn size in pixels; the viewBox stays Lucide's 24 × 24 grid. */
  size?: number;
  /** An accessible name; without one the icon hides from assistive tech. */
  label?: string;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ESCAPES[char] ?? char);
}

/** One node of the drawing: `<path …/>`, `<circle …/>`, `<rect …/>`. */
function element([
  tag,
  attrs,
]: readonly [string, Readonly<Record<string, string | number | undefined>>]): string {
  const drawn = Object.entries(attrs)
    .flatMap(([name, value]) => (value === undefined ? [] : [` ${name}="${escapeAttribute(`${value}`)}"`]))
    .join('');
  return `<${tag}${drawn}/>`;
}

/**
 * The icon `node` as inline SVG. Throws never — the node is already the
 * resolved drawing, so a typo fails at the import, not at render.
 */
export function iconSvg(node: IconNode, options: IconSvgOptions = {}): string {
  const size = options.size ?? 16;
  const label = options.label;
  const title = label === undefined ? '' : `<title>${escapeAttribute(label)}</title>`;
  const accessibility = label === undefined ? ` aria-hidden="true"` : ` role="img"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="icon"` +
    ` width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"` +
    ` stroke="currentColor" stroke-width="2"` +
    ` stroke-linecap="round" stroke-linejoin="round"${accessibility}>` +
    `${title}${node.map(element).join('')}</svg>`
  );
}

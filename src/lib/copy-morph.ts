// The site's one morph: a copy button's icon becomes a check on a
// successful copy, then goes back after a moment.
//
// Every copy button ships the static Lucide copy SVG inside `.copy-icon`
// (server-rendered, so the button reads correctly with scripting off); on
// the first success this module swaps it for morphicons' `<morph-icon>`
// element and morphs it. `prefers-reduced-motion` is honoured by the
// element itself (`reduced-motion="user"`): the morph becomes a cut.
import { defineMorphIcon, type MorphIconElement } from 'morphicons/element';
import { check, copy } from './icons';

/** How long the check stays before the icon goes back to `copy`. */
export const COPY_DONE_MS = 1500;

/** The `<morph-icon>` inside a button's `.copy-icon`, created on first use. */
function morphIn(host: HTMLElement): MorphIconElement {
  const existing = host.querySelector('morph-icon');
  if (existing !== null) {
    return existing as MorphIconElement;
  }
  defineMorphIcon();
  const icon = document.createElement('morph-icon') as MorphIconElement;
  icon.setAttribute('size', '16');
  icon.setAttribute('color', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('spring', 'snappy');
  icon.setAttribute('reduced-motion', 'user');
  icon.setAttribute('aria-hidden', 'true');
  icon.icon = copy;
  host.replaceChildren(icon);
  return icon;
}

/**
 * Show `copy` or `check` in one button's icon slot. The slot keeps its
 * box: only the path inside the 16 px SVG changes, so there is no layout
 * shift. A button without a `.copy-icon` slot is left alone.
 */
export function setCopyState(button: Element, copied: boolean): void {
  const host = button.querySelector<HTMLElement>('.copy-icon');
  if (host === null) {
    return;
  }
  const icon = morphIn(host);
  icon.morphTo(copied ? check : copy, 'snappy');
  host.dataset.icon = copied ? 'check' : 'copy';
}

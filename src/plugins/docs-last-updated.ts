/**
 * The visible "Last updated …" line under a docs page's `<h1>`.
 *
 * The date has one source — the doc file's last commit (see
 * `src/lib/doc-last-modified.ts`) — and two renderings: this line for a human
 * reading the page, and `dateModified` / `article:modified_time` for machines
 * reading the metadata. Both go through the same helper on the same resolved
 * path, so they cannot disagree; `scripts/check-seo.ts` fails the build if they
 * ever do.
 *
 * A Sätteri hast plugin rather than a layout prop or CSS trick: the line has to
 * sit *inside* the rendered markdown, between the `<h1>` and the first
 * paragraph, which is content. The rejected alternatives each broke something
 * real — flex/`order` changes margin collapsing across every docs page,
 * `h1::after` pollutes the heading's accessible name and is invisible to
 * scrapers, and client-side injection is not static.
 *
 * No date ⇒ no line (FR4). That is the shallow-clone and no-history branch,
 * not an error: a page that does not know when it last changed says nothing
 * rather than saying today.
 *
 * The "have I already inserted one?" guard reads the parent's own children
 * instead of a shared flag, so it is correct by construction even if the
 * plugin instance is reused across documents: a document that already carries
 * a `.doc-updated` paragraph never gets a second one.
 */
import type { HastPluginDefinition } from 'satteri';
import { docLastModified } from '../lib/doc-last-modified';
import { formatMissionDate } from '../lib/mission-time';
import { matchDocsBase } from './docs-md-links';

const CLASS = 'doc-updated';

/** Whether `parent` already holds the line this plugin inserts. */
function alreadyUpdated(parent: { children: readonly unknown[] }): boolean {
  return parent.children.some((child) => {
    const el = child as { type?: string; tagName?: string; properties?: { className?: unknown } };
    return (
      el.type === 'element' &&
      el.tagName === 'p' &&
      Array.isArray(el.properties?.className) &&
      (el.properties?.className as unknown[]).includes(CLASS)
    );
  });
}

const docsLastUpdated: HastPluginDefinition = {
  name: 'astro-docs-last-updated',
  element: {
    // The anchor is the heading, not the whole document: the line belongs
    // directly under the `<h1>`, wherever the markdown puts it.
    filter: ['h1'],
    visit(node, ctx) {
      const pathname = ctx.fileURL ? decodeURIComponent(ctx.fileURL.pathname) : '';
      // Anything that is not one of the sibling repos' docs is left alone —
      // this repository's own markdown has no git-dated source of truth here.
      if (!matchDocsBase(pathname)) return;
      const parent = ctx.parent(node);
      if (!parent || alreadyUpdated(parent)) return;

      const iso = docLastModified(pathname);
      if (!iso) return;

      ctx.insertAfter(node, {
        type: 'element',
        tagName: 'p',
        properties: { className: [CLASS] },
        children: [
          { type: 'text', value: 'Last updated ' },
          {
            type: 'element',
            tagName: 'time',
            // The raw `%cI` instant for machines; the rendered text is the
            // site's own TERRA/Sol label, same as the Mission Log.
            properties: { dateTime: iso, 'data-mission': '' },
            children: [{ type: 'text', value: formatMissionDate(iso) }],
          },
        ],
      });
    },
  },
};

export default docsLastUpdated;

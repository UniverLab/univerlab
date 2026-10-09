/**
 * `about_univerlab` — the answer a browser agent gets when it asks who we are.
 *
 * Composed at build time from the sources that already own each fact, so it can
 * never drift from them and is never hand-written twice:
 *
 * - the lab's description and method are parsed out of the hand-written head of
 *   `public/llms.txt` (the blockquote and the paragraph under it);
 * - the founder's name, role and address are the collaborators page's own copy;
 * - the experiments are the registry, with each tagline from the dictionary.
 *
 * Pure: takes its sources, returns markdown. No fs, no network, no DOM — which
 * is what makes the whole thing unit-testable against the real `llms.txt`.
 */
import type { Experiment } from './experiments';
import { FEED_URL } from './lab-feed';

export interface AboutSources {
  /** Raw `public/llms.txt`. Only its hand-written head is read — everything
   *  from `# BEGIN GENERATED` on is build output, not copy. */
  llmsText: string;
  /** The experiment registry. */
  experiments: Experiment[];
  /** `en.experiments[<id>].tagline` per experiment id — the one-line tagline. */
  taglines: Record<string, string>;
  /** The collaborators page's founder block. */
  founder: { name: string; role: string; email: string };
  /** The site's own origin, so every URL is absolute. */
  site: URL;
}

/** The hand-written head of `llms.txt`: everything before the generated block. */
const headOf = (llmsText: string): string => llmsText.split('# BEGIN GENERATED')[0];

/** The `>` blockquote under the title — the lab in one paragraph. */
const descriptionOf = (head: string): string => {
  const line = head.split('\n').find((l) => l.startsWith('> ')) ?? '';
  return line.replace(/^>\s?/, '').trim();
};

/** The first paragraph after the blockquote, before the first section — the method. */
const methodOf = (head: string): string => {
  const quote = head.split('\n').find((l) => l.startsWith('> '));
  if (!quote) return '';
  const after = head.slice(head.indexOf(quote) + quote.length);
  return after.split(/^##\s/m)[0].trim();
};

/** One line per experiment: name, number, status, tagline, own page. */
const experimentLine = (exp: Experiment, tagline: string, site: URL): string =>
  `- **${exp.name}** (${exp.number} · ${exp.status}) — ${tagline} ` +
  `${new URL(`/${exp.id}/`, site).href}`;

/**
 * The about text. Sections a model can quote whole or in part; every fact in
 * it comes from a source that publishes the same fact elsewhere on the site.
 */
export function composeAbout(s: AboutSources): string {
  const head = headOf(s.llmsText);
  const description = descriptionOf(head);
  const method = methodOf(head);
  const experiments = s.experiments.map((e) => experimentLine(e, s.taglines[e.id] ?? '', s.site));

  const out: string[] = ['# UniverLab'];
  if (description) out.push('', description);
  if (method) out.push('', method);

  out.push(
    '',
    '## Founder',
    '',
    `**${s.founder.name}** — ${s.founder.role} · ${s.founder.email}`,
    '',
    '## Experiments',
    '',
    ...experiments,
    '',
    '## Where to read more',
    '',
    `- The lab for agents (this site, in full): ${new URL('/llms.txt', s.site).href}`,
    `- Mission Log and roadmap, live: ${new URL('/status/index.md', s.site).href}`,
    `- Atom feed of every log entry: ${FEED_URL}`,
  );

  return out.join('\n');
}

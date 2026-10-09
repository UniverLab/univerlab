/**
 * The build-time `about_univerlab` text, composed once for the layout.
 *
 * `lab-about.ts` owns the shape of the answer but stays pure — it takes its
 * sources as arguments so it can be unit-tested against the real files. This is
 * the one place that reads those sources off disk (`public/llms.txt`, the
 * experiment registry, the English dictionary) and hands them to the composer.
 *
 * Build-only: the result is inlined into every page as JSON and read by
 * `webmcp.ts` when, and only when, a browser agent asks for it — it is never a
 * request of its own.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { composeAbout } from './lab-about';
import { experiments } from './experiments';
import { en } from '../i18n/en';

export function buildSiteAbout(site: URL): string {
  return composeAbout({
    llmsText: readFileSync(resolve(process.cwd(), 'public/llms.txt'), 'utf8'),
    experiments,
    taglines: Object.fromEntries(experiments.map((e) => [e.id, en.experiments[e.id].tagline])),
    founder: {
      name: en.people.founder.name,
      role: en.people.founder.role,
      email: en.people.founder.email,
    },
    site,
  });
}

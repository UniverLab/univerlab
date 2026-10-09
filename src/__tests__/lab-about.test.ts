/**
 * `about_univerlab` — the build-time composer.
 *
 * The point of the test is that nothing in the output is hand-written: every
 * fact is read out of a source that publishes it elsewhere (the head of
 * `public/llms.txt`, the registry, the dictionary), against the real files.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { composeAbout } from '../lib/lab-about';
import { experiments } from '../lib/experiments';
import { en } from '../i18n/en';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const site = new URL('https://univerlab.org');
const about = composeAbout({
  llmsText: read('public/llms.txt'),
  experiments,
  taglines: Object.fromEntries(experiments.map((e) => [e.id, en.experiments[e.id].tagline])),
  founder: {
    name: en.people.founder.name,
    role: en.people.founder.role,
    email: en.people.founder.email,
  },
  site,
});

describe('composeAbout — the description and the method', () => {
  it('takes the description from the llms.txt blockquote, verbatim', () => {
    const quote = read('public/llms.txt')
      .split('\n')
      .find((l) => l.startsWith('> '))!
      .replace(/^>\s?/, '')
      .trim();
    expect(about).toContain(quote);
    expect(quote).toMatch(/^UniverLab is an independent computational laboratory/);
  });

  it('takes the method from the paragraph under it, verbatim', () => {
    const head = read('public/llms.txt').split('# BEGIN GENERATED')[0];
    const quote = head.split('\n').find((l) => l.startsWith('> '))!;
    const method = head
      .slice(head.indexOf(quote) + quote.length)
      .split(/^##\s/m)[0]
      .trim();
    expect(about).toContain(method);
    expect(method).toMatch(/^Different problems, one method/);
  });

  it('reads nothing from the generated block', () => {
    const generated = read('public/llms.txt').split('# BEGIN GENERATED')[1];
    const firstGeneratedLine = generated.split('\n').find((l) => l.trim() && !l.startsWith('#'))!;
    expect(about).not.toContain(firstGeneratedLine.trim());
  });
});

describe('composeAbout — the founder', () => {
  it('names the founder, the role and the address the collaborators page shows', () => {
    expect(about).toContain('## Founder');
    expect(about).toContain(`**${en.people.founder.name}** — ${en.people.founder.role}`);
    expect(about).toContain(en.people.founder.email);
    expect(en.people.founder.email).toBe('jheison.mb@univerlab.org');
  });
});

describe('composeAbout — every experiment in the registry', () => {
  it('lists each one with its number, status, tagline and URL', () => {
    expect(experiments.length).toBeGreaterThan(0);
    for (const exp of experiments) {
      const tagline = en.experiments[exp.id].tagline;
      expect(about).toContain(
        `- **${exp.name}** (${exp.number} · ${exp.status}) — ${tagline} https://univerlab.org/${exp.id}/`,
      );
    }
  });

  it('never drops one: the section has one line per registry entry', () => {
    const section = about.slice(about.indexOf('## Experiments'), about.indexOf('## Where to read more'));
    expect(section.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(experiments.length);
  });
});

describe('composeAbout — the pointers', () => {
  it('points at llms.txt, the live twin and the Atom feed', () => {
    expect(about).toContain('https://univerlab.org/llms.txt');
    expect(about).toContain('https://univerlab.org/status/index.md');
    expect(about).toContain('https://announcements.univerlab.org/feed.atom');
  });
});

describe('composeAbout — a source that is missing a piece', () => {
  const sources = {
    experiments,
    taglines: Object.fromEntries(experiments.map((e) => [e.id, en.experiments[e.id].tagline])),
    founder: { name: 'F', role: 'Founder', email: 'f@example.com' },
    site: new URL('https://univerlab.org'),
  };

  it('drops the description and the method when llms.txt has no blockquote', () => {
    const md = composeAbout({ ...sources, llmsText: '# UniverLab\n\nJust a title.\n' });
    expect(md.startsWith('# UniverLab\n\n## Founder')).toBe(true);
  });

  it('still lists an experiment whose tagline the dictionary has not caught up with', () => {
    const md = composeAbout({
      ...sources,
      llmsText: '> One line.\n\nThe method.\n',
      taglines: { [experiments[0].id]: 'A tagline.' },
    });
    expect(md).toContain('- **Canopy** (EXP-001 · active) — A tagline. https://univerlab.org/canopy/');
    // The others keep their line, with an empty tagline, rather than vanishing.
    expect(md).toContain(`- **${experiments[1].name}** (${experiments[1].number} · ${experiments[1].status}) —  https://univerlab.org/${experiments[1].id}/`);
    expect(md).toContain('One line.');
    expect(md).toContain('The method.');
  });
});

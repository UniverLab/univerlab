/**
 * WebMCP tools (AGR2) — registration shape and every tool's execute.
 *
 * jsdom, because the module reads `document.modelContext` and the about text out
 * of the DOM. No test touches the network: `fetchImpl` is a fixture, exactly as
 * the tools take it.
 *
 * The module boots itself on import. In this environment there is no
 * `modelContext`, so that import is already the "no API, no cost" case — which
 * is why the fake is installed *after* the import, and why the registration
 * tests call `registerUniverLabTools` directly.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildTools,
  findModelContext,
  initWebMcp,
  readAbout,
  registerUniverLabTools,
  schedule,
  TOPICS,
  type McpTool,
  type ModelContextLike,
} from '../lib/webmcp';
import { composeAbout } from '../lib/lab-about';
import { experiments } from '../lib/experiments';
import { en } from '../i18n/en';
import { ENTRIES_URL, FEED_URL, ROADMAP_URL, type Entry, type RoadmapItem } from '../lib/lab-feed';

const ROOT = resolve(__dirname, '../..');

/** The about text BaseLayout inlines, built the same way the layout builds it. */
const about = composeAbout({
  llmsText: readFileSync(resolve(ROOT, 'public/llms.txt'), 'utf8'),
  experiments,
  taglines: Object.fromEntries(experiments.map((e) => [e.id, en.experiments[e.id].tagline])),
  founder: {
    name: en.people.founder.name,
    role: en.people.founder.role,
    email: en.people.founder.email,
  },
  site: new URL('https://univerlab.org'),
});

function item(over: Partial<RoadmapItem> & { id: string; title: string; state: string }): RoadmapItem {
  return { pos: 0, topic: 'general', ...over };
}

function entry(over: Partial<Entry> & { id: string; title: string }): Entry {
  return {
    date: '2026-10-06T01:09:26.735Z',
    body: 'First paragraph.\n\nSecond paragraph.',
    type: 'launch',
    topic: 'general',
    link: null,
    ...over,
  };
}

const ROADMAP_FIXTURE: RoadmapItem[] = [
  item({ id: 'n1', title: 'Ship the WebMCP tools', state: 'now', pos: 0, topic: 'canopy' }),
  item({ id: 'x1', title: 'Archived thing', state: 'now', pos: 1, archived_at: 1758000000000 }),
  item({ id: 'nn', title: 'Next thing', state: 'next', pos: 2, topic: 'gitkit' }),
  item({ id: 'd1', title: 'Shipped thing', state: 'done', pos: 3, shipped_at: '2026-09-01T00:00:00Z' }),
];

const ENTRIES_FIXTURE: Entry[] = [
  entry({ id: 'a', title: 'Older note', date: '2026-08-01T10:00:00Z', type: 'note', topic: 'canopy' }),
  entry({ id: 'b', title: 'Newer release', date: '2026-09-03T10:00:00Z', type: 'release', topic: 'gitkit' }),
  entry({ id: 'c', title: 'Newest launch', date: '2026-09-05T10:00:00Z', type: 'launch', topic: 'general' }),
];

/** A `fetch` answering both endpoints from the fixtures, and counting its calls. */
function fixtureFetch() {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith(ROADMAP_URL)) return { ok: true, status: 200, json: async () => ({ items: ROADMAP_FIXTURE }) } as Response;
    if (url.startsWith(ENTRIES_URL)) return { ok: true, status: 200, json: async () => ({ entries: ENTRIES_FIXTURE }) } as Response;
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const byName = (tools: McpTool[], name: string): McpTool => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool named ${name}`);
  return tool;
};

// ------------------------------------------------------- no API, no cost

describe('initWebMcp without the API', () => {
  it('registers nothing and never reaches for fetch', () => {
    // jsdom ships no `fetch` at all, which is the point: with no modelContext
    // the module must not touch the network, so a spy on it is never called.
    const fetchMock = jest.fn();
    (globalThis as unknown as { fetch?: unknown }).fetch = fetchMock;
    const registerTool = jest.fn();

    try {
      expect(findModelContext()).toBeNull();
      expect(() => initWebMcp()).not.toThrow();

      expect(registerTool).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      delete (globalThis as unknown as { fetch?: unknown }).fetch;
    }
  });

  it('finds nothing on navigator either', () => {
    expect(findModelContext()).toBeNull();
  });
});

// ------------------------------------------------------------- registration

describe('registration with a fake modelContext', () => {
  function fakeMc() {
    const registerTool = jest.fn(async (_tool: McpTool, _options?: { signal?: AbortSignal }) => undefined);
    const mc = { registerTool } as unknown as ModelContextLike;
    return { mc, registerTool };
  }

  it('registers exactly three tools', async () => {
    const { mc, registerTool } = fakeMc();
    await registerUniverLabTools(mc, { about, fetchImpl: fixtureFetch().fetchImpl });
    expect(registerTool).toHaveBeenCalledTimes(3);
  });

  it('registers them through the API the browser exposes', async () => {
    const { mc, registerTool } = fakeMc();
    (document as unknown as { modelContext?: ModelContextLike }).modelContext = mc;

    try {
      expect(findModelContext()).toBe(mc);
      initWebMcp({ about, fetchImpl: fixtureFetch().fetchImpl });
      // `schedule` defers; jsdom has no requestIdleCallback, so it is a setTimeout(0).
      await new Promise((r) => setTimeout(r, 0));
      expect(registerTool).toHaveBeenCalledTimes(3);
    } finally {
      delete (document as unknown as { modelContext?: ModelContextLike }).modelContext;
    }
  });

  it('reads the about text at idle time, not at boot', async () => {
    const { mc, registerTool } = fakeMc();
    (document as unknown as { modelContext?: ModelContextLike }).modelContext = mc;
    const script = document.createElement('script');
    script.id = 'webmcp-about';
    script.type = 'application/json';
    // Deliberately absent while the module boots, present by the time the idle
    // callback runs — the page must not depend on script ordering.
    script.textContent = JSON.stringify({ about: '# UniverLab\n\nwritten later.' });
    document.body.appendChild(script);

    try {
      initWebMcp();
      await new Promise((r) => setTimeout(r, 0));
      expect(registerTool).toHaveBeenCalledTimes(3);
      const aboutTool = registerTool.mock.calls
        .map(([tool]) => tool as unknown as McpTool)
        .find((t) => t.name === 'about_univerlab')!;
      expect(await aboutTool.execute()).toBe('# UniverLab\n\nwritten later.');
    } finally {
      script.remove();
      delete (document as unknown as { modelContext?: ModelContextLike }).modelContext;
    }
  });

  it('gives each tool a name, a description, a closed schema and read-only hints', async () => {
    const { mc, registerTool } = fakeMc();
    await registerUniverLabTools(mc, { about, fetchImpl: fixtureFetch().fetchImpl });

    const tools = registerTool.mock.calls.map(([tool]) => tool as unknown as McpTool);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'about_univerlab',
      'get_roadmap',
      'list_announcements',
    ]);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(20);
      expect(typeof tool.execute).toBe('function');
      const schema = tool.inputSchema as { type?: string; additionalProperties?: boolean };
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it('never fetches while registering', async () => {
    const { mc } = fakeMc();
    const { fetchImpl, calls } = fixtureFetch();
    await registerUniverLabTools(mc, { about, fetchImpl });
    expect(calls).toEqual([]);
  });
});

// ------------------------------------------------------------ get_roadmap

describe('get_roadmap', () => {
  const tools = () => buildTools({ about, fetchImpl: fixtureFetch().fetchImpl });
  const roadmap = () => byName(tools(), 'get_roadmap');

  it('groups the lanes and drops archived rows', async () => {
    const md = await roadmap().execute({});
    expect(md).toContain('### Now');
    expect(md).toContain('- **Ship the WebMCP tools** · canopy');
    expect(md).not.toContain('Archived thing');
    expect(md).toContain('- **Shipped thing** · general');
  });

  it('filters to one lane', async () => {
    const md = await roadmap().execute({ lane: 'next' });
    expect(md).toBe('### Next\n\n- **Next thing** · gitkit');
  });

  it('filters to one topic', async () => {
    const md = await roadmap().execute({ topic: 'canopy' });
    expect(md).toContain('Ship the WebMCP tools');
    expect(md).not.toContain('Next thing');
  });

  it('answers an unknown topic with the valid ones', async () => {
    const md = await roadmap().execute({ topic: 'nope' });
    expect(md).toContain('Unknown topic "nope"');
    expect(md).toContain('general, canopy, texforge');
    expect(md).not.toContain('###');
  });

  it('answers an unknown lane without throwing', async () => {
    const md = await roadmap().execute({ lane: 'whenever' });
    expect(md).toContain('Unknown lane "whenever"');
    expect(md).toContain('now, next, later, idea, done');
  });

  it('names the failure and the feed when the API is down', async () => {
    const failing = buildTools({
      about,
      fetchImpl: (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch,
    });
    const md = await byName(failing, 'get_roadmap').execute({});
    expect(md).toContain('roadmap is unavailable');
    expect(md).toContain(ROADMAP_URL);
    expect(md).toContain(FEED_URL);
  });

  it('passes the caller’s signal to the read', async () => {
    const { fetchImpl, calls } = fixtureFetch();
    const controller = new AbortController();
    await buildTools({ about, fetchImpl }).find((t) => t.name === 'get_roadmap')!.execute(
      {},
      { signal: controller.signal },
    );
    expect(calls).toEqual([`${ROADMAP_URL}?limit=100`]);
  });
});

// ------------------------------------------------------ list_announcements

describe('list_announcements', () => {
  const tool = () => byName(buildTools({ about, fetchImpl: fixtureFetch().fetchImpl }), 'list_announcements');

  it('returns the newest entries first, ten by default', async () => {
    const md = await tool().execute({});
    expect(md.split('\n')).toHaveLength(3);
    expect(md.split('\n')[0]).toContain('Newest launch');
    expect(md.split('\n')[2]).toContain('Older note');
  });

  it('clamps the limit into 1–20', async () => {
    expect((await tool().execute({ limit: 0 })).split('\n')).toHaveLength(1);
    expect((await tool().execute({ limit: 99 })).split('\n')).toHaveLength(3);
    expect((await tool().execute({ limit: 1 })).split('\n')).toHaveLength(1);
    expect((await tool().execute({})).split('\n')).toHaveLength(3);
  });

  it('reads a limit a model sent as a string, and ignores nonsense', async () => {
    expect((await tool().execute({ limit: '2' })).split('\n')).toHaveLength(2);
    expect((await tool().execute({ limit: 'lots' })).split('\n')).toHaveLength(3);
    expect((await tool().execute({ limit: null })).split('\n')).toHaveLength(3);
  });

  it('filters by topic and by type', async () => {
    const md = await tool().execute({ topic: 'gitkit' });
    expect(md).toContain('Newer release');
    expect(md).not.toContain('Newest launch');

    const notes = await tool().execute({ type: 'note' });
    expect(notes).toContain('Older note');
    expect(notes).not.toContain('Newest launch');
  });

  it('answers an unknown topic with the valid ones', async () => {
    const md = await tool().execute({ topic: 'nope' });
    expect(md).toContain('Unknown topic "nope"');
    expect(md).toContain('general, canopy, texforge');
  });

  it('names the failure and the feed when the API is down', async () => {
    const failing = buildTools({
      about,
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    });
    const md = await byName(failing, 'list_announcements').execute({});
    expect(md).toContain('Mission Log is unavailable');
    expect(md).toContain('offline');
    expect(md).toContain(ENTRIES_URL);
    expect(md).toContain(FEED_URL);
  });

  it('still answers when the failure carries no message', async () => {
    const failing = buildTools({
      about,
      fetchImpl: (async () => {
        throw 'kaput';
      }) as unknown as typeof fetch,
    });
    const md = await byName(failing, 'list_announcements').execute({});
    expect(md).toContain('(request failed)');
    expect(md).toContain(FEED_URL);
  });
});

// -------------------------------------------------------- about_univerlab

describe('about_univerlab', () => {
  it('takes no input and returns the build-time text', async () => {
    const tool = byName(buildTools({ about }), 'about_univerlab');
    expect((tool.inputSchema as { properties?: unknown }).properties).toEqual({});
    expect(await tool.execute()).toBe(about);
    expect(await tool.execute({ anything: 'ignored' })).toBe(about);
  });

  it('includes every experiment in the registry', async () => {
    const md = await byName(buildTools({ about }), 'about_univerlab').execute();
    for (const exp of experiments) {
      expect(md).toContain(`**${exp.name}** (${exp.number} · ${exp.status})`);
      expect(md).toContain(`https://univerlab.org/${exp.id}/`);
    }
  });

  it('falls back to llms.txt when the inline text is missing', async () => {
    const md = await byName(buildTools({ about: '' }), 'about_univerlab').execute();
    expect(md).toContain('https://univerlab.org/llms.txt');
  });
});

// --------------------------------------------------------------- plumbing

describe('readAbout', () => {
  it('reads the inlined JSON, and nothing when it is absent or broken', () => {
    const script = document.createElement('script');
    script.id = 'webmcp-about';
    script.type = 'application/json';
    script.textContent = JSON.stringify({ about: '# UniverLab' });
    document.body.appendChild(script);

    expect(readAbout()).toBe('# UniverLab');
    expect(readAbout(document)).toBe('# UniverLab');

    script.textContent = 'not json';
    expect(readAbout()).toBe('');

    script.textContent = JSON.stringify({ nope: 1 });
    expect(readAbout()).toBe('');

    script.remove();
    expect(readAbout()).toBe('');
  });
});

describe('schedule', () => {
  afterEach(() => {
    delete (globalThis as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
    jest.useRealTimers();
  });

  it('uses requestIdleCallback where it exists', () => {
    const w = globalThis as unknown as { requestIdleCallback?: jest.Mock };
    w.requestIdleCallback = jest.fn();
    const fn = jest.fn();
    schedule(fn);
    expect(w.requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('falls back to a timeout where it does not', () => {
    jest.useFakeTimers();
    const fn = jest.fn();
    schedule(fn);
    expect(fn).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('TOPICS', () => {
  it('is general plus every experiment slug', () => {
    expect(TOPICS).toEqual(['general', ...experiments.map((e) => e.id)]);
  });
});

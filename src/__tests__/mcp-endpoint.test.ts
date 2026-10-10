/**
 * AGR4 — the remote MCP server at `/mcp` (stateless Streamable HTTP) and its
 * Server Card routes.
 *
 * @jest-environment node
 *
 * Node rather than jsdom because the function is called with real `Request` /
 * `Response` objects, which jsdom does not ship — the same reason
 * `status-twin.test.ts` opts out. No test touches the network: `global.fetch`
 * is replaced per case, and `env.ASSETS` models the built site
 * (`/about-univerlab.json` and the static card exist).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { onRequest } from '../../functions/mcp';
import { onRequest as cardOnRequest } from '../../functions/mcp/server-card';
import { buildServerCard, SUPPORTED_PROTOCOL_VERSIONS } from '../../src/lib/mcp-server-card';
import { buildTools } from '../../src/lib/webmcp';
import { ENTRIES_URL, ROADMAP_URL, type Entry, type RoadmapItem } from '../../src/lib/lab-feed';

const ROOT = resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string };

const ENDPOINT = 'https://univerlab.org/mcp';

// ---------------------------------------------------------------- fixtures

function item(over: Partial<RoadmapItem> & { id: string; title: string; state: string }): RoadmapItem {
  return { pos: 0, topic: 'general', ...over };
}

function entry(over: Partial<Entry> & { id: string; title: string }): Entry {
  return {
    date: '2026-10-06T01:09:26.735Z',
    body: 'First paragraph.',
    type: 'launch',
    topic: 'general',
    link: null,
    ...over,
  };
}

const ROADMAP_FIXTURE: RoadmapItem[] = [
  item({ id: 'n1', title: 'Ship the MCP server', state: 'now', pos: 0, topic: 'canopy' }),
  item({ id: 'd1', title: 'Shipped thing', state: 'done', pos: 1, shipped_at: '2026-09-01T00:00:00Z' }),
];

const ENTRIES_FIXTURE: Entry[] = [
  entry({ id: 'a', title: 'Older note', date: '2026-08-01T10:00:00Z', type: 'note' }),
  entry({ id: 'b', title: 'Newest launch', date: '2026-09-05T10:00:00Z' }),
];

/** A `fetch` answering both API endpoints from the fixtures. */
const fakeFetch = (() =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith(ROADMAP_URL)) return { ok: true, status: 200, json: async () => ({ items: ROADMAP_FIXTURE }) } as Response;
    if (url.startsWith(ENTRIES_URL)) return { ok: true, status: 200, json: async () => ({ entries: ENTRIES_FIXTURE }) } as Response;
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch)();

/** The announcements API down: one non-OK response for anything asked. */
const failingFetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// -------------------------------------------------------------------- env

const about = '# UniverLab\n\nabout text';
const ASSETS: Record<string, string> = {
  '/about-univerlab.json': JSON.stringify({ about }),
  '/.well-known/mcp/server-card.json': JSON.stringify(buildServerCard()),
};
const env = {
  ASSETS: {
    fetch: async (input: string | Request): Promise<Response> => {
      const path = new URL(String(input)).pathname;
      return ASSETS[path]
        ? new Response(ASSETS[path], { status: 200 })
        : new Response('not found', { status: 404 });
    },
  },
};

// --------------------------------------------------------------- requests

const post = (body: string, headers: Record<string, string> = {}): Request =>
  new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });

const rpcBody = (method: string, params?: unknown): string =>
  JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params !== undefined ? { params } : {}) });

const call = (method: string, params?: unknown, headers?: Record<string, string>): Promise<Response> =>
  onRequest({ request: post(rpcBody(method, params), headers), env });

const resultOf = async (method: string, params?: unknown): Promise<any> =>
  (await (await call(method, params)).json()).result;

const toolCall = (name: string, args?: Record<string, unknown>): Promise<Response> =>
  call('tools/call', { name, ...(args !== undefined ? { arguments: args } : {}) });

// ------------------------------------------------- initialize negotiation

describe('initialize', () => {
  it('echoes a supported protocolVersion and falls back to the current one', async () => {
    const echoed = await resultOf('initialize', { protocolVersion: '2025-06-18' });
    expect(echoed.protocolVersion).toBe('2025-06-18');

    const fellBack = await resultOf('initialize', { protocolVersion: '1999-01-01' });
    expect(fellBack.protocolVersion).toBe('2025-11-25');
  });

  it('advertises tools without listChanged and the site version as serverInfo', async () => {
    const result = await resultOf('initialize', { protocolVersion: '2025-11-25' });
    expect(result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(result.serverInfo).toEqual({ name: 'univerlab', title: 'UniverLab', version: pkg.version });
    expect(typeof result.instructions).toBe('string');
    expect(result.instructions).toContain('translate_mission_date');
  });

  it('answers a notification with 202 and an empty body', async () => {
    const res = await onRequest({
      request: post(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })),
      env,
    });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });
});

// --------------------------------------------------------------- tools/list

describe('tools/list', () => {
  it('returns exactly the WebMCP tool names', async () => {
    const { tools } = await resultOf('tools/list');
    expect(tools.map((t: { name: string }) => t.name)).toEqual(
      buildTools({ about: '' }).map((t) => t.name),
    );
    expect(tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'about_univerlab',
      'get_roadmap',
      'list_announcements',
      'translate_mission_date',
    ]);
  });

  it('annotates every tool with the read-only MCP triple', async () => {
    const { tools } = await resultOf('tools/list');
    expect(tools.length).toBe(4);
    for (const tool of tools) {
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toEqual(expect.objectContaining({ type: 'object' }));
    }
  });

  it('ping answers {}', async () => {
    expect(await resultOf('ping')).toEqual({});
  });
});

// --------------------------------------------------------------- tools/call

describe('tools/call', () => {
  it('succeeds for each of the four tools', async () => {
    globalThis.fetch = fakeFetch;
    for (const [name, args] of [
      ['get_roadmap', undefined],
      ['list_announcements', undefined],
      ['about_univerlab', undefined],
      ['translate_mission_date', { input: '2026-10-09' }],
    ] as [string, Record<string, unknown> | undefined][]) {
      const { result } = await (await toolCall(name, args)).json();
      expect(result.isError).toBe(false);
      expect(result.content[0]).toEqual({ type: 'text', text: expect.any(String) });
    }
  });

  it('serves about_univerlab from the build-time artefact', async () => {
    const { result } = await (await toolCall('about_univerlab')).json();
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe(about);
  });

  it('reports isError: true when the API fetch fails', async () => {
    globalThis.fetch = failingFetch;
    const { result } = await (await toolCall('get_roadmap')).json();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unavailable');
  });
});

// ---------------------------------------------------------------- errors

describe('JSON-RPC errors', () => {
  it('answers -32601 for an unknown method', async () => {
    const res = await call('resources/list');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
    expect(body.id).toBe(1);
  });

  it('answers -32602 for an unknown tool and for a non-string name', async () => {
    const unknownTool = await (await toolCall('definitely_not_a_tool')).json();
    expect(unknownTool.error.code).toBe(-32602);

    const badName = await (await call('tools/call', { name: 42 })).json();
    expect(badName.error.code).toBe(-32602);
  });

  it('answers -32700 with id null for malformed JSON', async () => {
    const res = await onRequest({ request: post('{not json'), env });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
    expect(body.id).toBeNull();
  });

  it('answers -32600 for a JSON array body — batching is not supported', async () => {
    const res = await onRequest({ request: post('[]'), env });
    const body = await res.json();
    expect(body.error.code).toBe(-32600);
  });
});

// ------------------------------------------------------------ method rules

describe('HTTP surface', () => {
  it('GET and DELETE answer 405 with Allow: POST, OPTIONS', async () => {
    for (const method of ['GET', 'DELETE']) {
      const res = await onRequest({ request: new Request(ENDPOINT, { method }), env });
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('POST, OPTIONS');
    }
  });

  it('OPTIONS answers 204 with the CORS headers', async () => {
    const res = await onRequest({ request: new Request(ENDPOINT, { method: 'OPTIONS' }), env });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe(
      'content-type, accept, mcp-protocol-version',
    );
  });

  it('rejects an unsupported MCP-Protocol-Version with 400, and accepts a supported one', async () => {
    const bad = await call('ping', undefined, { 'MCP-Protocol-Version': '1999-01-01' });
    expect(bad.status).toBe(400);

    const good = await call('ping', undefined, { 'MCP-Protocol-Version': '2025-06-18' });
    expect(good.status).toBe(200);
  });

  it('carries Cache-Control: no-store and open CORS on responses', async () => {
    const res = await call('ping');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

// ------------------------------------------------------------ Server Card

describe('Server Card', () => {
  it('has the fields the pinned schema requires', () => {
    const card = buildServerCard();
    expect(card.$schema).toBe(
      'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
    );
    expect(String(card.name)).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(typeof card.description).toBe('string');
    expect((card.description as string).length).toBeGreaterThanOrEqual(1);
    expect((card.description as string).length).toBeLessThanOrEqual(100);
    expect(card.version).toBe(pkg.version);
  });

  it('advertises the Streamable HTTP remote with the supported protocol versions', () => {
    const card = buildServerCard() as {
      remotes?: { type: string; url: string; supportedProtocolVersions?: string[] }[];
    };
    expect(SUPPORTED_PROTOCOL_VERSIONS).toEqual(['2025-11-25', '2025-06-18', '2025-03-26']);
    expect(card.remotes?.[0]?.type).toBe('streamable-http');
    expect(card.remotes?.[0]?.url).toBe(ENDPOINT);
    expect(card.remotes?.[0]?.supportedProtocolVersions).toEqual([...SUPPORTED_PROTOCOL_VERSIONS]);
  });

  it('serves the same JSON at /mcp/server-card, with JSON content type and CORS', async () => {
    const res = await cardOnRequest({
      request: new Request('https://univerlab.org/mcp/server-card', { method: 'GET' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(JSON.parse(await res.text())).toEqual(buildServerCard());
  });
});

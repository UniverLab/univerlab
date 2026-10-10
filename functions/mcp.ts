/**
 * `POST /mcp` — UniverLab's remote MCP server, stateless Streamable HTTP.
 *
 * One JSON-RPC 2.0 message in, one `application/json` answer out: no
 * sessions, no `Mcp-Session-Id`, no server-initiated stream, no state of any
 * kind. Hand-rolled on purpose — the protocol surface is five methods
 * (`initialize`, `ping`, `tools/list`, `tools/call`, plus notifications), and
 * the MCP SDK's Node/Durable Object assumptions would cost more than they
 * return on the Workers Free plan. Every call is one cheap request: at most
 * one read of the announcements API, or one `env.ASSETS` read of the
 * build-time about text.
 *
 * The tools themselves are not defined here: `src/lib/lab-tools.ts` is the
 * single source of name/description/inputSchema/execute, shared with the
 * page's WebMCP registration, so both surfaces expose the same four names.
 *
 * Origin is deliberately not restricted: the server is public, anonymous and
 * read-only, so a DNS-rebinding attacker gains nothing they could not get
 * with curl. CORS is wide open for the same reason — no credential exists to
 * leak, and a read-only tool cannot be invoked on anyone's behalf.
 */
import { buildTools } from '../src/lib/lab-tools';
import { MCP_SERVER_INFO, SUPPORTED_PROTOCOL_VERSIONS } from '../src/lib/mcp-server-card';
import { SITE_VERSION } from '../src/lib/site-version';

/** What this function needs from the Pages runtime: the static assets. */
export interface McpEnv {
  ASSETS: { fetch: (input: string | Request) => Promise<Response> };
}

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, accept, mcp-protocol-version',
};

const JSON_HEADERS: Record<string, string> = {
  ...CORS,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const rpc = (id: unknown, result: unknown): Response => json({ jsonrpc: '2.0', id, result });

const rpcErr = (id: unknown, code: number, message: string): Response =>
  json({ jsonrpc: '2.0', id, error: { code, message } });

/** The instructions `initialize` ships: one sentence, read-only, dates named. */
const INSTRUCTIONS =
  'Read-only lab data: roadmap, Mission Log, about text and date translation; ' +
  'dates use the TERRA/Sol mission format — convert them with translate_mission_date.';

/**
 * The build-time about text, read from the static artefact
 * (`/about-univerlab.json`, emitted by `src/pages/about-univerlab.json.ts`)
 * so this server serves exactly the text the page inlines. Missing asset →
 * `''`, and `about_univerlab` falls back to pointing at llms.txt.
 */
async function loadAbout(env: McpEnv, origin: string): Promise<string> {
  try {
    const res = await env.ASSETS.fetch(new URL('/about-univerlab.json', origin).href);
    if (!res.ok) return '';
    const data = (await res.json()) as { about?: unknown };
    return typeof data?.about === 'string' ? data.about : '';
  } catch {
    return '';
  }
}

/**
 * The tools for one request, with a fetch wrapper that remembers whether an
 * upstream read failed. `lab-tools.execute` swallows data failures and
 * returns friendly prose, so the failure is invisible in the return value —
 * the wrapper flips `state.failed` (and rethrows, so the tool still produces
 * its text), and `tools/call` reports `isError: state.failed`.
 */
function toolsFor(about: string, state: { failed: boolean }) {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const res = await fetch(input as RequestInfo, init);
      if (!res.ok) state.failed = true;
      return res;
    } catch (err) {
      state.failed = true;
      throw err;
    }
  }) as typeof fetch;
  return buildTools({ about, fetchImpl });
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export async function onRequest(context: { request: Request; env: McpEnv }): Promise<Response> {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'Cache-Control': 'no-store' } });
  }

  // No server-initiated stream: GET is not a receive channel, and there is
  // nothing to delete — POST and OPTIONS are the whole surface.
  if (request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { ...CORS, Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store' },
    });
  }

  const header = request.headers.get('MCP-Protocol-Version');
  if (header !== null && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(header)) {
    return json({ error: 'Unsupported MCP-Protocol-Version' }, 400);
  }

  const url = new URL(request.url);

  let msg: unknown;
  try {
    msg = JSON.parse(await request.text());
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }

  // Batching is not supported: a JSON array is invalid for this server.
  if (Array.isArray(msg)) {
    return rpcErr(null, -32600, 'Batch requests are not supported');
  }
  if (!isObject(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcErr(isObject(msg) ? (msg.id ?? null) : null, -32600, 'Invalid Request');
  }

  // A notification (no `id` key at all) is answered with 202 and no body.
  // `id: null` is a normal request that expects a response, so the key's
  // presence is what decides — this covers `notifications/initialized`.
  if (!('id' in msg)) {
    return new Response(null, { status: 202, headers: JSON_HEADERS });
  }

  const id = msg.id;
  const params = isObject(msg.params) ? msg.params : undefined;

  switch (msg.method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      const protocolVersion =
        typeof requested === 'string' &&
        (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0];
      return rpc(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { ...MCP_SERVER_INFO, version: SITE_VERSION },
        instructions: INSTRUCTIONS,
      });
    }

    case 'ping':
      return rpc(id, {});

    case 'tools/list': {
      const tools = toolsFor('', { failed: false }).map((t) => ({
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
        // The MCP annotation triple, mapped explicitly: `lab-tools` carries
        // `untrustedContentHint`, a WebMCP hint that is not part of this set.
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      }));
      return rpc(id, { tools });
    }

    case 'tools/call': {
      const name = params?.name;
      if (typeof name !== 'string') return rpcErr(id, -32602, 'Invalid params');
      const args = params?.arguments;
      if (args !== undefined && !isObject(args)) return rpcErr(id, -32602, 'Invalid params');

      const about = name === 'about_univerlab' ? await loadAbout(env, url.origin) : '';
      const state = { failed: false };
      const tool = toolsFor(about, state).find((t) => t.name === name);
      if (!tool) return rpcErr(id, -32602, `Unknown tool: ${name}`);

      try {
        const text = await tool.execute(args ?? {}, {});
        return rpc(id, { content: [{ type: 'text', text }], isError: state.failed });
      } catch (err) {
        return rpc(id, {
          content: [
            { type: 'text', text: err instanceof Error ? err.message : 'Tool failed' },
          ],
          isError: true,
        });
      }
    }

    default:
      return rpcErr(id, -32601, 'Method not found');
  }
}

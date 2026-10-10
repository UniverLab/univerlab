/**
 * `GET /mcp/server-card` — the recommended `<streamable-http-url>/server-card`
 * location from the Server Card extension, answered by the function that also
 * serves `POST /mcp`, so a client that connects to the endpoint finds the card
 * without leaving it. The body is byte-for-byte the static
 * `/.well-known/mcp/server-card.json`: one generator, `src/lib/mcp-server-card.ts`.
 *
 * A second file because Pages routes by file: `functions/mcp.ts` owns
 * `/mcp` only, and `/mcp/server-card` needs its own handler.
 */
import { serverCardJson } from '../../src/lib/mcp-server-card';
import { CORS } from '../mcp';

const HEADERS: Record<string, string> = {
  ...CORS,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'Cache-Control': 'no-store' } });
  }
  if (request.method !== 'GET') {
    return new Response(null, {
      status: 405,
      headers: { ...CORS, Allow: 'GET, OPTIONS', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(serverCardJson(), { headers: HEADERS });
};

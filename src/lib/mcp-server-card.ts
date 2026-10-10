/**
 * The MCP Server Card for `https://univerlab.org/mcp` (SEP-2127) — one
 * generator, consumed by the build-time `/.well-known/mcp/server-card.json`
 * endpoint, the `/mcp/server-card` function route and the tests, so the card
 * can never exist in two shapes.
 *
 * Pinned against `github.com/modelcontextprotocol/ext-server-card`
 * (the `github.com/modelcontextprotocol/experimental-ext-server-card` URL
 * redirects there), `schema.json` on `main`, at commit
 * `526201bbc80231daa40ffcdecfc9da4e54e5dc93` — "docs: add Server Card roadmap
 * priorities (#47)". What that schema requires: `$schema` (exactly the v1
 * URL), `description` (1–100 chars), `name` (reverse-DNS,
 * `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$`, one slash), `version` (≤255, no
 * ranges); optional `title`, `websiteUrl`, `repository {source,url}`,
 * `icons`, `_meta`, and `remotes[]` where each remote requires
 * `{ type: "streamable-http" | "sse", url }` and may carry
 * `supportedProtocolVersions`.
 *
 * The schema defines **no** `serverInfo`, `capabilities` or `transport`
 * field and sets **no** `additionalProperties: false` — Server Cards
 * deliberately omit primitive listings, so objects are open. The
 * isitagentready scanner still looks for `serverInfo` (name, version), a
 * transport endpoint and capabilities, so those are emitted too, inside the
 * schema's allowance; if a future schema revision forbids extra properties,
 * drop the three commented fields below and the scanner lags it.
 */
import { SITE_VERSION } from './site-version';

/** The protocol versions `/mcp` negotiates, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;

/** The `$schema` the v1 schema requires, verbatim (its pattern is exact). */
export const SERVER_CARD_SCHEMA =
  'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';

/** The remote endpoint the card advertises. */
export const MCP_ENDPOINT = 'https://univerlab.org/mcp';

/** `serverInfo` as `/mcp` serves it — name and title shared with the card. */
export const MCP_SERVER_INFO = { name: 'univerlab', title: 'UniverLab' } as const;

/** One sentence, ≤100 chars (the schema's `maxLength` for `description`). */
const DESCRIPTION =
  "UniverLab's read-only MCP server: roadmap, Mission Log, about, and mission-date tools.";

export function buildServerCard(): Record<string, unknown> {
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: 'org.univerlab/univerlab',
    title: MCP_SERVER_INFO.title,
    version: SITE_VERSION,
    description: DESCRIPTION,
    websiteUrl: 'https://univerlab.org',
    repository: {
      source: 'github',
      url: 'https://github.com/UniverLab/univerlab',
    },
    remotes: [
      {
        type: 'streamable-http',
        url: MCP_ENDPOINT,
        supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      },
    ],
    // Schema-undefined scan-compat fields (see the header comment): safe
    // today, and the first thing to drop if the schema closes its objects.
    serverInfo: { ...MCP_SERVER_INFO, version: SITE_VERSION },
    capabilities: { tools: { listChanged: false } },
    transport: { type: 'streamable-http', url: MCP_ENDPOINT },
  };
}

export function serverCardJson(): string {
  return JSON.stringify(buildServerCard());
}

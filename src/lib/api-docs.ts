/**
 * The one bridge between the OpenAPI document and the human /api/ pages.
 *
 * `public/openapi/announcements.json` is the source of truth an agent reads;
 * the pages are a rendering of it, produced here at build time so the two
 * cannot drift. This module is pure apart from the single `readFileSync`, so a
 * test can call it against the real document without a build.
 *
 * Three rules decide the rendering, each one a lever a reader can point at:
 *
 * - `contentTypes` is the union of the content keys of every `2xx` response, so
 *   a route documents exactly the media types it actually returns.
 * - a parameter appears in the `curl` example only when it declares an
 *   `example`. The example is the author's choice of what to demonstrate; a
 *   parameter without one is real but simply not shown.
 * - the URL is single-quoted when it contains `?`, `&` or `{`, and `--globoff`
 *   is added when the path carries a `{param}` (curl would otherwise expand the
 *   braces as a range before the request is made).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The OpenAPI document, resolved from the repo root the scripts run in. */
export const OPENAPI_FILE = resolve(process.cwd(), 'public', 'openapi', 'announcements.json');

export interface ApiParameter {
  name: string;
  location: 'query' | 'path' | 'header';
  required: boolean;
  type: string;
  description: string;
}

export interface ApiOperation {
  method: 'get';
  path: string;
  summary: string;
  description: string;
  parameters: ApiParameter[];
  contentTypes: string[];
  curl: string;
}

export interface ApiDocument {
  title: string;
  version: string;
  description: string;
  baseUrl: string;
  operations: ApiOperation[];
}

interface RawSchema {
  type?: string | string[];
  enum?: Array<string | number | null>;
}

interface RawParameter {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: RawSchema;
  example?: unknown;
}

interface RawResponse {
  content?: Record<string, unknown>;
}

interface RawOperation {
  summary?: string;
  description?: string;
  parameters?: RawParameter[];
  responses?: Record<string, RawResponse>;
}

interface RawPathItem {
  get?: RawOperation;
}

interface RawDocument {
  info?: { title?: string; version?: string; description?: string };
  servers?: Array<{ url?: string }>;
  paths?: Record<string, RawPathItem>;
}

/** A JSON-Schema type plus its enum values, as one line a reader can scan. */
function renderType(schema: RawSchema | undefined): string {
  if (!schema) return 'any';
  const base = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type ?? 'any';
  if (!Array.isArray(schema.enum)) return base;
  const values = schema.enum.filter((v) => v !== null).map((v) => String(v));
  return `${base} · one of: ${values.join(', ')}`;
}

function toParameter(raw: RawParameter): ApiParameter {
  const location = raw.in === 'path' || raw.in === 'header' ? raw.in : 'query';
  return {
    name: raw.name ?? '',
    location,
    required: raw.required === true,
    type: renderType(raw.schema),
    description: raw.description ?? '',
  };
}

/** Every media type across the `2xx` responses, in declaration order. */
function contentTypesOf(operation: RawOperation): string[] {
  const seen = new Set<string>();
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    if (!/^2\d\d$/.test(status)) continue;
    for (const type of Object.keys(response.content ?? {})) seen.add(type);
  }
  return [...seen];
}

/** The query string for the example: only parameters that declare one. */
function exampleQuery(parameters: RawParameter[]): string {
  const pairs: string[] = [];
  for (const raw of parameters) {
    if (raw.in !== 'query' || raw.example === undefined) continue;
    pairs.push(`${raw.name ?? ''}=${String(raw.example)}`);
  }
  return pairs.length ? `?${pairs.join('&')}` : '';
}

function curlFor(baseUrl: string, path: string, parameters: RawParameter[], contentTypes: string[]): string {
  const url = `${baseUrl.replace(/\/$/, '')}${path}${exampleQuery(parameters)}`;
  const flags = ['-s'];
  if (contentTypes.includes('text/event-stream')) flags.push('-N');
  if (path.includes('{')) flags.push('--globoff');
  const quoted = /[?&{]/.test(url) ? `'${url}'` : url;
  return `curl ${flags.join(' ')} ${quoted}`;
}

/**
 * Flatten the OpenAPI document into the shape the pages render. Paths and
 * operations keep their declaration order, so the page mirrors the file.
 */
export function loadApiDocument(file: string = OPENAPI_FILE): ApiDocument {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as RawDocument;
  const baseUrl = raw.servers?.[0]?.url ?? '';
  const operations: ApiOperation[] = [];

  for (const [path, item] of Object.entries(raw.paths ?? {})) {
    const get = item.get;
    if (!get) continue;
    const parameters = (get.parameters ?? []).map(toParameter);
    const contentTypes = contentTypesOf(get);
    operations.push({
      method: 'get',
      path,
      summary: get.summary ?? '',
      description: get.description ?? '',
      parameters,
      contentTypes,
      curl: curlFor(baseUrl, path, get.parameters ?? [], contentTypes),
    });
  }

  return {
    title: raw.info?.title ?? '',
    version: raw.info?.version ?? '',
    description: raw.info?.description ?? '',
    baseUrl,
    operations,
  };
}

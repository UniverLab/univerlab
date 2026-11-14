// Structural validation mirroring public/schemas/audit/v1.json, without a
// JSON-Schema engine (the repo adds no new dependency). Every check the draft
// 2020-12 schema expresses lives here; references the schema cannot express
// (id resolution, files on disk, hashes, status rules) live in validate.ts.
// Unknown block types are VALID here (extensionBlock); validate.ts reports
// them as warnings. Properties prefixed 'x-' are always allowed.
import {
  AUDIT_CONTRACT,
  CALLOUT_TONES,
  EFFORTS,
  FINDING_STATUSES,
  KNOWN_BLOCK_TYPES,
  LAYOUT_RATIOS,
  LAYOUT_TYPES,
  SEVERITIES,
} from './types.ts';

export interface SchemaIssue {
  path: string;
  message: string;
}

type Ctx = SchemaIssue[];

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DOI_RE = /^10\.[0-9]+\/.+/;
const SHA_RE = /^[0-9a-fA-F]{64}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URI_RE = /^[a-zA-Z][a-zA-Z0-9+.\-]*:/;
const HTTPS_RE = /^https:\/\//;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function err(ctx: Ctx, path: string, message: string): void {
  ctx.push({ path, message });
}

function checkString(ctx: Ctx, v: unknown, path: string, what: string, opts?: { pattern?: RegExp; format?: 'date' | 'email' | 'uri' }): boolean {
  if (typeof v !== 'string' || v.length === 0) {
    err(ctx, path, `${what} must be a non-empty string`);
    return false;
  }
  if (opts?.pattern && !opts.pattern.test(v)) {
    err(ctx, path, `${what} has an invalid value`);
    return false;
  }
  if (opts?.format === 'date' && !DATE_RE.test(v)) {
    err(ctx, path, `${what} must be a date like 2026-01-31`);
    return false;
  }
  if (opts?.format === 'email' && !EMAIL_RE.test(v)) {
    err(ctx, path, `${what} must be an email address`);
    return false;
  }
  if (opts?.format === 'uri' && !URI_RE.test(v)) {
    err(ctx, path, `${what} must be a URL`);
    return false;
  }
  return true;
}

function checkOptionalString(ctx: Ctx, v: unknown, path: string, what: string, opts?: { pattern?: RegExp; format?: 'date' | 'email' | 'uri' }): void {
  if (v === undefined) return;
  checkString(ctx, v, path, what, opts);
}

function checkEnum(ctx: Ctx, v: unknown, path: string, what: string, allowed: readonly string[]): boolean {
  if (typeof v !== 'string' || !allowed.includes(v)) {
    err(ctx, path, `${what} must be one of: ${allowed.join(', ')}`);
    return false;
  }
  return true;
}

function checkInt(ctx: Ctx, v: unknown, path: string, what: string, min: number, max: number): boolean {
  if (!isInt(v) || v < min || v > max) {
    err(ctx, path, `${what} must be an integer from ${min} to ${max}`);
    return false;
  }
  return true;
}

// Rejects unknown keys except x- extensions; returns false when v is no object.
function enterObject(ctx: Ctx, v: unknown, path: string, what: string, known: readonly string[]): v is Record<string, unknown> {
  if (!isRecord(v)) {
    err(ctx, path, `${what} must be an object`);
    return false;
  }
  for (const key of Object.keys(v)) {
    if (!known.includes(key) && !key.startsWith('x-')) {
      err(ctx, `${path}.${key}`, `unknown property '${key}' (only 'x-' prefixed extensions are allowed)`);
    }
  }
  return true;
}

function required(ctx: Ctx, v: Record<string, unknown>, path: string, what: string, keys: readonly string[]): void {
  for (const key of keys) {
    if (v[key] === undefined) err(ctx, path, `${what} is missing required property '${key}'`);
  }
}

function checkStringArray(ctx: Ctx, v: unknown, path: string, what: string, allowed?: readonly string[]): boolean {
  if (!Array.isArray(v)) {
    err(ctx, path, `${what} must be an array`);
    return false;
  }
  let ok = true;
  v.forEach((item, i) => {
    if (allowed ? !checkEnum(ctx, item, `${path}[${i}]`, `${what}[${i}]`, allowed) : !checkString(ctx, item, `${path}[${i}]`, `${what}[${i}]`)) ok = false;
  });
  return ok;
}

function checkCost(ctx: Ctx, v: unknown, path: string): void {
  if (!enterObject(ctx, v, path, 'cost', ['amount', 'currency'])) return;
  required(ctx, v, path, 'cost', ['amount', 'currency']);
  if (v['amount'] !== undefined && (typeof v['amount'] !== 'number' || !Number.isFinite(v['amount']))) {
    err(ctx, `${path}.amount`, 'cost.amount must be a number');
  }
  checkOptionalString(ctx, v['currency'], `${path}.currency`, 'cost.currency', { pattern: CURRENCY_RE });
}

function checkMeta(ctx: Ctx, v: unknown, path: string): void {
  if (!enterObject(ctx, v, path, 'meta', ['title', 'subtitle', 'language', 'client', 'auditors', 'auditPeriod', 'version', 'status', 'scope'])) return;
  required(ctx, v, path, 'meta', ['title', 'language', 'client', 'auditors', 'auditPeriod', 'version', 'status', 'scope']);
  checkOptionalString(ctx, v['title'], `${path}.title`, 'meta.title');
  checkOptionalString(ctx, v['subtitle'], `${path}.subtitle`, 'meta.subtitle');
  if (v['language'] !== undefined) checkEnum(ctx, v['language'], `${path}.language`, 'meta.language', ['es', 'en']);
  const client = v['client'];
  if (client !== undefined) {
    if (enterObject(ctx, client, `${path}.client`, 'meta.client', ['name', 'url'])) {
      required(ctx, client, `${path}.client`, 'meta.client', ['name']);
      checkOptionalString(ctx, client['name'], `${path}.client.name`, 'meta.client.name');
      checkOptionalString(ctx, client['url'], `${path}.client.url`, 'meta.client.url', { format: 'uri' });
    }
  }
  if (v['auditors'] !== undefined) {
    if (!Array.isArray(v['auditors']) || v['auditors'].length === 0) {
      err(ctx, `${path}.auditors`, 'meta.auditors must be a non-empty array');
    } else {
      v['auditors'].forEach((a, i) => {
        if (enterObject(ctx, a, `${path}.auditors[${i}]`, 'auditor', ['name', 'url'])) {
          required(ctx, a, `${path}.auditors[${i}]`, 'auditor', ['name']);
          checkOptionalString(ctx, a['name'], `${path}.auditors[${i}].name`, 'auditor name');
          checkOptionalString(ctx, a['url'], `${path}.auditors[${i}].url`, 'auditor url', { format: 'uri' });
        }
      });
    }
  }
  const period = v['auditPeriod'];
  if (period !== undefined) {
    if (enterObject(ctx, period, `${path}.auditPeriod`, 'meta.auditPeriod', ['start', 'end'])) {
      required(ctx, period, `${path}.auditPeriod`, 'meta.auditPeriod', ['start', 'end']);
      checkOptionalString(ctx, period['start'], `${path}.auditPeriod.start`, 'audit start', { format: 'date' });
      checkOptionalString(ctx, period['end'], `${path}.auditPeriod.end`, 'audit end', { format: 'date' });
    }
  }
  checkOptionalString(ctx, v['version'], `${path}.version`, 'meta.version');
  if (v['status'] !== undefined) checkEnum(ctx, v['status'], `${path}.status`, 'meta.status', ['draft', 'delivered', 'final']);
  checkOptionalString(ctx, v['scope'], `${path}.scope`, 'meta.scope');
}

function checkLayout(ctx: Ctx, v: unknown, path: string): void {
  if (!enterObject(ctx, v, path, 'layout', ['type', 'ratio', 'columns'])) return;
  required(ctx, v, path, 'layout', ['type']);
  if (v['type'] !== undefined) checkEnum(ctx, v['type'], `${path}.type`, 'layout.type', LAYOUT_TYPES);
  if (v['ratio'] !== undefined) checkEnum(ctx, v['ratio'], `${path}.ratio`, 'layout.ratio', LAYOUT_RATIOS);
  if (v['columns'] !== undefined) checkInt(ctx, v['columns'], `${path}.columns`, 'layout.columns', 2, 4);
}

function checkSpan(ctx: Ctx, v: unknown, path: string): void {
  if (v === undefined) return;
  checkInt(ctx, v, path, 'block span', 1, 4);
}

function checkAsset(ctx: Ctx, v: unknown, path: string): void {
  if (!enterObject(ctx, v, path, 'asset', ['id', 'path', 'kind', 'title', 'alt', 'bytes', 'sha256'])) return;
  required(ctx, v, path, 'asset', ['id', 'path', 'kind', 'title', 'bytes', 'sha256']);
  checkOptionalString(ctx, v['id'], `${path}.id`, 'asset id', { pattern: ID_RE });
  checkOptionalString(ctx, v['path'], `${path}.path`, 'asset path');
  // Open kind: the conveniences are known names, but any non-empty kind is valid.
  checkOptionalString(ctx, v['kind'], `${path}.kind`, 'asset kind');
  checkOptionalString(ctx, v['title'], `${path}.title`, 'asset title');
  checkOptionalString(ctx, v['alt'], `${path}.alt`, 'asset alt text');
  if (v['bytes'] !== undefined) checkInt(ctx, v['bytes'], `${path}.bytes`, 'asset bytes', 0, Number.MAX_SAFE_INTEGER);
  checkOptionalString(ctx, v['sha256'], `${path}.sha256`, 'asset SHA-256', { pattern: SHA_RE });
}

function checkAnnex(ctx: Ctx, v: unknown, path: string): void {
  if (!enterObject(ctx, v, path, 'annex', ['id', 'title', 'description', 'instructions', 'assets', 'visibility'])) return;
  required(ctx, v, path, 'annex', ['id', 'title', 'description', 'assets']);
  checkOptionalString(ctx, v['id'], `${path}.id`, 'annex id', { pattern: ID_RE });
  checkOptionalString(ctx, v['title'], `${path}.title`, 'annex title');
  checkOptionalString(ctx, v['description'], `${path}.description`, 'annex description');
  checkOptionalString(ctx, v['instructions'], `${path}.instructions`, 'annex instructions');
  if (v['assets'] !== undefined) {
    if (!Array.isArray(v['assets']) || v['assets'].length === 0) {
      err(ctx, `${path}.assets`, 'annex assets must be a non-empty array');
    } else {
      v['assets'].forEach((id, i) => checkString(ctx, id, `${path}.assets[${i}]`, `annex asset ${i}`));
    }
  }
  if (v['visibility'] !== undefined) checkEnum(ctx, v['visibility'], `${path}.visibility`, 'annex visibility', ['public', 'private']);
}

function checkFinding(ctx: Ctx, v: unknown, path: string): void {
  if (
    !enterObject(ctx, v, path, 'finding', [
      'id', 'title', 'severity', 'likelihood', 'impact', 'area', 'status',
      'summary', 'evidence', 'recommendation', 'effort', 'cost', 'fixedIn',
    ])
  ) {
    return;
  }
  required(ctx, v, path, 'finding', ['id', 'title', 'severity', 'likelihood', 'impact', 'area', 'status', 'summary', 'evidence', 'recommendation', 'effort']);
  checkOptionalString(ctx, v['id'], `${path}.id`, 'finding id', { pattern: ID_RE });
  checkOptionalString(ctx, v['title'], `${path}.title`, 'finding title');
  if (v['severity'] !== undefined) checkEnum(ctx, v['severity'], `${path}.severity`, 'finding severity', SEVERITIES);
  if (v['likelihood'] !== undefined) checkInt(ctx, v['likelihood'], `${path}.likelihood`, 'finding likelihood', 1, 5);
  if (v['impact'] !== undefined) checkInt(ctx, v['impact'], `${path}.impact`, 'finding impact', 1, 5);
  checkOptionalString(ctx, v['area'], `${path}.area`, 'finding area');
  if (v['status'] !== undefined) checkEnum(ctx, v['status'], `${path}.status`, 'finding status', FINDING_STATUSES);
  checkOptionalString(ctx, v['summary'], `${path}.summary`, 'finding summary');
  if (v['evidence'] !== undefined) {
    if (!Array.isArray(v['evidence']) || v['evidence'].length === 0) {
      err(ctx, `${path}.evidence`, 'finding evidence must be a non-empty array');
    } else {
      v['evidence'].forEach((e, i) => {
        if (enterObject(ctx, e, `${path}.evidence[${i}]`, 'evidence', ['type', 'id'])) {
          required(ctx, e, `${path}.evidence[${i}]`, 'evidence', ['type', 'id']);
          if (e['type'] !== undefined) checkEnum(ctx, e['type'], `${path}.evidence[${i}].type`, 'evidence type', ['asset', 'source', 'annex']);
          checkOptionalString(ctx, e['id'], `${path}.evidence[${i}].id`, 'evidence id');
        }
      });
    }
  }
  checkOptionalString(ctx, v['recommendation'], `${path}.recommendation`, 'finding recommendation');
  if (v['effort'] !== undefined) checkEnum(ctx, v['effort'], `${path}.effort`, 'finding effort', EFFORTS);
  if (v['cost'] !== undefined) checkCost(ctx, v['cost'], `${path}.cost`);
  checkOptionalString(ctx, v['fixedIn'], `${path}.fixedIn`, 'fixedIn version');
}

// Block validators form the per-type registry: a new block type is added by
// writing its checker here and its renderer, without touching documents.
type BlockChecker = (ctx: Ctx, b: Record<string, unknown>, path: string) => void;

const BLOCK_CHECKERS: Record<string, BlockChecker> = {
  heading: (ctx, b, path) => {
    required(ctx, b, path, 'heading block', ['type', 'level', 'text']);
    if (b['level'] !== undefined) checkInt(ctx, b['level'], `${path}.level`, 'heading level', 1, 6);
    checkOptionalString(ctx, b['text'], `${path}.text`, 'heading text');
  },
  prose: (ctx, b, path) => {
    required(ctx, b, path, 'prose block', ['type', 'markdown']);
    checkOptionalString(ctx, b['markdown'], `${path}.markdown`, 'prose markdown');
  },
  callout: (ctx, b, path) => {
    required(ctx, b, path, 'callout block', ['type', 'tone', 'markdown']);
    if (b['tone'] !== undefined) checkEnum(ctx, b['tone'], `${path}.tone`, 'callout tone', CALLOUT_TONES);
    checkOptionalString(ctx, b['title'], `${path}.title`, 'callout title');
    checkOptionalString(ctx, b['markdown'], `${path}.markdown`, 'callout markdown');
  },
  stats: (ctx, b, path) => {
    required(ctx, b, path, 'stats block', ['type', 'items']);
    if (b['items'] !== undefined) {
      if (!Array.isArray(b['items']) || b['items'].length === 0) {
        err(ctx, `${path}.items`, 'stats items must be a non-empty array');
      } else {
        b['items'].forEach((item, i) => {
          if (enterObject(ctx, item, `${path}.items[${i}]`, 'stat item', ['value', 'label', 'delta'])) {
            required(ctx, item, `${path}.items[${i}]`, 'stat item', ['value', 'label']);
            checkOptionalString(ctx, item['value'], `${path}.items[${i}].value`, 'stat value');
            checkOptionalString(ctx, item['label'], `${path}.items[${i}].label`, 'stat label');
            checkOptionalString(ctx, item['delta'], `${path}.items[${i}].delta`, 'stat delta');
          }
        });
      }
    }
  },
  finding: (ctx, b, path) => {
    required(ctx, b, path, 'finding block', ['type', 'findingId']);
    checkOptionalString(ctx, b['findingId'], `${path}.findingId`, 'finding reference');
  },
  findingsTable: (ctx, b, path) => {
    required(ctx, b, path, 'findingsTable block', ['type']);
    if (b['severity'] !== undefined) checkStringArray(ctx, b['severity'], `${path}.severity`, 'severity filter', SEVERITIES);
    if (b['status'] !== undefined) checkStringArray(ctx, b['status'], `${path}.status`, 'status filter', FINDING_STATUSES);
  },
  riskMatrix: (ctx, b, path) => {
    required(ctx, b, path, 'riskMatrix block', ['type']);
    checkOptionalString(ctx, b['title'], `${path}.title`, 'risk matrix title');
  },
  chart: (ctx, b, path) => {
    required(ctx, b, path, 'chart block', ['type']);
    if (b['spec'] === undefined && b['dataAsset'] === undefined) {
      err(ctx, path, 'chart block needs at least one of spec or dataAsset');
    }
    if (b['spec'] !== undefined && !isRecord(b['spec'])) err(ctx, `${path}.spec`, 'chart spec must be an object');
    checkOptionalString(ctx, b['dataAsset'], `${path}.dataAsset`, 'chart data asset');
    checkOptionalString(ctx, b['caption'], `${path}.caption`, 'chart caption');
  },
  figure: (ctx, b, path) => {
    required(ctx, b, path, 'figure block', ['type', 'asset']);
    checkOptionalString(ctx, b['asset'], `${path}.asset`, 'figure asset');
    checkOptionalString(ctx, b['caption'], `${path}.caption`, 'figure caption');
    checkOptionalString(ctx, b['poster'], `${path}.poster`, 'figure poster');
  },
  diagram: (ctx, b, path) => {
    required(ctx, b, path, 'diagram block', ['type', 'mermaid']);
    checkOptionalString(ctx, b['mermaid'], `${path}.mermaid`, 'diagram source');
    checkOptionalString(ctx, b['caption'], `${path}.caption`, 'diagram caption');
  },
  code: (ctx, b, path) => {
    required(ctx, b, path, 'code block', ['type', 'language']);
    checkOptionalString(ctx, b['language'], `${path}.language`, 'code language');
    if (b['source'] === undefined && b['sourceAsset'] === undefined) {
      err(ctx, path, 'code block needs at least one of source or sourceAsset');
    }
    checkOptionalString(ctx, b['source'], `${path}.source`, 'code source');
    checkOptionalString(ctx, b['sourceAsset'], `${path}.sourceAsset`, 'code source asset');
    if (b['highlight'] !== undefined) {
      if (!Array.isArray(b['highlight'])) {
        err(ctx, `${path}.highlight`, 'code highlight must be an array of line numbers');
      } else {
        b['highlight'].forEach((n, i) => {
          checkInt(ctx, n, `${path}.highlight[${i}]`, 'highlighted line', 1, Number.MAX_SAFE_INTEGER);
        });
      }
    }
  },
  quote: (ctx, b, path) => {
    required(ctx, b, path, 'quote block', ['type', 'text']);
    checkOptionalString(ctx, b['text'], `${path}.text`, 'quote text');
    checkOptionalString(ctx, b['attribution'], `${path}.attribution`, 'quote attribution');
    checkOptionalString(ctx, b['sourceId'], `${path}.sourceId`, 'quote source');
  },
  table: (ctx, b, path) => {
    required(ctx, b, path, 'table block', ['type', 'columns', 'rows']);
    if (b['columns'] !== undefined) {
      if (!Array.isArray(b['columns']) || b['columns'].length === 0) {
        err(ctx, `${path}.columns`, 'table columns must be a non-empty array');
      } else {
        b['columns'].forEach((c, i) => checkString(ctx, c, `${path}.columns[${i}]`, `column ${i}`));
      }
    }
    checkOptionalString(ctx, b['caption'], `${path}.caption`, 'table caption');
    if (b['rows'] !== undefined) {
      if (!Array.isArray(b['rows'])) {
        err(ctx, `${path}.rows`, 'table rows must be an array');
      } else {
        b['rows'].forEach((row, i) => {
          if (!Array.isArray(row)) {
            err(ctx, `${path}.rows[${i}]`, `row ${i} must be an array of cells`);
          } else {
            row.forEach((cell, j) => {
              if (typeof cell !== 'string' && typeof cell !== 'number') {
                err(ctx, `${path}.rows[${i}][${j}]`, `cell ${i},${j} must be a string or a number`);
              }
            });
          }
        });
      }
    }
  },
  timeline: (ctx, b, path) => {
    required(ctx, b, path, 'timeline block', ['type', 'steps']);
    if (b['steps'] !== undefined) {
      if (!Array.isArray(b['steps']) || b['steps'].length === 0) {
        err(ctx, `${path}.steps`, 'timeline steps must be a non-empty array');
      } else {
        b['steps'].forEach((s, i) => {
          if (enterObject(ctx, s, `${path}.steps[${i}]`, 'timeline step', ['title', 'description', 'effort', 'cost'])) {
            required(ctx, s, `${path}.steps[${i}]`, 'timeline step', ['title']);
            checkOptionalString(ctx, s['title'], `${path}.steps[${i}].title`, 'step title');
            checkOptionalString(ctx, s['description'], `${path}.steps[${i}].description`, 'step description');
            if (s['effort'] !== undefined) checkEnum(ctx, s['effort'], `${path}.steps[${i}].effort`, 'step effort', EFFORTS);
            if (s['cost'] !== undefined) checkCost(ctx, s['cost'], `${path}.steps[${i}].cost`);
          }
        });
      }
    }
  },
  stepper: (ctx, b, path) => {
    required(ctx, b, path, 'stepper block', ['type', 'steps']);
    if (b['steps'] !== undefined) {
      if (!Array.isArray(b['steps']) || b['steps'].length === 0) {
        err(ctx, `${path}.steps`, 'stepper steps must be a non-empty array');
      } else {
        b['steps'].forEach((s, i) => {
          if (enterObject(ctx, s, `${path}.steps[${i}]`, 'stepper step', ['title', 'markdown'])) {
            required(ctx, s, `${path}.steps[${i}]`, 'stepper step', ['title', 'markdown']);
            checkOptionalString(ctx, s['title'], `${path}.steps[${i}].title`, 'step title');
            checkOptionalString(ctx, s['markdown'], `${path}.steps[${i}].markdown`, 'step markdown');
          }
        });
      }
    }
  },
  compare: (ctx, b, path) => {
    required(ctx, b, path, 'compare block', ['type', 'before', 'after']);
    checkOptionalString(ctx, b['before'], `${path}.before`, 'comparison before');
    checkOptionalString(ctx, b['after'], `${path}.after`, 'comparison after');
    checkOptionalString(ctx, b['caption'], `${path}.caption`, 'comparison caption');
  },
  assetCard: (ctx, b, path) => {
    required(ctx, b, path, 'assetCard block', ['type', 'asset']);
    checkOptionalString(ctx, b['asset'], `${path}.asset`, 'asset card reference');
    checkOptionalString(ctx, b['description'], `${path}.description`, 'asset card description');
  },
  sources: (ctx, b, path) => {
    required(ctx, b, path, 'sources block', ['type', 'ids']);
    if (b['ids'] !== undefined) {
      if (!Array.isArray(b['ids']) || b['ids'].length === 0) {
        err(ctx, `${path}.ids`, 'sources ids must be a non-empty array');
      } else {
        b['ids'].forEach((id, i) => checkString(ctx, id, `${path}.ids[${i}]`, `source id ${i}`));
      }
    }
  },
  divider: (ctx, b, path) => {
    required(ctx, b, path, 'divider block', ['type']);
    checkOptionalString(ctx, b['label'], `${path}.label`, 'divider label');
  },
};

const BLOCK_KNOWN_KEYS: Record<string, readonly string[]> = {
  heading: ['type', 'level', 'text', 'span'],
  prose: ['type', 'markdown', 'span'],
  callout: ['type', 'tone', 'title', 'markdown', 'span'],
  stats: ['type', 'items', 'span'],
  finding: ['type', 'findingId', 'span'],
  findingsTable: ['type', 'severity', 'status', 'span'],
  riskMatrix: ['type', 'title', 'span'],
  chart: ['type', 'spec', 'dataAsset', 'caption', 'span'],
  figure: ['type', 'asset', 'caption', 'poster', 'span'],
  diagram: ['type', 'mermaid', 'caption', 'span'],
  code: ['type', 'language', 'source', 'sourceAsset', 'highlight', 'span'],
  quote: ['type', 'text', 'attribution', 'sourceId', 'span'],
  table: ['type', 'caption', 'columns', 'rows', 'span'],
  timeline: ['type', 'steps', 'span'],
  stepper: ['type', 'steps', 'span'],
  compare: ['type', 'before', 'after', 'caption', 'span'],
  assetCard: ['type', 'asset', 'description', 'span'],
  sources: ['type', 'ids', 'span'],
  divider: ['type', 'label', 'span'],
};

function checkBlock(ctx: Ctx, v: unknown, path: string): void {
  if (!isRecord(v)) {
    err(ctx, path, 'block must be an object');
    return;
  }
  const t = v['type'];
  if (t === undefined) {
    err(ctx, path, 'block is missing required property \'type\'');
    return;
  }
  if (typeof t !== 'string' || t.length === 0) {
    err(ctx, `${path}.type`, 'block type must be a non-empty string');
    return;
  }
  // Extension blocks are valid: unknown types pass structural validation and
  // are reported as warnings by validateAuditFolder.
  if (!(KNOWN_BLOCK_TYPES as readonly string[]).includes(t)) return;
  enterObject(ctx, v, path, `${t} block`, BLOCK_KNOWN_KEYS[t] ?? ['type', 'span']);
  checkSpan(ctx, v['span'], `${path}.span`);
  BLOCK_CHECKERS[t]?.(ctx, v, path);
}

export function validateAgainstSchema(doc: unknown): SchemaIssue[] {
  const ctx: Ctx = [];
  if (
    !enterObject(ctx, doc, '$', 'audit document', [
      'contract', 'meta', 'visibility', 'access', 'accent', 'badge', 'deposit', 'cover',
      'assets', 'annexes', 'deliverables', 'findings', 'sources', 'glossary', 'sections',
    ])
  ) {
    return ctx;
  }
  required(ctx, doc, '$', 'audit document', [
    'contract', 'meta', 'visibility', 'cover', 'assets',
    'deliverables', 'findings', 'sources', 'glossary', 'sections',
  ]);
  if (doc['contract'] !== undefined && doc['contract'] !== AUDIT_CONTRACT) {
    err(ctx, '$.contract', `contract must be '${AUDIT_CONTRACT}'`);
  }
  if (doc['meta'] !== undefined) checkMeta(ctx, doc['meta'], '$.meta');
  if (doc['visibility'] !== undefined) checkEnum(ctx, doc['visibility'], '$.visibility', 'visibility', ['public', 'private']);
  if (doc['access'] !== undefined) {
    const access = doc['access'];
    if (enterObject(ctx, access, '$.access', 'access', ['emails'])) {
      required(ctx, access, '$.access', 'access', ['emails']);
      if (access['emails'] !== undefined) {
        if (!Array.isArray(access['emails'])) {
          err(ctx, '$.access.emails', 'access emails must be an array');
        } else {
          access['emails'].forEach((e, i) => {
            checkString(ctx, e, `$.access.emails[${i}]`, `access email ${i}`, { format: 'email' });
          });
        }
      }
    }
  }
  if (doc['accent'] !== undefined) checkEnum(ctx, doc['accent'], '$.accent', 'accent', ['lab', 'experiment']);
  if (doc['badge'] !== undefined) {
    const badge = doc['badge'];
    if (enterObject(ctx, badge, '$.badge', 'badge', ['issued', 'validUntil', 'scope', 'previous'])) {
      required(ctx, badge, '$.badge', 'badge', ['issued', 'scope']);
      checkOptionalString(ctx, badge['issued'], '$.badge.issued', 'badge issue date', { format: 'date' });
      checkOptionalString(ctx, badge['validUntil'], '$.badge.validUntil', 'badge validity end', { format: 'date' });
      checkOptionalString(ctx, badge['scope'], '$.badge.scope', 'badge scope');
      checkOptionalString(ctx, badge['previous'], '$.badge.previous', 'previous audit slug', { pattern: SLUG_RE });
    }
  }
  if (doc['deposit'] !== undefined) {
    const deposit = doc['deposit'];
    if (enterObject(ctx, deposit, '$.deposit', 'deposit', ['versionDoi', 'conceptDoi', 'depositedAt', 'consent', 'draftDepositionId', 'draftDoi'])) {
      checkOptionalString(ctx, deposit['versionDoi'], '$.deposit.versionDoi', 'deposit version DOI', { pattern: DOI_RE });
      checkOptionalString(ctx, deposit['conceptDoi'], '$.deposit.conceptDoi', 'deposit concept DOI', { pattern: DOI_RE });
      checkOptionalString(ctx, deposit['depositedAt'], '$.deposit.depositedAt', 'deposit date', { format: 'date' });
      if (deposit['draftDepositionId'] !== undefined) {
        checkInt(ctx, deposit['draftDepositionId'], '$.deposit.draftDepositionId', 'deposit draft deposition id', 1, Number.MAX_SAFE_INTEGER);
      }
      checkOptionalString(ctx, deposit['draftDoi'], '$.deposit.draftDoi', 'deposit draft DOI', { pattern: DOI_RE });
      if (deposit['consent'] !== undefined && deposit['consent'] !== true) {
        err(ctx, '$.deposit.consent', 'deposit consent must be true');
      }
    }
  }
  if (doc['cover'] !== undefined) {
    const cover = doc['cover'];
    if (enterObject(ctx, cover, '$.cover', 'cover', ['layout', 'background'])) {
      required(ctx, cover, '$.cover', 'cover', ['layout']);
      if (cover['layout'] !== undefined) checkLayout(ctx, cover['layout'], '$.cover.layout');
      checkOptionalString(ctx, cover['background'], '$.cover.background', 'cover background');
    }
  }
  if (doc['assets'] !== undefined) {
    if (!Array.isArray(doc['assets'])) {
      err(ctx, '$.assets', 'assets must be an array');
    } else {
      doc['assets'].forEach((a, i) => checkAsset(ctx, a, `$.assets[${i}]`));
    }
  }
  if (doc['annexes'] !== undefined) {
    if (!Array.isArray(doc['annexes'])) {
      err(ctx, '$.annexes', 'annexes must be an array');
    } else {
      doc['annexes'].forEach((a, i) => checkAnnex(ctx, a, `$.annexes[${i}]`));
    }
  }
  if (doc['deliverables'] !== undefined) {
    const d = doc['deliverables'];
    if (enterObject(ctx, d, '$.deliverables', 'deliverables', ['report', 'bundle', 'repository', 'repositoryPublic', 'signedDocId'])) {
      checkOptionalString(ctx, d['report'], '$.deliverables.report', 'report asset');
      checkOptionalString(ctx, d['bundle'], '$.deliverables.bundle', 'bundle asset');
      checkOptionalString(ctx, d['repository'], '$.deliverables.repository', 'repository URL', { format: 'uri', pattern: HTTPS_RE });
      if (d['repositoryPublic'] !== undefined && d['repositoryPublic'] !== true) {
        err(ctx, '$.deliverables.repositoryPublic', 'repository visibility must be true');
      }
      if (d['signedDocId'] !== undefined) {
        checkString(ctx, d['signedDocId'], '$.deliverables.signedDocId', 'signed document id', { pattern: /^[0-9a-f]{32}$/ });
      }
    }
  }
  if (doc['findings'] !== undefined) {
    if (!Array.isArray(doc['findings'])) {
      err(ctx, '$.findings', 'findings must be an array');
    } else {
      doc['findings'].forEach((f, i) => checkFinding(ctx, f, `$.findings[${i}]`));
    }
  }
  if (doc['sources'] !== undefined) {
    if (!Array.isArray(doc['sources'])) {
      err(ctx, '$.sources', 'sources must be an array');
    } else {
      doc['sources'].forEach((s, i) => {
        if (enterObject(ctx, s, `$.sources[${i}]`, 'source', ['id', 'title', 'url', 'publisher', 'accessed'])) {
          required(ctx, s, `$.sources[${i}]`, 'source', ['id', 'title']);
          checkOptionalString(ctx, s['id'], `$.sources[${i}].id`, 'source id', { pattern: ID_RE });
          checkOptionalString(ctx, s['title'], `$.sources[${i}].title`, 'source title');
          checkOptionalString(ctx, s['url'], `$.sources[${i}].url`, 'source url', { format: 'uri' });
          checkOptionalString(ctx, s['publisher'], `$.sources[${i}].publisher`, 'source publisher');
          checkOptionalString(ctx, s['accessed'], `$.sources[${i}].accessed`, 'source access date', { format: 'date' });
        }
      });
    }
  }
  if (doc['glossary'] !== undefined) {
    if (!Array.isArray(doc['glossary'])) {
      err(ctx, '$.glossary', 'glossary must be an array');
    } else {
      doc['glossary'].forEach((g, i) => {
        if (enterObject(ctx, g, `$.glossary[${i}]`, 'glossary term', ['term', 'definition'])) {
          required(ctx, g, `$.glossary[${i}]`, 'glossary term', ['term', 'definition']);
          checkOptionalString(ctx, g['term'], `$.glossary[${i}].term`, 'glossary term');
          checkOptionalString(ctx, g['definition'], `$.glossary[${i}].definition`, 'glossary definition');
        }
      });
    }
  }
  if (doc['sections'] !== undefined) {
    if (!Array.isArray(doc['sections']) || doc['sections'].length === 0) {
      err(ctx, '$.sections', 'sections must be a non-empty array');
    } else {
      doc['sections'].forEach((s, i) => {
        if (enterObject(ctx, s, `$.sections[${i}]`, 'section', ['id', 'title', 'navLabel', 'layout', 'blocks'])) {
          required(ctx, s, `$.sections[${i}]`, 'section', ['id', 'title', 'layout', 'blocks']);
          checkOptionalString(ctx, s['id'], `$.sections[${i}].id`, 'section id', { pattern: ID_RE });
          checkOptionalString(ctx, s['title'], `$.sections[${i}].title`, 'section title');
          checkOptionalString(ctx, s['navLabel'], `$.sections[${i}].navLabel`, 'section nav label');
          if (s['layout'] !== undefined) checkLayout(ctx, s['layout'], `$.sections[${i}].layout`);
          if (s['blocks'] !== undefined) {
            if (!Array.isArray(s['blocks']) || s['blocks'].length === 0) {
              err(ctx, `$.sections[${i}].blocks`, 'section blocks must be a non-empty array');
            } else {
              s['blocks'].forEach((b, j) => checkBlock(ctx, b, `$.sections[${i}].blocks[${j}]`));
            }
          }
        }
      });
    }
  }
  return ctx;
}

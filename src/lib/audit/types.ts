// TypeScript mirror of public/schemas/audit/v1.json (contract univerlab.audit/1).
// The agreement test in src/__tests__/audit-schema.test.ts pins the two together:
// KNOWN_BLOCK_TYPES and LAYOUT_TYPES must match the schema's closed lists, and
// every schema property carries a description. Change both sides together.

export const AUDIT_CONTRACT = 'univerlab.audit/1' as const;
export const AUDIT_SCHEMA_URL = 'https://univerlab.org/schemas/audit/v1.json';

export const LAYOUT_TYPES = ['single', 'wide', 'split', 'grid', 'band', 'sidebar'] as const;
export type LayoutType = (typeof LAYOUT_TYPES)[number];

export const LAYOUT_RATIOS = ['1-2', '2-1', '1-3', '3-1'] as const;
export type LayoutRatio = (typeof LAYOUT_RATIOS)[number];

export const KNOWN_BLOCK_TYPES = [
  'heading',
  'prose',
  'callout',
  'stats',
  'finding',
  'findingsTable',
  'riskMatrix',
  'chart',
  'figure',
  'diagram',
  'code',
  'quote',
  'table',
  'timeline',
  'stepper',
  'compare',
  'assetCard',
  'sources',
  'divider',
] as const;
export type KnownBlockType = (typeof KNOWN_BLOCK_TYPES)[number];

export const ASSET_KINDS = ['pdf', 'image', 'video', 'audio', 'data', 'code', 'archive'] as const;
// Conveniences the renderer knows; any other non-empty kind stays valid and
// is shown by file extension and media type (see the v1 schema).
export type AssetKind = (typeof ASSET_KINDS)[number] | (string & {});

export const MEDIA_KINDS: readonly AssetKind[] = ['image', 'video', 'audio'];

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FINDING_STATUSES = ['open', 'fixed', 'accepted', 'wont-fix'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const EFFORTS = ['small', 'medium', 'large'] as const;
export type Effort = (typeof EFFORTS)[number];

export const CALLOUT_TONES = ['info', 'success', 'warning', 'danger'] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

// Inline prose references the renderer makes interactive: {{finding:F-01}},
// {{source:owasp}}, {{term:token}}, {{asset:diagram}} or {{annex:sandbox}}.
export const PROSE_REF = /\{\{(finding|source|term|asset|annex):([^}]+)\}\}/g;

export type ProseRefKind = 'finding' | 'source' | 'term' | 'asset' | 'annex';

export interface AuditClient {
  name: string;
  url?: string;
}

export interface AuditPerson {
  name: string;
  url?: string;
}

export interface AuditPeriod {
  start: string;
  end: string;
}

export interface AuditMeta {
  title: string;
  subtitle?: string;
  language: 'es' | 'en';
  client: AuditClient;
  auditors: AuditPerson[];
  auditPeriod: AuditPeriod;
  version: string;
  status: 'draft' | 'delivered' | 'final';
  scope: string;
}

export interface AuditAccess {
  emails: string[];
}

export interface AuditBadge {
  issued: string;
  validUntil?: string;
  scope: string;
  previous?: string;
}

/** The permanent Zenodo deposit of a published audit. Every field is
 *  optional so v1 documents without a deposit stay valid; the deposit
 *  command writes the DOIs after publication. The license for the Zenodo
 *  record is not a field here: it rides on the `x-license` extension
 *  property, valid today via the schema's `^x-` rule. */
export interface AuditDeposit {
  versionDoi?: string;
  conceptDoi?: string;
  depositedAt?: string;
  consent?: boolean;
  draftDepositionId?: number;
  draftDoi?: string;
}

export interface AuditCover {
  layout: AuditLayout;
  background?: string;
}

export interface AuditLayout {
  type: LayoutType;
  ratio?: LayoutRatio;
  columns?: number;
}

export interface AuditAsset {
  id: string;
  path: string;
  kind: AssetKind;
  title: string;
  alt?: string;
  bytes: number;
  sha256: string;
}

export interface AuditDeliverables {
  report?: string;
  bundle?: string;
  repository?: string;
  repositoryPublic?: true;
}

export interface AuditCost {
  amount: number;
  currency: string;
}

export interface AuditEvidence {
  type: 'asset' | 'source' | 'annex';
  id: string;
}

export interface AuditAnnex {
  id: string;
  title: string;
  /** What the annex is, as Markdown without raw HTML. */
  description: string;
  /** Optional usage instructions as Markdown, e.g. how to run a sandbox. */
  instructions?: string;
  /** Catalogue asset ids bundled in this annex. */
  assets: string[];
  /** Who sees this annex. Omitted means private: hidden from the public
   *  page, and its files answer 404 on the public route. */
  visibility?: 'public' | 'private';
}

export interface AuditFinding {
  id: string;
  title: string;
  severity: Severity;
  likelihood: number;
  impact: number;
  area: string;
  status: FindingStatus;
  summary: string;
  evidence: AuditEvidence[];
  recommendation: string;
  effort: Effort;
  cost?: AuditCost;
  fixedIn?: string;
}

export interface AuditSource {
  id: string;
  title: string;
  url?: string;
  publisher?: string;
  accessed?: string;
}

export interface AuditGlossaryTerm {
  term: string;
  definition: string;
}

export interface AuditSection {
  id: string;
  title: string;
  navLabel?: string;
  layout: AuditLayout;
  blocks: AuditBlock[];
}

interface BlockBase {
  span?: number;
}

export interface HeadingBlock extends BlockBase {
  type: 'heading';
  level: number;
  text: string;
}

export interface ProseBlock extends BlockBase {
  type: 'prose';
  markdown: string;
}

export interface CalloutBlock extends BlockBase {
  type: 'callout';
  tone: CalloutTone;
  title?: string;
  markdown: string;
}

export interface StatItem {
  value: string;
  label: string;
  delta?: string;
}

export interface StatsBlock extends BlockBase {
  type: 'stats';
  items: StatItem[];
}

export interface FindingBlock extends BlockBase {
  type: 'finding';
  findingId: string;
}

export interface FindingsTableBlock extends BlockBase {
  type: 'findingsTable';
  severity?: Severity[];
  status?: FindingStatus[];
}

export interface RiskMatrixBlock extends BlockBase {
  type: 'riskMatrix';
  title?: string;
}

export interface ChartBlock extends BlockBase {
  type: 'chart';
  spec?: Record<string, unknown>;
  dataAsset?: string;
  caption?: string;
}

export interface FigureBlock extends BlockBase {
  type: 'figure';
  asset: string;
  caption?: string;
  poster?: string;
}

export interface DiagramBlock extends BlockBase {
  type: 'diagram';
  mermaid: string;
  caption?: string;
}

export interface CodeBlock extends BlockBase {
  type: 'code';
  language: string;
  source?: string;
  sourceAsset?: string;
  highlight?: number[];
}

export interface QuoteBlock extends BlockBase {
  type: 'quote';
  text: string;
  attribution?: string;
  sourceId?: string;
}

export interface TableBlock extends BlockBase {
  type: 'table';
  caption?: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface TimelineStep {
  title: string;
  description?: string;
  effort?: Effort;
  cost?: AuditCost;
}

export interface TimelineBlock extends BlockBase {
  type: 'timeline';
  steps: TimelineStep[];
}

export interface StepperStep {
  title: string;
  markdown: string;
}

export interface StepperBlock extends BlockBase {
  type: 'stepper';
  steps: StepperStep[];
}

export interface CompareBlock extends BlockBase {
  type: 'compare';
  before: string;
  after: string;
  caption?: string;
}

export interface AssetCardBlock extends BlockBase {
  type: 'assetCard';
  asset: string;
  description?: string;
}

export interface SourcesBlock extends BlockBase {
  type: 'sources';
  ids: string[];
}

export interface DividerBlock extends BlockBase {
  type: 'divider';
  label?: string;
}

// Any block type outside the v1 catalogue. Valid by design: renderers skip
// unknown types and the validator reports them as warnings, not errors.
export interface ExtensionBlock {
  type: string;
  [key: string]: unknown;
}

export type KnownAuditBlock =
  | HeadingBlock
  | ProseBlock
  | CalloutBlock
  | StatsBlock
  | FindingBlock
  | FindingsTableBlock
  | RiskMatrixBlock
  | ChartBlock
  | FigureBlock
  | DiagramBlock
  | CodeBlock
  | QuoteBlock
  | TableBlock
  | TimelineBlock
  | StepperBlock
  | CompareBlock
  | AssetCardBlock
  | SourcesBlock
  | DividerBlock;

export type AuditBlock = KnownAuditBlock | ExtensionBlock;

export interface AuditDocument {
  contract: typeof AUDIT_CONTRACT;
  meta: AuditMeta;
  visibility: 'public' | 'private';
  access?: AuditAccess;
  accent?: 'lab' | 'experiment';
  badge?: AuditBadge;
  deposit?: AuditDeposit;
  cover: AuditCover;
  assets: AuditAsset[];
  annexes?: AuditAnnex[];
  deliverables: AuditDeliverables;
  findings: AuditFinding[];
  sources: AuditSource[];
  glossary: AuditGlossaryTerm[];
  sections: AuditSection[];
}

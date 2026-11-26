/**
 * Shared cookieless campaign convention for univerlab.org.
 *
 * Campaign links to site pages carry `utm_source`, `utm_medium`,
 * `utm_campaign` and optional `utm_content`. Values are lowercase
 * `a-z0-9-`, bounded in length. The tab keeps them in `sessionStorage`
 * only — never cookies, never `localStorage`, never any user or session
 * ID — and funnel actions report them back with `reportEvent`.
 *
 * Install commands (`install.univerlab.org/<tool>`, `get.univerlab.org`)
 * stay clean and never carry UTM parameters.
 */

/** Lowercase letters, digits and dashes, 1–64 chars. */
export const UTM_RE = /^[a-z0-9-]{1,64}$/;

/** `utm_content` allows a longer tail, 1–128 chars. */
export const UTM_CONTENT_RE = /^[a-z0-9-]{1,128}$/;

/** Funnel actions the browser may report to `POST /api/event`. */
export const FUNNEL_EVENTS = [
  'copy_install',
  'workbench_visit',
  'booking_click',
  'whatsapp_click',
  'page_view',
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export interface UtmFields {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;

/** The only storage key this module touches (`sessionStorage`, tab-only). */
export const UTM_KEY = 'ul_utm';

/** Normalize one raw value: trim, lowercase, keep only when it matches `re`. */
function cleanUtm(raw: string | null, re: RegExp): string | undefined {
  if (raw === null) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === '') return undefined;
  return re.test(v) ? v : undefined;
}

/**
 * Pick the valid `utm_*` fields out of `search`. Anything missing, empty,
 * over-long or outside `a-z0-9-` is dropped — never passed through.
 */
export function parseUtm(search: URLSearchParams): UtmFields {
  const out: UtmFields = {};
  const source = cleanUtm(search.get('utm_source'), UTM_RE);
  const medium = cleanUtm(search.get('utm_medium'), UTM_RE);
  const campaign = cleanUtm(search.get('utm_campaign'), UTM_RE);
  const content = cleanUtm(search.get('utm_content'), UTM_CONTENT_RE);
  if (source !== undefined) out.utm_source = source;
  if (medium !== undefined) out.utm_medium = medium;
  if (campaign !== undefined) out.utm_campaign = campaign;
  if (content !== undefined) out.utm_content = content;
  return out;
}

/**
 * Build a tagged campaign URL for a site page. Throws on an invalid path
 * or on any UTM value outside the convention. Never use this for install
 * commands — those stay clean.
 */
export function buildCampaignUrl(path: string, utm: UtmFields): string {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new Error('buildCampaignUrl: path must start with /');
  }
  const params = new URLSearchParams();
  const checked: UtmFields = parseUtm(
    new URLSearchParams({
      ...(utm.utm_source !== undefined ? { utm_source: utm.utm_source } : {}),
      ...(utm.utm_medium !== undefined ? { utm_medium: utm.utm_medium } : {}),
      ...(utm.utm_campaign !== undefined ? { utm_campaign: utm.utm_campaign } : {}),
      ...(utm.utm_content !== undefined ? { utm_content: utm.utm_content } : {}),
    }),
  );
  if (utm.utm_source !== undefined && checked.utm_source === undefined) {
    throw new Error('buildCampaignUrl: invalid utm_source');
  }
  if (utm.utm_medium !== undefined && checked.utm_medium === undefined) {
    throw new Error('buildCampaignUrl: invalid utm_medium');
  }
  if (utm.utm_campaign !== undefined && checked.utm_campaign === undefined) {
    throw new Error('buildCampaignUrl: invalid utm_campaign');
  }
  if (utm.utm_content !== undefined && checked.utm_content === undefined) {
    throw new Error('buildCampaignUrl: invalid utm_content');
  }
  for (const k of UTM_KEYS) {
    if (checked[k] !== undefined) params.set(k, checked[k] as string);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Re-validate stored fields on the way out: storage is untrusted input. */
function cleanStored(raw: unknown): UtmFields {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const params = new URLSearchParams();
  for (const k of UTM_KEYS) {
    if (typeof r[k] === 'string') params.set(k, r[k] as string);
  }
  return parseUtm(params);
}

/**
 * Read the tab's active UTM fields. Re-validates; `{}` when nothing was
 * stored, storage is unavailable, or the stored value fails validation.
 */
export function loadUtm(): UtmFields {
  try {
    const store =
      typeof window === 'undefined' ? undefined : window.sessionStorage;
    if (!store) return {};
    const raw = store.getItem(UTM_KEY);
    if (!raw) return {};
    return cleanStored(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

/**
 * Store UTM fields for this tab only. With an argument, stores exactly
 * those fields (re-validated; `{}` clears). Without one, picks valid
 * fields out of the current URL and keeps the stored set when the URL
 * carries none — navigating on never wipes the landing attribution.
 */
export function saveUtm(utm?: UtmFields): void {
  try {
    const store =
      typeof window === 'undefined' ? undefined : window.sessionStorage;
    if (!store) return;
    if (utm !== undefined) {
      const params = new URLSearchParams();
      for (const k of UTM_KEYS) {
        if (typeof utm[k] === 'string') params.set(k, utm[k] as string);
      }
      const checked = parseUtm(params);
      if (Object.keys(checked).length === 0) {
        store.removeItem(UTM_KEY);
      } else {
        store.setItem(UTM_KEY, JSON.stringify(checked));
      }
      return;
    }
    if (typeof window === 'undefined') return;
    const found = parseUtm(new URLSearchParams(window.location.search));
    if (Object.keys(found).length > 0) {
      store.setItem(UTM_KEY, JSON.stringify(found));
    }
  } catch {
    // Storage full or blocked: attribution is best-effort, never a breakage.
  }
}

export interface ReportPayload {
  tool?: string;
  path?: string;
}

/**
 * Report one funnel action to `POST /api/event` without blocking the
 * caller: `navigator.sendBeacon` first, `fetch` with `keepalive` as the
 * fallback. Refreshes the tab's UTM from the current URL first so a
 * landing page reports its own parameters. Never throws.
 */
export function reportEvent(name: FunnelEvent, payload?: ReportPayload): void {
  try {
    if (!(FUNNEL_EVENTS as readonly string[]).includes(name)) return;
    saveUtm();
    const utm = loadUtm();
    const body = JSON.stringify({
      event: name,
      ...(payload?.tool !== undefined ? { tool: payload.tool } : {}),
      path:
        payload?.path !== undefined
          ? payload.path
          : typeof window === 'undefined'
            ? ''
            : window.location.pathname,
      ...utm,
    });
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      try {
        const blob =
          typeof Blob !== 'undefined'
            ? new Blob([body], { type: 'application/json' })
            : (body as unknown as Blob);
        if (navigator.sendBeacon('/api/event', blob)) return;
      } catch {
        // Fall through to fetch.
      }
    }
    if (typeof fetch === 'function') {
      void fetch('/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Reporting never breaks copy or navigation.
  }
}

/**
 * Paths where no `page_view` is ever emitted: private areas plus the
 * workbench, which already reports `workbench_visit`. Exact match or a
 * subpath (`/admin/x`, never `/administrator`).
 */
const PAGE_VIEW_SKIP = [
  '/admin',
  '/es/admin',
  '/sign',
  '/es/sign',
  '/workbench',
  '/es/workbench',
];

function isSkippedPageViewPath(pathname: string): boolean {
  return PAGE_VIEW_SKIP.some((s) => pathname === s || pathname.startsWith(s + '/'));
}

/**
 * Record one cookieless `page_view` for post-landing navigation in a
 * campaign tab. Refreshes the tab UTM from the current URL first; when
 * the URL itself carries valid `utm_*` the edge `recordLanding` already
 * wrote `landing`, so nothing is emitted. Emits only when
 * `sessionStorage` already holds active UTM fields and the current page
 * is public. Never throws; `sessionStorage` only, no cookies, no
 * `localStorage`, no user/session IDs, no IP, no raw user-agent.
 */
export function trackCampaignNavigation(): void {
  try {
    saveUtm();
    if (typeof window === 'undefined') return;
    const urlUtm = parseUtm(new URLSearchParams(window.location.search));
    if (Object.keys(urlUtm).length > 0) return;
    if (Object.keys(loadUtm()).length === 0) return;
    const pathname = window.location.pathname;
    if (isSkippedPageViewPath(pathname)) return;
    reportEvent('page_view', { path: pathname });
  } catch {
    // Attribution is best-effort, never a breakage.
  }
}

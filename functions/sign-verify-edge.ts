// The public signature verification route (FR3), kept out of
// functions/_middleware.ts so the middleware stays under its line budget.
// Pure orchestration over injected dependencies: the shell rewriter and the
// headers travel as arguments, so this module never imports the middleware.
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { loadRequest, type SignBucket } from '../src/lib/sign/store';
import { verifyHtml, type VerifyStrings } from '../src/lib/sign/verify';

export const SIGN_VERIFY_RE = /^\/sign\/verify\/([0-9a-f]{32})\/?$/;
export const SIGN_VERIFY_ES_RE = /^\/es\/sign\/verify\/([0-9a-f]{32})\/?$/;

/** The narrow environment the verify route reads: the private SIGN_DOCS
 *  bucket in its edge shape, cast down like the middleware's asSignBucket. */
export interface SignVerifyEnv {
  SIGN_DOCS?: unknown;
  ASSETS?: { fetch: (input: string | Request) => Promise<Response> };
}

export interface SignVerifyShell {
  lang: string;
  title: string;
  desc: string;
  canonical: string;
  html: string;
}

/** Serve a public verification page inside the sign shell. Null when this
 *  request is not a verify route (or wants the markdown twin): the caller
 *  keeps its normal flow. Unknown ids also answer null so the caller falls
 *  through to the site's 404. Answers carry the caller's noindex headers. */
export async function serveSignVerify(
  request: Request,
  env: SignVerifyEnv,
  rewrite: (shell: Response, opts: SignVerifyShell) => Promise<Response>,
  headers: Record<string, string>,
): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const accept = request.headers.get('Accept') ?? '';
  if (accept.split(',').some((p) => p.trim().split(';')[0].trim().toLowerCase() === 'text/markdown')) {
    return null;
  }
  const url = new URL(request.url);
  const match = SIGN_VERIFY_RE.exec(url.pathname) ?? SIGN_VERIFY_ES_RE.exec(url.pathname);
  if (!match) return null;
  const lang = SIGN_VERIFY_ES_RE.test(url.pathname) ? 'es' : 'en';
  const req = await loadRequest(env.SIGN_DOCS as unknown as SignBucket | undefined, match[1]);
  if (!req) return null;
  const shell = await env.ASSETS?.fetch(new URL(lang === 'es' ? '/es/sign-shell/' : '/sign-shell/', url.origin).href);
  if (!shell || !shell.ok) return null;
  const dict = lang === 'es' ? es.sign : en.sign;
  const res = await rewrite(shell, {
    lang,
    title: `${dict.verifyTitle}: ${req.title} — UniverLab`,
    desc: dict.shellDescription,
    canonical: new URL(url.pathname, url.origin).href,
    html: verifyHtml(req, lang, dict as unknown as VerifyStrings),
  });
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

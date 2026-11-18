// Signing edge helpers shared by functions/_middleware.ts: extracting the
// Access JWT browsers carry, rendering the signing page for the verified
// address, and answering the site 404 page for private signing routes.
import { linkState, type SigningRequest } from '../src/lib/sign/evidence';
import { signInnerHtml, type SignStrings, type SignViewer } from '../src/lib/sign/page';

/** The narrow environment these helpers read: the Access team domain for
 *  the logout link and the static assets binding for the 404 page. */
export interface SignEdgeEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ASSETS?: { fetch: (input: string | Request) => Promise<Response> };
}

/** The Access JWT for a signing route: header first, then the
 *  `CF_Authorization` cookie browsers carry after the email OTP. */
export function signToken(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === 'CF_Authorization' && rest.length > 0) return rest.join('=').trim();
  }
  return null;
}

/** The Cloudflare Access logout URL that lets the signer switch to the
 *  link's address. Null when no team domain is configured. */
export function signLogoutUrl(team: string | undefined | null): string | null {
  if (!team) return null;
  const host = team
    .trim()
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
    .replace(/\/+$/, '');
  if (!host) return null;
  return `https://${host}/cdn-cgi/access/logout`;
}

/** Render the signing page for the verified address: the token email (or
 *  null when no session) travels with the viewer so a mismatched address
 *  sees the identity notice instead of the form and the PDF. */
export async function signPageHtml(
  request: Request,
  req: SigningRequest,
  strings: SignStrings,
  verify: (token: string, env: SignEdgeEnv) => Promise<string | null>,
  env: SignEdgeEnv,
): Promise<string> {
  const token = signToken(request);
  const email = token ? await verify(token, env) : null;
  const viewer: SignViewer = { email, logoutUrl: signLogoutUrl(env.ACCESS_TEAM_DOMAIN) };
  return signInnerHtml(req, linkState(req), strings, viewer);
}

/** The site's normal 404 page for a private signing route that answers 404
 *  today; a bare text fallback when the static page cannot be served. */
export async function siteNotFound(
  env: SignEdgeEnv,
  request: Request,
  headers?: Record<string, string> | Headers,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const res = await env.ASSETS?.fetch(new URL('/404.html', url.origin).href);
    if (res?.ok) {
      const out = new Headers(headers);
      if (!out.has('Content-Type')) out.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(res.body, { status: 404, headers: out });
    }
  } catch {
    // Falls through to the bare text answer below.
  }
  return new Response('not found', { status: 404, headers: headers });
}

const MARKDOWN_EXTS = new Set(['md', 'json', 'png', 'svg', 'xml', 'txt', 'mp4']);

// Path prefixes that only ever serve build output, never a page. Astro emits
// hashed assets under /_astro/, and a hashed filename carries no extension we
// can enumerate, so the prefix is the reliable guard.
const ASSET_PREFIXES = ['/_astro/'];

export function wantsMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;
  const parts = accept.split(',');
  for (const part of parts) {
    const media = part.trim().split(';')[0].trim().toLowerCase();
    if (media === 'text/markdown') return true;
  }
  return false;
}

export function markdownTwinPath(pathname: string): string | null {
  if (ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const lastSegment = pathname.split('/').pop() || '';
  if (lastSegment.includes('.')) {
    const ext = lastSegment.split('.').pop()!.toLowerCase();
    if (MARKDOWN_EXTS.has(ext)) return null;
  }
  let normalized = pathname;
  if (!normalized.endsWith('/')) {
    normalized += '/';
  }
  return normalized + 'index.md';
}

export async function onRequest(context: {
  request: Request;
  env: { ASSETS: { fetch: (input: string | Request) => Promise<Response> } };
  next: () => Promise<Response>;
}): Promise<Response> {
  const { request, env, next } = context;

  if (!wantsMarkdown(request.headers.get('Accept'))) {
    return next();
  }

  try {
    const url = new URL(request.url);
    const twin = markdownTwinPath(url.pathname);
    if (!twin) return next();

    const res = await env.ASSETS.fetch(new URL(twin, url.origin).href);
    if (!res.ok) return next();

    const body = await res.text();
    return new Response(body, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Vary': 'Accept',
      },
    });
  } catch {
    return next();
  }
}

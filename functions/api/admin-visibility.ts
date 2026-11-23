// The admin visibility flip (FR3): publish or unpublish one audit by
// rewriting its audit.json in R2. Publishing refuses while a critical or
// high finding is open. Owner-only behind Cloudflare Access.
import { verifyAccessToken } from '../_middleware';
import { handleSetVisibility, type AdminEnv } from '../../src/lib/admin/handlers';

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  return handleSetVisibility(context.request, context.env, { verify: verifyAccessToken });
}

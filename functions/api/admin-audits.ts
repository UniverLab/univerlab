// The admin audits list (FR2): every audit in the R2 bucket as panel rows.
// Owner-only behind Cloudflare Access; the JWT arrives as the
// Cf-Access-Jwt-Assertion header or the CF_Authorization cookie.
import { verifyAccessToken } from '../_middleware';
import { handleListAudits, type AdminEnv } from '../../src/lib/admin/handlers';

export async function onRequestGet(context: { request: Request; env: AdminEnv }): Promise<Response> {
  return handleListAudits(context.request, context.env, { verify: verifyAccessToken });
}

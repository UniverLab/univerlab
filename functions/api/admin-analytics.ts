// The control-room analytics endpoint (read-only aggregates over the
// `univerlab_funnel` and `univerlab_installs` Analytics Engine datasets).
// Owner-only behind Cloudflare Access; the JWT arrives as the
// Cf-Access-Jwt-Assertion header or the CF_Authorization cookie. Unlike the
// audit routes this one needs no R2 bucket, so it gates on the owner
// allowlist only (never the bucket gate).
import { verifyAccessToken } from '../_middleware';
import { handleAdminAnalytics, type AnalyticsEnv } from '../../src/lib/admin/analytics';

export async function onRequestGet(context: { request: Request; env: AnalyticsEnv }): Promise<Response> {
  const cache =
    typeof caches !== 'undefined' && (caches as unknown as { default?: never })['default']
      ? (caches as unknown as { default: {
          match(request: Request): Promise<Response | undefined>;
          put(request: Request, response: Response): Promise<void>;
        } })['default']
      : undefined;
  return handleAdminAnalytics(context.request, context.env, { verify: verifyAccessToken, cache });
}

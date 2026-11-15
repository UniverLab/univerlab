// Owner endpoints for signing requests (FR1, FR8): POST creates a request
// from an uploaded PDF, GET lists every request. Both need an owner
// allowlist address behind Cloudflare Access; the JWT arrives as the
// Cf-Access-Jwt-Assertion header or the CF_Authorization cookie.
import { verifyAccessToken } from '../_middleware';
import { handleCreateRequest, handleListRequests, type SignEnv } from '../../src/lib/sign/handlers';
import type { SignBucket } from '../../src/lib/sign/store';

interface Env extends SignEnv {
  SIGN_DOCS?: SignBucket;
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  return handleCreateRequest(context.request, context.env, { verify: verifyAccessToken });
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  return handleListRequests(context.request, context.env, { verify: verifyAccessToken });
}

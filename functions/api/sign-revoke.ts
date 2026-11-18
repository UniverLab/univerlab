// The owner revokes a signing request (FR5): JSON body with the request
// id. Owner allowlist behind Cloudflare Access, like the other owner
// endpoints; the JWT arrives as the Cf-Access-Jwt-Assertion header or the
// CF_Authorization cookie.
import { verifyAccessToken } from '../_middleware';
import { handleRevokeRequest, type SignEnv } from '../../src/lib/sign/handlers';
import type { SignBucket } from '../../src/lib/sign/store';

interface Env extends SignEnv {
  SIGN_DOCS?: SignBucket;
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  return handleRevokeRequest(context.request, context.env, { verify: verifyAccessToken });
}

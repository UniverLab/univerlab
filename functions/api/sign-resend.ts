// The owner re-sends a signing invitation (FR5): JSON body with the
// request id. Only a pending, unexpired request is re-sent. Owner
// allowlist behind Cloudflare Access, like the other owner endpoints.
import { verifyAccessToken } from '../_middleware';
import { handleResendRequest, type SignEnv } from '../../src/lib/sign/handlers';
import type { SignBucket } from '../../src/lib/sign/store';

interface Env extends SignEnv {
  SIGN_DOCS?: SignBucket;
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  return handleResendRequest(context.request, context.env, { verify: verifyAccessToken });
}

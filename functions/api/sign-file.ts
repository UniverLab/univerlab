// Serves the original and the signed PDFs (FR4, FR6): the integrated viewer
// and both downloads read through here. Never public: the caller proves the
// request's email or an owner address on every read (FR8).
import { verifyAccessToken } from '../_middleware';
import { handleSignFile, type SignEnv } from '../../src/lib/sign/handlers';
import type { SignBucket } from '../../src/lib/sign/store';

interface Env extends SignEnv {
  SIGN_DOCS?: SignBucket;
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  return handleSignFile(context.request, context.env, { verify: verifyAccessToken });
}

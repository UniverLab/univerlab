// The signer completes the signature (FR5, FR6): JSON body with the name,
// ID number, acceptance tick and the hash they saw. The Access email claim
// must equal the request's email (FR3); the hash must equal the lab's
// accepted hash, or the document changed and needs a new request (FR7).
import { verifyAccessToken } from '../_middleware';
import { handleSignComplete, type SignEnv } from '../../src/lib/sign/handlers';
import type { SignBucket } from '../../src/lib/sign/store';

interface Env extends SignEnv {
  SIGN_DOCS?: SignBucket;
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  return handleSignComplete(context.request, context.env, { verify: verifyAccessToken });
}

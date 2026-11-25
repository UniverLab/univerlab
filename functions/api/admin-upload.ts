// The admin audit intake (FR1): add one audit edition from the control
// room, one file per request. Owner-only behind Cloudflare Access.
import { verifyAccessToken } from '../_middleware';
import { handleAdminUpload, type AdminEnv } from '../../src/lib/admin/handlers';

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  return handleAdminUpload(context.request, context.env, { verify: verifyAccessToken });
}

// The admin audit intake (FR1): add one audit edition from the control
// room, one request per step. Owner-only behind Cloudflare Access, which
// protects /api/admin-audits and its subpaths.
import { verifyAccessToken } from '../../_middleware';
import { handleAdminUpload, type AdminEnv } from '../../../src/lib/admin/handlers';

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  return handleAdminUpload(context.request, context.env, { verify: verifyAccessToken });
}

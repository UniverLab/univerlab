// The admin audit removal (FR4): delete an audit and every object under its
// key prefix. The body must carry confirm: true — the panel asks twice.
// Owner-only behind Cloudflare Access.
import { verifyAccessToken } from '../_middleware';
import { handleRemoveAudit, type AdminEnv } from '../../src/lib/admin/handlers';

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  return handleRemoveAudit(context.request, context.env, { verify: verifyAccessToken });
}

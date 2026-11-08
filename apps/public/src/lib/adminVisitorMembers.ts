import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { BackySiteVisitor, BackyVisitorMemberManagementContext } from '@backy-cms/core';
import { requireAdminAccess } from './adminAccess';
import { getRequiredDatabaseRepositories } from './repositoryRuntime';
export const VISITOR_MEMBER_RETENTION = {
  operation: 'remove-access', erasure: false, memberIdentityRetained: true, contentAttributionRetained: true,
  submissionsCommentsContactsAndFilesRetained: true, providerIdentityDeleted: false, automaticReenrollment: false,
  explanation: 'Remove access retains membership email/name and attribution, submitted comments/forms, contacts and private files under their existing retention policies. It revokes this website’s sessions and recovery challenges. It does not delete the shared provider identity or erase personal data.',
} as const;
const json = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers: { 'cache-control': 'private, no-store', pragma: 'no-cache', vary: 'Cookie, Authorization', 'x-content-type-options': 'nosniff' } });
class ManagementError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
const uuid = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const memberView = (member: BackySiteVisitor) => ({ id: member.id, siteId: member.siteId, email: member.email, displayName: member.displayName, status: member.status, createdAt: member.createdAt, updatedAt: member.updatedAt });
async function body(request: NextRequest): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ManagementError(415,'VISITOR_MANAGEMENT_JSON_REQUIRED','Use application/json.');
  const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  if (reader) while (true) { const value = await reader.read(); if (value.done) break; size += value.value.length; if (size > 8192) { await reader.cancel(); throw new ManagementError(413,'VISITOR_MANAGEMENT_BODY_TOO_LARGE','Member changes must fit within 8 KiB.'); } chunks.push(value.value); }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return parsed; } catch { throw new ManagementError(400,'INVALID_VISITOR_MANAGEMENT_INPUT','Use a JSON object.'); }
}
export async function handleAdminVisitorMembers(request: NextRequest, siteKey: string, memberId?: string, operation?: 'revoke-sessions') {
  const requestId = `req_${randomUUID()}`;
  try {
    const access = await requireAdminAccess(request, requestId, { permission: 'sites.configure' });
    if (access instanceof NextResponse) { access.headers.set('cache-control','private, no-store'); return access; }
    const repositories = await getRequiredDatabaseRepositories();
    const site = await repositories.sites.getById(siteKey) || await repositories.sites.getBySlug(siteKey);
    if (!site) throw new ManagementError(404,'SITE_NOT_FOUND','Site not found.');
    const repository = repositories.visitorAccounts?.management;
    if (!repository) throw new ManagementError(503,'VISITOR_MANAGEMENT_DATABASE_REQUIRED','Visitor member management requires the persisted database runtime and current migrations.');
    const context: BackyVisitorMemberManagementContext = { actorId: access.session?.user.id && uuid(access.session.user.id) ? access.session.user.id : null, requestId };
    if (!memberId) {
      if (request.method !== 'GET') throw new ManagementError(405,'VISITOR_MANAGEMENT_METHOD_DENIED','Use GET to list existing members; visitors enroll through the verified public account flow.');
      const query = new URL(request.url).searchParams, limit = query.get('limit') || '50', offset = query.get('offset') || '0', status = query.get('status') || '', search = query.get('search')?.trim() || '';
      if (!/^\d+$/.test(limit) || Number(limit)<1 || Number(limit)>100 || !/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset)) || status && !['active','suspended','removed'].includes(status) || search.length>120) throw new ManagementError(400,'INVALID_VISITOR_MANAGEMENT_QUERY','Use limit 1–100, a nonnegative offset, a valid status and search up to 120 characters.');
      const listed = await repository.list(site.id,{limit:Number(limit),offset:Number(offset),...(status ? {status:status as BackySiteVisitor['status']} : {}),...(search ? {search} : {})});
      return json({success:true,requestId,data:{siteId:site.id,members:listed.members.map(memberView),pagination:{limit:listed.limit,offset:listed.offset,hasMore:listed.hasMore},retention:VISITOR_MEMBER_RETENTION,policy:{enabled:site.settings.visitorAccounts?.enabled === true,registrationEnabled:site.settings.visitorAccounts?.registrationEnabled === true},permission:'sites.configure'}});
    }
    if (!uuid(memberId)) throw new ManagementError(404,'VISITOR_MEMBER_NOT_FOUND','Member not found in this website.');
    if (!operation && request.method === 'GET') {
      const member = await repository.getById(site.id,memberId); if (!member) throw new ManagementError(404,'VISITOR_MEMBER_NOT_FOUND','Member not found in this website.');
      return json({success:true,requestId,data:{siteId:site.id,member:memberView(member),retention:VISITOR_MEMBER_RETENTION}});
    }
    let result;
    if (operation === 'revoke-sessions' && request.method === 'POST') { const input = await body(request); if (Object.keys(input).length) throw new ManagementError(400,'INVALID_VISITOR_MANAGEMENT_INPUT','Session revocation accepts an empty JSON object.'); result = await repository.revokeSessions(site.id,memberId,context); }
    else if (!operation && request.method === 'PATCH') {
      const input = await body(request);
      if (!Object.keys(input).length || Object.keys(input).some(key => key !== 'displayName' && key !== 'status') || input.displayName !== undefined && (typeof input.displayName !== 'string' || input.displayName.trim().length>120 || /[\u0000-\u001f\u007f]/.test(input.displayName)) || input.status !== undefined && input.status !== 'active' && input.status !== 'suspended') throw new ManagementError(400,'INVALID_VISITOR_MANAGEMENT_INPUT','Only a display name up to 120 characters and active/suspended status can change. Email/provider identity and operator roles cannot be edited here.');
      result = await repository.update(site.id,memberId,{...(typeof input.displayName === 'string' ? {displayName:input.displayName.trim()} : {}),...(input.status ? {status:input.status as 'active'|'suspended'} : {})},context);
    } else if (!operation && request.method === 'DELETE') {
      const input = await body(request);
      if (input.confirmRetention !== true || Object.keys(input).some(key => key !== 'confirmRetention')) throw new ManagementError(400,'VISITOR_RETENTION_CONFIRMATION_REQUIRED','Confirm retained identity and content with confirmRetention:true before removing access.');
      result = await repository.removeAccess(site.id,memberId,context);
    } else throw new ManagementError(405,'VISITOR_MANAGEMENT_METHOD_DENIED','Unsupported member management method.');
    if (!result) throw new ManagementError(404,'VISITOR_MEMBER_NOT_FOUND','Member not found in this website.');
    return json({success:true,requestId,data:{siteId:site.id,member:memberView(result.member),revokedSessions:result.revokedSessions,revokedRecoveryChallenges:result.revokedRecoveryChallenges,retention:VISITOR_MEMBER_RETENTION}});
  } catch (error) {
    if (error instanceof ManagementError) return json({success:false,requestId,error:{code:error.code,message:error.message}},error.status);
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === 'VISITOR_MEMBER_REMOVED' || code === 'VISITOR_OPERATOR_IDENTITY_DENIED') return json({success:false,requestId,error:{code,message:code === 'VISITOR_MEMBER_REMOVED' ? 'Removed membership cannot be reactivated or edited.' : 'CMS operators cannot hold active visitor admission.'}},409);
    return json({success:false,requestId,error:{code:'VISITOR_MANAGEMENT_UNAVAILABLE',message:'Member management could not complete. Reload current members before retrying. Database migrations and persistence must be available.'}},503);
  }
}

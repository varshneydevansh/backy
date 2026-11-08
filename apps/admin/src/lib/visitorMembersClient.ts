import type { BackySiteVisitor } from '@backy-cms/core';
import { adminFetch, getAdminApiBase, AdminContentApiError } from './adminContentApi';
export type VisitorMemberList = { siteId: string; members: BackySiteVisitor[]; pagination: { limit: number; offset: number; hasMore: boolean }; retention: { explanation: string; erasure: false }; policy: { enabled: boolean; registrationEnabled: boolean }; permission: 'sites.configure' };
export type VisitorMemberResult = { siteId: string; member: BackySiteVisitor; revokedSessions?: number; revokedRecoveryChallenges?: number; retention: VisitorMemberList['retention'] };
const record = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
const member = (value: any, siteId: string) => record(value) && value.siteId === siteId && typeof value.id === 'string' && typeof value.email === 'string' && typeof value.displayName === 'string' && ['active','suspended','removed'].includes(value.status) && typeof value.createdAt === 'string' && typeof value.updatedAt === 'string';
async function send(siteId: string, suffix: string, init: RequestInit, signal: AbortSignal, request: typeof fetch) {
 signal.throwIfAborted(); const response = await request(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/visitors${suffix}`, { ...init, credentials: 'include', cache: 'no-store', signal });
 const payload = await response.json(); signal.throwIfAborted();
 if (!response.ok || !record(payload) || payload.success !== true) throw new AdminContentApiError(typeof payload?.error?.message === 'string' ? payload.error.message : 'Visitor members could not load. Reload before retrying.', { status: response.status }, payload?.error?.code || 'VISITOR_MANAGEMENT_FAILED');
 const data = payload.data;
 if (!record(data) || data.siteId !== siteId || !record(data.retention) || data.retention.erasure !== false || typeof data.retention.explanation !== 'string') throw new Error('Visitor response did not match this website and retention policy. Reload before retrying.');
 return data;
}
export async function listVisitorMembers(siteId: string, input: { limit: number; offset: number; status?: string; search?: string }, signal: AbortSignal, request: typeof fetch = adminFetch): Promise<VisitorMemberList> {
 const query = new URLSearchParams({limit:String(input.limit),offset:String(input.offset)}); if (input.status) query.set('status',input.status); if (input.search) query.set('search',input.search);
 const data = await send(siteId,'?'+query,{},signal,request);
 if (!Array.isArray(data.members) || !data.members.every((value: unknown) => member(value,siteId)) || !record(data.pagination) || data.pagination.limit !== input.limit || data.pagination.offset !== input.offset || typeof data.pagination.hasMore !== 'boolean' || data.members.length > input.limit || !record(data.policy) || typeof data.policy.enabled !== 'boolean' || typeof data.policy.registrationEnabled !== 'boolean' || data.permission !== 'sites.configure') throw new Error('Visitor list returned an inconsistent site or pagination. Reload before retrying.');
 return data as VisitorMemberList;
}
export async function changeVisitorMember(siteId: string, memberId: string, action: 'profile' | 'suspend' | 'activate' | 'revoke' | 'remove', input: { displayName?: string; confirmRetention?: boolean }, signal: AbortSignal, request: typeof fetch = adminFetch): Promise<VisitorMemberResult> {
 if (action === 'remove' && input.confirmRetention !== true) throw new Error('Review retained identity and content before removing access.');
 const method = action === 'remove' ? 'DELETE' : action === 'revoke' ? 'POST' : 'PATCH';
 const body = action === 'remove' ? {confirmRetention:true} : action === 'profile' ? {displayName:input.displayName || ''} : action === 'revoke' ? {} : {status:action === 'suspend' ? 'suspended' : 'active'};
 const data = await send(siteId,`/${encodeURIComponent(memberId)}${action === 'revoke' ? '/revoke-sessions' : ''}`,{method,...(body ? {headers:{'content-type':'application/json'},body:JSON.stringify(body)} : {})},signal,request);
 if (!member(data.member,siteId) || data.member.id !== memberId || !Number.isSafeInteger(data.revokedSessions) || data.revokedSessions < 0 || !Number.isSafeInteger(data.revokedRecoveryChallenges) || data.revokedRecoveryChallenges < 0 || action === 'remove' && data.member.status !== 'removed' || action === 'suspend' && data.member.status !== 'suspended' || action === 'activate' && data.member.status !== 'active') throw new Error('Visitor mutation returned inconsistent identity or status. Reload current members before retrying.');
 return data as VisitorMemberResult;
}

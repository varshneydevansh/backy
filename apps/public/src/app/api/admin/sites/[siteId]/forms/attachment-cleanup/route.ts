import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { listPendingFormAttachmentCleanup, FormAttachmentLifecycleError } from '@/lib/formAttachmentLifecycle';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.delete' });
  if (access instanceof NextResponse) return access;
  try {
    const { siteId } = await params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : getSiteByIdOrSlug(siteId);
    if (!site) return NextResponse.json({ success: false, requestId, error: { code: 'SITE_NOT_FOUND', message: 'Site not found.' } }, { status: 404 });
    return NextResponse.json({ success: true, requestId, data: { siteId: site.id, jobs: await listPendingFormAttachmentCleanup(site.id) } }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ success: false, requestId, error: { code: error instanceof FormAttachmentLifecycleError ? error.code : 'FORM_ATTACHMENT_CLEANUP_UNAVAILABLE', message: error instanceof FormAttachmentLifecycleError ? error.message : 'Unable to read private attachment cleanup status. Restore private storage and retry.' } }, { status: 503, headers: { 'cache-control': 'private, no-store' } });
  }
}

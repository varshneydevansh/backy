import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getSiteByIdOrSlug, listInteractiveComponents } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { loadCompleteRegistryEntries, paginateRegistry, registryPageOptions, toPublicRegistryEntry } from '@/lib/interactiveRegistryDiscovery';

/** Authenticated authoring discovery includes built-ins on draft sites; site membership is mandatory. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) return access;
  const error = (status: number, code: string, message: string) => NextResponse.json({ success: false, requestId, error: { code, message } }, { status, headers: { 'cache-control': 'private, no-store' } });
  let options;
  try { options = registryPageOptions(request.url); } catch (cause) { return error(400, 'INVALID_PAGINATION', (cause as Error).message); }
  try {
    const { siteId } = await params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : getSiteByIdOrSlug(siteId);
    if (!site) return error(404, 'SITE_NOT_FOUND', 'Site not found');
    // Only approved active entries are insertable. Draft site visibility does not bypass component review.
    const components = repositories ? await loadCompleteRegistryEntries((offset) => repositories.interactiveComponents.list({ siteId: site.id, publicOnly: true, limit: 100, offset }))
      : listInteractiveComponents(site.id, { publicOnly: true });
    const data = paginateRegistry(site.id, components.map(toPublicRegistryEntry), options);
    return NextResponse.json({ success: true, requestId, data }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (cause) {
    console.error('Authoring component discovery failed:', cause);
    return error(500, 'INTERNAL_SERVER_ERROR', 'Component discovery failed. Try again.');
  }
}

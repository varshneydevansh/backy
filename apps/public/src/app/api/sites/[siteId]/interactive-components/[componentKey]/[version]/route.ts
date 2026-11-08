import { NextRequest } from 'next/server';
import { getSiteByIdOrSlug, getInteractiveComponent } from '@/lib/backyStore';
import { buildPublicInteractiveComponentRegistry } from '@/lib/interactiveComponentRegistry';
import { toPublicRegistryEntry } from '@/lib/interactiveRegistryDiscovery';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

/** Resolve one exact registered version without relying on catalog order or page size. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string; componentKey: string; version: string }> }) {
  const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
  const error = (status: number, code: string) => publicContractJson({ success: false, requestId, error: { code, message: 'Site or component version not found' } }, { status, requestId, cache: 'error' });
  try {
    const { siteId, componentKey, version } = await params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : getSiteByIdOrSlug(siteId);
    if (!site || !site.isPublished) return error(404, 'SITE_NOT_FOUND');
    const stored = repositories ? await repositories.interactiveComponents.getByKeyVersion(site.id, componentKey, version) : getInteractiveComponent(site.id, componentKey, version);
    // An unapproved/disabled override must never reveal or silently restore the built-in of the same identity.
    if (stored && (stored.status !== 'active' || stored.reviewStatus !== 'approved')) return error(404, 'COMPONENT_NOT_FOUND');
    const registry = buildPublicInteractiveComponentRegistry(site.id, stored ? [toPublicRegistryEntry(stored)] : []);
    const component = registry.components.find((entry) => entry.componentKey === componentKey && entry.version === version);
    if (!component) return error(404, 'COMPONENT_NOT_FOUND');
    const data = { ...registry, components: [component], pagination: { total: 1, limit: 1, offset: 0, hasMore: false } };
    const cacheRevision = repositories ? await repositories.cacheInvalidations.latestRevision({ siteId: site.id, scope: 'settings' }) || undefined : undefined;
    return publicContractJson({ success: true, requestId, data }, { requestId, request, cache: 'render', schemaVersion: registry.schemaVersion, siteId: site.id, cacheRevision });
  } catch (cause) {
    console.error('Exact component discovery failed:', cause);
    return error(500, 'INTERNAL_SERVER_ERROR');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getSites } from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

const BATCH_SCHEMA_VERSION = 'backy.commerce-reconciliation-batch.v1';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  publicContractJson(
    { success: false, requestId, error: { code, message, details } },
    { status, requestId, cache: 'error' },
  )
);

const normalizeLimit = (raw: string | null): number => {
  const limit = Number.parseInt(raw || '100', 10);
  return Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 100;
};

const normalizeDryRun = (value: string | null): boolean => (
  value?.toLowerCase() === 'true'
);

const forwardedAuthHeaders = (request: NextRequest, requestId: string): Headers => {
  const headers = new Headers();
  for (const key of ['authorization', 'x-backy-admin-key', 'x-api-key', 'x-backy-admin-session']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set('x-request-id', requestId);
  headers.set('x-backy-actor', request.headers.get('x-backy-actor') || 'scheduled-commerce-reconciliation');
  return headers;
};

const listAdminSites = async () => {
  if (!shouldUseDemoStoreFallback()) {
    const repositories = await getRequiredDatabaseRepositories();
    const sites = [];
    let offset = 0;
    while (true) {
      const page = await repositories.sites.list({ status: 'all', limit: 100, offset });
      sites.push(...page.items);
      if (!page.pagination.hasMore) break;
      offset += 100;
    }
    return sites.map((site) => ({ id: site.id, name: site.name }));
  }

  return getSites({ includeUnpublished: true }).map((site) => ({ id: site.id, name: site.name }));
};

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.configure' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const url = new URL(request.url);
    const limit = normalizeLimit(url.searchParams.get('limit'));
    const dryRun = normalizeDryRun(url.searchParams.get('dryRun'));
    const requestedSiteId = url.searchParams.get('siteId')?.trim();
    const sites = (await listAdminSites()).filter((site) => !requestedSiteId || site.id === requestedSiteId);

    if (requestedSiteId && sites.length === 0) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId, { siteId: requestedSiteId });
    }

    const results = [];
    const errors = [];
    const skipped = [];
    for (const site of sites) {
      const siteRequestId = `${requestId}_${site.id}`;
      const siteUrl = new URL(`/api/admin/sites/${encodeURIComponent(site.id)}/commerce/reconcile`, request.url);
      siteUrl.searchParams.set('limit', String(limit));
      if (dryRun) siteUrl.searchParams.set('dryRun', 'true');

      try {
        const response = await fetch(siteUrl, {
          method: 'GET',
          headers: forwardedAuthHeaders(request, siteRequestId),
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) {
          const error = payload.error || {};
          if (error.code === 'ORDER_QUEUE_NOT_FOUND') {
            skipped.push({ siteId: site.id, siteName: site.name, code: error.code, message: error.message || 'Private order queue not found' });
            continue;
          }
          errors.push({ siteId: site.id, siteName: site.name, status: response.status, code: error.code || 'RECONCILIATION_FAILED', message: error.message || 'Scheduled reconciliation failed' });
          continue;
        }
        results.push({ siteId: site.id, siteName: site.name, ...payload.data });
      } catch (error) {
        errors.push({
          siteId: site.id,
          siteName: site.name,
          status: 500,
          code: 'RECONCILIATION_REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'Scheduled reconciliation request failed',
        });
      }
    }

    const summary = {
      schemaVersion: BATCH_SCHEMA_VERSION,
      runMode: 'scheduled' as const,
      dryRun,
      limit,
      processedAt: new Date().toISOString(),
      siteCount: sites.length,
      reconciledSiteCount: results.length,
      skippedSiteCount: skipped.length,
      errorCount: errors.length,
      eventCount: results.reduce((total, result) => total + Number(result.eventCount || 0), 0),
      eligibleUpdateCount: results.reduce((total, result) => total + Number(result.eligibleUpdateCount || 0), 0),
      updatedCount: results.reduce((total, result) => total + Number(result.updatedCount || 0), 0),
      unmatchedCount: results.reduce((total, result) => total + Number(result.unmatchedCount || 0), 0),
    };

    return publicContractJson({
      success: true,
      requestId,
      data: {
        ...summary,
        results,
        skipped,
        errors,
      },
    }, { status: errors.length > 0 ? 207 : 200, requestId, request, cache: 'private' });
  } catch (error) {
    console.error('Commerce scheduled reconciliation API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

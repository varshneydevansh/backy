/**
 * Admin interactive component export endpoint.
 *
 * GET /api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/export
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  getInteractiveComponent,
  getSiteByIdOrSlug,
} from '@/lib/backyStore';
import { buildInteractiveComponentExportPackage } from '@/lib/interactiveComponentExport';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    componentKey: string;
    version: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message } }, { status })
);

const normalizeComponentKey = (value: unknown): string => (
  typeof value === 'string'
    ? decodeURIComponent(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '.').replace(/^[._-]+|[._-]+$/g, '')
    : ''
);

const normalizeVersion = (value: unknown): string => (
  typeof value === 'string'
    ? decodeURIComponent(value).trim().replace(/[^a-zA-Z0-9._+-]+/g, '').slice(0, 40)
    : ''
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, componentKey, version } = await params;
    const normalizedKey = normalizeComponentKey(componentKey);
    const normalizedVersion = normalizeVersion(version);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }
      const component = await repositories.interactiveComponents.getByKeyVersion(site.id, normalizedKey, normalizedVersion);
      if (!component) {
        return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
      }

      const exportPackage = buildInteractiveComponentExportPackage(site.id, component);
      return NextResponse.json({ success: true, requestId, data: { component, exportPackage } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }
    const component = getInteractiveComponent(site.id, normalizedKey, normalizedVersion);
    if (!component) {
      return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
    }

    const exportPackage = buildInteractiveComponentExportPackage(site.id, component);
    return NextResponse.json({ success: true, requestId, data: { component, exportPackage } });
  } catch (error) {
    console.error('Admin interactive component export API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

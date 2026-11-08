import { NextRequest, NextResponse } from 'next/server';
import { buildFrontendCompatibilityReport, normalizeFrontendObservation, type Site } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getAdminPageById, getAdminBlogPostById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { normalizeFrontendDesignContract } from '@/lib/frontendDesignContract';

export const runtime = 'nodejs';
interface RouteParams { params: Promise<{ siteId: string }> }
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie, Authorization' } });
const error = (status: number, code: string, message: string, requestId: string) => response({ success: false, requestId, error: { code, message } }, status);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

async function diagnose(request: NextRequest, { params }: RouteParams, submitted?: Record<string, unknown>) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const access = await requireAdminAccess(request, requestId, { permission: 'sites.view' });
  if (access instanceof NextResponse) return access;
  const { siteId } = await params;
  const url = new URL(request.url);
  const templateId = text(submitted?.templateId) || url.searchParams.get('templateId') || '';
  const pageId = text(submitted?.pageId) || url.searchParams.get('pageId') || '';
  const postId = text(submitted?.postId) || url.searchParams.get('postId') || '';
  if ([templateId, pageId, postId].filter(Boolean).length !== 1) return error(400, 'INVALID_TARGET', 'Choose exactly one templateId, pageId or postId.', requestId);
  let observation;
  try { observation = normalizeFrontendObservation(submitted?.observation); }
  catch (cause) { return error(400, 'INVALID_OBSERVATION', cause instanceof Error ? cause.message : 'Invalid observation.', requestId); }
  try {
    const repositories = shouldUseDemoStoreFallback() ? undefined : await getRequiredDatabaseRepositories();
    const site = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : getSiteByIdOrSlug(siteId);
    if (!site) return error(404, 'SITE_NOT_FOUND', 'Site not found.', requestId);
    const design = normalizeFrontendDesignContract((site as unknown as Site).settings?.frontendDesign);
    let content: unknown; let route = '/'; let revision: string | undefined;
    if (templateId) {
      const template = design.templates.find(item => item.id === templateId);
      if (!template) return error(404, 'TARGET_NOT_FOUND', 'Registered template not found.', requestId);
      content = template.content || {}; route = template.routePattern || '/'; revision = template.updatedAt || design.updatedAt || (template.version != null ? String(template.version) : undefined);
    } else {
      const resource = pageId
        ? repositories ? await repositories.pages.getById(site.id, pageId) : getAdminPageById(site.id, pageId)
        : repositories ? await repositories.posts.getById(site.id, postId) : getAdminBlogPostById(site.id, postId);
      if (!resource) return error(404, 'TARGET_NOT_FOUND', 'Content not found in this site.', requestId);
      content = resource.content; route = pageId ? ('isHomepage' in resource && resource.isHomepage || resource.slug === 'index' ? '/' : '/' + resource.slug) : '/blog/' + resource.slug; revision = resource.updatedAt;
    }
    const report = buildFrontendCompatibilityReport({ siteId: site.id, route, revision, content, runtime: design.runtime, observation, design });
    return response({ success: true, requestId, data: { report, endpoints: { declaration: '/api/admin/sites/' + site.id + '/frontend-design', compatibility: '/api/admin/sites/' + site.id + '/custom-frontend/compatibility' } } });
  } catch (cause) {
    if (cause instanceof Error && /compatibility limit|10000 nodes/.test(cause.message)) return error(422, 'CONTENT_LIMIT', cause.message, requestId);
    return error(500, 'INTERNAL_SERVER_ERROR', 'Unable to generate compatibility report.', requestId);
  }
}
export async function GET(request: NextRequest, context: RouteParams) { return diagnose(request, context); }
/** Read-only comparison: submitted observations are labeled and never count as live certification. */
export async function POST(request: NextRequest, context: RouteParams) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  // Authenticate before parsing any supplied inventory.
  const access = await requireAdminAccess(request, requestId, { permission: 'sites.view' });
  if (access instanceof NextResponse) return access;
  const bodyText = await request.text();
  if (bodyText.length > 262144) return error(413, 'OBSERVATION_TOO_LARGE', 'Observation exceeds 256 KiB.', requestId);
  let body: unknown;
  try { body = JSON.parse(bodyText); } catch { return error(400, 'INVALID_JSON', 'Use a JSON object.', requestId); }
  if (!record(body)) return error(400, 'INVALID_JSON', 'Use a JSON object.', requestId);
  return diagnose(request, context, body);
}

/**
 * Admin interactive component usage inventory endpoint.
 *
 * GET /api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  getBlogPosts,
  getSiteByIdOrSlug,
  listAdminPages,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    componentKey: string;
    version: string;
  }>;
}

type UsageTargetType = 'page' | 'post';

interface ContentResource {
  id: string;
  title?: string | null;
  slug?: string | null;
  status?: string | null;
  updatedAt?: string | null;
  content?: unknown;
}

interface InteractiveComponentUsage {
  targetType: UsageTargetType;
  targetId: string;
  title: string;
  slug: string;
  status: string;
  elementId: string | null;
  elementType: string | null;
  elementPath: string;
  version: string | null;
  renderMode: string | null;
  fallbackConfigured: boolean;
  updatedAt: string | null;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message } }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
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

const stringValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const contentElements = (content: unknown): unknown[] => {
  if (!isRecord(content)) {
    return [];
  }
  if (Array.isArray(content.elements)) {
    return content.elements;
  }
  const contentDocument = isRecord(content.contentDocument) ? content.contentDocument : null;
  return Array.isArray(contentDocument?.elements) ? contentDocument.elements : [];
};

const recordHasFallback = (record: Record<string, unknown>): boolean => (
  isRecord(record.fallback)
    ? Object.keys(record.fallback).length > 0
    : Boolean(stringValue(record.fallback))
);

const recordMatchesComponent = (
  record: Record<string, unknown>,
  componentKey: string,
  version: string,
): boolean => {
  const candidateKey = normalizeComponentKey(record.componentKey);
  if (candidateKey !== componentKey) {
    return false;
  }
  const candidateVersion = normalizeVersion(record.version);
  return !version || !candidateVersion || candidateVersion === version;
};

const walkContentObjects = (
  value: unknown,
  path: string,
  visit: (record: Record<string, unknown>, path: string) => void,
) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkContentObjects(item, `${path}[${index}]`, visit));
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  visit(value, path);

  Object.entries(value).forEach(([key, child]) => {
    if (key === 'fallback') {
      return;
    }
    if (Array.isArray(child) || isRecord(child)) {
      walkContentObjects(child, `${path}.${key}`, visit);
    }
  });
};

const collectUsageForResource = (
  targetType: UsageTargetType,
  resource: ContentResource,
  componentKey: string,
  version: string,
): InteractiveComponentUsage[] => {
  const usage: InteractiveComponentUsage[] = [];
  const elements = contentElements(resource.content);

  walkContentObjects(elements, 'elements', (record, elementPath) => {
    if (!recordMatchesComponent(record, componentKey, version)) {
      return;
    }

    usage.push({
      targetType,
      targetId: resource.id,
      title: stringValue(resource.title) || 'Untitled',
      slug: stringValue(resource.slug),
      status: stringValue(resource.status) || 'draft',
      elementId: stringValue(record.id) || null,
      elementType: stringValue(record.type) || null,
      elementPath,
      version: normalizeVersion(record.version) || null,
      renderMode: isRecord(record.renderCapabilities)
        ? stringValue(record.renderCapabilities.hydrationMode) || stringValue(record.renderCapabilities.renderMode) || null
        : stringValue(record.renderMode) || null,
      fallbackConfigured: recordHasFallback(record),
      updatedAt: stringValue(resource.updatedAt) || null,
    });
  });

  return usage;
};

const collectUsage = (
  pages: ContentResource[],
  posts: ContentResource[],
  componentKey: string,
  version: string,
): InteractiveComponentUsage[] => ([
  ...pages.flatMap((page) => collectUsageForResource('page', page, componentKey, version)),
  ...posts.flatMap((post) => collectUsageForResource('post', post, componentKey, version)),
]);

const listAll = async <TItem>(
  load: (offset: number, limit: number) => Promise<{ items: TItem[]; pagination?: { hasMore?: boolean; limit?: number } }>,
): Promise<TItem[]> => {
  const items: TItem[] = [];
  const limit = 200;
  let offset = 0;

  for (let page = 0; page < 50; page += 1) {
    const result = await load(offset, limit);
    items.push(...result.items);
    if (!result.pagination?.hasMore) {
      break;
    }
    offset += result.pagination.limit || limit;
  }

  return items;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, componentKey, version } = await params;
    const normalizedKey = normalizeComponentKey(componentKey);
    const normalizedVersion = normalizeVersion(version);

    if (!normalizedKey) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Component key is required', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const [pages, posts] = await Promise.all([
        listAll((offset, limit) => repositories.pages.list({
          siteId: site.id,
          includeUnpublished: true,
          status: 'all',
          limit,
          offset,
        })),
        listAll((offset, limit) => repositories.posts.list({
          siteId: site.id,
          includeUnpublished: true,
          status: 'all',
          limit,
          offset,
        })),
      ]);
      const usage = collectUsage(pages, posts, normalizedKey, normalizedVersion);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          componentKey: normalizedKey,
          version: normalizedVersion || null,
          usage,
          summary: {
            total: usage.length,
            pages: usage.filter((item) => item.targetType === 'page').length,
            posts: usage.filter((item) => item.targetType === 'post').length,
            scanned: {
              pages: pages.length,
              posts: posts.length,
            },
          },
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const pages = listAdminPages(site.id, { includeUnpublished: true });
    const posts = getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 }).posts;
    const usage = collectUsage(pages, posts, normalizedKey, normalizedVersion);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        componentKey: normalizedKey,
        version: normalizedVersion || null,
        usage,
        summary: {
          total: usage.length,
          pages: usage.filter((item) => item.targetType === 'page').length,
          posts: usage.filter((item) => item.targetType === 'post').length,
          scanned: {
            pages: pages.length,
            posts: posts.length,
          },
        },
      },
    });
  } catch (error) {
    console.error('Admin interactive component usage API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

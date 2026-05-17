/**
 * Admin interactive component version migration endpoint.
 *
 * POST /api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/migrate
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  getBlogPosts,
  getInteractiveComponent,
  getSiteByIdOrSlug,
  listAdminPages,
  recordAdminAuditLog,
  updateAdminBlogPost,
  updateAdminPage,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { deliverSiteWebhooks } from '@/lib/siteWebhookDelivery';
import type { BackyContentDocument, BackyJsonObject, Site } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    componentKey: string;
    version: string;
  }>;
}

type MigrationTargetType = 'page' | 'post';

type MigrationTarget = {
  type: MigrationTargetType;
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt?: string | null;
  content: unknown;
};

type TargetComponent = {
  componentKey: string;
  version: string;
  renderMode?: string;
  runtime?: unknown;
};

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message } }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const auditJson = (value: unknown): BackyJsonObject => JSON.parse(JSON.stringify(value)) as BackyJsonObject;

const cloneJson = <TValue,>(value: TValue): TValue => (
  JSON.parse(JSON.stringify(value)) as TValue
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

const recordValue = (value: unknown): Record<string, unknown> => (
  isRecord(value) ? value : {}
);

const listAll = async <TItem,>(
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

const migrateObject = (
  value: unknown,
  path: string,
  sourceKey: string,
  sourceVersion: string,
  target: TargetComponent,
  migratedPaths: string[],
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item, index) => migrateObject(item, `${path}[${index}]`, sourceKey, sourceVersion, target, migratedPaths));
  }
  if (!isRecord(value)) {
    return value;
  }

  const next: Record<string, unknown> = { ...value };
  const candidateKey = normalizeComponentKey(next.componentKey);
  const candidateVersion = normalizeVersion(next.version);
  if (candidateKey === sourceKey && candidateVersion === sourceVersion) {
    next.componentKey = target.componentKey;
    next.version = target.version;
    if (target.renderMode) {
      const renderCapabilities = recordValue(next.renderCapabilities);
      next.renderCapabilities = {
        ...renderCapabilities,
        hydrationMode: target.renderMode,
        fallbackRequired: true,
        postMessageProtocol: stringValue(renderCapabilities.postMessageProtocol) || 'backy.interactive-component.v1',
      };
    }
    const runtime = recordValue(target.runtime);
    if (typeof runtime.sandboxUrl === 'string' && runtime.sandboxUrl.trim()) {
      next.sandboxUrl = runtime.sandboxUrl.trim();
    }
    migratedPaths.push(path);
  }

  Object.entries(next).forEach(([key, child]) => {
    if (key === 'fallback') {
      return;
    }
    if (Array.isArray(child) || isRecord(child)) {
      next[key] = migrateObject(child, `${path}.${key}`, sourceKey, sourceVersion, target, migratedPaths);
    }
  });

  return next;
};

const migrateContent = (
  content: unknown,
  sourceKey: string,
  sourceVersion: string,
  target: TargetComponent,
): { content: unknown; migrated: number; elementPaths: string[] } => {
  const next = cloneJson(content || {});
  const elementPaths: string[] = [];

  if (isRecord(next) && Array.isArray(next.elements)) {
    next.elements = migrateObject(next.elements, 'elements', sourceKey, sourceVersion, target, elementPaths);
  }
  if (isRecord(next) && isRecord(next.contentDocument) && Array.isArray(next.contentDocument.elements)) {
    next.contentDocument = {
      ...next.contentDocument,
      elements: migrateObject(next.contentDocument.elements, 'contentDocument.elements', sourceKey, sourceVersion, target, elementPaths),
    };
  }

  return { content: next, migrated: elementPaths.length, elementPaths };
};

const targetSummary = (
  target: MigrationTarget,
  result: { migrated: number; elementPaths: string[] },
) => ({
  targetType: target.type,
  targetId: target.id,
  title: target.title,
  slug: target.slug,
  status: target.status,
  updatedAt: target.updatedAt || null,
  migrated: result.migrated,
  elementPaths: result.elementPaths,
});

interface InteractiveComponentWebhookSource {
  id: string;
  componentKey: string;
  version: string;
  displayName: string;
  type: string;
  status: string;
  reviewStatus: string;
  renderMode: string;
  source: string;
  updatedAt: string;
}

const interactiveComponentWebhookSnapshot = (component: InteractiveComponentWebhookSource): BackyJsonObject => ({
  componentId: component.id,
  componentKey: component.componentKey,
  version: component.version,
  displayName: component.displayName,
  type: component.type,
  status: component.status,
  reviewStatus: component.reviewStatus,
  renderMode: component.renderMode,
  source: component.source,
  updatedAt: component.updatedAt,
});

const migrationWebhookSummary = (
  migratedTargets: ReturnType<typeof targetSummary>[],
  scanned: { pages: number; posts: number },
) => ({
  targets: migratedTargets.length,
  elements: migratedTargets.reduce((sum, item) => sum + item.migrated, 0),
  scanned,
});

const deliverInteractiveComponentMigrationWebhook = async (params: {
  repositories?: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>> | null;
  site: Site;
  targetComponent: InteractiveComponentWebhookSource;
  sourceComponentKey: string;
  sourceVersion: string;
  targetComponentKey: string;
  targetVersion: string;
  migratedTargets: ReturnType<typeof targetSummary>[];
  scanned: { pages: number; posts: number };
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: 'site-updated',
    requestId: params.requestId,
    actor: params.actor,
    reason: 'interactiveComponent.migrate',
    data: {
      resourceType: 'interactiveComponentMigration',
      source: {
        componentKey: params.sourceComponentKey,
        version: params.sourceVersion,
      },
      target: interactiveComponentWebhookSnapshot(params.targetComponent),
      migratedTargets: auditJson(params.migratedTargets),
      summary: auditJson(migrationWebhookSummary(params.migratedTargets, params.scanned)),
    },
    metadata: {
      action: 'interactiveComponent.migrate',
      changedKeys: ['content', 'interactiveComponents'],
      source: 'admin-interactive-component-migration-api',
      resourceType: 'interactiveComponent',
      resourceId: params.targetComponent.id,
      sourceComponentKey: params.sourceComponentKey,
      sourceVersion: params.sourceVersion,
      targetComponentKey: params.targetComponentKey,
      targetVersion: params.targetVersion,
      migratedTargets: params.migratedTargets.length,
      migratedElements: params.migratedTargets.reduce((sum, item) => sum + item.migrated, 0),
    },
  });

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, componentKey, version } = await params;
    const sourceKey = normalizeComponentKey(componentKey);
    const sourceVersion = normalizeVersion(version);
    const body = await parseJsonBody(request);
    const targetKey = normalizeComponentKey(body.targetComponentKey || body.componentKey || sourceKey);
    const targetVersion = normalizeVersion(body.targetVersion || body.version);
    const dryRun = body.dryRun !== false;
    const actorId = stringValue(body.updatedBy) || 'admin';

    if (!sourceKey || !sourceVersion || !targetKey || !targetVersion) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Source and target component versions are required', requestId);
    }
    if (sourceKey === targetKey && sourceVersion === targetVersion) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Target component version must differ from the source version', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }
      const targetComponent = await repositories.interactiveComponents.getByKeyVersion(site.id, targetKey, targetVersion);
      if (!targetComponent) {
        return errorResponse(404, 'TARGET_INTERACTIVE_COMPONENT_NOT_FOUND', 'Target interactive component version not found', requestId);
      }
      const [pages, posts] = await Promise.all([
        listAll((offset, limit) => repositories.pages.list({ siteId: site.id, includeUnpublished: true, status: 'all', limit, offset })),
        listAll((offset, limit) => repositories.posts.list({ siteId: site.id, includeUnpublished: true, status: 'all', limit, offset })),
      ]);
      const targets: MigrationTarget[] = [
        ...pages.map((page) => ({ type: 'page' as const, id: page.id, title: page.title, slug: page.slug, status: page.status, updatedAt: page.updatedAt, content: page.content })),
        ...posts.map((post) => ({ type: 'post' as const, id: post.id, title: post.title, slug: post.slug, status: post.status, updatedAt: post.updatedAt, content: post.content })),
      ];
      const migratedTargets = [];
      for (const target of targets) {
        const result = migrateContent(target.content, sourceKey, sourceVersion, targetComponent);
        if (result.migrated === 0) continue;
        migratedTargets.push(targetSummary(target, result));
        if (dryRun) continue;
        if (target.type === 'page') {
          await repositories.pages.update(site.id, target.id, {
            content: result.content as BackyContentDocument,
            revisionNote: `Migrate interactive component ${sourceKey}@${sourceVersion} to ${targetKey}@${targetVersion}`,
          });
        } else {
          await repositories.posts.update(site.id, target.id, {
            content: result.content as BackyContentDocument,
            revisionNote: `Migrate interactive component ${sourceKey}@${sourceVersion} to ${targetKey}@${targetVersion}`,
          });
        }
      }
      if (!dryRun && migratedTargets.length > 0) {
        await repositories.auditLogs.record({
          siteId: site.id,
          teamId: site.teamId || null,
          actorId,
          entity: 'interactiveComponent',
          entityId: targetComponent.id,
          action: 'interactiveComponent.migrate',
          metadata: {
            sourceComponentKey: sourceKey,
            sourceVersion,
            targetComponentKey: targetKey,
            targetVersion,
            migratedTargets: migratedTargets.length,
            migratedElements: migratedTargets.reduce((sum, item) => sum + item.migrated, 0),
            dryRun,
          } as BackyJsonObject,
          requestId,
        });
        await repositories.cacheInvalidations.record({
          siteId: site.id,
          scope: 'content',
          entity: 'interactiveComponent',
          entityId: targetComponent.id,
          reason: 'interactive-component-version-migrated',
          metadata: { sourceComponentKey: sourceKey, sourceVersion, targetComponentKey: targetKey, targetVersion },
        });
        await deliverInteractiveComponentMigrationWebhook({
          repositories,
          site: site as Site,
          targetComponent,
          sourceComponentKey: sourceKey,
          sourceVersion,
          targetComponentKey: targetKey,
          targetVersion,
          migratedTargets,
          scanned: { pages: pages.length, posts: posts.length },
          requestId,
          actor: actorId,
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          dryRun,
          source: { componentKey: sourceKey, version: sourceVersion },
          target: { componentKey: targetKey, version: targetVersion },
          migratedTargets,
          summary: {
            targets: migratedTargets.length,
            elements: migratedTargets.reduce((sum, item) => sum + item.migrated, 0),
            scanned: { pages: pages.length, posts: posts.length },
          },
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }
    const targetComponent = getInteractiveComponent(site.id, targetKey, targetVersion);
    if (!targetComponent) {
      return errorResponse(404, 'TARGET_INTERACTIVE_COMPONENT_NOT_FOUND', 'Target interactive component version not found', requestId);
    }
    const pages = listAdminPages(site.id, { includeUnpublished: true });
    const posts = getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 }).posts;
    const targets: MigrationTarget[] = [
      ...pages.map((page) => ({ type: 'page' as const, id: page.id, title: page.title, slug: page.slug, status: page.status, updatedAt: page.updatedAt, content: page.content })),
      ...posts.map((post) => ({ type: 'post' as const, id: post.id, title: post.title, slug: post.slug, status: post.status, updatedAt: post.updatedAt, content: post.content })),
    ];
    const migratedTargets = [];
    for (const target of targets) {
      const result = migrateContent(target.content, sourceKey, sourceVersion, targetComponent);
      if (result.migrated === 0) continue;
      migratedTargets.push(targetSummary(target, result));
      if (dryRun) continue;
      if (target.type === 'page') {
        updateAdminPage(site.id, target.id, {
          content: result.content,
          updatedBy: actorId,
          revisionNote: `Migrate interactive component ${sourceKey}@${sourceVersion} to ${targetKey}@${targetVersion}`,
        });
      } else {
        updateAdminBlogPost(site.id, target.id, {
          content: result.content,
          updatedBy: actorId,
          revisionNote: `Migrate interactive component ${sourceKey}@${sourceVersion} to ${targetKey}@${targetVersion}`,
        });
      }
    }
    if (!dryRun && migratedTargets.length > 0) {
      recordAdminAuditLog({
        siteId: site.id,
        teamId: site.teamId || null,
        actorId,
        entity: 'interactiveComponent',
        entityId: targetComponent.id,
        action: 'interactiveComponent.migrate',
        metadata: {
          sourceComponentKey: sourceKey,
          sourceVersion,
          targetComponentKey: targetKey,
          targetVersion,
          migratedTargets: migratedTargets.length,
          migratedElements: migratedTargets.reduce((sum, item) => sum + item.migrated, 0),
          dryRun,
        },
        requestId,
      });
      await deliverInteractiveComponentMigrationWebhook({
        site: site as unknown as Site,
        targetComponent,
        sourceComponentKey: sourceKey,
        sourceVersion,
        targetComponentKey: targetKey,
        targetVersion,
        migratedTargets,
        scanned: { pages: pages.length, posts: posts.length },
        requestId,
        actor: actorId,
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        dryRun,
        source: { componentKey: sourceKey, version: sourceVersion },
        target: { componentKey: targetKey, version: targetVersion },
        migratedTargets,
        summary: {
          targets: migratedTargets.length,
          elements: migratedTargets.reduce((sum, item) => sum + item.migrated, 0),
          scanned: { pages: pages.length, posts: posts.length },
        },
      },
    });
  } catch (error) {
    console.error('Admin interactive component migration API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

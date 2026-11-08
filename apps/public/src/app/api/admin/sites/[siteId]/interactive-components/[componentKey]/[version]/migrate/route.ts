/**
 * Admin interactive component version migration endpoint.
 *
 * POST /api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/migrate
 */

import { createHash } from 'node:crypto';
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
import { readInteractiveComponentInventory, InteractiveComponentInventoryError } from '@/lib/interactiveComponentInventory';
import { componentMigrationPropsFindings, migratedComponentAuthoringMetadata } from '@/lib/componentMigrationProps';
import { deliverSiteWebhooks } from '@/lib/siteWebhookDelivery';
import { BackyContentConflictError, serializeTemplateRevisionValue, type BackyContentDocument, type BackyJsonObject, type Site } from '@backy-cms/core';

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
  propsSchema?: unknown;
  dependencyMetadata?: Record<string, unknown>;
  controls?: unknown;
  status?: string;
  reviewStatus?: string;
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
    Object.assign(next, cloneJson(migratedComponentAuthoringMetadata(next, target)));
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

type ReviewedPreview = {
  siteId: string;
  source: { componentKey: string; version: string };
  target: { componentKey: string; version: string };
  targetFingerprint: string;
  targets: Array<{ targetType: MigrationTargetType; targetId: string; contentFingerprint: string }>;
};
const fingerprint = (value: unknown) => createHash('sha256').update(serializeTemplateRevisionValue(value)).digest('hex');
const reviewedPreviewFor = (siteId: string, targets: MigrationTarget[], sourceKey: string, sourceVersion: string, component: TargetComponent): ReviewedPreview => ({
  siteId, source: { componentKey: sourceKey, version: sourceVersion },
  target: { componentKey: component.componentKey, version: component.version },
  targetFingerprint: fingerprint(component),
  targets: targets.filter(target => migrateContent(target.content, sourceKey, sourceVersion, component).migrated > 0)
    .map(target => ({ targetType: target.type, targetId: target.id, contentFingerprint: fingerprint({ content: target.content, updatedAt: target.updatedAt || null, title: target.title, slug: target.slug, status: target.status }) }))
    .sort((a, b) => `${a.targetType}:${a.targetId}`.localeCompare(`${b.targetType}:${b.targetId}`)),
});
const previewGuardError = (value: unknown, current: ReviewedPreview, requestId: string) => {
  if (value === undefined) return null; // Historical SDK callers remain explicitly unbound.
  const hash = (item: unknown) => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item);
  if (!isRecord(value) || typeof value.siteId !== 'string' || !isRecord(value.source) || !isRecord(value.target) || !hash(value.targetFingerprint)
    || !Array.isArray(value.targets) || value.targets.length > 200_000) return errorResponse(400, 'INVALID_MIGRATION_PREVIEW', 'Provide the complete reviewed migration preview.', requestId);
  const ids = new Set<string>();
  for (const target of value.targets) {
    if (!isRecord(target) || !['page', 'post'].includes(String(target.targetType)) || typeof target.targetId !== 'string' || !target.targetId || target.targetId.length > 160 || !hash(target.contentFingerprint)
      || ids.has(`${target.targetType}:${target.targetId}`)) return errorResponse(400, 'INVALID_MIGRATION_PREVIEW', 'Provide unique reviewed targets and their fingerprints.', requestId);
    ids.add(`${target.targetType}:${target.targetId}`);
  }
  const expected = { ...value, targets: [...value.targets].sort((a, b) => `${a.targetType}:${a.targetId}`.localeCompare(`${b.targetType}:${b.targetId}`)) };
  if (serializeTemplateRevisionValue(expected) !== serializeTemplateRevisionValue(current)) return errorResponse(409, 'MIGRATION_PREVIEW_CONFLICT', 'The reviewed documents or component changed. Reload the preview and confirm the current targets. No migration writes were started.', requestId);
  return null;
};

/** Validate all authored instances before applying any document, without changing their values. */
const propsAdmissionError = (targets: MigrationTarget[], sourceKey: string, sourceVersion: string, component: TargetComponent, requestId: string) => {
  const findings = componentMigrationPropsFindings(targets, sourceKey, sourceVersion, component, value => normalizeComponentKey(value.componentKey) === sourceKey && normalizeVersion(value.version) === sourceVersion);
  if (!findings.length) return null;
  return NextResponse.json({ success: false, requestId, error: {
    code: 'MIGRATION_PROPS_INCOMPATIBLE',
    message: 'Authored properties do not satisfy the target component schema. Review the exact locations, repair the content or target schema, then preview again. No migration writes were started.',
    details: { findings, reloadPreview: true },
  } }, { status: 422, headers: { 'Cache-Control': 'private, no-store' } });
};

type MigrationFailure = {
  targetType: MigrationTargetType;
  targetId: string;
  code: 'CONTENT_REVISION_CONFLICT' | 'MIGRATION_WRITE_FAILED';
  message: string;
};

// Every document is independently guarded. A failed document never hides prior commits.
const applyMigrationTargets = async (
  targets: MigrationTarget[], sourceKey: string, sourceVersion: string,
  component: TargetComponent, dryRun: boolean,
  apply: (target: MigrationTarget, content: unknown) => Promise<unknown>,
) => {
  const migratedTargets: ReturnType<typeof targetSummary>[] = [];
  const failedTargets: MigrationFailure[] = [];
  for (const target of targets) {
    const result = migrateContent(target.content, sourceKey, sourceVersion, component);
    if (!result.migrated) continue;
    try {
      if (!dryRun) await apply(target, result.content);
      migratedTargets.push(targetSummary(target, result));
    } catch (error) {
      // Core has both ESM/CJS exports; a repository conflict can cross that module boundary.
      const conflict = error instanceof BackyContentConflictError || (isRecord(error) && error.code === 'CONTENT_REVISION_CONFLICT');
      failedTargets.push({ targetType: target.type, targetId: target.id,
        code: conflict ? 'CONTENT_REVISION_CONFLICT' : 'MIGRATION_WRITE_FAILED',
        message: conflict ? new BackyContentConflictError().message : 'This document migration could not be confirmed. Reload the migration preview to check its current version before retrying.',
      });
    }
  }
  return { migratedTargets, failedTargets };
};

const migrationOutcome = (failedTargets: MigrationFailure[], completionWarnings: string[], concurrencyBoundary: string) => ({
  outcome: failedTargets.length || completionWarnings.length ? 'partial' : 'complete',
  failedTargets,
  completionWarnings,
  retry: { required: failedTargets.length > 0, reloadPreview: failedTargets.length > 0,
    message: failedTargets.length ? 'Reload the migration preview and review changed documents before applying again. Already migrated instances are skipped.' : null },
  concurrencyBoundary,
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
      if (targetComponent.status !== 'active' || targetComponent.reviewStatus !== 'approved') return errorResponse(422, 'TARGET_COMPONENT_NOT_READY', 'Choose an active approved target component version. Draft, disabled and rejected versions cannot be used for migration.', requestId);
      const [pages, posts] = await Promise.all([
        readInteractiveComponentInventory(site.id, (offset, limit) => repositories.pages.list({ siteId: site.id, includeUnpublished: true, status: 'all', limit, offset })),
        readInteractiveComponentInventory(site.id, (offset, limit) => repositories.posts.list({ siteId: site.id, includeUnpublished: true, status: 'all', limit, offset })),
      ]);
      const targets: MigrationTarget[] = [
        ...pages.map((page) => ({ type: 'page' as const, id: page.id, title: page.title, slug: page.slug, status: page.status, updatedAt: page.updatedAt, content: page.content })),
        ...posts.map((post) => ({ type: 'post' as const, id: post.id, title: post.title, slug: post.slug, status: post.status, updatedAt: post.updatedAt, content: post.content })),
      ];
      const reviewedPreview = reviewedPreviewFor(site.id, targets, sourceKey, sourceVersion, targetComponent);
      const reviewError = previewGuardError(body.reviewedPreview, reviewedPreview, requestId);
      if (reviewError) return reviewError;
      const propsError = propsAdmissionError(targets, sourceKey, sourceVersion, targetComponent, requestId);
      if (propsError) return propsError;
      const { migratedTargets, failedTargets } = await applyMigrationTargets(targets, sourceKey, sourceVersion, targetComponent, dryRun, async (target, content) => {
        const input = { content: content as BackyContentDocument, expectedContent: target.content as BackyContentDocument,
          expectedUpdatedAt: target.updatedAt || '', revisionNote: `Migrate interactive component ${sourceKey}@${sourceVersion} to ${targetKey}@${targetVersion}` };
        return target.type === 'page' ? repositories.pages.update(site.id, target.id, input) : repositories.posts.update(site.id, target.id, input);
      });
      const completionWarnings: string[] = [];
      if (!dryRun && migratedTargets.length > 0) {
        try {
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
        } catch { completionWarnings.push('The migration audit notification could not be completed. Confirmed document commits are retained.'); }
        try {
          await repositories.cacheInvalidations.record({
            siteId: site.id,
            scope: 'content',
            entity: 'interactiveComponent',
            entityId: targetComponent.id,
            reason: 'interactive-component-version-migrated',
            metadata: { sourceComponentKey: sourceKey, sourceVersion, targetComponentKey: targetKey, targetVersion },
          });
        } catch { completionWarnings.push('The content cache invalidation could not be completed. Confirmed document commits are retained.'); }
        try {
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
        } catch { completionWarnings.push('The migration webhook notification could not be completed. Confirmed document commits are retained.'); }
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          dryRun,
          reviewedPreview,
          ...migrationOutcome(failedTargets, completionWarnings, 'database-row-lock'),
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
    if (targetComponent.status !== 'active' || targetComponent.reviewStatus !== 'approved') return errorResponse(422, 'TARGET_COMPONENT_NOT_READY', 'Choose an active approved target component version. Draft, disabled and rejected versions cannot be used for migration.', requestId);
    const pages = listAdminPages(site.id, { includeUnpublished: true });
    const posts = await readInteractiveComponentInventory(site.id, async (offset, limit) => {
      const result = getBlogPosts(site.id, { includeUnpublished: true, limit, offset });
      return { items: result.posts, pagination: result.pagination };
    });
    const targets: MigrationTarget[] = [
      ...pages.map((page) => ({ type: 'page' as const, id: page.id, title: page.title, slug: page.slug, status: page.status, updatedAt: page.updatedAt, content: page.content })),
      ...posts.map((post) => ({ type: 'post' as const, id: post.id, title: post.title, slug: post.slug, status: post.status, updatedAt: post.updatedAt, content: post.content })),
    ];
    const reviewedPreview = reviewedPreviewFor(site.id, targets, sourceKey, sourceVersion, targetComponent);
    const reviewError = previewGuardError(body.reviewedPreview, reviewedPreview, requestId);
    if (reviewError) return reviewError;
    const propsError = propsAdmissionError(targets, sourceKey, sourceVersion, targetComponent, requestId);
    if (propsError) return propsError;
    const { migratedTargets, failedTargets } = await applyMigrationTargets(targets, sourceKey, sourceVersion, targetComponent, dryRun, async (target, content) => {
      const input = { content, expectedContent: target.content, expectedUpdatedAt: target.updatedAt || '', updatedBy: actorId,
        revisionNote: `Migrate interactive component ${sourceKey}@${sourceVersion} to ${targetKey}@${targetVersion}` };
      const saved = target.type === 'page' ? updateAdminPage(site.id, target.id, input) : updateAdminBlogPost(site.id, target.id, input);
      if (!saved) throw new BackyContentConflictError();
      return saved;
    });
    const completionWarnings: string[] = [];
    if (!dryRun && migratedTargets.length > 0) {
      try {
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
      } catch { completionWarnings.push('The migration audit notification could not be completed. Confirmed document commits are retained.'); }
      try {
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
      } catch { completionWarnings.push('The migration webhook notification could not be completed. Confirmed document commits are retained.'); }
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        dryRun,
        reviewedPreview,
        ...migrationOutcome(failedTargets, completionWarnings, 'demo-single-process'),
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
    if (error instanceof InteractiveComponentInventoryError) {
      return errorResponse(503, error.code, error.message, requestId);
    }
    console.error('Admin interactive component migration API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

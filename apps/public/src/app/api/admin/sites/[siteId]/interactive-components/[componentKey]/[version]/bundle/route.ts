/**
 * Admin interactive component signed bundle storage endpoint.
 *
 * POST /api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/bundle
 */

import { createHash, createHmac } from 'node:crypto';
import { extname } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  getInteractiveComponent,
  getSiteByIdOrSlug,
  recordAdminAuditLog,
  updateInteractiveComponent,
} from '@/lib/backyStore';
import { getMediaStorageAdapter } from '@/lib/mediaStorage';
import { validateInteractiveComponentPayload } from '@/lib/interactiveComponentValidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { deliverSiteWebhooks } from '@/lib/siteWebhookDelivery';
import type { BackyJsonObject, Site } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    componentKey: string;
    version: string;
  }>;
}

const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.js', '.mjs', '.json']);
const ALLOWED_CONTENT_TYPES = new Set([
  'application/javascript',
  'text/javascript',
  'application/ecmascript',
  'text/ecmascript',
  'application/json',
]);

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: Record<string, unknown>) => (
  NextResponse.json({
    success: false,
    requestId,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  }, { status })
);

const validationErrorResponse = (issues: string[], requestId: string) => (
  NextResponse.json({
    success: false,
    requestId,
    error: {
      code: 'INTERACTIVE_COMPONENT_VALIDATION_FAILED',
      message: 'Interactive component failed runtime integrity validation',
      issues,
    },
  }, { status: 400 })
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const auditJson = (value: unknown): BackyJsonObject => JSON.parse(JSON.stringify(value)) as BackyJsonObject;

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const objectValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const stringListValue = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.map((item) => textValue(item)).filter(Boolean)))
    : []
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

const safePathSegment = (value: string, fallback: string) => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || fallback
);

const normalizeFilename = (value: unknown) => {
  const raw = textValue(value) || 'index.js';
  const lastSegment = raw.split(/[\\/]/).pop() || 'index.js';
  const extension = extname(lastSegment).toLowerCase() || '.js';
  const base = safePathSegment(lastSegment.replace(/\.[^.]+$/, ''), 'index');
  return `${base}${extension}`;
};

const normalizeContentType = (value: unknown, filename: string) => {
  const explicit = textValue(value).toLowerCase();
  if (explicit) return explicit;
  return extname(filename).toLowerCase() === '.json' ? 'application/json' : 'application/javascript';
};

const decodeBundle = (value: unknown): Buffer | null => {
  const text = textValue(value);
  if (!text) return null;
  const normalized = text.includes(',') ? text.slice(text.indexOf(',') + 1) : text;
  if (!/^[a-zA-Z0-9+/=\s_-]+$/.test(normalized)) return null;
  const buffer = Buffer.from(normalized.replace(/\s+/g, ''), 'base64');
  return buffer.length > 0 ? buffer : null;
};

const signingSecret = () => (
  process.env.BACKY_COMPONENT_REGISTRY_SIGNING_KEY?.trim()
  || process.env.BACKY_INTERACTIVE_COMPONENT_SIGNING_KEY?.trim()
  || ''
);

const hmacSignature = (sha256: string, secret: string) => (
  `sha256=${createHmac('sha256', secret).update(sha256).digest('hex')}`
);

const buildStoragePath = (siteId: string, componentKey: string, version: string, filename: string) => (
  [
    'sites',
    safePathSegment(siteId, 'site'),
    'interactive-components',
    safePathSegment(componentKey, 'component'),
    safePathSegment(version, 'version'),
    `${Date.now().toString(36)}-${filename}`,
  ].join('/')
);

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

const deliverInteractiveComponentBundleWebhook = async (params: {
  repositories?: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>> | null;
  site: Site;
  before: InteractiveComponentWebhookSource;
  after: InteractiveComponentWebhookSource;
  bundle: {
    filename: string;
    contentType: string;
    sizeBytes: number;
    storageProvider: string;
    storagePath: string;
    bundleUrl: string;
    sha256: string;
    signedBy: string;
    signedAt: string;
  };
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: 'site-updated',
    requestId: params.requestId,
    actor: params.actor,
    reason: 'interactiveComponent.bundle.upload',
    data: {
      resourceType: 'interactiveComponent',
      before: interactiveComponentWebhookSnapshot(params.before),
      after: interactiveComponentWebhookSnapshot(params.after),
      bundle: auditJson(params.bundle),
    },
    metadata: {
      action: 'interactiveComponent.bundle.upload',
      changedKeys: ['interactiveComponents'],
      source: 'admin-interactive-component-bundle-api',
      resourceType: 'interactiveComponent',
      resourceId: params.after.id,
      componentKey: params.after.componentKey,
      version: params.after.version,
      reviewStatus: params.after.reviewStatus,
      status: params.after.status,
      sha256: params.bundle.sha256,
      storageProvider: params.bundle.storageProvider,
      storagePath: params.bundle.storagePath,
    },
  });

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, componentKey, version } = await params;
    const normalizedKey = normalizeComponentKey(componentKey);
    const normalizedVersion = normalizeVersion(version);
    const body = await parseJsonBody(request);
    const filename = normalizeFilename(body.filename);
    const extension = extname(filename).toLowerCase();
    const contentType = normalizeContentType(body.contentType, filename);
    const bundle = decodeBundle(body.contentBase64);

    if (!bundle) {
      return errorResponse(400, 'VALIDATION_ERROR', 'contentBase64 is required and must contain a base64-encoded bundle.', requestId);
    }
    if (bundle.length > MAX_BUNDLE_BYTES) {
      return errorResponse(413, 'INTERACTIVE_COMPONENT_BUNDLE_TOO_LARGE', 'Interactive component bundles are limited to 5 MB.', requestId, {
        maxBytes: MAX_BUNDLE_BYTES,
        sizeBytes: bundle.length,
      });
    }
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      return errorResponse(400, 'INTERACTIVE_COMPONENT_BUNDLE_TYPE_UNSUPPORTED', 'Interactive component bundles must be .js, .mjs, or .json with a matching content type.', requestId, {
        filename,
        contentType,
      });
    }

    const resolveSiteAndComponent = async () => {
      if (!shouldUseDemoStoreFallback()) {
        const repositories = await getRequiredDatabaseRepositories();
        const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
        if (!site) return { response: errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId) };
        const component = await repositories.interactiveComponents.getByKeyVersion(site.id, normalizedKey, normalizedVersion);
        if (!component) return { response: errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId) };
        return { site, component, repositories };
      }

      const site = getSiteByIdOrSlug(siteId);
      if (!site) return { response: errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId) };
      const component = getInteractiveComponent(site.id, normalizedKey, normalizedVersion);
      if (!component) return { response: errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId) };
      return { site, component };
    };

    const resolved = await resolveSiteAndComponent();
    if (resolved.response) return resolved.response;

    const storage = await getMediaStorageAdapter();
    const sha256 = createHash('sha256').update(bundle).digest('hex');
    const providedSignature = textValue(body.signature);
    const secret = signingSecret();
    const signature = providedSignature || (secret ? hmacSignature(sha256, secret) : '');
    if (!signature) {
      return errorResponse(400, 'INTERACTIVE_COMPONENT_SIGNATURE_REQUIRED', 'Provide a signature or configure BACKY_COMPONENT_REGISTRY_SIGNING_KEY before storing custom component bundles.', requestId);
    }

    const storagePath = buildStoragePath(resolved.site.id, normalizedKey, normalizedVersion, filename);
    const upload = await storage.upload(bundle, {
      path: storagePath,
      filename,
      mimeType: contentType,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: {
        siteId: resolved.site.id,
        componentKey: normalizedKey,
        version: normalizedVersion,
        sha256,
      },
    });
    const bundleUrl = upload.url || storage.getPublicUrl(upload.path);
    const signedAt = new Date().toISOString();
    const actor = textValue(body.signedBy) || textValue(body.updatedBy) || 'admin';
    const runtime = {
      ...objectValue(resolved.component.runtime),
      bundleUrl,
      sandboxUrl: textValue(objectValue(resolved.component.runtime).sandboxUrl)
        || `/api/sites/${encodeURIComponent(resolved.site.id)}/interactive-components/${encodeURIComponent(normalizedKey)}/${encodeURIComponent(normalizedVersion)}/sandbox`,
      iframeSandbox: textValue(objectValue(resolved.component.runtime).iframeSandbox) || 'allow-scripts allow-forms',
      allowedPermissions: stringListValue(objectValue(resolved.component.runtime).allowedPermissions),
      postMessageProtocol: textValue(objectValue(resolved.component.runtime).postMessageProtocol) || 'backy.interactive-component.v1',
    };
    const integrity = {
      ...objectValue(resolved.component.integrity),
      signed: true,
      signatureRequiredForCustomCode: true,
      algorithm: 'sha256',
      sha256,
      signature,
      signedBy: actor,
      signedAt,
      storageProvider: storage.provider,
      storagePath: upload.path,
      bundleUrl,
      sizeBytes: bundle.length,
      contentType,
      filename,
    };
    const dependencyMetadata = {
      ...objectValue(resolved.component.dependencyMetadata),
      bundle: {
        schemaVersion: 'backy.interactive-component-bundle.v1',
        filename,
        contentType,
        sizeBytes: bundle.length,
        storageProvider: storage.provider,
        storagePath: upload.path,
        bundleUrl,
        sha256,
        signature,
        signedBy: actor,
        signedAt,
      },
    };
    const update = {
      runtime,
      integrity,
      dependencyMetadata,
      updatedBy: actor,
      changelog: textValue(body.changelog) || `Stored signed bundle ${filename}.`,
    };
    const validation = validateInteractiveComponentPayload(update, {
      ...resolved.component,
      siteId: resolved.site.id,
      componentKey: normalizedKey,
      version: normalizedVersion,
    });
    if (!validation.ok) {
      return validationErrorResponse(validation.issues, requestId);
    }

    const component = resolved.repositories
      ? (await resolved.repositories.interactiveComponents.update(resolved.site.id, normalizedKey, normalizedVersion, update)).item
      : updateInteractiveComponent(resolved.site.id, normalizedKey, normalizedVersion, update);
    if (!component) {
      return errorResponse(404, 'INTERACTIVE_COMPONENT_NOT_FOUND', 'Interactive component not found', requestId);
    }

    const auditPayload = {
      siteId: resolved.site.id,
      teamId: resolved.site.teamId || null,
      actorId: actor,
      entity: 'interactiveComponent' as const,
      entityId: component.id,
      action: 'interactiveComponent.bundle.upload',
      before: auditJson(resolved.component),
      after: auditJson(component),
      metadata: {
        componentKey: normalizedKey,
        version: normalizedVersion,
        filename,
        contentType,
        sizeBytes: bundle.length,
        sha256,
        storageProvider: storage.provider,
        storagePath: upload.path,
      },
      requestId,
    };
    if (resolved.repositories) {
      await resolved.repositories.auditLogs.record(auditPayload);
      await resolved.repositories.cacheInvalidations.record({
        siteId: resolved.site.id,
        scope: 'settings',
        entity: 'interactiveComponent',
        entityId: component.id,
        reason: 'interactive-component-bundle-uploaded',
        metadata: { componentKey: normalizedKey, version: normalizedVersion, sha256 },
      });
    } else {
      recordAdminAuditLog(auditPayload);
    }

    const bundleMetadata = {
      filename,
      contentType,
      sizeBytes: bundle.length,
      storageProvider: storage.provider,
      storagePath: upload.path,
      bundleUrl,
      sha256,
      signedBy: actor,
      signedAt,
    };
    await deliverInteractiveComponentBundleWebhook({
      repositories: resolved.repositories,
      site: resolved.site as unknown as Site,
      before: resolved.component,
      after: component,
      bundle: bundleMetadata,
      requestId,
      actor,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        component,
        bundle: {
          schemaVersion: 'backy.interactive-component-bundle.v1',
          filename,
          contentType,
          sizeBytes: bundle.length,
          storageProvider: storage.provider,
          storagePath: upload.path,
          bundleUrl,
          sha256,
          signed: true,
          signedBy: actor,
          signedAt,
        },
      },
    });
  } catch (error) {
    console.error('Admin interactive component bundle API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

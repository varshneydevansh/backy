/**
 * Admin frontend design contract endpoint.
 *
 * GET   /api/admin/sites/[siteId]/frontend-design
 * PATCH /api/admin/sites/[siteId]/frontend-design
 * POST  /api/admin/sites/[siteId]/frontend-design with { action: "capture-site-defaults" }
 *       or { action: "capture-content-template", resourceType, resourceId }
 *       or { action: "import-frontend-contract", frontendDesign|contract|manifest }
 */

import { NextRequest, NextResponse } from 'next/server';
import type { FormDefinition, Site, SiteSettings } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  getAdminBlogPostById,
  getAdminPageById,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getFormById,
  getPageSummary,
  getReusableSectionByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminSite,
} from '@/lib/backyStore';
import { recordSiteCacheInvalidation, type PublicCacheInvalidation } from '@/lib/cacheInvalidation';
import {
  buildFrontendDesignContractFromContentTemplate,
  buildSiteDefaultFrontendDesignContract,
  emptyFrontendDesignContract,
  normalizeFrontendDesignContract,
} from '@/lib/frontendDesignContract';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({
    success: false,
    requestId,
    error: { code, message },
  }, { status })
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

const toPageTemplates = (pages: Array<{ id: string; title: string; slug: string }>) => (
  pages.slice(0, 12).map((page) => ({
    id: page.id,
    title: page.title,
    slug: page.slug,
    type: 'page' as const,
  }))
);

type TemplateCaptureResourceType = 'page' | 'blogPost' | 'form' | 'product' | 'collection' | 'section';
type FrontendDesignPostAction = 'capture-site-defaults' | 'capture-content-template' | 'import-frontend-contract';

type TemplateCaptureResource = {
  id: string;
  type: TemplateCaptureResourceType;
  title: string;
  slug: string;
  description?: string | null;
  content: unknown;
  meta?: Record<string, unknown>;
};

type CollectionFieldLike = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  validation?: unknown;
  referenceCollectionId?: string | null;
};

type CollectionLike = {
  id: string;
  name: string;
  slug: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  description?: string | null;
  status: string;
  fields?: CollectionFieldLike[];
  permissions?: {
    publicRead?: boolean;
    publicCreate?: boolean;
    publicUpdate?: boolean;
    publicDelete?: boolean;
  };
  metadata?: Record<string, unknown>;
};

type CollectionRecordLike = {
  id: string;
  slug: string;
  status: string;
  values: Record<string, unknown>;
};

const templateResourceType = (value: unknown): TemplateCaptureResourceType | null => {
  if (value === 'page' || value === 'pages') return 'page';
  if (value === 'blogPost' || value === 'post' || value === 'blog') return 'blogPost';
  if (value === 'form' || value === 'forms') return 'form';
  if (value === 'product' || value === 'products') return 'product';
  if (value === 'collection' || value === 'collections') return 'collection';
  if (value === 'section' || value === 'reusableSection' || value === 'reusable-section') return 'section';
  return null;
};

const recordArray = (value: unknown): Array<Record<string, unknown>> | undefined => (
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => (
        typeof item === 'object' && item !== null && !Array.isArray(item)
      ))
    : undefined
);

const recordValue = (value: unknown): Record<string, unknown> | undefined => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

const formTemplateContent = (form: FormDefinition): Record<string, unknown> => ({
  id: form.id,
  name: form.name,
  title: form.title || form.name,
  description: form.description || undefined,
  audience: form.audience,
  isActive: form.isActive,
  fields: form.fields || [],
  notificationEmail: form.notificationEmail || undefined,
  notificationWebhook: form.notificationWebhook || undefined,
  successRedirectUrl: form.successRedirectUrl || undefined,
  successMessage: form.successMessage || undefined,
  enableHoneypot: form.enableHoneypot,
  enableCaptcha: form.enableCaptcha,
  moderationMode: form.moderationMode || 'manual',
  contactShare: form.contactShare,
  collectionTarget: form.collectionTarget,
  settings: form.settings || {},
});

const formBindingHints = (form: FormDefinition): Array<Record<string, unknown>> => (
  (form.fields || []).map((field) => ({
    role: 'form.field',
    binding: `form.fields.${field.key}`,
    fields: ['key', 'label', 'type', 'required', 'validation'],
  }))
);

const formEditableMap = (form: FormDefinition): Array<Record<string, unknown>> => [
  { role: 'form.title', binding: 'form.title', fields: ['title', 'description'] },
  ...(form.fields || []).map((field) => ({
    role: 'form.field',
    binding: `form.fields.${field.key}`,
    fields: ['label', 'placeholder', 'helpText', 'defaultValue', 'options', 'validation', 'required'],
  })),
];

const sectionEditableMap = (): Array<Record<string, unknown>> => [
  { role: 'section.metadata', binding: 'section.metadata', fields: ['name', 'description', 'category', 'tags'] },
];

const collectionTemplateContent = (collection: CollectionLike): Record<string, unknown> => ({
  id: collection.id,
  name: collection.name,
  slug: collection.slug,
  description: collection.description || undefined,
  routePattern: collection.routePattern || undefined,
  listRoutePattern: collection.listRoutePattern || undefined,
  status: collection.status,
  fields: collection.fields || [],
  permissions: collection.permissions,
  metadata: collection.metadata || {},
});

const collectionBindingHints = (collection: CollectionLike): Array<Record<string, unknown>> => (
  (collection.fields || []).map((field) => ({
    role: 'collection.field',
    binding: `collection.fields.${field.key}`,
    fields: ['key', 'label', 'type', 'required', 'options', 'validation'],
  }))
);

const collectionEditableMap = (collection: CollectionLike): Array<Record<string, unknown>> => [
  { role: 'collection.schema', binding: 'collection.schema', fields: ['name', 'description', 'routePattern', 'listRoutePattern'] },
  ...(collection.fields || []).map((field) => ({
    role: 'collection.field',
    binding: `collection.fields.${field.key}`,
    fields: ['label', 'type', 'required', 'options', 'validation', 'referenceCollectionId'],
  })),
];

const recordTitle = (record: CollectionRecordLike): string => {
  const title = record.values.title || record.values.name || record.values.seoTitle;
  return typeof title === 'string' && title.trim() ? title.trim() : record.slug;
};

const recordDescription = (record: CollectionRecordLike): string | null => {
  const description = record.values.description || record.values.summary || record.values.excerpt;
  return typeof description === 'string' && description.trim() ? description.trim() : null;
};

const collectionRecordTemplateContent = (
  collection: CollectionLike,
  record: CollectionRecordLike,
): Record<string, unknown> => ({
  id: record.id,
  collectionId: collection.id,
  collectionSlug: collection.slug,
  slug: record.slug,
  status: record.status,
  values: record.values,
  fields: collection.fields || [],
});

const recordBindingHints = (collection: CollectionLike): Array<Record<string, unknown>> => (
  (collection.fields || []).map((field) => ({
    role: collection.slug === 'products' ? 'product.field' : 'collection.record.field',
    binding: `${collection.slug === 'products' ? 'product' : 'record'}.${field.key}`,
    fields: [field.key],
  }))
);

const recordEditableMap = (collection: CollectionLike): Array<Record<string, unknown>> => (
  (collection.fields || []).map((field) => ({
    role: collection.slug === 'products' ? 'product.field' : 'collection.record.field',
    binding: `${collection.slug === 'products' ? 'product' : 'record'}.${field.key}`,
    fields: [field.key],
  }))
);

const stringBodyValue = (body: Record<string, unknown>, key: string): string | undefined => (
  typeof body[key] === 'string' && body[key].trim() ? body[key].trim() : undefined
);

const frontendDesignAction = (value: unknown): FrontendDesignPostAction | null => {
  if (value === 'capture-site-defaults' || value === 'capture-content-template' || value === 'import-frontend-contract') {
    return value;
  }
  if (value === 'import' || value === 'connect-frontend' || value === 'connect-custom-frontend') {
    return 'import-frontend-contract';
  }
  return null;
};

const frontendDesignImportPayload = (
  body: Record<string, unknown>,
): { input: Record<string, unknown>; source: string } | null => {
  const direct = recordValue(body.frontendDesign);
  if (direct) return { input: direct, source: 'frontendDesign' };

  const contract = recordValue(body.contract);
  if (contract) return { input: contract, source: 'contract' };

  const design = recordValue(body.design);
  if (design) return { input: design, source: 'design' };

  const manifest = recordValue(body.manifest) || body;
  const manifestData = recordValue(manifest.data);
  const manifestSite = recordValue(manifestData?.site) || recordValue(manifest.site);
  const manifestFrontendDesign = recordValue(manifestSite?.frontendDesign);
  if (manifestFrontendDesign) return { input: manifestFrontendDesign, source: 'manifest.site.frontendDesign' };

  return null;
};

const repositoryTemplateResource = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
  resourceType: TemplateCaptureResourceType,
  resourceId: string,
  options: { collectionId?: string } = {},
): Promise<{ resource: TemplateCaptureResource; routePattern?: string; bindingHints?: Array<Record<string, unknown>>; editableMap?: Array<Record<string, unknown>> } | null> => {
  if (resourceType === 'page') {
    const page = await repositories.pages.getById(siteId, resourceId);
    return page ? {
      resource: {
        id: page.id,
        type: 'page',
        title: page.title,
        slug: page.slug,
        description: page.description,
        content: page.content,
        meta: page.meta as Record<string, unknown> | undefined,
      },
    } : null;
  }

  if (resourceType === 'blogPost') {
    const post = await repositories.posts.getById(siteId, resourceId);
    return post ? {
      resource: {
        id: post.id,
        type: 'blogPost',
        title: post.title,
        slug: post.slug,
        description: post.excerpt,
        content: post.content,
        meta: post.meta as Record<string, unknown> | undefined,
      },
    } : null;
  }

  if (resourceType === 'form') {
    const form = await repositories.forms.getById(siteId, resourceId);
    return form ? {
      resource: {
        id: form.id,
        type: 'form',
        title: form.title || form.name,
        slug: form.id,
        description: form.description,
        content: formTemplateContent(form),
        meta: form.settings,
      },
      bindingHints: formBindingHints(form),
      editableMap: formEditableMap(form),
    } : null;
  }

  if (resourceType === 'collection') {
    const collection = await repositories.collections.getById(siteId, resourceId)
      || await repositories.collections.getBySlug(siteId, resourceId);
    return collection ? {
      resource: {
        id: collection.id,
        type: 'collection',
        title: collection.name,
        slug: collection.slug,
        description: collection.description,
        content: collectionTemplateContent(collection),
        meta: collection.metadata,
      },
      routePattern: collection.routePattern || collection.listRoutePattern || undefined,
      bindingHints: collectionBindingHints(collection),
      editableMap: collectionEditableMap(collection),
    } : null;
  }

  if (resourceType === 'product') {
    const collection = options.collectionId
      ? await repositories.collections.getById(siteId, options.collectionId) || await repositories.collections.getBySlug(siteId, options.collectionId)
      : await repositories.collections.getBySlug(siteId, 'products');
    if (!collection) return null;

    const record = await repositories.collections.getRecordById(siteId, collection.id, resourceId)
      || await repositories.collections.getRecordBySlug(siteId, collection.id, resourceId);
    return record ? {
      resource: {
        id: record.id,
        type: collection.slug === 'products' ? 'product' : 'collection',
        title: recordTitle(record),
        slug: record.slug,
        description: recordDescription(record),
        content: collectionRecordTemplateContent(collection, record),
        meta: record.values,
      },
      routePattern: collection.slug === 'products'
        ? `/products/${record.slug}`
        : collection.routePattern?.replace(':recordSlug', record.slug),
      bindingHints: recordBindingHints(collection),
      editableMap: recordEditableMap(collection),
    } : null;
  }

  const section = await repositories.reusableSections.getById(siteId, resourceId)
    || await repositories.reusableSections.getBySlug(siteId, resourceId);
  return section ? {
    resource: {
      id: section.id,
      type: 'section',
      title: section.name,
      slug: section.slug,
      description: section.description,
      content: section.content,
      meta: section.metadata,
    },
    editableMap: sectionEditableMap(),
  } : null;
};

const demoTemplateResource = (
  siteId: string,
  resourceType: TemplateCaptureResourceType,
  resourceId: string,
  options: { collectionId?: string } = {},
): { resource: TemplateCaptureResource; routePattern?: string; bindingHints?: Array<Record<string, unknown>>; editableMap?: Array<Record<string, unknown>> } | null => {
  if (resourceType === 'page') {
    const page = getAdminPageById(siteId, resourceId);
    return page ? {
      resource: {
        id: page.id,
        type: 'page',
        title: page.title,
        slug: page.slug,
        description: page.description,
        content: page.content,
        meta: page.meta as Record<string, unknown> | undefined,
      },
    } : null;
  }

  if (resourceType === 'blogPost') {
    const post = getAdminBlogPostById(siteId, resourceId);
    return post ? {
      resource: {
        id: post.id,
        type: 'blogPost',
        title: post.title,
        slug: post.slug,
        description: post.excerpt,
        content: post.content,
        meta: post.meta as Record<string, unknown> | undefined,
      },
    } : null;
  }

  if (resourceType === 'form') {
    const form = getFormById(siteId, resourceId);
    return form ? {
      resource: {
        id: form.id,
        type: 'form',
        title: form.title || form.name,
        slug: form.id,
        description: form.description,
        content: formTemplateContent(form),
        meta: form.settings,
      },
      bindingHints: formBindingHints(form),
      editableMap: formEditableMap(form),
    } : null;
  }

  if (resourceType === 'collection') {
    const collection = getCollectionByIdOrSlug(siteId, resourceId, { includeUnpublished: true });
    return collection ? {
      resource: {
        id: collection.id,
        type: 'collection',
        title: collection.name,
        slug: collection.slug,
        description: collection.description,
        content: collectionTemplateContent(collection),
        meta: collection.metadata,
      },
      routePattern: collection.routePattern || collection.listRoutePattern || undefined,
      bindingHints: collectionBindingHints(collection),
      editableMap: collectionEditableMap(collection),
    } : null;
  }

  if (resourceType === 'product') {
    const collection = getCollectionByIdOrSlug(siteId, options.collectionId || 'products', { includeUnpublished: true });
    if (!collection) return null;

    const record = getCollectionRecordByIdOrSlug(siteId, collection.id, resourceId, { includeUnpublished: true });
    return record ? {
      resource: {
        id: record.id,
        type: collection.slug === 'products' ? 'product' : 'collection',
        title: recordTitle(record),
        slug: record.slug,
        description: recordDescription(record),
        content: collectionRecordTemplateContent(collection, record),
        meta: record.values,
      },
      routePattern: collection.slug === 'products'
        ? `/products/${record.slug}`
        : collection.routePattern?.replace(':recordSlug', record.slug),
      bindingHints: recordBindingHints(collection),
      editableMap: recordEditableMap(collection),
    } : null;
  }

  const section = getReusableSectionByIdOrSlug(siteId, resourceId);
  return section ? {
    resource: {
      id: section.id,
      type: 'section',
      title: section.name,
      slug: section.slug,
      description: section.description,
      content: section.content,
      meta: section.metadata,
    },
    editableMap: sectionEditableMap(),
  } : null;
};

const responseForSite = (
  requestId: string,
  site: Pick<Site, 'id' | 'slug' | 'name' | 'customDomain' | 'theme' | 'settings'>,
  options: {
    cacheInvalidation?: PublicCacheInvalidation | null;
  } = {},
) => {
  const frontendDesign = site.settings?.frontendDesign || emptyFrontendDesignContract();

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      site: {
        id: site.id,
        slug: site.slug,
        name: site.name,
        customDomain: site.customDomain,
      },
      frontendDesign,
      endpoints: {
        admin: `/api/admin/sites/${site.id}/frontend-design`,
        publicManifest: `/api/sites/${site.id}/manifest`,
      },
      nextSteps: [
        'PATCH a custom frontend design contract after scanning your frontend components.',
        'Use capture-site-defaults to snapshot current Backy navigation, theme tokens, and page templates.',
        'New page, blog, form, product, and section generation can use this contract as its site design source.',
      ],
      ...(options.cacheInvalidation ? { cacheInvalidation: options.cacheInvalidation } : {}),
    },
  });
};

const persistRepositoryFrontendDesign = async (
  site: Site,
  settings: SiteSettings,
  frontendDesign: NonNullable<SiteSettings['frontendDesign']>,
) => {
  const repositories = await getRequiredDatabaseRepositories();
  const updated = await repositories.sites.update(site.id, {
    settings: {
      ...settings,
      frontendDesign,
    },
  });
  return updated.item;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'sites.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      return responseForSite(requestId, site);
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return responseForSite(requestId, site as unknown as Site);
  } catch (error) {
    console.error('Admin frontend design API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'sites.configure' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const input = body.frontendDesign || body;
    const updatedAt = new Date().toISOString();

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const frontendDesign = normalizeFrontendDesignContract(input, {
        fallback: site.settings.frontendDesign,
        updatedAt,
      });
      const updated = await persistRepositoryFrontendDesign(site, site.settings, frontendDesign);
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'settings',
        entity: 'site',
        entityId: site.id,
        reason: 'site-frontend-design-updated',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'site',
        entityId: site.id,
        action: 'frontendDesign.update',
        before: site.settings.frontendDesign || emptyFrontendDesignContract(),
        after: frontendDesign,
        metadata: {
          status: frontendDesign.status,
          sourceType: frontendDesign.source.type,
          sourceLabel: frontendDesign.source.label || null,
          templateCount: frontendDesign.templates.length,
          editableBindingCount: frontendDesign.editableMap.length,
        },
        requestId,
      });
      return responseForSite(requestId, updated, { cacheInvalidation });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const frontendDesign = normalizeFrontendDesignContract(input, {
      fallback: site.settings?.frontendDesign,
      updatedAt,
    });
    const updated = updateAdminSite(site.id, {
      settings: {
        ...(site.settings || {}),
        frontendDesign,
      },
    });

    if (!updated) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'site',
      entityId: site.id,
      action: 'frontendDesign.update',
      before: site.settings?.frontendDesign || emptyFrontendDesignContract(),
      after: frontendDesign,
      metadata: {
        status: frontendDesign.status,
        sourceType: frontendDesign.source.type,
        sourceLabel: frontendDesign.source.label || null,
        templateCount: frontendDesign.templates.length,
        editableBindingCount: frontendDesign.editableMap.length,
      },
      requestId,
    });

    return responseForSite(requestId, updated as unknown as Site);
  } catch (error) {
    console.error('Admin frontend design update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'sites.configure' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const action = frontendDesignAction(body.action);

    if (!action) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Unsupported frontend design action', requestId);
    }

    const updatedAt = new Date().toISOString();

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      if (action === 'import-frontend-contract') {
        const imported = frontendDesignImportPayload(body);
        if (!imported) {
          return errorResponse(400, 'VALIDATION_ERROR', 'frontendDesign, contract, design, or manifest.site.frontendDesign is required for frontend contract import', requestId);
        }

        const frontendDesign = normalizeFrontendDesignContract(imported.input, {
          fallback: site.settings.frontendDesign,
          updatedAt,
        });
        const updated = await persistRepositoryFrontendDesign(site, site.settings, frontendDesign);
        const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: 'settings',
          entity: 'site',
          entityId: site.id,
          reason: 'site-frontend-design-imported',
          requestId,
        });
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          entity: 'site',
          entityId: site.id,
          action: 'frontendDesign.import',
          before: site.settings.frontendDesign || emptyFrontendDesignContract(),
          after: frontendDesign,
          metadata: {
            action,
            importSource: imported.source,
            status: frontendDesign.status,
            sourceType: frontendDesign.source.type,
            sourceLabel: frontendDesign.source.label || null,
            templateCount: frontendDesign.templates.length,
            editableBindingCount: frontendDesign.editableMap.length,
          },
          requestId,
        });
        return responseForSite(requestId, updated, { cacheInvalidation });
      }

      if (action === 'capture-content-template') {
        const resourceType = templateResourceType(body.resourceType || body.type);
        const resourceId = typeof body.resourceId === 'string' ? body.resourceId.trim() : '';
        if (!resourceType || !resourceId) {
          return errorResponse(400, 'VALIDATION_ERROR', 'resourceType and resourceId are required for content template capture', requestId);
        }

        const captured = await repositoryTemplateResource(repositories, site.id, resourceType, resourceId, {
          collectionId: stringBodyValue(body, 'collectionId') || stringBodyValue(body, 'collectionSlug'),
        });
        if (!captured) {
          return errorResponse(404, 'CONTENT_NOT_FOUND', 'Content resource not found', requestId);
        }

        const frontendDesign = buildFrontendDesignContractFromContentTemplate({
          frontendDesign: site.settings.frontendDesign,
          resource: captured.resource,
          templateId: typeof body.templateId === 'string' ? body.templateId.trim() : undefined,
          templateName: typeof body.templateName === 'string' ? body.templateName.trim() : undefined,
          routePattern: typeof body.routePattern === 'string' ? body.routePattern.trim() : captured.routePattern,
          source: typeof body.source === 'object' && body.source !== null && !Array.isArray(body.source)
            ? body.source as Record<string, unknown>
            : undefined,
          bindingHints: recordArray(body.bindingHints) || captured.bindingHints,
          editableMap: recordArray(body.editableMap) || captured.editableMap,
          updatedAt,
        });
        const updated = await persistRepositoryFrontendDesign(site, site.settings, frontendDesign);
        const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: 'settings',
          entity: 'site',
          entityId: site.id,
          reason: 'site-frontend-design-template-captured',
          requestId,
        });
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          entity: 'site',
          entityId: site.id,
          action: 'frontendDesign.template.capture',
          before: site.settings.frontendDesign || emptyFrontendDesignContract(),
          after: frontendDesign,
          metadata: {
            action,
            resourceType,
            resourceId,
            templateId: frontendDesign.templates.at(-1)?.id || null,
            templateCount: frontendDesign.templates.length,
            editableBindingCount: frontendDesign.editableMap.length,
          },
          requestId,
        });
        return responseForSite(requestId, updated, { cacheInvalidation });
      }

      const pages = await repositories.pages.list({ siteId: site.id, includeUnpublished: true });
      const frontendDesign = buildSiteDefaultFrontendDesignContract({
        site,
        pageTemplates: toPageTemplates(pages.items),
        updatedAt,
      });
      const updated = await persistRepositoryFrontendDesign(site, site.settings, frontendDesign);
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'settings',
        entity: 'site',
        entityId: site.id,
        reason: 'site-frontend-design-captured',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'site',
        entityId: site.id,
        action: 'frontendDesign.capture',
        before: site.settings.frontendDesign || emptyFrontendDesignContract(),
        after: frontendDesign,
        metadata: {
          action,
          status: frontendDesign.status,
          sourceType: frontendDesign.source.type,
          templateCount: frontendDesign.templates.length,
          editableBindingCount: frontendDesign.editableMap.length,
        },
        requestId,
      });
      return responseForSite(requestId, updated, { cacheInvalidation });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    if (action === 'import-frontend-contract') {
      const imported = frontendDesignImportPayload(body);
      if (!imported) {
        return errorResponse(400, 'VALIDATION_ERROR', 'frontendDesign, contract, design, or manifest.site.frontendDesign is required for frontend contract import', requestId);
      }

      const frontendDesign = normalizeFrontendDesignContract(imported.input, {
        fallback: site.settings?.frontendDesign,
        updatedAt,
      });
      const updated = updateAdminSite(site.id, {
        settings: {
          ...(site.settings || {}),
          frontendDesign,
        },
      });

      if (!updated) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }
      await recordAdminAudit({
        siteId: site.id,
        entity: 'site',
        entityId: site.id,
        action: 'frontendDesign.import',
        before: site.settings?.frontendDesign || emptyFrontendDesignContract(),
        after: frontendDesign,
        metadata: {
          action,
          importSource: imported.source,
          status: frontendDesign.status,
          sourceType: frontendDesign.source.type,
          sourceLabel: frontendDesign.source.label || null,
          templateCount: frontendDesign.templates.length,
          editableBindingCount: frontendDesign.editableMap.length,
        },
        requestId,
      });

      return responseForSite(requestId, updated as unknown as Site);
    }

    if (action === 'capture-content-template') {
      const resourceType = templateResourceType(body.resourceType || body.type);
      const resourceId = typeof body.resourceId === 'string' ? body.resourceId.trim() : '';
      if (!resourceType || !resourceId) {
        return errorResponse(400, 'VALIDATION_ERROR', 'resourceType and resourceId are required for content template capture', requestId);
      }

      const captured = demoTemplateResource(site.id, resourceType, resourceId, {
        collectionId: stringBodyValue(body, 'collectionId') || stringBodyValue(body, 'collectionSlug'),
      });
      if (!captured) {
        return errorResponse(404, 'CONTENT_NOT_FOUND', 'Content resource not found', requestId);
      }

      const frontendDesign = buildFrontendDesignContractFromContentTemplate({
        frontendDesign: site.settings?.frontendDesign,
        resource: captured.resource,
        templateId: typeof body.templateId === 'string' ? body.templateId.trim() : undefined,
        templateName: typeof body.templateName === 'string' ? body.templateName.trim() : undefined,
        routePattern: typeof body.routePattern === 'string' ? body.routePattern.trim() : captured.routePattern,
        source: typeof body.source === 'object' && body.source !== null && !Array.isArray(body.source)
          ? body.source as Record<string, unknown>
          : undefined,
        bindingHints: recordArray(body.bindingHints) || captured.bindingHints,
        editableMap: recordArray(body.editableMap) || captured.editableMap,
        updatedAt,
      });
      const updated = updateAdminSite(site.id, {
        settings: {
          ...(site.settings || {}),
          frontendDesign,
        },
      });

      if (!updated) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }
      await recordAdminAudit({
        siteId: site.id,
        entity: 'site',
        entityId: site.id,
        action: 'frontendDesign.template.capture',
        before: site.settings?.frontendDesign || emptyFrontendDesignContract(),
        after: frontendDesign,
        metadata: {
          action,
          resourceType,
          resourceId,
          templateId: frontendDesign.templates.at(-1)?.id || null,
          templateCount: frontendDesign.templates.length,
          editableBindingCount: frontendDesign.editableMap.length,
        },
        requestId,
      });

      return responseForSite(requestId, updated as unknown as Site);
    }

    const frontendDesign = buildSiteDefaultFrontendDesignContract({
      site: site as unknown as Site,
      pageTemplates: toPageTemplates(getPageSummary(site.id, { includeUnpublished: true })),
      updatedAt,
    });
    const updated = updateAdminSite(site.id, {
      settings: {
        ...(site.settings || {}),
        frontendDesign,
      },
    });

    if (!updated) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'site',
      entityId: site.id,
      action: 'frontendDesign.capture',
      before: site.settings?.frontendDesign || emptyFrontendDesignContract(),
      after: frontendDesign,
      metadata: {
        action,
        status: frontendDesign.status,
        sourceType: frontendDesign.source.type,
        templateCount: frontendDesign.templates.length,
        editableBindingCount: frontendDesign.editableMap.length,
      },
      requestId,
    });

    return responseForSite(requestId, updated as unknown as Site);
  } catch (error) {
    console.error('Admin frontend design action API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

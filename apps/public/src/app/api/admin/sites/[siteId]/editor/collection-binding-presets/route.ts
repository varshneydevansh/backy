import { unrelatedSiteSettingsPatch } from "@backy-cms/core";
import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SITE_SETTINGS, normalizeBackyJsonObject, type SiteEditorCollectionBindingPreset, type SiteSettings } from '@backy-cms/core';
import { recordAdminAudit } from '@/lib/adminAudit';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getSiteByIdOrSlug, getCollectionByIdOrSlug, updateAdminSite } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const MAX_PRESETS = 48;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const textValue = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const siteSettings = (settings: SiteSettings | undefined): SiteSettings => (
  (settings || DEFAULT_SITE_SETTINGS) as SiteSettings
);

const normalizePreset = (
  value: unknown,
  index: number,
  previous?: SiteEditorCollectionBindingPreset,
  actorId?: string,
): SiteEditorCollectionBindingPreset | null => {
  if (!isRecord(value)) return null;

  const collectionId = textValue(value.collectionId);
  const fieldKey = textValue(value.fieldKey);
  const targetPath = textValue(value.targetPath) || 'props.content';
  if (!collectionId || !fieldKey) return null;

  const now = new Date().toISOString();
  const name = textValue(value.name) || previous?.name || `Binding preset ${index + 1}`;
  const id = textValue(value.id) || previous?.id || `binding-preset-${Date.now().toString(36)}-${index}`;

  return {
    ...normalizeBackyJsonObject(value),
    id,
    name,
    collectionId,
    fieldKey,
    targetPath,
    sourcePath: textValue(value.sourcePath),
    search: textValue(value.search),
    filterField: textValue(value.filterField),
    filterValue: textValue(value.filterValue),
    sortBy: textValue(value.sortBy),
    sortDirection: value.sortDirection === 'desc' ? 'desc' : 'asc',
    limit: textValue(value.limit),
    offset: textValue(value.offset),
    createdAt: previous?.createdAt || (actorId ? now : textValue(value.createdAt) || now),
    updatedAt: actorId ? now : textValue(value.updatedAt) || previous?.updatedAt || now,
    createdBy: previous?.createdBy || actorId || textValue(value.createdBy) || null,
    updatedBy: actorId || previous?.updatedBy || textValue(value.updatedBy) || null,
  };
};

const normalizePresets = (
  value: unknown,
  previous: SiteEditorCollectionBindingPreset[] = [],
  actorId?: string,
): SiteEditorCollectionBindingPreset[] => {
  if (!Array.isArray(value)) return [];
  const previousById = new Map(previous.map((preset) => [preset.id, preset]));
  const seen = new Set<string>();

  return value
    .map((item, index) => normalizePreset(item, index, isRecord(item) ? previousById.get(textValue(item.id)) : undefined, actorId))
    .filter((preset): preset is SiteEditorCollectionBindingPreset => Boolean(preset))
    .filter((preset) => {
      if (seen.has(preset.id)) return false;
      seen.add(preset.id);
      return true;
    });
};

// Reject lossy replacement payloads rather than silently discard a user's presets.
const presetPayloadError = (presets: unknown[]): string | null => {
  if (presets.length > MAX_PRESETS) return `At most ${MAX_PRESETS} binding presets can be saved. Remove presets explicitly before saving.`;
  const ids = new Set<string>();
  for (const [index, preset] of presets.entries()) {
    if (!isRecord(preset) || !textValue(preset.collectionId) || !textValue(preset.fieldKey)) return `Preset ${index + 1} requires a collectionId and fieldKey.`;
    const id = textValue(preset.id);
    if (id && ids.has(id)) return `Duplicate binding preset id: ${id}.`;
    if (id) ids.add(id);
    for (const path of [preset.targetPath, preset.sourcePath, preset.fieldKey]) {
      if (typeof path === 'string' && path.split('.').some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) return `Preset ${index + 1} contains an unsafe binding path.`;
    }
  }
  return null;
};

const validatePresetCollections = async (presets: SiteEditorCollectionBindingPreset[], siteId: string, getCollection: (id: string) => Promise<{ id: string; siteId: string; fields: Array<{ key: string }> } | null>): Promise<string | null> => {
  const reservedFields = new Set(['id', 'slug', 'status', 'createdAt', 'updatedAt', 'publishedAt', 'scheduledAt']);
  const checked = new Map<string, Awaited<ReturnType<typeof getCollection>>>();
  for (const preset of presets) {
    if (!checked.has(preset.collectionId)) checked.set(preset.collectionId, await getCollection(preset.collectionId));
    const collection = checked.get(preset.collectionId);
    if (!collection || collection.siteId !== siteId || collection.id !== preset.collectionId) return `Preset "${preset.name}" must reference a collection ID in the selected site.`;
    if (!reservedFields.has(preset.fieldKey) && !collection.fields.some(field => field.key === preset.fieldKey)) return `Preset "${preset.name}" references a field that is not declared by its collection.`;
  }
  return null;
};

const savedPresets = (settings: SiteSettings): SiteEditorCollectionBindingPreset[] => (
  normalizePresets(settings.editor?.collectionBindingPresets || [])
);

const settingsWithPresets = (
  presets: SiteEditorCollectionBindingPreset[],
): SiteSettings => ({
  editor: {
    collectionBindingPresets: presets,
  },
} as SiteSettings);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: { id: site.id, slug: site.slug, name: site.name },
          presets: savedPresets(siteSettings(site.settings)),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: { id: site.id, slug: site.slug, name: site.name },
        presets: savedPresets(siteSettings(site.settings)),
      },
    });
  } catch (error) {
    console.error('Admin collection binding preset list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);

    if (!Array.isArray(body.presets)) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Preset payload must include a presets array.', requestId);
    }
    const invalid = presetPayloadError(body.presets);
    if (invalid) return errorResponse(400, 'VALIDATION_ERROR', invalid, requestId);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const settings = siteSettings(site.settings);
      const before = savedPresets(settings);
      const presets = normalizePresets(body.presets, before, access.session?.user.id);
      const invalidCollection = await validatePresetCollections(presets, site.id, id => repositories.collections.getById(site.id, id));
      if (invalidCollection) return errorResponse(400, 'VALIDATION_ERROR', invalidCollection, requestId);
      const updated = await repositories.sites.update(site.id, { settings: unrelatedSiteSettingsPatch(settingsWithPresets(presets)) });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: access.session?.user.id,
        entity: 'settings',
        entityId: site.id,
        action: 'editor.collectionBindingPresets.update',
        before,
        after: presets,
        metadata: { count: presets.length },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: { id: updated.item.id, slug: updated.item.slug, name: updated.item.name },
          presets: savedPresets(siteSettings(updated.item.settings)),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const settings = siteSettings(site.settings);
    const before = savedPresets(settings);
    const presets = normalizePresets(body.presets, before, access.session?.user.id);
    const invalidCollection = await validatePresetCollections(presets, site.id, async id => getCollectionByIdOrSlug(site.id, id, { includeUnpublished: true }) || null);
    if (invalidCollection) return errorResponse(400, 'VALIDATION_ERROR', invalidCollection, requestId);
    const updated = updateAdminSite(site.id, { settings: unrelatedSiteSettingsPatch(settingsWithPresets(presets)) });
    if (!updated) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: 'settings',
      entityId: site.id,
      action: 'editor.collectionBindingPresets.update',
      before,
      after: presets,
      metadata: { count: presets.length },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: { id: updated.id, slug: updated.slug, name: updated.name },
        presets: savedPresets(siteSettings(updated.settings)),
      },
    });
  } catch (error) {
    console.error('Admin collection binding preset save API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

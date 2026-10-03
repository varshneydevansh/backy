import { normalizeSavedCanvasContent, serializeCanvasContent } from '@/components/editor/editorCatalog';
import type { CanvasElement, CanvasSize } from '@/types/editor';
import type { PageSettings } from '@/components/editor/PageSettingsModal';
import { productCanvasDesign } from '@backy-cms/core';
export { productCanvasDesign } from '@backy-cms/core';

type DesignValues = Record<string, unknown>;
const record = (value: unknown): DesignValues => value && typeof value === 'object' && !Array.isArray(value) ? value as DesignValues : {};

export function readProductCanvas(values: DesignValues) {
  const design = productCanvasDesign(values);
  return normalizeSavedCanvasContent(JSON.stringify({
    ...design,
    customCSS: design.customCSS ?? design.customCss,
    customJS: design.customJS ?? design.customJs,
  }));
}

/** Return only design fields so an in-progress price/title edit cannot be overwritten. */
export function writeProductCanvas(
  values: DesignValues,
  id: string,
  settings: PageSettings,
  elements: CanvasElement[],
  canvasSize: CanvasSize,
): DesignValues {
  const design = productCanvasDesign(values);
  const normalized = readProductCanvas(values);
  const oldDocument = record(design.contentDocument);
  const payload = JSON.parse(serializeCanvasContent(elements, canvasSize, normalized.customCSS, {
    documentId: id,
    kind: 'dynamicItem',
    title: settings.title,
    slug: settings.slug,
    status: settings.status,
    locale: normalized.contentDocument?.locale || 'en',
    version: typeof normalized.contentDocument?.version === 'string' ? normalized.contentDocument.version : undefined,
    customJS: normalized.customJS,
    themeTokenRefs: normalized.themeTokenRefs,
    assets: normalized.assets,
    interactions: normalized.interactions,
    seo: normalized.seo,
    dataBindings: normalized.dataBindings,
    editableMap: normalized.editableMap,
    metadata: {
      ...record(oldDocument.metadata),
      ...record(design.metadata),
      ...(design.animations !== undefined ? { animations: design.animations } : {}),
      ...(design.responsive !== undefined ? { responsive: design.responsive } : {}),
    } as NonNullable<typeof normalized.metadata>,
  }));
  const changed: DesignValues = {
    elements,
    canvasSize,
    contentDocument: { ...oldDocument, ...payload.contentDocument, ...(oldDocument.version !== undefined ? { version: oldDocument.version } : {}) },
    metadata: payload.metadata,
  };
  const patch: DesignValues = Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith('frontendDesign')));
  const nextDesign = { ...design, ...changed };
  for (const [key, value] of Object.entries(changed)) {
    const alias = `frontendDesign${key[0].toUpperCase()}${key.slice(1)}`;
    patch[alias] = value;
    nextDesign[alias] = value;
  }
  return { ...patch, design: nextDesign };
}

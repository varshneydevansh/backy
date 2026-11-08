import type { SiteFrontendDesignContract, SiteSettings } from './types';
/** Generic settings writes omit design; only the atomic template history writer changes it. */
export function unrelatedSiteSettingsPatch(settings: Partial<SiteSettings> | undefined): Omit<Partial<SiteSettings>, 'frontendDesign'> | undefined {
  if (settings === undefined) return undefined;
  return Object.fromEntries(Object.entries(settings).filter(([key]) => key !== 'frontendDesign'));
}
export type BackyFrontendDesignTemplate = SiteFrontendDesignContract['templates'][number];
export interface BackyTemplateRevision {
  schemaVersion: 'backy.template-revision.v1';
  id: string;
  siteId: string;
  templateId: string;
  fingerprint: string;
  snapshot: BackyFrontendDesignTemplate;
  source: string;
  operation: 'baseline' | 'save' | 'restore';
  restoredFromRevisionId?: string | null;
  actorId?: string | null;
  requestId?: string | null;
  createdAt: string;
}
/** Stable JSON supports identical fingerprints after JSONB key ordering or file reopen. */
export function serializeTemplateRevisionValue(value: unknown): string {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, visit(item)]));
    return value;
  };
  return JSON.stringify(visit(value)) ?? 'null';
}
export function changedTemplateRevisionSnapshots(before: BackyFrontendDesignTemplate[], after: BackyFrontendDesignTemplate[]) {
  for (const templates of [before, after]) {
    const ids = new Set<string>();
    for (const template of templates) {
      if (!template.id || ids.has(template.id)) throw new Error('Template IDs must be unique within the site design.');
      ids.add(template.id);
    }
  }
  const changes: Array<{ snapshot: BackyFrontendDesignTemplate; operation: 'baseline' | 'save' }> = [];
  for (const old of before) {
    const next = after.find(template => template.id === old.id);
    if (!next || serializeTemplateRevisionValue(old) !== serializeTemplateRevisionValue(next)) changes.push({ snapshot: JSON.parse(JSON.stringify(old)), operation: 'baseline' });
  }
  for (const next of after) {
    const old = before.find(template => template.id === next.id);
    if (!old || serializeTemplateRevisionValue(old) !== serializeTemplateRevisionValue(next)) changes.push({ snapshot: JSON.parse(JSON.stringify(next)), operation: 'save' });
  }
  return changes;
}

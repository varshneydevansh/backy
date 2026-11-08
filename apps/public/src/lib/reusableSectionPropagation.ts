import { createHash } from 'node:crypto';
import { serializeTemplateRevisionValue, type BackyReusableSectionPropagationTarget } from '@backy-cms/core';
export type ReusableSectionReviewedPreview = {
  schemaVersion: 'backy.reusable-section-propagation-preview.v1'; siteId: string; sectionId: string;
  sourceFingerprint: string; inventoryFingerprint: string;
  scope: { targetType: 'page' | 'post' | 'product' | 'all'; targetId: string | null; includeProducts: boolean };
  targets: Array<{ type: 'page' | 'post' | 'product'; id: string; collectionId?: string; updatedAt: string; contentFingerprint: string }>;
};
const fingerprint = (value: unknown) => createHash('sha256').update(serializeTemplateRevisionValue(value)).digest('hex');
export function buildReusableSectionReviewedPreview(siteId: string, section: { id: string }, scope: ReusableSectionReviewedPreview['scope'], inventory: BackyReusableSectionPropagationTarget[]): ReusableSectionReviewedPreview {
  const targets = inventory.map(target => ({ type: target.type, id: target.id, collectionId: target.collectionId, updatedAt: target.updatedAt,
    contentFingerprint: fingerprint(target.type === 'product' ? target.values : target.content),
  })).sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
  return { schemaVersion: 'backy.reusable-section-propagation-preview.v1', siteId, sectionId: section.id, sourceFingerprint: fingerprint(section), scope, inventoryFingerprint: fingerprint(targets), targets };
}
export function isReusableSectionReviewedPreview(value: unknown): value is ReusableSectionReviewedPreview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as ReusableSectionReviewedPreview;
  const hash = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
  return v.schemaVersion === 'backy.reusable-section-propagation-preview.v1' && typeof v.siteId === 'string' && typeof v.sectionId === 'string' && hash(v.sourceFingerprint) && hash(v.inventoryFingerprint)
    && !!v.scope && ['page','post','product','all'].includes(v.scope.targetType) && (v.scope.targetId === null || typeof v.scope.targetId === 'string') && typeof v.scope.includeProducts === 'boolean'
    && Array.isArray(v.targets) && v.targets.length <= 100000 && v.targets.every(t => t && ['page','post','product'].includes(t.type) && typeof t.id === 'string' && (t.collectionId === undefined || typeof t.collectionId === 'string') && typeof t.updatedAt === 'string' && hash(t.contentFingerprint));
}
export function sameReusableSectionReviewedPreview(reviewed: ReusableSectionReviewedPreview, current: ReusableSectionReviewedPreview): boolean {
  return serializeTemplateRevisionValue(reviewed) === serializeTemplateRevisionValue(current);
}

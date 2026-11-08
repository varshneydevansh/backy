import type { BackyMediaRepository, BackyCollection } from '@backy-cms/core';
import { canonicalCollectionTemplateDesign } from '@backy-cms/core';
import { collectRepositoryMediaReferenceIds } from './repositoryMediaReferenceSync';
import { collectCompleteExportPages } from './collectionExportPagination';
/** Called inside the same admitted transaction as the collection preimage and update. */
export async function syncCollectionTemplateMediaReferences(media: BackyMediaRepository, collection: BackyCollection) {
 const referenceIds = collectRepositoryMediaReferenceIds({ design: canonicalCollectionTemplateDesign(collection), baseline: collection.metadata?.frontendTemplateInstance });
 const assets = await collectCompleteExportPages(options => media.list({ siteId: collection.siteId, type: 'all', visibility: 'all', ...options }), item => item.siteId === collection.siteId);
 if ([...referenceIds].some(id => !assets.some(asset => asset.id === id))) throw Error('COLLECTION_TEMPLATE_MEDIA_UNAVAILABLE');
 for (const asset of assets) {
  const bindings = Array.isArray(asset.metadata?.bindings) ? asset.metadata.bindings as Record<string, unknown>[] : [];
  const owns = (binding: Record<string, unknown>) => binding.scope === 'collection' && binding.targetId === collection.id;
  const previous = bindings.find(owns), required = referenceIds.has(asset.id);
  if (required === !!previous) continue;
  const next = bindings.filter(binding => !owns(binding));
  if (required) next.push({ id: `binding_${asset.id}_${collection.id}`, scope: 'collection', targetId: collection.id, mediaId: asset.id, usageType: 'collection-definition-design' });
  await media.update(collection.siteId, asset.id, { metadata: { ...asset.metadata, bindings: next as any } });
 }
}

import type { BackyMediaRepository, FormDefinition } from '@backy-cms/core';
import { canonicalFormTemplateDesign } from '@backy-cms/core';
import { collectRepositoryMediaReferenceIds } from './repositoryMediaReferenceSync';
import { collectCompleteExportPages } from './collectionExportPagination';
/** Called inside the same admitted transaction as the form preimage and update. */
export async function syncFormTemplateMediaReferences(media: BackyMediaRepository, form: FormDefinition) {
 const referenceIds = collectRepositoryMediaReferenceIds({ design: canonicalFormTemplateDesign(form), baseline: form.settings?.frontendTemplateInstance });
 const assets = await collectCompleteExportPages(options => media.list({ siteId: form.siteId, type: 'all', visibility: 'all', ...options }), item => item.siteId === form.siteId);
 if ([...referenceIds].some(id => !assets.some(asset => asset.id === id))) throw Error('FORM_TEMPLATE_MEDIA_UNAVAILABLE');
 for (const asset of assets) {
  const bindings = Array.isArray(asset.metadata?.bindings) ? asset.metadata.bindings as Record<string, unknown>[] : [];
  const owns = (binding: Record<string, unknown>) => binding.scope === 'form' && binding.targetId === form.id;
  const previous = bindings.find(owns), required = referenceIds.has(asset.id);
  if (required === !!previous) continue;
  const next = bindings.filter(binding => !owns(binding));
  if (required) next.push({ id: `binding_${asset.id}_${form.id}`, scope: 'form', targetId: form.id, mediaId: asset.id, usageType: 'form-design' });
  await media.update(form.siteId, asset.id, { metadata: { ...asset.metadata, bindings: next as any } });
 }
}

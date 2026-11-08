// Deployment declaration checks only; they do not prove authenticated writes or runtime behavior.
export function currentBuilderContractGaps(handoff, openapi) {
  const gaps = [];
  const motion = handoff?.designState?.motionAuthoring;
  if (motion?.sequenceField !== 'element.animation.sequence' || motion?.maxSteps !== 24 ||
      JSON.stringify(motion?.stateProperties) !== JSON.stringify(['x', 'y', 'scale', 'rotation', 'opacity'])) {
    gaps.push('current bounded animation declaration');
  }
  if (!handoff?.endpoints?.templateInstances?.endsWith('/templates/{templateId}/instances')) gaps.push('template instance handoff');
  if (!handoff?.endpoints?.formDeliveryAttempts?.endsWith('/forms/{formId}/delivery-attempts')) gaps.push('form delivery history handoff');
  if (!handoff?.endpoints?.collectionDesignVersions?.endsWith('/collections/{collectionId}/design-versions')) gaps.push('collection design history handoff');
  if (!handoff?.endpoints?.collectionDesignVersionRestore?.endsWith('/collections/{collectionId}/design-versions/{revisionId}/restore')) gaps.push('collection design recovery handoff');
  const collection = handoff?.templateInstanceUpgrades;
  if (collection?.collectionReviewVersion !== 'template-collection-instances-v1:<sha256>' ||
      collection?.collectionRecovery?.version !== 'collection-v1:<sha256>' ||
      collection?.collectionRecovery?.requiredCanonicalMigration !== '027_collection_design_revisions.sql') gaps.push('collection upgrade and recovery declaration');
  const operations = new Set(Object.values(openapi?.paths ?? {}).flatMap(item =>
    Object.values(item ?? {}).map(operation => operation?.operationId).filter(Boolean)));
  for (const id of ['reviewOrUpgradeAdminTemplateInstances', 'listFormDeliveryAttempts', 'listAdminCollectionDesignVersions', 'restoreAdminCollectionDesignVersion']) {
    if (!operations.has(id)) gaps.push(`OpenAPI operation ${id}`);
  }
  if (!openapi?.components?.schemas?.BackyElementAnimation?.properties?.sequence) gaps.push('OpenAPI animation sequence schema');
  return gaps;
}

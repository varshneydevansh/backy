type ContentRevisionTargetType = 'page' | 'post';

export type ContentRevisionBranchMetadataSource = 'admin-page-revisions-api' | 'admin-blog-revisions-api';

export type ContentRevisionBranchRole = 'trunk' | 'restore-checkpoint' | 'restore-branch';

export interface ContentRevisionBranchMetadata {
  schemaVersion: 'backy.content-revision-branch-metadata.v1';
  source: ContentRevisionBranchMetadataSource;
  targetType: ContentRevisionTargetType;
  position: number;
  total: number;
  order: 'newest-first';
  branchId: string;
  branchLabel: string;
  branchLane: number;
  branchRole: ContentRevisionBranchRole;
  chronologicalParentId: string | null;
  chronologicalChildId: string | null;
  restoreTargetRevisionId: string | null;
  restoreTargetPosition: number | null;
  restoreTargetInWindow: boolean;
  restoreEdgeId: string | null;
  branchPointRevisionId: string | null;
  inference: {
    source: 'revision-note-and-order';
    lineageSource: 'persisted-revision-lineage' | 'revision-note-and-order';
    rollbackNotePattern: string;
    confidence: 'explicit-api-metadata';
    persistedFields: string[];
    limitation: string;
  };
}

type ContentRevisionBranchable = {
  id: string;
  targetType: ContentRevisionTargetType;
  note?: string | null;
  parentRevisionId?: string | null;
  operation?: string | null;
  restoreTargetRevisionId?: string | null;
  metadata?: Record<string, unknown>;
};

type BranchSummary = {
  id: string;
  label: string;
  lane: number;
  nodeIds: string[];
  branchPointRevisionId: string | null;
  restoreTargetRevisionId: string | null;
  restoreTargetPosition: number | null;
};

export const CONTENT_REVISION_BRANCH_METADATA_SCHEMA = 'backy.content-revision-branch-metadata.v1';
export const CONTENT_REVISION_RESTORE_TARGET_PATTERN = /\b(?:rollback|restore)\s+to\s+([a-zA-Z0-9_-]+)/i;

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const revisionMetadata = (revision: Pick<ContentRevisionBranchable, 'metadata'>): Record<string, unknown> => (
  revision.metadata && typeof revision.metadata === 'object' && !Array.isArray(revision.metadata)
    ? revision.metadata
    : {}
);

const getPersistedParentRevisionId = (
  revision: Pick<ContentRevisionBranchable, 'parentRevisionId' | 'metadata'>,
): string | null => (
  stringValue(revision.parentRevisionId) || stringValue(revisionMetadata(revision).parentRevisionId)
);

const getPersistedRestoreTargetRevisionId = (
  revision: Pick<ContentRevisionBranchable, 'restoreTargetRevisionId' | 'metadata'>,
): string | null => (
  stringValue(revision.restoreTargetRevisionId) || stringValue(revisionMetadata(revision).restoreTargetRevisionId)
);

const getRevisionOperation = (
  revision: Pick<ContentRevisionBranchable, 'operation' | 'metadata'>,
): string | null => (
  stringValue(revision.operation) || stringValue(revisionMetadata(revision).operation)
);

const getRestoreTargetRevisionId = (
  revision: Pick<ContentRevisionBranchable, 'note' | 'restoreTargetRevisionId' | 'metadata'>,
): string | null => {
  const persistedTarget = getPersistedRestoreTargetRevisionId(revision);
  if (persistedTarget) return persistedTarget;
  const note = revision.note || '';
  const match = note.match(CONTENT_REVISION_RESTORE_TARGET_PATTERN);
  return match?.[1] || null;
};

const hasPersistedLineage = (revision: ContentRevisionBranchable): boolean => Boolean(
  getPersistedParentRevisionId(revision) ||
  getPersistedRestoreTargetRevisionId(revision) ||
  getRevisionOperation(revision),
);

const getBranchLabel = (branch: BranchSummary | undefined): string => branch?.label || 'Main timeline';

export const withContentRevisionBranchMetadata = <TRevision extends ContentRevisionBranchable>(
  revisions: TRevision[],
  source: ContentRevisionBranchMetadataSource,
): Array<TRevision & { branchMetadata: ContentRevisionBranchMetadata }> => {
  const revisionIds = new Set(revisions.map((revision) => revision.id));
  const positionById = new Map(revisions.map((revision, index) => [revision.id, index + 1]));
  const hasPersistedRevisionLineage = revisions.some(hasPersistedLineage);
  const branchByRevisionId = new Map<string, string>();
  const branches = new Map<string, BranchSummary>();
  const rootBranchId = 'trunk';

  branches.set(rootBranchId, {
    id: rootBranchId,
    label: 'Main timeline',
    lane: 0,
    nodeIds: [],
    branchPointRevisionId: null,
    restoreTargetRevisionId: null,
    restoreTargetPosition: null,
  });

  const chronologicalRevisions = [...revisions].reverse();
  let activeBranchId = rootBranchId;
  let lane = 0;

  chronologicalRevisions.forEach((revision) => {
    const activeBranch = branches.get(activeBranchId) || branches.get(rootBranchId);
    activeBranch?.nodeIds.push(revision.id);
    branchByRevisionId.set(revision.id, activeBranch?.id || rootBranchId);

    const restoreTargetRevisionId = getRestoreTargetRevisionId(revision);
    if (restoreTargetRevisionId && revisionIds.has(restoreTargetRevisionId)) {
      const restoreTargetPosition = positionById.get(restoreTargetRevisionId) || null;
      const restoreBranchId = `restore-${revision.id}`;

      lane += 1;
      branches.set(restoreBranchId, {
        id: restoreBranchId,
        label: `Restore branch from #${restoreTargetPosition || '?'}`,
        lane,
        nodeIds: [],
        branchPointRevisionId: revision.id,
        restoreTargetRevisionId,
        restoreTargetPosition,
      });
      activeBranchId = restoreBranchId;
    }
  });

  const branchById = new Map(branches);

  return revisions.map((revision, index) => {
    const branchId = branchByRevisionId.get(revision.id) || rootBranchId;
    const branch = branchById.get(branchId) || branchById.get(rootBranchId);
    const chronologicalParentId = getPersistedParentRevisionId(revision) || revisions[index + 1]?.id || null;
    const restoreTargetRevisionId = getRestoreTargetRevisionId(revision);
    const restoreTargetInWindow = !!restoreTargetRevisionId && revisionIds.has(restoreTargetRevisionId);
    const restoreTargetPosition = restoreTargetRevisionId ? positionById.get(restoreTargetRevisionId) || null : null;
    const branchRole: ContentRevisionBranchRole = restoreTargetRevisionId
      ? 'restore-checkpoint'
      : branchId === rootBranchId
        ? 'trunk'
        : 'restore-branch';

    return {
      ...revision,
      branchMetadata: {
        schemaVersion: CONTENT_REVISION_BRANCH_METADATA_SCHEMA,
        source,
        targetType: revision.targetType,
        position: index + 1,
        total: revisions.length,
        order: 'newest-first',
        branchId,
        branchLabel: getBranchLabel(branch),
        branchLane: branch?.lane || 0,
        branchRole,
        chronologicalParentId,
        chronologicalChildId: revisions[index - 1]?.id || null,
        restoreTargetRevisionId,
        restoreTargetPosition,
        restoreTargetInWindow,
        restoreEdgeId: restoreTargetInWindow && restoreTargetRevisionId
          ? `rollback-${revision.id}-${restoreTargetRevisionId}`
          : null,
        branchPointRevisionId: branch?.branchPointRevisionId || null,
        inference: {
          source: 'revision-note-and-order',
          lineageSource: hasPersistedRevisionLineage ? 'persisted-revision-lineage' : 'revision-note-and-order',
          rollbackNotePattern: CONTENT_REVISION_RESTORE_TARGET_PATTERN.source,
          confidence: 'explicit-api-metadata',
          persistedFields: hasPersistedRevisionLineage
            ? [
                'id',
                'targetType',
                'targetId',
                'snapshot',
                'note',
                'parentRevisionId',
                'operation',
                'restoreTargetRevisionId',
                'metadata',
                'createdAt',
                'createdBy',
              ]
            : ['id', 'targetType', 'targetId', 'snapshot', 'note', 'createdAt', 'createdBy'],
          limitation: hasPersistedRevisionLineage
            ? 'Branch metadata is normalized from persisted parent revision, operation, and restore target fields, with revision order used only for child links and legacy rows.'
            : 'Branch metadata is normalized by the revisions API from persisted revision order and rollback notes until dedicated parent and operation metadata is present.',
        },
      },
    };
  });
};

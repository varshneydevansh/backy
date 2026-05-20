import type { ContentRevision } from '@/lib/adminContentApi';

type RevisionMetadataInput = Pick<ContentRevision, 'createdBy' | 'note' | 'snapshotStatus' | 'snapshotUpdatedAt'>;

const formatActorToken = (value: string) => value
  .trim()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const getContentRevisionActorLabel = (revision: RevisionMetadataInput) => {
  const actor = revision.createdBy?.trim();
  if (!actor) return 'Unknown actor';
  if (actor.includes('@')) return actor;

  return formatActorToken(actor);
};

export const getContentRevisionActionLabel = (revision: RevisionMetadataInput) => {
  const note = revision.note?.toLowerCase() || '';

  if (note.includes('rollback') || note.includes('restore')) return 'Rollback snapshot';
  if (note.includes('publish')) return 'Publish snapshot';
  if (note.includes('archive')) return 'Archive snapshot';
  if (note.includes('save') || note.includes('editor')) return 'Editor save snapshot';

  return `${formatActorToken(revision.snapshotStatus)} snapshot`;
};

export const getContentRevisionSnapshotUpdatedLabel = (revision: RevisionMetadataInput) => (
  revision.snapshotUpdatedAt ? new Date(revision.snapshotUpdatedAt).toLocaleString() : 'Unknown snapshot update time'
);

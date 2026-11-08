import type { MediaDeletionReference } from '@/lib/mediaApi';

export function MediaDeletionImpact({ references }: { references: MediaDeletionReference[] }) {
  if (!references.length) return null;
  return <div className="mt-3 text-sm" data-testid="media-delete-impact">
    <p className="font-medium text-destructive">Used by {references.length} content reference{references.length === 1 ? '' : 's'}</p>
    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border px-3 py-2 text-xs">
      {references.map((reference) => <li className="break-all" key={JSON.stringify(reference)}>
        {reference.scope === 'page' ? 'Page' : reference.scope === 'post' ? 'Post' : 'Collection record'}: <span className="font-mono">{reference.targetId}</span>
        {reference.collectionId ? <> · collection <span className="font-mono">{reference.collectionId}</span></> : null}
      </li>)}
    </ul>
    <p className="mt-2 text-xs text-muted-foreground">Remove or replace these references before deleting. An override deletes the file without repairing content.</p>
  </div>;
}

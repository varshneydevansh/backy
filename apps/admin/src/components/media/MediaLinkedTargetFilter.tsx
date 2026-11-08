import type { MediaLinkedTarget } from '@/lib/mediaLinkedTargets';

export interface MediaReferenceTargetOption { id: string; title: string }

export function MediaLinkedTargetFilter({ target, pages, posts, loading, error, disabled, onChange }: {
  target: MediaLinkedTarget;
  pages: MediaReferenceTargetOption[];
  posts: MediaReferenceTargetOption[];
  loading: boolean;
  error?: string;
  disabled: boolean;
  onChange: (target: MediaLinkedTarget) => void;
}) {
  const value = target.kind === 'all' || target.kind === 'invalid' ? target.kind : `${target.kind}:${target.id}`;
  const known = target.kind === 'page' ? pages.some(page => page.id === target.id)
    : target.kind === 'post' ? posts.some(post => post.id === target.id) : true;
  return <div className="col-span-2 min-w-0 sm:col-span-1">
    <select
      value={value}
      disabled={disabled}
      aria-label="Filter files linked to a page or blog post"
      aria-describedby="media-linked-target-status"
      className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
      onChange={event => {
        const next = event.target.value;
        if (next === 'all') onChange({ kind: 'all' });
        else if (next.startsWith('page:')) onChange({ kind: 'page', id: next.slice(5) });
        else if (next.startsWith('post:')) onChange({ kind: 'post', id: next.slice(5) });
      }}
    >
      <option value="all">All website files</option>
      {target.kind === 'invalid' && <option value="invalid" disabled>Choose one page or post</option>}
      {!known && target.kind !== 'all' && target.kind !== 'invalid' && <option value={value}>{target.kind === 'page' ? 'Page' : 'Blog post'}: {target.id} (title unavailable)</option>}
      {pages.length > 0 && <optgroup label="Pages">{pages.map(page => <option key={page.id} value={`page:${page.id}`}>{page.title || page.id}</option>)}</optgroup>}
      {posts.length > 0 && <optgroup label="Blog posts">{posts.map(post => <option key={post.id} value={`post:${post.id}`}>{post.title || post.id}</option>)}</optgroup>}
    </select>
    <p id="media-linked-target-status" className="mt-1 text-xs text-muted-foreground" role="status">
      {loading ? 'Loading page and post names…' : error || (target.kind === 'invalid'
        ? 'A file view can filter one page or post at a time.'
        : target.kind === 'all' ? 'Browse files across this website.' : 'Only files linked to the selected page or post.')}
    </p>
  </div>;
}

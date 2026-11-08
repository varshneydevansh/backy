import type { Comment } from './types';

export const BACKY_COMMENT_INVENTORY_LIMIT = 100000;
export class BackyCommentLifecycleError extends Error {
  constructor(public code: 'COMMENT_INVENTORY_INCOMPLETE' | 'COMMENT_TREE_INVALID' | 'COMMENT_PARENT_CONFLICT' | 'COMMENT_LIFECYCLE_UNAVAILABLE' | 'COMMENT_REPORT_CONFLICT' | 'COMMENT_REPORT_UNAVAILABLE' | 'COMMENT_MODERATION_CONFLICT' | 'COMMENT_MODERATION_UNAVAILABLE' | 'COMMENT_IDENTITY_BLOCKED' | 'COMMENT_SUBMISSION_UNAVAILABLE', message: string) {
    super(message); this.name = 'BackyCommentLifecycleError';
  }
}
/** Complete same-site inventory only. Unknown comment attributes remain intact. */
export function collectBackyCommentSubtree(siteId: string, rootId: string, inventory: Comment[]): Comment[] {
  if (inventory.length > BACKY_COMMENT_INVENTORY_LIMIT) throw new BackyCommentLifecycleError('COMMENT_INVENTORY_INCOMPLETE', 'The comment inventory exceeds the supported deletion limit.');
  const byId = new Map<string, Comment>(), children = new Map<string, Comment[]>();
  for (const comment of inventory) {
    if (!comment || comment.siteId !== siteId || !comment.id || byId.has(comment.id)) throw new BackyCommentLifecycleError('COMMENT_INVENTORY_INCOMPLETE', 'The complete scoped comment inventory could not be verified.');
    byId.set(comment.id, comment);
    if (comment.parentId) { const siblings = children.get(comment.parentId) || []; siblings.push(comment); children.set(comment.parentId, siblings); }
  }
  const root = byId.get(rootId); if (!root) return [];
  const result: Comment[] = [], queue = [root], visited = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const comment = queue[index];
    if (visited.has(comment.id) || comment.targetType !== root.targetType || comment.targetId !== root.targetId) throw new BackyCommentLifecycleError('COMMENT_TREE_INVALID', 'The selected comment subtree has an invalid parent or target relationship. Repair the thread before deleting it.');
    visited.add(comment.id); result.push(comment); for (const child of children.get(comment.id) || []) queue.push(child);
  }
  return result;
}
export function assertBackyCommentParent(comment: Pick<Comment, 'id' | 'siteId' | 'targetType' | 'targetId' | 'commentThreadId'>, parent: Comment | null, parentId: string | null | undefined): void {
  if (parentId && (!parent || parent.id === comment.id || parent.siteId !== comment.siteId || parent.targetType !== comment.targetType || parent.targetId !== comment.targetId || (parent.commentThreadId && comment.commentThreadId && parent.commentThreadId !== comment.commentThreadId))) throw new BackyCommentLifecycleError('COMMENT_PARENT_CONFLICT', 'The reply parent no longer exists on this site and target. Reload the thread before retrying.');
}

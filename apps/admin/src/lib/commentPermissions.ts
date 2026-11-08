import type { AdminUserPermissionMatrix } from './adminContentApi';
import { adminPermissionRule } from './adminPermissionUi';

export type CommentPermissionKey = 'comments.view' | 'comments.manage' | 'comments.configure' | 'activity.export';

/** Role defaults cannot stand in for a loaded, current-user, selected-site grant. */
export function isCommentPermissionAllowedForSite(
  matrix: AdminUserPermissionMatrix | null,
  userId: string | undefined,
  siteId: string,
  key: CommentPermissionKey,
  loading: boolean,
): boolean {
  return Boolean(!loading && matrix && userId && matrix.userId === userId && matrix.canSignIn
    && siteId && adminPermissionRule(matrix, key, siteId)?.allowed);
}

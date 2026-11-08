import type { AdminUserPermissionMatrix } from './adminContentApi';
import { adminPermissionRule } from './adminPermissionUi';

export type FormsPermissionKey = 'forms.view' | 'forms.create' | 'forms.edit' | 'forms.manage' | 'forms.export' | 'forms.delete' | 'collections.view' | 'activity.export';

/** Role defaults cannot stand in for a loaded, current-user, selected-site grant. */
export function isFormsPermissionAllowedForSite(
  matrix: AdminUserPermissionMatrix | null,
  userId: string | undefined,
  siteId: string,
  key: FormsPermissionKey,
  loading: boolean,
): boolean {
  return Boolean(!loading && matrix && userId && matrix.userId === userId && matrix.canSignIn
    && siteId && adminPermissionRule(matrix, key, siteId)?.allowed);
}

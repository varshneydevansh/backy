import type { AdminUserPermissionMatrix } from './adminContentApi';
import { adminPermissionRule } from './adminPermissionUi';

/** Creation links require the current user's loaded matrix and current site. */
export function getDashboardCreationPermissions(
  matrix: AdminUserPermissionMatrix | null,
  userId: string | undefined,
  siteId: string,
) {
  const allowed = (key: string, selectedSite?: string) => Boolean(
    matrix && userId && matrix.userId === userId && adminPermissionRule(matrix, key, selectedSite)?.allowed,
  );
  return {
    canCreateSites: allowed('sites.create'),
    canEditPages: allowed('pages.edit', siteId),
    canCreateForms: allowed('forms.create', siteId),
    canEditCommerce: allowed('commerce.edit', siteId),
  };
}

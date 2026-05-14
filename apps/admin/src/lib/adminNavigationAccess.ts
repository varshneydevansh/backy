import { useEffect, useMemo, useState } from 'react';
import { getUserPermissions, type AdminUserPermissionMatrix } from '@/lib/adminContentApi';
import { isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import type { User } from '@/stores/authStore';

export type AdminNavigationArea =
  | 'dashboard'
  | 'sites'
  | 'pages'
  | 'blog'
  | 'media'
  | 'collections'
  | 'sections'
  | 'commerce'
  | 'forms'
  | 'contacts'
  | 'comments'
  | 'teams'
  | 'users'
  | 'settings';

const NAVIGATION_AREA_PERMISSIONS: Record<Exclude<AdminNavigationArea, 'dashboard'>, string> = {
  sites: 'sites.view',
  pages: 'pages.view',
  blog: 'pages.view',
  media: 'media.view',
  collections: 'collections.view',
  sections: 'pages.view',
  commerce: 'commerce.view',
  forms: 'forms.view',
  contacts: 'forms.view',
  comments: 'comments.view',
  teams: 'users.view',
  users: 'users.view',
  settings: 'settings.view',
};

const NAVIGATION_PERMISSION_ROLE_DEFAULTS: Record<string, User['role'][]> = {
  'sites.view': ['owner', 'admin', 'editor'],
  'pages.view': ['owner', 'admin', 'editor'],
  'media.view': ['owner', 'admin', 'editor'],
  'collections.view': ['owner', 'admin', 'editor'],
  'commerce.view': ['owner', 'admin', 'editor'],
  'forms.view': ['owner', 'admin', 'editor'],
  'comments.view': ['owner', 'admin', 'editor'],
  'users.view': ['owner', 'admin'],
  'settings.view': ['owner', 'admin'],
};

export const canAccessAdminNavigationArea = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: Pick<User, 'role'> | null | undefined,
  area: AdminNavigationArea,
) => {
  if (area === 'dashboard') return Boolean(currentAdmin);

  const permission = NAVIGATION_AREA_PERMISSIONS[area];
  return isAdminPermissionAllowed(
    permissionMatrix,
    currentAdmin,
    permission,
    NAVIGATION_PERMISSION_ROLE_DEFAULTS,
  );
};

export function useCurrentAdminPermissionMatrix(currentAdmin: Pick<User, 'id'> | null | undefined) {
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(currentAdmin?.id));

  useEffect(() => {
    let cancelled = false;

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    getUserPermissions(currentAdmin.id)
      .then((matrix) => {
        if (!cancelled) {
          setPermissionMatrix(matrix);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPermissionMatrix(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAdmin?.id]);

  return useMemo(() => ({
    permissionMatrix,
    isLoading,
  }), [isLoading, permissionMatrix]);
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminContentApiError,
  clearUserPermissionsCache,
  getCachedUserPermissions,
  getUserPermissions,
  type AdminUserPermissionMatrix,
} from '@/lib/adminContentApi';
import { isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { useAuthStore, type User } from '@/stores/authStore';

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
  'sites.view': ['owner', 'admin', 'editor', 'viewer'],
  'pages.view': ['owner', 'admin', 'editor', 'viewer'],
  'media.view': ['owner', 'admin', 'editor', 'viewer'],
  'collections.view': ['owner', 'admin', 'editor', 'viewer'],
  'commerce.view': ['owner', 'admin', 'editor', 'viewer'],
  'forms.view': ['owner', 'admin', 'editor', 'viewer'],
  'comments.view': ['owner', 'admin', 'editor', 'viewer'],
  'users.view': ['owner', 'admin'],
  'settings.view': ['owner', 'admin'],
};

const PERMISSION_SYNC_FALLBACK_MESSAGE = 'Detailed admin permissions could not be verified. Role-default navigation remains active.';

const isRecoverableSessionPermissionError = (error: unknown) => (
  error instanceof AdminContentApiError &&
  (error.code === 'UNAUTHORIZED' || error.message.toLowerCase().includes('valid admin session'))
);

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
  const currentAdminId = currentAdmin?.id;
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(() => (
    currentAdminId ? getCachedUserPermissions(currentAdminId) : null
  ));
  const [permissionMatrixUserId, setPermissionMatrixUserId] = useState(() => (
    currentAdminId && getCachedUserPermissions(currentAdminId) ? currentAdminId : ''
  ));
  const [isLoading, setIsLoading] = useState(() => Boolean(currentAdminId && !getCachedUserPermissions(currentAdminId)));
  const [permissionSyncError, setPermissionSyncError] = useState<string | null>(null);
  const [permissionRefreshIndex, setPermissionRefreshIndex] = useState(0);
  const refreshSession = useAuthStore((state) => state.refreshSession);

  const refreshPermissions = useCallback(() => {
    if (currentAdminId) {
      clearUserPermissionsCache(currentAdminId);
    }
    setPermissionRefreshIndex((index) => index + 1);
  }, [currentAdminId]);

  useEffect(() => {
    let cancelled = false;

    if (!currentAdminId) {
      setPermissionMatrix(null);
      setPermissionMatrixUserId('');
      setIsLoading(false);
      setPermissionSyncError(null);
      return () => {
        cancelled = true;
      };
    }

    const cached = getCachedUserPermissions(currentAdminId);
    if (cached) {
      setPermissionMatrix(cached);
      setPermissionMatrixUserId(currentAdminId);
      setIsLoading(false);
      setPermissionSyncError(null);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setPermissionSyncError(null);

    const loadPermissionMatrix = async () => {
      try {
        const matrix = await getUserPermissions(currentAdminId);
        if (!cancelled) {
          setPermissionMatrix(matrix);
          setPermissionMatrixUserId(currentAdminId);
          setPermissionSyncError(null);
        }
      } catch (error) {
        if (cancelled) return;

        if (isRecoverableSessionPermissionError(error)) {
          try {
            await refreshSession();
            const matrix = await getUserPermissions(currentAdminId);
            if (!cancelled) {
              setPermissionMatrix(matrix);
              setPermissionMatrixUserId(currentAdminId);
              setPermissionSyncError(null);
            }
            return;
          } catch {
            if (cancelled) return;
            const currentAuth = useAuthStore.getState();
            setPermissionMatrix(null);
            setPermissionMatrixUserId('');
            if (currentAuth.user && currentAuth.session) {
              setPermissionSyncError(PERMISSION_SYNC_FALLBACK_MESSAGE);
              return;
            }
          }
        }

        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionMatrixUserId('');
          setPermissionSyncError(PERMISSION_SYNC_FALLBACK_MESSAGE);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPermissionMatrix();

    return () => {
      cancelled = true;
    };
  }, [currentAdminId, permissionRefreshIndex, refreshSession]);

  const scopedPermissionMatrix = currentAdminId && permissionMatrixUserId === currentAdminId
    ? permissionMatrix
    : null;

  return useMemo(() => ({
    permissionMatrix: scopedPermissionMatrix,
    isLoading,
    permissionSyncError,
    refreshPermissions,
  }), [isLoading, permissionSyncError, refreshPermissions, scopedPermissionMatrix]);
}

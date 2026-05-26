import type { AdminUserPermissionMatrix } from '@/lib/adminContentApi';
import type { User } from '@/stores/authStore';

export const adminPermissionRule = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  key: string,
) => permissionMatrix?.groups
  .flatMap((group) => group.permissions)
  .find((permission) => permission.key === key) || null;

export const isAdminPermissionAllowed = <PermissionKey extends string>(
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: Pick<User, 'role'> | null | undefined,
  key: PermissionKey,
  roleDefaults: Record<PermissionKey, Array<User['role']>>,
) => {
  const matrixRule = adminPermissionRule(permissionMatrix, key);
  if (matrixRule) return matrixRule.allowed;
  if (!permissionMatrix && currentAdmin) return roleDefaults[key]?.includes(currentAdmin.role) ?? false;

  return false;
};

export const adminPermissionReason = <PermissionKey extends string>(
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: Pick<User, 'role'> | null | undefined,
  key: PermissionKey,
  roleDefaults: Record<PermissionKey, Array<User['role']>>,
) => {
  const matrixRule = adminPermissionRule(permissionMatrix, key);
  if (matrixRule) return matrixRule.reason;
  if (!currentAdmin) return 'Sign in with an admin account to use this capability.';
  if (!permissionMatrix) return 'Permission matrix unavailable. Reload permissions before using this capability.';

  return roleDefaults[key].includes(currentAdmin.role)
    ? `Blocked until backend permissions include ${key}; ${currentAdmin.role} role defaults are not enough.`
    : `Blocked by backend permissions and ${currentAdmin.role} role defaults.`;
};

export const isAdminPermissionDeniedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /\b(permission|forbidden|unauthori[sz]ed|not allowed|cannot access)\b/i.test(message);
};

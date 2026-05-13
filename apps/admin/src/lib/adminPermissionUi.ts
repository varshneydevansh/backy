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

  return Boolean(currentAdmin && roleDefaults[key].includes(currentAdmin.role));
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

  return roleDefaults[key].includes(currentAdmin.role)
    ? `Allowed by ${currentAdmin.role} role defaults.`
    : `Blocked by ${currentAdmin.role} role defaults.`;
};

export const isAdminPermissionDeniedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /\b(permission|forbidden|unauthori[sz]ed|not allowed|cannot access)\b/i.test(message);
};

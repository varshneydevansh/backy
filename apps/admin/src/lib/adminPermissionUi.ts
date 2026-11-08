import type { AdminUserPermissionMatrix } from '@/lib/adminContentApi';
import type { User } from '@/stores/authStore';

export const adminPermissionRule = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  key: string,
  siteId?: string,
) => {
  const rule = permissionMatrix?.groups.flatMap(group => group.permissions).find(permission => permission.key === key) || null;
  if (!rule?.allowed || !permissionMatrix || permissionMatrix.role === 'owner') return rule;
  const siteAccess = permissionMatrix.siteAccess;
  if (!siteAccess) return rule;
  const scope = siteAccess.scope;
  const blocked = siteAccess.status === 'invalid' || siteAccess.status === 'expired' || !scope
    || Boolean(scope.expiresAt && Date.parse(scope.expiresAt) <= Date.now())
    || (scope.mode === 'selected-sites' && !scope.grants.some(grant => (!siteId || grant.siteId === siteId) && grant.permissions.includes(key)));
  return blocked ? { ...rule, allowed: false, reason: 'The current operator site policy does not grant this capability. An owner can change site access.' } : rule;
};

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
  siteId?: string,
) => {
  const matrixRule = adminPermissionRule(permissionMatrix, key, siteId);
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

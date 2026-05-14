export type AdminUserPermissionOverride = {
  userId: string;
  permissionKey: string;
  value: 'allow' | 'deny';
  updatedAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeOverride = (value: unknown): AdminUserPermissionOverride | null => {
  if (!isRecord(value)) return null;

  const userId = typeof value.userId === 'string' ? value.userId.trim() : '';
  const permissionKey = typeof value.permissionKey === 'string' ? value.permissionKey.trim() : '';
  const overrideValue = value.value === 'allow' || value.value === 'deny' ? value.value : null;
  const updatedAt = typeof value.updatedAt === 'string' && value.updatedAt
    ? value.updatedAt
    : new Date().toISOString();

  if (!userId || !permissionKey || !overrideValue) {
    return null;
  }

  return {
    userId,
    permissionKey,
    value: overrideValue,
    updatedAt,
  };
};

export const listAuthSettingsPermissionOverrides = (
  authSettings: unknown,
  userId?: string,
): AdminUserPermissionOverride[] => {
  const settings = isRecord(authSettings) ? authSettings : {};
  const rawOverrides = Array.isArray(settings.userPermissionOverrides)
    ? settings.userPermissionOverrides
    : Array.isArray(settings.permissionOverrides)
      ? settings.permissionOverrides
      : [];
  const normalized = rawOverrides
    .map(normalizeOverride)
    .filter((override): override is AdminUserPermissionOverride => Boolean(override));

  return userId
    ? normalized.filter((override) => override.userId === userId)
    : normalized;
};

export const applyAuthSettingsPermissionOverrides = (
  authSettings: unknown,
  userId: string,
  input: Record<string, 'allow' | 'deny' | null>,
): { auth: BackyJsonObject; overrides: AdminUserPermissionOverride[] } => {
  const currentAuth = isRecord(authSettings) ? authSettings : {};
  const now = new Date().toISOString();
  const nextOverrides = listAuthSettingsPermissionOverrides(currentAuth)
    .filter((override) => override.userId !== userId);

  Object.entries(input).forEach(([permissionKey, value]) => {
    if (!permissionKey || !value) return;

    nextOverrides.push({
      userId,
      permissionKey,
      value,
      updatedAt: now,
    });
  });

  return {
    auth: {
      ...currentAuth,
      userPermissionOverrides: nextOverrides,
    } as BackyJsonObject,
    overrides: nextOverrides.filter((override) => override.userId === userId),
  };
};
import type { BackyJsonObject } from '@backy-cms/core';

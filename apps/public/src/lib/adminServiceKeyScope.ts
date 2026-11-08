import { isAdminPermissionKey, isOwnerOnlyAdminPermission } from '@/lib/adminPermissions';

export interface AdminServiceKeyScope {
  version: 1;
  mode: 'workspace' | 'selected-sites';
  siteIds: string[];
  permissions: string[];
  expiresAt: string | null;
  revision: number;
  legacy?: boolean;
}

export const ADMIN_SITE_SERVICE_PERMISSIONS = [
  'sites.view', 'sites.configure', 'pages.view', 'pages.edit', 'pages.publish', 'pages.delete',
  'collections.view', 'collections.edit', 'collections.export', 'collections.delete',
  'forms.view', 'forms.create', 'forms.edit', 'forms.manage', 'forms.export', 'forms.delete',
  'media.view', 'media.create', 'media.edit', 'media.configure', 'media.delete',
  'commerce.view', 'commerce.edit', 'commerce.configure', 'commerce.delete',
  'comments.view', 'comments.manage', 'comments.configure',
];

export const legacyWorkspaceServiceKeyScope = (): AdminServiceKeyScope => ({
  version: 1, mode: 'workspace', siteIds: [], permissions: [], expiresAt: null, revision: 0, legacy: true,
});

const stringList = (value: unknown, limit: number): string[] | null => (
  Array.isArray(value) && value.length <= limit && value.every(item => typeof item === 'string' && item.trim() === item && item.length > 0 && item.length <= 160)
    ? [...new Set(value as string[])] : null
);

/** Invalid declared policy must never fall back to legacy workspace access. */
export function parseAdminServiceKeyScope(value: unknown): AdminServiceKeyScope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !Number.isInteger(input.revision) || Number(input.revision) < 1) return null;
  if (input.mode !== 'workspace' && input.mode !== 'selected-sites') return null;
  const siteIds = stringList(input.siteIds, 50);
  const permissions = stringList(input.permissions, ADMIN_SITE_SERVICE_PERMISSIONS.length);
  if (!siteIds || !permissions) return null;
  const expiresAt = input.expiresAt === null ? null : typeof input.expiresAt === 'string' && Number.isFinite(Date.parse(input.expiresAt)) ? new Date(input.expiresAt).toISOString() : undefined;
  if (expiresAt === undefined) return null;
  if (input.mode === 'workspace' && (siteIds.length || permissions.length)) return null;
  if (input.mode === 'selected-sites' && (!siteIds.length || !permissions.length || permissions.some(key => !ADMIN_SITE_SERVICE_PERMISSIONS.includes(key) || !isAdminPermissionKey(key) || isOwnerOnlyAdminPermission(key)))) return null;
  return { version: 1, mode: input.mode, siteIds, permissions, expiresAt, revision: Number(input.revision) };
}

export function serviceKeySiteRouteIsClassified(url: string): boolean {
  const path = new URL(url).pathname.split('/').filter(Boolean);
  const apiIndex = path.indexOf('api');
  const index = apiIndex + (path[apiIndex + 1] === 'admin' ? 2 : 1);
  if (apiIndex < 0 || path[index] !== 'sites' || !path[index + 1]) return false;
  const module = path[index + 2];
  if (!module) return path[apiIndex + 1] === 'admin';
  return ['pages', 'blog', 'collections', 'forms', 'media', 'commerce', 'comments', 'events', 'manage',
    'custom-frontend', 'editor', 'frontend-design', 'interactive-components', 'navigation', 'newsletter',
    'readiness', 'redirects', 'reusable-sections', 'seo', 'settings', 'templates', 'visitors', 'backup'].includes(module);
}

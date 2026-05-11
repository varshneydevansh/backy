import type { StoreUser, StoreUserPermissionOverride } from '@/lib/backyStore';

type UserRole = StoreUser['role'];
type UserStatus = StoreUser['status'];

export type AdminPermissionCapability =
  | 'view'
  | 'create'
  | 'edit'
  | 'publish'
  | 'delete'
  | 'manage'
  | 'export'
  | 'configure';

export interface AdminPermissionRule {
  key: string;
  label: string;
  capability: AdminPermissionCapability;
  allowed: boolean;
  source: 'role' | 'status' | 'override';
  override: AdminPermissionOverrideValue | null;
  reason: string;
}

export type AdminPermissionOverrideValue = 'allow' | 'deny';

export interface AdminPermissionGroup {
  key: string;
  label: string;
  description: string;
  permissions: AdminPermissionRule[];
}

export interface AdminUserPermissionMatrix {
  userId: string;
  role: UserRole;
  status: UserStatus;
  canSignIn: boolean;
  summary: {
    allowed: number;
    total: number;
    blockedByStatus: boolean;
  };
  groups: AdminPermissionGroup[];
}

interface PermissionDefinition {
  key: string;
  label: string;
  capability: AdminPermissionCapability;
  roles: UserRole[];
}

interface PermissionGroupDefinition {
  key: string;
  label: string;
  description: string;
  permissions: PermissionDefinition[];
}

const allRoles: UserRole[] = ['owner', 'admin', 'editor', 'viewer'];
const contentRoles: UserRole[] = ['owner', 'admin', 'editor'];
const adminRoles: UserRole[] = ['owner', 'admin'];
const ownerRoles: UserRole[] = ['owner'];

const PERMISSION_GROUPS: PermissionGroupDefinition[] = [
  {
    key: 'workspace',
    label: 'Workspace overview',
    description: 'Dashboard, readiness, activity, and high-level workspace signals.',
    permissions: [
      { key: 'dashboard.view', label: 'View dashboard and readiness', capability: 'view', roles: allRoles },
      { key: 'activity.export', label: 'Export workspace activity', capability: 'export', roles: adminRoles },
    ],
  },
  {
    key: 'sites',
    label: 'Sites and deployment',
    description: 'Multi-site settings, navigation, domains, redirects, and deploy handoff.',
    permissions: [
      { key: 'sites.view', label: 'View sites', capability: 'view', roles: allRoles },
      { key: 'sites.create', label: 'Create sites', capability: 'create', roles: adminRoles },
      { key: 'sites.configure', label: 'Configure site settings', capability: 'configure', roles: adminRoles },
      { key: 'sites.delete', label: 'Delete or archive sites', capability: 'delete', roles: ownerRoles },
    ],
  },
  {
    key: 'content',
    label: 'Pages and publishing',
    description: 'Pages, blog posts, reusable sections, SEO, and public publish controls.',
    permissions: [
      { key: 'pages.view', label: 'View pages and posts', capability: 'view', roles: allRoles },
      { key: 'pages.edit', label: 'Edit page and post content', capability: 'edit', roles: contentRoles },
      { key: 'pages.publish', label: 'Publish or schedule content', capability: 'publish', roles: contentRoles },
      { key: 'pages.delete', label: 'Delete content', capability: 'delete', roles: adminRoles },
    ],
  },
  {
    key: 'data',
    label: 'Collections and forms',
    description: 'Structured CMS collections, form definitions, submissions, contacts, and exports.',
    permissions: [
      { key: 'collections.view', label: 'View collection records and submissions', capability: 'view', roles: allRoles },
      { key: 'collections.edit', label: 'Edit schemas, records, and forms', capability: 'edit', roles: contentRoles },
      { key: 'collections.export', label: 'Export records, contacts, and submissions', capability: 'export', roles: adminRoles },
      { key: 'collections.delete', label: 'Delete schemas or submissions', capability: 'delete', roles: adminRoles },
      { key: 'forms.view', label: 'View forms, submissions, and contacts', capability: 'view', roles: allRoles },
      { key: 'forms.create', label: 'Create forms', capability: 'create', roles: contentRoles },
      { key: 'forms.edit', label: 'Edit forms and delivery settings', capability: 'edit', roles: contentRoles },
      { key: 'forms.manage', label: 'Review submissions and manage form contacts', capability: 'manage', roles: contentRoles },
      { key: 'forms.export', label: 'Export form submissions and contacts', capability: 'export', roles: adminRoles },
      { key: 'forms.delete', label: 'Delete forms', capability: 'delete', roles: adminRoles },
    ],
  },
  {
    key: 'media',
    label: 'Media and files',
    description: 'Images, videos, files, fonts, folders, signed URLs, and transforms.',
    permissions: [
      { key: 'media.view', label: 'View media library', capability: 'view', roles: allRoles },
      { key: 'media.create', label: 'Upload and organize media', capability: 'create', roles: contentRoles },
      { key: 'media.configure', label: 'Configure storage metadata', capability: 'configure', roles: adminRoles },
      { key: 'media.delete', label: 'Delete media assets', capability: 'delete', roles: adminRoles },
    ],
  },
  {
    key: 'commerce',
    label: 'Products and orders',
    description: 'Catalog, inventory, checkout intake, private orders, refunds, and operations.',
    permissions: [
      { key: 'commerce.view', label: 'View products and orders', capability: 'view', roles: allRoles },
      { key: 'commerce.edit', label: 'Edit products and order operations', capability: 'edit', roles: contentRoles },
      { key: 'commerce.configure', label: 'Configure commerce provider handoff', capability: 'configure', roles: adminRoles },
      { key: 'commerce.delete', label: 'Delete products or orders', capability: 'delete', roles: adminRoles },
    ],
  },
  {
    key: 'moderation',
    label: 'Comments and moderation',
    description: 'Comment review, reports, interaction events, spam policy, and moderation queues.',
    permissions: [
      { key: 'comments.view', label: 'View moderation queues', capability: 'view', roles: allRoles },
      { key: 'comments.manage', label: 'Approve, reject, or flag comments', capability: 'manage', roles: contentRoles },
      { key: 'comments.configure', label: 'Configure moderation policy', capability: 'configure', roles: adminRoles },
    ],
  },
  {
    key: 'users',
    label: 'Users and access',
    description: 'Team users, roles, sessions, recovery, lifecycle, and future permission overrides.',
    permissions: [
      { key: 'users.view', label: 'View users', capability: 'view', roles: adminRoles },
      { key: 'users.create', label: 'Invite or create users', capability: 'create', roles: adminRoles },
      { key: 'users.manage', label: 'Change roles, status, sessions, and recovery', capability: 'manage', roles: adminRoles },
      { key: 'users.delete', label: 'Remove users', capability: 'delete', roles: adminRoles },
    ],
  },
  {
    key: 'settings',
    label: 'Settings and integrations',
    description: 'API keys, auth policy, design defaults, Supabase, Vercel, storage, and webhooks.',
    permissions: [
      { key: 'settings.view', label: 'View settings', capability: 'view', roles: adminRoles },
      { key: 'settings.configure', label: 'Configure settings and integrations', capability: 'configure', roles: adminRoles },
      { key: 'settings.manageKeys', label: 'Regenerate API keys', capability: 'manage', roles: ownerRoles },
      { key: 'settings.billing', label: 'Manage billing and ownership', capability: 'manage', roles: ownerRoles },
    ],
  },
];

const canUserSignIn = (status: UserStatus) => status === 'active';

const PERMISSION_KEYS = new Set(PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.key)));

export function isAdminPermissionKey(value: string): boolean {
  return PERMISSION_KEYS.has(value);
}

export function buildUserPermissionMatrix(
  user: Pick<StoreUser, 'id' | 'role' | 'status'>,
  overrides: StoreUserPermissionOverride[] = [],
): AdminUserPermissionMatrix {
  const canSignIn = canUserSignIn(user.status);
  const overrideByKey = new Map(overrides.map((override) => [override.permissionKey, override.value]));
  const groups = PERMISSION_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    description: group.description,
    permissions: group.permissions.map((permission) => {
      const roleAllows = permission.roles.includes(user.role);
      const override = overrideByKey.get(permission.key) || null;
      const allowed = canSignIn && (override ? override === 'allow' : roleAllows);
      const source = !canSignIn
        ? 'status' as const
        : override
          ? 'override' as const
          : 'role' as const;

      return {
        key: permission.key,
        label: permission.label,
        capability: permission.capability,
        allowed,
        source,
        override,
        reason: !canSignIn
          ? `${user.status} accounts cannot use admin permissions until activated.`
          : override === 'allow'
            ? 'Explicit override allows this capability.'
            : override === 'deny'
              ? 'Explicit override denies this capability.'
              : roleAllows
                ? `${user.role} role includes this capability.`
                : `${user.role} role does not include this capability.`,
      };
    }),
  }));
  const permissions = groups.flatMap((group) => group.permissions);
  const allowed = permissions.filter((permission) => permission.allowed).length;

  return {
    userId: user.id,
    role: user.role,
    status: user.status,
    canSignIn,
    summary: {
      allowed,
      total: permissions.length,
      blockedByStatus: !canSignIn,
    },
    groups,
  };
}

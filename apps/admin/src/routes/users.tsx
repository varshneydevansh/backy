/**
 * BACKY CMS - USERS PAGE
 *
 * Team access control for owners, admins, editors, and viewers.
 */

import { createFileRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  Code2,
  Copy,
  Download,
  Edit,
  Filter,
  History,
  KeyRound,
  LockKeyhole,
  Mail,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
  Trash2,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataGrid } from '@/components/ui/DataGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { cn } from '@/lib/utils';
import {
  bulkUpdateUsers,
  deleteUser as deleteBackendUser,
  getUserPermissions,
  importUsersCsv,
  listAdminAuditLogs,
  listUsers,
  rollbackUsersImport,
  updateUser as updateBackendUser,
  type AdminAuditLog,
  type AdminUserPermissionMatrix,
  type UserImportResult,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed, isAdminPermissionDeniedError } from '@/lib/adminPermissionUi';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { useStore, type User as UserType } from '@/stores/mockStore';

interface UsersSearch {
  siteId?: string;
  notice?: string;
}

const normalizedUsersSearchString = (value: unknown) => (
  typeof value === 'string' && value.trim() ? value : undefined
);

export const Route = createFileRoute('/users')({
  validateSearch: (search: Record<string, unknown>): UsersSearch => ({
    siteId: normalizedUsersSearchString(search.siteId),
    notice: normalizedUsersSearchString(search.notice),
  }),
  component: UsersLayout,
});

type UserRole = UserType['role'];
type UserStatus = UserType['status'];
type UserPermissionKey = 'users.view' | 'users.create' | 'users.manage' | 'users.delete' | 'activity.export';
type UserReviewFilter =
  | 'all'
  | 'admin-authority'
  | 'content-operators'
  | 'pending-invites'
  | 'suspended'
  | 'incomplete-profile'
  | 'never-active';

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; detail: string }> = [
  { value: 'owner', label: 'Owner', detail: 'Billing, settings, publishing, and team authority' },
  { value: 'admin', label: 'Admin', detail: 'Manage sites, content, media, forms, users, and commerce' },
  { value: 'editor', label: 'Editor', detail: 'Create and update pages, blog posts, forms, and media' },
  { value: 'viewer', label: 'Viewer', detail: 'Read-only access for review and reporting' },
];

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

const ROLE_CAPABILITIES: Array<{ label: string; roles: UserRole[] }> = [
  { label: 'View dashboards, sites, content, and reports', roles: ['owner', 'admin', 'editor', 'viewer'] },
  { label: 'Create and edit pages, blog posts, forms, and media', roles: ['owner', 'admin', 'editor'] },
  { label: 'Publish content and update commerce records', roles: ['owner', 'admin', 'editor'] },
  { label: 'Manage users, settings, integrations, and API keys', roles: ['owner', 'admin'] },
  { label: 'Own billing, destructive settings, and workspace transfer', roles: ['owner'] },
];

const ROLE_ACCESS_SUMMARY: Record<UserRole, string> = {
  owner: 'Full workspace authority',
  admin: 'Operational admin authority',
  editor: 'Content and commerce production',
  viewer: 'Read-only review access',
};

const USER_PERMISSION_ROLE_DEFAULTS: Record<UserPermissionKey, Array<AuthUser['role']>> = {
  'users.view': ['owner', 'admin'],
  'users.create': ['owner', 'admin'],
  'users.manage': ['owner', 'admin'],
  'users.delete': ['owner', 'admin'],
  'activity.export': ['owner', 'admin'],
};

const getInitials = (name: string) => (
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'
);

const roleLabel = (role: UserRole) => ROLE_OPTIONS.find((option) => option.value === role)?.label || role;

const roleBadgeClass: Record<UserRole, string> = {
  owner: 'border-amber-200 bg-amber-50 text-amber-800',
  admin: 'border-sky-200 bg-sky-50 text-sky-800',
  editor: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  viewer: 'border-slate-200 bg-slate-50 text-slate-700',
};

const USER_CONTROL_AREAS = [
  {
    title: 'Access health',
    detail: 'Review active admins, pending invites, suspended users, and role integrity.',
    href: '#users-metrics',
  },
  {
    title: 'User API',
    detail: 'List, invite, update, remove, copy endpoints, and export visible users.',
    href: '#users-api',
  },
  {
    title: 'Directory controls',
    detail: 'Search, filter, refresh, and page through the account directory.',
    href: '#users-directory-controls',
  },
  {
    title: 'People directory',
    detail: 'Edit role/status, open user detail, and remove access from one table.',
    href: '#users-directory',
  },
  {
    title: 'Role permissions',
    detail: 'Compare owner, admin, editor, and viewer capabilities before handoff.',
    href: '#users-permissions',
  },
  {
    title: 'Access activity',
    detail: 'Review recent user create, update, and remove events from admin audit logs.',
    href: '#users-activity',
  },
  {
    title: 'Membership handoff',
    detail: 'Public registration forms, member flows, and Supabase auth integration status.',
    href: '#users-membership',
  },
] as const;

const MEMBERSHIP_FLOW_SYSTEMS = [
  {
    key: 'registration-form',
    title: 'Registration forms',
    status: 'available',
    detail: 'Public page templates can seed registration forms that submit through Backy Forms.',
  },
  {
    key: 'contacts',
    title: 'Lead/member contact records',
    status: 'available',
    detail: 'Form contact sharing stores registrant identity data for review and export.',
  },
  {
    key: 'collections',
    title: 'Member profile collection',
    status: 'available',
    detail: 'Registration forms can write approved profile data into public-create collections.',
  },
  {
    key: 'supabase-auth',
    title: 'Supabase Auth adapter',
    status: 'next',
    detail: 'Credentials, sessions, password reset, and protected routes remain an integration pass.',
  },
  {
    key: 'member-portal',
    title: 'Member portal APIs',
    status: 'next',
    detail: 'Self-service profile, order history, downloads, and account deletion are not complete yet.',
  },
] as const;

const MEMBERSHIP_HANDOFF_STEPS = [
  {
    step: '1',
    title: 'Create registration page',
    detail: 'Seed a public page with the registration template and Backy form block.',
    status: 'available',
    to: '/pages/new',
    label: 'Start page',
  },
  {
    step: '2',
    title: 'Review form contract',
    detail: 'Confirm definition, submit URL, sample payload, contact sharing, and spam guard in Forms.',
    status: 'available',
    to: '/forms',
    label: 'Open forms',
  },
  {
    step: '3',
    title: 'Route registrants',
    detail: 'Use Contacts for lead/member review or Collections for structured profile records.',
    status: 'available',
    to: '/contacts',
    label: 'Open contacts',
  },
  {
    step: '4',
    title: 'Connect auth provider',
    detail: 'Use Settings to track Supabase/Auth infrastructure before credentialed member sessions.',
    status: 'next',
    to: '/settings',
    label: 'Open settings',
  },
  {
    step: '5',
    title: 'Expose member portal',
    detail: 'Protected account pages, profile updates, downloads, order history, and account deletion remain future work.',
    status: 'next',
    to: '/settings',
    label: 'Track gap',
  },
] as const;

const MEMBERSHIP_AUTH_BOUNDARIES = [
  {
    key: 'public-registration',
    title: 'Public registration capture',
    status: 'available',
    detail: 'Registration pages can submit form data into Backy Forms, Contacts, and optional profile collections.',
  },
  {
    key: 'workspace-users',
    title: 'Private workspace users',
    status: 'available',
    detail: 'Backy admin users remain private operators with role, status, permission, session, and audit controls.',
  },
  {
    key: 'credentialed-login',
    title: 'Credentialed member login',
    status: 'next',
    detail: 'Public member signup, login, password reset, email verification, and protected routes still need the Supabase/Auth provider pass.',
  },
  {
    key: 'member-portal',
    title: 'Self-service member portal',
    status: 'next',
    detail: 'Profile editing, order history, downloads, subscriptions, and account deletion are not yet public member APIs.',
  },
] as const;

function UsersLayout() {
  const routerState = useRouterState();
  const isExactUsersRoute = routerState.location.pathname === '/users';

  if (isExactUsersRoute) {
    return <UsersListView />;
  }

  return <Outlet />;
}

function UsersListView() {
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const currentAdmin = useAuthStore((state) => state.user);
  const { sites, users, setUsers } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [reviewFilter, setReviewFilter] = useState<UserReviewFilter>('all');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserType | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<UserStatus>('inactive');
  const [isBulkActionBusy, setIsBulkActionBusy] = useState(false);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const routeNoticeRef = useRef('');
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<'create' | 'upsert'>('create');
  const [isImportingUsers, setIsImportingUsers] = useState(false);
  const [isPreviewingImport, setIsPreviewingImport] = useState(false);
  const [isRollingBackImport, setIsRollingBackImport] = useState(false);
  const [importResult, setImportResult] = useState<UserImportResult | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [userAuditLogs, setUserAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isLoadingUserAudit, setIsLoadingUserAudit] = useState(false);
  const [userAuditError, setUserAuditError] = useState<string | null>(null);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewUsers = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.view', USER_PERMISSION_ROLE_DEFAULTS);
  const canCreateUsers = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.create', USER_PERMISSION_ROLE_DEFAULTS);
  const canManageUsers = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.manage', USER_PERMISSION_ROLE_DEFAULTS);
  const canDeleteUsers = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.delete', USER_PERMISSION_ROLE_DEFAULTS);
  const canExportActivity = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'activity.export', USER_PERMISSION_ROLE_DEFAULTS);
  const viewPermissionTitle = canViewUsers ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.view', USER_PERMISSION_ROLE_DEFAULTS);
  const createPermissionTitle = canCreateUsers ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.create', USER_PERMISSION_ROLE_DEFAULTS);
  const managePermissionTitle = canManageUsers ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.manage', USER_PERMISSION_ROLE_DEFAULTS);
  const deletePermissionTitle = canDeleteUsers ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.delete', USER_PERMISSION_ROLE_DEFAULTS);
  const activityPermissionTitle = canExportActivity ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'activity.export', USER_PERMISSION_ROLE_DEFAULTS);
  const isUserMutationBusy = updatingUserId !== null || isBulkActionBusy || isImportingUsers || isPreviewingImport || isRollingBackImport;
  const isUsersBusy = isLoading || isUserMutationBusy || isPermissionMatrixPending;
  const routeNotice = routeSearch.notice || '';
  const adminBaseUrl = useMemo(() => getAdminBaseUrl(), []);
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const selectedMembershipSiteId = useMemo(() => getSiteSelectionFromSearch(sites), [sites]);
  const membershipSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedMembershipSiteId)) || sites[0],
    [selectedMembershipSiteId, sites],
  );
  const membershipSiteId = membershipSite?.publicSiteId || membershipSite?.id || selectedMembershipSiteId || 'site-demo';
  const encodedMembershipSiteId = encodeURIComponent(membershipSiteId);
  const usersListUrl = `${adminBaseUrl}/users`;
  const userDetailUrl = `${adminBaseUrl}/users/{userId}`;
  const publicFormsUrl = `${publicBaseUrl}/api/sites/${encodedMembershipSiteId}/forms`;
  const publicRegistrationDefinitionUrl = `${publicBaseUrl}/api/sites/${encodedMembershipSiteId}/forms/{registrationFormId}/definition`;
  const publicRegistrationSubmitUrl = `${publicBaseUrl}/api/sites/${encodedMembershipSiteId}/forms/{registrationFormId}/submissions`;
  const publicContactsUrl = `${adminBaseUrl}/sites/${encodedMembershipSiteId}/forms/{registrationFormId}/contacts`;
  const isCurrentUser = useCallback((user: UserType) => (
    Boolean(currentAdmin && (
      user.id === currentAdmin.id ||
      user.email.trim().toLowerCase() === currentAdmin.email.trim().toLowerCase()
    ))
  ), [currentAdmin]);

  useEffect(() => {
    if (!routeNotice) return;
    routeNoticeRef.current = routeNotice;
    setNotice(routeNotice);
    navigate({
      to: '/users',
      search: routeSearch.siteId ? { siteId: routeSearch.siteId } : undefined,
      replace: true,
    });
  }, [navigate, routeNotice, routeSearch.siteId]);

  useEffect(() => {
    let cancelled = false;
    setPermissionError(null);

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setIsPermissionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPermissionsLoading(true);
    getUserPermissions(currentAdmin.id)
      .then((matrix) => {
        if (!cancelled) {
          setPermissionMatrix(matrix);
          setPermissionError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(error instanceof Error ? error.message : 'Unable to load user permissions.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPermissionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAdmin?.id]);

  const loadUsers = useCallback(async () => {
    if (isPermissionMatrixPending) return;
    if (!canViewUsers) {
      setUsers([]);
      setNotice(viewPermissionTitle || 'Your account cannot view users.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const backendUsers = await listUsers();
      setUsers(backendUsers);
      const pendingRouteNotice = routeNoticeRef.current;
      routeNoticeRef.current = '';
      setNotice((currentNotice) => (pendingRouteNotice ? currentNotice || pendingRouteNotice : null));
    } catch (error) {
      if (isAdminPermissionDeniedError(error)) {
        setUsers([]);
        setNotice(error instanceof Error ? error.message : viewPermissionTitle || 'Your account cannot view users.');
        return;
      }

      setNotice('Using local fallback users because the backend users API is unavailable.');
    } finally {
      setIsLoading(false);
    }
  }, [canViewUsers, isPermissionMatrixPending, setUsers, viewPermissionTitle]);

  const loadUserAuditLogs = useCallback(async () => {
    if (isPermissionMatrixPending) return;
    if (!canExportActivity) {
      setUserAuditLogs([]);
      setUserAuditError(null);
      return;
    }

    setIsLoadingUserAudit(true);
    setUserAuditError(null);
    try {
      const result = await listAdminAuditLogs({ entity: 'user', limit: 12 });
      setUserAuditLogs(result.logs);
    } catch (error) {
      setUserAuditError(error instanceof Error ? error.message : 'Unable to load user activity.');
    } finally {
      setIsLoadingUserAudit(false);
    }
  }, [canExportActivity, isPermissionMatrixPending]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadUserAuditLogs();
  }, [loadUserAuditLogs]);

  const metrics = useMemo(() => {
    const active = users.filter((user) => user.status === 'active').length;
    const invited = users.filter((user) => user.status === 'invited').length;
    const admins = users.filter((user) => user.role === 'owner' || user.role === 'admin').length;
    const suspended = users.filter((user) => user.status === 'suspended').length;

    return [
      { label: 'Total people', value: users.length, detail: 'Accounts with Backy access', icon: Users },
      { label: 'Active seats', value: active, detail: `${invited} invite${invited === 1 ? '' : 's'} pending`, icon: CheckCircle2 },
      { label: 'Admin authority', value: admins, detail: 'Owners and admins', icon: Shield },
      { label: 'Needs review', value: suspended, detail: 'Suspended accounts', icon: AlertTriangle },
    ];
  }, [users]);
  const accessReadiness = useMemo(() => {
    const activeAdmins = users.filter((user) => (
      user.status === 'active' && (user.role === 'owner' || user.role === 'admin')
    )).length;
    const invited = users.filter((user) => user.status === 'invited').length;
    const suspended = users.filter((user) => user.status === 'suspended').length;
    const knownRoles = new Set(ROLE_OPTIONS.map((role) => role.value));
    const unknownRoleCount = users.filter((user) => !knownRoles.has(user.role)).length;
    const checks = [
      {
        label: 'Admin continuity',
        detail: activeAdmins > 0
          ? `${activeAdmins} active owner/admin account${activeAdmins === 1 ? '' : 's'}`
          : 'Add at least one active owner or admin before handoff.',
        ready: activeAdmins > 0,
      },
      {
        label: 'Role model',
        detail: unknownRoleCount === 0
          ? 'Every account maps to a supported Backy role.'
          : `${unknownRoleCount} account${unknownRoleCount === 1 ? '' : 's'} use unknown roles.`,
        ready: unknownRoleCount === 0,
      },
      {
        label: 'Invite queue',
        detail: invited > 0
          ? `${invited} pending invite${invited === 1 ? '' : 's'} need activation or resend.`
          : 'No pending invites.',
        ready: invited === 0,
      },
      {
        label: 'Access review',
        detail: suspended > 0
          ? `${suspended} suspended account${suspended === 1 ? '' : 's'} require review.`
          : 'No suspended users.',
        ready: suspended === 0,
      },
      {
        label: 'Email delivery',
        detail: 'User records persist now; invite email delivery still belongs to the auth/integrations pass.',
        ready: false,
      },
      {
        label: 'Public registration',
        detail: 'Registration can be captured through Backy Forms; credentialed member auth is not wired yet.',
        ready: true,
      },
      {
        label: 'Self-protection',
        detail: currentAdmin
          ? 'The signed-in admin cannot demote, suspend, or remove their own account from this table.'
          : 'Sign in to show self-protection controls for the current admin.',
        ready: Boolean(currentAdmin),
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Invite', detail: 'Create a persisted user record with role and invited status.' },
        { label: 'Activate', detail: 'Move the account to active after credentials are ready.' },
        { label: 'Govern', detail: 'Use role and status changes to control admin access.' },
        { label: 'Protect', detail: 'Backend guards prevent removing the final active owner/admin.' },
      ],
    };
  }, [currentAdmin, users]);

  const filteredUsers = useMemo(() => (
    users.filter((user) => {
      const roleMatches = roleFilter === 'all' || user.role === roleFilter;
      const statusMatches = statusFilter === 'all' || user.status === statusFilter;
      const hasProfile = Boolean(user.fullName.trim()) && Boolean(user.email.trim());
      const neverActive = isNeverActiveUser(user);
      const reviewMatches = (
        reviewFilter === 'all' ||
        (reviewFilter === 'admin-authority' && (user.role === 'owner' || user.role === 'admin')) ||
        (reviewFilter === 'content-operators' && (user.role === 'owner' || user.role === 'admin' || user.role === 'editor')) ||
        (reviewFilter === 'pending-invites' && user.status === 'invited') ||
        (reviewFilter === 'suspended' && user.status === 'suspended') ||
        (reviewFilter === 'incomplete-profile' && !hasProfile) ||
        (reviewFilter === 'never-active' && neverActive)
      );

      return roleMatches && statusMatches && reviewMatches;
    })
  ), [reviewFilter, roleFilter, statusFilter, users]);
  const selectedUsers = useMemo(() => (
    users.filter((user) => selectedUserIds.includes(user.id))
  ), [selectedUserIds, users]);
  const selectedActionableUsers = useMemo(() => (
    selectedUsers.filter((user) => !isCurrentUser(user))
  ), [isCurrentUser, selectedUsers]);

  const toggleUserSelection = (user: UserType, checked: boolean) => {
    if (isUsersBusy || isCurrentUser(user) || (!canManageUsers && !canDeleteUsers)) return;

    setSelectedUserIds((current) => {
      if (checked) {
        return current.includes(user.id) ? current : [...current, user.id];
      }

      return current.filter((id) => id !== user.id);
    });
  };

  const handlePatchUser = async (user: UserType, updates: Partial<Pick<UserType, 'role' | 'status'>>) => {
    if (isUsersBusy) return;
    if (!canManageUsers) {
      setNotice(managePermissionTitle || 'Your account cannot change users.');
      return;
    }

    if (isCurrentUser(user) && (updates.role || updates.status)) {
      setNotice('Use another owner/admin account to change your own role or account status.');
      return;
    }

    setUpdatingUserId(user.id);
    setNotice(null);

    try {
      const saved = await updateBackendUser(user.id, updates);
      setUsers(users.map((item) => (item.id === user.id ? saved : item)));
      setNotice(`${saved.fullName} was updated.`);
      void loadUserAuditLogs();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Backend update failed. The user was not changed.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!pendingDelete || isUserMutationBusy) return;
    if (!canDeleteUsers) {
      setNotice(deletePermissionTitle || 'Your account cannot remove users.');
      setPendingDelete(null);
      return;
    }

    if (isCurrentUser(pendingDelete)) {
      setNotice('Use another owner/admin account to remove your own access.');
      setPendingDelete(null);
      return;
    }

    setUpdatingUserId(pendingDelete.id);
    setNotice(null);

    try {
      await deleteBackendUser(pendingDelete.id);
      setUsers(users.filter((user) => user.id !== pendingDelete.id));
      setPendingDelete(null);
      void loadUserAuditLogs();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Backend delete failed. The user was not removed.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleBulkStatusUpdate = async () => {
    if (isUsersBusy) return;
    if (!canManageUsers) {
      setNotice(managePermissionTitle || 'Your account cannot change users.');
      return;
    }

    const userIds = selectedActionableUsers.map((user) => user.id);
    if (userIds.length === 0) {
      setNotice('Select at least one non-current user before running a bulk action.');
      return;
    }

    setIsBulkActionBusy(true);
    setNotice(null);

    try {
      const result = await bulkUpdateUsers({ action: 'updateStatus', userIds, status: bulkStatus });
      const updatedById = new Map(result.users.map((user) => [user.id, user]));
      setUsers(users.map((user) => updatedById.get(user.id) || user));
      setSelectedUserIds([]);
      setNotice(`${result.updated} user${result.updated === 1 ? '' : 's'} moved to ${bulkStatus}.`);
      void loadUserAuditLogs();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Bulk status update failed.');
    } finally {
      setIsBulkActionBusy(false);
    }
  };

  const handleBulkDeleteUsers = async () => {
    if (isUsersBusy) return;
    if (!canDeleteUsers) {
      setNotice(deletePermissionTitle || 'Your account cannot remove users.');
      setPendingBulkDelete(false);
      return;
    }

    const userIds = selectedActionableUsers.map((user) => user.id);
    if (userIds.length === 0) {
      setNotice('Select at least one non-current user before running a bulk action.');
      setPendingBulkDelete(false);
      return;
    }

    setIsBulkActionBusy(true);
    setNotice(null);

    try {
      const result = await bulkUpdateUsers({ action: 'delete', userIds });
      const deletedIds = new Set(result.userIds);
      setUsers(users.filter((user) => !deletedIds.has(user.id)));
      setSelectedUserIds([]);
      setPendingBulkDelete(false);
      setNotice(`${result.deleted} user${result.deleted === 1 ? '' : 's'} removed.`);
      void loadUserAuditLogs();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Bulk delete failed.');
    } finally {
      setIsBulkActionBusy(false);
    }
  };

  useEffect(() => {
    if (!pendingDelete && !pendingBulkDelete) return;

    const handleDeleteDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isUserMutationBusy) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setPendingDelete(null);
      setPendingBulkDelete(false);
    };

    document.addEventListener('keydown', handleDeleteDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handleDeleteDialogKeyDown, true);
  }, [isUserMutationBusy, pendingBulkDelete, pendingDelete]);

  const copyUserApiText = async (value: string, label: string) => {
    if (isUsersBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  const handleExportUsers = () => {
    if (data.length === 0 || isUsersBusy) return;
    if (!canViewUsers) {
      setNotice(viewPermissionTitle || 'Your account cannot export users.');
      return;
    }

    const header = [
      'user_id',
      'full_name',
      'email',
      'role',
      'status',
      'last_active',
    ];
    const rows = data.map((user) => [
      user.id,
      user.fullName,
      user.email,
      user.role,
      user.status,
      user.lastActive,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backy-users.csv';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const downloadUserImportTemplate = () => {
    if (isUsersBusy) return;
    if (!canCreateUsers) {
      setNotice(createPermissionTitle || 'Your account cannot import users.');
      return;
    }

    const csv = [
      ['full_name', 'email', 'role', 'status'].join(','),
      ['Example Editor', 'editor@example.com', 'editor', 'invited'].join(','),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backy-users-import-template.csv';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const openImportFile = (dryRun: boolean) => {
    if (isUsersBusy || !importInputRef.current) return;
    if (!canCreateUsers || (importMode === 'upsert' && !canManageUsers)) {
      setNotice(importMode === 'upsert'
        ? managePermissionTitle || 'Updating existing users from CSV requires user management access.'
        : createPermissionTitle || 'Your account cannot import users.');
      return;
    }

    importInputRef.current.dataset.importDryRun = dryRun ? 'true' : 'false';
    importInputRef.current.click();
  };

  const handleImportUsers = async (file: File | null | undefined, dryRun: boolean) => {
    if (!file || isUsersBusy) return;
    if (!canCreateUsers || (importMode === 'upsert' && !canManageUsers)) {
      setNotice(importMode === 'upsert'
        ? managePermissionTitle || 'Updating existing users from CSV requires user management access.'
        : createPermissionTitle || 'Your account cannot import users.');
      return;
    }

    if (dryRun) {
      setIsPreviewingImport(true);
    } else {
      setIsImportingUsers(true);
    }
    setImportResult(null);
    setNotice(null);

    try {
      const csv = await file.text();
      const result = await importUsersCsv(csv, { mode: importMode, dryRun });
      if (!dryRun) {
        await loadUsers();
        await loadUserAuditLogs();
      }
      setImportResult(result);
      setNotice(`${dryRun ? 'Previewed' : 'Imported'} ${result.created} user${result.created === 1 ? '' : 's'}; updated ${result.updated}; skipped ${result.skipped}; ${result.errors.length} row issue${result.errors.length === 1 ? '' : 's'}.`);
    } catch (error) {
      const details = error && typeof error === 'object' && 'details' in error
        ? (error as { details?: unknown }).details
        : null;
      const errors = Array.isArray(details)
        ? details.filter((item): item is UserImportResult['errors'][number] => (
            Boolean(item) && typeof item === 'object' && 'row' in item && 'message' in item
          ))
        : [];
      if (errors.length > 0) {
        setImportResult({ mode: importMode, dryRun, created: 0, updated: 0, skipped: 0, errors });
      }
      setNotice(error instanceof Error ? error.message : 'Unable to import users from CSV.');
    } finally {
      setIsImportingUsers(false);
      setIsPreviewingImport(false);
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  };

  const handleRollbackImport = async () => {
    if (isUsersBusy || !importResult?.rollbackAvailable) return;
    if (!canManageUsers || !canDeleteUsers) {
      setNotice(!canManageUsers
        ? managePermissionTitle || 'Rolling back imports requires user management access.'
        : deletePermissionTitle || 'Rolling back imports requires user delete access.');
      return;
    }
    const confirmed = window.confirm('Roll back the last user import batch? Created users from that batch will be deleted and updated users will be restored.');
    if (!confirmed) return;

    setIsRollingBackImport(true);
    setNotice(null);
    try {
      const rollback = await rollbackUsersImport(importResult.rollbackRequestId);
      await loadUsers();
      await loadUserAuditLogs();
      setNotice(`Rolled back import: ${rollback.deleted} created user${rollback.deleted === 1 ? '' : 's'} deleted, ${rollback.restored} update${rollback.restored === 1 ? '' : 's'} restored, ${rollback.skipped.length} skipped.`);
      setImportResult(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to roll back users import.');
    } finally {
      setIsRollingBackImport(false);
    }
  };

  const columns: Column<UserType>[] = [
    {
      key: 'id',
      label: 'Select',
      render: (user) => {
        const locked = isCurrentUser(user);

        return (
          <input
            type="checkbox"
            checked={selectedUserIds.includes(user.id)}
            disabled={isUsersBusy || locked}
            onChange={(event) => toggleUserSelection(user, event.target.checked)}
            aria-label={locked ? `Self selection locked for ${user.fullName}` : `Select ${user.fullName}`}
            data-testid={`select-user-${user.id}`}
            className="size-4 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        );
      },
    },
    {
      key: 'fullName',
      label: 'Person',
      sortable: true,
      render: (user) => (
        <button
          type="button"
          onClick={() => {
            if (!isUsersBusy) {
              void navigate({ to: '/users/$userId', params: { userId: user.id } });
            }
          }}
          disabled={isUsersBusy}
          className="group flex min-w-[240px] items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white shadow-sm">
            {getInitials(user.fullName)}
            <span className={cn(
              'absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-card',
              user.status === 'active' ? 'bg-emerald-500' : user.status === 'invited' ? 'bg-amber-400' : 'bg-slate-300',
            )} />
          </span>
          <span>
            <span className="flex flex-wrap items-center gap-2 font-semibold text-foreground group-hover:text-primary">
              {user.fullName}
              {isCurrentUser(user) && (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  You
                </span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              {user.email}
            </span>
          </span>
        </button>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (user) => (
        <div className="space-y-2">
          {isCurrentUser(user) && (
            <div className="text-[11px] font-medium text-muted-foreground">Self role locked</div>
          )}
          <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-semibold', roleBadgeClass[user.role])}>
            {roleLabel(user.role)}
          </span>
          <select
            value={user.role}
            disabled={isUsersBusy || isCurrentUser(user) || !canManageUsers}
            title={!canManageUsers ? managePermissionTitle : undefined}
            onChange={(event) => void handlePatchUser(user, { role: event.target.value as UserRole })}
            className="block w-36 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none transition focus:ring-2 focus:ring-ring disabled:opacity-50"
            aria-label={`Change role for ${user.fullName}`}
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>{role.label}</option>
            ))}
          </select>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (user) => (
        <div className="space-y-2">
          {isCurrentUser(user) && (
            <div className="text-[11px] font-medium text-muted-foreground">Self status locked</div>
          )}
          <StatusBadge status={user.status} />
          <select
            value={user.status}
            disabled={isUsersBusy || isCurrentUser(user) || !canManageUsers}
            title={!canManageUsers ? managePermissionTitle : undefined}
            onChange={(event) => void handlePatchUser(user, { status: event.target.value as UserStatus })}
            className="block w-36 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none transition focus:ring-2 focus:ring-ring disabled:opacity-50"
            aria-label={`Change status for ${user.fullName}`}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>
      ),
    },
    {
      key: 'lastActive',
      label: 'Activity',
      sortable: true,
      render: (user) => (
        <span className="text-sm text-muted-foreground">{user.lastActive}</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (user) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (!isUsersBusy) {
                void navigate({ to: '/users/$userId', params: { userId: user.id } });
              }
            }}
            disabled={isUsersBusy}
            className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Edit ${user.fullName}`}
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isUsersBusy && !isCurrentUser(user) && canDeleteUsers) {
                setPendingDelete(user);
              }
            }}
            disabled={isUsersBusy || isCurrentUser(user) || !canDeleteUsers}
            title={!canDeleteUsers ? deletePermissionTitle : undefined}
            className="rounded-lg border border-red-200 p-2 text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={isCurrentUser(user) ? `Self removal locked for ${user.fullName}` : `Remove ${user.fullName}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const {
    data,
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    currentPage,
    setCurrentPage,
    totalPages,
    totalItems,
  } = useDataTable({
    data: filteredUsers,
    columns,
    initialSort: { key: 'fullName', direction: 'asc' },
    pageSize: 10,
  });
  const visibleSelectableUsers = useMemo(() => (
    data.filter((user) => !isCurrentUser(user))
  ), [data, isCurrentUser]);
  const allVisibleSelected = visibleSelectableUsers.length > 0
    && visibleSelectableUsers.every((user) => selectedUserIds.includes(user.id));
  const toggleVisibleSelection = (checked: boolean) => {
    if (isUsersBusy || (!canManageUsers && !canDeleteUsers)) return;

    setSelectedUserIds((current) => {
      const visibleIds = visibleSelectableUsers.map((user) => user.id);
      if (checked) {
        return Array.from(new Set([...current, ...visibleIds]));
      }

      return current.filter((id) => !visibleIds.includes(id));
    });
  };
  const openInviteUser = () => {
    if (isUsersBusy) return;
    if (!canCreateUsers) {
      setNotice(createPermissionTitle || 'Your account cannot invite users.');
      return;
    }

    navigate({ to: '/users/new', search: { siteId: membershipSiteId } });
  };
  const openMembershipStep = (step: (typeof MEMBERSHIP_HANDOFF_STEPS)[number]) => {
    if (isUsersBusy) return;

    if (step.to === '/pages/new') {
      navigate({ to: '/pages/new', search: { siteId: membershipSiteId, template: 'registration' } });
      return;
    }

    if (step.to === '/forms') {
      navigate({ to: '/forms', search: { siteId: membershipSiteId } });
      return;
    }

    if (step.to === '/contacts') {
      navigate({ to: '/contacts', search: { siteId: membershipSiteId } });
      return;
    }

    navigate({ to: '/settings', search: { tab: 'infrastructure' } });
  };
  const userHandoff = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    endpoints: {
      listAndInvite: usersListUrl,
      csvImport: `${usersListUrl}/import`,
      detailUpdateDelete: userDetailUrl,
      publicRegistrationForms: publicFormsUrl,
      publicRegistrationDefinition: publicRegistrationDefinitionUrl,
      publicRegistrationSubmit: publicRegistrationSubmitUrl,
      publicRegistrationContacts: publicContactsUrl,
    },
    membership: {
      model: 'Public members are captured through Forms, Contacts, and Collections today; admin users remain private workspace users.',
      site: {
        id: membershipSiteId,
        name: membershipSite?.name || membershipSiteId,
        slug: membershipSite?.slug || null,
      },
      routes: {
        registrationPage: `/pages/new?siteId=${encodedMembershipSiteId}&template=registration`,
        forms: `/forms?siteId=${encodedMembershipSiteId}`,
        contacts: `/contacts?siteId=${encodedMembershipSiteId}`,
        authAndInfrastructureSettings: '/settings',
      },
      systems: MEMBERSHIP_FLOW_SYSTEMS,
      handoffSteps: MEMBERSHIP_HANDOFF_STEPS,
      authBoundary: {
        model: 'Registration capture is available through Backy content systems; credentialed public member sessions are intentionally separated from private admin users until Supabase/Auth integration is complete.',
        boundaries: MEMBERSHIP_AUTH_BOUNDARIES,
        availableNow: MEMBERSHIP_AUTH_BOUNDARIES
          .filter((boundary) => boundary.status === 'available')
          .map((boundary) => boundary.key),
        notYetShipped: MEMBERSHIP_AUTH_BOUNDARIES
          .filter((boundary) => boundary.status === 'next')
          .map((boundary) => boundary.key),
      },
      frontendFlow: [
        'Create a registration page from the page starter template.',
        'Use Forms to review the registration definition, public submit URL, contacts, and submissions.',
        'Use Settings to connect Supabase metadata and auth/infrastructure readiness.',
        'Connect the form to Backy Forms contact sharing and optional collection writes.',
        'Use Supabase Auth settings when credentialed sessions are implemented.',
        'Use private admin users only for Backy workspace access.',
      ],
    },
    readiness: {
      score: accessReadiness.score,
      checks: accessReadiness.checks,
    },
    metrics: {
      total: users.length,
      visible: data.length,
      active: users.filter((user) => user.status === 'active').length,
      invited: users.filter((user) => user.status === 'invited').length,
      inactive: users.filter((user) => user.status === 'inactive').length,
      suspended: users.filter((user) => user.status === 'suspended').length,
      adminAuthority: users.filter((user) => user.role === 'owner' || user.role === 'admin').length,
    },
    filters: {
      search: searchQuery,
      role: roleFilter,
      status: statusFilter,
      review: reviewFilter,
      currentPage,
      totalPages,
      totalItems,
    },
    roles: ROLE_OPTIONS.map((role) => ({
      value: role.value,
      label: role.label,
      detail: role.detail,
      summary: ROLE_ACCESS_SUMMARY[role.value],
      userCount: users.filter((user) => user.role === role.value).length,
      capabilities: ROLE_CAPABILITIES.map((capability) => ({
        label: capability.label,
        allowed: capability.roles.includes(role.value),
      })),
    })),
    statuses: STATUS_OPTIONS.map((status) => ({
      value: status.value,
      label: status.label,
      userCount: users.filter((user) => user.status === status.value).length,
    })),
    users: data.map((user) => ({
      id: user.id,
      role: user.role,
      status: user.status,
      lastActive: user.lastActive,
      hasName: Boolean(user.fullName),
      hasEmail: Boolean(user.email),
    })),
    guardrails: [
      'Backend blocks deleting or demoting the final active owner/admin.',
      'Invites and edits reject emails already attached to another user.',
      'CSV import can skip duplicate emails or update existing users when explicitly selected.',
      'CSV export is the explicit admin path for identity fields.',
    ],
    privacy: {
      includesIdentity: false,
      note: 'Use CSV export or the private users API for names and emails. This manifest exposes endpoint contracts, role model, filters, counts, and non-PII user state only.',
    },
  }), [
    accessReadiness.checks,
    accessReadiness.score,
    currentPage,
    data,
    encodedMembershipSiteId,
    membershipSite?.name,
    membershipSite?.slug,
    membershipSiteId,
    reviewFilter,
    roleFilter,
    searchQuery,
    statusFilter,
    totalItems,
    totalPages,
    userDetailUrl,
    publicContactsUrl,
    publicFormsUrl,
    publicRegistrationDefinitionUrl,
    publicRegistrationSubmitUrl,
    users,
    usersListUrl,
  ]);
  const userHandoffText = useMemo(() => JSON.stringify(userHandoff, null, 2), [userHandoff]);
  const downloadUserHandoff = () => {
    if (isUsersBusy) return;

    const blob = new Blob([userHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backy-users-handoff.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Users handoff manifest downloaded.');
  };

  const clearUserFilters = () => {
    if (isUsersBusy) return;

    setSearchQuery('');
    setRoleFilter('all');
    setStatusFilter('all');
    setReviewFilter('all');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(searchQuery || roleFilter !== 'all' || statusFilter !== 'all' || reviewFilter !== 'all');

  if (!isPermissionMatrixPending && !canViewUsers) {
    return (
      <PageShell
        title="Users unavailable"
        description={viewPermissionTitle || 'Your account cannot view workspace users.'}
        className="w-full"
      >
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {permissionError || viewPermissionTitle || 'Ask an owner or admin with users.view access to open this page.'}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Users"
      description="Control team access, invitation state, and publishing authority."
      action={
        <Button
          type="button"
          variant="primary"
          onClick={openInviteUser}
          disabled={isUsersBusy || !canCreateUsers}
          title={!canCreateUsers ? createPermissionTitle : undefined}
          iconStart={<Send className="h-4 w-4" />}
        >
          Invite user
        </Button>
      }
      className="w-full"
    >
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label="Import users CSV"
        onChange={(event) => void handleImportUsers(
          event.currentTarget.files?.[0],
          event.currentTarget.dataset.importDryRun === 'true',
        )}
      />
      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="users-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Users command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                accessReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
              >
                {accessReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control workspace membership, role authority, invite states, access reviews, private user APIs, and exportable user records.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isUsersBusy}
              onClick={() => void copyUserApiText(userHandoffText, 'Users handoff manifest')}
              iconStart={<Copy className="size-4" />}
            >
              Copy manifest
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isUsersBusy}
              onClick={downloadUserHandoff}
              iconStart={<Download className="size-4" />}
            >
              Download JSON
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={data.length === 0 || isUsersBusy || !canViewUsers}
              title={!canViewUsers ? viewPermissionTitle : undefined}
              onClick={handleExportUsers}
              iconStart={<Download className="size-4" />}
            >
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isUsersBusy || !canCreateUsers}
              title={!canCreateUsers ? createPermissionTitle : undefined}
              onClick={downloadUserImportTemplate}
              iconStart={<Download className="size-4" />}
            >
              CSV template
            </Button>
            <select
              value={importMode}
              disabled={isUsersBusy || !canCreateUsers}
              title={!canCreateUsers ? createPermissionTitle : undefined}
              onChange={(event) => setImportMode(event.target.value === 'upsert' ? 'upsert' : 'create')}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="User import duplicate handling"
            >
              <option value="create">Skip duplicates</option>
              <option value="upsert">Update duplicates</option>
            </select>
            <Button
              type="button"
              variant="outline"
              disabled={isUsersBusy || !canCreateUsers || (importMode === 'upsert' && !canManageUsers)}
              title={importMode === 'upsert' && !canManageUsers ? managePermissionTitle : !canCreateUsers ? createPermissionTitle : undefined}
              onClick={() => openImportFile(true)}
              iconStart={<ClipboardList className="size-4" />}
            >
              {isPreviewingImport ? 'Previewing...' : 'Preview CSV'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isUsersBusy || !canCreateUsers || (importMode === 'upsert' && !canManageUsers)}
              title={importMode === 'upsert' && !canManageUsers ? managePermissionTitle : !canCreateUsers ? createPermissionTitle : undefined}
              onClick={() => openImportFile(false)}
              iconStart={<Upload className="size-4" />}
            >
              {isImportingUsers ? 'Importing...' : 'Import CSV'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadUsers()}
              disabled={isUsersBusy || !canViewUsers}
              title={!canViewUsers ? viewPermissionTitle : undefined}
              iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}
            >
              Refresh users
            </Button>
            <Button onClick={openInviteUser} disabled={isUsersBusy || !canCreateUsers} title={!canCreateUsers ? createPermissionTitle : undefined} iconStart={<Send className="size-4" />}>
              Invite user
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Access readiness</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Checks admin continuity, role integrity, pending invites, suspended accounts, and invite delivery gaps.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', accessReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                style={{ width: `${accessReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {accessReadiness.checks.map((check) => (
                <UserReadinessCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Account workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {accessReadiness.workflow.map((step, index) => (
                <UserWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Users control map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Jump to access health, API contracts, directory controls, the people table, and role permissions.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {USER_CONTROL_AREAS.map((area) => (
              <a
                key={area.title}
                href={area.href}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-sm font-semibold text-foreground">{area.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <div id="users-metrics" className="grid gap-3 scroll-mt-24 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{metric.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
              </div>
              <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                <metric.icon className="h-4 w-4" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Panel id="users-api" className="scroll-mt-24">
            <PanelHeader
              title="User access API"
              description="Private admin endpoints for listing users, inviting collaborators, and updating account roles or status."
              icon={<Code2 className="size-4" />}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={data.length === 0 || isUsersBusy || !canViewUsers}
                    title={!canViewUsers ? viewPermissionTitle : undefined}
                    onClick={handleExportUsers}
                    iconStart={<Download className="size-4" />}
                  >
                    Export CSV
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isUsersBusy || !canCreateUsers || (importMode === 'upsert' && !canManageUsers)}
                    title={importMode === 'upsert' && !canManageUsers ? managePermissionTitle : !canCreateUsers ? createPermissionTitle : undefined}
                    onClick={() => openImportFile(true)}
                    iconStart={<ClipboardList className="size-4" />}
                  >
                    Preview CSV
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isUsersBusy || !canCreateUsers || (importMode === 'upsert' && !canManageUsers)}
                    title={importMode === 'upsert' && !canManageUsers ? managePermissionTitle : !canCreateUsers ? createPermissionTitle : undefined}
                    onClick={() => openImportFile(false)}
                    iconStart={<Upload className="size-4" />}
                  >
                    Import CSV
                  </Button>
                  <select
                    value={importMode}
                    disabled={isUsersBusy || !canCreateUsers}
                    title={!canCreateUsers ? createPermissionTitle : undefined}
                    onChange={(event) => setImportMode(event.target.value === 'upsert' ? 'upsert' : 'create')}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="User API import duplicate handling"
                  >
                    <option value="create">Skip duplicates</option>
                    <option value="upsert">Update duplicates</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isUsersBusy}
                    onClick={() => void copyUserApiText(usersListUrl, 'Users API URL')}
                    iconStart={<Copy className="size-4" />}
                  >
                    Copy API
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isUsersBusy}
                    onClick={() => void copyUserApiText(userHandoffText, 'Users handoff manifest')}
                    iconStart={<Copy className="size-4" />}
                  >
                    Copy manifest
                  </Button>
                </div>
              }
            />
            <PanelContent>
              <div className="grid gap-3 md:grid-cols-4">
                <UserApiStat label="Visible users" value={`${data.length}`} />
                <UserApiStat label="Total users" value={`${users.length}`} />
                <UserApiStat label="Admin authority" value={`${users.filter((user) => user.role === 'owner' || user.role === 'admin').length}`} />
                <UserApiStat label="Invites pending" value={`${users.filter((user) => user.status === 'invited').length}`} />
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Access readiness</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Checks admin continuity, role integrity, pending invites, suspended accounts, and email delivery.
                      </p>
                    </div>
                    <span className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold',
                      accessReadiness.score >= 80
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700',
                    )}
                    >
                      {accessReadiness.score}% ready
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        accessReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500',
                      )}
                      style={{ width: `${accessReadiness.score}%` }}
                    />
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {accessReadiness.checks.map((check) => (
                      <UserReadinessCheck key={check.label} {...check} />
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold">Account workflow</h3>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {accessReadiness.workflow.map((step, index) => (
                      <UserWorkflowStep key={step.label} index={index + 1} {...step} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <UserApiSnippet label="List and invite users" value={usersListUrl} />
                <UserApiSnippet label="Read, update, or remove user" value={userDetailUrl} />
                <UserApiSnippet label="Public registration forms" value={publicFormsUrl} />
                <UserApiSnippet label="Registration submit" value={publicRegistrationSubmitUrl} />
              </div>
            </PanelContent>
          </Panel>

          <div id="users-directory-controls" className="rounded-lg border border-border bg-card p-4 shadow-sm scroll-mt-24">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative min-w-0 flex-1 lg:max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search name, email, role, or status..."
                  value={searchQuery}
                  disabled={isUsersBusy}
                  onChange={(event) => {
                    if (isUsersBusy) return;

                    setSearchQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                  aria-label="Search users"
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Filter className="h-4 w-4" />
                  <select
                    value={roleFilter}
                    disabled={isUsersBusy}
                    onChange={(event) => {
                      if (isUsersBusy) return;

                      setRoleFilter(event.target.value as 'all' | UserRole);
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Filter users by role"
                  >
                    <option value="all">All roles</option>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </label>

                <select
                  value={reviewFilter}
                  disabled={isUsersBusy}
                  onChange={(event) => {
                    if (isUsersBusy) return;

                    setReviewFilter(event.target.value as UserReviewFilter);
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Filter users by access review"
                >
                  <option value="all">All access reviews</option>
                  <option value="admin-authority">Admin authority</option>
                  <option value="content-operators">Content operators</option>
                  <option value="pending-invites">Pending invites</option>
                  <option value="suspended">Suspended accounts</option>
                  <option value="incomplete-profile">Incomplete profiles</option>
                  <option value="never-active">Never active</option>
                </select>

                <select
                  value={statusFilter}
                  disabled={isUsersBusy}
                  onChange={(event) => {
                    if (isUsersBusy) return;

                    setStatusFilter(event.target.value as 'all' | UserStatus);
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Filter users by status"
                >
                  <option value="all">All statuses</option>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => void loadUsers()}
                  disabled={isUsersBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  aria-label="Refresh users"
                >
                  <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                  Refresh
                </button>

                {hasActiveFilters && (
                  <Button type="button" variant="outline" disabled={isUsersBusy} onClick={clearUserFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            {permissionError && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {permissionError}
              </div>
            )}

            {notice && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {notice}
              </div>
            )}

            {importResult && (
              <div className="mt-4 rounded-lg border border-border bg-background p-3 text-sm" data-testid="users-import-result">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {importResult.dryRun ? 'Import preview' : 'Import result'}
                  </span>
                  {importResult.dryRun && (
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                      No changes applied
                    </span>
                  )}
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {importResult.created} created
                  </span>
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                    {importResult.updated} updated
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {importResult.skipped} skipped
                  </span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    importResult.errors.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                  )}
                  >
                    {importResult.errors.length} row issue{importResult.errors.length === 1 ? '' : 's'}
                  </span>
                  {importResult.rollbackAvailable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRollbackImport()}
                      disabled={isUsersBusy || !canManageUsers || !canDeleteUsers}
                      title={!canManageUsers ? managePermissionTitle : !canDeleteUsers ? deletePermissionTitle : undefined}
                      data-testid="users-import-rollback-button"
                    >
                      {isRollingBackImport ? 'Rolling back...' : 'Roll back import'}
                    </Button>
                  )}
                </div>
                {importResult.errors.length > 0 && (
                  <ul className="mt-3 grid gap-1 text-xs text-muted-foreground">
                    {importResult.errors.slice(0, 4).map((error) => (
                      <li key={`${error.row}-${error.email || error.message}`}>
                        Row {error.row}: {error.email ? `${error.email} - ` : ''}{error.message}
                      </li>
                    ))}
                    {importResult.errors.length > 4 && (
                      <li>{importResult.errors.length - 4} more row issue{importResult.errors.length - 4 === 1 ? '' : 's'} hidden.</li>
                    )}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-4 rounded-lg border border-border bg-background p-3" data-testid="users-bulk-actions">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={isUsersBusy || visibleSelectableUsers.length === 0 || (!canManageUsers && !canDeleteUsers)}
                      title={!canManageUsers && !canDeleteUsers ? managePermissionTitle || deletePermissionTitle : undefined}
                      onChange={(event) => toggleVisibleSelection(event.target.checked)}
                      className="size-4 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Select visible non-current users"
                    />
                    Select visible
                  </label>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                    {selectedActionableUsers.length} selected
                  </span>
                  {selectedUserIds.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isUsersBusy}
                      onClick={() => setSelectedUserIds([])}
                    >
                      Clear
                    </Button>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={bulkStatus}
                    disabled={isUsersBusy || selectedActionableUsers.length === 0 || !canManageUsers}
                    title={!canManageUsers ? managePermissionTitle : undefined}
                    onChange={(event) => setBulkStatus(event.target.value as UserStatus)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Bulk status"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isUsersBusy || selectedActionableUsers.length === 0 || !canManageUsers}
                    title={!canManageUsers ? managePermissionTitle : undefined}
                    onClick={() => void handleBulkStatusUpdate()}
                    iconStart={<Check className="size-4" />}
                  >
                    Apply status
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={isUsersBusy || selectedActionableUsers.length === 0 || !canDeleteUsers}
                    title={!canDeleteUsers ? deletePermissionTitle : undefined}
                    onClick={() => setPendingBulkDelete(true)}
                    iconStart={<Trash2 className="size-4" />}
                  >
                    Delete selected
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div id="users-directory" className="scroll-mt-24">
            <DataGrid
              columns={columns}
              data={data}
              loading={isLoading}
              interactionDisabled={isUsersBusy}
              sortConfig={sortConfig}
              onSort={(key) => {
                if (!isUsersBusy) {
                  handleSort(key);
                }
              }}
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={10}
              onPageChange={(page) => {
                if (!isUsersBusy) {
                  setCurrentPage(page);
                }
              }}
              totalItems={totalItems}
              emptyState={
                <EmptyState
                  icon={hasActiveFilters ? Search : User}
                  title={hasActiveFilters ? 'No users match those controls' : 'No users found'}
                  description={hasActiveFilters ? 'Clear the search or filters to see the full access list.' : 'Invite people before you hand off content, commerce, or publishing work.'}
                  action={
                    hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={clearUserFilters}
                        disabled={isUsersBusy}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Clear filters
                      </button>
                    ) : (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={openInviteUser}
                        disabled={isUsersBusy || !canCreateUsers}
                        title={!canCreateUsers ? createPermissionTitle : undefined}
                        className="mt-4"
                        iconStart={<Plus className="h-4 w-4" />}
                      >
                        Invite user
                      </Button>
                    )
                  }
                />
              }
            />
          </div>
        </div>

        <aside id="users-permissions" className="space-y-4 scroll-mt-24">
          <Panel>
            <PanelHeader
              title="Role permissions"
              description="What each role unlocks across Backy."
              icon={<KeyRound className="size-4" />}
            />
            <PanelContent>
              <div className="space-y-3">
                {ROLE_OPTIONS.map((role) => (
                  <div key={role.value} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{role.label}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{ROLE_ACCESS_SUMMARY[role.value]}</div>
                      </div>
                      <span className={cn('rounded-md border px-2 py-1 text-xs font-semibold', roleBadgeClass[role.value])}>
                        {users.filter((user) => user.role === role.value).length}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {ROLE_CAPABILITIES.map((capability) => {
                        const allowed = capability.roles.includes(role.value);
                        return (
                          <div key={capability.label} className="flex items-start gap-2 text-xs">
                            <span className={cn(
                              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              allowed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-muted text-muted-foreground',
                            )}>
                              {allowed ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            </span>
                            <span className={allowed ? 'text-foreground' : 'text-muted-foreground'}>
                              {capability.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </PanelContent>
          </Panel>

          <Panel id="users-membership" className="scroll-mt-24">
            <PanelHeader
              title="Membership registration"
              description={`Public registration capture and credentialed auth handoff for ${membershipSite?.name || membershipSiteId}.`}
              icon={<Shield className="size-4" />}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => openMembershipStep(MEMBERSHIP_HANDOFF_STEPS[0])}
                    disabled={isUsersBusy}
                    iconStart={<Plus className="size-4" />}
                  >
                    Create page
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openMembershipStep(MEMBERSHIP_HANDOFF_STEPS[1])}
                    disabled={isUsersBusy}
                    iconStart={<ClipboardList className="size-4" />}
                  >
                    Forms
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openMembershipStep(MEMBERSHIP_HANDOFF_STEPS[3])}
                    disabled={isUsersBusy}
                    iconStart={<Settings className="size-4" />}
                  >
                    Auth settings
                  </Button>
                </div>
              }
            />
            <PanelContent>
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                Start from the registration template, review the generated form in Forms, then connect auth/provider settings when member credentials are ready.
              </div>

              <div className="mb-4 rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Registration handoff workflow</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      What Backy can control today and which member-account pieces still need the auth/provider pass.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {MEMBERSHIP_HANDOFF_STEPS.filter((step) => step.status === 'available').length}/{MEMBERSHIP_HANDOFF_STEPS.length} available
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {MEMBERSHIP_HANDOFF_STEPS.map((step) => (
                    <MembershipStepCard
                      key={step.step}
                      step={step}
                      disabled={isUsersBusy}
                      onOpen={() => openMembershipStep(step)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {MEMBERSHIP_FLOW_SYSTEMS.map((system) => (
                  <div key={system.key} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{system.title}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">{system.detail}</div>
                      </div>
                      <span className={cn(
                        'rounded-md px-2 py-1 text-xs font-semibold',
                        system.status === 'available'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700',
                      )}
                      >
                        {system.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div data-testid="users-member-auth-boundary" className="mt-4 rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Member auth boundary</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Public registration capture is available today. Credentialed public member sessions stay separate from private Backy admin users until the Supabase/Auth pass is complete.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {MEMBERSHIP_AUTH_BOUNDARIES.filter((boundary) => boundary.status === 'available').length}/{MEMBERSHIP_AUTH_BOUNDARIES.length} available
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {MEMBERSHIP_AUTH_BOUNDARIES.map((boundary) => (
                    <div key={boundary.key} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{boundary.title}</div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">{boundary.detail}</div>
                        </div>
                        <span className={cn(
                          'shrink-0 rounded-md px-2 py-1 text-xs font-semibold',
                          boundary.status === 'available'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700',
                        )}
                        >
                          {boundary.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <UserApiSnippet label="Forms catalog" value={publicFormsUrl} />
                <UserApiSnippet label="Registration definition" value={publicRegistrationDefinitionUrl} />
                <UserApiSnippet label="Registration submit" value={publicRegistrationSubmitUrl} />
                <UserApiSnippet label="Registration contacts" value={publicContactsUrl} />
              </div>
            </PanelContent>
          </Panel>

          <Panel id="users-activity" className="scroll-mt-24">
            <PanelHeader
              title="Access activity"
              description="Recent user events from the admin audit log."
              icon={<History className="size-4" />}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isLoadingUserAudit || !canExportActivity}
                  title={!canExportActivity ? activityPermissionTitle : undefined}
                  onClick={() => void loadUserAuditLogs()}
                  iconStart={<RefreshCw className={cn('size-3.5', isLoadingUserAudit && 'animate-spin')} />}
                >
                  Refresh
                </Button>
              }
            />
            <PanelContent>
              {userAuditError && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {userAuditError}
                </div>
              )}
              {isLoadingUserAudit ? (
                <div className="space-y-2" aria-label="Loading user audit events">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
                  ))}
                </div>
              ) : userAuditLogs.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No user audit events yet"
                  description="Create, update, import, delete, or review users to populate this access timeline."
                />
              ) : (
                <div className="space-y-2">
                  {userAuditLogs.map((log) => (
                    <UserAuditEventCard key={log.id} log={log} />
                  ))}
                </div>
              )}
            </PanelContent>
          </Panel>

          <Panel>
            <PanelHeader
              title="Access guardrails"
              description="The API protects core workspace ownership."
              icon={<LockKeyhole className="size-4" />}
            />
            <PanelContent>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="font-semibold">Last admin protection</div>
                  <p className="mt-1 text-muted-foreground">Backy blocks deleting or demoting the final active owner/admin.</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="font-semibold">Duplicate email protection</div>
                  <p className="mt-1 text-muted-foreground">Invites and edits reject emails already attached to another user.</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="font-semibold">Operational filters</div>
                  <p className="mt-1 text-muted-foreground">Search, role, status, refresh, and CSV export all work against the current API result.</p>
                </div>
              </div>
            </PanelContent>
          </Panel>

          <Panel>
            <PanelHeader
              title="Next controls"
              description="Backlog for parity with bigger site builders."
              icon={<SlidersHorizontal className="size-4" />}
            />
            <PanelContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Per-site role overrides</li>
                <li>Permission groups for products, orders, and media folders</li>
                <li>Real email invite delivery and password reset events</li>
                <li>Activity log drill-down by user</li>
              </ul>
            </PanelContent>
          </Panel>
        </aside>
      </div>

      {pendingBulkDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="users-bulk-delete-confirm-title"
          data-testid="users-bulk-delete-confirm-dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 id="users-bulk-delete-confirm-title" className="text-lg font-semibold text-foreground">Remove selected users?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This revokes admin access for {selectedActionableUsers.length} selected account{selectedActionableUsers.length === 1 ? '' : 's'}. Current-session users stay locked.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!isUserMutationBusy) {
                    setPendingBulkDelete(false);
                  }
                }}
                disabled={isUserMutationBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDeleteUsers()}
                disabled={isUserMutationBusy || selectedActionableUsers.length === 0}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUserMutationBusy ? 'Removing...' : 'Remove selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="users-delete-confirm-title"
          data-testid="users-delete-confirm-dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 id="users-delete-confirm-title" className="text-lg font-semibold text-foreground">Remove {pendingDelete.fullName}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This revokes admin access immediately. Backy keeps content they created, but this account will no longer be able to sign in.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!isUserMutationBusy) {
                    setPendingDelete(null);
                  }
                }}
                disabled={isUserMutationBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteUser()}
                disabled={isUserMutationBusy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUserMutationBusy ? 'Removing...' : 'Remove user'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function UserApiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function UserReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  const Icon = ready ? CheckCircle2 : AlertTriangle;

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Icon className={cn('mt-0.5 size-4 shrink-0', ready ? 'text-emerald-600' : 'text-amber-600')} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function UserWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
        {index}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function UserApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}

function UserAuditEventCard({ log }: { log: AdminAuditLog }) {
  const email = typeof log.metadata?.email === 'string'
    ? log.metadata.email
    : typeof log.after?.email === 'string'
      ? log.after.email
      : typeof log.before?.email === 'string'
        ? log.before.email
        : log.entityId;
  const role = typeof log.metadata?.role === 'string'
    ? log.metadata.role
    : typeof log.after?.role === 'string'
      ? log.after.role
      : typeof log.before?.role === 'string'
        ? log.before.role
        : undefined;
  const status = typeof log.metadata?.status === 'string'
    ? log.metadata.status
    : typeof log.after?.status === 'string'
      ? log.after.status
      : typeof log.before?.status === 'string'
        ? log.before.status
        : undefined;
  const changedFields = Array.isArray(log.metadata?.changedFields)
    ? log.metadata.changedFields.filter((field): field is string => typeof field === 'string')
    : [];
  const actionLabel = log.action === 'create'
    ? 'Created'
    : log.action === 'delete'
      ? 'Removed'
      : log.action === 'update'
        ? 'Updated'
        : log.action;
  const createdAt = formatAuditDate(log.createdAt);

  return (
    <article className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              'rounded px-2 py-0.5 text-[11px] font-semibold',
              log.action === 'delete'
                ? 'bg-red-50 text-red-700'
                : log.action === 'create'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-sky-50 text-sky-700',
            )}
            >
              {actionLabel}
            </span>
            <h4 className="truncate text-sm font-semibold text-foreground">{email}</h4>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {role ? `${roleLabel(role as UserRole)} role` : 'User access'}{status ? ` · ${status}` : ''}
            {changedFields.length > 0 ? ` · changed ${changedFields.join(', ')}` : ''}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{createdAt}</span>
      </div>
      {log.requestId && (
        <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
          request {log.requestId}
        </p>
      )}
    </article>
  );
}

function MembershipStepCard({
  step,
  disabled,
  onOpen,
}: {
  step: (typeof MEMBERSHIP_HANDOFF_STEPS)[number];
  disabled: boolean;
  onOpen: () => void;
}) {
  const available = step.status === 'available';

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <span className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold',
          available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
        )}
        >
          {step.step}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">{step.title}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
            </div>
            <span className={cn(
              'rounded-md px-2 py-1 text-[11px] font-semibold',
              available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
            )}
            >
              {step.status}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpen}
            disabled={disabled}
            className="mt-3 inline-flex min-h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {step.label}
          </button>
        </div>
      </div>
    </div>
  );
}

const isNeverActiveUser = (user: UserType): boolean => {
  const lastActive = user.lastActive.trim().toLowerCase();
  return !lastActive || lastActive === 'never' || lastActive === 'invited';
};

const formatAuditDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const isLocalAdminHost = () => {
  if (typeof window === 'undefined') return false;

  return ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3001';
};

const getAdminBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_ADMIN_API_BASE_URL') ||
    getEnvValue('VITE_ADMIN_API_URL') ||
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminHost()) {
    return 'http://localhost:3001/api/admin';
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api/admin`;
};

const getPublicBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminHost()) {
    return 'http://localhost:3001';
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '');
};

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};

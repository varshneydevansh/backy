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
  MoreHorizontal,
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
import { getLocalBackendOrigin } from '@/lib/localBackendOrigin';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { useStore, type User as UserType } from '@/stores/mockStore';

interface UsersSearch {
  siteId?: string;
  notice?: string;
  query?: string;
}

const normalizedUsersSearchString = (value: unknown) => (
  typeof value === 'string' && value.trim() ? value : undefined
);

export const Route = createFileRoute('/users')({
  validateSearch: (search: Record<string, unknown>): UsersSearch => ({
    siteId: normalizedUsersSearchString(search.siteId),
    notice: normalizedUsersSearchString(search.notice),
    query: normalizedUsersSearchString(search.query),
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
    detail: 'Credentials, sessions, password reset, and protected-route enforcement are provider-gated through Settings.',
  },
  {
    key: 'member-portal',
    title: 'Member portal page shell',
    status: 'available',
    detail: 'Member login and account starter pages seed editable form blocks, profile/preferences capture, resources, and support links.',
  },
] as const;

const MEMBERSHIP_HANDOFF_STEPS = [
  {
    step: '1',
    template: 'registration',
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
    template: 'member-login',
    title: 'Create member login page',
    detail: 'Seed an email-based access page that can request secure links or route members into provider auth.',
    status: 'available',
    to: '/pages/new',
    label: 'Start login',
  },
  {
    step: '5',
    template: 'member-account',
    title: 'Create member account page',
    detail: 'Seed an editable account page for profile/preferences capture, resource links, support, and signed-download handoff copy.',
    status: 'available',
    to: '/pages/new',
    label: 'Start account',
  },
  {
    step: '6',
    title: 'Connect auth provider',
    detail: 'Use Settings to track Supabase/Auth infrastructure before enforcing credentialed public member sessions.',
    status: 'next',
    to: '/settings',
    label: 'Open settings',
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
    detail: 'Public member signup, login, password reset, email verification, and protected routes are gated on the Supabase/Auth provider pass.',
  },
  {
    key: 'member-portal',
    title: 'Self-service member portal shell',
    status: 'available',
    detail: 'Member-account pages can capture profile/preferences through Backy Forms and link signed downloads, order status handoffs, support, and collection-backed profile records.',
  },
] as const;

const MEMBER_ACCESS_HANDOFF_SCHEMA_VERSION = 'backy.member-access-handoff.v1';

const MEMBERSHIP_EDITABLE_REGIONS = [
  {
    key: 'registration-intake',
    template: 'registration',
    label: 'Registration intake',
    editableFields: ['headline', 'introCopy', 'memberTypeOptions', 'consentCopy', 'submitLabel', 'successMessage'],
  },
  {
    key: 'access-request',
    template: 'member-login',
    label: 'Access request',
    editableFields: ['headline', 'registrationPrompt', 'emailField', 'reasonField', 'requestLabel', 'successMessage'],
  },
  {
    key: 'member-profile',
    template: 'member-account',
    label: 'Member profile',
    editableFields: ['profileSummary', 'displayNameField', 'emailField', 'preferenceFields', 'resourceCards', 'supportLinks'],
  },
] as const;

const MEMBERSHIP_DATA_BINDINGS = [
  { key: 'member.profile', target: 'member-account profile card', fields: ['name', 'email', 'status'] },
  { key: 'member.preferences', target: 'member-account preferences form', fields: ['display_name', 'email', 'updates'] },
  { key: 'registration.contact', target: 'registration form contact share', fields: ['name', 'email', 'phone', 'member_type', 'consent'] },
  { key: 'registration.profileRecord', target: 'optional collection write', fields: ['name', 'email', 'member_type', 'source_form_id'] },
] as const;

const MEMBERSHIP_ACTION_BINDINGS = [
  { key: 'create-registration-page', target: '/pages/new', template: 'registration' },
  { key: 'create-member-login-page', target: '/pages/new', template: 'member-login' },
  { key: 'create-member-account-page', target: '/pages/new', template: 'member-account' },
  { key: 'review-registration-form', target: '/forms' },
  { key: 'review-member-contacts', target: '/contacts' },
  { key: 'configure-auth-provider', target: '/settings?tab=infrastructure' },
] as const;

const USER_IMPORT_REQUIRED_COLUMNS = ['full_name', 'email'] as const;
const USER_IMPORT_NAME_HEADERS = ['full_name', 'fullname', 'name'] as const;
const USER_IMPORT_EMAIL_HEADERS = ['email', 'email_address'] as const;
const USER_IMPORT_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
const USER_IMPORT_STATUSES = ['active', 'inactive', 'invited', 'suspended'] as const;

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
  const routeQueryRef = useRef('');
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<'create' | 'upsert'>('create');
  const [isImportingUsers, setIsImportingUsers] = useState(false);
  const [isPreviewingImport, setIsPreviewingImport] = useState(false);
  const [isRollingBackImport, setIsRollingBackImport] = useState(false);
  const [importResult, setImportResult] = useState<UserImportResult | null>(null);
  const [userImportInlineError, setUserImportInlineError] = useState<string | null>(null);
  const [pendingImportRollback, setPendingImportRollback] = useState(false);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [userAuditLogs, setUserAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isLoadingUserAudit, setIsLoadingUserAudit] = useState(false);
  const [userAuditError, setUserAuditError] = useState<string | null>(null);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewUsers = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.view', USER_PERMISSION_ROLE_DEFAULTS);
  const canCreateUsers = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.create', USER_PERMISSION_ROLE_DEFAULTS);
  const canManageUsers = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.manage', USER_PERMISSION_ROLE_DEFAULTS);
  const canDeleteUsers = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.delete', USER_PERMISSION_ROLE_DEFAULTS);
  const canExportActivity = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'activity.export', USER_PERMISSION_ROLE_DEFAULTS);
  const viewPermissionTitle = canViewUsers ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.view', USER_PERMISSION_ROLE_DEFAULTS);
  const createPermissionTitle = canCreateUsers ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.create', USER_PERMISSION_ROLE_DEFAULTS);
  const managePermissionTitle = canManageUsers ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.manage', USER_PERMISSION_ROLE_DEFAULTS);
  const deletePermissionTitle = canDeleteUsers ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.delete', USER_PERMISSION_ROLE_DEFAULTS);
  const activityPermissionTitle = canExportActivity ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'activity.export', USER_PERMISSION_ROLE_DEFAULTS);
  const isUserMutationBusy = updatingUserId !== null || isBulkActionBusy || isImportingUsers || isPreviewingImport || isRollingBackImport;
  const isUsersBusy = isLoading || isUserMutationBusy;
  const userInviteActionDisabled = isUserMutationBusy || !canCreateUsers;
  const userImportActionDisabled = isUserMutationBusy || !canCreateUsers || (importMode === 'upsert' && !canManageUsers);
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
  }, [canViewUsers, setUsers, viewPermissionTitle]);

  const loadUserAuditLogs = useCallback(async () => {
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
  }, [canExportActivity]);

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
        detail: 'Registration and member pages are connected to Forms, Contacts, Collections, and a provider-gated member access handoff.',
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
  const selectedUserIdSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const selectedUsers = useMemo(() => (
    users.filter((user) => selectedUserIdSet.has(user.id))
  ), [selectedUserIdSet, users]);
  const selectedActionableUsers = useMemo(() => (
    selectedUsers.filter((user) => !isCurrentUser(user))
  ), [isCurrentUser, selectedUsers]);
  const selectedActionableUserIds = useMemo(() => (
    selectedActionableUsers.map((user) => user.id)
  ), [selectedActionableUsers]);

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

    const userIds = selectedActionableUserIds;
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

    const userIds = selectedActionableUserIds;
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
    if (!pendingDelete && !pendingBulkDelete && !pendingImportRollback) return;

    const handleDeleteDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isUserMutationBusy) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setPendingDelete(null);
      setPendingBulkDelete(false);
      setPendingImportRollback(false);
    };

    document.addEventListener('keydown', handleDeleteDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handleDeleteDialogKeyDown, true);
  }, [isUserMutationBusy, pendingBulkDelete, pendingDelete, pendingImportRollback]);

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
    if (isUserMutationBusy) return;
    if (!canCreateUsers) {
      setNotice(createPermissionTitle || 'Your account cannot import users.');
      return;
    }

    setUserImportInlineError(null);
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
    if (isUserMutationBusy || !importInputRef.current) return;
    if (!canCreateUsers || (importMode === 'upsert' && !canManageUsers)) {
      setNotice(importMode === 'upsert'
        ? managePermissionTitle || 'Updating existing users from CSV requires user management access.'
        : createPermissionTitle || 'Your account cannot import users.');
      return;
    }

    setUserImportInlineError(null);
    importInputRef.current.dataset.importDryRun = dryRun ? 'true' : 'false';
    importInputRef.current.click();
  };

  const handleImportUsers = async (file: File | null | undefined, dryRun: boolean) => {
    if (isUserMutationBusy) return;
    if (!file) {
      setUserImportInlineError('Choose a users CSV before previewing or importing.');
      return;
    }
    if (!canCreateUsers || (importMode === 'upsert' && !canManageUsers)) {
      setNotice(importMode === 'upsert'
        ? managePermissionTitle || 'Updating existing users from CSV requires user management access.'
        : createPermissionTitle || 'Your account cannot import users.');
      return;
    }

    setImportResult(null);
    setNotice(null);

    try {
      const preflight = await validateUserImportCsvFile(file);
      if (preflight.error) {
        setUserImportInlineError(preflight.error);
        return;
      }

      setUserImportInlineError(null);
      if (dryRun) {
        setIsPreviewingImport(true);
      } else {
        setIsImportingUsers(true);
      }

      const { csv } = preflight;
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
    setIsRollingBackImport(true);
    setNotice(null);
    try {
      const rollback = await rollbackUsersImport(importResult.rollbackRequestId);
      let restoredUsers: UserType[] = [];
      try {
        const refreshedUsers = await listUsers();
        setUsers(refreshedUsers);
        restoredUsers = refreshedUsers.filter((user) => rollback.restoredUserIds.includes(user.id));
      } catch {
        await loadUsers();
      }
      await loadUserAuditLogs();
      const restoredSummary = restoredUsers.length > 0
        ? ` Restored ${restoredUsers.map((user) => `${user.fullName} (${user.email})`).join(', ')}.`
        : '';
      setNotice(`Rolled back import: ${rollback.deleted} created user${rollback.deleted === 1 ? '' : 's'} deleted, ${rollback.restored} update${rollback.restored === 1 ? '' : 's'} restored, ${rollback.skipped.length} skipped.${restoredSummary}`);
      if (restoredUsers[0]) {
        void navigate({
          to: '/users',
          search: {
            ...(routeSearch.siteId ? { siteId: routeSearch.siteId } : {}),
            query: restoredUsers[0].email,
          },
        });
      }
      setImportResult(null);
      setPendingImportRollback(false);
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
      width: '76px',
      render: (user) => {
        const locked = isCurrentUser(user);

        return (
          <input
            type="checkbox"
            checked={selectedUserIdSet.has(user.id)}
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
      width: '340px',
      render: (user) => (
        <button
          type="button"
          onClick={() => {
            if (!isUsersBusy) {
              void navigate({ to: '/users/$userId', params: { userId: user.id } });
            }
          }}
          disabled={isUsersBusy}
          aria-label={`Open ${user.fullName}`}
          data-testid={`users-open-detail-${user.id}`}
          data-user-full-name={user.fullName}
          className="group flex w-full min-w-0 max-w-full items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white shadow-sm">
            {getInitials(user.fullName)}
            <span className={cn(
              'absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-card',
              user.status === 'active' ? 'bg-emerald-500' : user.status === 'invited' ? 'bg-amber-400' : 'bg-slate-300',
            )} />
          </span>
          <span className="min-w-0 max-w-full flex-1 overflow-hidden">
            <span className="flex min-w-0 flex-wrap items-center gap-2 font-semibold text-foreground group-hover:text-primary">
              <span className="min-w-0 max-w-full truncate" title={user.fullName}>{user.fullName}</span>
              {isCurrentUser(user) && (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  You
                </span>
              )}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="min-w-0 max-w-full truncate" title={user.email}>{user.email}</span>
            </span>
          </span>
        </button>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      width: '190px',
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
      width: '190px',
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
      width: '220px',
      render: (user) => (
        <span className="block min-w-0 break-words text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]" title={user.lastActive}>{user.lastActive}</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: '112px',
      render: (user) => {
        const userActionStatusId = `users-actions-status-${user.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        const rowBusyReason = isUsersBusy
          ? 'User actions are temporarily unavailable while Backy updates accounts.'
          : null;
        const editDisabledReason = rowBusyReason;
        const removeDisabledReason = isCurrentUser(user)
          ? 'You cannot remove your own signed-in account from this directory.'
          : !canDeleteUsers
            ? deletePermissionTitle || 'Your account cannot remove users.'
            : rowBusyReason;
        const userActionStatus = [
          editDisabledReason ? `Edit unavailable: ${editDisabledReason}` : 'Edit available.',
          removeDisabledReason ? `Remove unavailable: ${removeDisabledReason}` : 'Remove available.',
        ].join(' ');

        return (
          <div
            className="flex min-w-0 flex-wrap items-center justify-end gap-2"
            role="group"
            aria-label={`Actions for ${user.fullName}`}
            aria-describedby={userActionStatusId}
            data-testid={`users-actions-${user.id}`}
            data-action-status={userActionStatus}
          >
            <span id={userActionStatusId} className="sr-only" data-testid={`users-actions-status-${user.id}`}>
              {userActionStatus}
            </span>
            <button
              type="button"
              onClick={() => {
                if (!editDisabledReason) {
                  void navigate({ to: '/users/$userId', params: { userId: user.id } });
                }
              }}
              disabled={Boolean(editDisabledReason)}
              aria-disabled={Boolean(editDisabledReason)}
              aria-describedby={userActionStatusId}
              data-action-state={editDisabledReason ? 'blocked' : 'ready'}
              data-disabled-reason={editDisabledReason || undefined}
              title={editDisabledReason || 'Edit user'}
              className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Edit ${user.fullName}`}
              data-testid={`users-edit-detail-${user.id}`}
              data-user-full-name={user.fullName}
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!removeDisabledReason) {
                  setPendingDelete(user);
                }
              }}
              disabled={Boolean(removeDisabledReason)}
              aria-disabled={Boolean(removeDisabledReason)}
              aria-describedby={userActionStatusId}
              data-action-state={removeDisabledReason ? 'blocked' : 'ready'}
              data-disabled-reason={removeDisabledReason || undefined}
              title={removeDisabledReason || 'Remove user'}
              className="rounded-lg border border-red-200 p-2 text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={isCurrentUser(user) ? `Self removal locked for ${user.fullName}` : `Remove ${user.fullName}`}
              data-testid={`users-remove-${user.id}`}
              data-user-full-name={user.fullName}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      },
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
    initialSearch: routeSearch.query || '',
    pageSize: 10,
  });
  const usersCommandSecondaryActionStatusId = 'users-command-secondary-action-status';
  const usersCommandBusyDisabledReason = isUsersBusy
    ? 'Users command actions are temporarily unavailable while Backy loads users.'
    : '';
  const usersCommandMutationDisabledReason = isUserMutationBusy ? 'User mutations are running.' : '';
  const usersCommandViewDisabledReason = !canViewUsers
    ? viewPermissionTitle || 'Your account needs users.view to use user handoff actions.'
    : '';
  const usersCommandCreateDisabledReason = !canCreateUsers
    ? createPermissionTitle || 'Your account needs users.create to import users.'
    : '';
  const usersCommandExportDisabledReason =
    usersCommandBusyDisabledReason ||
    usersCommandViewDisabledReason ||
    (data.length === 0 ? 'No visible users are available to export.' : '');
  const usersCommandCsvTemplateDisabledReason =
    usersCommandMutationDisabledReason || usersCommandCreateDisabledReason;
  const usersCommandImportModeDisabledReason =
    usersCommandMutationDisabledReason || usersCommandCreateDisabledReason;
  const usersCommandCopyDisabledReason = usersCommandBusyDisabledReason || usersCommandViewDisabledReason;
  const usersCommandDownloadDisabledReason = usersCommandBusyDisabledReason || usersCommandViewDisabledReason;
  const usersCommandExportActionStatus = usersCommandExportDisabledReason
    ? `Export CSV blocked: ${usersCommandExportDisabledReason}`
    : `Export CSV available for ${data.length} visible user${data.length === 1 ? '' : 's'}.`;
  const usersCommandCsvTemplateActionStatus = usersCommandCsvTemplateDisabledReason
    ? `CSV template blocked: ${usersCommandCsvTemplateDisabledReason}`
    : 'CSV template available.';
  const usersCommandImportModeActionStatus = usersCommandImportModeDisabledReason
    ? `Import duplicate handling blocked: ${usersCommandImportModeDisabledReason}`
    : `Import duplicate handling available in ${importMode === 'upsert' ? 'update duplicates' : 'skip duplicates'} mode.`;
  const usersCommandCopyActionStatus = usersCommandCopyDisabledReason
    ? `Copy manifest blocked: ${usersCommandCopyDisabledReason}`
    : `Copy manifest available for ${membershipSiteId}.`;
  const usersCommandDownloadActionStatus = usersCommandDownloadDisabledReason
    ? `Download JSON blocked: ${usersCommandDownloadDisabledReason}`
    : `Download JSON available for ${membershipSiteId}.`;
  const usersCommandSecondaryActionStatus = [
    usersCommandExportActionStatus,
    usersCommandCsvTemplateActionStatus,
    usersCommandImportModeActionStatus,
    usersCommandCopyActionStatus,
    usersCommandDownloadActionStatus,
  ].join(' ');
  const usersCommandSecondaryActionState = [
    usersCommandExportDisabledReason,
    usersCommandCsvTemplateDisabledReason,
    usersCommandImportModeDisabledReason,
    usersCommandCopyDisabledReason,
    usersCommandDownloadDisabledReason,
  ].every(Boolean) ? 'blocked' : 'ready';
  const usersCommandImportModeDescribedBy = userImportInlineError
    ? `${usersCommandSecondaryActionStatusId} users-import-inline-error`
    : usersCommandSecondaryActionStatusId;

  useEffect(() => {
    const routeQuery = routeSearch.query || '';
    if (!routeQuery) {
      routeQueryRef.current = '';
      return;
    }
    if (routeQueryRef.current === routeQuery) return;

    routeQueryRef.current = routeQuery;
    if (routeQuery === searchQuery) return;
    setSearchQuery(routeQuery);
    setCurrentPage(1);
  }, [routeSearch.query, searchQuery, setCurrentPage, setSearchQuery]);
  const visibleSelectableUsers = useMemo(() => (
    data.filter((user) => !isCurrentUser(user))
  ), [data, isCurrentUser]);
  const selectedVisibleActionableUsers = useMemo(() => (
    visibleSelectableUsers.filter((user) => selectedUserIdSet.has(user.id))
  ), [selectedUserIdSet, visibleSelectableUsers]);
  const hiddenSelectedUserCount = Math.max(0, selectedActionableUsers.length - selectedVisibleActionableUsers.length);
  const allVisibleSelected = visibleSelectableUsers.length > 0
    && visibleSelectableUsers.every((user) => selectedUserIdSet.has(user.id));
  const usersBulkSelectionSummaryId = 'users-bulk-selection-summary';
  const usersBulkActionStatusId = 'users-bulk-action-status';
  const usersBulkDeleteDialogDescriptionId = 'users-bulk-delete-confirm-description';
  const usersBulkDeleteDialogStatusId = 'users-bulk-delete-confirm-action-status';
  const selectedUserActionLabel = `${selectedActionableUsers.length} selected non-current user${selectedActionableUsers.length === 1 ? '' : 's'}`;
  const visibleUserActionLabel = `${visibleSelectableUsers.length} visible non-current user${visibleSelectableUsers.length === 1 ? '' : 's'}`;
  const usersBulkBusyDisabledReason = isUsersBusy ? 'User directory is busy.' : '';
  const usersBulkManageDisabledReason = !canManageUsers
    ? managePermissionTitle || 'Your account cannot manage users.'
    : '';
  const usersBulkDeleteDisabledReason = !canDeleteUsers
    ? deletePermissionTitle || 'Your account cannot delete users.'
    : '';
  const usersBulkSelectionPermissionReason = !canManageUsers && !canDeleteUsers
    ? managePermissionTitle || deletePermissionTitle || 'Your account cannot manage or delete users.'
    : '';
  const usersBulkSelectionDisabledReason = visibleSelectableUsers.length === 0
    ? 'No visible non-current users to select.'
    : usersBulkBusyDisabledReason || usersBulkSelectionPermissionReason;
  const usersBulkNoSelectionDisabledReason = selectedActionableUsers.length === 0
    ? 'Select one or more non-current users first.'
    : '';
  const usersBulkStatusDisabledReason = usersBulkNoSelectionDisabledReason ||
    usersBulkBusyDisabledReason ||
    usersBulkManageDisabledReason;
  const usersBulkClearDisabledReason = selectedUserIds.length === 0
    ? 'Select one or more users first.'
    : usersBulkBusyDisabledReason;
  const usersBulkDeleteActionDisabledReason = usersBulkNoSelectionDisabledReason ||
    usersBulkBusyDisabledReason ||
    usersBulkDeleteDisabledReason;
  const usersBulkDeleteConfirmDisabledReason = isUserMutationBusy
    ? 'Bulk user deletion is already running.'
    : usersBulkNoSelectionDisabledReason || usersBulkDeleteDisabledReason;
  const usersBulkActionStatus = [
    usersBulkSelectionDisabledReason ? `Select visible unavailable: ${usersBulkSelectionDisabledReason}` : `Select visible available for ${visibleUserActionLabel}.`,
    usersBulkStatusDisabledReason ? `Bulk status unavailable: ${usersBulkStatusDisabledReason}` : `Bulk status available for ${selectedUserActionLabel}.`,
    usersBulkStatusDisabledReason ? `Apply status unavailable: ${usersBulkStatusDisabledReason}` : `Apply status available for ${selectedUserActionLabel}.`,
    usersBulkDeleteActionDisabledReason ? `Delete selected unavailable: ${usersBulkDeleteActionDisabledReason}` : `Delete selected available for ${selectedUserActionLabel}.`,
    usersBulkClearDisabledReason ? `Clear selection unavailable: ${usersBulkClearDisabledReason}` : `Clear selection available for ${selectedUserActionLabel}.`,
  ].join(' ');
  const usersBulkDeleteCancelActionStatus = isUserMutationBusy
    ? 'Cancel bulk user deletion unavailable while deletion is running.'
    : 'Cancel bulk user deletion available.';
  const usersBulkDeleteConfirmActionStatus = usersBulkDeleteConfirmDisabledReason
    ? `Remove selected users unavailable: ${usersBulkDeleteConfirmDisabledReason}`
    : `Remove selected users available for ${selectedUserActionLabel}.`;
  const usersBulkGroupActionState = selectedActionableUsers.length === 0
    ? 'blocked'
    : usersBulkStatusDisabledReason || usersBulkDeleteActionDisabledReason
      ? 'mixed'
      : 'ready';
  const accessWorkflowUser = selectedActionableUsers[0] || data[0] || filteredUsers[0];
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
    if (isUserMutationBusy) return;
    if (!canCreateUsers) {
      setNotice(createPermissionTitle || 'Your account cannot invite users.');
      return;
    }

    navigate({ to: '/users/new', search: { siteId: membershipSiteId } });
  };
  const openAccessWorkflowUser = () => {
    if (isUsersBusy || !accessWorkflowUser) return;
    navigate({ to: '/users/$userId', params: { userId: accessWorkflowUser.id } });
  };
  const openMembershipStep = (step: (typeof MEMBERSHIP_HANDOFF_STEPS)[number]) => {
    if (isUsersBusy) return;

    if (step.to === '/pages/new') {
      navigate({ to: '/pages/new', search: { siteId: membershipSiteId, template: 'template' in step ? step.template : 'registration', templateSource: 'backy-canvas' } });
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
  const memberAccessHandoff = useMemo(() => ({
    schemaVersion: MEMBER_ACCESS_HANDOFF_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    site: {
      id: membershipSiteId,
      name: membershipSite?.name || membershipSiteId,
      slug: membershipSite?.slug || null,
    },
    pageTemplates: {
      registration: `/pages/new?siteId=${encodedMembershipSiteId}&template=registration`,
      memberLogin: `/pages/new?siteId=${encodedMembershipSiteId}&template=member-login`,
      memberAccount: `/pages/new?siteId=${encodedMembershipSiteId}&template=member-account`,
    },
    publicApis: {
      formsCatalog: publicFormsUrl,
      registrationDefinition: publicRegistrationDefinitionUrl,
      registrationSubmit: publicRegistrationSubmitUrl,
    },
    privateAdminApis: {
      registrationContacts: publicContactsUrl,
      users: usersListUrl,
      userDetail: userDetailUrl,
    },
    editableRegions: MEMBERSHIP_EDITABLE_REGIONS,
    dataBindings: MEMBERSHIP_DATA_BINDINGS,
    actionBindings: MEMBERSHIP_ACTION_BINDINGS,
    authProviderGate: {
      status: 'provider-gated',
      settingsRoute: '/settings?tab=infrastructure',
      providerFamily: 'supabase-auth-or-compatible',
      requiredFor: ['credentialed-public-member-sessions', 'member-password-reset', 'member-email-verification', 'protected-member-routes'],
      boundary: 'Public member sessions stay separate from private Backy admin users.',
    },
    privacy: {
      includesIdentity: false,
      excludes: ['private admin user records', 'raw contact payloads', 'session cookies', 'auth provider secrets', 'reset tokens', 'invite tokens'],
      note: 'Use public form APIs for visitor registration, private admin APIs for review, and the configured auth provider for credentialed member sessions.',
    },
    launchPath: [
      'Create the registration page template.',
      'Review the generated registration form definition and submit URL.',
      'Route approved registrations into Contacts or a member profile collection.',
      'Create member login and member account pages.',
      'Configure Supabase/Auth provider readiness in Settings before enforcing protected routes.',
    ],
  }), [
    encodedMembershipSiteId,
    membershipSite?.name,
    membershipSite?.slug,
    membershipSiteId,
    publicContactsUrl,
    publicFormsUrl,
    publicRegistrationDefinitionUrl,
    publicRegistrationSubmitUrl,
    userDetailUrl,
    usersListUrl,
  ]);
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
      frontendHandoff: memberAccessHandoff,
      authBoundary: {
        model: 'Registration capture and member page shells are available through Backy content systems; credentialed public member sessions stay separated from private admin users and are enforced through configured Supabase/Auth readiness.',
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
        'Use Supabase Auth settings to enforce credentialed sessions on the seeded member pages.',
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
    memberAccessHandoff,
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
  const memberAccessHandoffText = useMemo(() => JSON.stringify(memberAccessHandoff, null, 2), [memberAccessHandoff]);
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
  const registrationMembershipStep = MEMBERSHIP_HANDOFF_STEPS.find((step) => 'template' in step && step.template === 'registration') || MEMBERSHIP_HANDOFF_STEPS[0];
  const authMembershipStep = MEMBERSHIP_HANDOFF_STEPS.find((step) => step.to === '/settings') || MEMBERSHIP_HANDOFF_STEPS[MEMBERSHIP_HANDOFF_STEPS.length - 1];

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
          disabled={userInviteActionDisabled}
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
        aria-invalid={Boolean(userImportInlineError)}
        aria-describedby={userImportInlineError ? 'users-import-inline-error' : undefined}
        onChange={(event) => void handleImportUsers(
          event.currentTarget.files?.[0],
          event.currentTarget.dataset.importDryRun === 'true',
        )}
      />
      <span
        id={usersCommandSecondaryActionStatusId}
        className="sr-only"
        data-testid="users-command-secondary-action-status"
        aria-live="polite"
      >
        {usersCommandSecondaryActionStatus}
      </span>
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
          <div className="flex flex-col gap-2 xl:items-end">
            <div className="flex flex-wrap items-center gap-2 xl:justify-end" data-testid="users-primary-actions">
              <Button
                type="button"
                variant="primary"
                onClick={openInviteUser}
                disabled={userInviteActionDisabled}
                title={!canCreateUsers ? createPermissionTitle : undefined}
                iconStart={<Send className="size-4" />}
                data-testid="users-command-invite"
              >
                Invite user
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={userImportActionDisabled}
                title={importMode === 'upsert' && !canManageUsers ? managePermissionTitle : !canCreateUsers ? createPermissionTitle : undefined}
                onClick={() => openImportFile(false)}
                iconStart={<Upload className="size-4" />}
                aria-describedby={userImportInlineError ? 'users-import-inline-error' : undefined}
                data-testid="users-import-button"
              >
                {isImportingUsers ? 'Importing...' : 'Import CSV'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={userImportActionDisabled}
                title={importMode === 'upsert' && !canManageUsers ? managePermissionTitle : !canCreateUsers ? createPermissionTitle : undefined}
                onClick={() => openImportFile(true)}
                iconStart={<ClipboardList className="size-4" />}
                aria-describedby={userImportInlineError ? 'users-import-inline-error' : undefined}
                data-testid="users-import-preview-button"
              >
                {isPreviewingImport ? 'Previewing...' : 'Preview CSV'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadUsers()}
                disabled={isUsersBusy || !canViewUsers}
                title={!canViewUsers ? viewPermissionTitle : undefined}
                iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}
                data-testid="users-command-refresh"
              >
                Refresh users
              </Button>
            </div>
            <details
              className="group relative self-start xl:self-end"
              aria-describedby={usersCommandSecondaryActionStatusId}
              data-action-state={usersCommandSecondaryActionState}
              data-action-status={usersCommandSecondaryActionStatus}
              data-testid="users-secondary-actions"
              data-default-collapsed="true"
            >
              <summary
                className="inline-flex min-h-9 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-ring group-open:bg-accent [&::-webkit-details-marker]:hidden"
                data-testid="users-more-actions"
              >
                <MoreHorizontal className="size-4" />
                More actions
              </summary>
              <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-popover p-2 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:w-72" data-testid="users-secondary-action-menu">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(usersCommandExportDisabledReason)}
                  title={usersCommandExportDisabledReason || 'Export visible users as CSV.'}
                  onClick={handleExportUsers}
                  className="w-full justify-start"
                  iconStart={<Download className="size-4" />}
                  aria-describedby={usersCommandSecondaryActionStatusId}
                  data-action-state={usersCommandExportDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={usersCommandExportActionStatus}
                  data-disabled-reason={usersCommandExportDisabledReason || undefined}
                  data-testid="users-command-export-csv"
                >
                  Export CSV
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(usersCommandCsvTemplateDisabledReason)}
                  title={usersCommandCsvTemplateDisabledReason || 'Download a user import CSV template.'}
                  onClick={downloadUserImportTemplate}
                  className="w-full justify-start"
                  iconStart={<Download className="size-4" />}
                  aria-describedby={usersCommandSecondaryActionStatusId}
                  data-action-state={usersCommandCsvTemplateDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={usersCommandCsvTemplateActionStatus}
                  data-disabled-reason={usersCommandCsvTemplateDisabledReason || undefined}
                  data-testid="users-command-csv-template"
                >
                  CSV template
                </Button>
                <label className="flex flex-col gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Import duplicate handling
                  <select
                    value={importMode}
                    disabled={Boolean(usersCommandImportModeDisabledReason)}
                    title={usersCommandImportModeDisabledReason || 'Choose how CSV import handles duplicate emails.'}
                    onChange={(event) => {
                      setImportMode(event.target.value === 'upsert' ? 'upsert' : 'create');
                      setUserImportInlineError(null);
                    }}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="User import duplicate handling"
                    aria-describedby={usersCommandImportModeDescribedBy}
                    data-action-state={usersCommandImportModeDisabledReason ? 'blocked' : 'ready'}
                    data-action-status={usersCommandImportModeActionStatus}
                    data-disabled-reason={usersCommandImportModeDisabledReason || undefined}
                    data-testid="users-command-import-mode"
                  >
                    <option value="create">Skip duplicates</option>
                    <option value="upsert">Update duplicates</option>
                  </select>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(usersCommandCopyDisabledReason)}
                  title={usersCommandCopyDisabledReason || 'Copy the users handoff manifest.'}
                  onClick={() => void copyUserApiText(userHandoffText, 'Users handoff manifest')}
                  className="w-full justify-start"
                  iconStart={<Copy className="size-4" />}
                  aria-describedby={usersCommandSecondaryActionStatusId}
                  data-action-state={usersCommandCopyDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={usersCommandCopyActionStatus}
                  data-disabled-reason={usersCommandCopyDisabledReason || undefined}
                  data-testid="users-command-copy-manifest"
                >
                  Copy manifest
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(usersCommandDownloadDisabledReason)}
                  title={usersCommandDownloadDisabledReason || 'Download the users handoff manifest.'}
                  onClick={downloadUserHandoff}
                  className="w-full justify-start"
                  iconStart={<Download className="size-4" />}
                  aria-describedby={usersCommandSecondaryActionStatusId}
                  data-action-state={usersCommandDownloadDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={usersCommandDownloadActionStatus}
                  data-disabled-reason={usersCommandDownloadDisabledReason || undefined}
                  data-testid="users-command-download-json"
                >
                  Download JSON
                </Button>
              </div>
            </details>
          </div>
        </div>
        {userImportInlineError && (
          <div
            id="users-import-inline-error"
            role="alert"
            data-testid="users-import-inline-error"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {userImportInlineError}
          </div>
        )}

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

        <details className="group mt-4 overflow-hidden rounded-lg border border-border bg-background" data-testid="users-control-map-details" data-default-collapsed="true">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm font-semibold text-foreground">Users control map</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Jump links for access health, API contracts, directory controls, people, and role permissions.
              </span>
            </span>
            <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show map</span>
            <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide map</span>
          </summary>
          <div className="border-t border-border p-4" data-testid="users-control-map">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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
        </details>
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
          <details
            id="users-api"
            className="group scroll-mt-24 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
            data-testid="users-api-details"
            data-default-collapsed="true"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">User access API</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  API URLs, import/export controls, readiness checks, and custom frontend handoff JSON.
                </span>
              </span>
              <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show API</span>
              <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide API</span>
            </summary>
            <div className="border-t border-border">
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
	                    disabled={userImportActionDisabled}
	                    title={importMode === 'upsert' && !canManageUsers ? managePermissionTitle : !canCreateUsers ? createPermissionTitle : undefined}
                    onClick={() => openImportFile(true)}
                    iconStart={<ClipboardList className="size-4" />}
                    aria-describedby={userImportInlineError ? 'users-import-inline-error' : undefined}
                    data-testid="users-api-import-preview-button"
                  >
                    Preview CSV
                  </Button>
	                  <Button
	                    type="button"
	                    variant="outline"
	                    disabled={userImportActionDisabled}
	                    title={importMode === 'upsert' && !canManageUsers ? managePermissionTitle : !canCreateUsers ? createPermissionTitle : undefined}
                    onClick={() => openImportFile(false)}
                    iconStart={<Upload className="size-4" />}
                    aria-describedby={userImportInlineError ? 'users-import-inline-error' : undefined}
                    data-testid="users-api-import-button"
                  >
                    Import CSV
                  </Button>
	                  <select
	                    value={importMode}
	                    disabled={Boolean(usersCommandImportModeDisabledReason)}
	                    title={usersCommandImportModeDisabledReason || 'Choose how CSV import handles duplicate emails.'}
                    onChange={(event) => {
                      setImportMode(event.target.value === 'upsert' ? 'upsert' : 'create');
                      setUserImportInlineError(null);
                    }}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="User API import duplicate handling"
                    aria-describedby={userImportInlineError ? 'users-import-inline-error' : undefined}
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
            </div>
          </details>

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
                      onClick={() => setPendingImportRollback(true)}
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

            <div
              className="mt-4 rounded-lg border border-border bg-background p-3"
              role="group"
              aria-label="Selected user bulk actions"
              aria-describedby={`${usersBulkSelectionSummaryId} ${usersBulkActionStatusId}`}
              data-testid="users-bulk-actions"
              data-action-state={usersBulkGroupActionState}
              data-action-status={usersBulkActionStatus}
              data-selected-count={selectedActionableUsers.length}
              data-visible-selected-count={selectedVisibleActionableUsers.length}
              data-hidden-selected-count={hiddenSelectedUserCount}
            >
              <span id={usersBulkActionStatusId} className="sr-only" data-testid="users-bulk-action-status" aria-live="polite">
                {usersBulkActionStatus}
              </span>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={Boolean(usersBulkSelectionDisabledReason)}
                      title={usersBulkSelectionDisabledReason || undefined}
                      onChange={(event) => toggleVisibleSelection(event.target.checked)}
                      className="size-4 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Select visible non-current users"
                      aria-describedby={usersBulkActionStatusId}
                      data-action-state={usersBulkSelectionDisabledReason ? 'blocked' : 'ready'}
                      data-action-status={usersBulkActionStatus}
                      data-disabled-reason={usersBulkSelectionDisabledReason || undefined}
                      data-testid="users-bulk-select-visible"
                    />
                    Select visible
                  </label>
                  <span
                    id={usersBulkSelectionSummaryId}
                    className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
                    data-testid="users-bulk-selection-summary"
                  >
                    {selectedActionableUsers.length} selected
                    {selectedVisibleActionableUsers.length !== selectedActionableUsers.length ? ` · ${selectedVisibleActionableUsers.length} visible` : ''}
                    {hiddenSelectedUserCount > 0 ? ` · ${hiddenSelectedUserCount} outside this view` : ''}
                  </span>
                  {selectedUserIds.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={Boolean(usersBulkClearDisabledReason)}
                      title={usersBulkClearDisabledReason || undefined}
                      aria-describedby={usersBulkActionStatusId}
                      data-action-state={usersBulkClearDisabledReason ? 'blocked' : 'ready'}
                      data-action-status={usersBulkActionStatus}
                      data-disabled-reason={usersBulkClearDisabledReason || undefined}
                      onClick={() => setSelectedUserIds([])}
                      data-testid="users-bulk-clear-selection"
                    >
                      Clear
                    </Button>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={bulkStatus}
                    disabled={Boolean(usersBulkStatusDisabledReason)}
                    title={usersBulkStatusDisabledReason || undefined}
                    onChange={(event) => setBulkStatus(event.target.value as UserStatus)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Bulk status"
                    aria-describedby={usersBulkActionStatusId}
                    data-action-state={usersBulkStatusDisabledReason ? 'blocked' : 'ready'}
                    data-action-status={usersBulkActionStatus}
                    data-disabled-reason={usersBulkStatusDisabledReason || undefined}
                    data-testid="users-bulk-status-select"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={Boolean(usersBulkStatusDisabledReason)}
                    title={usersBulkStatusDisabledReason || undefined}
                    aria-describedby={usersBulkActionStatusId}
                    data-action-state={usersBulkStatusDisabledReason ? 'blocked' : 'ready'}
                    data-action-status={usersBulkActionStatus}
                    data-disabled-reason={usersBulkStatusDisabledReason || undefined}
                    onClick={() => void handleBulkStatusUpdate()}
                    iconStart={<Check className="size-4" />}
                    data-testid="users-bulk-apply-status"
                  >
                    Apply status
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={Boolean(usersBulkDeleteActionDisabledReason)}
                    title={usersBulkDeleteActionDisabledReason || undefined}
                    aria-describedby={usersBulkActionStatusId}
                    data-action-state={usersBulkDeleteActionDisabledReason ? 'blocked' : 'ready'}
                    data-action-status={usersBulkActionStatus}
                    data-disabled-reason={usersBulkDeleteActionDisabledReason || undefined}
                    onClick={() => setPendingBulkDelete(true)}
                    iconStart={<Trash2 className="size-4" />}
                    data-testid="users-bulk-delete"
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
              tableMinWidth="1200px"
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
	                        disabled={userInviteActionDisabled}
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
                    onClick={() => openMembershipStep(registrationMembershipStep)}
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
                    onClick={() => openMembershipStep(authMembershipStep)}
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
                      Working Backy surfaces for registration, member pages, and the provider handoff that enforces credentialed sessions.
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
                      Public registration and member page shells are available today. Credentialed public member sessions stay separate from private Backy admin users and are enforced through the Supabase/Auth provider pass.
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

              <div data-testid="users-member-access-handoff" className="mt-4 rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Custom frontend member handoff</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {MEMBER_ACCESS_HANDOFF_SCHEMA_VERSION} packages the page templates, public form APIs, editable regions, member bindings, provider gate, and privacy boundary for external member-area frontends.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isUsersBusy}
                    onClick={() => void copyUserApiText(memberAccessHandoffText, 'Member access handoff')}
                    iconStart={<Copy className="size-3.5" />}
                  >
                    Copy member handoff
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <UserApiStat label="Editable regions" value={`${MEMBERSHIP_EDITABLE_REGIONS.length}`} />
                  <UserApiStat label="Data bindings" value={`${MEMBERSHIP_DATA_BINDINGS.length}`} />
                  <UserApiStat label="Action bindings" value={`${MEMBERSHIP_ACTION_BINDINGS.length}`} />
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-3">
                  <UserApiSnippet label="Registration template" value={memberAccessHandoff.pageTemplates.registration} />
                  <UserApiSnippet label="Member login template" value={memberAccessHandoff.pageTemplates.memberLogin} />
                  <UserApiSnippet label="Member account template" value={memberAccessHandoff.pageTemplates.memberAccount} />
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
              title="Access workflows"
              description="Direct controls for common account and permission work."
              icon={<SlidersHorizontal className="size-4" />}
            />
            <PanelContent>
              <div className="grid gap-3 text-sm" data-testid="users-access-workflows-panel">
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="font-semibold">User detail drill-down</div>
                  <p className="mt-1 text-muted-foreground">
                    Open a selected or visible account to review sessions, MFA, invite/reset links, ownership transfer, and user-scoped audit events.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={openAccessWorkflowUser}
                    disabled={isUsersBusy || !accessWorkflowUser}
                    data-testid="users-access-open-detail"
                  >
                    {accessWorkflowUser ? `Open ${accessWorkflowUser.fullName}` : 'Open user detail'}
                  </Button>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="font-semibold">Invite and reset delivery</div>
                  <p className="mt-1 text-muted-foreground">
                    Create an invite through the backend delivery stack, then use user detail for resend, reset, recovery, and delivery audit evidence.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
	                      type="button"
	                      size="sm"
	                      variant="outline"
	                      onClick={openInviteUser}
	                      disabled={userInviteActionDisabled}
	                      title={!canCreateUsers ? createPermissionTitle : undefined}
                      data-testid="users-access-invite"
                    >
                      Invite user
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate({ to: '/settings', search: { tab: 'infrastructure' } })}
                      disabled={isUsersBusy}
                      data-testid="users-access-delivery-settings"
                    >
                      Delivery settings
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="font-semibold">Workspace and module permissions</div>
                  <p className="mt-1 text-muted-foreground">
                    Team ownership gates site access, while the user permission matrix controls Products, Orders, Media, Settings, and Activity capabilities.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate({ to: '/teams' })}
                      disabled={isUsersBusy}
                      data-testid="users-access-teams"
                    >
                      Manage teams
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={openAccessWorkflowUser}
                      disabled={isUsersBusy || !accessWorkflowUser}
                      data-testid="users-access-permissions"
                    >
                      Review permissions
                    </Button>
                  </div>
                </div>
              </div>
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
          aria-describedby={`${usersBulkDeleteDialogDescriptionId} ${usersBulkDeleteDialogStatusId}`}
          data-testid="users-bulk-delete-confirm-dialog"
          data-action-state={usersBulkDeleteConfirmDisabledReason ? isUserMutationBusy ? 'busy' : 'blocked' : 'ready'}
          data-action-status={`${usersBulkDeleteCancelActionStatus} ${usersBulkDeleteConfirmActionStatus}`}
          data-selected-count={selectedActionableUsers.length}
          data-hidden-selected-count={hiddenSelectedUserCount}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <span id={usersBulkDeleteDialogStatusId} className="sr-only" data-testid="users-bulk-delete-confirm-action-status" aria-live="polite">
              {usersBulkDeleteCancelActionStatus} {usersBulkDeleteConfirmActionStatus}
            </span>
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 id="users-bulk-delete-confirm-title" className="text-lg font-semibold text-foreground">Remove selected users?</h2>
                <p id={usersBulkDeleteDialogDescriptionId} className="mt-1 text-sm text-muted-foreground">
                  {`This revokes admin access for ${selectedActionableUsers.length} selected account${selectedActionableUsers.length === 1 ? '' : 's'}${hiddenSelectedUserCount > 0 ? `, including ${hiddenSelectedUserCount} outside this filtered view` : ''}. Current-session users stay locked.`}
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
                aria-describedby={usersBulkDeleteDialogStatusId}
                data-testid="users-bulk-delete-cancel"
                data-action-state={isUserMutationBusy ? 'busy' : 'ready'}
                data-action-status={usersBulkDeleteCancelActionStatus}
                data-disabled-reason={isUserMutationBusy ? 'Bulk user deletion is already running.' : undefined}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDeleteUsers()}
                disabled={Boolean(usersBulkDeleteConfirmDisabledReason)}
                aria-describedby={usersBulkDeleteDialogStatusId}
                data-testid="users-bulk-delete-confirm"
                data-action-state={usersBulkDeleteConfirmDisabledReason ? isUserMutationBusy ? 'busy' : 'blocked' : 'ready'}
                data-action-status={usersBulkDeleteConfirmActionStatus}
                data-disabled-reason={usersBulkDeleteConfirmDisabledReason || undefined}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUserMutationBusy ? 'Removing...' : 'Remove selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingImportRollback && importResult?.rollbackAvailable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="users-import-rollback-confirm-title"
          aria-describedby="users-import-rollback-confirm-description"
          data-testid="users-import-rollback-confirm-dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                <History className="h-5 w-5" />
              </span>
              <div>
                <h2 id="users-import-rollback-confirm-title" className="text-lg font-semibold text-foreground">Roll back imported users?</h2>
                <p id="users-import-rollback-confirm-description" className="mt-1 text-sm text-muted-foreground">
                  Backy will delete users created by this import batch and restore user records that were updated during the import. Existing unrelated users stay unchanged.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
              <div>
                <div className="font-semibold text-foreground">{importResult.created}</div>
                <div>created</div>
              </div>
              <div>
                <div className="font-semibold text-foreground">{importResult.updated}</div>
                <div>updated</div>
              </div>
              <div>
                <div className="font-semibold text-foreground">{importResult.skipped}</div>
                <div>skipped</div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!isRollingBackImport) {
                    setPendingImportRollback(false);
                  }
                }}
                disabled={isRollingBackImport}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Cancel user import rollback"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRollbackImport()}
                disabled={isRollingBackImport || !canManageUsers || !canDeleteUsers}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Confirm user import rollback"
                data-testid="users-import-rollback-confirm"
              >
                {isRollingBackImport ? 'Rolling back...' : 'Roll back import'}
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
    return `${getLocalBackendOrigin()}/api/admin`;
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin());
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
    return getLocalBackendOrigin();
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin());
  return base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '');
};

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};

const normalizeUserImportHeader = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, '_');

const parseUserImportCsvRows = (csv: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cellValue) => cellValue.trim()));
};

const findUserImportColumn = (headers: string[], aliases: readonly string[]) => (
  aliases.map((alias) => headers.indexOf(alias)).find((index) => index !== -1) ?? -1
);

const validateUserImportCsvFile = async (file: File): Promise<{ csv: string; error: string | null }> => {
  const lowerName = file.name.trim().toLowerCase();
  const lowerType = file.type.trim().toLowerCase();
  const hasCsvName = lowerName.endsWith('.csv');
  const hasCsvType = lowerType.includes('csv');

  if (lowerName && !hasCsvName && !hasCsvType) {
    return { csv: '', error: 'Upload a .csv file exported from the Backy users template.' };
  }

  const csv = await file.text();
  const table = parseUserImportCsvRows(csv);
  if (table.length === 0) {
    return { csv, error: 'Users import CSV is empty.' };
  }

  const headers = table[0].map(normalizeUserImportHeader);
  const nameIndex = findUserImportColumn(headers, USER_IMPORT_NAME_HEADERS);
  const emailIndex = findUserImportColumn(headers, USER_IMPORT_EMAIL_HEADERS);
  const roleIndex = findUserImportColumn(headers, ['role']);
  const statusIndex = findUserImportColumn(headers, ['status']);
  const missingColumns = [
    nameIndex === -1 ? USER_IMPORT_REQUIRED_COLUMNS[0] : null,
    emailIndex === -1 ? USER_IMPORT_REQUIRED_COLUMNS[1] : null,
  ].filter((value): value is (typeof USER_IMPORT_REQUIRED_COLUMNS)[number] => Boolean(value));

  if (missingColumns.length > 0) {
    return { csv, error: `Users import CSV is missing required columns: ${missingColumns.join(', ')}.` };
  }

  const dataRows = table.slice(1);
  if (dataRows.length === 0) {
    return { csv, error: 'Users import CSV needs at least one user row.' };
  }

  const seenEmails = new Set<string>();
  const rowErrors: string[] = [];
  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const fullName = (cells[nameIndex] || '').trim();
    const email = (cells[emailIndex] || '').trim().toLowerCase();
    const role = roleIndex === -1 ? 'viewer' : (cells[roleIndex] || 'viewer').trim().toLowerCase();
    const status = statusIndex === -1 ? 'invited' : (cells[statusIndex] || 'invited').trim().toLowerCase();

    if (!fullName) {
      rowErrors.push(`Row ${rowNumber}: full name is required.`);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rowErrors.push(`Row ${rowNumber}: enter a valid email address.`);
      return;
    }

    if (!USER_IMPORT_ROLES.some((option) => option === role)) {
      rowErrors.push(`Row ${rowNumber}: role must be owner, admin, editor, or viewer.`);
      return;
    }

    if (!USER_IMPORT_STATUSES.some((option) => option === status)) {
      rowErrors.push(`Row ${rowNumber}: status must be active, inactive, invited, or suspended.`);
      return;
    }

    if (seenEmails.has(email)) {
      rowErrors.push(`Row ${rowNumber}: duplicate email appears more than once in the CSV.`);
      return;
    }

    seenEmails.add(email);
  });

  if (rowErrors.length > 0) {
    const visibleErrors = rowErrors.slice(0, 3).join(' ');
    const hiddenCount = rowErrors.length - 3;
    const hiddenCopy = hiddenCount > 0 ? ` ${hiddenCount} more issue${hiddenCount === 1 ? '' : 's'} hidden.` : '';
    return { csv, error: `Fix users import CSV before uploading: ${visibleErrors}${hiddenCopy}` };
  }

  return { csv, error: null };
};

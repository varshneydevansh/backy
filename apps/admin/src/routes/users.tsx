/**
 * BACKY CMS - USERS PAGE
 *
 * Team access control for owners, admins, editors, and viewers.
 */

import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Edit,
  Filter,
  KeyRound,
  LockKeyhole,
  Mail,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  SlidersHorizontal,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataGrid } from '@/components/ui/DataGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { cn } from '@/lib/utils';
import {
  deleteUser as deleteBackendUser,
  listUsers,
  updateUser as updateBackendUser,
} from '@/lib/adminContentApi';
import { useStore, type User as UserType } from '@/stores/mockStore';

export const Route = createFileRoute('/users')({
  component: UsersLayout,
});

type UserRole = UserType['role'];
type UserStatus = UserType['status'];

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
  const { users, setUsers } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserType | null>(null);
  const adminBaseUrl = useMemo(() => getAdminBaseUrl(), []);
  const usersListUrl = `${adminBaseUrl}/users`;
  const userDetailUrl = `${adminBaseUrl}/users/{userId}`;

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const backendUsers = await listUsers();
      setUsers(backendUsers);
      setNotice(null);
    } catch {
      setNotice('Using local fallback users because the backend users API is unavailable.');
    } finally {
      setIsLoading(false);
    }
  }, [setUsers]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

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
  }, [users]);

  const filteredUsers = useMemo(() => (
    users.filter((user) => {
      const roleMatches = roleFilter === 'all' || user.role === roleFilter;
      const statusMatches = statusFilter === 'all' || user.status === statusFilter;
      return roleMatches && statusMatches;
    })
  ), [roleFilter, statusFilter, users]);

  const handlePatchUser = async (user: UserType, updates: Partial<Pick<UserType, 'role' | 'status'>>) => {
    setUpdatingUserId(user.id);
    setNotice(null);

    try {
      const saved = await updateBackendUser(user.id, updates);
      setUsers(users.map((item) => (item.id === user.id ? saved : item)));
      setNotice(`${saved.fullName} was updated.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Backend update failed. The user was not changed.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!pendingDelete) return;

    setUpdatingUserId(pendingDelete.id);
    setNotice(null);

    try {
      await deleteBackendUser(pendingDelete.id);
      setUsers(users.filter((user) => user.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Backend delete failed. The user was not removed.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const copyUserApiText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  const handleExportUsers = () => {
    if (data.length === 0) return;

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

  const columns: Column<UserType>[] = [
    {
      key: 'fullName',
      label: 'Person',
      sortable: true,
      render: (user) => (
        <button
          type="button"
          onClick={() => navigate({ to: '/users/$userId', params: { userId: user.id } })}
          className="group flex min-w-[240px] items-center gap-3 text-left"
        >
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white shadow-sm">
            {getInitials(user.fullName)}
            <span className={cn(
              'absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-card',
              user.status === 'active' ? 'bg-emerald-500' : user.status === 'invited' ? 'bg-amber-400' : 'bg-slate-300',
            )} />
          </span>
          <span>
            <span className="block font-semibold text-foreground group-hover:text-primary">{user.fullName}</span>
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
          <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-semibold', roleBadgeClass[user.role])}>
            {roleLabel(user.role)}
          </span>
          <select
            value={user.role}
            disabled={updatingUserId === user.id}
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
          <StatusBadge status={user.status} />
          <select
            value={user.status}
            disabled={updatingUserId === user.id}
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
            onClick={() => navigate({ to: '/users/$userId', params: { userId: user.id } })}
            className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={`Edit ${user.fullName}`}
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(user)}
            disabled={updatingUserId === user.id}
            className="rounded-lg border border-red-200 p-2 text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-50"
            aria-label={`Remove ${user.fullName}`}
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

  const hasActiveFilters = searchQuery || roleFilter !== 'all' || statusFilter !== 'all';

  return (
    <PageShell
      title="Users"
      description="Control team access, invitation state, and publishing authority."
      action={
        <Link
          to="/users/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <Send className="h-4 w-4" />
          Invite user
        </Link>
      }
      className="w-full"
    >
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
              disabled={data.length === 0}
              onClick={handleExportUsers}
              iconStart={<Download className="size-4" />}
            >
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadUsers()}
              disabled={isLoading}
              iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}
            >
              Refresh users
            </Button>
            <Link to="/users/new">
              <Button iconStart={<Send className="size-4" />}>
                Invite user
              </Button>
            </Link>
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
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
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
                    disabled={data.length === 0}
                    onClick={handleExportUsers}
                    iconStart={<Download className="size-4" />}
                  >
                    Export CSV
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copyUserApiText(usersListUrl, 'Users API URL')}
                    iconStart={<Copy className="size-4" />}
                  >
                    Copy API
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
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                  aria-label="Search users"
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Filter className="h-4 w-4" />
                  <select
                    value={roleFilter}
                    onChange={(event) => {
                      setRoleFilter(event.target.value as 'all' | UserRole);
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring"
                    aria-label="Filter users by role"
                  >
                    <option value="all">All roles</option>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </label>

                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as 'all' | UserStatus);
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring"
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
                  disabled={isLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  aria-label="Refresh users"
                >
                  <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                  Refresh
                </button>
              </div>
            </div>

            {notice && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {notice}
              </div>
            )}
          </div>

          <div id="users-directory" className="scroll-mt-24">
            <DataGrid
              columns={columns}
              data={data}
              loading={isLoading}
              sortConfig={sortConfig}
              onSort={handleSort}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
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
                        onClick={() => {
                          setSearchQuery('');
                          setRoleFilter('all');
                          setStatusFilter('all');
                          setCurrentPage(1);
                        }}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
                      >
                        Clear filters
                      </button>
                    ) : (
                      <Link
                        to="/users/new"
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                      >
                        <Plus className="h-4 w-4" />
                        Invite user
                      </Link>
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

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Remove {pendingDelete.fullName}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This revokes admin access immediately. Backy keeps content they created, but this account will no longer be able to sign in.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteUser()}
                disabled={updatingUserId === pendingDelete.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                Remove user
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

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};

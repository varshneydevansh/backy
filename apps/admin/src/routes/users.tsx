/**
 * BACKY CMS - USERS PAGE
 *
 * Team access control for owners, admins, editors, and viewers.
 */

import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  Edit,
  Filter,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataGrid } from '@/components/ui/DataGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/layout/PageShell';
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
          <Plus className="h-4 w-4" />
          Invite user
        </Link>
      }
      className="mx-auto max-w-7xl"
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search name, email, role, or status..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
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

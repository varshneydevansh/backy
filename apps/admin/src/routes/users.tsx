/**
 * BACKY CMS - USERS PAGE
 * 
 * Layout route that shows list at /users, renders child routes otherwise.
 */

import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { Plus, User, MoreVertical, Edit, Trash2, Mail } from 'lucide-react';
import { useStore, type User as UserType } from '@/stores/mockStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { PageShell } from '@/components/layout/PageShell';
import { DataGrid } from '@/components/ui/DataGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useState } from 'react';

export const Route = createFileRoute('/users')({
  component: UsersLayout,
});

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
  const { users, deleteUser } = useStore();

  const columns: Column<UserType>[] = [
    {
      key: 'fullName',
      label: 'Name',
      sortable: true,
      render: (user) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="font-medium text-primary">{user.fullName.charAt(0)}</span>
          </div>
          <div>
            <div className="font-medium text-foreground">{user.fullName}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (user) => (
        <span className="capitalize">{user.role}</span>
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (user) => <StatusBadge status={user.status} />
    },
    {
      key: 'lastActive',
      label: 'Last Active',
      sortable: true,
      render: (user) => <span className="text-muted-foreground">{user.lastActive}</span>
    },
    {
      key: 'actions',
      label: '',
      render: (user) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => navigate({ to: '/users/$userId', params: { userId: user.id } })}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (confirm('Remove this user?')) deleteUser(user.id);
            }}
            className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
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
    totalItems
  } = useDataTable({
    data: users,
    columns,
    pageSize: 10
  });

  return (
    <PageShell
      title="Team Members"
      description="Manage access and roles for your team."
      action={
        <Link
          to="/users/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Invite User
        </Link>
      }
    >
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <DataGrid
        columns={columns}
        data={data}
        sortConfig={sortConfig}
        onSort={handleSort}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={totalItems}
        emptyState={
          <EmptyState
            icon={User}
            title="No users found"
            description="Invite team members to collaborate."
            action={
              <Link
                to="/users/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 mt-4"
              >
                <Plus className="w-4 h-4" />
                Invite User
              </Link>
            }
          />
        }
      />
    </PageShell>
  );
}

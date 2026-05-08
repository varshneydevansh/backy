/**
 * BACKY CMS - EDIT USER PAGE
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  Save,
  Shield,
  ShieldAlert,
  Trash2,
  UserRound,
} from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import {
  deleteUser as deleteBackendUser,
  getUser as getBackendUser,
  updateUser as updateBackendUser,
} from '@/lib/adminContentApi';
import { useStore, type User } from '@/stores/mockStore';

export const Route = createFileRoute('/users/$userId')({
  component: EditUserPage,
});

type UserRole = User['role'];
type UserStatus = User['status'];

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; detail: string }> = [
  { value: 'owner', label: 'Owner', detail: 'Complete workspace authority, billing, settings, users, and publishing.' },
  { value: 'admin', label: 'Admin', detail: 'Runs sites, content, media, products, forms, comments, and team access.' },
  { value: 'editor', label: 'Editor', detail: 'Builds pages, writes posts, manages media, and updates public content.' },
  { value: 'viewer', label: 'Viewer', detail: 'Reviews workspace data without making changes.' },
];

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string; detail: string }> = [
  { value: 'active', label: 'Active', detail: 'Can sign in and use the workspace.' },
  { value: 'invited', label: 'Invited', detail: 'Invitation exists, but the person has not joined yet.' },
  { value: 'inactive', label: 'Inactive', detail: 'Kept for records without active access.' },
  { value: 'suspended', label: 'Suspended', detail: 'Blocked until an admin restores access.' },
];

const getInitials = (name: string) => (
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'
);

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function EditUserPage() {
  const navigate = useNavigate();
  const { userId } = Route.useParams();
  const { users, setUsers } = useStore();
  const user = users.find((item) => item.id === userId);

  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState<{
    fullName: string;
    email: string;
    role: UserRole;
    status: UserStatus;
  }>({
    fullName: '',
    email: '',
    role: 'editor',
    status: 'invited',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      });
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      try {
        const backendUser = await getBackendUser(userId);
        if (!cancelled) {
          setUsers([
            backendUser,
            ...users.filter((item) => item.id !== backendUser.id),
          ]);
          setNotice(null);
        }
      } catch {
        if (!cancelled) {
          setNotice('Using local fallback user data because the backend users API is unavailable.');
        }
      }
    };

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [setUsers, userId]);

  const selectedRole = useMemo(
    () => ROLE_OPTIONS.find((role) => role.value === formData.role) || ROLE_OPTIONS[2],
    [formData.role],
  );
  const selectedStatus = useMemo(
    () => STATUS_OPTIONS.find((status) => status.value === formData.status) || STATUS_OPTIONS[1],
    [formData.status],
  );
  const canSubmit = formData.fullName.trim().length > 1 && isValidEmail(formData.email);

  if (!user) {
    return (
      <PageShell title="User not found" description="The user you requested does not exist.">
        <button
          type="button"
          onClick={() => navigate({ to: '/users' })}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </button>
      </PageShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) {
      setNotice('Enter a full name and a valid email address before saving.');
      return;
    }

    setIsLoading(true);
    setNotice(null);

    try {
      const saved = await updateBackendUser(userId, {
        fullName: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        role: formData.role,
        status: formData.status,
      });
      setUsers(users.map((item) => (item.id === userId ? saved : item)));
      navigate({ to: '/users' });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Backend save failed. Changes were not persisted.');
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    setNotice(null);

    try {
      await deleteBackendUser(userId);
      setUsers(users.filter((item) => item.id !== userId));
      navigate({ to: '/users' });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Backend delete failed. The user was not removed.');
      setIsLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const resetMailTo = `mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent('Reset your Backy access')}&body=${encodeURIComponent(`Hi ${user.fullName},\n\nPlease reset your Backy access before continuing work in the admin workspace.`)}`;

  return (
    <PageShell
      title="Edit user"
      description={`Manage access for ${user.fullName}.`}
      action={
        <button
          type="button"
          onClick={() => navigate({ to: '/users' })}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          Users
        </button>
      }
      className="mx-auto max-w-6xl"
    >
      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-900 text-base font-semibold text-white">
                  {getInitials(user.fullName)}
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{user.fullName}</h2>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <StatusBadge status={user.status} />
            </div>

            {notice && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {notice}
              </div>
            )}

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Full name</span>
                <div className="relative mt-2">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Email address</span>
                <div className="relative mt-2">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                <Shield className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-foreground">Role and account state</h2>
                <p className="mt-1 text-sm text-muted-foreground">These controls are persisted through the users API.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Role</span>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">{selectedRole.detail}</span>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Status</span>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as UserStatus })}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">{selectedStatus.detail}</span>
              </label>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Access summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Role</dt>
                <dd className="mt-1 font-semibold text-foreground">{selectedRole.label}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                <dd className="mt-1 font-semibold text-foreground">{selectedStatus.label}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Last activity</dt>
                <dd className="mt-1 text-foreground">{user.lastActive}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Account help</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Until the auth/email pass lands, reset help opens a prefilled email to this user.
                </p>
              </div>
            </div>
            <a
              href={resetMailTo}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Mail className="h-4 w-4" />
              Email reset instructions
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </section>

          <section className="rounded-lg border border-red-200 bg-red-50 p-5">
            <h2 className="text-sm font-semibold text-red-800">Danger zone</h2>
            <p className="mt-1 text-sm text-red-700">
              Removing a user revokes their admin access. Backy prevents removing the last active owner or admin.
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              <Trash2 className="h-4 w-4" />
              Remove user
            </button>
          </section>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={isLoading || !canSubmit}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring',
                'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
              )}
            >
              <Save className="h-4 w-4" />
              {isLoading ? 'Saving...' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: '/users' })}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </aside>
      </form>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Remove {user.fullName}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This account will lose Backy admin access immediately. Content history stays intact.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isLoading}
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

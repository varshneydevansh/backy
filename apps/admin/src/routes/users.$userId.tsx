/**
 * BACKY CMS - EDIT USER PAGE
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Code2,
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  Mail,
  Save,
  Shield,
  ShieldAlert,
  Trash2,
  UserRound,
} from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import {
  deleteUser as deleteBackendUser,
  getAdminApiBase,
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

const ROLE_CAPABILITIES: Array<{ label: string; roles: UserRole[] }> = [
  { label: 'View dashboards, sites, content, submissions, and reports', roles: ['owner', 'admin', 'editor', 'viewer'] },
  { label: 'Create and edit pages, posts, forms, collections, and media', roles: ['owner', 'admin', 'editor'] },
  { label: 'Publish content and update products or orders', roles: ['owner', 'admin', 'editor'] },
  { label: 'Manage users, settings, integrations, and API keys', roles: ['owner', 'admin'] },
  { label: 'Own billing, destructive settings, and workspace transfer', roles: ['owner'] },
];

const STATUS_OUTCOMES: Record<UserStatus, string> = {
  active: 'This user can sign in after auth accepts their credentials.',
  invited: 'This user is saved as pending and can be activated from this page.',
  inactive: 'This user stays in records without active workspace access.',
  suspended: 'This user is blocked until an admin changes the account state.',
};

const USER_DETAIL_CONTROL_AREAS = [
  {
    title: 'Identity',
    detail: 'Name, email, and persisted account record.',
    href: '#user-detail-identity',
  },
  {
    title: 'Role and status',
    detail: 'Access level, lifecycle state, and account outcome.',
    href: '#user-detail-access',
  },
  {
    title: 'Permissions',
    detail: 'Capability groups enabled or denied by the selected role.',
    href: '#user-detail-permissions',
  },
  {
    title: 'API update',
    detail: 'Payload sent to the user detail endpoint.',
    href: '#user-detail-api',
  },
  {
    title: 'Danger zone',
    detail: 'Removal guardrails and destructive access controls.',
    href: '#user-detail-danger',
  },
] as const;

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
  const userDetailUrl = useMemo(() => `${getAdminApiBase()}/users/${userId}`, [userId]);

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
  const accessReadiness = useMemo(() => {
    const enabledCapabilities = ROLE_CAPABILITIES.filter((capability) => capability.roles.includes(formData.role));
    const isPrivileged = formData.role === 'owner' || formData.role === 'admin';
    const isBlocked = formData.status === 'inactive' || formData.status === 'suspended';
    const checks = [
      {
        label: 'Account record',
        detail: user ? `${user.fullName} is loaded from ${notice ? 'local fallback' : 'the users API or store'}.` : 'Load a user before editing access.',
        ready: Boolean(user),
      },
      {
        label: 'Identity',
        detail: canSubmit ? 'Name and email are saveable.' : 'Name and valid email are required.',
        ready: canSubmit,
      },
      {
        label: 'Role scope',
        detail: `${enabledCapabilities.length} capability group${enabledCapabilities.length === 1 ? '' : 's'} enabled for ${selectedRole.label}.`,
        ready: enabledCapabilities.length > 0,
      },
      {
        label: 'Lifecycle',
        detail: STATUS_OUTCOMES[formData.status],
        ready: !isBlocked,
      },
      {
        label: 'Admin guardrail',
        detail: isPrivileged ? 'This account can control settings, integrations, and users.' : 'This account cannot manage workspace settings or users.',
        ready: true,
      },
      {
        label: 'Delete protection',
        detail: 'Backend prevents removing the last active owner or admin.',
        ready: true,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Review', detail: 'Confirm the person, status, last activity, and current permission scope.' },
        { label: 'Adjust', detail: 'Change role or lifecycle state without losing content ownership history.' },
        { label: 'Save', detail: 'Persist the user record through the backend detail endpoint.' },
        { label: 'Recover', detail: 'Use reset help, suspension, or removal when access needs intervention.' },
      ],
    };
  }, [canSubmit, formData.role, formData.status, notice, selectedRole.label, user]);

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
  const updatePayload = {
    fullName: formData.fullName.trim() || user.fullName,
    email: formData.email.trim().toLowerCase() || user.email,
    role: formData.role,
    status: formData.status,
  };
  const userDetailHandoff = {
    generatedAt: new Date().toISOString(),
    endpoint: {
      read: { method: 'GET', url: userDetailUrl },
      update: { method: 'PATCH', url: userDetailUrl },
      remove: { method: 'DELETE', url: userDetailUrl },
    },
    readiness: {
      score: accessReadiness.score,
      checks: accessReadiness.checks,
    },
    account: {
      id: user.id,
      role: user.role,
      status: user.status,
      lastActive: user.lastActive,
      hasName: Boolean(user.fullName),
      hasEmail: Boolean(user.email),
    },
    selectedState: {
      role: selectedRole,
      status: selectedStatus,
      enabledCapabilities: ROLE_CAPABILITIES
        .filter((capability) => capability.roles.includes(formData.role))
        .map((capability) => capability.label),
    },
    updatePayload,
    guardrails: [
      'Backend prevents deleting or demoting the final active owner/admin.',
      'Duplicate emails are rejected before persistence.',
      'Suspend or inactivate access before destructive removal when ownership history matters.',
    ],
  };
  const userDetailHandoffText = JSON.stringify(userDetailHandoff, null, 2);

  const copyUserDetailText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  const downloadUserDetailHandoff = () => {
    const blob = new Blob([userDetailHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `backy-user-${user.id}-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('User detail handoff manifest downloaded.');
  };

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
      className="w-full"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="user-detail-command-center">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">User access command center</h2>
                <span className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  accessReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                )}
                >
                  {accessReadiness.score}% ready
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Control this collaborator as a full access object: identity, permissions, lifecycle, recovery, API payload, and destructive guardrails.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyUserDetailText(userDetailHandoffText, 'User detail handoff manifest')}
                iconStart={<Copy className="size-4" />}
              >
                Copy manifest
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={downloadUserDetailHandoff}
                iconStart={<Download className="size-4" />}
              >
                Download JSON
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isLoading || !canSubmit}
                iconStart={<Save className="size-4" />}
              >
                {isLoading ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">Access readiness</h3>
              <p className="mt-1 text-sm text-muted-foreground">Checks whether this account can be safely edited, saved, suspended, or removed.</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', accessReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                  style={{ width: `${accessReadiness.score}%` }}
                />
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {accessReadiness.checks.map((check) => (
                  <AccessReadinessCheck key={check.label} {...check} />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Access workflow</h3>
              </div>
              <div className="mt-3 grid gap-2">
                {accessReadiness.workflow.map((step, index) => (
                  <AccessWorkflowStep key={step.label} index={index + 1} {...step} />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">User control map</h3>
            <p className="mt-1 text-sm text-muted-foreground">Jump to identity, lifecycle, permissions, API payload, and removal controls.</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              {USER_DETAIL_CONTROL_AREAS.map((area) => (
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

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-5">
          <div id="user-detail-identity" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
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

          <div id="user-detail-access" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
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

          <div id="user-detail-permissions" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-foreground">Permission preview</h2>
                <p className="mt-1 text-sm text-muted-foreground">Use this before saving to understand what the selected role unlocks.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {ROLE_CAPABILITIES.map((capability) => {
                const allowed = capability.roles.includes(formData.role);
                return (
                  <div
                    key={capability.label}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3 text-sm',
                      allowed ? 'border-emerald-200 bg-emerald-50/50 text-emerald-950' : 'border-border bg-muted/30 text-muted-foreground',
                    )}
                  >
                    <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', allowed ? 'text-emerald-600' : 'text-muted-foreground')} />
                    <span>{capability.label}</span>
                  </div>
                );
              })}
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
                <Clock3 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Status outcome</h2>
                <p className="mt-1 text-sm text-muted-foreground">{STATUS_OUTCOMES[formData.status]}</p>
              </div>
            </div>
          </section>

          <section id="user-detail-api" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <Code2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">API update</h2>
                <p className="mt-1 text-sm text-muted-foreground">Save sends this payload to the user detail endpoint.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyUserDetailText(userDetailUrl, 'User detail API URL')}
                iconStart={<Copy className="size-4" />}
              >
                Copy URL
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyUserDetailText(userDetailHandoffText, 'User detail handoff manifest')}
                iconStart={<Copy className="size-4" />}
              >
                Copy manifest
              </Button>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
{JSON.stringify(updatePayload, null, 2)}
            </pre>
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

          <section id="user-detail-danger" className="rounded-lg border border-red-200 bg-red-50 p-5 scroll-mt-24">
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
        </div>
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

function AccessReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        {ready ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        )}
        <div>
          <div className="text-sm font-semibold text-foreground">{label}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function AccessWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {index}
      </span>
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

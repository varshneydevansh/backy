/**
 * BACKY CMS - NEW USER PAGE
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Code2, Copy, Download, KeyRound, Mail, Shield, UserPlus } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { createUser, getAdminApiBase, getUserPermissions, type AdminUserPermissionMatrix } from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { useStore, type User } from '@/stores/mockStore';

interface NewUserSearch {
  siteId?: string;
}

export const Route = createFileRoute('/users/new')({
  validateSearch: (search: Record<string, unknown>): NewUserSearch => ({
    siteId: typeof search.siteId === 'string' ? search.siteId : undefined,
  }),
  component: NewUserPage,
});

type UserRole = User['role'];
type UserStatus = User['status'];
type UserInvitePermissionKey = 'users.create';

const USER_INVITE_PERMISSION_ROLE_DEFAULTS: Record<UserInvitePermissionKey, Array<AuthUser['role']>> = {
  'users.create': ['owner', 'admin'],
};

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; detail: string }> = [
  { value: 'owner', label: 'Owner', detail: 'Controls billing, integrations, team access, publishing, and destructive settings.' },
  { value: 'admin', label: 'Admin', detail: 'Runs sites, content, media, commerce, forms, collections, and users.' },
  { value: 'editor', label: 'Editor', detail: 'Creates and edits public pages, posts, forms, media, and product content.' },
  { value: 'viewer', label: 'Viewer', detail: 'Reviews the workspace without changing content or settings.' },
];

const ROLE_CAPABILITIES: Array<{ label: string; roles: UserRole[] }> = [
  { label: 'View dashboard data, sites, pages, reports, and submissions', roles: ['owner', 'admin', 'editor', 'viewer'] },
  { label: 'Create and update pages, posts, forms, collections, and media', roles: ['owner', 'admin', 'editor'] },
  { label: 'Publish content and update products or orders', roles: ['owner', 'admin', 'editor'] },
  { label: 'Manage API keys, integrations, settings, and users', roles: ['owner', 'admin'] },
  { label: 'Own billing, destructive settings, and workspace transfer', roles: ['owner'] },
];

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string; detail: string; risk: 'normal' | 'review' | 'restricted' }> = [
  { value: 'invited', label: 'Invited', detail: 'Create the user record and wait for auth/email acceptance before access is active.', risk: 'review' },
  { value: 'active', label: 'Active', detail: 'Grant access immediately after the record is persisted. Use only for already-provisioned accounts.', risk: 'normal' },
  { value: 'inactive', label: 'Inactive', detail: 'Create a dormant record that cannot work until an admin activates it later.', risk: 'restricted' },
  { value: 'suspended', label: 'Suspended', detail: 'Create a blocked record for reserved or migrated identities that should not access Backy.', risk: 'restricted' },
];

const USER_INVITE_CONTROL_AREAS = [
  {
    title: 'Identity',
    detail: 'Name and email that will be persisted to the users API.',
    href: '#user-invite-identity',
  },
  {
    title: 'Role scope',
    detail: 'Permission level and exact capabilities unlocked by that role.',
    href: '#user-invite-role',
  },
  {
    title: 'Access preview',
    detail: 'Invitation state, delivery limitation, and account summary before submit.',
    href: '#user-invite-preview',
  },
  {
    title: 'API contract',
    detail: 'Create-user payload used by frontend, dashboard, and future auth flows.',
    href: '#user-invite-api',
  },
] as const;

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function NewUserPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const currentAdmin = useAuthStore((state) => state.user);
  const { setUsers, users } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    role: 'editor' as UserRole,
    status: 'invited' as UserStatus,
  });
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canCreateUsers = !isPermissionMatrixPending && isAdminPermissionAllowed(
    permissionMatrix,
    currentAdmin,
    'users.create',
    USER_INVITE_PERMISSION_ROLE_DEFAULTS,
  );
  const createPermissionTitle = canCreateUsers
    ? undefined
    : adminPermissionReason(permissionMatrix, currentAdmin, 'users.create', USER_INVITE_PERMISSION_ROLE_DEFAULTS);
  const isInviteBusy = isLoading || isPermissionMatrixPending;
  const usersListUrl = useMemo(() => `${getAdminApiBase()}/users`, []);
  const usersRouteSearch = useMemo(
    () => (search.siteId ? { siteId: search.siteId } : undefined),
    [search.siteId],
  );

  const selectedRole = useMemo(
    () => ROLE_OPTIONS.find((role) => role.value === formData.role) || ROLE_OPTIONS[2],
    [formData.role],
  );
  const selectedCapabilities = useMemo(
    () => ROLE_CAPABILITIES.filter((capability) => capability.roles.includes(formData.role)),
    [formData.role],
  );
  const selectedStatus = useMemo(
    () => STATUS_OPTIONS.find((status) => status.value === formData.status) || STATUS_OPTIONS[0],
    [formData.status],
  );
  const canSubmit = formData.fullName.trim().length > 1 && isValidEmail(formData.email);
  const submitLabel = formData.status === 'invited'
    ? (isLoading ? 'Sending invite...' : 'Send invite')
    : (isLoading ? 'Creating user...' : 'Create user');
  const inviteReadiness = useMemo(() => {
    const checks = [
      {
        label: 'Name',
        detail: formData.fullName.trim().length > 1 ? 'Ready for the account record.' : 'Enter the collaborator name.',
        ready: formData.fullName.trim().length > 1,
      },
      {
        label: 'Email',
        detail: isValidEmail(formData.email) ? 'Valid invite destination.' : 'Use a valid email address.',
        ready: isValidEmail(formData.email),
      },
      {
        label: 'Role selected',
        detail: selectedRole.detail,
        ready: Boolean(formData.role),
      },
      {
        label: 'Permission scope',
        detail: `${selectedCapabilities.length} capability group${selectedCapabilities.length === 1 ? '' : 's'} will be enabled.`,
        ready: selectedCapabilities.length > 0,
      },
      {
        label: 'Duplicate guard',
        detail: `${users.length} existing user${users.length === 1 ? '' : 's'} will be checked by the backend.`,
        ready: true,
      },
      {
        label: 'Lifecycle state',
        detail: selectedStatus.detail,
        ready: formData.status !== 'active',
      },
      {
        label: 'Email delivery',
        detail: formData.status === 'active'
          ? 'Active users need an already-provisioned auth account.'
          : 'Auth email delivery is still a future integration pass.',
        ready: false,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Identify', detail: 'Capture the person, email address, and duplicate-safe user record.' },
        { label: 'Scope', detail: 'Choose the narrowest role that still unlocks the work they need.' },
        { label: 'Invite', detail: 'Persist an invited user now and connect real email/auth delivery later.' },
        { label: 'Govern', detail: 'Use the user detail page to activate, suspend, downgrade, or remove access.' },
      ],
    };
  }, [formData.email, formData.fullName, formData.role, formData.status, selectedCapabilities.length, selectedRole.detail, selectedStatus.detail, users.length]);
  const invitePayload = useMemo(() => ({
    fullName: formData.fullName.trim() || 'New collaborator',
    email: formData.email.trim().toLowerCase() || 'person@example.com',
    role: formData.role,
    status: formData.status,
  }), [formData.email, formData.fullName, formData.role, formData.status]);
  const inviteHandoff = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    endpoint: {
      method: 'POST',
      url: usersListUrl,
    },
    readiness: {
      score: inviteReadiness.score,
      checks: inviteReadiness.checks,
    },
    selectedRole: {
      value: selectedRole.value,
      label: selectedRole.label,
      detail: selectedRole.detail,
      capabilities: selectedCapabilities.map((capability) => capability.label),
    },
    initialStatus: {
      value: selectedStatus.value,
      label: selectedStatus.label,
      detail: selectedStatus.detail,
      risk: selectedStatus.risk,
    },
    payload: invitePayload,
    returnRoute: search.siteId ? `/users?siteId=${encodeURIComponent(search.siteId)}` : '/users',
    guardrails: [
      'Backend rejects duplicate emails.',
      'New collaborators start as invited until auth delivery and activation are connected.',
      'Owners should be assigned only when billing, destructive settings, or workspace transfer authority is required.',
    ],
    missingInfrastructure: [
      'Transactional invite email delivery.',
      'Auth-provider accept-invite flow.',
      'Resend and expiry controls.',
    ],
  }), [
    invitePayload,
    inviteReadiness.checks,
    inviteReadiness.score,
    selectedCapabilities,
    selectedRole.detail,
    selectedRole.label,
    selectedRole.value,
    selectedStatus.detail,
    selectedStatus.label,
    selectedStatus.risk,
    selectedStatus.value,
    search.siteId,
    usersListUrl,
  ]);
  const inviteHandoffText = useMemo(() => JSON.stringify(inviteHandoff, null, 2), [inviteHandoff]);

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

  const copyInviteText = async (value: string, label: string) => {
    if (isInviteBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setNoticeMessage(`${label} copied.`);
    } catch {
      setNoticeMessage(value);
    }
  };

  const downloadInviteHandoff = () => {
    if (isInviteBusy) return;

    const blob = new Blob([inviteHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backy-user-invite-handoff.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNoticeMessage('Invite handoff manifest downloaded.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInviteBusy) return;
    if (!canCreateUsers) {
      setErrorMessage(createPermissionTitle || 'Your account cannot invite users.');
      setNoticeMessage(null);
      return;
    }

    if (!canSubmit) {
      setErrorMessage('Enter a full name and a valid email address before sending the invite.');
      setNoticeMessage(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const created = await createUser(invitePayload);
      setUsers([created, ...users]);
      navigate({ to: '/users', search: usersRouteSearch });
    } catch (error) {
      setErrorMessage(error instanceof Error
        ? `${error.message}. The invitation was not persisted.`
        : 'Unable to send invite through the backend. The invitation was not persisted.');
      setIsLoading(false);
    }
  };

  if (!isPermissionMatrixPending && !canCreateUsers) {
    return (
      <PageShell
        title="Invite unavailable"
        description={createPermissionTitle || 'Your account cannot invite or create users.'}
        action={
          <button
            type="button"
            onClick={() => navigate({ to: '/users', search: usersRouteSearch })}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to users
          </button>
        }
        className="w-full"
      >
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {permissionError || createPermissionTitle || 'Ask an owner or admin with users.create access to open this page.'}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Invite user"
      description="Add a collaborator with the right level of control before they touch a site."
      action={
        <button
          type="button"
          onClick={() => {
            if (!isInviteBusy) {
              navigate({ to: '/users', search: usersRouteSearch });
            }
          }}
          disabled={isInviteBusy}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </button>
      }
      className="w-full"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="user-invite-command-center">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">Invite command center</h2>
                <span className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  inviteReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                )}
                >
                  {inviteReadiness.score}% ready
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Create collaborators with explicit role scope, lifecycle state, and API payload visibility before they touch a site.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyInviteText(inviteHandoffText, 'Invite handoff manifest')}
                disabled={isInviteBusy}
                iconStart={<Copy className="size-4" />}
              >
                Copy manifest
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={downloadInviteHandoff}
                disabled={isInviteBusy}
                iconStart={<Download className="size-4" />}
              >
                Download JSON
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isInviteBusy || !canSubmit || !canCreateUsers}
                title={!canCreateUsers ? createPermissionTitle : undefined}
                iconStart={<UserPlus className="size-4" />}
              >
                {submitLabel}
              </Button>
            </div>
          </div>

          {noticeMessage && (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {noticeMessage}
            </div>
          )}

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">Invite readiness</h3>
              <p className="mt-1 text-sm text-muted-foreground">Checks identity, permissions, duplicate guardrails, and integration gaps.</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', inviteReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                  style={{ width: `${inviteReadiness.score}%` }}
                />
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {inviteReadiness.checks.map((check) => (
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
                {inviteReadiness.workflow.map((step, index) => (
                  <AccessWorkflowStep key={step.label} index={index + 1} {...step} />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Invite control map</h3>
            <p className="mt-1 text-sm text-muted-foreground">Jump to identity, role scope, access preview, and API contract.</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {USER_INVITE_CONTROL_AREAS.map((area) => (
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
        <section id="user-invite-identity" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
              <UserPlus className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Invitation details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This creates a pending user record that can later be connected to real auth email delivery.
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Full name</span>
              <input
                type="text"
                value={formData.fullName}
                disabled={isInviteBusy || !canCreateUsers}
                title={!canCreateUsers ? createPermissionTitle : undefined}
                onChange={(e) => {
                  if (isInviteBusy) return;
                  setFormData({ ...formData, fullName: e.target.value });
                }}
                placeholder="Maya Chen"
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Email address</span>
              <div className="relative mt-2">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={formData.email}
                  disabled={isInviteBusy || !canCreateUsers}
                  title={!canCreateUsers ? createPermissionTitle : undefined}
                  onChange={(e) => {
                    if (isInviteBusy) return;
                    setFormData({ ...formData, email: e.target.value });
                  }}
                  placeholder="maya@example.com"
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  required
                />
              </div>
            </label>
          </div>

          <div id="user-invite-role" className="mt-6 scroll-mt-24">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Role</h3>
                <p className="text-xs text-muted-foreground">Pick the narrowest role that still lets this person do the work.</p>
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {selectedRole.label}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {ROLE_OPTIONS.map((role) => (
                <label
                  key={role.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition',
                    formData.role === role.value ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-accent',
                    isInviteBusy && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role.value}
                    checked={formData.role === role.value}
                    disabled={isInviteBusy || !canCreateUsers}
                    onChange={(e) => {
                      if (isInviteBusy) return;
                      setFormData({ ...formData, role: e.target.value as UserRole });
                    }}
                    className="mt-1 h-4 w-4 text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{role.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{role.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Initial status</h3>
                <p className="text-xs text-muted-foreground">Choose whether the account starts pending, active, dormant, or blocked.</p>
              </div>
              <span className={cn(
                'rounded-md px-2 py-1 text-xs font-semibold',
                selectedStatus.risk === 'normal'
                  ? 'bg-emerald-50 text-emerald-700'
                  : selectedStatus.risk === 'review'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-slate-100 text-slate-700',
              )}
              >
                {selectedStatus.label}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {STATUS_OPTIONS.map((status) => (
                <label
                  key={status.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition',
                    formData.status === status.value ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-accent',
                    isInviteBusy && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <input
                    type="radio"
                    name="status"
                    value={status.value}
                    checked={formData.status === status.value}
                    disabled={isInviteBusy || !canCreateUsers}
                    onChange={(e) => {
                      if (isInviteBusy) return;
                      setFormData({ ...formData, status: e.target.value as UserStatus });
                    }}
                    className="mt-1 h-4 w-4 text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{status.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{status.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section id="user-invite-preview" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                <Shield className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Access preview</h2>
                <p className="mt-1 text-sm text-muted-foreground">This is the account Backy will create through the users API.</p>
              </div>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Invitation state</dt>
                <dd className="mt-1 font-semibold text-foreground">{selectedStatus.label}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Role</dt>
                <dd className="mt-1 font-semibold text-foreground">{selectedRole.label}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Email delivery</dt>
                <dd className="mt-1 text-muted-foreground">{selectedStatus.detail}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{selectedRole.label} can</h2>
                <p className="mt-1 text-sm text-muted-foreground">{selectedRole.detail}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {selectedCapabilities.map((capability) => (
                <div key={capability.label} className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{capability.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                <Clock3 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Invitation lifecycle</h2>
                <p className="mt-1 text-sm text-muted-foreground">New users start as invited, then can be activated, suspended, or removed from their profile.</p>
              </div>
            </div>
          </section>

          <section id="user-invite-api" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <Code2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">API body</h2>
                <p className="mt-1 text-sm text-muted-foreground">The submit action sends this structure to the backend.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyInviteText(usersListUrl, 'Invite API URL')}
                disabled={isInviteBusy}
                iconStart={<Copy className="size-4" />}
              >
                Copy URL
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyInviteText(inviteHandoffText, 'Invite handoff manifest')}
                disabled={isInviteBusy}
                iconStart={<Copy className="size-4" />}
              >
                Copy manifest
              </Button>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
{JSON.stringify(invitePayload, null, 2)}
            </pre>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              <p>
                Backy will reject duplicate emails and keep at least one active owner or admin in place.
              </p>
            </div>
          </section>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={isInviteBusy || !canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              {submitLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isInviteBusy) {
                  navigate({ to: '/users', search: usersRouteSearch });
                }
              }}
              disabled={isInviteBusy}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </aside>
        </div>
      </form>
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

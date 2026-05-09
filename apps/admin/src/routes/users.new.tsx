/**
 * BACKY CMS - NEW USER PAGE
 */

import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Clock3, Code2, KeyRound, Mail, Shield, UserPlus } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';
import { createUser } from '@/lib/adminContentApi';
import { useStore, type User } from '@/stores/mockStore';

export const Route = createFileRoute('/users/new')({
  component: NewUserPage,
});

type UserRole = User['role'];

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

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function NewUserPage() {
  const navigate = useNavigate();
  const { setUsers, users } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    role: 'editor' as UserRole,
  });

  const selectedRole = useMemo(
    () => ROLE_OPTIONS.find((role) => role.value === formData.role) || ROLE_OPTIONS[2],
    [formData.role],
  );
  const selectedCapabilities = useMemo(
    () => ROLE_CAPABILITIES.filter((capability) => capability.roles.includes(formData.role)),
    [formData.role],
  );
  const canSubmit = formData.fullName.trim().length > 1 && isValidEmail(formData.email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) {
      setErrorMessage('Enter a full name and a valid email address before sending the invite.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const created = await createUser({
        fullName: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        role: formData.role,
        status: 'invited',
      });
      setUsers([created, ...users]);
      navigate({ to: '/users' });
    } catch (error) {
      setErrorMessage(error instanceof Error
        ? `${error.message}. The invitation was not persisted.`
        : 'Unable to send invite through the backend. The invitation was not persisted.');
      setIsLoading(false);
    }
  };

  return (
    <PageShell
      title="Invite user"
      description="Add a collaborator with the right level of control before they touch a site."
      action={
        <button
          type="button"
          onClick={() => navigate({ to: '/users' })}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </button>
      }
      className="w-full"
    >
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
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
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Maya Chen"
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
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
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="maya@example.com"
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
            </label>
          </div>

          <div className="mt-6">
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
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role.value}
                    checked={formData.role === role.value}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="mt-1 h-4 w-4 text-primary focus:ring-primary"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{role.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{role.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
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
                <dd className="mt-1 font-semibold text-foreground">Invited</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Role</dt>
                <dd className="mt-1 font-semibold text-foreground">{selectedRole.label}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Email delivery</dt>
                <dd className="mt-1 text-muted-foreground">The user record is persisted now; real email delivery belongs in the auth/integrations pass.</dd>
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

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <Code2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">API body</h2>
                <p className="mt-1 text-sm text-muted-foreground">The submit action sends this structure to the backend.</p>
              </div>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
{JSON.stringify({
  fullName: formData.fullName.trim() || 'New collaborator',
  email: formData.email.trim().toLowerCase() || 'person@example.com',
  role: formData.role,
  status: 'invited',
}, null, 2)}
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
              disabled={isLoading || !canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              {isLoading ? 'Sending invite...' : 'Send invite'}
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
    </PageShell>
  );
}

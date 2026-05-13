import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowRight, CheckCircle2, KeyRound, Loader2, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

type AcceptInviteSearch = {
  token?: string;
};

export const Route = createFileRoute('/accept-invite')({
  validateSearch: (search: Record<string, unknown>): AcceptInviteSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: AcceptInvitePage,
});

type AcceptInviteState = 'ready' | 'accepted' | 'error';

const maskToken = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 'Missing token';
  if (trimmed.length <= 12) return 'Token present';
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
};

function AcceptInvitePage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const token = search.token?.trim() || '';
  const acceptInvite = useAuthStore((state) => state.acceptInvite);
  const isLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const [acceptState, setAcceptState] = useState<AcceptInviteState>('ready');
  const [message, setMessage] = useState<string | null>(null);
  const readiness = useMemo(() => Math.round(([Boolean(token), !isLoading].filter(Boolean).length / 2) * 100), [isLoading, token]);

  useEffect(() => {
    if (user && acceptState === 'accepted') {
      const timeout = window.setTimeout(() => {
        navigate({ to: '/', replace: true });
      }, 800);

      return () => window.clearTimeout(timeout);
    }

    return undefined;
  }, [acceptState, navigate, user]);

  const handleAcceptInvite = async () => {
    if (!token || isLoading) return;

    setAcceptState('ready');
    setMessage(null);

    try {
      await acceptInvite(token);
      setAcceptState('accepted');
      setMessage('Invite accepted. Your workspace session is ready.');
    } catch (error) {
      setAcceptState('error');
      setMessage(error instanceof Error ? error.message : 'Unable to accept this invite.');
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,0.7fr)]">
      <section className="hidden min-h-screen border-r border-border bg-muted/30 px-8 py-10 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              B
            </span>
            <div>
              <div className="text-lg font-semibold">Backy</div>
              <div className="text-sm text-muted-foreground">Workspace invite</div>
            </div>
          </div>

          <div className="mt-16 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Protected invite acceptance
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight">
              Join the Backy workspace and start managing sites, content, users, and APIs.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Invite tokens activate pending accounts, open a local admin session, and keep the account lifecycle visible in user audit history.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Invite readiness</div>
              <div className="mt-1 text-xs text-muted-foreground">Token and request state.</div>
            </div>
            <span className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold',
              readiness >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
            )}
            >
              {readiness}% ready
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', readiness >= 100 ? 'bg-emerald-500' : 'bg-amber-500')}
              style={{ width: `${readiness}%` }}
            />
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              B
            </span>
            <div>
              <div className="font-semibold">Backy</div>
              <div className="text-xs text-muted-foreground">Workspace invite</div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold">Accept Invite</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Activate the pending account tied to this invite token.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-border bg-background p-3">
              <div className="flex items-start gap-3">
                <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground">Invite token</div>
                  <div className="mt-1 truncate font-mono text-xs font-semibold text-foreground">
                    {maskToken(token)}
                  </div>
                </div>
              </div>
            </div>

            {message && (
              <div className={cn(
                'mt-4 rounded-lg border px-3 py-2 text-sm',
                acceptState === 'accepted'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800',
              )}
              >
                {message}
              </div>
            )}

            <div className="mt-6 grid gap-3">
              <Button
                type="button"
                onClick={handleAcceptInvite}
                disabled={!token || isLoading || acceptState === 'accepted'}
                iconStart={isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                className="w-full"
              >
                {isLoading ? 'Accepting...' : acceptState === 'accepted' ? 'Invite Accepted' : 'Accept Invite'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: '/login' })}
                iconEnd={<ArrowRight className="h-4 w-4" />}
                className="w-full"
              >
                Back to login
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

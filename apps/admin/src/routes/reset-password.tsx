import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fetchAdminPasswordPolicy } from '@/lib/adminAuthApi';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

type ResetPasswordSearch = {
  token?: string;
};

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: ResetPasswordPage,
});

type ResetState = 'ready' | 'reset' | 'error';

const DEFAULT_MIN_PASSWORD_LENGTH = 12;

const maskToken = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 'Missing token';
  if (trimmed.length <= 12) return 'Token present';
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
};

function ResetPasswordPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const token = search.token?.trim() || '';
  const resetPassword = useAuthStore((state) => state.resetPassword);
  const isLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetState, setResetState] = useState<ResetState>('ready');
  const [message, setMessage] = useState<string | null>(null);
  const [minPasswordLength, setMinPasswordLength] = useState(DEFAULT_MIN_PASSWORD_LENGTH);
  const [resetSubmitted, setResetSubmitted] = useState(false);
  const passwordIsValid = password.length >= minPasswordLength;
  const passwordsMatch = Boolean(password) && password === confirmPassword;
  const passwordRequirement = `Use at least ${minPasswordLength} characters.`;
  const tokenInlineError = resetSubmitted && !token
    ? 'Open a valid password reset link with a recovery token.'
    : null;
  const passwordInlineError = resetSubmitted && !passwordIsValid
    ? passwordRequirement
    : null;
  const confirmInlineError = resetSubmitted && !passwordsMatch
    ? 'Confirm password must match the new password.'
    : null;
  const readiness = useMemo(() => (
    Math.round(([Boolean(token), passwordIsValid, passwordsMatch, !isLoading].filter(Boolean).length / 4) * 100)
  ), [isLoading, passwordIsValid, passwordsMatch, token]);

  useEffect(() => {
    let cancelled = false;

    fetchAdminPasswordPolicy()
      .then((policy) => {
        if (!cancelled) {
          setMinPasswordLength(policy.minPasswordLength);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMinPasswordLength(DEFAULT_MIN_PASSWORD_LENGTH);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user && resetState === 'reset') {
      const timeout = window.setTimeout(() => {
        navigate({ to: '/', replace: true });
      }, 800);

      return () => window.clearTimeout(timeout);
    }

    return undefined;
  }, [navigate, resetState, user]);

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading) return;
    setResetSubmitted(true);

    if (!token || !passwordIsValid || !passwordsMatch) {
      setResetState('error');
      setMessage(!token
        ? 'Use a valid reset link before saving a new password.'
        : `Use a matching password with at least ${minPasswordLength} characters.`);
      return;
    }

    setResetState('ready');
    setMessage(null);

    try {
      await resetPassword(token, password);
      setResetState('reset');
      setMessage('Password updated. Your workspace session is ready.');
    } catch (error) {
      setResetState('error');
      setMessage(error instanceof Error ? error.message : 'Unable to reset this password.');
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
              <div className="text-sm text-muted-foreground">Password reset</div>
            </div>
          </div>

          <div className="mt-16 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Protected credential recovery
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight">
              Reset the workspace password and return to Backy with a fresh session.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Reset links validate a temporary token, update local-demo credentials, activate invited accounts, and record the recovery event.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Reset readiness</div>
              <div className="mt-1 text-xs text-muted-foreground">Token, password, confirmation, and request state.</div>
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
              <div className="text-xs text-muted-foreground">Password reset</div>
            </div>
          </div>

          <form
            onSubmit={handleResetPassword}
            noValidate
            data-testid="reset-password-form"
            data-reset-status={resetState}
            data-readiness={readiness}
            className="rounded-lg border border-border bg-card p-6 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold">Reset Password</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Set a new local-demo password for this workspace account.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-border bg-background p-3">
              <div className="text-xs font-medium text-muted-foreground">Reset token</div>
              <div className="mt-1 truncate font-mono text-xs font-semibold text-foreground">
                {maskToken(token)}
              </div>
              {tokenInlineError && (
                <p id="reset-token-error" data-testid="reset-password-token-error" className="mt-2 text-xs font-medium text-red-600" role="alert">
                  {tokenInlineError}
                </p>
              )}
            </div>

            <label className="mt-5 block text-sm" htmlFor="reset-password-new">
              <span className="font-medium">New password</span>
              <div className={cn(
                'mt-2 flex rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring',
                passwordInlineError ? 'border-red-500 focus-within:ring-red-500' : 'border-border',
              )}
              >
                <input
                  id="reset-password-new"
                  data-testid="reset-password-new-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setResetState('ready');
                    setMessage(null);
                  }}
                  className="min-h-11 flex-1 rounded-l-lg bg-transparent px-3 text-sm outline-none"
                  autoComplete="new-password"
                  minLength={minPasswordLength}
                  aria-invalid={Boolean(passwordInlineError)}
                  aria-describedby="reset-password-requirement"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <span
                id="reset-password-requirement"
                className={cn('mt-1 block text-xs', passwordInlineError ? 'font-medium text-red-600' : 'text-muted-foreground')}
              >
                {passwordInlineError || passwordRequirement}
              </span>
            </label>

            <label className="mt-4 block text-sm" htmlFor="reset-password-confirm">
              <span className="font-medium">Confirm password</span>
              <input
                id="reset-password-confirm"
                data-testid="reset-password-confirm-input"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setResetState('ready');
                  setMessage(null);
                }}
                className={cn(
                  'mt-2 min-h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-ring',
                  confirmInlineError ? 'border-red-500 focus:ring-red-500' : 'border-border',
                )}
                autoComplete="new-password"
                minLength={minPasswordLength}
                aria-invalid={Boolean(confirmInlineError)}
                aria-describedby={confirmInlineError ? 'reset-password-confirm-error' : undefined}
              />
              {confirmInlineError && (
                <p id="reset-password-confirm-error" data-testid="reset-password-confirm-error" className="mt-1 text-xs font-medium text-red-600" role="alert">
                  {confirmInlineError}
                </p>
              )}
            </label>

            {message && (
              <div className={cn(
                'mt-4 rounded-lg border px-3 py-2 text-sm',
                resetState === 'reset'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800',
              )}
                role={resetState === 'error' ? 'alert' : 'status'}
                data-testid="reset-password-message"
              >
                {message}
              </div>
            )}

            <div className="mt-6 grid gap-3">
              <Button
                type="submit"
                disabled={isLoading || resetState === 'reset'}
                iconStart={isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                className="w-full"
              >
                {isLoading ? 'Saving...' : resetState === 'reset' ? 'Password Updated' : 'Reset Password'}
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
          </form>
        </div>
      </section>
    </main>
  );
}

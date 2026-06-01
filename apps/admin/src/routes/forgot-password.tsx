import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowRight, CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { requestAdminPasswordRecovery } from '@/lib/adminAuthApi';
import { cn } from '@/lib/utils';

type ForgotPasswordSearch = {
  email?: string;
};

type RecoveryState = 'ready' | 'sent' | 'error';

const formatRecoveryDeliveryStatus = (
  resetDelivery: Awaited<ReturnType<typeof requestAdminPasswordRecovery>>['resetDelivery'],
): string | null => {
  if (!resetDelivery) return null;
  const provider = resetDelivery.provider.replace(/-/g, ' ');
  if (!resetDelivery.deliveryConfigured || resetDelivery.status === 'not_configured') {
    return `Provider ${provider}: recovery email is not configured.`;
  }

  const status = resetDelivery.status.replace(/_/g, ' ');
  return `Provider ${provider}, status ${status}.`;
};

export const Route = createFileRoute('/forgot-password')({
  validateSearch: (search: Record<string, unknown>): ForgotPasswordSearch => ({
    email: typeof search.email === 'string' ? search.email : undefined,
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const search = Route.useSearch() as ForgotPasswordSearch;
  const [email, setEmail] = useState(search.email?.trim().toLowerCase() || '');
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('ready');
  const [message, setMessage] = useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null);
  const [localRecoveryUrl, setLocalRecoveryUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recoverySubmitted, setRecoverySubmitted] = useState(false);
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailInlineError = recoverySubmitted && !emailIsValid
    ? 'Enter a valid workspace email address.'
    : null;
  const readiness = useMemo(() => Math.round(([emailIsValid, !isSubmitting].filter(Boolean).length / 2) * 100), [emailIsValid, isSubmitting]);

  const handleRequestRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    setRecoverySubmitted(true);
    setEmail(normalizedEmail);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setRecoveryState('error');
      setMessage('Fix the email field before requesting recovery.');
      return;
    }

    setIsSubmitting(true);
    setRecoveryState('ready');
    setMessage(null);
    setDeliveryStatus(null);
    setLocalRecoveryUrl(null);

    try {
      const recovery = await requestAdminPasswordRecovery(normalizedEmail);
      setRecoveryState('sent');
      setMessage(recovery.message || 'Password recovery was requested. Check your configured delivery channel for next steps.');
      setDeliveryStatus(formatRecoveryDeliveryStatus(recovery.resetDelivery));
      setLocalRecoveryUrl(recovery.localRecovery?.resetUrl || null);
    } catch (error) {
      setRecoveryState('error');
      setMessage(error instanceof Error ? error.message : 'Unable to request password recovery.');
    } finally {
      setIsSubmitting(false);
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
              <div className="text-sm text-muted-foreground">Password recovery</div>
            </div>
          </div>

          <div className="mt-16 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Protected account recovery
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight">
              Request workspace password recovery and return to Backy when your credential is ready.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Recovery keeps account lookup private and uses the same unauthenticated flow for every workspace email request.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Recovery readiness</div>
              <div className="mt-1 text-xs text-muted-foreground">Email and request state.</div>
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
              <div className="text-xs text-muted-foreground">Password recovery</div>
            </div>
          </div>

          <form
            onSubmit={handleRequestRecovery}
            noValidate
            data-testid="forgot-password-form"
            data-recovery-status={recoveryState}
            data-readiness={readiness}
            className="rounded-lg border border-border bg-card p-6 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold">Forgot Password</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Enter the admin email for this workspace account.
                </p>
              </div>
            </div>

            <label className="mt-6 block text-sm" htmlFor="recovery-email">
              <span className="font-medium">Email</span>
              <div className="relative mt-2">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="recovery-email"
                  data-testid="forgot-password-email-input"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setRecoveryState('ready');
                    setMessage(null);
                    setDeliveryStatus(null);
                    setLocalRecoveryUrl(null);
                  }}
                  placeholder="owner@example.com"
                  className={cn(
                    'min-h-11 w-full rounded-lg border bg-background py-2.5 pl-9 pr-10 text-sm outline-none transition focus:ring-2 focus:ring-ring',
                    recoveryState === 'error' && 'border-red-500 focus:ring-red-500',
                  )}
                  autoComplete="email"
                  disabled={isSubmitting}
                  aria-invalid={Boolean(emailInlineError)}
                  aria-describedby={emailInlineError ? 'recovery-email-error' : undefined}
                />
                {emailIsValid && (
                  <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                )}
              </div>
              {emailInlineError && (
                <p id="recovery-email-error" data-testid="forgot-password-email-error" className="mt-1 text-xs font-medium text-red-600" role="alert">
                  {emailInlineError}
                </p>
              )}
            </label>

            {message && (
              <div className={cn(
                'mt-4 rounded-lg border px-3 py-2 text-sm',
                recoveryState === 'sent'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800',
              )}
                role={recoveryState === 'error' ? 'alert' : 'status'}
                data-testid="forgot-password-message"
              >
                <div>{message}</div>
                {deliveryStatus && (
                  <div className="mt-1 text-xs opacity-80">{deliveryStatus}</div>
                )}
              </div>
            )}

            {localRecoveryUrl && (
              <a
                href={localRecoveryUrl}
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                Open local reset link
                <ArrowRight className="h-4 w-4" />
              </a>
            )}

            <div className="mt-6 grid gap-3">
              <Button
                type="submit"
                disabled={isSubmitting}
                iconStart={isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                className="w-full"
              >
                {isSubmitting ? 'Requesting...' : 'Request Recovery'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const normalizedEmail = email.trim().toLowerCase();
                  const search = normalizedEmail ? `?email=${encodeURIComponent(normalizedEmail)}` : '';
                  void navigate({ href: `/login${search}` });
                }}
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

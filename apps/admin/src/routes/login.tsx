/**
 * ============================================================================
 * BACKY - LOGIN PAGE
 * ============================================================================
 *
 * The login page for the admin dashboard. Users can sign in with
 * email and password.
 *
 * @module LoginPage
 * @author Backy Team
 * @license MIT
 */

import { useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Code2, Database, Eye, EyeOff, LayoutDashboard, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

const DEMO_ACCOUNTS = [
  { email: 'admin@backy.io', password: 'admin123', label: 'Admin' },
  { email: 'jane@backy.io', password: 'editor123', label: 'Editor' },
];

const AUTH_WORKSPACE_ITEMS = [
  {
    label: 'Multi-site control',
    detail: 'Manage sites, pages, blog, media, forms, commerce, and APIs after sign-in.',
    icon: LayoutDashboard,
  },
  {
    label: 'Structured content',
    detail: 'Collections, records, products, orders, and reusable data contracts stay behind auth.',
    icon: Database,
  },
  {
    label: 'Frontend handoff',
    detail: 'Custom frontends consume published routes, manifests, media, and schemas from Backy APIs.',
    icon: Code2,
  },
];

// ============================================
// ROUTE DEFINITION
// ============================================

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

// ============================================
// COMPONENT
// ============================================

/**
 * Login Page Component
 *
 * Provides email/password login form with validation.
 */
function LoginPage() {
  const navigate = useNavigate();
  const { signIn, isLoading, error, clearError, user } = useAuthStore();

  useEffect(() => {
    if (user) {
      navigate({ to: '/' });
    }
  }, [user, navigate]);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const isLoginBusy = isLoading;
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordIsValid = password.length >= 6;
  const authReadinessScore = Math.round(([emailIsValid, passwordIsValid, !isLoginBusy].filter(Boolean).length / 3) * 100);

  /**
   * Validate form inputs
   */
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!email) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePasswordRecovery = () => {
    if (isLoginBusy) return;

    clearError();
    const normalizedEmail = email.trim().toLowerCase();
    const search = normalizedEmail ? `?email=${encodeURIComponent(normalizedEmail)}` : '';
    void navigate({ href: `/forgot-password${search}` });
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoginBusy) return;

    clearError();

    if (!validateForm()) return;

    try {
      await signIn(email, password);
      // Redirect to dashboard on success
      navigate({ to: '/' });
    } catch {
      // Error is handled by the store
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.65fr)]">
      <section className="order-2 hidden min-h-screen border-r border-border bg-muted/30 px-8 py-10 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              B
            </span>
            <div>
              <div className="text-lg font-semibold">Backy</div>
              <div className="text-sm text-muted-foreground">Control workspace</div>
            </div>
          </div>

          <div className="mt-16 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Authenticated admin access
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight">
              Sign in to manage sites, content, files, products, users, and frontend APIs.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Backy keeps the design editor, CMS data, media library, commerce objects, and API delivery controls inside one protected workspace.
            </p>
          </div>

          <div className="mt-10 grid gap-3">
            {AUTH_WORKSPACE_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-lg border border-border bg-background p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold">{item.label}</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Login readiness</div>
              <div className="mt-1 text-xs text-muted-foreground">Email, password, and request state.</div>
            </div>
            <span className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold',
              authReadinessScore >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
            )}
            >
              {authReadinessScore}% ready
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', authReadinessScore >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
              style={{ width: `${authReadinessScore}%` }}
            />
          </div>
        </div>
      </section>

      <section className="order-1 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              B
            </span>
            <div>
              <div className="text-lg font-semibold">Backy</div>
              <div className="text-sm text-muted-foreground">Admin workspace</div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your workspace credentials to continue.
                </p>
              </div>
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <Lock className="h-5 w-5" />
              </span>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium">
                  Email
                </label>
                <div className="relative mt-2">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@backy.io"
                    className={cn(
                      'w-full rounded-lg border bg-background py-2.5 pl-9 pr-10 text-sm outline-none transition focus:ring-2 focus:ring-ring',
                      formErrors.email && 'border-red-500 focus:ring-red-500',
                    )}
                    disabled={isLoginBusy}
                  />
                  {emailIsValid && (
                    <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                  )}
                </div>
                {formErrors.email && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="password" className="block text-sm font-medium">
                    Password
                  </label>
                  <button
                    type="button"
                    className="text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handlePasswordRecovery}
                    disabled={isLoginBusy}
                    data-testid="login-password-recovery"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className={cn(
                      'w-full rounded-lg border bg-background py-2.5 pl-9 pr-12 text-sm outline-none transition focus:ring-2 focus:ring-ring',
                      formErrors.password && 'border-red-500 focus:ring-red-500',
                    )}
                    disabled={isLoginBusy}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!isLoginBusy) setShowPassword(!showPassword);
                    }}
                    disabled={isLoginBusy}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {formErrors.password && (
                  <p className="mt-1 text-sm text-red-600">
                    {formErrors.password}
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoginBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoginBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Demo access</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Use seeded accounts while auth delivery is being connected.</p>
                </div>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  API
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    disabled={isLoginBusy}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      if (isLoginBusy) return;
                      setEmail(account.email);
                      setPassword(account.password);
                      setFormErrors({});
                      clearError();
                    }}
                  >
                    <span className="block font-medium">{account.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {account.email} / {account.password}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;

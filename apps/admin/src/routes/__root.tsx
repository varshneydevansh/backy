/**
 * ============================================================================
 * BACKY CMS - ROOT ROUTE
 * ============================================================================
 *
 * The root route that wraps all other routes. It provides the main layout
 * for authenticated routes, but NOT for login.
 *
 * @module RootRoute
 * @author Backy CMS Team
 * @license MIT
 */

import { useNavigate, createRootRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { Suspense, useEffect, useRef, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import type { AdminSession } from '@/lib/adminAuthApi';
import { useAuthStore, type User } from '@/stores/authStore';

// ============================================
// ROOT ROUTE
// ============================================

export const Route = createRootRoute({
  component: RootComponent,
});

const getSessionValidationKey = (user: User | null, session: AdminSession | null): string => (
  user && session
    ? `${user.id}:${session.authMode}:${session.token || session.issuedAt}`
    : ''
);

const canUseOptimisticLocalDemoSession = (session: AdminSession | null): boolean => {
  if (session?.authMode !== 'local-demo' || !session.token) return false;

  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

const COOKIE_SESSION_RESTORE_TIMEOUT_MS = 9000;

// ============================================
// ROOT COMPONENT
// ============================================

/**
 * Root Component
 *
 * Wraps authenticated routes with MainLayout.
 * Login page renders WITHOUT the layout.
 */
function RootComponent() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);
  const isAuthenticated = Boolean(user && session);
  const refreshSession = useAuthStore((state) => state.refreshSession);
  const sessionValidationKey = getSessionValidationKey(user, session);
  const canRenderWhileValidatingSession = canUseOptimisticLocalDemoSession(session);
  const validatedSessionKeyRef = useRef<string | null>(null);
  const [authHydrated, setAuthHydrated] = useState(() => useAuthStore.persist.hasHydrated());
  const [sessionValidating, setSessionValidating] = useState(false);
  const [cookieSessionStatus, setCookieSessionStatus] = useState<'idle' | 'checking' | 'failed'>('idle');

  // Routes that should NOT have the main layout
  const publicRoutes = ['/login', '/forgot-password', '/reset-password', '/accept-invite'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  useEffect(() => {
    if (authHydrated) return undefined;
    let cancelled = false;
    const markHydrated = () => {
      if (!cancelled) {
        setAuthHydrated(true);
      }
    };
    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      markHydrated();
    });
    if (useAuthStore.persist.hasHydrated()) {
      markHydrated();
    } else {
      void Promise.resolve(useAuthStore.persist.rehydrate()).catch(() => {
        markHydrated();
      });
    }
    const hydrationFallback = window.setTimeout(markHydrated, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(hydrationFallback);
      unsubscribe();
    };
  }, [authHydrated]);

  useEffect(() => {
    if (!authHydrated || isPublicRoute) {
      setCookieSessionStatus('idle');
      return;
    }

    if (isAuthenticated) {
      setCookieSessionStatus('idle');
      return;
    }

    if (cookieSessionStatus === 'idle') {
      setCookieSessionStatus('checking');
    }
  }, [authHydrated, cookieSessionStatus, isAuthenticated, isPublicRoute]);

  useEffect(() => {
    if (!authHydrated || isPublicRoute || isAuthenticated || cookieSessionStatus !== 'checking') {
      return;
    }

    let cancelled = false;
    const restoreTimeout = window.setTimeout(() => {
      if (cancelled) return;
      const currentAuth = useAuthStore.getState();
      setCookieSessionStatus(currentAuth.user && currentAuth.session ? 'idle' : 'failed');
    }, COOKIE_SESSION_RESTORE_TIMEOUT_MS);

    void (async () => {
      await refreshSession();
      if (cancelled) return;
      const currentAuth = useAuthStore.getState();
      setCookieSessionStatus(currentAuth.user && currentAuth.session ? 'idle' : 'failed');
      window.clearTimeout(restoreTimeout);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(restoreTimeout);
    };
  }, [authHydrated, cookieSessionStatus, isAuthenticated, isPublicRoute, refreshSession]);

  useEffect(() => {
    if (authHydrated && !isPublicRoute && !isAuthenticated && cookieSessionStatus === 'failed') {
      navigate({ to: '/login', replace: true });
    }
  }, [authHydrated, cookieSessionStatus, isAuthenticated, isPublicRoute, navigate]);

  useEffect(() => {
    if (!authHydrated || isPublicRoute || !isAuthenticated || !sessionValidationKey) {
      validatedSessionKeyRef.current = null;
      setSessionValidating(false);
      return;
    }

    if (validatedSessionKeyRef.current === sessionValidationKey) {
      return;
    }

    let cancelled = false;
    setSessionValidating(true);
    void (async () => {
      await refreshSession();
      if (cancelled) return;
      const currentAuth = useAuthStore.getState();
      validatedSessionKeyRef.current = getSessionValidationKey(currentAuth.user, currentAuth.session) || null;
      setSessionValidating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authHydrated, isAuthenticated, isPublicRoute, refreshSession, sessionValidationKey]);

  const sessionNeedsValidation = authHydrated &&
    !isPublicRoute &&
    isAuthenticated &&
    Boolean(sessionValidationKey) &&
    validatedSessionKeyRef.current !== sessionValidationKey &&
    !canRenderWhileValidatingSession;
  const authGateReason = !authHydrated
    ? 'hydrating'
    : !isAuthenticated && cookieSessionStatus === 'checking'
      ? 'restoring-cookie-session'
      : !isAuthenticated && cookieSessionStatus === 'failed'
        ? 'unauthenticated'
        : !isAuthenticated
          ? 'checking-cookie-session'
          : sessionValidating
            ? 'validating'
            : sessionNeedsValidation
              ? 'needs-validation'
              : 'ready';

  // Public routes render without layout
  if (isPublicRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Outlet />
      </Suspense>
    );
  }

  if (!authHydrated || !isAuthenticated || (!canRenderWhileValidatingSession && (sessionValidating || sessionNeedsValidation))) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <div data-testid="auth-gate-loading" data-auth-gate-reason={authGateReason}>
          <LoadingScreen />
        </div>
      </Suspense>
    );
  }

  // Authenticated routes get the full layout
  return (
    <MainLayout>
      <Suspense fallback={<AuthenticatedRouteFallback />}>
        <Outlet />
      </Suspense>
    </MainLayout>
  );
}

function AuthenticatedRouteFallback() {
  return (
    <div className="flex min-h-[24rem] items-center justify-center rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="size-5 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        Loading workspace...
      </div>
    </div>
  );
}

export default RootComponent;

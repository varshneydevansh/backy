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
import { Suspense, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useAuthStore } from '@/stores/authStore';

// ============================================
// ROOT ROUTE
// ============================================

export const Route = createRootRoute({
  component: RootComponent,
});

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
  const isAuthenticated = useAuthStore((state) => !!state.user);

  // Routes that should NOT have the main layout
  const publicRoutes = ['/login', '/forgot-password', '/reset-password'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  useEffect(() => {
    if (!isPublicRoute && !isAuthenticated) {
      navigate({ to: '/login', replace: true });
    }
  }, [isAuthenticated, isPublicRoute, navigate]);

  // Public routes render without layout
  if (isPublicRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Outlet />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <LoadingScreen />
      </Suspense>
    );
  }

  // Authenticated routes get the full layout
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MainLayout>
        <Outlet />
      </MainLayout>
    </Suspense>
  );
}

export default RootComponent;

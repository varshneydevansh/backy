/**
 * ============================================================================
 * SCYTHIAN CMS - MAIN APP COMPONENT
 * ============================================================================
 *
 * The root component that sets up routing and global providers.
 *
 * @module App
 * @author Scythian CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

// ============================================
// ROUTER SETUP
// ============================================

/**
 * Create the router with type safety
 *
 * We use TanStack Router for type-safe routing with:
 * - Automatic route generation
 * - Type-safe navigation
 * - Nested layouts
 * - Data loading
 */
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultStaleTime: 5000,
});

// ============================================
// TYPE DECLARATIONS
// ============================================

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// ============================================
// APP COMPONENT
// ============================================

/**
 * Main App Component
 *
 * Renders the router provider which handles all routing.
 */
function App() {
  return <RouterProvider router={router} />;
}

export default App;

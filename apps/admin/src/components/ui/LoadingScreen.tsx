/**
 * ============================================================================
 * BACKY CMS - LOADING SCREEN COMPONENT
 * ============================================================================
 *
 * A full-screen loading indicator shown during initial app load
 * and route transitions.
 *
 * @module LoadingScreen
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

// ============================================
// COMPONENT
// ============================================

/**
 * Loading Screen Component
 *
 * Displays a centered spinner with the Backy CMS branding.
 */
export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      {/* Logo/Brand */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold gradient-text mb-2">
          Backy CMS
        </h1>
        <p className="text-muted-foreground text-sm">
          Loading...
        </p>
      </div>

      {/* Spinner */}
      <div className="relative">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    </div>
  );
}

export default LoadingScreen;

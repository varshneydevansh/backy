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

export function LoadingScreen() {
  return (
    <div className="min-h-dvh bg-background text-foreground" role="status" aria-live="polite" aria-label="Loading Backy workspace">
      <div className="flex min-h-dvh overflow-hidden">
        <aside className="hidden w-16 shrink-0 border-r border-border bg-card p-3 lg:block">
          <div className="flex h-full flex-col items-center gap-4">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              B
            </div>
            <div className="mt-3 flex w-full flex-1 flex-col items-center gap-3">
              {Array.from({ length: 10 }).map((_, index) => (
                <div
                  key={index}
                  className="size-9 animate-pulse rounded-lg bg-muted"
                  style={{ animationDelay: `${index * 55}ms` }}
                />
              ))}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-5">
            <div>
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-2.5 w-40 animate-pulse rounded bg-muted/70" />
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden h-9 w-56 animate-pulse rounded-lg bg-muted sm:block" />
              <div className="size-9 animate-pulse rounded-lg bg-muted" />
              <div className="size-9 animate-pulse rounded-full bg-muted" />
            </div>
          </header>

          <section className="mx-auto w-full max-w-[1680px] flex-1 p-5 lg:p-6">
            <div className="max-w-3xl">
              <div className="h-8 w-40 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-muted/70" />
            </div>

            <div className="mt-8 overflow-hidden rounded-lg border border-border bg-card">
              <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <div className="h-5 w-56 animate-pulse rounded bg-muted" />
                  <div className="mt-3 h-3 w-full max-w-2xl animate-pulse rounded bg-muted/70" />
                </div>
                <div className="flex gap-2">
                  <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
                  <div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
                </div>
              </div>
              <div className="grid gap-3 border-t border-border bg-background/55 p-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-lg border border-border bg-card px-3 py-3">
                    <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div className="h-6 w-14 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-20 animate-pulse rounded bg-muted/70" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              Loading workspace...
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

export default LoadingScreen;

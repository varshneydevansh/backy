/** Owns a workspace read; stale completions cannot publish state. */
export function createWorkspaceLoadAuthority() {
  let context = '';
  let revision = 0;
  return {
    setContext(nextContext: string) {
      if (context !== nextContext) {
        context = nextContext;
        revision += 1;
      }
    },
    invalidate() { revision += 1; },
    async run<T>(read: (isCurrent: () => boolean) => Promise<T>, callbacks: {
      success?: (result: T) => void;
      error: (error: unknown) => void;
      finish: () => void;
    }) {
      const requestRevision = ++revision;
      try {
        const result = await read(() => revision === requestRevision);
        if (revision === requestRevision) callbacks.success?.(result);
      } catch (error) {
        if (revision === requestRevision) callbacks.error(error);
      } finally {
        if (revision === requestRevision) callbacks.finish();
      }
    },
  };
}

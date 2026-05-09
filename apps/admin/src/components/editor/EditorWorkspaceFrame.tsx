import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EditorWorkspaceFrameProps {
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function EditorWorkspaceFrame({
  title,
  description,
  meta,
  children,
  className,
}: EditorWorkspaceFrameProps) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-slate-50/80 shadow-sm ring-1 ring-black/[0.02]',
        className,
      )}
    >
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>}
        </div>
        {meta && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {meta}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 bg-slate-100">{children}</div>
    </section>
  );
}

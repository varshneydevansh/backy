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
    <section className={cn('flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {meta && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {meta}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 bg-background">{children}</div>
    </section>
  );
}

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
        'flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)] ring-1 ring-slate-950/[0.03]',
        className,
      )}
    >
      <div className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.14)]" aria-hidden="true" />
              <h2 className="truncate text-sm font-semibold text-slate-950">{title}</h2>
            </div>
            {description && (
              <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
                {description}
              </p>
            )}
          </div>
          {meta && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
              {meta}
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-[#eef2f7]">{children}</div>
    </section>
  );
}

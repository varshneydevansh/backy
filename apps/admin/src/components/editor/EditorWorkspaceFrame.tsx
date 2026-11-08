import { type ReactNode } from 'react';
import { LayoutTemplate, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import './editorWorkspace.css';

interface EditorWorkspaceFrameProps {
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  density?: 'default' | 'compact';
  'data-testid'?: string;
}

export function EditorWorkspaceFrame({
  title,
  description,
  meta,
  actions,
  children,
  className,
  density = 'default',
  'data-testid': dataTestId,
}: EditorWorkspaceFrameProps) {
  const isCompact = density === 'compact';

  return (
    <section
      data-testid={dataTestId}
      data-density={density}
      data-editor-workspace="true"
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_32px_rgba(15,23,42,0.04)]',
        className,
      )}
    >
      <div className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white" data-editor-workspace-bar="true">
        <div className={cn(
          'flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between',
          isCompact ? 'px-4 py-2.5' : 'px-5 py-3',
        )}
        >
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold tracking-tight text-slate-950">{title}</h2>
            </div>
            {description && (
              <p className={cn(
                'mt-1 max-w-4xl text-sm leading-5 text-slate-500',
                isCompact && 'sr-only',
              )}
              >
                {description}
              </p>
            )}
          </div>
          {(meta || actions) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {meta && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                  {meta}
                </div>
              )}
              {actions && (
                <div className="flex flex-wrap items-center gap-2">
                  {actions}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-[#f3f5f6]">{children}</div>
    </section>
  );
}

/** Shared authoring navigation; changing mode keeps both document engines mounted. */
export function ArticleModeSwitcher({ mode, onChange, disabled = false }: {
  mode: 'write' | 'layout';
  onChange: (mode: 'write' | 'layout') => void;
  disabled?: boolean;
}) {
  return (
    <div className="backy-article-mode-bar" role="group" aria-label="Article editing mode">
      <div className="backy-article-mode-switch">
        {([
          { id: 'write', label: 'Write', icon: PenLine },
          { id: 'layout', label: 'Layout', icon: LayoutTemplate },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            disabled={disabled}
            onClick={() => onChange(id)}
            data-testid={`blog-mode-${id}`}
            className={cn('backy-article-mode-button', mode === id && 'is-active')}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <span className="backy-article-mode-hint">
        {mode === 'write' ? 'Write and format your article' : 'Arrange sections, media, and site elements'}
      </span>
    </div>
  );
}

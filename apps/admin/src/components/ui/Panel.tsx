import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

interface PanelHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

interface PanelContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Panel({ children, className, ...props }: PanelProps) {
  return (
    <section className={cn('rounded-lg border border-border bg-card shadow-sm', className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, description, action, icon, className }: PanelHeaderProps) {
  return (
    <div className={cn('flex min-w-0 flex-wrap items-start justify-between gap-3 p-5', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="break-words font-semibold [overflow-wrap:anywhere]">{title}</h2>
          {description && <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{description}</p>}
        </div>
      </div>
      {action && <div className="min-w-0 max-w-full">{action}</div>}
    </div>
  );
}

export function PanelContent({ children, className, ...props }: PanelContentProps) {
  return <div className={cn('min-w-0 max-w-full p-5 pt-0', className)} {...props}>{children}</div>;
}

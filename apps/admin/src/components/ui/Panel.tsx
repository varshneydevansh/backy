import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PanelProps {
  children: ReactNode;
  className?: string;
  id?: string;
  role?: string;
}

interface PanelHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function Panel({ children, className, id, role }: PanelProps) {
  return (
    <section id={id} role={role} className={cn('rounded-lg border border-border bg-card shadow-sm', className)}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, description, action, icon, className }: PanelHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 p-5', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function PanelContent({ children, className }: PanelProps) {
  return <div className={cn('p-5 pt-0', className)}>{children}</div>;
}

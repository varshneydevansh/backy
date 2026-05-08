/**
 * EmptyState Component
 * 
 * Shown when a list has no items.
 * Encourages the user to create their first item.
 */

import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-card/50 px-4 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Icon className="size-6 text-primary" />
            </div>
            <div className="flex max-w-sm flex-col gap-1">
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">
                {description}
              </p>
            </div>
            {action}
        </div>
    );
}

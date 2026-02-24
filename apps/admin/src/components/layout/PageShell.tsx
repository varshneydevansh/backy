/**
 * PageShell Component
 * 
 * Standard wrapper for all admin pages.
 * Ensures consistent spacing, header styling, and layout.
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageShellProps {
    title: ReactNode;
    description?: string;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}

export function PageShell({
    title,
    description,
    action,
    children,
    className
}: PageShellProps) {
    return (
        <div className={cn("space-y-6 animate-fade-in", className)}>
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                    {description && (
                        <p className="text-muted-foreground mt-1">
                            {description}
                        </p>
                    )}
                </div>

                {/* Primary Action (New Button, etc.) */}
                {action && (
                    <div className="flex-shrink-0">
                        {action}
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="w-full">
                {children}
            </div>
        </div>
    );
}

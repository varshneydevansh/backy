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
    contentClassName?: string;
    hideHeader?: boolean;
}

export function PageShell({
    title,
    description,
    action,
    children,
    className,
    contentClassName,
    hideHeader = false,
}: PageShellProps) {
    return (
        <div
            className={cn("min-w-0 max-w-full", hideHeader ? "space-y-0" : "space-y-6", className)}
            data-testid="admin-page-shell"
            data-layout-contract="ordinary-admin-page-contained"
        >
            {/* Page Header */}
            {!hideHeader && (
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h1 className="break-words text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">{title}</h1>
                    {description && (
                        <p className="mt-1 max-w-3xl break-words text-muted-foreground [overflow-wrap:anywhere]">
                            {description}
                        </p>
                    )}
                </div>

                {/* Primary Action (New Button, etc.) */}
                {action && (
                    <div className="min-w-0 max-w-full">
                        {action}
                    </div>
                )}
            </div>
            )}

            {/* Main Content */}
            <div
                className={cn("min-w-0 w-full max-w-full overflow-x-clip", contentClassName)}
                data-testid="admin-page-shell-content"
                data-layout-contract="route-content-overflow-contained"
            >
                {children}
            </div>
        </div>
    );
}

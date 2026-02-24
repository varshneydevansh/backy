import React from 'react';
import { cn } from './utils';

// We will implement actual Plate UI components later.
// For now, this is a placeholder to prevent import errors if we expand.
export const Toolbar = ({ className, children }: { className?: string, children: React.ReactNode }) => {
    return (
        <div className={cn("sticky top-0 z-50 flex items-center gap-1 border-b bg-background p-1", className)}>
            {children}
        </div>
    );
};

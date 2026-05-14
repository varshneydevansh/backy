import React from 'react';
import { cn } from '../utils';

export const Toolbar = ({ className, children }: { className?: string; children: React.ReactNode }) => {
    return (
        <div
            role="toolbar"
            className={cn('sticky top-0 z-50 flex items-center gap-1 border-b bg-background p-1', className)}
        >
            {children}
        </div>
    );
};

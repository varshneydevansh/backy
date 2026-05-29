/**
 * StatusBadge Component
 * 
 * Consistent status indicators for the dashboard.
 * Supports: published, draft, archived, active, inactive, etc.
 */

import { cn } from '@/lib/utils';
import { getStatusLabel, getStatusType, type StatusType } from './statusBadgeUtils';

interface StatusBadgeProps {
    status?: string | null;
    type?: StatusType;
    className?: string;
}

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
    const badgeType = getStatusType(status, type);
    const label = getStatusLabel(status);

    const variants = {
        success: 'border-success/25 bg-success/10 text-success',
        warning: 'border-warning/25 bg-warning/10 text-warning',
        error: 'border-destructive/25 bg-destructive/10 text-destructive',
        neutral: 'border-border bg-muted text-muted-foreground',
        info: 'border-info/25 bg-info/10 text-info',
    };

    return (
        <span className={cn(
            "inline-flex max-w-full min-w-0 items-center whitespace-normal break-words px-2.5 py-0.5 text-left text-xs font-medium leading-5 [overflow-wrap:anywhere] rounded-full border",
            variants[badgeType],
            className
        )}>
            {label}
        </span>
    );
}

/**
 * StatusBadge Component
 * 
 * Consistent status indicators for the dashboard.
 * Supports: published, draft, archived, active, inactive, etc.
 */

import { cn } from '@/lib/utils';

type StatusType = 'success' | 'warning' | 'error' | 'neutral' | 'info';

interface StatusBadgeProps {
    status?: string | null;
    type?: StatusType;
    className?: string;
}

// Map common status strings to types automatically
const STATUS_MAP: Record<string, StatusType> = {
    published: 'success',
    active: 'success',
    online: 'success',
    draft: 'warning',
    pending: 'warning',
    invited: 'info',
    archived: 'neutral',
    inactive: 'neutral',
    suspended: 'error',
    deleted: 'error',
    error: 'error',
    info: 'info',
};

const normalizeStatus = (value?: string | null) => {
    return (value || '').toString().trim().toLowerCase();
};

const labelCase = (value: string) => {
    if (!value) return 'Unknown';

    return value
      .replace(/[-_]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(' ');
};

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
    // Auto-detect type if not provided
    const normalizedStatus = normalizeStatus(status);
    const badgeType = type || STATUS_MAP[normalizedStatus] || 'neutral';
    const label = labelCase(normalizedStatus);

    const variants = {
        success: 'border-success/25 bg-success/10 text-success',
        warning: 'border-warning/25 bg-warning/10 text-warning',
        error: 'border-destructive/25 bg-destructive/10 text-destructive',
        neutral: 'border-border bg-muted text-muted-foreground',
        info: 'border-info/25 bg-info/10 text-info',
    };

    return (
        <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
            variants[badgeType],
            className
        )}>
            {label}
        </span>
    );
}

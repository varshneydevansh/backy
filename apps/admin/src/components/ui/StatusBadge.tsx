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
    archived: 'neutral',
    inactive: 'neutral',
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
        success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-900',
        warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-900',
        error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-900',
        neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-800',
        info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-900',
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

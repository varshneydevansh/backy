/**
 * DataGrid Component
 * 
 * Unified table component for the admin dashboard.
 * Works with useDataTable hook.
 */

import { ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Column } from '@/hooks/useDataTable';

interface DataGridProps<T> {
    columns: Column<T>[];
    data: T[];
    loading?: boolean;
    emptyState?: React.ReactNode;
    interactionDisabled?: boolean;

    // Sorting
    sortConfig?: { key: keyof T; direction: 'asc' | 'desc' };
    onSort?: (key: keyof T) => void;

    // Pagination
    currentPage?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
    totalItems?: number;
    pageSize?: number;
}

export function DataGrid<T extends { id: string }>({
    columns,
    data,
    loading,
    emptyState,
    interactionDisabled = false,
    sortConfig,
    onSort,
    currentPage = 1,
    totalPages = 1,
    onPageChange,
    totalItems,
    pageSize = data.length || 1
}: DataGridProps<T>) {
    const itemCount = totalItems ?? data.length;
    const firstVisibleItem = itemCount === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
    const lastVisibleItem = Math.min(itemCount, firstVisibleItem + data.length - 1);

    if (loading) {
        return (
            <div className="w-full h-64 flex items-center justify-center border border-border rounded-xl bg-card">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (data.length === 0 && emptyState) {
        return emptyState;
    }

    return (
        <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                            <tr>
                                {columns.map((col) => {
                                    const isSorted = sortConfig?.key === col.key;
                                    const ariaSort = isSorted
                                        ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending')
                                        : undefined;

                                    return (
                                    <th
                                        key={String(col.key)}
                                        aria-sort={ariaSort}
                                        className="px-6 py-3"
                                    >
                                        {col.sortable ? (
                                            <button
                                                type="button"
                                                onClick={() => onSort?.(col.key as keyof T)}
                                                disabled={interactionDisabled}
                                                className={cn(
                                                    'inline-flex items-center gap-2 rounded-md text-left transition-colors',
                                                    'hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                                                    'disabled:cursor-not-allowed disabled:opacity-50',
                                                    isSorted ? 'text-foreground' : 'text-muted-foreground'
                                                )}
                                            >
                                                {col.label}
                                                <ArrowUpDown className={cn(
                                                    "w-3 h-3",
                                                    isSorted && sortConfig.direction === 'asc' ? "text-primary" : "text-muted-foreground"
                                                )} />
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                {col.label}
                                            </div>
                                        )}
                                    </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.map((item) => (
                                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                                    {columns.map((col) => (
                                        <td key={String(col.key)} className="px-6 py-4">
                                            {col.render ? col.render(item) : String(item[col.key as keyof T])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Footer */}
            {totalPages > 1 && onPageChange && (
                <div className="flex items-center justify-between px-2">
                    <p className="text-sm text-muted-foreground">
                        Showing {firstVisibleItem}-{lastVisibleItem} of {itemCount} items
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onPageChange(currentPage - 1)}
                            disabled={currentPage === 1 || interactionDisabled}
                            aria-label="Previous page"
                            className="p-2 rounded-lg border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium px-2">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => onPageChange(currentPage + 1)}
                            disabled={currentPage === totalPages || interactionDisabled}
                            aria-label="Next page"
                            className="p-2 rounded-lg border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

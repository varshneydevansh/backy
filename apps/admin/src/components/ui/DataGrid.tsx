/**
 * DataGrid Component
 * 
 * Unified table component for the admin dashboard.
 * Works with useDataTable hook.
 */

import { useId } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Column } from '@/hooks/useDataTable';

interface DataGridProps<T> {
    columns: Column<T>[];
    data: T[];
    loading?: boolean;
    emptyState?: React.ReactNode;
    interactionDisabled?: boolean;
    tableMinWidth?: string;
    stickyActionColumn?: boolean;

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

const parsePixelSize = (value: string | undefined): number => {
    const match = value?.trim().match(/^(\d+(?:\.\d+)?)px$/);
    return match ? Number(match[1]) : 0;
};

export function DataGrid<T extends { id: string }>({
    columns,
    data,
    loading,
    emptyState,
    interactionDisabled = false,
    tableMinWidth,
    stickyActionColumn = true,
    sortConfig,
    onSort,
    currentPage = 1,
    totalPages = 1,
    onPageChange,
    totalItems,
    pageSize = data.length || 1
}: DataGridProps<T>) {
    const descriptionId = useId();
    const paginationStatusId = useId();
    const safeTotalPages = Math.max(1, totalPages);
    const safeCurrentPage = Math.min(Math.max(currentPage, 1), safeTotalPages);
    const safePageSize = Math.max(1, pageSize);
    const itemCount = totalItems ?? data.length;
    const firstVisibleItem = itemCount === 0 ? 0 : ((safeCurrentPage - 1) * safePageSize) + 1;
    const lastVisibleItem = itemCount === 0 ? 0 : Math.min(itemCount, firstVisibleItem + data.length - 1);
    const previousPage = Math.max(1, safeCurrentPage - 1);
    const nextPage = Math.min(safeTotalPages, safeCurrentPage + 1);
    const previousPageLabel = safeCurrentPage === 1
        ? `Previous page unavailable. Page ${safeCurrentPage} is the first page.`
        : `Go to previous page, page ${previousPage} of ${safeTotalPages}.`;
    const nextPageLabel = safeCurrentPage === safeTotalPages
        ? `Next page unavailable. Page ${safeCurrentPage} is the last page.`
        : `Go to next page, page ${nextPage} of ${safeTotalPages}.`;
    const gridSummary = itemCount === 0
        ? 'No rows to show.'
        : `Showing ${firstVisibleItem}-${lastVisibleItem} of ${itemCount} rows.`;
    const getColumnKey = (column: Column<T>) => String(column.key);
    const getSafeColumnKey = (columnKey: string) => columnKey.replace(/[^a-zA-Z0-9_-]/g, '-') || 'column';
    const getColumnLabel = (column: Column<T>) => {
        const label = column.label.trim();
        if (label) return label;
        return getColumnKey(column) === 'actions' ? 'Actions' : 'Column';
    };
    const getColumnHeaderId = (column: Column<T>) => `${descriptionId}-header-${getSafeColumnKey(getColumnKey(column))}`;
    const columnWidthTotal = Math.ceil(
        columns.reduce((total, column) => total + parsePixelSize(column.width), 0),
    );
    const requestedTableMinWidth = parsePixelSize(tableMinWidth);
    const effectiveTableMinWidth = Math.max(requestedTableMinWidth, columnWidthTotal);
    const effectiveTableMinWidthStyle = effectiveTableMinWidth > 0
        ? `${effectiveTableMinWidth}px`
        : tableMinWidth;

    if (loading) {
        return (
            <div
                className="overflow-hidden rounded-xl border border-border bg-card"
                role="status"
                aria-live="polite"
                aria-label="Loading table data"
                data-testid="admin-data-grid-loading"
                data-column-count={columns.length}
            >
                <div className="overflow-x-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-border bg-muted/50">
                            <tr>
                                {columns.map((col) => (
                                    <th
                                        key={getColumnKey(col)}
                                        scope="col"
                                        aria-label={getColumnLabel(col)}
                                        data-column-key={getColumnKey(col)}
                                        data-column-label={getColumnLabel(col)}
                                        className="px-6 py-3"
                                    >
                                        <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/15" aria-hidden="true" />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {Array.from({ length: 5 }).map((_, rowIndex) => (
                                <tr key={rowIndex}>
                                    {columns.map((col, colIndex) => (
                                        <td key={String(col.key)} className="px-6 py-4">
                                            <div
                                                className={cn(
                                                    'h-4 animate-pulse rounded bg-muted',
                                                    colIndex === 0 ? 'w-44 max-w-full' : colIndex % 2 === 0 ? 'w-28 max-w-full' : 'w-20 max-w-full',
                                                )}
                                                style={{ animationDelay: `${(rowIndex + colIndex) * 45}ms` }}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div
                data-testid="admin-data-grid-empty"
                data-total-items={itemCount}
                role="status"
                aria-live="polite"
            >
                {emptyState ?? (
                    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
                        <p className="text-sm font-semibold text-foreground">No rows yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">Create or import records to populate this table.</p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            className="min-w-0 max-w-full space-y-3 overflow-x-clip"
            style={{
                contain: 'layout paint inline-size',
                maxInlineSize: '100%',
            }}
            aria-describedby={descriptionId}
            data-testid="admin-data-grid"
            data-overflow-containment="inline-size"
            data-row-count={data.length}
            data-total-items={itemCount}
            data-current-page={safeCurrentPage}
            data-total-pages={safeTotalPages}
            data-interaction-disabled={interactionDisabled ? 'true' : 'false'}
        >
            <span id={descriptionId} className="sr-only" data-testid="admin-data-grid-summary">
                {gridSummary}
            </span>
            <div
                className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                style={{
                    contain: 'layout paint inline-size',
                    maxInlineSize: '100%',
                }}
            >
                <div
                    className="w-full min-w-0 overflow-x-auto"
                    style={{
                        contain: 'layout paint inline-size',
                        maxInlineSize: '100%',
                    }}
                    data-testid="admin-data-grid-scroll"
                >
                    <table
                        className="w-full table-fixed text-left text-sm"
                        style={effectiveTableMinWidthStyle ? { minInlineSize: effectiveTableMinWidthStyle } : undefined}
                        data-table-min-width={effectiveTableMinWidthStyle || undefined}
                        data-requested-table-min-width={tableMinWidth || undefined}
                        data-column-width-total={columnWidthTotal || undefined}
                        data-layout-policy="viewport-contained-wrapped-table"
                    >
                        {columns.some((column) => Boolean(column.width)) && (
                            <colgroup data-testid="admin-data-grid-column-widths">
                                {columns.map((column) => (
                                    <col
                                        key={getColumnKey(column)}
                                        style={column.width ? { width: column.width } : undefined}
                                        data-column-key={getColumnKey(column)}
                                        data-column-width={column.width || undefined}
                                    />
                                ))}
                            </colgroup>
                        )}
                        <caption className="sr-only">{gridSummary}</caption>
                        <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border" data-testid="admin-data-grid-head">
                            <tr>
                                {columns.map((col) => {
                                    const columnKey = getColumnKey(col);
                                    const columnLabel = getColumnLabel(col);
                                    const columnHeaderId = getColumnHeaderId(col);
                                    const isActionColumn = columnKey === 'actions';
                                    const shouldStickActionColumn = stickyActionColumn && isActionColumn;
                                    const isSorted = sortConfig?.key === col.key;
                                    const activeDirection = isSorted ? sortConfig?.direction ?? 'asc' : null;
                                    const canSortColumn = Boolean(onSort) && !interactionDisabled;
                                    const ariaSort = activeDirection
                                        ? (activeDirection === 'asc' ? 'ascending' : 'descending')
                                        : undefined;
                                    const sortDirection = activeDirection ?? 'none';
                                    const nextSortDirection = activeDirection === 'asc' ? 'desc' : 'asc';
                                    const sortDirectionWord = nextSortDirection === 'asc' ? 'ascending' : 'descending';
                                    const sortDisabledReason = !onSort
                                        ? 'sorting-handler-missing'
                                        : interactionDisabled
                                            ? 'table-interaction-disabled'
                                            : '';
                                    const sortStatusId = `${descriptionId}-sort-status-${getSafeColumnKey(columnKey)}`;
                                    const sortStatusText = activeDirection
                                        ? `Currently sorted ${activeDirection === 'asc' ? 'ascending' : 'descending'}. Activate to sort ${sortDirectionWord}.`
                                        : 'Not currently sorted. Activate to sort ascending.';
                                    const sortAriaLabel = canSortColumn
                                        ? `Sort by ${columnLabel} ${sortDirectionWord}`
                                        : `Sorting by ${columnLabel} is unavailable.`;
                                    const sortButtonTitle = sortAriaLabel;
                                    const SortIcon = activeDirection === 'asc'
                                        ? ArrowUp
                                        : activeDirection === 'desc'
                                            ? ArrowDown
                                            : ArrowUpDown;

                                    return (
                                    <th
                                        key={columnKey}
                                        id={columnHeaderId}
                                        scope="col"
                                        aria-sort={ariaSort}
                                        aria-label={columnLabel}
                                        className={cn(
                                            'min-w-0 break-words px-4 py-3 align-top [overflow-wrap:anywhere]',
                                            shouldStickActionColumn && 'sticky right-0 z-20 bg-muted/95 shadow-[-10px_0_20px_-18px_rgba(15,23,42,0.45)]',
                                            isActionColumn && 'border-l border-border/80',
                                            col.className,
                                            col.headerClassName,
                                        )}
                                        data-column-key={columnKey}
                                        data-column-label={columnLabel}
                                        data-sticky-column={shouldStickActionColumn ? 'right-actions' : undefined}
                                        data-action-column-sticky={isActionColumn ? (stickyActionColumn ? 'true' : 'false') : undefined}
                                    >
                                        {col.sortable ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (canSortColumn) {
                                                        onSort?.(col.key as keyof T);
                                                    }
                                                }}
                                                disabled={!canSortColumn}
                                                aria-disabled={!canSortColumn}
                                                aria-label={sortAriaLabel}
                                                aria-describedby={sortStatusId}
                                                title={sortButtonTitle}
                                                data-testid={`admin-data-grid-sort-${columnKey}`}
                                                data-sort-active={isSorted ? 'true' : 'false'}
                                                data-sort-state={sortDirection}
                                                data-sort-next-direction={nextSortDirection}
                                                data-sort-icon-direction={activeDirection ?? 'unsorted'}
                                                data-sort-disabled-reason={sortDisabledReason}
                                                className={cn(
                                                    'inline-flex min-h-8 min-w-0 items-center gap-2 rounded-md px-1.5 text-left transition-colors',
                                                    'hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                                                    'disabled:cursor-not-allowed disabled:opacity-50',
                                                    isSorted ? 'text-foreground' : 'text-muted-foreground'
                                                )}
                                            >
                                                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{columnLabel}</span>
                                                <SortIcon
                                                    className={cn(
                                                        "w-3 h-3",
                                                        isSorted ? "text-primary" : "text-muted-foreground"
                                                    )}
                                                    aria-hidden="true"
                                                />
                                                <span
                                                    id={sortStatusId}
                                                    className="sr-only"
                                                    data-testid={`admin-data-grid-sort-status-${columnKey}`}
                                                >
                                                    {sortStatusText}
                                                </span>
                                            </button>
                                        ) : (
                                            <div className="flex min-w-0 items-center gap-2">
                                                {col.label.trim() ? col.label : <span className="sr-only">{columnLabel}</span>}
                                            </div>
                                        )}
                                    </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border" data-testid="admin-data-grid-body">
                            {data.map((item) => (
                                <tr
                                    key={item.id}
                                    className="group hover:bg-muted/30 transition-colors"
                                    data-testid="admin-data-grid-row"
                                    data-row-id={item.id}
                                >
                                    {columns.map((col) => {
                                        const columnKey = getColumnKey(col);
                                        const columnLabel = getColumnLabel(col);
                                        const isActionColumn = columnKey === 'actions';
                                        const shouldStickActionColumn = stickyActionColumn && isActionColumn;
                                        const usesVisibleOverflow = col.overflowMode === 'visible';
                                        const cellContent = col.render ? col.render(item) : String(item[col.key as keyof T]);

                                        return (
                                            <td
                                                key={columnKey}
                                                headers={getColumnHeaderId(col)}
                                                className={cn(
                                                    'min-w-0 whitespace-normal break-words px-4 py-4 align-top [overflow-wrap:anywhere]',
                                                    usesVisibleOverflow ? 'overflow-visible' : 'overflow-hidden',
                                                    shouldStickActionColumn && 'sticky right-0 z-30 bg-card shadow-[-10px_0_20px_-18px_rgba(15,23,42,0.45)] transition-colors group-hover:bg-muted/30',
                                                    isActionColumn && 'border-l border-border/80',
                                                    col.className,
                                                    col.cellClassName,
                                                )}
                                                style={usesVisibleOverflow ? undefined : { contain: 'paint' }}
                                                data-column-key={columnKey}
                                                data-column-label={columnLabel}
                                                data-cell-overflow-policy={usesVisibleOverflow ? 'visible-and-wrapped' : 'clip-and-wrap'}
                                                data-cell-paint-containment={usesVisibleOverflow ? 'none' : 'cell'}
                                                data-sticky-column={shouldStickActionColumn ? 'right-actions' : undefined}
                                                data-action-column-sticky={isActionColumn ? (stickyActionColumn ? 'true' : 'false') : undefined}
                                            >
                                                <div
                                                    className={cn(
                                                        'isolate min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] [&_a]:break-words [&_a]:[overflow-wrap:anywhere] [&_code]:whitespace-normal [&_code]:break-words [&_code]:[overflow-wrap:anywhere]',
                                                        usesVisibleOverflow ? 'overflow-visible' : 'overflow-hidden',
                                                        col.contentClassName,
                                                    )}
                                                    style={usesVisibleOverflow
                                                        ? { maxInlineSize: '100%' }
                                                        : {
                                                            contain: 'layout paint',
                                                            maxInlineSize: '100%',
                                                        }}
                                                    data-testid="admin-data-grid-cell-content"
                                                    data-cell-content-policy={usesVisibleOverflow ? 'visible-wrapped-content' : 'constrained-wrapped-content'}
                                                    data-cell-descendant-overflow-policy={usesVisibleOverflow ? 'visible' : 'paint-contained'}
                                                >
                                                    {cellContent}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Footer */}
            {safeTotalPages > 1 && onPageChange && (
                <nav
                    className="flex items-center justify-between gap-3 px-2"
                    aria-label="Table pagination"
                    aria-describedby={paginationStatusId}
                    data-testid="admin-data-grid-pagination"
                >
                    <p
                        id={paginationStatusId}
                        className="min-w-0 text-sm text-muted-foreground"
                        aria-live="polite"
                        data-testid="admin-data-grid-pagination-summary"
                    >
                        Showing {firstVisibleItem}-{lastVisibleItem} of {itemCount} items
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onPageChange(previousPage)}
                            disabled={safeCurrentPage === 1 || interactionDisabled}
                            aria-disabled={safeCurrentPage === 1 || interactionDisabled}
                            aria-label={previousPageLabel}
                            data-testid="admin-data-grid-previous-page"
                            data-current-page={safeCurrentPage}
                            data-target-page={previousPage}
                            className="p-2 rounded-lg border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span
                            className="text-sm font-medium px-2 tabular-nums"
                            aria-current="page"
                            data-testid="admin-data-grid-page-indicator"
                            data-current-page={safeCurrentPage}
                            data-total-pages={safeTotalPages}
                        >
                            Page {safeCurrentPage} of {safeTotalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => onPageChange(nextPage)}
                            disabled={safeCurrentPage === safeTotalPages || interactionDisabled}
                            aria-disabled={safeCurrentPage === safeTotalPages || interactionDisabled}
                            aria-label={nextPageLabel}
                            data-testid="admin-data-grid-next-page"
                            data-current-page={safeCurrentPage}
                            data-target-page={nextPage}
                            className="p-2 rounded-lg border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </nav>
            )}
        </div>
    );
}

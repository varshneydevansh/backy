/**
 * useDataTable Hook
 * 
 * Shared logic for all list views (Sites, Pages, Blog, etc.)
 * Handles:
 * - Sorting
 * - Filtering (Search)
 * - Pagination
 */

import { useState, useMemo } from 'react';

export interface Column<T> {
    key: keyof T | 'actions';
    label: string;
    render?: (item: T) => React.ReactNode;
    sortable?: boolean;
    width?: string;
    overflowMode?: 'clipped' | 'visible';
    className?: string;
    headerClassName?: string;
    cellClassName?: string;
    contentClassName?: string;
}

interface UseDataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    initialSort?: { key: keyof T; direction: 'asc' | 'desc' };
    initialSearch?: string;
    initialPage?: number;
    pageSize?: number;
    getSearchText?: (item: T) => string;
}

export function useDataTable<T>({
    data,
    initialSort = { key: 'createdAt' as keyof T, direction: 'desc' },
    initialSearch = '',
    initialPage = 1,
    pageSize = 10,
    getSearchText
}: UseDataTableProps<T>) {
    // State
    const [searchQuery, setSearchQuery] = useState(initialSearch);
    const [sortConfig, setSortConfig] = useState(initialSort);
    const [currentPage, setCurrentPage] = useState(initialPage);

    // 1. Filter
    const filteredData = useMemo(() => {
        if (!searchQuery) return data;
        const normalizedSearch = searchQuery.toLowerCase();

        return data.filter(item => {
            if (getSearchText?.(item).toLowerCase().includes(normalizedSearch)) {
                return true;
            }

            // Simple search across all string values
            return Object.values(item as any).some(val =>
                String(val).toLowerCase().includes(normalizedSearch)
            );
        });
    }, [data, getSearchText, searchQuery]);

    // 2. Sort
    const sortedData = useMemo(() => {
        return [...filteredData].sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];

            if (aVal === bVal) return 0;

            const comparison = aVal > bVal ? 1 : -1;
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
    }, [filteredData, sortConfig]);

    // 3. Paginate
    const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
    const visibleCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
    const paginatedData = useMemo(() => {
        const start = (visibleCurrentPage - 1) * pageSize;
        return sortedData.slice(start, start + pageSize);
    }, [sortedData, visibleCurrentPage, pageSize]);

    // Actions
    const handleSort = (key: keyof T) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    return {
        data: paginatedData,
        searchQuery,
        setSearchQuery,
        sortConfig,
        setSortConfig,
        handleSort,
        currentPage: visibleCurrentPage,
        setCurrentPage,
        totalPages,
        totalItems: filteredData.length,
        filteredData: sortedData
    };
}

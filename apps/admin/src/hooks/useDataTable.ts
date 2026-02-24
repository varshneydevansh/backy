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
}

interface UseDataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    initialSort?: { key: keyof T; direction: 'asc' | 'desc' };
    pageSize?: number;
}

export function useDataTable<T>({
    data,
    columns,
    initialSort = { key: 'createdAt' as keyof T, direction: 'desc' },
    pageSize = 10
}: UseDataTableProps<T>) {
    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState(initialSort);
    const [currentPage, setCurrentPage] = useState(1);

    // 1. Filter
    const filteredData = useMemo(() => {
        if (!searchQuery) return data;

        return data.filter(item => {
            // Simple search across all string values
            return Object.values(item as any).some(val =>
                String(val).toLowerCase().includes(searchQuery.toLowerCase())
            );
        });
    }, [data, searchQuery]);

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
    const totalPages = Math.ceil(sortedData.length / pageSize);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedData.slice(start, start + pageSize);
    }, [sortedData, currentPage, pageSize]);

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
        handleSort,
        currentPage,
        setCurrentPage,
        totalPages,
        totalItems: filteredData.length
    };
}

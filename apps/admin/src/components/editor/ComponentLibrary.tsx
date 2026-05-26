/**
 * ============================================================================
 * BACKY CMS - COMPONENT LIBRARY
 * ============================================================================
 *
 * The component library sidebar that provides draggable components
 * for building pages. Users can drag elements onto the canvas.
 *
 * @module ComponentLibrary
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import { useEffect, useMemo, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react';
import {
  Type,
  Heading,
  Image,
  Square,
  MousePointerClick,
  Video,
  Code,
  Minus,
  FormInput,
  List,
  Quote,
  Link as LinkIcon,
  Box,
  Search,
  MapPin,
  AlignLeft,
  MessageSquare,
  CheckSquare,
  Circle,
  Sparkles,
  LayoutGrid,
  BookmarkPlus,
  Star,
  RefreshCw,
  Pencil,
  Trash2,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ComponentLibraryItem } from '@/types/editor';
import { CANVAS_COMPONENT_LIBRARY } from '@/components/editor/editorCatalog';
import type { ReusableSection } from '@/lib/adminContentApi';

// ============================================
// COMPONENT LIBRARY ITEMS
// ============================================

const LIBRARY_ITEMS: ComponentLibraryItem[] = CANVAS_COMPONENT_LIBRARY;
const ESSENTIALS_CATEGORY_ID = 'essentials';
const RECENT_CATEGORY_ID = 'recent';
const FAVORITES_CATEGORY_ID = 'favorites';
const RECENT_STORAGE_KEY = 'backy.editor.componentLibrary.recent';
const FAVORITES_STORAGE_KEY = 'backy.editor.componentLibrary.favorites';
const RECENT_ITEM_LIMIT = 6;
const ESSENTIAL_ITEM_KEYS = new Set([
  'heading',
  'text',
  'button',
  'image',
  'box',
  'columns',
  'form',
  'input',
  'divider',
  'nav',
  'repeater',
  'blog-post-card',
]);
const COMPONENT_LIBRARY_CATEGORIES = [
  { id: ESSENTIALS_CATEGORY_ID, name: 'Essentials', color: 'bg-emerald-500' },
  { id: RECENT_CATEGORY_ID, name: 'Recent', color: 'bg-cyan-500' },
  { id: FAVORITES_CATEGORY_ID, name: 'Favorites', color: 'bg-yellow-400' },
  { id: 'basic', name: 'Basic', color: 'bg-blue-500' },
  { id: 'content', name: 'Content', color: 'bg-indigo-500' },
  { id: 'media', name: 'Media', color: 'bg-purple-500' },
  { id: 'layout', name: 'Layout', color: 'bg-green-500' },
  { id: 'form', name: 'Form', color: 'bg-orange-500' },
  { id: 'saved', name: 'Saved', color: 'bg-sky-500' },
  { id: 'advanced', name: 'Advanced', color: 'bg-red-500' },
];

const getLibraryCategory = (item: ComponentLibraryItem): string => item.category || 'basic';
const getLibraryItemKey = (item: ComponentLibraryItem): string => String(item.id ?? item.type);
const getLibraryItemDomKey = (item: ComponentLibraryItem): string => (
  getLibraryItemKey(item).replace(/[^a-zA-Z0-9_-]/g, '-')
);
const isReusableLibraryItem = (item: ComponentLibraryItem): boolean => (
  Boolean(item.reusableContent?.sectionId) || getLibraryCategory(item) === 'saved'
);
const isEssentialLibraryItem = (item: ComponentLibraryItem): boolean => (
  ESSENTIAL_ITEM_KEYS.has(getLibraryItemKey(item))
);
const itemMatchesSearch = (item: ComponentLibraryItem, normalizedSearchQuery: string): boolean => (
  normalizedSearchQuery.length === 0 ||
  item.name.toLowerCase().includes(normalizedSearchQuery) ||
  Boolean(item.description?.toLowerCase().includes(normalizedSearchQuery))
);
const normalizeReusableSectionDedupeValue = (value: string | null | undefined): string => (
  (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
);
const getReusableSectionSortTime = (section: ReusableSection): number => {
  const timestamp = Date.parse(section.updatedAt || section.createdAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};
const getReusableSectionDedupeKey = (section: ReusableSection): string => {
  const root = section.content.elements?.[0];
  const canvasSize = section.content.canvasSize;

  return [
    normalizeReusableSectionDedupeValue(section.name),
    normalizeReusableSectionDedupeValue(section.description),
    normalizeReusableSectionDedupeValue(section.category),
    root?.type || 'unknown',
    Math.round(root?.width || canvasSize?.width || 0),
    Math.round(root?.height || canvasSize?.height || 0),
  ].join('|');
};
const getReusableSectionDuplicateCount = (item: ComponentLibraryItem): number => {
  const value = item.reusableContent?.metadata?.libraryDuplicateCount;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
};

// ============================================
// COMPONENT
// ============================================

interface ComponentLibraryProps {
  /** Callback when a component is dragged */
  onDragStart?: (item: ComponentLibraryItem) => void;
  /** Callback when a library component drag finishes or is cancelled */
  onDragEnd?: () => void;
  reusableSections?: ReusableSection[];
  reusableSectionsLoading?: boolean;
  reusableSectionsError?: string | null;
  canSaveSelection?: boolean;
  canDeleteReusableSections?: boolean;
  isSavingReusableSection?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  deleteDisabledReason?: string;
  onAddItem?: (item: ComponentLibraryItem) => void;
  onRefreshReusableSections?: () => void;
  onSaveSelectionAsReusableSection?: () => void;
  onRenameReusableSection?: (sectionId: string) => void;
  onDeleteReusableSection?: (sectionId: string) => void;
}

/**
 * Component Library Sidebar
 *
 * Displays available components organized by category.
 * Users can drag components onto the canvas.
 */
export function ComponentLibrary({
  onDragStart,
  onDragEnd,
  reusableSections = [],
  reusableSectionsLoading = false,
  reusableSectionsError = null,
  canSaveSelection = false,
  canDeleteReusableSections = true,
  isSavingReusableSection = false,
  disabled = false,
  disabledReason,
  deleteDisabledReason,
  onAddItem,
  onRefreshReusableSections,
  onSaveSelectionAsReusableSection,
  onRenameReusableSection,
  onDeleteReusableSection,
}: ComponentLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(ESSENTIALS_CATEGORY_ID);
  const [previewItemKey, setPreviewItemKey] = useState<string | null>(null);
  const [recentItemKeys, setRecentItemKeys] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const parsed = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
      return [];
    }
  });
  const [favoriteItemKeys, setFavoriteItemKeys] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
      return [];
    }
  });

  const reusableLibraryState = useMemo(() => {
    const activeSections = reusableSections
      .filter((section) => section.status !== 'archived')
      .filter((section) => Boolean(section.content.elements?.[0]))
      .sort((left, right) => {
        const timeDelta = getReusableSectionSortTime(right) - getReusableSectionSortTime(left);
        return timeDelta !== 0 ? timeDelta : right.id.localeCompare(left.id);
      });
    const groups = new Map<string, ReusableSection[]>();

    for (const section of activeSections) {
      const key = getReusableSectionDedupeKey(section);
      groups.set(key, [...(groups.get(key) || []), section]);
    }

    const items = Array.from(groups.values()).flatMap<ComponentLibraryItem>((group) => {
      const section = group[0];
      const root = section.content.elements?.[0];
      if (!root) {
        return [];
      }
      const duplicateCount = Math.max(0, group.length - 1);

      return [{
        id: `reusable-section:${section.id}`,
        type: root.type,
        name: section.name,
        icon: 'Sparkles',
        category: 'saved',
        description: section.description || `Saved ${section.category || 'section'} template`,
        defaultProps: root.props,
        defaultStyles: root.styles,
        defaultSize: {
          width: root.width || section.content.canvasSize?.width || 640,
          height: root.height || section.content.canvasSize?.height || 360,
        },
        reusableContent: {
          ...section.content,
          metadata: {
            ...(section.content.metadata || {}),
            libraryDuplicateCount: duplicateCount,
            libraryDuplicateIds: group.slice(1).map((duplicate) => duplicate.id),
          },
          sectionId: section.id,
          slug: section.slug,
          name: section.name,
          sourceUpdatedAt: section.updatedAt,
          syncMode: 'synced',
        },
      } satisfies ComponentLibraryItem];
    });

    return {
      items,
      hiddenDuplicateCount: activeSections.length - items.length,
      totalActiveCount: activeSections.length,
    };
  }, [reusableSections]);
  const reusableItems = reusableLibraryState.items;

  const libraryItems = useMemo(
    () => [...LIBRARY_ITEMS, ...reusableItems],
    [reusableItems],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentItemKeys));
  }, [recentItemKeys]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteItemKeys));
  }, [favoriteItemKeys]);

  const libraryItemByKey = useMemo(() => (
    new Map(libraryItems.map((item) => [getLibraryItemKey(item), item]))
  ), [libraryItems]);
  const recentKeySet = useMemo(() => new Set(recentItemKeys), [recentItemKeys]);
  const recentItems = useMemo(() => (
    recentItemKeys
      .map((itemKey) => libraryItemByKey.get(itemKey))
      .filter((item): item is ComponentLibraryItem => Boolean(item))
  ), [libraryItemByKey, recentItemKeys]);
  const favoriteKeySet = useMemo(() => new Set(favoriteItemKeys), [favoriteItemKeys]);
  const favoriteItems = useMemo(
    () => libraryItems.filter((item) => favoriteKeySet.has(getLibraryItemKey(item))),
    [favoriteKeySet, libraryItems],
  );
  const previewItem = useMemo(
    () => libraryItems.find((item) => getLibraryItemKey(item) === previewItemKey) || null,
    [libraryItems, previewItemKey],
  );
  const categories = COMPONENT_LIBRARY_CATEGORIES;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isGlobalSearch = normalizedSearchQuery.length > 0 && selectedCategory === ESSENTIALS_CATEGORY_ID;

  const toggleFavorite = (item: ComponentLibraryItem) => {
    const itemKey = getLibraryItemKey(item);
    setFavoriteItemKeys((current) => (
      current.includes(itemKey)
        ? current.filter((key) => key !== itemKey)
        : [...current, itemKey]
    ));
  };
  const rememberRecentItem = (item: ComponentLibraryItem) => {
    const itemKey = getLibraryItemKey(item);
    setRecentItemKeys((current) => (
      [itemKey, ...current.filter((key) => key !== itemKey)].slice(0, RECENT_ITEM_LIMIT)
    ));
  };
  const handleAddItem = (item: ComponentLibraryItem) => {
    rememberRecentItem(item);
    onAddItem?.(item);
  };

  // Filter items
  const filteredItems = useMemo(() => {
    if (selectedCategory === RECENT_CATEGORY_ID) {
      return recentItems.filter((item) => itemMatchesSearch(item, normalizedSearchQuery));
    }

    return libraryItems.filter((item) => {
      if (!itemMatchesSearch(item, normalizedSearchQuery)) return false;

      if (selectedCategory === ESSENTIALS_CATEGORY_ID) {
        return isGlobalSearch ? true : isEssentialLibraryItem(item);
      }

      if (selectedCategory === FAVORITES_CATEGORY_ID) {
        return favoriteKeySet.has(getLibraryItemKey(item));
      }

      return !selectedCategory || getLibraryCategory(item) === selectedCategory;
    });
  }, [favoriteKeySet, isGlobalSearch, libraryItems, normalizedSearchQuery, recentItems, selectedCategory]);

  // Group by category
  const groupedItems = useMemo(() => filteredItems.reduce((acc, item) => {
    const category = isGlobalSearch
      ? getLibraryCategory(item)
      : selectedCategory === ESSENTIALS_CATEGORY_ID
      ? ESSENTIALS_CATEGORY_ID
      : selectedCategory === RECENT_CATEGORY_ID
      ? RECENT_CATEGORY_ID
      : selectedCategory === FAVORITES_CATEGORY_ID
      ? FAVORITES_CATEGORY_ID
      : getLibraryCategory(item);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, ComponentLibraryItem[]>), [filteredItems, isGlobalSearch, selectedCategory]);

  const totalSearchResultCount = useMemo(() => (
    libraryItems.filter((item) => itemMatchesSearch(item, normalizedSearchQuery)).length
  ), [libraryItems, normalizedSearchQuery]);
  const categoryItemCounts = useMemo(() => categories.reduce<Record<string, number>>((acc, category) => {
    acc[category.id] = libraryItems.filter((item) => (
      itemMatchesSearch(item, normalizedSearchQuery) &&
      (
        category.id === ESSENTIALS_CATEGORY_ID
          ? isEssentialLibraryItem(item)
          : category.id === RECENT_CATEGORY_ID
          ? recentKeySet.has(getLibraryItemKey(item))
          : category.id === FAVORITES_CATEGORY_ID
          ? favoriteKeySet.has(getLibraryItemKey(item))
          : category.id === 'saved'
          ? isReusableLibraryItem(item)
          : getLibraryCategory(item) === category.id
      )
    )).length;
    return acc;
  }, {}), [categories, favoriteKeySet, libraryItems, normalizedSearchQuery, recentKeySet]);
  const activeCategoryName = useMemo(() => (isGlobalSearch
    ? 'Search results'
    : selectedCategory
      ? categories.find((category) => category.id === selectedCategory)?.name || selectedCategory
      : 'All components'
  ), [categories, isGlobalSearch, selectedCategory]);
  const isComponentFilterActive = normalizedSearchQuery.length > 0 || (
    selectedCategory !== null && selectedCategory !== ESSENTIALS_CATEGORY_ID
  );
  const resetComponentFilters = () => {
    setSearchQuery('');
    setSelectedCategory(null);
  };
  const componentLibraryActionStatusId = 'editor-component-library-action-status';
  const saveSelectionDisabledReason = disabled
    ? disabledReason || 'Editor changes are currently unavailable.'
    : !canSaveSelection
    ? 'Select a layer to save it as a reusable section.'
    : isSavingReusableSection
    ? 'Reusable section save is already running.'
    : '';
  const refreshReusableSectionsDisabledReason = disabled
    ? disabledReason || 'Editor changes are currently unavailable.'
    : reusableSectionsLoading
    ? 'Saved sections are refreshing.'
    : '';
  const componentLibrarySearchLabel = normalizedSearchQuery
    ? ` for "${searchQuery.trim()}"`
    : '';
  const componentLibraryActionStatus = [
    `${activeCategoryName} shows ${filteredItems.length} of ${totalSearchResultCount} components${componentLibrarySearchLabel}.`,
    'Search components available.',
    isComponentFilterActive ? 'Reset filters available.' : 'Filter reset hidden until filters are active.',
    saveSelectionDisabledReason ? `Save selection unavailable: ${saveSelectionDisabledReason}` : 'Save selection available.',
    refreshReusableSectionsDisabledReason ? `Refresh saved sections unavailable: ${refreshReusableSectionsDisabledReason}` : 'Refresh saved sections available.',
  ].join(' ');
  const emptyStateDescription = useMemo(() => {
    const trimmedSearch = searchQuery.trim();
    if (trimmedSearch && selectedCategory) {
      return `No ${activeCategoryName.toLowerCase()} match "${trimmedSearch}". Show all components to keep building.`;
    }
    if (trimmedSearch) {
      return `No components match "${trimmedSearch}". Show all components to keep building.`;
    }
    if (selectedCategory === RECENT_CATEGORY_ID) {
      return 'Recent fills as you add or drag components. Show all components to start from the full catalog.';
    }
    if (selectedCategory === FAVORITES_CATEGORY_ID) {
      return 'Star components you use often to build this list. Show all components to browse the full catalog.';
    }
    if (selectedCategory === 'saved') {
      return 'Saved sections appear here after you save a selected layer or section. Show all components to keep building.';
    }
    return 'Show all components or switch categories to find content blocks, layout blocks, media, forms, commerce, and reusable sections.';
  }, [activeCategoryName, searchQuery, selectedCategory]);

  const favoriteSearchItems = useMemo(() => (
    favoriteItems.filter((item) => itemMatchesSearch(item, normalizedSearchQuery))
  ), [favoriteItems, normalizedSearchQuery]);
  const groupedItemsWithFavorites = useMemo(() => (
    selectedCategory === null && favoriteSearchItems.length > 0
      ? {
        [FAVORITES_CATEGORY_ID]: favoriteSearchItems,
        ...Object.entries(groupedItems).reduce<Record<string, ComponentLibraryItem[]>>((acc, [category, items]) => {
          acc[category] = items.filter((item) => !favoriteKeySet.has(getLibraryItemKey(item)));
          return acc;
        }, {}),
      }
      : groupedItems
  ), [favoriteKeySet, favoriteSearchItems, groupedItems, selectedCategory]);

  return (
    <div
      className="flex h-full w-[clamp(15rem,16vw,18rem)] min-w-[15rem] max-w-[18rem] flex-col border-r border-slate-200 bg-white"
      data-testid="editor-component-library"
      data-component-library-density="compact"
      aria-describedby={componentLibraryActionStatusId}
      data-action-status={componentLibraryActionStatus}
    >
      <span id={componentLibraryActionStatusId} className="sr-only" data-testid="editor-component-library-action-status" aria-live="polite">
        {componentLibraryActionStatus}
      </span>

      {/* Header */}
      <div className="border-b border-slate-200 p-3">
        <h2 className="mb-2 font-semibold">Components</h2>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="editor-component-search"
            aria-describedby={componentLibraryActionStatusId}
            data-action-state="ready"
            data-action-status={componentLibraryActionStatus}
            className={cn(
              'w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-200 bg-slate-50',
              'focus:outline-none focus:ring-2 focus:ring-sky-500'
            )}
          />
        </div>
      </div>

      {/* Category Filters */}
      <div className="border-b border-slate-200 p-2">
        <div
          className="mb-2 flex items-center justify-between gap-2 px-1 text-[11px] font-medium text-slate-500"
          data-testid="editor-component-library-summary"
          data-component-library-shown={filteredItems.length}
          data-component-library-total={totalSearchResultCount}
          data-component-library-essentials-count={categoryItemCounts[ESSENTIALS_CATEGORY_ID] || 0}
          data-component-library-recent-count={recentItems.length}
          data-component-library-recent-limit={RECENT_ITEM_LIMIT}
          data-component-library-recent-keys={recentItemKeys.join(',')}
          data-component-library-saved-count={reusableItems.length}
          data-component-library-saved-total={reusableLibraryState.totalActiveCount}
          data-component-library-saved-hidden={reusableLibraryState.hiddenDuplicateCount}
          data-component-library-category={isGlobalSearch ? 'search' : selectedCategory || 'all'}
          data-component-library-filter-active={isComponentFilterActive ? 'true' : 'false'}
        >
          <span className="truncate">{activeCategoryName}</span>
          <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
            {isComponentFilterActive && (
              <button
                type="button"
                onClick={resetComponentFilters}
                data-testid="editor-component-reset-filters"
                aria-describedby={componentLibraryActionStatusId}
                data-action-state="ready"
                data-action-status={componentLibraryActionStatus}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-100"
              >
                Reset
              </button>
            )}
            <span>{filteredItems.length} / {totalSearchResultCount}</span>
          </span>
        </div>

        <div
          className="grid grid-cols-2 gap-1"
          data-testid="editor-component-category-rail"
          data-category-layout="wrapped-grid"
        >
          <button
            type="button"
            onClick={() => setSelectedCategory(ESSENTIALS_CATEGORY_ID)}
            data-testid="editor-component-category-essentials"
            aria-describedby={componentLibraryActionStatusId}
            aria-pressed={selectedCategory === ESSENTIALS_CATEGORY_ID}
            data-action-state={selectedCategory === ESSENTIALS_CATEGORY_ID ? 'selected' : 'ready'}
            data-action-status={componentLibraryActionStatus}
            className={cn(
              'inline-flex min-h-8 min-w-0 items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
              selectedCategory === ESSENTIALS_CATEGORY_ID
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            )}
            aria-label={`Essential components, ${categoryItemCounts[ESSENTIALS_CATEGORY_ID] || 0} available`}
          >
            <span className="flex min-w-0 items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="truncate">Essentials</span>
            </span>
            <span className="shrink-0 opacity-70">{categoryItemCounts[ESSENTIALS_CATEGORY_ID] || 0}</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            data-testid="editor-component-category-all"
            aria-label={`All components, ${totalSearchResultCount} available`}
            aria-describedby={componentLibraryActionStatusId}
            aria-pressed={selectedCategory === null}
            data-action-state={selectedCategory === null ? 'selected' : 'ready'}
            data-action-status={componentLibraryActionStatus}
            className={cn(
              'inline-flex min-h-8 min-w-0 items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
              selectedCategory === null
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            )}
          >
            <span className="truncate">All</span>
            <span className="shrink-0 opacity-70">{totalSearchResultCount}</span>
          </button>
          {categories.filter((cat) => cat.id !== ESSENTIALS_CATEGORY_ID).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              data-testid={`editor-component-category-${cat.id}`}
              aria-describedby={componentLibraryActionStatusId}
              aria-pressed={selectedCategory === cat.id}
              data-action-state={selectedCategory === cat.id ? 'selected' : 'ready'}
              data-action-status={componentLibraryActionStatus}
              className={cn(
                'inline-flex min-h-8 min-w-0 items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                selectedCategory === cat.id
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              )}
              aria-label={`${cat.name} components, ${categoryItemCounts[cat.id] || 0} available`}
            >
              <span className="flex min-w-0 items-center gap-1">
                <span className={cn('h-2 w-2 rounded-full', cat.color)} />
                <span className="truncate">{cat.name}</span>
              </span>
              <span className="shrink-0 opacity-70">{categoryItemCounts[cat.id] || 0}</span>
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-[1fr_auto] gap-1">
          <button
            type="button"
            onClick={onSaveSelectionAsReusableSection}
            disabled={disabled || !canSaveSelection || isSavingReusableSection}
            aria-describedby={componentLibraryActionStatusId}
            data-testid="editor-component-save-selection"
            data-action-state={isSavingReusableSection ? 'busy' : saveSelectionDisabledReason ? 'blocked' : 'ready'}
            data-action-status={componentLibraryActionStatus}
            data-disabled-reason={saveSelectionDisabledReason || undefined}
            className={cn(
              'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              canSaveSelection && !isSavingReusableSection && !disabled
                ? 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}
            title={disabled ? disabledReason : canSaveSelection ? 'Save the selected element as a reusable section' : 'Select an element to save it as a reusable section'}
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            <span className="truncate">{isSavingReusableSection ? 'Saving...' : 'Save selection'}</span>
          </button>
          <button
            type="button"
            onClick={onRefreshReusableSections}
            disabled={disabled || reusableSectionsLoading}
            aria-label="Refresh saved sections"
            aria-describedby={componentLibraryActionStatusId}
            data-testid="editor-component-refresh-saved-sections"
            data-action-state={reusableSectionsLoading ? 'busy' : refreshReusableSectionsDisabledReason ? 'blocked' : 'ready'}
            data-action-status={componentLibraryActionStatus}
            data-disabled-reason={refreshReusableSectionsDisabledReason || undefined}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            title="Refresh saved sections"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', reusableSectionsLoading && 'animate-spin')} />
          </button>
        </div>

        {reusableSectionsError && (
          <p className="mt-2 text-xs text-red-600">{reusableSectionsError}</p>
        )}
      </div>

      {/* Components List */}
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2"
        data-testid="editor-component-list"
        data-component-list-density="compact"
      >
        {Object.entries(groupedItemsWithFavorites).map(([category, items]) => (
          items.length > 0 && (
            <div key={category} data-component-category={category}>
              <h3 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {category}
              </h3>
              <div className="space-y-1">
                {items.map((item) => (
                  <LibraryItem
                    key={item.id ?? item.type}
                    item={item}
                    disabled={disabled}
                    disabledReason={disabledReason}
                    canDeleteReusableSections={canDeleteReusableSections}
                    deleteDisabledReason={deleteDisabledReason}
                    isFavorite={favoriteKeySet.has(getLibraryItemKey(item))}
                    onDragStart={() => {
                      rememberRecentItem(item);
                      onDragStart?.(item);
                    }}
                    onDragEnd={() => onDragEnd?.()}
                    onAddItem={() => handleAddItem(item)}
                    onToggleFavorite={() => toggleFavorite(item)}
                    onPreviewChange={(nextItem) => setPreviewItemKey(nextItem ? getLibraryItemKey(nextItem) : null)}
                    onRenameReusableSection={onRenameReusableSection}
                    onDeleteReusableSection={onDeleteReusableSection}
                    actionStatusId={componentLibraryActionStatusId}
                  />
                ))}
              </div>
            </div>
          )
        ))}

        {filteredItems.length === 0 && (
          <div
            data-testid="editor-component-filter-empty"
            data-component-empty-category={isGlobalSearch ? 'search' : selectedCategory || 'all'}
            data-component-empty-search={searchQuery.trim()}
          >
            <EmptyState
              icon={Search}
              title="No components match this view"
              description={emptyStateDescription}
              action={(
                <button
                  type="button"
                onClick={resetComponentFilters}
                data-testid="editor-component-empty-reset-filters"
                aria-describedby={componentLibraryActionStatusId}
                data-action-state="ready"
                data-action-status={componentLibraryActionStatus}
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                  Show all components
                </button>
              )}
            />
          </div>
        )}
      </div>

      {previewItem && (
        <ComponentPreviewPane item={previewItem} />
      )}
    </div>
  );
}

// ============================================
// COMPONENT PREVIEW
// ============================================

function getPreviewColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function getPreviewContent(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function getPreviewNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getPreviewRadius(value: unknown, fallback = 6): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function getPreviewBaseStyle(item: ComponentLibraryItem): CSSProperties {
  const props = item.defaultProps || {};
  const styles = item.defaultStyles || {};

  return {
    backgroundColor: getPreviewColor(props.backgroundColor ?? styles.backgroundColor, '#f8fafc'),
    color: getPreviewColor(props.color ?? styles.color, '#0f172a'),
    borderColor: getPreviewColor(props.borderColor ?? styles.borderColor, '#dbe2ea'),
    borderWidth: getPreviewNumber(props.borderWidth ?? styles.borderWidth, 1),
    borderStyle: getPreviewContent(props.borderStyle ?? styles.borderStyle, 'solid'),
    borderRadius: getPreviewRadius(props.borderRadius ?? styles.borderRadius),
  };
}

function ComponentPreviewPane({ item }: { item: ComponentLibraryItem }) {
  const itemKey = getLibraryItemKey(item);
  const size = item.defaultSize || { width: 240, height: 120 };
  const category = getLibraryCategory(item);
  const childCount = item.defaultChildren?.length || item.reusableContent?.elements?.length || 0;

  return (
    <div
      className="border-t border-slate-200 bg-slate-50 p-3"
      data-testid="editor-component-preview"
      data-component-preview={itemKey}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
          {item.description && (
            <p className="line-clamp-2 text-xs text-slate-500">{item.description}</p>
          )}
        </div>
        <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
          {category}
        </span>
      </div>
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white p-2">
        <div className="flex h-24 items-center justify-center rounded bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%),linear-gradient(-45deg,#f8fafc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f8fafc_75%),linear-gradient(-45deg,transparent_75%,#f8fafc_75%)] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0]">
          <ComponentPreviewArtwork item={item} />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{size.width} x {size.height}</span>
        {childCount > 0 && <span>{childCount} nested</span>}
      </div>
    </div>
  );
}

function ComponentPreviewArtwork({ item }: { item: ComponentLibraryItem }) {
  const props = item.defaultProps || {};
  const baseStyle = getPreviewBaseStyle(item);
  const childCount = item.defaultChildren?.length || item.reusableContent?.elements?.length || 0;
  const resolvedType = item.type;

  if (item.defaultChildren?.length) {
    return (
      <div
        className="relative h-20 w-44 overflow-hidden rounded"
        style={{
          backgroundColor: baseStyle.backgroundColor,
          border: `${baseStyle.borderWidth}px ${baseStyle.borderStyle} ${baseStyle.borderColor}`,
          borderRadius: baseStyle.borderRadius,
        }}
      >
        {item.defaultChildren.slice(0, 6).map((child, index) => (
          <div
            key={`${item.id ?? item.type}-preview-child-${index}`}
            className="absolute rounded-sm border border-white/60 bg-slate-200/90"
            style={{
              left: `${Math.max(3, Math.min(82, (child.x / Math.max(item.defaultSize?.width || 1, 1)) * 100))}%`,
              top: `${Math.max(4, Math.min(78, (child.y / Math.max(item.defaultSize?.height || 1, 1)) * 100))}%`,
              width: `${Math.max(10, Math.min(42, (child.width / Math.max(item.defaultSize?.width || 1, 1)) * 100))}%`,
              height: `${Math.max(8, Math.min(34, (child.height / Math.max(item.defaultSize?.height || 1, 1)) * 100))}%`,
              backgroundColor: getPreviewColor(child.props?.backgroundColor, index % 2 === 0 ? '#dbeafe' : '#dcfce7'),
            }}
          />
        ))}
      </div>
    );
  }

  switch (resolvedType) {
    case 'heading':
      return (
        <div className="w-44 rounded bg-white p-3 shadow-sm">
          <div
            className="h-4 w-36 rounded"
            style={{ backgroundColor: getPreviewColor(props.color, '#0f172a') }}
          />
          <div className="mt-2 h-2 w-24 rounded bg-slate-200" />
        </div>
      );

    case 'text':
    case 'paragraph':
      return (
        <div className="w-44 rounded bg-white p-3 shadow-sm">
          {[0, 1, 2].map((line) => (
            <div
              key={`${item.type}-preview-line-${line}`}
              className="mb-1.5 h-2 rounded bg-slate-300 last:mb-0"
              style={{ width: `${line === 2 ? 62 : 92 - line * 10}%` }}
            />
          ))}
        </div>
      );

    case 'button':
      return (
        <div
          className="max-w-40 truncate rounded px-5 py-2 text-center text-xs font-semibold shadow-sm"
          style={{
            backgroundColor: getPreviewColor(props.backgroundColor, '#3b82f6'),
            color: getPreviewColor(props.color, '#ffffff'),
            borderRadius: getPreviewRadius(props.borderRadius, 8),
          }}
        >
          {getPreviewContent(props.label, 'Button')}
        </div>
      );

    case 'image':
    case 'video':
    case 'embed':
    case 'map':
      return (
        <div className="flex h-20 w-36 items-center justify-center rounded border border-slate-300 bg-slate-100 text-xs font-medium text-slate-500">
          {item.name}
        </div>
      );

    case 'interactiveFigure':
    case 'codeComponent':
      return (
        <div
          className="grid h-20 w-40 place-items-center rounded border p-3 text-center text-xs font-semibold shadow-sm"
          style={{
            backgroundColor: getPreviewColor(props.backgroundColor, resolvedType === 'codeComponent' ? '#111827' : '#f8fafc'),
            color: getPreviewColor(props.color, resolvedType === 'codeComponent' ? '#f9fafb' : '#0f172a'),
            borderColor: getPreviewColor(props.borderColor, resolvedType === 'codeComponent' ? '#374151' : '#cbd5e1'),
            borderRadius: getPreviewRadius(props.borderRadius, 8),
          }}
        >
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{resolvedType === 'codeComponent' ? 'Sandbox' : 'Figure'}</div>
            <div className="truncate">{getPreviewContent(props.componentKey, item.name)}</div>
          </div>
        </div>
      );

    case 'divider':
      return (
        <div className="w-40 border-t" style={{ borderColor: getPreviewColor(props.borderColor, '#94a3b8'), borderTopWidth: getPreviewContent(props.thickness, '2px') }} />
      );

    case 'spacer':
      return <div className="h-12 w-20 rounded border border-dashed border-slate-300 bg-slate-50" />;

    case 'list':
      return (
        <div className="w-40 rounded bg-white p-3 shadow-sm">
          {[0, 1, 2].map((line) => (
            <div key={`list-preview-${line}`} className="mb-1.5 flex items-center gap-2 last:mb-0">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span className="h-2 flex-1 rounded bg-slate-300" />
            </div>
          ))}
        </div>
      );

    case 'quote':
      return (
        <div className="w-40 border-l-4 border-slate-300 bg-white p-3 shadow-sm">
          <div className="mb-1.5 h-2 w-28 rounded bg-slate-300" />
          <div className="h-2 w-20 rounded bg-slate-200" />
        </div>
      );

    case 'input':
    case 'textarea':
    case 'select':
      return (
        <div className="w-40 rounded bg-white p-2 shadow-sm">
          <div className="mb-1 h-2 w-16 rounded bg-slate-300" />
          <div className="h-8 rounded border border-slate-300 bg-slate-50" />
        </div>
      );

    case 'checkbox':
    case 'radio':
      return (
        <div className="flex items-center gap-2 rounded bg-white p-3 shadow-sm">
          <span className={cn('h-4 w-4 border border-slate-300 bg-slate-50', resolvedType === 'radio' ? 'rounded-full' : 'rounded')} />
          <span className="h-2 w-20 rounded bg-slate-300" />
        </div>
      );

    default:
      return (
        <div
          className="flex h-20 w-36 items-center justify-center rounded text-xs font-medium shadow-sm"
          style={{
            backgroundColor: baseStyle.backgroundColor,
            color: baseStyle.color,
            border: `${baseStyle.borderWidth}px ${baseStyle.borderStyle} ${baseStyle.borderColor}`,
            borderRadius: baseStyle.borderRadius,
          }}
        >
          {childCount > 0 ? `${childCount} items` : item.name}
        </div>
      );
  }
}

// ============================================
// LIBRARY ITEM COMPONENT
// ============================================

interface LibraryItemProps {
  item: ComponentLibraryItem;
  disabled?: boolean;
  disabledReason?: string;
  canDeleteReusableSections?: boolean;
  deleteDisabledReason?: string;
  isFavorite?: boolean;
  onDragStart: () => void;
  onDragEnd?: () => void;
  onAddItem?: () => void;
  onToggleFavorite?: () => void;
  onPreviewChange?: (item: ComponentLibraryItem | null) => void;
  onRenameReusableSection?: (sectionId: string) => void;
  onDeleteReusableSection?: (sectionId: string) => void;
  actionStatusId?: string;
}

function LibraryItem({
  item,
  disabled = false,
  disabledReason,
  canDeleteReusableSections = true,
  deleteDisabledReason,
  isFavorite = false,
  onDragStart,
  onDragEnd,
  onAddItem,
  onToggleFavorite,
  onPreviewChange,
  onRenameReusableSection,
  onDeleteReusableSection,
  actionStatusId,
}: LibraryItemProps) {
  const getIcon = () => {
    switch (item.icon) {
      case 'Type':
        return Type;
      case 'Heading':
        return Heading;
      case 'Image':
        return Image;
      case 'Square':
        return Square;
      case 'MousePointerClick':
        return MousePointerClick;
      case 'Video':
        return Video;
      case 'Code':
        return Code;
      case 'Minus':
        return Minus;
      case 'FormInput':
        return FormInput;
      case 'List':
        return List;
      case 'Quote':
        return Quote;
      case 'LinkIcon':
        return LinkIcon;
      case 'Box':
        return Box;
      case 'MapPin':
        return MapPin;
      case 'AlignLeft':
        return AlignLeft;
      case 'MessageSquare':
        return MessageSquare;
      case 'CheckSquare':
        return CheckSquare;
      case 'Circle':
        return Circle;
      case 'Sparkles':
        return Sparkles;
      case 'LayoutGrid':
        return LayoutGrid;
      case 'BookmarkPlus':
        return BookmarkPlus;
      default:
        return Square;
    }
  };

  const Icon = getIcon();
  const itemDomKey = getLibraryItemDomKey(item);
  const reusableSectionId = item.reusableContent?.sectionId;
  const reusableDuplicateCount = getReusableSectionDuplicateCount(item);
  const isReusableDeleteDisabled = disabled || !canDeleteReusableSections;
  const itemDisabledReason = disabled ? disabledReason || 'Editor changes are currently unavailable.' : '';
  const reusableDeleteDisabledReason = disabled
    ? itemDisabledReason
    : !canDeleteReusableSections
    ? deleteDisabledReason || 'Saved-section deletion is unavailable.'
    : '';
  const itemActionStatusId = `editor-component-item-action-status-${itemDomKey}`;
  const itemActionStatus = [
    disabled ? `Add unavailable: ${itemDisabledReason}` : `Add ${item.name} to canvas available.`,
    disabled
      ? `Favorite unavailable: ${itemDisabledReason}`
      : isFavorite
      ? `Remove ${item.name} from favorites available.`
      : `Add ${item.name} to favorites available.`,
    reusableSectionId
      ? (disabled ? `Rename unavailable: ${itemDisabledReason}` : `Rename ${item.name} available.`)
      : '',
    reusableSectionId
      ? (isReusableDeleteDisabled ? `Delete unavailable: ${reusableDeleteDisabledReason}` : `Delete ${item.name} available.`)
      : '',
  ].filter(Boolean).join(' ');
  const describedBy = [actionStatusId, itemActionStatusId].filter(Boolean).join(' ') || undefined;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart();
  };
  const handleKeyboardAdd = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.target !== event.currentTarget) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onAddItem?.();
    }
  };

  return (
    <div
      draggable={!disabled}
      onDragStart={handleDragStart}
      onDragEnd={() => onDragEnd?.()}
      onDoubleClick={() => {
        if (!disabled) onAddItem?.();
      }}
      onKeyDown={handleKeyboardAdd}
      onMouseEnter={() => {
        if (!disabled) onPreviewChange?.(item);
      }}
      onMouseLeave={() => onPreviewChange?.(null)}
      onFocus={() => {
        if (!disabled) onPreviewChange?.(item);
      }}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          onPreviewChange?.(null);
        }
      }}
      aria-disabled={disabled}
      aria-describedby={describedBy}
      tabIndex={disabled ? -1 : 0}
      data-component-library-item={item.id ?? item.type}
      data-component-library-item-actions="visible"
      data-testid={`editor-component-item-${itemDomKey}`}
      data-action-state={disabled ? 'blocked' : 'ready'}
      data-action-status={itemActionStatus}
      data-disabled-reason={itemDisabledReason || undefined}
      data-reusable-section-duplicate-count={reusableDuplicateCount || undefined}
      className={cn(
        'group flex items-center gap-2 rounded-md border border-transparent bg-white/70 p-1.5 cursor-grab',
        'hover:border-slate-200 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500',
        'active:cursor-grabbing',
        disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent active:cursor-not-allowed'
      )}
      title={item.description}
    >
      <span id={itemActionStatusId} className="sr-only" data-testid={`editor-component-item-action-status-${itemDomKey}`}>
        {itemActionStatus}
      </span>
      <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground truncate">
            {item.description}
          </p>
        )}
        {reusableDuplicateCount > 0 && (
          <p className="truncate text-[11px] font-medium text-sky-700">
            {reusableDuplicateCount} older duplicate{reusableDuplicateCount === 1 ? '' : 's'} hidden
          </p>
        )}
      </div>
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (disabled) return;
          onToggleFavorite?.();
        }}
        disabled={disabled}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
          isFavorite
            ? 'text-yellow-500 hover:bg-yellow-50'
            : 'text-slate-400 hover:bg-white hover:text-yellow-500',
          disabled && 'cursor-not-allowed opacity-40'
        )}
        title={isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
        aria-label={isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
        aria-describedby={describedBy}
        aria-pressed={isFavorite}
        data-component-favorite={item.id ?? item.type}
        data-testid={`editor-component-favorite-${itemDomKey}`}
        data-action-state={disabled ? 'blocked' : 'ready'}
        data-action-status={itemActionStatus}
        data-disabled-reason={itemDisabledReason || undefined}
      >
        <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (disabled) return;
          onAddItem?.();
        }}
        disabled={disabled}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        title={disabled ? disabledReason : `Add ${item.name} to canvas`}
        aria-label={`Add ${item.name} to canvas`}
        aria-describedby={describedBy}
        data-component-add={item.id ?? item.type}
        data-testid={`editor-component-add-${itemDomKey}`}
        data-action-state={disabled ? 'blocked' : 'ready'}
        data-action-status={itemActionStatus}
        data-disabled-reason={itemDisabledReason || undefined}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {reusableSectionId && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (disabled) return;
              onRenameReusableSection?.(reusableSectionId);
            }}
            disabled={disabled}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            title={disabled ? disabledReason : 'Rename saved section'}
            aria-label={`Rename ${item.name}`}
            aria-describedby={describedBy}
            data-reusable-section-rename={reusableSectionId}
            data-testid={`editor-component-rename-${itemDomKey}`}
            data-action-state={disabled ? 'blocked' : 'ready'}
            data-action-status={itemActionStatus}
            data-disabled-reason={itemDisabledReason || undefined}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (isReusableDeleteDisabled) return;
              onDeleteReusableSection?.(reusableSectionId);
            }}
            disabled={isReusableDeleteDisabled}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            title={isReusableDeleteDisabled ? (deleteDisabledReason || disabledReason) : 'Delete saved section'}
            aria-label={`Delete ${item.name}`}
            aria-describedby={describedBy}
            data-reusable-section-delete={reusableSectionId}
            data-testid={`editor-component-delete-${itemDomKey}`}
            data-action-state={isReusableDeleteDisabled ? 'blocked' : 'ready'}
            data-action-status={itemActionStatus}
            data-disabled-reason={reusableDeleteDisabledReason || undefined}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default ComponentLibrary;

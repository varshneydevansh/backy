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

import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
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
import type { ComponentLibraryItem } from '@/types/editor';
import { CANVAS_COMPONENT_LIBRARY } from '@/components/editor/editorCatalog';
import type { ReusableSection } from '@/lib/adminContentApi';

// ============================================
// COMPONENT LIBRARY ITEMS
// ============================================

const LIBRARY_ITEMS: ComponentLibraryItem[] = CANVAS_COMPONENT_LIBRARY;
const FAVORITES_CATEGORY_ID = 'favorites';
const FAVORITES_STORAGE_KEY = 'backy.editor.componentLibrary.favorites';

const getLibraryCategory = (item: ComponentLibraryItem): string => item.category || 'basic';
const getLibraryItemKey = (item: ComponentLibraryItem): string => String(item.id ?? item.type);

// ============================================
// COMPONENT
// ============================================

interface ComponentLibraryProps {
  /** Callback when a component is dragged */
  onDragStart?: (item: ComponentLibraryItem) => void;
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [previewItemKey, setPreviewItemKey] = useState<string | null>(null);
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

  const reusableItems = useMemo<ComponentLibraryItem[]>(() => (
    reusableSections
      .flatMap((section) => {
        const root = section.content.elements?.[0];
        if (!root) {
          return [];
        }

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
            sectionId: section.id,
            slug: section.slug,
            name: section.name,
            sourceUpdatedAt: section.updatedAt,
            syncMode: 'synced',
          },
        } satisfies ComponentLibraryItem];
      })
  ), [reusableSections]);

  const libraryItems = useMemo(
    () => [...LIBRARY_ITEMS, ...reusableItems],
    [reusableItems],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteItemKeys));
  }, [favoriteItemKeys]);

  const favoriteKeySet = useMemo(() => new Set(favoriteItemKeys), [favoriteItemKeys]);
  const favoriteItems = useMemo(
    () => libraryItems.filter((item) => favoriteKeySet.has(getLibraryItemKey(item))),
    [favoriteKeySet, libraryItems],
  );
  const previewItem = useMemo(
    () => libraryItems.find((item) => getLibraryItemKey(item) === previewItemKey) || null,
    [libraryItems, previewItemKey],
  );

  const toggleFavorite = (item: ComponentLibraryItem) => {
    const itemKey = getLibraryItemKey(item);
    setFavoriteItemKeys((current) => (
      current.includes(itemKey)
        ? current.filter((key) => key !== itemKey)
        : [...current, itemKey]
    ));
  };

  const matchesActiveSearch = (item: ComponentLibraryItem) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  };

  // Filter items
  const filteredItems = libraryItems.filter((item) => {
    if (!matchesActiveSearch(item)) {
      return false;
    }

    if (selectedCategory === FAVORITES_CATEGORY_ID) {
      return favoriteKeySet.has(getLibraryItemKey(item));
    }

    return !selectedCategory || getLibraryCategory(item) === selectedCategory;
  });

  // Group by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = selectedCategory === FAVORITES_CATEGORY_ID
      ? FAVORITES_CATEGORY_ID
      : getLibraryCategory(item);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, ComponentLibraryItem[]>);

  const categories = [
    { id: FAVORITES_CATEGORY_ID, name: 'Favorites', color: 'bg-yellow-400' },
    { id: 'basic', name: 'Basic', color: 'bg-blue-500' },
    { id: 'media', name: 'Media', color: 'bg-purple-500' },
    { id: 'layout', name: 'Layout', color: 'bg-green-500' },
    { id: 'form', name: 'Form', color: 'bg-orange-500' },
    { id: 'saved', name: 'Saved', color: 'bg-sky-500' },
    { id: 'advanced', name: 'Advanced', color: 'bg-red-500' },
  ];

  const favoriteSearchItems = favoriteItems.filter(matchesActiveSearch);
  const groupedItemsWithFavorites = selectedCategory === null && favoriteSearchItems.length > 0
    ? {
      [FAVORITES_CATEGORY_ID]: favoriteSearchItems,
      ...Object.entries(groupedItems).reduce<Record<string, ComponentLibraryItem[]>>((acc, [category, items]) => {
        acc[category] = items.filter((item) => !favoriteKeySet.has(getLibraryItemKey(item)));
        return acc;
      }, {}),
    }
    : groupedItems;

  return (
    <div
      className="flex h-full w-[clamp(15rem,16vw,18rem)] min-w-[15rem] max-w-[18rem] flex-col border-r border-slate-200 bg-white"
      data-testid="editor-component-library"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <h2 className="font-semibold mb-3">Components</h2>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="editor-component-search"
            className={cn(
              'w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-200 bg-slate-50',
              'focus:outline-none focus:ring-2 focus:ring-sky-500'
            )}
          />
        </div>
      </div>

      {/* Category Filters */}
      <div className="p-2 border-b border-slate-200">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedCategory(null)}
            data-testid="editor-component-category-all"
            className={cn(
              'px-2 py-1 text-xs rounded-md transition-colors',
              selectedCategory === null
                ? 'bg-slate-950 text-white'
                : 'bg-slate-100 hover:bg-slate-200'
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              data-testid={`editor-component-category-${cat.id}`}
              className={cn(
                'px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1',
                selectedCategory === cat.id
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-100 hover:bg-slate-200'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', cat.color)} />
              {cat.name}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-[1fr_auto] gap-1">
          <button
            type="button"
            onClick={onSaveSelectionAsReusableSection}
            disabled={disabled || !canSaveSelection || isSavingReusableSection}
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
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {Object.entries(groupedItemsWithFavorites).map(([category, items]) => (
          items.length > 0 && (
            <div key={category} data-component-category={category}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">
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
                    onDragStart={() => onDragStart?.(item)}
                    onAddItem={() => onAddItem?.(item)}
                    onToggleFavorite={() => toggleFavorite(item)}
                    onPreviewChange={(nextItem) => setPreviewItemKey(nextItem ? getLibraryItemKey(nextItem) : null)}
                    onRenameReusableSection={onRenameReusableSection}
                    onDeleteReusableSection={onDeleteReusableSection}
                  />
                ))}
              </div>
            </div>
          )
        ))}

        {filteredItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No components found</p>
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
  onAddItem?: () => void;
  onToggleFavorite?: () => void;
  onPreviewChange?: (item: ComponentLibraryItem | null) => void;
  onRenameReusableSection?: (sectionId: string) => void;
  onDeleteReusableSection?: (sectionId: string) => void;
}

function LibraryItem({
  item,
  disabled = false,
  disabledReason,
  canDeleteReusableSections = true,
  deleteDisabledReason,
  isFavorite = false,
  onDragStart,
  onAddItem,
  onToggleFavorite,
  onPreviewChange,
  onRenameReusableSection,
  onDeleteReusableSection,
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
      default:
        return Square;
    }
  };

  const Icon = getIcon();
  const reusableSectionId = item.reusableContent?.sectionId;
  const isReusableDeleteDisabled = disabled || !canDeleteReusableSections;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart();
  };

  return (
    <div
      draggable={!disabled}
      onDragStart={handleDragStart}
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
      tabIndex={disabled ? -1 : 0}
      data-component-library-item={item.id ?? item.type}
      className={cn(
        'group flex items-center gap-3 p-2 rounded-md cursor-grab',
        'hover:bg-slate-100 transition-colors',
        'active:cursor-grabbing',
        disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent active:cursor-not-allowed'
      )}
      title={item.description}
    >
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
            : 'text-slate-400 opacity-0 hover:bg-white hover:text-yellow-500 group-hover:opacity-100 focus:opacity-100',
          disabled && 'cursor-not-allowed opacity-40'
        )}
        title={isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
        aria-label={isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
        aria-pressed={isFavorite}
        data-component-favorite={item.id ?? item.type}
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
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 opacity-0 transition-opacity hover:bg-white hover:text-slate-900 group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
        title={disabled ? disabledReason : `Add ${item.name} to canvas`}
        aria-label={`Add ${item.name} to canvas`}
        data-component-add={item.id ?? item.type}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {reusableSectionId && (
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
            data-reusable-section-rename={reusableSectionId}
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
            data-reusable-section-delete={reusableSectionId}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default ComponentLibrary;

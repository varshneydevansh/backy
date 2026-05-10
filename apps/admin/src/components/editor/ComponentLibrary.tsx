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

import { useMemo, useState, type DragEvent } from 'react';
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

const getLibraryCategory = (item: ComponentLibraryItem): string => item.category || 'basic';

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
  isSavingReusableSection?: boolean;
  disabled?: boolean;
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
  isSavingReusableSection = false,
  disabled = false,
  onAddItem,
  onRefreshReusableSections,
  onSaveSelectionAsReusableSection,
  onRenameReusableSection,
  onDeleteReusableSection,
}: ComponentLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

  // Filter items
  const filteredItems = libraryItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      !selectedCategory || getLibraryCategory(item) === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Group by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = getLibraryCategory(item);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, ComponentLibraryItem[]>);

  const categories = [
    { id: 'basic', name: 'Basic', color: 'bg-blue-500' },
    { id: 'media', name: 'Media', color: 'bg-purple-500' },
    { id: 'layout', name: 'Layout', color: 'bg-green-500' },
    { id: 'form', name: 'Form', color: 'bg-orange-500' },
    { id: 'saved', name: 'Saved', color: 'bg-sky-500' },
    { id: 'advanced', name: 'Advanced', color: 'bg-red-500' },
  ];

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
            title={canSaveSelection ? 'Save the selected element as a reusable section' : 'Select an element to save it as a reusable section'}
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
        {Object.entries(groupedItems).map(([category, items]) => (
          <div key={category}>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">
              {category}
            </h3>
            <div className="space-y-1">
              {items.map((item) => (
                <LibraryItem
                  key={item.id ?? item.type}
                  item={item}
                  disabled={disabled}
                  onDragStart={() => onDragStart?.(item)}
                  onAddItem={() => onAddItem?.(item)}
                  onRenameReusableSection={onRenameReusableSection}
                  onDeleteReusableSection={onDeleteReusableSection}
                />
              ))}
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No components found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// LIBRARY ITEM COMPONENT
// ============================================

interface LibraryItemProps {
  item: ComponentLibraryItem;
  disabled?: boolean;
  onDragStart: () => void;
  onAddItem?: () => void;
  onRenameReusableSection?: (sectionId: string) => void;
  onDeleteReusableSection?: (sectionId: string) => void;
}

function LibraryItem({
  item,
  disabled = false,
  onDragStart,
  onAddItem,
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
      aria-disabled={disabled}
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
          onAddItem?.();
        }}
        disabled={disabled}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 opacity-0 transition-opacity hover:bg-white hover:text-slate-900 group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
        title={`Add ${item.name} to canvas`}
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
            title="Rename saved section"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (disabled) return;
              onDeleteReusableSection?.(reusableSectionId);
            }}
            disabled={disabled}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            title="Delete saved section"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default ComponentLibrary;

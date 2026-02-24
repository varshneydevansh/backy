// @ts-nocheck
// TODO: Fix category type access when implementing Page Editor properly
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

import { useState } from 'react';
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
  Star,
  Columns,
  MapPin,
  AlignLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComponentLibraryItem } from '@/types/editor';
import { CANVAS_COMPONENT_LIBRARY } from '@/components/editor/editorCatalog';

// ============================================
// COMPONENT LIBRARY ITEMS
// ============================================

const LIBRARY_ITEMS: ComponentLibraryItem[] = CANVAS_COMPONENT_LIBRARY;

// ============================================
// COMPONENT
// ============================================

interface ComponentLibraryProps {
  /** Callback when a component is dragged */
  onDragStart?: (item: ComponentLibraryItem) => void;
}

/**
 * Component Library Sidebar
 *
 * Displays available components organized by category.
 * Users can drag components onto the canvas.
 */
export function ComponentLibrary({ onDragStart }: ComponentLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Filter items
  const filteredItems = LIBRARY_ITEMS.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      !selectedCategory || item.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Group by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ComponentLibraryItem[]>);

  const categories = [
    { id: 'basic', name: 'Basic', color: 'bg-blue-500' },
    { id: 'media', name: 'Media', color: 'bg-purple-500' },
    { id: 'layout', name: 'Layout', color: 'bg-green-500' },
    { id: 'form', name: 'Form', color: 'bg-orange-500' },
    { id: 'advanced', name: 'Advanced', color: 'bg-red-500' },
  ];

  return (
    <div className="w-72 bg-card border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
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
              'w-full pl-8 pr-3 py-1.5 text-sm rounded-md border bg-background',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          />
        </div>
      </div>

      {/* Category Filters */}
      <div className="p-2 border-b border-border">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'px-2 py-1 text-xs rounded-md transition-colors',
              selectedCategory === null
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
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
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', cat.color)} />
              {cat.name}
            </button>
          ))}
        </div>
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
                  key={item.type}
                  item={item}
                  onDragStart={() => onDragStart?.(item)}
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
  onDragStart: () => void;
}

function LibraryItem({ item, onDragStart }: LibraryItemProps) {
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
      default:
        return Square;
    }
  };

  const Icon = getIcon();

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart();
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg cursor-grab',
        'hover:bg-accent transition-colors',
        'active:cursor-grabbing'
      )}
      title={item.description}
    >
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground truncate">
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}

export default ComponentLibrary;

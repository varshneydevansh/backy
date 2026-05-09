import { type ElementType, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedTabItem<T extends string> {
  id: T;
  name: string;
  icon?: ElementType;
}

interface SegmentedTabsProps<T extends string> {
  items: Array<SegmentedTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  getPanelId?: (value: T) => string;
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel = 'Section tabs',
  className,
  getPanelId,
}: SegmentedTabsProps<T>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : direction
          ? (index + direction + items.length) % items.length
          : -1;

    if (nextIndex < 0) return;

    event.preventDefault();
    const nextItem = items[nextIndex];
    onChange(nextItem.id);
    window.requestAnimationFrame(() => {
      event.currentTarget
        .parentElement
        ?.querySelector<HTMLButtonElement>(`[data-tab-id="${nextItem.id}"]`)
        ?.focus();
    });
  };

  return (
    <div
      className={cn('flex flex-wrap gap-1 border-b border-border', className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const selected = value === item.id;
        const panelId = getPanelId?.(item.id);
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${item.id}-tab`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            data-tab-id={item.id}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, items.indexOf(item))}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              selected
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className="size-4" />}
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

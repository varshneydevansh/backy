import { type ElementType } from 'react';
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
  className?: string;
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: SegmentedTabsProps<T>) {
  return (
    <div className={cn('flex flex-wrap gap-1 border-b border-border', className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const selected = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
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

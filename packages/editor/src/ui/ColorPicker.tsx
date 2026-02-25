import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Palette } from 'lucide-react';
import { cn } from '../utils';

// Popular colors organized by hue
const COLOR_PALETTE = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
];

export interface ColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
  className?: string;
  icon?: React.ReactNode;
  tooltip?: string;
  triggerRef?: React.RefObject<HTMLElement | null> | null;
}

const POPOVER_WIDTH = 260;
const SAFE_MARGIN = 12;
const MAX_POPUP_HEIGHT = 500;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const ColorPicker = ({
  value,
  onChange,
  className,
  icon,
  tooltip,
  triggerRef,
}: ColorPickerProps) => {
  const [open, setOpen] = useState(false);
  const [customColor, setCustomColor] = useState(value || '#000000');
  const [popoverTop, setPopoverTop] = useState(0);
  const [popoverLeft, setPopoverLeft] = useState(0);
  const [popoverMaxHeight, setPopoverMaxHeight] = useState(420);
  const [popoverWidth, setPopoverWidth] = useState(POPOVER_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomColor(value || '#000000');
  }, [value]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }

    const updatePosition = () => {
      const anchor = triggerRef?.current || containerRef.current;
      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const availableWidth = Math.max(1, viewportWidth - SAFE_MARGIN * 2);
      const availableHeight = Math.max(1, viewportHeight - SAFE_MARGIN * 2);
      const width = clamp(Math.min(POPOVER_WIDTH, availableWidth), 1, availableWidth);
      const maxHeight = clamp(Math.min(MAX_POPUP_HEIGHT, availableHeight), 1, availableHeight);

      const left = clamp(
        rect.left,
        SAFE_MARGIN,
        Math.max(SAFE_MARGIN, viewportWidth - width - SAFE_MARGIN)
      );

      const idealTop = rect.bottom + 6;
      const showAbove = idealTop + maxHeight > viewportHeight - SAFE_MARGIN;
      const top = clamp(
        showAbove ? rect.top - maxHeight - 6 : idealTop,
        SAFE_MARGIN,
        Math.max(SAFE_MARGIN, viewportHeight - maxHeight - SAFE_MARGIN)
      );

      setPopoverLeft(left);
      setPopoverTop(top);
      setPopoverMaxHeight(maxHeight);
      setPopoverWidth(width);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, triggerRef]);

  const handleColorSelect = (color: string) => {
    onChange(color);
    setOpen(false);
  };

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setCustomColor(color);
    onChange(color);
  };

  const popover = open ? (
    <div
      ref={popoverRef}
      className="fixed z-[10000] bg-popover rounded-lg shadow-lg border border-border p-2 animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: `${popoverLeft}px`,
        top: `${popoverTop}px`,
        width: `${popoverWidth}px`,
        maxHeight: `${popoverMaxHeight}px`,
      }}
    >
      <div className="space-y-0.5">
        {COLOR_PALETTE.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-0.5">
            {row.map((color) => (
              <button
                key={color}
                type="button"
                className={cn(
                  "w-5 h-5 rounded-sm border border-border/30 hover:scale-110 transition-transform",
                  value === color && "ring-2 ring-primary ring-offset-1"
                )}
                style={{ backgroundColor: color }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleColorSelect(color);
                }}
                title={color}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="h-px bg-border my-2" />

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={customColor}
          onChange={handleCustomColorChange}
          className="w-7 h-7 p-0 border-0 rounded cursor-pointer"
        />
        <input
          type="text"
          value={customColor}
          onChange={(e) => {
            setCustomColor(e.target.value);
            if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
              onChange(e.target.value);
            }
          }}
          className="flex-1 h-7 px-2 text-xs border rounded-md bg-background"
          placeholder="#000000"
        />
      </div>

      <button
        type="button"
        className="w-full mt-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md"
        onMouseDown={(e) => {
          e.preventDefault();
          onChange('');
          setOpen(false);
        }}
      >
        Clear Color
      </button>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen(!open);
        }}
        className="p-1.5 rounded-md hover:bg-muted/80 transition-all flex items-center justify-center h-7 w-7 relative"
        title={tooltip}
      >
        {icon || <Palette className="w-4 h-4" />}
        <div
          className="absolute bottom-0.5 left-1 right-1 h-0.5 rounded-full"
          style={{ backgroundColor: value || 'transparent' }}
        />
      </button>

      {typeof document !== 'undefined' ? createPortal(popover, document.body) : null}
    </div>
  );
};

export default ColorPicker;

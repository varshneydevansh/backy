import { useLayoutEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

type AnchorRect = { left: number; right: number; top: number; bottom: number };
type Viewport = { width: number; height: number; left?: number; top?: number };
const EDGE = 12;
const GAP = 6;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));

/** Keep the entire menu in the visible viewport, independent of toolbar wrapping. */
export const getToolbarPopoverGeometry = (
  anchor: AnchorRect, viewport: Viewport, preferredWidth: number, contentHeight: number,
  maximumHeight: number, align: 'left' | 'right' = 'right',
) => {
  const originLeft = viewport.left || 0;
  const originTop = viewport.top || 0;
  const width = Math.min(preferredWidth, Math.max(1, viewport.width - EDGE * 2));
  const height = Math.min(contentHeight, maximumHeight, Math.max(1, viewport.height - EDGE * 2));
  const below = Math.max(0, originTop + viewport.height - EDGE - anchor.bottom - GAP);
  const above = Math.max(0, anchor.top - GAP - originTop - EDGE);
  const placeAbove = height > below && above > below;
  const maxHeight = Math.max(1, Math.min(height, placeAbove ? above : below));
  return {
    left: clamp(align === 'left' ? anchor.left : anchor.right - width, originLeft + EDGE, originLeft + viewport.width - width - EDGE),
    top: clamp(placeAbove ? anchor.top - maxHeight - GAP : anchor.bottom + GAP, originTop + EDGE, originTop + viewport.height - maxHeight - EDGE),
    width, maxHeight,
  };
};

export const getToolbarMenuFocusIndex = (key: string, current: number, count: number): number | null => {
  if (!count) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % count;
  if (key === 'ArrowUp') return current < 0 ? count - 1 : (current - 1 + count) % count;
  return null;
};

export function useToolbarPopoverPosition(
  open: boolean, anchorRef: RefObject<HTMLElement | null>, popupRef: RefObject<HTMLElement | null>,
  preferredWidth: number, maximumHeight: number, align: 'left' | 'right' = 'right',
): CSSProperties {
  const [geometry, setGeometry] = useState<ReturnType<typeof getToolbarPopoverGeometry> | null>(null);
  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') { setGeometry(null); return; }
    const update = () => {
      const anchor = anchorRef.current;
      const popup = popupRef.current;
      if (!anchor || !popup) return;
      const visible = window.visualViewport;
      setGeometry(getToolbarPopoverGeometry(anchor.getBoundingClientRect(), {
        width: visible?.width || window.innerWidth, height: visible?.height || window.innerHeight,
        left: visible?.offsetLeft || 0, top: visible?.offsetTop || 0,
      }, preferredWidth, popup.scrollHeight || maximumHeight, maximumHeight, align));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (popupRef.current) observer?.observe(popupRef.current);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [open, anchorRef, popupRef, preferredWidth, maximumHeight, align]);
  return {
    position: 'fixed', zIndex: 10000, boxSizing: 'border-box', overflowY: 'auto',
    width: geometry?.width || preferredWidth, left: geometry?.left || 0, top: geometry?.top || 0,
    maxHeight: geometry?.maxHeight || maximumHeight, visibility: geometry ? 'visible' : 'hidden',
  };
}

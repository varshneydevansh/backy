import type { CanvasSize } from '../types/editor';

/** Render-only frame: editing keeps overflow reachable; preview models its viewport. */
export function resolveEditorCanvasFrame(
  size: CanvasSize,
  bounds: { maxX: number; maxY: number },
  preview: boolean,
  padding = 48,
): CanvasSize {
  return {
    ...size,
    width: preview ? size.width : Math.max(size.width, Math.ceil(bounds.maxX)),
    height: Math.max(size.height, Math.ceil(bounds.maxY + padding)),
  };
}

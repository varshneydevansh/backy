/** Native metadata fields bubble input events through PlateContent but do not edit Slate text. */
export function shouldHandleBackyDocumentInput(event: { target: EventTarget | null; nativeEvent?: unknown }): boolean {
  if ((event.nativeEvent as { isComposing?: boolean } | undefined)?.isComposing) return false;
  const node = event.target as Node | null;
  const element = (node?.nodeType === 1 ? node : node?.parentElement) as Element | null;
  return !element?.closest?.('input, select, textarea, button');
}

/** Keep native control keys out of Slate; preserve textarea newlines and IME confirmation. */
export function handleBackyFigureControlKeyDown(event: {
  key: string;
  target: EventTarget | null;
  nativeEvent: { isComposing?: boolean; keyCode?: number };
  preventDefault: () => void;
  stopPropagation: () => void;
}): void {
  const target = event.target as Element | null;
  if (!target?.closest?.('input, select, textarea, button, summary')) return;
  event.stopPropagation();
  if (event.key === 'Enter' && target.tagName === 'INPUT' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) event.preventDefault();
}

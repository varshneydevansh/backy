/** Fixed is the compatibility default for imported and existing canvas designs. */
export type BackyCanvasLayout = 'fixed' | 'fluid';
export interface BackyCanvasSize {
  width: number;
  height: number;
  layout?: BackyCanvasLayout;
  responsive?: Partial<Record<'tablet' | 'mobile', { width?: number; height?: number; layout?: BackyCanvasLayout }>>;
  [key: string]: unknown;
}

export type BackyCanvasBreakpoint = 'desktop' | 'tablet' | 'mobile';
const BACKY_BREAKPOINT_CANVAS_SIZE = { tablet: { width: 768, height: 1024 }, mobile: { width: 375, height: 812 } };

/** Preview dimensions never replace the authored desktop canvas. */
export function resolveBackyCanvasBreakpointSize<T extends BackyCanvasSize>(source: T, breakpoint: BackyCanvasBreakpoint): T {
  if (breakpoint === 'desktop') return source;
  const override = layoutRecord(layoutRecord(source.responsive)[breakpoint]);
  const defaults = BACKY_BREAKPOINT_CANVAS_SIZE[breakpoint];
  return { ...source,
    width: typeof override.width === 'number' && Number.isFinite(override.width) && override.width > 0 ? override.width : defaults.width,
    height: typeof override.height === 'number' && Number.isFinite(override.height) && override.height > 0 ? override.height : defaults.height,
    ...(override.layout === 'fixed' || override.layout === 'fluid' ? { layout: override.layout } : {}),
  };
}

/** Explicit viewport size edits are scoped to their active breakpoint. */
export function updateBackyCanvasBreakpointSize<T extends BackyCanvasSize>(source: T, breakpoint: BackyCanvasBreakpoint, next: BackyCanvasSize): T {
  if (breakpoint === 'desktop') return { ...source, ...next };
  return { ...source, responsive: { ...layoutRecord(source.responsive), [breakpoint]: {
    ...layoutRecord(layoutRecord(source.responsive)[breakpoint]), width: next.width, height: next.height,
    ...(next.layout === 'fixed' || next.layout === 'fluid' ? { layout: next.layout } : {}),
  } } };
}

export function resolveBackyCanvasViewport(canvasSize: Pick<BackyCanvasSize, 'width' | 'layout'>, viewportWidth?: number) {
  const layout: BackyCanvasLayout = canvasSize.layout === 'fluid' ? 'fluid' : 'fixed';
  const authoredWidth = Number.isFinite(canvasSize.width) && canvasSize.width > 0 ? canvasSize.width : 1200;
  const gutter = layout === 'fluid' ? 0 : 12;
  const availableWidth = typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) && viewportWidth > 0
    ? Math.max(1, viewportWidth - gutter * 2) : authoredWidth;
  const width = layout === 'fluid' ? Math.max(authoredWidth, availableWidth) : authoredWidth;
  return { layout, gutter, authoredWidth, width, scale: Math.min(1, availableWidth / authoredWidth) };
}

interface CanvasGeometry {
  type: string;
  x?: number;
  width?: number;
  children?: CanvasGeometry[];
}

/** Adapt resolved breakpoint geometry horizontally, without resizing text or mutating saved nodes. */
export function adaptBackyFluidCanvasElements<T extends CanvasGeometry>(elements: T[], authoredWidth: number, renderWidth: number): T[] {
  const delta = renderWidth - authoredWidth;
  if (!Number.isFinite(delta) || delta <= 0) return elements;
  const offset = delta / 2;
  return elements.map((element) => {
    const stretch = ['section', 'header', 'footer', 'container'].includes(element.type)
      && typeof element.width === 'number' && Math.abs(element.width - authoredWidth) < 0.5
      && Math.abs(element.x || 0) < 0.5;
    if (!stretch) return { ...element, x: (element.x || 0) + offset };
    return {
      ...element,
      width: renderWidth,
      ...(element.children ? { children: element.children.map((child) => isBackyFlowChild(child, resolveBackyChildLayout(element)) ? child : { ...child, x: (child.x || 0) + offset }) } : {}),
    };
  });
}

export type BackyChildLayout = 'free' | 'flow' | 'flex' | 'grid';
interface LayoutElement {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  props?: object;
  styles?: object;
}
const layoutRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const cssValue = (value: unknown): string | number | undefined => typeof value === 'string' && value.trim() ? value : typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const layoutValue = (element: LayoutElement, name: string) => cssValue(layoutRecord(element.styles)[name] ?? layoutRecord(element.props)[name]);

/** Flow is opt-in through authored CSS/display/layout; existing canvases stay free. */
export function resolveBackyChildLayout(element: LayoutElement): BackyChildLayout {
  const props = layoutRecord(element.props);
  if (props.layout === 'free') return 'free';
  const display = layoutValue(element, 'display') ?? props.layout;
  if (display === 'flex' || display === 'inline-flex') return 'flex';
  if (display === 'grid' || display === 'inline-grid') return 'grid';
  return props.layout === 'flow' ? 'flow' : 'free';
}

export function isBackyFlowChild(element: LayoutElement, parentLayout: BackyChildLayout): boolean {
  const position = layoutValue(element, 'position');
  return parentLayout !== 'free' && position !== 'absolute' && position !== 'fixed';
}

const FLOW_ITEM_FIELDS = ['minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'flex', 'flexBasis', 'flexGrow', 'flexShrink', 'order', 'alignSelf', 'justifySelf', 'gridColumn', 'gridRow', 'gridArea', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft'] as const;
/** Child coordinates remain saved as the free-layout fallback, not flow offsets. */
export function buildBackyCanvasElementGeometry(element: LayoutElement, parentLayout: BackyChildLayout = 'free'): Record<string, string | number | undefined> {
  const flow = isBackyFlowChild(element, parentLayout);
  const declaredPosition = layoutValue(element, 'position');
  const positionedEscape = parentLayout !== 'free' && (declaredPosition === 'absolute' || declaredPosition === 'fixed');
  const authoredSizing = flow || positionedEscape || resolveBackyChildLayout(element) !== 'free';
  const style: Record<string, string | number | undefined> = {
    position: flow ? 'relative' : positionedEscape ? declaredPosition : 'absolute',
    left: flow ? undefined : positionedEscape && layoutValue(element, 'right') !== undefined && layoutValue(element, 'left') === undefined ? undefined : positionedEscape ? layoutValue(element, 'left') ?? element.x : element.x,
    top: flow ? undefined : positionedEscape && layoutValue(element, 'bottom') !== undefined && layoutValue(element, 'top') === undefined ? undefined : positionedEscape ? layoutValue(element, 'top') ?? element.y : element.y,
    width: authoredSizing ? layoutValue(element, 'width') ?? element.width : element.width,
    height: authoredSizing ? layoutValue(element, 'height') ?? element.height : element.height,
  };
  if (flow) {
    style.minWidth = 0;
    for (const name of FLOW_ITEM_FIELDS) style[name] = layoutValue(element, name) ?? style[name];
  }
  if (positionedEscape) { style.right = layoutValue(element, 'right'); style.bottom = layoutValue(element, 'bottom'); }
  return style;
}

/** Item geometry belongs on the outer wrapper, preventing percentages applying twice. */
export function buildBackyCanvasContentStyles(element: LayoutElement, parentLayout: BackyChildLayout = 'free'): Record<string, unknown> {
  const styles = { ...layoutRecord(element.styles) };
  if (isBackyFlowChild(element, parentLayout)) {
    for (const name of ['position', 'left', 'top', 'right', 'bottom', 'width', 'height', ...FLOW_ITEM_FIELDS]) delete styles[name];
  }
  return styles;
}

export function buildBackyCanvasContentProps(element: LayoutElement, parentLayout: BackyChildLayout = 'free'): Record<string, unknown> {
  const props = { ...layoutRecord(element.props) };
  if (isBackyFlowChild(element, parentLayout)) for (const name of ['position', 'left', 'top', 'right', 'bottom', 'width', 'height', ...FLOW_ITEM_FIELDS]) delete props[name];
  return props;
}

const FLOW_CONTAINER_FIELDS = ['flexDirection', 'flexWrap', 'alignItems', 'alignContent', 'justifyContent', 'justifyItems', 'gap', 'rowGap', 'columnGap', 'gridTemplateColumns', 'gridTemplateRows', 'gridAutoColumns', 'gridAutoRows', 'gridAutoFlow', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;
export function buildBackyFlowContainerStyle(element: LayoutElement): Record<string, string | number | undefined> {
  const layout = resolveBackyChildLayout(element);
  if (layout === 'free') return {};
  const style: Record<string, string | number | undefined> = { display: layout === 'flow' ? 'block' : layout, boxSizing: 'border-box' };
  if (layout === 'flex') style.flexDirection = layoutValue(element, 'flexDirection') ?? 'column';
  for (const name of FLOW_CONTAINER_FIELDS) if (layoutValue(element, name) !== undefined) style[name] = layoutValue(element, name);
  return style;
}

/** A breakpoint edit stores changed keys so untouched desktop values keep inheriting. */
export function diffBackyCanvasOverrideMap(base: object | undefined, displayed: object | undefined): Record<string, unknown> | undefined {
  const original = layoutRecord(base);
  const changed = Object.fromEntries(Object.entries(layoutRecord(displayed)).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(original[key])));
  return Object.keys(changed).length ? changed : undefined;
}

/** Persist visual sibling order without changing free coordinates or the tree's identity. */
export function orderBackyFlowChildrenForRender<T extends LayoutElement>(children: T[], layout: BackyChildLayout): T[] {
  // Block flow has no native CSS order support; render the saved order without
  // rewriting the canonical child array or the free-position fallback.
  if (layout !== 'flow') return children;
  return children.map((child, index) => ({ child, index }))
    .sort((a, b) => (Number(layoutValue(a.child, 'order')) || 0) - (Number(layoutValue(b.child, 'order')) || 0) || a.index - b.index)
    .map(item => item.child);
}

/** Persist visual sibling order without changing free coordinates or the tree's identity. */
export function reorderBackyFlowChildren<T extends LayoutElement>(children: T[], movingId: string, beforeId?: string): T[] {
  const ordered = children.map((child, index) => ({ child, index })).sort((a, b) => (Number(layoutValue(a.child, 'order')) || 0) - (Number(layoutValue(b.child, 'order')) || 0) || a.index - b.index).map(item => item.child);
  const moving = ordered.find(child => child.id === movingId);
  if (!moving || beforeId === movingId) return children;
  const remaining = ordered.filter(child => child !== moving);
  const beforeIndex = beforeId ? remaining.findIndex(child => child.id === beforeId) : remaining.length;
  if (beforeIndex < 0) return children;
  remaining.splice(beforeIndex, 0, moving);
  if (remaining.every((child, index) => child === ordered[index])) return children;
  const positions = new Map(remaining.map((child, index) => [child.id, index]));
  return children.map(child => ({ ...child, styles: { ...layoutRecord(child.styles), order: positions.get(child.id) } }));
}

export interface BackyFlowRect { id: string; left: number; top: number; width: number; height: number }
/** Use measured item boxes, not saved x/y, including wrapped flex and grid rows. */
export function backyFlowInsertionTarget(items: BackyFlowRect[], point: { x: number; y: number }, axis: 'x' | 'y', reverse = false): string | undefined {
  let nearest: BackyFlowRect | undefined;
  let distance = Infinity;
  for (const item of items) {
    const dx = point.x - (item.left + item.width / 2);
    const dy = point.y - (item.top + item.height / 2);
    const nextDistance = dx * dx + dy * dy;
    if (nextDistance < distance) { nearest = item; distance = nextDistance; }
  }
  if (!nearest) return undefined;
  const center = axis === 'x' ? nearest.left + nearest.width / 2 : nearest.top + nearest.height / 2;
  const before = (axis === 'x' ? point.x : point.y) < center;
  return before !== reverse ? nearest.id : items[items.indexOf(nearest) + 1]?.id;
}

/** An explicit resize replaces touched intrinsic axes with pixels, not saved x/y. */
export function resizeBackyFlowItem<T extends LayoutElement>(element: T, measured: { width: number; height: number }, handle: string, deltaX: number, deltaY: number, options: { preserveAspectRatio?: boolean; fromCenter?: boolean } = {}): T {
  const horizontal = /[ew]/.test(handle);
  const vertical = /[ns]/.test(handle);
  const multiplier = options.fromCenter ? 2 : 1;
  let width = Math.max(20, measured.width + (horizontal ? deltaX * (handle.includes('w') ? -1 : 1) * multiplier : 0));
  let height = Math.max(20, measured.height + (vertical ? deltaY * (handle.includes('n') ? -1 : 1) * multiplier : 0));
  if (options.preserveAspectRatio) {
    const ratio = measured.width / Math.max(measured.height, 1);
    if (horizontal) height = width / ratio; else width = height * ratio;
  }
  return { ...element, styles: { ...layoutRecord(element.styles),
    ...(horizontal || options.preserveAspectRatio ? { width: Math.round(width) } : {}),
    ...(vertical || options.preserveAspectRatio ? { height: Math.round(height) } : {}),
    // Intrinsic flex basis would otherwise mask the explicit resized dimensions.
    flex: '0 0 auto', flexBasis: 'auto', flexGrow: 0, flexShrink: 0,
  } };
}

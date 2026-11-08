import type { SiteFrontendDesignContract } from './types';

type Template = SiteFrontendDesignContract['templates'][number];
type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Defaults need concrete editable canvas content; descriptive handoff shells stay opt-in. */
export const selectDefaultFrontendDesignTemplate = (
  contract: SiteFrontendDesignContract | null | undefined,
  type: Template['type'],
): Template | undefined => {
  const candidates = (contract?.templates || []).filter((template) => {
    if (template.type !== type || (template.status && template.status !== 'active')) return false;
    const content = template.content || {};
    const elements = Array.isArray(content.elements) ? content.elements
      : record(content.contentDocument) ? content.contentDocument.elements : undefined;
    const productDesign = record(content.values) && record(content.values.design) ? content.values.design : undefined;
    const productElements = productDesign && (Array.isArray(productDesign.elements) ? productDesign.elements
      : record(productDesign.contentDocument) ? productDesign.contentDocument.elements : undefined);
    return (Array.isArray(elements) && elements.length > 0)
      || (type === 'product' && Array.isArray(productElements) && productElements.length > 0);
  });
  const marked = candidates.filter((template) => template.isDefault === true);
  if (marked.length > 1) return undefined;
  return marked[0] || (candidates.length === 1 ? candidates[0] : undefined);
};

const slotElements = (slot: unknown): JsonRecord[] => {
  if (!record(slot)) return [];
  const elements = Array.isArray(slot.elements) ? slot.elements
    : record(slot.contentDocument) && Array.isArray(slot.contentDocument.elements) ? slot.contentDocument.elements
      : typeof slot.type === 'string' ? [slot] : [];
  return elements.filter((element): element is JsonRecord => record(element)
    && typeof element.id === 'string' && typeof element.type === 'string');
};
const bottom = (element: JsonRecord) => (Number(element.y) || 0) + Math.max(0, Number(element.height) || 0);
const chromeExists = (elements: JsonRecord[], role: 'header' | 'footer'): boolean => elements.some((element) => {
  const props = record(element.props) ? element.props : {};
  return element.type === role || props.chromeRole === `site.${role}`
    || (Array.isArray(element.children) && chromeExists(element.children.filter(record), role));
});

/** Hydrate only registered canvas slots, never descriptive chrome metadata or authored chrome. */
export const inheritRegisteredFrontendChrome = (
  contentInput: JsonRecord,
  chrome: SiteFrontendDesignContract['chrome'] | null | undefined,
): JsonRecord => {
  const rawElements = Array.isArray(contentInput.elements) ? contentInput.elements
    : record(contentInput.contentDocument) ? contentInput.contentDocument.elements : undefined;
  if (!Array.isArray(rawElements)) return contentInput;
  const elements = clone(rawElements.filter(record));
  const ids = new Set<string>();
  const collectIds = (nodes: JsonRecord[]) => nodes.forEach((node) => {
    if (typeof node.id === 'string') ids.add(node.id);
    if (Array.isArray(node.children)) collectIds(node.children.filter(record));
  });
  collectIds(elements);
  const safeSlot = (role: 'header' | 'footer') => {
    if (chromeExists(elements, role)) return [];
    const nodes = clone(slotElements(chrome?.[role]));
    let collision = false;
    const check = (entries: JsonRecord[]) => entries.forEach((node) => {
      if (ids.has(String(node.id))) collision = true;
      if (Array.isArray(node.children)) check(node.children.filter(record));
    });
    check(nodes);
    if (collision) return [];
    collectIds(nodes);
    return nodes;
  };
  const header = safeSlot('header');
  const footer = safeSlot('footer');
  if (!header.length && !footer.length) return contentInput;
  const breakpointElement = (node: JsonRecord, breakpoint: string): JsonRecord => {
    const override = record(node.responsive) && record(node.responsive[breakpoint])
      ? node.responsive[breakpoint] as JsonRecord : {};
    return { ...node, ...override };
  };
  const translateRoots = (nodes: JsonRecord[], delta: number, breakpointDeltas: Record<string, number>) => nodes.forEach((node) => {
    const originalY = Number(node.y) || 0;
    node.y = originalY + delta;
    for (const breakpoint of ['mobile', 'tablet']) {
      const responsive = record(node.responsive) ? node.responsive : {};
      const override = record(responsive[breakpoint]) ? responsive[breakpoint] as JsonRecord : {};
      const responsiveDelta = breakpointDeltas[breakpoint];
      // Materialize y when chrome has a different breakpoint height, even if the body
      // previously overrode only width. Inheriting the desktop offset would overlap.
      if (typeof override.y === 'number' || responsiveDelta !== delta) {
        node.responsive = { ...responsive, [breakpoint]: { ...override, y: (Number(override.y ?? originalY) || 0) + responsiveDelta } };
      }
    }
  });
  const shift = header.length ? Math.max(...header.map(bottom)) : 0;
  const headerShifts = Object.fromEntries(['mobile', 'tablet'].map((breakpoint) => [breakpoint,
    header.length ? Math.max(...header.map((node) => bottom(breakpointElement(node, breakpoint)))) : 0,
  ]));
  translateRoots(elements, shift, headerShifts);
  const contentBottom = Math.max(0, ...elements.map(bottom), ...header.map(bottom));
  if (footer.length) {
    const footerTop = Math.min(...footer.map((node) => Number(node.y) || 0));
    const footerShifts = Object.fromEntries(['mobile', 'tablet'].map((breakpoint) => {
      const responsiveBottom = Math.max(0, ...[...header, ...elements].map((node) => bottom(breakpointElement(node, breakpoint))));
      const footerBreakpointTop = Math.min(...footer.map((node) => Number(breakpointElement(node, breakpoint).y) || 0));
      return [breakpoint, responsiveBottom - footerBreakpointTop];
    }));
    translateRoots(footer, contentBottom - footerTop, footerShifts);
  }
  const nextElements = [...header, ...elements, ...footer];
  const metadata = record(contentInput.metadata) ? contentInput.metadata : {};
  const documentMetadata = record(contentInput.contentDocument) && record(contentInput.contentDocument.metadata)
    ? contentInput.contentDocument.metadata : {};
  // Canonical-only documents carry their geometry in metadata. Merge individual
  // fields so an explicit authored outer width does not discard the reserved
  // canonical height or extension fields.
  const canvasSize = {
    ...(record(metadata.canvasSize) ? metadata.canvasSize : {}),
    ...(record(documentMetadata.canvasSize) ? documentMetadata.canvasSize : {}),
    ...(record(contentInput.canvasSize) ? contentInput.canvasSize : {}),
  };
  const nextCanvasSize = { ...canvasSize, height: Math.max(Number(canvasSize.height) || 0, ...nextElements.map(bottom)) };
  return {
    ...contentInput,
    elements: nextElements,
    canvasSize: nextCanvasSize,
    ...(record(contentInput.contentDocument) ? { contentDocument: {
      ...contentInput.contentDocument,
      elements: nextElements,
      metadata: { ...documentMetadata, canvasSize: nextCanvasSize },
    } } : {}),
  };
};

import type { CanvasElement } from '@/types/editor';

const textTypes = new Set(['paragraph', 'text', 'quote']);
const breakpoints = ['tablet', 'mobile'] as const;
const isSiteChrome = (element: CanvasElement) => ['header', 'footer', 'nav'].includes(element.type)
  || /site-(header|footer)/.test(element.id)
  || /^site\.(header|footer)(\.|$)/.test(String(element.props.chromeRole || ''));
export const isBlogHtmlContent = (value: unknown): boolean => typeof value === 'string' && /<\/?[a-z][^>]*>/i.test(value);

/** Article writing edits the same element tree as Layout; chrome is never a writing target. */
export function getBlogWritingTargets(elements: CanvasElement[]): CanvasElement[] {
  const targets: CanvasElement[] = [];
  const visit = (element: CanvasElement) => {
    if (element.locked || element.visible === false || isSiteChrome(element)) return;
    const metadataOwned = /^post\.(?:title|excerpt|publishedAt|coverImage)$/.test(String(element.props.binding || '').trim());
    if (textTypes.has(element.type) && !metadataOwned && !isBlogHtmlContent(element.props.content)) targets.push(element);
    element.children?.forEach(visit);
  };
  elements.forEach(visit);
  return targets.sort((a, b) => {
    const priority = (element: CanvasElement) => /lede|transcript|body/.test(element.id) || /post\.content/.test(String(element.props.binding || '')) ? 0 : 1;
    return priority(a) - priority(b);
  });
}

export function getBlogWritingValue(element: CanvasElement): any[] {
  return Array.isArray(element.props.content) && element.props.content.length
    ? element.props.content
    : [{ type: 'p', children: [{ text: typeof element.props.content === 'string' ? element.props.content : '' }] }];
}

export function blogWritingPlainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(blogWritingPlainText).join(' ');
  if (value && typeof value === 'object') {
    const node = value as { text?: unknown; children?: unknown };
    return typeof node.text === 'string' ? node.text : blogWritingPlainText(node.children);
  }
  return '';
}

export function updateBlogEditorialText(elements: CanvasElement[], input: { title: string; excerpt: string }, ids: { title?: string; excerpt?: string } = {}): CanvasElement[] {
  let changed = false;
  const next = elements.map((element) => {
    const children = element.children ? updateBlogEditorialText(element.children, input, ids) : element.children;
    const field = element.id === ids.title || element.props.binding === 'post.title' ? 'title'
      : element.id === ids.excerpt || element.props.binding === 'post.excerpt' ? 'excerpt' : null;
    const target = typeof element.props.bindingTargetPath === 'string' ? element.props.bindingTargetPath : 'props.content';
    const prop = target.startsWith('props.') ? target.slice(6) : '';
    const value = field ? input[field].trim() : '';
    const updateText = field && (field !== 'title' || value) && ['content', 'text', 'label', 'alt', 'title'].includes(prop) && element.props[prop] !== value;
    if (!updateText && children === element.children) return element;
    changed = true;
    return { ...element, ...(updateText ? { props: { ...element.props, [prop]: value } } : {}), ...(children ? { children } : {}) };
  });
  return changed ? next : elements;
}

export type BlogWritingBreakpoint = 'desktop' | 'tablet' | 'mobile';
export type BlogWritingMeasurements = Partial<Record<BlogWritingBreakpoint, number>>;
const writingBreakpoints: BlogWritingBreakpoint[] = ['desktop', 'tablet', 'mobile'];

export function getEffectiveBlogWritingTarget(element: CanvasElement, breakpoint: BlogWritingBreakpoint): CanvasElement {
  const override = breakpoint === 'desktop' ? undefined : element.responsive?.[breakpoint];
  return override ? { ...element, ...override, props: { ...element.props, ...override.props }, styles: { ...element.styles, ...override.styles } } : element;
}

const heightAt = (element: CanvasElement, breakpoint: BlogWritingBreakpoint): number => breakpoint === 'desktop' ? element.height : element.responsive?.[breakpoint]?.height ?? element.height;
const yAt = (element: CanvasElement, breakpoint: BlogWritingBreakpoint): number => breakpoint === 'desktop' ? element.y : element.responsive?.[breakpoint]?.y ?? element.y;
const withHeights = (element: CanvasElement, heights: Record<BlogWritingBreakpoint, number>): CanvasElement => {
  const responsive = { ...element.responsive };
  let changedResponsive = false;
  for (const breakpoint of breakpoints) {
    const override = element.responsive?.[breakpoint];
    if (heights[breakpoint] !== heights.desktop || override?.height !== undefined) {
      responsive[breakpoint] = { ...override, height: heights[breakpoint] };
      changedResponsive = true;
    }
  }
  return { ...element, height: heights.desktop, ...(changedResponsive ? { responsive } : {}) };
};

/** Grow the authored desktop and responsive flows independently using actual measured content. */
export function updateBlogWritingTarget(elements: CanvasElement[], id: string, content: any[], measuredHeight?: number | BlogWritingMeasurements): CanvasElement[] {
  const updateLevel = (siblings: CanvasElement[]): CanvasElement[] => {
    let changedIndex = -1;
    const updated = siblings.map((element, index) => {
      if (element.id === id) {
        if (isBlogHtmlContent(element.props.content)) return element;
        const desktopHeight = Math.max(element.height, typeof measuredHeight === 'number' && Number.isFinite(measuredHeight) ? Math.ceil(measuredHeight) : 0);
        const heights = Object.fromEntries(writingBreakpoints.map((breakpoint) => {
          const previous = heightAt(element, breakpoint);
          const measured = typeof measuredHeight === 'number' ? previous + desktopHeight - element.height : measuredHeight?.[breakpoint];
          return [breakpoint, Math.max(previous, typeof measured === 'number' && Number.isFinite(measured) ? Math.ceil(measured) : previous)];
        })) as Record<BlogWritingBreakpoint, number>;
        if (JSON.stringify(element.props.content) === JSON.stringify(content) && writingBreakpoints.every((breakpoint) => heights[breakpoint] === heightAt(element, breakpoint))) return element;
        changedIndex = index;
        return withHeights({ ...element, props: { ...element.props, content: JSON.parse(JSON.stringify(content)) } }, heights);
      }
      if (!element.children?.length) return element;
      const children = updateLevel(element.children);
      if (children === element.children) return element;
      changedIndex = index;
      const heights = Object.fromEntries(writingBreakpoints.map((breakpoint) => {
        const growth = Math.max(0, ...children.map((child, childIndex) => yAt(child, breakpoint) + heightAt(child, breakpoint) - (yAt(element.children![childIndex], breakpoint) + heightAt(element.children![childIndex], breakpoint))));
        return [breakpoint, heightAt(element, breakpoint) + growth];
      })) as Record<BlogWritingBreakpoint, number>;
      return withHeights({ ...element, children }, heights);
    });
    if (changedIndex < 0) return siblings;
    const before = siblings[changedIndex];
    const after = updated[changedIndex];
    return updated.map((element, index) => {
      if (index === changedIndex) return element;
      const shifts = Object.fromEntries(writingBreakpoints.map((breakpoint) => {
        const growth = heightAt(after, breakpoint) - heightAt(before, breakpoint);
        return [breakpoint, yAt(element, breakpoint) >= yAt(before, breakpoint) + heightAt(before, breakpoint) ? growth : 0];
      })) as Record<BlogWritingBreakpoint, number>;
      if (!writingBreakpoints.some((breakpoint) => shifts[breakpoint])) return element;
      const nextY = element.y + shifts.desktop;
      const responsive: NonNullable<CanvasElement['responsive']> = { ...element.responsive };
      for (const breakpoint of breakpoints) {
        const wantedY = yAt(element, breakpoint) + shifts[breakpoint];
        if (wantedY !== nextY || element.responsive?.[breakpoint]?.y !== undefined) responsive[breakpoint] = { ...element.responsive?.[breakpoint], y: wantedY };
      }
      return { ...element, y: nextY, responsive };
    });
  };
  return updateLevel(elements);
}

export function insertBlogWritingBody(elements: CanvasElement[]): CanvasElement[] {
  const footer = elements.find((element) => element.type === 'footer' || element.props.chromeRole === 'site.footer');
  const y = footer?.y ?? Math.max(40, ...elements.map((element) => element.y + element.height));
  const paragraph: CanvasElement = {
    id: `blog-writing-body-${Date.now()}`, type: 'paragraph', name: 'Article body',
    x: 72, y, width: 760, height: 240, zIndex: 1,
    props: { content: [{ type: 'p', children: [{ text: '' }] }], fontSize: 18, lineHeight: 1.7, color: '#334155' },
    responsive: {
      tablet: { x: 48, y: footer?.responsive?.tablet?.y ?? y, width: 672, height: 240 },
      mobile: { x: 24, y: footer?.responsive?.mobile?.y ?? y, width: 328, height: 240 },
    },
    dataBindings: [{ source: 'blog', mode: 'current', fields: ['content'] }],
  };
  return [...elements.map((element) => element.y >= y ? {
    ...element, y: element.y + paragraph.height + 40,
    ...(element.responsive ? { responsive: Object.fromEntries(Object.entries(element.responsive).map(([key, override]) => [key, { ...override, y: (override.y ?? element.y) + paragraph.height + 40 }])) } : {}),
  } : element), paragraph];
}

/** Existing section insertion grows its body; carry that growth through subsequent root chrome. */
export function reflowBlogRootGrowth(before: CanvasElement[], after: CanvasElement[]): CanvasElement[] {
  const previousById = new Map(before.map((element) => [element.id, element]));
  return after.map((element) => {
    const original = previousById.get(element.id);
    if (!original) return element;
    const growingRoots = after.filter((root) => {
      const previous = previousById.get(root.id);
      return root.id !== element.id && (!previous || root.height > previous.height);
    });
    const ownGrowth = Math.max(0, element.height - original.height);
    const shift = growingRoots.reduce((total, root) => {
      const previous = previousById.get(root.id);
      return total + (previous
        ? original.y >= previous.y + previous.height ? root.height - previous.height : 0
        : original.y >= root.y ? root.height + 40 : 0);
    }, 0);
    const responsive: NonNullable<CanvasElement['responsive']> = { ...element.responsive };
    let responsiveChanged = false;
    for (const breakpoint of breakpoints) {
      const override = original.responsive?.[breakpoint];
      const originalY = override?.y ?? original.y;
      const responsiveShift = growingRoots.reduce((total, root) => {
        const previous = previousById.get(root.id);
        const previousOverride = previous?.responsive?.[breakpoint];
        return total + (previous
          ? originalY >= (previousOverride?.y ?? previous.y) + (previousOverride?.height ?? previous.height) ? root.height - previous.height : 0
          : originalY >= (root.responsive?.[breakpoint]?.y ?? root.y) ? root.height + 40 : 0);
      }, 0);
      if (responsiveShift || (override && ownGrowth)) {
        responsive[breakpoint] = { ...override, ...(responsiveShift ? { y: originalY + responsiveShift } : {}), ...(ownGrowth ? { height: (override?.height ?? original.height) + ownGrowth } : {}) };
        responsiveChanged = true;
      }
    }
    return shift || responsiveChanged ? { ...element, y: element.y + shift, ...(responsiveChanged ? { responsive } : {}) } : element;
  });
}

import {
  DEFAULT_CANVAS_SIZE,
  createCanvasElement,
} from '@/components/editor/editorCatalog';
import type { CanvasElement } from '@/types/editor';

const PAGE_CHROME_HEADER_HEIGHT = 88;
const PAGE_CHROME_FOOTER_HEIGHT = 168;
type PageChromeResponsiveBreakpoint = 'tablet' | 'mobile';

interface PageChromeOptions {
  title: string;
  variant: string;
  navItems: string[];
  headerActionLabel?: string;
  footerCopy?: string;
}

const normalizeId = (value: string) => (
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'page'
);

const normalizeNavigationItem = (value: string, index: number) => {
  const [labelPart, ...hrefParts] = value.split(':');
  const label = labelPart.trim() || `Item ${index + 1}`;
  const slug = normalizeId(label);
  const href = hrefParts.join(':').trim() || (slug === 'home' ? '/' : `/${slug}`);
  return { label, href };
};

const navigationItemLayouts = (
  items: Array<{ label: string; href: string }>,
  width: number,
  height: number,
  gap: number,
  fontSize: number,
) => {
  const itemWidths = items.map((item) => Math.max(52, Math.min(116, item.label.length * Math.max(7, fontSize * 0.52) + 28)));
  const totalWidth = itemWidths.reduce((sum, itemWidth) => sum + itemWidth, 0) + gap * Math.max(0, items.length - 1);
  let cursorX = Math.max(0, Math.round((width - totalWidth) / 2));
  const y = Math.max(0, Math.round((height - 24) / 2));

  return items.map((item, index) => {
    const layout = {
      ...item,
      x: cursorX,
      y,
      width: Math.round(itemWidths[index]),
      height: 24,
      fontSize,
    };
    cursorX += itemWidths[index] + gap;
    return layout;
  });
};

const createNavigationLinkChildren = (
  idPrefix: string,
  navItems: string[],
  options: {
    color: string;
    width: number;
    height: number;
    tabletWidth: number;
    tabletHeight: number;
    mobileWidth: number;
    mobileHeight: number;
    fontSize?: number;
    tabletFontSize?: number;
    mobileFontSize?: number;
    gap?: number;
    tabletGap?: number;
    mobileGap?: number;
  },
) => {
  const items = navItems.map(normalizeNavigationItem);
  const desktop = navigationItemLayouts(items, options.width, options.height, options.gap ?? 18, options.fontSize ?? 16);
  const tablet = navigationItemLayouts(items, options.tabletWidth, options.tabletHeight, options.tabletGap ?? 12, options.tabletFontSize ?? 14);
  const mobile = navigationItemLayouts(items, options.mobileWidth, options.mobileHeight, options.mobileGap ?? 12, options.mobileFontSize ?? 13);

  return desktop.map((layout, index) => createCanvasElement('link', layout.x, layout.y, {
    id: `${idPrefix}-${index + 1}-${normalizeId(layout.label)}-link`,
    name: `${layout.label} link`,
    width: layout.width,
    height: layout.height,
    props: {
      content: layout.label,
      href: layout.href,
      fontSize: layout.fontSize,
      fontWeight: '600',
      color: options.color,
      underline: false,
    },
    styles: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      whiteSpace: 'nowrap',
    },
    responsive: {
      tablet: {
        x: tablet[index]?.x ?? layout.x,
        y: tablet[index]?.y ?? layout.y,
        width: tablet[index]?.width ?? layout.width,
        height: tablet[index]?.height ?? layout.height,
        props: { fontSize: tablet[index]?.fontSize ?? layout.fontSize },
      },
      mobile: {
        x: mobile[index]?.x ?? layout.x,
        y: mobile[index]?.y ?? layout.y,
        width: mobile[index]?.width ?? layout.width,
        height: mobile[index]?.height ?? layout.height,
        props: { fontSize: mobile[index]?.fontSize ?? layout.fontSize },
      },
    },
  }));
};

const cloneResponsive = (responsive: CanvasElement['responsive']): CanvasElement['responsive'] | undefined => (
  responsive
    ? Object.fromEntries(
        Object.entries(responsive).map(([breakpoint, override]) => [
          breakpoint,
          {
            ...override,
            props: override.props ? { ...override.props } : undefined,
            styles: override.styles ? { ...override.styles } : undefined,
          },
        ]),
      ) as CanvasElement['responsive']
    : undefined
);

const cloneCanvasElement = (element: CanvasElement): CanvasElement => ({
  ...element,
  props: { ...element.props },
  responsive: cloneResponsive(element.responsive),
  dataBindings: element.dataBindings ? element.dataBindings.map((binding) => ({ ...binding })) : undefined,
  children: element.children?.map(cloneCanvasElement),
});

const shiftResponsiveY = (
  responsive: CanvasElement['responsive'],
  offsetY: number,
): CanvasElement['responsive'] | undefined => (
  responsive
    ? Object.fromEntries(
        Object.entries(responsive).map(([breakpoint, override]) => [
          breakpoint,
          {
            ...override,
            props: override.props ? { ...override.props } : undefined,
            styles: override.styles ? { ...override.styles } : undefined,
            y: typeof override.y === 'number' ? override.y + offsetY : override.y,
          },
        ]),
      ) as CanvasElement['responsive']
    : undefined
);

const shiftCanvasElement = (element: CanvasElement, offsetY: number): CanvasElement => ({
  ...cloneCanvasElement(element),
  y: element.y + offsetY,
  responsive: shiftResponsiveY(element.responsive, offsetY),
});

export const getTemplateBottom = (elements: CanvasElement[]) => (
  elements.reduce((bottom, element) => {
    const responsiveBottom = Object.values(element.responsive || {}).reduce((breakpointBottom, override) => (
      Math.max(
        breakpointBottom,
        (override.y ?? element.y) + (override.height ?? element.height),
      )
    ), 0);

    return Math.max(bottom, element.y + element.height, responsiveBottom);
  }, 0)
);

const elementBottomForBreakpoint = (
  element: CanvasElement,
  breakpoint?: PageChromeResponsiveBreakpoint,
) => {
  const override = breakpoint ? element.responsive?.[breakpoint] : undefined;
  const y = typeof override?.y === 'number' ? override.y : element.y;
  const height = typeof override?.height === 'number' ? override.height : element.height;
  return y + height;
};

const getTemplateBottomForBreakpoint = (
  elements: CanvasElement[],
  breakpoint?: PageChromeResponsiveBreakpoint,
) => (
  elements.reduce((bottom, element) => Math.max(bottom, elementBottomForBreakpoint(element, breakpoint)), 0)
);

const getFooterYForBreakpoint = (
  elements: CanvasElement[],
  breakpoint?: PageChromeResponsiveBreakpoint,
) => (
  Math.max(
    getTemplateBottomForBreakpoint(elements, breakpoint) + 56,
    DEFAULT_CANVAS_SIZE.height - PAGE_CHROME_FOOTER_HEIGHT,
  )
);

export const getCanvasHeightForElements = (elements: CanvasElement[]) => (
  Math.max(DEFAULT_CANVAS_SIZE.height, getTemplateBottom(elements) + 48)
);

export function withPageChrome(elements: CanvasElement[], options: PageChromeOptions): CanvasElement[] {
  const shiftedElements = elements.map((element) => shiftCanvasElement(element, PAGE_CHROME_HEADER_HEIGHT));
  const footerY = getFooterYForBreakpoint(shiftedElements);
  const tabletFooterY = getFooterYForBreakpoint(shiftedElements, 'tablet');
  const mobileFooterY = getFooterYForBreakpoint(shiftedElements, 'mobile');
  const idPrefix = normalizeId(options.variant);
  const brandLabel = options.title || 'Backy site';

  return [
    createCanvasElement('header', 0, 0, {
      id: `${idPrefix}-site-header`,
      width: DEFAULT_CANVAS_SIZE.width,
      height: PAGE_CHROME_HEADER_HEIGHT,
      props: {
        backgroundColor: '#ffffff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        borderStyle: 'solid',
        padding: 0,
      },
      responsive: {
        tablet: { width: 768 },
        mobile: { width: 375 },
      },
      children: [
        createCanvasElement('text', 72, 30, {
          id: `${idPrefix}-site-brand`,
          width: 210,
          height: 30,
          props: { content: brandLabel, fontSize: 18, fontWeight: '800', color: '#111827' },
          responsive: {
            tablet: { x: 40, y: 30, width: 190 },
            mobile: { x: 20, y: 16, width: 172, height: 26, props: { fontSize: 16 } },
          },
        }),
        createCanvasElement('nav', 430, 18, {
          id: `${idPrefix}-site-navigation`,
          width: 430,
          height: 52,
          props: {
            navItems: options.navItems,
            navigationSource: 'site-primary',
            navigationBinding: 'site.navigation.primary',
            chromeRole: 'site.header.navigation',
            ariaLabel: 'Primary navigation',
            backgroundColor: 'transparent',
            color: '#111827',
            padding: 0,
          },
          responsive: {
            tablet: { x: 260, y: 18, width: 300, height: 52, props: { gap: 12 } },
            mobile: { x: 20, y: 52, width: 335, height: 30, props: { gap: 12, fontSize: 13 } },
          },
          children: createNavigationLinkChildren(`${idPrefix}-site-navigation`, options.navItems, {
            color: '#111827',
            width: 430,
            height: 52,
            tabletWidth: 300,
            tabletHeight: 52,
            mobileWidth: 335,
            mobileHeight: 30,
          }),
        }),
        createCanvasElement('button', 982, 20, {
          id: `${idPrefix}-site-header-action`,
          width: 146,
          height: 48,
          props: {
            label: options.headerActionLabel || 'Contact',
            backgroundColor: '#111827',
            color: '#ffffff',
            borderRadius: 8,
            fontWeight: '700',
          },
          responsive: {
            tablet: { x: 596, y: 22, width: 120, height: 44 },
            mobile: { x: 242, y: 16, width: 113, height: 36, props: { fontSize: 13 } },
          },
        }),
      ],
    }),
    ...shiftedElements,
    createCanvasElement('footer', 0, footerY, {
      id: `${idPrefix}-site-footer`,
      width: DEFAULT_CANVAS_SIZE.width,
      height: PAGE_CHROME_FOOTER_HEIGHT,
      props: {
        backgroundColor: '#111827',
        color: '#ffffff',
        padding: 0,
      },
      responsive: {
        tablet: { y: tabletFooterY, width: 768 },
        mobile: { y: mobileFooterY, width: 375 },
      },
      children: [
        createCanvasElement('heading', 72, 40, {
          id: `${idPrefix}-footer-heading`,
          width: 360,
          height: 38,
          props: { content: brandLabel, level: 'h3', fontSize: 24, fontWeight: '800', color: '#ffffff' },
          responsive: {
            tablet: { x: 40, y: 38, width: 300 },
            mobile: { x: 20, y: 26, width: 320, height: 34, props: { fontSize: 22 } },
          },
        }),
        createCanvasElement('paragraph', 72, 90, {
          id: `${idPrefix}-footer-copy`,
          width: 460,
          height: 46,
          props: {
            content: options.footerCopy || 'Edit this footer, save it as a reusable section, or bind links from site navigation.',
            fontSize: 14,
            lineHeight: 1.5,
            color: '#cbd5e1',
          },
          responsive: {
            tablet: { x: 40, y: 86, width: 360, height: 50 },
            mobile: { x: 20, y: 70, width: 320, height: 50 },
          },
        }),
        createCanvasElement('nav', 700, 48, {
          id: `${idPrefix}-footer-navigation`,
          width: 330,
          height: 56,
          props: {
            navItems: options.navItems,
            navigationSource: 'site-footer',
            navigationBinding: 'site.navigation.footer',
            chromeRole: 'site.footer.navigation',
            ariaLabel: 'Footer navigation',
            backgroundColor: 'transparent',
            color: '#ffffff',
            padding: 0,
          },
          responsive: {
            tablet: { x: 442, y: 58, width: 270, height: 50, props: { gap: 12 } },
            mobile: { x: 20, y: 122, width: 320, height: 34, props: { gap: 12, fontSize: 13 } },
          },
          children: createNavigationLinkChildren(`${idPrefix}-footer-navigation`, options.navItems, {
            color: '#ffffff',
            width: 330,
            height: 56,
            tabletWidth: 270,
            tabletHeight: 50,
            mobileWidth: 320,
            mobileHeight: 34,
          }),
        }),
      ],
    }),
  ];
}

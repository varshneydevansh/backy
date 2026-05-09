import {
  DEFAULT_CANVAS_SIZE,
  createCanvasElement,
} from '@/components/editor/editorCatalog';
import type { CanvasElement } from '@/types/editor';

const PAGE_CHROME_HEADER_HEIGHT = 88;
const PAGE_CHROME_FOOTER_HEIGHT = 168;

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

const cloneCanvasElement = (element: CanvasElement): CanvasElement => ({
  ...element,
  props: { ...element.props },
  dataBindings: element.dataBindings ? element.dataBindings.map((binding) => ({ ...binding })) : undefined,
  children: element.children?.map(cloneCanvasElement),
});

const shiftCanvasElement = (element: CanvasElement, offsetY: number): CanvasElement => ({
  ...cloneCanvasElement(element),
  y: element.y + offsetY,
});

export const getTemplateBottom = (elements: CanvasElement[]) => (
  elements.reduce((bottom, element) => Math.max(bottom, element.y + element.height), 0)
);

export const getCanvasHeightForElements = (elements: CanvasElement[]) => (
  Math.max(DEFAULT_CANVAS_SIZE.height, getTemplateBottom(elements) + 48)
);

export function withPageChrome(elements: CanvasElement[], options: PageChromeOptions): CanvasElement[] {
  const shiftedElements = elements.map((element) => shiftCanvasElement(element, PAGE_CHROME_HEADER_HEIGHT));
  const footerY = Math.max(getTemplateBottom(shiftedElements) + 56, DEFAULT_CANVAS_SIZE.height - PAGE_CHROME_FOOTER_HEIGHT);
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
      children: [
        createCanvasElement('text', 72, 30, {
          id: `${idPrefix}-site-brand`,
          width: 210,
          height: 30,
          props: { content: brandLabel, fontSize: 18, fontWeight: '800', color: '#111827' },
        }),
        createCanvasElement('nav', 430, 18, {
          id: `${idPrefix}-site-navigation`,
          width: 430,
          height: 52,
          props: {
            navItems: options.navItems,
            backgroundColor: 'transparent',
            color: '#111827',
            padding: 0,
          },
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
      children: [
        createCanvasElement('heading', 72, 40, {
          id: `${idPrefix}-footer-heading`,
          width: 360,
          height: 38,
          props: { content: brandLabel, level: 'h3', fontSize: 24, fontWeight: '800', color: '#ffffff' },
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
        }),
        createCanvasElement('nav', 700, 48, {
          id: `${idPrefix}-footer-navigation`,
          width: 330,
          height: 56,
          props: {
            navItems: options.navItems,
            backgroundColor: 'transparent',
            color: '#ffffff',
            padding: 0,
          },
        }),
      ],
    }),
  ];
}

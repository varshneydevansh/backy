import { generateId } from '@/lib/utils';
import type {
  CanvasElement,
  CanvasSize,
  ComponentLibraryItem,
  ElementType,
} from '@/types/editor';

// ============================================
// CANVAS SIZING
// ============================================

export type EditorBreakpoint = 'desktop' | 'tablet' | 'mobile';

export const DEFAULT_CANVAS_SIZE: CanvasSize = {
  width: 1200,
  height: 800,
  minWidth: 320,
  maxWidth: 1920,
};

export const BREAKPOINT_CANVAS_SIZE: Record<EditorBreakpoint, CanvasSize> = {
  desktop: {
    width: 1200,
    height: 800,
    minWidth: 320,
    maxWidth: 1920,
  },
  tablet: {
    width: 768,
    height: 1024,
    minWidth: 375,
    maxWidth: 1024,
  },
  mobile: {
    width: 375,
    height: 812,
    minWidth: 320,
    maxWidth: 480,
  },
};

export interface SavedCanvasPayload {
  elements: CanvasElement[];
  canvasSize: CanvasSize;
  customCSS?: string;
}

const cloneDefaultProps = (value: Record<string, unknown>): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value));

// ============================================
// COMPONENT LIBRARY DEFINITIONS
// ============================================

export const CANVAS_COMPONENT_LIBRARY: ComponentLibraryItem[] = [
  {
    type: 'heading',
    name: 'Heading',
    icon: 'Heading',
    category: 'basic',
    defaultProps: {
      content: 'Heading Text',
      level: 'h2',
      fontSize: 32,
      fontWeight: 'bold',
      color: '#000000',
    },
    defaultSize: { width: 300, height: 50 },
    description: 'Section heading with multiple levels',
  },
  {
    type: 'text',
    name: 'Text',
    icon: 'Type',
    category: 'basic',
    defaultProps: {
      content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      fontSize: 16,
      lineHeight: 1.5,
      color: '#333333',
    },
    defaultSize: { width: 300, height: 80 },
    description: 'Paragraph text block',
  },
  {
    type: 'button',
    name: 'Button',
    icon: 'MousePointerClick',
    category: 'basic',
    defaultProps: {
      label: 'Click Me',
      backgroundColor: '#3b82f6',
      color: '#ffffff',
      borderRadius: 8,
      fontSize: 16,
    },
    defaultSize: { width: 150, height: 48 },
    description: 'Clickable button with customizable styles',
  },
  {
    type: 'image',
    name: 'Image',
    icon: 'Image',
    category: 'media',
    defaultProps: {
      src: '/placeholder-image.jpg',
      alt: 'Image description',
      objectFit: 'cover',
    },
    defaultSize: { width: 300, height: 200 },
    description: 'Image with various fit options',
  },
  {
    type: 'video',
    name: 'Video',
    icon: 'Video',
    category: 'media',
    defaultProps: {
      controls: true,
      autoplay: false,
      loop: false,
      objectFit: 'cover',
    },
    defaultSize: { width: 400, height: 225 },
    description: 'Video player with controls',
  },
  {
    type: 'box',
    name: 'Box',
    icon: 'Box',
    category: 'layout',
    defaultProps: {
      backgroundColor: '#f3f4f6',
      borderRadius: 8,
    },
    defaultSize: { width: 200, height: 200 },
    description: 'Container box for grouping elements',
  },
  {
    type: 'divider',
    name: 'Divider',
    icon: 'Minus',
    category: 'layout',
    defaultProps: {
      borderColor: '#e5e7eb',
      thickness: '2px',
      margin: '16px',
    },
    defaultSize: { width: 300, height: 2 },
    description: 'Horizontal divider line',
  },
  {
    type: 'spacer',
    name: 'Spacer',
    icon: 'Square',
    category: 'layout',
    defaultProps: {},
    defaultSize: { width: 50, height: 50 },
    description: 'Empty space for layout',
  },
  {
    type: 'link',
    name: 'Link',
    icon: 'LinkIcon',
    category: 'basic',
    defaultProps: {
      content: 'Click here',
      href: '#',
      color: '#3b82f6',
      fontSize: 16,
      underline: true,
    },
    defaultSize: { width: 100, height: 24 },
    description: 'Clickable link',
  },
  {
    type: 'list',
    name: 'List',
    icon: 'List',
    category: 'basic',
    defaultProps: {
      items: ['Item 1', 'Item 2', 'Item 3'],
      listType: 'bullet',
    },
    defaultSize: { width: 200, height: 100 },
    description: 'Ordered or unordered list',
  },
  {
    type: 'quote',
    name: 'Quote',
    icon: 'Quote',
    category: 'basic',
    defaultProps: {
      content: 'Quote text here...',
      fontSize: 18,
      fontStyle: 'italic',
    },
    defaultSize: { width: 300, height: 80 },
    description: 'Blockquote for citations',
  },
  {
    type: 'embed',
    name: 'Embed',
    icon: 'Code',
    category: 'advanced',
    defaultProps: {
      src: '',
      borderRadius: 8,
    },
    defaultSize: { width: 400, height: 300 },
    description: 'Embed external content',
  },
  {
    type: 'form',
    name: 'Form',
    icon: 'FormInput',
    category: 'form',
    defaultProps: {
      formTitle: 'Contact Form',
      actionUrl: '',
      backgroundColor: '#ffffff',
      borderRadius: 8,
    },
    defaultSize: { width: 300, height: 200 },
    description: 'Form container',
  },
  {
    type: 'input',
    name: 'Input',
    icon: 'FormInput',
    category: 'form',
    defaultProps: {
      placeholder: 'Enter text...',
      name: 'input',
      inputType: 'text',
      borderRadius: 4,
      borderColor: '#d1d5db',
    },
    defaultSize: { width: 250, height: 40 },
    description: 'Text input field',
  },
  {
    type: 'icon',
    name: 'Icon',
    icon: 'Star',
    category: 'basic',
    defaultProps: {
      icon: '★',
      size: 32,
      color: '#374151',
    },
    defaultSize: { width: 60, height: 60 },
    description: 'Icon or emoji symbol',
  },
  {
    type: 'columns',
    name: 'Columns',
    icon: 'Columns',
    category: 'layout',
    defaultProps: {
      columns: 2,
      gap: 16,
    },
    defaultSize: { width: 500, height: 200 },
    description: 'Multi-column layout',
  },
  {
    type: 'map',
    name: 'Map',
    icon: 'MapPin',
    category: 'advanced',
    defaultProps: {
      address: '',
      zoom: 14,
    },
    defaultSize: { width: 400, height: 300 },
    description: 'Google Maps embed',
  },
  {
    type: 'paragraph',
    name: 'Paragraph',
    icon: 'AlignLeft',
    category: 'basic',
    defaultProps: {
      content: 'Paragraph text...',
      fontSize: 16,
      lineHeight: 1.6,
    },
    defaultSize: { width: 300, height: 100 },
    description: 'Body paragraph text',
  },
];

const CANVAS_ITEM_BY_TYPE: Record<ElementType, ComponentLibraryItem | undefined> =
  CANVAS_COMPONENT_LIBRARY.reduce((acc, item) => {
    acc[item.type] = item;
    return acc;
  }, {} as Record<ElementType, ComponentLibraryItem | undefined>);

export function createCanvasElement(
  type: ElementType,
  x: number,
  y: number,
  overrides: Partial<CanvasElement> = {}
): CanvasElement {
  const definition = CANVAS_ITEM_BY_TYPE[type];
  const props = definition ? cloneDefaultProps(definition.defaultProps || {}) : {};
  const size = definition?.defaultSize || { width: 200, height: 100 };

  return {
    id: generateId(),
    type,
    x,
    y,
    width: size.width,
    height: size.height,
    zIndex: 1,
    props,
    ...overrides,
  };
}

export function normalizeSavedCanvasContent(raw?: string | null): SavedCanvasPayload {
  if (!raw) {
    return {
      elements: [],
      canvasSize: DEFAULT_CANVAS_SIZE,
    };
  }

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return {
        elements: parsed as CanvasElement[],
        canvasSize: DEFAULT_CANVAS_SIZE,
      };
    }

    if (parsed && Array.isArray(parsed.elements)) {
      return {
        elements: parsed.elements as CanvasElement[],
        canvasSize: normalizeCanvasSize(parsed.canvasSize),
        customCSS: parsed.customCSS,
      };
    }
  } catch {
    // fall back to empty state
  }

  return {
    elements: [],
    canvasSize: DEFAULT_CANVAS_SIZE,
  };
}

function normalizeCanvasSize(input?: Partial<CanvasSize>): CanvasSize {
  return {
    ...DEFAULT_CANVAS_SIZE,
    ...input,
  };
}

export function serializeCanvasContent(
  elements: CanvasElement[],
  canvasSize: CanvasSize,
  customCSS?: string
): string {
  return JSON.stringify({
    elements,
    canvasSize,
    customCSS,
  });
}

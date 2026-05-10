import { generateId } from '@/lib/utils';
import {
  canvasElementsToBackyContentDocument,
  isBackyContentDocument,
  type BackyContentDocument,
  type BackyContentKind,
  type BackyContentStatus,
} from '@backy-cms/core';
import type { CSSProperties } from 'react';
import type {
  CanvasElement,
  CanvasSize,
  ComponentLibraryChild,
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
  contentDocument?: BackyContentDocument;
}

export interface SerializeCanvasContentOptions {
  documentId?: string;
  kind?: BackyContentKind;
  title?: string;
  slug?: string;
  status?: BackyContentStatus;
  locale?: string;
  version?: string;
}

const cloneDefaultProps = (value: Record<string, unknown>): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value));

const cloneDefaultStyles = (value?: CSSProperties): CSSProperties | undefined =>
  value ? JSON.parse(JSON.stringify(value)) as CSSProperties : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

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
    type: 'section',
    name: 'Section',
    icon: 'Box',
    category: 'layout',
    defaultProps: {
      backgroundColor: '#f9fafb',
      borderRadius: 0,
      padding: 16,
    },
    defaultSize: { width: 1200, height: 280 },
    description: 'Full-width section for major page blocks',
  },
  {
    id: 'hero-section',
    type: 'section',
    name: 'Hero section',
    icon: 'Sparkles',
    category: 'layout',
    defaultProps: {
      backgroundColor: '#0f172a',
      borderRadius: 0,
      padding: 0,
    },
    defaultSize: { width: 1200, height: 520 },
    description: 'Composed hero with headline, copy, button, and media frame',
    defaultChildren: [
      {
        type: 'heading',
        x: 72,
        y: 82,
        width: 560,
        height: 118,
        props: {
          content: 'Build your site without starting from a blank page',
          level: 'h1',
          fontSize: 46,
          fontWeight: '800',
          lineHeight: 1.08,
          color: '#ffffff',
        },
      },
      {
        type: 'paragraph',
        x: 76,
        y: 222,
        width: 500,
        height: 86,
        props: {
          content: 'A reusable section preset made from editable Backy elements. Replace text, swap media, and adapt it for every breakpoint.',
          fontSize: 18,
          lineHeight: 1.55,
          color: '#cbd5e1',
        },
      },
      {
        type: 'button',
        x: 76,
        y: 332,
        width: 172,
        height: 52,
        props: {
          label: 'Start editing',
          backgroundColor: '#22c55e',
          color: '#052e16',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: '700',
        },
      },
      {
        type: 'box',
        x: 700,
        y: 72,
        width: 420,
        height: 340,
        props: {
          backgroundColor: '#ffffff',
          borderRadius: 8,
          borderColor: '#334155',
          borderWidth: 1,
          borderStyle: 'solid',
          boxShadow: '0 24px 70px rgba(2, 6, 23, 0.35)',
        },
        children: [
          {
            type: 'image',
            x: 24,
            y: 24,
            width: 372,
            height: 210,
            props: {
              src: '/placeholder-image.jpg',
              alt: 'Hero media',
              objectFit: 'cover',
              borderRadius: 6,
            },
          },
          {
            type: 'text',
            x: 28,
            y: 254,
            width: 260,
            height: 44,
            props: {
              content: 'Drag in your own image or video',
              fontSize: 18,
              fontWeight: '700',
              color: '#0f172a',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'feature-grid-section',
    type: 'section',
    name: 'Feature grid',
    icon: 'LayoutGrid',
    category: 'layout',
    defaultProps: {
      backgroundColor: '#ffffff',
      borderRadius: 0,
      padding: 0,
    },
    defaultSize: { width: 1200, height: 460 },
    description: 'Reusable three-card feature section with editable nested blocks',
    defaultChildren: [
      {
        type: 'heading',
        x: 72,
        y: 56,
        width: 520,
        height: 64,
        props: {
          content: 'Reusable blocks for repeatable page systems',
          level: 'h2',
          fontSize: 34,
          fontWeight: '800',
          color: '#111827',
        },
      },
      {
        type: 'paragraph',
        x: 74,
        y: 126,
        width: 620,
        height: 48,
        props: {
          content: 'Each card is a nested element group, so teams can edit copy, spacing, and styles without rebuilding the section.',
          fontSize: 16,
          lineHeight: 1.5,
          color: '#4b5563',
        },
      },
      ...['Content model', 'Media workflow', 'Responsive sizing'].map((title, index) => ({
        type: 'box' as ElementType,
        x: 72 + index * 360,
        y: 220,
        width: 320,
        height: 170,
        props: {
          backgroundColor: '#f8fafc',
          borderRadius: 8,
          borderColor: '#e2e8f0',
          borderWidth: 1,
          borderStyle: 'solid',
          padding: 18,
        },
        children: [
          {
            type: 'heading' as ElementType,
            x: 20,
            y: 22,
            width: 260,
            height: 38,
            props: {
              content: title,
              level: 'h3',
              fontSize: 21,
              fontWeight: '750',
              color: '#0f172a',
            },
          },
          {
            type: 'paragraph' as ElementType,
            x: 20,
            y: 76,
            width: 260,
            height: 70,
            props: {
              content: 'Swap this text, bind it to CMS data, or save the section as a future template.',
              fontSize: 14,
              lineHeight: 1.5,
              color: '#475569',
            },
          },
        ],
      })),
    ],
  },
  {
    type: 'header',
    name: 'Header',
    icon: 'Square',
    category: 'layout',
    defaultProps: {
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      padding: 16,
    },
    defaultSize: { width: 1200, height: 120 },
    description: 'Reusable page header block',
  },
  {
    type: 'nav',
    name: 'Navigation',
    icon: 'Menu',
    category: 'layout',
    defaultProps: {
      backgroundColor: 'transparent',
      color: '#111827',
      padding: 16,
      navItems: ['Home', 'About', 'Contact'],
    },
    defaultSize: { width: 1200, height: 72 },
    description: 'Navigation container for page menu items',
  },
  {
    type: 'footer',
    name: 'Footer',
    icon: 'Box',
    category: 'layout',
    defaultProps: {
      backgroundColor: '#111827',
      color: '#ffffff',
      padding: 24,
    },
    defaultSize: { width: 1200, height: 180 },
    description: 'Reusable page footer block',
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
      formActive: true,
      formAudience: 'public',
      actionUrl: '',
      backgroundColor: '#ffffff',
      borderRadius: 8,
    },
    defaultSize: { width: 300, height: 200 },
    description: 'Form container',
  },
  {
    id: 'lead-capture-form',
    type: 'form',
    name: 'Lead capture form',
    icon: 'FormInput',
    category: 'form',
    defaultProps: {
      formTitle: 'Request access',
      backgroundColor: '#ffffff',
      borderRadius: 8,
      borderColor: '#e5e7eb',
      padding: 18,
      formActive: true,
      formAudience: 'public',
      successMessage: 'Thanks. We will follow up soon.',
      enableHoneypot: true,
      enableCaptcha: false,
    },
    defaultSize: { width: 420, height: 430 },
    description: 'Composed form with name, email, message, and submit button',
    defaultChildren: [
      {
        type: 'input',
        x: 22,
        y: 80,
        width: 360,
        height: 54,
        props: {
          label: 'Name',
          name: 'name',
          placeholder: 'Your name',
          required: true,
        },
      },
      {
        type: 'input',
        x: 22,
        y: 150,
        width: 360,
        height: 54,
        props: {
          label: 'Email',
          name: 'email',
          inputType: 'email',
          placeholder: 'you@example.com',
          required: true,
        },
      },
      {
        type: 'textarea',
        x: 22,
        y: 220,
        width: 360,
        height: 96,
        props: {
          label: 'What are you building?',
          name: 'message',
          placeholder: 'Tell us about your project',
          required: false,
        },
      },
      {
        type: 'button',
        x: 22,
        y: 338,
        width: 170,
        height: 48,
        props: {
          label: 'Submit request',
          backgroundColor: '#111827',
          color: '#ffffff',
          borderRadius: 8,
          fontWeight: '700',
        },
      },
    ],
  },
  {
    id: 'member-registration-form',
    type: 'form',
    name: 'Registration form',
    icon: 'FormInput',
    category: 'form',
    defaultProps: {
      formTitle: 'Registration form',
      formName: 'registration-form',
      formDescription: 'Signup and member registration capture.',
      formActive: true,
      formAudience: 'public',
      successMessage: 'Registration received. Check your inbox for the next step.',
      enableHoneypot: true,
      enableCaptcha: false,
      moderationMode: 'manual',
      contactShareEnabled: true,
      contactShareNameField: 'full_name',
      contactShareEmailField: 'email',
      contactSharePhoneField: 'phone',
      contactShareNotesField: 'member_type',
      backgroundColor: '#ffffff',
      borderRadius: 8,
      borderColor: '#d8ded2',
      padding: 18,
    },
    defaultSize: { width: 430, height: 560 },
    description: 'Reusable member signup form with consent and contact routing',
    defaultChildren: [
      {
        type: 'input',
        x: 22,
        y: 82,
        width: 360,
        height: 54,
        props: {
          label: 'Full name',
          name: 'full_name',
          placeholder: 'Ada Lovelace',
          required: true,
        },
      },
      {
        type: 'input',
        x: 22,
        y: 154,
        width: 360,
        height: 54,
        props: {
          label: 'Email',
          name: 'email',
          inputType: 'email',
          placeholder: 'you@example.com',
          required: true,
        },
      },
      {
        type: 'input',
        x: 22,
        y: 226,
        width: 360,
        height: 54,
        props: {
          label: 'Phone',
          name: 'phone',
          inputType: 'tel',
          placeholder: '+1 555 0100',
          required: false,
        },
      },
      {
        type: 'select',
        x: 22,
        y: 298,
        width: 360,
        height: 54,
        props: {
          label: 'Member type',
          name: 'member_type',
          options: ['Customer', 'Creator', 'Partner'],
          placeholder: 'Choose a type',
          required: true,
        },
      },
      {
        type: 'checkbox',
        x: 22,
        y: 378,
        width: 360,
        height: 42,
        props: {
          label: 'I agree to be contacted about this registration.',
          name: 'consent',
          required: true,
        },
      },
      {
        type: 'button',
        x: 22,
        y: 462,
        width: 190,
        height: 50,
        props: {
          label: 'Create account',
          backgroundColor: '#14532d',
          color: '#ffffff',
          borderRadius: 8,
          fontWeight: '700',
        },
      },
    ],
  },
  {
    type: 'input',
    name: 'Text input field',
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
    type: 'textarea',
    name: 'Multi-line text input',
    icon: 'FormInput',
    category: 'form',
    defaultProps: {
      name: 'message',
      rows: 4,
      placeholder: 'Write your message...',
      borderRadius: 4,
      borderColor: '#d1d5db',
      required: true,
    },
    defaultSize: { width: 300, height: 120 },
    description: 'Multi-line text input',
  },
  {
    type: 'select',
    name: 'Dropdown selector',
    icon: 'List',
    category: 'form',
    defaultProps: {
      name: 'select',
      options: ['Option 1', 'Option 2', 'Option 3'],
      placeholder: 'Select option',
      borderRadius: 4,
      borderColor: '#d1d5db',
      required: false,
    },
    defaultSize: { width: 220, height: 44 },
    description: 'Dropdown selector',
  },
  {
    type: 'checkbox',
    name: 'Checkbox inputs',
    icon: 'CheckSquare',
    category: 'form',
    defaultProps: {
      name: 'checkbox',
      label: 'Checkbox',
      options: ['Option A', 'Option B'],
      required: false,
    },
    defaultSize: { width: 260, height: 80 },
    description: 'Checkbox inputs',
  },
  {
    type: 'radio',
    name: 'Radio inputs',
    icon: 'Circle',
    category: 'form',
    defaultProps: {
      name: 'radio',
      label: 'Radio',
      options: ['Option A', 'Option B'],
      required: false,
    },
    defaultSize: { width: 260, height: 80 },
    description: 'Radio inputs',
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
  {
    type: 'comment',
    name: 'Comments',
    icon: 'MessageSquare',
    category: 'advanced',
    defaultProps: {
      commentTitle: 'Comments',
      commentAllowGuests: true,
      commentRequireName: true,
      commentRequireEmail: false,
      commentAllowReplies: true,
      commentModerationMode: 'manual',
      commentSortOrder: 'newest',
    },
    defaultSize: { width: 360, height: 320 },
    description: 'Moderated public comment thread',
  },
];

const CANVAS_ITEM_BY_TYPE: Record<ElementType, ComponentLibraryItem | undefined> =
  CANVAS_COMPONENT_LIBRARY.reduce((acc, item) => {
    if (!acc[item.type]) {
      acc[item.type] = item;
    }
    return acc;
  }, {} as Record<ElementType, ComponentLibraryItem | undefined>);

const createPresetChild = (child: ComponentLibraryChild, zIndex: number): CanvasElement => ({
  id: generateId(),
  type: child.type,
  name: child.name,
  x: child.x,
  y: child.y,
  width: child.width,
  height: child.height,
  zIndex,
  props: cloneDefaultProps(child.props || {}),
  styles: cloneDefaultStyles(child.styles),
  children: child.children?.map((nestedChild, index) => createPresetChild(nestedChild, index + 1)),
});

const cloneReusableElement = (
  element: CanvasElement,
  options: {
    root: boolean;
    originX: number;
    originY: number;
    targetX: number;
    targetY: number;
    zIndex: number;
    reusableMeta?: {
      sectionId: string;
      slug?: string;
      name?: string;
      sourceUpdatedAt?: string;
      mode: 'synced' | 'detached';
    };
  },
): CanvasElement => {
  const rest: CanvasElement = { ...element };
  delete rest.parentId;
  const nextProps = cloneDefaultProps(element.props || {});
  if (options.root && options.reusableMeta) {
    nextProps.reusableSection = options.reusableMeta;
  }

  return {
    ...rest,
    id: generateId(),
    x: options.root ? options.targetX + (element.x - options.originX) : element.x,
    y: options.root ? options.targetY + (element.y - options.originY) : element.y,
    zIndex: options.root ? options.zIndex : element.zIndex,
    props: nextProps,
    styles: cloneDefaultStyles(element.styles),
    children: element.children?.map((child) => cloneReusableElement(child, {
      ...options,
      root: false,
      zIndex: child.zIndex || 1,
    })),
  };
};

export function createCanvasElementsFromReusableContent(
  content: ComponentLibraryItem['reusableContent'],
  x: number,
  y: number,
  zIndexStart = 1,
): CanvasElement[] {
  const roots = Array.isArray(content?.elements) ? content.elements : [];
  if (!roots.length) {
    return [];
  }

  const originX = Math.min(...roots.map((element) => element.x || 0));
  const originY = Math.min(...roots.map((element) => element.y || 0));
  const reusableMeta = content?.sectionId
    ? {
        sectionId: content.sectionId,
        slug: content.slug,
        name: content.name,
        sourceUpdatedAt: content.sourceUpdatedAt,
        mode: content.syncMode || 'synced',
      }
    : undefined;

  return roots.map((element, index) => cloneReusableElement(element, {
    root: true,
    originX,
    originY,
    targetX: x,
    targetY: y,
    zIndex: zIndexStart + index,
    reusableMeta,
  }));
}

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

export function createCanvasElementFromLibraryItem(
  item: ComponentLibraryItem,
  x: number,
  y: number,
  overrides: Partial<CanvasElement> = {}
): CanvasElement {
  const base = createCanvasElement(item.type, x, y, {
    width: item.defaultSize?.width,
    height: item.defaultSize?.height,
    props: cloneDefaultProps(item.defaultProps || {}),
    styles: cloneDefaultStyles(item.defaultStyles),
  });

  return {
    ...base,
    children: item.defaultChildren?.map((child, index) => createPresetChild(child, index + 1)),
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
    const contentDocument = isBackyContentDocument(parsed)
      ? parsed
      : isRecord(parsed) && isBackyContentDocument(parsed.contentDocument)
        ? parsed.contentDocument
        : undefined;
    const documentCanvasSize = isRecord(contentDocument?.metadata?.canvasSize)
      ? contentDocument.metadata.canvasSize
      : undefined;

    if (Array.isArray(parsed)) {
      return {
        elements: normalizeSavedCanvasElements(parsed),
        canvasSize: DEFAULT_CANVAS_SIZE,
        contentDocument,
      };
    }

    if (isRecord(parsed) && (Array.isArray(parsed.elements) || contentDocument)) {
      return {
        elements: Array.isArray(parsed.elements)
          ? normalizeSavedCanvasElements(parsed.elements)
          : contentDocument
            ? normalizeSavedCanvasElements(contentDocument.elements)
            : [],
        canvasSize: normalizeCanvasSize(isRecord(parsed.canvasSize) ? parsed.canvasSize : documentCanvasSize),
        customCSS: typeof parsed.customCSS === 'string'
          ? parsed.customCSS
          : typeof contentDocument?.metadata?.customCSS === 'string'
            ? contentDocument.metadata.customCSS
            : undefined,
        contentDocument,
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

function normalizeSavedCanvasElements(input: unknown): CanvasElement[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter(isRecord)
    .map((rawElement, index) => {
      const props = isRecord(rawElement.props)
        ? rawElement.props
        : isRecord(rawElement.content)
          ? rawElement.content
          : {};
      const styles = isRecord(rawElement.styles)
        ? rawElement.styles as CSSProperties
        : undefined;
      const children = Array.isArray(rawElement.children)
        ? normalizeSavedCanvasElements(rawElement.children)
        : undefined;

      return {
        ...rawElement,
        id: typeof rawElement.id === 'string' ? rawElement.id : generateId(),
        type: typeof rawElement.type === 'string' ? rawElement.type as ElementType : 'text',
        x: typeof rawElement.x === 'number' ? rawElement.x : 0,
        y: typeof rawElement.y === 'number' ? rawElement.y : 0,
        width: typeof rawElement.width === 'number' ? rawElement.width : 320,
        height: typeof rawElement.height === 'number' ? rawElement.height : 120,
        zIndex: typeof rawElement.zIndex === 'number' ? rawElement.zIndex : index + 1,
        props,
        styles,
        ...(children ? { children } : {}),
      } as CanvasElement;
    });
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
  customCSS?: string,
  options: SerializeCanvasContentOptions = {}
): string {
  const payload: SavedCanvasPayload = {
    elements,
    canvasSize,
    customCSS,
  };

  if (options.documentId) {
    payload.contentDocument = canvasElementsToBackyContentDocument({
      id: options.documentId,
      kind: options.kind || 'page',
      title: options.title,
      slug: options.slug,
      status: options.status,
      locale: options.locale || 'en',
      version: options.version,
      elements,
      canvasSize,
      customCSS,
    });
  }

  return JSON.stringify(payload);
}

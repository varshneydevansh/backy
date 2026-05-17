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
    id: 'interactive-figure-rounds',
    type: 'interactiveFigure',
    name: 'Self-correction figure',
    icon: 'Sparkles',
    category: 'advanced',
    defaultProps: {
      componentKey: 'backy.figure.rounds',
      version: '1.0.0',
      title: 'Self-correction at work',
      fallbackText: 'A static fallback for the communication-rounds interactive figure.',
      fallback: {
        title: 'Self-correction at work',
        text: 'Interactive figure showing how outputs improve across communication rounds.',
        ariaLabel: 'Self-correction across communication rounds figure',
      },
      controls: [
        {
          key: 'rounds',
          label: 'Rounds',
          type: 'range',
          min: 1,
          max: 12,
          step: 1,
          defaultValue: 4,
        },
        {
          key: 'speed',
          label: 'Speed',
          type: 'select',
          options: ['slow', 'normal', 'fast'],
          defaultValue: 'normal',
        },
      ],
      renderCapabilities: {
        hydrationMode: 'trusted-component',
        fallbackRequired: true,
        postMessageProtocol: 'backy.interactive-component.v1',
      },
    },
    defaultSize: { width: 640, height: 360 },
    defaultStyles: {
      backgroundColor: '#f8fafc',
      borderColor: '#cbd5e1',
      borderWidth: 1,
      borderStyle: 'solid',
      borderRadius: 8,
    },
    description: 'Registry-backed figure with controls, data bindings, and a static fallback',
  },
  {
    id: 'interactive-figure-stepper',
    type: 'interactiveFigure',
    name: 'Step diagram',
    icon: 'List',
    category: 'advanced',
    defaultProps: {
      componentKey: 'backy.figure.stepper',
      version: '1.0.0',
      title: 'Process walkthrough',
      fallbackText: 'A static fallback for the step-through interactive diagram.',
      steps: [
        { label: 'Start', text: 'Initial state.' },
        { label: 'Refine', text: 'The system updates from feedback or data.' },
        { label: 'Compare', text: 'The audience can inspect the changed state.' },
        { label: 'Result', text: 'The final state is ready to publish.' },
      ],
      fallback: {
        title: 'Process walkthrough',
        text: 'Step-through diagram showing the main states of the process.',
        ariaLabel: 'Step-through process diagram',
      },
      controls: [
        {
          key: 'steps',
          label: 'Steps',
          type: 'range',
          min: 2,
          max: 10,
          step: 1,
          defaultValue: 4,
        },
        {
          key: 'mode',
          label: 'Mode',
          type: 'select',
          options: ['click', 'scroll', 'auto'],
          defaultValue: 'click',
        },
      ],
      renderCapabilities: {
        hydrationMode: 'trusted-component',
        fallbackRequired: true,
        postMessageProtocol: 'backy.interactive-component.v1',
      },
    },
    defaultSize: { width: 640, height: 360 },
    defaultStyles: {
      backgroundColor: '#ffffff',
      borderColor: '#94a3b8',
      borderWidth: 1,
      borderStyle: 'solid',
      borderRadius: 8,
    },
    description: 'Step-controlled figure for process diagrams, simulations, and blog explainers',
  },
  {
    id: 'interactive-figure-line-chart',
    type: 'interactiveFigure',
    name: 'Line chart figure',
    icon: 'Sparkles',
    category: 'advanced',
    defaultProps: {
      componentKey: 'backy.chart.line',
      version: '1.0.0',
      title: 'Metric over time',
      series: [],
      fallbackText: 'A static fallback summary for the data-bound line chart.',
      fallback: {
        title: 'Metric over time',
        text: 'Line chart showing a trend over time. Bind collection data from the Data panel.',
        ariaLabel: 'Line chart figure',
      },
      controls: [
        {
          key: 'series',
          label: 'Series',
          type: 'select',
          options: [],
          required: true,
        },
      ],
      renderCapabilities: {
        hydrationMode: 'trusted-component',
        fallbackRequired: true,
        postMessageProtocol: 'backy.interactive-component.v1',
      },
    },
    defaultSize: { width: 640, height: 360 },
    defaultStyles: {
      backgroundColor: '#f8fafc',
      borderColor: '#cbd5e1',
      borderWidth: 1,
      borderStyle: 'solid',
      borderRadius: 8,
    },
    description: 'Data-bound line chart figure with collection bindings and fallback content',
  },
  {
    id: 'interactive-figure-timeline',
    type: 'interactiveFigure',
    name: 'Timeline figure',
    icon: 'List',
    category: 'advanced',
    defaultProps: {
      componentKey: 'backy.figure.timeline',
      version: '1.0.0',
      title: 'Milestone timeline',
      fallbackText: 'Static timeline summary for readers without interactive support.',
      fallback: {
        title: 'Milestone timeline',
        text: 'Timeline figure showing milestones, phases, or version history.',
        ariaLabel: 'Interactive timeline figure',
      },
      controls: [
        {
          key: 'density',
          label: 'Density',
          type: 'select',
          options: ['compact', 'comfortable', 'detailed'],
          defaultValue: 'comfortable',
        },
        {
          key: 'focusIndex',
          label: 'Focus milestone',
          type: 'range',
          min: 0,
          max: 8,
          step: 1,
          defaultValue: 0,
        },
      ],
      renderCapabilities: {
        hydrationMode: 'trusted-component',
        fallbackRequired: true,
        postMessageProtocol: 'backy.interactive-component.v1',
      },
    },
    defaultSize: { width: 720, height: 360 },
    defaultStyles: {
      backgroundColor: '#ffffff',
      borderColor: '#cbd5e1',
      borderWidth: 1,
      borderStyle: 'solid',
      borderRadius: 8,
    },
    description: 'Interactive timeline for milestones, research phases, releases, and article narratives',
  },
  {
    id: 'interactive-simulation-parameter',
    type: 'interactiveFigure',
    name: 'Simulation controls',
    icon: 'Sparkles',
    category: 'advanced',
    defaultProps: {
      componentKey: 'backy.simulation.parameter',
      version: '1.0.0',
      title: 'Parameter simulation',
      fallbackText: 'Static simulation summary with default parameter values.',
      fallback: {
        title: 'Parameter simulation',
        text: 'Simulation figure with adjustable parameters and a crawlable fallback.',
        ariaLabel: 'Interactive parameter simulation',
      },
      controls: [
        {
          key: 'parameterA',
          label: 'Parameter A',
          type: 'range',
          min: 0,
          max: 100,
          step: 1,
          defaultValue: 50,
        },
        {
          key: 'scenario',
          label: 'Scenario',
          type: 'select',
          options: ['baseline', 'optimistic', 'stress'],
          defaultValue: 'baseline',
        },
      ],
      renderCapabilities: {
        hydrationMode: 'trusted-component',
        fallbackRequired: true,
        postMessageProtocol: 'backy.interactive-component.v1',
      },
    },
    defaultSize: { width: 720, height: 420 },
    defaultStyles: {
      backgroundColor: '#f8fafc',
      borderColor: '#94a3b8',
      borderWidth: 1,
      borderStyle: 'solid',
      borderRadius: 8,
    },
    description: 'Parameter-driven simulation block for explainers, calculators, and what-if figures',
  },
  {
    id: 'interactive-data-explorer',
    type: 'interactiveFigure',
    name: 'Data explorer',
    icon: 'LayoutGrid',
    category: 'advanced',
    defaultProps: {
      componentKey: 'backy.data.explorer',
      version: '1.0.0',
      title: 'Data explorer',
      fallbackText: 'Static summary of the selected dataset and filters.',
      fallback: {
        title: 'Data explorer',
        text: 'Interactive data explorer with filters, grouping, and collection bindings.',
        ariaLabel: 'Interactive data explorer',
      },
      controls: [
        {
          key: 'view',
          label: 'View',
          type: 'select',
          options: ['table', 'cards', 'chart'],
          defaultValue: 'table',
        },
        {
          key: 'showFilters',
          label: 'Show filters',
          type: 'toggle',
          defaultValue: true,
        },
      ],
      renderCapabilities: {
        hydrationMode: 'trusted-component',
        fallbackRequired: true,
        postMessageProtocol: 'backy.interactive-component.v1',
      },
    },
    defaultSize: { width: 760, height: 460 },
    defaultStyles: {
      backgroundColor: '#ffffff',
      borderColor: '#cbd5e1',
      borderWidth: 1,
      borderStyle: 'solid',
      borderRadius: 8,
    },
    description: 'Filterable data-exploration block for collection-backed tables, cards, and charts',
  },
  {
    id: 'sandboxed-canvas-animation',
    type: 'codeComponent',
    name: 'Canvas animation',
    icon: 'Code',
    category: 'advanced',
    defaultProps: {
      componentKey: 'backy.canvas.sandboxed',
      version: '1.0.0',
      title: 'Sandboxed canvas animation',
      sandboxUrl: '',
      fallbackText: 'Static fallback for the sandboxed canvas/WebGL animation.',
      fallback: {
        title: 'Sandboxed canvas animation',
        text: 'Custom canvas or WebGL-style animation mounted through Backy sandbox runtime.',
        ariaLabel: 'Sandboxed canvas animation',
      },
      controls: [
        {
          key: 'playback',
          label: 'Playback',
          type: 'select',
          options: ['manual', 'auto', 'scroll'],
          defaultValue: 'manual',
        },
        {
          key: 'intensity',
          label: 'Intensity',
          type: 'range',
          min: 0,
          max: 100,
          step: 5,
          defaultValue: 50,
        },
      ],
      renderCapabilities: {
        hydrationMode: 'sandbox-iframe',
        requiresSandbox: true,
        requiresSignedBundle: true,
        fallbackRequired: true,
        allowedPermissions: [],
        allowedConnectSrc: ["'self'"],
        postMessageProtocol: 'backy.interactive-component.v1',
      },
    },
    defaultSize: { width: 720, height: 420 },
    defaultStyles: {
      backgroundColor: '#0b1120',
      color: '#f8fafc',
      borderColor: '#334155',
      borderWidth: 1,
      borderStyle: 'solid',
      borderRadius: 8,
    },
    description: 'Sandboxed custom animation placeholder for canvas, WebGL-style, and advanced code figures',
  },
  {
    id: 'sandboxed-code-component',
    type: 'codeComponent',
    name: 'Code component',
    icon: 'Code',
    category: 'advanced',
    defaultProps: {
      componentKey: 'backy.custom.sandboxed',
      version: '1.0.0',
      title: 'Sandboxed component',
      sandboxUrl: '',
      fallbackText: 'This custom component needs a configured sandbox runtime to hydrate.',
      fallback: {
        title: 'Sandboxed component',
        text: 'Static fallback shown until the signed sandboxed component bundle is available.',
        ariaLabel: 'Sandboxed custom code component',
      },
      renderCapabilities: {
        hydrationMode: 'sandbox-iframe',
        requiresSandbox: true,
        requiresSignedBundle: true,
        fallbackRequired: true,
        allowedPermissions: [],
        allowedConnectSrc: ["'self'"],
        postMessageProtocol: 'backy.interactive-component.v1',
      },
    },
    defaultSize: { width: 640, height: 360 },
    defaultStyles: {
      backgroundColor: '#111827',
      color: '#f9fafb',
      borderColor: '#374151',
      borderWidth: 1,
      borderStyle: 'solid',
      borderRadius: 8,
    },
    description: 'Sandboxed iframe component placeholder with required fallback content',
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
    type: 'html',
    name: 'HTML',
    icon: 'Code',
    category: 'advanced',
    defaultProps: {
      html: '<div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">Custom HTML</div>',
      title: 'Custom HTML preview',
      backgroundColor: '#ffffff',
      borderRadius: 8,
    },
    defaultSize: { width: 360, height: 180 },
    description: 'Sandboxed custom HTML block',
  },
  {
    type: 'table',
    name: 'Table',
    icon: 'LayoutGrid',
    category: 'advanced',
    defaultProps: {
      html: '<table style="width: 100%; border-collapse: collapse;"><thead><tr><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Name</th><th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Value</th></tr></thead><tbody><tr><td style="border: 1px solid #e5e7eb; padding: 8px;">Starter</td><td style="border: 1px solid #e5e7eb; padding: 8px;">Included</td></tr></tbody></table>',
      title: 'Table preview',
      backgroundColor: '#ffffff',
      borderRadius: 8,
    },
    defaultSize: { width: 420, height: 220 },
    description: 'Editable HTML table block',
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
    type: 'repeater',
    name: 'Repeater',
    icon: 'Database',
    category: 'advanced',
    defaultProps: {
      columns: 3,
      gap: 16,
      titleField: 'title',
      descriptionField: 'summary',
      limit: 6,
      emptyMessage: 'No records yet.',
    },
    defaultSize: { width: 680, height: 320 },
    description: 'Collection-backed grid',
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
      rootIndex?: number;
      sourceElementId?: string;
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
    reusableMeta: reusableMeta
      ? {
          ...reusableMeta,
          rootIndex: index,
          sourceElementId: typeof element.id === 'string' ? element.id : undefined,
        }
      : undefined,
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

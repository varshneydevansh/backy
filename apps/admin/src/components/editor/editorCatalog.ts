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
  ResponsiveElementOverride,
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
  customJS?: string;
  themeTokenRefs?: BackyContentDocument['themeTokenRefs'];
  assets?: BackyContentDocument['assets'];
  interactions?: BackyContentDocument['interactions'];
  seo?: BackyContentDocument['seo'];
  dataBindings?: BackyContentDocument['dataBindings'];
  editableMap?: BackyContentDocument['editableMap'];
  metadata?: BackyContentDocument['metadata'];
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
  customJS?: string;
  themeTokenRefs?: BackyContentDocument['themeTokenRefs'];
  assets?: BackyContentDocument['assets'];
  interactions?: BackyContentDocument['interactions'];
  seo?: BackyContentDocument['seo'];
  dataBindings?: BackyContentDocument['dataBindings'];
  editableMap?: BackyContentDocument['editableMap'];
  metadata?: BackyContentDocument['metadata'];
}

export interface FrontendTemplateDesignSerialization {
  customCSS?: string;
  options: Pick<
    SerializeCanvasContentOptions,
    'customJS' | 'themeTokenRefs' | 'assets' | 'interactions' | 'seo' | 'dataBindings' | 'editableMap' | 'metadata'
  >;
  provenance: {
    customCSS?: string;
    customJS?: string;
    contentDocument?: Record<string, unknown>;
    elements?: unknown[];
    canvasSize?: Record<string, unknown>;
    themeTokenRefs?: Record<string, unknown>;
    assets?: Array<Record<string, unknown>> | Record<string, unknown>;
    animations?: Array<Record<string, unknown>> | Record<string, unknown>;
    interactions?: Array<Record<string, unknown>> | Record<string, unknown>;
    dataBindings?: Record<string, unknown>;
    editableMap?: Record<string, unknown>;
    seo?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
}

const cloneDefaultProps = (value: Record<string, unknown>): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value));

const cloneDefaultStyles = (value?: CSSProperties): CSSProperties | undefined =>
  value ? JSON.parse(JSON.stringify(value)) as CSSProperties : undefined;

const cloneDefaultResponsive = (value?: CanvasElement['responsive']): CanvasElement['responsive'] | undefined =>
  value ? JSON.parse(JSON.stringify(value)) as CanvasElement['responsive'] : undefined;

const cloneDefaultBindingSlots = (value?: CanvasElement['bindingSlots']): CanvasElement['bindingSlots'] | undefined =>
  value ? JSON.parse(JSON.stringify(value)) as CanvasElement['bindingSlots'] : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const cloneUnknownRecord = <T = Record<string, unknown>>(value: unknown): T | undefined =>
  isRecord(value) ? JSON.parse(JSON.stringify(value)) as T : undefined;

const cloneUnknownArray = <T>(value: unknown): T[] | undefined =>
  Array.isArray(value) ? JSON.parse(JSON.stringify(value)) as T[] : undefined;

const firstTemplateString = (...values: unknown[]): string | undefined => {
  const value = values.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return typeof value === 'string' ? value : undefined;
};

const firstTemplateRecord = <T = Record<string, unknown>>(...values: unknown[]): T | undefined => {
  for (const value of values) {
    const record = cloneUnknownRecord<Record<string, unknown>>(value);
    if (record && Object.keys(record).length > 0) {
      return record as T;
    }
  }
  return undefined;
};

const templateProvenanceArrayOrRecord = (
  value: unknown,
): Array<Record<string, unknown>> | Record<string, unknown> | undefined => {
  const array = cloneUnknownArray<Record<string, unknown>>(value);
  if (array) {
    const records = array.filter(isRecord);
    return records.length > 0 ? records : undefined;
  }

  const record = cloneUnknownRecord<Record<string, unknown>>(value);
  return record && Object.keys(record).length > 0 ? record : undefined;
};

const RESPONSIVE_DEFAULT_BREAKPOINTS = ['desktop', 'tablet', 'mobile'] as const satisfies readonly EditorBreakpoint[];

const mergeUnknownRecord = (
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  if (!base && !override) {
    return undefined;
  }
  return {
    ...(base || {}),
    ...(override || {}),
  };
};

const mergeStringRecord = (
  base?: Record<string, string>,
  override?: Record<string, string>,
): Record<string, string> | undefined => {
  if (!base && !override) {
    return undefined;
  }
  return {
    ...(base || {}),
    ...(override || {}),
  };
};

const mergeCssProperties = (base?: CSSProperties, override?: CSSProperties): CSSProperties | undefined => {
  if (!base && !override) {
    return undefined;
  }
  return {
    ...(base || {}),
    ...(override || {}),
  };
};

const mergeResponsiveOverride = (
  base?: ResponsiveElementOverride,
  override?: ResponsiveElementOverride,
): ResponsiveElementOverride | undefined => {
  if (!base && !override) {
    return undefined;
  }
  const merged: ResponsiveElementOverride = {
    ...(base || {}),
    ...(override || {}),
  };
  const props = mergeUnknownRecord(base?.props, override?.props);
  const styles = mergeCssProperties(base?.styles, override?.styles);
  const tokenRefs = mergeStringRecord(base?.tokenRefs, override?.tokenRefs);
  if (props) {
    merged.props = props;
  }
  if (styles) {
    merged.styles = styles;
  }
  if (tokenRefs) {
    merged.tokenRefs = tokenRefs;
  }
  return merged;
};

const mergeResponsiveDefaults = (
  base?: CanvasElement['responsive'],
  override?: CanvasElement['responsive'],
): CanvasElement['responsive'] | undefined => {
  const baseClone = cloneDefaultResponsive(base);
  const overrideClone = cloneDefaultResponsive(override);
  if (!baseClone && !overrideClone) {
    return undefined;
  }
  return RESPONSIVE_DEFAULT_BREAKPOINTS.reduce<CanvasElement['responsive']>((acc, breakpoint) => {
    const merged = mergeResponsiveOverride(baseClone?.[breakpoint], overrideClone?.[breakpoint]);
    if (merged) {
      acc = acc || {};
      acc[breakpoint] = merged;
    }
    return acc;
  }, undefined);
};

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
    defaultResponsive: {
      tablet: { width: 300, height: 58, props: { fontSize: 30 } },
      mobile: { width: 335, height: 72, props: { fontSize: 28, lineHeight: 1.15 } },
    },
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
    defaultResponsive: {
      tablet: { width: 300, height: 86 },
      mobile: { width: 335, height: 104, props: { fontSize: 15 } },
    },
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
    defaultResponsive: {
      tablet: { width: 150, height: 48 },
      mobile: { width: 160, height: 48 },
    },
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
    defaultResponsive: {
      tablet: { width: 300, height: 200 },
      mobile: { width: 335, height: 220 },
    },
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
    defaultResponsive: {
      tablet: { width: 380, height: 214 },
      mobile: { width: 335, height: 188 },
    },
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
    defaultResponsive: {
      tablet: { width: 560, height: 320 },
      mobile: { width: 335, height: 280 },
    },
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
    defaultResponsive: {
      tablet: { width: 560, height: 320 },
      mobile: { width: 335, height: 300 },
    },
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
    defaultResponsive: {
      tablet: { width: 560, height: 320 },
      mobile: { width: 335, height: 300 },
    },
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
    defaultResponsive: {
      tablet: { width: 640, height: 340 },
      mobile: { width: 335, height: 320 },
    },
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
    defaultResponsive: {
      tablet: { width: 640, height: 380 },
      mobile: { width: 335, height: 390 },
    },
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
    defaultResponsive: {
      tablet: { width: 680, height: 420 },
      mobile: { width: 335, height: 420 },
    },
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
        {
          key: 'accentColor',
          label: 'Accent color',
          type: 'color',
          defaultValue: '#38bdf8',
        },
        {
          key: 'caption',
          label: 'Fallback caption',
          type: 'textarea',
          defaultValue: 'Animated canvas module with a static accessible fallback.',
        },
        {
          key: 'runtimeConfig',
          label: 'Runtime config',
          type: 'json',
          defaultValue: {
            reducedMotionFallback: true,
            frameBudget: 60,
          },
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
    defaultResponsive: {
      tablet: { width: 640, height: 380 },
      mobile: { width: 335, height: 360 },
    },
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
    defaultResponsive: {
      tablet: { width: 560, height: 320 },
      mobile: { width: 335, height: 300 },
    },
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
    defaultResponsive: {
      tablet: { width: 240, height: 200 },
      mobile: { width: 335, height: 200 },
    },
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
    defaultResponsive: {
      tablet: { width: 768, height: 300 },
      mobile: { width: 375, height: 340 },
    },
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
    defaultResponsive: {
      tablet: { width: 768, height: 620 },
      mobile: { width: 375, height: 700 },
    },
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
        responsive: {
          tablet: { x: 40, y: 58, width: 365, height: 118, props: { fontSize: 38, lineHeight: 1.12 } },
          mobile: { x: 20, y: 42, width: 335, height: 132, props: { fontSize: 32, lineHeight: 1.12 } },
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
        responsive: {
          tablet: { x: 42, y: 196, width: 350, height: 100, props: { fontSize: 16 } },
          mobile: { x: 20, y: 192, width: 335, height: 112, props: { fontSize: 15, lineHeight: 1.5 } },
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
        responsive: {
          tablet: { x: 42, y: 320, width: 160, height: 48 },
          mobile: { x: 20, y: 328, width: 156, height: 46, props: { fontSize: 15 } },
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
        responsive: {
          tablet: { x: 430, y: 70, width: 285, height: 310 },
          mobile: { x: 20, y: 420, width: 335, height: 230 },
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
            responsive: {
              tablet: { x: 16, y: 16, width: 253, height: 166 },
              mobile: { x: 16, y: 16, width: 303, height: 132 },
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
            responsive: {
              tablet: { x: 18, y: 202, width: 225, height: 46, props: { fontSize: 16 } },
              mobile: { x: 18, y: 166, width: 260, height: 42, props: { fontSize: 16 } },
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
    defaultResponsive: {
      tablet: { width: 768, height: 650 },
      mobile: { width: 375, height: 850 },
    },
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
        responsive: {
          tablet: { x: 40, y: 48, width: 520, height: 70, props: { fontSize: 32 } },
          mobile: { x: 20, y: 42, width: 335, height: 88, props: { fontSize: 29, lineHeight: 1.15 } },
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
        responsive: {
          tablet: { x: 42, y: 132, width: 590, height: 56 },
          mobile: { x: 20, y: 148, width: 335, height: 84, props: { fontSize: 15 } },
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
        responsive: {
          tablet: {
            x: index === 1 ? 408 : 40,
            y: index === 2 ? 440 : 230,
            width: 320,
            height: 170,
          },
          mobile: {
            x: 20,
            y: 270 + index * 180,
            width: 335,
            height: 156,
          },
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
            responsive: {
              tablet: { x: 20, y: 22, width: 260, height: 38 },
              mobile: { x: 18, y: 20, width: 290, height: 36, props: { fontSize: 20 } },
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
            responsive: {
              tablet: { x: 20, y: 76, width: 260, height: 70 },
              mobile: { x: 18, y: 68, width: 295, height: 66, props: { fontSize: 13 } },
            },
          },
        ],
      })),
    ],
  },
  {
    id: 'blog-post-card',
    type: 'box',
    name: 'Blog post card',
    icon: 'BookmarkPlus',
    category: 'content',
    defaultProps: {
      backgroundColor: '#ffffff',
      borderRadius: 8,
      borderColor: '#dbe3ee',
      borderWidth: 1,
      borderStyle: 'solid',
      boxShadow: '0 14px 34px rgba(15, 23, 42, 0.08)',
      contentRole: 'blog-post-card',
    },
    defaultSize: { width: 360, height: 430 },
    defaultResponsive: {
      tablet: { width: 340, height: 430 },
      mobile: { width: 335, height: 452 },
    },
    defaultBindingSlots: [
      {
        id: 'post-card-record',
        label: 'Blog post record',
        sourceKind: 'blog',
        fieldKey: 'record',
        targetPath: 'children',
        mode: 'json',
        required: true,
        description: 'Connect this card to a blog post or collection record before publishing.',
      },
    ],
    description: 'Reusable article card with media, taxonomy, excerpt, and read-more link',
    defaultChildren: [
      {
        type: 'image',
        x: 18,
        y: 18,
        width: 324,
        height: 172,
        props: {
          src: '/placeholder-image.jpg',
          alt: 'Article cover image',
          objectFit: 'cover',
          borderRadius: 6,
        },
        bindingSlots: [
          {
            id: 'post-card-featured-image',
            label: 'Featured image',
            sourceKind: 'blog',
            fieldKey: 'featuredImage',
            targetPath: 'props.src',
            mode: 'image',
          },
          {
            id: 'post-card-featured-image-alt',
            label: 'Image alt text',
            sourceKind: 'blog',
            fieldKey: 'title',
            targetPath: 'props.alt',
            mode: 'text',
          },
        ],
        responsive: {
          tablet: { x: 16, y: 16, width: 308, height: 166 },
          mobile: { x: 16, y: 16, width: 303, height: 162 },
        },
      },
      {
        type: 'text',
        x: 20,
        y: 210,
        width: 310,
        height: 24,
        props: {
          content: 'Guides / 5 min read',
          fontSize: 12,
          fontWeight: '700',
          color: '#2563eb',
          textTransform: 'uppercase',
        },
        bindingSlots: [
          {
            id: 'post-card-meta',
            label: 'Category and reading time',
            sourceKind: 'blog',
            fieldKey: 'category',
            targetPath: 'props.content',
            mode: 'text',
          },
        ],
        responsive: {
          tablet: { x: 18, y: 202, width: 296, height: 24 },
          mobile: { x: 18, y: 198, width: 292, height: 24 },
        },
      },
      {
        type: 'heading',
        x: 20,
        y: 244,
        width: 312,
        height: 66,
        props: {
          content: 'How to launch a useful website backend',
          level: 'h3',
          fontSize: 23,
          lineHeight: 1.16,
          fontWeight: '800',
          color: '#111827',
        },
        bindingSlots: [
          {
            id: 'post-card-title',
            label: 'Post title',
            sourceKind: 'blog',
            fieldKey: 'title',
            targetPath: 'props.content',
            mode: 'text',
            required: true,
          },
        ],
        responsive: {
          tablet: { x: 18, y: 236, width: 292, height: 68, props: { fontSize: 22 } },
          mobile: { x: 18, y: 232, width: 292, height: 76, props: { fontSize: 22, lineHeight: 1.18 } },
        },
      },
      {
        type: 'paragraph',
        x: 20,
        y: 322,
        width: 312,
        height: 52,
        props: {
          content: 'Connect this card to a post or collection record, then reuse it across archive and related-content sections.',
          fontSize: 14,
          lineHeight: 1.45,
          color: '#475569',
        },
        bindingSlots: [
          {
            id: 'post-card-excerpt',
            label: 'Post excerpt',
            sourceKind: 'blog',
            fieldKey: 'excerpt',
            targetPath: 'props.content',
            mode: 'text',
          },
        ],
        responsive: {
          tablet: { x: 18, y: 316, width: 292, height: 54 },
          mobile: { x: 18, y: 320, width: 292, height: 62 },
        },
      },
      {
        type: 'link',
        x: 20,
        y: 388,
        width: 132,
        height: 24,
        props: {
          content: 'Read article',
          href: '#',
          color: '#1d4ed8',
          fontSize: 14,
          fontWeight: '700',
          underline: false,
        },
        bindingSlots: [
          {
            id: 'post-card-url',
            label: 'Post URL',
            sourceKind: 'blog',
            fieldKey: 'slug',
            targetPath: 'props.href',
            mode: 'url',
          },
        ],
        responsive: {
          tablet: { x: 18, y: 386, width: 132, height: 24 },
          mobile: { x: 18, y: 404, width: 132, height: 24 },
        },
      },
    ],
  },
  {
    id: 'latest-posts-section',
    type: 'section',
    name: 'Latest posts',
    icon: 'LayoutGrid',
    category: 'content',
    defaultProps: {
      backgroundColor: '#f8fafc',
      borderRadius: 0,
      padding: 0,
      contentRole: 'latest-posts',
    },
    defaultSize: { width: 1200, height: 610 },
    defaultResponsive: {
      tablet: { width: 768, height: 690 },
      mobile: { width: 375, height: 870 },
    },
    defaultBindingSlots: [
      {
        id: 'latest-posts-records',
        label: 'Latest posts collection',
        sourceKind: 'blog',
        fieldKey: 'records',
        targetPath: 'children.Latest post repeater.props.collectionId',
        mode: 'json',
        required: true,
        description: 'Connect the repeater to the posts collection in the Data panel.',
      },
    ],
    description: 'Blog archive section with editable intro copy and a collection-ready repeater',
    defaultChildren: [
      {
        type: 'heading',
        x: 72,
        y: 56,
        width: 520,
        height: 54,
        props: {
          content: 'Latest posts',
          level: 'h2',
          fontSize: 38,
          fontWeight: '800',
          color: '#0f172a',
        },
        responsive: {
          tablet: { x: 40, y: 48, width: 520, height: 54 },
          mobile: { x: 20, y: 36, width: 335, height: 48, props: { fontSize: 31 } },
        },
      },
      {
        type: 'paragraph',
        x: 74,
        y: 122,
        width: 610,
        height: 50,
        props: {
          content: 'A ready archive block for publishing recent articles, guides, and updates from Backy-managed content.',
          fontSize: 16,
          lineHeight: 1.5,
          color: '#475569',
        },
        responsive: {
          tablet: { x: 42, y: 112, width: 600, height: 52 },
          mobile: { x: 20, y: 96, width: 335, height: 72, props: { fontSize: 15 } },
        },
      },
      {
        type: 'repeater',
        name: 'Latest post repeater',
        x: 72,
        y: 210,
        width: 1056,
        height: 315,
        props: {
          datasetId: 'dataset_latest_posts',
          collectionId: '',
          titleField: 'title',
          descriptionField: 'excerpt',
          imageField: 'featuredImage',
          metaField: 'category',
          limit: 3,
          columns: 3,
          gap: 18,
          sortBy: 'publishedAt',
          sortDirection: 'desc',
          emptyMessage: 'Connect a posts collection in the Data panel.',
          backgroundColor: '#f8fafc',
          borderRadius: 8,
          padding: 0,
        },
        bindingSlots: [
          {
            id: 'latest-posts-repeater-records',
            label: 'Posts collection',
            sourceKind: 'blog',
            fieldKey: 'records',
            targetPath: 'props.collectionId',
            mode: 'json',
            required: true,
          },
          {
            id: 'latest-posts-title-field',
            label: 'Post title field',
            sourceKind: 'blog',
            fieldKey: 'title',
            targetPath: 'props.titleField',
            mode: 'text',
          },
          {
            id: 'latest-posts-category-field',
            label: 'Post category field',
            sourceKind: 'blog',
            fieldKey: 'category',
            targetPath: 'props.metaField',
            mode: 'text',
          },
          {
            id: 'latest-posts-excerpt-field',
            label: 'Post excerpt field',
            sourceKind: 'blog',
            fieldKey: 'excerpt',
            targetPath: 'props.descriptionField',
            mode: 'text',
          },
          {
            id: 'latest-posts-image-field',
            label: 'Featured image field',
            sourceKind: 'blog',
            fieldKey: 'featuredImage',
            targetPath: 'props.imageField',
            mode: 'image',
          },
        ],
        responsive: {
          tablet: { x: 40, y: 205, width: 688, height: 340, props: { columns: 2, limit: 4, gap: 16 } },
          mobile: { x: 20, y: 205, width: 335, height: 520, props: { columns: 1, limit: 3, gap: 14 } },
        },
      },
      {
        type: 'link',
        x: 74,
        y: 552,
        width: 138,
        height: 26,
        props: {
          content: 'View all posts',
          href: '/blog',
          color: '#1d4ed8',
          fontSize: 15,
          fontWeight: '700',
          underline: false,
        },
        responsive: {
          tablet: { x: 42, y: 580, width: 138, height: 26 },
          mobile: { x: 20, y: 770, width: 138, height: 26 },
        },
      },
    ],
  },
  {
    id: 'category-list-section',
    type: 'section',
    name: 'Category list',
    icon: 'List',
    category: 'content',
    defaultProps: {
      backgroundColor: '#ffffff',
      borderRadius: 0,
      padding: 0,
      contentRole: 'category-list',
    },
    defaultSize: { width: 1200, height: 370 },
    defaultResponsive: {
      tablet: { width: 768, height: 500 },
      mobile: { width: 375, height: 665 },
    },
    defaultBindingSlots: [
      {
        id: 'category-list-taxonomy',
        label: 'Taxonomy collection',
        sourceKind: 'taxonomy',
        fieldKey: 'categories',
        targetPath: 'children.Category repeater.props.collectionId',
        mode: 'json',
        description: 'Connect the category repeater to blog, help, product, or resource taxonomy data.',
      },
    ],
    description: 'Editable taxonomy navigation block for blog, help, product, or resource hubs',
    defaultChildren: [
      {
        type: 'heading',
        x: 72,
        y: 54,
        width: 430,
        height: 50,
        props: {
          content: 'Browse by category',
          level: 'h2',
          fontSize: 34,
          fontWeight: '800',
          color: '#111827',
        },
        responsive: {
          tablet: { x: 40, y: 46, width: 430, height: 50 },
          mobile: { x: 20, y: 36, width: 335, height: 46, props: { fontSize: 30 } },
        },
      },
      {
        type: 'paragraph',
        x: 74,
        y: 116,
        width: 510,
        height: 48,
        props: {
          content: 'Use this as a taxonomy hub, then bind labels and counts to collections or blog taxonomy data.',
          fontSize: 16,
          lineHeight: 1.5,
          color: '#4b5563',
        },
        responsive: {
          tablet: { x: 42, y: 106, width: 560, height: 48 },
          mobile: { x: 20, y: 94, width: 335, height: 68, props: { fontSize: 15 } },
        },
      },
      {
        type: 'repeater',
        name: 'Category repeater',
        x: 72,
        y: 205,
        width: 1056,
        height: 120,
        props: {
          datasetId: 'dataset_category_list',
          collectionId: '',
          titleField: 'name',
          descriptionField: 'description',
          limit: 6,
          columns: 3,
          gap: 18,
          emptyMessage: 'Connect a taxonomy collection in the Data panel.',
          backgroundColor: '#ffffff',
          borderRadius: 8,
          padding: 0,
          contentRole: 'category-list-repeater',
        },
        bindingSlots: [
          {
            id: 'category-list-repeater-records',
            label: 'Categories collection',
            sourceKind: 'taxonomy',
            fieldKey: 'categories',
            targetPath: 'props.collectionId',
            mode: 'json',
            required: true,
          },
          {
            id: 'category-list-title-field',
            label: 'Category title field',
            sourceKind: 'taxonomy',
            fieldKey: 'name',
            targetPath: 'props.titleField',
            mode: 'text',
          },
          {
            id: 'category-list-description-field',
            label: 'Category description field',
            sourceKind: 'taxonomy',
            fieldKey: 'description',
            targetPath: 'props.descriptionField',
            mode: 'text',
          },
        ],
        responsive: {
          tablet: { x: 40, y: 205, width: 688, height: 250, props: { columns: 2, limit: 6, gap: 16 } },
          mobile: { x: 20, y: 198, width: 335, height: 410, props: { columns: 1, limit: 6, gap: 14 } },
        },
      },
    ],
  },
  {
    id: 'related-content-section',
    type: 'section',
    name: 'Related content',
    icon: 'BookmarkPlus',
    category: 'content',
    defaultProps: {
      backgroundColor: '#0f172a',
      borderRadius: 0,
      padding: 0,
      contentRole: 'related-content',
    },
    defaultSize: { width: 1200, height: 510 },
    defaultResponsive: {
      tablet: { width: 768, height: 680 },
      mobile: { width: 375, height: 950 },
    },
    defaultBindingSlots: [
      {
        id: 'related-content-records',
        label: 'Related content records',
        sourceKind: 'blog',
        fieldKey: 'relatedPosts',
        targetPath: 'children.Related content repeater.props.collectionId',
        mode: 'json',
        description: 'Connect the related-content repeater to related posts, docs, or resource records.',
      },
    ],
    description: 'Post-detail section for related articles, next reads, or product education',
    defaultChildren: [
      {
        type: 'heading',
        x: 72,
        y: 58,
        width: 510,
        height: 54,
        props: {
          content: 'Keep reading',
          level: 'h2',
          fontSize: 36,
          fontWeight: '800',
          color: '#ffffff',
        },
        responsive: {
          tablet: { x: 40, y: 50, width: 510, height: 54 },
          mobile: { x: 20, y: 38, width: 335, height: 48, props: { fontSize: 31 } },
        },
      },
      {
        type: 'paragraph',
        x: 74,
        y: 122,
        width: 590,
        height: 48,
        props: {
          content: 'Drop this under articles, docs, and help pages to guide visitors into the next useful piece of content.',
          fontSize: 16,
          lineHeight: 1.5,
          color: '#cbd5e1',
        },
        responsive: {
          tablet: { x: 42, y: 114, width: 600, height: 50 },
          mobile: { x: 20, y: 98, width: 335, height: 72, props: { fontSize: 15 } },
        },
      },
      {
        type: 'repeater',
        name: 'Related content repeater',
        x: 72,
        y: 220,
        width: 1056,
        height: 230,
        props: {
          datasetId: 'dataset_related_content',
          collectionId: '',
          titleField: 'title',
          descriptionField: 'excerpt',
          imageField: 'featuredImage',
          metaField: 'category',
          limit: 3,
          columns: 3,
          gap: 18,
          sortBy: 'publishedAt',
          sortDirection: 'desc',
          emptyMessage: 'Connect a related content collection in the Data panel.',
          backgroundColor: '#0f172a',
          borderRadius: 8,
          padding: 0,
          contentRole: 'related-content-repeater',
        },
        bindingSlots: [
          {
            id: 'related-content-repeater-records',
            label: 'Related records collection',
            sourceKind: 'blog',
            fieldKey: 'relatedPosts',
            targetPath: 'props.collectionId',
            mode: 'json',
            required: true,
          },
          {
            id: 'related-content-category-field',
            label: 'Related category field',
            sourceKind: 'blog',
            fieldKey: 'category',
            targetPath: 'props.metaField',
            mode: 'text',
          },
          {
            id: 'related-content-title-field',
            label: 'Related title field',
            sourceKind: 'blog',
            fieldKey: 'title',
            targetPath: 'props.titleField',
            mode: 'text',
            required: true,
          },
          {
            id: 'related-content-excerpt-field',
            label: 'Related excerpt field',
            sourceKind: 'blog',
            fieldKey: 'excerpt',
            targetPath: 'props.descriptionField',
            mode: 'text',
          },
          {
            id: 'related-content-image-field',
            label: 'Related image field',
            sourceKind: 'blog',
            fieldKey: 'featuredImage',
            targetPath: 'props.imageField',
            mode: 'image',
          },
        ],
        responsive: {
          tablet: { x: 40, y: 220, width: 688, height: 405, props: { columns: 2, limit: 4, gap: 16 } },
          mobile: { x: 20, y: 212, width: 335, height: 650, props: { columns: 1, limit: 3, gap: 14 } },
        },
      },
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
    defaultResponsive: {
      tablet: { width: 768, height: 126 },
      mobile: { width: 375, height: 150 },
    },
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
    defaultResponsive: {
      tablet: { width: 768, height: 76 },
      mobile: { width: 375, height: 112, props: { gap: 12 } },
    },
    description: 'Navigation container for page menu items',
    defaultChildren: [
      {
        type: 'link',
        name: 'Home link',
        x: 432,
        y: 24,
        width: 86,
        height: 24,
        props: {
          content: 'Home',
          href: '/',
          fontSize: 16,
          fontWeight: '600',
          color: '#111827',
          underline: false,
        },
        styles: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
        },
        responsive: {
          tablet: { x: 224, y: 26, width: 86, height: 24 },
          mobile: { x: 28, y: 30, width: 86, height: 24 },
        },
      },
      {
        type: 'link',
        name: 'About link',
        x: 536,
        y: 24,
        width: 92,
        height: 24,
        props: {
          content: 'About',
          href: '/about',
          fontSize: 16,
          fontWeight: '600',
          color: '#111827',
          underline: false,
        },
        styles: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
        },
        responsive: {
          tablet: { x: 328, y: 26, width: 92, height: 24 },
          mobile: { x: 144, y: 30, width: 92, height: 24 },
        },
      },
      {
        type: 'link',
        name: 'Contact link',
        x: 646,
        y: 24,
        width: 106,
        height: 24,
        props: {
          content: 'Contact',
          href: '/contact',
          fontSize: 16,
          fontWeight: '600',
          color: '#111827',
          underline: false,
        },
        styles: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
        },
        responsive: {
          tablet: { x: 438, y: 26, width: 106, height: 24 },
          mobile: { x: 246, y: 30, width: 106, height: 24 },
        },
      },
    ],
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
    defaultResponsive: {
      tablet: { width: 768, height: 190 },
      mobile: { width: 375, height: 240 },
    },
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
    defaultResponsive: {
      tablet: { width: 300, height: 2 },
      mobile: { width: 335, height: 2 },
    },
    description: 'Horizontal divider line',
  },
  {
    type: 'spacer',
    name: 'Spacer',
    icon: 'Square',
    category: 'layout',
    defaultProps: {},
    defaultSize: { width: 50, height: 50 },
    defaultResponsive: {
      tablet: { width: 50, height: 50 },
      mobile: { width: 50, height: 50 },
    },
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
    defaultResponsive: {
      tablet: { width: 110, height: 24 },
      mobile: { width: 140, height: 28 },
    },
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
    defaultResponsive: {
      tablet: { width: 240, height: 110 },
      mobile: { width: 335, height: 128 },
    },
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
    defaultResponsive: {
      tablet: { width: 320, height: 90 },
      mobile: { width: 335, height: 112, props: { fontSize: 17 } },
    },
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
    defaultResponsive: {
      tablet: { width: 380, height: 280 },
      mobile: { width: 335, height: 260 },
    },
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
    defaultResponsive: {
      tablet: { width: 340, height: 180 },
      mobile: { width: 335, height: 190 },
    },
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
    defaultResponsive: {
      tablet: { width: 380, height: 240 },
      mobile: { width: 335, height: 260 },
    },
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
    defaultResponsive: {
      tablet: { width: 300, height: 220 },
      mobile: { width: 335, height: 250 },
    },
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
    defaultResponsive: {
      tablet: { width: 400, height: 440 },
      mobile: { width: 335, height: 455 },
    },
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
        responsive: {
          tablet: { x: 20, y: 78, width: 340, height: 54 },
          mobile: { x: 18, y: 78, width: 299, height: 56 },
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
        responsive: {
          tablet: { x: 20, y: 150, width: 340, height: 54 },
          mobile: { x: 18, y: 152, width: 299, height: 56 },
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
        responsive: {
          tablet: { x: 20, y: 222, width: 340, height: 102 },
          mobile: { x: 18, y: 226, width: 299, height: 108 },
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
        responsive: {
          tablet: { x: 20, y: 350, width: 174, height: 48 },
          mobile: { x: 18, y: 360, width: 180, height: 48 },
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
    defaultResponsive: {
      tablet: { width: 400, height: 570 },
      mobile: { width: 335, height: 625 },
    },
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
        responsive: {
          tablet: { x: 20, y: 82, width: 340, height: 54 },
          mobile: { x: 18, y: 82, width: 299, height: 56 },
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
        responsive: {
          tablet: { x: 20, y: 154, width: 340, height: 54 },
          mobile: { x: 18, y: 158, width: 299, height: 56 },
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
        responsive: {
          tablet: { x: 20, y: 226, width: 340, height: 54 },
          mobile: { x: 18, y: 234, width: 299, height: 56 },
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
        responsive: {
          tablet: { x: 20, y: 298, width: 340, height: 54 },
          mobile: { x: 18, y: 310, width: 299, height: 56 },
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
        responsive: {
          tablet: { x: 20, y: 380, width: 340, height: 52 },
          mobile: { x: 18, y: 394, width: 299, height: 70 },
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
        responsive: {
          tablet: { x: 20, y: 470, width: 190, height: 50 },
          mobile: { x: 18, y: 505, width: 190, height: 50 },
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
    defaultResponsive: {
      tablet: { width: 280, height: 44 },
      mobile: { width: 335, height: 48 },
    },
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
    defaultResponsive: {
      tablet: { width: 320, height: 130 },
      mobile: { width: 335, height: 140 },
    },
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
    defaultResponsive: {
      tablet: { width: 260, height: 46 },
      mobile: { width: 335, height: 48 },
    },
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
    defaultResponsive: {
      tablet: { width: 280, height: 84 },
      mobile: { width: 335, height: 96 },
    },
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
    defaultResponsive: {
      tablet: { width: 280, height: 84 },
      mobile: { width: 335, height: 96 },
    },
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
    defaultResponsive: {
      tablet: { width: 60, height: 60 },
      mobile: { width: 60, height: 60 },
    },
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
    defaultResponsive: {
      tablet: { width: 420, height: 220 },
      mobile: { width: 335, height: 320, props: { columns: 1, gap: 12 } },
    },
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
    defaultResponsive: {
      tablet: { width: 380, height: 280 },
      mobile: { width: 335, height: 260 },
    },
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
    defaultResponsive: {
      tablet: { width: 320, height: 110 },
      mobile: { width: 335, height: 128 },
    },
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
    defaultResponsive: {
      tablet: { width: 640, height: 320, props: { columns: 2, gap: 16, limit: 4 } },
      mobile: { width: 335, height: 440, props: { columns: 1, gap: 14, limit: 3 } },
    },
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
    defaultResponsive: {
      tablet: { width: 360, height: 320 },
      mobile: { width: 335, height: 360 },
    },
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
  responsive: cloneDefaultResponsive(child.responsive),
  bindingSlots: cloneDefaultBindingSlots(child.bindingSlots),
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
    responsive: cloneDefaultResponsive(element.responsive),
    bindingSlots: cloneDefaultBindingSlots(element.bindingSlots),
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
  const props = mergeUnknownRecord(
    definition ? cloneDefaultProps(definition.defaultProps || {}) : {},
    overrides.props,
  ) || {};
  const size = definition?.defaultSize || { width: 200, height: 100 };
  const styles = mergeCssProperties(definition ? cloneDefaultStyles(definition.defaultStyles) : undefined, overrides.styles);
  const responsive = mergeResponsiveDefaults(definition?.defaultResponsive, overrides.responsive);
  const bindingSlots = overrides.bindingSlots
    ? cloneDefaultBindingSlots(overrides.bindingSlots)
    : definition ? cloneDefaultBindingSlots(definition.defaultBindingSlots) : undefined;

  return {
    id: generateId(),
    type,
    x,
    y,
    width: size.width,
    height: size.height,
    zIndex: 1,
    ...overrides,
    props,
    styles,
    bindingSlots,
    responsive,
  };
}

export function createCanvasElementFromLibraryItem(
  item: ComponentLibraryItem,
  x: number,
  y: number,
  overrides: Partial<CanvasElement> = {}
): CanvasElement {
  const {
    props: overrideProps,
    styles: overrideStyles,
    responsive: overrideResponsive,
    bindingSlots: overrideBindingSlots,
    children: overrideChildren,
    ...restOverrides
  } = overrides;
  const base = createCanvasElement(item.type, x, y, {
    width: item.defaultSize?.width,
    height: item.defaultSize?.height,
    ...restOverrides,
    props: mergeUnknownRecord(cloneDefaultProps(item.defaultProps || {}), overrideProps) || {},
    styles: mergeCssProperties(cloneDefaultStyles(item.defaultStyles), overrideStyles),
    responsive: mergeResponsiveDefaults(item.defaultResponsive, overrideResponsive),
    bindingSlots: overrideBindingSlots
      ? cloneDefaultBindingSlots(overrideBindingSlots)
      : cloneDefaultBindingSlots(item.defaultBindingSlots),
  });

  return {
    ...base,
    children: overrideChildren ?? item.defaultChildren?.map((child, index) => createPresetChild(child, index + 1)),
  };
}

export function extractFrontendTemplateDesignSerialization(
  templateContent: unknown,
  fallbackCustomCSS?: string,
): FrontendTemplateDesignSerialization {
  const content = isRecord(templateContent) ? templateContent : {};
  const contentDocument = cloneUnknownRecord<Record<string, unknown>>(content.contentDocument);
  const contentDocumentMetadata = contentDocument && isRecord(contentDocument.metadata)
    ? contentDocument.metadata
    : undefined;
  const metadata = firstTemplateRecord<Record<string, unknown>>(content.metadata, contentDocumentMetadata) || {};
  const customCSS = firstTemplateString(
    content.customCSS,
    content.customCss,
    metadata.customCSS,
    metadata.customCss,
    fallbackCustomCSS,
  );
  const customJS = firstTemplateString(
    content.customJS,
    content.customJs,
    metadata.customJS,
    metadata.customJs,
  );
  const elements = cloneUnknownArray<unknown>(content.elements)
    || cloneUnknownArray<unknown>(contentDocument?.elements);
  const canvasSize = firstTemplateRecord<Record<string, unknown>>(
    content.canvasSize,
    contentDocument?.canvasSize,
    metadata.canvasSize,
  );
  const themeTokenRefs = firstTemplateRecord<BackyContentDocument['themeTokenRefs']>(
    content.themeTokenRefs,
    contentDocument?.themeTokenRefs,
    metadata.themeTokenRefs,
  );
  const assets = firstTemplateRecord<NonNullable<BackyContentDocument['assets']>>(
    content.assets,
    contentDocument?.assets,
    metadata.assets,
  );
  const interactions = firstTemplateRecord<NonNullable<BackyContentDocument['interactions']>>(
    content.interactions,
    contentDocument?.interactions,
    metadata.interactions,
  );
  const dataBindings = firstTemplateRecord<NonNullable<BackyContentDocument['dataBindings']>>(
    content.dataBindings,
    contentDocument?.dataBindings,
    metadata.dataBindings,
  );
  const editableMap = firstTemplateRecord<BackyContentDocument['editableMap']>(
    content.editableMap,
    contentDocument?.editableMap,
    metadata.editableMap,
  );
  const seo = firstTemplateRecord<NonNullable<BackyContentDocument['seo']>>(
    content.seo,
    contentDocument?.seo,
    metadata.seo,
  );
  const seoProvenance = firstTemplateRecord<Record<string, unknown>>(
    content.seo,
    contentDocument?.seo,
    metadata.seo,
  );
  const animations = templateProvenanceArrayOrRecord(content.animations) || templateProvenanceArrayOrRecord(metadata.animations);
  const interactionProvenance = templateProvenanceArrayOrRecord(content.interactions) || templateProvenanceArrayOrRecord(metadata.interactions);
  const assetProvenance = templateProvenanceArrayOrRecord(content.assets) || templateProvenanceArrayOrRecord(metadata.assets);
  const mergedMetadata: Record<string, unknown> = {
    ...metadata,
    ...(animations ? { animations } : {}),
    ...(interactionProvenance ? { interactions: interactionProvenance } : {}),
    ...(assetProvenance ? { assets: assetProvenance } : {}),
  };

  return {
    customCSS,
    options: {
      ...(customJS ? { customJS } : {}),
      ...(themeTokenRefs ? { themeTokenRefs } : {}),
      ...(assets ? { assets } : {}),
      ...(interactions ? { interactions } : {}),
      ...(seo ? { seo } : {}),
      ...(dataBindings ? { dataBindings } : {}),
      ...(editableMap ? { editableMap } : {}),
      ...(Object.keys(mergedMetadata).length > 0 ? { metadata: mergedMetadata as BackyContentDocument['metadata'] } : {}),
    },
    provenance: {
      ...(customCSS ? { customCSS } : {}),
      ...(customJS ? { customJS } : {}),
      ...(contentDocument ? { contentDocument } : {}),
      ...(elements ? { elements } : {}),
      ...(canvasSize ? { canvasSize } : {}),
      ...(themeTokenRefs ? { themeTokenRefs } : {}),
      ...(assetProvenance ? { assets: assetProvenance } : {}),
      ...(animations ? { animations } : {}),
      ...(interactionProvenance ? { interactions: interactionProvenance } : {}),
      ...(dataBindings ? { dataBindings } : {}),
      ...(editableMap ? { editableMap } : {}),
      ...(seoProvenance ? { seo: seoProvenance } : {}),
      ...(Object.keys(mergedMetadata).length > 0 ? { metadata: mergedMetadata } : {}),
    },
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
      const customCSS = typeof parsed.customCSS === 'string'
        ? parsed.customCSS
        : typeof contentDocument?.metadata?.customCSS === 'string'
          ? contentDocument.metadata.customCSS
          : undefined;
      const customJS = typeof parsed.customJS === 'string'
        ? parsed.customJS
        : typeof contentDocument?.metadata?.customJS === 'string'
          ? contentDocument.metadata.customJS
          : undefined;

      return {
        elements: Array.isArray(parsed.elements)
          ? normalizeSavedCanvasElements(parsed.elements)
          : contentDocument
            ? normalizeSavedCanvasElements(contentDocument.elements)
            : [],
        canvasSize: normalizeCanvasSize(isRecord(parsed.canvasSize) ? parsed.canvasSize : documentCanvasSize),
        customCSS,
        customJS,
        themeTokenRefs: isRecord(parsed.themeTokenRefs)
          ? parsed.themeTokenRefs as BackyContentDocument['themeTokenRefs']
          : contentDocument?.themeTokenRefs,
        assets: isRecord(parsed.assets)
          ? parsed.assets as BackyContentDocument['assets']
          : contentDocument?.assets,
        interactions: isRecord(parsed.interactions)
          ? parsed.interactions as BackyContentDocument['interactions']
          : contentDocument?.interactions,
        seo: isRecord(parsed.seo)
          ? parsed.seo as BackyContentDocument['seo']
          : contentDocument?.seo,
        dataBindings: isRecord(parsed.dataBindings)
          ? parsed.dataBindings as BackyContentDocument['dataBindings']
          : contentDocument?.dataBindings,
        editableMap: isRecord(parsed.editableMap)
          ? parsed.editableMap as BackyContentDocument['editableMap']
          : contentDocument?.editableMap,
        metadata: isRecord(parsed.metadata)
          ? parsed.metadata as BackyContentDocument['metadata']
          : contentDocument?.metadata,
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

function normalizeSavedCanvasElements(input: unknown, parentId?: string): CanvasElement[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter(isRecord)
    .map((rawElement, index) => {
      const id = typeof rawElement.id === 'string' ? rawElement.id : generateId();
      const props = isRecord(rawElement.props)
        ? rawElement.props
        : isRecord(rawElement.content)
          ? rawElement.content
          : {};
      const styles = isRecord(rawElement.styles)
        ? rawElement.styles as CSSProperties
        : undefined;
      const metadata = isRecord(rawElement.metadata) ? rawElement.metadata : {};
      const rawParentId = typeof rawElement.parentId === 'string'
        ? rawElement.parentId
        : typeof metadata.parentId === 'string'
          ? metadata.parentId
          : undefined;
      const resolvedParentId = parentId || rawParentId;
      const children = Array.isArray(rawElement.children)
        ? normalizeSavedCanvasElements(rawElement.children, id)
        : undefined;

      return {
        ...rawElement,
        id,
        type: typeof rawElement.type === 'string' ? rawElement.type as ElementType : 'text',
        x: typeof rawElement.x === 'number' ? rawElement.x : 0,
        y: typeof rawElement.y === 'number' ? rawElement.y : 0,
        width: typeof rawElement.width === 'number' ? rawElement.width : 320,
        height: typeof rawElement.height === 'number' ? rawElement.height : 120,
        zIndex: typeof rawElement.zIndex === 'number' ? rawElement.zIndex : index + 1,
        props,
        styles,
        ...(resolvedParentId ? { parentId: resolvedParentId } : {}),
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
    ...(customCSS !== undefined ? { customCSS } : {}),
    ...(options.customJS !== undefined ? { customJS: options.customJS } : {}),
    ...(options.themeTokenRefs !== undefined ? { themeTokenRefs: options.themeTokenRefs } : {}),
    ...(options.assets !== undefined ? { assets: options.assets } : {}),
    ...(options.interactions !== undefined ? { interactions: options.interactions } : {}),
    ...(options.seo !== undefined ? { seo: options.seo } : {}),
    ...(options.dataBindings !== undefined ? { dataBindings: options.dataBindings } : {}),
    ...(options.editableMap !== undefined ? { editableMap: options.editableMap } : {}),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
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
      customJS: options.customJS,
      themeTokenRefs: options.themeTokenRefs,
      assets: options.assets,
      interactions: options.interactions,
      seo: options.seo,
      dataBindings: options.dataBindings,
      editableMap: options.editableMap,
      metadata: options.metadata,
    });
    payload.metadata = payload.contentDocument.metadata;
  }

  return JSON.stringify(payload);
}

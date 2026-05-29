/**
 * ============================================================================
 * BACKY CMS - PROPERTY PANEL
 * ============================================================================
 *
 * The property panel that displays editable properties for the
 * currently selected canvas element.
 *
 * @module PropertyPanel
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Type,
  Palette,
  Layout,
  Box,
  Sparkles,
  Database,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Trash2,
  Plus,
  Upload,
  Search,
  X,
} from 'lucide-react';
import { cn, generateId } from '@/lib/utils';
import { PORTAL_TOOLBAR_CONTAINER_ID } from '@backy-cms/editor';
import {
  buildBackyThemeTokenReferences,
  buildBackyThemeTokens,
  type ThemeConfig,
} from '@backy-cms/core';
// import { RichTextEditor } from './RichTextEditor';
import { MediaLibraryModal, type MediaContext, type MediaSelectionOptions } from './MediaLibraryModal';
import { EmojiPickerModal } from './EmojiPickerModal';
import { getFontFamilyOptions, toFontFamilyStyle } from './fontCatalog';
import { RichTextFormatting } from './RichTextFormatting';
import { AnimationBuilder, type AnimationConfig } from './AnimationBuilder';
import {
  clearDownloadFileProps,
  downloadFileAssetIdsFromProps,
  LinkBehaviorProperties,
} from './LinkBehaviorProperties';
import {
  buildEditorMediaPickerAction,
  type EditorMediaField,
  type EditorMediaPickerMode,
  type EditorMediaPickerTarget,
} from './editorMediaPickerActions';
import { buildEditorDataBindingAction } from './editorDataBindingActions';
import { buildEditorFormBuilderAction } from './editorFormBuilderActions';
import { buildEditorActionStatus } from './editorActionStatus';
import type { CanvasElement, ComponentBindingSlot, ElementProps } from '@/types/editor';
import {
  listCollectionBindingPresets,
  listCollections,
  listCollectionRecords,
  saveCollectionBindingPresets,
  type Collection,
  type CollectionBindingPreset,
  type CollectionField,
  type CollectionRecord,
  type InteractiveComponentRegistryEntry,
} from '@/lib/adminContentApi';
import { getPublicMediaFileUrl } from '@/lib/mediaApi';
import {
  buildListContentFromItems,
  normalizeListContent,
  getListItemsFromProps,
} from './listUtils';
import { useStore, type MediaAsset } from '@/stores/mockStore';

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? parseFloat(value)
      : fallback;

  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBooleanSetting = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
      return true;
    }

    if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
      return false;
    }
  }

  return fallback;
};

const EDITOR_COLOR_SWATCHES = [
  '#000000',
  '#ffffff',
  '#f8fafc',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
];

type ThemeTokenTarget = {
  targetPath: string;
  propName: keyof ElementProps & string;
  label: string;
  prefixes: string[];
  textOnly?: boolean;
};

const THEME_TOKEN_TARGETS: ThemeTokenTarget[] = [
  { targetPath: 'styles.color', propName: 'color', label: 'Text color', prefixes: ['colors.'], textOnly: true },
  { targetPath: 'styles.backgroundColor', propName: 'backgroundColor', label: 'Background', prefixes: ['colors.'] },
  { targetPath: 'styles.borderColor', propName: 'borderColor', label: 'Border color', prefixes: ['colors.'] },
  { targetPath: 'styles.fontFamily', propName: 'fontFamily', label: 'Font family', prefixes: ['typography.families.'], textOnly: true },
  { targetPath: 'styles.fontSize', propName: 'fontSize', label: 'Font size', prefixes: ['typography.scale.'], textOnly: true },
  { targetPath: 'styles.lineHeight', propName: 'lineHeight', label: 'Line height', prefixes: ['typography.lineHeights.'], textOnly: true },
  { targetPath: 'styles.fontWeight', propName: 'fontWeight', label: 'Font weight', prefixes: ['typography.weights.'], textOnly: true },
  { targetPath: 'styles.padding', propName: 'padding', label: 'Padding', prefixes: ['spacing.'] },
  { targetPath: 'styles.margin', propName: 'margin', label: 'Margin', prefixes: ['spacing.'] },
  { targetPath: 'styles.borderRadius', propName: 'borderRadius', label: 'Radius', prefixes: ['radii.'] },
  { targetPath: 'styles.boxShadow', propName: 'boxShadow', label: 'Shadow', prefixes: ['shadows.'] },
];

const PROPERTY_SECTION_IDS = ['content', 'layout', 'style', 'appearance', 'data', 'animation'] as const;
type PropertySectionId = typeof PROPERTY_SECTION_IDS[number];

const PROPERTY_ESSENTIAL_SECTION_IDS: PropertySectionId[] = ['content', 'layout', 'style'];
type PropertySectionMode = 'essentials' | 'focused' | 'all' | 'custom' | 'search';

const PROPERTY_SECTION_MODE_LABELS: Record<PropertySectionMode, string> = {
  essentials: 'Essentials',
  focused: 'Focused',
  all: 'All',
  custom: 'Custom',
  search: 'Search',
};

const PROPERTY_SECTION_METADATA: Array<{
  id: PropertySectionId;
  title: string;
  shortTitle: string;
  icon: React.ElementType;
  keywords: string[];
}> = [
  {
    id: 'content',
    title: 'Content',
    shortTitle: 'Content',
    icon: Type,
    keywords: ['text', 'copy', 'heading', 'paragraph', 'quote', 'image', 'video', 'media', 'link', 'button', 'form', 'field', 'list', 'nav', 'html', 'icon', 'embed'],
  },
  {
    id: 'layout',
    title: 'Layout',
    shortTitle: 'Layout',
    icon: Layout,
    keywords: ['position', 'size', 'width', 'height', 'x', 'y', 'responsive', 'breakpoint', 'spacing', 'padding', 'margin', 'grid', 'flex'],
  },
  {
    id: 'style',
    title: 'Style',
    shortTitle: 'Style',
    icon: Palette,
    keywords: ['color', 'font', 'typography', 'type', 'background', 'border', 'radius', 'shadow', 'align', 'decoration', 'theme', 'token'],
  },
  {
    id: 'appearance',
    title: 'Appearance',
    shortTitle: 'Look',
    icon: Box,
    keywords: ['look', 'opacity', 'visibility', 'blend', 'effect', 'filter', 'state', 'surface'],
  },
  {
    id: 'data',
    title: 'Data',
    shortTitle: 'Data',
    icon: Database,
    keywords: ['cms', 'collection', 'binding', 'dataset', 'repeater', 'records', 'api', 'field map', 'slot', 'dynamic'],
  },
  {
    id: 'animation',
    title: 'Animation',
    shortTitle: 'Motion',
    icon: Sparkles,
    keywords: ['motion', 'animate', 'animation', 'transition', 'duration', 'delay', 'easing', 'hover', 'scroll', 'trigger'],
  },
];

const normalizePropertySectionQuery = (value: string) => value.trim().toLowerCase();

const matchingPropertySectionsForQuery = (query: string): PropertySectionId[] => {
  const normalizedQuery = normalizePropertySectionQuery(query);
  if (!normalizedQuery) {
    return [...PROPERTY_SECTION_IDS];
  }

  return PROPERTY_SECTION_METADATA
    .filter((section) => {
      const haystack = [
        section.id,
        section.title,
        section.shortTitle,
        ...section.keywords,
      ].map((value) => value.toLowerCase());

      return haystack.some((value) => (
        value.includes(normalizedQuery) || normalizedQuery.includes(value)
      ));
    })
    .map((section) => section.id);
};

const arePropertySectionSetsEqual = (
  sections: readonly PropertySectionId[],
  expected: readonly PropertySectionId[],
) => (
  sections.length === expected.length && expected.every((section) => sections.includes(section))
);

const propertySectionModeFor = (sections: readonly PropertySectionId[]): PropertySectionMode => {
  if (arePropertySectionSetsEqual(sections, PROPERTY_ESSENTIAL_SECTION_IDS)) {
    return 'essentials';
  }

  if (sections.length === 1) {
    return 'focused';
  }

  if (arePropertySectionSetsEqual(sections, PROPERTY_SECTION_IDS)) {
    return 'all';
  }

  return 'custom';
};

const themeTokenLabel = (path: string) => path
  .replace(/^typography\./, '')
  .split('.')
  .map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' / ');

const themeTokenSelectTestId = (targetPath: string) => (
  `editor-theme-token-select-${targetPath.replace(/[^a-zA-Z0-9]+/g, '-')}`
);

const parseCssDurationToSeconds = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  const numeric = parseFloat(trimmed);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  if (trimmed.endsWith('ms')) {
    return numeric / 1000;
  }

  return numeric;
};

const normalizeHexColorInputValue = (value: string): string => {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed.slice(1).split('').map((char) => `${char}${char}`).join('')}`;
  }

  return '#000000';
};

const formatFieldMap = (value: unknown): string => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([source, target]) => `${source}: ${String(target || '')}`)
    .join('\n');
};

const parseFieldMapInput = (value: string): Record<string, string> => (
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const [source, target] = entry.split(':').map((item) => item?.trim());
      if (source && target) {
        acc[source] = target;
      }
      return acc;
    }, {})
);

const formatFormSchemaFields = (value: unknown): string => {
  if (!Array.isArray(value) && (!value || typeof value !== 'object')) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

const parseFormSchemaFieldsInput = (value: string): unknown[] | Record<string, unknown> | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) {
      return parsed as unknown[] | Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

const FORM_BUILDER_FIELD_TYPES = [
  'text',
  'email',
  'number',
  'textarea',
  'select',
  'checkbox',
  'radio',
  'date',
  'tel',
  'url',
  'file',
] as const;

const normalizeFormFieldKey = (value: unknown, fallback = 'field'): string => {
  const raw = typeof value === 'string' ? value : String(value || '');
  const key = raw.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return key || fallback;
};

const normalizeFormBuilderFields = (value: unknown): Record<string, any>[] => {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value as Record<string, unknown>).map(([key, field]) => (
        field && typeof field === 'object' && !Array.isArray(field)
          ? { key, ...(field as Record<string, unknown>) }
          : { key, label: key, type: field }
      ))
      : [];

  return entries
    .filter((field): field is Record<string, any> => Boolean(field && typeof field === 'object' && !Array.isArray(field)))
    .map((field, index) => ({
      ...field,
      key: normalizeFormFieldKey(field.key || field.name || field.id, `field_${index + 1}`),
      label: typeof field.label === 'string' && field.label.trim()
        ? field.label.trim()
        : normalizeFormFieldKey(field.key || field.name || field.id, `field_${index + 1}`),
      type: FORM_BUILDER_FIELD_TYPES.includes(String(field.type || field.inputType || '').toLowerCase() as typeof FORM_BUILDER_FIELD_TYPES[number])
        ? String(field.type || field.inputType).toLowerCase()
        : 'text',
    }));
};

const parseBuilderOptions = (value: string): string[] => (
  value
    .split(/\r?\n|,/)
    .map((option) => option.trim())
    .filter(Boolean)
);

const formatNavigationItems = (value: unknown): string => {
  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const label = String(record.label || record.title || record.name || '').trim();
        const href = String(record.href || record.url || '').trim();
        return href ? `${label}: ${href}` : label;
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
};

const formatOptionValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return formatOptionValue(record.value) || formatOptionValue(record.label);
  }

  return '';
};

const formatOptionValues = (value: unknown): string => {
  const options = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n/)
      : [];

  return options
    .map(formatOptionValue)
    .filter(Boolean)
    .join('\n');
};

const parseNavigationItems = (value: string): Array<string | { label: string; href: string }> => (
  value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [label, ...hrefParts] = entry.split(':');
      const href = hrefParts.join(':').trim();
      const normalizedLabel = label.trim();

      if (normalizedLabel && href) {
        return { label: normalizedLabel, href };
      }

      return entry;
    })
);

const normalizeNavigationItemRecords = (
  value: unknown,
): Array<{ label: string; href: string }> => {
  const rawItems = Array.isArray(value) ? value : [];

  return rawItems
    .map((item, index) => {
      if (typeof item === 'string') {
        const label = item.trim();
        if (!label) {
          return null;
        }

        return {
          label,
          href: label.toLowerCase() === 'home'
            ? '/'
            : `/${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || index}`,
        };
      }

      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const label = String(record.label || record.title || record.name || `Item ${index + 1}`).trim();
        const href = String(record.href || record.url || '#').trim() || '#';
        return label ? { label, href } : null;
      }

      return null;
    })
    .filter(Boolean) as Array<{ label: string; href: string }>;
};

const buildNavigationLinkChildren = (element: CanvasElement): CanvasElement[] => {
  const navItems = normalizeNavigationItemRecords(element.props.navItems);
  const records = navItems.length > 0
    ? navItems
    : [
        { label: 'Home', href: '/' },
        { label: 'About', href: '/about' },
        { label: 'Contact', href: '/contact' },
      ];
  const isVertical = element.props.navDirection === 'vertical';
  const gap = toNumber(element.props.gap, 18);
  const fontSize = toNumber(element.props.fontSize, 14);
  const color = typeof element.props.color === 'string' ? element.props.color : '#111827';
  const fontWeight = typeof element.props.fontWeight === 'string' ? element.props.fontWeight : '600';
  const itemWidths = records.map((item) => Math.max(64, Math.min(180, item.label.length * 9 + 32)));
  const totalWidth = itemWidths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, records.length - 1);
  const totalHeight = records.length * 28 + gap * Math.max(0, records.length - 1);
  let cursorX = isVertical ? 0 : Math.max(0, Math.round((element.width - totalWidth) / 2));
  let cursorY = isVertical ? Math.max(0, Math.round((element.height - totalHeight) / 2)) : Math.max(0, Math.round((element.height - 28) / 2));
  const existingChildren = Array.isArray(element.children) ? element.children : [];
  const reusedChildIds = new Set<string>();
  const findReusableChild = (item: { label: string; href: string }, index: number): CanvasElement | undefined => {
    const candidates = [
      existingChildren[index],
      ...existingChildren.filter((child) => {
        const childLabel = typeof child.props?.content === 'string' ? child.props.content.trim() : '';
        const childHref = typeof child.props?.href === 'string' ? child.props.href.trim() : '';
        return child.type === 'link' && (childHref === item.href || childLabel === item.label);
      }),
    ];
    return candidates.find((child): child is CanvasElement => (
      Boolean(child && child.type === 'link' && !reusedChildIds.has(child.id))
    ));
  };

  return records.map((item, index) => {
    const width = isVertical ? Math.max(64, element.width) : itemWidths[index];
    const reusableChild = findReusableChild(item, index);
    if (reusableChild) {
      reusedChildIds.add(reusableChild.id);
    }
    const previousProps = reusableChild?.props || {};
    const previousStyles = reusableChild?.styles || {};
    const child: CanvasElement = {
      ...(reusableChild || {}),
      id: reusableChild?.id || generateId('nav-link'),
      type: 'link',
      name: `${item.label} link`,
      x: cursorX,
      y: cursorY,
      width,
      height: 28,
      zIndex: index + 1,
      parentId: element.id,
      props: {
        ...previousProps,
        content: item.label,
        href: item.href,
        fontSize,
        fontWeight,
        color,
        underline: previousProps.underline ?? false,
      },
      styles: {
        ...previousStyles,
        display: 'flex',
        alignItems: 'center',
        justifyContent: isVertical ? 'flex-start' : 'center',
        whiteSpace: 'nowrap',
      },
    };

    if (isVertical) {
      cursorY += 28 + gap;
    } else {
      cursorX += width + gap;
    }

    return child;
  });
};

const buildNavigationElementSync = (
  element: CanvasElement,
  propsUpdates: Partial<ElementProps>,
): Pick<CanvasElement, 'props' | 'children'> => {
  const props = {
    ...element.props,
    ...propsUpdates,
  };
  const nextElement = {
    ...element,
    props,
  };
  return {
    props,
    children: buildNavigationLinkChildren(nextElement),
  };
};

type NavigationSource = 'manual' | 'site-primary' | 'site-footer';

const NAVIGATION_SOURCE_OPTIONS: Array<{
  value: NavigationSource;
  label: string;
  binding: string;
  chromeRole: string;
  description: string;
}> = [
  {
    value: 'site-primary',
    label: 'Site primary navigation',
    binding: 'site.navigation.primary',
    chromeRole: 'site.header.navigation',
    description: 'Shared header menu from the site navigation API.',
  },
  {
    value: 'site-footer',
    label: 'Site footer navigation',
    binding: 'site.navigation.footer',
    chromeRole: 'site.footer.navigation',
    description: 'Shared footer menu from the site navigation API.',
  },
  {
    value: 'manual',
    label: 'Manual links',
    binding: 'manual.navItems',
    chromeRole: 'page.local.navigation',
    description: 'Page-local links stored on this canvas element.',
  },
];

const navigationSourceOption = (value: unknown) => {
  const normalized = typeof value === 'string' ? value : '';
  return NAVIGATION_SOURCE_OPTIONS.find((option) => (
    option.value === normalized || option.binding === normalized
  )) || NAVIGATION_SOURCE_OPTIONS[2];
};

const navigationSourceProps = (source: NavigationSource): Partial<ElementProps> => {
  const option = navigationSourceOption(source);
  return {
    navigationSource: option.value,
    navigationBinding: option.binding,
    chromeRole: option.chromeRole,
  };
};

const withQueryParam = (url: string, key: string, value: string): string => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
};

const buildMediaDownloadHref = (mediaId: string, siteId?: string): string => (
  withQueryParam(getPublicMediaFileUrl(mediaId, siteId), 'disposition', 'attachment')
);

const normalizeCanvasElementType = (value: string): CanvasElement['type'] => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') : '';

  if (!normalized) {
    return 'text';
  }

  if (
    normalized === 'textinput'
    || normalized === 'textinputfield'
    || normalized === 'textfield'
    || normalized === 'textfield'
    || normalized === 'inputfield'
  ) {
    return 'input';
  }

  if (
    normalized === 'multiline'
    || normalized === 'multilinetext'
    || normalized === 'multilinetextinput'
    || normalized === 'textarea'
    || normalized === 'textareafield'
  ) {
    return 'textarea';
  }

  if (
    normalized === 'radio'
    || normalized === 'radiobutton'
    || normalized === 'radiobuttons'
    || normalized === 'radioinput'
    || normalized === 'radioinputs'
  ) {
    return 'radio';
  }

  if (
    normalized === 'checkbox'
    || normalized === 'checkboxes'
    || normalized === 'checkboxinput'
    || normalized === 'checkboxinputs'
    || normalized === 'checkinput'
  ) {
    return 'checkbox';
  }

  if (normalized.includes('dropdown') || normalized.includes('select')) {
    return 'select';
  }

  if (normalized.includes('textinput') || normalized.includes('textfield')) {
    return 'input';
  }

  if (normalized === 'interactivefigure') {
    return 'interactiveFigure';
  }

  if (normalized === 'codecomponent') {
    return 'codeComponent';
  }

  const knownTypes: CanvasElement['type'][] = [
    'text',
    'heading',
    'paragraph',
    'image',
    'button',
    'container',
    'section',
    'header',
    'footer',
    'nav',
    'divider',
    'video',
    'icon',
    'form',
    'input',
    'textarea',
    'select',
    'checkbox',
    'radio',
    'spacer',
    'columns',
    'map',
    'box',
    'embed',
    'html',
    'table',
    'list',
    'link',
    'quote',
    'repeater',
    'comment',
    'interactiveFigure',
    'codeComponent',
  ];

  return knownTypes.includes(normalized as CanvasElement['type'])
    ? (normalized as CanvasElement['type'])
    : 'text';
};

const resolveRichTextType = (normalizedType: string, props: ElementProps): string => {
  if (normalizedType === 'heading') {
    if (typeof props.level === 'string' && props.level) {
      return props.level;
    }
    return 'h2';
  }

  if (normalizedType === 'list') {
    return props.listType === 'number' || props.listType === 'ordered' || props.listType === 'decimal'
      ? 'ol'
      : 'ul';
  }

  if (normalizedType === 'quote') {
    return 'blockquote';
  }

  if (normalizedType === 'paragraph') {
    return 'p';
  }

  if (normalizedType === 'text') {
    return 'p';
  }

  return 'p';
};

const normalizeTextElementContent = (rawContent: unknown, normalizedType: string, props: ElementProps): unknown[] => {
  if (normalizedType === 'list') {
    return normalizeListContent({
      content: rawContent,
      items: props.items,
      listType: props.listType,
    });
  }

  if (Array.isArray(rawContent)) {
    return rawContent;
  }

  const fallbackType = resolveRichTextType(normalizedType, props);

  if (typeof rawContent === 'string') {
    return [
      {
        type: fallbackType,
        children: [{ text: rawContent }],
      },
    ];
  }

  return [
    {
      type: fallbackType,
      children: [{ text: '' }],
    },
  ];
};

const EDITOR_ASSET_ID_PROP_KEYS = new Set([
  'assetId',
  'assetIds',
  'mediaIds',
  'mediaId',
  'fileId',
  'fileIds',
  'fileMediaId',
  'fileMediaIds',
  'downloadMediaId',
  'downloadMediaIds',
  'imageId',
  'imageIds',
  'videoId',
  'videoIds',
  'audioId',
  'audioIds',
  'fontId',
  'fontIds',
  'documentId',
  'documentIds',
  'iconId',
  'iconIds',
  'fontMediaId',
  'fontMediaIds',
  'fallbackImageMediaId',
  'fallbackImageMediaIds',
  'backgroundMediaId',
  'backgroundMediaIds',
  'posterMediaId',
  'posterMediaIds',
]);

const cleanMediaString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value.trim() : undefined
);

const collectEditorAssetIds = (value: unknown, key: string | null, assetIds: Set<string>) => {
  if (key && EDITOR_ASSET_ID_PROP_KEYS.has(key)) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const id = cleanMediaString(item);
        if (id) assetIds.add(id);
      });
      return;
    }

    const id = cleanMediaString(value);
    if (id) assetIds.add(id);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectEditorAssetIds(item, null, assetIds));
    return;
  }

  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([entryKey, entryValue]) => {
      collectEditorAssetIds(entryValue, entryKey, assetIds);
    });
  }
};

const buildElementAssetIds = (
  element: CanvasElement,
  nextProps: ElementProps,
  extraIds: Array<string | undefined>,
  staleIds: Array<unknown> = [],
): string[] | undefined => {
  const stale = new Set(staleIds.map(cleanMediaString).filter(Boolean) as string[]);
  const assetIds = new Set<string>();

  (element.assetIds || []).forEach((assetId) => {
    const normalized = cleanMediaString(assetId);
    if (normalized && !stale.has(normalized)) {
      assetIds.add(normalized);
    }
  });

  collectEditorAssetIds(nextProps, null, assetIds);
  extraIds.map(cleanMediaString).filter(Boolean).forEach((assetId) => assetIds.add(assetId as string));

  return assetIds.size > 0 ? Array.from(assetIds) : undefined;
};

const mediaOrganizationProps = (media: MediaAsset) => (
  media.organization
    ? {
        mediaOrganization: media.organization,
        mediaFolderPath: media.organization.folderPath,
        mediaFolderSegments: media.organization.folderSegments,
        mediaFolderName: media.organization.folderName,
        mediaFolderDepth: media.organization.folderDepth,
        mediaFolderMissing: media.organization.missingFolder,
      }
    : {
        mediaFolderPath: null,
        mediaFolderSegments: [],
        mediaFolderName: null,
        mediaFolderDepth: null,
        mediaFolderMissing: false,
      }
);

const mediaIdentityProps = (media: MediaAsset, mediaContext?: MediaContext): Partial<ElementProps> => ({
  mediaId: media.id,
  mediaType: media.type,
  mediaName: media.name,
  mediaFolderId: media.folderId || null,
  ...mediaOrganizationProps(media),
  mediaVisibility: media.visibility || 'public',
  mediaScope: media.scope || mediaContext?.scope || 'global',
  mediaScopeTargetId: media.scopeTargetId || mediaContext?.targetId || null,
});

const fileDownloadIdentityProps = (
  media: MediaAsset,
  mediaContext: MediaContext | undefined,
  downloadUrl: string,
): Partial<ElementProps> => ({
  fileId: media.id,
  fileIds: [media.id],
  fileMediaId: media.id,
  fileMediaIds: [media.id],
  downloadMediaId: media.id,
  downloadMediaIds: [media.id],
  fileMediaType: media.type,
  fileMediaName: media.name,
  fileMediaUrl: downloadUrl,
  fileUrl: downloadUrl,
  fileMediaFolderId: media.folderId || null,
  fileMediaFolderPath: media.organization?.folderPath || null,
  fileMediaOrganization: media.organization || null,
  fileMediaVisibility: media.visibility || 'public',
  fileMediaScope: media.scope || mediaContext?.scope || 'global',
  fileMediaScopeTargetId: media.scopeTargetId || mediaContext?.targetId || null,
  fileDownloadDisposition: 'attachment',
  fileSignedUrlRequired: (media.visibility || 'public') === 'private',
  fileSignedUrlEndpoint: mediaContext?.siteId
    ? `/api/admin/sites/${mediaContext.siteId}/media/${media.id}/signed-url`
    : undefined,
});

const imageDesignProps = (selectionOptions?: MediaSelectionOptions): Partial<ElementProps> => {
  const imagePresentation = selectionOptions?.imagePresentation;

  return {
    ...(selectionOptions?.insertPreset ? { imageInsertPreset: selectionOptions.insertPreset } : {}),
    ...(imagePresentation
      ? {
          objectFit: imagePresentation.objectFit,
          objectPosition: imagePresentation.objectPosition,
          imageFocalPoint: imagePresentation.focalPoint,
        }
      : {}),
  };
};

const fontFamilyFromMedia = (font: MediaAsset): string => {
  const metadataFamily = cleanMediaString(font.metadata?.fontFamily);
  if (metadataFamily) return metadataFamily;
  return font.name.replace(/\.[a-z0-9]+$/i, '');
};

// ============================================
// TYPES
// ============================================

type EditorMediaAllowedTypes = 'image' | 'video' | 'audio' | 'file' | 'font' | 'other' | 'any';
type EditorMediaUploadFilter = 'all' | 'image' | 'video' | 'audio' | 'file' | 'font' | 'other';

interface PropertyPanelProps {
  /** Currently selected element */
  element: CanvasElement | null;
  /** Callback when element properties change */
  onChange: (updates: Partial<CanvasElement>) => void;
  /** Callback when element is deleted */
  onDelete?: () => void;
  theme?: ThemeConfig;
  mediaContext?: MediaContext;
  disabled?: boolean;
  canViewMedia?: boolean;
  canCreateMedia?: boolean;
  canViewCollections?: boolean;
  mediaViewDisabledReason?: string;
  mediaCreateDisabledReason?: string;
  collectionsViewDisabledReason?: string;
  interactiveComponents?: InteractiveComponentRegistryEntry[];
  interactiveComponentsLoading?: boolean;
  interactiveComponentsError?: string | null;
  embedded?: boolean;
  hideHeader?: boolean;
}

// ============================================
// COMPONENT
// ============================================

/**
 * Property Panel Component
 *
 * Displays and allows editing of element properties
 * organized into collapsible sections.
 */
export function PropertyPanel({
  element,
  onChange,
  onDelete,
  theme,
  mediaContext,
  disabled = false,
  canViewMedia = true,
  canCreateMedia = true,
  canViewCollections = true,
  mediaViewDisabledReason,
  mediaCreateDisabledReason,
  collectionsViewDisabledReason,
  interactiveComponents = [],
  interactiveComponentsLoading = false,
  interactiveComponentsError = null,
  embedded = false,
  hideHeader = false,
}: PropertyPanelProps) {
  const [expandedSections, setExpandedSections] = useState<PropertySectionId[]>([
    ...PROPERTY_ESSENTIAL_SECTION_IDS,
  ]);

  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const [mediaField, setMediaField] = useState<EditorMediaField>('src');
  const [mediaOpenTab, setMediaOpenTab] = useState<'library' | 'upload'>('library');
  const [mediaAllowedTypes, setMediaAllowedTypes] = useState<EditorMediaAllowedTypes>('image');
  const [mediaUploadFilter, setMediaUploadFilter] = useState<EditorMediaUploadFilter>('all');
  const [mediaReturnFocusTargetId, setMediaReturnFocusTargetId] = useState('');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [propertySectionQuery, setPropertySectionQuery] = useState('');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [appliedChangeCount, setAppliedChangeCount] = useState(0);
  const [showAppliedFeedback, setShowAppliedFeedback] = useState(false);
  const siteId = mediaContext?.siteId;
  const openMediaLibrary = (field: EditorMediaField, mode: EditorMediaPickerMode = 'library', openerTestId = '') => {
    const action = buildEditorMediaPickerAction({
      field,
      mode,
      disabled,
      canViewMedia,
      canCreateMedia,
      viewDisabledReason: mediaViewDisabledReason,
      createDisabledReason: mediaCreateDisabledReason,
    });

    if (action.disabledReason) {
      return;
    }

    setMediaField(field);
    setMediaOpenTab(mode);
    setMediaReturnFocusTargetId(openerTestId);
    if (field === 'video') {
      setMediaAllowedTypes('video');
      setMediaUploadFilter('video');
    } else if (field === 'embed') {
      setMediaAllowedTypes('any');
      setMediaUploadFilter('all');
    } else if (field === 'downloadFile') {
      setMediaAllowedTypes('file');
      setMediaUploadFilter('file');
    } else {
      setMediaAllowedTypes('image');
      setMediaUploadFilter('image');
    }
    setIsMediaLibraryOpen(true);
  };

  useEffect(() => {
    if (!siteId || !canViewCollections) {
      setCollectionsLoading(false);
      setCollectionsLoaded(true);
      setCollections([]);
      setCollectionsError(!canViewCollections ? collectionsViewDisabledReason || 'You do not have permission to view collections.' : null);
      return;
    }

    let cancelled = false;
    const loadCollections = async () => {
      setCollectionsLoading(true);
      setCollectionsLoaded(false);
      try {
        const backendCollections = await listCollections(siteId);
        if (!cancelled) {
          setCollections(backendCollections);
          setCollectionsError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setCollections([]);
          setCollectionsError(error instanceof Error ? error.message : 'Unable to load collections');
        }
      } finally {
        if (!cancelled) {
          setCollectionsLoading(false);
          setCollectionsLoaded(true);
        }
      }
    };

    void loadCollections();

    return () => {
      cancelled = true;
    };
  }, [canViewCollections, collectionsViewDisabledReason, siteId]);

  useEffect(() => {
    setAppliedChangeCount(0);
    setShowAppliedFeedback(false);
    setPropertySectionQuery('');
    setExpandedSections([...PROPERTY_ESSENTIAL_SECTION_IDS]);
  }, [element?.id]);

  useEffect(() => {
    if (appliedChangeCount === 0) {
      return;
    }

    setShowAppliedFeedback(true);
    const timeout = window.setTimeout(() => {
      setShowAppliedFeedback(false);
    }, 1400);

    return () => window.clearTimeout(timeout);
  }, [appliedChangeCount]);

  const expandedSectionSet = useMemo(() => new Set(expandedSections), [expandedSections]);
  const normalizedPropertySectionQuery = useMemo(
    () => normalizePropertySectionQuery(propertySectionQuery),
    [propertySectionQuery],
  );
  const visiblePropertySectionIds = useMemo(
    () => matchingPropertySectionsForQuery(normalizedPropertySectionQuery),
    [normalizedPropertySectionQuery],
  );
  const visiblePropertySectionSet = useMemo(
    () => new Set(visiblePropertySectionIds),
    [visiblePropertySectionIds],
  );
  const propertySectionMode = useMemo(
    () => normalizedPropertySectionQuery ? 'search' : propertySectionModeFor(expandedSections),
    [expandedSections, normalizedPropertySectionQuery],
  );
  const focusedPropertySection = propertySectionMode === 'focused' ? expandedSections[0] : '';
  const propertySectionActionStatusId = 'editor-property-section-action-status';
  const propertySectionSearchStatusId = 'editor-property-section-search-status';
  const propertySectionActionStatus = normalizedPropertySectionQuery
    ? `${visiblePropertySectionIds.length} matching inspector sections for "${normalizedPropertySectionQuery}".`
    : `${PROPERTY_SECTION_MODE_LABELS[propertySectionMode]} inspector view showing ${visiblePropertySectionIds.length} of ${PROPERTY_SECTION_IDS.length} sections.`;
  const propertySectionSearchStatus = normalizedPropertySectionQuery
    ? `${visiblePropertySectionIds.length} matching inspector sections`
    : 'Inspector search cleared';
  const propertySectionJumpStatus = (section: typeof PROPERTY_SECTION_METADATA[number], isOpen: boolean) => (
    isOpen
      ? `${section.title} inspector section selected.`
      : `Focus ${section.title} inspector controls available.`
  );
  const propertySectionEssentialsStatus = propertySectionMode === 'essentials'
    ? 'Essentials inspector sections selected.'
    : 'Show essential inspector sections available.';
  const propertySectionAllStatus = propertySectionMode === 'all'
    ? 'All inspector sections selected.'
    : 'Show all inspector sections available.';

  if (!element) {
    return (
      <div className={cn(
        'bg-card flex h-full min-h-0 flex-col',
        embedded ? 'w-full' : 'w-[clamp(18rem,24vw,30rem)] min-w-[18rem] max-w-[30rem] shrink-0 border-l border-border',
      )}>
        {!hideHeader && (
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Properties</h2>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center">
          <p className="text-sm">Select an element to edit its properties</p>
        </div>
      </div>
    );
  }

  const toggleSection = (section: PropertySectionId) => {
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  const focusPropertySection = (section: PropertySectionId) => {
    setExpandedSections([section]);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-property-section="${section}"]`)?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    });
  };

  const collapseToEssentialPropertySections = () => {
    setPropertySectionQuery('');
    setExpandedSections([...PROPERTY_ESSENTIAL_SECTION_IDS]);
  };

  const expandAllPropertySections = () => {
    setPropertySectionQuery('');
    setExpandedSections([...PROPERTY_SECTION_IDS]);
  };

  const updatePropertySectionSearch = (value: string) => {
    setPropertySectionQuery(value);
    const nextMatches = matchingPropertySectionsForQuery(value);
    setExpandedSections(
      normalizePropertySectionQuery(value)
        ? nextMatches
        : [...PROPERTY_ESSENTIAL_SECTION_IDS],
    );
  };

  const clearPropertySectionSearch = () => {
    setPropertySectionQuery('');
    setExpandedSections([...PROPERTY_ESSENTIAL_SECTION_IDS]);
  };

  const deleteElementActionStatusId = 'editor-property-delete-action-status';
  const deleteElementDisabledReason = disabled
    ? 'Inspector is read-only for this element.'
    : !onDelete
      ? 'Delete is not available for this element.'
      : '';
  const deleteElementActionState = deleteElementDisabledReason ? 'blocked' : 'ready';
  const deleteElementActionStatus = deleteElementDisabledReason
    ? `Delete ${element.type} element unavailable: ${deleteElementDisabledReason}`
    : `Delete ${element.type} element "${element.id}" available.`;

  const guardedOnChange = (updates: Partial<CanvasElement>) => {
    if (disabled) {
      return;
    }

    onChange(updates);
    setAppliedChangeCount((count) => count + 1);
  };

  const updateProps = (propsUpdates: Partial<ElementProps>) => {
    guardedOnChange({
      props: { ...element.props, ...propsUpdates },
    });
  };

  const renderPropertyFeedback = () => (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-all',
        showAppliedFeedback
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 opacity-100'
          : 'border-slate-200 bg-slate-50 text-slate-400 opacity-70'
      )}
      aria-live="polite"
      data-testid="editor-property-feedback"
      data-feedback-state={showAppliedFeedback ? 'applied' : 'idle'}
      data-feedback-count={appliedChangeCount}
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      {showAppliedFeedback ? 'Applied' : 'Ready'}
    </div>
  );

  return (
      <div className={cn(
        'bg-card flex h-full min-h-0 flex-col',
        embedded ? 'w-full' : 'w-[clamp(18rem,24vw,30rem)] min-w-[18rem] max-w-[30rem] shrink-0 border-l border-border',
      )} key={element.id}>
      {/* Header */}
      {!hideHeader && (
        <div className="p-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold">Properties</h2>
              <p className="text-sm text-muted-foreground capitalize">
                {element.type}
              </p>
            </div>
            {renderPropertyFeedback()}
          </div>
        </div>
      )}
      {hideHeader && (
        <div className="border-b border-border px-3 py-2">
          {renderPropertyFeedback()}
        </div>
      )}
      <div id={PORTAL_TOOLBAR_CONTAINER_ID} className="px-3 pt-3" />

      {/* Properties */}
      <fieldset
        disabled={disabled}
        aria-disabled={disabled}
        className={cn(
          'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 pb-2',
          disabled && 'cursor-not-allowed opacity-70',
        )}
      >
        <div
          className="sticky top-0 z-10 -mx-2 mb-2 border-b border-border bg-card/95 px-2 py-2 backdrop-blur"
          data-testid="editor-property-section-rail"
          data-expanded-sections={expandedSections.join(' ')}
          data-expanded-count={expandedSections.length}
          data-section-count={PROPERTY_SECTION_IDS.length}
          data-property-section-mode={propertySectionMode}
          data-focused-section={focusedPropertySection || ''}
          data-section-query={normalizedPropertySectionQuery}
          data-visible-section-count={visiblePropertySectionIds.length}
          data-matched-sections={visiblePropertySectionIds.join(' ')}
          data-action-status={propertySectionActionStatus}
          aria-describedby={propertySectionActionStatusId}
        >
          <span
            id={propertySectionActionStatusId}
            className="sr-only"
            aria-live="polite"
            data-testid="editor-property-section-action-status"
          >
            {propertySectionActionStatus}
          </span>
          <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[11px] font-medium text-muted-foreground">
            <span className="truncate">Inspector sections</span>
            <span className="shrink-0 tabular-nums">
              {PROPERTY_SECTION_MODE_LABELS[propertySectionMode]} · {visiblePropertySectionIds.length} / {PROPERTY_SECTION_IDS.length}
            </span>
          </div>
          <div className="mb-2 flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-500 shadow-sm">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <label htmlFor="editor-property-section-search" className="sr-only">
              Find inspector controls
            </label>
            <input
              id="editor-property-section-search"
              type="search"
              value={propertySectionQuery}
              onChange={(event) => updatePropertySectionSearch(event.target.value)}
              placeholder="Find controls"
              className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-800 outline-none placeholder:text-slate-400"
              aria-label="Find inspector controls"
              aria-describedby={`${propertySectionActionStatusId} ${propertySectionSearchStatusId}`}
              data-testid="editor-property-section-search"
              data-action-state="ready"
              data-action-status={propertySectionActionStatus}
              data-target-query={normalizedPropertySectionQuery}
              data-matched-sections={visiblePropertySectionIds.join(' ')}
            />
            {normalizedPropertySectionQuery && (
              <button
                type="button"
                onClick={clearPropertySectionSearch}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Clear inspector search"
                aria-describedby={propertySectionActionStatusId}
                data-testid="editor-property-section-clear-search"
                data-action-state="ready"
                data-action-status="Clear inspector search available."
                data-target-query={normalizedPropertySectionQuery}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <span
              id={propertySectionSearchStatusId}
              className="sr-only"
              aria-live="polite"
              data-testid="editor-property-section-search-status"
            >
              {propertySectionSearchStatus}
            </span>
          </div>
          <div
            className="flex gap-1 overflow-x-auto pb-1"
            data-testid="editor-property-section-scroll"
          >
            {PROPERTY_SECTION_METADATA.filter((section) => visiblePropertySectionSet.has(section.id)).map((section) => {
              const SectionIcon = section.icon;
              const isSectionOpen = expandedSectionSet.has(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => focusPropertySection(section.id)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors',
                    isSectionOpen && propertySectionMode === 'focused'
                      ? 'border-sky-300 bg-sky-50 text-sky-950 shadow-sm'
                      : isSectionOpen
                      ? 'border-slate-300 bg-white text-slate-950 shadow-sm'
                      : 'border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800'
                  )}
                  aria-pressed={isSectionOpen}
                  aria-label={`Focus ${section.title} properties`}
                  aria-describedby={propertySectionActionStatusId}
                  data-testid={`editor-property-section-jump-${section.id}`}
                  data-property-section-open={isSectionOpen ? 'true' : 'false'}
                  data-action-state={isSectionOpen ? 'selected' : 'ready'}
                  data-action-status={propertySectionJumpStatus(section, isSectionOpen)}
                  data-target-section={section.id}
                >
                  <SectionIcon className="h-3.5 w-3.5" />
                  {section.shortTitle}
                </button>
              );
            })}
            {normalizedPropertySectionQuery && visiblePropertySectionIds.length === 0 && (
              <div
                className="min-w-[14rem] rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                data-testid="editor-property-section-search-empty"
                data-empty-query={normalizedPropertySectionQuery}
              >
                <div className="font-semibold text-slate-700">No inspector controls match "{normalizedPropertySectionQuery}"</div>
                <button
                  type="button"
                  onClick={collapseToEssentialPropertySections}
                  className="mt-2 inline-flex items-center rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  data-testid="editor-property-section-empty-reset"
                  data-action-state="ready"
                  data-action-status="Show essential inspector sections available."
                  data-target-section-mode="essentials"
                  data-target-query={normalizedPropertySectionQuery}
                  aria-describedby={propertySectionActionStatusId}
                >
                  Show essentials
                </button>
              </div>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={collapseToEssentialPropertySections}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              data-testid="editor-property-sections-essentials"
              aria-pressed={propertySectionMode === 'essentials'}
              aria-describedby={propertySectionActionStatusId}
              data-action-state={propertySectionMode === 'essentials' ? 'selected' : 'ready'}
              data-action-status={propertySectionEssentialsStatus}
              data-target-section-mode="essentials"
            >
              Essentials
            </button>
            <button
              type="button"
              onClick={expandAllPropertySections}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              data-testid="editor-property-sections-expand-all"
              aria-pressed={propertySectionMode === 'all'}
              aria-describedby={propertySectionActionStatusId}
              data-action-state={propertySectionMode === 'all' ? 'selected' : 'ready'}
              data-action-status={propertySectionAllStatus}
              data-target-section-mode="all"
            >
              All sections
            </button>
          </div>
        </div>

        {/* Content Section */}
        {visiblePropertySectionSet.has('content') && (
          <PropertySection
            id="content"
            title="Content"
            icon={Type}
            isExpanded={expandedSectionSet.has('content')}
            onToggle={() => toggleSection('content')}
          >
            <ContentProperties
              element={element}
              onChange={updateProps}
              onElementChange={guardedOnChange}
              collections={collections}
              collectionsError={collectionsError}
              interactiveComponents={interactiveComponents}
              interactiveComponentsLoading={interactiveComponentsLoading}
              interactiveComponentsError={interactiveComponentsError}
              elementId={element.id}
              onOpenMedia={openMediaLibrary}
              onOpenEmoji={() => setIsEmojiPickerOpen(true)}
              disabled={disabled}
              canViewMedia={canViewMedia}
              canCreateMedia={canCreateMedia}
              mediaViewDisabledReason={mediaViewDisabledReason}
              mediaCreateDisabledReason={mediaCreateDisabledReason}
            />
          </PropertySection>
        )}

        {/* Layout Section */}
        {visiblePropertySectionSet.has('layout') && (
          <PropertySection
            id="layout"
            title="Layout"
            icon={Layout}
            isExpanded={expandedSectionSet.has('layout')}
            onToggle={() => toggleSection('layout')}
          >
            <LayoutProperties element={element} onChange={guardedOnChange} />
          </PropertySection>
        )}

        {/* Style Section */}
        {visiblePropertySectionSet.has('style') && (
          <PropertySection
            id="style"
            title="Style"
            icon={Palette}
            isExpanded={expandedSectionSet.has('style')}
            onToggle={() => toggleSection('style')}
          >
            {/**
              * Keep element-level styling available for text components while inline
              * toolbar operations target selected text in the editor.
            */}
            <StyleProperties
              element={element}
              onChange={updateProps}
              onElementChange={guardedOnChange}
              theme={theme}
              mediaContext={mediaContext}
              canViewMedia={canViewMedia}
              canCreateMedia={canCreateMedia}
              mediaViewDisabledReason={mediaViewDisabledReason}
              mediaCreateDisabledReason={mediaCreateDisabledReason}
              disabled={disabled}
              supportsTextStyles={[
                'text',
                'heading',
                'paragraph',
                'quote',
                'list',
                'button',
                'link',
                'icon',
              ].includes(element.type)}
            />
          </PropertySection>
        )}

        {/* Appearance Section */}
        {visiblePropertySectionSet.has('appearance') && (
          <PropertySection
            id="appearance"
            title="Appearance"
            icon={Box}
            isExpanded={expandedSectionSet.has('appearance')}
            onToggle={() => toggleSection('appearance')}
          >
            <AppearanceProperties element={element} onChange={updateProps} />
          </PropertySection>
        )}

        {/* Data Binding Section */}
        {visiblePropertySectionSet.has('data') && (
          <PropertySection
            id="data"
            title="Data"
            icon={Database}
            isExpanded={expandedSectionSet.has('data')}
            onToggle={() => toggleSection('data')}
          >
            <DataBindingProperties
              element={element}
              siteId={siteId}
              collections={collections}
              collectionsLoading={collectionsLoading || Boolean(siteId && canViewCollections && !collectionsLoaded && !collectionsError)}
              collectionsError={collectionsError}
              onChange={guardedOnChange}
            />
          </PropertySection>
        )}

        {/* Animation Section */}
        {visiblePropertySectionSet.has('animation') && (
          <PropertySection
            id="animation"
            title="Animation"
            icon={Sparkles}
            isExpanded={expandedSectionSet.has('animation')}
            onToggle={() => toggleSection('animation')}
          >
            <AnimationProperties element={element} onChange={guardedOnChange} theme={theme} />
          </PropertySection>
        )}

        {/* Delete Button */}
        <div className="pt-2">
          <span
            id={deleteElementActionStatusId}
            className="sr-only"
            aria-live="polite"
            data-testid="editor-property-delete-action-status"
          >
            {deleteElementActionStatus}
          </span>
          <button
            type="button"
            onClick={() => {
              if (deleteElementActionState !== 'ready') {
                return;
              }

              onDelete?.();
            }}
            disabled={deleteElementActionState !== 'ready'}
            title={deleteElementActionStatus}
            aria-describedby={deleteElementActionStatusId}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              deleteElementActionState === 'ready' ? 'hover:bg-red-100 active:scale-[0.99]' : 'hover:bg-red-50',
            )}
            data-testid="editor-property-delete-element"
            data-action-state={deleteElementActionState}
            data-action-status={deleteElementActionStatus}
            data-disabled-reason={deleteElementDisabledReason || undefined}
            data-target-element-id={element.id}
            data-target-element-type={element.type}
          >
            <Trash2 className="w-4 h-4" />
            Delete Element
          </button>
        </div>
      </fieldset>


      {/* Modals */}
      <MediaLibraryModal
        isOpen={isMediaLibraryOpen}
        onClose={() => setIsMediaLibraryOpen(false)}
        onSelect={(media, selectionOptions) => {
          if (mediaField === 'downloadFile') {
            const downloadHref = buildMediaDownloadHref(media.id, mediaContext?.siteId);
            const nextProps: ElementProps = {
              ...element.props,
              href: downloadHref,
              actionPreset: 'download',
              actionValue: downloadHref,
              download: true,
              ...fileDownloadIdentityProps(media, mediaContext, downloadHref),
            };

            guardedOnChange({
              props: nextProps,
              assetIds: buildElementAssetIds(
                element,
                nextProps,
                [media.id],
                downloadFileAssetIdsFromProps(element.props),
              ),
            });
            return;
          }

          const mediaPropKey = mediaField === 'video' || mediaField === 'embed' ? 'src' : mediaField;
          const currentFallback = element.props.fallback && typeof element.props.fallback === 'object' && !Array.isArray(element.props.fallback)
            ? element.props.fallback
            : {};
          const mediaIdentity = mediaIdentityProps(media, mediaContext);
          const imageDesign = imageDesignProps(selectionOptions);
          const fallbackImageDesign = selectionOptions?.imagePresentation
            ? {
                imageObjectFit: selectionOptions.imagePresentation.objectFit,
                imageObjectPosition: selectionOptions.imagePresentation.objectPosition,
                imageFocalPoint: selectionOptions.imagePresentation.focalPoint,
                imageInsertPreset: selectionOptions.insertPreset,
              }
            : selectionOptions?.insertPreset
              ? { imageInsertPreset: selectionOptions.insertPreset }
              : {};
          const nextProps: ElementProps = {
            ...element.props,
            ...(mediaField === 'interactiveFallbackImage'
              ? {
                  fallback: {
                    ...currentFallback,
                    imageUrl: media.url,
                    imageMediaId: media.id,
                    imageMediaName: media.name,
                    imageMediaFolderId: media.folderId || null,
                    imageMediaFolderPath: media.organization?.folderPath || null,
                    imageMediaOrganization: media.organization,
                    alt: currentFallback.alt || media.altText || media.caption || '',
                    ...fallbackImageDesign,
                  },
                  fallbackImageMediaId: media.id,
                  fallbackImageMediaName: media.name,
                  fallbackImageMediaFolderId: media.folderId || null,
                  fallbackImageMediaFolderPath: media.organization?.folderPath || null,
                  fallbackImageMediaOrganization: media.organization,
                  fallbackImageMediaVisibility: media.visibility || 'public',
                }
              : {
                  [mediaPropKey]: media.url,
                  ...mediaIdentity,
                  mediaInsertPreset: selectionOptions?.insertPreset,
                }),
          };
          const nextElementUpdates: Partial<CanvasElement> = {};

          if (mediaField === 'src' && element.type === 'image') {
            const currentAlt = typeof element.props.alt === 'string' ? element.props.alt.trim() : '';
            const currentTitle = typeof element.props.title === 'string' ? element.props.title.trim() : '';
            const mediaAlt = typeof media.altText === 'string' ? media.altText.trim() : '';
            const mediaCaption = typeof media.caption === 'string' ? media.caption.trim() : '';

            Object.assign(nextProps, imageDesign);

            if (selectionOptions?.insertPreset === 'fit-inside') {
              nextProps.objectFit = 'contain';
            } else if (selectionOptions?.insertPreset === 'square') {
              nextElementUpdates.width = 360;
              nextElementUpdates.height = 360;
            } else if (selectionOptions?.insertPreset === 'hero') {
              nextElementUpdates.width = 960;
              nextElementUpdates.height = 420;
            } else if (selectionOptions?.insertPreset === 'natural') {
              nextElementUpdates.width = 420;
              nextElementUpdates.height = 280;
            }

            if (!currentAlt && mediaAlt) {
              nextProps.alt = mediaAlt;
            }

            if (!currentTitle && mediaCaption) {
              nextProps.title = mediaCaption;
            }
          }

          nextElementUpdates.assetIds = buildElementAssetIds(
            element,
            nextProps,
            [media.id],
            [element.props.mediaId, element.props.fallbackImageMediaId],
          );

          guardedOnChange({
            ...nextElementUpdates,
            props: nextProps,
          });
        }}
        initialTab={mediaOpenTab}
        initialUploadFilter={mediaUploadFilter}
        returnFocusTargetId={mediaReturnFocusTargetId}
        mediaContext={mediaContext}
        allowedTypes={mediaAllowedTypes}
        replaceAssetId={typeof element.props.mediaId === 'string' ? element.props.mediaId : null}
        allowPrivateSelection={mediaField === 'downloadFile'}
        canView={canViewMedia}
        canCreate={canCreateMedia}
        viewDisabledReason={mediaViewDisabledReason}
        createDisabledReason={mediaCreateDisabledReason}
      />

      <EmojiPickerModal
        isOpen={isEmojiPickerOpen}
        onClose={() => setIsEmojiPickerOpen(false)}
        onSelect={(emoji) => {
          guardedOnChange({ props: { ...element.props, icon: emoji } });
        }}
      />
    </div >
  );
}

// ============================================
// PROPERTY SECTION COMPONENT
// ============================================

interface PropertySectionProps {
  id: PropertySectionId;
  title: string;
  icon: React.ElementType;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function PropertySection({
  id,
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  children,
}: PropertySectionProps) {
  const sectionToggleStatusId = `editor-property-section-toggle-${id}-status`;
  const sectionToggleActionStatus = isExpanded
    ? `${title} inspector section expanded.`
    : `Expand ${title} inspector section available.`;

  return (
    <div
      className="border-b border-border"
      data-testid={`editor-property-section-${id}`}
      data-property-section={id}
      data-property-section-expanded={isExpanded ? 'true' : 'false'}
    >
      <span
        id={sectionToggleStatusId}
        className="sr-only"
        data-testid={`editor-property-section-toggle-status-${id}`}
      >
        {sectionToggleActionStatus}
      </span>
      <button
        type="button"
        onClick={onToggle}
        data-testid={`editor-property-section-toggle-${id}`}
        data-action-state={isExpanded ? 'selected' : 'ready'}
        data-action-status={sectionToggleActionStatus}
        data-target-section={id}
        className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
        aria-expanded={isExpanded}
        aria-describedby={sectionToggleStatusId}
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
}

// ============================================
// CONTENT PROPERTIES
// ============================================

interface ContentPropertiesProps {
  element: CanvasElement;
  onChange: (updates: Partial<ElementProps>) => void;
  onElementChange?: (updates: Partial<CanvasElement>) => void;
  onOpenMedia: (field: EditorMediaField, mode?: EditorMediaPickerMode, openerTestId?: string) => void;
  onOpenEmoji: () => void;
  collections: Collection[];
  collectionsError: string | null;
  interactiveComponents: InteractiveComponentRegistryEntry[];
  interactiveComponentsLoading: boolean;
  interactiveComponentsError: string | null;
  elementId?: string;
  disabled?: boolean;
  canViewMedia?: boolean;
  canCreateMedia?: boolean;
  mediaViewDisabledReason?: string;
  mediaCreateDisabledReason?: string;
}

const interactiveComponentOptionValue = (component: Pick<InteractiveComponentRegistryEntry, 'componentKey' | 'version'>) => (
  `${encodeURIComponent(component.componentKey)}::${encodeURIComponent(component.version)}`
);

const getInteractiveControlString = (control: Record<string, unknown>, key: string, fallback = ''): string => (
  typeof control[key] === 'string' ? control[key].trim() : fallback
);

const getInteractiveControlKey = (control: Record<string, unknown>): string => (
  getInteractiveControlString(control, 'key') || getInteractiveControlString(control, 'name')
);

const getInteractiveControlLabel = (control: Record<string, unknown>): string => (
  getInteractiveControlString(control, 'label') || getInteractiveControlKey(control) || 'Control'
);

const getInteractiveControlType = (control: Record<string, unknown>): string => {
  const type = getInteractiveControlString(control, 'type', 'text').toLowerCase();
  return ['range', 'number', 'select', 'radio', 'checkbox', 'boolean', 'toggle', 'color', 'textarea', 'json', 'code'].includes(type)
    ? type
    : 'text';
};

type InteractiveControlOption = {
  label: string;
  value: string;
  rawValue: unknown;
};

const getInteractiveControlOptions = (control: Record<string, unknown>): InteractiveControlOption[] => {
  const options = Array.isArray(control.options) ? control.options : [];
  return options
    .map<InteractiveControlOption | null>((option) => {
      if (typeof option === 'string' || typeof option === 'number' || typeof option === 'boolean') {
        return { label: String(option), value: String(option), rawValue: option };
      }
      if (option && typeof option === 'object' && !Array.isArray(option)) {
        const record = option as Record<string, unknown>;
        const value: unknown = record.value ?? record.id ?? record.key ?? record.label;
        const label = record.label ?? record.name ?? value;
        return value === undefined ? null : { label: String(label), value: String(value), rawValue: value };
      }
      return null;
    })
    .filter((option): option is InteractiveControlOption => Boolean(option));
};

const getInteractiveControlOptionValue = (
  control: Record<string, unknown>,
  value: unknown,
): unknown => {
  const stringValue = value === undefined || value === null ? '' : String(value);
  const option = getInteractiveControlOptions(control).find((item) => item.value === stringValue);
  return option ? option.rawValue : stringValue;
};

const getInteractiveNumericBound = (
  control: Record<string, unknown>,
  key: 'min' | 'max' | 'step',
): number | undefined => {
  const value = control[key];
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;

  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeInteractiveNumericControlValue = (
  value: unknown,
  control: Record<string, unknown>,
): number | string => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return typeof value === 'string' ? value : '';
  }

  const min = getInteractiveNumericBound(control, 'min');
  const max = getInteractiveNumericBound(control, 'max');
  return Math.max(
    min ?? Number.NEGATIVE_INFINITY,
    Math.min(max ?? Number.POSITIVE_INFINITY, parsed),
  );
};

const formatInteractiveJsonControlValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const normalizeInteractiveJsonControlValue = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const normalizeInteractiveControlValue = (
  control: Record<string, unknown>,
  value: unknown,
): unknown => {
  const controlType = getInteractiveControlType(control);

  if (controlType === 'checkbox' || controlType === 'boolean' || controlType === 'toggle') {
    return parseBooleanSetting(value, false);
  }
  if (controlType === 'range' || controlType === 'number') {
    return normalizeInteractiveNumericControlValue(value, control);
  }
  if (controlType === 'color') {
    return normalizeHexColorInputValue(String(value || '#000000'));
  }
  if (controlType === 'select' || controlType === 'radio') {
    return getInteractiveControlOptionValue(control, value);
  }
  if (controlType === 'json') {
    return normalizeInteractiveJsonControlValue(value);
  }

  return value === undefined || value === null ? '' : String(value);
};

const getInteractiveControlValue = (control: Record<string, unknown>, props: Record<string, unknown>): unknown => {
  const key = getInteractiveControlKey(control);
  if (key && props[key] !== undefined) {
    return props[key];
  }
  if (control.value !== undefined) {
    return control.value;
  }
  return control.defaultValue;
};

const updateInteractiveControlList = (
  controls: Record<string, unknown>[],
  controlKey: string,
  value: unknown,
): Record<string, unknown>[] => (
  controls.map((control) => (
    getInteractiveControlKey(control) === controlKey
      ? { ...control, value }
      : control
  ))
);

const getInteractiveRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const getInteractiveStringList = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
    : []
);

const getInteractivePolicyLabel = (value: unknown): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return text
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getInteractiveRuntimeBadges = (component: InteractiveComponentRegistryEntry | null): Array<{ label: string; value: string }> => {
  if (!component) {
    return [];
  }

  const runtime = getInteractiveRecord(component.runtime);
  const integrity = getInteractiveRecord(component.integrity);
  const security = getInteractiveRecord(component.security);
  const dependencyPolicy = getInteractiveRecord(component.dependencyPolicy);
  const compatibility = getInteractiveRecord(component.compatibility);
  const permissions = getInteractiveStringList(runtime.allowedPermissions);
  const renderTargets = getInteractiveStringList(compatibility.renderTargets);
  const animationLibraries = getInteractiveStringList(compatibility.animationLibraries);

  return [
    { label: 'Status', value: component.status || 'unknown' },
    { label: 'Mode', value: component.renderMode || 'static-fallback' },
    { label: 'Source', value: component.source || 'registry' },
    { label: 'Integrity', value: integrity.signed === true ? 'signed' : 'unsigned' },
    { label: 'Sandbox', value: typeof runtime.sandboxUrl === 'string' && runtime.sandboxUrl ? 'Backy route' : 'not configured' },
    { label: 'Permissions', value: permissions.length ? permissions.join(', ') : 'none' },
    { label: 'Dependency policy', value: getInteractivePolicyLabel(dependencyPolicy.preset) || 'registry default' },
    { label: 'Compatibility', value: renderTargets.length ? renderTargets.join(', ') : 'declared by registry' },
    { label: 'Animation libs', value: animationLibraries.length ? animationLibraries.join(', ') : 'none declared' },
    { label: 'Admin API', value: security.adminApiAccess === true ? 'blocked before publish' : 'denied' },
  ];
};

const getInteractiveBindingPresets = (component: InteractiveComponentRegistryEntry | null): Array<{
  id: string;
  label: string;
  scope: string;
  targetPath: string;
  mode: string;
}> => {
  const presets = Array.isArray(component?.dataBindingPresets) ? component.dataBindingPresets : [];
  return presets
    .map((preset) => {
      const record = getInteractiveRecord(preset);
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      const label = typeof record.label === 'string' ? record.label.trim() : '';
      const scope = typeof record.scope === 'string' ? record.scope.trim() : '';
      const targetPath = typeof record.targetPath === 'string' ? record.targetPath.trim() : '';
      const mode = typeof record.mode === 'string' ? record.mode.trim() : '';
      return id && label && scope && targetPath
        ? { id, label, scope, targetPath, mode: mode || 'read' }
        : null;
    })
    .filter((preset): preset is { id: string; label: string; scope: string; targetPath: string; mode: string } => Boolean(preset));
};

const getInteractivePreviewModel = (
  component: InteractiveComponentRegistryEntry | null,
  props: Record<string, unknown>,
  controls: Record<string, unknown>[],
) => {
  const componentKey = typeof component?.componentKey === 'string'
    ? component.componentKey
    : typeof props.componentKey === 'string'
      ? props.componentKey
      : '';
  const controlValue = (key: string, fallback: unknown) => {
    const control = controls.find((item) => getInteractiveControlKey(item) === key);
    const value = control ? getInteractiveControlValue(control, props) : props[key];
    return value === undefined || value === null || value === '' ? fallback : value;
  };
  const title = typeof props.title === 'string' && props.title.trim()
    ? props.title.trim()
    : component?.displayName || 'Interactive component';
  const mode = component?.renderMode || String(getInteractiveRecord(props.renderCapabilities).hydrationMode || 'static-fallback');

  if (componentKey.includes('chart')) {
    return {
      kind: 'chart',
      title,
      caption: 'Data-bound chart preview',
      mode,
      chips: ['series', 'fallback', 'hover'],
      values: [30, 58, 42, 74, 64, 88],
    };
  }

  if (componentKey.includes('timeline')) {
    return {
      kind: 'timeline',
      title,
      caption: `${String(controlValue('density', 'comfortable'))} density timeline`,
      mode,
      chips: ['milestones', 'focus', 'fallback'],
      values: [1, 2, 3, 4],
    };
  }

  if (componentKey.includes('simulation')) {
    const parameter = Math.max(0, Math.min(100, Number(controlValue('parameterA', 50)) || 50));
    return {
      kind: 'simulation',
      title,
      caption: `${String(controlValue('scenario', 'baseline'))} scenario`,
      mode,
      chips: ['input', 'output', 'what-if'],
      values: [parameter, Math.max(10, 100 - parameter), Math.round((parameter + 40) / 2)],
    };
  }

  if (componentKey.includes('explorer')) {
    return {
      kind: 'explorer',
      title,
      caption: `${String(controlValue('view', 'table'))} data view`,
      mode,
      chips: ['filters', 'records', 'binding'],
      values: [72, 48, 64],
    };
  }

  if (componentKey.includes('canvas') || componentKey.includes('custom')) {
    return {
      kind: 'canvas',
      title,
      caption: `${String(controlValue('playback', 'manual'))} sandbox runtime`,
      mode,
      chips: ['iframe', 'signed', 'postMessage'],
      values: [Math.max(0, Math.min(100, Number(controlValue('intensity', 50)) || 50))],
    };
  }

  const rounds = Math.max(1, Math.min(12, Number(controlValue('rounds', controlValue('steps', 4))) || 4));
  return {
    kind: componentKey.includes('stepper') ? 'stepper' : 'rounds',
    title,
    caption: `${rounds} ${componentKey.includes('stepper') ? 'steps' : 'communication rounds'} at ${String(controlValue('speed', controlValue('mode', 'normal')))}`,
    mode,
    chips: ['states', 'controls', 'fallback'],
    values: Array.from({ length: Math.min(rounds, 6) }, (_, index) => index + 1),
  };
};

function ContentProperties({
  element,
  onChange,
  onElementChange,
  onOpenMedia,
  onOpenEmoji,
  collections,
  collectionsError,
  interactiveComponents,
  interactiveComponentsLoading,
  interactiveComponentsError,
  elementId,
  disabled = false,
  canViewMedia = true,
  canCreateMedia = true,
  mediaViewDisabledReason,
  mediaCreateDisabledReason,
}: ContentPropertiesProps) {
  const normalizedType = normalizeCanvasElementType(element.type);
  const textElementContent = normalizeTextElementContent(element.props.content, normalizedType, element.props);
  const hasTextContent = ['text', 'heading', 'paragraph', 'quote', 'list'].includes(normalizedType);
  const hasImageContent = normalizedType === 'image';
  const hasVideoContent = normalizedType === 'video';
  const hasLinkContent = normalizedType === 'link';
  const hasButtonContent = normalizedType === 'button';
  const hasNavContent = normalizedType === 'nav';
  const currentNavigationSourceOption = hasNavContent
    ? navigationSourceOption(element.props.navigationSource || element.props.navigationBinding)
    : NAVIGATION_SOURCE_OPTIONS[2];
  const hasHtmlContent = normalizedType === 'html' || normalizedType === 'table';
  const hasQuoteContent = normalizedType === 'quote';
  const hasFormFieldContent = ['input', 'textarea', 'select', 'checkbox', 'radio'].includes(normalizedType);
  const hasFormContent = normalizedType === 'form';
  const hasCommentContent = normalizedType === 'comment';
  const hasInteractiveContent = normalizedType === 'interactiveFigure' || normalizedType === 'codeComponent';
  const hasListContent = normalizedType === 'list';
  const fieldOptionsText = formatOptionValues(element.props.options);
  const listItems = getListItemsFromProps(element.props);
  const mediaPickerActionStatusId = 'editor-media-picker-action-status';
  const mediaPickerContext = {
    disabled,
    canViewMedia,
    canCreateMedia,
    viewDisabledReason: mediaViewDisabledReason,
    createDisabledReason: mediaCreateDisabledReason,
  };
  const getMediaPickerAction = (field: EditorMediaPickerTarget, mode: EditorMediaPickerMode = 'library') => (
    buildEditorMediaPickerAction({ field, mode, ...mediaPickerContext })
  );
  const openMediaPicker = (field: EditorMediaField, mode: EditorMediaPickerMode = 'library', openerTestId = '') => {
    if (getMediaPickerAction(field, mode).disabledReason) {
      return;
    }

    onOpenMedia(field, mode, openerTestId);
  };
  const updateNavigationWithSyncedLinks = (propsUpdates: Partial<ElementProps>) => {
    const synced = buildNavigationElementSync(element, propsUpdates);
    if (onElementChange) {
      onElementChange(synced);
      return;
    }

    onChange(propsUpdates);
  };
  const renderMediaPickerButton = ({
    field,
    mode = 'library',
    testId,
    children,
    className = 'px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-60',
    title,
  }: {
    field: EditorMediaField;
    mode?: EditorMediaPickerMode;
    testId: string;
    children: React.ReactNode;
    className?: string;
    title?: string;
  }) => {
    const action = getMediaPickerAction(field, mode);

    return (
      <button
        type="button"
        className={className}
        title={action.disabledReason || title || action.actionLabel}
        onClick={() => openMediaPicker(field, mode, testId)}
        disabled={Boolean(action.disabledReason)}
        aria-describedby={mediaPickerActionStatusId}
        data-testid={testId}
        data-action-state={action.actionState}
        data-action-status={action.actionStatus}
        data-disabled-reason={action.disabledReason || undefined}
        data-target-media-field={field}
        data-target-media-mode={mode}
      >
        {children}
      </button>
    );
  };
  const interactiveFallback = element.props.fallback && typeof element.props.fallback === 'object' && !Array.isArray(element.props.fallback)
    ? element.props.fallback
    : {};
  const interactiveRenderCapabilities = element.props.renderCapabilities && typeof element.props.renderCapabilities === 'object' && !Array.isArray(element.props.renderCapabilities)
    ? element.props.renderCapabilities
    : {};
  const updateInteractiveFallback = useCallback((updates: Record<string, unknown>) => {
    onChange({
      fallback: {
        ...interactiveFallback,
        ...updates,
      },
    });
  }, [interactiveFallback, onChange]);
  const updateInteractiveRenderCapabilities = useCallback((updates: Record<string, unknown>) => {
    onChange({
      renderCapabilities: {
        ...interactiveRenderCapabilities,
        ...updates,
      },
    });
  }, [interactiveRenderCapabilities, onChange]);
  const compatibleInteractiveComponents = useMemo(() => (
    interactiveComponents.filter((component) => component.type === normalizedType)
  ), [interactiveComponents, normalizedType]);
  const selectedInteractiveComponent = useMemo(() => (
    compatibleInteractiveComponents.find((component) => (
      component.componentKey === element.props.componentKey
      && (!element.props.version || component.version === element.props.version)
    )) || null
  ), [compatibleInteractiveComponents, element.props.componentKey, element.props.version]);
  const selectedInteractiveComponentValue = selectedInteractiveComponent
    ? interactiveComponentOptionValue(selectedInteractiveComponent)
    : '';
  const interactiveRuntimeBadges = useMemo(
    () => getInteractiveRuntimeBadges(selectedInteractiveComponent),
    [selectedInteractiveComponent],
  );
  const interactiveBindingPresets = useMemo(
    () => getInteractiveBindingPresets(selectedInteractiveComponent),
    [selectedInteractiveComponent],
  );
  const interactiveControls = useMemo<Record<string, unknown>[]>(() => {
    const rawControls = Array.isArray(element.props.controls)
      ? element.props.controls
      : Array.isArray(selectedInteractiveComponent?.controls)
        ? selectedInteractiveComponent.controls
        : [];

    return rawControls.filter((control): control is Record<string, unknown> => (
      !!control && typeof control === 'object' && !Array.isArray(control) && Boolean(getInteractiveControlKey(control))
    ));
  }, [element.props.controls, selectedInteractiveComponent?.controls]);
  const interactivePreviewModel = useMemo(
    () => getInteractivePreviewModel(selectedInteractiveComponent, element.props, interactiveControls),
    [element.props, interactiveControls, selectedInteractiveComponent],
  );
  const interactiveActionStatusId = 'editor-interactive-action-status';
  const selectedInteractiveComponentLabel = selectedInteractiveComponent?.displayName
    || selectedInteractiveComponent?.componentKey
    || 'Interactive component';
  const interactiveRegistryDisabledReason = disabled
    ? 'Element editing is disabled.'
    : interactiveComponentsLoading
      ? ''
      : compatibleInteractiveComponents.length === 0
        ? 'No registry components are available for this block type.'
        : '';
  const interactiveRegistryAction = buildEditorActionStatus({
    label: 'Interactive registry selection',
    disabledReason: interactiveRegistryDisabledReason,
    busy: interactiveComponentsLoading,
    selected: Boolean(selectedInteractiveComponent),
    readyStatus: 'Interactive registry selection is available.',
    selectedStatus: `${selectedInteractiveComponentLabel} registry component selected.`,
    busyStatus: 'Interactive component registry is loading.',
  });
  const interactiveBindingPresetSummary = interactiveBindingPresets.length > 0
    ? `${interactiveBindingPresets.length} binding presets available.`
    : 'No binding presets available for the selected interactive component.';
  const interactiveControlSummary = interactiveControls.length > 0
    ? `${interactiveControls.length} schema controls available.`
    : 'No schema controls available for the selected interactive component.';
  const interactiveInspectorActionStatus = [
    interactiveRegistryAction.actionStatus,
    interactiveBindingPresetSummary,
    interactiveControlSummary,
  ].join(' ');
  const updateInteractiveControlValue = useCallback((controlKey: string, value: unknown) => {
    const control = interactiveControls.find((item) => getInteractiveControlKey(item) === controlKey);
    const normalizedValue = control ? normalizeInteractiveControlValue(control, value) : value;
    const nextControls = updateInteractiveControlList(interactiveControls, controlKey, normalizedValue);
    onChange({
      controls: nextControls,
      [controlKey]: normalizedValue,
    });
  }, [interactiveControls, onChange]);
  const applyInteractiveBindingPreset = useCallback((preset: { id: string; label: string; scope: string; targetPath: string; mode: string }) => {
    onChange({
      dataBindingPreset: {
        id: preset.id,
        label: preset.label,
        scope: preset.scope,
        targetPath: preset.targetPath,
        mode: preset.mode,
        componentKey: element.props.componentKey,
        version: element.props.version,
      },
      dataBindingTargetPath: preset.targetPath,
    });
  }, [element.props.componentKey, element.props.version, onChange]);
  const applyInteractiveRegistryComponent = useCallback((selectionValue: string) => {
    const component = compatibleInteractiveComponents.find((candidate) => (
      interactiveComponentOptionValue(candidate) === selectionValue
    ));
    if (!component) {
      onChange({ componentKey: selectionValue });
      return;
    }

    const fallbackTitle = interactiveFallback.title || element.props.title || component.displayName;
    const fallbackText = interactiveFallback.text || element.props.fallbackText || component.description || '';
    onChange({
      componentKey: component.componentKey,
      version: component.version,
      ...(component.renderMode === 'sandbox-iframe' && component.runtime?.sandboxUrl
        ? { sandboxUrl: component.runtime.sandboxUrl }
        : {}),
      controls: Array.isArray(component.controls) ? component.controls : [],
      fallback: {
        ...interactiveFallback,
        title: fallbackTitle,
        text: fallbackText,
        ariaLabel: interactiveFallback.ariaLabel || component.displayName,
      },
      title: fallbackTitle,
      fallbackText,
      renderCapabilities: {
        ...interactiveRenderCapabilities,
        hydrationMode: component.renderMode,
        requiresSandbox: component.renderMode === 'sandbox-iframe',
        requiresSignedBundle: component.integrity?.signatureRequiredForCustomCode === true,
        fallbackRequired: true,
        postMessageProtocol: 'backy.interactive-component.v1',
      },
      dataBindingPreset: undefined,
      dataBindingTargetPath: undefined,
    });
  }, [
    compatibleInteractiveComponents,
    element.props.fallbackText,
    element.props.title,
    interactiveFallback,
    interactiveRenderCapabilities,
    onChange,
  ]);
  const [formFieldsDraft, setFormFieldsDraft] = useState('');
  const [formFieldsError, setFormFieldsError] = useState('');
  const [formBuilderDraft, setFormBuilderDraft] = useState({
    key: '',
    label: '',
    type: 'text',
    placeholder: '',
    options: '',
    required: false,
  });
  const formBuilderFields = useMemo(
    () => normalizeFormBuilderFields(element.props.fields),
    [element.props.fields]
  );
  const updateTextContent = useCallback((content: unknown) => {
    onChange({
      content: content as ElementProps['content'],
    });
  }, [onChange]);
  const updatePropsWithAssetSync = useCallback((
    updates: Partial<ElementProps>,
    options: { staleAssetIds?: Array<unknown> } = {},
  ) => {
    const staleAssetIds = options.staleAssetIds || [];

    if (staleAssetIds.length > 0 && onElementChange) {
      const nextProps = { ...element.props, ...updates };
      onElementChange({
        props: nextProps,
        assetIds: buildElementAssetIds(element, nextProps, [], staleAssetIds),
      });
      return;
    }

    onChange(updates);
  }, [element, onChange, onElementChange]);
  useEffect(() => {
    // BackyTextProperties diagnostics disabled.
  }, [element.id, element.type, elementId, hasTextContent, hasImageContent, hasVideoContent, hasLinkContent, hasButtonContent, onChange]);
  useEffect(() => {
    setFormFieldsDraft(formatFormSchemaFields(element.props.fields));
    setFormFieldsError('');
  }, [element.id, element.props.fields]);
  useEffect(() => {
    setFormBuilderDraft({
      key: '',
      label: '',
      type: 'text',
      placeholder: '',
      options: '',
      required: false,
    });
  }, [element.id]);

  const updateFormFields = useCallback((fields: Record<string, any>[]) => {
    setFormFieldsDraft(formatFormSchemaFields(fields));
    setFormFieldsError('');
    onChange({ fields });
  }, [onChange]);

  const addOrUpdateFormBuilderField = useCallback(() => {
    const fallbackKey = formBuilderDraft.label || 'field';
    const key = normalizeFormFieldKey(formBuilderDraft.key || fallbackKey);
    const type = FORM_BUILDER_FIELD_TYPES.includes(formBuilderDraft.type as typeof FORM_BUILDER_FIELD_TYPES[number])
      ? formBuilderDraft.type
      : 'text';
    const options = parseBuilderOptions(formBuilderDraft.options);
    const nextField: Record<string, any> = {
      key,
      label: formBuilderDraft.label.trim() || key,
      type,
      ...(formBuilderDraft.placeholder.trim() ? { placeholder: formBuilderDraft.placeholder.trim() } : {}),
      ...(formBuilderDraft.required ? { required: true } : {}),
      ...((type === 'select' || type === 'checkbox' || type === 'radio') && options.length > 0 ? { options } : {}),
    };
    const existing = formBuilderFields.filter((field) => field.key !== key);
    updateFormFields([...existing, nextField]);
    setFormBuilderDraft({
      key: '',
      label: '',
      type: 'text',
      placeholder: '',
      options: '',
      required: false,
    });
  }, [formBuilderDraft, formBuilderFields, updateFormFields]);

  const removeFormBuilderField = useCallback((key: string) => {
    updateFormFields(formBuilderFields.filter((field) => field.key !== key));
  }, [formBuilderFields, updateFormFields]);
  const formBuilderActionStatusId = 'editor-form-builder-action-status';
  const formBuilderDraftKey = normalizeFormFieldKey(
    formBuilderDraft.key || formBuilderDraft.label || 'field',
  );
  const formBuilderDraftLabel = formBuilderDraft.label.trim() || formBuilderDraftKey;
  const formBuilderFieldExists = formBuilderFields.some((field) => field.key === formBuilderDraftKey);
  const formBuilderAddAction = buildEditorFormBuilderAction({
    label: formBuilderFieldExists ? 'Update form field' : 'Add form field',
    readyStatus: formBuilderFieldExists
      ? `Update ${formBuilderDraftLabel} in the form schema.`
      : `Add ${formBuilderDraftLabel} to the form schema.`,
  });
  const formBuilderActionSummary = [
    formBuilderAddAction.actionStatus,
    `${formBuilderFields.length} form field${formBuilderFields.length === 1 ? '' : 's'} in the schema.`,
  ].join(' ');

  return (
      <div className="space-y-3">
      <span
        id={mediaPickerActionStatusId}
        className="sr-only"
        data-testid="editor-media-picker-action-status"
      >
        Media picker buttons expose ready or blocked status for the selected editor element.
      </span>
      {/* Rich Text Controls */}
        {hasTextContent && (
          <RichTextFormatting
            elementId={elementId}
            elementContent={textElementContent}
            onElementContentChange={updateTextContent}
          />
        )}

      {/* Quote Properties */}
      {hasQuoteContent && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Citation
            </label>
            <input
              type="text"
              value={element.props.citation || ''}
              onChange={(e) => onChange({ citation: e.target.value })}
              data-testid="editor-quote-citation"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Author or source"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Border Color
            </label>
            <ColorInput
              value={element.props.quoteBorderColor || '#cbd5e1'}
              onChange={(value) => onChange({ quoteBorderColor: value })}
              testId="editor-quote-border-color"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Border Width
            </label>
            <NumberInput
              value={toNumber(element.props.quoteBorderWidth, 4)}
              onChange={(value) => onChange({ quoteBorderWidth: value })}
              suffix="px"
              testId="editor-quote-border-width"
            />
          </div>
        </div>
      )}

      {/* HTML/Table Properties */}
      {hasHtmlContent && (
        <div className="space-y-2">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            HTML previews in the admin editor use a sandboxed frame. Public output renders the saved markup.
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Markup
            </label>
            <textarea
              value={(element.props.html as string) || (element.props.content as string) || ''}
              onChange={(e) => onChange({ html: e.target.value })}
              data-testid="editor-html-markup"
              rows={8}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background font-mono resize-y',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder={'<div>Custom HTML</div>'}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Iframe title
            </label>
            <input
              type="text"
              value={element.props.title || ''}
              onChange={(e) => onChange({ title: e.target.value })}
              data-testid="editor-html-title"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="HTML preview"
            />
          </div>
        </div>
      )}

      {/* Image Source */}
      {hasImageContent && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Image Source
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={element.props.src || ''}
                onChange={(e) => onChange({ src: e.target.value })}
                data-testid="editor-image-src"
                className={cn(
                  'flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="https://example.com/image.jpg"
              />
              {renderMediaPickerButton({
                field: 'src',
                testId: 'editor-image-select-media',
                title: 'Select from Media Library',
                children: 'Select',
              })}
              {renderMediaPickerButton({
                field: 'src',
                mode: 'upload',
                testId: 'editor-image-upload-media',
                title: 'Upload media',
                children: 'Upload',
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Alt Text
            </label>
            <input
              type="text"
              value={element.props.alt || ''}
              onChange={(e) => onChange({ alt: e.target.value })}
              data-testid="editor-image-alt"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Image description"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Object Fit
            </label>
            <select
              value={element.props.objectFit || 'cover'}
              onChange={(e) => onChange({ objectFit: e.target.value as ElementProps['objectFit'] })}
              data-testid="editor-image-object-fit"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="fill">Fill</option>
              <option value="none">None</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Title
            </label>
            <input
              type="text"
              value={element.props.title || ''}
              onChange={(e) => onChange({ title: e.target.value })}
              data-testid="editor-image-title"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Optional tooltip title"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Object Position
            </label>
            <input
              type="text"
              value={element.props.objectPosition || ''}
              onChange={(e) => onChange({ objectPosition: e.target.value })}
              data-testid="editor-image-object-position"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="center center"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Loading
              </label>
              <select
                value={element.props.loading || 'lazy'}
                onChange={(e) => onChange({ loading: e.target.value })}
                data-testid="editor-image-loading"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="lazy">Lazy</option>
                <option value="eager">Eager</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Decoding
              </label>
              <select
                value={element.props.decoding || 'auto'}
                onChange={(e) => onChange({ decoding: e.target.value })}
                data-testid="editor-image-decoding"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="auto">Auto</option>
                <option value="async">Async</option>
                <option value="sync">Sync</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Referrer Policy
            </label>
            <select
              value={element.props.referrerPolicy || ''}
              onChange={(e) => onChange({ referrerPolicy: e.target.value || undefined })}
              data-testid="editor-image-referrer-policy"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="">Browser default</option>
              <option value="no-referrer">No referrer</option>
              <option value="no-referrer-when-downgrade">No referrer when downgrade</option>
              <option value="origin">Origin</option>
              <option value="origin-when-cross-origin">Origin when cross-origin</option>
              <option value="same-origin">Same origin</option>
              <option value="strict-origin">Strict origin</option>
              <option value="strict-origin-when-cross-origin">Strict origin when cross-origin</option>
              <option value="unsafe-url">Unsafe URL</option>
            </select>
          </div>
        </div>
      )}

      {/* Video Source */}
      {hasVideoContent && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Video URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={element.props.src || ''}
                onChange={(e) => onChange({ src: e.target.value })}
                data-testid="editor-video-src"
                className={cn(
                  'flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="https://example.com/video.mp4"
              />
              {renderMediaPickerButton({
                field: 'video',
                testId: 'editor-video-select-media',
                title: 'Select from Media Library',
                children: 'Select',
              })}
              {renderMediaPickerButton({
                field: 'video',
                mode: 'upload',
                testId: 'editor-video-upload-media',
                title: 'Upload video',
                children: 'Upload',
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Enter a direct video URL (.mp4, .webm)
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Poster Image URL
            </label>
            <input
              type="text"
              value={element.props.poster || ''}
              onChange={(e) => onChange({ poster: e.target.value })}
              data-testid="editor-video-poster"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="https://example.com/poster.jpg"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Object Fit
            </label>
            <select
              value={element.props.objectFit || 'cover'}
              onChange={(e) => onChange({ objectFit: e.target.value as ElementProps['objectFit'] })}
              data-testid="editor-video-object-fit"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="fill">Fill</option>
              <option value="none">None</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'controls', label: 'Show controls', fallback: true },
              { key: 'autoplay', label: 'Autoplay', fallback: false },
              { key: 'loop', label: 'Loop', fallback: false },
              { key: 'muted', label: 'Muted', fallback: false },
              { key: 'playsInline', label: 'Play inline', fallback: true },
            ].map((setting) => (
              <label key={setting.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={parseBooleanSetting(element.props[setting.key], setting.fallback)}
                  onChange={(e) => onChange({ [setting.key]: e.target.checked })}
                  data-testid={`editor-video-${setting.key}`}
                  className="rounded"
                />
                {setting.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Link Properties */}
      {hasLinkContent && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Link Text
            </label>
            <input
              type="text"
              value={typeof element.props.content === 'string' ? element.props.content : ''}
              onChange={(e) => onChange({ content: e.target.value })}
              data-testid="editor-link-text"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Click here"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Link URL
            </label>
            <div className="space-y-2">
              <select
                data-testid="editor-link-page-select"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                onChange={(e) => {
                  if (e.target.value) {
                    updatePropsWithAssetSync({
                      ...clearDownloadFileProps(),
                      actionPreset: 'page',
                      actionValue: e.target.value,
                      href: e.target.value,
                      download: false,
                    }, {
                      staleAssetIds: downloadFileAssetIdsFromProps(element.props),
                    });
                  }
                }}
              >
                <option value="">Select a page...</option>
                <option value="/">Home (/)</option>
                <option value="/about">About Us (/about)</option>
                <option value="/services">Services (/services)</option>
                <option value="/contact">Contact (/contact)</option>
              </select>
              <input
                type="text"
                value={element.props.href || ''}
                onChange={(e) => updatePropsWithAssetSync({
                  ...clearDownloadFileProps(),
                  actionPreset: 'custom',
                  actionValue: e.target.value,
                  href: e.target.value,
                  download: false,
                }, {
                  staleAssetIds: downloadFileAssetIdsFromProps(element.props),
                })}
                data-testid="editor-link-href"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="https:// or /path"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="underline"
              checked={element.props.underline || false}
              onChange={(e) => onChange({ underline: e.target.checked })}
              data-testid="editor-link-underline"
              className="rounded"
            />
            <label htmlFor="underline" className="text-sm">Underline</label>
          </div>
          <LinkBehaviorProperties
            prefix="link"
            props={element.props}
            onChange={updatePropsWithAssetSync}
            onOpenDownloadMedia={(mode, openerTestId) => onOpenMedia('downloadFile', mode, openerTestId)}
            mediaPickerStatusId={mediaPickerActionStatusId}
            mediaPickerDisabled={disabled}
            canViewMedia={canViewMedia}
            canCreateMedia={canCreateMedia}
            mediaViewDisabledReason={mediaViewDisabledReason}
            mediaCreateDisabledReason={mediaCreateDisabledReason}
            disabled={disabled}
          />
        </div>
      )}

      {/* Button Properties */}
      {hasButtonContent && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Button Label
            </label>
            <input
              type="text"
              value={element.props.label || ''}
              onChange={(e) => onChange({ label: e.target.value })}
              data-testid="editor-button-label"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Click Me"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Link URL (optional)
            </label>
            <div className="space-y-2">
              <select
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                onChange={(e) => {
                  if (e.target.value) {
                    updatePropsWithAssetSync({
                      ...clearDownloadFileProps(),
                      actionPreset: 'page',
                      actionValue: e.target.value,
                      href: e.target.value,
                      download: false,
                    }, {
                      staleAssetIds: downloadFileAssetIdsFromProps(element.props),
                    });
                  }
                }}
              >
                <option value="">Select a page...</option>
                <option value="/">Home (/)</option>
                <option value="/about">About Us (/about)</option>
                <option value="/services">Services (/services)</option>
                <option value="/contact">Contact (/contact)</option>
              </select>
              <input
                type="text"
                value={element.props.href || ''}
                onChange={(e) => updatePropsWithAssetSync({
                  ...clearDownloadFileProps(),
                  actionPreset: 'custom',
                  actionValue: e.target.value,
                  href: e.target.value,
                  download: false,
                }, {
                  staleAssetIds: downloadFileAssetIdsFromProps(element.props),
                })}
                data-testid="editor-button-href"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="https://example.com"
              />
            </div>
          </div>
          <LinkBehaviorProperties
            prefix="button"
            props={element.props}
            onChange={updatePropsWithAssetSync}
            onOpenDownloadMedia={(mode, openerTestId) => onOpenMedia('downloadFile', mode, openerTestId)}
            includeButtonType
            mediaPickerStatusId={mediaPickerActionStatusId}
            mediaPickerDisabled={disabled}
            canViewMedia={canViewMedia}
            canCreateMedia={canCreateMedia}
            mediaViewDisabledReason={mediaViewDisabledReason}
            mediaCreateDisabledReason={mediaCreateDisabledReason}
            disabled={disabled}
          />
        </div>
      )}

      {/* Navigation Properties */}
      {hasNavContent && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Menu source
            </label>
            <select
              value={currentNavigationSourceOption.value}
              onChange={(e) => updateNavigationWithSyncedLinks(
                navigationSourceProps(e.target.value as NavigationSource),
              )}
              data-testid="editor-nav-source"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              {NAVIGATION_SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div
              className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground"
              data-testid="editor-nav-binding-status"
              data-navigation-source={currentNavigationSourceOption.value}
              data-navigation-binding={currentNavigationSourceOption.binding}
              data-navigation-chrome-role={currentNavigationSourceOption.chromeRole}
            >
              <div className="font-mono text-[11px] text-foreground">
                {currentNavigationSourceOption.binding}
              </div>
              <div>{currentNavigationSourceOption.description}</div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Each line becomes a menu item. Use <span className="font-mono">Label: /path</span> when a frontend route is known.
          </div>
          <div
            className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2"
            data-testid={element.children?.length ? 'editor-nav-editable-link-layers' : 'editor-nav-link-layer-upgrade'}
            data-nav-link-layer-count={element.children?.length || 0}
            data-nav-link-layer-sync="items-direction-gap-auto-sync"
            data-nav-link-layer-id-policy="preserve-existing-link-child-ids"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-xs leading-5 text-sky-900">
                <p className="font-semibold">
                  {element.children?.length ? 'Editable link layers are active.' : 'Turn menu items into editable link layers.'}
                </p>
                <p className="text-sky-700">
                  {element.children?.length
                    ? 'Each nav link can be selected, positioned, styled, and assigned its own URL from the layer map.'
                    : 'Create selectable child links so navigation works like canvas elements instead of one opaque text block.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onElementChange?.({ children: buildNavigationLinkChildren(element) })}
                disabled={disabled}
                data-testid={element.children?.length ? 'editor-nav-rebuild-link-layers' : 'editor-nav-convert-link-layers'}
                className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-white px-2.5 text-xs font-semibold text-sky-800 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {element.children?.length ? 'Rebuild' : 'Create links'}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Navigation items
            </label>
            <textarea
              value={formatNavigationItems(element.props.navItems)}
              onChange={(e) => updateNavigationWithSyncedLinks({ navItems: parseNavigationItems(e.target.value) })}
              data-testid="editor-nav-items"
              rows={5}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background resize-none',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder={'Home: /\nShop: /shop\nContact: /contact'}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Direction
              </label>
              <select
                value={element.props.navDirection || 'horizontal'}
                onChange={(e) => updateNavigationWithSyncedLinks({ navDirection: e.target.value })}
                data-testid="editor-nav-direction"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Gap
              </label>
              <input
                type="number"
                min={0}
                value={toNumber(element.props.gap, 18)}
                onChange={(e) => updateNavigationWithSyncedLinks({ gap: e.target.value === '' ? 0 : Number(e.target.value) })}
                data-testid="editor-nav-gap"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Accessibility label
            </label>
            <input
              type="text"
              value={element.props.ariaLabel || ''}
              onChange={(e) => onChange({ ariaLabel: e.target.value })}
              data-testid="editor-nav-aria-label"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Primary navigation"
            />
          </div>
        </div>
      )}

      {/* Form Field Properties */}
      {hasFormFieldContent && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Field Label
            </label>
            <input
              type="text"
              value={element.props.label || ''}
              onChange={(e) => onChange({ label: e.target.value })}
              data-testid="editor-field-label"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Full name"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Field Name (submission key)
            </label>
            <input
              type="text"
              value={element.props.name || ''}
              onChange={(e) => onChange({ name: e.target.value })}
              data-testid="editor-field-name"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="name, email, message"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Submit to Form ID
            </label>
            <input
              type="text"
              value={(element.props.formOwnerId as string) || (element.props.formId as string) || ''}
              onChange={(e) => onChange({ formOwnerId: e.target.value.trim() || undefined })}
              data-testid="editor-field-form-owner-id"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="contact_form"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                id={`required-${element.id}`}
                checked={parseBooleanSetting(element.props.required)}
                onChange={(e) => onChange({ required: e.target.checked })}
                data-testid="editor-field-required"
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                id={`disabled-${element.id}`}
                checked={parseBooleanSetting(element.props.disabled)}
                onChange={(e) => onChange({ disabled: e.target.checked })}
                data-testid="editor-field-disabled"
              />
              Disabled
            </label>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Placeholder
            </label>
            <input
              type="text"
              value={element.props.placeholder || ''}
              onChange={(e) => onChange({ placeholder: e.target.value })}
              data-testid="editor-field-placeholder"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Enter placeholder text"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Help Text
            </label>
            <input
              type="text"
              value={element.props.helpText || ''}
              onChange={(e) => onChange({ helpText: e.target.value })}
              data-testid="editor-field-help-text"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Optional helper text"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Field Gap
              </label>
              <NumberInput
                value={element.props.fieldGap ?? 6}
                onChange={(value) => onChange({ fieldGap: value })}
                suffix="px"
                testId="editor-field-gap"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Label Size
              </label>
              <NumberInput
                value={element.props.labelFontSize ?? 14}
                onChange={(value) => onChange({ labelFontSize: value })}
                suffix="px"
                testId="editor-field-label-font-size"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Label Color
              </label>
              <ColorInput
                value={(element.props.labelColor as string) || (element.props.color as string) || '#374151'}
                onChange={(value) => onChange({ labelColor: value })}
                testId="editor-field-label-color"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Help Color
              </label>
              <ColorInput
                value={(element.props.helpTextColor as string) || '#6b7280'}
                onChange={(value) => onChange({ helpTextColor: value })}
                testId="editor-field-help-color"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Label Weight
              </label>
              <select
                value={(element.props.labelFontWeight as string) || '500'}
                onChange={(e) => onChange({ labelFontWeight: e.target.value })}
                data-testid="editor-field-label-font-weight"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="400">Regular</option>
                <option value="500">Medium</option>
                <option value="600">Semibold</option>
                <option value="700">Bold</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Help Size
              </label>
              <NumberInput
                value={element.props.helpTextFontSize ?? 12}
                onChange={(value) => onChange({ helpTextFontSize: value })}
                suffix="px"
                testId="editor-field-help-font-size"
              />
            </div>
          </div>

          {normalizedType === 'input' && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Input Type
                </label>
                <select
                  value={element.props.inputType || 'text'}
                  onChange={(e) => onChange({ inputType: e.target.value as ElementProps['inputType'] })}
                  data-testid="editor-input-type"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  <option value="text">Text</option>
                  <option value="email">Email</option>
                  <option value="password">Password</option>
                  <option value="number">Number</option>
                  <option value="search">Search</option>
                  <option value="file">File</option>
                  <option value="date">Date</option>
                  <option value="tel">Phone</option>
                  <option value="url">URL</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Validation Pattern (regex)
                </label>
                <input
                  type="text"
                  value={(element.props.pattern as string) || ''}
                  onChange={(e) => onChange({ pattern: e.target.value })}
                  data-testid="editor-input-pattern"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="e.g. ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Min length
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={(element.props.minLength as number) || ''}
                    onChange={(e) => onChange({ minLength: e.target.value === '' ? undefined : Number(e.target.value) })}
                    data-testid="editor-input-min-length"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Max length
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={(element.props.maxLength as number) || ''}
                    onChange={(e) => onChange({ maxLength: e.target.value === '' ? undefined : Number(e.target.value) })}
                    data-testid="editor-input-max-length"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Min
                  </label>
                  <input
                    type="text"
                    value={(element.props.min as string) || ''}
                    onChange={(e) => onChange({ min: e.target.value || undefined })}
                    data-testid="editor-input-min"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Max
                  </label>
                  <input
                    type="text"
                    value={(element.props.max as string) || ''}
                    onChange={(e) => onChange({ max: e.target.value || undefined })}
                    data-testid="editor-input-max"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                    placeholder="100"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Step
                  </label>
                  <input
                    type="text"
                    value={(element.props.step as string) || ''}
                    onChange={(e) => onChange({ step: e.target.value || undefined })}
                    data-testid="editor-input-step"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                    placeholder="1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Default Value
                </label>
                <input
                  type="text"
                  value={element.props.defaultValue || ''}
                  onChange={(e) => onChange({ defaultValue: e.target.value })}
                  data-testid="editor-input-default-value"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="Initial field value"
                />
              </div>
            </>
          )}

          {normalizedType === 'textarea' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Rows
                  </label>
                  <input
                    type="number"
                    min={2}
                    value={element.props.rows || 4}
                    onChange={(e) =>
                      onChange({ rows: e.target.value ? Number(e.target.value) : 4 })
                    }
                    data-testid="editor-textarea-rows"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Max Length
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={(element.props.maxLength as number) || ''}
                    onChange={(e) => onChange({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
                    data-testid="editor-textarea-max-length"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Min Length
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={(element.props.minLength as number) || ''}
                    onChange={(e) => onChange({ minLength: e.target.value ? Number(e.target.value) : undefined })}
                    data-testid="editor-textarea-min-length"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Resize
                </label>
                <select
                  value={(element.props.resize as string) || 'vertical'}
                  onChange={(e) => onChange({ resize: e.target.value })}
                  data-testid="editor-textarea-resize"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  <option value="vertical">Vertical</option>
                  <option value="horizontal">Horizontal</option>
                  <option value="both">Both</option>
                  <option value="none">None</option>
                  <option value="block">Block</option>
                  <option value="inline">Inline</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Default Value
                </label>
                <input
                  type="text"
                  value={element.props.defaultValue || ''}
                  onChange={(e) => onChange({ defaultValue: e.target.value })}
                  data-testid="editor-textarea-default-value"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="Default text"
                />
              </div>
            </>
          )}

          {(normalizedType === 'select' || normalizedType === 'checkbox' || normalizedType === 'radio') && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Options (one per line)
              </label>
              <textarea
                value={fieldOptionsText}
                onChange={(event) => onChange({
                  options: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean),
                })}
                rows={4}
                data-testid="editor-field-options"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background resize-none',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder={'Option A\nOption B'}
              />
            </div>
          )}

          {normalizedType === 'select' && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Default selected option
              </label>
              <input
                type="text"
                value={element.props.defaultValue || ''}
                onChange={(e) => onChange({ defaultValue: e.target.value })}
                data-testid="editor-select-default-value"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="Option value"
              />
            </div>
          )}

          {(normalizedType === 'checkbox' || normalizedType === 'radio') && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Default Value / option
              </label>
              <input
                type="text"
                value={(element.props.value || element.props.defaultValue || '') as string}
                onChange={(e) => onChange({ value: e.target.value, defaultValue: e.target.value })}
                data-testid="editor-choice-value"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="first option"
              />
            </div>
          )}
        </div>
      )}

      {/* List Properties */}
      {hasListContent && (
        <div className="space-y-2">
          {(() => {
            const listType = (element.props.listType as 'bullet' | 'number') || 'bullet';
            const listMarker = (element.props.listMarker as string) || (listType === 'number' ? 'decimal' : 'disc');

            return (
              <>
                <div className="text-xs text-muted-foreground">
                  Tip: List content is editable directly on canvas. Use this section for quick import/edit fallback.
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    List Type
                  </label>
                  <select
                    value={listType}
                    onChange={(e) => {
                      const nextListType = e.target.value === 'number' ? 'number' : 'bullet';
                      const nextMarker = nextListType === 'number' ? 'decimal' : 'disc';
                      onChange({
                        listType: nextListType,
                        listMarker: nextMarker,
                        items: listItems,
                        content: buildListContentFromItems(listItems, nextListType),
                      });
                    }}
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                    data-testid="editor-list-type"
                  >
                    <option value="bullet">Bullet</option>
                    <option value="number">Numbered</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    List Marker
                  </label>
                  <select
                    value={listMarker}
                    onChange={(e) =>
                      onChange({ listMarker: e.target.value as
                        | 'disc'
                        | 'circle'
                        | 'square'
                        | 'decimal'
                        | 'lower-alpha'
                        | 'upper-alpha'
                        | 'lower-roman'
                        | 'upper-roman'
                      })
                    }
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                    data-testid="editor-list-marker"
                  >
                    <option value="disc">Disc (•)</option>
                    <option value="circle">Circle (◦)</option>
                    <option value="square">Square (▢)</option>
                    <option value="decimal">Numbered (1.)</option>
                    <option value="lower-alpha">Lower alpha (a.)</option>
                    <option value="upper-alpha">Upper alpha (A.)</option>
                    <option value="lower-roman">Lower roman (i.)</option>
                    <option value="upper-roman">Upper roman (I.)</option>
                  </select>
                </div>
              </>
            );
          })()}

          
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              List Indent (px)
            </label>
            <input
              type="number"
              min={0}
              value={toNumber(element.props.listIndent, 0)}
              onChange={(e) => onChange({ listIndent: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value) || 0) })}
              data-testid="editor-list-indent"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Items (one per line)
            </label>
            <textarea
              value={listItems.join('\n')}
              onChange={(e) => {
                const nextItems = e.target.value
                  .split('\n')
                  .map((item) => item.trimEnd());
                onChange({
                  listType: (element.props.listType as 'bullet' | 'number') || 'bullet',
                  items: nextItems,
                  content: buildListContentFromItems(
                    nextItems,
                    ((element.props.listType as 'bullet' | 'number') || 'bullet')
                  ),
                });
              }}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring resize-none'
              )}
              data-testid="editor-list-items"
              rows={4}
            />
          </div>
        </div>
      )}

      {/* Heading Level */}
      {element.type === 'heading' && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Level
          </label>
          <select
            value={element.props.level || 'h2'}
            onChange={(e) =>
              onChange({ level: e.target.value as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' })
            }
            data-testid="editor-heading-level"
            className={cn(
              'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          >
            <option value="h1">H1</option>
            <option value="h2">H2</option>
            <option value="h3">H3</option>
            <option value="h4">H4</option>
            <option value="h5">H5</option>
            <option value="h6">H6</option>
          </select>
        </div>
      )}

      {/* Form Properties */}
      {/* Form Container Properties */}
      {hasFormContent && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Form Title
            </label>
            <input
              type="text"
              value={element.props.formTitle || ''}
              onChange={(e) => onChange({ formTitle: e.target.value })}
              data-testid="editor-form-title"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Contact Form"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Form Id
            </label>
            <input
              type="text"
              value={element.props.formId || ''}
              onChange={(e) => onChange({ formId: e.target.value })}
              data-testid="editor-form-id"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="form-contact"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Field schema JSON
            </label>
            <textarea
              value={formFieldsDraft}
              onChange={(e) => {
                setFormFieldsDraft(e.target.value);
                const parsed = parseFormSchemaFieldsInput(e.target.value);
                if (parsed !== undefined) {
                  setFormFieldsError('');
                  onChange({ fields: parsed });
                } else {
                  setFormFieldsError('Enter a valid JSON array or object.');
                }
              }}
              data-testid="editor-form-fields"
              className={cn(
                'min-h-[156px] w-full px-2 py-1.5 text-sm rounded-md border bg-background font-mono',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder={'[\n  { "key": "email", "label": "Email", "type": "email", "required": true }\n]'}
            />
            {formFieldsError ? (
              <p className="mt-1 text-xs text-destructive" data-testid="editor-form-fields-error">
                {formFieldsError}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Supports key, label, type, placeholder, helpText, options, required, defaultValue, and validation.
            </p>
          </div>
          <div
            className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
            data-testid="editor-form-builder"
            data-form-field-count={formBuilderFields.length}
          >
            <span
              id={formBuilderActionStatusId}
              className="sr-only"
              data-testid="editor-form-builder-action-status"
              aria-live="polite"
            >
              {formBuilderActionSummary}
            </span>
            <div className="text-xs font-medium text-foreground">Field builder</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Key
                </label>
                <input
                  type="text"
                  value={formBuilderDraft.key}
                  onChange={(e) => setFormBuilderDraft((draft) => ({ ...draft, key: e.target.value }))}
                  data-testid="editor-form-builder-key"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="company"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Type
                </label>
                <select
                  value={formBuilderDraft.type}
                  onChange={(e) => setFormBuilderDraft((draft) => ({ ...draft, type: e.target.value }))}
                  data-testid="editor-form-builder-type"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  {FORM_BUILDER_FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Label
              </label>
              <input
                type="text"
                value={formBuilderDraft.label}
                onChange={(e) => setFormBuilderDraft((draft) => ({ ...draft, label: e.target.value }))}
                data-testid="editor-form-builder-label"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="Company"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Placeholder
              </label>
              <input
                type="text"
                value={formBuilderDraft.placeholder}
                onChange={(e) => setFormBuilderDraft((draft) => ({ ...draft, placeholder: e.target.value }))}
                data-testid="editor-form-builder-placeholder"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="Acme Inc."
              />
            </div>
            {(formBuilderDraft.type === 'select' || formBuilderDraft.type === 'checkbox' || formBuilderDraft.type === 'radio') ? (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Options
                </label>
                <textarea
                  value={formBuilderDraft.options}
                  onChange={(e) => setFormBuilderDraft((draft) => ({ ...draft, options: e.target.value }))}
                  rows={3}
                  data-testid="editor-form-builder-options"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background resize-none',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder={'Starter\nGrowth'}
                />
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={formBuilderDraft.required}
                onChange={(e) => setFormBuilderDraft((draft) => ({ ...draft, required: e.target.checked }))}
                data-testid="editor-form-builder-required"
              />
              Required
            </label>
            <button
              type="button"
              onClick={addOrUpdateFormBuilderField}
              title={formBuilderAddAction.actionStatus}
              aria-describedby={formBuilderActionStatusId}
              data-action-state={formBuilderAddAction.actionState}
              data-action-status={formBuilderAddAction.actionStatus}
              data-target-field-key={formBuilderDraftKey}
              data-form-field-mode={formBuilderFieldExists ? 'update' : 'add'}
              data-testid="editor-form-builder-add-field"
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs font-medium',
                'bg-background hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              Add/update field
            </button>
            {formBuilderFields.length > 0 ? (
              <div className="space-y-1" data-testid="editor-form-builder-fields">
                {formBuilderFields.map((field) => {
                  const removeFieldAction = buildEditorFormBuilderAction({
                    label: `Remove ${field.label || field.key}`,
                    readyStatus: `Remove ${field.label || field.key} from the form schema.`,
                  });

                  return (
                    <div
                      key={field.key}
                      data-testid="editor-form-builder-field"
                      data-field-key={field.key}
                      className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        {field.label} <span className="text-muted-foreground">({field.key}, {field.type})</span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${field.key}`}
                        onClick={() => removeFormBuilderField(field.key)}
                        title={removeFieldAction.actionStatus}
                        aria-describedby={formBuilderActionStatusId}
                        data-action-state={removeFieldAction.actionState}
                        data-action-status={removeFieldAction.actionStatus}
                        data-target-field-key={field.key}
                        data-testid={`editor-form-builder-remove-${field.key}`}
                        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Submit button label
            </label>
            <input
              type="text"
              value={element.props.submitLabel || ''}
              onChange={(e) => onChange({ submitLabel: e.target.value })}
              data-testid="editor-form-submit-label"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Submit"
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground">Form appearance</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Label Color
                </label>
                <ColorInput
                  value={(element.props.labelColor as string) || (element.props.color as string) || '#374151'}
                  onChange={(value) => onChange({ labelColor: value })}
                  testId="editor-form-label-color"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Help Color
                </label>
                <ColorInput
                  value={(element.props.helpTextColor as string) || '#6b7280'}
                  onChange={(value) => onChange({ helpTextColor: value })}
                  testId="editor-form-help-color"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Field Background
                </label>
                <ColorInput
                  value={(element.props.fieldBackgroundColor as string) || '#ffffff'}
                  onChange={(value) => onChange({ fieldBackgroundColor: value })}
                  testId="editor-form-field-background-color"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Field Border
                </label>
                <ColorInput
                  value={(element.props.fieldBorderColor as string) || '#d1d5db'}
                  onChange={(value) => onChange({ fieldBorderColor: value })}
                  testId="editor-form-field-border-color"
                />
              </div>
            </div>
            <NumberInput
              label="Field Radius"
              value={element.props.fieldBorderRadius ?? 6}
              onChange={(value) => onChange({ fieldBorderRadius: value })}
              suffix="px"
              testId="editor-form-field-border-radius"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Submit Background
                </label>
                <ColorInput
                  value={(element.props.submitBackgroundColor as string) || '#111827'}
                  onChange={(value) => onChange({ submitBackgroundColor: value })}
                  testId="editor-form-submit-background-color"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Submit Text
                </label>
                <ColorInput
                  value={(element.props.submitColor as string) || '#ffffff'}
                  onChange={(value) => onChange({ submitColor: value })}
                  testId="editor-form-submit-color"
                />
              </div>
            </div>
            <NumberInput
              label="Submit Radius"
              value={element.props.submitBorderRadius ?? element.props.borderRadius ?? 8}
              onChange={(value) => onChange({ submitBorderRadius: value })}
              suffix="px"
              testId="editor-form-submit-border-radius"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={element.props.formActive !== false && String(element.props.formActive || '').toLowerCase() !== 'false'}
              onChange={(e) => onChange({ formActive: e.target.checked })}
              data-testid="editor-form-active"
            />
            Active for public submissions
          </label>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Audience
            </label>
            <select
              value={element.props.formAudience || 'public'}
              onChange={(e) => onChange({ formAudience: e.target.value as 'public' | 'authenticated' | 'adminOnly' })}
              data-testid="editor-form-audience"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="public">Public</option>
              <option value="authenticated">Authenticated users</option>
              <option value="adminOnly">Admin only</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Submit Action URL
            </label>
            <input
              type="text"
              value={element.props.actionUrl || element.props.action || ''}
              onChange={(e) => onChange({ actionUrl: e.target.value })}
              data-testid="editor-form-action-url"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="https://api.example.com/submit"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              HTTP Method
            </label>
            <select
              value={element.props.method || 'POST'}
              onChange={(e) => onChange({ method: e.target.value as 'GET' | 'POST' | 'PUT' })}
              data-testid="editor-form-method"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
              <option value="PUT">PUT</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground mb-1 block">
              Success Message
            </label>
            <input
              type="text"
              value={element.props.successMessage || ''}
              onChange={(e) => onChange({ successMessage: e.target.value })}
              data-testid="editor-form-success-message"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Thanks. Your message was sent."
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground mb-1 block">
              Success Redirect URL
            </label>
            <input
              type="text"
              value={element.props.successRedirectUrl || element.props.redirectUrl || ''}
              onChange={(e) =>
                onChange({
                  successRedirectUrl: e.target.value,
                  redirectUrl: e.target.value,
                })
              }
              data-testid="editor-form-success-redirect-url"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="https://example.com/thank-you"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Notification email
            </label>
            <input
              type="email"
              value={element.props.notificationEmail || ''}
              onChange={(e) => onChange({ notificationEmail: e.target.value })}
              data-testid="editor-form-notification-email"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="ops@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Notification webhook
            </label>
            <input
              type="url"
              value={element.props.notificationWebhook || ''}
              onChange={(e) => onChange({ notificationWebhook: e.target.value })}
              data-testid="editor-form-notification-webhook"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="https://hooks.example.com/form"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.enableHoneypot)}
              onChange={(e) => onChange({ enableHoneypot: e.target.checked })}
              data-testid="editor-form-enable-honeypot"
            />
            Enable spam protection (honeypot)
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.enableCaptcha)}
              onChange={(e) => onChange({ enableCaptcha: e.target.checked })}
              data-testid="editor-form-enable-captcha"
            />
            Require captcha challenge
          </label>
          {parseBooleanSetting(element.props.enableCaptcha) && (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Captcha provider
                </label>
                <select
                  value={element.props.captchaProvider || 'turnstile'}
                  onChange={(e) => onChange({ captchaProvider: e.target.value })}
                  data-testid="editor-form-captcha-provider"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  <option value="turnstile">Turnstile</option>
                  <option value="hcaptcha">hCaptcha</option>
                  <option value="recaptcha">reCAPTCHA</option>
                  <option value="mock">Mock/dev</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Site key
                </label>
                <input
                  type="text"
                  value={element.props.captchaSiteKey || ''}
                  onChange={(e) => onChange({ captchaSiteKey: e.target.value })}
                  data-testid="editor-form-captcha-site-key"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="0x4AAAA..."
                />
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Moderation mode
            </label>
            <select
              value={element.props.moderationMode || 'manual'}
              onChange={(e) => onChange({ moderationMode: e.target.value as 'manual' | 'auto-approve' })}
              data-testid="editor-form-moderation-mode"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="manual">Manual review</option>
              <option value="auto-approve">Auto-approve</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.contactShareEnabled)}
              onChange={(e) => onChange({ contactShareEnabled: e.target.checked })}
              data-testid="editor-form-contact-share-enabled"
            />
            Enable lead/share capture on approve
          </label>
          {parseBooleanSetting(element.props.contactShareEnabled) && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Name field key
                </label>
                <input
                  type="text"
                  value={element.props.contactShareNameField || ''}
                  onChange={(e) => onChange({ contactShareNameField: e.target.value })}
                  data-testid="editor-form-contact-share-name-field"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="name"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Email field key
                </label>
                <input
                  type="text"
                  value={element.props.contactShareEmailField || ''}
                  onChange={(e) => onChange({ contactShareEmailField: e.target.value })}
                  data-testid="editor-form-contact-share-email-field"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="email"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Phone field key
                </label>
                <input
                  type="text"
                  value={element.props.contactSharePhoneField || ''}
                  onChange={(e) => onChange({ contactSharePhoneField: e.target.value })}
                  data-testid="editor-form-contact-share-phone-field"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="phone"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Notes field key
                </label>
                <input
                  type="text"
                  value={element.props.contactShareNotesField || ''}
                  onChange={(e) => onChange({ contactShareNotesField: e.target.value })}
                  data-testid="editor-form-contact-share-notes-field"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="message"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={parseBooleanSetting(element.props.contactShareDedupeByEmail, true)}
                  onChange={(e) => onChange({ contactShareDedupeByEmail: e.target.checked })}
                  data-testid="editor-form-contact-share-dedupe-by-email"
                />
                Deduplicate contacts by email
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.collectionWriteEnabled)}
              onChange={(e) => onChange({ collectionWriteEnabled: e.target.checked })}
              data-testid="editor-form-collection-write-enabled"
            />
            Create draft collection record on submit
          </label>
          {parseBooleanSetting(element.props.collectionWriteEnabled) && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Target collection
                </label>
                <select
                  value={element.props.collectionWriteCollectionId || ''}
                  onChange={(e) => onChange({ collectionWriteCollectionId: e.target.value })}
                  data-testid="editor-form-collection-write-collection"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  <option value="">Select collection...</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
                {collectionsError && (
                  <p className="mt-1 text-xs text-amber-600">{collectionsError}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Slug source field
                </label>
                <input
                  type="text"
                  value={element.props.collectionWriteSlugField || ''}
                  onChange={(e) => onChange({ collectionWriteSlugField: e.target.value })}
                  data-testid="editor-form-collection-write-slug-field"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="title"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Field map
                </label>
                <textarea
                  value={formatFieldMap(element.props.collectionWriteFieldMap)}
                  onChange={(e) => onChange({ collectionWriteFieldMap: parseFieldMapInput(e.target.value) })}
                  data-testid="editor-form-collection-write-field-map"
                  className={cn(
                    'min-h-[80px] w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder={'formField: collectionField\nmessage: summary'}
                />
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Note: Drag input + button elements into the form area
          </p>
          <p className="text-xs text-muted-foreground">
            Tip: Point action URL to your API/edge handler for comment, lead, or order capture.
          </p>
        </div>
      )}

      {/* Comment Block Properties */}
      {hasCommentContent && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Block Title
            </label>
            <input
              type="text"
              value={element.props.commentTitle || ''}
              onChange={(e) => onChange({ commentTitle: e.target.value })}
              data-testid="editor-comment-title"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Comments"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Moderation mode
            </label>
            <select
              value={element.props.commentModerationMode || 'manual'}
              onChange={(e) => onChange({ commentModerationMode: e.target.value as 'manual' | 'auto-approve' })}
              data-testid="editor-comment-moderation-mode"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="manual">Manual review</option>
              <option value="auto-approve">Auto-approve</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.commentRequireName, true)}
              onChange={(e) => onChange({ commentRequireName: e.target.checked })}
              data-testid="editor-comment-require-name"
            />
            Require comment author name
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.commentRequireEmail, false)}
              onChange={(e) => onChange({ commentRequireEmail: e.target.checked })}
              data-testid="editor-comment-require-email"
            />
            Require author email
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.commentAllowGuests, true)}
              onChange={(e) => onChange({ commentAllowGuests: e.target.checked })}
              data-testid="editor-comment-allow-guests"
            />
            Allow guests
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.commentAllowReplies, true)}
              onChange={(e) => onChange({ commentAllowReplies: e.target.checked })}
              data-testid="editor-comment-allow-replies"
            />
            Allow replies
          </label>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Sort order
            </label>
            <select
              value={element.props.commentSortOrder || 'newest'}
              onChange={(e) => onChange({ commentSortOrder: e.target.value as 'newest' | 'oldest' })}
              data-testid="editor-comment-sort-order"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>
      )}

      {/* Interactive Component Properties */}
      {hasInteractiveContent && (
        <div className="space-y-3">
          <span
            id={interactiveActionStatusId}
            className="sr-only"
            data-testid="editor-interactive-action-status"
            aria-live="polite"
          >
            {interactiveInspectorActionStatus}
          </span>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Interactive blocks hydrate in the public frontend from Backy's component registry. The editor and unsupported clients render the saved fallback.
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Registry component
            </label>
            <select
              value={selectedInteractiveComponentValue}
              onChange={(e) => applyInteractiveRegistryComponent(e.target.value)}
              data-testid="editor-interactive-registry-component"
              aria-describedby={interactiveActionStatusId}
              disabled={interactiveComponentsLoading || Boolean(interactiveRegistryAction.disabledReason)}
              data-action-state={interactiveRegistryAction.actionState}
              data-action-status={interactiveRegistryAction.actionStatus}
              data-disabled-reason={interactiveRegistryAction.disabledReason || undefined}
              data-selected-component-key={selectedInteractiveComponent?.componentKey || undefined}
              data-selected-component-version={selectedInteractiveComponent?.version || undefined}
              className={cn(
                'mb-2 w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                (interactiveComponentsLoading || Boolean(interactiveRegistryAction.disabledReason)) && 'cursor-not-allowed opacity-60'
              )}
            >
              <option value="">
                {interactiveComponentsLoading
                  ? 'Loading registry...'
                  : compatibleInteractiveComponents.length > 0
                    ? 'Select from registry'
                    : 'No registry components for this block'}
              </option>
              {compatibleInteractiveComponents.map((component) => (
                <option
                  key={`${component.componentKey}:${component.version}`}
                  value={interactiveComponentOptionValue(component)}
                  disabled={component.status === 'disabled'}
                >
                  {component.displayName || component.componentKey} ({component.version})
                </option>
              ))}
            </select>
            {interactiveComponentsError && (
              <p className="mb-2 text-xs text-amber-700">{interactiveComponentsError}</p>
            )}
            {selectedInteractiveComponent?.description && (
              <p className="mb-2 text-xs leading-5 text-muted-foreground">{selectedInteractiveComponent.description}</p>
            )}
            {interactiveRuntimeBadges.length > 0 && (
              <div
                className="mb-3 flex flex-wrap gap-1.5"
                data-testid="editor-interactive-runtime-badges"
                aria-label="Interactive component runtime capabilities"
              >
                {interactiveRuntimeBadges.map((badge) => (
                  <span
                    key={`${badge.label}:${badge.value}`}
                    className="rounded border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">{badge.label}:</span> {badge.value}
                  </span>
                ))}
              </div>
            )}
            {selectedInteractiveComponent?.allowedDataScopes?.length ? (
              <p className="mb-2 text-xs leading-5 text-muted-foreground">
                Data scopes: {selectedInteractiveComponent.allowedDataScopes.join(', ')}. Bind collection data from the Data panel.
              </p>
            ) : null}
            {interactivePreviewModel && (
              <div
                className="mb-3 overflow-hidden rounded-md border border-border bg-background"
                data-testid="editor-interactive-visual-preview"
                data-preview-kind={interactivePreviewModel.kind}
              >
                <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-foreground">{interactivePreviewModel.title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{interactivePreviewModel.caption}</div>
                  </div>
                  <span className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {interactivePreviewModel.mode}
                  </span>
                </div>
                <div className="relative h-28 bg-slate-950 px-3 py-3 text-white" aria-hidden="true">
                  {interactivePreviewModel.kind === 'chart' ? (
                    <div className="flex h-full items-end gap-1.5">
                      {interactivePreviewModel.values.map((value, index) => (
                        <div
                          key={`chart-${index}`}
                          className="w-full rounded-sm bg-sky-400"
                          style={{ height: `${Math.max(12, Number(value))}%` }}
                        />
                      ))}
                    </div>
                  ) : interactivePreviewModel.kind === 'simulation' ? (
                    <div className="grid h-full grid-cols-3 items-end gap-2">
                      {interactivePreviewModel.values.map((value, index) => (
                        <div key={`simulation-${index}`} className="space-y-1">
                          <div className="rounded bg-emerald-400" style={{ height: `${Math.max(18, Number(value))}%` }} />
                          <div className="h-1 rounded bg-white/25" />
                        </div>
                      ))}
                    </div>
                  ) : interactivePreviewModel.kind === 'explorer' ? (
                    <div className="space-y-2">
                      {interactivePreviewModel.values.map((value, index) => (
                        <div key={`explorer-${index}`} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-2">
                          <div className="h-3 rounded bg-white/25" />
                          <div className="h-3 rounded bg-cyan-300" style={{ width: `${Math.max(24, Number(value))}%` }} />
                        </div>
                      ))}
                    </div>
                  ) : interactivePreviewModel.kind === 'canvas' ? (
                    <div className="relative h-full overflow-hidden rounded border border-white/15 bg-slate-900">
                      <div className="absolute left-4 top-4 h-8 w-8 rounded-full bg-orange-400" />
                      <div className="absolute bottom-5 right-7 h-10 w-10 rounded bg-sky-400" />
                      <div
                        className="absolute left-1/3 top-1/3 h-12 w-12 rounded-full border-4 border-emerald-300"
                        style={{ opacity: Math.max(0.35, Number(interactivePreviewModel.values[0]) / 100) }}
                      />
                    </div>
                  ) : (
                    <div className="flex h-full items-center gap-2">
                      {interactivePreviewModel.values.map((value, index) => (
                        <div key={`round-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-400 text-xs font-semibold text-slate-950">
                            {value}
                          </div>
                          {index < interactivePreviewModel.values.length - 1 && (
                            <div className="h-1 w-full rounded bg-white/25" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 px-3 py-2">
                  {interactivePreviewModel.chips.map((chip) => (
                    <span key={chip} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {interactiveBindingPresets.length > 0 && (
              <div
                className="mb-3 space-y-2 rounded-md border border-border bg-muted/20 p-3"
                data-testid="editor-interactive-binding-presets"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">Binding presets</span>
                  <span className="text-[11px] text-muted-foreground">{interactiveBindingPresets.length} registry presets</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {interactiveBindingPresets.map((preset) => {
                    const selectedPreset = getInteractiveRecord(element.props.dataBindingPreset);
                    const isSelected = selectedPreset.id === preset.id
                      && element.props.dataBindingTargetPath === preset.targetPath;
                    const presetAction = buildEditorActionStatus({
                      label: `${preset.label} binding preset`,
                      disabledReason: disabled ? 'Element editing is disabled.' : '',
                      selected: isSelected,
                      readyStatus: `Apply ${preset.label} binding preset to ${preset.targetPath}.`,
                      selectedStatus: `${preset.label} binding preset is selected for ${preset.targetPath}.`,
                    });

                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyInteractiveBindingPreset(preset)}
                        disabled={Boolean(presetAction.disabledReason)}
                        aria-describedby={interactiveActionStatusId}
                        data-testid={`editor-interactive-binding-preset-${preset.id}`}
                        data-action-state={presetAction.actionState}
                        data-action-status={presetAction.actionStatus}
                        data-disabled-reason={presetAction.disabledReason || undefined}
                        data-binding-target-path={preset.targetPath}
                        data-binding-scope={preset.scope}
                        data-binding-mode={preset.mode}
                        className={cn(
                          'rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
                          isSelected && 'border-primary text-primary'
                        )}
                      >
                        <span className="block font-medium">{preset.label}</span>
                        <span className="block truncate text-muted-foreground">{preset.scope} {'->'} {preset.targetPath}</span>
                      </button>
                    );
                  })}
                </div>
                {element.props.dataBindingTargetPath ? (
                  <p className="text-[11px] leading-4 text-muted-foreground" data-testid="editor-interactive-selected-binding-preset">
                    Selected target: <code className="rounded bg-background px-1 py-0.5">{String(element.props.dataBindingTargetPath)}</code>
                  </p>
                ) : null}
              </div>
            )}
            {interactiveControls.length > 0 && (
              <div
                className="mb-3 space-y-2 rounded-md border border-border bg-muted/20 p-3"
                data-testid="editor-interactive-control-schema-preview"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">Component controls</span>
                  <span className="text-[11px] text-muted-foreground">{interactiveControls.length} schema fields</span>
                </div>
                {interactiveControls.map((control) => {
                  const controlKey = getInteractiveControlKey(control);
                  const controlLabel = getInteractiveControlLabel(control);
                  const controlType = getInteractiveControlType(control);
                  const controlOptions = getInteractiveControlOptions(control);
                  const rawValue = getInteractiveControlValue(control, element.props);
                  const stringValue = rawValue === undefined || rawValue === null ? '' : String(rawValue);
                  const min = getInteractiveNumericBound(control, 'min');
                  const max = getInteractiveNumericBound(control, 'max');
                  const step = getInteractiveNumericBound(control, 'step');
                  const interactiveBooleanValue = parseBooleanSetting(rawValue, false);
                  const interactiveColorValue = normalizeHexColorInputValue(stringValue || '#000000');
                  const interactiveJsonValue = formatInteractiveJsonControlValue(rawValue);
                  const controlDataValue = controlType === 'json'
                    ? interactiveJsonValue
                    : controlType === 'checkbox' || controlType === 'boolean' || controlType === 'toggle'
                      ? String(interactiveBooleanValue)
                      : controlType === 'color'
                        ? interactiveColorValue
                        : stringValue;
                  const controlAction = buildEditorActionStatus({
                    label: `${controlLabel} control`,
                    disabledReason: disabled ? 'Element editing is disabled.' : '',
                    selected: controlDataValue !== '',
                    readyStatus: `${controlLabel} control is available for ${selectedInteractiveComponentLabel}.`,
                    selectedStatus: `${controlLabel} control is set.`,
                  });

                  return (
                    <div
                      key={controlKey}
                      className="space-y-1"
                      data-testid={`editor-interactive-control-${controlKey}`}
                      data-action-state={controlAction.actionState}
                      data-action-status={controlAction.actionStatus}
                      data-disabled-reason={controlAction.disabledReason || undefined}
                      data-control-key={controlKey}
                      data-control-type={controlType}
                      data-control-value={controlDataValue || undefined}
                    >
                      <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{controlLabel}</span>
                        <code className="rounded bg-background px-1 py-0.5 text-[10px]">{controlKey}</code>
                      </label>
                      {controlType === 'select' ? (
                        <select
                          value={stringValue}
                          onChange={(e) => updateInteractiveControlValue(controlKey, e.target.value)}
                          disabled={Boolean(controlAction.disabledReason)}
                          aria-describedby={interactiveActionStatusId}
                          data-testid={`editor-interactive-control-input-${controlKey}`}
                          data-action-state={controlAction.actionState}
                          data-action-status={controlAction.actionStatus}
                          data-disabled-reason={controlAction.disabledReason || undefined}
                          data-control-key={controlKey}
                          data-control-type={controlType}
                          className={cn(
                            'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                            'focus:outline-none focus:ring-2 focus:ring-ring',
                            controlAction.disabledReason && 'cursor-not-allowed opacity-60'
                          )}
                        >
                          <option value="">Select value</option>
                          {controlOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      ) : controlType === 'radio' ? (
                        <fieldset className="space-y-1" data-testid={`editor-interactive-control-radio-${controlKey}`}>
                          {controlOptions.map((option) => {
                            const optionSelected = stringValue === option.value;
                            const optionAction = buildEditorActionStatus({
                              label: `${controlLabel} ${option.label} option`,
                              disabledReason: controlAction.disabledReason,
                              selected: optionSelected,
                              readyStatus: `Set ${controlLabel} to ${option.label}.`,
                              selectedStatus: `${controlLabel} is set to ${option.label}.`,
                            });

                            return (
                              <label key={option.value} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                  type="radio"
                                  name={`interactive-control-${element.id}-${controlKey}`}
                                  value={option.value}
                                  checked={optionSelected}
                                  disabled={Boolean(optionAction.disabledReason)}
                                  aria-describedby={interactiveActionStatusId}
                                  onChange={(e) => updateInteractiveControlValue(controlKey, e.target.value)}
                                  data-testid={`editor-interactive-control-input-${controlKey}-${option.value}`}
                                  data-action-state={optionAction.actionState}
                                  data-action-status={optionAction.actionStatus}
                                  data-disabled-reason={optionAction.disabledReason || undefined}
                                  data-control-key={controlKey}
                                  data-control-type={controlType}
                                  data-control-option-value={option.value}
                                />
                                {option.label}
                              </label>
                            );
                          })}
                        </fieldset>
                      ) : controlType === 'checkbox' || controlType === 'boolean' || controlType === 'toggle' ? (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={interactiveBooleanValue}
                            disabled={Boolean(controlAction.disabledReason)}
                            aria-describedby={interactiveActionStatusId}
                            onChange={(e) => updateInteractiveControlValue(controlKey, e.target.checked)}
                            data-testid={`editor-interactive-control-input-${controlKey}`}
                            data-action-state={controlAction.actionState}
                            data-action-status={controlAction.actionStatus}
                            data-disabled-reason={controlAction.disabledReason || undefined}
                            data-control-key={controlKey}
                            data-control-type={controlType}
                          />
                          Enabled
                        </label>
                      ) : controlType === 'textarea' || controlType === 'json' || controlType === 'code' ? (
                        <textarea
                          value={controlType === 'json' ? interactiveJsonValue : stringValue}
                          rows={controlType === 'textarea' ? 3 : 5}
                          spellCheck={controlType === 'textarea'}
                          disabled={Boolean(controlAction.disabledReason)}
                          aria-describedby={interactiveActionStatusId}
                          onChange={(e) => updateInteractiveControlValue(
                            controlKey,
                            controlType === 'json' ? e.target.value : e.target.value,
                          )}
                          onBlur={(e) => {
                            if (controlType === 'json') {
                              updateInteractiveControlValue(controlKey, normalizeInteractiveJsonControlValue(e.target.value));
                            }
                          }}
                          data-testid={`editor-interactive-control-input-${controlKey}`}
                          data-action-state={controlAction.actionState}
                          data-action-status={controlAction.actionStatus}
                          data-disabled-reason={controlAction.disabledReason || undefined}
                          data-control-key={controlKey}
                          data-control-type={controlType}
                          className={cn(
                            'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
                            controlType !== 'textarea' && 'font-mono text-xs',
                            'focus:outline-none focus:ring-2 focus:ring-ring',
                            controlAction.disabledReason && 'cursor-not-allowed opacity-60'
                          )}
                        />
                      ) : (
                        <input
                          type={controlType === 'range' || controlType === 'number' || controlType === 'color' ? controlType : 'text'}
                          value={controlType === 'color' ? interactiveColorValue : stringValue}
                          min={min === undefined ? undefined : String(min)}
                          max={max === undefined ? undefined : String(max)}
                          step={step === undefined ? undefined : String(step)}
                          disabled={Boolean(controlAction.disabledReason)}
                          aria-describedby={interactiveActionStatusId}
                          onChange={(e) => {
                            if (controlType === 'range' || controlType === 'number') {
                              updateInteractiveControlValue(
                                controlKey,
                                normalizeInteractiveNumericControlValue(e.target.value, control),
                              );
                              return;
                            }

                            updateInteractiveControlValue(
                              controlKey,
                              controlType === 'color'
                                ? normalizeHexColorInputValue(e.target.value)
                                : e.target.value,
                            );
                          }}
                          data-testid={`editor-interactive-control-input-${controlKey}`}
                          data-action-state={controlAction.actionState}
                          data-action-status={controlAction.actionStatus}
                          data-disabled-reason={controlAction.disabledReason || undefined}
                          data-control-key={controlKey}
                          data-control-type={controlType}
                          className={cn(
                            'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                            controlType !== 'color' && 'focus:outline-none focus:ring-2 focus:ring-ring',
                            controlAction.disabledReason && 'cursor-not-allowed opacity-60'
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <label className="text-xs text-muted-foreground mb-1 block">
              Component key
            </label>
            <input
              type="text"
              value={element.props.componentKey || ''}
              onChange={(e) => onChange({ componentKey: e.target.value })}
              data-testid="editor-interactive-component-key"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background font-mono',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder={normalizedType === 'codeComponent' ? 'backy.custom.sandboxed' : 'backy.figure.rounds'}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Version
              </label>
              <input
                type="text"
                value={element.props.version || ''}
                onChange={(e) => onChange({ version: e.target.value })}
                data-testid="editor-interactive-version"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background font-mono',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="1.0.0"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Hydration
              </label>
              <select
                value={interactiveRenderCapabilities.hydrationMode || (normalizedType === 'codeComponent' ? 'sandbox-iframe' : 'trusted-component')}
                onChange={(e) => updateInteractiveRenderCapabilities({
                  hydrationMode: e.target.value,
                  requiresSandbox: e.target.value === 'sandbox-iframe',
                  fallbackRequired: true,
                  postMessageProtocol: 'backy.interactive-component.v1',
                })}
                data-testid="editor-interactive-hydration-mode"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="trusted-component">Trusted component</option>
                <option value="sandbox-iframe">Sandbox iframe</option>
                <option value="static-fallback">Static fallback</option>
              </select>
            </div>
          </div>
          {normalizedType === 'codeComponent' && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Sandbox URL
              </label>
              <input
                type="text"
                value={element.props.sandboxUrl || ''}
                onChange={(e) => onChange({ sandboxUrl: e.target.value })}
                data-testid="editor-interactive-sandbox-url"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background font-mono',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="/api/sites/{siteId}/interactive-components/{componentKey}/{version}/sandbox"
              />
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Publishing requires Backy's owned sandbox route for the same component key and version.
              </p>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Fallback title
            </label>
            <input
              type="text"
              value={interactiveFallback.title || element.props.title || ''}
              onChange={(e) => {
                onChange({ title: e.target.value });
                updateInteractiveFallback({ title: e.target.value });
              }}
              data-testid="editor-interactive-fallback-title"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Self-correction at work"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Fallback text
            </label>
            <textarea
              value={interactiveFallback.text || element.props.fallbackText || ''}
              onChange={(e) => {
                onChange({ fallbackText: e.target.value });
                updateInteractiveFallback({ text: e.target.value });
              }}
              data-testid="editor-interactive-fallback-text"
              rows={3}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background resize-y',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Static description for crawlers and unsupported clients"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Fallback image
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={interactiveFallback.imageUrl || ''}
                onChange={(e) => updateInteractiveFallback({ imageUrl: e.target.value })}
                data-testid="editor-interactive-fallback-image"
                className={cn(
                  'flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="https://..."
              />
              {renderMediaPickerButton({
                field: 'interactiveFallbackImage',
                testId: 'editor-interactive-select-fallback-image',
                children: 'Select',
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Accessible label
            </label>
            <input
              type="text"
              value={interactiveFallback.ariaLabel || ''}
              onChange={(e) => updateInteractiveFallback({ ariaLabel: e.target.value })}
              data-testid="editor-interactive-aria-label"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Describe the interactive component"
            />
          </div>
        </div>
      )}

      {/* Embed Properties */}
      {element.type === 'embed' && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Embed URL / Iframe Source
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={element.props.src || ''}
                onChange={(e) => onChange({ src: e.target.value })}
                data-testid="editor-embed-src"
                className={cn(
                  'flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="https://www.youtube.com/watch?v=... or HTML iframe src"
              />
              {renderMediaPickerButton({
                field: 'embed',
                testId: 'editor-embed-select-media',
                title: 'Use current media item',
                children: 'Select',
              })}
              {renderMediaPickerButton({
                field: 'embed',
                mode: 'upload',
                testId: 'editor-embed-upload-media',
                title: 'Upload media',
                children: 'Upload',
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Supports YouTube, Vimeo, iframe src links, or map/HTML sources.
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Legacy URL Field
            </label>
            <input
              type="text"
              value={element.props.url || ''}
              onChange={(e) => onChange({ url: e.target.value })}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Alternative src field"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Iframe Title
            </label>
            <input
              type="text"
              value={element.props.title || ''}
              onChange={(e) => onChange({ title: e.target.value })}
              data-testid="editor-embed-title"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Embedded content"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Allowed Features
            </label>
            <textarea
              value={element.props.allow || ''}
              onChange={(e) => onChange({ allow: e.target.value })}
              data-testid="editor-embed-allow"
              rows={2}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Extra Allowed Domains
            </label>
            <textarea
              value={element.props.allowedHosts || element.props.embedAllowedHosts || ''}
              onChange={(e) => onChange({ allowedHosts: e.target.value })}
              data-testid="editor-embed-allowed-hosts"
              rows={2}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="example.com, app.example.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              YouTube, Vimeo, Google Maps/Docs, and Figma are allowed by default.
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Sandbox Tokens
            </label>
            <input
              type="text"
              value={element.props.sandbox || ''}
              onChange={(e) => onChange({ sandbox: e.target.value })}
              data-testid="editor-embed-sandbox"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="allow-scripts allow-same-origin"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Loading
              </label>
              <select
                value={element.props.loading || 'lazy'}
                onChange={(e) => onChange({ loading: e.target.value })}
                data-testid="editor-embed-loading"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="lazy">Lazy</option>
                <option value="eager">Eager</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Referrer Policy
              </label>
              <select
                value={element.props.referrerPolicy || ''}
                onChange={(e) => onChange({ referrerPolicy: e.target.value })}
                data-testid="editor-embed-referrer-policy"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="">Browser default</option>
                <option value="no-referrer">No referrer</option>
                <option value="origin">Origin</option>
                <option value="strict-origin">Strict origin</option>
                <option value="strict-origin-when-cross-origin">Strict origin when cross-origin</option>
                <option value="same-origin">Same origin</option>
                <option value="no-referrer-when-downgrade">No referrer when downgrade</option>
                <option value="unsafe-url">Unsafe URL</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.allowFullScreen, true)}
              onChange={(e) => onChange({ allowFullScreen: e.target.checked })}
              data-testid="editor-embed-allow-fullscreen"
              className="rounded"
            />
            Allow fullscreen
          </label>
        </div>
      )}

      {/* Columns Properties */}
      {element.type === 'columns' && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Number of Columns
            </label>
            <select
              value={element.props.columns || 2}
              onChange={(e) => onChange({ columns: parseInt(e.target.value) })}
              data-testid="editor-columns-count"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="2">2 Columns</option>
              <option value="3">3 Columns</option>
              <option value="4">4 Columns</option>
              <option value="5">5 Columns</option>
              <option value="6">6 Columns</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Column Gap
            </label>
            <NumberInput
              value={element.props.gap || 16}
              onChange={(value) => onChange({ gap: value })}
              suffix="px"
              testId="editor-columns-gap"
            />
          </div>
        </div>
      )}

      {/* Map Properties */}
      {element.type === 'map' && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Address / Location
            </label>
            <input
              type="text"
              value={element.props.address || ''}
              onChange={(e) => onChange({ address: e.target.value })}
              data-testid="editor-map-address"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="123 Main St, City, Country"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Or Custom Map URL
            </label>
            <input
              type="text"
              value={element.props.src || ''}
              onChange={(e) => onChange({ src: e.target.value })}
              data-testid="editor-map-src"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="https://maps.google.com/... or any map embed URL"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Marker Label
            </label>
            <input
              type="text"
              value={element.props.markerLabel || ''}
              onChange={(e) => onChange({ markerLabel: e.target.value })}
              data-testid="editor-map-marker-label"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Main office"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Latitude
              </label>
              <input
                type="number"
                step="0.000001"
                value={element.props.markerLatitude ?? ''}
                onChange={(e) => onChange({ markerLatitude: e.target.value === '' ? undefined : Number(e.target.value) })}
                data-testid="editor-map-marker-latitude"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="19.076"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Longitude
              </label>
              <input
                type="number"
                step="0.000001"
                value={element.props.markerLongitude ?? ''}
                onChange={(e) => onChange({ markerLongitude: e.target.value === '' ? undefined : Number(e.target.value) })}
                data-testid="editor-map-marker-longitude"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="72.8777"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Zoom Level
            </label>
            <input
              type="range"
              min={1}
              max={20}
              value={element.props.zoom || 14}
              onChange={(e) => onChange({ zoom: parseInt(e.target.value) })}
              data-testid="editor-map-zoom"
              className="w-full"
            />
            <div className="text-right text-xs text-muted-foreground">
              {element.props.zoom || 14}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Iframe Title
            </label>
            <input
              type="text"
              value={element.props.title || ''}
              onChange={(e) => onChange({ title: e.target.value })}
              data-testid="editor-map-title"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Map embed"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Loading
              </label>
              <select
                value={element.props.loading || 'lazy'}
                onChange={(e) => onChange({ loading: e.target.value })}
                data-testid="editor-map-loading"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="lazy">Lazy</option>
                <option value="eager">Eager</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Referrer Policy
              </label>
              <select
                value={element.props.referrerPolicy || 'no-referrer'}
                onChange={(e) => onChange({ referrerPolicy: e.target.value })}
                data-testid="editor-map-referrer-policy"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="no-referrer">No referrer</option>
                <option value="origin">Origin</option>
                <option value="strict-origin">Strict origin</option>
                <option value="strict-origin-when-cross-origin">Strict origin when cross-origin</option>
                <option value="same-origin">Same origin</option>
                <option value="no-referrer-when-downgrade">No referrer when downgrade</option>
                <option value="unsafe-url">Unsafe URL</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.allowFullScreen, true)}
              onChange={(e) => onChange({ allowFullScreen: e.target.checked })}
              data-testid="editor-map-allow-fullscreen"
              className="rounded"
            />
            Allow fullscreen
          </label>
        </div>
      )}

      {/* Box/Container Properties */}
      {(element.type === 'box' || element.type === 'container') && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            This is a container element. Style it using the Style and Appearance sections.
            Drag other elements on top to group them visually.
          </p>
        </div>
      )}

      {/* Divider Properties */}
      {element.type === 'divider' && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Divider Color
            </label>
            <ColorInput
              value={element.props.borderColor || '#e5e7eb'}
              onChange={(value) => onChange({ borderColor: value })}
              testId="editor-divider-color"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Divider Thickness
            </label>
            <NumberInput
              value={toNumber(element.props.thickness, 1)}
              onChange={(value) => onChange({ thickness: value })}
              suffix="px"
              testId="editor-divider-thickness"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Divider Style
            </label>
            <select
              value={element.props.borderStyle || 'solid'}
              onChange={(e) => onChange({ borderStyle: e.target.value })}
              data-testid="editor-divider-style"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Divider Margin
            </label>
            <NumberInput
              value={toNumber(element.props.margin, 0)}
              onChange={(value) => onChange({ margin: value })}
              suffix="px"
              testId="editor-divider-margin"
            />
          </div>
        </div>
      )}

      {/* Spacer Properties */}
      {element.type === 'spacer' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            This is a spacer element for layout purposes. Adjust its size in the Layout section.
          </p>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Background Color
            </label>
            <ColorInput
              value={element.props.backgroundColor || '#ffffff'}
              onChange={(value) => onChange({ backgroundColor: value })}
              testId="editor-spacer-background-color"
            />
          </div>
        </div>
      )}

      {/* Icon Properties */}
      {element.type === 'icon' && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Icon (emoji or symbol)
            </label>
            <div className="relative">
              <input
                type="text"
                value={element.props.icon || '★'}
                onChange={(e) => onChange({ icon: e.target.value })}
                data-testid="editor-icon-symbol"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background text-center text-2xl',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-muted px-2 py-1 rounded"
                aria-label="Open emoji picker"
                data-testid="editor-icon-emoji-picker"
                onClick={onOpenEmoji}
              >
                Pick
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Icon Size
            </label>
            <NumberInput
              value={element.props.size || 24}
              onChange={(value) => onChange({ size: value })}
              suffix="px"
              testId="editor-icon-size"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Icon Color
            </label>
            <input
              type="color"
              value={(element.props.color as string) || '#374151'}
              onChange={(e) => onChange({ color: e.target.value })}
              data-testid="editor-icon-color"
              className="h-9 w-full rounded-md border border-border bg-background"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Title
            </label>
            <input
              type="text"
              value={element.props.title || ''}
              onChange={(e) => onChange({ title: e.target.value })}
              data-testid="editor-icon-title"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Optional tooltip title"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Accessibility Label
            </label>
            <input
              type="text"
              value={element.props.ariaLabel || ''}
              onChange={(e) => onChange({ ariaLabel: e.target.value })}
              data-testid="editor-icon-aria-label"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Describe the icon"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// LAYOUT PROPERTIES
// ============================================

interface LayoutPropertiesProps {
  element: CanvasElement;
  onChange: (updates: Partial<CanvasElement>) => void;
}

function LayoutProperties({ element, onChange }: LayoutPropertiesProps) {
  return (
    <div className="space-y-3">
      {/* Position */}
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="X"
          value={element.x}
          onChange={(value) => onChange({ x: value })}
          suffix="px"
          testId="editor-layout-x"
        />
        <NumberInput
          label="Y"
          value={element.y}
          onChange={(value) => onChange({ y: value })}
          suffix="px"
          testId="editor-layout-y"
        />
      </div>

      {/* Size */}
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="Width"
          value={element.width}
          onChange={(value) => onChange({ width: value })}
          suffix="px"
          testId="editor-layout-width"
        />
        <NumberInput
          label="Height"
          value={element.height}
          onChange={(value) => onChange({ height: value })}
          suffix="px"
          testId="editor-layout-height"
        />
      </div>

      {/* Z-Index */}
      <NumberInput
        label="Z-Index"
        value={element.zIndex}
        onChange={(value) => onChange({ zIndex: value })}
        testId="editor-layout-z-index"
      />

      {/* Rotation */}
      <NumberInput
        label="Rotation"
        value={element.rotation || 0}
        onChange={(value) => onChange({ rotation: value })}
        suffix="°"
        testId="editor-layout-rotation"
      />
    </div>
  );
}

// ============================================
// STYLE PROPERTIES
// ============================================

interface StylePropertiesProps {
  element: CanvasElement;
  onChange: (updates: Partial<ElementProps>) => void;
  onElementChange?: (updates: Partial<CanvasElement>) => void;
  theme?: ThemeConfig;
  mediaContext?: MediaContext;
  canViewMedia?: boolean;
  canCreateMedia?: boolean;
  mediaViewDisabledReason?: string;
  mediaCreateDisabledReason?: string;
  disabled?: boolean;
  supportsTextStyles?: boolean;
}

function StyleProperties({
  element,
  onChange,
  onElementChange,
  theme,
  mediaContext,
  canViewMedia = true,
  canCreateMedia = true,
  mediaViewDisabledReason,
  mediaCreateDisabledReason,
  disabled = false,
  supportsTextStyles = false,
}: StylePropertiesProps) {
  const media = useStore((state) => state.media);
  const fontFamilies = useMemo(() => getFontFamilyOptions(media), [media]);
  const [isFontLibraryOpen, setIsFontLibraryOpen] = useState(false);
  const themeTokenReferences = useMemo(
    () => buildBackyThemeTokenReferences(buildBackyThemeTokens(theme || {})),
    [theme],
  );
  const themeTokenOptions = useMemo(
    () => Object.entries(themeTokenReferences)
      .map(([path, value]) => ({ path, value, label: themeTokenLabel(path) })),
    [themeTokenReferences],
  );
  const themeTokenTargets = useMemo(
    () => THEME_TOKEN_TARGETS.filter((target) => supportsTextStyles || !target.textOnly),
    [supportsTextStyles],
  );
  const fontMediaPickerStatusId = 'editor-font-media-picker-action-status';
  const fontMediaPickerAction = buildEditorMediaPickerAction({
    field: 'font',
    mode: 'upload',
    disabled,
    canViewMedia,
    canCreateMedia,
    viewDisabledReason: mediaViewDisabledReason,
    createDisabledReason: mediaCreateDisabledReason,
  });
  const openFontMediaLibrary = () => {
    if (fontMediaPickerAction.disabledReason) {
      return;
    }

    setIsFontLibraryOpen(true);
  };
  const updateThemeTokenRef = useCallback((target: ThemeTokenTarget, tokenPath: string) => {
    const nextTokenRefs = { ...(element.tokenRefs || {}) };
    const nextProps = { ...element.props };

    if (tokenPath) {
      nextTokenRefs[target.targetPath] = tokenPath;
      const tokenValue = themeTokenReferences[tokenPath];
      if (tokenValue) {
        nextProps[target.propName] = tokenValue;
      }
    } else {
      delete nextTokenRefs[target.targetPath];
    }

    if (onElementChange) {
      onElementChange({
        props: nextProps,
        tokenRefs: Object.keys(nextTokenRefs).length > 0 ? nextTokenRefs : undefined,
      });
      return;
    }

    onChange(nextProps);
  }, [element.props, element.tokenRefs, onChange, onElementChange, themeTokenReferences]);

  return (
    <div className="space-y-3">
      <div
        className="rounded-md border border-dashed border-border bg-muted/30 p-3"
        data-testid="editor-theme-token-bindings"
        data-token-ref-path="tokenRefs"
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-foreground">Theme tokens</p>
          </div>
          <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            tokenRefs
          </span>
        </div>
        <div className="grid gap-2">
          {themeTokenTargets.map((target) => {
            const selectedToken = element.tokenRefs?.[target.targetPath] || '';
            const matchingOptions = themeTokenOptions.filter((option) => (
              target.prefixes.some((prefix) => option.path.startsWith(prefix))
            ));

            return (
              <label key={target.targetPath} className="grid gap-1 text-xs">
                <span className="font-medium text-muted-foreground">{target.label}</span>
                <select
                  value={selectedToken}
                  onChange={(event) => updateThemeTokenRef(target, event.target.value)}
                  data-testid={themeTokenSelectTestId(target.targetPath)}
                  className={cn(
                    'w-full rounded-md border bg-background px-2 py-1.5 text-xs',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  <option value="">Manual value</option>
                  {matchingOptions.map((option) => (
                    <option key={`${target.targetPath}:${option.path}`} value={option.path}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </div>

      {supportsTextStyles && (
        <>
          {/* Font Family */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Font Family
            </label>
            <div className="space-y-2">
              <select
                value={fontFamilies.some(f => f.value === element.props.fontFamily) ? element.props.fontFamily : 'custom'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== 'custom') {
                    onChange({ fontFamily: val });
                  }
                }}
                data-testid="editor-style-font-family"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                {fontFamilies.map(font => (
                  <option
                    key={font.value}
                    value={font.value}
                    style={{ fontFamily: toFontFamilyStyle(font.value) }}
                  >
                    {font.label}
                  </option>
                ))}
                <option value="custom">Custom Google Font...</option>
              </select>

              {(element.props.fontFamily && !fontFamilies.some(f => f.value === element.props.fontFamily) || element.props.fontFamily === 'custom') && (
                <input
                  type="text"
                  value={element.props.fontFamily === 'inherit' ? '' : element.props.fontFamily}
                  onChange={(e) => onChange({ fontFamily: e.target.value })}
                  placeholder="Enter Google Font Name (e.g. 'Roboto')"
                  data-testid="editor-style-font-family-custom"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                />
              )}
              <span
                id={fontMediaPickerStatusId}
                className="sr-only"
                data-testid="editor-font-media-picker-action-status"
                data-action-state={fontMediaPickerAction.actionState}
                data-action-status={fontMediaPickerAction.actionStatus}
                data-disabled-reason={fontMediaPickerAction.disabledReason || undefined}
              >
                {fontMediaPickerAction.actionStatus}
              </span>
              <button
                type="button"
                onClick={openFontMediaLibrary}
                disabled={Boolean(fontMediaPickerAction.disabledReason)}
                aria-describedby={fontMediaPickerStatusId}
                data-testid="editor-font-media-picker"
                data-action-state={fontMediaPickerAction.actionState}
                data-action-status={fontMediaPickerAction.actionStatus}
                data-disabled-reason={fontMediaPickerAction.disabledReason || undefined}
                data-target-media-field="font"
                data-target-media-mode="upload"
                title={fontMediaPickerAction.disabledReason || fontMediaPickerAction.actionLabel}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload or select font
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Note: Google Fonts and uploaded font files (woff/woff2/ttf/otf) are available.
            </p>
            <MediaLibraryModal
              isOpen={isFontLibraryOpen}
              onClose={() => setIsFontLibraryOpen(false)}
              onSelect={(font, selectionOptions) => {
                const fontFamily = fontFamilyFromMedia(font);
                const registration = selectionOptions?.fontRegistration;
                const fontFileUrl = font.url || getPublicMediaFileUrl(font.id, mediaContext?.siteId);
                const nextProps: ElementProps = {
                  ...element.props,
                  fontFamily,
                  fontMediaId: font.id,
                  fontMediaName: font.name,
                  fontMediaFolderId: font.folderId || null,
                  fontMediaFolderPath: font.organization?.folderPath || null,
                  fontMediaOrganization: font.organization,
                  fontMediaVisibility: font.visibility || 'public',
                  fontFileUrl,
                  fontSource: 'media-library',
                  fontFallback: registration?.fallback || cleanMediaString(font.metadata?.fontFallback) || 'system-ui, sans-serif',
                  fontDisplay: registration?.display || cleanMediaString(font.metadata?.fontDisplay) || 'swap',
                  fontRegistration: {
                    family: fontFamily,
                    weight: registration?.weight || cleanMediaString(font.metadata?.fontWeight) || '400',
                    style: registration?.style || cleanMediaString(font.metadata?.fontStyle) || 'normal',
                    fallback: registration?.fallback || cleanMediaString(font.metadata?.fontFallback) || 'system-ui, sans-serif',
                    display: registration?.display || cleanMediaString(font.metadata?.fontDisplay) || 'swap',
                    mediaId: font.id,
                    url: fontFileUrl,
                  },
                };

                if (onElementChange) {
                  onElementChange({
                    props: nextProps,
                    assetIds: buildElementAssetIds(element, nextProps, [font.id], [element.props.fontMediaId]),
                  });
                  return;
                }

                onChange(nextProps);
              }}
              allowedTypes="font"
              mediaContext={mediaContext}
              initialTab="upload"
              initialUploadFilter="font"
              allowScopeSwitcher={false}
              returnFocusTargetId="editor-font-media-picker"
              canView={canViewMedia}
              canCreate={canCreateMedia}
              viewDisabledReason={mediaViewDisabledReason}
              createDisabledReason={mediaCreateDisabledReason}
            />
          </div>

          {/* Font Size */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Font Size
            </label>
            <NumberInput
              value={element.props.fontSize || 16}
              onChange={(value) => onChange({ fontSize: value })}
              suffix="px"
              testId="editor-style-font-size"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Font Weight
            </label>
            <select
              value={element.props.fontWeight || 'normal'}
              onChange={(e) => onChange({ fontWeight: e.target.value })}
              data-testid="editor-style-font-weight"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
              <option value="lighter">Light</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="300">300</option>
              <option value="400">400</option>
              <option value="500">500</option>
              <option value="600">600</option>
              <option value="700">700</option>
              <option value="800">800</option>
              <option value="900">900</option>
            </select>
          </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Line Height
          </label>
          <NumberInput
            value={element.props.lineHeight || 1.5}
            onChange={(value) => onChange({ lineHeight: value })}
            testId="editor-style-line-height"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Text Align
          </label>
            <div className="flex gap-1">
              {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                <button
                  key={align}
                  onClick={() => onChange({ textAlign: align })}
                  data-testid={`editor-style-text-align-${align}`}
                  className={cn(
                    'flex-1 px-2 py-1 text-xs rounded-md border capitalize',
                    element.props.textAlign === align
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent'
                  )}
                >
                  {align}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Text Transform
            </label>
            <select
              value={element.props.textTransform || 'none'}
              onChange={(e) => onChange({ textTransform: e.target.value as ElementProps['textTransform'] })}
              data-testid="editor-style-text-transform"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="none">None</option>
              <option value="uppercase">Uppercase</option>
              <option value="lowercase">Lowercase</option>
              <option value="capitalize">Capitalize</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Letter Spacing (px)
              </label>
              <NumberInput
                value={toNumber(element.props.letterSpacing)}
                onChange={(value) => onChange({ letterSpacing: value })}
                suffix="px"
                testId="editor-style-letter-spacing"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Word Spacing (px)
              </label>
              <NumberInput
                value={toNumber(element.props.wordSpacing)}
                onChange={(value) => onChange({ wordSpacing: value })}
                suffix="px"
                testId="editor-style-word-spacing"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Text Indent (px)
            </label>
            <NumberInput
              value={toNumber(element.props.textIndent)}
              onChange={(value) => onChange({ textIndent: value })}
              suffix="px"
              testId="editor-style-text-indent"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Text Shadow
            </label>
            <input
              type="text"
              value={element.props.textShadow || ''}
              onChange={(e) => onChange({ textShadow: e.target.value })}
              data-testid="editor-style-text-shadow"
              placeholder="0 0 4px rgba(0,0,0,0.2)"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>
        </>
      )}

      {/* Colors */}
      {supportsTextStyles && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Text Color
          </label>
          <ColorInput
            value={element.props.color || '#000000'}
            onChange={(value) => onChange({ color: value })}
            testId="editor-style-text-color"
          />
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Background Color
        </label>
        <ColorInput
          value={element.props.backgroundColor || '#ffffff'}
          onChange={(value) => onChange({ backgroundColor: value })}
          testId="editor-style-background-color"
        />
      </div>

      {supportsTextStyles && (
        <>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Text Decoration
            </label>
            <select
              value={element.props.textDecoration || 'none'}
              onChange={(e) => onChange({ textDecoration: e.target.value })}
              data-testid="editor-style-text-decoration"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="none">None</option>
              <option value="underline">Underline</option>
              <option value="line-through">Strikethrough</option>
              <option value="underline line-through">Underline + Strikethrough</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Font Style
            </label>
            <select
              value={element.props.fontStyle || 'normal'}
              onChange={(e) => onChange({ fontStyle: e.target.value })}
              data-testid="editor-style-font-style"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="normal">Normal</option>
              <option value="italic">Italic</option>
              <option value="oblique">Oblique</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// APPEARANCE PROPERTIES
// ============================================

function AppearanceProperties({ element, onChange }: StylePropertiesProps) {
  return (
    <div className="space-y-3">
      {/* Border Radius */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Border Radius
        </label>
        <NumberInput
          value={element.props.borderRadius || 0}
          onChange={(value) => onChange({ borderRadius: value })}
          suffix="px"
          testId="editor-appearance-border-radius"
        />
      </div>

      {/* Opacity */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Opacity
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={element.props.opacity ?? 1}
          onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
          data-testid="editor-appearance-opacity"
          className="w-full"
        />
        <div className="text-right text-xs text-muted-foreground">
          {Math.round((element.props.opacity ?? 1) * 100)}%
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Border Width
        </label>
        <NumberInput
          value={parseFloat((element.props.borderWidth || '0').toString()) || 0}
          onChange={(value) => onChange({ borderWidth: value })}
          suffix="px"
          testId="editor-appearance-border-width"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Border Style
        </label>
        <select
          value={element.props.borderStyle || 'solid'}
          onChange={(e) => onChange({ borderStyle: e.target.value })}
          data-testid="editor-appearance-border-style"
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
        >
          <option value="solid">solid</option>
          <option value="dashed">dashed</option>
          <option value="dotted">dotted</option>
          <option value="double">double</option>
          <option value="none">none</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Border Color
        </label>
        <ColorInput
          value={element.props.borderColor || '#e5e7eb'}
          onChange={(value) => onChange({ borderColor: value })}
          testId="editor-appearance-border-color"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Padding (px)
        </label>
        <NumberInput
          value={parseFloat((element.props.padding || '0').toString()) || 0}
          onChange={(value) => onChange({ padding: value })}
          testId="editor-appearance-padding"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Margin (px)
        </label>
        <NumberInput
          value={parseFloat((element.props.margin || '0').toString()) || 0}
          onChange={(value) => onChange({ margin: value })}
          testId="editor-appearance-margin"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Box Shadow
        </label>
        <input
          type="text"
          value={element.props.boxShadow || ''}
          onChange={(e) => onChange({ boxShadow: e.target.value })}
          data-testid="editor-appearance-box-shadow"
          placeholder="0 2px 10px rgba(0,0,0,0.15)"
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
        />
      </div>
    </div>
  );
}

// ============================================
// DATA BINDING PROPERTIES
// ============================================

interface DataBindingPropertiesProps {
  element: CanvasElement;
  siteId?: string;
  collections: Collection[];
  collectionsLoading: boolean;
  collectionsError: string | null;
  onChange: (updates: Partial<CanvasElement>) => void;
}

const getBindingSource = (binding: unknown): Record<string, unknown> | null => (
  binding && typeof binding === 'object' && !Array.isArray(binding)
    ? ((binding as Record<string, unknown>).source as Record<string, unknown> | undefined) || null
    : null
);

const getBindingQuery = (binding: unknown): Record<string, unknown> => (
  binding && typeof binding === 'object' && !Array.isArray(binding)
    ? (((binding as Record<string, unknown>).query as Record<string, unknown> | undefined) || {})
    : {}
);

const getBindingPagination = (binding: unknown): Record<string, unknown> => (
  binding && typeof binding === 'object' && !Array.isArray(binding)
    ? (((binding as Record<string, unknown>).pagination as Record<string, unknown> | undefined) || {})
    : {}
);

const getCollectionBinding = (element: CanvasElement): Record<string, unknown> | null => {
  const bindings = Array.isArray(element.dataBindings) ? element.dataBindings : [];
  return bindings.find((binding) => getBindingSource(binding)?.kind === 'collection') || null;
};

const getTargetPathOptions = (elementType: CanvasElement['type']) => {
  const normalizedElementType = normalizeCanvasElementType(elementType);

  if (normalizedElementType === 'image') {
    return [
      { value: 'props.assetId', label: 'Image asset' },
      { value: 'props.src', label: 'Image URL' },
      { value: 'props.alt', label: 'Alt text' },
    ];
  }
  if (normalizedElementType === 'button') {
    return [
      { value: 'props.label', label: 'Button label' },
      { value: 'props.href', label: 'Button URL' },
    ];
  }
  if (normalizedElementType === 'link') {
    return [
      { value: 'props.content', label: 'Link text' },
      { value: 'props.href', label: 'Link URL' },
    ];
  }
  if (normalizedElementType === 'video') {
    return [
      { value: 'props.src', label: 'Video URL' },
    ];
  }
  if (normalizedElementType === 'html' || normalizedElementType === 'table') {
    return [
      { value: 'props.html', label: 'HTML content' },
    ];
  }
  if (normalizedElementType === 'repeater') {
    return [
      { value: 'props.collectionId', label: 'Repeater collection' },
      { value: 'props.titleField', label: 'Title field' },
      { value: 'props.descriptionField', label: 'Description field' },
      { value: 'props.imageField', label: 'Image field' },
      { value: 'props.metaField', label: 'Meta field' },
    ];
  }
  if (normalizedElementType === 'interactiveFigure') {
    return [
      { value: 'props.data', label: 'Figure data' },
      { value: 'props.series', label: 'Chart/series data' },
      { value: 'props.title', label: 'Figure title' },
      { value: 'props.rounds', label: 'Round count' },
      { value: 'props.fallbackText', label: 'Fallback text' },
      { value: 'props.controls', label: 'Control values' },
    ];
  }
  if (normalizedElementType === 'codeComponent') {
    return [
      { value: 'props.data', label: 'Component data' },
      { value: 'props.input', label: 'Component input' },
      { value: 'props.config', label: 'Component config' },
      { value: 'props.title', label: 'Component title' },
      { value: 'props.fallbackText', label: 'Fallback text' },
    ];
  }
  return [
    { value: 'props.content', label: 'Text content' },
    { value: 'props.html', label: 'HTML content' },
  ];
};

const NON_FIELD_BINDING_SLOT_KEYS = new Set(['record', 'records', 'categories', 'relatedPosts']);
const VIRTUAL_COLLECTION_FIELD_PATHS = new Set(['id', 'slug', 'status', 'createdAt', 'updatedAt']);
const REPEATER_BINDING_SLOT_TARGETS = new Set([
  'props.collectionId',
  'props.titleField',
  'props.descriptionField',
  'props.imageField',
  'props.metaField',
]);
const REPEATER_FIELD_BINDING_SLOT_TARGET_PROPS: Record<string, 'titleField' | 'descriptionField' | 'imageField' | 'metaField'> = {
  'props.titleField': 'titleField',
  'props.descriptionField': 'descriptionField',
  'props.imageField': 'imageField',
  'props.metaField': 'metaField',
};
const REPEATER_COLLECTION_BINDING_PROP_KEYS = [
  'collectionId',
  'datasetId',
  'titleField',
  'descriptionField',
  'imageField',
  'metaField',
  'query',
  'limit',
  'offset',
] as const;

const BINDING_SLOT_FIELD_ALIASES: Record<string, string[]> = {
  title: ['title', 'name', 'label'],
  name: ['name', 'title', 'label'],
  excerpt: ['excerpt', 'summary', 'description', 'body'],
  summary: ['summary', 'excerpt', 'description', 'body'],
  description: ['description', 'summary', 'excerpt', 'body'],
  featuredImage: ['featuredImage', 'image', 'coverImage', 'thumbnail', 'media'],
  image: ['image', 'featuredImage', 'coverImage', 'thumbnail', 'media'],
  category: ['category', 'categories', 'topic', 'type'],
  slug: ['slug', 'url', 'href', 'link'],
  url: ['url', 'href', 'link', 'slug'],
};

const bindingSlotFieldCandidates = (slot: ComponentBindingSlot): string[] => {
  const fieldKey = typeof slot.fieldKey === 'string' ? slot.fieldKey.trim() : '';
  if (!fieldKey || NON_FIELD_BINDING_SLOT_KEYS.has(fieldKey)) {
    return [];
  }

  return Array.from(new Set([
    fieldKey,
    ...(BINDING_SLOT_FIELD_ALIASES[fieldKey] || []),
  ]));
};

const bindingSlotFieldPath = (
  slot: ComponentBindingSlot,
  collection: Collection | null,
  collections: Collection[],
): string => (
  bindingSlotFieldCandidates(slot).find((candidate) => (
    VIRTUAL_COLLECTION_FIELD_PATHS.has(candidate) || fieldPathExists(collection, collections, candidate)
  )) || ''
);

const isRepeaterBindingSlotTarget = (element: CanvasElement, targetPath: string): boolean => (
  normalizeCanvasElementType(element.type) === 'repeater' && REPEATER_BINDING_SLOT_TARGETS.has(targetPath)
);

const descendantBindingSlotTarget = (targetPath: string): { selector: string; targetPath: string } | null => {
  const parts = targetPath.split('.');
  if (parts[0] !== 'children' || parts.length < 3) {
    return null;
  }

  const selector = (parts[1] || '').trim();
  const childTargetPath = parts.slice(2).join('.');
  return selector && childTargetPath ? { selector, targetPath: childTargetPath } : null;
};

const normalizedBindingTargetSelector = (value: string): string => (
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
);

const matchesDescendantBindingTarget = (element: CanvasElement, selector: string): boolean => {
  const normalizedSelector = normalizedBindingTargetSelector(selector);
  if (!normalizedSelector) return false;

  return [
    element.id,
    element.name || '',
    element.type,
  ].some((value) => normalizedBindingTargetSelector(String(value)) === normalizedSelector);
};

const findDescendantBindingTarget = (
  element: CanvasElement,
  selector: string,
): CanvasElement | null => {
  let match: CanvasElement | null = null;
  const walk = (items?: CanvasElement[]) => {
    if (match) return;
    (items || []).forEach((child) => {
      if (match) return;
      if (matchesDescendantBindingTarget(child, selector)) {
        match = child;
        return;
      }
      walk(child.children);
    });
  };

  walk(element.children);
  return match;
};

const resolvedDescendantBindingSlot = (
  element: CanvasElement,
  slot: ComponentBindingSlot,
): { element: CanvasElement; slot: ComponentBindingSlot; selector: string } | null => {
  const target = descendantBindingSlotTarget(slot.targetPath);
  if (!target) {
    return null;
  }

  const targetElement = findDescendantBindingTarget(element, target.selector);
  return targetElement
    ? {
        element: targetElement,
        slot: { ...slot, targetPath: target.targetPath },
        selector: target.selector,
      }
    : null;
};

const directBindingSlotCanApplyWithoutFieldPath = (element: CanvasElement, slot: ComponentBindingSlot): boolean => (
  isRepeaterBindingSlotTarget(element, slot.targetPath) && slot.targetPath === 'props.collectionId'
);

const bindingSlotCanApplyWithoutFieldPath = (element: CanvasElement, slot: ComponentBindingSlot): boolean => {
  if (directBindingSlotCanApplyWithoutFieldPath(element, slot)) {
    return true;
  }

  const descendant = resolvedDescendantBindingSlot(element, slot);
  return descendant ? directBindingSlotCanApplyWithoutFieldPath(descendant.element, descendant.slot) : false;
};

const directBindingSlotTargetAllowed = (element: CanvasElement, slot: ComponentBindingSlot): boolean => (
  isRepeaterBindingSlotTarget(element, slot.targetPath)
  || getTargetPathOptions(element.type).some((option) => option.value === slot.targetPath)
);

const bindingSlotTargetAllowed = (element: CanvasElement, slot: ComponentBindingSlot): boolean => {
  if (directBindingSlotTargetAllowed(element, slot)) {
    return true;
  }

  const descendant = resolvedDescendantBindingSlot(element, slot);
  return descendant ? directBindingSlotTargetAllowed(descendant.element, descendant.slot) : false;
};

const bindingSlotTargetLabel = (
  element: CanvasElement,
  slot: ComponentBindingSlot,
  targetPathOptions: Array<{ value: string; label: string }>,
): string => {
  const descendant = resolvedDescendantBindingSlot(element, slot);
  if (descendant) {
    const descendantOptions = getTargetPathOptions(descendant.element.type);
    const label = descendantOptions.find((option) => option.value === descendant.slot.targetPath)?.label
      || descendant.slot.targetPath;
    return `${descendant.element.name || descendant.selector}: ${label}`;
  }

  return targetPathOptions.find((option) => option.value === slot.targetPath)?.label || slot.targetPath;
};

const bindingUpdateForFieldPath = (fieldPath: string): { fieldKey: string; sourcePath: string } => {
  const [fieldKey, ...remainingPath] = fieldPath.split('.').filter(Boolean);
  return {
    fieldKey: fieldKey || fieldPath,
    sourcePath: remainingPath.length > 0 ? fieldPath : '',
  };
};

const getBindingModeForField = (field?: CollectionField | null, targetPath = '') => {
  const normalizedTargetPath = targetPath.toLowerCase();
  if (normalizedTargetPath.includes('href') || normalizedTargetPath.includes('url')) return 'url';
  if (normalizedTargetPath.includes('assetid') || normalizedTargetPath.includes('mediaid') || normalizedTargetPath.includes('src')) return 'image';
  if (field?.type === 'richText' || targetPath === 'props.html') return 'html';
  if (field?.type === 'image') return 'image';
  if (field?.type === 'number') return 'number';
  if (field?.type === 'boolean') return 'boolean';
  if (field?.type === 'file') return 'url';
  return 'text';
};

const getObjectProp = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const fieldExists = (collection: Collection | null, key: string): boolean => (
  Boolean(collection?.fields.some((field) => field.key === key))
);

const buildCollectionRecordsApiUrl = (
  siteId: string | undefined,
  collectionId: string | undefined,
  query: Record<string, string | null | undefined> = {},
): string => {
  if (!siteId || !collectionId) return '';
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (normalizedValue) {
      params.set(key, normalizedValue);
    }
  });
  const queryString = params.toString();
  return `/api/sites/${encodeURIComponent(siteId)}/collections/${encodeURIComponent(collectionId)}/records${queryString ? `?${queryString}` : ''}`;
};

const MAX_COLLECTION_FIELD_PATH_DEPTH = 4;

const fieldForFieldPath = (
  collection: Collection | null,
  collections: Collection[],
  key: string,
  depth = 0,
): CollectionField | null => {
  if (!collection || !key || depth > MAX_COLLECTION_FIELD_PATH_DEPTH) return null;
  const [fieldKey, ...remainingKeys] = key.split('.').filter(Boolean);
  if (!fieldKey) return null;
  const field = collection.fields.find((candidate) => candidate.key === fieldKey) || null;
  if (!field || remainingKeys.length === 0) return field;
  const referenceCollection = field.referenceCollectionId
    ? collections.find((candidate) => candidate.id === field.referenceCollectionId) || null
    : null;
  return fieldForFieldPath(referenceCollection, collections, remainingKeys.join('.'), depth + 1);
};

const fieldPathExists = (collection: Collection | null, collections: Collection[], key: string): boolean => (
  Boolean(fieldForFieldPath(collection, collections, key))
);

const collectionFieldPathOptions = (
  collection: Collection | null,
  collections: Collection[],
  options: { includeNone?: boolean } = {},
): Array<{ value: string; label: string }> => {
  if (!collection) return options.includeNone ? [{ value: '', label: 'None' }] : [];
  const buildOptions = (
    currentCollection: Collection,
    prefix = '',
    labelPrefix = '',
    depth = 0,
    visitedCollectionIds = new Set<string>([currentCollection.id]),
  ): Array<{ value: string; label: string }> => currentCollection.fields.flatMap((field) => {
    const value = prefix ? `${prefix}.${field.key}` : field.key;
    const label = prefix ? `${labelPrefix}${field.label}` : field.label;
    const directOption = { value, label };
    if (!field.referenceCollectionId || depth >= MAX_COLLECTION_FIELD_PATH_DEPTH) {
      return [directOption];
    }
    const referenceCollection = collections.find((candidate) => candidate.id === field.referenceCollectionId);
    if (!referenceCollection || visitedCollectionIds.has(referenceCollection.id)) {
      return [directOption];
    }
    const nextVisited = new Set(visitedCollectionIds);
    nextVisited.add(referenceCollection.id);
    return [
      directOption,
      ...buildOptions(
        referenceCollection,
        value,
        `${label} -> ${referenceCollection.name}: `,
        depth + 1,
        nextVisited,
      ),
    ];
  });

  return [
    ...(options.includeNone ? [{ value: '', label: 'None' }] : []),
    ...buildOptions(collection),
  ];
};

const defaultFieldKey = (
  collection: Collection | null,
  preferredKeys: string[],
  preferredTypes: string[] = [],
  options: { fallbackToFirst?: boolean } = {},
): string => {
  if (!collection) return '';
  const fallbackToFirst = options.fallbackToFirst ?? true;

  for (const key of preferredKeys) {
    const field = collection.fields.find((candidate) => candidate.key === key);
    if (field) return field.key;
  }

  const typedField = collection.fields.find((field) => preferredTypes.includes(field.type));
  return typedField?.key || (fallbackToFirst ? collection.fields[0]?.key : '') || '';
};

const repeaterDatasetIdForCollection = (
  element: CanvasElement,
  collection: Collection,
): string => {
  const existingDatasetId = typeof element.props?.datasetId === 'string' ? element.props.datasetId.trim() : '';
  return existingDatasetId || `dataset_${collection.id}_${element.id}`;
};

const repeaterBindingPropsForSlot = (
  element: CanvasElement,
  slot: ComponentBindingSlot,
  collection: Collection,
  collections: Collection[],
  fieldPath: string,
): ElementProps | null => {
  if (!isRepeaterBindingSlotTarget(element, slot.targetPath)) {
    return null;
  }

  const nextProps: ElementProps = {
    ...(element.props || {}),
    collectionId: collection.id,
    datasetId: repeaterDatasetIdForCollection(element, collection),
  };

  if (slot.targetPath === 'props.collectionId') {
    const currentTitleField = typeof nextProps.titleField === 'string' ? nextProps.titleField : '';
    const currentDescriptionField = typeof nextProps.descriptionField === 'string' ? nextProps.descriptionField : '';
    const currentImageField = typeof nextProps.imageField === 'string' ? nextProps.imageField : '';
    const currentMetaField = typeof nextProps.metaField === 'string' ? nextProps.metaField : '';
    const titleField = fieldPathExists(collection, collections, currentTitleField)
      ? currentTitleField
      : defaultFieldKey(collection, ['title', 'name', 'label'], ['text']);
    const descriptionField = fieldPathExists(collection, collections, currentDescriptionField)
      ? currentDescriptionField
      : defaultFieldKey(collection, ['summary', 'description', 'excerpt', 'body'], ['richText', 'text']);
    const imageField = fieldPathExists(collection, collections, currentImageField)
      ? currentImageField
      : defaultFieldKey(collection, ['featuredImage', 'image', 'coverImage', 'thumbnail', 'media'], ['image'], { fallbackToFirst: false });
    const metaField = fieldPathExists(collection, collections, currentMetaField)
      ? currentMetaField
      : defaultFieldKey(collection, ['category', 'categories', 'topic', 'type', 'status'], ['select', 'tags'], { fallbackToFirst: false });

    nextProps.titleField = titleField;
    nextProps.descriptionField = descriptionField;
    if (imageField) {
      nextProps.imageField = imageField;
    } else {
      delete nextProps.imageField;
    }
    if (metaField) {
      nextProps.metaField = metaField;
    } else {
      delete nextProps.metaField;
    }

    return nextProps;
  }

  const targetProp = REPEATER_FIELD_BINDING_SLOT_TARGET_PROPS[slot.targetPath];
  if (!targetProp || !fieldPath) {
    return null;
  }

  nextProps[targetProp] = fieldPath;
  return nextProps;
};

const isRepeaterBindingSlotApplied = (
  element: CanvasElement,
  slot: ComponentBindingSlot,
  collection: Collection | null,
  fieldPath: string,
): boolean => {
  if (!collection || !isRepeaterBindingSlotTarget(element, slot.targetPath)) {
    return false;
  }

  const props = element.props || {};
  if (props.collectionId !== collection.id) {
    return false;
  }

  if (slot.targetPath === 'props.collectionId') {
    return true;
  }

  const targetProp = REPEATER_FIELD_BINDING_SLOT_TARGET_PROPS[slot.targetPath];
  return Boolean(targetProp && fieldPath && props[targetProp] === fieldPath);
};

const isCollectionBindingSlotApplied = (
  element: CanvasElement,
  slot: ComponentBindingSlot,
  collection: Collection | null,
  fieldPath: string,
): boolean => {
  if (!collection || !fieldPath) {
    return false;
  }

  const bindingUpdate = bindingUpdateForFieldPath(fieldPath);
  return (Array.isArray(element.dataBindings) ? element.dataBindings : []).some((binding) => {
    const source = getBindingSource(binding);
    return (
      source?.kind === 'collection'
      && source.collectionId === collection.id
      && source.field === bindingUpdate.fieldKey
      && (typeof source.path === 'string' ? source.path : '') === bindingUpdate.sourcePath
      && (binding as Record<string, unknown>).targetPath === slot.targetPath
    );
  });
};

const isBindingSlotApplied = (
  element: CanvasElement,
  slot: ComponentBindingSlot,
  collection: Collection | null,
  fieldPath: string,
): boolean => {
  const descendant = resolvedDescendantBindingSlot(element, slot);
  if (descendant) {
    return isBindingSlotApplied(descendant.element, descendant.slot, collection, fieldPath);
  }

  if (isRepeaterBindingSlotTarget(element, slot.targetPath)) {
    return isRepeaterBindingSlotApplied(element, slot, collection, fieldPath);
  }

  return isCollectionBindingSlotApplied(element, slot, collection, fieldPath);
};

const normalizedNumberInput = (value: unknown): string => (
  typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : typeof value === 'string'
      ? value
      : ''
);

const filterValueOptionsForField = (field?: CollectionField | null): Array<{ value: string; label: string }> => {
  if (!field) return [];

  if (field.type === 'boolean') {
    return [
      { value: 'true', label: 'True' },
      { value: 'false', label: 'False' },
    ];
  }

  if ((field.type === 'select' || field.type === 'tags') && Array.isArray(field.options)) {
    return field.options
      .filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
      .map((option) => ({ value: option, label: option }));
  }

  return [];
};

const collectionRecordLabel = (
  record: CollectionRecord,
  collection: Collection | null,
): string => {
  const titleField = collection?.fields.find((field) => ['title', 'name', 'label'].includes(field.key))
    || collection?.fields.find((field) => (
      typeof record.values?.[field.key] === 'string'
      && String(record.values[field.key]).trim().length > 0
    ));
  const titleValue = titleField ? String(record.values?.[titleField.key] || '').trim() : '';
  const label = titleValue || record.slug || record.id;

  return `${label} (${record.status})`;
};

const recordPreviewValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(recordPreviewValue).filter(Boolean).join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const getRecordPreviewFields = (
  record: CollectionRecord | null,
  collection: Collection | null,
) => {
  if (!record || !collection) return [];

  return collection.fields
    .map((field) => ({
      field,
      value: recordPreviewValue(record.values?.[field.key]),
    }))
    .filter((item) => item.value.trim().length > 0)
    .sort((a, b) => a.field.sortOrder - b.field.sortOrder)
    .slice(0, 6);
};

const selectedRecordPreviewImage = (
  record: CollectionRecord | null,
  collection: Collection | null,
  siteId?: string,
) => {
  if (!record || !collection) return null;
  const imageField = collection.fields.find((field) => ['image', 'coverImage', 'thumbnail', 'media'].includes(field.key) && field.type === 'image')
    || collection.fields.find((field) => field.type === 'image');
  const rawValue = imageField ? recordPreviewValue(record.values?.[imageField.key]).trim() : '';
  if (!imageField || !rawValue) return null;
  const src = /^(https?:)?\/\//.test(rawValue) || rawValue.startsWith('/')
    ? rawValue
    : siteId
      ? getPublicMediaFileUrl(rawValue, siteId)
      : '';
  if (!src) return null;

  return {
    field: imageField,
    src,
    value: rawValue,
  };
};

const collectionIdsForFieldPath = (
  collection: Collection | null,
  collections: Collection[],
  key: string,
): string[] => {
  if (!collection || !key) return [];
  const ids: string[] = [];
  let currentCollection: Collection | null = collection;
  const parts = key.split('.').filter(Boolean);

  for (let index = 0; index < parts.length - 1; index += 1) {
    const field: CollectionField | undefined = currentCollection.fields.find((candidate) => candidate.key === parts[index]);
    const referenceCollectionId: string = field?.referenceCollectionId || '';
    if (!referenceCollectionId) break;
    ids.push(referenceCollectionId);
    currentCollection = collections.find((candidate) => candidate.id === referenceCollectionId) || null;
    if (!currentCollection) break;
  }

  return Array.from(new Set(ids));
};

const resolveRecordFieldPathFromCache = (
  collection: Collection | null,
  collections: Collection[],
  recordsByCollectionId: Record<string, CollectionRecord[]>,
  record: CollectionRecord | null,
  key: string,
  depth = 0,
): unknown => {
  if (!collection || !record || !key || depth > MAX_COLLECTION_FIELD_PATH_DEPTH) return undefined;
  const [fieldKey, ...remainingKeys] = key.split('.').filter(Boolean);
  if (!fieldKey) return undefined;
  const value = record.values?.[fieldKey];
  if (remainingKeys.length === 0) return value;

  const field = collection.fields.find((candidate) => candidate.key === fieldKey);
  const referenceCollection = field?.referenceCollectionId
    ? collections.find((candidate) => candidate.id === field.referenceCollectionId) || null
    : null;
  if (!referenceCollection) return undefined;

  const referenceRecords = recordsByCollectionId[referenceCollection.id] || [];
  const resolveReference = (referenceId: unknown) => {
    if (typeof referenceId !== 'string' || referenceId.length === 0) return undefined;
    const referenceRecord = referenceRecords.find((candidate) => (
      candidate.id === referenceId || candidate.slug === referenceId
    )) || null;
    return resolveRecordFieldPathFromCache(
      referenceCollection,
      collections,
      recordsByCollectionId,
      referenceRecord,
      remainingKeys.join('.'),
      depth + 1,
    );
  };

  if (Array.isArray(value)) {
    return value.map(resolveReference).filter((entry) => entry !== undefined && entry !== null);
  }

  return resolveReference(value);
};

const firstExistingTargetPath = (
  targetPathOptions: Array<{ value: string; label: string }>,
  candidates: string[],
  fallback = targetPathOptions[0]?.value || 'props.content',
) => (
  candidates.find((candidate) => targetPathOptions.some((option) => option.value === candidate))
  || fallback
);

const collectionBindingPresetOptions = (
  collection: Collection | null,
  targetPathOptions: Array<{ value: string; label: string }>,
) => {
  if (!collection) return [];

  const presets = [
    {
      id: 'title',
      label: 'Title',
      fieldKey: defaultFieldKey(collection, ['title', 'name', 'label'], ['text'], { fallbackToFirst: false }),
      targetPath: firstExistingTargetPath(targetPathOptions, ['props.content', 'props.label', 'props.alt']),
    },
    {
      id: 'summary',
      label: 'Summary',
      fieldKey: defaultFieldKey(collection, ['summary', 'description', 'excerpt', 'body'], ['richText', 'text'], { fallbackToFirst: false }),
      targetPath: firstExistingTargetPath(targetPathOptions, ['props.html', 'props.content', 'props.label']),
    },
    {
      id: 'image',
      label: 'Image',
      fieldKey: defaultFieldKey(collection, ['image', 'coverImage', 'thumbnail', 'media'], ['image'], { fallbackToFirst: false }),
      targetPath: firstExistingTargetPath(targetPathOptions, ['props.assetId', 'props.src', 'props.href']),
    },
    {
      id: 'link',
      label: 'Link',
      fieldKey: defaultFieldKey(collection, ['url', 'link', 'href', 'website', 'file'], ['url', 'file'], { fallbackToFirst: false }),
      targetPath: firstExistingTargetPath(targetPathOptions, ['props.href', 'props.src', 'props.content']),
    },
  ];

  return presets.filter((preset, index, allPresets) => (
    Boolean(preset.fieldKey)
    && allPresets.findIndex((candidate) => (
      candidate.fieldKey === preset.fieldKey && candidate.targetPath === preset.targetPath
    )) === index
  ));
};

type SavedCollectionBindingPreset = CollectionBindingPreset;

const COLLECTION_BINDING_PRESET_STORAGE_KEY = 'backy.editor.collectionBindingPresets.v1';
const CURRENT_RECORD_FILTER_VALUE = '$currentRecord.id';
const LEGACY_CURRENT_RECORD_FILTER_VALUE = '$record.id';

const normalizeSavedCollectionBindingPresets = (value: unknown): SavedCollectionBindingPreset[] => (
  Array.isArray(value)
    ? value
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
        .map((item, index): SavedCollectionBindingPreset => ({
          id: typeof item.id === 'string' && item.id.trim() ? item.id : `preset_${index}`,
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Preset ${index + 1}`,
          collectionId: typeof item.collectionId === 'string' ? item.collectionId : '',
          fieldKey: typeof item.fieldKey === 'string' ? item.fieldKey : '',
          targetPath: typeof item.targetPath === 'string' ? item.targetPath : 'props.content',
          sourcePath: typeof item.sourcePath === 'string' ? item.sourcePath : '',
          search: typeof item.search === 'string' ? item.search : '',
          filterField: typeof item.filterField === 'string' ? item.filterField : '',
          filterValue: typeof item.filterValue === 'string' ? item.filterValue : '',
          sortBy: typeof item.sortBy === 'string' ? item.sortBy : '',
          sortDirection: item.sortDirection === 'desc' ? 'desc' : 'asc',
          limit: typeof item.limit === 'string' ? item.limit : '',
          offset: typeof item.offset === 'string' ? item.offset : '',
          updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
        }))
        .filter((item) => item.collectionId && item.fieldKey)
    : []
);

const loadSavedCollectionBindingPresets = (): SavedCollectionBindingPreset[] => {
  if (typeof window === 'undefined') return [];

  try {
    return normalizeSavedCollectionBindingPresets(
      JSON.parse(window.localStorage.getItem(COLLECTION_BINDING_PRESET_STORAGE_KEY) || '[]'),
    );
  } catch {
    return [];
  }
};

const persistSavedCollectionBindingPresets = (presets: SavedCollectionBindingPreset[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(COLLECTION_BINDING_PRESET_STORAGE_KEY, JSON.stringify(presets));
};

const mergeCollectionBindingPresets = (
  primary: SavedCollectionBindingPreset[],
  secondary: SavedCollectionBindingPreset[],
): SavedCollectionBindingPreset[] => {
  const seen = new Set<string>();
  return [...primary, ...secondary]
    .filter((preset) => {
      if (seen.has(preset.id)) return false;
      seen.add(preset.id);
      return true;
    })
    .slice(0, 48);
};

const collectionBindingForSlot = (
  element: CanvasElement,
  slot: ComponentBindingSlot,
  collection: Collection,
  collections: Collection[],
  fieldPath: string,
): Record<string, unknown> => {
  const { fieldKey, sourcePath } = bindingUpdateForFieldPath(fieldPath);
  const field = fieldForFieldPath(collection, collections, fieldPath);
  const binding: Record<string, unknown> = {
    id: `bind_${element.id}_${slot.id}_${fieldKey}`,
    datasetId: `dataset_${collection.id}`,
    targetPath: slot.targetPath,
    source: {
      kind: 'collection',
      collectionId: collection.id,
      field: fieldKey,
      ...(sourcePath ? { path: sourcePath } : {}),
    },
    mode: slot.mode || getBindingModeForField(field, slot.targetPath),
  };

  return binding;
};

const applyCollectionBindingToElement = (
  element: CanvasElement,
  binding: Record<string, unknown>,
): CanvasElement => {
  const targetPath = typeof binding.targetPath === 'string' ? binding.targetPath : '';
  const existingBindings = Array.isArray(element.dataBindings) ? element.dataBindings : [];
  const nextBindings = [
    ...existingBindings.filter((candidate) => (
      !(getBindingSource(candidate)?.kind === 'collection' && (candidate as Record<string, unknown>).targetPath === targetPath)
    )),
    binding,
  ];

  return {
    ...element,
    dataBindings: nextBindings,
  };
};

const applyDirectBindingSlotToElement = (
  element: CanvasElement,
  slot: ComponentBindingSlot,
  collection: Collection,
  collections: Collection[],
  fieldPath: string,
): { element: CanvasElement; applied: boolean } => {
  const repeaterProps = repeaterBindingPropsForSlot(element, slot, collection, collections, fieldPath);
  if (repeaterProps) {
    return {
      element: {
        ...element,
        props: repeaterProps,
      },
      applied: true,
    };
  }

  if (!fieldPath || !bindingSlotTargetAllowed(element, slot)) {
    return { element, applied: false };
  }

  return {
    element: applyCollectionBindingToElement(
      element,
      collectionBindingForSlot(element, slot, collection, collections, fieldPath),
    ),
    applied: true,
  };
};

const applyBindingSlotToElement = (
  element: CanvasElement,
  slot: ComponentBindingSlot,
  collection: Collection,
  collections: Collection[],
  fieldPath: string,
): { element: CanvasElement; applied: boolean } => {
  const descendantTarget = descendantBindingSlotTarget(slot.targetPath);
  if (!descendantTarget) {
    return applyDirectBindingSlotToElement(element, slot, collection, collections, fieldPath);
  }

  let applied = false;
  const walk = (items?: CanvasElement[]): CanvasElement[] | undefined => {
    if (!items?.length) {
      return items;
    }

    return items.map((child) => {
      if (!applied && matchesDescendantBindingTarget(child, descendantTarget.selector)) {
        const result = applyDirectBindingSlotToElement(
          child,
          { ...slot, targetPath: descendantTarget.targetPath },
          collection,
          collections,
          fieldPath,
        );
        applied = result.applied;
        return result.element;
      }

      const nextChildren = walk(child.children);
      return nextChildren !== child.children
        ? { ...child, children: nextChildren }
        : child;
    });
  };

  const nextChildren = walk(element.children);
  return applied
    ? { element: { ...element, children: nextChildren }, applied: true }
    : { element, applied: false };
};

const bindableSlotsForElement = (
  element: CanvasElement,
  collection: Collection | null,
  collections: Collection[],
): Array<{ slot: ComponentBindingSlot; fieldPath: string }> => {
  if (!collection || !Array.isArray(element.bindingSlots)) {
    return [];
  }

  return element.bindingSlots
    .map((slot) => {
      const fieldPath = bindingSlotFieldPath(slot, collection, collections);
      const canApplyWithoutFieldPath = bindingSlotCanApplyWithoutFieldPath(element, slot);
      return (fieldPath || canApplyWithoutFieldPath) && bindingSlotTargetAllowed(element, slot)
        ? { slot, fieldPath }
        : null;
    })
    .filter((entry): entry is { slot: ComponentBindingSlot; fieldPath: string } => entry !== null);
};

const childBindingSlotSummary = (
  element: CanvasElement,
  collection: Collection | null,
  collections: Collection[],
): { total: number; applicable: number } => {
  let total = 0;
  let applicable = 0;
  const walk = (items?: CanvasElement[]) => {
    (items || []).forEach((child) => {
      const slots = Array.isArray(child.bindingSlots) ? child.bindingSlots : [];
      total += slots.length;
      applicable += bindableSlotsForElement(child, collection, collections).length;
      walk(child.children);
    });
  };

  walk(element.children);
  return { total, applicable };
};

interface BindingSlotCoverageItem {
  id: string;
  label: string;
  targetLabel: string;
  fieldPath: string;
  applied: boolean;
  applicable: boolean;
  required: boolean;
  reason: string;
}

interface BindingSlotCoverageSummary {
  total: number;
  applicable: number;
  applied: number;
  missingRequired: number;
  items: BindingSlotCoverageItem[];
}

const bindingSlotCoverageForElement = (
  element: CanvasElement,
  collection: Collection | null,
  collections: Collection[],
  targetPathOptions: Array<{ value: string; label: string }>,
): BindingSlotCoverageSummary => {
  const items: BindingSlotCoverageItem[] = [];
  const addSlot = (
    ownerElement: CanvasElement,
    slot: ComponentBindingSlot,
    ownerTargetPathOptions: Array<{ value: string; label: string }>,
    labelPrefix = '',
  ) => {
    const fieldCandidates = bindingSlotFieldCandidates(slot);
    const fieldPath = bindingSlotFieldPath(slot, collection, collections);
    const targetAllowed = bindingSlotTargetAllowed(ownerElement, slot);
    const canApplyWithoutFieldPath = bindingSlotCanApplyWithoutFieldPath(ownerElement, slot);
    const applicable = Boolean(collection && targetAllowed && (fieldPath || canApplyWithoutFieldPath));
    const applied = isBindingSlotApplied(ownerElement, slot, collection, fieldPath);
    const reason = !collection
      ? 'Choose a collection.'
      : !targetAllowed
        ? 'Target unavailable.'
        : fieldCandidates.length === 0 && !canApplyWithoutFieldPath
          ? 'Record-level slot.'
          : !fieldPath && !canApplyWithoutFieldPath
            ? 'No matching field.'
            : '';

    items.push({
      id: `${ownerElement.id}-${slot.id}`,
      label: labelPrefix ? `${labelPrefix}: ${slot.label}` : slot.label,
      targetLabel: bindingSlotTargetLabel(ownerElement, slot, ownerTargetPathOptions),
      fieldPath,
      applied,
      applicable,
      required: Boolean(slot.required),
      reason,
    });
  };
  const walk = (itemsToWalk?: CanvasElement[]) => {
    (itemsToWalk || []).forEach((child) => {
      (Array.isArray(child.bindingSlots) ? child.bindingSlots : []).forEach((slot) => {
        addSlot(child, slot, getTargetPathOptions(child.type), child.name || child.type);
      });
      walk(child.children);
    });
  };

  (Array.isArray(element.bindingSlots) ? element.bindingSlots : [])
    .forEach((slot) => addSlot(element, slot, targetPathOptions));
  walk(element.children);

  const applied = items.filter((item) => item.applied).length;
  const applicable = items.filter((item) => item.applicable).length;
  const missingRequired = items.filter((item) => item.required && !item.applied).length;

  return {
    total: items.length,
    applicable,
    applied,
    missingRequired,
    items,
  };
};

const applyChildBindingSlots = (
  element: CanvasElement,
  collection: Collection,
  collections: Collection[],
): { children: CanvasElement[] | undefined; applied: number } => {
  let applied = 0;
  const walk = (items?: CanvasElement[]): CanvasElement[] | undefined => {
    if (!items?.length) {
      return items;
    }

    return items.map((child) => {
      const slotBindings = bindableSlotsForElement(child, collection, collections);
      const nextChildChildren = walk(child.children);
      let nextChild: CanvasElement = nextChildChildren !== child.children
        ? { ...child, children: nextChildChildren }
        : child;

      slotBindings.forEach(({ slot, fieldPath }) => {
        const result = applyBindingSlotToElement(nextChild, slot, collection, collections, fieldPath);
        nextChild = result.element;
        if (result.applied) {
          applied += 1;
        }
      });

      return nextChild;
    });
  };

  return {
    children: walk(element.children),
    applied,
  };
};

const collectionBindingCountForElement = (element: CanvasElement): number => {
  const directBindings = (Array.isArray(element.dataBindings) ? element.dataBindings : [])
    .filter((binding) => getBindingSource(binding)?.kind === 'collection').length;
  const repeaterBindingProps = normalizeCanvasElementType(element.type) === 'repeater'
    ? REPEATER_COLLECTION_BINDING_PROP_KEYS.filter((key) => element.props?.[key] !== undefined).length
    : 0;
  const childBindings = (element.children || [])
    .reduce((total, child) => total + collectionBindingCountForElement(child), 0);

  return directBindings + repeaterBindingProps + childBindings;
};

const clearCollectionBindingsFromElement = (
  element: CanvasElement,
): { element: CanvasElement; cleared: number } => {
  let cleared = 0;
  let nextElement: CanvasElement = element;
  const existingBindings = Array.isArray(element.dataBindings) ? element.dataBindings : [];
  const retainedBindings = existingBindings.filter((binding) => getBindingSource(binding)?.kind !== 'collection');

  if (retainedBindings.length !== existingBindings.length) {
    cleared += existingBindings.length - retainedBindings.length;
    nextElement = {
      ...nextElement,
      dataBindings: retainedBindings.length > 0 ? retainedBindings : undefined,
    };
    if (retainedBindings.length === 0) {
      delete nextElement.dataBindings;
    }
  }

  if (normalizeCanvasElementType(element.type) === 'repeater' && element.props) {
    const nextProps: ElementProps = { ...element.props };
    let clearedProps = 0;
    REPEATER_COLLECTION_BINDING_PROP_KEYS.forEach((key) => {
      if (nextProps[key] !== undefined) {
        delete nextProps[key];
        clearedProps += 1;
      }
    });
    if (clearedProps > 0) {
      cleared += clearedProps;
      nextElement = {
        ...nextElement,
        props: nextProps,
      };
    }
  }

  if (element.children?.length) {
    let childCleared = 0;
    const nextChildren = element.children.map((child) => {
      const result = clearCollectionBindingsFromElement(child);
      childCleared += result.cleared;
      return result.element;
    });

    if (childCleared > 0) {
      cleared += childCleared;
      nextElement = {
        ...nextElement,
        children: nextChildren,
      };
    }
  }

  return { element: nextElement, cleared };
};

function CollectionFilterValueControl({
  testId,
  field,
  value,
  onChange,
  allowCurrentRecordValue = false,
}: {
  testId: string;
  field?: CollectionField | null;
  value: string;
  onChange: (value: string) => void;
  allowCurrentRecordValue?: boolean;
}) {
  const options = filterValueOptionsForField(field);
  const inputType = field?.type === 'number' ? 'number' : field?.type === 'date' || field?.type === 'datetime' ? 'text' : 'text';
  const currentRecordButton = allowCurrentRecordValue ? (
    <button
      type="button"
      onClick={() => onChange(CURRENT_RECORD_FILTER_VALUE)}
      data-testid={`${testId}-current-record`}
      className="shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-muted"
    >
      Current record
    </button>
  ) : null;

  if (options.length > 0) {
    const showCurrentRecordOption = allowCurrentRecordValue && value === CURRENT_RECORD_FILTER_VALUE;

    return (
      <div className="flex gap-2">
        <select
          value={showCurrentRecordOption || options.some((option) => option.value === value) ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          data-testid={testId}
          className={cn(
            'min-w-0 flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
        >
          <option value="">Any value</option>
          {showCurrentRecordOption ? (
            <option value={CURRENT_RECORD_FILTER_VALUE}>Current record</option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {currentRecordButton}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        type={inputType}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        className={cn(
          'min-w-0 flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
          'focus:outline-none focus:ring-2 focus:ring-ring'
        )}
        placeholder={field ? `Filter ${field.label}` : 'Exact value'}
      />
      {currentRecordButton}
    </div>
  );
}

interface PresetBindingSlotsPanelProps {
  element: CanvasElement;
  collections: Collection[];
  selectedCollectionId: string;
  selectedCollection: Collection | null;
  childSummary: { total: number; applicable: number };
  targetPathOptions: Array<{ value: string; label: string }>;
  selectedFieldKey: string;
  selectedSourcePath: string;
  selectedTargetPath: string;
  clearableBindingCount: number;
  onCollectionChange: (collectionId: string) => void;
  onApplySlot: (slot: ComponentBindingSlot, fieldPath: string) => void;
  onApplyAllSlots: () => void;
  onClearAllSlots: () => void;
  onApplyChildSlots: () => void;
}

function PresetBindingSlotsPanel({
  element,
  collections,
  selectedCollectionId,
  selectedCollection,
  childSummary,
  targetPathOptions,
  selectedFieldKey,
  selectedSourcePath,
  selectedTargetPath,
  clearableBindingCount,
  onCollectionChange,
  onApplySlot,
  onApplyAllSlots,
  onClearAllSlots,
  onApplyChildSlots,
}: PresetBindingSlotsPanelProps) {
  const slots = Array.isArray(element.bindingSlots) ? element.bindingSlots : [];
  const [coverageCopyState, setCoverageCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  if (slots.length === 0 && childSummary.total === 0) {
    return null;
  }

  const rootApplicableCount = selectedCollection
    ? slots.filter((slot) => {
        const fieldPath = bindingSlotFieldPath(slot, selectedCollection, collections);
        return bindingSlotTargetAllowed(element, slot) && (fieldPath || bindingSlotCanApplyWithoutFieldPath(element, slot));
      }).length
    : 0;
  const allApplicableCount = rootApplicableCount + childSummary.applicable;
  const coverageSummary = bindingSlotCoverageForElement(element, selectedCollection, collections, targetPathOptions);
  const coveragePercent = coverageSummary.total > 0
    ? Math.round((coverageSummary.applied / coverageSummary.total) * 100)
    : 0;
  const unresolvedCoverageItems = coverageSummary.items
    .filter((item) => !item.applied)
    .slice(0, 3);
  const coverageBrief = {
    schema: 'backy.editor.binding-slot-coverage.v1',
    element: {
      id: element.id,
      type: normalizeCanvasElementType(element.type),
      name: element.name || null,
    },
    collection: selectedCollection
      ? {
          id: selectedCollection.id,
          name: selectedCollection.name,
          slug: selectedCollection.slug,
        }
      : null,
    coverage: {
      total: coverageSummary.total,
      applicable: coverageSummary.applicable,
      applied: coverageSummary.applied,
      missingRequired: coverageSummary.missingRequired,
      boundTargets: clearableBindingCount,
    },
    slots: coverageSummary.items.map((item) => ({
      label: item.label,
      target: item.targetLabel,
      fieldPath: item.fieldPath || null,
      applied: item.applied,
      applicable: item.applicable,
      required: item.required,
      reason: item.reason || null,
    })),
  };
  const copyCoverageBrief = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(coverageBrief, null, 2));
      setCoverageCopyState('copied');
      window.setTimeout(() => setCoverageCopyState('idle'), 1600);
    } catch {
      setCoverageCopyState('failed');
      window.setTimeout(() => setCoverageCopyState('idle'), 2200);
    }
  };
  const dataBindingSlotActionStatusId = 'editor-data-binding-slot-action-status';
  const applyAllBindingSlotsAction = buildEditorDataBindingAction({
    label: 'Apply all binding slots',
    disabledReason: !selectedCollection
      ? 'Choose a collection first.'
      : allApplicableCount === 0
        ? 'No preset binding slots match the selected collection.'
        : '',
    readyStatus: `${allApplicableCount} binding slot${allApplicableCount === 1 ? '' : 's'} can be applied.`,
  });
  const clearAllBindingSlotsAction = buildEditorDataBindingAction({
    label: 'Clear all collection bindings',
    disabledReason: clearableBindingCount === 0 ? 'No collection bindings are currently applied.' : '',
    readyStatus: `${clearableBindingCount} collection binding target${clearableBindingCount === 1 ? '' : 's'} can be cleared.`,
  });
  const copyCoverageBriefStatus = coverageCopyState === 'copied'
    ? 'Binding-slot coverage brief copied.'
    : coverageCopyState === 'failed'
      ? 'Binding-slot coverage brief copy failed.'
      : 'Copy binding-slot coverage brief available.';
  const copyCoverageBriefAction = buildEditorDataBindingAction({
    label: 'Copy binding-slot coverage brief',
    readyStatus: copyCoverageBriefStatus,
  });
  const applyChildBindingSlotsAction = buildEditorDataBindingAction({
    label: 'Apply child binding slots',
    disabledReason: !selectedCollection
      ? 'Choose a collection first.'
      : childSummary.applicable === 0
        ? 'No child binding slots match the selected collection.'
        : '',
    readyStatus: `${childSummary.applicable} child binding slot${childSummary.applicable === 1 ? '' : 's'} can be applied.`,
  });

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="editor-data-binding-slots">
      <span
        id={dataBindingSlotActionStatusId}
        className="sr-only"
        data-testid="editor-data-binding-slot-action-status"
        aria-live="polite"
      >
        {[
          applyAllBindingSlotsAction.actionStatus,
          clearAllBindingSlotsAction.actionStatus,
          copyCoverageBriefAction.actionStatus,
          applyChildBindingSlotsAction.actionStatus,
        ].join(' ')}
      </span>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">Preset binding slots</span>
        <span className="text-muted-foreground">
          {slots.length + childSummary.total} target{slots.length + childSummary.total === 1 ? '' : 's'}
        </span>
      </div>
      <div className="space-y-2">
        <select
          value={selectedCollectionId}
          onChange={(event) => onCollectionChange(event.target.value)}
          data-testid="editor-data-binding-slot-collection"
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
        >
          <option value="">No collection</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onApplyAllSlots}
            disabled={!selectedCollection || allApplicableCount === 0}
            title={applyAllBindingSlotsAction.actionStatus}
            aria-describedby={dataBindingSlotActionStatusId}
            data-action-state={applyAllBindingSlotsAction.actionState}
            data-action-status={applyAllBindingSlotsAction.actionStatus}
            data-disabled-reason={applyAllBindingSlotsAction.disabledReason || undefined}
            data-testid="editor-data-apply-all-binding-slots"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply all
          </button>
          <button
            type="button"
            onClick={onClearAllSlots}
            disabled={clearableBindingCount === 0}
            title={clearAllBindingSlotsAction.actionStatus}
            aria-describedby={dataBindingSlotActionStatusId}
            data-action-state={clearAllBindingSlotsAction.actionState}
            data-action-status={clearAllBindingSlotsAction.actionStatus}
            data-disabled-reason={clearAllBindingSlotsAction.disabledReason || undefined}
            data-testid="editor-data-clear-all-binding-slots"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear all
          </button>
        </div>

        {coverageSummary.total > 0 && (
          <div
            className="rounded-md border border-border bg-background p-2 text-xs"
            data-testid="editor-data-binding-slot-coverage"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">Slot coverage</span>
              <span className="text-muted-foreground">
                {coverageSummary.applied}/{coverageSummary.total} applied
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${coveragePercent}%` }}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
              <span>{coverageSummary.applicable} match</span>
              <span>{coverageSummary.missingRequired} required</span>
              <span>{clearableBindingCount} bound</span>
            </div>
            <button
              type="button"
              onClick={() => void copyCoverageBrief()}
              title={copyCoverageBriefAction.actionStatus}
              aria-describedby={dataBindingSlotActionStatusId}
              data-action-state={copyCoverageBriefAction.actionState}
              data-action-status={copyCoverageBriefAction.actionStatus}
              data-testid="editor-data-copy-binding-slot-coverage"
              className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
            >
              {coverageCopyState === 'copied' ? 'Copied brief' : coverageCopyState === 'failed' ? 'Copy failed' : 'Copy brief'}
            </button>
            {unresolvedCoverageItems.length > 0 && (
              <div className="mt-2 space-y-1">
                {unresolvedCoverageItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                    data-testid={`editor-data-binding-slot-coverage-item-${item.id}`}
                  >
                    <span className="min-w-0 truncate">
                      {item.label}
                    </span>
                    <span className="max-w-[45%] truncate text-right">
                      {item.fieldPath || item.reason || item.targetLabel}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {slots.map((slot) => {
          const fieldCandidates = bindingSlotFieldCandidates(slot);
          const fieldPath = bindingSlotFieldPath(slot, selectedCollection, collections);
          const targetAllowed = bindingSlotTargetAllowed(element, slot);
          const targetLabel = bindingSlotTargetLabel(element, slot, targetPathOptions);
          const bindingUpdate = fieldPath ? bindingUpdateForFieldPath(fieldPath) : null;
          const canApplyWithoutFieldPath = bindingSlotCanApplyWithoutFieldPath(element, slot);
          const canApplySlot = Boolean(selectedCollection && targetAllowed && (fieldPath || canApplyWithoutFieldPath));
          const isApplied = isBindingSlotApplied(element, slot, selectedCollection, fieldPath)
            || Boolean(
              bindingUpdate
              && selectedFieldKey === bindingUpdate.fieldKey
              && selectedSourcePath === bindingUpdate.sourcePath
              && selectedTargetPath === slot.targetPath,
            );
          const disabledReason = !selectedCollection
            ? 'Choose a collection first.'
            : !targetAllowed
              ? 'This slot is not available for this element type.'
              : fieldCandidates.length === 0 && !canApplyWithoutFieldPath
                ? 'This slot documents a record-level connection.'
                : !fieldPath && !canApplyWithoutFieldPath
                  ? 'No matching field exists in the selected collection.'
                  : '';
          const slotTargetSummary = fieldPath
            ? `${fieldPath} -> ${targetLabel}`
            : canApplyWithoutFieldPath && selectedCollection
              ? `${selectedCollection.name} -> ${targetLabel}`
              : slot.description || disabledReason;
          const applySlotAction = buildEditorDataBindingAction({
            label: `Apply ${slot.label}`,
            disabledReason,
            selected: isApplied,
            readyStatus: `Apply ${slot.label} to ${slotTargetSummary}.`,
            selectedStatus: `${slot.label} is already applied.`,
          });

          return (
            <div
              key={slot.id}
              className={cn(
                'rounded-md border bg-background p-2 text-xs',
                isApplied ? 'border-primary' : 'border-border'
              )}
              data-testid={`editor-data-binding-slot-${slot.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{slot.label}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                    {slot.sourceKind && <span className="rounded bg-muted px-1.5 py-0.5">{slot.sourceKind}</span>}
                    {slot.fieldKey && <span className="rounded bg-muted px-1.5 py-0.5">{slot.fieldKey}</span>}
                    {slot.mode && <span className="rounded bg-muted px-1.5 py-0.5">{slot.mode}</span>}
                    {slot.required && <span className="rounded bg-muted px-1.5 py-0.5">required</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => canApplySlot && onApplySlot(slot, fieldPath)}
                  disabled={!canApplySlot}
                  title={applySlotAction.actionStatus}
                  aria-describedby={dataBindingSlotActionStatusId}
                  data-action-state={applySlotAction.actionState}
                  data-action-status={applySlotAction.actionStatus}
                  data-disabled-reason={applySlotAction.disabledReason || undefined}
                  data-testid={`editor-data-binding-slot-apply-${slot.id}`}
                  className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isApplied ? 'Applied' : 'Apply'}
                </button>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {slotTargetSummary}
              </div>
              {disabledReason && (
                <div className="mt-1 text-[11px] text-muted-foreground" data-testid={`editor-data-binding-slot-reason-${slot.id}`}>
                  {disabledReason}
                </div>
              )}
            </div>
          );
        })}

        {childSummary.total > 0 && (
          <div className="rounded-md border border-border bg-background p-2 text-xs" data-testid="editor-data-child-binding-slots">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">Child element slots</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {childSummary.applicable} of {childSummary.total} targets match the selected collection.
                </div>
              </div>
              <button
                type="button"
                onClick={onApplyChildSlots}
                disabled={!selectedCollection || childSummary.applicable === 0}
                title={applyChildBindingSlotsAction.actionStatus}
                aria-describedby={dataBindingSlotActionStatusId}
                data-action-state={applyChildBindingSlotsAction.actionState}
                data-action-status={applyChildBindingSlotsAction.actionStatus}
                data-disabled-reason={applyChildBindingSlotsAction.disabledReason || undefined}
                data-testid="editor-data-apply-child-binding-slots"
                className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply child slots
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface RepeaterDataPropertiesProps {
  element: CanvasElement;
  siteId?: string;
  collections: Collection[];
  onChange: (updates: Partial<CanvasElement>) => void;
}

function RepeaterDataProperties({
  element,
  siteId,
  collections,
  onChange,
}: RepeaterDataPropertiesProps) {
  const props = element.props || {};
  const query = getObjectProp(props.query);
  const selectedCollectionId = typeof props.collectionId === 'string' ? props.collectionId : '';
  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId) || null;
  const selectedDatasetId = typeof props.datasetId === 'string' && props.datasetId.trim()
    ? props.datasetId
    : selectedCollectionId
      ? `dataset_${selectedCollectionId}_${element.id}`
      : '';
  const selectedTitleField = typeof props.titleField === 'string'
    ? props.titleField
    : typeof props.repeaterTitleField === 'string'
      ? props.repeaterTitleField
      : defaultFieldKey(selectedCollection, ['title', 'name', 'label'], ['text']);
  const selectedDescriptionField = typeof props.descriptionField === 'string'
    ? props.descriptionField
    : typeof props.repeaterDescriptionField === 'string'
      ? props.repeaterDescriptionField
      : defaultFieldKey(selectedCollection, ['summary', 'description', 'excerpt', 'body'], ['richText', 'text']);
  const selectedImageField = typeof props.imageField === 'string'
    ? props.imageField
    : typeof props.repeaterImageField === 'string'
      ? props.repeaterImageField
      : defaultFieldKey(selectedCollection, ['image', 'coverImage', 'thumbnail'], ['image'], { fallbackToFirst: false });
  const selectedMetaField = typeof props.metaField === 'string'
    ? props.metaField
    : typeof props.repeaterMetaField === 'string'
      ? props.repeaterMetaField
      : defaultFieldKey(selectedCollection, ['category', 'categories', 'topic', 'type', 'status'], ['select', 'tags'], { fallbackToFirst: false });
  const selectedSearch = typeof query.q === 'string'
    ? query.q
    : typeof query.search === 'string'
      ? query.search
      : '';
  const selectedFilterField = typeof query.fieldKey === 'string' ? query.fieldKey : '';
  const selectedFilterFieldDefinition = fieldForFieldPath(selectedCollection, collections, selectedFilterField);
  const selectedFilterValue = typeof query.fieldValue === 'string' || typeof query.fieldValue === 'number' || typeof query.fieldValue === 'boolean'
    ? String(query.fieldValue)
    : '';
  const selectedSortBy = typeof query.sortBy === 'string'
    ? query.sortBy
    : typeof props.sortBy === 'string'
      ? props.sortBy
      : '';
  const selectedSortDirection = query.sortDirection === 'desc' || props.sortDirection === 'desc' ? 'desc' : 'asc';
  const selectedLimit = normalizedNumberInput(props.limit ?? query.limit);
  const selectedOffset = normalizedNumberInput(props.offset ?? query.offset);
  const selectedColumns = normalizedNumberInput(props.columns || 3);
  const selectedGap = normalizedNumberInput(props.gap ?? 16);
  const selectedEmptyMessage = typeof props.emptyMessage === 'string' ? props.emptyMessage : 'No records yet.';
  const repeaterFieldOptions = collectionFieldPathOptions(selectedCollection, collections);
  const repeaterOptionalFieldOptions = collectionFieldPathOptions(selectedCollection, collections, { includeNone: true });
  const repeaterImageFieldOptions = collectionFieldPathOptions(selectedCollection, collections, { includeNone: true });
  const [previewRecords, setPreviewRecords] = useState<CollectionRecord[]>([]);
  const [previewPagination, setPreviewPagination] = useState<{ total: number; limit: number; offset: number; hasMore: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewReferenceRecords, setPreviewReferenceRecords] = useState<Record<string, CollectionRecord[]>>({});
  const [previewReferenceLoading, setPreviewReferenceLoading] = useState(false);
  const [previewReferenceError, setPreviewReferenceError] = useState<string | null>(null);
  const [repeaterBriefCopyState, setRepeaterBriefCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [repeaterRecordsUrlCopyState, setRepeaterRecordsUrlCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const usesCurrentRecordFilter = selectedFilterValue === CURRENT_RECORD_FILTER_VALUE || selectedFilterValue === LEGACY_CURRENT_RECORD_FILTER_VALUE;
  const previewLimit = Math.min(
    Math.max(Number.parseInt(selectedLimit || '6', 10) || 6, 1),
    8,
  );
  const previewOffset = Math.max(Number.parseInt(selectedOffset || '0', 10) || 0, 0);
  const previewNeedsClientQuery = selectedFilterField.includes('.') || selectedSortBy.includes('.');

  useEffect(() => {
    if (!siteId || !selectedCollectionId || !selectedCollection || usesCurrentRecordFilter) {
      setPreviewRecords([]);
      setPreviewPagination(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    listCollectionRecords(siteId, selectedCollectionId, {
      status: '',
      search: selectedSearch.trim() || undefined,
      fieldKey: previewNeedsClientQuery ? undefined : selectedFilterField.trim() || undefined,
      fieldValue: previewNeedsClientQuery ? undefined : selectedFilterValue.trim() || undefined,
      sortBy: previewNeedsClientQuery ? 'updatedAt' : selectedSortBy.trim() || undefined,
      sortDirection: previewNeedsClientQuery ? 'desc' : selectedSortDirection,
      limit: previewNeedsClientQuery ? 100 : previewLimit,
      offset: previewNeedsClientQuery ? 0 : previewOffset,
    })
      .then((result) => {
        if (cancelled) return;
        setPreviewRecords(result.records);
        setPreviewPagination(result.pagination);
      })
      .catch((error) => {
        if (cancelled) return;
        setPreviewRecords([]);
        setPreviewPagination(null);
        setPreviewError(error instanceof Error ? error.message : 'Unable to load repeater preview records');
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    previewLimit,
    previewOffset,
    selectedCollection,
    selectedCollectionId,
    selectedFilterField,
    selectedFilterValue,
    selectedSearch,
    selectedSortBy,
    selectedSortDirection,
    siteId,
    previewNeedsClientQuery,
    usesCurrentRecordFilter,
  ]);

  useEffect(() => {
    const referenceCollectionIds = Array.from(new Set([
      ...collectionIdsForFieldPath(selectedCollection, collections, selectedTitleField),
      ...collectionIdsForFieldPath(selectedCollection, collections, selectedDescriptionField),
      ...collectionIdsForFieldPath(selectedCollection, collections, selectedImageField),
      ...collectionIdsForFieldPath(selectedCollection, collections, selectedMetaField),
      ...collectionIdsForFieldPath(selectedCollection, collections, selectedFilterField),
      ...collectionIdsForFieldPath(selectedCollection, collections, selectedSortBy),
    ]));

    if (!siteId || referenceCollectionIds.length === 0) {
      setPreviewReferenceRecords({});
      setPreviewReferenceError(null);
      setPreviewReferenceLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewReferenceLoading(true);
    setPreviewReferenceError(null);
    Promise.all(referenceCollectionIds.map(async (collectionId) => {
      const result = await listCollectionRecords(siteId, collectionId, {
        status: '',
        sortBy: 'updatedAt',
        sortDirection: 'desc',
        limit: 100,
        offset: 0,
      });
      return [collectionId, result.records] as const;
    }))
      .then((entries) => {
        if (cancelled) return;
        setPreviewReferenceRecords(Object.fromEntries(entries));
      })
      .catch((error) => {
        if (cancelled) return;
        setPreviewReferenceRecords({});
        setPreviewReferenceError(error instanceof Error ? error.message : 'Unable to resolve joined preview records');
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewReferenceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [collections, selectedCollection, selectedDescriptionField, selectedFilterField, selectedImageField, selectedMetaField, selectedSortBy, selectedTitleField, siteId]);

  const clientResolvedPreviewRecords = previewNeedsClientQuery
    ? previewRecords
        .filter((record) => {
          if (!selectedFilterField.trim() || !selectedFilterValue.trim()) return true;
          const resolvedValue = resolveRecordFieldPathFromCache(
            selectedCollection,
            collections,
            previewReferenceRecords,
            record,
            selectedFilterField,
          );
          const resolvedValues = Array.isArray(resolvedValue) ? resolvedValue : [resolvedValue];
          return resolvedValues.some((value) => (
            recordPreviewValue(value).trim().toLowerCase() === selectedFilterValue.trim().toLowerCase()
          ));
        })
        .sort((a, b) => {
          if (!selectedSortBy.trim()) return 0;
          const firstValue = recordPreviewValue(resolveRecordFieldPathFromCache(
            selectedCollection,
            collections,
            previewReferenceRecords,
            a,
            selectedSortBy,
          ));
          const secondValue = recordPreviewValue(resolveRecordFieldPathFromCache(
            selectedCollection,
            collections,
            previewReferenceRecords,
            b,
            selectedSortBy,
          ));
          const comparison = firstValue.localeCompare(secondValue, undefined, { numeric: true, sensitivity: 'base' });
          return selectedSortDirection === 'desc' ? comparison * -1 : comparison;
        })
    : previewRecords;
  const visiblePreviewRecords = previewNeedsClientQuery
    ? clientResolvedPreviewRecords.slice(previewOffset, previewOffset + previewLimit)
    : previewRecords;
  const effectivePreviewPagination = previewNeedsClientQuery
    ? {
        total: clientResolvedPreviewRecords.length,
        limit: previewLimit,
        offset: previewOffset,
        hasMore: previewOffset + visiblePreviewRecords.length < clientResolvedPreviewRecords.length,
      }
    : previewPagination;

  const repeaterPreviewRows = visiblePreviewRecords.map((record) => {
    const title = recordPreviewValue(
      resolveRecordFieldPathFromCache(selectedCollection, collections, previewReferenceRecords, record, selectedTitleField),
    ) || collectionRecordLabel(record, selectedCollection);
    const description = recordPreviewValue(
      resolveRecordFieldPathFromCache(selectedCollection, collections, previewReferenceRecords, record, selectedDescriptionField),
    );
    const meta = selectedMetaField
      ? recordPreviewValue(resolveRecordFieldPathFromCache(selectedCollection, collections, previewReferenceRecords, record, selectedMetaField))
      : '';
    const rawImage = selectedImageField
      ? recordPreviewValue(resolveRecordFieldPathFromCache(selectedCollection, collections, previewReferenceRecords, record, selectedImageField)).trim()
      : '';
    const imageSrc = rawImage
      ? /^(https?:)?\/\//.test(rawImage) || rawImage.startsWith('/')
        ? rawImage
        : siteId
          ? getPublicMediaFileUrl(rawImage, siteId)
          : ''
      : '';

    return {
      record,
      title,
      description,
      meta,
      imageSrc,
    };
  });
  const repeaterRecordsUrl = buildCollectionRecordsApiUrl(siteId, selectedCollection?.id, {
    q: selectedSearch,
    fieldKey: usesCurrentRecordFilter ? null : selectedFilterField,
    fieldValue: usesCurrentRecordFilter ? null : selectedFilterValue,
    sortBy: selectedSortBy,
    sortDirection: selectedSortBy ? selectedSortDirection : null,
    limit: selectedLimit,
    offset: selectedOffset,
  });
  const repeaterDatasetActionPlanActions = [
    {
      key: 'choose-collection',
      label: 'Choose collection',
      ready: Boolean(selectedCollection),
      mode: selectedCollection ? 'ready' : 'blocked',
      reason: selectedCollection
        ? `${selectedCollection.name} feeds this repeater.`
        : 'Choose a collection before configuring dynamic records.',
    },
    {
      key: 'map-card-fields',
      label: 'Map card fields',
      ready: Boolean(selectedCollection && fieldPathExists(selectedCollection, collections, selectedTitleField)),
      mode: selectedCollection && fieldPathExists(selectedCollection, collections, selectedTitleField) ? 'ready' : 'operator-action',
      reason: selectedCollection && fieldPathExists(selectedCollection, collections, selectedTitleField)
        ? `Title field ${selectedTitleField} is mapped; optional image/meta fields can refine the card.`
        : 'Map at least a valid title field for repeatable card output.',
    },
    {
      key: 'query-preview',
      label: 'Preview query',
      ready: usesCurrentRecordFilter || Boolean(!previewError && !previewReferenceError && (previewLoading || visiblePreviewRecords.length > 0 || effectivePreviewPagination)),
      mode: usesCurrentRecordFilter || (!previewError && !previewReferenceError) ? 'ready' : 'operator-action',
      reason: usesCurrentRecordFilter
        ? 'Current-record filters resolve on dynamic item pages and are documented in the handoff brief.'
        : previewError || previewReferenceError
          ? previewError || previewReferenceError || 'Preview query needs attention.'
          : `${visiblePreviewRecords.length} record${visiblePreviewRecords.length === 1 ? '' : 's'} visible in the current preview.`,
    },
    {
      key: 'records-url',
      label: 'Records URL',
      ready: Boolean(repeaterRecordsUrl),
      mode: repeaterRecordsUrl ? 'ready' : 'operator-action',
      reason: repeaterRecordsUrl
        ? 'A public records URL can be copied for custom frontend integration.'
        : 'Select a collection before copying the records URL.',
    },
    {
      key: 'layout',
      label: 'Layout',
      ready: Boolean(Number.parseInt(selectedColumns || '0', 10) > 0 && (!selectedLimit || Number.parseInt(selectedLimit, 10) > 0)),
      mode: Number.parseInt(selectedColumns || '0', 10) > 0 && (!selectedLimit || Number.parseInt(selectedLimit, 10) > 0) ? 'ready' : 'operator-action',
      reason: Number.parseInt(selectedColumns || '0', 10) > 0 && (!selectedLimit || Number.parseInt(selectedLimit, 10) > 0)
        ? `${selectedColumns} columns with limit ${selectedLimit || 'default'} are configured.`
        : 'Set a positive item limit and column count for predictable responsive output.',
    },
    {
      key: 'join-strategy',
      label: 'Join strategy',
      ready: !previewNeedsClientQuery || !previewReferenceError,
      mode: previewNeedsClientQuery ? 'operator-action' : 'ready',
      reason: previewNeedsClientQuery
        ? 'Joined filter or sort fields are client-resolved in preview and noted for custom frontend handoff.'
        : 'Query can be resolved directly by the collection records API.',
    },
  ] as const;
  const repeaterDatasetActionPlanReadyCount = repeaterDatasetActionPlanActions.filter((action) => action.ready).length;
  const repeaterDatasetActionPlan = {
    schema: 'backy.editor.repeater-dataset-action-plan.v1',
    attention: repeaterDatasetActionPlanReadyCount !== repeaterDatasetActionPlanActions.length,
    recommendedAction: repeaterDatasetActionPlanActions.find((action) => !action.ready)?.key || 'none',
    readyCount: repeaterDatasetActionPlanReadyCount,
    totalCount: repeaterDatasetActionPlanActions.length,
    summary: repeaterDatasetActionPlanReadyCount === repeaterDatasetActionPlanActions.length
      ? 'This repeater dataset is ready for dynamic rendering and custom frontend handoff.'
      : `${repeaterDatasetActionPlanActions.length - repeaterDatasetActionPlanReadyCount} repeater dataset step${repeaterDatasetActionPlanActions.length - repeaterDatasetActionPlanReadyCount === 1 ? '' : 's'} need attention before publish handoff.`,
    actions: repeaterDatasetActionPlanActions,
  };
  const repeaterDatasetBrief = {
    schema: 'backy.editor.repeater-dataset.v1',
    element: {
      id: element.id,
      type: normalizeCanvasElementType(element.type),
      name: element.name || null,
    },
    collection: selectedCollection
      ? {
          id: selectedCollection.id,
          name: selectedCollection.name,
          slug: selectedCollection.slug,
          status: selectedCollection.status,
        }
      : null,
    dataset: {
      id: selectedDatasetId || null,
      source: 'collection',
      recordsUrl: repeaterRecordsUrl || null,
    },
    fields: {
      title: selectedTitleField || null,
      description: selectedDescriptionField || null,
      image: selectedImageField || null,
      meta: selectedMetaField || null,
    },
    query: {
      search: selectedSearch || null,
      filterField: selectedFilterField || null,
      filterValue: selectedFilterValue || null,
      usesCurrentRecordFilter,
      sortBy: selectedSortBy || null,
      sortDirection: selectedSortBy ? selectedSortDirection : null,
      limit: selectedLimit || null,
      offset: selectedOffset || null,
      clientResolved: previewNeedsClientQuery,
    },
    layout: {
      columns: selectedColumns || null,
      gap: selectedGap || null,
      emptyMessage: selectedEmptyMessage,
    },
    preview: {
      total: effectivePreviewPagination?.total ?? null,
      shown: repeaterPreviewRows.length,
      hasMore: Boolean(effectivePreviewPagination?.hasMore),
      rows: repeaterPreviewRows.slice(0, 5).map(({ record, title, meta }) => ({
        id: record.id,
        slug: record.slug,
        title,
        meta: meta || null,
        status: record.status,
      })),
    },
    actionPlan: repeaterDatasetActionPlan,
  };
  const copyRepeaterDatasetBrief = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(repeaterDatasetBrief, null, 2));
      setRepeaterBriefCopyState('copied');
      window.setTimeout(() => setRepeaterBriefCopyState('idle'), 1600);
    } catch {
      setRepeaterBriefCopyState('failed');
      window.setTimeout(() => setRepeaterBriefCopyState('idle'), 2200);
    }
  };
  const copyRepeaterRecordsUrl = async () => {
    if (!repeaterRecordsUrl) return;
    try {
      await navigator.clipboard.writeText(repeaterRecordsUrl);
      setRepeaterRecordsUrlCopyState('copied');
      window.setTimeout(() => setRepeaterRecordsUrlCopyState('idle'), 1600);
    } catch {
      setRepeaterRecordsUrlCopyState('failed');
      window.setTimeout(() => setRepeaterRecordsUrlCopyState('idle'), 2200);
    }
  };

  const updateRepeater = (updates: {
    collectionId?: string;
    datasetId?: string;
    titleField?: string;
    descriptionField?: string;
    imageField?: string;
    metaField?: string;
    search?: string;
    filterField?: string;
    filterValue?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
    limit?: string;
    offset?: string;
    columns?: string;
    gap?: string;
    emptyMessage?: string;
  }) => {
    const collectionId = updates.collectionId ?? selectedCollectionId;
    const collection = collections.find((item) => item.id === collectionId) || null;

    if (!collection) {
      const nextProps = { ...props };
      delete nextProps.collectionId;
      delete nextProps.datasetId;
      delete nextProps.query;
      delete nextProps.limit;
      delete nextProps.offset;
      delete nextProps.sortBy;
      delete nextProps.sortDirection;
      onChange({ props: nextProps });
      return;
    }

    const titleField = updates.titleField
      ?? (fieldPathExists(collection, collections, selectedTitleField) ? selectedTitleField : defaultFieldKey(collection, ['title', 'name', 'label'], ['text']));
    const descriptionField = updates.descriptionField
      ?? (fieldPathExists(collection, collections, selectedDescriptionField) ? selectedDescriptionField : defaultFieldKey(collection, ['summary', 'description', 'excerpt', 'body'], ['richText', 'text']));
    const imageField = updates.imageField
      ?? (fieldPathExists(collection, collections, selectedImageField) ? selectedImageField : defaultFieldKey(collection, ['image', 'coverImage', 'thumbnail'], ['image'], { fallbackToFirst: false }));
    const metaField = updates.metaField
      ?? (fieldPathExists(collection, collections, selectedMetaField) ? selectedMetaField : defaultFieldKey(collection, ['category', 'categories', 'topic', 'type', 'status'], ['select', 'tags'], { fallbackToFirst: false }));
    const datasetId = (updates.datasetId ?? selectedDatasetId) || `dataset_${collection.id}_${element.id}`;
    const search = updates.search ?? selectedSearch;
    const filterField = updates.filterField ?? selectedFilterField;
    const filterValue = updates.filterValue ?? selectedFilterValue;
    const sortBy = updates.sortBy ?? selectedSortBy;
    const sortDirection = updates.sortDirection ?? selectedSortDirection;
    const limit = updates.limit ?? selectedLimit;
    const offset = updates.offset ?? selectedOffset;
    const columns = updates.columns ?? selectedColumns;
    const gap = updates.gap ?? selectedGap;
    const emptyMessage = updates.emptyMessage ?? selectedEmptyMessage;

    const nextQuery: Record<string, unknown> = {};
    if (search.trim()) nextQuery.q = search.trim();
    if (filterField.trim()) nextQuery.fieldKey = filterField.trim();
    if (filterValue.trim()) nextQuery.fieldValue = filterValue.trim();
    if (sortBy.trim()) {
      nextQuery.sortBy = sortBy.trim();
      nextQuery.sortDirection = sortDirection;
    }

    const nextProps: Record<string, unknown> = {
      ...props,
      collectionId: collection.id,
      datasetId: datasetId.trim() || `dataset_${collection.id}_${element.id}`,
      titleField,
      descriptionField,
      emptyMessage,
      ...(imageField ? { imageField } : {}),
      ...(metaField ? { metaField } : {}),
      ...(Object.keys(nextQuery).length > 0 ? { query: nextQuery } : {}),
    };

    if (!imageField) delete nextProps.imageField;
    if (!metaField) delete nextProps.metaField;

    const parsedLimit = Number.parseInt(limit, 10);
    const parsedOffset = Number.parseInt(offset, 10);
    const parsedColumns = Number.parseInt(columns, 10);
    const parsedGap = Number.parseInt(gap, 10);
    if (Number.isInteger(parsedLimit) && parsedLimit > 0) nextProps.limit = Math.min(parsedLimit, 100);
    else delete nextProps.limit;
    if (Number.isInteger(parsedOffset) && parsedOffset >= 0) nextProps.offset = parsedOffset;
    else delete nextProps.offset;
    if (Number.isInteger(parsedColumns)) nextProps.columns = Math.max(1, Math.min(parsedColumns, 6));
    if (Number.isInteger(parsedGap)) nextProps.gap = Math.max(0, Math.min(parsedGap, 96));

    delete nextProps.sortBy;
    delete nextProps.sortDirection;

    onChange({ props: nextProps });
  };

  return (
    <div className="space-y-3" data-testid="editor-repeater-controls">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Repeater collection
        </label>
        <select
          value={selectedCollectionId}
          onChange={(event) => updateRepeater({ collectionId: event.target.value })}
          data-testid="editor-repeater-collection"
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
        >
          <option value="">Unbound</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>
      </div>

      {selectedCollection && (
        <>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Dataset ID
            </label>
            <input
              type="text"
              value={selectedDatasetId}
              onChange={(event) => updateRepeater({ datasetId: event.target.value })}
              data-testid="editor-repeater-dataset-id"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Title field
              </label>
              <select
                value={fieldPathExists(selectedCollection, collections, selectedTitleField) ? selectedTitleField : ''}
                onChange={(event) => updateRepeater({ titleField: event.target.value })}
                data-testid="editor-repeater-title-field"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                {repeaterFieldOptions.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Description
              </label>
              <select
                value={fieldPathExists(selectedCollection, collections, selectedDescriptionField) ? selectedDescriptionField : ''}
                onChange={(event) => updateRepeater({ descriptionField: event.target.value })}
                data-testid="editor-repeater-description-field"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                {repeaterFieldOptions.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Image field
            </label>
            <select
              value={fieldPathExists(selectedCollection, collections, selectedImageField) ? selectedImageField : ''}
              onChange={(event) => updateRepeater({ imageField: event.target.value })}
              data-testid="editor-repeater-image-field"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              {repeaterImageFieldOptions.map((field) => (
                <option key={field.value || 'none'} value={field.value}>
                  {field.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Meta field
            </label>
            <select
              value={fieldPathExists(selectedCollection, collections, selectedMetaField) ? selectedMetaField : ''}
              onChange={(event) => updateRepeater({ metaField: event.target.value })}
              data-testid="editor-repeater-meta-field"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              {repeaterOptionalFieldOptions.map((field) => (
                <option key={field.value || 'none'} value={field.value}>
                  {field.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="editor-repeater-query-controls">
            <div className="mb-2 text-xs font-medium text-foreground">Dataset query</div>
            <div className="space-y-2">
              <input
                type="text"
                value={selectedSearch}
                onChange={(event) => updateRepeater({ search: event.target.value })}
                data-testid="editor-repeater-search"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="Search records"
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={selectedFilterField}
                  onChange={(event) => updateRepeater({ filterField: event.target.value })}
                  data-testid="editor-repeater-filter-field"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  <option value="">No filter</option>
                  {repeaterFieldOptions.map((field) => (
                    <option key={field.value} value={field.value}>
                      {field.label}
                    </option>
                  ))}
                </select>

                <CollectionFilterValueControl
                  testId="editor-repeater-filter-value"
                  field={selectedFilterFieldDefinition}
                  value={selectedFilterValue}
                  onChange={(value) => updateRepeater({ filterValue: value })}
                  allowCurrentRecordValue={selectedFilterFieldDefinition?.type === 'reference' || selectedFilterFieldDefinition?.type === 'multiReference'}
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={selectedSortBy}
                  onChange={(event) => updateRepeater({ sortBy: event.target.value })}
                  data-testid="editor-repeater-sort-by"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  <option value="">Default sort</option>
                  {repeaterFieldOptions.map((field) => (
                    <option key={field.value} value={field.value}>
                      {field.label}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedSortDirection}
                  onChange={(event) => updateRepeater({ sortDirection: event.target.value === 'desc' ? 'desc' : 'asc' })}
                  data-testid="editor-repeater-sort-direction"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="editor-repeater-layout-controls">
            <div className="mb-2 text-xs font-medium text-foreground">Layout</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="number"
                min={1}
                max={100}
                value={selectedLimit}
                onChange={(event) => updateRepeater({ limit: event.target.value })}
                data-testid="editor-repeater-limit"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="Limit"
              />
              <input
                type="number"
                min={0}
                value={selectedOffset}
                onChange={(event) => updateRepeater({ offset: event.target.value })}
                data-testid="editor-repeater-offset"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="Offset"
              />
              <input
                type="number"
                min={1}
                max={6}
                value={selectedColumns}
                onChange={(event) => updateRepeater({ columns: event.target.value })}
                data-testid="editor-repeater-columns"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="Columns"
              />
              <input
                type="number"
                min={0}
                max={96}
                value={selectedGap}
                onChange={(event) => updateRepeater({ gap: event.target.value })}
                data-testid="editor-repeater-gap"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="Gap"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Empty state
            </label>
            <input
              type="text"
              value={selectedEmptyMessage}
              onChange={(event) => updateRepeater({ emptyMessage: event.target.value })}
              data-testid="editor-repeater-empty-message"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
          </div>

          <div
            className="rounded-md border border-border bg-muted/30 p-3"
            data-testid="editor-repeater-dataset-action-plan"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-foreground">Repeater dataset action plan</div>
                <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  {repeaterDatasetActionPlan.summary}
                </div>
              </div>
              <span className={cn(
                'shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]',
                repeaterDatasetActionPlan.attention ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
              )}
              >
                {repeaterDatasetActionPlan.readyCount}/{repeaterDatasetActionPlan.totalCount}
              </span>
            </div>
            <div className="mt-2 font-mono text-[10px] text-muted-foreground">
              {repeaterDatasetActionPlan.schema}
            </div>
            <div className="mt-2 grid gap-1.5">
              {repeaterDatasetActionPlan.actions.map((action) => (
                <div
                  key={action.key}
                  className={cn(
                    'rounded-md border bg-background px-2 py-1.5 text-[11px]',
                    action.ready ? 'border-emerald-200' : 'border-amber-200',
                  )}
                  data-testid={`editor-repeater-dataset-action-${action.key}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{action.label}</span>
                    <span className="font-mono text-muted-foreground">{action.mode}</span>
                  </div>
                  <div className="mt-1 leading-4 text-muted-foreground">{action.reason}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            data-testid="editor-repeater-dataset-brief"
          >
            <div>
              Dataset: {selectedDatasetId}
              {selectedTitleField.includes('.') ? ` • title join ${selectedTitleField}` : ''}
              {selectedDescriptionField.includes('.') ? ` • description join ${selectedDescriptionField}` : ''}
              {selectedSortBy ? ` • sort ${selectedSortBy} ${selectedSortDirection}` : ''}
              {selectedLimit ? ` • limit ${selectedLimit}` : ''}
              {selectedColumns ? ` • ${selectedColumns} columns` : ''}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void copyRepeaterDatasetBrief()}
                data-testid="editor-repeater-copy-dataset-brief"
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
              >
                {repeaterBriefCopyState === 'copied' ? 'Copied brief' : repeaterBriefCopyState === 'failed' ? 'Copy failed' : 'Copy brief'}
              </button>
              <button
                type="button"
                onClick={() => void copyRepeaterRecordsUrl()}
                disabled={!repeaterRecordsUrl}
                data-testid="editor-repeater-copy-records-url"
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {repeaterRecordsUrlCopyState === 'copied' ? 'Copied URL' : repeaterRecordsUrlCopyState === 'failed' ? 'Copy failed' : 'Copy records'}
              </button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="editor-repeater-record-preview">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">Matching records</span>
              {effectivePreviewPagination && !usesCurrentRecordFilter && (
                <span className="text-muted-foreground" data-testid="editor-repeater-record-preview-count">
                  {effectivePreviewPagination.total} total
                </span>
              )}
            </div>
            {usesCurrentRecordFilter ? (
              <p className="text-xs text-muted-foreground" data-testid="editor-repeater-record-preview-current-record">
                Current record filters resolve on dynamic item pages. Choose a concrete reference value to preview matches here.
              </p>
            ) : previewLoading ? (
              <p className="text-xs text-muted-foreground" data-testid="editor-repeater-record-preview-loading">
                Loading matching records...
              </p>
            ) : previewError ? (
              <p className="text-xs text-amber-700" data-testid="editor-repeater-record-preview-error">
                {previewError}
              </p>
            ) : repeaterPreviewRows.length > 0 ? (
              <div className="space-y-2" data-testid="editor-repeater-record-preview-list">
                {repeaterPreviewRows.map(({ record, title, description, meta, imageSrc }) => (
                  <div
                    key={record.id}
                    className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 rounded-md border border-border bg-background p-2 text-xs"
                    data-testid="editor-repeater-record-preview-row"
                  >
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={`${title} preview`}
                        className="h-11 w-11 rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded border border-dashed border-border bg-muted text-[10px] text-muted-foreground">
                        No image
                      </div>
                    )}
                    <div className="min-w-0">
                      {meta && (
                        <div className="truncate text-[11px] uppercase text-muted-foreground">{meta}</div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-foreground">{title}</span>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{record.status}</span>
                      </div>
                      {description && (
                        <div className="truncate text-muted-foreground">{description}</div>
                      )}
                      <div className="truncate text-[11px] text-muted-foreground">{record.slug || record.id}</div>
                    </div>
                  </div>
                ))}
                {effectivePreviewPagination?.hasMore && (
                  <div className="text-xs text-muted-foreground" data-testid="editor-repeater-record-preview-has-more">
                    Showing {repeaterPreviewRows.length} of {effectivePreviewPagination.total}; increase the preview limit or adjust filters to inspect more.
                  </div>
                )}
                {previewReferenceLoading && (
                  <div className="text-xs text-muted-foreground" data-testid="editor-repeater-record-preview-reference-loading">
                    Resolving joined preview fields...
                  </div>
                )}
                {previewReferenceError && (
                  <div className="text-xs text-amber-700" data-testid="editor-repeater-record-preview-reference-error">
                    {previewReferenceError}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="editor-repeater-record-preview-empty">
                No records match the current query.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DataBindingProperties({
  element,
  siteId,
  collections,
  collectionsLoading,
  collectionsError,
  onChange,
}: DataBindingPropertiesProps) {
  const currentBinding = getCollectionBinding(element);
  const currentSource = getBindingSource(currentBinding);
  const currentQuery = getBindingQuery(currentBinding);
  const currentPagination = getBindingPagination(currentBinding);
  const selectedCollectionId = typeof currentSource?.collectionId === 'string' ? currentSource.collectionId : '';
  const selectedFieldKey = typeof currentSource?.field === 'string' ? currentSource.field : '';
  const selectedRecordId = typeof currentSource?.recordId === 'string' ? currentSource.recordId : '';
  const selectedSearch = typeof currentQuery.q === 'string'
    ? currentQuery.q
    : typeof currentQuery.search === 'string'
      ? currentQuery.search
      : '';
  const selectedFilterField = typeof currentQuery.fieldKey === 'string' ? currentQuery.fieldKey : '';
  const selectedFilterValue = typeof currentQuery.fieldValue === 'string' || typeof currentQuery.fieldValue === 'number' || typeof currentQuery.fieldValue === 'boolean'
    ? String(currentQuery.fieldValue)
    : '';
  const selectedSortBy = typeof currentQuery.sortBy === 'string' ? currentQuery.sortBy : '';
  const selectedSortDirection = currentQuery.sortDirection === 'desc' ? 'desc' : 'asc';
  const selectedLimit = typeof currentPagination.limit === 'number'
    ? String(currentPagination.limit)
    : typeof currentQuery.limit === 'number'
      ? String(currentQuery.limit)
      : '';
  const selectedOffset = typeof currentPagination.offset === 'number'
    ? String(currentPagination.offset)
    : typeof currentQuery.offset === 'number'
      ? String(currentQuery.offset)
      : '';
  const selectedTargetPath = typeof currentBinding?.targetPath === 'string'
    ? currentBinding.targetPath
    : getTargetPathOptions(element.type)[0].value;
  const selectedSourcePath = typeof currentSource?.path === 'string' ? currentSource.path : '';
  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId) || null;
  const selectedField = selectedCollection?.fields.find((field) => field.key === selectedFieldKey) || null;
  const selectedReferenceCollection = selectedField?.referenceCollectionId
    ? collections.find((collection) => collection.id === selectedField.referenceCollectionId) || null
    : null;
  const selectedReferenceFieldKey = selectedSourcePath.startsWith(`${selectedFieldKey}.`)
    ? selectedSourcePath.slice(selectedFieldKey.length + 1)
    : '';
  const selectedReferenceFieldOptions = collectionFieldPathOptions(selectedReferenceCollection, collections);
  const selectedReferenceField = fieldForFieldPath(selectedReferenceCollection, collections, selectedReferenceFieldKey);
  const selectedReferenceFieldLabel = selectedReferenceFieldOptions.find((option) => option.value === selectedReferenceFieldKey)?.label || selectedReferenceFieldKey;
  const selectedFilterFieldDefinition = fieldForFieldPath(selectedCollection, collections, selectedFilterField);
  const targetPathOptions = getTargetPathOptions(element.type);
  const [recordOptions, setRecordOptions] = useState<CollectionRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [referencePreviewRecords, setReferencePreviewRecords] = useState<Record<string, CollectionRecord[]>>({});
  const [referencePreviewLoading, setReferencePreviewLoading] = useState(false);
  const [referencePreviewError, setReferencePreviewError] = useState<string | null>(null);
  const [savedBindingPresets, setSavedBindingPresets] = useState<SavedCollectionBindingPreset[]>(() => loadSavedCollectionBindingPresets());
  const [savedPresetSyncState, setSavedPresetSyncState] = useState<'loading' | 'shared' | 'local'>('loading');
  const [savedPresetSyncError, setSavedPresetSyncError] = useState<string | null>(null);
  const [savedPresetBusy, setSavedPresetBusy] = useState<'saving' | 'deleting' | null>(null);
  const [savedPresetName, setSavedPresetName] = useState('');
  const [selectedSavedPresetId, setSelectedSavedPresetId] = useState('');
  const [slotCollectionId, setSlotCollectionId] = useState('');
  const [datasetBriefCopyState, setDatasetBriefCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [datasetRecordsUrlCopyState, setDatasetRecordsUrlCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    let cancelled = false;
    const localPresets = loadSavedCollectionBindingPresets();

    if (!siteId) {
      setSavedPresetSyncState('local');
      setSavedPresetSyncError(null);
      setSavedBindingPresets(localPresets);
      return () => {
        cancelled = true;
      };
    }

    setSavedPresetSyncState('loading');
    setSavedPresetSyncError(null);
    listCollectionBindingPresets(siteId)
      .then((presets) => {
        if (cancelled) return;
        const normalized = normalizeSavedCollectionBindingPresets(presets);
        const nextPresets = mergeCollectionBindingPresets(normalized, localPresets);
        setSavedBindingPresets(nextPresets);
        persistSavedCollectionBindingPresets(nextPresets);
        setSavedPresetSyncState('shared');
      })
      .catch((error) => {
        if (cancelled) return;
        setSavedBindingPresets(localPresets);
        setSavedPresetSyncState('local');
        setSavedPresetSyncError(error instanceof Error ? error.message : 'Unable to load shared presets');
      });

    return () => {
      cancelled = true;
    };
  }, [siteId]);

  useEffect(() => {
    if (!siteId || !selectedCollectionId) {
      setRecordOptions([]);
      setRecordsError(null);
      setRecordsLoading(false);
      return;
    }

    let cancelled = false;
    setRecordsLoading(true);
    setRecordsError(null);
    listCollectionRecords(siteId, selectedCollectionId, {
      status: '',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
      limit: 50,
      offset: 0,
    })
      .then((result) => {
        if (!cancelled) {
          setRecordOptions(result.records);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRecordOptions([]);
          setRecordsError(error instanceof Error ? error.message : 'Unable to load collection records');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRecordsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCollectionId, siteId]);

  useEffect(() => {
    const referenceCollectionIds = Array.from(new Set([
      ...collectionIdsForFieldPath(selectedCollection, collections, selectedSourcePath),
      ...collectionIdsForFieldPath(selectedCollection, collections, selectedFilterField),
      ...collectionIdsForFieldPath(selectedCollection, collections, selectedSortBy),
    ]));
    if (!siteId || referenceCollectionIds.length === 0) {
      setReferencePreviewError(null);
      setReferencePreviewLoading(false);
      return;
    }

    let cancelled = false;
    setReferencePreviewLoading(true);
    setReferencePreviewError(null);
    Promise.all(referenceCollectionIds.map(async (collectionId) => {
      const result = await listCollectionRecords(siteId, collectionId, {
        status: '',
        sortBy: 'updatedAt',
        sortDirection: 'desc',
        limit: 100,
        offset: 0,
      });
      return [collectionId, result.records] as const;
    }))
      .then((entries) => {
        if (cancelled) return;
        setReferencePreviewRecords((currentRecords) => ({
          ...currentRecords,
          ...Object.fromEntries(entries),
        }));
      })
      .catch((error) => {
        if (cancelled) return;
        setReferencePreviewRecords({});
        setReferencePreviewError(error instanceof Error ? error.message : 'Unable to resolve joined preview records');
      })
      .finally(() => {
        if (!cancelled) {
          setReferencePreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [collections, selectedCollection, selectedFilterField, selectedSortBy, selectedSourcePath, siteId]);

  const selectedRecordOptionValue = recordOptions.find((record) => (
    record.id === selectedRecordId || record.slug === selectedRecordId
  ))?.id || '';
  const selectedRecordPreview = recordOptions.find((record) => (
    record.id === selectedRecordId || record.slug === selectedRecordId
  )) || null;
  const selectedRecordPreviewFields = getRecordPreviewFields(selectedRecordPreview, selectedCollection);
  const selectedRecordPreviewMedia = selectedRecordPreviewImage(selectedRecordPreview, selectedCollection, siteId);
  const selectedRecordJoinedPreviewValue = recordPreviewValue(
    resolveRecordFieldPathFromCache(
      selectedCollection,
      collections,
      referencePreviewRecords,
      selectedRecordPreview,
      selectedSourcePath,
    ),
  );
  const selectedRecordJoinedValue = selectedRecordPreview && selectedField && selectedReferenceField
    ? [
        `Joins ${selectedField.label} to ${selectedReferenceFieldLabel}`,
        selectedRecordJoinedPreviewValue ? `Value: ${selectedRecordJoinedPreviewValue}` : '',
      ].filter(Boolean).join(' • ')
    : '';
  const bindingPresets = collectionBindingPresetOptions(selectedCollection, targetPathOptions);
  const savedPresetsForCollection = savedBindingPresets.filter((preset) => (
    preset.collectionId === selectedCollectionId
    && fieldExists(selectedCollection, preset.fieldKey)
    && targetPathOptions.some((option) => option.value === preset.targetPath)
  ));
  const selectedSavedPreset = savedPresetsForCollection.find((preset) => preset.id === selectedSavedPresetId)
    || savedPresetsForCollection[0]
    || null;
  const repeaterSelectedCollection = normalizeCanvasElementType(element.type) === 'repeater' && typeof element.props?.collectionId === 'string'
    ? collections.find((collection) => collection.id === element.props.collectionId) || null
    : selectedCollection;
  const preferredSlotCollectionId = selectedCollectionId || repeaterSelectedCollection?.id || '';
  const activeSlotCollectionId = collections.some((collection) => collection.id === slotCollectionId)
    ? slotCollectionId
    : preferredSlotCollectionId;
  const activeSlotCollection = collections.find((collection) => collection.id === activeSlotCollectionId)
    || selectedCollection
    || repeaterSelectedCollection
    || null;
  const activeSlotCollectionSelectValue = activeSlotCollection?.id || '';
  const childSlotSummary = useMemo(
    () => childBindingSlotSummary(element, activeSlotCollection, collections),
    [activeSlotCollection, collections, element],
  );
  const clearableBindingCount = useMemo(
    () => collectionBindingCountForElement(element),
    [element],
  );

  useEffect(() => {
    if (collections.length === 0) {
      setSlotCollectionId('');
      return;
    }

    setSlotCollectionId((current) => {
      if (preferredSlotCollectionId && preferredSlotCollectionId !== current) {
        return preferredSlotCollectionId;
      }
      if (current && collections.some((collection) => collection.id === current)) {
        return current;
      }
      return preferredSlotCollectionId || collections[0]?.id || '';
    });
  }, [collections, preferredSlotCollectionId]);

  useEffect(() => {
    if (!selectedSavedPresetId && savedPresetsForCollection[0]) {
      setSelectedSavedPresetId(savedPresetsForCollection[0].id);
      return;
    }
    if (selectedSavedPresetId && !savedPresetsForCollection.some((preset) => preset.id === selectedSavedPresetId)) {
      setSelectedSavedPresetId(savedPresetsForCollection[0]?.id || '');
    }
  }, [savedPresetsForCollection, selectedSavedPresetId]);

  const selectedBindingRecordsUrl = buildCollectionRecordsApiUrl(siteId, selectedCollection?.id, {
    slug: selectedRecordPreview?.slug || null,
    q: selectedSearch,
    fieldKey: selectedFilterField,
    fieldValue: selectedFilterValue,
    sortBy: selectedSortBy,
    sortDirection: selectedSortBy ? selectedSortDirection : null,
    limit: selectedLimit,
    offset: selectedOffset,
  });
  const slotCoverageSummary = bindingSlotCoverageForElement(element, activeSlotCollection, collections, targetPathOptions);
  const selectedSourcePathValid = selectedSourcePath
    ? fieldPathExists(selectedCollection, collections, selectedSourcePath)
    : Boolean(selectedField);
  const datasetBindingActionPlanActions = [
    {
      key: 'choose-collection',
      label: 'Choose collection',
      ready: Boolean(selectedCollection),
      mode: selectedCollection ? 'ready' : 'blocked',
      reason: selectedCollection
        ? `${selectedCollection.name} is selected.`
        : 'Choose a collection before mapping fields or copying a dataset handoff.',
    },
    {
      key: 'map-field',
      label: 'Map field',
      ready: Boolean(selectedCollection && selectedFieldKey && selectedSourcePathValid),
      mode: selectedCollection && selectedFieldKey && selectedSourcePathValid ? 'ready' : 'operator-action',
      reason: selectedCollection && selectedFieldKey && selectedSourcePathValid
        ? `${selectedSourcePath || selectedFieldKey} maps into ${selectedTargetPath}.`
        : 'Select a valid field or joined field path for this element.',
    },
    {
      key: 'target-property',
      label: 'Target property',
      ready: targetPathOptions.some((option) => option.value === selectedTargetPath),
      mode: targetPathOptions.some((option) => option.value === selectedTargetPath) ? 'ready' : 'blocked',
      reason: targetPathOptions.some((option) => option.value === selectedTargetPath)
        ? `${selectedTargetPath} is editable for this element type.`
        : 'Choose a supported target property for the selected element type.',
    },
    {
      key: 'preview-record',
      label: 'Preview record',
      ready: !selectedRecordId || Boolean(selectedRecordPreview),
      mode: !selectedRecordId || selectedRecordPreview ? 'ready' : 'operator-action',
      reason: selectedRecordId
        ? selectedRecordPreview
          ? `Previewing ${collectionRecordLabel(selectedRecordPreview, selectedCollection)}.`
          : 'The custom record id or slug is not in the recent preview list.'
        : 'Binding will use the first matching record at render time.',
    },
    {
      key: 'query-handoff',
      label: 'Query handoff',
      ready: Boolean(selectedBindingRecordsUrl && !recordsError && !referencePreviewError),
      mode: selectedBindingRecordsUrl && !recordsError && !referencePreviewError ? 'ready' : 'operator-action',
      reason: selectedBindingRecordsUrl && !recordsError && !referencePreviewError
        ? 'A public collection records URL and query brief can be copied for custom frontends.'
        : recordsError || referencePreviewError || 'Load collection records before handing this binding to a custom frontend.',
    },
    {
      key: 'slot-coverage',
      label: 'Slot coverage',
      ready: slotCoverageSummary.total === 0 || slotCoverageSummary.missingRequired === 0,
      mode: slotCoverageSummary.total === 0 || slotCoverageSummary.missingRequired === 0 ? 'ready' : 'operator-action',
      reason: slotCoverageSummary.total === 0
        ? 'This element has no preset binding slots.'
        : slotCoverageSummary.missingRequired === 0
          ? `${slotCoverageSummary.applied}/${slotCoverageSummary.total} slots are applied or optional.`
          : `${slotCoverageSummary.missingRequired} required binding slot${slotCoverageSummary.missingRequired === 1 ? '' : 's'} still need mapping.`,
    },
  ] as const;
  const datasetBindingActionPlanReadyCount = datasetBindingActionPlanActions.filter((action) => action.ready).length;
  const datasetBindingActionPlan = {
    schema: 'backy.editor.dataset-binding-action-plan.v1',
    attention: datasetBindingActionPlanReadyCount !== datasetBindingActionPlanActions.length,
    recommendedAction: datasetBindingActionPlanActions.find((action) => !action.ready)?.key || 'none',
    readyCount: datasetBindingActionPlanReadyCount,
    totalCount: datasetBindingActionPlanActions.length,
    summary: datasetBindingActionPlanReadyCount === datasetBindingActionPlanActions.length
      ? 'This element binding is ready for preview, publish, and custom frontend handoff.'
      : `${datasetBindingActionPlanActions.length - datasetBindingActionPlanReadyCount} dataset binding step${datasetBindingActionPlanActions.length - datasetBindingActionPlanReadyCount === 1 ? '' : 's'} need attention before publish handoff.`,
    actions: datasetBindingActionPlanActions,
  };
  const datasetBindingActionStatusId = 'editor-data-binding-action-status';
  const datasetBindingActionStatus = [
    datasetBindingActionPlan.summary,
    ...datasetBindingActionPlan.actions.map((action) => `${action.label}: ${action.reason}`),
  ].join(' ');
  const datasetBindingBrief = {
    schema: 'backy.editor.dataset-binding.v1',
    element: {
      id: element.id,
      type: normalizeCanvasElementType(element.type),
      name: element.name || null,
    },
    binding: {
      id: typeof currentBinding?.id === 'string' ? currentBinding.id : null,
      datasetId: selectedCollection ? `dataset_${selectedCollection.id}` : null,
      targetPath: selectedTargetPath,
      targetLabel: targetPathOptions.find((option) => option.value === selectedTargetPath)?.label || selectedTargetPath,
      mode: typeof currentBinding?.mode === 'string' ? currentBinding.mode : null,
      recordsUrl: selectedBindingRecordsUrl || null,
    },
    collection: selectedCollection
      ? {
          id: selectedCollection.id,
          name: selectedCollection.name,
          slug: selectedCollection.slug,
          status: selectedCollection.status,
        }
      : null,
    field: selectedField
      ? {
          key: selectedField.key,
          label: selectedField.label,
          type: selectedField.type,
        }
      : selectedFieldKey
        ? { key: selectedFieldKey, label: selectedFieldKey, type: null }
        : null,
    join: selectedSourcePath
      ? {
          sourcePath: selectedSourcePath,
          referenceField: selectedReferenceField
            ? {
                key: selectedReferenceFieldKey,
                label: selectedReferenceFieldLabel,
                type: selectedReferenceField.type,
              }
            : null,
        }
      : null,
    recordPreview: selectedRecordPreview
      ? {
          id: selectedRecordPreview.id,
          slug: selectedRecordPreview.slug,
          label: collectionRecordLabel(selectedRecordPreview, selectedCollection),
          joinedValue: selectedRecordJoinedPreviewValue || null,
        }
      : selectedRecordId
        ? { id: selectedRecordId, slug: selectedRecordId, label: selectedRecordId, joinedValue: null }
        : null,
    query: {
      search: selectedSearch || null,
      filterField: selectedFilterField || null,
      filterValue: selectedFilterValue || null,
      sortBy: selectedSortBy || null,
      sortDirection: selectedSortBy ? selectedSortDirection : null,
      limit: selectedLimit || null,
      offset: selectedOffset || null,
    },
    actionPlan: datasetBindingActionPlan,
  };
  const copyDatasetBindingBrief = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(datasetBindingBrief, null, 2));
      setDatasetBriefCopyState('copied');
      window.setTimeout(() => setDatasetBriefCopyState('idle'), 1600);
    } catch {
      setDatasetBriefCopyState('failed');
      window.setTimeout(() => setDatasetBriefCopyState('idle'), 2200);
    }
  };
  const copyDatasetRecordsUrl = async () => {
    if (!selectedBindingRecordsUrl) return;
    try {
      await navigator.clipboard.writeText(selectedBindingRecordsUrl);
      setDatasetRecordsUrlCopyState('copied');
      window.setTimeout(() => setDatasetRecordsUrlCopyState('idle'), 1600);
    } catch {
      setDatasetRecordsUrlCopyState('failed');
      window.setTimeout(() => setDatasetRecordsUrlCopyState('idle'), 2200);
    }
  };
  const dataBindingControlActionStatusId = 'editor-data-binding-control-action-status';
  const presetSyncBusyReason = savedPresetBusy
    ? 'Saved preset sync is currently busy.'
    : '';
  const savePresetAction = buildEditorDataBindingAction({
    label: 'Save binding preset',
    busy: savedPresetBusy === 'saving',
    disabledReason: !selectedFieldKey
      ? 'Choose a field before saving a preset.'
      : presetSyncBusyReason,
    readyStatus: savedPresetName.trim()
      ? `Save ${savedPresetName.trim()} as a shared binding preset.`
      : 'Save the current binding as a shared preset.',
    busyStatus: 'Saving shared binding preset.',
  });
  const applySavedPresetAction = buildEditorDataBindingAction({
    label: 'Apply saved binding preset',
    disabledReason: !selectedSavedPreset
      ? 'Choose a saved preset first.'
      : presetSyncBusyReason,
    readyStatus: selectedSavedPreset
      ? `Apply ${selectedSavedPreset.name} to this element.`
      : 'Apply saved binding preset available.',
  });
  const deleteSavedPresetAction = buildEditorDataBindingAction({
    label: 'Delete saved binding preset',
    busy: savedPresetBusy === 'deleting',
    disabledReason: !selectedSavedPreset
      ? 'Choose a saved preset first.'
      : presetSyncBusyReason,
    readyStatus: selectedSavedPreset
      ? `Delete ${selectedSavedPreset.name} from saved presets.`
      : 'Delete saved binding preset available.',
    busyStatus: 'Deleting shared binding preset.',
  });
  const copyDatasetBindingBriefStatus = datasetBriefCopyState === 'copied'
    ? 'Dataset binding brief copied.'
    : datasetBriefCopyState === 'failed'
      ? 'Dataset binding brief copy failed.'
      : 'Copy dataset binding brief available.';
  const copyDatasetBindingBriefAction = buildEditorDataBindingAction({
    label: 'Copy dataset binding brief',
    readyStatus: copyDatasetBindingBriefStatus,
  });
  const copyDatasetRecordsUrlStatus = datasetRecordsUrlCopyState === 'copied'
    ? 'Collection records URL copied.'
    : datasetRecordsUrlCopyState === 'failed'
      ? 'Collection records URL copy failed.'
      : 'Copy collection records URL available.';
  const copyDatasetRecordsUrlAction = buildEditorDataBindingAction({
    label: 'Copy collection records URL',
    disabledReason: !selectedBindingRecordsUrl ? 'Select a collection before copying the records URL.' : '',
    readyStatus: copyDatasetRecordsUrlStatus,
  });
  const clearBindingAction = buildEditorDataBindingAction({
    label: 'Clear dataset binding',
    readyStatus: 'Clear the selected element dataset binding.',
  });

  const updateBinding = (updates: {
    collectionId?: string;
    fieldKey?: string;
    recordId?: string;
    targetPath?: string;
    sourcePath?: string;
    search?: string;
    filterField?: string;
    filterValue?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
    limit?: string;
    offset?: string;
  }) => {
    const collectionId = updates.collectionId ?? selectedCollectionId;
    const collection = collections.find((item) => item.id === collectionId) || null;
    const fieldKey = updates.fieldKey
      ?? (collection?.fields.some((field) => field.key === selectedFieldKey) ? selectedFieldKey : collection?.fields[0]?.key)
      ?? '';
    const field = collection?.fields.find((item) => item.key === fieldKey) || null;
    const targetPath = updates.targetPath ?? selectedTargetPath;
    const referenceCollection = field?.referenceCollectionId
      ? collections.find((item) => item.id === field.referenceCollectionId) || null
      : null;
    const rawSourcePath = updates.sourcePath ?? (fieldKey === selectedFieldKey ? selectedSourcePath : '');
    const rawReferenceFieldKey = rawSourcePath.startsWith(`${fieldKey}.`) ? rawSourcePath.slice(fieldKey.length + 1) : rawSourcePath;
    const referenceFieldKey = referenceCollection && fieldPathExists(referenceCollection, collections, rawReferenceFieldKey)
      ? rawReferenceFieldKey
      : '';
    const sourcePath = referenceCollection && referenceFieldKey
      ? `${fieldKey}.${referenceFieldKey}`
      : '';
    const sourcePathField = fieldForFieldPath(referenceCollection, collections, referenceFieldKey);
    const recordId = updates.recordId ?? selectedRecordId;
    const search = updates.search ?? selectedSearch;
    const filterField = updates.filterField ?? selectedFilterField;
    const filterValue = updates.filterValue ?? selectedFilterValue;
    const sortBy = updates.sortBy ?? selectedSortBy;
    const sortDirection = updates.sortDirection ?? selectedSortDirection;
    const limit = updates.limit ?? selectedLimit;
    const offset = updates.offset ?? selectedOffset;
    const otherBindings = (Array.isArray(element.dataBindings) ? element.dataBindings : [])
      .filter((binding) => getBindingSource(binding)?.kind !== 'collection');

    if (!collection || !fieldKey) {
      onChange({ dataBindings: otherBindings });
      return;
    }

    const query: Record<string, unknown> = {};
    if (recordId.trim()) query.recordId = recordId.trim();
    if (search.trim()) query.q = search.trim();
    if (filterField.trim()) {
      query.fieldKey = filterField.trim();
    }
    if (filterValue.trim()) {
      query.fieldValue = filterValue.trim();
    }
    if (sortBy.trim()) {
      query.sortBy = sortBy.trim();
      query.sortDirection = sortDirection;
    }

    const pagination: Record<string, unknown> = {};
    const parsedLimit = Number.parseInt(limit, 10);
    const parsedOffset = Number.parseInt(offset, 10);
    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      pagination.limit = Math.min(parsedLimit, 100);
    }
    if (Number.isInteger(parsedOffset) && parsedOffset >= 0) {
      pagination.offset = parsedOffset;
    }

    onChange({
      dataBindings: [
        ...otherBindings,
        {
          id: `bind_${element.id}_${fieldKey}`,
          datasetId: `dataset_${collection.id}`,
          targetPath,
          source: {
            kind: 'collection',
            collectionId: collection.id,
            field: fieldKey,
            ...(sourcePath ? { path: sourcePath } : {}),
            ...(recordId.trim() ? { recordId: recordId.trim() } : {}),
          },
          mode: getBindingModeForField(sourcePathField || field, targetPath),
          ...(Object.keys(query).length > 0 ? { query } : {}),
          ...(Object.keys(pagination).length > 0 ? { pagination } : {}),
        },
      ],
    });
  };

  const applyBindingSlot = (slot: ComponentBindingSlot, fieldPath: string) => {
    if (!slot.targetPath) return;
    if (!activeSlotCollection) return;

    if (isRepeaterBindingSlotTarget(element, slot.targetPath) || descendantBindingSlotTarget(slot.targetPath)) {
      const result = applyBindingSlotToElement(element, slot, activeSlotCollection, collections, fieldPath);
      if (result.applied) {
        const updates: Partial<CanvasElement> = {};
        if (result.element.props !== element.props) updates.props = result.element.props;
        if (result.element.dataBindings !== element.dataBindings) updates.dataBindings = result.element.dataBindings;
        if (result.element.children !== element.children) updates.children = result.element.children;
        onChange(updates);
      }
      return;
    }

    const bindingUpdate = bindingUpdateForFieldPath(fieldPath);
    updateBinding({
      collectionId: activeSlotCollection.id,
      fieldKey: bindingUpdate.fieldKey,
      sourcePath: bindingUpdate.sourcePath,
      targetPath: slot.targetPath,
    });
  };

  const applyChildSlots = () => {
    if (!activeSlotCollection) return;
    const result = applyChildBindingSlots(element, activeSlotCollection, collections);
    if (result.applied > 0) {
      onChange({ children: result.children });
    }
  };

  const applyAllBindingSlots = () => {
    if (!activeSlotCollection) return;

    let applied = 0;
    let nextElement = element;

    bindableSlotsForElement(nextElement, activeSlotCollection, collections).forEach(({ slot, fieldPath }) => {
      const result = applyBindingSlotToElement(nextElement, slot, activeSlotCollection, collections, fieldPath);
      if (result.applied) {
        nextElement = result.element;
        applied += 1;
      }
    });

    const childResult = applyChildBindingSlots(nextElement, activeSlotCollection, collections);
    if (childResult.applied > 0) {
      nextElement = {
        ...nextElement,
        children: childResult.children,
      };
      applied += childResult.applied;
    }

    if (applied > 0) {
      const updates: Partial<CanvasElement> = {};
      if (nextElement.props !== element.props) updates.props = nextElement.props;
      if (nextElement.dataBindings !== element.dataBindings) updates.dataBindings = nextElement.dataBindings;
      if (nextElement.children !== element.children) updates.children = nextElement.children;
      onChange(updates);
    }
  };

  const clearAllBindingSlots = () => {
    const result = clearCollectionBindingsFromElement(element);
    if (result.cleared === 0) return;

    const updates: Partial<CanvasElement> = {};
    if (result.element.props !== element.props) updates.props = result.element.props;
    if (result.element.dataBindings !== element.dataBindings) updates.dataBindings = result.element.dataBindings;
    if (result.element.children !== element.children) updates.children = result.element.children;
    onChange(updates);
  };

  const clearBinding = () => {
    onChange({
      dataBindings: (Array.isArray(element.dataBindings) ? element.dataBindings : [])
        .filter((binding) => getBindingSource(binding)?.kind !== 'collection'),
    });
  };

  const persistSharedBindingPresets = async (nextPresets: SavedCollectionBindingPreset[]) => {
    persistSavedCollectionBindingPresets(nextPresets);

    if (!siteId) {
      setSavedPresetSyncState('local');
      setSavedPresetSyncError(null);
      return nextPresets;
    }

    try {
      const persisted = normalizeSavedCollectionBindingPresets(
        await saveCollectionBindingPresets(siteId, nextPresets),
      );
      setSavedPresetSyncState('shared');
      setSavedPresetSyncError(null);
      persistSavedCollectionBindingPresets(persisted);
      setSavedBindingPresets(persisted);
      return persisted;
    } catch (error) {
      setSavedPresetSyncState('local');
      setSavedPresetSyncError(error instanceof Error ? error.message : 'Unable to save shared presets');
      return nextPresets;
    }
  };

  const saveCurrentBindingPreset = async () => {
    if (!selectedCollection || !selectedFieldKey || savedPresetBusy) return;
    const name = savedPresetName.trim() || `${selectedCollection.name} ${selectedField?.label || selectedFieldKey}`;
    const now = new Date().toISOString();
    const existing = savedBindingPresets.find((preset) => (
      preset.collectionId === selectedCollection.id
      && preset.name.toLowerCase() === name.toLowerCase()
    ));
    const preset: SavedCollectionBindingPreset = {
      id: existing?.id || `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      collectionId: selectedCollection.id,
      fieldKey: selectedFieldKey,
      targetPath: selectedTargetPath,
      sourcePath: selectedSourcePath,
      search: selectedSearch,
      filterField: selectedFilterField,
      filterValue: selectedFilterValue,
      sortBy: selectedSortBy,
      sortDirection: selectedSortDirection,
      limit: selectedLimit,
      offset: selectedOffset,
      updatedAt: now,
    };
    const nextPresets = [
      preset,
      ...savedBindingPresets.filter((item) => item.id !== preset.id),
    ].slice(0, 24);
    setSavedBindingPresets(nextPresets);
    setSavedPresetName('');
    setSelectedSavedPresetId(preset.id);
    setSavedPresetBusy('saving');
    try {
      await persistSharedBindingPresets(nextPresets);
    } finally {
      setSavedPresetBusy(null);
    }
  };

  const applySavedBindingPreset = () => {
    if (!selectedSavedPreset || savedPresetBusy) return;
    updateBinding({
      fieldKey: selectedSavedPreset.fieldKey,
      targetPath: selectedSavedPreset.targetPath,
      sourcePath: selectedSavedPreset.sourcePath,
      search: selectedSavedPreset.search,
      filterField: selectedSavedPreset.filterField,
      filterValue: selectedSavedPreset.filterValue,
      sortBy: selectedSavedPreset.sortBy,
      sortDirection: selectedSavedPreset.sortDirection,
      limit: selectedSavedPreset.limit,
      offset: selectedSavedPreset.offset,
    });
  };

  const deleteSavedBindingPreset = async () => {
    if (!selectedSavedPreset || savedPresetBusy) return;
    const nextPresets = savedBindingPresets.filter((preset) => preset.id !== selectedSavedPreset.id);
    setSavedBindingPresets(nextPresets);
    setSelectedSavedPresetId(nextPresets.find((preset) => preset.collectionId === selectedCollectionId)?.id || '');
    setSavedPresetBusy('deleting');
    try {
      await persistSharedBindingPresets(nextPresets);
    } finally {
      setSavedPresetBusy(null);
    }
  };

  if (collectionsLoading) {
    return (
      <div
        className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        data-testid="editor-data-collections-loading"
      >
        Loading collections...
      </div>
    );
  }

  if (collectionsError) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        {collectionsError}
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        No collections available.
      </div>
    );
  }

  if (normalizeCanvasElementType(element.type) === 'repeater') {
    return (
      <div className="space-y-3">
        <PresetBindingSlotsPanel
          element={element}
          collections={collections}
          selectedCollectionId={activeSlotCollectionSelectValue}
          selectedCollection={activeSlotCollection}
          childSummary={childSlotSummary}
          targetPathOptions={targetPathOptions}
          selectedFieldKey={selectedFieldKey}
          selectedSourcePath={selectedSourcePath}
          selectedTargetPath={selectedTargetPath}
          clearableBindingCount={clearableBindingCount}
          onCollectionChange={setSlotCollectionId}
          onApplySlot={applyBindingSlot}
          onApplyAllSlots={applyAllBindingSlots}
          onClearAllSlots={clearAllBindingSlots}
          onApplyChildSlots={applyChildSlots}
        />
        <RepeaterDataProperties
          element={element}
          siteId={siteId}
          collections={collections}
          onChange={onChange}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <span
        id={dataBindingControlActionStatusId}
        className="sr-only"
        data-testid="editor-data-binding-control-action-status"
        aria-live="polite"
      >
        {[
          savePresetAction.actionStatus,
          applySavedPresetAction.actionStatus,
          deleteSavedPresetAction.actionStatus,
          copyDatasetBindingBriefAction.actionStatus,
          copyDatasetRecordsUrlAction.actionStatus,
          clearBindingAction.actionStatus,
        ].join(' ')}
      </span>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Collection
        </label>
        <select
          value={selectedCollectionId}
          onChange={(event) => updateBinding({ collectionId: event.target.value, fieldKey: undefined, recordId: '' })}
          data-testid="editor-data-collection"
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
        >
          <option value="">Unbound</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>
      </div>

      <PresetBindingSlotsPanel
        element={element}
        collections={collections}
        selectedCollectionId={activeSlotCollectionSelectValue}
        selectedCollection={activeSlotCollection}
        childSummary={childSlotSummary}
        targetPathOptions={targetPathOptions}
        selectedFieldKey={selectedFieldKey}
        selectedSourcePath={selectedSourcePath}
        selectedTargetPath={selectedTargetPath}
        clearableBindingCount={clearableBindingCount}
        onCollectionChange={setSlotCollectionId}
        onApplySlot={applyBindingSlot}
        onApplyAllSlots={applyAllBindingSlots}
        onClearAllSlots={clearAllBindingSlots}
        onApplyChildSlots={applyChildSlots}
      />

      <div
        className="rounded-md border border-border bg-muted/30 p-3"
        data-testid="editor-data-binding-action-plan"
      >
        <span
          id={datasetBindingActionStatusId}
          className="sr-only"
          data-testid="editor-data-binding-action-status"
          aria-live="polite"
        >
          {datasetBindingActionStatus}
        </span>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-foreground">Dataset action plan</div>
            <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {datasetBindingActionPlan.summary}
            </div>
          </div>
          <span className={cn(
            'shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]',
            datasetBindingActionPlan.attention ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
          )}
          >
            {datasetBindingActionPlan.readyCount}/{datasetBindingActionPlan.totalCount}
          </span>
        </div>
        <div className="mt-2 font-mono text-[10px] text-muted-foreground">
          {datasetBindingActionPlan.schema}
        </div>
        <div className="mt-2 grid gap-1.5">
          {datasetBindingActionPlan.actions.map((action) => {
            const actionStatus = `${action.label}: ${action.reason}`;
            return (
              <div
                key={action.key}
                className={cn(
                  'rounded-md border bg-background px-2 py-1.5 text-[11px]',
                  action.ready ? 'border-emerald-200' : 'border-amber-200',
                )}
                aria-describedby={datasetBindingActionStatusId}
                data-action-state={action.ready ? 'ready' : 'blocked'}
                data-action-status={actionStatus}
                data-disabled-reason={action.ready ? undefined : action.reason}
                data-testid={`editor-data-binding-action-${action.key}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{action.label}</span>
                  <span className="font-mono text-muted-foreground">{action.mode}</span>
                </div>
                <div className="mt-1 leading-4 text-muted-foreground">{action.reason}</div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedCollection && (
        <>
          {bindingPresets.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="editor-data-binding-presets">
              <div className="mb-2 text-xs font-medium text-foreground">Binding presets</div>
              <div className="grid grid-cols-2 gap-2">
                {bindingPresets.map((preset) => {
                  const presetSelected = selectedFieldKey === preset.fieldKey && selectedTargetPath === preset.targetPath;
                  const presetAction = buildEditorDataBindingAction({
                    label: `Apply ${preset.label} binding preset`,
                    selected: presetSelected,
                    readyStatus: `Apply ${preset.label} binding preset to ${preset.targetPath}.`,
                    selectedStatus: `${preset.label} binding preset is selected.`,
                  });

                  return (
                    <button
                      key={`${preset.id}-${preset.fieldKey}-${preset.targetPath}`}
                      type="button"
                      onClick={() => updateBinding({ fieldKey: preset.fieldKey, targetPath: preset.targetPath })}
                      title={presetAction.actionStatus}
                      aria-describedby={dataBindingControlActionStatusId}
                      data-action-state={presetAction.actionState}
                      data-action-status={presetAction.actionStatus}
                      data-testid={`editor-data-preset-${preset.id}`}
                      className={cn(
                        'rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs hover:bg-muted',
                        presetSelected && 'border-primary text-primary'
                      )}
                    >
                      <span className="block font-medium">{preset.label}</span>
                      <span className="block truncate text-muted-foreground">{preset.fieldKey}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="editor-data-saved-binding-presets">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">Saved presets</span>
              <span className="text-muted-foreground" data-testid="editor-data-saved-preset-sync-state">
                {savedPresetBusy === 'saving'
                  ? 'Saving shared preset...'
                  : savedPresetBusy === 'deleting'
                    ? 'Deleting shared preset...'
                    : savedPresetSyncState === 'loading'
                  ? 'Loading shared presets'
                  : savedPresetSyncState === 'shared'
                    ? 'Shared with this site'
                    : 'Local fallback'}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={savedPresetName}
                  onChange={(event) => setSavedPresetName(event.target.value)}
                  disabled={Boolean(savedPresetBusy)}
                  data-testid="editor-data-saved-preset-name"
                  className={cn(
                    'min-w-0 flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="Preset name"
                />
                <button
                  type="button"
                  onClick={saveCurrentBindingPreset}
                  disabled={!selectedFieldKey || Boolean(savedPresetBusy)}
                  title={savePresetAction.actionStatus}
                  aria-describedby={dataBindingControlActionStatusId}
                  data-action-state={savePresetAction.actionState}
                  data-action-status={savePresetAction.actionStatus}
                  data-disabled-reason={savePresetAction.disabledReason || undefined}
                  data-testid="editor-data-save-preset"
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savedPresetBusy === 'saving' ? 'Saving...' : 'Save'}
                </button>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                <select
                  value={selectedSavedPreset?.id || ''}
                  onChange={(event) => setSelectedSavedPresetId(event.target.value)}
                  data-testid="editor-data-saved-preset-select"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  <option value="">No saved presets</option>
                  {savedPresetsForCollection.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applySavedBindingPreset}
                  disabled={!selectedSavedPreset || Boolean(savedPresetBusy)}
                  title={applySavedPresetAction.actionStatus}
                  aria-describedby={dataBindingControlActionStatusId}
                  data-action-state={applySavedPresetAction.actionState}
                  data-action-status={applySavedPresetAction.actionStatus}
                  data-disabled-reason={applySavedPresetAction.disabledReason || undefined}
                  data-testid="editor-data-apply-saved-preset"
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={deleteSavedBindingPreset}
                  disabled={!selectedSavedPreset || Boolean(savedPresetBusy)}
                  title={deleteSavedPresetAction.actionStatus}
                  aria-describedby={dataBindingControlActionStatusId}
                  data-action-state={deleteSavedPresetAction.actionState}
                  data-action-status={deleteSavedPresetAction.actionStatus}
                  data-disabled-reason={deleteSavedPresetAction.disabledReason || undefined}
                  data-testid="editor-data-delete-saved-preset"
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savedPresetBusy === 'deleting' ? 'Deleting...' : 'Delete'}
                </button>
              </div>
              {selectedSavedPreset && (
                <div className="text-xs text-muted-foreground" data-testid="editor-data-saved-preset-summary">
                  {selectedSavedPreset.fieldKey} to {selectedSavedPreset.targetPath}
                  {selectedSavedPreset.sourcePath ? ` • join ${selectedSavedPreset.sourcePath}` : ''}
                  {selectedSavedPreset.sortBy ? ` • sort ${selectedSavedPreset.sortBy} ${selectedSavedPreset.sortDirection}` : ''}
                  {selectedSavedPreset.limit ? ` • limit ${selectedSavedPreset.limit}` : ''}
                </div>
              )}
              {savedPresetSyncError && (
                <div className="text-xs text-amber-700" data-testid="editor-data-saved-preset-sync-error">
                  Shared preset sync failed: {savedPresetSyncError}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Field
            </label>
            <select
              value={selectedFieldKey}
              onChange={(event) => updateBinding({ fieldKey: event.target.value, sourcePath: '' })}
              data-testid="editor-data-field"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              {selectedCollection.fields.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label} ({field.type})
                </option>
              ))}
            </select>
          </div>

          {selectedReferenceCollection && (
            <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="editor-data-reference-join">
              <label className="text-xs text-muted-foreground mb-1 block">
                Joined field
              </label>
              <select
                value={selectedReferenceFieldKey}
                onChange={(event) => updateBinding({
                  sourcePath: event.target.value ? `${selectedFieldKey}.${event.target.value}` : '',
                })}
                data-testid="editor-data-reference-field"
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="">Reference ID</option>
                {selectedReferenceFieldOptions.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-xs text-muted-foreground">
                {selectedReferenceField
                  ? `${selectedField?.label || selectedFieldKey} -> ${selectedReferenceFieldLabel}`
                  : `${selectedField?.label || selectedFieldKey} resolves to the referenced record id.`}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Target
            </label>
            <select
              value={targetPathOptions.some((option) => option.value === selectedTargetPath) ? selectedTargetPath : targetPathOptions[0].value}
              onChange={(event) => updateBinding({ targetPath: event.target.value })}
              data-testid="editor-data-target"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              {targetPathOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Preview record
            </label>
            <select
              value={selectedRecordOptionValue}
              onChange={(event) => updateBinding({ recordId: event.target.value })}
              data-testid="editor-data-record-picker"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="">First matching record at render time</option>
              {recordOptions.map((record) => (
                <option key={record.id} value={record.id}>
                  {collectionRecordLabel(record, selectedCollection)}
                </option>
              ))}
            </select>
            {recordsLoading && (
              <p className="mt-1 text-xs text-muted-foreground">Loading records...</p>
            )}
            {recordsError && (
              <p className="mt-1 text-xs text-amber-600">{recordsError}</p>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Custom record ID or slug
            </label>
            <input
              type="text"
              value={selectedRecordId}
              onChange={(event) => updateBinding({ recordId: event.target.value })}
              data-testid="editor-data-record-id"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Optional"
            />
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="editor-data-record-preview">
            <div className="mb-2 text-xs font-medium text-foreground">Selected record preview</div>
            {selectedRecordPreview ? (
              <div className="space-y-1.5 text-xs">
                {selectedRecordPreviewMedia ? (
                  <div className="mb-2 overflow-hidden rounded-md border border-border bg-background" data-testid="editor-data-record-preview-thumbnail">
                    <img
                      src={selectedRecordPreviewMedia.src}
                      alt={`${collectionRecordLabel(selectedRecordPreview, selectedCollection)} ${selectedRecordPreviewMedia.field.label}`}
                      className="h-24 w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="mb-2 flex h-16 items-center justify-center rounded-md border border-dashed border-border bg-background text-[11px] text-muted-foreground" data-testid="editor-data-record-preview-thumbnail-empty">
                    No image field value
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{collectionRecordLabel(selectedRecordPreview, selectedCollection)}</span>
                  <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-muted-foreground">{selectedRecordPreview.slug}</span>
                </div>
                {selectedRecordPreviewFields.map(({ field, value }) => (
                  <div key={field.key} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
                    <span className="truncate text-muted-foreground">{field.label}</span>
                    <span className="truncate text-foreground">{value}</span>
                  </div>
                ))}
                {selectedRecordJoinedValue && (
                  <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2" data-testid="editor-data-reference-preview">
                    <span className="truncate text-muted-foreground">Join</span>
                    <span className="truncate text-foreground">{selectedRecordJoinedValue}</span>
                  </div>
                )}
                {referencePreviewLoading && selectedReferenceField && (
                  <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2" data-testid="editor-data-reference-preview-loading">
                    <span className="truncate text-muted-foreground">Join</span>
                    <span className="truncate text-muted-foreground">Resolving joined value...</span>
                  </div>
                )}
                {referencePreviewError && (
                  <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 text-amber-700" data-testid="editor-data-reference-preview-error">
                    <span className="truncate">Join</span>
                    <span className="truncate">{referencePreviewError}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Choose a preview record to inspect resolved field values while configuring this binding.
              </p>
            )}
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="editor-data-query-controls">
            <div className="mb-2 text-xs font-medium text-foreground">Dataset query</div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Search
                </label>
                <input
                  type="text"
                  value={selectedSearch}
                  onChange={(event) => updateBinding({ search: event.target.value })}
                  data-testid="editor-data-query-search"
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                  placeholder="Optional text search"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Filter field
                  </label>
                  <select
                    value={selectedFilterField}
                    onChange={(event) => updateBinding({ filterField: event.target.value })}
                    data-testid="editor-data-query-filter-field"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                  >
                    <option value="">None</option>
                    {collectionFieldPathOptions(selectedCollection, collections).map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Filter value
                  </label>
                  <CollectionFilterValueControl
                    testId="editor-data-query-filter-value"
                    field={selectedFilterFieldDefinition}
                    value={selectedFilterValue}
                    onChange={(value) => updateBinding({ filterValue: value })}
                    allowCurrentRecordValue={selectedFilterFieldDefinition?.type === 'reference' || selectedFilterFieldDefinition?.type === 'multiReference'}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Sort by
                  </label>
                  <select
                    value={selectedSortBy}
                    onChange={(event) => updateBinding({ sortBy: event.target.value })}
                    data-testid="editor-data-query-sort-by"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                  >
                    <option value="">Default</option>
                    {collectionFieldPathOptions(selectedCollection, collections).map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Direction
                  </label>
                  <select
                    value={selectedSortDirection}
                    onChange={(event) => updateBinding({ sortDirection: event.target.value === 'desc' ? 'desc' : 'asc' })}
                    data-testid="editor-data-query-sort-direction"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Limit
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={selectedLimit}
                    onChange={(event) => updateBinding({ limit: event.target.value })}
                    data-testid="editor-data-query-limit"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                    placeholder="50"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Offset
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={selectedOffset}
                    onChange={(event) => updateBinding({ offset: event.target.value })}
                    data-testid="editor-data-query-offset"
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            data-testid="editor-data-binding-brief"
          >
            <div>
              Dataset: dataset_{selectedCollection.id}
              {selectedField ? ` • ${selectedField.key}` : ''}
              {selectedSourcePath ? ` • join ${selectedSourcePath}` : ''}
              {selectedRecordId ? ` • record ${selectedRecordId}` : ''}
              {selectedSortBy ? ` • sort ${selectedSortBy} ${selectedSortDirection}` : ''}
              {selectedLimit ? ` • limit ${selectedLimit}` : ''}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void copyDatasetBindingBrief()}
                title={copyDatasetBindingBriefAction.actionStatus}
                aria-describedby={dataBindingControlActionStatusId}
                data-action-state={copyDatasetBindingBriefAction.actionState}
                data-action-status={copyDatasetBindingBriefAction.actionStatus}
                data-testid="editor-data-copy-binding-brief"
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
              >
                {datasetBriefCopyState === 'copied' ? 'Copied brief' : datasetBriefCopyState === 'failed' ? 'Copy failed' : 'Copy brief'}
              </button>
              <button
                type="button"
                onClick={() => void copyDatasetRecordsUrl()}
                disabled={!selectedBindingRecordsUrl}
                title={copyDatasetRecordsUrlAction.actionStatus}
                aria-describedby={dataBindingControlActionStatusId}
                data-action-state={copyDatasetRecordsUrlAction.actionState}
                data-action-status={copyDatasetRecordsUrlAction.actionStatus}
                data-disabled-reason={copyDatasetRecordsUrlAction.disabledReason || undefined}
                data-testid="editor-data-copy-records-url"
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {datasetRecordsUrlCopyState === 'copied' ? 'Copied URL' : datasetRecordsUrlCopyState === 'failed' ? 'Copy failed' : 'Copy records'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={clearBinding}
            title={clearBindingAction.actionStatus}
            aria-describedby={dataBindingControlActionStatusId}
            data-action-state={clearBindingAction.actionState}
            data-action-status={clearBindingAction.actionStatus}
            data-testid="editor-data-clear-binding"
            className="w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Clear binding
          </button>
        </>
      )}
    </div>
  );
}

// ============================================
// ANIMATION PROPERTIES
// ============================================

interface AnimationPropertiesProps {
  element: CanvasElement;
  onChange: (updates: Partial<CanvasElement>) => void;
  theme?: ThemeConfig;
}

function AnimationProperties({ element, onChange, theme }: AnimationPropertiesProps) {
  const animation = element.animation as AnimationConfig | undefined;
  const themeTokens = useMemo(
    () => buildBackyThemeTokens(theme || {}),
    [theme],
  );
  const motionDurationOptions = useMemo(
    () => Object.entries(themeTokens.motion.duration || {}).map(([key, value]) => ({
      path: `motion.duration.${key}`,
      value,
      label: themeTokenLabel(`motion.duration.${key}`),
    })),
    [themeTokens],
  );
  const motionEasingOptions = useMemo(
    () => Object.entries(themeTokens.motion.easing || {}).map(([key, value]) => ({
      path: `motion.easing.${key}`,
      value,
      label: themeTokenLabel(`motion.easing.${key}`),
    })),
    [themeTokens],
  );
  const motionTokenValueByPath = useMemo(
    () => new Map([
      ...motionDurationOptions.map((option) => [option.path, option.value] as const),
      ...motionEasingOptions.map((option) => [option.path, option.value] as const),
    ]),
    [motionDurationOptions, motionEasingOptions],
  );
  const updateAnimationTokenRef = useCallback((target: 'duration' | 'easing', tokenPath: string) => {
    const nextAnimation: AnimationConfig = {
      type: 'fadeIn',
      duration: 0.6,
      delay: 0,
      easing: 'power2.out',
      trigger: 'load',
      ...(animation || {}),
    };
    const nextTokenRefs = { ...(nextAnimation.tokenRefs || {}) };

    if (tokenPath) {
      nextTokenRefs[target] = tokenPath;
      const tokenValue = motionTokenValueByPath.get(tokenPath);
      if (target === 'duration') {
        const durationSeconds = parseCssDurationToSeconds(tokenValue);
        if (durationSeconds !== undefined) {
          nextAnimation.duration = durationSeconds;
        }
      } else if (typeof tokenValue === 'string' && tokenValue.trim()) {
        nextAnimation.easing = tokenValue.trim();
      }
    } else {
      delete nextTokenRefs[target];
    }

    onChange({
      animation: {
        ...nextAnimation,
        tokenRefs: Object.keys(nextTokenRefs).length > 0 ? nextTokenRefs : undefined,
      },
    });
  }, [animation, motionTokenValueByPath, onChange]);

  return (
    <div className="space-y-3">
      <div
        className="rounded-md border border-dashed border-border bg-muted/30 p-3"
        data-testid="editor-animation-token-bindings"
        data-token-ref-path="animation.tokenRefs"
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-foreground">Motion tokens</p>
          </div>
          <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            animation.tokenRefs
          </span>
        </div>
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Duration</span>
            <select
              value={animation?.tokenRefs?.duration || ''}
              onChange={(event) => updateAnimationTokenRef('duration', event.target.value)}
              data-testid="editor-animation-token-select-duration"
              className={cn(
                'w-full rounded-md border bg-background px-2 py-1.5 text-xs',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="">Manual duration</option>
              {motionDurationOptions.map((option) => (
                <option key={option.path} value={option.path}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Easing</span>
            <select
              value={animation?.tokenRefs?.easing || ''}
              onChange={(event) => updateAnimationTokenRef('easing', event.target.value)}
              data-testid="editor-animation-token-select-easing"
              className={cn(
                'w-full rounded-md border bg-background px-2 py-1.5 text-xs',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="">Manual easing</option>
              {motionEasingOptions.map((option) => (
                <option key={option.path} value={option.path}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <AnimationBuilder
        animation={animation}
        onChange={(nextAnimation) => {
          onChange({ animation: nextAnimation || undefined });
        }}
      />
    </div>
  );
}

// ============================================
// INPUT COMPONENTS
// ============================================

interface NumberInputProps {
  label?: string;
  value: unknown;
  onChange: (value: number) => void;
  suffix?: string;
  ariaLabel?: string;
  testId?: string;
}

function NumberInput({ label, value, onChange, suffix, ariaLabel, testId }: NumberInputProps) {
  const numericValue = toNumber(value);

  return (
    <div>
      {label && (
        <label className="text-xs text-muted-foreground mb-1 block">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="number"
          value={numericValue}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          aria-label={ariaLabel || label}
          data-testid={testId}
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

interface ColorInputProps {
  value: string;
  onChange: (value: string) => void;
  testId?: string;
}

function ColorInput({ value, onChange, testId }: ColorInputProps) {
  const colorPickerValue = normalizeHexColorInputValue(value);
  const normalizedValue = value.trim().toLowerCase();
  const normalizedHexValue = normalizedValue.startsWith('#')
    ? colorPickerValue.toLowerCase()
    : normalizedValue;

  return (
    <div className="space-y-2" data-editor-color-input={testId}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={colorPickerValue}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId ? `${testId}-picker` : undefined}
          aria-label="Pick color"
          className="h-8 w-8 shrink-0 cursor-pointer rounded-md border"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          aria-label="Color value"
          className={cn(
            'flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
        />
      </div>
      <div
        className="grid grid-cols-7 gap-1"
        role="group"
        aria-label="Quick color swatches"
        data-testid={testId ? `${testId}-swatches` : undefined}
      >
        {EDITOR_COLOR_SWATCHES.map((swatch) => {
          const isSelected = normalizedHexValue === swatch;
          return (
            <button
              key={swatch}
              type="button"
              onClick={() => onChange(swatch)}
              aria-label={`Use ${swatch}`}
              aria-pressed={isSelected}
              title={`Use ${swatch}`}
              data-testid={testId ? `${testId}-swatch-${swatch.slice(1)}` : undefined}
              className={cn(
                'flex h-6 items-center justify-center rounded-md border bg-background p-0.5 transition',
                'hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring',
                isSelected ? 'border-primary ring-1 ring-primary' : 'border-border'
              )}
            >
              <span
                className="h-full w-full rounded-[4px] border border-black/10"
                style={{ backgroundColor: swatch }}
              />
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange('transparent')}
          aria-label="Use transparent"
          aria-pressed={normalizedValue === 'transparent'}
          title="Use transparent"
          data-testid={testId ? `${testId}-transparent` : undefined}
          className={cn(
            'flex h-6 items-center justify-center rounded-md border bg-background p-0.5 transition',
            'hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring',
            normalizedValue === 'transparent' ? 'border-primary ring-1 ring-primary' : 'border-border'
          )}
        >
          <span
            className="h-full w-full rounded-[4px] border border-black/10"
            style={{
              backgroundColor: '#ffffff',
              backgroundImage:
                'linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cbd5e1 75%), linear-gradient(-45deg, transparent 75%, #cbd5e1 75%)',
              backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
              backgroundSize: '12px 12px',
            }}
          />
        </button>
      </div>
    </div>
  );
}

export default PropertyPanel;

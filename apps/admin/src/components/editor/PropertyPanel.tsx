// @ts-nocheck
// TODO: Fix prop type access when implementing Page Editor properly
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

import { useEffect, useMemo, useState } from 'react';
import {
  Type,
  Palette,
  Layout,
  Box,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PORTAL_TOOLBAR_CONTAINER_ID } from '@backy-cms/editor';
// import { RichTextEditor } from './RichTextEditor';
import { MediaLibraryModal, type MediaContext } from './MediaLibraryModal';
import { EmojiPickerModal } from './EmojiPickerModal';
import { getFontFamilyOptions, toFontFamilyStyle } from './fontCatalog';
import { RichTextFormatting } from './RichTextFormatting';
import { AnimationBuilder, type AnimationConfig } from './AnimationBuilder';
import type { CanvasElement, ElementProps } from '@/types/editor';
import {
  buildListContentFromItems,
  getListItemsFromProps,
} from './listUtils';
import { useStore } from '@/stores/mockStore';

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

  if (normalized === 'radio' || normalized === 'radiobutton' || normalized === 'radioinput' || normalized === 'radioinputs') {
    return 'radio';
  }

  if (normalized === 'checkbox' || normalized === 'checkboxes' || normalized === 'checkboxinput' || normalized === 'checkboxinputs') {
    return 'checkbox';
  }

  if (normalized.includes('dropdown') || normalized.includes('select')) {
    return 'select';
  }

  if (normalized.includes('textinput') || normalized.includes('textfield')) {
    return 'input';
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
    'list',
    'link',
    'quote',
    'comment',
  ];

  return knownTypes.includes(normalized as CanvasElement['type'])
    ? (normalized as CanvasElement['type'])
    : 'text';
};

// ============================================
// TYPES
// ============================================

interface PropertyPanelProps {
  /** Currently selected element */
  element: CanvasElement | null;
  /** Callback when element properties change */
  onChange: (updates: Partial<CanvasElement>) => void;
  /** Callback when element is deleted */
  onDelete?: () => void;
  mediaContext?: MediaContext;
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
  mediaContext,
}: PropertyPanelProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'content',
    'layout',
    'style',
  ]);

  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const [mediaField, setMediaField] = useState<'src' | 'video'>('src');
  const [mediaOpenTab, setMediaOpenTab] = useState<'library' | 'upload'>('library');
  const [mediaUploadFilter, setMediaUploadFilter] = useState<'all' | 'image' | 'video' | 'file'>('all');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  if (!element) {
    return (
      <div className="w-[clamp(18rem,24vw,30rem)] min-w-[18rem] max-w-[30rem] shrink-0 bg-card border-l border-border flex flex-col h-full min-h-0">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Properties</h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center">
          <p className="text-sm">Select an element to edit its properties</p>
        </div>
      </div>
    );
  }

  // Type-safe props access helper
  const props = element.props as ElementProps;

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  const updateProps = (propsUpdates: Partial<ElementProps>) => {
    onChange({
      props: { ...element.props, ...propsUpdates },
    });
  };

  return (
      <div className="w-[clamp(18rem,24vw,30rem)] min-w-[18rem] max-w-[30rem] shrink-0 bg-card border-l border-border flex flex-col h-full min-h-0" key={element.id}>
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold">Properties</h2>
        <p className="text-sm text-muted-foreground capitalize">
          {element.type}
        </p>
      </div>
      <div id={PORTAL_TOOLBAR_CONTAINER_ID} className="px-3 pt-3" />

      {/* Properties */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 pb-2">
        {/* Content Section */}
        <PropertySection
          title="Content"
          icon={Type}
          isExpanded={expandedSections.includes('content')}
          onToggle={() => toggleSection('content')}
        >
          <ContentProperties
            element={element}
            onChange={updateProps}
            elementId={element.id}
            onOpenMedia={(field, mode = 'library') => {
              setMediaField(field);
              setMediaOpenTab(mode);
              setMediaUploadFilter(field === 'video' ? 'video' : 'image');
              setIsMediaLibraryOpen(true);
            }}
            onOpenEmoji={() => setIsEmojiPickerOpen(true)}
          />
        </PropertySection>

        {/* Layout Section */}
        <PropertySection
          title="Layout"
          icon={Layout}
          isExpanded={expandedSections.includes('layout')}
          onToggle={() => toggleSection('layout')}
        >
          <LayoutProperties element={element} onChange={onChange} />
        </PropertySection>

        {/* Style Section */}
        <PropertySection
          title="Style"
          icon={Palette}
          isExpanded={expandedSections.includes('style')}
          onToggle={() => toggleSection('style')}
        >
          {/**
            * Keep element-level styling available for text components while inline
            * toolbar operations target selected text in the editor.
          */}
          <StyleProperties
            element={element}
            onChange={updateProps}
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

        {/* Appearance Section */}
        <PropertySection
          title="Appearance"
          icon={Box}
          isExpanded={expandedSections.includes('appearance')}
          onToggle={() => toggleSection('appearance')}
        >
          <AppearanceProperties element={element} onChange={updateProps} />
        </PropertySection>

        {/* Animation Section */}
        <PropertySection
          title="Animation"
          icon={Sparkles}
          isExpanded={expandedSections.includes('animation')}
          onToggle={() => toggleSection('animation')}
        >
          <AnimationProperties element={element} onChange={onChange} />
        </PropertySection>

        {/* Delete Button */}
        <div className="pt-2">
          <button
            onClick={onDelete}
            className="w-full py-2 px-3 flex items-center justify-center gap-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors text-sm font-medium border border-red-100"
          >
            <Trash2 className="w-4 h-4" />
            Delete Element
          </button>
        </div>
      </div>


      {/* Modals */}
      <MediaLibraryModal
        isOpen={isMediaLibraryOpen}
        onClose={() => setIsMediaLibraryOpen(false)}
        onSelect={(media) => {
          onChange({
            props: {
              ...element.props,
              [mediaField]: media.url,
              mediaId: media.id,
              mediaScope: media.scope || mediaContext?.scope || 'global',
              mediaScopeTargetId: media.scopeTargetId || mediaContext?.targetId || null,
            },
          });
        }}
        initialTab={mediaOpenTab}
        initialUploadFilter={mediaUploadFilter}
        mediaContext={mediaContext}
        allowedTypes={mediaField === 'src' ? 'image' : 'video'}
      />

      <EmojiPickerModal
        isOpen={isEmojiPickerOpen}
        onClose={() => setIsEmojiPickerOpen(false)}
        onSelect={(emoji) => {
          onChange({ props: { ...element.props, icon: emoji } });
        }}
      />
    </div >
  );
}

// ============================================
// PROPERTY SECTION COMPONENT
// ============================================

interface PropertySectionProps {
  title: string;
  icon: React.ElementType;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function PropertySection({
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  children,
}: PropertySectionProps) {
  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
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
  onOpenMedia: (field: 'src' | 'video', mode?: 'library' | 'upload') => void;
  onOpenEmoji: () => void;
  elementId?: string;
}

function ContentProperties({
  element,
  onChange,
  onOpenMedia,
  onOpenEmoji,
  elementId,
}: ContentPropertiesProps) {
  const normalizedType = normalizeCanvasElementType(element.type);
  const hasTextContent = ['text', 'heading', 'paragraph', 'quote', 'list'].includes(normalizedType);
  const hasImageContent = normalizedType === 'image';
  const hasVideoContent = normalizedType === 'video';
  const hasLinkContent = normalizedType === 'link';
  const hasButtonContent = normalizedType === 'button';
  const hasInputContent = normalizedType === 'input';
  const hasFormFieldContent = ['input', 'textarea', 'select', 'checkbox', 'radio'].includes(normalizedType);
  const hasFormContent = normalizedType === 'form';
  const hasCommentContent = normalizedType === 'comment';
  const hasListContent = normalizedType === 'list';
  const fieldOptionsText = Array.isArray(element.props.options)
    ? element.props.options.join('\n')
    : '';
  const listItems = getListItemsFromProps(element.props);
  useEffect(() => {
    // BackyTextProperties diagnostics disabled.
  }, [element.id, element.type, elementId, hasTextContent, hasImageContent, hasVideoContent, hasLinkContent, hasButtonContent, onChange]);

  return (
    <div className="space-y-3">
      {/* Rich Text Controls */}
        {hasTextContent && (
          <RichTextFormatting elementId={elementId} />
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
                className={cn(
                  'flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="https://example.com/image.jpg"
              />
              <button
                className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs hover:bg-secondary/80"
                title="Select from Media Library"
                onClick={() => onOpenMedia('src')}
              >
                Select
              </button>
              <button
                className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs hover:bg-secondary/80"
                title="Upload media"
                onClick={() => onOpenMedia('src', 'upload')}
              >
                Upload
              </button>
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
              onChange={(e) => onChange({ objectFit: e.target.value })}
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
                className={cn(
                  'flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="https://example.com/video.mp4"
              />
              <button
                className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs hover:bg-secondary/80"
                title="Select from Media Library"
                onClick={() => onOpenMedia('video')}
              >
                Select
              </button>
              <button
                className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs hover:bg-secondary/80"
                title="Upload video"
                onClick={() => onOpenMedia('video', 'upload')}
              >
                Upload
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Enter a direct video URL (.mp4, .webm)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoplay"
              checked={element.props.autoplay || false}
              onChange={(e) => onChange({ autoplay: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="autoplay" className="text-sm">Autoplay (preview only)</label>
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
              value={element.props.content || ''}
              onChange={(e) => onChange({ content: e.target.value })}
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
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                onChange={(e) => {
                  if (e.target.value) onChange({ href: e.target.value });
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
                onChange={(e) => onChange({ href: e.target.value })}
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
              className="rounded"
            />
            <label htmlFor="underline" className="text-sm">Underline</label>
          </div>
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
                  if (e.target.value) onChange({ href: e.target.value });
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
                onChange={(e) => onChange({ href: e.target.value })}
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="https://example.com"
              />
            </div>
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
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="name, email, message"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`required-${element.id}`}
              checked={Boolean(element.props.required)}
              onChange={(e) => onChange({ required: e.target.checked })}
            />
            <label htmlFor={`required-${element.id}`} className="text-xs text-muted-foreground">
              Required field
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
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="Optional helper text"
            />
          </div>

          {normalizedType === 'input' && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Input Type
                </label>
                <select
                  value={element.props.inputType || 'text'}
                  onChange={(e) => onChange({ inputType: e.target.value })}
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  <option value="text">Text</option>
                  <option value="email">Email</option>
                  <option value="password">Password</option>
                  <option value="number">Number</option>
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
                onChange={(e) => onChange({ minLength: Number(e.target.value) })}
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
                onChange={(e) => onChange({ maxLength: Number(e.target.value) })}
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              />
                </div>
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
                    onChange={(e) => onChange({ maxLength: e.target.value ? Number(e.target.value) : 0 })}
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
                    onChange={(e) => onChange({ minLength: e.target.value ? Number(e.target.value) : 0 })}
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
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
                onChange={(e) => onChange({ value: e.target.value })}
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
              onChange={(e) => onChange({ listIndent: e.target.value === '' ? 0 : Number(e.target.value) })}
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
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="form-contact"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Submit Action URL
            </label>
            <input
              type="text"
              value={element.props.actionUrl || element.props.action || ''}
              onChange={(e) => onChange({ actionUrl: e.target.value })}
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
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="https://example.com/thank-you"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={Boolean(element.props.enableHoneypot)}
              onChange={(e) => onChange({ enableHoneypot: e.target.checked })}
            />
            Enable spam protection (honeypot)
          </label>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Moderation mode
            </label>
            <select
              value={element.props.moderationMode || 'manual'}
              onChange={(e) => onChange({ moderationMode: e.target.value as 'manual' | 'auto-approve' })}
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
              checked={Boolean(element.props.contactShareEnabled)}
              onChange={(e) => onChange({ contactShareEnabled: e.target.checked })}
            />
            Enable lead/share capture on approve
          </label>
          {Boolean(element.props.contactShareEnabled) && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Name field key
                </label>
                <input
                  type="text"
                  value={element.props.contactShareNameField || ''}
                  onChange={(e) => onChange({ contactShareNameField: e.target.value })}
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
                  checked={element.props.contactShareDedupeByEmail !== false}
                  onChange={(e) => onChange({ contactShareDedupeByEmail: e.target.checked })}
                />
                Deduplicate contacts by email
              </label>
            </>
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
            />
            Require comment author name
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.commentRequireEmail, false)}
              onChange={(e) => onChange({ commentRequireEmail: e.target.checked })}
            />
            Require author email
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.commentAllowGuests, true)}
              onChange={(e) => onChange({ commentAllowGuests: e.target.checked })}
            />
            Allow guests
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={parseBooleanSetting(element.props.commentAllowReplies, true)}
              onChange={(e) => onChange({ commentAllowReplies: e.target.checked })}
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
                className={cn(
                  'flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                placeholder="https://www.youtube.com/watch?v=... or HTML iframe src"
              />
              <button
                className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs hover:bg-secondary/80"
                title="Use current media item"
                onClick={() => onOpenMedia('src')}
              >
                Select
              </button>
              <button
                className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs hover:bg-secondary/80"
                title="Upload media"
                onClick={() => onOpenMedia('src', 'upload')}
              >
                Upload
              </button>
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
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder="https://maps.google.com/... or any map embed URL"
            />
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
              className="w-full"
            />
            <div className="text-right text-xs text-muted-foreground">
              {element.props.zoom || 14}
            </div>
          </div>
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
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Divider Style
            </label>
            <select
              value={element.props.borderStyle || 'solid'}
              onChange={(e) => onChange({ borderStyle: e.target.value })}
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
        </div>
      )}

      {/* Spacer Properties */}
      {element.type === 'spacer' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            This is a spacer element for layout purposes. Adjust its size in the Layout section.
          </p>
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
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-md border bg-background text-center text-2xl',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-muted px-2 py-1 rounded"
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
        />
        <NumberInput
          label="Y"
          value={element.y}
          onChange={(value) => onChange({ y: value })}
          suffix="px"
        />
      </div>

      {/* Size */}
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="Width"
          value={element.width}
          onChange={(value) => onChange({ width: value })}
          suffix="px"
        />
        <NumberInput
          label="Height"
          value={element.height}
          onChange={(value) => onChange({ height: value })}
          suffix="px"
        />
      </div>

      {/* Z-Index */}
      <NumberInput
        label="Z-Index"
        value={element.zIndex}
        onChange={(value) => onChange({ zIndex: value })}
      />

      {/* Rotation */}
      <NumberInput
        label="Rotation"
        value={element.rotation || 0}
        onChange={(value) => onChange({ rotation: value })}
        suffix="°"
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
  supportsTextStyles?: boolean;
}

function StyleProperties({ element, onChange, supportsTextStyles = false }: StylePropertiesProps) {
  const media = useStore((state) => state.media);
  const fontFamilies = useMemo(() => getFontFamilyOptions(media), [media]);

  return (
    <div className="space-y-3">
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
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Note: Google Fonts and uploaded font files (woff/woff2/ttf/otf) are available.
            </p>
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
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Font Weight
            </label>
            <select
              value={element.props.fontWeight || 'normal'}
              onChange={(e) => onChange({ fontWeight: e.target.value })}
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
              onChange={(e) => onChange({ textTransform: e.target.value })}
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
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Border Style
        </label>
        <select
          value={element.props.borderStyle || 'solid'}
          onChange={(e) => onChange({ borderStyle: e.target.value })}
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
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Padding (px)
        </label>
        <NumberInput
          value={parseFloat((element.props.padding || '0').toString()) || 0}
          onChange={(value) => onChange({ padding: value })}
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Margin (px)
        </label>
        <NumberInput
          value={parseFloat((element.props.margin || '0').toString()) || 0}
          onChange={(value) => onChange({ margin: value })}
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
// ANIMATION PROPERTIES
// ============================================

interface AnimationPropertiesProps {
  element: CanvasElement;
  onChange: (updates: Partial<CanvasElement>) => void;
}

function AnimationProperties({ element, onChange }: AnimationPropertiesProps) {
  const animation = element.animation as AnimationConfig | undefined;

  return (
    <div className="space-y-3">
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
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}

function NumberInput({ label, value, onChange, suffix }: NumberInputProps) {
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
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
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
}

function ColorInput({ value, onChange }: ColorInputProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded-md border cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'flex-1 px-2 py-1.5 text-sm rounded-md border bg-background',
          'focus:outline-none focus:ring-2 focus:ring-ring'
        )}
      />
    </div>
  );
}

export default PropertyPanel;

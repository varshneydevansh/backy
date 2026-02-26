/**
 * Editor Types
 * 
 * Type definitions for the visual page editor (Canvas, Elements, etc.)
 */

import type { CSSProperties } from 'react';

// ============================================
// ELEMENT TYPES
// ============================================

/** Point for positioning */
export interface Point {
  x: number;
  y: number;
}

/** Canvas size definition */
export interface CanvasSize {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

/** Supported element types in the canvas */
export type ElementType =
  | 'text'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'button'
  | 'container'
  | 'section'
  | 'header'
  | 'footer'
  | 'nav'
  | 'divider'
  | 'video'
  | 'icon'
  | 'form'
  | 'input'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'spacer'
  | 'columns'
  | 'map'
  | 'box'      // For containers/divs
  | 'embed'    // For iframes/embeds
  | 'list'     // For bullet/numbered lists
  | 'link'     // For hyperlinks
  | 'quote'    // For blockquotes
  | 'comment'; // For comment/thread blocks

/** Base element interface */
export interface CanvasElement {
  id: string;
  type: ElementType;
  name?: string;  // Optional - auto-generated if not provided

  // Position (absolute)
  x: number;
  y: number;
  width: number;
  height: number;

  // Rotation in degrees
  rotation?: number;

  // Z-index for layering
  zIndex: number;

  // Visibility (defaults to true if not provided)
  visible?: boolean;
  locked?: boolean;

  // Element-specific props (content, src, href, etc.)
  props: Record<string, unknown>;

  // CSS styles (optional)
  styles?: CSSProperties;

  // Parent element ID (for grouped/nested elements)
  parentId?: string;

  // Child elements (for nested container/form blocks)
  children?: CanvasElement[];

  // Animation config (for GSAP/interaction animations)
  animation?: AnimationConfig | null;
}

// ============================================
// COMPONENT LIBRARY TYPES
// ============================================

/** Item in the component library sidebar */
export interface ComponentLibraryItem {
  type: ElementType;
  name: string;    // Display name
  icon: string;    // Icon identifier  
  category?: string; // Optional category for grouping
  description?: string; // Optional tooltip description
  defaultProps?: Record<string, unknown>; // Default props when adding element
  defaultSize?: { width: number; height: number }; // Default size
}

/** Element-specific props union type */
export interface ElementProps {
  /** Generic element label */
  [key: string]: unknown;

  // Text/Heading
  content?: string;
  level?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  fontSize?: number | string;
  fontStyle?: string;
  fontWeight?: string;
  color?: string;
  lineHeight?: number;
  textTransform?: 'none' | 'capitalize' | 'uppercase' | 'lowercase';
  letterSpacing?: number | string;
  wordSpacing?: number | string;
  textShadow?: string;
  textIndent?: number | string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';

  // Image
  objectFit?: 'cover' | 'contain' | 'fill' | 'none';

  // Button/Link
  label?: string;
  href?: string;
  url?: string;

  // Container/Box / Appearance
  backgroundColor?: string;
  border?: string;
  borderRadius?: number | string;
  borderWidth?: number | string;
  borderColor?: string;
  borderStyle?: string;
  padding?: number | string;
  boxShadow?: string;
  textDecoration?: string;
  margin?: number | string;
  fontFamily?: string;

  // List
  items?: string[];
  listType?: 'bullet' | 'number';
  listMarker?: 'disc' | 'circle' | 'square' | 'decimal' | 'lower-alpha' | 'upper-alpha' | 'lower-roman' | 'upper-roman';

  // Appearance
  opacity?: number;

  // Common form props
  formId?: string;
  method?: 'GET' | 'POST' | 'PUT';
  action?: string;
  actionUrl?: string;
  successMessage?: string;
  successRedirectUrl?: string;
  enableHoneypot?: boolean;
  success?: string;
  redirectUrl?: string;
  required?: boolean;

  // Common media/context fields
  scope?: 'global' | 'page' | 'post';
  scopeTargetId?: string | null;
  name?: string;

  // Rich text marks
  fontSize?: string | number;

  // Media/asset metadata
  src?: string;
  alt?: string;
  icon?: string;
  options?: string[];
  checked?: boolean;
  value?: unknown;
  defaultValue?: string;
  inputType?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search' | 'textarea';
  rows?: number;
  cols?: number;
  placeholder?: string;
  requiredLabel?: string;
  listIndent?: number;
  width?: number | string;
  height?: number | string;

  // Form workflow fields
  notificationEmail?: string;
  notificationWebhook?: string;
  moderationMode?: 'manual' | 'auto-approve';
  enableCaptcha?: boolean;

  // Contact-share mapping
  contactShareEnabled?: boolean;
  contactShareNameField?: string;
  contactShareEmailField?: string;
  contactSharePhoneField?: string;
  contactShareNotesField?: string;
  contactShareDedupeByEmail?: boolean;

  // Comment block settings
  commentTitle?: string;
  commentModerationMode?: 'manual' | 'auto-approve';
  commentAllowGuests?: boolean;
  commentRequireName?: boolean;
  commentRequireEmail?: boolean;
  commentAllowReplies?: boolean;
  commentSortOrder?: 'newest' | 'oldest';
}

export interface ComponentDefinition {
  type: ElementType;
  name: string;
  icon: string;
  category: 'basic' | 'layout' | 'media' | 'form' | 'advanced';
  defaultProps: Record<string, unknown>;
  defaultStyles: CSSProperties;
  defaultWidth: number;
  defaultHeight: number;
}

// ============================================
// EDITOR STATE TYPES
// ============================================

export interface EditorState {
  pageId: string | null;
  elements: CanvasElement[];
  selectedIds: string[];
  hoveredId: string | null;

  // Canvas state
  zoom: number;
  panX: number;
  panY: number;

  // Modes
  isPreview: boolean;
  isDragging: boolean;
  isResizing: boolean;

  // Clipboard
  clipboard: CanvasElement[];
}

// ============================================
// DRAG & DROP TYPES
// ============================================

export interface DragItem {
  type: 'new-element' | 'existing-element';
  elementType?: ElementType;
  elementId?: string;
}

export interface DropResult {
  x: number;
  y: number;
}

// ============================================
// SELECTION TYPES
// ============================================

export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

// ============================================
// ANIMATION TYPES (GSAP Integration)
// ============================================

export interface AnimationConfig {
  trigger: 'load' | 'scroll' | 'hover';
  type: 'fadeIn' | 'slideIn' | 'scaleIn' | 'bounce' | 'rotate' | 'custom';
  duration: number;
  delay: number;
  easing: string;
  direction?: 'left' | 'right' | 'up' | 'down';
  scrollTrigger?: {
    start?: string;
    end?: string;
    scrub?: boolean;
  };
  from?: Record<string, unknown>;
  to?: Record<string, unknown>;
}

export interface ElementAnimation {
  elementId: string;
  animations: AnimationConfig[];
}

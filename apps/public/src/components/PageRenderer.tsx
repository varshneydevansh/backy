/**
 * ==========================================================================
 * Backy CMS - Page Renderer
 * ==========================================================================
 *
 * Client-side page rendering with GSAP support.
 * Renders canvas elements from the page builder into HTML.
 *
 * @module @backy/public
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';

// ============================================================================
// TYPES (matching page builder editor types)
// ============================================================================

/** Element types from the page builder */
export type ElementType = string;
export type KnownElementType =
  | 'text'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'video'
  | 'button'
  | 'link'
  | 'container'
  | 'section'
  | 'columns'
  | 'spacer'
  | 'divider'
  | 'icon'
  | 'form'
  | 'input'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'list'
  | 'table'
  | 'embed'
  | 'html'
  | 'map'
  | 'box'
  | 'quote'
  | 'comment';

/** Canvas element structure */
export interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  props: Record<string, unknown>;
  styles?: React.CSSProperties;
  children?: CanvasElement[];
  animation?: AnimationConfig;
}

/** Animation configuration for GSAP */
export interface AnimationConfig {
  type: string;
  duration: number;
  delay?: number;
  easing?: string;
  direction?: 'left' | 'right' | 'up' | 'down';
  from?: Record<string, unknown>;
  to?: Record<string, unknown>;
  trigger?: 'load' | 'scroll' | 'hover';
  scrollTrigger?: {
    start?: string;
    end?: string;
    scrub?: boolean;
  };
}

/** Page content structure */
export interface PageContent {
  elements: CanvasElement[];
  canvasSize: { width: number; height: number };
  customCSS?: string;
  customJS?: string;
}

/** Theme configuration */
export interface ThemeConfig {
  colors?: Record<string, string>;
  fonts?: {
    heading?: string;
    body?: string;
  };
  spacing?: Record<string, string | number>;
  customCSS?: string;
}

interface CommentItem {
  id: string;
  content: string;
  status: 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked';
  authorName: string | null;
  authorEmail: string | null;
  authorWebsite: string | null;
  parentId: string | null;
  createdAt: string;
  requestId?: string | null;
  reportCount?: number;
  reportReasons?: string[];
}

interface CommentFormPayload {
  moderationMode: 'manual' | 'auto-approve';
  requireName: boolean;
  requireEmail: boolean;
  allowGuests: boolean;
  allowReplies: boolean;
  sort: 'newest' | 'oldest';
}

interface ElementRendererContext {
  isPreview?: boolean;
  siteId?: string;
  pageId?: string;
  postId?: string;
}

interface ElementRendererProps extends ElementRendererContext {
  element: CanvasElement;
}

interface SlateNode {
  type?: string;
  text?: string;
  children?: unknown[];
}

function getLength(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) {
    return fallback;
  }

  return typeof value === 'number' ? `${value}px` : `${value}`;
}

function getBoolean(value: unknown): boolean {
  return Boolean(value);
}

function parseCommentPayload(props: Record<string, unknown>): CommentFormPayload {
  const moderationValue = getNameClass(props.commentModerationMode);

  return {
    moderationMode: moderationValue === 'auto-approve' ? 'auto-approve' : 'manual',
    requireName: props.commentRequireName !== false,
    requireEmail: props.commentRequireEmail === true,
    allowGuests: props.commentAllowGuests !== false,
    allowReplies: props.commentAllowReplies !== false,
    sort: getNameClass(props.commentSortOrder) === 'oldest' ? 'oldest' : 'newest',
  };
}

function getCommentApiPath(siteId?: string, pageId?: string, postId?: string): string {
  if (!siteId) {
    return '';
  }

  if (pageId) {
    return `/api/sites/${siteId}/pages/${pageId}/comments`;
  }

  if (postId) {
    return `/api/sites/${siteId}/blog/${postId}/comments`;
  }

  return '';
}

function getSafeTag(value: unknown): keyof JSX.IntrinsicElements {
  const candidate = typeof value === 'string' ? value.trim() : 'span';
  const allowedTags = ['span', 'p', 'div', 'label', 'strong', 'em', 'small'];
  return (allowedTags.includes(candidate) ? candidate : 'span') as keyof JSX.IntrinsicElements;
}

function getTypographyStyle(props: Record<string, unknown>): React.CSSProperties {
  return {
    fontFamily: getNameClass(props.fontFamily),
    fontSize: getLength(props.fontSize),
    fontWeight: getNameClass(props.fontWeight),
    color: getNameClass(props.color),
    textAlign: props.textAlign as React.CSSProperties['textAlign'] || 'left',
    lineHeight: getLength(props.lineHeight, 'normal'),
    textTransform: getNameClass(props.textTransform),
    letterSpacing: getLength(props.letterSpacing),
    wordSpacing: getLength(props.wordSpacing),
    textShadow: getNameClass(props.textShadow),
    textIndent: getLength(props.textIndent),
    textDecoration: getNameClass(props.textDecoration),
    fontStyle: getNameClass(props.fontStyle),
  };
}

function parseOptionValues(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (item && typeof item === 'object' && 'value' in item) {
        return (item as { value?: unknown }).value as string;
      }

      return String(item);
    })
    .filter((item) => item.trim().length > 0);
}

function getNameClass(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return '';
}

const getSlateText = (node: unknown): string => {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const typed = node as SlateNode;
  if (typeof typed.text === 'string') {
    return typed.text;
  }

  if (!Array.isArray(typed.children)) {
    return '';
  }

  return typed.children.map(getSlateText).join('');
};

const extractListItemsFromSlate = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: string[] = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const typed = node as SlateNode;
    if ((typed.type === 'li' || typed.type === 'item')) {
      const text = getSlateText(node).trim();
      items.push(text);
      return;
    }

    if (typed.type === 'ul' || typed.type === 'ol') {
      if (Array.isArray(typed.children)) {
        typed.children.forEach(walk);
      }
      return;
    }

    if (Array.isArray(typed.children)) {
      typed.children.forEach(walk);
    }
  };

  value.forEach(walk);
  return items;
};

const sanitizeText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
};

const buildContactShareOverride = (props: Record<string, unknown>) => {
  const hasAnySetting =
    typeof props.contactShareEnabled === 'boolean' ||
    typeof props.contactShareNameField === 'string' ||
    typeof props.contactShareEmailField === 'string' ||
    typeof props.contactSharePhoneField === 'string' ||
    typeof props.contactShareNotesField === 'string' ||
    props.contactShareDedupeByEmail !== undefined;

  if (!hasAnySetting) {
    return undefined;
  }

  return {
    enabled:
      typeof props.contactShareEnabled === 'boolean' ? props.contactShareEnabled : undefined,
    nameField:
      typeof props.contactShareNameField === 'string' ? props.contactShareNameField : undefined,
    emailField:
      typeof props.contactShareEmailField === 'string' ? props.contactShareEmailField : undefined,
    phoneField:
      typeof props.contactSharePhoneField === 'string' ? props.contactSharePhoneField : undefined,
    notesField:
      typeof props.contactShareNotesField === 'string' ? props.contactShareNotesField : undefined,
    dedupeByEmail:
      typeof props.contactShareDedupeByEmail === 'boolean' ? props.contactShareDedupeByEmail : undefined,
  };
};

const buildCommentThreads = (comments: CommentItem[]) => {
  const map = new Map<string, CommentItem & { replies?: CommentItem[] }>();
  const roots: (CommentItem & { replies?: CommentItem[] })[] = [];

  comments.forEach((comment) => {
    map.set(comment.id, { ...comment, replies: [] });
  });

  map.forEach((comment) => {
    if (!comment.parentId) {
      roots.push(comment);
      return;
    }

    const parent = map.get(comment.parentId);
    if (!parent) {
      roots.push(comment);
      return;
    }

    parent.replies = [...(parent.replies || []), comment];
  });

  return roots;
};

const DEFAULT_COMMENT_REPORT_REASONS = [
  'spam',
  'harassment',
  'abuse',
  'hate-speech',
  'off-topic',
  'copyright',
  'privacy',
  'other',
];

const normalizeEmbedUrl = (raw: unknown): string => {
  const source = sanitizeText(raw);
  if (!source) {
    return '';
  }

  const iframeMatch = source.match(/<iframe[^>]*src=(\"|')([^\"']+)\1/i);
  const src = iframeMatch ? iframeMatch[2] : source;

  const parsed = (() => {
    try {
      return new URL(src);
    } catch {
      return null;
    }
  })();

  if (!parsed) {
    if (/^[a-zA-Z0-9_-]{11}$/.test(src)) {
      return `https://www.youtube.com/embed/${src}`;
    }

    return src.startsWith('//') ? `https:${src}` : src;
  }

  const host = parsed.host.toLowerCase();

  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    const videoId = parsed.searchParams.get('v')
      || (parsed.pathname.split('/').pop() || '')
      || parsed.searchParams.get('feature');

    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }
  }

  if (host.includes('vimeo.com')) {
    const videoId = parsed.pathname.replace(/\//g, '').split('?')[0];
    if (videoId) {
      return `https://player.vimeo.com/video/${videoId}`;
    }
  }

  if (host.includes('google.com') && host.includes('maps')) {
    if (parsed.searchParams.has('output')) {
      return source;
    }
    if (parsed.searchParams.has('q') || parsed.searchParams.has('ll') || parsed.searchParams.has('pb')) {
      return `${source}${source.includes('?') ? '&' : '?'}output=embed`;
    }
  }

  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
};

const normalizeMapUrl = (addressOrUrl: unknown): string => {
  const source = sanitizeText(addressOrUrl);
  if (!source) {
    return '';
  }

  const parsed = (() => {
    try {
      return new URL(source);
    } catch {
      return null;
    }
  })();

  if (!parsed) {
    return `https://www.google.com/maps?q=${encodeURIComponent(source)}&output=embed`;
  }

  const host = parsed.host.toLowerCase();
  if (host.includes('google.com') && host.includes('maps')) {
    if (parsed.searchParams.has('output')) {
      return source;
    }
    if (parsed.searchParams.has('q')) {
      return `${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}&output=embed`;
    }
    if (parsed.searchParams.has('ll') || parsed.searchParams.has('pb')) {
      return `${parsed.toString()}&output=embed`;
    }
  }

  return `https://www.google.com/maps?q=${encodeURIComponent(source)}&output=embed`;
};

/**
 * Render a text element
 */
function TextElement({ element }: ElementRendererProps) {
  const { props, styles } = element;

  return React.createElement(
    getSafeTag(props.tag),
    {
      style: {
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
      },
      dangerouslySetInnerHTML: { __html: (props.content as string) || '' },
    },
  );
}

/**
 * Render a heading element
 */
function HeadingElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const level =
    (typeof props.level === 'string' && /^h[1-6]$/i.test(props.level)
      ? props.level
      : `h${Number(props.level || 1) || 1}`) || 'h1';
  const Tag = level as keyof JSX.IntrinsicElements;

  return (
    <Tag
      style={{
        margin: 0,
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
      }}
    >
      {props.content as string}
    </Tag>
  );
}

/**
 * Render an image element
 */
function ImageElement({ element }: ElementRendererProps) {
  const { props, styles, width, height } = element;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src as string}
      alt={getNameClass(props.alt) || ''}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      style={{
        objectFit: (props.objectFit as React.CSSProperties['objectFit']) || 'cover',
        borderRadius: getNameClass(props.borderRadius),
        ...styles,
      }}
      loading="lazy"
    />
  );
}

/**
 * Render a video element
 */
function VideoElement({ element }: ElementRendererProps) {
  const { props, styles, width, height } = element;

  return (
    <video
      src={props.src as string}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      autoPlay={getBoolean(props.autoPlay)}
      loop={getBoolean(props.loop)}
      muted={getBoolean(props.muted)}
      controls={getBoolean(props.controls)}
      style={{
        objectFit: (props.objectFit as React.CSSProperties['objectFit']) || 'cover',
        ...styles,
      }}
      playsInline
    />
  );
}

/**
 * Render a button element
 */
function ButtonElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const isSubmit = (props.type as string) === 'submit';
  const buttonStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: getLength(props.padding, '12px 24px'),
    backgroundColor: getNameClass(props.backgroundColor) || '#3b82f6',
    color: getNameClass(props.color) || '#ffffff',
    border: getNameClass(props.border) || 'none',
    borderRadius: getLength(props.borderRadius, '8px'),
    fontSize: getLength(props.fontSize, '16px'),
    fontWeight: getNameClass(props.fontWeight) || '500',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    ...styles,
    ...getTypographyStyle(props as Record<string, unknown>),
  };

  const buttonText = getNameClass(props.content) || getNameClass(props.label) || 'Button';

  if (props.href && !isSubmit) {
    return (
      <a href={(props.href as string) || '#'} style={buttonStyles}>
        {buttonText}
      </a>
    );
  }

  return (
    <button type={(isSubmit ? 'submit' : 'button') as 'submit' | 'button'} style={buttonStyles}>
      {buttonText}
    </button>
  );
}

/**
 * Render a container/section element
 */
function ContainerElement({ element, isPreview, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles, children } = element;

  return (
    <div
      style={{
        display: (props.display as React.CSSProperties['display']) || 'flex',
        flexDirection: (props.flexDirection as React.CSSProperties['flexDirection']) || 'column',
        alignItems: props.alignItems as React.CSSProperties['alignItems'],
        justifyContent: props.justifyContent as React.CSSProperties['justifyContent'],
        gap: getLength(props.gap),
        padding: getLength(props.padding),
        backgroundColor: getNameClass(props.backgroundColor),
        backgroundImage: props.backgroundImage ? `url(${props.backgroundImage as string})` : undefined,
        backgroundSize: (props.backgroundSize as string) || 'cover',
        backgroundPosition: (props.backgroundPosition as string) || 'center',
        borderRadius: getLength(props.borderRadius),
        ...styles,
      }}
      aria-label={getNameClass(props.ariaLabel)}
    >
      {children?.map((child) => (
        <ElementRenderer
          key={child.id}
          element={child}
          isPreview={isPreview}
          siteId={siteId}
          pageId={pageId}
          postId={postId}
        />
      ))}
    </div>
  );
}

/**
 * Render a spacer element
 */
function SpacerElement({ element }: ElementRendererProps) {
  return <div style={{ height: element.height, width: '100%' }} />;
}

/**
 * Render a divider element
 */
function DividerElement({ element }: ElementRendererProps) {
  const { props, styles } = element;

  return (
    <hr
      style={{
        width: '100%',
        height: getLength(props.thickness, '1px'),
        borderTop: `${getLength(props.thickness, '1px')} solid ${getNameClass(props.color) || '#e5e7eb'}`,
        border: 'none',
        margin: `${getLength(props.margin, '16px')} 0`,
        backgroundColor: 'transparent',
        ...styles,
      }}
    />
  );
}

/**
 * Render an embed/iframe element
 */
function EmbedElement({ element }: ElementRendererProps) {
  const { props, styles, width, height } = element;
  const src = normalizeEmbedUrl(getNameClass(props.src) || getNameClass(props.url));

  if (!src) {
    return <p>Missing embed source</p>;
  }

  return (
    <iframe
      src={src}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      style={{
        border: 'none',
        width: '100%',
        ...styles,
      }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      loading="lazy"
    />
  );
}

/**
 * Render raw HTML element
 */
function HtmlElement({ element }: ElementRendererProps) {
  const { props } = element;

  return <div dangerouslySetInnerHTML={{ __html: (props.html as string) || '' }} />;
}

/**
 * Render a list element
 */
function ListElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const options = (parseOptionValues(props.items).length > 0
    ? parseOptionValues(props.items)
    : extractListItemsFromSlate(props.content));
  const listTypeFromType = getNameClass(props.listType);
  const listType = listTypeFromType === 'number' || listTypeFromType === 'ordered' ? 'ol' : 'ul';
  const listIndent = getLength(props.listIndent, '0');

  return React.createElement(
    listType,
    {
      style: {
        margin: 0,
        marginLeft: listIndent,
        paddingLeft: '20px',
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
      },
    },
    ...(options.length > 0
      ? options.map((item, index) => <li key={`${element.id}-${item}-${index}`}>{item}</li>)
      : [<li key={`${element.id}-empty`}>List item</li>]),
  );
}

/**
 * Render a quote element
 */
function QuoteElement({ element }: ElementRendererProps) {
  const { props, styles } = element;

  return (
    <blockquote
      style={{
        margin: 0,
        paddingLeft: '1rem',
        borderLeft: '4px solid rgba(0,0,0,0.2)',
        color: getNameClass(props.color) || '#334155',
        fontStyle: 'italic',
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
      }}
    >
      {getNameClass(props.content) || getNameClass(props.text) || ''}
    </blockquote>
  );
}

/**
 * Render a link-like element
 */
function LinkElement({ element, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles } = element;
  const linkText = getNameClass(props.content) || getNameClass(props.label) || 'Link';

  return (
    <a
      href={getNameClass(props.href) || '#'}
      style={{
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
        display: 'inline-block',
      }}
    >
      {linkText}
    </a>
  );
}

/**
 * Render a form element
 */
function FormElement({ element, isPreview, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles, children } = element;
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitMeta, setSubmitMeta] = useState<{
    status: string;
    submissionId?: string;
  } | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  const formId = typeof props.formId === 'string' ? props.formId : undefined;
  const configuredAction =
    (typeof props.action as string) || (typeof props.actionUrl as string) ||
    (siteId && formId ? `/api/sites/${siteId}/forms/${formId}/submissions` : undefined);

  const isBackyAction = Boolean(siteId && configuredAction?.startsWith('/api/'));
  const method = ((props.method as string) || 'POST').toUpperCase();
  const enableHoneypot = Boolean(props.enableHoneypot);
  const successRedirectUrl = getNameClass(props.successRedirectUrl || props.redirectUrl);
  const successMessage =
    getNameClass((props as { successMessage?: unknown }).successMessage) ||
    'Thanks. Your message was sent.';
  const contactShareOverride = buildContactShareOverride(props as Record<string, unknown>);
  const requestId = useRef<string>(`f-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    if (isPreview) {
      event.preventDefault();
      return;
    }

    if (!configuredAction || method !== 'POST') {
      return;
    }

    if (!isBackyAction) {
      return;
    }

    event.preventDefault();
    setSubmitState('submitting');
    setSubmitMessage('');

    const formData = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    const startedAt = startedAtRef.current;

    formData.forEach((value, key) => {
      const normalized = key;
      const valueAsText = value.toString();
      const existing = values[normalized];

      if (existing === undefined) {
        values[normalized] = valueAsText;
        return;
      }

      if (Array.isArray(existing)) {
        existing.push(valueAsText);
        return;
      }

      values[normalized] = [existing as string, valueAsText];
    });

    const body = {
      values,
      ...(enableHoneypot ? { honeypot: getNameClass(values.honeypot) } : {}),
      ...(contactShareOverride ? { contactShareOverride } : {}),
      startedAt,
      requestId: requestId.current,
      ...(pageId ? { pageId } : {}),
      ...(postId ? { postId } : {}),
    };

    if (enableHoneypot && typeof body.honeypot === 'string' && body.honeypot.length > 0) {
      setSubmitState('error');
      setSubmitMessage('Spam protection triggered.');
      return;
    }

    try {
      const response = await fetch(configuredAction, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      let responseBody = null;
      const rawResponse = await response.text();
      if (rawResponse.length > 0) {
        try {
          responseBody = JSON.parse(rawResponse);
        } catch {
          responseBody = { message: rawResponse };
        }
      }

      if (!response.ok) {
        setSubmitState('error');
        setSubmitMessage(
          typeof responseBody?.message === 'string'
            ? responseBody.message
            : 'Something went wrong while sending the form.',
        );
        return;
      }

      setSubmitState('success');
      const status = getNameClass(responseBody?.status) || 'approved';
      const serverMessage = getNameClass(responseBody?.message);
      setSubmitMeta({
        status,
        submissionId: getNameClass(responseBody?.submission?.id) || getNameClass(responseBody?.submissionId),
      });

      setSubmitMessage(
        serverMessage
          || (status === 'approved'
            ? successMessage
            : status === 'pending'
              ? 'Submission received. It is pending review.'
              : 'Submission accepted.'),
      );

      if (status === 'pending' && !successRedirectUrl) {
        return;
      }

      if (status === 'approved' && successRedirectUrl) {
        window.location.assign(successRedirectUrl);
      }
      event.currentTarget.reset();
    } catch {
      setSubmitState('error');
      setSubmitMessage('Could not connect to the submission endpoint.');
    }
  };

  return (
    <>
      <form
        action={configuredAction}
        method={method}
        encType="multipart/form-data"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: getLength(props.gap, '16px'),
          ...styles,
        }}
        onSubmit={handleSubmit}
      >
        {props.formTitle ? <h3>{getNameClass(props.formTitle)}</h3> : null}

        {isBackyAction && pageId ? (
          <input type="hidden" name="pageId" value={pageId} />
        ) : null}

        {isBackyAction && postId ? (
          <input type="hidden" name="postId" value={postId} />
        ) : null}

        {enableHoneypot ? (
          <input
            type="text"
            name="honeypot"
            autoComplete="off"
            tabIndex={-1}
            aria-hidden="true"
            style={{ display: 'none' }}
          />
        ) : null}

        {children?.map((child) => (
          <ElementRenderer
            key={child.id}
            element={child}
            isPreview={isPreview}
            siteId={siteId}
            pageId={pageId}
            postId={postId}
          />
        ))}
      </form>
      {submitMessage ? <p style={{ marginTop: '8px' }}>{submitMessage}</p> : null}
      {submitMeta?.submissionId ? (
        <p style={{ marginTop: '4px', fontSize: '12px', color: '#475569' }}>
          Submission ID: {submitMeta.submissionId}
        </p>
      ) : null}
      {submitState === 'submitting' ? <p style={{ marginTop: '8px' }}>Submitting…</p> : null}
    </>
  );
}

/**
 * Render a comment thread block
 */
function CommentThreadElement({ element, isPreview, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles } = element;
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [authorWebsite, setAuthorWebsite] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportReasons, setReportReasons] = useState<string[]>([...DEFAULT_COMMENT_REPORT_REASONS]);
  const [reportReasonByCommentId, setReportReasonByCommentId] = useState<Record<string, string>>({});
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const requestIdRef = useRef<string>(`c-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`);
  const startedAtRef = useRef<number>(Date.now());

  const commentApiPath = getCommentApiPath(siteId, pageId, postId);
  const policy = parseCommentPayload(props as Record<string, unknown>);

  useEffect(() => {
    requestIdRef.current = `c-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
    startedAtRef.current = Date.now();
  }, [siteId, pageId, postId]);

  const fetchComments = async () => {
    if (!commentApiPath || isPreview) {
      return;
    }

    try {
      setLoading(true);
      setLoadError('');

      const query = new URLSearchParams({
        status: 'approved',
        sort: policy.sort,
      });

      const response = await fetch(`${commentApiPath}?${query.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-backy-preview': isPreview ? '1' : '0',
        },
      });
    const payload = (await response.json().catch(() => null)) as {
      comments?: CommentItem[];
      error?: string;
      details?: Record<string, string>;
      message?: string;
    } | null;
      if (!response.ok) {
        const errorMessage =
          (typeof payload?.error === 'string' && payload.error)
          || (typeof payload?.message === 'string' && payload.message)
          || 'Unable to load comments.';
        setLoadError(errorMessage);
        return;
      }

      const nextComments = Array.isArray(payload?.comments) ? payload.comments : [];
      const sorted = [...nextComments].sort((a, b) =>
        policy.sort === 'oldest'
          ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setComments(sorted);
    } catch {
      setLoadError('Unable to load comments.');
    } finally {
      setLoading(false);
    }
  };

  const loadReportReasons = async () => {
    if (!siteId) {
      return;
    }

    try {
      const response = await fetch(`/api/sites/${siteId}/comments/report-reasons`);
      const payload = (await response.json().catch(() => null)) as { reasons?: string[] } | null;
      if (!response.ok) {
        return;
      }

      if (Array.isArray(payload?.reasons)) {
        const nextReasons = payload.reasons
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value.length > 0);
        if (nextReasons.length > 0) {
          setReportReasons(nextReasons);
        }
      }
    } catch {
      // fallback to defaults
    }
  };

  const reportComment = async (commentId: string) => {
    if (!commentId || isPreview || !siteId) {
      return;
    }

    const availableReasons = reportReasons.length > 0 ? reportReasons : [...DEFAULT_COMMENT_REPORT_REASONS];
    const reason = reportReasonByCommentId[commentId] || availableReasons[0];
    if (!reason) {
      setSubmitMessage('Please choose a reason before reporting.');
      return;
    }

    setSubmitMessage('');
    setStatusMessage('');
    setReportingCommentId(commentId);

    try {
      const response = await fetch(`/api/sites/${siteId}/comments/${commentId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          actor: 'public',
          requestId: requestIdRef.current,
        }),
      });

      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setSubmitMessage(
          typeof payload?.error === 'string' && payload.error.length > 0 ? payload.error : 'Unable to report comment.',
        );
        return;
      }

      setStatusMessage('Report submitted.');
      await fetchComments();
    } catch {
      setSubmitMessage('Unable to report comment right now.');
    } finally {
      setReportingCommentId(null);
    }
  };

  const postComment = async (payload: {
    content: string;
    authorName?: string;
    authorEmail?: string;
    authorWebsite?: string;
    parentId?: string | null;
  }) => {
    if (!commentApiPath || isPreview) {
      return;
    }

    setSubmitMessage('');
    setStatusMessage('');

    if (!payload.content.trim()) {
      setSubmitMessage('Comment content is required.');
      return;
    }

    if (policy.requireName && !payload.authorName?.trim()) {
      setSubmitMessage('Name is required.');
      return;
    }

    if (policy.requireEmail && !payload.authorEmail?.trim()) {
      setSubmitMessage('Email is required.');
      return;
    }

    if (payload.parentId && !policy.allowReplies) {
      setSubmitMessage('Replies are disabled for this thread.');
      return;
    }

    startedAtRef.current = Date.now();
    requestIdRef.current = `c-${Math.random().toString(36).slice(2, 10)}-${startedAtRef.current}`;

    const requestBody = {
      ...payload,
      requestId: requestIdRef.current,
      startedAt: startedAtRef.current,
      honeypot: '',
      moderationMode: policy.moderationMode,
      commentModerationMode: policy.moderationMode,
      commentRequireName: policy.requireName,
      commentRequireEmail: policy.requireEmail,
      commentAllowGuests: policy.allowGuests,
      commentAllowReplies: policy.allowReplies,
    };

    if (!policy.allowGuests) {
      setSubmitMessage('Guest posting is disabled for this comment block.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(commentApiPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const payloadResponse = await response.json().catch(() => null);
      if (!response.ok) {
        const details = (payloadResponse as { error?: string; details?: Record<string, string> } | null)?.error;
        setSubmitMessage(details || 'Unable to submit comment.');
        return;
      }

      setStatusMessage(
        (payloadResponse as { message?: string })?.message || (policy.moderationMode === 'auto-approve'
          ? 'Comment posted.'
          : 'Comment submitted for review.'),
      );

      if (payload.parentId) {
        setReplyContent((previous) => ({ ...previous, [payload.parentId as string]: '' }));
        setReplyToId(null);
      } else {
        setContent('');
        setAuthorName('');
        setAuthorEmail('');
        setAuthorWebsite('');
      }

      await fetchComments();
    } catch {
      setSubmitMessage('Failed to submit comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitTopLevel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void postComment({
      content,
      authorName,
      authorEmail,
      authorWebsite,
      parentId: null,
    });
  };

  const submitReply = (parentId: string, event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = replyContent[parentId] || '';
    if (!value.trim()) {
      setSubmitMessage('Reply content is required.');
      return;
    }
    void postComment({
      content: value,
      parentId,
      authorName,
      authorEmail,
      authorWebsite,
    });
  };

  useEffect(() => {
    void loadReportReasons();
    void fetchComments();
  }, [commentApiPath, policy.sort, isPreview, siteId]);

  const renderCommentTree = (nodes: (CommentItem & { replies?: CommentItem[] })[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {nodes.map((comment) => {
        const hasReplies = comment.replies && comment.replies.length > 0;
        const replyTargetContent = replyContent[comment.id] || '';
        const showReplyForm = replyToId === comment.id;
        const reasons = reportReasons.length > 0 ? reportReasons : [...DEFAULT_COMMENT_REPORT_REASONS];
        const selectedReason = reportReasonByCommentId[comment.id] || reasons[0];
        const currentReportCount = comment.reportCount || 0;
        const reasonsText = comment.reportReasons?.length ? `(${comment.reportReasons.join(', ')})` : '';

        return (
          <div key={comment.id} style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: '12px' }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#1e293b' }}>
              {comment.authorName || 'Anonymous'}
            </p>
            <p style={{ marginTop: '4px', marginBottom: '4px' }}>{comment.content}</p>
            <p style={{ margin: '0', fontSize: '12px', color: '#64748b' }}>
              {comment.requestId || 'No requestId'} • reports: {currentReportCount} {reasonsText}
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
              {new Date(comment.createdAt).toLocaleString()}
            </p>
            {policy.allowReplies ? (
              <button
                type="button"
                onClick={() => setReplyToId(showReplyForm ? null : comment.id)}
                style={{ marginTop: '4px', fontSize: '12px', border: 'none', color: '#2563eb', background: 'transparent' }}
              >
                {showReplyForm ? 'Cancel reply' : 'Reply'}
              </button>
            ) : null}
            {showReplyForm ? (
              <form onSubmit={(event) => submitReply(comment.id, event)} style={{ marginTop: '8px' }}>
                <textarea
                  name={`reply-${comment.id}`}
                  value={replyTargetContent}
                  onChange={(event) =>
                    setReplyContent((previous) => ({ ...previous, [comment.id]: event.target.value }))
                  }
                  rows={3}
                  style={{ width: '100%', marginBottom: '6px' }}
                  placeholder="Write a reply"
                  disabled={isSubmitting}
                />
                <button
                  type="submit"
                  style={{ padding: '8px 12px', border: 'none', borderRadius: '6px', background: '#3b82f6', color: '#fff' }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting…' : 'Post reply'}
                </button>
              </form>
            ) : null}
            {hasReplies ? (
              <div style={{ marginTop: '8px' }}>
                {renderCommentTree(comment.replies || [])}
              </div>
            ) : null}
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155' }}>
                <span>Report</span>
                <select
                  value={selectedReason}
                  onChange={(event) =>
                    setReportReasonByCommentId((previous) => ({
                      ...previous,
                      [comment.id]: event.target.value,
                    }))
                  }
                  disabled={isSubmitting}
                  style={{ padding: '4px 6px' }}
                >
                  {reasons.map((reason) => (
                    <option key={`${comment.id}-${reason}`} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void reportComment(comment.id)}
                style={{ padding: '8px 12px', border: 'none', borderRadius: '6px', background: '#dc2626', color: '#fff' }}
                disabled={isSubmitting || reportingCommentId === comment.id}
              >
                {reportingCommentId === comment.id ? 'Reporting…' : 'Report'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const roots = buildCommentThreads(comments);

  return (
    <section style={{ ...styles }}>
      <h4 style={{ margin: '0 0 12px' }}>{props.commentTitle || 'Comments'}</h4>
      {isPreview ? (
        <p style={{ color: '#64748b', fontSize: '12px' }}>
          Preview mode: comment thread data is not refreshed.
        </p>
      ) : null}
      {loading ? <p>Loading comments…</p> : null}
      {loadError ? <p style={{ color: '#b91c1c' }}>{loadError}</p> : null}
      {submitMessage ? <p style={{ color: '#b91c1c' }}>{submitMessage}</p> : null}
      {statusMessage ? <p style={{ color: '#166534' }}>{statusMessage}</p> : null}

      <div>
        {renderCommentTree(roots as (CommentItem & { replies?: CommentItem[] })[])}
      </div>

      <form onSubmit={submitTopLevel} style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <textarea
          placeholder="Write a comment"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={4}
          disabled={isPreview || isSubmitting}
          style={{ width: '100%' }}
        />
        {policy.requireName ? (
          <input
            type="text"
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
            placeholder="Your name"
            disabled={isPreview || isSubmitting}
            style={{ width: '100%' }}
          />
        ) : (
          <input
            type="text"
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
            placeholder="Your name (optional)"
            disabled={isPreview || isSubmitting}
            style={{ width: '100%' }}
          />
        )}
        {policy.requireEmail ? (
          <input
            type="email"
            value={authorEmail}
            onChange={(event) => setAuthorEmail(event.target.value)}
            placeholder="Email"
            disabled={isPreview || isSubmitting}
            style={{ width: '100%' }}
          />
        ) : (
          <input
            type="email"
            value={authorEmail}
            onChange={(event) => setAuthorEmail(event.target.value)}
            placeholder="Email (optional)"
            disabled={isPreview || isSubmitting}
            style={{ width: '100%' }}
          />
        )}
        <input
          type="text"
          value={authorWebsite}
          onChange={(event) => setAuthorWebsite(event.target.value)}
          placeholder="Website (optional)"
          disabled={isPreview || isSubmitting}
          style={{ width: '100%' }}
        />
        <button
          type="submit"
          style={{
            alignSelf: 'flex-start',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '6px',
            background: '#3b82f6',
            color: '#fff',
          }}
          disabled={isPreview || isSubmitting}
        >
          {isSubmitting ? 'Submitting…' : 'Post comment'}
        </button>
      </form>
    </section>
  );
}

/**
 * Render an input element
 */
function InputElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const inputType =
    getNameClass(props.inputType) || (getNameClass(props.type) || 'text');

  return (
    <input
      type={inputType || 'text'}
      name={getNameClass(props.name)}
      placeholder={getNameClass(props.placeholder)}
      required={getBoolean(props.required)}
      min={getNameClass(props.min)}
      max={getNameClass(props.max)}
      step={getNameClass(props.step)}
      pattern={getNameClass(props.pattern)}
      disabled={getBoolean(props.disabled)}
      defaultValue={getNameClass(props.defaultValue)}
      style={{
        padding: '12px 16px',
        border: getNameClass(props.border) || '1px solid #d1d5db',
        borderRadius: getLength(props.borderRadius, '8px'),
        fontSize: getLength(props.fontSize, '16px'),
        width: '100%',
        ...styles,
      }}
    />
  );
}

/**
 * Render a textarea element
 */
function TextareaElement({ element }: ElementRendererProps) {
  const { props, styles } = element;

  return (
    <textarea
      name={getNameClass(props.name)}
      placeholder={getNameClass(props.placeholder)}
      required={getBoolean(props.required)}
      rows={typeof props.rows === 'number' ? props.rows : 5}
      defaultValue={getNameClass(props.defaultValue)}
      style={{
        padding: '12px 16px',
        border: getNameClass(props.border) || '1px solid #d1d5db',
        borderRadius: getLength(props.borderRadius, '8px'),
        fontSize: getLength(props.fontSize, '16px'),
        width: '100%',
        resize: 'vertical',
        ...styles,
      }}
    />
  );
}

/**
 * Render a select element
 */
function SelectElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const options = parseOptionValues(props.options);

  return (
    <select
      name={getNameClass(props.name)}
      required={getBoolean(props.required)}
      style={{
        padding: '12px 16px',
        border: getNameClass(props.border) || '1px solid #d1d5db',
        borderRadius: getLength(props.borderRadius, '8px'),
        fontSize: getLength(props.fontSize, '16px'),
        width: '100%',
        ...styles,
      }}
    >
      {options.length === 0 ? <option value="">Select</option> : null}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

/**
 * Render checkbox list and single checkbox/radio inputs
 */
function CheckboxOrRadioElement({ element }: ElementRendererProps) {
  const { props, styles, children } = element;
  const inputType = element.type === 'checkbox' ? 'checkbox' : 'radio';
  const name = getNameClass(props.name);
  const options = parseOptionValues(props.options);

  if (inputType === 'radio') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', ...styles }}>
        {options.length === 0 ? (
          <label style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="radio"
              name={name}
              value={getNameClass(props.value) || 'on'}
              required={getBoolean(props.required)}
            />
            {getNameClass(props.label) || 'Option'}
          </label>
        ) : (
          options.map((option) => (
            <label
              key={`${element.id}-${option}`}
              style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}
            >
              <input type="radio" name={name} value={option} />
              <span>{option}</span>
            </label>
          ))
        )}
        {children?.map((child) => (
          <ElementRenderer
            key={child.id}
            element={child}
            isPreview={Boolean(children)}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', ...styles }}>
      {options.length === 0 ? (
        <label style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="checkbox"
            name={name}
            value={getNameClass(props.value) || 'on'}
            required={getBoolean(props.required)}
          />
          {getNameClass(props.label) || 'Option'}
        </label>
      ) : (
        options.map((option) => (
          <label
            key={`${element.id}-${option}`}
            style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}
          >
            <input
              type="checkbox"
              name={name}
              value={option}
            />
            <span>{option}</span>
          </label>
        ))
      )}
      {children?.map((child) => (
        <ElementRenderer
          key={child.id}
          element={child}
          isPreview={Boolean(children)}
        />
      ))}
    </div>
  );
}

/**
 * Map element renderer
 */
function MapElement({ element }: ElementRendererProps) {
  const { props, styles, width, height } = element;

  const src = normalizeMapUrl(getNameClass(props.src) || getNameClass(props.address) || '');

  if (!src) {
    return <div style={{ ...styles }}>Add a map URL or address</div>;
  }

  return (
    <iframe
      title={getNameClass(props.title) || 'Map embed'}
      src={src}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      style={{
        border: 'none',
        borderRadius: getLength(props.borderRadius, '8px'),
        ...styles,
      }}
      loading="lazy"
      allowFullScreen
    />
  );
}

/**
 * Map element types to their renderer components
 */
const ELEMENT_RENDERERS: Record<
  KnownElementType,
  React.ComponentType<ElementRendererProps>
> = {
  text: TextElement,
  heading: HeadingElement,
  paragraph: TextElement,
  image: ImageElement,
  video: VideoElement,
  button: ButtonElement,
  link: LinkElement,
  container: ContainerElement,
  section: ContainerElement,
  columns: ContainerElement,
  spacer: SpacerElement,
  divider: DividerElement,
  icon: TextElement, // Placeholder
  form: FormElement,
  input: InputElement,
  textarea: TextareaElement,
  select: SelectElement,
  checkbox: CheckboxOrRadioElement,
  radio: CheckboxOrRadioElement,
  list: ListElement,
  table: HtmlElement,
  embed: EmbedElement,
  html: HtmlElement,
  map: MapElement,
  box: ContainerElement,
  quote: QuoteElement,
  comment: CommentThreadElement,
};

/**
 * Main element renderer - routes to specific element renderers
 */
export function ElementRenderer({ element, isPreview, siteId, pageId, postId }: ElementRendererProps) {
  const normalizedType = element.type as KnownElementType;
  const Renderer = ELEMENT_RENDERERS[normalizedType];

  if (!Renderer) {
    console.warn(`Unknown element type: ${element.type}`);
    return null;
  }

  if ((element.props.hidden as boolean) === true) {
    return null;
  }

  // Build position styles for absolute positioning
  const positionStyles: React.CSSProperties = {
    position: 'absolute',
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    zIndex: element.zIndex,
    opacity:
      typeof element.props.opacity === 'number'
        ? element.props.opacity
        : typeof element.props.opacity === 'string'
          ? parseFloat(element.props.opacity as string)
          : 1,
  };

  // Add animation data attributes for GSAP hydration
  const animationAttrs = element.animation
    ? {
        'data-animation': JSON.stringify(element.animation),
        'data-animation-type': element.animation.type,
      }
    : {};

  return (
    <div
      style={positionStyles}
      data-element-id={element.id}
      data-element-type={element.type}
      {...animationAttrs}
    >
      <Renderer
        element={element}
        isPreview={isPreview}
        siteId={siteId}
        pageId={pageId}
        postId={postId}
      />
    </div>
  );
}

// ============================================================================
// PAGE RENDERER
// ============================================================================

interface PageRendererProps {
  content: PageContent;
  theme?: ThemeConfig;
  isPreview?: boolean;
  siteId?: string;
  pageId?: string;
  postId?: string;
  pageSlug?: string;
}

/**
 * Full page renderer component
 *
 * Renders all canvas elements with proper positioning and styling.
 */
export function PageRenderer({
  content,
  theme,
  isPreview,
  siteId,
  pageId,
  postId,
}: PageRendererProps) {
  const { elements, canvasSize, customCSS } = content;
  const [scale, setScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) {
      return;
    }

    const calculateScale = () => {
      const availableWidth = Math.max(320, container.clientWidth - 24);
      const ratio = availableWidth / Math.max(canvasSize.width, 1);
      const nextScale = Math.max(0.32, Math.min(1, ratio));
      setScale(nextScale);
    };

    calculateScale();
    const observer = new ResizeObserver(() => {
      calculateScale();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasSize.width]);

  const styleHeight = Math.round(canvasSize.height * scale);

  const viewportStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    overflowX: 'hidden',
    overflowY: 'auto',
    padding: '12px',
    minHeight: styleHeight,
  };

  const canvasStyle: React.CSSProperties = {
    position: 'relative',
    width: canvasSize.width,
    minHeight: canvasSize.height,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    transition: 'transform 140ms ease',
    willChange: 'transform',
  };

  const themeVars: React.CSSProperties = {};
  if (theme?.colors) {
    Object.entries(theme.colors).forEach(([key, value]) => {
      (themeVars as Record<string, string>)[`--color-${key}`] = value;
    });
  }

  if (theme?.fonts) {
    if (theme.fonts.heading) {
      (themeVars as Record<string, string>)['--font-heading'] = theme.fonts.heading;
    }
    if (theme.fonts.body) {
      (themeVars as Record<string, string>)['--font-body'] = theme.fonts.body;
    }
  }

  if (theme?.spacing) {
    Object.entries(theme.spacing).forEach(([key, value]) => {
      (themeVars as Record<string, string>)[`--spacing-${key}`] = `${value}`;
    });
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            :root {
              ${Object.entries(themeVars)
                .map(([k, v]) => `${k}: ${v};`)
                .join('\n')}
            }
            ${theme?.customCSS || ''}
            ${customCSS || ''}
          `,
        }}
      />

      <div ref={viewportRef} style={viewportStyle}>
        <div className="backy-canvas" style={canvasStyle}>
          {elements.map((element) => (
            <ElementRenderer
              key={element.id}
              element={element}
              isPreview={isPreview}
              siteId={siteId}
              pageId={pageId}
              postId={postId}
            />
          ))}
        </div>
      </div>
    </>
  );
}

export default PageRenderer;

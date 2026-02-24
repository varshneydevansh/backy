import { DEFAULT_THEME } from '@backy-cms/core';
import type {
  Comment,
  CommentTargetType,
  FormDefinition,
  FormSubmission,
  MediaItem,
  Contact,
  CommentReportReason,
  CommentStatus,
} from '@backy-cms/core';

interface PageMeta {
  title: string;
  description?: string | null;
  keywords?: string[];
  ogImage?: string | null;
  canonical?: string | null;
  noIndex?: boolean;
  noFollow?: boolean;
}

interface CanvasElement {
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
  animation?: {
    type: string;
    duration: number;
    delay?: number;
    easing?: string;
    direction?: 'left' | 'right' | 'up' | 'down';
    trigger?: 'load' | 'scroll' | 'hover';
  };
}

interface PageContent {
  elements: CanvasElement[];
  canvasSize: {
    width: number;
    height: number;
  };
  customCSS?: string;
  customJS?: string;
}

interface StoreSite {
  id: string;
  name: string;
  slug: string;
  description: string;
  customDomain: string | null;
  status: 'draft' | 'published' | 'scheduled' | 'archived';
  isPublished: boolean;
  theme: {
    colors: Record<string, string>;
    fonts: {
      heading?: string;
      body?: string;
      mono?: string;
      custom?: Array<{ name: string; url: string }>;
    };
    spacing?: {
      unit?: number;
      scale?: number;
    };
    customCSS: string;
  };
}

interface StorePage {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  description: string | null;
  status: 'draft' | 'published' | 'scheduled' | 'archived';
  isHomepage: boolean;
  content: PageContent;
  meta: PageMeta;
  forms?: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
}

interface StoreBlogPost {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: Record<string, unknown>;
  status: 'draft' | 'published' | 'scheduled' | 'archived';
  featuredImageId: string | null;
  authorId: string | null;
  meta: {
    title?: string;
    description?: string;
    keywords?: string[];
    ogImage?: string | null;
    canonical?: string | null;
    noIndex?: boolean;
    noFollow?: boolean;
  };
  categoryIds: string[];
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface SubmissionValidationDetail {
  field: string;
  message: string;
}

interface SpamCheckResult {
  status: FormSubmission['status'];
  flags: string[];
  errors?: string;
}

interface ContactShareOverride {
  enabled?: boolean;
  nameField?: string;
  emailField?: string;
  phoneField?: string;
  notesField?: string;
  dedupeByEmail?: boolean;
}

interface SubmissionRateState {
  total: number;
  lastSubmissionAt: number | null;
}

interface CommentSpamResult {
  ok: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked';
  flags: string[];
  errors?: string;
}

const AUDIT_EVENT_STATUSES = ['queued', 'succeeded', 'failed', 'received'] as const;
type AuditEventStatus = (typeof AUDIT_EVENT_STATUSES)[number];
type WebhookEventKind =
  | 'form-submission'
  | 'contact-shared'
  | 'contact-status'
  | 'comment-submitted'
  | 'comment-status'
  | 'comment-reported';

interface AuditEvent {
  id: string;
  siteId: string;
  kind: WebhookEventKind;
  formId: string | null;
  commentId: string | null;
  contactId: string | null;
  submissionId: string | null;
  target: string;
  status: AuditEventStatus;
  statusCode?: number;
  requestId?: string;
  reason?: string;
  actor?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  error?: string;
}

const COMMENT_REPORT_REASONS: CommentReportReason[] = [
  'spam',
  'harassment',
  'abuse',
  'hate-speech',
  'off-topic',
  'copyright',
  'privacy',
  'other',
];

const DEFAULT_COMMENT_FILTER_STATUS: CommentStatus | 'all' = 'pending';

const nowIso = new Date().toISOString();

const seedTheme = {
  ...DEFAULT_THEME,
  customCSS: '',
  colors: {
    ...DEFAULT_THEME.colors,
    background: '#f5f7fb',
    surface: '#ffffff',
    text: '#1e293b',
    textMuted: '#64748b',
  },
};

const SITE_LIST: StoreSite[] = [
  {
    id: 'site-demo',
    name: 'Backy Demo Site',
    slug: 'demo',
    description: 'Official Backy CMS demo site for website and blog examples.',
    customDomain: null,
    status: 'published',
    isPublished: true,
    theme: seedTheme,
  },
  {
    id: 'site-cook',
    name: 'Cooking Studio',
    slug: 'cooks',
    description: 'A starter template for recipes and editorial blogs.',
    customDomain: null,
    status: 'draft',
    isPublished: false,
    theme: {
      ...seedTheme,
      colors: {
        ...seedTheme.colors,
        primary: '#f59e0b',
        secondary: '#f97316',
      },
      fonts: {
        ...seedTheme.fonts,
        heading: 'Georgia, serif',
        body: 'Inter, sans-serif',
      },
      customCSS: '.site-note{padding:10px;border-radius:8px;background:#fff4dd}',
    },
  },
];

const PAGE_LIST: StorePage[] = [
  {
    id: 'page-home',
    siteId: 'site-demo',
    title: 'Home',
    slug: 'index',
    description: 'Demo landing page for Backy CMS.',
    status: 'published',
    isHomepage: true,
    publishedAt: nowIso,
    scheduledAt: null,
    forms: ['form-contact'],
    createdAt: nowIso,
    updatedAt: nowIso,
    meta: {
      title: 'Welcome | Backy Demo',
      description: 'Build websites with Backy CMS.',
      keywords: ['backy', 'cms', 'demo'],
      ogImage: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085',
      canonical: '/index',
      noIndex: false,
      noFollow: false,
    },
    content: {
      elements: [
        {
          id: 'home-heading',
          type: 'heading',
          x: 140,
          y: 120,
          width: 700,
          height: 80,
          props: {
            content: 'Welcome to Backy',
            level: 'h1',
            fontSize: '54px',
            fontWeight: '700',
            color: '#0f172a',
          },
        },
        {
          id: 'home-copy',
          type: 'text',
          x: 140,
          y: 220,
          width: 780,
          height: 130,
          props: {
            content:
              '<p>Backy CMS gives you editor-first control and API-first delivery so you can power any frontend.</p>',
            fontSize: '22px',
            color: '#334155',
            lineHeight: '1.6',
          },
        },
        {
          id: 'home-cta',
          type: 'button',
          x: 140,
          y: 390,
          width: 180,
          height: 52,
          props: {
            content: 'Start Building',
            href: '/admin',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            borderRadius: '10px',
            padding: '12px 22px',
            fontSize: '16px',
            fontWeight: '600',
          },
        },
      ],
      canvasSize: {
        width: 1200,
        height: 900,
      },
      customCSS:
        '.backy-page-note{display:inline-block;padding:10px 14px;border-radius:12px;background:#e2e8f0;color:#0f172a}',
    },
  },
  {
    id: 'page-about',
    siteId: 'site-demo',
    title: 'About',
    slug: 'about',
    description: 'About Backy CMS editor and features.',
    status: 'published',
    isHomepage: false,
    publishedAt: nowIso,
    scheduledAt: null,
    forms: ['form-contact'],
    createdAt: nowIso,
    updatedAt: nowIso,
    meta: {
      title: 'About | Backy Demo',
      description: 'Learn how Backy CMS works.',
      canonical: '/about',
      noIndex: false,
      noFollow: false,
    },
    content: {
      elements: [
        {
          id: 'about-heading',
          type: 'heading',
          x: 120,
          y: 110,
          width: 520,
          height: 60,
          props: {
            content: 'About the Project',
            level: 'h2',
            fontSize: '42px',
            fontWeight: '700',
            color: '#0f172a',
          },
        },
        {
          id: 'about-text',
          type: 'paragraph',
          x: 120,
          y: 200,
          width: 740,
          height: 220,
          props: {
            content:
              '<p>Backy aims to provide a complete CMS foundation with drag-and-drop editing and external frontend freedom.</p>' +
              '<p>Use the admin app to author content, media, and forms, then expose read APIs for your own React/Vue frontend.</p>',
            color: '#334155',
            fontSize: '20px',
            lineHeight: '1.7',
          },
        },
      ],
      canvasSize: {
        width: 1200,
        height: 700,
      },
    },
  },
  {
    id: 'page-contact',
    siteId: 'site-demo',
    title: 'Contact',
    slug: 'contact',
    description: 'Contact form example page',
    status: 'published',
    isHomepage: false,
    publishedAt: nowIso,
    scheduledAt: null,
    forms: ['form-contact'],
    createdAt: nowIso,
    updatedAt: nowIso,
    meta: {
      title: 'Contact | Backy Demo',
      description: 'Send us a message using a connected form block.',
      canonical: '/contact',
      noIndex: false,
      noFollow: false,
    },
    content: {
      elements: [
        {
          id: 'contact-heading',
          type: 'heading',
          x: 120,
          y: 80,
          width: 520,
          height: 56,
          props: {
            content: 'Contact us',
            level: 'h2',
            fontSize: '42px',
            fontWeight: '700',
          },
        },
        {
          id: 'contact-form',
          type: 'form',
          x: 120,
          y: 180,
          width: 620,
          height: 500,
          props: {
            formId: 'form-contact',
            formTitle: 'Contact Form',
            actionUrl: '/api/sites/site-demo/forms/form-contact/submissions',
            method: 'POST',
          },
          children: [
            {
              id: 'contact-name',
              type: 'input',
              x: 0,
              y: 0,
              width: 540,
              height: 50,
              props: {
                type: 'text',
                name: 'name',
                placeholder: 'Your name',
                required: true,
              },
            },
            {
              id: 'contact-email',
              type: 'input',
              x: 0,
              y: 70,
              width: 540,
              height: 50,
              props: {
                type: 'email',
                name: 'email',
                placeholder: 'you@example.com',
                required: true,
              },
            },
            {
              id: 'contact-message',
              type: 'textarea',
              x: 0,
              y: 140,
              width: 540,
              height: 130,
              props: {
                name: 'message',
                placeholder: 'How can we help?',
                required: true,
              },
            },
            {
              id: 'contact-send',
              type: 'button',
              x: 0,
              y: 300,
              width: 180,
              height: 52,
              props: {
                type: 'submit',
                content: 'Send Message',
                backgroundColor: '#0f172a',
                color: '#ffffff',
              },
            },
          ],
        },
      ],
      canvasSize: {
        width: 1200,
        height: 820,
      },
    },
  },
  {
    id: 'page-draft',
    siteId: 'site-demo',
    title: 'Roadmap',
    slug: 'draft-page',
    description: 'Draft page used for publish workflow checks.',
    status: 'draft',
    isHomepage: false,
    publishedAt: null,
    scheduledAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    meta: {
      title: 'Roadmap (Draft) | Backy',
      description: 'This page is a draft.',
      canonical: '/draft-page',
      noIndex: true,
      noFollow: true,
    },
    content: {
      elements: [
        {
          id: 'draft-note',
          type: 'heading',
          x: 80,
          y: 80,
          width: 620,
          height: 60,
          props: {
            content: 'Draft-only page',
            level: 'h3',
            color: '#b91c1c',
          },
        },
      ],
      canvasSize: {
        width: 1200,
        height: 420,
      },
    },
  },
];

const BLOG_POSTS: StoreBlogPost[] = [
  {
    id: 'post-welcome',
    siteId: 'site-demo',
    title: 'Welcome to Backy',
    slug: 'welcome',
    excerpt: 'A quick start into the Backy CMS world.',
    content: {
      html: '<p>Backy CMS helps you ship a full website quickly. This post shows API-first rendering and editor parity.</p>',
    },
    status: 'published',
    featuredImageId: 'media-demo-hero',
    authorId: 'editor-1',
    meta: {
      title: 'Welcome to Backy',
      description: 'A quick start into the Backy CMS world.',
      keywords: ['backy', 'release'],
      canonical: '/blog/welcome',
      ogImage: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a',
    },
    categoryIds: ['cat-news'],
    tagIds: ['tag-getting-started'],
    publishedAt: nowIso,
    scheduledAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'post-product',
    siteId: 'site-demo',
    title: 'Building CMS parity page by page',
    slug: 'cms-parity',
    excerpt: 'Why editor/public parity is the hardest part.',
    content: {
      html: '<p>Editors drift and renderers drift. This post tracks how to avoid split-brain contracts.</p>',
    },
    status: 'draft',
    featuredImageId: null,
    authorId: 'editor-1',
    meta: {
      title: 'Building CMS parity page by page',
      description: 'Why editor/public parity is the hardest part.',
      canonical: '/blog/cms-parity',
      noIndex: true,
    },
    categoryIds: ['cat-engineering'],
    tagIds: ['tag-editor'],
    publishedAt: null,
    scheduledAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const MEDIA_LIBRARY: MediaItem[] = [
  {
    id: 'media-demo-hero',
    siteId: 'site-demo',
    filename: 'hero-image.jpg',
    originalName: 'hero-image.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 245000,
    type: 'image',
    url: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a',
    thumbnailUrl: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=280&h=160&fit=crop',
    folderId: null,
    pageIds: ['page-home'],
    postIds: ['post-welcome'],
    tags: ['hero', 'hero-image'],
    metadata: {
      width: 1600,
      height: 900,
      extension: 'jpg',
    },
    altText: 'Modern laptop workspace',
    caption: 'Hero image for the demo homepage',
    uploadedBy: 'admin',
    scope: 'global',
    scopeTargetId: null,
    visibility: 'public',
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'media-demo-logo',
    siteId: 'site-demo',
    filename: 'backy-logo.png',
    originalName: 'backy-logo.png',
    mimeType: 'image/png',
    sizeBytes: 45000,
    type: 'image',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg',
    thumbnailUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg',
    folderId: null,
    pageIds: [],
    postIds: [],
    tags: ['brand', 'icon'],
    metadata: {
      width: 120,
      height: 120,
      extension: 'png',
    },
    altText: 'Backy icon',
    caption: 'Reusable logo',
    uploadedBy: 'admin',
    scope: 'global',
    scopeTargetId: null,
    visibility: 'public',
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'media-contact-bg',
    siteId: 'site-demo',
    filename: 'contact-bg.jpg',
    originalName: 'contact-bg.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 90000,
    type: 'image',
    url: 'https://images.unsplash.com/photo-1521791136064-7986c2920216',
    thumbnailUrl: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=280&h=160&fit=crop',
    folderId: null,
    pageIds: ['page-contact'],
    postIds: [],
    tags: ['contact', 'background'],
    metadata: {
      width: 1920,
      height: 1080,
      extension: 'jpg',
    },
    altText: 'Contact page background',
    caption: 'Optional background media',
    uploadedBy: 'admin',
    scope: 'page',
    scopeTargetId: 'page-contact',
    visibility: 'public',
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const FORM_LIBRARY: FormDefinition[] = [
  {
    id: 'form-contact',
    siteId: 'site-demo',
    pageId: 'page-contact',
    postId: null,
    name: 'contact-form',
    title: 'Contact form',
    description: 'Simple contact capture for the demo contact page.',
    audience: 'public',
    isActive: true,
    fields: [
      {
        key: 'name',
        label: 'Name',
        type: 'text',
        required: true,
        placeholder: 'Your full name',
        validation: [
          {
            type: 'required',
            message: 'Name is required.',
          },
        ],
      },
      {
        key: 'email',
        label: 'Email',
        type: 'email',
        required: true,
        placeholder: 'you@example.com',
        validation: [
          {
            type: 'required',
            message: 'Email is required.',
          },
          {
            type: 'pattern',
            value: '[^\\s@]+@[^\\s@]+\\\\.[^\\s@]+',
            message: 'Enter a valid email.',
          },
        ],
      },
      {
        key: 'message',
        label: 'Message',
        type: 'textarea',
        required: true,
        placeholder: 'Your message',
        validation: [
          {
            type: 'required',
            message: 'Message is required.',
          },
          {
            type: 'minLength',
            value: 10,
            message: 'Message should be at least 10 characters.',
          },
        ],
      },
    ],
    notificationEmail: null,
    successMessage: 'Thanks for reaching out. We will get back to you quickly.',
    successRedirectUrl: null,
    enableHoneypot: true,
    enableCaptcha: false,
    moderationMode: 'manual',
    contactShare: {
      enabled: true,
      nameField: 'name',
      emailField: 'email',
      notesField: 'message',
      dedupeByEmail: true,
    },
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const COMMENT_LIST: Comment[] = [
  {
    id: 'comment-page-about-1',
    siteId: 'site-demo',
    targetType: 'page',
    targetId: 'page-about',
    authorName: 'Open Source Reader',
    authorEmail: null,
    authorWebsite: null,
    userId: null,
    content: 'Nice foundation for an open-source CMS.',
    status: 'approved',
    parentId: null,
    reviewedBy: null,
    reviewedAt: nowIso,
    rejectionReason: null,
    reportCount: 0,
    reportReasons: [],
    blockReason: null,
    blockedBy: null,
    blockedAt: null,
    requestId: null,
    ipHash: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'comment-post-welcome-1',
    siteId: 'site-demo',
    targetType: 'post',
    targetId: 'post-welcome',
    authorName: 'Tester User',
    authorEmail: null,
    authorWebsite: null,
    userId: null,
    content: 'This is exactly the parity flow we needed.',
    status: 'approved',
    parentId: null,
    reviewedBy: null,
    reviewedAt: nowIso,
    rejectionReason: null,
    reportCount: 0,
    reportReasons: [],
    blockReason: null,
    blockedBy: null,
    blockedAt: null,
    requestId: null,
    ipHash: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const FORM_SUBMISSIONS: FormSubmission[] = [];
const CONTACT_LIST: Contact[] = [];
const COMMENT_REPORT_BLOCKLIST = new Map<
  string,
  { type: 'email' | 'ip'; value: string; reason: string; actor?: string; requestId?: string; createdAt: string; }
>();
const SUBMISSION_RATE_WINDOWS = new Map<string, SubmissionRateState>();
const SUBMISSION_SIGNATURE_WINDOW_MS = 10 * 60 * 1000;
const SUBMISSION_RATE_WINDOW_MS = 60 * 1000;
const SUBMISSION_RATE_LIMIT = 8;
const FORM_SUBMISSION_SIGNATURES = new Map<string, number[]>();
const FORM_SUBMISSION_MIN_FILL_MS = 900;
const COMMENT_RATE_WINDOWS = new Map<string, SubmissionRateState>();
const COMMENT_SIGNATURE_WINDOW_MS = 5 * 60 * 1000;
const COMMENT_RATE_WINDOW_MS = 45 * 1000;
const COMMENT_RATE_LIMIT = 12;
const COMMENT_SIGNATURES = new Map<string, number[]>();
const COMMENT_MIN_FILL_MS = 900;
const AUDIT_EVENTS: AuditEvent[] = [];

let commentStore: Comment[] = [...COMMENT_LIST];
let formSubmissions: FormSubmission[] = [...FORM_SUBMISSIONS];
let contactStore: Contact[] = [...CONTACT_LIST];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPublished(status?: StorePage['status']): boolean {
  return status === 'published';
}

function getPagination(total: number, limit: number, offset: number): Pagination {
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function normalizeReportReason(raw: string | null | undefined): string | null {
  const normalized = (raw || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (COMMENT_REPORT_REASONS.includes(normalized as CommentReportReason)) {
    return normalized as CommentReportReason;
  }

  if (normalized === 'off topic' || normalized === 'off-topic' || normalized === 'offtopic') {
    return 'off-topic';
  }

  if (normalized === 'hate' || normalized === 'hatespeech') {
    return 'hate-speech';
  }

  if (normalized === 'abusive' || normalized === 'threat') {
    return 'abuse';
  }

  if (normalized === 'other') {
    return 'other';
  }

  return 'other';
}

function getCommentBlockKey(siteId: string, kind: 'email' | 'ip', value: string) {
  return `${siteId}:${kind}:${normalizeIdentifier(value)}`;
}

function isCommentBlockedByIdentity(siteId: string, params: { email?: string | null; ipHash?: string | null }) {
  const blockedEmailKey = params.email
    ? COMMENT_REPORT_BLOCKLIST.get(getCommentBlockKey(siteId, 'email', params.email))
    : null;

  if (blockedEmailKey) {
    return blockedEmailKey;
  }

  if (params.ipHash) {
    const blockedIp = COMMENT_REPORT_BLOCKLIST.get(getCommentBlockKey(siteId, 'ip', params.ipHash));
    if (blockedIp) {
      return blockedIp;
    }
  }

  return null;
}

function getRequestKey(siteId: string, formId: string, ipHash?: string | null) {
  return `${siteId}:${formId}:${ipHash || 'anonymous'}`;
}

function getCommentRequestKey(
  siteId: string,
  targetType: CommentTargetType,
  targetId: string,
  ipHash?: string | null,
) {
  return `${siteId}:${targetType}:${targetId}:${ipHash || 'anonymous'}`;
}

function sanitizeString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'boolean') {
    return value ? 'on' : '';
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeString(item))
      .filter(Boolean)
      .join(',');
  }

  return '';
}

function getValueAsString(values: Record<string, unknown>, key: string): string {
  return sanitizeString(values[key] || '');
}

function evaluateValidationRule(
  fieldLabel: string,
  fieldType: string,
  rule: { type: string; value?: string | number; message?: string },
  value: unknown,
): SubmissionValidationDetail | null {
  const trimmed = sanitizeString(value);

  if (rule.type === 'required') {
    if (trimmed.length === 0) {
      return {
        field: fieldLabel,
        message: rule.message || `${fieldLabel} is required`,
      };
    }
    return null;
  }

  if (!trimmed) {
    return null;
  }

  if (rule.type === 'minLength') {
    const minLength = Number(rule.value);
    if (Number.isFinite(minLength) && trimmed.length < minLength) {
      return {
        field: fieldLabel,
        message:
          rule.message || `${fieldLabel} must be at least ${minLength} characters`,
      };
    }
    return null;
  }

  if (rule.type === 'maxLength') {
    const maxLength = Number(rule.value);
    if (Number.isFinite(maxLength) && trimmed.length > maxLength) {
      return {
        field: fieldLabel,
        message:
          rule.message || `${fieldLabel} must be no more than ${maxLength} characters`,
      };
    }
    return null;
  }

  if (rule.type === 'pattern') {
    if (!rule.value) {
      return null;
    }

    try {
      const regex = new RegExp(String(rule.value));
      if (!regex.test(trimmed)) {
        return {
          field: fieldLabel,
          message: rule.message || `${fieldLabel} format is invalid`,
        };
      }
    } catch {
      return {
        field: fieldLabel,
        message: `${fieldLabel} validation pattern is invalid`,
      };
    }
    return null;
  }

  if (rule.type === 'min' || rule.type === 'max') {
    const numeric = Number(trimmed);
    const compare = Number(rule.value);

    if (!Number.isFinite(numeric) || !Number.isFinite(compare)) {
      return null;
    }

    if (rule.type === 'min' && numeric < compare) {
      return {
        field: fieldLabel,
        message: rule.message || `${fieldLabel} must be at least ${compare}`,
      };
    }

    if (rule.type === 'max' && numeric > compare) {
      return {
        field: fieldLabel,
        message: rule.message || `${fieldLabel} must be no more than ${compare}`,
      };
    }
    return null;
  }

  if (fieldType === 'email' && trimmed.length > 0) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmed)) {
      return {
        field: fieldLabel,
        message: `${fieldLabel} must be a valid email`,
      };
    }
  }

  return null;
}

function validateSubmissionValues(
  form: FormDefinition,
  values: Record<string, unknown>,
): SubmissionValidationDetail[] {
  const details: SubmissionValidationDetail[] = [];

  if (!form.fields || form.fields.length === 0) {
    return details;
  }

  form.fields.forEach((field) => {
    const fieldLabel = field.label || field.key;
    const fieldValue = values[field.key];
    const sanitized = sanitizeString(fieldValue);

    if (field.required && sanitized.length === 0) {
      details.push({
        field: fieldLabel,
        message: `${fieldLabel} is required`,
      });
      return;
    }

    if (!field.validation || field.validation.length === 0) {
      if (field.type === 'email' && sanitized.length > 0) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(sanitized)) {
          details.push({
            field: fieldLabel,
            message: `${fieldLabel} must be a valid email`,
          });
        }
      }
      return;
    }

    for (const validation of field.validation) {
      const violation = evaluateValidationRule(
        fieldLabel,
        field.type || 'text',
        validation,
        fieldValue,
      );

      if (violation) {
        details.push(violation);
      }
    }
  });

  return details;
}

function makeSubmissionSignature(values: Record<string, unknown>) {
  return Object.keys(values)
    .sort()
    .map((key) => `${key}=${sanitizeString(values[key])}`)
    .join('&');
}

function checkSubmissionSpamSignals(
  form: FormDefinition,
  body: {
    honeypot?: string;
    ipHash?: string | null;
    requestId?: string | null;
    startedAt?: string | number | null;
  },
  values: Record<string, unknown>,
): SpamCheckResult {
  const flags: string[] = [];
  const now = Date.now();

  if (form.enableHoneypot && sanitizeString(body.honeypot).length > 0) {
    return {
      status: 'spam',
      flags: ['honeypot'],
      errors: 'Spam signal detected: honeypot',
    };
  }

  const startedAt = typeof body.startedAt === 'number'
    ? body.startedAt
    : body.startedAt
      ? Date.parse(String(body.startedAt))
      : NaN;

  if (Number.isFinite(startedAt) && now - startedAt < FORM_SUBMISSION_MIN_FILL_MS) {
    flags.push('timing');
    return {
      status: 'spam',
      flags,
      errors: 'Submission rejected: too quick to be a human response.',
    };
  }

  const key = getRequestKey(form.siteId, form.id, body.ipHash);
  const rateState = SUBMISSION_RATE_WINDOWS.get(key) || {
    total: 0,
    lastSubmissionAt: null,
  };

  const windowStarted = rateState.lastSubmissionAt !== null
    ? now - rateState.lastSubmissionAt <= SUBMISSION_RATE_WINDOW_MS
    : false;
  if (!windowStarted) {
    rateState.total = 0;
    rateState.lastSubmissionAt = now;
  }

  rateState.total += 1;
  SUBMISSION_RATE_WINDOWS.set(key, rateState);

  if (rateState.total > SUBMISSION_RATE_LIMIT) {
    flags.push('rate-limit');
    return {
      status: 'spam',
      flags,
      errors: `Too many submissions. Please wait ${Math.max(10, Math.round(SUBMISSION_RATE_WINDOW_MS / 1000))} seconds.`,
    };
  }

  const signature = makeSubmissionSignature(values) || `empty-${now}`;
  const signatureKey = `${key}:signature:${signature}`;
  const signatures = FORM_SUBMISSION_SIGNATURES.get(signatureKey) || [];
  const activeSignatures = signatures.filter((value) => now - value <= SUBMISSION_SIGNATURE_WINDOW_MS);
  if (activeSignatures.length > 0) {
    activeSignatures.push(now);
    FORM_SUBMISSION_SIGNATURES.set(signatureKey, activeSignatures);
    flags.push('duplicate');
    return {
      status: 'spam',
      flags,
      errors: 'Duplicate submission blocked.',
    };
  }

  activeSignatures.push(now);
  FORM_SUBMISSION_SIGNATURES.set(signatureKey, activeSignatures);

  return { status: form.moderationMode === 'auto-approve' ? 'approved' : 'pending', flags };
}

function checkCommentSpamSignals(
  params: {
    siteId: string;
    targetType: CommentTargetType;
    targetId: string;
    content: string;
    authorEmail?: string | null;
    honeypot?: string;
    ipHash?: string | null;
    startedAt?: string | number | null;
    rateLimitBypass?: boolean;
  },
): CommentSpamResult {
  const flags: string[] = [];
  const now = Date.now();
  const normalizedContent = sanitizeString(params.content);

  if (!normalizedContent.length) {
    return {
      ok: false,
      status: 'rejected',
      flags: ['validation'],
      errors: 'Comment content is required.',
    };
  }

  const blockedActor = isCommentBlockedByIdentity(params.siteId, {
    email: params.authorEmail,
    ipHash: params.ipHash,
  });

  if (blockedActor) {
    return {
      ok: false,
      status: 'blocked',
      flags: ['blocked-actor'],
      errors: `User blocked: ${blockedActor.reason}`,
    };
  }

  if (normalizedContent.length > 5000) {
    return {
      ok: false,
      status: 'rejected',
      flags: ['validation'],
      errors: 'Comment content is too long.',
    };
  }

  if (params.rateLimitBypass) {
    return {
      ok: true,
      status: 'approved',
      flags: [],
    };
  }

  if (params.honeypot && sanitizeString(params.honeypot).length > 0) {
    flags.push('honeypot');
    return {
      ok: false,
      status: 'spam',
      flags,
      errors: 'Spam signal detected: honeypot.',
    };
  }

  const startedAt = typeof params.startedAt === 'number'
    ? params.startedAt
    : params.startedAt
      ? Date.parse(String(params.startedAt))
      : NaN;

  if (Number.isFinite(startedAt) && now - startedAt < COMMENT_MIN_FILL_MS) {
    flags.push('timing');
    return {
      ok: false,
      status: 'spam',
      flags,
      errors: 'Submission rejected: too quick to be a human response.',
    };
  }

  const key = getCommentRequestKey(params.siteId, params.targetType, params.targetId, params.ipHash);
  const rateState = COMMENT_RATE_WINDOWS.get(key) || {
    total: 0,
    lastSubmissionAt: null,
  };

  const isWithinWindow = rateState.lastSubmissionAt !== null
    ? now - rateState.lastSubmissionAt <= COMMENT_RATE_WINDOW_MS
    : false;

  if (!isWithinWindow) {
    rateState.total = 0;
    rateState.lastSubmissionAt = now;
  }

  rateState.total += 1;
  COMMENT_RATE_WINDOWS.set(key, rateState);

  if (rateState.total > COMMENT_RATE_LIMIT) {
    flags.push('rate-limit');
    return {
      ok: false,
      status: 'spam',
      flags,
      errors: `Too many comments. Please wait ${Math.max(10, Math.round(COMMENT_RATE_WINDOW_MS / 1000))} seconds.`,
    };
  }

  const signature = makeSubmissionSignature({ commentContent: normalizedContent, content: normalizedContent });
  const signatureKey = `${key}:signature:${signature}`;
  const signatures = COMMENT_SIGNATURES.get(signatureKey) || [];
  const activeSignatures = signatures.filter((value) => now - value <= COMMENT_SIGNATURE_WINDOW_MS);

  if (activeSignatures.length > 0) {
    activeSignatures.push(now);
    COMMENT_SIGNATURES.set(signatureKey, activeSignatures);
    flags.push('duplicate');
    return {
      ok: false,
      status: 'spam',
      flags,
      errors: 'Duplicate comment blocked.',
    };
  }

  activeSignatures.push(now);
  COMMENT_SIGNATURES.set(signatureKey, activeSignatures);

  return {
    ok: true,
    status: 'pending',
    flags,
  };
}

function parseShareValue(values: Record<string, unknown>, key?: string | null): string | null {
  if (!key) {
    return null;
  }

  const parsed = sanitizeString(values[key]);
  return parsed.length > 0 ? parsed : null;
}

export function getSites(params: { includeUnpublished?: boolean } = {}): StoreSite[] {
  const { includeUnpublished = false } = params;
  const raw = includeUnpublished ? SITE_LIST : SITE_LIST.filter((site) => site.isPublished);
  return clone(raw);
}

export function getSiteByIdOrSlug(identifier: string): StoreSite | undefined {
  const normalized = normalizeIdentifier(identifier);
  const found = SITE_LIST.find(
    (site) =>
      normalizeIdentifier(site.slug) === normalized ||
      normalizeIdentifier(site.id) === normalized ||
      (site.customDomain ? normalizeIdentifier(site.customDomain) === normalized : false),
  );

  return found ? clone(found) : undefined;
}

export function getPageSummary(siteId: string, options: { includeUnpublished?: boolean } = {}): Omit<StorePage, 'content'>[] {
  const { includeUnpublished = false } = options;
  const pages = PAGE_LIST.filter(
    (page) => page.siteId === siteId && (includeUnpublished || isPublished(page.status)),
  );

  return clone(
    pages.map(({ content, ...page }) => page),
  );
}

export function getPageBySlug(
  siteId: string,
  slug: string,
  options: { includeUnpublished?: boolean } = {},
): StorePage | undefined {
  const normalizedSlug = normalizeIdentifier(slug || 'index');
  const { includeUnpublished = false } = options;

  const target = PAGE_LIST.find(
    (page) => page.siteId === siteId && normalizeIdentifier(page.slug) === normalizedSlug,
  );

  if (!target) {
    return undefined;
  }

  if (!includeUnpublished && !isPublished(target.status)) {
    return undefined;
  }

  return clone(target);
}

export function getPageByPath(
  siteId: string,
  path: string,
  options: { includeUnpublished?: boolean } = {},
): StorePage | undefined {
  const normalizedPath = normalizeIdentifier((path || 'index').replace(/^\/+|\/+$/g, ''));
  const canonicalPath = normalizedPath === '' || normalizedPath === 'index' || normalizedPath === 'home'
    ? 'index'
    : normalizedPath;

  return getPageBySlug(siteId, canonicalPath, options);
}

export function getBlogPosts(
  siteId: string,
  params: {
    slug?: string;
    status?: StoreBlogPost['status'];
    limit?: number;
    offset?: number;
    includeUnpublished?: boolean;
  } = {},
): { posts: StoreBlogPost[]; pagination?: Pagination } {
  const {
    slug,
    status,
    limit = 20,
    offset = 0,
    includeUnpublished = false,
  } = params;

  let posts = BLOG_POSTS.filter((post) => post.siteId === siteId);

  if (!includeUnpublished) {
    posts = posts.filter((post) => isPublished(post.status));
  }

  if (status) {
    posts = posts.filter((post) => post.status === status);
  }

  if (slug) {
    const target = posts.find((post) => normalizeIdentifier(post.slug) === normalizeIdentifier(slug));
    const list = target ? [target] : [];
    return {
      posts: clone(list),
      pagination: {
        total: list.length,
        limit,
        offset,
        hasMore: false,
      },
    };
  }

  const paginated = posts.slice(offset, offset + limit);
  return {
    posts: clone(paginated),
    pagination: getPagination(posts.length, limit, offset),
  };
}

export function getMediaList(
  siteId: string,
  params: {
    type?: string;
    scope?: string;
    visibility?: string;
    pageId?: string;
    postId?: string;
    limit?: number;
    offset?: number;
  } = {},
): { media: MediaItem[]; pagination: Pagination } {
  const { type, scope, visibility, pageId, postId, limit = 50, offset = 0 } = params;
  const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : undefined;

  let media = MEDIA_LIBRARY.filter((item) => item.siteId === siteId);

  if (normalizedType) {
    media = media.filter((item) => item.type === normalizedType);
  }

  if (scope) {
    media = media.filter((item) => item.scope === scope);
  }

  if (visibility) {
    media = media.filter((item) => item.visibility === visibility);
  }

  if (pageId) {
    media = media.filter((item) => {
      const itemScope = item.scope || 'global';
      if (itemScope === 'global') {
        return true;
      }
      if (itemScope === 'page') {
        return item.scopeTargetId === pageId || item.pageIds.includes(pageId);
      }
      return false;
    });
  }

  if (postId) {
    media = media.filter((item) => {
      const itemScope = item.scope || 'global';
      if (itemScope === 'global') {
        return true;
      }
      if (itemScope === 'post') {
        return item.scopeTargetId === postId || item.postIds.includes(postId);
      }
      return false;
    });
  }

  const paginated = media.slice(offset, offset + limit);

  return {
    media: clone(paginated),
    pagination: getPagination(media.length, limit, offset),
  };
}

export function listFormsBySite(siteId: string, filters: { pageId?: string; postId?: string } = {}): FormDefinition[] {
  const { pageId, postId } = filters;
  return clone(
    FORM_LIBRARY.filter(
      (form) =>
        form.siteId === siteId &&
        (!pageId || form.pageId === pageId || !form.pageId) &&
        (!postId || form.postId === postId || !form.postId),
    ),
  );
}

export function getFormById(siteId: string, formId: string): FormDefinition | undefined {
  const form = FORM_LIBRARY.find(
    (item) => item.siteId === siteId && normalizeIdentifier(item.id) === normalizeIdentifier(formId),
  );

  return form ? clone(form) : undefined;
}

export function validateAndClassifyFormSubmission(
  form: FormDefinition,
  values: Record<string, unknown>,
  body: {
    honeypot?: string;
    ipHash?: string | null;
    requestId?: string | null;
    rateLimitBypass?: boolean;
    startedAt?: string | number | null;
  } = {},
): {
  ok: boolean;
  status: FormSubmission['status'];
  validation: SubmissionValidationDetail[];
  spamFlags: string[];
  spamMessage?: string;
} {
  const validation = validateSubmissionValues(form, values);

  if (validation.length > 0) {
    return {
      ok: false,
      status: 'rejected',
      validation,
      spamFlags: ['validation'],
      spamMessage: 'Validation failed',
    };
  }

  if (body.rateLimitBypass) {
    return {
      ok: true,
      status: form.moderationMode === 'auto-approve' ? 'approved' : 'pending',
      validation,
      spamFlags: [],
    };
  }

  const spamCheck = checkSubmissionSpamSignals(form, body, values);
  return {
    ok: spamCheck.status !== 'spam',
    status: spamCheck.status,
    validation,
    spamFlags: spamCheck.flags,
    spamMessage: spamCheck.errors,
  };
}

export function validateAndClassifyComment(params: {
  siteId: string;
  targetType: CommentTargetType;
  targetId: string;
  content: string;
  moderationMode: 'manual' | 'auto-approve';
  authorEmail?: string;
  honeypot?: string;
  ipHash?: string | null;
  requestId?: string;
  startedAt?: string | number | null;
  rateLimitBypass?: boolean;
}): {
  ok: boolean;
  status: Comment['status'];
  spamFlags: string[];
  spamMessage?: string;
} {
  const spamCheck = checkCommentSpamSignals({
    siteId: params.siteId,
    targetType: params.targetType,
    targetId: params.targetId,
    authorEmail: params.authorEmail,
    content: params.content,
    honeypot: params.honeypot,
    ipHash: params.ipHash,
    startedAt: params.startedAt,
    rateLimitBypass: params.rateLimitBypass,
  });

  return {
    ok: spamCheck.ok,
    status: spamCheck.ok
      ? (params.moderationMode === 'auto-approve' ? 'approved' : 'pending')
      : spamCheck.status,
    spamFlags: spamCheck.flags,
    spamMessage: spamCheck.errors,
  };
}

export function buildContactShareFromSubmission(
  siteId: string,
  formId: string,
  values: Record<string, unknown>,
  submissionMeta: {
    status: FormSubmission['status'];
    pageId?: string | null;
    postId?: string | null;
    ipHash?: string | null;
    sourceSubmissionId?: string;
    requestId?: string;
  },
  contactShareOverride?: ContactShareOverride,
): Contact | null {
  const form = getFormById(siteId, formId);
  if (!form) {
    return null;
  }

  const resolvedShare: ContactShareOverride = {
    enabled:
      contactShareOverride?.enabled !== undefined
        ? contactShareOverride.enabled
        : form.contactShare?.enabled ?? false,
    nameField: contactShareOverride?.nameField || form.contactShare?.nameField,
    emailField: contactShareOverride?.emailField || form.contactShare?.emailField,
    phoneField: contactShareOverride?.phoneField || form.contactShare?.phoneField,
    notesField: contactShareOverride?.notesField || form.contactShare?.notesField,
    dedupeByEmail: contactShareOverride?.dedupeByEmail ?? form.contactShare?.dedupeByEmail,
  };

  if (!resolvedShare.enabled) {
    return null;
  }

  const name = parseShareValue(values, resolvedShare.nameField);
  const email = parseShareValue(values, resolvedShare.emailField);
  const phone = parseShareValue(values, resolvedShare.phoneField);
  const notes = parseShareValue(values, resolvedShare.notesField);

  if (!email && !name && !phone) {
    return null;
  }

  const hasContactIdentity = name || email || phone;
  if (!hasContactIdentity) {
    return null;
  }

  const dedupeByEmail = resolvedShare.dedupeByEmail !== false;
  const normalizedEmail = email ? normalizeIdentifier(email) : null;
  const existingByEmail = dedupeByEmail && normalizedEmail
    ? contactStore.find(
        (contact) =>
          contact.siteId === siteId &&
          contact.formId === formId &&
          normalizeIdentifier(contact.email || '') === normalizedEmail,
      )
    : null;

  const payload: Contact = {
    id: existingByEmail ? existingByEmail.id : `contact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    siteId,
    formId,
    pageId: submissionMeta.pageId ?? null,
    postId: submissionMeta.postId ?? null,
    name: name ?? existingByEmail?.name ?? null,
    email: email ?? existingByEmail?.email ?? null,
    phone: phone ?? existingByEmail?.phone ?? null,
    notes: [existingByEmail?.notes, notes].filter((value) => value).join(existingByEmail?.notes ? '\n' : ''),
    sourceValues: values,
    status: 'new',
    sourceSubmissionId: submissionMeta.sourceSubmissionId,
    requestId: submissionMeta.requestId,
    sourceIpHash: submissionMeta.ipHash || null,
    createdAt: existingByEmail ? existingByEmail.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingByEmail) {
    const merged = {
      ...existingByEmail,
      ...payload,
      notes: [existingByEmail.notes, notes].filter((value) => value).join(existingByEmail.notes ? '\n' : ''),
      status: submissionMeta.status === 'spam' ? existingByEmail.status : 'new',
      updatedAt: new Date().toISOString(),
    };

    contactStore = contactStore.map((item) => (item.id === existingByEmail.id ? merged : item));
    return clone(merged);
  }

  if (submissionMeta.status === 'spam') {
    return null;
  }

  contactStore = [payload, ...contactStore];
  return clone(payload);
}

export function trackWebhookEvent(event: {
  kind: WebhookEventKind;
  siteId?: string;
  formId?: string;
  commentId?: string;
  contactId?: string;
  submissionId?: string;
  target: string;
  status: AuditEventStatus;
  statusCode?: number;
  requestId?: string;
  reason?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}) {
  const entry: AuditEvent = {
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    kind: event.kind,
    siteId: event.siteId || 'site-demo',
    formId: event.formId || null,
    commentId: event.commentId || null,
    contactId: event.contactId || null,
    submissionId: event.submissionId || null,
    target: event.target,
    status: event.status,
    reason: event.reason,
    actor: event.actor,
    metadata: event.metadata || {},
    statusCode: event.statusCode,
    requestId: event.requestId,
    error: event.error,
    createdAt: new Date().toISOString(),
  };
  AUDIT_EVENTS.unshift(entry);
}

export function listAuditEvents(
  siteId: string,
  params: {
    kind?: WebhookEventKind | 'all';
    requestId?: string;
    formId?: string;
    commentId?: string;
    contactId?: string;
    limit?: number;
    offset?: number;
  } = {},
): { events: AuditEvent[]; count: number; pagination: Pagination } {
  const {
    kind,
    requestId,
    formId,
    commentId,
    contactId,
    limit = 100,
    offset = 0,
  } = params;

  let filtered = AUDIT_EVENTS.filter((event) => event.siteId === siteId);

  if (kind && kind !== 'all') {
    filtered = filtered.filter((event) => event.kind === kind);
  }

  if (requestId) {
    filtered = filtered.filter((event) => event.requestId === requestId);
  }

  if (formId) {
    filtered = filtered.filter((event) => event.formId === formId);
  }

  if (commentId) {
    filtered = filtered.filter((event) => event.commentId === commentId);
  }

  if (contactId) {
    filtered = filtered.filter((event) => event.contactId === contactId);
  }

  const paginated = filtered.slice(offset, offset + limit);

  return {
    events: clone(paginated),
    count: filtered.length,
    pagination: getPagination(filtered.length, limit, offset),
  };
}

export function blockCommentIdentity(params: {
  siteId: string;
  reason: string;
  actor?: string;
  requestId?: string;
  email?: string | null;
  ipHash?: string | null;
}) {
  if (params.email) {
    COMMENT_REPORT_BLOCKLIST.set(getCommentBlockKey(params.siteId, 'email', params.email), {
      type: 'email',
      value: normalizeIdentifier(params.email),
      reason: params.reason,
      actor: params.actor,
      requestId: params.requestId,
      createdAt: new Date().toISOString(),
    });
  }

  if (params.ipHash) {
    COMMENT_REPORT_BLOCKLIST.set(getCommentBlockKey(params.siteId, 'ip', params.ipHash), {
      type: 'ip',
      value: normalizeIdentifier(params.ipHash),
      reason: params.reason,
      actor: params.actor,
      requestId: params.requestId,
      createdAt: new Date().toISOString(),
    });
  }
}

export function getCommentReportReasons(): CommentReportReason[] {
  return [...COMMENT_REPORT_REASONS];
}

function normalizeCommentSearch(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

export function reportComment(params: {
  commentId: string;
  siteId: string;
  reason?: string | null;
  actor?: string;
  requestId?: string;
}): Comment | undefined {
  const comment = commentStore.find(
    (item) => item.id === params.commentId && item.siteId === params.siteId,
  );

  if (!comment) {
    return undefined;
  }

  const normalizedReason = normalizeReportReason(params.reason || null);
  const reportCount = (comment.reportCount || 0) + 1;
  const reportReasons = new Set(comment.reportReasons || []);
  if (normalizedReason) {
    reportReasons.add(normalizedReason);
  }

  comment.reportCount = reportCount;
  comment.reportReasons = Array.from(reportReasons);
  comment.reviewedBy = params.actor || null;
  comment.reviewedAt = new Date().toISOString();
  comment.updatedAt = comment.reviewedAt;

  if (reportCount >= 3 && comment.status === 'approved') {
    comment.status = 'spam';
  }

  commentStore = commentStore.map((item) => (item.id === comment.id ? comment : item));

  trackWebhookEvent({
    kind: 'comment-reported',
    siteId: params.siteId,
    commentId: comment.id,
    target: `comment:${comment.id}`,
    status: 'succeeded',
    requestId: params.requestId,
    reason: normalizedReason || 'other',
    actor: params.actor,
    metadata: {
      authorName: comment.authorName,
      targetType: comment.targetType,
      targetId: comment.targetId,
      reportCount: comment.reportCount,
      reportReasons: comment.reportReasons,
    },
  });

  return clone(comment);
}

export function bulkUpdateCommentStatus(params: {
  siteId: string;
  commentIds: string[];
  status: Comment['status'];
  reviewedBy?: string | null;
  rejectionReason?: string | null;
  blockReason?: string | null;
  actor?: string | null;
  requestId?: string;
}): { updated: Comment[]; missingIds: string[] } {
  const ids = Array.from(new Set(params.commentIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) {
    return { updated: [], missingIds: [] };
  }

  const missingIds = new Set(ids);
  const reviewer = params.actor || params.reviewedBy || 'admin';
  const normalizedBlockReason = normalizeReportReason(params.blockReason || null);
  const updated: Comment[] = [];

  commentStore = commentStore.map((comment) => {
    if (comment.siteId !== params.siteId || !ids.includes(comment.id)) {
      return comment;
    }

    missingIds.delete(comment.id);
    comment.status = params.status;
    comment.reviewedBy = reviewer;
    comment.reviewedAt = new Date().toISOString();
    comment.updatedAt = comment.reviewedAt;
    const resolvedRequestId = params.requestId || comment.requestId || undefined;

    if (params.status === 'blocked') {
      comment.blockReason = normalizedBlockReason || 'manual-block';
      comment.blockedBy = reviewer;
      comment.blockedAt = comment.reviewedAt;
      comment.rejectionReason = params.rejectionReason ?? null;

      blockCommentIdentity({
        siteId: params.siteId,
        reason: comment.blockReason || 'manual-block',
        actor: reviewer,
        requestId: resolvedRequestId,
        email: comment.authorEmail,
        ipHash: comment.ipHash,
      });
    } else if (params.status !== 'rejected' && params.status !== 'spam') {
      comment.blockReason = null;
      comment.blockedBy = null;
      comment.blockedAt = null;
      comment.rejectionReason = null;
    } else if (params.status === 'rejected' || params.status === 'spam') {
      comment.rejectionReason = params.rejectionReason ?? null;
    }

    updated.push(comment);
    trackWebhookEvent({
      kind: 'comment-status',
      siteId: params.siteId,
      commentId: comment.id,
      target: `comment:${comment.id}`,
      status: 'succeeded',
      requestId: resolvedRequestId,
      reason: params.status,
      actor: reviewer,
      metadata: {
        targetType: comment.targetType,
        targetId: comment.targetId,
        status: params.status,
        blockReason: comment.blockReason,
      },
    });

    return comment;
  });

  return {
    updated: clone(updated),
    missingIds: Array.from(missingIds),
  };
}

export function createFormSubmission(record: {
  siteId: string;
  formId: string;
  values: Record<string, unknown>;
  pageId?: string | null;
  postId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  requestId?: string;
  status?: FormSubmission['status'];
  reviewedBy?: string | null;
  adminNotes?: string | null;
}): FormSubmission {
  const submission: FormSubmission = {
    id: `submission-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    siteId: record.siteId,
    formId: record.formId,
    pageId: record.pageId ?? null,
    postId: record.postId ?? null,
    values: record.values,
    ipHash: record.ipHash,
    userAgent: record.userAgent,
    requestId: record.requestId,
    status: record.status || 'pending',
    reviewedBy: record.reviewedBy || null,
    reviewedAt: record.status && record.status !== 'pending' ? new Date().toISOString() : null,
    adminNotes: record.adminNotes || null,
    submittedAt: new Date().toISOString(),
  };

  formSubmissions = [submission, ...formSubmissions];
  return clone(submission);
}

export function listFormSubmissions(
  formId: string,
  params: { status?: FormSubmission['status']; requestId?: string; limit?: number; offset?: number } = {},
): { data: FormSubmission[]; pagination: Pagination } {
  const { status, requestId, limit = 20, offset = 0 } = params;

  const records = formSubmissions
    .filter((submission) => submission.formId === formId)
    .filter((submission) => (status ? submission.status === status : true))
    .filter((submission) => (requestId ? submission.requestId === requestId : true));

  const paginated = records.slice(offset, offset + limit);

  return {
    data: clone(paginated),
    pagination: getPagination(records.length, limit, offset),
  };
}

export function listFormContacts(
  formId: string,
  params: { status?: Contact['status']; requestId?: string; limit?: number; offset?: number } = {},
): { contacts: Contact[]; count: number; pagination: Pagination } {
  const { status, requestId, limit = 20, offset = 0 } = params;
  const records = contactStore
    .filter((contact) => contact.formId === formId)
    .filter((contact) => (status ? contact.status === status : true))
    .filter((contact) => (requestId ? contact.requestId === requestId : true));

  const paginated = records.slice(offset, offset + limit);

  return {
    contacts: clone(paginated),
    count: records.length,
    pagination: getPagination(records.length, limit, offset),
  };
}

export function getContactById(contactId: string): Contact | undefined {
  const contact = contactStore.find((item) => item.id === contactId);
  return contact ? clone(contact) : undefined;
}

export function getSubmissionById(submissionId: string): FormSubmission | undefined {
  const submission = formSubmissions.find((item) => item.id === submissionId);
  return submission ? clone(submission) : undefined;
}

export function updateFormSubmissionStatus(
  submissionId: string,
  updates: {
    status: FormSubmission['status'];
    reviewedBy?: string | null;
    adminNotes?: string | null;
  },
): FormSubmission | undefined {
  const submission = formSubmissions.find((item) => item.id === submissionId);
  if (!submission) return undefined;

  submission.status = updates.status;
  submission.reviewedBy = updates.reviewedBy ?? null;
  submission.adminNotes = updates.adminNotes ?? null;
  submission.reviewedAt = new Date().toISOString();
  submission.updatedAt = submission.reviewedAt;

  formSubmissions = formSubmissions.map((item) => (item.id === submission.id ? submission : item));
  return clone(submission);
}

export function updateContactStatus(
  contactId: string,
  updates: {
    status: Contact['status'];
  },
): Contact | undefined {
  const contact = contactStore.find((item) => item.id === contactId);
  if (!contact) return undefined;

  contact.status = updates.status;
  contact.updatedAt = new Date().toISOString();

  contactStore = contactStore.map((item) => (item.id === contact.id ? contact : item));
  return clone(contact);
}

function normalizeCommentStatus(status?: string): 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked' | 'all' {
  if (status === 'pending' || status === 'approved' || status === 'rejected' || status === 'spam' || status === 'blocked' || status === 'all') {
    return status;
  }

  return 'all';
}

export function listComments(
  siteId: string,
  params: {
    targetType?: CommentTargetType | 'all';
    targetId?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked' | 'all';
    requestId?: string;
    q?: string;
    parentOnly?: boolean;
    parentId?: string | null;
    sort?: 'newest' | 'oldest';
    limit?: number;
    offset?: number;
  } = {},
): { comments: Comment[]; count: number; pagination: Pagination } {
  const {
    targetType,
    targetId,
    status: rawStatus,
    requestId,
    q,
    parentOnly = false,
    parentId,
    sort = 'newest',
    limit = 20,
    offset = 0,
  } = params;

  const status = normalizeCommentStatus(rawStatus);
  const normalizedRequestId = requestId ? requestId.trim() : '';
  const normalizedQuery = normalizeCommentSearch(q || '');
  const normalizedParentId = typeof parentId === 'string' && parentId.length > 0 ? parentId : null;

  let filtered = commentStore.filter((comment) => comment.siteId === siteId);

  if (targetType && targetType !== 'all') {
    filtered = filtered.filter((comment) => comment.targetType === targetType);
  }

  if (targetId) {
    filtered = filtered.filter((comment) => comment.targetId === targetId);
  }

  if (normalizedRequestId) {
    filtered = filtered.filter((comment) => comment.requestId === normalizedRequestId);
  }

  if (normalizedQuery) {
    filtered = filtered.filter((comment) => {
      const haystack = [
        comment.content,
        comment.authorName,
        comment.authorEmail,
        comment.authorWebsite,
      ]
        .filter(Boolean)
        .map((value) => (value || '').toLowerCase())
        .join(' ');
      return haystack.includes(normalizedQuery);
    });
  }

  if (status !== 'all') {
    filtered = filtered.filter((comment) => comment.status === status);
  }

  if (parentOnly) {
    filtered = filtered.filter((comment) =>
      normalizedParentId ? comment.parentId === normalizedParentId : comment.parentId == null,
    );
  }

  const sorted = [...filtered].sort((a, b) =>
    sort === 'oldest'
      ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const paginated = sorted.slice(offset, offset + limit);

  return {
    comments: clone(paginated),
    count: filtered.length,
    pagination: getPagination(filtered.length, limit, offset),
  };
}

export function getCommentsByTarget(
  siteId: string,
  params: {
    targetType: CommentTargetType;
    targetId: string;
    status?: 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked' | 'all';
    limit?: number;
    offset?: number;
  },
): { comments: Comment[]; count: number; pagination: Pagination } {
  return listComments(siteId, {
    ...params,
    status: params.status || 'approved',
    sort: 'newest',
  });
}

export function getCommentById(commentId: string): Comment | undefined {
  const comment = commentStore.find((item) => item.id === commentId);
  return comment ? clone(comment) : undefined;
}

export function updateCommentStatus(
  commentId: string,
  updates: {
    status: Comment['status'];
    reviewedBy?: string | null;
    rejectionReason?: string | null;
    blockReason?: string | null;
    actor?: string | null;
    requestId?: string;
  },
): Comment | undefined {
  const comment = commentStore.find((item) => item.id === commentId);
  if (!comment) return undefined;

  const resolvedRequestId = updates.requestId || comment.requestId || undefined;
  comment.status = updates.status;
  comment.reviewedBy = updates.reviewedBy ?? updates.actor ?? null;
  comment.rejectionReason = updates.rejectionReason ?? null;
  comment.reviewedAt = new Date().toISOString();
  comment.updatedAt = comment.reviewedAt;

  if (updates.status === 'blocked') {
    comment.blockReason = updates.blockReason
      ? normalizeReportReason(updates.blockReason) || updates.blockReason
      : 'manual-block';
    comment.blockedBy = comment.reviewedBy;
    comment.blockedAt = comment.reviewedAt;

    blockCommentIdentity({
      siteId: comment.siteId,
      reason: comment.blockReason || 'manual-block',
      actor: comment.reviewedBy || undefined,
      requestId: resolvedRequestId,
      email: comment.authorEmail,
      ipHash: comment.ipHash,
    });
  } else if (updates.status !== 'rejected' && updates.status !== 'spam') {
    comment.blockReason = null;
    comment.blockedBy = null;
    comment.blockedAt = null;
  }

  trackWebhookEvent({
    kind: 'comment-status',
    siteId: comment.siteId,
    commentId: comment.id,
    target: `comment:${comment.id}`,
    status: 'succeeded',
    requestId: resolvedRequestId,
    reason: updates.status,
    actor: comment.reviewedBy || undefined,
    metadata: {
      targetType: comment.targetType,
      targetId: comment.targetId,
      status: updates.status,
    },
  });

  commentStore = commentStore.map((item) => (item.id === comment.id ? comment : item));
  return clone(comment);
}

export function listCommentReplies(siteId: string, params: {
  targetType: CommentTargetType;
  targetId: string;
  parentId: string;
}): Comment[] {
  const replies = commentStore.filter(
    (comment) =>
      comment.siteId === siteId &&
      comment.targetType === params.targetType &&
      comment.targetId === params.targetId &&
      comment.parentId === params.parentId,
  );
  return clone(replies);
}

export function createComment(params: {
  siteId: string;
  targetType: CommentTargetType;
  targetId: string;
  content: string;
  authorName?: string;
  authorEmail?: string;
  authorWebsite?: string;
  userId?: string | null;
  status?: Comment['status'];
  parentId?: string | null;
  requestId?: string;
  ipHash?: string | null;
}): Comment {
  const comment: Comment = {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    siteId: params.siteId,
    targetType: params.targetType,
    targetId: params.targetId,
    authorName: params.authorName || null,
    authorEmail: params.authorEmail || null,
    authorWebsite: params.authorWebsite || null,
    userId: params.userId || null,
    content: params.content,
    status: params.status || 'pending',
    parentId: params.parentId ?? null,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    blockReason: null,
    blockedBy: null,
    blockedAt: null,
    reportCount: 0,
    reportReasons: [],
    requestId: params.requestId || null,
    ipHash: params.ipHash || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  commentStore = [comment, ...commentStore];
  trackWebhookEvent({
    kind: 'comment-submitted',
    siteId: comment.siteId,
    commentId: comment.id,
    target: `comment:${comment.id}`,
    status: 'succeeded',
    requestId: comment.requestId || undefined,
    reason: comment.status,
    metadata: {
      targetType: comment.targetType,
      targetId: comment.targetId,
      status: comment.status,
      parentId: comment.parentId,
      hasAuthorEmail: Boolean(comment.authorEmail),
      hasAuthorWebsite: Boolean(comment.authorWebsite),
    },
  });

  return clone(comment);
}

export function getCanonicalPathForPage(page: StorePage | null): string {
  if (!page) {
    return '/';
  }

  if (page.isHomepage || page.slug === 'index') {
    return '/';
  }

  return `/${page.slug}`;
}

export function getMediaById(siteId: string, id: string): MediaItem | undefined {
  const item = MEDIA_LIBRARY.find((media) => media.siteId === siteId && media.id === id);
  return item ? clone(item) : undefined;
}

export { type Pagination, type StoreBlogPost, type StorePage, type StoreSite };

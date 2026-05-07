import { DEFAULT_THEME } from '@backy-cms/core';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  Comment,
  CommentTargetType,
  FormFieldDefinition,
  FormDefinition,
  FormSubmission,
  MediaFolder,
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
  visible?: boolean;
  locked?: boolean;
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

interface SiteNavigationItem {
  id: string;
  type: 'page';
  pageId: string;
  label: string;
  title: string;
  slug: string;
  path: string;
  status: StorePage['status'];
  isHomepage: boolean;
  children: SiteNavigationItem[];
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

interface StoreBlogCategory {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  postCount?: number;
}

interface StoreBlogTag {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  postCount?: number;
}

interface ContentRevision {
  id: string;
  siteId: string;
  targetType: 'page' | 'post';
  targetId: string;
  snapshot: StorePage | StoreBlogPost;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface PreviewToken {
  token: string;
  siteId: string;
  targetType: 'page' | 'post';
  targetId: string;
  createdAt: string;
  expiresAt: string;
  createdBy: string | null;
}

interface StoreUser {
  id: string;
  fullName: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'active' | 'inactive' | 'invited';
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
  invitedAt: string | null;
}

interface StoreBlogAuthor {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  role: StoreUser['role'] | 'contributor';
  status: StoreUser['status'] | 'external';
  postCount: number;
}

interface StoreSettings {
  deliveryMode: 'managed-hosting' | 'custom-frontend';
  apiKeys: {
    publicApiKey: string;
    adminApiKey: string;
  };
  updatedAt: string;
}

type CollectionFieldType =
  | 'text'
  | 'richText'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'image'
  | 'video'
  | 'file'
  | 'reference'
  | 'multiReference'
  | 'url'
  | 'email'
  | 'phone'
  | 'slug'
  | 'json';

interface StoreCollectionField {
  id: string;
  key: string;
  label: string;
  type: CollectionFieldType;
  required: boolean;
  unique: boolean;
  sortOrder: number;
  helpText: string | null;
  options?: string[];
  referenceCollectionId?: string | null;
  defaultValue?: unknown;
}

interface StoreCollectionPermissions {
  publicRead: boolean;
  publicCreate: boolean;
  publicUpdate: boolean;
  publicDelete: boolean;
}

interface StoreCollection {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
  fields: StoreCollectionField[];
  permissions: StoreCollectionPermissions;
  createdAt: string;
  updatedAt: string;
}

interface StoreCollectionRecord {
  id: string;
  siteId: string;
  collectionId: string;
  slug: string;
  status: 'draft' | 'published' | 'scheduled' | 'archived';
  values: Record<string, unknown>;
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

const USER_LIST: StoreUser[] = [
  {
    id: 'user-admin',
    fullName: 'Admin User',
    email: 'admin@backy.io',
    role: 'admin',
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
    lastActiveAt: nowIso,
    invitedAt: null,
  },
  {
    id: 'user-editor',
    fullName: 'Jane Editor',
    email: 'jane@backy.io',
    role: 'editor',
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
    lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    invitedAt: null,
  },
];

const createRuntimeApiKey = (kind: 'public' | 'admin') => (
  `${kind === 'public' ? 'pk' : 'sk'}_live_${randomUUID().replace(/-/g, '').slice(0, 24)}`
);

let SETTINGS: StoreSettings = {
  deliveryMode: 'managed-hosting',
  apiKeys: {
    publicApiKey: createRuntimeApiKey('public'),
    adminApiKey: createRuntimeApiKey('admin'),
  },
  updatedAt: nowIso,
};

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
    authorId: 'user-editor',
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
    authorId: 'user-editor',
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

const BLOG_CATEGORIES: StoreBlogCategory[] = [
  {
    id: 'cat-news',
    siteId: 'site-demo',
    name: 'News',
    slug: 'news',
    description: 'Product news and release notes.',
    color: '#2563eb',
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'cat-engineering',
    siteId: 'site-demo',
    name: 'Engineering',
    slug: 'engineering',
    description: 'Technical notes about Backy CMS architecture.',
    color: '#059669',
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const BLOG_TAGS: StoreBlogTag[] = [
  {
    id: 'tag-getting-started',
    siteId: 'site-demo',
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Beginner-friendly onboarding content.',
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'tag-editor',
    siteId: 'site-demo',
    name: 'Editor',
    slug: 'editor',
    description: 'Visual editor and rendering parity.',
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const COLLECTIONS: StoreCollection[] = [
  {
    id: 'collection-team',
    siteId: 'site-demo',
    name: 'Team Members',
    slug: 'team',
    description: 'Demo collection for dynamic team profile pages.',
    status: 'published',
    fields: [
      {
        id: 'field-team-name',
        key: 'name',
        label: 'Name',
        type: 'text',
        required: true,
        unique: false,
        sortOrder: 10,
        helpText: null,
      },
      {
        id: 'field-team-role',
        key: 'role',
        label: 'Role',
        type: 'text',
        required: true,
        unique: false,
        sortOrder: 20,
        helpText: null,
      },
      {
        id: 'field-team-bio',
        key: 'bio',
        label: 'Bio',
        type: 'richText',
        required: false,
        unique: false,
        sortOrder: 30,
        helpText: null,
      },
      {
        id: 'field-team-photo',
        key: 'photo',
        label: 'Photo',
        type: 'image',
        required: false,
        unique: false,
        sortOrder: 40,
        helpText: null,
      },
    ],
    permissions: {
      publicRead: true,
      publicCreate: false,
      publicUpdate: false,
      publicDelete: false,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const COLLECTION_RECORDS: StoreCollectionRecord[] = [
  {
    id: 'record-team-ada',
    siteId: 'site-demo',
    collectionId: 'collection-team',
    slug: 'ada-lovelace',
    status: 'published',
    values: {
      name: 'Ada Lovelace',
      role: 'Systems Architect',
      bio: 'Leads the collection-backed rendering model for Backy demos.',
      photo: 'media-demo-hero',
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    publishedAt: nowIso,
    scheduledAt: null,
  },
];

const CONTENT_REVISIONS: ContentRevision[] = [];
const PREVIEW_TOKENS: PreviewToken[] = [];

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
    folderId: 'folder-demo-pages',
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
    folderId: 'folder-demo-brand',
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
    folderId: 'folder-demo-pages',
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

const MEDIA_FOLDERS: MediaFolder[] = [
  {
    id: 'folder-demo-brand',
    siteId: 'site-demo',
    parentId: null,
    name: 'Brand assets',
    sortOrder: 10,
    createdAt: nowIso,
  },
  {
    id: 'folder-demo-pages',
    siteId: 'site-demo',
    parentId: null,
    name: 'Page imagery',
    sortOrder: 20,
    createdAt: nowIso,
  },
];

const MEDIA_CATALOG_PATH = join(process.cwd(), 'data', 'backy', 'media-library.json');
const ADMIN_CONTENT_PATH = join(process.cwd(), 'data', 'backy', 'admin-content.json');
let persistedMediaLoaded = false;
let persistedAdminContentLoaded = false;

interface AdminContentSnapshot {
  sites?: StoreSite[];
  pages?: StorePage[];
  blogPosts?: StoreBlogPost[];
  blogCategories?: StoreBlogCategory[];
  blogTags?: StoreBlogTag[];
  collections?: StoreCollection[];
  collectionRecords?: StoreCollectionRecord[];
  users?: StoreUser[];
  settings?: StoreSettings;
  revisions?: ContentRevision[];
  previewTokens?: PreviewToken[];
}

interface MediaCatalogSnapshot {
  media?: MediaItem[];
  folders?: MediaFolder[];
}

function ensurePersistedMediaLoaded() {
  if (persistedMediaLoaded) {
    return;
  }

  persistedMediaLoaded = true;

  if (!existsSync(MEDIA_CATALOG_PATH)) {
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(MEDIA_CATALOG_PATH, 'utf8')) as unknown;
    const parsedMedia = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as MediaCatalogSnapshot).media)
        ? (parsed as MediaCatalogSnapshot).media || []
        : [];
    const parsedFolders = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && Array.isArray((parsed as MediaCatalogSnapshot).folders)
      ? (parsed as MediaCatalogSnapshot).folders || []
      : [];

    if (parsedMedia.length === 0 && parsedFolders.length === 0) {
      return;
    }

    for (const item of parsedMedia) {
      if (!item || typeof item !== 'object' || !('id' in item)) {
        continue;
      }

      const media = item as MediaItem;
      if (!MEDIA_LIBRARY.some((existing) => existing.id === media.id)) {
        MEDIA_LIBRARY.unshift(media);
      }
    }

    for (const item of parsedFolders) {
      if (!item || typeof item !== 'object' || !('id' in item)) {
        continue;
      }

      const folder = item as MediaFolder;
      if (!MEDIA_FOLDERS.some((existing) => existing.id === folder.id)) {
        MEDIA_FOLDERS.unshift(folder);
      }
    }
  } catch (error) {
    console.error('Unable to load persisted media catalog:', error);
  }
}

function persistRuntimeMediaCatalog() {
  try {
    mkdirSync(dirname(MEDIA_CATALOG_PATH), { recursive: true });
    const runtimeItems = MEDIA_LIBRARY.filter((item) => item.id.startsWith('media_'));
    const runtimeFolders = MEDIA_FOLDERS.filter((item) => item.id.startsWith('folder_'));
    writeFileSync(MEDIA_CATALOG_PATH, JSON.stringify({ media: runtimeItems, folders: runtimeFolders }, null, 2));
  } catch (error) {
    console.error('Unable to persist media catalog:', error);
  }
}

function ensurePersistedAdminContentLoaded() {
  if (persistedAdminContentLoaded) {
    refreshPersistedAdminContent();
    return;
  }

  persistedAdminContentLoaded = true;
  refreshPersistedAdminContent();
}

function refreshPersistedAdminContent() {
  if (!existsSync(ADMIN_CONTENT_PATH)) {
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(ADMIN_CONTENT_PATH, 'utf8')) as AdminContentSnapshot;

    if (Array.isArray(parsed.sites)) {
      SITE_LIST.splice(0, SITE_LIST.length, ...parsed.sites);
    }

    if (Array.isArray(parsed.pages)) {
      PAGE_LIST.splice(0, PAGE_LIST.length, ...parsed.pages);
    }

    if (Array.isArray(parsed.blogPosts)) {
      BLOG_POSTS.splice(0, BLOG_POSTS.length, ...parsed.blogPosts);
    }

    if (Array.isArray(parsed.blogCategories)) {
      BLOG_CATEGORIES.splice(0, BLOG_CATEGORIES.length, ...parsed.blogCategories);
    }

    if (Array.isArray(parsed.blogTags)) {
      BLOG_TAGS.splice(0, BLOG_TAGS.length, ...parsed.blogTags);
    }

    if (Array.isArray(parsed.collections)) {
      COLLECTIONS.splice(0, COLLECTIONS.length, ...parsed.collections);
    }

    if (Array.isArray(parsed.collectionRecords)) {
      COLLECTION_RECORDS.splice(0, COLLECTION_RECORDS.length, ...parsed.collectionRecords);
    }

    if (Array.isArray(parsed.users)) {
      USER_LIST.splice(0, USER_LIST.length, ...parsed.users);
    }

    if (parsed.settings && typeof parsed.settings === 'object') {
      SETTINGS = {
        ...SETTINGS,
        ...parsed.settings,
        apiKeys: {
          ...SETTINGS.apiKeys,
          ...(parsed.settings.apiKeys || {}),
        },
      };
    }

    if (Array.isArray(parsed.revisions)) {
      CONTENT_REVISIONS.splice(0, CONTENT_REVISIONS.length, ...parsed.revisions);
    }

    if (Array.isArray(parsed.previewTokens)) {
      PREVIEW_TOKENS.splice(0, PREVIEW_TOKENS.length, ...parsed.previewTokens);
    }
  } catch (error) {
    console.error('Unable to load persisted admin content:', error);
  }
}

function persistAdminContent() {
  try {
    mkdirSync(dirname(ADMIN_CONTENT_PATH), { recursive: true });
    writeFileSync(
      ADMIN_CONTENT_PATH,
      JSON.stringify(
        {
          sites: SITE_LIST,
          pages: PAGE_LIST,
          blogPosts: BLOG_POSTS,
          blogCategories: BLOG_CATEGORIES,
          blogTags: BLOG_TAGS,
          collections: COLLECTIONS,
          collectionRecords: COLLECTION_RECORDS,
          users: USER_LIST,
          settings: SETTINGS,
          revisions: CONTENT_REVISIONS,
          previewTokens: PREVIEW_TOKENS,
        } satisfies AdminContentSnapshot,
        null,
        2,
      ),
    );
  } catch (error) {
    console.error('Unable to persist admin content:', error);
  }
}

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

function isPublished(
  status?: StorePage['status'] | StoreBlogPost['status'] | StoreCollectionRecord['status'],
  scheduledAt?: string | null,
): boolean {
  if (status === 'published') {
    return true;
  }

  if (status !== 'scheduled' || !scheduledAt) {
    return false;
  }

  const scheduledTime = Date.parse(scheduledAt);
  return Number.isFinite(scheduledTime) && scheduledTime <= Date.now();
}

function defaultNoIndexForStatus(status: StorePage['status'] | StoreBlogPost['status']): boolean {
  return status !== 'published' && status !== 'scheduled';
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

function normalizeReportReason(raw: string | null | undefined): CommentReportReason | null {
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

function normalizeFormElementType(value: string): string {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
    : '';

  if (!normalized) {
    return '';
  }

  if (
    normalized === 'dropdown'
    || normalized === 'dropdownselector'
    || normalized === 'dropdownselect'
    || normalized.includes('dropdow')
  ) {
    return 'select';
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
    normalized === 'textinput'
    || normalized === 'textinputfield'
    || normalized === 'textfield'
    || normalized === 'textareafield'
    || normalized === 'inputfield'
    || normalized.includes('textinput')
    || normalized.includes('textfield')
  ) {
    return 'input';
  }

  if (
    normalized === 'radioinput'
    || normalized === 'radio'
    || normalized === 'radioinputfield'
    || normalized === 'radiofield'
    || normalized.includes('radioinput')
    || normalized.includes('radiobutton')
  ) {
    return 'radio';
  }

  if (
    normalized === 'checkboxinput'
    || normalized === 'checkbox'
    || normalized === 'checkboxinputfield'
    || normalized === 'checkboxfield'
    || normalized === 'checkboxes'
    || normalized.includes('checkboxinput')
    || normalized.includes('checkboxbutton')
  ) {
    return 'checkbox';
  }

  return normalized.includes('select') ? 'select' : normalized;
}

function getFormFieldType(
  node: CanvasElement,
): FormFieldDefinition['type'] {
  const normalizedType = normalizeFormElementType(node.type);

  if (normalizedType === 'textarea') {
    return 'textarea';
  }

  if (normalizedType === 'select') {
    return 'select';
  }

  if (normalizedType === 'checkbox') {
    return 'checkbox';
  }

  if (normalizedType === 'radio') {
    return 'radio';
  }

  const raw = sanitizeString(node.props.inputType || node.props.type || normalizedType).toLowerCase();
  if (raw === 'email') return 'email';
  if (raw === 'number') return 'number';
  if (raw === 'date') return 'date';
  if (raw === 'tel') return 'tel';
  if (raw === 'url') return 'url';
  if (raw === 'file') return 'file';
  if (raw === 'password' || raw === 'text' || raw === 'search' || raw === 'hidden') {
    return 'text';
  }

  return 'text';
}

function ensureUniqueFieldKey(base: string, usedKeys: Set<string>): string {
  const raw = sanitizeString(base) || `field_${usedKeys.size + 1}`;
  const normalized = raw
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const safeBase = normalized.length > 0 ? normalized : `field_${usedKeys.size + 1}`;
  let key = safeBase;
  let suffix = 1;

  while (usedKeys.has(key)) {
    suffix += 1;
    key = `${safeBase}_${suffix}`;
  }

  usedKeys.add(key);
  return key;
}

function parseNumberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const normalized = sanitizeString(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFieldOptions(rawOptions: unknown): string[] {
  if (!rawOptions) {
    return [];
  }

  if (Array.isArray(rawOptions)) {
    return rawOptions
      .map((option) => {
        if (typeof option === 'string') {
          return option.trim();
        }

        if (option && typeof option === 'object' && 'value' in option) {
          return sanitizeString((option as { value?: unknown }).value).trim();
        }

        if (option && typeof option === 'object' && 'label' in option) {
          return sanitizeString((option as { label?: unknown }).label).trim();
        }

        return '';
      })
      .filter((option) => option.length > 0);
  }

  if (typeof rawOptions === 'string') {
    return rawOptions
      .split(/[\n,]/)
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
  }

  return [];
}

function parseOptionValue(value: unknown): string {
  return sanitizeString(value).toLowerCase();
}

function normalizeFieldOptions(rawOptions: unknown): string[] {
  return parseFieldOptions(rawOptions)
    .map(parseOptionValue)
    .filter(Boolean);
}

function parseSubmissionValues(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseSubmissionValues(entry)).filter(Boolean);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return [`${value}`];
  }

  if (typeof value === 'boolean') {
    return [value ? 'on' : 'off'];
  }

  return sanitizeString(value).split(',').map((entry) => entry.trim()).filter(Boolean);
}

function buildDynamicValidationRules(
  fieldType: FormFieldDefinition['type'],
  props: Record<string, unknown>,
): FormFieldDefinition['validation'] {
  const rules: NonNullable<FormFieldDefinition['validation']> = [];
  const minLength = parseNumberValue(props.minLength);
  const maxLength = parseNumberValue(props.maxLength);
  const minValue = parseNumberValue(props.min);
  const maxValue = parseNumberValue(props.max);
  const pattern = sanitizeString(props.pattern);

  if (typeof minLength === 'number' && fieldType !== 'checkbox') {
    rules.push({
      type: 'minLength',
      value: minLength,
      message: `${fieldType} should be at least ${minLength} characters`,
    });
  }

  if (typeof maxLength === 'number' && fieldType !== 'checkbox') {
    rules.push({
      type: 'maxLength',
      value: maxLength,
      message: `${fieldType} should be no more than ${maxLength} characters`,
    });
  }

  if (typeof minValue === 'number') {
    rules.push({
      type: 'min',
      value: minValue,
      message: `${fieldType} should be at least ${minValue}`,
    });
  }

  if (typeof maxValue === 'number') {
    rules.push({
      type: 'max',
      value: maxValue,
      message: `${fieldType} should be no more than ${maxValue}`,
    });
  }

  if (pattern.length > 0) {
    rules.push({
      type: 'pattern',
      value: pattern,
      message: `${fieldType} format is invalid`,
    });
  }

  return rules.length > 0 ? rules : undefined;
}

function buildDynamicFieldFromElement(
  node: CanvasElement,
  usedKeys: Set<string>,
  index: number,
): FormFieldDefinition | null {
  const fieldType = getFormFieldType(node);
  const labelCandidate = sanitizeString(node.props.label);
  const nameCandidate = sanitizeString(node.props.name);
  const keyCandidate = sanitizeString(node.props.key);
  const fallback = sanitizeString(node.props.fieldKey);
  const requestedKey = [
    nameCandidate,
    keyCandidate,
    fallback,
    `${normalizeFormElementType(node.type)}_${index}`,
  ]
    .find((value) => value.length > 0) || `field_${index}`;

  const key = ensureUniqueFieldKey(requestedKey, usedKeys);

  return {
    key,
    label: labelCandidate.length > 0 ? labelCandidate : key,
    type: fieldType,
    required: node.props.required === true
      || sanitizeString(node.props.required).toLowerCase() === 'true'
      || sanitizeString(node.props.required).toLowerCase() === 'required',
    placeholder: sanitizeString(node.props.placeholder),
    helpText: sanitizeString(node.props.helpText),
    defaultValue: node.props.defaultValue !== undefined
      ? sanitizeString(node.props.defaultValue)
      : sanitizeString(node.props.value),
    options: ['select', 'checkbox', 'radio'].includes(fieldType)
      ? parseFieldOptions(node.props.options)
      : undefined,
    validation: buildDynamicValidationRules(fieldType, node.props),
  };
}

function collectFormFieldsFromChildren(nodes: CanvasElement[], usedKeys: Set<string>): FormFieldDefinition[] {
  const fields: FormFieldDefinition[] = [];

  const visit = (items: CanvasElement[]) => {
    items.forEach((node, index) => {
      const normalizedType = normalizeFormElementType(node.type);
      if (['input', 'textarea', 'select', 'checkbox', 'radio'].includes(normalizedType)) {
        const field = buildDynamicFieldFromElement(node, usedKeys, fields.length + index + 1);
        if (field) {
          fields.push(field);
        }
      }

      if (node.children && node.children.length > 0) {
        visit(node.children);
      }
    });
  };

  visit(nodes);
  return fields;
}

function buildFormDefinitionFromCanvas(
  formElement: CanvasElement,
  context: {
    siteId: string;
    pageId?: string;
    postId?: string;
  },
): FormDefinition | null {
  const props = formElement.props as Record<string, unknown>;
  const fields = collectFormFieldsFromChildren(formElement.children || [], new Set<string>());
  const resolvedFormId = sanitizeString(props.formId).length > 0 ? sanitizeString(props.formId) : formElement.id;
  if (!resolvedFormId.length) {
    return null;
  }

  const moderationMode = sanitizeString(props.moderationMode) === 'auto-approve'
    ? 'auto-approve'
    : 'manual';

  const enabledContactShare = props.contactShareEnabled === true
    || sanitizeString(props.contactShareEnabled).toLowerCase() === 'true';

  return {
    id: resolvedFormId,
    siteId: context.siteId,
    pageId: context.pageId || null,
    postId: context.postId || null,
    name: sanitizeString(props.formName).length > 0 ? sanitizeString(props.formName) : resolvedFormId,
    title: sanitizeString(props.formTitle) || `Form ${resolvedFormId}`,
    description: sanitizeString(props.formDescription),
    audience: 'public',
    isActive: props.formActive !== false && sanitizeString(props.formActive).toLowerCase() !== 'false',
    fields,
    notificationEmail: sanitizeString(props.notificationEmail),
    successRedirectUrl: sanitizeString(props.successRedirectUrl || props.redirectUrl),
    successMessage: sanitizeString(props.successMessage),
    enableHoneypot: props.enableHoneypot === true
      ? true
      : props.enableHoneypot === false
        ? false
        : sanitizeString(props.enableHoneypot).toLowerCase() === 'true'
        ? true
        : undefined,
    enableCaptcha: props.enableCaptcha === true
      ? true
      : props.enableCaptcha === false
        ? false
        : sanitizeString(props.enableCaptcha).toLowerCase() === 'true'
          ? true
          : undefined,
    moderationMode,
    contactShare: enabledContactShare
      ? {
          enabled: true,
          nameField: sanitizeString(props.contactShareNameField),
          emailField: sanitizeString(props.contactShareEmailField),
          phoneField: sanitizeString(props.contactSharePhoneField),
          notesField: sanitizeString(props.contactShareNotesField),
          dedupeByEmail: props.contactShareDedupeByEmail !== false && sanitizeString(props.contactShareDedupeByEmail).toLowerCase() !== 'false',
        }
      : undefined,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function listCanvasFormsFromContent(
  nodes: CanvasElement[],
  siteId: string,
  context: { pageId?: string; postId?: string },
): FormDefinition[] {
  const forms: FormDefinition[] = [];

  const walk = (items: CanvasElement[]) => {
    items.forEach((item) => {
      if (normalizeFormElementType(item.type) === 'form') {
        const form = buildFormDefinitionFromCanvas(item, {
          siteId,
          pageId: context.pageId,
          postId: context.postId,
        });

        if (form) {
          forms.push(form);
        }
      }

      if (item.children && item.children.length > 0) {
        walk(item.children);
      }
    });
  };

  walk(nodes);
  return forms;
}

function getDynamicFormsBySite(siteId: string): FormDefinition[] {
  const pages = PAGE_LIST.filter((page) => page.siteId === siteId);
  const blogPosts = BLOG_POSTS.filter((post) => post.siteId === siteId);

  const pageForms = pages.flatMap((page) => {
    const elements = page.content?.elements || [];
    return listCanvasFormsFromContent(elements, siteId, { pageId: page.id });
  });

  const postForms = blogPosts.flatMap((post) => {
    const content = post.content as Record<string, unknown>;
    const candidate = content && typeof content === 'object' && Array.isArray((content as { elements?: unknown }).elements)
      ? (content as { elements: CanvasElement[] }).elements
      : [];

    return listCanvasFormsFromContent(candidate, siteId, { postId: post.id });
  });

  return [...pageForms, ...postForms];
}

function mergeFormDefinitions(
  staticForms: FormDefinition[],
  dynamicForms: FormDefinition[],
): FormDefinition[] {
  const merged = new Map<string, FormDefinition>();

  staticForms.forEach((form) => {
    merged.set(normalizeIdentifier(form.id), form);
  });

  dynamicForms.forEach((form) => {
    merged.set(normalizeIdentifier(form.id), form);
  });

  return Array.from(merged.values());
}

function matchesFormContextFilter(
  form: FormDefinition,
  filters: { pageId?: string; postId?: string },
): boolean {
  const pageIdMatch = !filters.pageId
    || !form.pageId
    || normalizeIdentifier(form.pageId) === normalizeIdentifier(filters.pageId);
  const postIdMatch = !filters.postId
    || !form.postId
    || normalizeIdentifier(form.postId) === normalizeIdentifier(filters.postId);

  return pageIdMatch && postIdMatch;
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

function normalizeSlugInput(value: unknown, fallback = 'untitled'): string {
  const raw = sanitizeString(value) || fallback;
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function createRuntimeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toStringRecord(value: unknown): Record<string, string> {
  return Object.entries(toRecord(value)).reduce<Record<string, string>>((acc, [key, entry]) => {
    const parsed = sanitizeString(entry);
    if (parsed) {
      acc[key] = parsed;
    }
    return acc;
  }, {});
}

function parseBooleanInput(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = sanitizeString(value).toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function parseStatusInput<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const normalized = sanitizeString(value).toLowerCase();
  return allowed.includes(normalized as T) ? normalized as T : fallback;
}

function createContentRevision(
  targetType: ContentRevision['targetType'],
  snapshot: StorePage | StoreBlogPost,
  note?: string | null,
  createdBy?: string | null,
): ContentRevision {
  const revision: ContentRevision = {
    id: createRuntimeId('rev'),
    siteId: snapshot.siteId,
    targetType,
    targetId: snapshot.id,
    snapshot: clone(snapshot),
    note: note || null,
    createdBy: createdBy || 'admin',
    createdAt: new Date().toISOString(),
  };

  CONTENT_REVISIONS.unshift(revision);
  return revision;
}

function prunePreviewTokens() {
  const now = Date.now();
  for (let index = PREVIEW_TOKENS.length - 1; index >= 0; index -= 1) {
    if (Date.parse(PREVIEW_TOKENS[index].expiresAt) <= now) {
      PREVIEW_TOKENS.splice(index, 1);
    }
  }
}

function removePreviewTokensForTarget(siteId: string, targetType: PreviewToken['targetType'], targetId: string) {
  for (let index = PREVIEW_TOKENS.length - 1; index >= 0; index -= 1) {
    const token = PREVIEW_TOKENS[index];
    if (token.siteId === siteId && token.targetType === targetType && token.targetId === targetId) {
      PREVIEW_TOKENS.splice(index, 1);
    }
  }
}

function refreshPersistedPreviewTokens() {
  if (!existsSync(ADMIN_CONTENT_PATH)) {
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(ADMIN_CONTENT_PATH, 'utf8')) as AdminContentSnapshot;
    if (Array.isArray(parsed.previewTokens)) {
      PREVIEW_TOKENS.splice(0, PREVIEW_TOKENS.length, ...parsed.previewTokens);
    }
  } catch (error) {
    console.error('Unable to refresh preview tokens:', error);
  }
}

export function createPreviewToken(
  siteId: string,
  targetType: PreviewToken['targetType'],
  targetId: string,
  ttlSeconds = 3600,
  createdBy = 'admin',
): PreviewToken {
  ensurePersistedAdminContentLoaded();
  prunePreviewTokens();

  const now = Date.now();
  const boundedTtlSeconds = Math.min(Math.max(Math.floor(ttlSeconds) || 3600, 60), 60 * 60 * 24);
  const previewToken: PreviewToken = {
    token: `preview_${randomUUID()}`,
    siteId,
    targetType,
    targetId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + boundedTtlSeconds * 1000).toISOString(),
    createdBy: createdBy || 'admin',
  };

  PREVIEW_TOKENS.unshift(previewToken);
  persistAdminContent();
  return clone(previewToken);
}

export function validatePreviewToken(
  siteId: string,
  targetType: PreviewToken['targetType'],
  targetId: string,
  token: string | null | undefined,
): boolean {
  ensurePersistedAdminContentLoaded();
  refreshPersistedPreviewTokens();

  if (!token) {
    return false;
  }

  prunePreviewTokens();

  return PREVIEW_TOKENS.some((entry) => (
    entry.siteId === siteId
    && entry.targetType === targetType
    && entry.targetId === targetId
    && entry.token === token
  ));
}

function collectMediaReferenceIds(value: unknown): Set<string> {
  const references = new Set<string>();

  const visit = (entry: unknown) => {
    if (!entry) {
      return;
    }

    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }

    if (typeof entry !== 'object') {
      return;
    }

    const record = entry as Record<string, unknown>;
    const directMediaId = sanitizeString(record.mediaId);
    const directAssetId = sanitizeString(record.assetId);

    if (directMediaId) {
      references.add(directMediaId);
    }

    if (directAssetId) {
      references.add(directAssetId);
    }

    if (record.props && typeof record.props === 'object' && !Array.isArray(record.props)) {
      const props = record.props as Record<string, unknown>;
      const propsMediaId = sanitizeString(props.mediaId);
      const propsAssetId = sanitizeString(props.assetId);

      if (propsMediaId) {
        references.add(propsMediaId);
      }

      if (propsAssetId) {
        references.add(propsAssetId);
      }
    }

    Object.values(record).forEach(visit);
  };

  visit(value);
  return references;
}

function syncMediaReferencesForTarget(
  siteId: string,
  targetType: 'page' | 'post',
  targetId: string,
  content: unknown,
  additionalMediaIds: string[] = [],
) {
  ensurePersistedMediaLoaded();

  const referenceIds = collectMediaReferenceIds(content);
  additionalMediaIds.map(sanitizeString).filter(Boolean).forEach((id) => referenceIds.add(id));
  let changed = false;

  MEDIA_LIBRARY.forEach((item, index) => {
    if (item.siteId !== siteId) {
      return;
    }

    const key = targetType === 'page' ? 'pageIds' : 'postIds';
    const currentRefs = item[key] || [];
    const shouldReference = referenceIds.has(item.id);
    const hasReference = currentRefs.includes(targetId);

    if (shouldReference === hasReference) {
      return;
    }

    MEDIA_LIBRARY[index] = {
      ...item,
      [key]: shouldReference
        ? [...currentRefs, targetId]
        : currentRefs.filter((id) => id !== targetId),
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  });

  if (changed) {
    persistRuntimeMediaCatalog();
  }
}

function removeMediaReferencesForTarget(siteId: string, targetType: 'page' | 'post', targetId: string) {
  ensurePersistedMediaLoaded();

  let changed = false;
  const key = targetType === 'page' ? 'pageIds' : 'postIds';

  MEDIA_LIBRARY.forEach((item, index) => {
    if (item.siteId !== siteId || !item[key]?.includes(targetId)) {
      return;
    }

    MEDIA_LIBRARY[index] = {
      ...item,
      [key]: item[key].filter((id) => id !== targetId),
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  });

  if (changed) {
    persistRuntimeMediaCatalog();
  }
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
    const normalizedAllowedOptions = normalizeFieldOptions(field.options);
    const submittedValues = parseSubmissionValues(fieldValue).map(sanitizeString);
    const normalizedSubmittedValues = submittedValues.map((value) => value.toLowerCase());

    if (field.required && sanitized.length === 0) {
      details.push({
        field: fieldLabel,
        message: `${fieldLabel} is required`,
      });
      return;
    }

    if ((field.type === 'select' || field.type === 'radio') && normalizedSubmittedValues.length > 0) {
      const selectedValue = normalizedSubmittedValues[0] || '';
      const matched = normalizedAllowedOptions.includes(selectedValue);
      if (!matched) {
        details.push({
          field: fieldLabel,
          message: `${fieldLabel} value is not a valid option`,
        });
      }
    }

    if ((field.type === 'checkbox') && normalizedSubmittedValues.length > 0 && normalizedAllowedOptions.length > 0) {
      const invalid = normalizedSubmittedValues.filter((value) => !normalizedAllowedOptions.includes(value));
      if (invalid.length > 0) {
        details.push({
          field: fieldLabel,
          message: `${fieldLabel} has invalid option selections`,
        });
      }
    }

    if (field.type === 'select' && field.required && normalizedAllowedOptions.length === 0) {
      details.push({
        field: fieldLabel,
        message: `${fieldLabel} has no available options`,
      });
      return;
    }

    if (field.type === 'radio' && submittedValues.length > 0 && normalizedAllowedOptions.length === 0) {
      details.push({
        field: fieldLabel,
        message: `${fieldLabel} has no available options`,
      });
      return;
    }

    if (field.type === 'checkbox' && normalizedAllowedOptions.length === 0 && field.required && sanitized.length > 0) {
      details.push({
        field: fieldLabel,
        message: `${fieldLabel} has no available options`,
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
  ensurePersistedAdminContentLoaded();

  const { includeUnpublished = false } = params;
  const raw = includeUnpublished ? SITE_LIST : SITE_LIST.filter((site) => site.isPublished);
  return clone(raw);
}

export function getSiteByIdOrSlug(identifier: string): StoreSite | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const found = SITE_LIST.find(
    (site) =>
      normalizeIdentifier(site.slug) === normalized ||
      normalizeIdentifier(site.id) === normalized ||
      (site.customDomain ? normalizeIdentifier(site.customDomain) === normalized : false),
  );

  return found ? clone(found) : undefined;
}

export function createAdminSite(input: Record<string, unknown>): StoreSite {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const name = sanitizeString(input.name) || 'Untitled site';
  const slug = normalizeSlugInput(input.slug || name, 'site');
  const status = parseStatusInput(input.status, ['draft', 'published', 'scheduled', 'archived'] as const, 'draft');

  const site: StoreSite = {
    id: sanitizeString(input.id) || createRuntimeId('site'),
    name,
    slug,
    description: sanitizeString(input.description),
    customDomain: sanitizeString(input.customDomain) || null,
    status,
    isPublished: status === 'published' || parseBooleanInput(input.isPublished, false),
    theme: {
      ...seedTheme,
      ...toRecord(input.theme),
      colors: {
        ...seedTheme.colors,
        ...toStringRecord(toRecord(input.theme).colors),
      },
      fonts: {
        ...seedTheme.fonts,
        ...toStringRecord(toRecord(input.theme).fonts),
      },
      customCSS: sanitizeString(toRecord(input.theme).customCSS) || seedTheme.customCSS,
    },
  };

  SITE_LIST.unshift(site);
  persistAdminContent();
  return clone(site);
}

export function updateAdminSite(siteId: string, input: Record<string, unknown>): StoreSite | undefined {
  ensurePersistedAdminContentLoaded();

  const index = SITE_LIST.findIndex((site) => site.id === siteId);
  if (index === -1) {
    return undefined;
  }

  const current = SITE_LIST[index];
  const nextStatus = input.status === undefined
    ? current.status
    : parseStatusInput(input.status, ['draft', 'published', 'scheduled', 'archived'] as const, current.status);
  const themeInput = toRecord(input.theme);

  const updated: StoreSite = {
    ...current,
    name: input.name === undefined ? current.name : sanitizeString(input.name) || current.name,
    slug: input.slug === undefined ? current.slug : normalizeSlugInput(input.slug, current.slug),
    description: input.description === undefined ? current.description : sanitizeString(input.description),
    customDomain: input.customDomain === undefined
      ? current.customDomain
      : sanitizeString(input.customDomain) || null,
    status: nextStatus,
    isPublished: input.isPublished === undefined
      ? nextStatus === 'published'
      : parseBooleanInput(input.isPublished, nextStatus === 'published'),
    theme: input.theme === undefined
      ? current.theme
      : {
          ...current.theme,
          ...themeInput,
          colors: {
            ...current.theme.colors,
            ...toStringRecord(themeInput.colors),
          },
          fonts: {
            ...current.theme.fonts,
            ...toStringRecord(themeInput.fonts),
          },
          customCSS: themeInput.customCSS === undefined
            ? current.theme.customCSS
            : sanitizeString(themeInput.customCSS),
        },
  };

  SITE_LIST[index] = updated;
  persistAdminContent();
  return clone(updated);
}

export function deleteAdminSite(siteId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = SITE_LIST.findIndex((site) => site.id === siteId);
  if (index === -1) {
    return false;
  }

  SITE_LIST.splice(index, 1);

  for (let pageIndex = PAGE_LIST.length - 1; pageIndex >= 0; pageIndex -= 1) {
    if (PAGE_LIST[pageIndex].siteId === siteId) {
      PAGE_LIST.splice(pageIndex, 1);
    }
  }

  for (let postIndex = BLOG_POSTS.length - 1; postIndex >= 0; postIndex -= 1) {
    if (BLOG_POSTS[postIndex].siteId === siteId) {
      BLOG_POSTS.splice(postIndex, 1);
    }
  }

  for (let categoryIndex = BLOG_CATEGORIES.length - 1; categoryIndex >= 0; categoryIndex -= 1) {
    if (BLOG_CATEGORIES[categoryIndex].siteId === siteId) {
      BLOG_CATEGORIES.splice(categoryIndex, 1);
    }
  }

  for (let tagIndex = BLOG_TAGS.length - 1; tagIndex >= 0; tagIndex -= 1) {
    if (BLOG_TAGS[tagIndex].siteId === siteId) {
      BLOG_TAGS.splice(tagIndex, 1);
    }
  }

  for (let collectionIndex = COLLECTIONS.length - 1; collectionIndex >= 0; collectionIndex -= 1) {
    if (COLLECTIONS[collectionIndex].siteId === siteId) {
      COLLECTIONS.splice(collectionIndex, 1);
    }
  }

  for (let recordIndex = COLLECTION_RECORDS.length - 1; recordIndex >= 0; recordIndex -= 1) {
    if (COLLECTION_RECORDS[recordIndex].siteId === siteId) {
      COLLECTION_RECORDS.splice(recordIndex, 1);
    }
  }

  for (let revisionIndex = CONTENT_REVISIONS.length - 1; revisionIndex >= 0; revisionIndex -= 1) {
    if (CONTENT_REVISIONS[revisionIndex].siteId === siteId) {
      CONTENT_REVISIONS.splice(revisionIndex, 1);
    }
  }

  for (let tokenIndex = PREVIEW_TOKENS.length - 1; tokenIndex >= 0; tokenIndex -= 1) {
    if (PREVIEW_TOKENS[tokenIndex].siteId === siteId) {
      PREVIEW_TOKENS.splice(tokenIndex, 1);
    }
  }

  persistAdminContent();
  return true;
}

const normalizeUserRole = (value: unknown, fallback: StoreUser['role'] = 'viewer'): StoreUser['role'] => {
  if (value === 'admin' || value === 'editor' || value === 'viewer') {
    return value;
  }

  return fallback;
};

const normalizeUserStatus = (
  value: unknown,
  fallback: StoreUser['status'] = 'invited',
): StoreUser['status'] => {
  if (value === 'active' || value === 'inactive' || value === 'invited') {
    return value;
  }

  return fallback;
};

const normalizeEmail = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

export function listAdminUsers(options: { search?: string; role?: string; status?: string } = {}): StoreUser[] {
  ensurePersistedAdminContentLoaded();

  const search = sanitizeString(options.search).toLowerCase();
  const role = options.role === 'admin' || options.role === 'editor' || options.role === 'viewer'
    ? options.role
    : '';
  const status = options.status === 'active' || options.status === 'inactive' || options.status === 'invited'
    ? options.status
    : '';

  const users = USER_LIST.filter((user) => {
    const matchesSearch = !search ||
      user.fullName.toLowerCase().includes(search) ||
      user.email.toLowerCase().includes(search);
    const matchesRole = !role || user.role === role;
    const matchesStatus = !status || user.status === status;

    return matchesSearch && matchesRole && matchesStatus;
  });

  return clone(users);
}

export function getAdminUserById(userId: string): StoreUser | undefined {
  ensurePersistedAdminContentLoaded();

  const user = USER_LIST.find((item) => item.id === userId);
  return user ? clone(user) : undefined;
}

export function getAdminUserByEmail(email: string): StoreUser | undefined {
  ensurePersistedAdminContentLoaded();

  const normalizedEmail = normalizeEmail(email);
  const user = USER_LIST.find((item) => item.email.toLowerCase() === normalizedEmail);
  return user ? clone(user) : undefined;
}

export function createAdminUser(input: Record<string, unknown>): StoreUser {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const fullName = sanitizeString(input.fullName) || sanitizeString(input.name) || 'Invited user';
  const email = normalizeEmail(input.email);
  const status = normalizeUserStatus(input.status, 'invited');

  const user: StoreUser = {
    id: sanitizeString(input.id) || createRuntimeId('user'),
    fullName,
    email,
    role: normalizeUserRole(input.role, 'viewer'),
    status,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: status === 'active' ? now : null,
    invitedAt: now,
  };

  USER_LIST.unshift(user);
  persistAdminContent();
  return clone(user);
}

export function updateAdminUser(userId: string, input: Record<string, unknown>): StoreUser | undefined {
  ensurePersistedAdminContentLoaded();

  const index = USER_LIST.findIndex((user) => user.id === userId);
  if (index === -1) {
    return undefined;
  }

  const current = USER_LIST[index];
  const now = new Date().toISOString();
  const nextStatus = input.status === undefined
    ? current.status
    : normalizeUserStatus(input.status, current.status);

  const updated: StoreUser = {
    ...current,
    fullName: input.fullName === undefined
      ? current.fullName
      : sanitizeString(input.fullName) || current.fullName,
    email: input.email === undefined
      ? current.email
      : normalizeEmail(input.email) || current.email,
    role: input.role === undefined ? current.role : normalizeUserRole(input.role, current.role),
    status: nextStatus,
    updatedAt: now,
    lastActiveAt: nextStatus === 'active' && !current.lastActiveAt ? now : current.lastActiveAt,
  };

  USER_LIST[index] = updated;
  persistAdminContent();
  return clone(updated);
}

export function deleteAdminUser(userId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = USER_LIST.findIndex((user) => user.id === userId);
  if (index === -1) {
    return false;
  }

  USER_LIST.splice(index, 1);
  persistAdminContent();
  return true;
}

const normalizeDeliveryMode = (
  value: unknown,
  fallback: StoreSettings['deliveryMode'] = 'managed-hosting',
): StoreSettings['deliveryMode'] => (
  value === 'managed-hosting' || value === 'custom-frontend' ? value : fallback
);

export function getAdminSettings(): StoreSettings {
  ensurePersistedAdminContentLoaded();
  return clone(SETTINGS);
}

export function updateAdminSettings(input: Record<string, unknown>): StoreSettings {
  ensurePersistedAdminContentLoaded();

  const apiKeysInput = toRecord(input.apiKeys);
  SETTINGS = {
    ...SETTINGS,
    deliveryMode: input.deliveryMode === undefined
      ? SETTINGS.deliveryMode
      : normalizeDeliveryMode(input.deliveryMode, SETTINGS.deliveryMode),
    apiKeys: {
      publicApiKey: apiKeysInput.publicApiKey === undefined
        ? SETTINGS.apiKeys.publicApiKey
        : sanitizeString(apiKeysInput.publicApiKey) || SETTINGS.apiKeys.publicApiKey,
      adminApiKey: apiKeysInput.adminApiKey === undefined
        ? SETTINGS.apiKeys.adminApiKey
        : sanitizeString(apiKeysInput.adminApiKey) || SETTINGS.apiKeys.adminApiKey,
    },
    updatedAt: new Date().toISOString(),
  };

  persistAdminContent();
  return clone(SETTINGS);
}

export function regenerateAdminApiKeys(kind: 'all' | 'public' | 'admin' = 'all'): StoreSettings {
  ensurePersistedAdminContentLoaded();

  SETTINGS = {
    ...SETTINGS,
    apiKeys: {
      publicApiKey: kind === 'all' || kind === 'public'
        ? createRuntimeApiKey('public')
        : SETTINGS.apiKeys.publicApiKey,
      adminApiKey: kind === 'all' || kind === 'admin'
        ? createRuntimeApiKey('admin')
        : SETTINGS.apiKeys.adminApiKey,
    },
    updatedAt: new Date().toISOString(),
  };

  persistAdminContent();
  return clone(SETTINGS);
}

const COLLECTION_FIELD_TYPES: CollectionFieldType[] = [
  'text',
  'richText',
  'number',
  'boolean',
  'date',
  'datetime',
  'image',
  'video',
  'file',
  'reference',
  'multiReference',
  'url',
  'email',
  'phone',
  'slug',
  'json',
];

const normalizeCollectionFieldType = (value: unknown): CollectionFieldType => {
  const normalized = sanitizeString(value);
  return COLLECTION_FIELD_TYPES.includes(normalized as CollectionFieldType)
    ? normalized as CollectionFieldType
    : 'text';
};

const normalizeCollectionFieldKey = (value: unknown, fallback: string): string => (
  normalizeSlugInput(value, fallback).replace(/-/g, '_')
);

const normalizeCollectionField = (
  raw: unknown,
  index: number,
  existing?: StoreCollectionField,
): StoreCollectionField => {
  const input = toRecord(raw);
  const label = sanitizeString(input.label) || sanitizeString(input.name) || existing?.label || `Field ${index + 1}`;
  const key = normalizeCollectionFieldKey(input.key || input.slug || label, existing?.key || `field_${index + 1}`);
  const options = Array.isArray(input.options)
    ? input.options.map(sanitizeString).filter(Boolean)
    : existing?.options;

  return {
    id: sanitizeString(input.id) || existing?.id || createRuntimeId('field'),
    key,
    label,
    type: input.type === undefined ? existing?.type || 'text' : normalizeCollectionFieldType(input.type),
    required: input.required === undefined ? existing?.required ?? false : parseBooleanInput(input.required, false),
    unique: input.unique === undefined ? existing?.unique ?? false : parseBooleanInput(input.unique, false),
    sortOrder: Number(input.sortOrder) || existing?.sortOrder || (index + 1) * 10,
    helpText: input.helpText === undefined ? existing?.helpText || null : sanitizeString(input.helpText) || null,
    ...(options?.length ? { options } : {}),
    referenceCollectionId: input.referenceCollectionId === undefined
      ? existing?.referenceCollectionId || null
      : sanitizeString(input.referenceCollectionId) || null,
    ...(input.defaultValue !== undefined ? { defaultValue: input.defaultValue } : existing && 'defaultValue' in existing ? { defaultValue: existing.defaultValue } : {}),
  };
};

const normalizeCollectionFields = (
  rawFields: unknown,
  existingFields: StoreCollectionField[] = [],
): StoreCollectionField[] => {
  const source = Array.isArray(rawFields) && rawFields.length > 0
    ? rawFields
    : existingFields.length > 0
      ? existingFields
      : [
          { key: 'title', label: 'Title', type: 'text', required: true, unique: false },
          { key: 'slug', label: 'Slug', type: 'slug', required: true, unique: true },
        ];
  const usedKeys = new Set<string>();

  return source.map((field, index) => {
    const normalized = normalizeCollectionField(field, index, existingFields[index]);
    let key = normalized.key;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${normalized.key}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);
    return {
      ...normalized,
      key,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
};

const normalizeCollectionPermissions = (
  value: unknown,
  existing?: StoreCollectionPermissions,
): StoreCollectionPermissions => {
  const input = toRecord(value);
  const base = existing || {
    publicRead: true,
    publicCreate: false,
    publicUpdate: false,
    publicDelete: false,
  };

  return {
    publicRead: input.publicRead === undefined ? base.publicRead : parseBooleanInput(input.publicRead, base.publicRead),
    publicCreate: input.publicCreate === undefined ? base.publicCreate : parseBooleanInput(input.publicCreate, base.publicCreate),
    publicUpdate: input.publicUpdate === undefined ? base.publicUpdate : parseBooleanInput(input.publicUpdate, base.publicUpdate),
    publicDelete: input.publicDelete === undefined ? base.publicDelete : parseBooleanInput(input.publicDelete, base.publicDelete),
  };
};

const normalizeCollectionRecordValue = (type: CollectionFieldType, value: unknown): unknown => {
  if (value === null || value === undefined) {
    return null;
  }

  if (type === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (type === 'boolean') {
    return parseBooleanInput(value, false);
  }

  if (type === 'multiReference') {
    return Array.isArray(value)
      ? value.map(sanitizeString).filter(Boolean)
      : sanitizeString(value)
        ? [sanitizeString(value)]
        : [];
  }

  if (type === 'json') {
    return value;
  }

  return sanitizeString(value);
};

const normalizeCollectionRecordValues = (
  collection: StoreCollection,
  values: Record<string, unknown>,
  existingValues: Record<string, unknown> = {},
): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};

  for (const field of collection.fields) {
    if (values[field.key] !== undefined) {
      normalized[field.key] = normalizeCollectionRecordValue(field.type, values[field.key]);
      continue;
    }

    if (existingValues[field.key] !== undefined) {
      normalized[field.key] = existingValues[field.key];
      continue;
    }

    if ('defaultValue' in field) {
      normalized[field.key] = normalizeCollectionRecordValue(field.type, field.defaultValue);
    }
  }

  for (const [key, value] of Object.entries(values)) {
    if (!(key in normalized)) {
      normalized[key] = value;
    }
  }

  return normalized;
};

export function listCollections(siteId: string, options: { includeUnpublished?: boolean } = {}): StoreCollection[] {
  ensurePersistedAdminContentLoaded();

  const collections = COLLECTIONS.filter((collection) => (
    collection.siteId === siteId &&
    (options.includeUnpublished || (collection.status === 'published' && collection.permissions.publicRead))
  ));

  return clone(collections);
}

export function getCollectionByIdOrSlug(
  siteId: string,
  identifier: string,
  options: { includeUnpublished?: boolean } = {},
): StoreCollection | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const collection = COLLECTIONS.find((item) => (
    item.siteId === siteId &&
    (normalizeIdentifier(item.id) === normalized || normalizeIdentifier(item.slug) === normalized)
  ));

  if (!collection) {
    return undefined;
  }

  if (!options.includeUnpublished && (collection.status !== 'published' || !collection.permissions.publicRead)) {
    return undefined;
  }

  return clone(collection);
}

export function createAdminCollection(siteId: string, input: Record<string, unknown>): StoreCollection {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const name = sanitizeString(input.name) || 'Untitled collection';
  const slug = normalizeSlugInput(input.slug || name, 'collection');
  const collection: StoreCollection = {
    id: sanitizeString(input.id) || createRuntimeId('collection'),
    siteId,
    name,
    slug,
    description: sanitizeString(input.description) || null,
    status: parseStatusInput(input.status, ['draft', 'published', 'archived'] as const, 'draft'),
    fields: normalizeCollectionFields(input.fields),
    permissions: normalizeCollectionPermissions(input.permissions),
    createdAt: now,
    updatedAt: now,
  };

  COLLECTIONS.unshift(collection);
  persistAdminContent();
  return clone(collection);
}

export function updateAdminCollection(
  siteId: string,
  collectionId: string,
  input: Record<string, unknown>,
): StoreCollection | undefined {
  ensurePersistedAdminContentLoaded();

  const index = COLLECTIONS.findIndex((collection) => collection.siteId === siteId && collection.id === collectionId);
  if (index === -1) {
    return undefined;
  }

  const current = COLLECTIONS[index];
  const updated: StoreCollection = {
    ...current,
    name: input.name === undefined ? current.name : sanitizeString(input.name) || current.name,
    slug: input.slug === undefined ? current.slug : normalizeSlugInput(input.slug, current.slug),
    description: input.description === undefined ? current.description : sanitizeString(input.description) || null,
    status: input.status === undefined
      ? current.status
      : parseStatusInput(input.status, ['draft', 'published', 'archived'] as const, current.status),
    fields: input.fields === undefined ? current.fields : normalizeCollectionFields(input.fields, current.fields),
    permissions: input.permissions === undefined
      ? current.permissions
      : normalizeCollectionPermissions(input.permissions, current.permissions),
    updatedAt: new Date().toISOString(),
  };

  COLLECTIONS[index] = updated;
  persistAdminContent();
  return clone(updated);
}

export function deleteAdminCollection(siteId: string, collectionId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = COLLECTIONS.findIndex((collection) => collection.siteId === siteId && collection.id === collectionId);
  if (index === -1) {
    return false;
  }

  COLLECTIONS.splice(index, 1);
  for (let recordIndex = COLLECTION_RECORDS.length - 1; recordIndex >= 0; recordIndex -= 1) {
    if (COLLECTION_RECORDS[recordIndex].siteId === siteId && COLLECTION_RECORDS[recordIndex].collectionId === collectionId) {
      COLLECTION_RECORDS.splice(recordIndex, 1);
    }
  }

  persistAdminContent();
  return true;
}

export function validateCollectionRecordValues(
  collection: StoreCollection,
  values: Record<string, unknown>,
  options: { existingValues?: Record<string, unknown>; excludeRecordId?: string } = {},
): SubmissionValidationDetail[] {
  ensurePersistedAdminContentLoaded();

  const normalizedValues = normalizeCollectionRecordValues(collection, values, options.existingValues);
  const errors: SubmissionValidationDetail[] = [];

  for (const field of collection.fields) {
    const value = normalizedValues[field.key];
    const empty = value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0);

    if (field.required && empty) {
      errors.push({ field: field.key, message: `${field.label} is required.` });
      continue;
    }

    if (field.unique && !empty) {
      const duplicate = COLLECTION_RECORDS.find((record) => (
        record.siteId === collection.siteId &&
        record.collectionId === collection.id &&
        record.id !== options.excludeRecordId &&
        sanitizeString(record.values[field.key]).toLowerCase() === sanitizeString(value).toLowerCase()
      ));

      if (duplicate) {
        errors.push({ field: field.key, message: `${field.label} must be unique.` });
      }
    }
  }

  return errors;
}

export function listCollectionRecords(
  siteId: string,
  collectionId: string,
  params: {
    includeUnpublished?: boolean;
    status?: StoreCollectionRecord['status'];
    slug?: string;
    limit?: number;
    offset?: number;
  } = {},
): { records: StoreCollectionRecord[]; pagination: Pagination } {
  ensurePersistedAdminContentLoaded();

  const { includeUnpublished = false, status, slug, limit = 50, offset = 0 } = params;
  let records = COLLECTION_RECORDS.filter((record) => (
    record.siteId === siteId &&
    record.collectionId === collectionId &&
    (includeUnpublished || isPublished(record.status, record.scheduledAt))
  ));

  if (status) {
    records = records.filter((record) => record.status === status);
  }

  if (slug) {
    records = records.filter((record) => normalizeIdentifier(record.slug) === normalizeIdentifier(slug));
  }

  const paginated = records.slice(offset, offset + limit);
  return {
    records: clone(paginated),
    pagination: getPagination(records.length, limit, offset),
  };
}

export function getCollectionRecordByIdOrSlug(
  siteId: string,
  collectionId: string,
  identifier: string,
  options: { includeUnpublished?: boolean } = {},
): StoreCollectionRecord | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const record = COLLECTION_RECORDS.find((item) => (
    item.siteId === siteId &&
    item.collectionId === collectionId &&
    (normalizeIdentifier(item.id) === normalized || normalizeIdentifier(item.slug) === normalized)
  ));

  if (!record) {
    return undefined;
  }

  if (!options.includeUnpublished && !isPublished(record.status, record.scheduledAt)) {
    return undefined;
  }

  return clone(record);
}

export function createAdminCollectionRecord(
  siteId: string,
  collectionId: string,
  input: Record<string, unknown>,
): StoreCollectionRecord | undefined {
  ensurePersistedAdminContentLoaded();

  const collection = getCollectionByIdOrSlug(siteId, collectionId, { includeUnpublished: true });
  if (!collection) {
    return undefined;
  }

  const now = new Date().toISOString();
  const rawValues = toRecord(input.values);
  const normalizedValues = normalizeCollectionRecordValues(collection, rawValues);
  const slug = normalizeSlugInput(input.slug || normalizedValues.slug || normalizedValues.title || normalizedValues.name || 'record', 'record');
  const status = parseStatusInput(input.status, ['draft', 'published', 'scheduled', 'archived'] as const, 'draft');
  const record: StoreCollectionRecord = {
    id: sanitizeString(input.id) || createRuntimeId('record'),
    siteId,
    collectionId: collection.id,
    slug,
    status,
    values: normalizedValues,
    createdAt: now,
    updatedAt: now,
    publishedAt: status === 'published' ? now : null,
    scheduledAt: sanitizeString(input.scheduledAt) || null,
  };

  COLLECTION_RECORDS.unshift(record);
  persistAdminContent();
  return clone(record);
}

export function updateAdminCollectionRecord(
  siteId: string,
  collectionId: string,
  recordId: string,
  input: Record<string, unknown>,
): StoreCollectionRecord | undefined {
  ensurePersistedAdminContentLoaded();

  const collection = getCollectionByIdOrSlug(siteId, collectionId, { includeUnpublished: true });
  const index = COLLECTION_RECORDS.findIndex((record) => (
    record.siteId === siteId &&
    record.collectionId === collection?.id &&
    record.id === recordId
  ));

  if (!collection || index === -1) {
    return undefined;
  }

  const current = COLLECTION_RECORDS[index];
  const rawValues = input.values === undefined ? current.values : toRecord(input.values);
  const status = input.status === undefined
    ? current.status
    : parseStatusInput(input.status, ['draft', 'published', 'scheduled', 'archived'] as const, current.status);
  const updated: StoreCollectionRecord = {
    ...current,
    slug: input.slug === undefined ? current.slug : normalizeSlugInput(input.slug, current.slug),
    status,
    values: normalizeCollectionRecordValues(collection, rawValues, input.values === undefined ? {} : current.values),
    updatedAt: new Date().toISOString(),
    publishedAt: status === 'published' && !current.publishedAt ? new Date().toISOString() : current.publishedAt,
    scheduledAt: input.scheduledAt === undefined ? current.scheduledAt : sanitizeString(input.scheduledAt) || null,
  };

  COLLECTION_RECORDS[index] = updated;
  persistAdminContent();
  return clone(updated);
}

export function deleteAdminCollectionRecord(siteId: string, collectionId: string, recordId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const collection = getCollectionByIdOrSlug(siteId, collectionId, { includeUnpublished: true });
  if (!collection) {
    return false;
  }

  const index = COLLECTION_RECORDS.findIndex((record) => (
    record.siteId === siteId &&
    record.collectionId === collection.id &&
    record.id === recordId
  ));

  if (index === -1) {
    return false;
  }

  COLLECTION_RECORDS.splice(index, 1);
  persistAdminContent();
  return true;
}

export function getPageSummary(siteId: string, options: { includeUnpublished?: boolean } = {}): Omit<StorePage, 'content'>[] {
  ensurePersistedAdminContentLoaded();

  const { includeUnpublished = false } = options;
  const pages = PAGE_LIST.filter(
    (page) => page.siteId === siteId && (includeUnpublished || isPublished(page.status, page.scheduledAt)),
  );

  return clone(
    pages.map(({ content, ...page }) => page),
  );
}

export function getSiteNavigation(
  siteId: string,
  options: { includeUnpublished?: boolean } = {},
): { primary: SiteNavigationItem[] } {
  const pages = getPageSummary(siteId, options);
  const primary = pages
    .map((page) => ({
      id: `nav_${page.id}`,
      type: 'page' as const,
      pageId: page.id,
      label: page.title,
      title: page.title,
      slug: page.slug,
      path: getCanonicalPathForPage(page),
      status: page.status,
      isHomepage: page.isHomepage,
      children: [],
    }))
    .sort((a, b) => {
      if (a.isHomepage !== b.isHomepage) {
        return a.isHomepage ? -1 : 1;
      }

      return a.label.localeCompare(b.label) || a.path.localeCompare(b.path);
    });

  return { primary };
}

export function getPageBySlug(
  siteId: string,
  slug: string,
  options: { includeUnpublished?: boolean } = {},
): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const normalizedSlug = normalizeIdentifier(slug || 'index');
  const { includeUnpublished = false } = options;

  const target = PAGE_LIST.find(
    (page) => page.siteId === siteId && normalizeIdentifier(page.slug) === normalizedSlug,
  );

  if (!target) {
    return undefined;
  }

  if (!includeUnpublished && !isPublished(target.status, target.scheduledAt)) {
    return undefined;
  }

  return clone(target);
}

export function getPageByPath(
  siteId: string,
  path: string,
  options: { includeUnpublished?: boolean } = {},
): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const normalizedPath = normalizeIdentifier((path || 'index').replace(/^\/+|\/+$/g, ''));
  const canonicalPath = normalizedPath === '' || normalizedPath === 'index' || normalizedPath === 'home'
    ? 'index'
    : normalizedPath;

  return getPageBySlug(siteId, canonicalPath, options);
}

export function getAdminPageById(siteId: string, pageId: string): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const page = PAGE_LIST.find((item) => item.siteId === siteId && item.id === pageId);
  return page ? clone(page) : undefined;
}

export function createAdminPage(siteId: string, input: Record<string, unknown>): StorePage {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const title = sanitizeString(input.title) || 'Untitled page';
  const slug = normalizeSlugInput(input.slug || title, 'page');
  const status = parseStatusInput(input.status, ['draft', 'published', 'scheduled', 'archived'] as const, 'draft');
  const metaInput = toRecord(input.meta);
  const contentInput = toRecord(input.content);
  const canvasSizeInput = toRecord(contentInput.canvasSize);

  const page: StorePage = {
    id: sanitizeString(input.id) || createRuntimeId('page'),
    siteId,
    title,
    slug,
    description: sanitizeString(input.description) || sanitizeString(metaInput.description) || null,
    status,
    isHomepage: parseBooleanInput(input.isHomepage, false),
    content: {
      elements: Array.isArray(contentInput.elements) ? contentInput.elements as CanvasElement[] : [],
      canvasSize: {
        width: Number(canvasSizeInput.width) || 1200,
        height: Number(canvasSizeInput.height) || 900,
      },
      customCSS: sanitizeString(contentInput.customCSS),
      customJS: sanitizeString(contentInput.customJS),
    },
    meta: {
      title: sanitizeString(metaInput.title) || title,
      description: sanitizeString(metaInput.description) || sanitizeString(input.description),
      keywords: Array.isArray(metaInput.keywords) ? metaInput.keywords.map(sanitizeString).filter(Boolean) : undefined,
      ogImage: sanitizeString(metaInput.ogImage) || null,
      canonical: sanitizeString(metaInput.canonical) || `/${slug}`,
      noIndex: parseBooleanInput(metaInput.noIndex, defaultNoIndexForStatus(status)),
      noFollow: parseBooleanInput(metaInput.noFollow, false),
    },
    forms: Array.isArray(input.forms) ? input.forms.map(sanitizeString).filter(Boolean) : [],
    createdAt: now,
    updatedAt: now,
    publishedAt: status === 'published' ? now : null,
    scheduledAt: sanitizeString(input.scheduledAt) || null,
  };

  PAGE_LIST.unshift(page);
  persistAdminContent();
  syncMediaReferencesForTarget(siteId, 'page', page.id, page.content);
  return clone(page);
}

export function updateAdminPage(
  siteId: string,
  pageId: string,
  input: Record<string, unknown>,
): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const index = PAGE_LIST.findIndex((page) => page.siteId === siteId && page.id === pageId);
  if (index === -1) {
    return undefined;
  }

  const current = PAGE_LIST[index];
  const now = new Date().toISOString();
  const status = input.status === undefined
    ? current.status
    : parseStatusInput(input.status, ['draft', 'published', 'scheduled', 'archived'] as const, current.status);
  const metaInput = toRecord(input.meta);
  const contentInput = toRecord(input.content);
  const canvasSizeInput = toRecord(contentInput.canvasSize);
  createContentRevision('page', current, sanitizeString(input.revisionNote) || 'Before page update', sanitizeString(input.updatedBy));

  const updated: StorePage = {
    ...current,
    title: input.title === undefined ? current.title : sanitizeString(input.title) || current.title,
    slug: input.slug === undefined ? current.slug : normalizeSlugInput(input.slug, current.slug),
    description: input.description === undefined ? current.description : sanitizeString(input.description) || null,
    status,
    isHomepage: input.isHomepage === undefined ? current.isHomepage : parseBooleanInput(input.isHomepage, current.isHomepage),
    content: input.content === undefined
      ? current.content
      : {
          elements: Array.isArray(contentInput.elements) ? contentInput.elements as CanvasElement[] : current.content.elements,
          canvasSize: {
            width: Number(canvasSizeInput.width) || current.content.canvasSize.width,
            height: Number(canvasSizeInput.height) || current.content.canvasSize.height,
          },
          customCSS: contentInput.customCSS === undefined
            ? current.content.customCSS
            : sanitizeString(contentInput.customCSS),
          customJS: contentInput.customJS === undefined
            ? current.content.customJS
            : sanitizeString(contentInput.customJS),
        },
    meta: input.meta === undefined
      ? {
          ...current.meta,
          noIndex: current.status !== status && !defaultNoIndexForStatus(status)
            ? false
            : current.meta.noIndex,
        }
      : {
          ...current.meta,
          title: metaInput.title === undefined ? current.meta.title : sanitizeString(metaInput.title),
          description: metaInput.description === undefined
            ? current.meta.description
            : sanitizeString(metaInput.description),
          keywords: Array.isArray(metaInput.keywords)
            ? metaInput.keywords.map(sanitizeString).filter(Boolean)
            : current.meta.keywords,
          ogImage: metaInput.ogImage === undefined ? current.meta.ogImage : sanitizeString(metaInput.ogImage) || null,
          canonical: metaInput.canonical === undefined ? current.meta.canonical : sanitizeString(metaInput.canonical),
          noIndex: metaInput.noIndex === undefined ? current.meta.noIndex : parseBooleanInput(metaInput.noIndex, false),
          noFollow: metaInput.noFollow === undefined ? current.meta.noFollow : parseBooleanInput(metaInput.noFollow, false),
        },
    forms: Array.isArray(input.forms) ? input.forms.map(sanitizeString).filter(Boolean) : current.forms,
    updatedAt: now,
    publishedAt: status === 'published' && !current.publishedAt ? now : current.publishedAt,
    scheduledAt: input.scheduledAt === undefined ? current.scheduledAt : sanitizeString(input.scheduledAt) || null,
  };

  PAGE_LIST[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(siteId, 'page', pageId, updated.content);
  return clone(updated);
}

export function deleteAdminPage(siteId: string, pageId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = PAGE_LIST.findIndex((page) => page.siteId === siteId && page.id === pageId);
  if (index === -1) {
    return false;
  }

  PAGE_LIST.splice(index, 1);
  removeMediaReferencesForTarget(siteId, 'page', pageId);
  removePreviewTokensForTarget(siteId, 'page', pageId);

  for (let revisionIndex = CONTENT_REVISIONS.length - 1; revisionIndex >= 0; revisionIndex -= 1) {
    const revision = CONTENT_REVISIONS[revisionIndex];
    if (revision.siteId === siteId && revision.targetType === 'page' && revision.targetId === pageId) {
      CONTENT_REVISIONS.splice(revisionIndex, 1);
    }
  }

  persistAdminContent();
  return true;
}

export function getBlogPosts(
  siteId: string,
  params: {
    slug?: string;
    status?: StoreBlogPost['status'];
    categoryId?: string;
    categorySlug?: string;
    tagId?: string;
    tagSlug?: string;
    authorId?: string;
    authorSlug?: string;
    limit?: number;
    offset?: number;
    includeUnpublished?: boolean;
  } = {},
): { posts: StoreBlogPost[]; pagination?: Pagination } {
  const {
    slug,
    status,
    categoryId,
    categorySlug,
    tagId,
    tagSlug,
    authorId,
    authorSlug,
    limit = 20,
    offset = 0,
    includeUnpublished = false,
  } = params;

  ensurePersistedAdminContentLoaded();

  let posts = BLOG_POSTS.filter((post) => post.siteId === siteId);

  if (!includeUnpublished) {
    posts = posts.filter((post) => isPublished(post.status, post.scheduledAt));
  }

  if (status) {
    posts = posts.filter((post) => post.status === status);
  }

  const normalizedCategoryId = sanitizeString(categoryId);
  const categoryBySlug = categorySlug
    ? getBlogCategoryByIdOrSlug(siteId, categorySlug)
    : undefined;
  const effectiveCategoryId = normalizedCategoryId || categoryBySlug?.id || '';
  if (effectiveCategoryId) {
    posts = posts.filter((post) => post.categoryIds.includes(effectiveCategoryId));
  }

  const normalizedTagId = sanitizeString(tagId);
  const tagBySlug = tagSlug
    ? getBlogTagByIdOrSlug(siteId, tagSlug)
    : undefined;
  const effectiveTagId = normalizedTagId || tagBySlug?.id || '';
  if (effectiveTagId) {
    posts = posts.filter((post) => post.tagIds.includes(effectiveTagId));
  }

  const normalizedAuthorId = sanitizeString(authorId);
  const authorBySlug = authorSlug
    ? getBlogAuthorByIdOrSlug(siteId, authorSlug)
    : undefined;
  const effectiveAuthorId = normalizedAuthorId || authorBySlug?.id || '';
  if (effectiveAuthorId) {
    posts = posts.filter((post) => post.authorId === effectiveAuthorId);
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

const getAuthorSlug = (name: string, fallback: string): string => (
  normalizeSlugInput(name || fallback, fallback || 'author')
);

const getAuthorPostCount = (siteId: string, authorId: string): number => (
  BLOG_POSTS.filter(
    (post) =>
      post.siteId === siteId &&
      post.authorId === authorId &&
      post.status !== 'archived',
  ).length
);

const toBlogAuthor = (siteId: string, user: StoreUser): StoreBlogAuthor => ({
  id: user.id,
  siteId,
  name: user.fullName,
  slug: getAuthorSlug(user.fullName, user.id),
  role: user.role,
  status: user.status,
  postCount: getAuthorPostCount(siteId, user.id),
});

const toExternalBlogAuthor = (siteId: string, authorId: string): StoreBlogAuthor => ({
  id: authorId,
  siteId,
  name: authorId,
  slug: getAuthorSlug(authorId, authorId),
  role: 'contributor',
  status: 'external',
  postCount: getAuthorPostCount(siteId, authorId),
});

export function listBlogAuthors(siteId: string): StoreBlogAuthor[] {
  ensurePersistedAdminContentLoaded();

  const assignedAuthorIds = new Set(
    BLOG_POSTS
      .filter((post) => post.siteId === siteId && post.authorId)
      .map((post) => post.authorId as string),
  );
  const userAuthors = USER_LIST
    .filter(
      (user) =>
        user.role === 'admin' ||
        user.role === 'editor' ||
        assignedAuthorIds.has(user.id),
    )
    .map((user) => toBlogAuthor(siteId, user));
  const knownUserIds = new Set(userAuthors.map((author) => author.id));
  const externalAuthors = [...assignedAuthorIds]
    .filter((authorId) => !knownUserIds.has(authorId))
    .map((authorId) => toExternalBlogAuthor(siteId, authorId));

  return clone([...userAuthors, ...externalAuthors].sort((a, b) => a.name.localeCompare(b.name)));
}

export function getBlogAuthorByIdOrSlug(siteId: string, identifier: string): StoreBlogAuthor | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const author = listBlogAuthors(siteId).find(
    (item) =>
      normalizeIdentifier(item.id) === normalized ||
      normalizeIdentifier(item.slug) === normalized,
  );

  return author ? clone(author) : undefined;
}

const withCategoryPostCount = (category: StoreBlogCategory): StoreBlogCategory => ({
  ...category,
  postCount: BLOG_POSTS.filter(
    (post) =>
      post.siteId === category.siteId &&
      post.categoryIds.includes(category.id) &&
      post.status !== 'archived',
  ).length,
});

const withTagPostCount = (tag: StoreBlogTag): StoreBlogTag => ({
  ...tag,
  postCount: BLOG_POSTS.filter(
    (post) =>
      post.siteId === tag.siteId &&
      post.tagIds.includes(tag.id) &&
      post.status !== 'archived',
  ).length,
});

export function listBlogCategories(siteId: string): StoreBlogCategory[] {
  ensurePersistedAdminContentLoaded();
  return clone(BLOG_CATEGORIES.filter((category) => category.siteId === siteId).map(withCategoryPostCount));
}

export function listBlogTags(siteId: string): StoreBlogTag[] {
  ensurePersistedAdminContentLoaded();
  return clone(BLOG_TAGS.filter((tag) => tag.siteId === siteId).map(withTagPostCount));
}

export function getBlogCategoryByIdOrSlug(siteId: string, identifier: string): StoreBlogCategory | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const category = BLOG_CATEGORIES.find(
    (item) =>
      item.siteId === siteId &&
      (normalizeIdentifier(item.id) === normalized || normalizeIdentifier(item.slug) === normalized),
  );

  return category ? clone(withCategoryPostCount(category)) : undefined;
}

export function getBlogTagByIdOrSlug(siteId: string, identifier: string): StoreBlogTag | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const tag = BLOG_TAGS.find(
    (item) =>
      item.siteId === siteId &&
      (normalizeIdentifier(item.id) === normalized || normalizeIdentifier(item.slug) === normalized),
  );

  return tag ? clone(withTagPostCount(tag)) : undefined;
}

export function createAdminBlogCategory(siteId: string, input: Record<string, unknown>): StoreBlogCategory {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const name = sanitizeString(input.name) || 'Untitled category';
  const slug = normalizeSlugInput(input.slug || name, 'category');
  const category: StoreBlogCategory = {
    id: sanitizeString(input.id) || createRuntimeId('cat'),
    siteId,
    name,
    slug,
    description: sanitizeString(input.description) || null,
    color: sanitizeString(input.color) || null,
    createdAt: now,
    updatedAt: now,
  };

  BLOG_CATEGORIES.unshift(category);
  persistAdminContent();
  return clone(withCategoryPostCount(category));
}

export function updateAdminBlogCategory(
  siteId: string,
  categoryId: string,
  input: Record<string, unknown>,
): StoreBlogCategory | undefined {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_CATEGORIES.findIndex((category) => category.siteId === siteId && category.id === categoryId);
  if (index === -1) {
    return undefined;
  }

  const current = BLOG_CATEGORIES[index];
  const updated: StoreBlogCategory = {
    ...current,
    name: input.name === undefined ? current.name : sanitizeString(input.name) || current.name,
    slug: input.slug === undefined ? current.slug : normalizeSlugInput(input.slug, current.slug),
    description: input.description === undefined ? current.description : sanitizeString(input.description) || null,
    color: input.color === undefined ? current.color : sanitizeString(input.color) || null,
    updatedAt: new Date().toISOString(),
  };

  BLOG_CATEGORIES[index] = updated;
  persistAdminContent();
  return clone(withCategoryPostCount(updated));
}

export function deleteAdminBlogCategory(siteId: string, categoryId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_CATEGORIES.findIndex((category) => category.siteId === siteId && category.id === categoryId);
  if (index === -1) {
    return false;
  }

  BLOG_CATEGORIES.splice(index, 1);
  BLOG_POSTS.forEach((post) => {
    if (post.siteId === siteId && post.categoryIds.includes(categoryId)) {
      post.categoryIds = post.categoryIds.filter((id) => id !== categoryId);
      post.updatedAt = new Date().toISOString();
    }
  });
  persistAdminContent();
  return true;
}

export function createAdminBlogTag(siteId: string, input: Record<string, unknown>): StoreBlogTag {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const name = sanitizeString(input.name) || 'Untitled tag';
  const slug = normalizeSlugInput(input.slug || name, 'tag');
  const tag: StoreBlogTag = {
    id: sanitizeString(input.id) || createRuntimeId('tag'),
    siteId,
    name,
    slug,
    description: sanitizeString(input.description) || null,
    createdAt: now,
    updatedAt: now,
  };

  BLOG_TAGS.unshift(tag);
  persistAdminContent();
  return clone(withTagPostCount(tag));
}

export function updateAdminBlogTag(
  siteId: string,
  tagId: string,
  input: Record<string, unknown>,
): StoreBlogTag | undefined {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_TAGS.findIndex((tag) => tag.siteId === siteId && tag.id === tagId);
  if (index === -1) {
    return undefined;
  }

  const current = BLOG_TAGS[index];
  const updated: StoreBlogTag = {
    ...current,
    name: input.name === undefined ? current.name : sanitizeString(input.name) || current.name,
    slug: input.slug === undefined ? current.slug : normalizeSlugInput(input.slug, current.slug),
    description: input.description === undefined ? current.description : sanitizeString(input.description) || null,
    updatedAt: new Date().toISOString(),
  };

  BLOG_TAGS[index] = updated;
  persistAdminContent();
  return clone(withTagPostCount(updated));
}

export function deleteAdminBlogTag(siteId: string, tagId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_TAGS.findIndex((tag) => tag.siteId === siteId && tag.id === tagId);
  if (index === -1) {
    return false;
  }

  BLOG_TAGS.splice(index, 1);
  BLOG_POSTS.forEach((post) => {
    if (post.siteId === siteId && post.tagIds.includes(tagId)) {
      post.tagIds = post.tagIds.filter((id) => id !== tagId);
      post.updatedAt = new Date().toISOString();
    }
  });
  persistAdminContent();
  return true;
}

export function getAdminBlogPostById(siteId: string, postId: string): StoreBlogPost | undefined {
  ensurePersistedAdminContentLoaded();

  const post = BLOG_POSTS.find((item) => item.siteId === siteId && item.id === postId);
  return post ? clone(post) : undefined;
}

export function createAdminBlogPost(siteId: string, input: Record<string, unknown>): StoreBlogPost {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const title = sanitizeString(input.title) || 'Untitled post';
  const slug = normalizeSlugInput(input.slug || title, 'post');
  const status = parseStatusInput(input.status, ['draft', 'published', 'scheduled', 'archived'] as const, 'draft');
  const metaInput = toRecord(input.meta);

  const post: StoreBlogPost = {
    id: sanitizeString(input.id) || createRuntimeId('post'),
    siteId,
    title,
    slug,
    excerpt: sanitizeString(input.excerpt) || null,
    content: toRecord(input.content),
    status,
    featuredImageId: sanitizeString(input.featuredImageId) || null,
    authorId: sanitizeString(input.authorId) || 'admin',
    meta: {
      title: sanitizeString(metaInput.title) || title,
      description: sanitizeString(metaInput.description) || sanitizeString(input.excerpt),
      keywords: Array.isArray(metaInput.keywords) ? metaInput.keywords.map(sanitizeString).filter(Boolean) : undefined,
      ogImage: sanitizeString(metaInput.ogImage) || null,
      canonical: sanitizeString(metaInput.canonical) || `/blog/${slug}`,
      noIndex: parseBooleanInput(metaInput.noIndex, defaultNoIndexForStatus(status)),
      noFollow: parseBooleanInput(metaInput.noFollow, false),
    },
    categoryIds: Array.isArray(input.categoryIds) ? input.categoryIds.map(sanitizeString).filter(Boolean) : [],
    tagIds: Array.isArray(input.tagIds) ? input.tagIds.map(sanitizeString).filter(Boolean) : [],
    createdAt: now,
    updatedAt: now,
    publishedAt: status === 'published' ? now : null,
    scheduledAt: sanitizeString(input.scheduledAt) || null,
  };

  BLOG_POSTS.unshift(post);
  persistAdminContent();
  syncMediaReferencesForTarget(siteId, 'post', post.id, post.content, post.featuredImageId ? [post.featuredImageId] : []);
  return clone(post);
}

export function updateAdminBlogPost(
  siteId: string,
  postId: string,
  input: Record<string, unknown>,
): StoreBlogPost | undefined {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_POSTS.findIndex((post) => post.siteId === siteId && post.id === postId);
  if (index === -1) {
    return undefined;
  }

  const current = BLOG_POSTS[index];
  const now = new Date().toISOString();
  const status = input.status === undefined
    ? current.status
    : parseStatusInput(input.status, ['draft', 'published', 'scheduled', 'archived'] as const, current.status);
  const metaInput = toRecord(input.meta);
  createContentRevision('post', current, sanitizeString(input.revisionNote) || 'Before post update', sanitizeString(input.updatedBy));

  const updated: StoreBlogPost = {
    ...current,
    title: input.title === undefined ? current.title : sanitizeString(input.title) || current.title,
    slug: input.slug === undefined ? current.slug : normalizeSlugInput(input.slug, current.slug),
    excerpt: input.excerpt === undefined ? current.excerpt : sanitizeString(input.excerpt) || null,
    content: input.content === undefined ? current.content : toRecord(input.content),
    status,
    featuredImageId: input.featuredImageId === undefined
      ? current.featuredImageId
      : sanitizeString(input.featuredImageId) || null,
    authorId: input.authorId === undefined ? current.authorId : sanitizeString(input.authorId) || null,
    meta: input.meta === undefined
      ? {
          ...current.meta,
          noIndex: current.status !== status && !defaultNoIndexForStatus(status)
            ? false
            : current.meta.noIndex,
        }
      : {
          ...current.meta,
          title: metaInput.title === undefined ? current.meta.title : sanitizeString(metaInput.title),
          description: metaInput.description === undefined
            ? current.meta.description
            : sanitizeString(metaInput.description),
          keywords: Array.isArray(metaInput.keywords)
            ? metaInput.keywords.map(sanitizeString).filter(Boolean)
            : current.meta.keywords,
          ogImage: metaInput.ogImage === undefined ? current.meta.ogImage : sanitizeString(metaInput.ogImage) || null,
          canonical: metaInput.canonical === undefined ? current.meta.canonical : sanitizeString(metaInput.canonical),
          noIndex: metaInput.noIndex === undefined ? current.meta.noIndex : parseBooleanInput(metaInput.noIndex, false),
          noFollow: metaInput.noFollow === undefined ? current.meta.noFollow : parseBooleanInput(metaInput.noFollow, false),
        },
    categoryIds: Array.isArray(input.categoryIds)
      ? input.categoryIds.map(sanitizeString).filter(Boolean)
      : current.categoryIds,
    tagIds: Array.isArray(input.tagIds)
      ? input.tagIds.map(sanitizeString).filter(Boolean)
      : current.tagIds,
    updatedAt: now,
    publishedAt: status === 'published' && !current.publishedAt ? now : current.publishedAt,
    scheduledAt: input.scheduledAt === undefined ? current.scheduledAt : sanitizeString(input.scheduledAt) || null,
  };

  BLOG_POSTS[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(siteId, 'post', postId, updated.content, updated.featuredImageId ? [updated.featuredImageId] : []);
  return clone(updated);
}

export function deleteAdminBlogPost(siteId: string, postId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_POSTS.findIndex((post) => post.siteId === siteId && post.id === postId);
  if (index === -1) {
    return false;
  }

  BLOG_POSTS.splice(index, 1);
  removeMediaReferencesForTarget(siteId, 'post', postId);
  removePreviewTokensForTarget(siteId, 'post', postId);

  for (let revisionIndex = CONTENT_REVISIONS.length - 1; revisionIndex >= 0; revisionIndex -= 1) {
    const revision = CONTENT_REVISIONS[revisionIndex];
    if (revision.siteId === siteId && revision.targetType === 'post' && revision.targetId === postId) {
      CONTENT_REVISIONS.splice(revisionIndex, 1);
    }
  }

  persistAdminContent();
  return true;
}

export function listContentRevisions(
  siteId: string,
  targetType: ContentRevision['targetType'],
  targetId: string,
  params: { limit?: number; offset?: number } = {},
): { revisions: ContentRevision[]; pagination: Pagination } {
  ensurePersistedAdminContentLoaded();

  const { limit = 25, offset = 0 } = params;
  const revisions = CONTENT_REVISIONS.filter(
    (revision) =>
      revision.siteId === siteId &&
      revision.targetType === targetType &&
      revision.targetId === targetId,
  );

  return {
    revisions: clone(revisions.slice(offset, offset + limit)),
    pagination: getPagination(revisions.length, limit, offset),
  };
}

export function publishAdminPage(siteId: string, pageId: string, actor = 'admin'): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const index = PAGE_LIST.findIndex((page) => page.siteId === siteId && page.id === pageId);
  if (index === -1) {
    return undefined;
  }

  const current = PAGE_LIST[index];
  createContentRevision('page', current, 'Before publish', actor);

  const now = new Date().toISOString();
  const updated: StorePage = {
    ...current,
    status: 'published',
    publishedAt: now,
    scheduledAt: null,
    updatedAt: now,
    meta: {
      ...current.meta,
      noIndex: false,
    },
  };

  PAGE_LIST[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(siteId, 'page', pageId, updated.content);
  return clone(updated);
}

export function archiveAdminPage(siteId: string, pageId: string, actor = 'admin'): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const index = PAGE_LIST.findIndex((page) => page.siteId === siteId && page.id === pageId);
  if (index === -1) {
    return undefined;
  }

  const current = PAGE_LIST[index];
  createContentRevision('page', current, 'Before archive', actor);

  const updated: StorePage = {
    ...current,
    status: 'archived',
    scheduledAt: null,
    updatedAt: new Date().toISOString(),
    meta: {
      ...current.meta,
      noIndex: true,
    },
  };

  PAGE_LIST[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(siteId, 'page', pageId, updated.content);
  return clone(updated);
}

export function rollbackAdminPage(
  siteId: string,
  pageId: string,
  revisionId: string,
  actor = 'admin',
): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const index = PAGE_LIST.findIndex((page) => page.siteId === siteId && page.id === pageId);
  const revision = CONTENT_REVISIONS.find(
    (item) =>
      item.id === revisionId &&
      item.siteId === siteId &&
      item.targetType === 'page' &&
      item.targetId === pageId,
  );

  if (index === -1 || !revision) {
    return undefined;
  }

  const current = PAGE_LIST[index];
  createContentRevision('page', current, `Before rollback to ${revisionId}`, actor);

  const snapshot = revision.snapshot as StorePage;
  const updated: StorePage = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };

  PAGE_LIST[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(siteId, 'page', pageId, updated.content);
  return clone(updated);
}

export function publishAdminBlogPost(siteId: string, postId: string, actor = 'admin'): StoreBlogPost | undefined {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_POSTS.findIndex((post) => post.siteId === siteId && post.id === postId);
  if (index === -1) {
    return undefined;
  }

  const current = BLOG_POSTS[index];
  createContentRevision('post', current, 'Before publish', actor);

  const now = new Date().toISOString();
  const updated: StoreBlogPost = {
    ...current,
    status: 'published',
    publishedAt: now,
    scheduledAt: null,
    updatedAt: now,
    meta: {
      ...current.meta,
      noIndex: false,
    },
  };

  BLOG_POSTS[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(siteId, 'post', postId, updated.content, updated.featuredImageId ? [updated.featuredImageId] : []);
  return clone(updated);
}

export function archiveAdminBlogPost(siteId: string, postId: string, actor = 'admin'): StoreBlogPost | undefined {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_POSTS.findIndex((post) => post.siteId === siteId && post.id === postId);
  if (index === -1) {
    return undefined;
  }

  const current = BLOG_POSTS[index];
  createContentRevision('post', current, 'Before archive', actor);

  const updated: StoreBlogPost = {
    ...current,
    status: 'archived',
    scheduledAt: null,
    updatedAt: new Date().toISOString(),
    meta: {
      ...current.meta,
      noIndex: true,
    },
  };

  BLOG_POSTS[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(siteId, 'post', postId, updated.content, updated.featuredImageId ? [updated.featuredImageId] : []);
  return clone(updated);
}

export function rollbackAdminBlogPost(
  siteId: string,
  postId: string,
  revisionId: string,
  actor = 'admin',
): StoreBlogPost | undefined {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_POSTS.findIndex((post) => post.siteId === siteId && post.id === postId);
  const revision = CONTENT_REVISIONS.find(
    (item) =>
      item.id === revisionId &&
      item.siteId === siteId &&
      item.targetType === 'post' &&
      item.targetId === postId,
  );

  if (index === -1 || !revision) {
    return undefined;
  }

  const current = BLOG_POSTS[index];
  createContentRevision('post', current, `Before rollback to ${revisionId}`, actor);

  const snapshot = revision.snapshot as StoreBlogPost;
  const updated: StoreBlogPost = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };

  BLOG_POSTS[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(siteId, 'post', postId, updated.content, updated.featuredImageId ? [updated.featuredImageId] : []);
  return clone(updated);
}

export function getMediaList(
  siteId: string,
  params: {
    type?: string;
    scope?: string;
    visibility?: string;
    search?: string;
    tag?: string;
    folderId?: string | null;
    pageId?: string;
    postId?: string;
    limit?: number;
    offset?: number;
  } = {},
): { media: MediaItem[]; pagination: Pagination } {
  ensurePersistedMediaLoaded();

  const { type, scope, visibility, search, tag, folderId, pageId, postId, limit = 50, offset = 0 } = params;
  const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : undefined;
  const normalizedSearch = typeof search === 'string' ? normalizeIdentifier(search) : '';
  const normalizedTag = typeof tag === 'string' ? normalizeIdentifier(tag) : '';

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

  if (normalizedSearch) {
    media = media.filter((item) => (
      normalizeIdentifier(item.originalName).includes(normalizedSearch) ||
      normalizeIdentifier(item.filename).includes(normalizedSearch) ||
      normalizeIdentifier(item.altText || '').includes(normalizedSearch) ||
      normalizeIdentifier(item.caption || '').includes(normalizedSearch) ||
      item.tags.some((itemTag) => normalizeIdentifier(itemTag).includes(normalizedSearch))
    ));
  }

  if (normalizedTag) {
    media = media.filter((item) => item.tags.some((itemTag) => normalizeIdentifier(itemTag) === normalizedTag));
  }

  if (folderId !== undefined) {
    media = media.filter((item) => item.folderId === (folderId || null));
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

export function createMediaItem(
  siteId: string,
  input: {
    filename: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    type: MediaItem['type'];
    url: string;
    thumbnailUrl?: string | null;
    folderId?: string | null;
    pageIds?: string[];
    postIds?: string[];
    tags?: string[];
    metadata?: Record<string, unknown>;
    altText?: string | null;
    caption?: string | null;
    uploadedBy?: string | null;
    scope?: MediaItem['scope'];
    scopeTargetId?: string | null;
    visibility?: MediaItem['visibility'];
  },
): MediaItem {
  ensurePersistedMediaLoaded();

  const now = new Date().toISOString();
  const item: MediaItem = {
    id: `media_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    siteId,
    filename: input.filename,
    originalName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    type: input.type,
    url: input.url,
    thumbnailUrl: input.thumbnailUrl ?? (input.type === 'image' ? input.url : null),
    folderId: input.folderId ?? null,
    pageIds: input.pageIds ?? [],
    postIds: input.postIds ?? [],
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    altText: input.altText ?? null,
    caption: input.caption ?? null,
    uploadedBy: input.uploadedBy ?? 'admin',
    scope: input.scope ?? 'global',
    scopeTargetId: input.scopeTargetId ?? null,
    visibility: input.visibility ?? 'public',
    createdAt: now,
    updatedAt: now,
  };

  MEDIA_LIBRARY.unshift(item);
  persistRuntimeMediaCatalog();
  return clone(item);
}

export function listMediaFolders(siteId: string): MediaFolder[] {
  ensurePersistedMediaLoaded();

  return clone(
    MEDIA_FOLDERS
      .filter((folder) => folder.siteId === siteId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
  );
}

export function createMediaFolder(siteId: string, input: Record<string, unknown>): MediaFolder {
  ensurePersistedMediaLoaded();

  const name = sanitizeString(input.name) || 'Untitled folder';
  const parentId = sanitizeString(input.parentId) || null;
  const now = new Date().toISOString();
  const folder: MediaFolder = {
    id: sanitizeString(input.id) || createRuntimeId('folder'),
    siteId,
    parentId,
    name,
    sortOrder: Number(input.sortOrder) || MEDIA_FOLDERS.filter((item) => item.siteId === siteId).length + 1,
    createdAt: now,
  };

  MEDIA_FOLDERS.unshift(folder);
  persistRuntimeMediaCatalog();
  return clone(folder);
}

export function updateMediaFolder(
  siteId: string,
  folderId: string,
  input: Record<string, unknown>,
): MediaFolder | undefined {
  ensurePersistedMediaLoaded();

  const index = MEDIA_FOLDERS.findIndex((folder) => folder.siteId === siteId && folder.id === folderId);
  if (index === -1) {
    return undefined;
  }

  const current = MEDIA_FOLDERS[index];
  const updated: MediaFolder = {
    ...current,
    name: input.name === undefined ? current.name : sanitizeString(input.name) || current.name,
    parentId: input.parentId === undefined ? current.parentId : sanitizeString(input.parentId) || null,
    sortOrder: input.sortOrder === undefined ? current.sortOrder : Number(input.sortOrder) || current.sortOrder,
  };

  MEDIA_FOLDERS[index] = updated;
  persistRuntimeMediaCatalog();
  return clone(updated);
}

export function deleteMediaFolder(siteId: string, folderId: string): boolean {
  ensurePersistedMediaLoaded();

  const index = MEDIA_FOLDERS.findIndex((folder) => folder.siteId === siteId && folder.id === folderId);
  if (index === -1) {
    return false;
  }

  MEDIA_FOLDERS.splice(index, 1);

  for (let mediaIndex = 0; mediaIndex < MEDIA_LIBRARY.length; mediaIndex += 1) {
    if (MEDIA_LIBRARY[mediaIndex].siteId === siteId && MEDIA_LIBRARY[mediaIndex].folderId === folderId) {
      MEDIA_LIBRARY[mediaIndex] = {
        ...MEDIA_LIBRARY[mediaIndex],
        folderId: null,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  persistRuntimeMediaCatalog();
  return true;
}

export function updateMediaItem(
  siteId: string,
  mediaId: string,
  input: Record<string, unknown>,
): MediaItem | undefined {
  ensurePersistedMediaLoaded();

  const index = MEDIA_LIBRARY.findIndex((item) => item.siteId === siteId && item.id === mediaId);
  if (index === -1) {
    return undefined;
  }

  const current = MEDIA_LIBRARY[index];
  const scope = sanitizeString(input.scope);
  const visibility = sanitizeString(input.visibility);
  const rawTags = input.tags;
  const pageIds = Array.isArray(input.pageIds)
    ? input.pageIds.map(sanitizeString).filter(Boolean)
    : current.pageIds;
  const postIds = Array.isArray(input.postIds)
    ? input.postIds.map(sanitizeString).filter(Boolean)
    : current.postIds;
  const nextScope = scope === 'page' || scope === 'post' || scope === 'global'
    ? scope
    : current.scope || 'global';
  const scopeTargetId = input.scopeTargetId === undefined
    ? current.scopeTargetId || null
    : sanitizeString(input.scopeTargetId) || null;

  const updated: MediaItem = {
    ...current,
    originalName: input.originalName === undefined
      ? current.originalName
      : sanitizeString(input.originalName) || current.originalName,
    folderId: input.folderId === undefined ? current.folderId : sanitizeString(input.folderId) || null,
    pageIds: nextScope === 'page' && scopeTargetId && !pageIds.includes(scopeTargetId)
      ? [...pageIds, scopeTargetId]
      : pageIds,
    postIds: nextScope === 'post' && scopeTargetId && !postIds.includes(scopeTargetId)
      ? [...postIds, scopeTargetId]
      : postIds,
    tags: Array.isArray(rawTags)
      ? rawTags.map(sanitizeString).filter(Boolean)
      : typeof rawTags === 'string'
        ? rawTags.split(',').map((tag) => tag.trim()).filter(Boolean)
        : current.tags,
    metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? {
          ...current.metadata,
          ...input.metadata as Record<string, unknown>,
        }
      : current.metadata,
    altText: input.altText === undefined ? current.altText : sanitizeString(input.altText) || null,
    caption: input.caption === undefined ? current.caption : sanitizeString(input.caption) || null,
    uploadedBy: input.uploadedBy === undefined ? current.uploadedBy : sanitizeString(input.uploadedBy) || null,
    scope: nextScope,
    scopeTargetId,
    visibility: visibility === 'private' || visibility === 'public'
      ? visibility
      : current.visibility || 'public',
    updatedAt: new Date().toISOString(),
  };

  MEDIA_LIBRARY[index] = updated;
  persistRuntimeMediaCatalog();
  return clone(updated);
}

export function deleteMediaItem(siteId: string, mediaId: string): MediaItem | undefined {
  ensurePersistedMediaLoaded();

  const index = MEDIA_LIBRARY.findIndex((item) => item.siteId === siteId && item.id === mediaId);
  if (index === -1) {
    return undefined;
  }

  const [removed] = MEDIA_LIBRARY.splice(index, 1);
  persistRuntimeMediaCatalog();
  return clone(removed);
}

export function listFormsBySite(siteId: string, filters: { pageId?: string; postId?: string } = {}): FormDefinition[] {
  const staticForms = FORM_LIBRARY.filter(
    (form) => form.siteId === siteId && matchesFormContextFilter(form, filters),
  );
  const dynamicForms = getDynamicFormsBySite(siteId).filter((form) => matchesFormContextFilter(form, filters));

  return clone(mergeFormDefinitions(staticForms, dynamicForms));
}

export function getFormById(siteId: string, formId: string): FormDefinition | undefined {
  const form = listFormsBySite(siteId).find(
    (item) => normalizeIdentifier(item.id) === normalizeIdentifier(formId),
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
  const reportReasons = new Set<CommentReportReason>(comment.reportReasons || []);
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
    commentThreadId?: string;
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
    commentThreadId,
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

  if (commentThreadId) {
    filtered = filtered.filter((comment) => comment.commentThreadId === commentThreadId);
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
    commentThreadId?: string;
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
  commentThreadId?: string;
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
    commentThreadId: params.commentThreadId || undefined,
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

export function getCanonicalPathForPage(page: Pick<StorePage, 'isHomepage' | 'slug'> | null): string {
  if (!page) {
    return '/';
  }

  if (page.isHomepage || page.slug === 'index') {
    return '/';
  }

  return `/${page.slug}`;
}

export function getMediaById(siteId: string, id: string): MediaItem | undefined {
  ensurePersistedMediaLoaded();
  const item = MEDIA_LIBRARY.find((media) => media.siteId === siteId && media.id === id);
  return item ? clone(item) : undefined;
}

export { type ContentRevision, type Pagination, type SiteNavigationItem, type StoreBlogPost, type StorePage, type StoreSettings, type StoreSite, type StoreUser };

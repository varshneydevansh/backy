import { DEFAULT_THEME } from '@backy-cms/core';
import type {
  Comment,
  CommentTargetType,
  FormDefinition,
  FormSubmission,
  MediaItem,
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
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const FORM_SUBMISSIONS: FormSubmission[] = [];

let commentStore: Comment[] = [...COMMENT_LIST];
let formSubmissions: FormSubmission[] = [...FORM_SUBMISSIONS];

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

export function createFormSubmission(record: {
  siteId: string;
  formId: string;
  values: Record<string, unknown>;
  pageId?: string | null;
  postId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  requestId?: string;
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
    status: 'pending',
    submittedAt: new Date().toISOString(),
  };

  formSubmissions = [submission, ...formSubmissions];
  return clone(submission);
}

export function listFormSubmissions(formId: string, limit = 20, offset = 0): { data: FormSubmission[]; pagination: Pagination } {
  const records = formSubmissions.filter((submission) => submission.formId === formId);
  const paginated = records.slice(offset, offset + limit);

  return {
    data: clone(paginated),
    pagination: getPagination(records.length, limit, offset),
  };
}

export function getCommentsByTarget(
  siteId: string,
  params: {
    targetType: CommentTargetType;
    targetId: string;
    status?: 'pending' | 'approved' | 'rejected' | 'spam';
    limit?: number;
    offset?: number;
  },
): { comments: Comment[]; count: number; pagination: Pagination } {
  const { targetType, targetId, status = 'approved', limit = 20, offset = 0 } = params;

  const filtered = commentStore
    .filter((comment) => comment.siteId === siteId)
    .filter((comment) => comment.targetType === targetType)
    .filter((comment) => comment.targetId === targetId)
    .filter((comment) => comment.status === status);

  const paginated = filtered.slice(offset, offset + limit);

  return {
    comments: clone(paginated),
    count: filtered.length,
    pagination: getPagination(filtered.length, limit, offset),
  };
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  commentStore = [comment, ...commentStore];
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

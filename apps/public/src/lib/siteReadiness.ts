import {
  getAdminPageById,
  getBlogPosts,
  getCanonicalPathForPage,
  getMediaList,
  getPageSummary,
  getSiteNavigation,
  listCollections,
  listReusableSections,
  type StoreBlogPost,
  type StorePage,
  type StoreSite,
} from '@/lib/backyStore';
import type { Site } from '@backy-cms/core';
import type { BackyPage, BackyPost, BackyRepositories } from '@backy-cms/core/repositories';

type ReadinessSeverity = 'error' | 'warning' | 'info';
type ReadinessStatus = 'pass' | 'fail' | 'notice';

export interface ReadinessCheck {
  id: string;
  category: 'site' | 'page' | 'seo' | 'navigation' | 'content' | 'media' | 'layout';
  label: string;
  status: ReadinessStatus;
  severity: ReadinessSeverity;
  message: string;
  target?: {
    type: 'site' | 'page' | 'post' | 'collection' | 'media' | 'section';
    id: string;
    label?: string;
  };
  details?: Record<string, unknown>;
}

export interface PageReadiness {
  id: string;
  title: string;
  slug: string;
  path: string;
  status: StorePage['status'];
  isHomepage: boolean;
  canvasSize: StorePage['content']['canvasSize'];
  elementCount: number;
  score: number;
  statusLabel: 'ready' | 'needs-attention' | 'blocked';
  checks: ReadinessCheck[];
}

export interface BlogPostReadiness {
  id: string;
  title: string;
  slug: string;
  path: string;
  status: StoreBlogPost['status'];
  canvasSize: StorePage['content']['canvasSize'] | null;
  elementCount: number;
  hasLegacyContent: boolean;
  score: number;
  statusLabel: 'ready' | 'needs-attention' | 'blocked';
  checks: ReadinessCheck[];
}

export interface SiteReadiness {
  site: {
    id: string;
    slug: string;
    name: string;
    status: StoreSite['status'];
    isPublished: boolean;
  };
  score: number;
  statusLabel: 'ready' | 'needs-attention' | 'blocked';
  summary: {
    errors: number;
    warnings: number;
    notices: number;
    totalChecks: number;
    passedChecks: number;
    pages: number;
    publishedPages: number;
    posts: number;
    collections: number;
    media: number;
    reusableSections: number;
  };
  checks: ReadinessCheck[];
  pages: PageReadiness[];
  posts: BlogPostReadiness[];
}

const isBlank = (value: unknown): boolean => (
  typeof value !== 'string' || value.trim().length === 0
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const repositoryCanvasSize = (content: BackyPage['content'] | BackyPost['content']) => {
  const metadata = isRecord(content.metadata) ? content.metadata : {};
  const canvasSize = isRecord(metadata.canvasSize) ? metadata.canvasSize : {};
  const width = typeof canvasSize.width === 'number' ? canvasSize.width : 1200;
  const height = typeof canvasSize.height === 'number' ? canvasSize.height : 900;

  return { width, height };
};

const repositoryCustomValue = (
  content: BackyPage['content'] | BackyPost['content'],
  key: 'customCSS' | 'customJS',
): string | undefined => {
  const metadata = isRecord(content.metadata) ? content.metadata : {};
  return typeof metadata[key] === 'string' ? metadata[key] : undefined;
};

const repositoryPageToStorePage = (page: BackyPage): StorePage => ({
  ...page,
  description: page.description || null,
  content: {
    elements: page.content.elements as unknown as StorePage['content']['elements'],
    canvasSize: repositoryCanvasSize(page.content),
    customCSS: repositoryCustomValue(page.content, 'customCSS'),
    customJS: repositoryCustomValue(page.content, 'customJS'),
    contentDocument: page.content,
  },
  meta: {
    ...page.meta,
    title: page.meta?.title || page.title,
    description: page.meta?.description || page.description || null,
    ogImage: page.meta?.ogImage || null,
    canonical: page.meta?.canonical || null,
  },
});

const repositoryPostToStorePost = (post: BackyPost): StoreBlogPost => ({
  ...post,
  content: {
    elements: post.content.elements,
    canvasSize: repositoryCanvasSize(post.content),
    customCSS: repositoryCustomValue(post.content, 'customCSS'),
    customJS: repositoryCustomValue(post.content, 'customJS'),
    contentDocument: post.content,
  } as unknown as StoreBlogPost['content'],
  meta: post.meta,
});

const repositorySiteToStoreSite = (site: Site): StoreSite => ({
  id: site.id,
  name: site.name,
  slug: site.slug,
  description: site.description || '',
  customDomain: site.customDomain,
  status: site.isPublished ? 'published' : 'draft',
  isPublished: site.isPublished,
  theme: {
    colors: Object.fromEntries(
      Object.entries(site.theme?.colors || {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ),
    fonts: site.theme?.fonts || {},
    spacing: site.theme?.spacing,
    customCSS: typeof site.theme?.customCSS === 'string' ? site.theme.customCSS : '',
  },
});

const makeCheck = (
  id: string,
  category: ReadinessCheck['category'],
  label: string,
  passed: boolean,
  severity: ReadinessSeverity,
  message: string,
  target?: ReadinessCheck['target'],
  details?: Record<string, unknown>,
): ReadinessCheck => ({
  id,
  category,
  label,
  status: passed ? 'pass' : severity === 'info' ? 'notice' : 'fail',
  severity,
  message,
  target,
  details,
});

const walkElements = (
  elements: StorePage['content']['elements'],
  visit: (element: StorePage['content']['elements'][number]) => void,
) => {
  for (const element of elements) {
    visit(element);
    if (Array.isArray(element.children) && element.children.length > 0) {
      walkElements(element.children, visit);
    }
  }
};

const countElements = (page: StorePage): number => {
  let count = 0;
  walkElements(page.content.elements || [], () => {
    count += 1;
  });
  return count;
};

const countPostElements = (post: StoreBlogPost): number => {
  const elements = Array.isArray(post.content?.elements)
    ? post.content.elements as StorePage['content']['elements']
    : [];
  let count = 0;
  walkElements(elements, () => {
    count += 1;
  });
  return count;
};

const countOutOfBoundsElements = (page: StorePage) => {
  let negative = 0;
  let outside = 0;
  const canvas = page.content.canvasSize || { width: 0, height: 0 };

  walkElements(page.content.elements || [], (element) => {
    if (element.x < 0 || element.y < 0 || element.width <= 0 || element.height <= 0) {
      negative += 1;
      return;
    }

    if (element.x + element.width > canvas.width || element.y + element.height > canvas.height) {
      outside += 1;
    }
  });

  return { negative, outside };
};

const countPostOutOfBoundsElements = (post: StoreBlogPost) => {
  const elements = Array.isArray(post.content?.elements)
    ? post.content.elements as StorePage['content']['elements']
    : [];
  const canvasInput = post.content?.canvasSize as Partial<StorePage['content']['canvasSize']> | undefined;
  const canvas = {
    width: Number(canvasInput?.width) || 0,
    height: Number(canvasInput?.height) || 0,
  };
  let negative = 0;
  let outside = 0;

  walkElements(elements, (element) => {
    if (element.x < 0 || element.y < 0 || element.width <= 0 || element.height <= 0) {
      negative += 1;
      return;
    }

    if (canvas.width > 0 && canvas.height > 0 && (
      element.x + element.width > canvas.width ||
      element.y + element.height > canvas.height
    )) {
      outside += 1;
    }
  });

  return { negative, outside };
};

const summarizeChecks = (checks: ReadinessCheck[]) => {
  const errors = checks.filter((check) => check.status !== 'pass' && check.severity === 'error').length;
  const warnings = checks.filter((check) => check.status !== 'pass' && check.severity === 'warning').length;
  const notices = checks.filter((check) => check.status !== 'pass' && check.severity === 'info').length;
  const passedChecks = checks.filter((check) => check.status === 'pass').length;
  const totalChecks = checks.length;
  const score = totalChecks ? Math.round((passedChecks / totalChecks) * 100) : 100;
  const statusLabel = errors > 0 ? 'blocked' : warnings > 0 ? 'needs-attention' : 'ready';

  return { errors, warnings, notices, passedChecks, totalChecks, score, statusLabel } as const;
};

export const buildPageReadiness = (page: StorePage): PageReadiness => {
  const elementCount = countElements(page);
  const canvas = page.content.canvasSize || { width: 0, height: 0 };
  const bounds = countOutOfBoundsElements(page);
  const target = { type: 'page' as const, id: page.id, label: page.title };
  const canonical = page.meta?.canonical || getCanonicalPathForPage(page);
  const checks: ReadinessCheck[] = [
    makeCheck(`page:${page.id}:title`, 'page', 'Page title', !isBlank(page.title), 'error', 'Page title is required.', target),
    makeCheck(`page:${page.id}:slug`, 'page', 'Page slug', !isBlank(page.slug), 'error', 'Page slug is required.', target),
    makeCheck(`page:${page.id}:canvas-size`, 'layout', 'Canvas dimensions', canvas.width >= 320 && canvas.height >= 320, 'error', 'Canvas must be at least 320px by 320px.', target, canvas),
    makeCheck(`page:${page.id}:elements`, 'layout', 'Canvas elements', elementCount > 0, 'warning', 'Page has no canvas elements.', target, { elementCount }),
    makeCheck(`page:${page.id}:bounds`, 'layout', 'Element bounds', bounds.negative === 0, 'error', 'Elements must have positive dimensions and non-negative coordinates.', target, bounds),
    makeCheck(`page:${page.id}:overflow`, 'layout', 'Canvas overflow', bounds.outside === 0, 'warning', 'Some elements extend past the canvas dimensions.', target, bounds),
    makeCheck(`page:${page.id}:seo-title`, 'seo', 'SEO title', !isBlank(page.meta?.title), 'warning', 'SEO title is missing.', target),
    makeCheck(`page:${page.id}:seo-description`, 'seo', 'SEO description', !isBlank(page.meta?.description), 'warning', 'SEO description is missing.', target),
    makeCheck(`page:${page.id}:canonical`, 'seo', 'Canonical path', !isBlank(page.meta?.canonical || canonical), 'warning', 'Canonical path is missing.', target, { canonical }),
    makeCheck(`page:${page.id}:indexable`, 'seo', 'Indexable published page', page.status !== 'published' || page.meta?.noIndex !== true, 'warning', 'Published page is marked noindex.', target),
  ];
  const summary = summarizeChecks(checks);

  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    path: canonical,
    status: page.status,
    isHomepage: page.isHomepage,
    canvasSize: canvas,
    elementCount,
    score: summary.score,
    statusLabel: summary.statusLabel,
    checks,
  };
};

export const buildBlogPostReadiness = (post: StoreBlogPost): BlogPostReadiness => {
  const elementCount = countPostElements(post);
  const canvasInput = post.content?.canvasSize as Partial<StorePage['content']['canvasSize']> | undefined;
  const canvas = canvasInput && (Number(canvasInput.width) || Number(canvasInput.height))
    ? {
        width: Number(canvasInput.width) || 0,
        height: Number(canvasInput.height) || 0,
      }
    : null;
  const bounds = countPostOutOfBoundsElements(post);
  const hasLegacyContent = !isBlank(post.content?.html) || !isBlank(post.excerpt);
  const hasCanvasElements = elementCount > 0;
  const target = { type: 'post' as const, id: post.id, label: post.title };
  const canonical = post.meta?.canonical || `/blog/${post.slug}`;
  const checks: ReadinessCheck[] = [
    makeCheck(`post:${post.id}:title`, 'content', 'Post title', !isBlank(post.title), 'error', 'Post title is required.', target),
    makeCheck(`post:${post.id}:slug`, 'content', 'Post slug', !isBlank(post.slug), 'error', 'Post slug is required.', target),
    makeCheck(`post:${post.id}:content`, 'content', 'Post content', hasCanvasElements || hasLegacyContent, 'warning', 'Post has no body content.', target, { elementCount, hasLegacyContent }),
    makeCheck(`post:${post.id}:canvas-size`, 'layout', 'Canvas dimensions', !hasCanvasElements || (canvas !== null && canvas.width >= 320 && canvas.height >= 320), 'error', 'Canvas-authored posts must be at least 320px by 320px.', target, canvas || undefined),
    makeCheck(`post:${post.id}:bounds`, 'layout', 'Element bounds', bounds.negative === 0, 'error', 'Post elements must have positive dimensions and non-negative coordinates.', target, bounds),
    makeCheck(`post:${post.id}:overflow`, 'layout', 'Canvas overflow', bounds.outside === 0, 'warning', 'Some post elements extend past the canvas dimensions.', target, bounds),
    makeCheck(`post:${post.id}:seo-title`, 'seo', 'SEO title', !isBlank(post.meta?.title), 'warning', 'SEO title is missing.', target),
    makeCheck(`post:${post.id}:seo-description`, 'seo', 'SEO description', !isBlank(post.meta?.description), 'warning', 'SEO description is missing.', target),
    makeCheck(`post:${post.id}:canonical`, 'seo', 'Canonical path', !isBlank(canonical), 'warning', 'Canonical path is missing.', target, { canonical }),
    makeCheck(`post:${post.id}:indexable`, 'seo', 'Indexable published post', post.status !== 'published' || post.meta?.noIndex !== true, 'warning', 'Published post is marked noindex.', target),
  ];
  const summary = summarizeChecks(checks);

  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    path: canonical,
    status: post.status,
    canvasSize: canvas,
    elementCount,
    hasLegacyContent,
    score: summary.score,
    statusLabel: summary.statusLabel,
    checks,
  };
};

const normalizeCanonicalPath = (path: string): string => {
  const trimmed = path.trim();
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : '/';
};

const withCanonicalConflictChecks = (
  pages: PageReadiness[],
  posts: BlogPostReadiness[],
) => {
  const routeRefs = [
    ...pages
      .filter((page) => page.status !== 'archived')
      .map((page) => ({
        kind: 'page' as const,
        id: page.id,
        label: page.title,
        path: normalizeCanonicalPath(page.path),
      })),
    ...posts
      .filter((post) => post.status !== 'archived')
      .map((post) => ({
        kind: 'post' as const,
        id: post.id,
        label: post.title,
        path: normalizeCanonicalPath(post.path),
      })),
  ];

  const routesByPath = new Map<string, typeof routeRefs>();
  for (const routeRef of routeRefs) {
    routesByPath.set(routeRef.path, [...(routesByPath.get(routeRef.path) || []), routeRef]);
  }

  const conflictChecks = new Map<string, ReadinessCheck>();
  for (const [canonical, refs] of routesByPath.entries()) {
    if (refs.length < 2) {
      continue;
    }

    for (const ref of refs) {
      const conflicts = refs
        .filter((item) => item.id !== ref.id)
        .map((item) => ({ type: item.kind, id: item.id, label: item.label }));
      const target = { type: ref.kind, id: ref.id, label: ref.label };

      conflictChecks.set(`${ref.kind}:${ref.id}`, makeCheck(
        `${ref.kind}:${ref.id}:canonical-conflict`,
        'seo',
        'Unique canonical path',
        false,
        'error',
        `Canonical path "${canonical}" is shared with another route.`,
        target,
        { canonical, conflicts },
      ));
    }
  }

  return {
    pages: pages.map((page) => {
      const conflictCheck = conflictChecks.get(`page:${page.id}`);
      if (!conflictCheck) {
        return page;
      }
      const checks = [...page.checks, conflictCheck];
      const summary = summarizeChecks(checks);
      return {
        ...page,
        checks,
        score: summary.score,
        statusLabel: summary.statusLabel,
      };
    }),
    posts: posts.map((post) => {
      const conflictCheck = conflictChecks.get(`post:${post.id}`);
      if (!conflictCheck) {
        return post;
      }
      const checks = [...post.checks, conflictCheck];
      const summary = summarizeChecks(checks);
      return {
        ...post,
        checks,
        score: summary.score,
        statusLabel: summary.statusLabel,
      };
    }),
  };
};

export const buildSiteReadiness = (site: StoreSite): SiteReadiness => {
  const pageSummaries = getPageSummary(site.id, { includeUnpublished: true });
  const pages = pageSummaries
    .map((page) => getAdminPageById(site.id, page.id))
    .filter((page): page is StorePage => !!page);
  const homepageCount = pages.filter((page) => page.isHomepage).length;
  const publishedPages = pages.filter((page) => page.status === 'published').length;
  const posts = getBlogPosts(site.id, { includeUnpublished: true, limit: 1000 }).posts;
  const collections = listCollections(site.id, { includeUnpublished: true });
  const media = getMediaList(site.id, { limit: 1000 }).media;
  const reusableSections = listReusableSections(site.id, { status: 'all' });
  const navigation = getSiteNavigation(site.id, { includeUnpublished: true }).primary;

  const siteTarget = { type: 'site' as const, id: site.id, label: site.name };
  const readinessWithCanonicalChecks = withCanonicalConflictChecks(
    pages.map(buildPageReadiness),
    posts.map(buildBlogPostReadiness),
  );
  const pageReadiness = readinessWithCanonicalChecks.pages;
  const postReadiness = readinessWithCanonicalChecks.posts;
  const checks: ReadinessCheck[] = [
    makeCheck('site:name', 'site', 'Site name', !isBlank(site.name), 'error', 'Site name is required.', siteTarget),
    makeCheck('site:slug', 'site', 'Site slug', !isBlank(site.slug), 'error', 'Site slug is required.', siteTarget),
    makeCheck('site:description', 'site', 'Site description', !isBlank(site.description), 'warning', 'Site description is missing.', siteTarget),
    makeCheck('site:not-archived', 'site', 'Site lifecycle', site.status !== 'archived', 'error', 'Archived sites are not ready for public delivery.', siteTarget, { status: site.status }),
    makeCheck('site:homepage', 'navigation', 'Homepage', homepageCount === 1, 'error', 'Site must have exactly one homepage.', siteTarget, { homepageCount }),
    makeCheck('site:published-pages', 'page', 'Published pages', publishedPages > 0, 'warning', 'Site has no published pages.', siteTarget, { publishedPages }),
    makeCheck('site:navigation', 'navigation', 'Navigation entries', navigation.length > 0, 'warning', 'Navigation has no page entries.', siteTarget, { navigationCount: navigation.length }),
    makeCheck('site:theme-colors', 'site', 'Theme colors', Object.keys(site.theme?.colors || {}).length > 0, 'warning', 'Theme colors are missing.', siteTarget),
    makeCheck('site:theme-fonts', 'site', 'Theme fonts', !isBlank(site.theme?.fonts?.heading) || !isBlank(site.theme?.fonts?.body), 'warning', 'Theme fonts are missing.', siteTarget),
    makeCheck('site:media-library', 'media', 'Media library', media.length > 0, 'info', 'Media library has no assets.', siteTarget, { mediaCount: media.length }),
    makeCheck('site:collections', 'content', 'Collections', collections.length > 0, 'info', 'No CMS collections are configured.', siteTarget, { collectionCount: collections.length }),
    makeCheck('site:reusable-sections', 'content', 'Reusable sections', reusableSections.length > 0, 'info', 'No reusable sections are saved.', siteTarget, { reusableSectionCount: reusableSections.length }),
    ...pageReadiness.flatMap((page) => page.checks),
    ...postReadiness.flatMap((post) => post.checks),
  ];
  const summary = summarizeChecks(checks);

  return {
    site: {
      id: site.id,
      slug: site.slug,
      name: site.name,
      status: site.status,
      isPublished: site.isPublished,
    },
    score: summary.score,
    statusLabel: summary.statusLabel,
    summary: {
      errors: summary.errors,
      warnings: summary.warnings,
      notices: summary.notices,
      totalChecks: summary.totalChecks,
      passedChecks: summary.passedChecks,
      pages: pages.length,
      publishedPages,
      posts: posts.length,
      collections: collections.length,
      media: media.length,
      reusableSections: reusableSections.length,
    },
    checks,
    pages: pageReadiness,
    posts: postReadiness,
  };
};

export const buildRepositorySiteReadiness = async (
  repositories: BackyRepositories,
  site: Site,
): Promise<SiteReadiness> => {
  const [
    pageResult,
    postResult,
    collectionResult,
    mediaResult,
    reusableSectionResult,
  ] = await Promise.all([
    repositories.pages.list({ siteId: site.id, includeUnpublished: true, status: 'all', limit: 1000 }),
    repositories.posts.list({ siteId: site.id, includeUnpublished: true, status: 'all', limit: 1000 }),
    repositories.collections.list({ siteId: site.id, includeUnpublished: true, status: 'all', limit: 1000 }),
    repositories.media.list({ siteId: site.id, type: 'all', visibility: 'all', limit: 1000 }),
    repositories.reusableSections.list({ siteId: site.id, status: 'all', limit: 1000 }),
  ]);

  const pages = pageResult.items.map(repositoryPageToStorePage);
  const posts = postResult.items.map(repositoryPostToStorePost);
  const collections = collectionResult.items;
  const media = mediaResult.items;
  const reusableSections = reusableSectionResult.items;
  const homepageCount = pages.filter((page) => page.isHomepage).length;
  const publishedPages = pages.filter((page) => page.status === 'published').length;
  const navigation = pages.filter((page) => page.status !== 'archived');

  const siteTarget = { type: 'site' as const, id: site.id, label: site.name };
  const storeSite = repositorySiteToStoreSite(site);
  const readinessWithCanonicalChecks = withCanonicalConflictChecks(
    pages.map(buildPageReadiness),
    posts.map(buildBlogPostReadiness),
  );
  const pageReadiness = readinessWithCanonicalChecks.pages;
  const postReadiness = readinessWithCanonicalChecks.posts;
  const checks: ReadinessCheck[] = [
    makeCheck('site:name', 'site', 'Site name', !isBlank(site.name), 'error', 'Site name is required.', siteTarget),
    makeCheck('site:slug', 'site', 'Site slug', !isBlank(site.slug), 'error', 'Site slug is required.', siteTarget),
    makeCheck('site:description', 'site', 'Site description', !isBlank(site.description), 'warning', 'Site description is missing.', siteTarget),
    makeCheck('site:not-archived', 'site', 'Site lifecycle', true, 'error', 'Archived sites are not ready for public delivery.', siteTarget, { status: storeSite.status }),
    makeCheck('site:homepage', 'navigation', 'Homepage', homepageCount === 1, 'error', 'Site must have exactly one homepage.', siteTarget, { homepageCount }),
    makeCheck('site:published-pages', 'page', 'Published pages', publishedPages > 0, 'warning', 'Site has no published pages.', siteTarget, { publishedPages }),
    makeCheck('site:navigation', 'navigation', 'Navigation entries', navigation.length > 0, 'warning', 'Navigation has no page entries.', siteTarget, { navigationCount: navigation.length }),
    makeCheck('site:theme-colors', 'site', 'Theme colors', Object.keys(storeSite.theme?.colors || {}).length > 0, 'warning', 'Theme colors are missing.', siteTarget),
    makeCheck('site:theme-fonts', 'site', 'Theme fonts', !isBlank(storeSite.theme?.fonts?.heading) || !isBlank(storeSite.theme?.fonts?.body), 'warning', 'Theme fonts are missing.', siteTarget),
    makeCheck('site:media-library', 'media', 'Media library', media.length > 0, 'info', 'Media library has no assets.', siteTarget, { mediaCount: media.length }),
    makeCheck('site:collections', 'content', 'Collections', collections.length > 0, 'info', 'No CMS collections are configured.', siteTarget, { collectionCount: collections.length }),
    makeCheck('site:reusable-sections', 'content', 'Reusable sections', reusableSections.length > 0, 'info', 'No reusable sections are saved.', siteTarget, { reusableSectionCount: reusableSections.length }),
    ...pageReadiness.flatMap((page) => page.checks),
    ...postReadiness.flatMap((post) => post.checks),
  ];
  const summary = summarizeChecks(checks);

  return {
    site: {
      id: site.id,
      slug: site.slug,
      name: site.name,
      status: storeSite.status,
      isPublished: site.isPublished,
    },
    score: summary.score,
    statusLabel: summary.statusLabel,
    summary: {
      errors: summary.errors,
      warnings: summary.warnings,
      notices: summary.notices,
      totalChecks: summary.totalChecks,
      passedChecks: summary.passedChecks,
      pages: pages.length,
      publishedPages,
      posts: posts.length,
      collections: collections.length,
      media: media.length,
      reusableSections: reusableSections.length,
    },
    checks,
    pages: pageReadiness,
    posts: postReadiness,
  };
};

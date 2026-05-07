import {
  getAdminPageById,
  getBlogPosts,
  getCanonicalPathForPage,
  getMediaList,
  getPageSummary,
  getSiteNavigation,
  listCollections,
  listReusableSections,
  type StorePage,
  type StoreSite,
} from '@/lib/backyStore';

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
}

const isBlank = (value: unknown): boolean => (
  typeof value !== 'string' || value.trim().length === 0
);

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
  const canonical = getCanonicalPathForPage(page);
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
  const pageReadiness = pages.map(buildPageReadiness);
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
  };
};

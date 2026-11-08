import type { BackyPost, Site } from '@backy-cms/core';
import { getHostedRouteUrl, getSiteCanonicalBaseUrl } from './canonicalRouteUrl';

interface BlogRssTerm {
  id: string;
  name: string;
}

interface BlogRssAuthor {
  id: string;
  name: string;
  email?: string | null;
}

interface BlogRssSite {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  customDomain?: string | null;
  settings?: Site['settings'];
}

export interface BlogRssPost {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  content?: unknown;
  categoryIds?: string[];
  tagIds?: string[];
  authorId?: string | null;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  meta?: unknown;
}

export interface BlogRssInput {
  site: BlogRssSite;
  posts: BlogRssPost[];
  categories?: BlogRssTerm[];
  tags?: BlogRssTerm[];
  authors?: BlogRssAuthor[];
  origin: string;
  feedPath?: string;
}

const escapeXml = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const dateValue = (value: unknown): string => {
  const source = textValue(value);
  if (!source) return '';
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? '' : date.toUTCString();
};

/** Authored original publication date takes precedence over genuine CMS publication. */
const isoCalendarDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(value)) return null;
  const calendar = value.slice(0, 10), date = new Date(calendar);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === calendar && Number.isFinite(Date.parse(value)) ? value : null;
};

export function blogRssPublicationDate(post: Pick<BlogRssPost, 'meta' | 'publishedAt'>): string | null {
  const meta = post.meta && typeof post.meta === 'object' && !Array.isArray(post.meta) ? post.meta as Record<string, unknown> : {};
  return isoCalendarDate(meta.originalPublishedAt) || isoCalendarDate(post.publishedAt);
}

/** No eligibility filtering: handlers must pass only public, index-eligible posts. */
export function sortBlogRssPosts<T extends BlogRssPost>(posts: readonly T[]): T[] {
  return posts.map((post, index) => ({ post, index, date: blogRssPublicationDate(post) })).sort((left, right) => {
    if (left.date && right.date) {
      const delta = Date.parse(right.date) - Date.parse(left.date);
      return delta || (left.post.id < right.post.id ? -1 : left.post.id > right.post.id ? 1 : left.index - right.index);
    }
    return left.date ? -1 : right.date ? 1 : left.index - right.index;
  }).map(item => item.post);
}

const stripHtml = (value: string): string => (
  value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const contentText = (content: unknown): string => {
  if (typeof content === 'string') return stripHtml(content);
  if (!content || typeof content !== 'object') return '';
  const elements = Array.isArray((content as { elements?: unknown }).elements)
    ? (content as { elements: unknown[] }).elements
    : [];

  return elements
    .map((element) => {
      if (!element || typeof element !== 'object') return '';
      const nodeContent = (element as { content?: unknown }).content;
      if (typeof nodeContent === 'string') return nodeContent;
      if (nodeContent && typeof nodeContent === 'object') {
        return textValue((nodeContent as { text?: unknown }).text);
      }
      return '';
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const postDescription = (post: BlogRssPost): string => {
  const excerpt = textValue(post.excerpt);
  if (excerpt) return stripHtml(excerpt);
  return contentText(post.content).slice(0, 280);
};

const postCanonical = (post: BlogRssPost): string => {
  const meta = post.meta && typeof post.meta === 'object' && !Array.isArray(post.meta)
    ? post.meta as { canonical?: unknown }
    : {};
  const canonical = textValue(meta.canonical);
  return canonical || `/blog/${post.slug}`;
};

const termNames = (ids: string[] | undefined, terms: BlogRssTerm[]): string[] => {
  if (!ids?.length) return [];
  const names = new Map(terms.map((term) => [term.id, term.name]));
  return ids.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
};

const rssItem = (
  post: BlogRssPost,
  input: Required<Pick<BlogRssInput, 'categories' | 'tags' | 'authors'>> & Pick<BlogRssInput, 'site' | 'origin'>,
) => {
  const link = getHostedRouteUrl(input.origin, input.site.slug, postCanonical(post), input.site.customDomain);
  const author = input.authors.find((candidate) => candidate.id === post.authorId);
  const description = postDescription(post);
  const published = dateValue(blogRssPublicationDate(post));
  const categories = [
    ...termNames(post.categoryIds, input.categories),
    ...termNames(post.tagIds, input.tags),
  ];

  return [
    '    <item>',
    `      <title>${escapeXml(post.title)}</title>`,
    `      <link>${escapeXml(link)}</link>`,
    `      <guid isPermaLink="false">${escapeXml(`${input.site.id}:${post.id}`)}</guid>`,
    published ? `      <pubDate>${escapeXml(published)}</pubDate>` : '',
    description ? `      <description>${escapeXml(description)}</description>` : '',
    author?.name ? `      <dc:creator>${escapeXml(author.name)}</dc:creator>` : '',
    ...categories.map((category) => `      <category>${escapeXml(category)}</category>`),
    '    </item>',
  ].filter(Boolean).join('\n');
};

export const buildBlogRssXml = (input: BlogRssInput): string => {
  const categories = input.categories || [];
  const tags = input.tags || [];
  const authors = input.authors || [];
  const canonicalBase = getSiteCanonicalBaseUrl(input.origin, input.site);
  const feedPath = input.feedPath || '/blog/rss.xml';
  const feedUrl = getHostedRouteUrl(input.origin, input.site.slug, feedPath, input.site.customDomain);
  const posts = sortBlogRssPosts(input.posts);
  const description = textValue(input.site.settings?.seo?.defaultDescription) || textValue(input.site.description) || `${input.site.name} blog feed`;
  const latestDate = posts
    .map((post) => Date.parse(blogRssPublicationDate(post) || ''))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    <title>${escapeXml(`${input.site.name} Blog`)}</title>`,
    `    <link>${escapeXml(canonicalBase)}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    latestDate ? `    <lastBuildDate>${escapeXml(new Date(latestDate).toUTCString())}</lastBuildDate>` : '',
    `    <generator>${escapeXml('Backy CMS')}</generator>`,
    ...posts.map((post) => rssItem(post, { site: input.site, origin: input.origin, categories, tags, authors })),
    '  </channel>',
    '</rss>',
    '',
  ].filter((line) => line !== '').join('\n');
};

export const normalizeRepositoryPostForRss = (post: BackyPost): BlogRssPost => ({
  id: post.id,
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt,
  content: post.content,
  categoryIds: post.categoryIds,
  tagIds: post.tagIds,
  authorId: post.authorId,
  publishedAt: post.publishedAt,
  scheduledAt: post.scheduledAt,
  updatedAt: post.updatedAt,
  createdAt: post.createdAt,
  meta: post.meta as unknown,
});

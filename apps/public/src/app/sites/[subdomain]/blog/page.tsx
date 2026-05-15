/**
 * Hosted blog archive renderer.
 *
 * Renders a public, theme-aware archive for published blog posts with search,
 * taxonomy filters, and pagination links.
 */

import { notFound } from 'next/navigation';
import type {
  BackyBlogAuthor,
  BackyBlogCategory,
  BackyBlogTag,
  BackyPost,
  Site,
} from '@backy-cms/core';
import {
  getBlogPosts,
  getSiteByIdOrSlug,
  listBlogAuthors,
  listBlogCategories,
  listBlogTags,
  type StoreBlogPost,
} from '@/lib/backyStore';
import { publicMediaFilePath } from '@/lib/mediaResponsive';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { PageRenderer, type PageContent } from '@/components/PageRenderer';
import AnimationHydrator from '@/components/AnimationHydrator';
import {
  buildBlogArchiveTemplateContent,
  type BlogArchiveTemplateData,
  type BlogArchiveTemplatePost,
} from '@/lib/blogArchiveTemplate';
import type { Metadata } from 'next';

type HostedSite =
  | {
      mode: 'database';
      site: Site;
      repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
    }
  | {
      mode: 'demo';
      site: NonNullable<ReturnType<typeof getSiteByIdOrSlug>>;
      repositories: null;
    };

interface BlogArchiveProps {
  params: Promise<{
    subdomain: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

type ArchiveTheme = {
  colors?: Record<string, string>;
  fonts?: {
    heading?: string;
    body?: string;
    mono?: string;
  };
  spacing?: Record<string, string | number>;
  customCSS?: string;
};

type ArchivePost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImageId: string | null;
  publishedAt: string | null;
  updatedAt: string;
  categoryIds: string[];
  tagIds: string[];
  authorId: string | null;
};

type TaxonomyItem = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  postCount?: number;
};

const PAGE_SIZE = 9;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const firstParam = (value: string | string[] | undefined): string => (
  Array.isArray(value) ? value[0] || '' : value || ''
);

const asPositiveInt = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const stringRecord = (value: unknown): Record<string, string> => (
  isRecord(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {}
);

const normalizeTheme = (site: { theme?: unknown }): ArchiveTheme => {
  const theme = isRecord(site.theme) ? site.theme : {};
  return {
    colors: stringRecord(theme.colors),
    fonts: isRecord(theme.fonts) ? theme.fonts as ArchiveTheme['fonts'] : {},
    spacing: isRecord(theme.spacing) ? theme.spacing as Record<string, string | number> : undefined,
    customCSS: typeof theme.customCSS === 'string' ? theme.customCSS : '',
  };
};

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
  item.status === 'published'
  || (
    item.status === 'scheduled'
    && Boolean(item.scheduledAt)
    && Number.isFinite(Date.parse(item.scheduledAt || ''))
    && Date.parse(item.scheduledAt || '') <= Date.now()
  )
);

async function getSite(subdomain: string): Promise<HostedSite | null> {
  if (!shouldUseDemoStoreFallback()) {
    const repositories = await getRequiredDatabaseRepositories();
    const site = await repositories.sites.getById(subdomain) || await repositories.sites.getBySlug(subdomain);
    return site?.isPublished ? { mode: 'database', site, repositories } : null;
  }

  const site = getSiteByIdOrSlug(subdomain);
  return site?.isPublished ? { mode: 'demo', site, repositories: null } : null;
}

const postDate = (post: ArchivePost) => post.publishedAt || post.updatedAt;

const formatDate = (value: string | null) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const toDemoArchivePost = (post: StoreBlogPost): ArchivePost => ({
  id: post.id,
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt || '',
  featuredImageId: post.featuredImageId,
  publishedAt: post.publishedAt,
  updatedAt: post.updatedAt,
  categoryIds: post.categoryIds,
  tagIds: post.tagIds,
  authorId: post.authorId,
});

const toRepositoryArchivePost = (post: BackyPost): ArchivePost => ({
  id: post.id,
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt || '',
  featuredImageId: post.featuredImageId,
  publishedAt: post.publishedAt,
  updatedAt: post.updatedAt,
  categoryIds: post.categoryIds,
  tagIds: post.tagIds,
  authorId: post.authorId,
});

const toTaxonomyItem = (
  item: BackyBlogCategory | BackyBlogTag | BackyBlogAuthor | TaxonomyItem,
): TaxonomyItem => ({
  id: item.id,
  name: item.name,
  slug: item.slug,
  description: 'description' in item ? item.description : null,
  color: 'color' in item ? item.color : null,
  postCount: item.postCount,
});

const filterHref = (basePath: string, params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
};

const templatePosts = (
  siteId: string,
  blogBasePath: string,
  posts: ArchivePost[],
  data: Awaited<ReturnType<typeof getArchiveData>>,
): BlogArchiveTemplatePost[] => posts.map((post) => {
  const author = post.authorId ? data.authors.find((item) => item.id === post.authorId) : undefined;
  const categories = data.categories.filter((category) => post.categoryIds.includes(category.id));
  const tags = data.tags.filter((tag) => post.tagIds.includes(tag.id));

  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    href: `${blogBasePath}/${post.slug}`,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    ...(post.featuredImageId ? { featuredImageUrl: publicMediaFilePath(siteId, post.featuredImageId) } : {}),
    ...(author ? { authorName: author.name } : {}),
    categoryNames: categories.map((category) => category.name),
    tagNames: tags.map((tag) => tag.name),
  };
});

async function getArchiveData(hostedSite: HostedSite, rawParams: Record<string, string | string[] | undefined>) {
  const category = firstParam(rawParams.category).trim();
  const tag = firstParam(rawParams.tag).trim();
  const author = firstParam(rawParams.author).trim();
  const search = firstParam(rawParams.search).trim();
  const year = asPositiveInt(firstParam(rawParams.year), 0);
  const month = asPositiveInt(firstParam(rawParams.month), 0);
  const page = asPositiveInt(firstParam(rawParams.page), 1);
  const offset = (page - 1) * PAGE_SIZE;

  if (hostedSite.mode === 'database') {
    const { site, repositories } = hostedSite;
    const [categoriesRaw, tagsRaw, authorsRaw] = await Promise.all([
      repositories.blogTaxonomy.listCategories(site.id),
      repositories.blogTaxonomy.listTags(site.id),
      repositories.blogTaxonomy.listAuthors(site.id),
    ]);
    const categories = categoriesRaw.map(toTaxonomyItem);
    const tags = tagsRaw.map(toTaxonomyItem);
    const authors = authorsRaw.map(toTaxonomyItem);
    const activeCategory = category
      ? categories.find((item) => item.id === category || item.slug === category)
      : undefined;
    const activeTag = tag
      ? tags.find((item) => item.id === tag || item.slug === tag)
      : undefined;
    const activeAuthor = author
      ? authors.find((item) => item.id === author || item.slug === author)
      : undefined;
    const postsResult = await repositories.posts.list({
      siteId: site.id,
      includeUnpublished: true,
      status: 'all',
      categoryId: activeCategory?.id,
      tagId: activeTag?.id,
      authorId: activeAuthor?.id,
      search: search || undefined,
      year: year || undefined,
      month: month || undefined,
      limit: 1000,
      offset: 0,
    });
    const allPosts = postsResult.items
      .filter(isPubliclyReadable)
      .map(toRepositoryArchivePost)
      .sort((left, right) => Date.parse(postDate(right)) - Date.parse(postDate(left)));

    return {
      filters: { category, tag, author, search, year, month, page },
      posts: allPosts.slice(offset, offset + PAGE_SIZE),
      total: allPosts.length,
      categories,
      tags,
      authors,
      activeCategory,
      activeTag,
      activeAuthor,
    };
  }

  const { site } = hostedSite;
  const categories = listBlogCategories(site.id).map(toTaxonomyItem);
  const tags = listBlogTags(site.id).map(toTaxonomyItem);
  const authors = listBlogAuthors(site.id).map(toTaxonomyItem);
  const activeCategory = category
    ? categories.find((item) => item.id === category || item.slug === category)
    : undefined;
  const activeTag = tag
    ? tags.find((item) => item.id === tag || item.slug === tag)
    : undefined;
  const activeAuthor = author
    ? authors.find((item) => item.id === author || item.slug === author)
    : undefined;
  const postsResult = getBlogPosts(site.id, {
    categorySlug: category || undefined,
    tagSlug: tag || undefined,
    authorSlug: author || undefined,
    search: search || undefined,
    year: year || undefined,
    month: month || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  return {
    filters: { category, tag, author, search, year, month, page },
    posts: postsResult.posts.map(toDemoArchivePost),
    total: postsResult.pagination?.total || postsResult.posts.length,
    categories,
    tags,
    authors,
    activeCategory,
    activeTag,
    activeAuthor,
  };
}

const archiveDescription = (
  siteName: string,
  activeCategory?: TaxonomyItem,
  activeTag?: TaxonomyItem,
  activeAuthor?: TaxonomyItem,
) => {
  if (activeCategory) {
    return activeCategory.description || `Posts filed under ${activeCategory.name}.`;
  }
  if (activeTag) {
    return activeTag.description || `Posts tagged ${activeTag.name}.`;
  }
  if (activeAuthor) {
    return `Posts by ${activeAuthor.name}.`;
  }

  return `Latest articles from ${siteName}.`;
};

const themeStyle = (theme: ArchiveTheme): React.CSSProperties => {
  const style: React.CSSProperties = {};
  Object.entries(theme.colors || {}).forEach(([key, value]) => {
    (style as Record<string, string>)[`--color-${key}`] = value;
  });
  if (theme.fonts?.heading) {
    (style as Record<string, string>)['--font-heading'] = theme.fonts.heading;
  }
  if (theme.fonts?.body) {
    (style as Record<string, string>)['--font-body'] = theme.fonts.body;
  }
  Object.entries(theme.spacing || {}).forEach(([key, value]) => {
    (style as Record<string, string>)[`--spacing-${key}`] = typeof value === 'number' ? `${value}px` : value;
  });

  return style;
};

export async function generateMetadata({ params, searchParams }: BlogArchiveProps): Promise<Metadata> {
  const { subdomain } = await params;
  const hostedSite = await getSite(subdomain);
  if (!hostedSite) {
    return { title: 'Blog Not Found' };
  }

  const data = await getArchiveData(hostedSite, await searchParams || {});
  const filterName = data.activeCategory?.name || data.activeTag?.name || data.activeAuthor?.name;
  const title = filterName ? `${filterName} Articles` : 'Blog';

  return {
    title,
    description: archiveDescription(hostedSite.site.name, data.activeCategory, data.activeTag, data.activeAuthor),
    alternates: {
      canonical: '/blog',
    },
    openGraph: {
      title,
      description: archiveDescription(hostedSite.site.name, data.activeCategory, data.activeTag, data.activeAuthor),
      url: '/blog',
      siteName: hostedSite.site.name,
      type: 'website',
    },
  };
}

export default async function BlogArchivePage({ params, searchParams }: BlogArchiveProps) {
  const { subdomain } = await params;
  const hostedSite = await getSite(subdomain);
  if (!hostedSite) {
    notFound();
  }

  const data = await getArchiveData(hostedSite, await searchParams || {});
  const theme = normalizeTheme(hostedSite.site);
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const activeTitle = data.activeCategory?.name || data.activeTag?.name || data.activeAuthor?.name || 'All posts';
  const archiveSubtitle = archiveDescription(hostedSite.site.name, data.activeCategory, data.activeTag, data.activeAuthor);
  const blogBasePath = `/sites/${encodeURIComponent(subdomain)}/blog`;
  const templateData: BlogArchiveTemplateData = {
    siteName: hostedSite.site.name,
    basePath: blogBasePath,
    title: 'Blog',
    description: archiveSubtitle,
    activeTitle,
    total: data.total,
    page: data.filters.page,
    totalPages,
    filters: {
      category: data.filters.category,
      tag: data.filters.tag,
      author: data.filters.author,
      search: data.filters.search,
      year: data.filters.year,
      month: data.filters.month,
      page: data.filters.page,
    },
    posts: templatePosts(hostedSite.site.id, blogBasePath, data.posts, data),
  };
  const customArchiveContent = buildBlogArchiveTemplateContent(hostedSite.site.settings, templateData);

  if (customArchiveContent) {
    return (
      <>
        <PageRenderer
          content={customArchiveContent as PageContent}
          theme={theme}
          siteId={hostedSite.site.id}
          pageSlug="blog"
        />
        <AnimationHydrator />
      </>
    );
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .backy-blog-archive {
              min-height: 100vh;
              background: var(--color-background, #f5f7fb);
              color: var(--color-text, #1e293b);
              font-family: var(--font-body, system-ui, sans-serif);
            }
            .backy-blog-archive * {
              box-sizing: border-box;
            }
            .backy-blog-archive a {
              color: inherit;
              text-decoration: none;
            }
            .backy-blog-archive h1,
            .backy-blog-archive h2,
            .backy-blog-archive h3 {
              font-family: var(--font-heading, var(--font-body, system-ui, sans-serif));
            }
            .backy-blog-shell {
              width: min(1120px, calc(100vw - 32px));
              margin: 0 auto;
              padding: 56px 0 72px;
            }
            .backy-blog-hero {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
              gap: 32px;
              align-items: end;
              padding-bottom: 28px;
              border-bottom: 1px solid color-mix(in srgb, var(--color-text, #1e293b) 14%, transparent);
            }
            .backy-blog-kicker {
              margin: 0 0 12px;
              color: var(--color-primary, #3b82f6);
              font-size: 13px;
              font-weight: 700;
              letter-spacing: .08em;
              text-transform: uppercase;
            }
            .backy-blog-title {
              margin: 0;
              max-width: 760px;
              font-size: clamp(42px, 7vw, 84px);
              line-height: .94;
              letter-spacing: 0;
            }
            .backy-blog-subtitle {
              margin: 18px 0 0;
              max-width: 620px;
              color: var(--color-textMuted, #64748b);
              font-size: 18px;
              line-height: 1.65;
            }
            .backy-blog-search {
              display: grid;
              gap: 10px;
            }
            .backy-blog-search label {
              color: var(--color-textMuted, #64748b);
              font-size: 13px;
              font-weight: 700;
            }
            .backy-blog-search-row {
              display: flex;
              gap: 8px;
            }
            .backy-blog-search input {
              min-width: 0;
              flex: 1;
              border: 1px solid color-mix(in srgb, var(--color-text, #1e293b) 16%, transparent);
              border-radius: 8px;
              padding: 12px 14px;
              background: var(--color-surface, #fff);
              color: var(--color-text, #1e293b);
              font: inherit;
            }
            .backy-blog-search button,
            .backy-blog-page-link {
              border: 0;
              border-radius: 8px;
              padding: 12px 16px;
              background: var(--color-primary, #3b82f6);
              color: #fff;
              font: inherit;
              font-weight: 700;
              cursor: pointer;
            }
            .backy-blog-layout {
              display: grid;
              grid-template-columns: 240px minmax(0, 1fr);
              gap: 32px;
              padding-top: 32px;
            }
            .backy-blog-sidebar {
              display: grid;
              align-content: start;
              gap: 24px;
            }
            .backy-blog-filter-group h2 {
              margin: 0 0 10px;
              font-size: 13px;
              letter-spacing: .08em;
              text-transform: uppercase;
            }
            .backy-blog-chip-list {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
            }
            .backy-blog-chip {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              min-height: 34px;
              border: 1px solid color-mix(in srgb, var(--color-text, #1e293b) 14%, transparent);
              border-radius: 999px;
              padding: 7px 11px;
              background: color-mix(in srgb, var(--color-surface, #fff) 86%, transparent);
              color: var(--color-text, #1e293b);
              font-size: 13px;
            }
            .backy-blog-chip[data-active="true"] {
              border-color: var(--color-primary, #3b82f6);
              background: color-mix(in srgb, var(--color-primary, #3b82f6) 14%, var(--color-surface, #fff));
              color: var(--color-primary, #3b82f6);
              font-weight: 700;
            }
            .backy-blog-count {
              color: var(--color-textMuted, #64748b);
              font-size: 12px;
            }
            .backy-blog-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 18px;
            }
            .backy-blog-card {
              min-width: 0;
              overflow: hidden;
              border: 1px solid color-mix(in srgb, var(--color-text, #1e293b) 12%, transparent);
              border-radius: 8px;
              background: var(--color-surface, #fff);
            }
            .backy-blog-card-media {
              aspect-ratio: 16 / 9;
              background: color-mix(in srgb, var(--color-primary, #3b82f6) 18%, var(--color-background, #f5f7fb));
            }
            .backy-blog-card-media img {
              display: block;
              width: 100%;
              height: 100%;
              object-fit: cover;
            }
            .backy-blog-card-body {
              padding: 20px;
            }
            .backy-blog-meta {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
              margin-bottom: 12px;
              color: var(--color-textMuted, #64748b);
              font-size: 13px;
            }
            .backy-blog-card h2 {
              margin: 0;
              font-size: 25px;
              line-height: 1.15;
            }
            .backy-blog-card p {
              margin: 12px 0 0;
              color: var(--color-textMuted, #64748b);
              line-height: 1.65;
            }
            .backy-blog-card-footer {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              margin-top: 20px;
              color: var(--color-primary, #3b82f6);
              font-weight: 700;
            }
            .backy-blog-empty {
              border: 1px dashed color-mix(in srgb, var(--color-text, #1e293b) 18%, transparent);
              border-radius: 8px;
              padding: 48px 24px;
              background: color-mix(in srgb, var(--color-surface, #fff) 70%, transparent);
              text-align: center;
            }
            .backy-blog-empty h2 {
              margin: 0;
              font-size: 28px;
            }
            .backy-blog-empty p {
              margin: 12px auto 0;
              max-width: 520px;
              color: var(--color-textMuted, #64748b);
              line-height: 1.6;
            }
            .backy-blog-pagination {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              margin-top: 28px;
            }
            .backy-blog-page-link[aria-disabled="true"] {
              pointer-events: none;
              opacity: .42;
            }
            @media (max-width: 840px) {
              .backy-blog-shell {
                width: min(100% - 24px, 680px);
                padding-top: 34px;
              }
              .backy-blog-hero,
              .backy-blog-layout {
                grid-template-columns: 1fr;
              }
              .backy-blog-grid {
                grid-template-columns: 1fr;
              }
            }
            ${theme.customCSS || ''}
          `,
        }}
      />
      <main className="backy-blog-archive" style={themeStyle(theme)}>
        <div className="backy-blog-shell">
          <header className="backy-blog-hero">
            <div>
              <p className="backy-blog-kicker">{hostedSite.site.name}</p>
              <h1 className="backy-blog-title">Blog</h1>
              <p className="backy-blog-subtitle">{archiveSubtitle}</p>
            </div>
            <form className="backy-blog-search" action={blogBasePath}>
              <label htmlFor="backy-blog-search-input">Search posts</label>
              <div className="backy-blog-search-row">
                <input id="backy-blog-search-input" name="search" defaultValue={data.filters.search} placeholder="Search articles" />
                <button type="submit">Search</button>
              </div>
            </form>
          </header>

          <section className="backy-blog-layout" aria-label="Blog archive">
            <aside className="backy-blog-sidebar" aria-label="Blog filters">
              <div className="backy-blog-filter-group">
                <h2>Archive</h2>
                <div className="backy-blog-chip-list">
                  <a className="backy-blog-chip" data-active={!data.filters.category && !data.filters.tag && !data.filters.author && !data.filters.search} href={blogBasePath}>
                    All <span className="backy-blog-count">{data.total}</span>
                  </a>
                </div>
              </div>

              {data.categories.length > 0 ? (
                <div className="backy-blog-filter-group">
                  <h2>Categories</h2>
                  <div className="backy-blog-chip-list">
                    {data.categories.map((category) => (
                      <a
                        key={category.id}
                        className="backy-blog-chip"
                        data-active={category.slug === data.filters.category || category.id === data.filters.category}
                        href={filterHref(blogBasePath, { category: category.slug })}
                      >
                        {category.name}
                        {typeof category.postCount === 'number' ? <span className="backy-blog-count">{category.postCount}</span> : null}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {data.tags.length > 0 ? (
                <div className="backy-blog-filter-group">
                  <h2>Tags</h2>
                  <div className="backy-blog-chip-list">
                    {data.tags.map((tag) => (
                      <a
                        key={tag.id}
                        className="backy-blog-chip"
                        data-active={tag.slug === data.filters.tag || tag.id === data.filters.tag}
                        href={filterHref(blogBasePath, { tag: tag.slug })}
                      >
                        {tag.name}
                        {typeof tag.postCount === 'number' ? <span className="backy-blog-count">{tag.postCount}</span> : null}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {data.authors.length > 0 ? (
                <div className="backy-blog-filter-group">
                  <h2>Authors</h2>
                  <div className="backy-blog-chip-list">
                    {data.authors.map((author) => (
                      <a
                        key={author.id}
                        className="backy-blog-chip"
                        data-active={author.slug === data.filters.author || author.id === data.filters.author}
                        href={filterHref(blogBasePath, { author: author.slug })}
                      >
                        {author.name}
                        {typeof author.postCount === 'number' ? <span className="backy-blog-count">{author.postCount}</span> : null}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>

            <div>
              <p className="backy-blog-kicker">{activeTitle} · {data.total} {data.total === 1 ? 'post' : 'posts'}</p>
              {data.posts.length > 0 ? (
                <div className="backy-blog-grid">
                  {data.posts.map((post) => {
                    const postCategories = data.categories.filter((category) => post.categoryIds.includes(category.id));
                    const author = post.authorId ? data.authors.find((item) => item.id === post.authorId) : undefined;
                    return (
                      <article key={post.id} className="backy-blog-card">
                        {post.featuredImageId ? (
                          <a className="backy-blog-card-media" href={`${blogBasePath}/${post.slug}`} aria-label={post.title}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={publicMediaFilePath(hostedSite.site.id, post.featuredImageId)} alt="" />
                          </a>
                        ) : (
                          <a className="backy-blog-card-media" href={`${blogBasePath}/${post.slug}`} aria-label={post.title} />
                        )}
                        <div className="backy-blog-card-body">
                          <div className="backy-blog-meta">
                            {formatDate(postDate(post)) ? <time dateTime={postDate(post)}>{formatDate(postDate(post))}</time> : null}
                            {author ? <span>{author.name}</span> : null}
                            {postCategories.slice(0, 2).map((category) => <span key={category.id}>{category.name}</span>)}
                          </div>
                          <h2><a href={`${blogBasePath}/${post.slug}`}>{post.title}</a></h2>
                          {post.excerpt ? <p>{post.excerpt}</p> : null}
                          <div className="backy-blog-card-footer">
                            <a href={`${blogBasePath}/${post.slug}`}>Read article</a>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="backy-blog-empty">
                  <h2>No posts found</h2>
                  <p>No published posts match the current archive filters.</p>
                </div>
              )}

              {totalPages > 1 ? (
                <nav className="backy-blog-pagination" aria-label="Blog pagination">
                  <a
                    className="backy-blog-page-link"
                    aria-disabled={data.filters.page <= 1}
                    href={filterHref(blogBasePath, { ...data.filters, page: Math.max(1, data.filters.page - 1) })}
                  >
                    Previous
                  </a>
                  <a
                    className="backy-blog-page-link"
                    aria-disabled={data.filters.page >= totalPages}
                    href={filterHref(blogBasePath, { ...data.filters, page: Math.min(totalPages, data.filters.page + 1) })}
                  >
                    Next
                  </a>
                </nav>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

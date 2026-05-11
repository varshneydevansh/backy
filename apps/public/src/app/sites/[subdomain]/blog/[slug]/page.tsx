/**
 * Hosted blog post renderer.
 *
 * Published posts render publicly. Draft posts require a matching preview token.
 */

import { notFound } from 'next/navigation';
import type { BackyPost, Site } from '@backy-cms/core';
import { PageRenderer, type PageContent } from '@/components/PageRenderer';
import AnimationHydrator from '@/components/AnimationHydrator';
import { getBlogPosts, getMediaList, getSiteByIdOrSlug, validatePreviewToken } from '@/lib/backyStore';
import { resolveElementDataBindings } from '@/lib/renderPayload';
import { publicMediaFilePath } from '@/lib/mediaResponsive';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { Metadata } from 'next';
import type { StoreBlogPost } from '@/lib/backyStore';

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

interface PageProps {
  params: Promise<{
    subdomain: string;
    slug: string;
  }>;
  searchParams?: Promise<{
    previewToken?: string | string[];
  }>;
}

const firstParam = (value: string | string[] | undefined): string | undefined => (
  Array.isArray(value) ? value[0] : value
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
  item.status === 'published' && (!item.scheduledAt || new Date(item.scheduledAt).getTime() <= Date.now())
);

const asString = (value: unknown): string => (
  typeof value === 'string' ? value : ''
);

function getStringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function getHostedFontAssets(siteId: string) {
  return getMediaList(siteId, {
    type: 'font',
    visibility: 'public',
    limit: 100,
  }).media.map((font) => ({
    id: font.id,
    family: getStringMetadata(font.metadata, 'fontFamily') || font.originalName.replace(/\.[a-z0-9]+$/i, ''),
    source: 'uploaded' as const,
    url: publicMediaFilePath(siteId, font.id),
    weights: [getStringMetadata(font.metadata, 'fontWeight') || '400'],
    styles: [getStringMetadata(font.metadata, 'fontStyle') === 'italic' || getStringMetadata(font.metadata, 'fontStyle') === 'oblique'
      ? getStringMetadata(font.metadata, 'fontStyle') as 'italic' | 'oblique'
      : 'normal' as const],
    fallbackStack: getStringMetadata(font.metadata, 'fontFallback') || 'system-ui, sans-serif',
    display: getStringMetadata(font.metadata, 'fontDisplay') || 'swap',
    cssFamily: `"${(getStringMetadata(font.metadata, 'fontFamily') || font.originalName.replace(/\.[a-z0-9]+$/i, '')).replace(/["\\]/g, '')}", ${getStringMetadata(font.metadata, 'fontFallback') || 'system-ui, sans-serif'}`,
  }));
}

async function getSite(subdomain: string) {
  if (!shouldUseDemoStoreFallback()) {
    const repositories = await getRequiredDatabaseRepositories();
    const site = await repositories.sites.getById(subdomain) || await repositories.sites.getBySlug(subdomain);
    return site ? { mode: 'database', site, repositories } as HostedSite : null;
  }

  const site = getSiteByIdOrSlug(subdomain);
  return site ? { mode: 'demo', site, repositories: null } as HostedSite : null;
}

async function getRepositoryFontAssets(hostedSite: Extract<HostedSite, { mode: 'database' }>) {
  const fonts = await hostedSite.repositories.media.list({
    siteId: hostedSite.site.id,
    type: 'font',
    visibility: 'public',
    limit: 100,
  });

  return fonts.items.map((font) => ({
    id: font.id,
    family: getStringMetadata(font.metadata, 'fontFamily') || font.originalName.replace(/\.[a-z0-9]+$/i, ''),
    source: 'uploaded' as const,
    url: publicMediaFilePath(hostedSite.site.id, font.id),
    weights: [getStringMetadata(font.metadata, 'fontWeight') || '400'],
    styles: [getStringMetadata(font.metadata, 'fontStyle') === 'italic' || getStringMetadata(font.metadata, 'fontStyle') === 'oblique'
      ? getStringMetadata(font.metadata, 'fontStyle') as 'italic' | 'oblique'
      : 'normal' as const],
    fallbackStack: getStringMetadata(font.metadata, 'fontFallback') || 'system-ui, sans-serif',
    display: getStringMetadata(font.metadata, 'fontDisplay') || 'swap',
    cssFamily: `"${(getStringMetadata(font.metadata, 'fontFamily') || font.originalName.replace(/\.[a-z0-9]+$/i, '')).replace(/["\\]/g, '')}", ${getStringMetadata(font.metadata, 'fontFallback') || 'system-ui, sans-serif'}`,
  }));
}

async function getRepositoryPost(hostedSite: Extract<HostedSite, { mode: 'database' }>, slug: string, previewToken?: string) {
  const post = await hostedSite.repositories.posts.getBySlug(hostedSite.site.id, slug);
  if (!post) {
    return null;
  }

  const canPreview = previewToken
    ? await hostedSite.repositories.contentWorkflows.validatePreviewToken(hostedSite.site.id, 'post', post.id, previewToken)
    : false;

  return isPubliclyReadable(post) || canPreview ? post : null;
}

function repositoryTheme(site: Site) {
  return {
    colors: isRecord(site.theme?.colors) ? site.theme.colors as Record<string, string> : {},
    fonts: isRecord(site.theme?.fonts) ? site.theme.fonts as { heading?: string; body?: string } : {},
    spacing: isRecord(site.theme?.spacing) ? site.theme.spacing as Record<string, string | number> : undefined,
    customCSS: typeof site.theme?.customCSS === 'string' ? site.theme.customCSS : '',
  };
}

function normalizeRepositoryPostContent(post: BackyPost): PageContent {
  return {
    elements: post.content.elements as unknown as PageContent['elements'],
    canvasSize: isRecord(post.content.metadata?.canvasSize)
      ? {
          width: Number(post.content.metadata.canvasSize.width) || 1200,
          height: Number(post.content.metadata.canvasSize.height) || 900,
        }
      : { width: 1200, height: 900 },
    customCSS: typeof post.content.metadata?.customCSS === 'string' ? post.content.metadata.customCSS : undefined,
    contentDocument: post.content,
  };
}

const canonicalForRepositoryPost = (post: BackyPost): string => (
  typeof post.meta?.canonical === 'string' && post.meta.canonical.length > 0 ? post.meta.canonical : `/blog/${post.slug}`
);

const getPostBySlug = (siteId: string, slug: string, previewToken?: string): StoreBlogPost | undefined => {
  const previewPost = previewToken
    ? getBlogPosts(siteId, { slug, includeUnpublished: true }).posts[0]
    : undefined;
  const canPreview = previewPost
    ? validatePreviewToken(siteId, 'post', previewPost.id, previewToken)
    : false;

  return canPreview
    ? previewPost
    : getBlogPosts(siteId, { slug }).posts[0];
};

const normalizePostContent = (siteId: string, post: StoreBlogPost): PageContent => {
  const content = post.content;
  const canvasSize = isRecord(content.canvasSize)
    ? {
        width: Number(content.canvasSize.width) || 900,
        height: Number(content.canvasSize.height) || 720,
      }
    : {
        width: 900,
        height: 720,
      };

  if (Array.isArray(content.elements)) {
    return {
      elements: resolveElementDataBindings(siteId, content.elements) as unknown as PageContent['elements'],
      canvasSize,
      customCSS: asString(content.customCSS),
      customJS: asString(content.customJS),
    };
  }

  const html = asString(content.html);
  return {
    elements: [
      {
        id: `${post.id}-legacy-content`,
        type: html ? 'html' : 'text',
        x: 64,
        y: 64,
        width: 772,
        height: 520,
        props: html
          ? { html }
          : {
              content: post.excerpt || post.title,
              fontSize: 18,
              lineHeight: 1.7,
              color: '#334155',
            },
      },
    ],
    canvasSize,
  };
};

const canonicalForPost = (post: StoreBlogPost): string => (
  post.meta?.canonical || `/blog/${post.slug}`
);

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { subdomain, slug } = await params;
  const previewToken = firstParam((await searchParams)?.previewToken);
  const hostedSite = await getSite(subdomain);

  if (!hostedSite) {
    return { title: 'Post Not Found' };
  }

  if (hostedSite.mode === 'database') {
    const { site } = hostedSite;
    const post = await getRepositoryPost(hostedSite, slug, previewToken);
    if (!post) {
      return { title: 'Post Not Found' };
    }

    const title = typeof post.meta?.title === 'string' ? post.meta.title : post.title;
    const description = typeof post.meta?.description === 'string' ? post.meta.description : post.excerpt || '';
    const canonical = canonicalForRepositoryPost(post);

    return {
      title,
      description,
      keywords: Array.isArray(post.meta?.keywords) ? post.meta.keywords.filter((item): item is string => typeof item === 'string') : [],
      alternates: {
        canonical,
      },
      robots: {
        index: post.status === 'published' && post.meta?.noIndex !== true,
        follow: post.meta?.noFollow === true ? false : true,
      },
      openGraph: {
        title,
        description,
        images: typeof post.meta?.ogImage === 'string' ? [post.meta.ogImage] : undefined,
        url: canonical,
        siteName: site.name,
        type: 'article',
      },
    };
  }

  const { site } = hostedSite;
  const post = getPostBySlug(site.id, slug, previewToken);
  if (!post) {
    return { title: 'Post Not Found' };
  }

  const title = post.meta?.title || post.title;
  const description = post.meta?.description || post.excerpt || '';
  const canonical = canonicalForPost(post);

  return {
    title,
    description,
    keywords: post.meta?.keywords || [],
    alternates: {
      canonical,
    },
    robots: {
      index: post.status === 'published' && post.meta?.noIndex !== true,
      follow: post.meta?.noFollow === true ? false : true,
    },
    openGraph: {
      title,
      description,
      images: post.meta?.ogImage ? [post.meta.ogImage] : undefined,
      url: canonical,
      siteName: site.name,
      type: 'article',
    },
  };
}

export default async function BlogPostPage({ params, searchParams }: PageProps) {
  const { subdomain, slug } = await params;
  const previewToken = firstParam((await searchParams)?.previewToken);
  const hostedSite = await getSite(subdomain);

  if (!hostedSite) {
    notFound();
  }

  if (hostedSite.mode === 'database') {
    const { site } = hostedSite;
    const post = await getRepositoryPost(hostedSite, slug, previewToken);
    if (!post) {
      notFound();
    }

    return (
      <>
        <PageRenderer
          content={normalizeRepositoryPostContent(post)}
          theme={repositoryTheme(site)}
          fontAssets={await getRepositoryFontAssets(hostedSite)}
          siteId={site.id}
          postId={post.id}
          pageSlug={`blog/${post.slug}`}
        />
        <AnimationHydrator />
      </>
    );
  }

  const { site } = hostedSite;
  const post = getPostBySlug(site.id, slug, previewToken);
  if (!post) {
    notFound();
  }

  return (
    <>
      <PageRenderer
        content={normalizePostContent(site.id, post)}
        theme={site.theme}
        fontAssets={getHostedFontAssets(site.id)}
        siteId={site.id}
        postId={post.id}
        pageSlug={`blog/${post.slug}`}
      />
      <AnimationHydrator />
    </>
  );
}

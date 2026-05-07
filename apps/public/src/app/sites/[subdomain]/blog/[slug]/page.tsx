/**
 * Hosted blog post renderer.
 *
 * Published posts render publicly. Draft posts require a matching preview token.
 */

import { notFound } from 'next/navigation';
import { PageRenderer, type PageContent } from '@/components/PageRenderer';
import AnimationHydrator from '@/components/AnimationHydrator';
import { getBlogPosts, getSiteByIdOrSlug, validatePreviewToken } from '@/lib/backyStore';
import { resolveElementDataBindings } from '@/lib/renderPayload';
import type { Metadata } from 'next';
import type { StoreBlogPost } from '@/lib/backyStore';

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

const asString = (value: unknown): string => (
  typeof value === 'string' ? value : ''
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
  const site = getSiteByIdOrSlug(subdomain);

  if (!site) {
    return { title: 'Post Not Found' };
  }

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
  const site = getSiteByIdOrSlug(subdomain);

  if (!site) {
    notFound();
  }

  const post = getPostBySlug(site.id, slug, previewToken);
  if (!post) {
    notFound();
  }

  return (
    <>
      <PageRenderer
        content={normalizePostContent(site.id, post)}
        theme={site.theme}
        siteId={site.id}
        postId={post.id}
        pageSlug={`blog/${post.slug}`}
      />
      <AnimationHydrator />
    </>
  );
}

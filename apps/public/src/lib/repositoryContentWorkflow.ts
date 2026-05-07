import {
  canvasElementsToBackyContentDocument,
  isBackyContentDocument,
  type BackyContentDocument,
  type BackyJsonObject,
  type BackyPage,
  type BackyPageUpdateInput,
  type BackyPost,
  type BackyPostUpdateInput,
  type PageMeta,
  type PublishStatus,
} from '@backy-cms/core';
import type { getRequiredDatabaseRepositories } from '@/lib/repositoryRuntime';

export type PublicDatabaseRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;

export const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const jsonSnapshot = (value: unknown): BackyJsonObject => (
  JSON.parse(JSON.stringify(value ?? {})) as BackyJsonObject
);

const statusFromSnapshot = (value: unknown): PublishStatus | undefined => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived'
    ? value
    : undefined
);

const stringArrayFromSnapshot = (value: unknown): string[] | undefined => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined
);

const contentDocumentFromSnapshot = (
  rawContent: unknown,
  fallback: BackyPage | BackyPost,
  kind: 'page' | 'post',
  input: {
    title: string;
    slug: string;
    status: PublishStatus;
  },
): BackyContentDocument => {
  if (isBackyContentDocument(rawContent)) {
    return rawContent;
  }

  if (isRecord(rawContent) && isBackyContentDocument(rawContent.contentDocument)) {
    return rawContent.contentDocument;
  }

  return canvasElementsToBackyContentDocument({
    id: fallback.id,
    kind,
    title: input.title,
    slug: input.slug,
    status: input.status,
    elements: isRecord(rawContent) ? rawContent.elements : [],
    canvasSize: isRecord(rawContent) ? rawContent.canvasSize : undefined,
    customCSS: isRecord(rawContent) && typeof rawContent.customCSS === 'string' ? rawContent.customCSS : undefined,
  });
};

export const resolveRepositorySite = async (
  repositories: PublicDatabaseRepositories,
  siteId: string,
) => (
  await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId)
);

export const adminPageFromRepositoryPage = (page: BackyPage) => {
  const canvasSize = isRecord(page.content.metadata?.canvasSize)
    ? page.content.metadata.canvasSize
    : { width: 1200, height: 900 };

  return {
    ...page,
    content: {
      elements: page.content.elements,
      canvasSize,
      customCSS: typeof page.content.metadata?.customCSS === 'string' ? page.content.metadata.customCSS : undefined,
      contentDocument: page.content,
    },
  };
};

export const adminPostFromRepositoryPost = (post: BackyPost) => {
  const canvasSize = isRecord(post.content.metadata?.canvasSize)
    ? post.content.metadata.canvasSize
    : { width: 1200, height: 900 };

  return {
    ...post,
    content: {
      elements: post.content.elements,
      canvasSize,
      customCSS: typeof post.content.metadata?.customCSS === 'string' ? post.content.metadata.customCSS : undefined,
      contentDocument: post.content,
    },
  };
};

export const pageRevisionSnapshot = (page: BackyPage): BackyJsonObject => (
  jsonSnapshot(adminPageFromRepositoryPage(page))
);

export const postRevisionSnapshot = (post: BackyPost): BackyJsonObject => (
  jsonSnapshot(adminPostFromRepositoryPost(post))
);

export const pageUpdateFromRevisionSnapshot = (
  snapshot: BackyJsonObject,
  fallback: BackyPage,
): BackyPageUpdateInput => {
  const title = typeof snapshot.title === 'string' ? snapshot.title : fallback.title;
  const slug = typeof snapshot.slug === 'string' ? snapshot.slug : fallback.slug;
  const status = statusFromSnapshot(snapshot.status) || fallback.status;

  return {
    title,
    slug,
    description: typeof snapshot.description === 'string' || snapshot.description === null
      ? snapshot.description
      : fallback.description,
    status,
    scheduledAt: typeof snapshot.scheduledAt === 'string' || snapshot.scheduledAt === null
      ? snapshot.scheduledAt
      : fallback.scheduledAt,
    isHomepage: typeof snapshot.isHomepage === 'boolean' ? snapshot.isHomepage : fallback.isHomepage,
    parentId: typeof snapshot.parentId === 'string' || snapshot.parentId === null ? snapshot.parentId : fallback.parentId,
    sortOrder: typeof snapshot.sortOrder === 'number' ? snapshot.sortOrder : fallback.sortOrder,
    content: contentDocumentFromSnapshot(snapshot.content, fallback, 'page', { title, slug, status }),
    meta: isRecord(snapshot.meta) ? snapshot.meta as PageMeta : fallback.meta,
  };
};

export const postUpdateFromRevisionSnapshot = (
  snapshot: BackyJsonObject,
  fallback: BackyPost,
): BackyPostUpdateInput => {
  const title = typeof snapshot.title === 'string' ? snapshot.title : fallback.title;
  const slug = typeof snapshot.slug === 'string' ? snapshot.slug : fallback.slug;
  const status = statusFromSnapshot(snapshot.status) || fallback.status;

  return {
    title,
    slug,
    excerpt: typeof snapshot.excerpt === 'string' || snapshot.excerpt === null ? snapshot.excerpt : fallback.excerpt,
    status,
    scheduledAt: typeof snapshot.scheduledAt === 'string' || snapshot.scheduledAt === null
      ? snapshot.scheduledAt
      : fallback.scheduledAt,
    featuredImageId: typeof snapshot.featuredImageId === 'string' || snapshot.featuredImageId === null
      ? snapshot.featuredImageId
      : fallback.featuredImageId,
    authorId: typeof snapshot.authorId === 'string' || snapshot.authorId === null ? snapshot.authorId : fallback.authorId,
    categoryIds: stringArrayFromSnapshot(snapshot.categoryIds) || fallback.categoryIds,
    tagIds: stringArrayFromSnapshot(snapshot.tagIds) || fallback.tagIds,
    content: contentDocumentFromSnapshot(snapshot.content, fallback, 'post', { title, slug, status }),
    meta: isRecord(snapshot.meta) ? snapshot.meta as PageMeta : fallback.meta,
  };
};

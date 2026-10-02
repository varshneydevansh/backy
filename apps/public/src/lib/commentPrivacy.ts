import type { Comment } from '@backy-cms/core';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from './adminAccess';
import { isContentPublished } from '@backy-cms/core';
import { getAdminPageById, getAdminBlogPostById } from './backyStore';
import type { getRequiredDatabaseRepositories } from './repositoryRuntime';

export const isCommentTargetPublished = (
  site: { isPublished: boolean },
  target: Parameters<typeof isContentPublished>[0],
): boolean => site.isPublished && isContentPublished(target);

export async function isCommentPubliclyVisible(
  site: { id: string; isPublished: boolean },
  comment: Comment,
  repositories?: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
): Promise<boolean> {
  if (comment.siteId !== site.id || comment.status !== 'approved' || !site.isPublished) return false;
  const target = repositories
    ? await (comment.targetType === 'page' ? repositories.pages : repositories.posts).getById(site.id, comment.targetId)
    : comment.targetType === 'page' ? getAdminPageById(site.id, comment.targetId) : getAdminBlogPostById(site.id, comment.targetId);
  return isCommentTargetPublished(site, target);
}

export const hasCommentCredentials = (request: NextRequest): boolean => Boolean(
  request.headers.get('authorization') || request.headers.get('x-backy-admin-session') ||
  request.headers.get('x-backy-admin-key') || request.headers.get('x-api-key') ||
  request.cookies.get('backy_admin_session')?.value,
);

export const resolveCommentUserId = async (request: NextRequest, requestId: string): Promise<string | NextResponse> => {
  if (!hasCommentCredentials(request)) return '';
  const access = await requireAdminAccess(request, requestId, { permission: 'comments.view' });
  return access instanceof NextResponse ? access : access.session?.user.id || '';
};

// Allowlist visitor-visible fields: future moderation/identity fields stay private.
export const serializeComment = (comment: Comment, includePrivateFields = false): Comment => (
  includePrivateFields ? comment : {
    id: comment.id,
    siteId: comment.siteId,
    targetType: comment.targetType,
    targetId: comment.targetId,
    commentThreadId: comment.commentThreadId,
    authorName: comment.authorName,
    authorWebsite: comment.authorWebsite,
    content: comment.content,
    status: comment.status,
    parentId: comment.parentId,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  }
);

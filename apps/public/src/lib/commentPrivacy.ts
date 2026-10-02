import type { Comment } from '@backy-cms/core';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from './adminAccess';

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

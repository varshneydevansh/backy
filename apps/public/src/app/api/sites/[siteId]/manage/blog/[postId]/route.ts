/**
 * Live site blog post management endpoint.
 *
 * GET   /api/sites/[siteId]/manage/blog/[postId]
 * PATCH /api/sites/[siteId]/manage/blog/[postId]
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Site } from '@backy-cms/core';
import {
  GET as getAdminPost,
  PATCH as patchAdminPost,
} from '../../../../../admin/sites/[siteId]/blog/[postId]/route';
import {
  adminAccessError,
  requireAdminAccess,
  requireAdminTeamScopeAccess,
  type AdminAccessContext,
  type AdminTeamScopedResource,
} from '@/lib/adminAccess';
import { getSiteByIdOrSlug, type StoreSite } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
  }>;
}

type LiveManageAction = 'view' | 'content';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const resolveSite = async (siteId: string): Promise<(Site | StoreSite) & AdminTeamScopedResource | null> => {
  if (!shouldUseDemoStoreFallback()) {
    const repositories = await getRequiredDatabaseRepositories();
    return await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
  }

  return getSiteByIdOrSlug(siteId) || null;
};

const requireLiveManageBlogAccess = async (
  request: NextRequest,
  requestId: string,
  siteId: string,
  permission: 'pages.view' | 'pages.edit',
  action: LiveManageAction,
): Promise<AdminAccessContext | NextResponse> => {
  const access = await requireAdminAccess(request, requestId, { permission });
  if (access instanceof NextResponse) {
    return access;
  }

  const site = await resolveSite(siteId);
  if (!site) {
    return adminAccessError(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
  }

  const scopeError = await requireAdminTeamScopeAccess(access, requestId, site, {
    action,
    code: 'FORBIDDEN_LIVE_MANAGE_BLOG_SCOPE',
    message: 'This admin account cannot live-manage blog posts for this site.',
  });

  return scopeError || access;
};

export async function GET(request: NextRequest, route: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const { siteId } = await route.params;
  const access = await requireLiveManageBlogAccess(request, requestId, siteId, 'pages.view', 'view');
  if (access instanceof NextResponse) {
    return access;
  }

  return getAdminPost(request, route);
}

export async function PATCH(request: NextRequest, route: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const { siteId } = await route.params;
  const access = await requireLiveManageBlogAccess(request, requestId, siteId, 'pages.edit', 'content');
  if (access instanceof NextResponse) {
    return access;
  }

  return patchAdminPost(request, route);
}

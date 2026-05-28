/**
 * Live site blog post management endpoint.
 *
 * GET   /api/sites/[siteId]/manage/blog/[postId]
 * PATCH /api/sites/[siteId]/manage/blog/[postId]
 */

import { NextRequest, type NextResponse } from 'next/server';
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
import { withLiveManagementContractHeaders } from '@/lib/liveManagementContract';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
  }>;
}

type LiveManageAction = 'view' | 'content';
type LiveManageSite = (Site | StoreSite) & AdminTeamScopedResource;
type LiveManageBlogAccessResult =
  | { ok: true; site: LiveManageSite }
  | { ok: false; response: NextResponse };

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const isAdminAccessContext = (value: unknown): value is AdminAccessContext => {
  if (!value || typeof value !== 'object' || !('session' in value)) {
    return false;
  }

  const accessType = (value as { type?: unknown }).type;
  return accessType === 'session' || accessType === 'api-key';
};

const resolveSite = async (siteId: string): Promise<LiveManageSite | null> => {
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
): Promise<LiveManageBlogAccessResult> => {
  const access = await requireAdminAccess(request, requestId, { permission });
  if (!isAdminAccessContext(access)) {
    return {
      ok: false,
      response: withLiveManagementContractHeaders(access, {
        request,
        requestId,
        resource: 'blog-post',
      }),
    };
  }

  const site = await resolveSite(siteId);
  if (!site) {
    return {
      ok: false,
      response: withLiveManagementContractHeaders(
        adminAccessError(404, 'SITE_NOT_FOUND', 'Site not found', requestId),
        {
          request,
          requestId,
          resource: 'blog-post',
        },
      ),
    };
  }

  const scopeError = await requireAdminTeamScopeAccess(access, requestId, site, {
    action,
    code: 'FORBIDDEN_LIVE_MANAGE_BLOG_SCOPE',
    message: 'This admin account cannot live-manage blog posts for this site.',
  });

  if (scopeError) {
    return {
      ok: false,
      response: withLiveManagementContractHeaders(scopeError, {
        request,
        requestId,
        siteId: site.id,
        resource: 'blog-post',
      }),
    };
  }

  return { ok: true, site };
};

export async function GET(request: NextRequest, route: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const { siteId } = await route.params;
  const access = await requireLiveManageBlogAccess(request, requestId, siteId, 'pages.view', 'view');
  if (!access.ok) {
    return access.response;
  }

  return withLiveManagementContractHeaders(await getAdminPost(request, route), {
    request,
    requestId,
    siteId: access.site.id,
    resource: 'blog-post',
  });
}

export async function PATCH(request: NextRequest, route: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const { siteId } = await route.params;
  const access = await requireLiveManageBlogAccess(request, requestId, siteId, 'pages.edit', 'content');
  if (!access.ok) {
    return access.response;
  }

  return withLiveManagementContractHeaders(await patchAdminPost(request, route), {
    request,
    requestId,
    siteId: access.site.id,
    resource: 'blog-post',
  });
}

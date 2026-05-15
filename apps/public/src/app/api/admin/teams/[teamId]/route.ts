import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  deleteAdminTeam,
  getAdminTeamById,
  getAdminTeamBySlug,
  getAdminUserById,
  getSites,
  listAdminTeamMembers,
  updateAdminTeam,
  type StoreTeam,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ teamId: string }>;
};

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status },
  )
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

const normalizeSettings = (value: unknown) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

const workspaceSummary = (sites: Array<{
  id: string;
  name: string;
  slug: string;
  customDomain?: string | null;
  status?: string;
  isPublished?: boolean;
  updatedAt?: string;
  createdAt?: string;
}>) => {
  const normalizedSites = sites.map((site) => {
    const status = site.status === 'archived'
      ? 'archived'
      : site.status === 'published' || site.isPublished
        ? 'published'
        : 'draft';

    return {
      id: site.id,
      name: site.name,
      slug: site.slug,
      customDomain: site.customDomain || null,
      status,
      updatedAt: site.updatedAt || site.createdAt || null,
    };
  });

  return {
    siteCount: normalizedSites.length,
    publishedSiteCount: normalizedSites.filter((site) => site.status === 'published').length,
    draftSiteCount: normalizedSites.filter((site) => site.status === 'draft').length,
    archivedSiteCount: normalizedSites.filter((site) => site.status === 'archived').length,
    sites: normalizedSites.slice(0, 8),
  };
};

const demoTeamWithMembers = (team: StoreTeam) => {
  const members = listAdminTeamMembers(team.id).map((member) => {
    const user = getAdminUserById(member.userId);
    return {
      ...member,
      email: user?.email || '',
      name: user?.fullName || user?.email || member.userId,
      avatarUrl: null,
    };
  });

  return {
    ...team,
    members,
    plan: team.settings?.plan || 'free',
    workspace: workspaceSummary(getSites({ includeUnpublished: true }).filter((site) => site.teamId === team.id)),
  };
};

const withMembers = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  teamId: string,
) => {
  const team = await repositories.teams.getById(teamId);
  if (!team) return null;

  const members = await repositories.teams.listMembers({ teamId });
  const sites = await repositories.sites.list({ teamId, status: 'all', limit: 100, offset: 0 });
  const enrichedMembers = await Promise.all(members.items.map(async (member) => {
    const user = await repositories.users.getById(member.userId);
    return {
      ...member,
      email: user?.email || '',
      name: user?.fullName || user?.email || member.userId,
      avatarUrl: user?.avatarUrl || null,
    };
  }));

  return {
    ...team,
    members: enrichedMembers,
    plan: team.settings?.plan || 'free',
    workspace: workspaceSummary(sites.items),
  };
};

export async function GET(request: NextRequest, context: RouteContext) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { teamId } = await context.params;
    if (shouldUseDemoStoreFallback()) {
      const team = getAdminTeamById(teamId);
      if (!team) {
        return errorResponse(404, 'TEAM_NOT_FOUND', 'Team not found.', requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          team: demoTeamWithMembers(team),
        },
      });
    }

    const repositories = await getRequiredDatabaseRepositories();
    const team = await withMembers(repositories, teamId);
    if (!team) {
      return errorResponse(404, 'TEAM_NOT_FOUND', 'Team not found.', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        team,
      },
    });
  } catch (error) {
    console.error('Admin team detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { teamId } = await context.params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const before = repositories
      ? await withMembers(repositories, teamId)
      : (() => {
          const team = getAdminTeamById(teamId);
          return team ? demoTeamWithMembers(team) : null;
        })();
    if (!before) {
      return errorResponse(404, 'TEAM_NOT_FOUND', 'Team not found.', requestId);
    }

    const body = await parseJsonBody(request);
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const slug = body.slug !== undefined ? normalizeSlug(body.slug) : undefined;
    const ownerId = body.ownerId === null
      ? null
      : typeof body.ownerId === 'string'
        ? body.ownerId.trim()
        : undefined;
    const settings = body.settings !== undefined ? normalizeSettings(body.settings) : undefined;

    if (name !== undefined && !name) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Team name cannot be empty.', requestId);
    }

    if (body.slug !== undefined && !slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Team slug cannot be empty.', requestId);
    }

    if (slug && slug !== before.slug) {
      const existing = repositories
        ? await repositories.teams.getBySlug(slug)
        : getAdminTeamBySlug(slug);
      if (existing && existing.id !== teamId) {
        return errorResponse(409, 'TEAM_SLUG_CONFLICT', 'A team with this slug already exists.', requestId);
      }
    }

    const owner = ownerId
      ? repositories
        ? await repositories.users.getById(ownerId)
        : getAdminUserById(ownerId)
      : null;
    if (ownerId && !owner) {
      return errorResponse(400, 'OWNER_NOT_FOUND', 'Team owner user was not found.', requestId);
    }

    const updateInput = {
      ...(name !== undefined ? { name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(ownerId !== undefined ? { ownerId } : {}),
      ...(settings !== undefined ? { settings } : {}),
    };
    const team = repositories
      ? await (async () => {
          await repositories.teams.update(teamId, updateInput);
          return withMembers(repositories, teamId);
        })()
      : (() => {
          const updated = updateAdminTeam(teamId, updateInput);
          return updated ? demoTeamWithMembers(updated) : null;
        })();

    await recordAdminAudit({
      ...(repositories ? { repositories } : {}),
      actorId: access.session?.user.id || null,
      teamId,
      entity: 'team',
      entityId: teamId,
      action: 'update',
      before,
      after: team,
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        team,
      },
    });
  } catch (error) {
    console.error('Admin team update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { teamId } = await context.params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const before = repositories
      ? await withMembers(repositories, teamId)
      : (() => {
          const team = getAdminTeamById(teamId);
          return team ? demoTeamWithMembers(team) : null;
        })();
    if (!before) {
      return errorResponse(404, 'TEAM_NOT_FOUND', 'Team not found.', requestId);
    }

    if (repositories) {
      const ownedSites = await repositories.sites.list({
        teamId,
        status: 'all',
        limit: 1,
        offset: 0,
      });
      if (ownedSites.pagination.total > 0) {
        return errorResponse(409, 'TEAM_HAS_SITES', "Move or delete this team's sites before deleting the team.", requestId);
      }
      await repositories.teams.delete(teamId);
    } else {
      const ownedSites = getSites({ includeUnpublished: true }).filter((site) => site.teamId === teamId);
      if (ownedSites.length > 0) {
        return errorResponse(409, 'TEAM_HAS_SITES', "Move or delete this team's sites before deleting the team.", requestId);
      }
      deleteAdminTeam(teamId);
    }

    await recordAdminAudit({
      ...(repositories ? { repositories } : {}),
      actorId: access.session?.user.id || null,
      teamId,
      entity: 'team',
      entityId: teamId,
      action: 'delete',
      before,
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
      },
    });
  } catch (error) {
    console.error('Admin team delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

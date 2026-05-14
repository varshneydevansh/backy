import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
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

const withMembers = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  teamId: string,
) => {
  const team = await repositories.teams.getById(teamId);
  if (!team) return null;

  const members = await repositories.teams.listMembers({ teamId });
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
  };
};

export async function GET(request: NextRequest, context: RouteContext) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'users.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  if (shouldUseDemoStoreFallback()) {
    return errorResponse(501, 'DEMO_TEAM_DETAIL_UNAVAILABLE', 'Team detail requires database mode.', requestId);
  }

  try {
    const { teamId } = await context.params;
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
  const access = requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  if (shouldUseDemoStoreFallback()) {
    return errorResponse(501, 'DEMO_TEAM_WRITE_UNAVAILABLE', 'Team updates require database mode.', requestId);
  }

  try {
    const { teamId } = await context.params;
    const repositories = await getRequiredDatabaseRepositories();
    const before = await withMembers(repositories, teamId);
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
      const existing = await repositories.teams.getBySlug(slug);
      if (existing && existing.id !== teamId) {
        return errorResponse(409, 'TEAM_SLUG_CONFLICT', 'A team with this slug already exists.', requestId);
      }
    }

    if (ownerId && !(await repositories.users.getById(ownerId))) {
      return errorResponse(400, 'OWNER_NOT_FOUND', 'Team owner user was not found.', requestId);
    }

    await repositories.teams.update(teamId, {
      ...(name !== undefined ? { name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(ownerId !== undefined ? { ownerId } : {}),
      ...(settings !== undefined ? { settings } : {}),
    });
    const team = await withMembers(repositories, teamId);

    await recordAdminAudit({
      repositories,
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
  const access = requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  if (shouldUseDemoStoreFallback()) {
    return errorResponse(501, 'DEMO_TEAM_WRITE_UNAVAILABLE', 'Team deletion requires database mode.', requestId);
  }

  try {
    const { teamId } = await context.params;
    const repositories = await getRequiredDatabaseRepositories();
    const before = await withMembers(repositories, teamId);
    if (!before) {
      return errorResponse(404, 'TEAM_NOT_FOUND', 'Team not found.', requestId);
    }

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
    await recordAdminAudit({
      repositories,
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

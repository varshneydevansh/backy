import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getSites } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

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

const slugFromName = (name: string) => normalizeSlug(name) || `team-${Date.now().toString(36)}`;

const normalizeSettings = (value: unknown) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const demoTeamsFromSites = () => {
  const teamIds = Array.from(new Set(
    getSites({ includeUnpublished: true })
      .map((site) => {
        const candidate = site as typeof site & { teamId?: unknown };
        return typeof candidate.teamId === 'string' ? candidate.teamId.trim() : '';
      })
      .filter(Boolean),
  ));

  const ids = teamIds.length > 0 ? teamIds : ['demo-team'];
  return ids.map((teamId) => ({
    id: teamId,
    name: teamId === 'demo-team' ? 'Demo team' : teamId,
    slug: normalizeSlug(teamId) || teamId,
    ownerId: 'user-admin',
    settings: {},
    createdAt: new Date(0).toISOString(),
    members: [],
    mode: 'demo',
  }));
};

const withMembers = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  team: Awaited<ReturnType<typeof repositories.teams.getById>>,
) => {
  if (!team) return null;
  const members = await repositories.teams.listMembers({ teamId: team.id });
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

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { searchParams } = new URL(request.url);
    if (shouldUseDemoStoreFallback()) {
      const teams = demoTeamsFromSites();
      return NextResponse.json({
        success: true,
        requestId,
        data: {
          teams,
          pagination: {
            total: teams.length,
            limit: teams.length,
            offset: 0,
            hasMore: false,
          },
        },
      });
    }

    const repositories = await getRequiredDatabaseRepositories();
    const result = await repositories.teams.list({
      search: searchParams.get('search') || undefined,
      ownerId: searchParams.get('ownerId') || undefined,
      limit: 100,
      offset: 0,
    });
    const teams = await Promise.all(result.items.map((team) => withMembers(repositories, team)));

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        teams: teams.filter(Boolean),
        pagination: result.pagination,
      },
    });
  } catch (error) {
    console.error('Admin teams list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  if (shouldUseDemoStoreFallback()) {
    return errorResponse(501, 'DEMO_TEAM_WRITE_UNAVAILABLE', 'Team creation requires database mode.', requestId);
  }

  try {
    const repositories = await getRequiredDatabaseRepositories();
    const body = await parseJsonBody(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = normalizeSlug(body.slug) || slugFromName(name);
    const ownerId = typeof body.ownerId === 'string' && body.ownerId.trim()
      ? body.ownerId.trim()
      : access.session?.user.id || null;
    const settings = normalizeSettings(body.settings);

    if (!name) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Team name is required.', requestId);
    }

    if (await repositories.teams.getBySlug(slug)) {
      return errorResponse(409, 'TEAM_SLUG_CONFLICT', 'A team with this slug already exists.', requestId);
    }

    if (ownerId && !(await repositories.users.getById(ownerId))) {
      return errorResponse(400, 'OWNER_NOT_FOUND', 'Team owner user was not found.', requestId);
    }

    const team = (await repositories.teams.create({
      name,
      slug,
      ownerId,
      settings,
    })).item;
    if (ownerId) {
      await repositories.teams.addMember({
        teamId: team.id,
        userId: ownerId,
        role: 'owner',
      });
    }
    const responseTeam = await withMembers(repositories, team);

    await recordAdminAudit({
      repositories,
      actorId: access.session?.user.id || null,
      teamId: team.id,
      entity: 'team',
      entityId: team.id,
      action: 'create',
      after: responseTeam || team,
      requestId,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          team: responseTeam,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin team create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

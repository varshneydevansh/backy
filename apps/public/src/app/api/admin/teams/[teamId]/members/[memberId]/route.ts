import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ teamId: string; memberId: string }>;
};

type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer';

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

const normalizeRole = (value: unknown): TeamRole | null => (
  value === 'owner' || value === 'admin' || value === 'editor' || value === 'viewer' ? value : null
);

const getMember = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  teamId: string,
  memberId: string,
) => {
  const members = await repositories.teams.listMembers({ teamId });
  return members.items.find((member) => member.id === memberId) || null;
};

const enrichMember = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  member: NonNullable<Awaited<ReturnType<typeof getMember>>>,
) => {
  const user = await repositories.users.getById(member.userId);
  return {
    ...member,
    email: user?.email || '',
    name: user?.fullName || user?.email || member.userId,
    avatarUrl: user?.avatarUrl || null,
  };
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  if (shouldUseDemoStoreFallback()) {
    return errorResponse(501, 'DEMO_TEAM_WRITE_UNAVAILABLE', 'Team member changes require database mode.', requestId);
  }

  try {
    const { teamId, memberId } = await context.params;
    const repositories = await getRequiredDatabaseRepositories();
    const team = await repositories.teams.getById(teamId);
    if (!team) {
      return errorResponse(404, 'TEAM_NOT_FOUND', 'Team not found.', requestId);
    }

    const before = await getMember(repositories, teamId, memberId);
    if (!before) {
      return errorResponse(404, 'TEAM_MEMBER_NOT_FOUND', 'Team member not found.', requestId);
    }

    const body = await parseJsonBody(request);
    const role = normalizeRole(body.role);
    if (!role) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Role must be owner, admin, editor, or viewer.', requestId);
    }

    const member = (await repositories.teams.updateMember(teamId, memberId, { role })).item;
    const responseMember = await enrichMember(repositories, member);

    await recordAdminAudit({
      repositories,
      actorId: access.session?.user.id || null,
      teamId,
      entity: 'teamMember',
      entityId: memberId,
      action: 'update',
      before,
      after: responseMember,
      metadata: {
        teamName: team.name,
        userId: member.userId,
        role,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        member: responseMember,
      },
    });
  } catch (error) {
    console.error('Admin team member update API error:', error);
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
    return errorResponse(501, 'DEMO_TEAM_WRITE_UNAVAILABLE', 'Team member changes require database mode.', requestId);
  }

  try {
    const { teamId, memberId } = await context.params;
    const repositories = await getRequiredDatabaseRepositories();
    const team = await repositories.teams.getById(teamId);
    if (!team) {
      return errorResponse(404, 'TEAM_NOT_FOUND', 'Team not found.', requestId);
    }

    const before = await getMember(repositories, teamId, memberId);
    if (!before) {
      return errorResponse(404, 'TEAM_MEMBER_NOT_FOUND', 'Team member not found.', requestId);
    }

    await repositories.teams.removeMember(teamId, memberId);
    await recordAdminAudit({
      repositories,
      actorId: access.session?.user.id || null,
      teamId,
      entity: 'teamMember',
      entityId: memberId,
      action: 'delete',
      before,
      metadata: {
        teamName: team.name,
        userId: before.userId,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        removed: true,
      },
    });
  } catch (error) {
    console.error('Admin team member delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

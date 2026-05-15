import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getAdminTeamMembershipPolicyViolation } from '@/lib/adminTeamMembershipPolicy';
import {
  getAdminTeamById,
  getAdminUserById,
  listAdminTeamMembers,
  removeAdminTeamMember,
  updateAdminTeamMemberRole,
  type StoreTeamMember,
} from '@/lib/backyStore';
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

const enrichDemoMember = (member: StoreTeamMember) => {
  const user = getAdminUserById(member.userId);
  return {
    ...member,
    email: user?.email || '',
    name: user?.fullName || user?.email || member.userId,
    avatarUrl: null,
  };
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { teamId, memberId } = await context.params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const team = repositories ? await repositories.teams.getById(teamId) : getAdminTeamById(teamId);
    if (!team) {
      return errorResponse(404, 'TEAM_NOT_FOUND', 'Team not found.', requestId);
    }

    const members = repositories
      ? (await repositories.teams.listMembers({ teamId })).items
      : listAdminTeamMembers(teamId);
    const before = members.find((member) => member.id === memberId) || null;
    if (!before) {
      return errorResponse(404, 'TEAM_MEMBER_NOT_FOUND', 'Team member not found.', requestId);
    }

    const body = await parseJsonBody(request);
    const role = normalizeRole(body.role);
    if (!role) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Role must be owner, admin, editor, or viewer.', requestId);
    }

    const policyViolation = getAdminTeamMembershipPolicyViolation({
      access,
      members,
      targetMember: before,
      nextRole: role,
      action: 'update',
    });
    if (policyViolation) {
      return errorResponse(policyViolation.status, policyViolation.code, policyViolation.message, requestId);
    }

    const member = repositories
      ? (await repositories.teams.updateMember(teamId, memberId, { role })).item
      : updateAdminTeamMemberRole(teamId, memberId, role);
    if (!member) {
      return errorResponse(404, 'TEAM_MEMBER_NOT_FOUND', 'Team member not found.', requestId);
    }
    const responseMember = repositories ? await enrichMember(repositories, member) : enrichDemoMember(member);

    await recordAdminAudit({
      ...(repositories ? { repositories } : {}),
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
  const access = await requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { teamId, memberId } = await context.params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const team = repositories ? await repositories.teams.getById(teamId) : getAdminTeamById(teamId);
    if (!team) {
      return errorResponse(404, 'TEAM_NOT_FOUND', 'Team not found.', requestId);
    }

    const members = repositories
      ? (await repositories.teams.listMembers({ teamId })).items
      : listAdminTeamMembers(teamId);
    const before = members.find((member) => member.id === memberId) || null;
    if (!before) {
      return errorResponse(404, 'TEAM_MEMBER_NOT_FOUND', 'Team member not found.', requestId);
    }

    const policyViolation = getAdminTeamMembershipPolicyViolation({
      access,
      members,
      targetMember: before,
      action: 'remove',
    });
    if (policyViolation) {
      return errorResponse(policyViolation.status, policyViolation.code, policyViolation.message, requestId);
    }

    if (repositories) {
      await repositories.teams.removeMember(teamId, memberId);
    } else {
      removeAdminTeamMember(teamId, memberId);
    }
    await recordAdminAudit({
      ...(repositories ? { repositories } : {}),
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

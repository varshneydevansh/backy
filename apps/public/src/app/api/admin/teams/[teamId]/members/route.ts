import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  getAdminAuthPolicySettings,
  validateAdminEmailDomainPolicy,
  validateAdminInviteOnlyCreatePolicy,
} from '@/lib/admin-auth/emailPolicy';
import { createAdminInviteToken } from '@/lib/admin-auth/sessionStore';
import { addPersistedInviteToken } from '@/lib/adminAuthTokenPersistence';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ teamId: string }>;
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

const normalizeEmail = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const normalizeRole = (value: unknown): TeamRole | null => (
  value === 'owner' || value === 'admin' || value === 'editor' || value === 'viewer' ? value : null
);

const requireOwnerRoleAccess = (
  access: { session: { user: { role: TeamRole } } | null },
  requestId: string,
) => (
  access.session?.user.role === 'owner'
    ? null
    : errorResponse(403, 'OWNER_ROLE_RESTRICTED', 'Only workspace owners can assign owner team roles.', requestId)
);

const nameFromEmail = (email: string) => (
  email.split('@')[0]?.replace(/[._-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) || email
);

const enrichMembers = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  teamId: string,
) => {
  const members = await repositories.teams.listMembers({ teamId });
  return Promise.all(members.items.map(async (member) => {
    const user = await repositories.users.getById(member.userId);
    return {
      ...member,
      email: user?.email || '',
      name: user?.fullName || user?.email || member.userId,
      avatarUrl: user?.avatarUrl || null,
    };
  }));
};

export async function GET(request: NextRequest, context: RouteContext) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  if (shouldUseDemoStoreFallback()) {
    return errorResponse(501, 'DEMO_TEAM_MEMBERS_UNAVAILABLE', 'Team members require database mode.', requestId);
  }

  try {
    const { teamId } = await context.params;
    const repositories = await getRequiredDatabaseRepositories();
    if (!(await repositories.teams.getById(teamId))) {
      return errorResponse(404, 'TEAM_NOT_FOUND', 'Team not found.', requestId);
    }

    const members = await enrichMembers(repositories, teamId);
    return NextResponse.json({
      success: true,
      requestId,
      data: {
        members,
        pagination: {
          total: members.length,
          limit: members.length,
          offset: 0,
          hasMore: false,
        },
      },
    });
  } catch (error) {
    console.error('Admin team members list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  if (shouldUseDemoStoreFallback()) {
    return errorResponse(501, 'DEMO_TEAM_WRITE_UNAVAILABLE', 'Team member changes require database mode.', requestId);
  }

  try {
    const { teamId } = await context.params;
    const repositories = await getRequiredDatabaseRepositories();
    const team = await repositories.teams.getById(teamId);
    if (!team) {
      return errorResponse(404, 'TEAM_NOT_FOUND', 'Team not found.', requestId);
    }

    const body = await parseJsonBody(request);
    const role = normalizeRole(body.role) || 'editor';
    if (role === 'owner') {
      const ownerAccessError = requireOwnerRoleAccess(access, requestId);
      if (ownerAccessError) {
        return ownerAccessError;
      }
    }
    const userId = typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : '';
    const email = normalizeEmail(body.email);
    let user = userId ? await repositories.users.getById(userId) : null;
    let invite = null;

    if (!user) {
      if (!email || !email.includes('@')) {
        return errorResponse(400, 'VALIDATION_ERROR', 'A valid userId or email is required.', requestId);
      }

      user = await repositories.users.getByEmail(email);
      if (!user) {
        const authPolicySettings = await getAdminAuthPolicySettings();
        const emailPolicy = await validateAdminEmailDomainPolicy(email, authPolicySettings);
        if (!emailPolicy.ok) {
          return errorResponse(400, 'EMAIL_DOMAIN_NOT_ALLOWED', emailPolicy.message, requestId);
        }
        const inviteOnlyPolicy = await validateAdminInviteOnlyCreatePolicy('invited', authPolicySettings);
        if (!inviteOnlyPolicy.ok) {
          return errorResponse(400, 'INVITE_ONLY_REQUIRED', inviteOnlyPolicy.message, requestId);
        }

        user = (await repositories.users.create({
          fullName: typeof body.fullName === 'string' && body.fullName.trim() ? body.fullName.trim() : nameFromEmail(email),
          email,
          role,
          status: 'invited',
        })).item;
        invite = createAdminInviteToken({
          user,
          requestedById: access.session?.user.id || null,
          origin: request.headers.get('origin') || request.nextUrl.origin,
          persistInMemory: false,
        });
        const currentSettings = await repositories.settings.get();
        await repositories.settings.update({
          auth: addPersistedInviteToken(currentSettings.auth, invite),
        });
      }
    }

    const member = (await repositories.teams.addMember({
      teamId,
      userId: user.id,
      role,
    })).item;
    const responseMember = (await enrichMembers(repositories, teamId)).find((item) => item.id === member.id) || member;

    await recordAdminAudit({
      repositories,
      actorId: access.session?.user.id || null,
      teamId,
      entity: 'teamMember',
      entityId: member.id,
      action: 'create',
      after: responseMember,
      metadata: {
        teamName: team.name,
        userId: user.id,
        email: user.email,
        role,
        inviteTokenId: invite?.id || null,
      },
      requestId,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          member: responseMember,
          user,
          invite,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin team member create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

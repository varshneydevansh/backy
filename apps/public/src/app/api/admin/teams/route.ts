import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  createAdminTeam,
  getAdminSettings,
  getAdminTeamBySlug,
  getAdminUserById,
  getSites,
  listAdminTeamMembers,
  listAdminTeams,
  type StoreTeam,
} from '@/lib/backyStore';
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

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const readBillingTeamPolicy = (settings: unknown) => {
  const root = toRecord(settings);
  const integrations = toRecord(root.integrations);
  const commerce = toRecord(integrations.commerce);
  const limit = Number(commerce.teamLimit);
  const overageMode = typeof commerce.overageMode === 'string' ? commerce.overageMode : 'warn';

  return {
    teamLimit: Number.isFinite(limit) && limit >= 1 ? Math.round(limit) : 3,
    overageMode,
    billingPlan: typeof commerce.billingPlan === 'string' ? commerce.billingPlan : 'free',
  };
};

const enforceTeamBillingLimit = (
  settings: unknown,
  currentTeamCount: number,
  requestId: string,
) => {
  const policy = readBillingTeamPolicy(settings);
  if (policy.overageMode === 'block' && currentTeamCount >= policy.teamLimit) {
    return errorResponse(
      402,
      'BILLING_TEAM_LIMIT',
      `The ${policy.billingPlan} billing policy allows ${policy.teamLimit} team${policy.teamLimit === 1 ? '' : 's'}. Update Settings billing limits before creating another team.`,
      requestId,
    );
  }

  return null;
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

const withMembers = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  team: Awaited<ReturnType<typeof repositories.teams.getById>>,
) => {
  if (!team) return null;
  const members = await repositories.teams.listMembers({ teamId: team.id });
  const sites = await repositories.sites.list({ teamId: team.id, status: 'all', limit: 100, offset: 0 });
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

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { searchParams } = new URL(request.url);
    if (shouldUseDemoStoreFallback()) {
      const teams = listAdminTeams().map(demoTeamWithMembers);
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

  try {
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

    if (shouldUseDemoStoreFallback()) {
      if (getAdminTeamBySlug(slug)) {
        return errorResponse(409, 'TEAM_SLUG_CONFLICT', 'A team with this slug already exists.', requestId);
      }

      if (ownerId && !getAdminUserById(ownerId)) {
        return errorResponse(400, 'OWNER_NOT_FOUND', 'Team owner user was not found.', requestId);
      }

      const billingLimitError = enforceTeamBillingLimit(getAdminSettings(), listAdminTeams().length, requestId);
      if (billingLimitError) {
        return billingLimitError;
      }

      const team = createAdminTeam({ name, slug, ownerId, settings });
      const responseTeam = demoTeamWithMembers(team);

      await recordAdminAudit({
        actorId: access.session?.user.id || null,
        teamId: team.id,
        entity: 'team',
        entityId: team.id,
        action: 'create',
        after: responseTeam,
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
    }

    const repositories = await getRequiredDatabaseRepositories();
    if (await repositories.teams.getBySlug(slug)) {
      return errorResponse(409, 'TEAM_SLUG_CONFLICT', 'A team with this slug already exists.', requestId);
    }

    if (ownerId && !(await repositories.users.getById(ownerId))) {
      return errorResponse(400, 'OWNER_NOT_FOUND', 'Team owner user was not found.', requestId);
    }

    const currentTeams = await repositories.teams.list({ limit: 1, offset: 0 });
    const billingLimitError = enforceTeamBillingLimit(
      await repositories.settings.get(),
      currentTeams.pagination.total,
      requestId,
    );
    if (billingLimitError) {
      return billingLimitError;
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

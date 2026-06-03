import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type BootstrapBody = {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  workspaceName?: unknown;
  workspaceSlug?: unknown;
  bootstrapToken?: unknown;
};

type SupabaseJson = Record<string, unknown> | Record<string, unknown>[] | null;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const envValue = (keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return '';
};

const normalizeSupabaseUrl = (value: string) => value.replace(/\/+$/, '');

const normalizeEmail = (value: unknown) => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const normalizeText = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeSlug = (value: unknown, fallback: string) => {
  const normalized = normalizeText(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'backy-workspace';
};

const restEq = (value: string) => `eq.${encodeURIComponent(value)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: { code, message },
    },
    {
      status,
      headers: { 'cache-control': 'no-store' },
    },
  )
);

const successResponse = (requestId: string, data: Record<string, unknown>, status = 201) => (
  NextResponse.json(
    {
      success: true,
      requestId,
      data,
    },
    {
      status,
      headers: { 'cache-control': 'no-store' },
    },
  )
);

const parseJsonBody = async (request: NextRequest): Promise<BootstrapBody> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as BootstrapBody
      : {};
  } catch {
    return {};
  }
};

const digest = (value: string) => createHash('sha256').update(value).digest();

const secureEqual = (left: string, right: string) => timingSafeEqual(digest(left), digest(right));

const bearerToken = (request: NextRequest) => {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const readBootstrapToken = (request: NextRequest, body: BootstrapBody) => (
  bearerToken(request)
  || normalizeText(request.headers.get('x-backy-owner-bootstrap-token'))
  || normalizeText(body.bootstrapToken)
);

const readSupabaseConfig = () => {
  const url = envValue(['BACKY_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const serviceKey = envValue([
    'BACKY_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY',
  ]);

  return {
    url: url ? normalizeSupabaseUrl(url) : '',
    serviceKey,
  };
};

const supabaseHeaders = (serviceKey: string, extra: HeadersInit = {}) => ({
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  ...extra,
});

async function fetchSupabaseJson(
  url: string,
  serviceKey: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; json: SupabaseJson }> {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...supabaseHeaders(serviceKey, init.headers),
    },
  });
  const json = await response.json().catch(() => null) as SupabaseJson;
  return { ok: response.ok, status: response.status, json };
}

const firstObject = (value: SupabaseJson) => {
  if (Array.isArray(value)) {
    return value.find((item) => item && typeof item === 'object' && !Array.isArray(item)) || null;
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
};

const getCreatedUserId = (payload: SupabaseJson) => {
  const root = firstObject(payload);
  if (typeof root?.id === 'string' && root.id) return root.id;
  const nestedUser = root?.user;
  if (nestedUser && typeof nestedUser === 'object' && !Array.isArray(nestedUser)) {
    const id = (nestedUser as Record<string, unknown>).id;
    if (typeof id === 'string' && id) return id;
  }
  return '';
};

async function findSupabaseAuthUserByEmail(url: string, serviceKey: string, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetchSupabaseJson(
      url,
      serviceKey,
      `/auth/v1/admin/users?page=${page}&per_page=100`,
      { method: 'GET' },
    );
    if (!response.ok) {
      throw new Error(`Existing Supabase Auth user lookup failed with ${response.status}`);
    }

    const root = firstObject(response.json);
    const users = Array.isArray(root?.users)
      ? root.users
      : Array.isArray(response.json)
        ? response.json
        : [];
    const match = users.find((user) => {
      if (!user || typeof user !== 'object' || Array.isArray(user)) return false;
      const candidate = user as Record<string, unknown>;
      return normalizeEmail(candidate.email) === email && typeof candidate.id === 'string' && candidate.id;
    }) as Record<string, unknown> | undefined;
    if (match && typeof match.id === 'string') return match.id;

    const total = typeof root?.total === 'number' ? root.total : users.length;
    if (page * 100 >= total || users.length === 0) break;
  }

  return '';
}

async function activeOwnerExists(url: string, serviceKey: string) {
  const response = await fetchSupabaseJson(
    url,
    serviceKey,
    '/rest/v1/profiles?select=id,email,role,status&role=eq.owner&status=eq.active&limit=1',
    { method: 'GET' },
  );
  if (!response.ok) {
    throw new Error(`Owner lookup failed with ${response.status}`);
  }

  return Array.isArray(response.json) && response.json.length > 0;
}

async function findExistingBackyProfileByEmail(url: string, serviceKey: string, email: string) {
  const response = await fetchSupabaseJson(
    url,
    serviceKey,
    `/rest/v1/profiles?select=id,email,full_name,role,status,is_active&email=${restEq(email)}&limit=1`,
    { method: 'GET' },
  );
  if (!response.ok) {
    throw new Error(`Existing owner profile lookup failed with ${response.status}`);
  }

  const profile = firstObject(response.json);
  return typeof profile?.id === 'string' && profile.id ? profile : null;
}

async function createSupabaseAuthUser(input: {
  url: string;
  serviceKey: string;
  email: string;
  password: string;
  fullName: string;
}) {
  const response = await fetchSupabaseJson(input.url, input.serviceKey, '/auth/v1/admin/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        source: 'backy-owner-bootstrap',
      },
    }),
  });

  if (!response.ok) {
    return { ok: false as const, status: response.status, userId: '' };
  }

  return { ok: true as const, status: response.status, userId: getCreatedUserId(response.json) };
}

async function upsertOwnerProfile(input: {
  url: string;
  serviceKey: string;
  userId: string;
  email: string;
  fullName: string;
}) {
  const response = await fetchSupabaseJson(input.url, input.serviceKey, '/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      id: input.userId,
      email: input.email,
      full_name: input.fullName,
      role: 'owner',
      status: 'active',
      is_active: true,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Owner profile upsert failed with ${response.status}`);
  }

  return firstObject(response.json);
}

async function ensureWorkspace(input: {
  url: string;
  serviceKey: string;
  userId: string;
  workspaceName: string;
  workspaceSlug: string;
}) {
  const existingTeams = await fetchSupabaseJson(
    input.url,
    input.serviceKey,
    '/rest/v1/teams?select=id,name,slug,owner_id&limit=2',
    { method: 'GET' },
  );
  if (!existingTeams.ok) {
    throw new Error(`Workspace lookup failed with ${existingTeams.status}`);
  }

  const existingTeam = Array.isArray(existingTeams.json) && existingTeams.json.length === 1
    ? existingTeams.json[0]
    : null;
  let teamId = typeof existingTeam?.id === 'string' ? existingTeam.id : '';

  if (!teamId && Array.isArray(existingTeams.json) && existingTeams.json.length === 0) {
    const createdTeam = await fetchSupabaseJson(input.url, input.serviceKey, '/rest/v1/teams', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify({
        name: input.workspaceName,
        slug: input.workspaceSlug,
        owner_id: input.userId,
        settings: {
          bootstrap: {
            source: 'backy-owner-bootstrap',
            createdAt: new Date().toISOString(),
          },
        },
      }),
    });
    if (!createdTeam.ok) {
      throw new Error(`Workspace creation failed with ${createdTeam.status}`);
    }
    const row = firstObject(createdTeam.json);
    teamId = typeof row?.id === 'string' ? row.id : '';
  }

  if (!teamId) {
    return { teamId: '', memberId: '', skipped: true };
  }

  const member = await fetchSupabaseJson(input.url, input.serviceKey, '/rest/v1/team_members?on_conflict=team_id,user_id', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      team_id: teamId,
      user_id: input.userId,
      role: 'owner',
    }),
  });
  if (!member.ok) {
    throw new Error(`Workspace membership creation failed with ${member.status}`);
  }
  const memberRow = firstObject(member.json);

  return {
    teamId,
    memberId: typeof memberRow?.id === 'string' ? memberRow.id : '',
    skipped: false,
  };
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const configuredToken = envValue(['BACKY_OWNER_BOOTSTRAP_TOKEN', 'BACKY_ADMIN_BOOTSTRAP_TOKEN']);
  const providedToken = readBootstrapToken(request, body);

  if (!configuredToken) {
    return errorResponse(
      503,
      'OWNER_BOOTSTRAP_NOT_CONFIGURED',
      'Owner bootstrap is disabled. Configure BACKY_OWNER_BOOTSTRAP_TOKEN as a server-only backy-public environment variable.',
      requestId,
    );
  }

  if (!providedToken || !secureEqual(providedToken, configuredToken)) {
    return errorResponse(401, 'UNAUTHORIZED_BOOTSTRAP_TOKEN', 'Invalid owner bootstrap token.', requestId);
  }

  if (process.env.BACKY_DATA_MODE !== 'database') {
    return errorResponse(503, 'DATABASE_MODE_REQUIRED', 'Owner bootstrap requires BACKY_DATA_MODE=database.', requestId);
  }

  const email = normalizeEmail(body.email);
  const password = normalizeText(body.password);
  const fullName = normalizeText(body.fullName) || email;
  const workspaceName = normalizeText(body.workspaceName) || 'Backy Workspace';
  const workspaceSlug = normalizeSlug(body.workspaceSlug, workspaceName);

  if (!email || !email.includes('@')) {
    return errorResponse(400, 'VALIDATION_ERROR', 'A valid owner email address is required.', requestId);
  }

  if (password.length < 12) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Owner bootstrap password must be at least 12 characters.', requestId);
  }

  const supabase = readSupabaseConfig();
  if (!supabase.url || !supabase.serviceKey) {
    return errorResponse(
      503,
      'SUPABASE_ADMIN_NOT_CONFIGURED',
      'Supabase URL and server-only service role key are required for owner bootstrap.',
      requestId,
    );
  }

  try {
    if (await activeOwnerExists(supabase.url, supabase.serviceKey)) {
      return errorResponse(
        409,
        'OWNER_ALREADY_EXISTS',
        'An active owner already exists. Owner bootstrap is one-time and will not create another master account.',
        requestId,
      );
    }

    const authUser = await createSupabaseAuthUser({
      url: supabase.url,
      serviceKey: supabase.serviceKey,
      email,
      password,
      fullName,
    });
    let ownerUserId = authUser.ok ? authUser.userId : '';
    let authAction = 'created-supabase-auth-user';
    if (!ownerUserId && (authUser.status === 409 || authUser.status === 422)) {
      const existingProfile = await findExistingBackyProfileByEmail(supabase.url, supabase.serviceKey, email);
      if (existingProfile) {
        ownerUserId = existingProfile.id as string;
        authAction = 'adopted-existing-backy-profile';
      } else {
        ownerUserId = await findSupabaseAuthUserByEmail(supabase.url, supabase.serviceKey, email);
        if (ownerUserId) {
          authAction = 'adopted-existing-supabase-auth-user';
        }
      }
    }
    if (!ownerUserId) {
      return errorResponse(
        authUser.status === 422 || authUser.status === 409 ? 409 : 502,
        'SUPABASE_OWNER_CREATE_FAILED',
        'Supabase Auth rejected owner creation and no matching Backy profile exists to adopt. Use an unused email address, or sign in once/create the profile before retrying owner bootstrap.',
        requestId,
      );
    }

    const owner = await upsertOwnerProfile({
      url: supabase.url,
      serviceKey: supabase.serviceKey,
      userId: ownerUserId,
      email,
      fullName,
    });
    const workspace = await ensureWorkspace({
      url: supabase.url,
      serviceKey: supabase.serviceKey,
      userId: ownerUserId,
      workspaceName,
      workspaceSlug,
    });

    return successResponse(requestId, {
      owner: {
        id: typeof owner?.id === 'string' ? owner.id : ownerUserId,
        email,
        fullName,
        role: 'owner',
        status: 'active',
      },
      workspace,
      authProvider: 'supabase',
      authAction,
      nextStep: 'Sign in through backy-admin with this owner email and password. Remove BACKY_OWNER_BOOTSTRAP_TOKEN after first owner creation.',
    });
  } catch (error) {
    console.error('Owner bootstrap API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Owner bootstrap failed without exposing internal details.', requestId);
  }
}

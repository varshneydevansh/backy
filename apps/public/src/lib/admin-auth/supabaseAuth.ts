type SupabaseAuthEnv = Record<string, string | undefined>;

type SupabaseAuthOptions = {
  env?: SupabaseAuthEnv;
  fetchImpl?: typeof fetch;
};

export type SupabaseAdminAuthIdentity = {
  email: string;
};

export class SupabaseAdminAuthUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseAdminAuthUnavailableError';
  }
}

const envValue = (env: SupabaseAuthEnv, keys: string[]) => {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }

  return '';
};

const normalizeSupabaseUrl = (value: string) => value.replace(/\/+$/, '');

const normalizeEmail = (value: unknown) => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const readSupabaseAuthConfig = (env: SupabaseAuthEnv = process.env) => {
  const url = envValue(env, ['BACKY_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const key = envValue(env, [
    'BACKY_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'BACKY_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]);

  return {
    url: url ? normalizeSupabaseUrl(url) : '',
    key,
  };
};

export const isSupabaseAdminAuthConfigured = (env: SupabaseAuthEnv = process.env): boolean => {
  const config = readSupabaseAuthConfig(env);
  return Boolean(config.url && config.key);
};

export const authenticateSupabaseAdminCredentials = async (
  email: string,
  password: string,
  options: SupabaseAuthOptions = {},
): Promise<SupabaseAdminAuthIdentity | null> => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) return null;

  const config = readSupabaseAuthConfig(options.env || process.env);
  if (!config.url || !config.key) return null;

  const fetchImpl = options.fetchImpl || fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: normalizedEmail,
        password,
      }),
    });
  } catch (error) {
    throw new SupabaseAdminAuthUnavailableError(error instanceof Error ? error.message : 'Supabase Auth request failed');
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (response.status === 400 || response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new SupabaseAdminAuthUnavailableError(`Supabase Auth returned ${response.status}`);
  }

  const supabaseEmail = normalizeEmail((payload?.user as Record<string, unknown> | undefined)?.email);
  if (!payload?.access_token || supabaseEmail !== normalizedEmail) {
    return null;
  }

  return { email: normalizedEmail };
};

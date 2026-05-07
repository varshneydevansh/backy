import type { Site } from '@/stores/mockStore';

type AdminSiteStatus = 'draft' | 'published' | 'scheduled' | 'archived';

interface ApiSite {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  customDomain?: string | null;
  status?: AdminSiteStatus;
  isPublished?: boolean;
  updatedAt?: string;
  createdAt?: string;
}

interface ApiListSitesResponse {
  success: boolean;
  data?: {
    sites: ApiSite[];
  };
  error?: {
    message?: string;
  };
}

interface ApiSiteResponse {
  success: boolean;
  data?: {
    site: ApiSite;
  };
  error?: {
    message?: string;
  };
}

interface ApiDeleteResponse {
  success: boolean;
  data?: {
    deleted: boolean;
    siteId: string;
  };
  error?: {
    message?: string;
  };
}

export interface SiteCreateInput {
  name: string;
  slug: string;
  description?: string;
  customDomain?: string | null;
  status?: Site['status'];
}

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const getAdminApiBase = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_ADMIN_API_BASE_URL') ||
    getEnvValue('VITE_ADMIN_API_URL') ||
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:3001/api/admin';
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api/admin`;
};

const toAdminSiteStatus = (status?: AdminSiteStatus, isPublished?: boolean): Site['status'] => {
  if (status === 'archived') return 'archived';
  if (status === 'published' || isPublished) return 'published';
  return 'draft';
};

const toStoreSite = (site: ApiSite): Site => ({
  id: site.id,
  name: site.name,
  slug: site.slug,
  description: site.description || '',
  customDomain: site.customDomain || null,
  status: toAdminSiteStatus(site.status, site.isPublished),
  publicSiteId: site.id,
  pageCount: 0,
  lastUpdated: site.updatedAt || site.createdAt || new Date().toISOString(),
});

const readJson = async <T>(response: Response): Promise<T> => {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
};

export async function listSites(): Promise<Site[]> {
  const response = await fetch(`${getAdminApiBase()}/sites?includeUnpublished=true`);
  const payload = await readJson<ApiListSitesResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load sites');
  }

  return payload.data.sites.map(toStoreSite);
}

export async function createSite(input: SiteCreateInput): Promise<Site> {
  const response = await fetch(`${getAdminApiBase()}/sites`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...input,
      isPublished: input.status === 'published',
    }),
  });
  const payload = await readJson<ApiSiteResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to create site');
  }

  return toStoreSite(payload.data.site);
}

export async function deleteSite(siteId: string): Promise<void> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete site');
  }
}

import type { Page, Site } from '@/stores/mockStore';

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

interface ApiPage {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  description?: string | null;
  status?: AdminSiteStatus;
  content?: unknown;
  meta?: Record<string, unknown>;
  updatedAt?: string;
  createdAt?: string;
}

interface ApiListPagesResponse {
  success: boolean;
  data?: {
    pages: ApiPage[];
  };
  error?: {
    message?: string;
  };
}

interface ApiPageResponse {
  success: boolean;
  data?: {
    page: ApiPage;
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

export interface PageCreateInput {
  title: string;
  slug: string;
  status?: Page['status'];
  description?: string;
  template?: string;
  meta?: Record<string, unknown>;
  content?: unknown;
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

const toStorePage = (page: ApiPage): Page => ({
  id: page.id,
  siteId: page.siteId,
  title: page.title,
  slug: page.slug,
  status: toAdminSiteStatus(page.status, page.status === 'published') === 'published' ? 'published' : 'draft',
  content: page.content ? JSON.stringify(page.content) : undefined,
  meta: page.meta || {
    title: page.title,
    description: page.description || '',
  },
  lastUpdated: page.updatedAt || page.createdAt || new Date().toISOString(),
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

export async function listPages(siteId: string): Promise<Page[]> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/pages?includeUnpublished=true`);
  const payload = await readJson<ApiListPagesResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load pages');
  }

  return payload.data.pages.map(toStorePage);
}

export async function createPage(siteId: string, input: PageCreateInput): Promise<Page> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/pages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiPageResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to create page');
  }

  return toStorePage(payload.data.page);
}

export async function deletePage(siteId: string, pageId: string): Promise<void> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete page');
  }
}

import type { BlogPost, Page, Site } from '@/stores/mockStore';

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

interface ApiBlogPost {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content?: unknown;
  status?: AdminSiteStatus;
  authorId?: string | null;
  meta?: Record<string, unknown>;
  publishedAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

interface ApiListBlogResponse {
  success: boolean;
  data?: {
    posts: ApiBlogPost[];
  };
  error?: {
    message?: string;
  };
}

interface ApiBlogPostResponse {
  success: boolean;
  data?: {
    post: ApiBlogPost;
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

export interface PageUpdateInput {
  title?: string;
  slug?: string;
  status?: Page['status'];
  description?: string;
  meta?: Record<string, unknown>;
  content?: unknown;
}

export interface BlogPostInput {
  title: string;
  slug: string;
  excerpt?: string;
  status?: BlogPost['status'];
  content?: unknown;
  meta?: Record<string, unknown>;
  authorId?: string | null;
}

export interface BlogPostUpdateInput {
  title?: string;
  slug?: string;
  excerpt?: string;
  status?: BlogPost['status'];
  content?: unknown;
  meta?: Record<string, unknown>;
  authorId?: string | null;
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

const stringifyContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (content && typeof content === 'object') {
    return JSON.stringify(content);
  }

  return '';
};

const toStorePost = (post: ApiBlogPost): BlogPost => ({
  id: post.id,
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt || '',
  content: stringifyContent(post.content),
  status: toAdminSiteStatus(post.status, post.status === 'published') === 'published' ? 'published' : 'draft',
  author: post.authorId || 'admin',
  publishedAt: post.publishedAt || post.updatedAt || post.createdAt || new Date().toISOString(),
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

export async function updateSite(siteId: string, input: Partial<SiteCreateInput>): Promise<Site> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}`, {
    method: 'PATCH',
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
    throw new Error(payload.error?.message || 'Unable to save site');
  }

  return toStoreSite(payload.data.site);
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

export async function getPage(siteId: string, pageId: string): Promise<Page> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}`);
  const payload = await readJson<ApiPageResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load page');
  }

  return toStorePage(payload.data.page);
}

export async function updatePage(siteId: string, pageId: string, input: PageUpdateInput): Promise<Page> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiPageResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save page');
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

export async function listBlogPosts(siteId: string): Promise<BlogPost[]> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/blog?limit=100`);
  const payload = await readJson<ApiListBlogResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load blog posts');
  }

  return payload.data.posts.map(toStorePost);
}

export async function createBlogPost(siteId: string, input: BlogPostInput): Promise<BlogPost> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/blog`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBlogPostResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to create blog post');
  }

  return toStorePost(payload.data.post);
}

export async function getBlogPost(siteId: string, postId: string): Promise<BlogPost> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}`);
  const payload = await readJson<ApiBlogPostResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load blog post');
  }

  return toStorePost(payload.data.post);
}

export async function updateBlogPost(
  siteId: string,
  postId: string,
  input: BlogPostUpdateInput,
): Promise<BlogPost> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBlogPostResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save blog post');
  }

  return toStorePost(payload.data.post);
}

export async function deleteBlogPost(siteId: string, postId: string): Promise<void> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete blog post');
  }
}

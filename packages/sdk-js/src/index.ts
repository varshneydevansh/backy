export interface BackyClientOptions {
  baseUrl: string;
  siteId?: string;
  fetch?: typeof fetch;
  requestIdFactory?: () => string;
  defaultHeaders?: HeadersInit;
}

export interface BackyEnvelope<TData> {
  success: true;
  requestId: string;
  data: TData;
  [legacyKey: string]: unknown;
}

export interface BackyErrorEnvelope {
  success: false;
  requestId?: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface BackyListOptions {
  limit?: number;
  offset?: number;
  requestId?: string;
}

export interface BackyMediaListOptions extends BackyListOptions {
  type?: 'image' | 'video' | 'audio' | 'document' | 'font';
  q?: string;
  tag?: string;
  folderId?: string;
  scope?: string;
  pageId?: string;
  postId?: string;
}

export interface BackyCollectionRecordListOptions extends BackyListOptions {
  slug?: string;
  q?: string;
  fieldKey?: string;
  fieldValue?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface BackyFormSubmissionInput {
  values: Record<string, unknown>;
  requestId?: string;
  pageId?: string;
  postId?: string;
  honeypot?: string;
  startedAt?: string | number;
  contactShareOverride?: unknown;
}

export interface BackyCommentInput {
  authorName: string;
  authorEmail?: string;
  body: string;
  requestId?: string;
  parentId?: string;
}

export interface BackyCommentListOptions extends BackyListOptions {
  targetType?: 'page' | 'post';
  targetId?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'spam';
}

export interface BackyEventListOptions extends BackyListOptions {
  kind?: string;
}

export interface BackyRouteResolve {
  site: Record<string, unknown>;
  route: Record<string, unknown>;
  navigation?: Record<string, unknown>;
}

export interface BackyFrontendManifest {
  schemaVersion: string;
  site: Record<string, unknown>;
  contract: Record<string, unknown>;
  capabilities: Record<string, boolean>;
  endpoints: Record<string, string>;
  routePatterns: Array<Record<string, unknown>>;
  modules: Record<string, unknown>;
  navigation: Record<string, unknown>;
}

export class BackyApiError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, envelope: BackyErrorEnvelope) {
    super(envelope.error.message);
    this.name = 'BackyApiError';
    this.status = status;
    this.requestId = envelope.requestId;
    this.code = envelope.error.code;
    this.details = envelope.error.details;
  }
}

export class BackyClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestIdFactory: () => string;
  private readonly defaultHeaders?: HeadersInit;
  private siteId?: string;

  constructor(options: BackyClientOptions) {
    if (!options.baseUrl) {
      throw new Error('BackyClient requires a baseUrl.');
    }

    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.siteId = options.siteId;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.requestIdFactory = options.requestIdFactory ?? (() => `sdk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
    this.defaultHeaders = options.defaultHeaders;

    if (!this.fetchImpl) {
      throw new Error('BackyClient requires a fetch implementation.');
    }
  }

  setSiteId(siteId: string): void {
    this.siteId = siteId;
  }

  getSiteId(): string | undefined {
    return this.siteId;
  }

  sites(): Promise<BackyEnvelope<{ sites: Array<Record<string, unknown>>; pagination?: Record<string, unknown> }>> {
    return this.request('/api/sites');
  }

  async discoverSite(identifier: string): Promise<BackyEnvelope<{ site: Record<string, unknown> }>> {
    const envelope = await this.request<{ site: Record<string, unknown> }>('/api/sites', {
      query: { identifier },
    });
    const discoveredSiteId = typeof envelope.data.site.id === 'string' ? envelope.data.site.id : undefined;
    if (discoveredSiteId) {
      this.siteId = discoveredSiteId;
    }
    return envelope;
  }

  manifest(siteId = this.requireSiteId()): Promise<BackyEnvelope<BackyFrontendManifest>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/manifest`);
  }

  openapi(siteId = this.requireSiteId()): Promise<Record<string, unknown>> {
    return this.requestRawJson(`/api/sites/${encodeURIComponent(siteId)}/openapi`);
  }

  resolve(path: string, options: { previewToken?: string; siteId?: string } = {}): Promise<BackyEnvelope<BackyRouteResolve>> {
    return this.request(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/resolve`, {
      query: { path, previewToken: options.previewToken },
    });
  }

  render<TPayload = Record<string, unknown>>(path: string, options: { previewToken?: string; siteId?: string } = {}): Promise<BackyEnvelope<TPayload>> {
    return this.request(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/render`, {
      query: { path, previewToken: options.previewToken },
    });
  }

  navigation(siteId = this.requireSiteId()): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/navigation`);
  }

  pages(options: { path?: string; previewToken?: string; siteId?: string } = {}): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/pages`, {
      query: { path: options.path, previewToken: options.previewToken },
    });
  }

  blog(options: Record<string, string | number | boolean | undefined> = {}): Promise<BackyEnvelope<Record<string, unknown>>> {
    const siteId = typeof options.siteId === 'string' ? options.siteId : this.requireSiteId();
    const { siteId: _siteId, ...query } = options;
    void _siteId;
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/blog`, { query });
  }

  media(options: BackyMediaListOptions = {}): Promise<BackyEnvelope<Record<string, unknown>>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/media`, {
      query,
      requestId,
    });
  }

  collections(siteId = this.requireSiteId()): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/collections`);
  }

  collection(collectionId: string): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}`);
  }

  records(collectionId: string, options: BackyCollectionRecordListOptions = {}): Promise<BackyEnvelope<Record<string, unknown>>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records`, {
      query,
      requestId,
    });
  }

  createRecord(collectionId: string, values: Record<string, unknown>, slug?: string): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records`, {
      method: 'POST',
      body: { values, slug },
    });
  }

  forms(options: { pageId?: string; postId?: string; active?: boolean } = {}): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/forms`, { query: options });
  }

  form(formId: string): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}`);
  }

  formSubmissions(formId: string, options: BackyListOptions & { status?: string } = {}): Promise<BackyEnvelope<Record<string, unknown>>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions`, {
      query,
      requestId,
    });
  }

  submitForm(formId: string, input: BackyFormSubmissionInput): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions`, {
      method: 'POST',
      body: input,
      requestId: input.requestId,
    });
  }

  formSubmission(formId: string, submissionId: string): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`);
  }

  updateFormSubmission(formId: string, submissionId: string, updates: Record<string, unknown>): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  formContacts(formId: string, options: BackyListOptions & { status?: string } = {}): Promise<BackyEnvelope<Record<string, unknown>>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts`, {
      query,
      requestId,
    });
  }

  updateFormContact(formId: string, contactId: string, updates: Record<string, unknown>): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts/${encodeURIComponent(contactId)}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  pageComments(pageId: string, options: BackyCommentListOptions = {}): Promise<BackyEnvelope<Record<string, unknown>>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments`, {
      query,
      requestId,
    });
  }

  submitPageComment(pageId: string, input: BackyCommentInput): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments`, {
      method: 'POST',
      body: input,
      requestId: input.requestId,
    });
  }

  pageComment(pageId: string, commentId: string): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}`);
  }

  updatePageComment(pageId: string, commentId: string, updates: Record<string, unknown>): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  blogComments(postId: string, options: BackyCommentListOptions = {}): Promise<BackyEnvelope<Record<string, unknown>>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments`, {
      query,
      requestId,
    });
  }

  submitBlogComment(postId: string, input: BackyCommentInput): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      body: input,
      requestId: input.requestId,
    });
  }

  blogComment(postId: string, commentId: string): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`);
  }

  updateBlogComment(postId: string, commentId: string, updates: Record<string, unknown>): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  siteComments(options: BackyCommentListOptions = {}): Promise<BackyEnvelope<Record<string, unknown>>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments`, {
      query,
      requestId,
    });
  }

  comment(commentId: string): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}`);
  }

  updateComment(commentId: string, updates: Record<string, unknown>): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  reportReasons(): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/report-reasons`);
  }

  reportComment(commentId: string, input: { reason: string; details?: string; reporterEmail?: string; requestId?: string }): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}/report`, {
      method: 'POST',
      body: input,
      requestId: input.requestId,
    });
  }

  events(options: BackyEventListOptions = {}): Promise<BackyEnvelope<Record<string, unknown>>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/events`, {
      query,
      requestId,
    });
  }

  private requireSiteId(): string {
    if (!this.siteId) {
      throw new Error('BackyClient requires a siteId. Pass siteId to the constructor or call discoverSite().');
    }
    return this.siteId;
  }

  private async request<TData>(
    path: string,
    options: {
      method?: string;
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      requestId?: string;
    } = {},
  ): Promise<BackyEnvelope<TData>> {
    const json = await this.requestRawJson(path, options);
    if (isBackyErrorEnvelope(json)) {
      throw new BackyApiError(200, json);
    }
    if (!isBackyEnvelope<TData>(json)) {
      throw new Error(`Backy API returned an invalid envelope for ${path}.`);
    }
    return json;
  }

  private async requestRawJson(
    path: string,
    options: {
      method?: string;
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      requestId?: string;
    } = {},
  ): Promise<Record<string, unknown>> {
    const url = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers(this.defaultHeaders);
    const requestId = options.requestId ?? this.requestIdFactory();
    headers.set('x-request-id', requestId);
    if (options.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const response = await this.fetchImpl(url, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const json = await response.json().catch(() => null) as unknown;

    if (!response.ok) {
      if (isBackyErrorEnvelope(json)) {
        throw new BackyApiError(response.status, json);
      }
      throw new Error(`Backy API request failed with HTTP ${response.status} for ${url.pathname}.`);
    }

    if (!json || typeof json !== 'object') {
      throw new Error(`Backy API returned non-JSON response for ${url.pathname}.`);
    }

    return json as Record<string, unknown>;
  }
}

export const createBackyClient = (options: BackyClientOptions) => new BackyClient(options);

function isBackyEnvelope<TData>(value: unknown): value is BackyEnvelope<TData> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { success?: unknown }).success === true &&
    typeof (value as { requestId?: unknown }).requestId === 'string' &&
    'data' in value,
  );
}

function isBackyErrorEnvelope(value: unknown): value is BackyErrorEnvelope {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { success?: unknown }).success === false &&
    typeof (value as { error?: { code?: unknown; message?: unknown } }).error?.code === 'string' &&
    typeof (value as { error?: { code?: unknown; message?: unknown } }).error?.message === 'string',
  );
}

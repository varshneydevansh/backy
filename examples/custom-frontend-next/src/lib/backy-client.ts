export type BackyEnv = Record<string, string | undefined>;

export type BackyEnvelope<TData> = {
  success: true;
  requestId?: string;
  data: TData;
};

export type BackyErrorEnvelope = {
  success: false;
  requestId?: string;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
};

export type BackyNavigationItem = {
  id?: string;
  href?: string;
  label?: string;
  title?: string;
};

export type BackyMediaAsset = {
  id: string;
  url?: string;
  src?: string;
  deliveryUrl?: string;
};

export type BackyElement = {
  id: string;
  type: string;
  name?: string;
  parentId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  visible?: boolean;
  hidden?: boolean;
  componentKey?: string;
  props?: Record<string, unknown>;
  style?: Record<string, unknown>;
  styles?: Record<string, unknown>;
  responsive?: Record<string, unknown>;
  tokenRefs?: Record<string, string>;
  animation?: Record<string, unknown>;
  actions?: unknown[];
  dataBindings?: unknown[];
  bindingSlots?: unknown[];
  accessibility?: Record<string, unknown>;
  assetIds?: string[];
  metadata?: Record<string, unknown>;
  children?: BackyElement[];
  [key: string]: unknown;
};

export type BackyRenderPayload = {
  site: {
    id: string;
    name?: string;
    locale?: string;
  };
  navigation: {
    primary: BackyNavigationItem[];
    footer?: BackyNavigationItem[];
  };
  route: {
    path: string;
    type?: string;
    resource?: Record<string, unknown>;
  };
  content: {
    elements?: BackyElement[];
    contentDocument?: {
      elements?: BackyElement[];
      [key: string]: unknown;
    };
    canvas?: Record<string, unknown>;
    [key: string]: unknown;
  };
  assets: {
    media: BackyMediaAsset[];
    fonts?: unknown[];
  };
  interactions: {
    forms?: BackyFormDefinition[];
    [key: string]: unknown;
  };
  seo: Record<string, unknown>;
  dataBindings?: Record<string, unknown>;
  editableMap?: unknown;
};

export type BackyManifest = {
  schemaVersion?: string;
  site: {
    id: string;
    name?: string;
    locale?: string;
    frontendDesign?: unknown;
  };
  contract?: Record<string, unknown>;
  modules?: Record<string, unknown>;
};

export type BackyFormFieldDefinition = {
  key: string;
  label?: string;
  type?: string;
};

export type BackyFormDefinition = {
  id: string;
  fields?: BackyFormFieldDefinition[];
  frontendFieldKeyMap?: Record<string, string>;
  settings?: {
    frontendFieldKeyMap?: Record<string, string>;
    [key: string]: unknown;
  };
};

export type BackyFormSubmissionInput = {
  values: Record<string, unknown>;
  requestId?: string;
  pageId?: string;
  postId?: string;
  honeypot?: string;
  startedAt?: string | number;
};

export type BackyCustomFrontendConfig = {
  baseUrl: string;
  apiBaseUrl: string;
  siteId: string;
  sitePublicHost?: string;
  browserSafeEnv: {
    NEXT_PUBLIC_BACKY_API_BASE_URL: string;
    NEXT_PUBLIC_BACKY_SITE_ID: string;
    NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST: string;
  };
  serverSideEnv: {
    BACKY_PUBLIC_API_BASE_URL: string;
    BACKY_SITE_ID: string;
    BACKY_SITE_PUBLIC_HOST: string;
  };
  forbiddenEnv: readonly string[];
};

export class BackyApiError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, envelope: BackyErrorEnvelope) {
    super(envelope.error?.message || envelope.message || `Backy request failed with ${status}`);
    this.name = "BackyApiError";
    this.status = status;
    this.requestId = envelope.requestId;
    this.code = envelope.error?.code || "backy_request_failed";
    this.details = envelope.error?.details;
  }
}

export const BACKY_CUSTOM_FRONTEND_FORBIDDEN_ENV = [
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "BACKY_DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "BACKY_ADMIN_API_KEY",
  "BACKY_ADMIN_SECRET_KEY",
  "BACKY_BOOTSTRAP_TOKEN",
  "CRON_SECRET",
  "SMTP_PASSWORD",
  "STRIPE_SECRET_KEY",
] as const;

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeBackyBaseUrl = (value: string): string => {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("Backy custom frontend requires BACKY public API base URL.");
  return trimmed.endsWith("/api") ? trimmed.slice(0, -4) : trimmed;
};

const apiBaseUrl = (baseUrl: string): string => `${baseUrl.replace(/\/+$/, "")}/api`;

export function resolveBackyCustomFrontendConfig({
  env,
  baseUrl,
  siteId,
  sitePublicHost,
}: {
  env: BackyEnv;
  baseUrl?: string;
  siteId?: string;
  sitePublicHost?: string;
}): BackyCustomFrontendConfig {
  const resolvedBaseUrl = normalizeBackyBaseUrl(
    text(baseUrl) ||
      text(env.NEXT_PUBLIC_BACKY_API_BASE_URL) ||
      text(env.BACKY_PUBLIC_API_BASE_URL),
  );
  const resolvedSiteId =
    text(siteId) || text(env.NEXT_PUBLIC_BACKY_SITE_ID) || text(env.BACKY_SITE_ID);
  if (!resolvedSiteId) {
    throw new Error("Backy custom frontend requires NEXT_PUBLIC_BACKY_SITE_ID or BACKY_SITE_ID.");
  }
  const resolvedHost =
    text(sitePublicHost) ||
    text(env.NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST) ||
    text(env.BACKY_SITE_PUBLIC_HOST) ||
    undefined;
  const resolvedApiBaseUrl = apiBaseUrl(resolvedBaseUrl);

  return {
    baseUrl: resolvedBaseUrl,
    apiBaseUrl: resolvedApiBaseUrl,
    siteId: resolvedSiteId,
    sitePublicHost: resolvedHost,
    browserSafeEnv: {
      NEXT_PUBLIC_BACKY_API_BASE_URL: resolvedApiBaseUrl,
      NEXT_PUBLIC_BACKY_SITE_ID: resolvedSiteId,
      NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST: resolvedHost || "",
    },
    serverSideEnv: {
      BACKY_PUBLIC_API_BASE_URL: resolvedApiBaseUrl,
      BACKY_SITE_ID: resolvedSiteId,
      BACKY_SITE_PUBLIC_HOST: resolvedHost || "",
    },
    forbiddenEnv: BACKY_CUSTOM_FRONTEND_FORBIDDEN_ENV,
  };
}

export class BackyCustomFrontendClient {
  constructor(
    private readonly config: BackyCustomFrontendConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  getSiteId(): string {
    return this.config.siteId;
  }

  getApiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }

  getSitePublicHost(): string | undefined {
    return this.config.sitePublicHost;
  }

  async manifest(): Promise<BackyEnvelope<BackyManifest>> {
    return this.request(`/api/sites/${encodeURIComponent(this.config.siteId)}/manifest`);
  }

  async render<TPayload = BackyRenderPayload>(
    path: string,
    options: {
      schemaVersion?: string;
      domain?: string;
      host?: string;
      sitePublicHost?: string;
    } = {},
  ): Promise<BackyEnvelope<TPayload>> {
    return this.request(`/api/sites/${encodeURIComponent(this.config.siteId)}/render`, {
      query: {
        path,
        schemaVersion: options.schemaVersion,
        domain:
          text(options.domain) ||
          text(options.host) ||
          text(options.sitePublicHost) ||
          this.config.sitePublicHost,
      },
    });
  }

  async formDefinition(
    formId: string,
  ): Promise<BackyEnvelope<{ form: BackyFormDefinition; submitUrl: string }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.config.siteId)}/forms/${encodeURIComponent(formId)}/definition`,
    );
  }

  async submitForm(
    formId: string,
    input: BackyFormSubmissionInput,
  ): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.config.siteId)}/forms/${encodeURIComponent(formId)}/submissions`,
      {
        method: "POST",
        body: input,
      },
    );
  }

  async subscribeNewsletter(input: {
    values: {
      email: string;
      consent: boolean;
      name?: string;
      topics?: string;
      source?: string;
      consentText?: string;
    };
  }): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.config.siteId)}/newsletter/subscribers`, {
      method: "POST",
      body: input,
    });
  }

  async unsubscribeNewsletter(input: {
    values: {
      email: string;
      formId?: string;
      source?: string;
      signup_source?: string;
    };
  }): Promise<BackyEnvelope<Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(this.config.siteId)}/newsletter/subscribers`, {
      method: "DELETE",
      body: input,
    });
  }

  private async request<TData>(
    pathname: string,
    options: {
      method?: string;
      query?: Record<string, string | undefined>;
      body?: unknown;
    } = {},
  ): Promise<TData> {
    const url = new URL(`${this.config.baseUrl}${pathname}`);
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value) url.searchParams.set(key, value);
    }

    const response = await this.fetchImpl(url, {
      method: options.method || "GET",
      headers: {
        "content-type": "application/json",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: options.method ? "no-store" : "force-cache",
    });
    const json = (await response.json().catch(() => ({}))) as TData | BackyErrorEnvelope;

    if (!response.ok || (json && typeof json === "object" && "success" in json && json.success === false)) {
      throw new BackyApiError(response.status, json as BackyErrorEnvelope);
    }

    return json as TData;
  }
}

export function createBackyCustomFrontendClient(options: {
  env: BackyEnv;
  baseUrl?: string;
  siteId?: string;
  sitePublicHost?: string;
  fetch?: typeof fetch;
}): BackyCustomFrontendClient {
  return new BackyCustomFrontendClient(
    resolveBackyCustomFrontendConfig(options),
    options.fetch || globalThis.fetch,
  );
}

export function buildBackyFormSubmissionInput(
  form: BackyFormDefinition,
  source: Record<string, unknown>,
  options: { includeUnmappedValues?: boolean; startedAt?: string | number } = {},
): BackyFormSubmissionInput {
  const transportKeys = new Set(["formId", "requestId", "pageId", "postId", "honeypot", "startedAt"]);
  const fieldKeys = new Set((form.fields || []).map((field) => field.key).filter(Boolean));
  const frontendFieldKeyMap = {
    ...(form.settings?.frontendFieldKeyMap || {}),
    ...(form.frontendFieldKeyMap || {}),
  };
  const values = Object.entries(source).reduce<Record<string, unknown>>((nextValues, [key, value]) => {
    if (transportKeys.has(key)) return nextValues;
    const mappedKey = fieldKeys.has(key) ? key : frontendFieldKeyMap[key];
    if (mappedKey && (fieldKeys.size === 0 || fieldKeys.has(mappedKey))) {
      nextValues[mappedKey] = value;
    } else if (options.includeUnmappedValues) {
      nextValues[key] = value;
    }
    return nextValues;
  }, {});

  return {
    values,
    startedAt: options.startedAt,
  };
}

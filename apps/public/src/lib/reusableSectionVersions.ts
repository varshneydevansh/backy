type ReusableSectionLike = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category: string;
  status: string;
  tags?: string[];
  content: unknown;
  metadata?: Record<string, unknown>;
  sourceElementId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReusableSectionVersionEntry = {
  version: number;
  current?: boolean;
  capturedAt?: string;
  requestId?: string;
  name: string;
  slug: string;
  description?: string | null;
  category: string;
  status: string;
  tags: string[];
  content: unknown;
  sourceElementId?: string | null;
  updatedBy?: string | null;
  updatedAt: string;
};

const VERSION_HISTORY_LIMIT = 25;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const cloneJson = <T>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

const toObject = (value: unknown): Record<string, unknown> => (
  isRecord(value) ? { ...value } : {}
);

const numberValue = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
};

const reusableSectionMeta = (metadata: unknown): Record<string, unknown> => (
  toObject(toObject(metadata).reusableSection)
);

export const reusableSectionVersionFromMetadata = (metadata: unknown): number => (
  numberValue(reusableSectionMeta(metadata).version)
    || numberValue(toObject(metadata).version)
    || 1
);

export const reusableSectionConflict = (
  section: ReusableSectionLike,
  input: Record<string, unknown>,
): { expectedVersion?: number; currentVersion: number; expectedUpdatedAt?: string } | null => {
  const currentVersion = reusableSectionVersionFromMetadata(section.metadata);
  const expectedVersion = numberValue(input.expectedVersion);
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    return { expectedVersion, currentVersion };
  }

  const expectedUpdatedAt = typeof input.expectedUpdatedAt === 'string' ? input.expectedUpdatedAt.trim() : '';
  if (expectedUpdatedAt && expectedUpdatedAt !== section.updatedAt) {
    return { currentVersion, expectedUpdatedAt };
  }

  return null;
};

export const buildInitialReusableSectionMetadata = (
  metadata: unknown,
  input: {
    actor?: string | null;
    now?: string;
    requestId?: string;
  } = {},
): Record<string, unknown> => {
  const now = input.now || new Date().toISOString();
  const base = toObject(metadata);
  const existing = reusableSectionMeta(base);
  return {
    ...base,
    reusableSection: {
      ...existing,
      version: numberValue(existing.version) || 1,
      history: Array.isArray(existing.history) ? existing.history : [],
      createdAt: typeof existing.createdAt === 'string' ? existing.createdAt : now,
      updatedAt: typeof existing.updatedAt === 'string' ? existing.updatedAt : now,
      updatedBy: input.actor || existing.updatedBy || null,
      requestId: input.requestId || existing.requestId || undefined,
    },
  };
};

const snapshotSectionVersion = (
  section: ReusableSectionLike,
  version: number,
  input: {
    capturedAt: string;
    requestId?: string;
  },
): ReusableSectionVersionEntry => ({
  version,
  capturedAt: input.capturedAt,
  requestId: input.requestId,
  name: section.name,
  slug: section.slug,
  description: section.description ?? null,
  category: section.category,
  status: section.status,
  tags: Array.isArray(section.tags) ? [...section.tags] : [],
  content: cloneJson(section.content),
  sourceElementId: section.sourceElementId ?? null,
  updatedBy: section.updatedBy ?? null,
  updatedAt: section.updatedAt,
});

export const buildReusableSectionUpdateMetadata = (
  section: ReusableSectionLike,
  metadata: unknown,
  input: {
    actor?: string | null;
    now?: string;
    requestId?: string;
  } = {},
): Record<string, unknown> => {
  const now = input.now || new Date().toISOString();
  const currentMetadata = toObject(section.metadata);
  const nextMetadata = metadata === undefined ? { ...currentMetadata } : toObject(metadata);
  const currentReusable = reusableSectionMeta(currentMetadata);
  const incomingReusable = reusableSectionMeta(nextMetadata);
  const currentVersion = reusableSectionVersionFromMetadata(currentMetadata);
  const currentHistory = Array.isArray(currentReusable.history) ? currentReusable.history : [];
  const incomingHistory = Array.isArray(incomingReusable.history) ? incomingReusable.history : currentHistory;
  const nextVersion = currentVersion + 1;

  return {
    ...nextMetadata,
    reusableSection: {
      ...currentReusable,
      ...incomingReusable,
      version: nextVersion,
      previousVersion: currentVersion,
      updatedAt: now,
      updatedBy: input.actor || incomingReusable.updatedBy || currentReusable.updatedBy || section.updatedBy || null,
      requestId: input.requestId || incomingReusable.requestId || currentReusable.requestId || undefined,
      history: [
        snapshotSectionVersion(section, currentVersion, { capturedAt: now, requestId: input.requestId }),
        ...incomingHistory,
      ].slice(0, VERSION_HISTORY_LIMIT),
    },
  };
};

export const listReusableSectionVersions = (
  section: ReusableSectionLike,
): {
  currentVersion: number;
  versions: ReusableSectionVersionEntry[];
} => {
  const currentVersion = reusableSectionVersionFromMetadata(section.metadata);
  const history = reusableSectionMeta(section.metadata).history;
  const versions = Array.isArray(history)
    ? history.filter(isRecord).map((entry) => cloneJson(entry) as ReusableSectionVersionEntry)
    : [];

  return {
    currentVersion,
    versions: [
      {
        version: currentVersion,
        current: true,
        name: section.name,
        slug: section.slug,
        description: section.description ?? null,
        category: section.category,
        status: section.status,
        tags: Array.isArray(section.tags) ? [...section.tags] : [],
        content: cloneJson(section.content),
        sourceElementId: section.sourceElementId ?? null,
        updatedBy: section.updatedBy ?? null,
        updatedAt: section.updatedAt,
      },
      ...versions,
    ],
  };
};

import { buildPublicInteractiveComponentRegistry, type BackyInteractiveComponentRegistryEntry } from './interactiveComponentRegistry';
import { sanitizePublicInteractiveComponentMetadata } from './publicInteractiveComponentMetadata';

export type PublicRegistryComponent = {
  componentKey: string;
  displayName: string;
  type: BackyInteractiveComponentRegistryEntry['type'];
  status: 'active' | 'disabled' | 'archived' | string;
  version: string;
  renderMode: BackyInteractiveComponentRegistryEntry['renderMode'];
  source: BackyInteractiveComponentRegistryEntry['source'];
  description?: string;
  allowedDataScopes?: string[];
  requiredFields?: string[];
  controls?: Array<Record<string, unknown>>;
  defaultProps?: Record<string, unknown>;
  propsSchema?: Record<string, unknown>;
  fallback?: BackyInteractiveComponentRegistryEntry['fallback'];
  integrity?: BackyInteractiveComponentRegistryEntry['integrity'];
  runtime?: BackyInteractiveComponentRegistryEntry['runtime'];
  dataBindings?: Array<Record<string, unknown>>;
  renderCapabilities?: Record<string, unknown>;
  dependencyMetadata?: Record<string, unknown>;
};

const recordValue = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
);

const stringListValue = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
    : []
);

const recordListValue = (value: unknown): Array<Record<string, unknown>> | undefined => (
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    : undefined
);

const normalizeDependencyPolicy = (value: unknown): BackyInteractiveComponentRegistryEntry['dependencyPolicy'] | undefined => {
  const record = recordValue(value);
  const preset = typeof record?.preset === 'string' ? record.preset : '';
  if (preset !== 'built-in' && preset !== 'signed-sandbox' && preset !== 'no-runtime-deps') {
    return undefined;
  }
  if (!record) {
    return undefined;
  }

  return {
    preset,
    allowedPackagePatterns: stringListValue(record.allowedPackagePatterns),
    blockedBuiltins: stringListValue(record.blockedBuiltins),
    lifecycleScripts: false,
    remoteRuntimeUrls: false,
  };
};

const normalizeCompatibility = (value: unknown): BackyInteractiveComponentRegistryEntry['compatibility'] | undefined => {
  const record = recordValue(value);
  const reducedMotion = record?.reducedMotion === 'recommended' ? 'recommended' : 'required';
  const backyRuntime = typeof record?.backyRuntime === 'string' ? record.backyRuntime.trim() : '';
  const renderTargets = stringListValue(record?.renderTargets);

  if (!backyRuntime || renderTargets.length === 0) {
    return undefined;
  }

  return {
    backyRuntime,
    renderTargets,
    animationLibraries: stringListValue(record?.animationLibraries),
    browserSupport: stringListValue(record?.browserSupport),
    reducedMotion,
  };
};

export const toPublicRegistryEntry = (component: PublicRegistryComponent): BackyInteractiveComponentRegistryEntry => ({
  componentKey: component.componentKey,
  displayName: component.displayName,
  type: component.type,
  status: component.status === 'active' ? 'active' : 'disabled',
  version: component.version,
  renderMode: component.renderMode,
  source: component.source,
  description: component.description || '',
  allowedDataScopes: component.allowedDataScopes || [],
  requiredFields: component.requiredFields || [],
  controls: component.controls || [],
  defaultProps: sanitizePublicInteractiveComponentMetadata(component.defaultProps || component.dependencyMetadata?.defaultProps),
  propsSchema: sanitizePublicInteractiveComponentMetadata(component.propsSchema || component.dependencyMetadata?.propsSchema),
  fallback: (sanitizePublicInteractiveComponentMetadata(component.fallback) || { required: true, supported: [] }) as BackyInteractiveComponentRegistryEntry['fallback'],
  ...sanitizePublicInteractiveComponentMetadata({ dataBindings: component.dataBindings || component.dependencyMetadata?.dataBindings, renderCapabilities: component.renderCapabilities || component.dependencyMetadata?.renderCapabilities }),
  security: {
    adminApiAccess: false,
    parentDomAccess: false,
    parentCookieAccess: false,
    secretsInPayload: false,
    communication: 'postMessage-only',
  },
  integrity: component.integrity || { signed: false, signatureRequiredForCustomCode: true },
  runtime: component.runtime,
  dependencyPolicy: normalizeDependencyPolicy(component.dependencyMetadata?.dependencyPolicy),
  compatibility: normalizeCompatibility(component.dependencyMetadata?.compatibility),
  dataBindingPresets: recordListValue(component.dependencyMetadata?.dataBindingPresets) as BackyInteractiveComponentRegistryEntry['dataBindingPresets'],
});

/** Read every repository page before merging built-ins; never report a truncated catalog as complete. */
export async function loadCompleteRegistryEntries<T>(list: (offset: number) => Promise<{ items: T[]; pagination: { total: number; offset: number; hasMore: boolean } }>): Promise<T[]> {
  const entries: T[] = [];
  let total: number | undefined;
  while (true) {
    const page = await list(entries.length);
    if (!Number.isSafeInteger(page.pagination.total) || page.pagination.total < 0 || page.pagination.offset !== entries.length
      || (total !== undefined && total !== page.pagination.total) || (page.pagination.hasMore && page.items.length === 0)) throw new Error('Component registry changed while loading. Retry discovery.');
    total = page.pagination.total;
    entries.push(...page.items);
    if (entries.length > total || page.pagination.hasMore !== (entries.length < total)) throw new Error('Invalid component registry pagination.');
    if (!page.pagination.hasMore) return entries;
  }
}

export function registryPageOptions(url: string) {
  const query = new URL(url).searchParams;
  const integer = (name: string, fallback: number) => {
    const raw = query.get(name);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('Registry pagination must use nonnegative integers.');
    return Number(raw);
  };
  const limit = integer('limit', 100), offset = integer('offset', 0);
  if (limit < 1 || limit > 100) throw new Error('Registry page limit must be between 1 and 100.');
  return { limit, offset };
}
export function paginateRegistry(siteId: string, entries: BackyInteractiveComponentRegistryEntry[], options: { limit: number; offset: number }) {
  const registry = buildPublicInteractiveComponentRegistry(siteId, entries);
  const total = registry.components.length;
  return { ...registry, components: registry.components.slice(options.offset, options.offset + options.limit),
    pagination: { total, ...options, hasMore: options.offset + options.limit < total } };
}

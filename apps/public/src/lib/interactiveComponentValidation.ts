type InteractiveComponentValidationInput = Record<string, unknown>;

type ExistingInteractiveComponent = {
  siteId?: string;
  componentKey?: string;
  version?: string;
  type?: string;
  status?: string;
  reviewStatus?: string;
  renderMode?: string;
  source?: string;
  runtime?: unknown;
  integrity?: unknown;
  dependencyMetadata?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const recordValue = (value: unknown): Record<string, unknown> => (
  isRecord(value) ? value : {}
);

const stringValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const listValue = (value: unknown): unknown[] => (
  Array.isArray(value) ? value : []
);

const stringListValue = (value: unknown): string[] => (
  listValue(value).map(stringValue).filter(Boolean)
);

const finalString = (
  input: InteractiveComponentValidationInput,
  existing: ExistingInteractiveComponent | undefined,
  key: keyof ExistingInteractiveComponent,
  fallback: string,
) => stringValue(input[key]) || stringValue(existing?.[key]) || fallback;

const finalRecord = (
  input: InteractiveComponentValidationInput,
  existing: ExistingInteractiveComponent | undefined,
  key: keyof ExistingInteractiveComponent,
): Record<string, unknown> => ({
  ...recordValue(existing?.[key]),
  ...recordValue(input[key]),
});

const safeRelativeOrHttpsUrl = (value: unknown, { allowEmpty = true } = {}): boolean => {
  const text = stringValue(value);
  if (!text) return allowEmpty;
  if (text.startsWith('/')) return !text.startsWith('//') && !text.includes('\\');
  try {
    const url = new URL(text);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};

const decodePathSegment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const safeRelativeSandboxUrl = (
  value: unknown,
  {
    allowEmpty = true,
    siteId = '',
    componentKey = '',
    version = '',
  } = {},
): boolean => {
  const text = stringValue(value);
  if (!text) return allowEmpty;
  if (!text.startsWith('/') || text.startsWith('//') || text.includes('\\')) {
    return false;
  }

  const match = text.match(/^\/api\/sites\/([^/?#]+)\/interactive-components\/([^/?#]+)\/([^/?#]+)\/sandbox(?:[?#].*)?$/);
  if (!match) {
    return false;
  }

  const [, routeSiteId, routeComponentKey, routeVersion] = match.map(decodePathSegment);
  return (!siteId || routeSiteId === siteId)
    && (!componentKey || routeComponentKey === componentKey)
    && (!version || routeVersion === version);
};

const dependencyNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const dependencyVersionPattern = /^[a-zA-Z0-9._~^*+=:,/@-]{1,80}$/;
const blockedDependencyNames = new Set([
  'child_process',
  'cluster',
  'crypto',
  'fs',
  'http',
  'https',
  'net',
  'os',
  'path',
  'process',
  'tls',
  'worker_threads',
]);

const validateDependencies = (metadata: Record<string, unknown>): string[] => {
  const issues: string[] = [];
  const dependencies = listValue(metadata.dependencies);
  if (dependencies.length > 100) {
    issues.push('dependencyMetadata.dependencies cannot exceed 100 entries.');
  }

  dependencies.slice(0, 100).forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(`dependencyMetadata.dependencies[${index}] must be an object.`);
      return;
    }
    const name = stringValue(entry.name);
    const version = stringValue(entry.version);
    if (!dependencyNamePattern.test(name) || blockedDependencyNames.has(name)) {
      issues.push(`dependencyMetadata.dependencies[${index}].name is not allowed.`);
    }
    if (!version || !dependencyVersionPattern.test(version) || /(?:^|:)https?:/i.test(version)) {
      issues.push(`dependencyMetadata.dependencies[${index}].version must be a pinned package version or safe range.`);
    }
    if (isRecord(entry.scripts) || entry.postinstall || entry.preinstall || entry.prepare) {
      issues.push(`dependencyMetadata.dependencies[${index}] cannot include lifecycle scripts.`);
    }
  });

  return issues;
};

export const normalizeInteractiveComponentDependencyMetadata = (
  input: InteractiveComponentValidationInput,
  existing?: ExistingInteractiveComponent,
): Record<string, unknown> => {
  const metadata = finalRecord(input, existing, 'dependencyMetadata');
  const dependencyPolicy = recordValue(input.dependencyPolicy);
  const compatibility = recordValue(input.compatibility);
  const dataBindingPresets = listValue(input.dataBindingPresets).filter(isRecord);

  return {
    ...metadata,
    ...(Object.keys(dependencyPolicy).length > 0 ? { dependencyPolicy } : {}),
    ...(Object.keys(compatibility).length > 0 ? { compatibility } : {}),
    ...(dataBindingPresets.length > 0 ? { dataBindingPresets } : {}),
  };
};

const dependencyPolicyPresets = new Set(['built-in', 'signed-sandbox', 'no-runtime-deps']);
const compatibilityRenderTargets = new Set(['trusted-component', 'sandbox-iframe', 'static-fallback']);
const compatibilityReducedMotion = new Set(['required', 'recommended']);
const dataBindingPresetScopes = new Set(['collections', 'media', 'forms', 'commerce', 'page', 'blog']);
const dataBindingPresetModes = new Set(['read', 'list', 'aggregate']);
const backyRuntimePattern = /^(?:>=|~|\^)?\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/;

const validateDependencyPolicy = (metadata: Record<string, unknown>): string[] => {
  const issues: string[] = [];
  const policy = recordValue(metadata.dependencyPolicy);
  if (Object.keys(policy).length === 0) {
    return issues;
  }

  const preset = stringValue(policy.preset);
  if (!dependencyPolicyPresets.has(preset)) {
    issues.push('dependencyMetadata.dependencyPolicy.preset must be built-in, signed-sandbox, or no-runtime-deps.');
  }

  const allowedPackagePatterns = stringListValue(policy.allowedPackagePatterns);
  if (allowedPackagePatterns.length > 50) {
    issues.push('dependencyMetadata.dependencyPolicy.allowedPackagePatterns cannot exceed 50 entries.');
  }
  allowedPackagePatterns.slice(0, 50).forEach((pattern, index) => {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._*-]*$/.test(pattern) || /https?:/i.test(pattern)) {
      issues.push(`dependencyMetadata.dependencyPolicy.allowedPackagePatterns[${index}] is not allowed.`);
    }
  });

  const blockedBuiltins = new Set(stringListValue(policy.blockedBuiltins));
  const missingBlockedBuiltin = [...blockedDependencyNames].find((name) => !blockedBuiltins.has(name));
  if (missingBlockedBuiltin) {
    issues.push(`dependencyMetadata.dependencyPolicy.blockedBuiltins must include "${missingBlockedBuiltin}".`);
  }
  if (policy.lifecycleScripts !== false) {
    issues.push('dependencyMetadata.dependencyPolicy.lifecycleScripts must be false.');
  }
  if (policy.remoteRuntimeUrls !== false) {
    issues.push('dependencyMetadata.dependencyPolicy.remoteRuntimeUrls must be false.');
  }

  return issues;
};

const validateCompatibility = (metadata: Record<string, unknown>, renderMode: string): string[] => {
  const issues: string[] = [];
  const compatibility = recordValue(metadata.compatibility);
  if (Object.keys(compatibility).length === 0) {
    return issues;
  }

  const backyRuntime = stringValue(compatibility.backyRuntime);
  if (!backyRuntime || !backyRuntimePattern.test(backyRuntime)) {
    issues.push('dependencyMetadata.compatibility.backyRuntime must be a pinned or bounded Backy runtime version such as >=1.0.0.');
  }

  const renderTargets = stringListValue(compatibility.renderTargets);
  if (renderTargets.length === 0 || renderTargets.some((target) => !compatibilityRenderTargets.has(target))) {
    issues.push('dependencyMetadata.compatibility.renderTargets must only include trusted-component, sandbox-iframe, or static-fallback.');
  }
  if (renderTargets.length > 0 && !renderTargets.includes(renderMode)) {
    issues.push('dependencyMetadata.compatibility.renderTargets must include the component renderMode.');
  }
  if (renderTargets.length > 0 && !renderTargets.includes('static-fallback')) {
    issues.push('dependencyMetadata.compatibility.renderTargets must include static-fallback.');
  }

  const animationLibraries = stringListValue(compatibility.animationLibraries);
  if (animationLibraries.length > 25) {
    issues.push('dependencyMetadata.compatibility.animationLibraries cannot exceed 25 entries.');
  }
  const browserSupport = stringListValue(compatibility.browserSupport);
  if (browserSupport.length > 25) {
    issues.push('dependencyMetadata.compatibility.browserSupport cannot exceed 25 entries.');
  }

  const reducedMotion = stringValue(compatibility.reducedMotion);
  if (reducedMotion && !compatibilityReducedMotion.has(reducedMotion)) {
    issues.push('dependencyMetadata.compatibility.reducedMotion must be required or recommended.');
  }

  return issues;
};

const validateDataBindingPresets = (metadata: Record<string, unknown>): string[] => {
  const issues: string[] = [];
  const presets = listValue(metadata.dataBindingPresets);
  if (presets.length > 50) {
    issues.push('dependencyMetadata.dataBindingPresets cannot exceed 50 entries.');
  }
  presets.slice(0, 50).forEach((preset, index) => {
    if (!isRecord(preset)) {
      issues.push(`dependencyMetadata.dataBindingPresets[${index}] must be an object.`);
      return;
    }
    if (!stringValue(preset.id) || !stringValue(preset.label) || !stringValue(preset.targetPath)) {
      issues.push(`dependencyMetadata.dataBindingPresets[${index}] requires id, label, and targetPath.`);
    }
    if (!dataBindingPresetScopes.has(stringValue(preset.scope))) {
      issues.push(`dependencyMetadata.dataBindingPresets[${index}].scope is not allowed.`);
    }
    if (!dataBindingPresetModes.has(stringValue(preset.mode))) {
      issues.push(`dependencyMetadata.dataBindingPresets[${index}].mode is not allowed.`);
    }
  });

  return issues;
};

export const validateInteractiveComponentPayload = (
  input: InteractiveComponentValidationInput,
  existing?: ExistingInteractiveComponent,
): { ok: boolean; issues: string[] } => {
  const issues: string[] = [];
  const type = finalString(input, existing, 'type', 'codeComponent');
  const source = finalString(input, existing, 'source', 'custom');
  const status = finalString(input, existing, 'status', 'disabled');
  const reviewStatus = finalString(input, existing, 'reviewStatus', 'draft');
  const renderMode = finalString(input, existing, 'renderMode', type === 'codeComponent' ? 'sandbox-iframe' : 'trusted-component');
  const siteId = finalString(input, existing, 'siteId', '');
  const componentKey = finalString(input, existing, 'componentKey', '');
  const version = finalString(input, existing, 'version', '');
  const runtime = finalRecord(input, existing, 'runtime');
  const integrity = finalRecord(input, existing, 'integrity');
  const dependencyMetadata = normalizeInteractiveComponentDependencyMetadata(input, existing);
  const isCustomExecution = type === 'codeComponent' || source === 'custom' || renderMode === 'sandbox-iframe';
  const isPublishing = status === 'active' || reviewStatus === 'approved';

  if (isCustomExecution) {
    if (runtime.sandboxUrl !== undefined && !safeRelativeSandboxUrl(runtime.sandboxUrl, { siteId, componentKey, version })) {
      issues.push('runtime.sandboxUrl must match the component site, key, and version on the Backy /api/sites/:siteId/interactive-components/:componentKey/:version/sandbox path.');
    }
    if (runtime.bundleUrl !== undefined && !safeRelativeOrHttpsUrl(runtime.bundleUrl)) {
      issues.push('runtime.bundleUrl must be a relative same-origin path or HTTPS URL.');
    }

    const iframeSandbox = stringValue(runtime.iframeSandbox);
    if (iframeSandbox) {
      const blockedFlags = ['allow-same-origin', 'allow-top-navigation', 'allow-popups-to-escape-sandbox'];
      const foundBlocked = blockedFlags.filter((flag) => iframeSandbox.split(/\s+/).includes(flag));
      if (foundBlocked.length > 0) {
        issues.push(`runtime.iframeSandbox cannot include ${foundBlocked.join(', ')}.`);
      }
    }

    const allowedPermissions = listValue(runtime.allowedPermissions).map(stringValue).filter(Boolean);
    const allowedPermissionSet = new Set(['fullscreen']);
    const disallowedPermission = allowedPermissions.find((permission) => !allowedPermissionSet.has(permission));
    if (disallowedPermission) {
      issues.push(`runtime.allowedPermissions contains unsupported permission "${disallowedPermission}".`);
    }
  }

  issues.push(...validateDependencies(dependencyMetadata));
  issues.push(...validateDependencyPolicy(dependencyMetadata));
  issues.push(...validateCompatibility(dependencyMetadata, renderMode));
  issues.push(...validateDataBindingPresets(dependencyMetadata));

  if (isPublishing && isCustomExecution) {
    if (renderMode === 'sandbox-iframe' && !safeRelativeSandboxUrl(runtime.sandboxUrl, { allowEmpty: false, siteId, componentKey, version })) {
      issues.push('Approved sandbox components require runtime.sandboxUrl to match the component site, key, and version on the Backy /api/sites/:siteId/interactive-components/:componentKey/:version/sandbox route.');
    }
    const signatureRequired = integrity.signatureRequiredForCustomCode !== false;
    if (signatureRequired && integrity.signed !== true) {
      issues.push('Approved custom code components require signed integrity metadata.');
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
};

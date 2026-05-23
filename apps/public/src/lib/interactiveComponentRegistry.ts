const interactiveEnvValue = (keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const truthyEnv = (value: string) => ['true', '1', 'yes'].includes(value.toLowerCase());

export const buildInteractiveComponentManifestContract = () => {
  const registryProvider = interactiveEnvValue(['BACKY_COMPONENT_REGISTRY_PROVIDER', 'BACKY_INTERACTIVE_COMPONENT_REGISTRY_PROVIDER']) || 'local';
  const registryUrl = interactiveEnvValue(['BACKY_COMPONENT_REGISTRY_URL', 'BACKY_INTERACTIVE_COMPONENT_REGISTRY_URL']);
  const bundleBaseUrl = interactiveEnvValue(['BACKY_COMPONENT_BUNDLE_BASE_URL', 'BACKY_INTERACTIVE_COMPONENT_BUNDLE_BASE_URL']);
  const sandboxOrigin = interactiveEnvValue(['BACKY_COMPONENT_SANDBOX_ORIGIN', 'BACKY_INTERACTIVE_SANDBOX_ORIGIN']);
  const iframeSandbox = interactiveEnvValue(['BACKY_COMPONENT_IFRAME_SANDBOX', 'BACKY_INTERACTIVE_IFRAME_SANDBOX'])
    || 'allow-scripts allow-forms';
  const allowedConnectSrc = interactiveEnvValue(['BACKY_COMPONENT_ALLOWED_CONNECT_SRC', 'BACKY_INTERACTIVE_ALLOWED_CONNECT_SRC'])
    || "'self'";
  const contentSecurityPolicy = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data: https: http:',
    'media-src data: blob:',
    `connect-src ${allowedConnectSrc}`,
    "font-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ];
  const permissionsPolicy = [
    'accelerometer=()',
    'ambient-light-sensor=()',
    'autoplay=()',
    'bluetooth=()',
    'browsing-topics=()',
    'camera=()',
    'clipboard-read=()',
    'clipboard-write=()',
    'display-capture=()',
    'encrypted-media=()',
    'fullscreen=(self)',
    'geolocation=()',
    'gyroscope=()',
    'hid=()',
    'magnetometer=()',
    'microphone=()',
    'midi=()',
    'payment=()',
    'picture-in-picture=()',
    'publickey-credentials-get=()',
    'screen-wake-lock=()',
    'serial=()',
    'usb=()',
    'xr-spatial-tracking=()',
  ];
  const customCodeEnabled = truthyEnv(interactiveEnvValue(['BACKY_CUSTOM_CODE_COMPONENTS_ENABLED', 'BACKY_INTERACTIVE_CUSTOM_CODE_ENABLED']));
  const signingKeyConfigured = Boolean(interactiveEnvValue(['BACKY_COMPONENT_REGISTRY_SIGNING_KEY', 'BACKY_INTERACTIVE_COMPONENT_SIGNING_KEY']));
  const cspConfigured = Boolean(interactiveEnvValue(['BACKY_COMPONENT_SANDBOX_CSP', 'BACKY_INTERACTIVE_SANDBOX_CSP']));

  return {
    schemaVersion: 'backy.interactive-components.v1',
    elementTypes: ['interactiveFigure', 'codeComponent'],
    capabilities: {
      trustedRegistry: registryProvider === 'local' || Boolean(registryUrl),
      customCodeSandbox: customCodeEnabled,
      signedBundles: signingKeyConfigured,
      staticFallbacks: true,
      versionedBundles: true,
      dataBindings: true,
    },
    registry: {
      provider: registryProvider,
      configured: registryProvider === 'local' || Boolean(registryUrl),
      endpoint: registryUrl || null,
      bundleBaseUrl: bundleBaseUrl || null,
      signedBundles: signingKeyConfigured,
      reviewRequired: process.env.BACKY_COMPONENT_REGISTRY_REVIEW_REQUIRED !== 'false'
        && process.env.BACKY_INTERACTIVE_REVIEW_REQUIRED !== 'false',
    },
    sandbox: {
      enabled: customCodeEnabled,
      origin: sandboxOrigin || null,
      cspConfigured,
      iframeSandbox,
      allowedConnectSrc,
      requiresDedicatedOrigin: customCodeEnabled,
      responseHeaders: {
        contentSecurityPolicy,
        permissionsPolicy,
        referrerPolicy: 'no-referrer',
        contentTypeOptions: 'nosniff',
      },
    },
    renderContract: {
      fields: ['componentKey', 'version', 'props', 'controls', 'dataBindings', 'fallback', 'accessibility', 'renderCapabilities'],
      hydrationModes: ['trusted-component', 'sandbox-iframe', 'static-fallback'],
      postMessageProtocol: 'backy.interactive-component.v1',
      fallbackRequired: true,
      unknownComponentBehavior: 'render-static-fallback',
    },
    dataBindingScopes: ['collections', 'media', 'forms', 'commerce', 'page', 'blog'],
    security: {
      parentDomAccess: false,
      parentCookieAccess: false,
      adminApiAccess: false,
      secretsInPayload: false,
      communication: 'postMessage-only',
    },
  };
};

export type BackyInteractiveComponentManifestContract = ReturnType<typeof buildInteractiveComponentManifestContract>;

export type BackyInteractiveComponentRegistryEntry = {
  componentKey: string;
  displayName: string;
  type: 'interactiveFigure' | 'codeComponent';
  status: 'active' | 'disabled';
  version: string;
  renderMode: 'trusted-component' | 'sandbox-iframe' | 'static-fallback';
  source: 'built-in' | 'registry' | 'custom';
  description: string;
  allowedDataScopes: string[];
  requiredFields: string[];
  controls: Array<Record<string, unknown>>;
  fallback: {
    required: boolean;
    supported: string[];
  };
  security: Record<string, boolean | string>;
  integrity: {
    signed: boolean;
    signatureRequiredForCustomCode: boolean;
  };
  runtime?: {
    sandboxUrl?: string | null;
    bundleUrl?: string | null;
    iframeSandbox?: string;
    allowedPermissions?: string[];
    postMessageProtocol: string;
  };
  dependencyPolicy?: {
    preset: 'built-in' | 'signed-sandbox' | 'no-runtime-deps';
    allowedPackagePatterns: string[];
    blockedBuiltins: string[];
    lifecycleScripts: false;
    remoteRuntimeUrls: false;
  };
  compatibility?: {
    backyRuntime: string;
    renderTargets: string[];
    animationLibraries: string[];
    browserSupport: string[];
    reducedMotion: 'required' | 'recommended';
  };
  dataBindingPresets?: Array<{
    id: string;
    label: string;
    scope: string;
    targetPath: string;
    mode: 'read' | 'list' | 'aggregate';
  }>;
};

const blockedRuntimeBuiltins = [
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
];

const builtInDependencyPolicy: BackyInteractiveComponentRegistryEntry['dependencyPolicy'] = {
  preset: 'built-in',
  allowedPackagePatterns: [],
  blockedBuiltins: blockedRuntimeBuiltins,
  lifecycleScripts: false,
  remoteRuntimeUrls: false,
};

const signedSandboxDependencyPolicy: BackyInteractiveComponentRegistryEntry['dependencyPolicy'] = {
  preset: 'signed-sandbox',
  allowedPackagePatterns: ['@backy/*', '@react-three/*', 'd3-*', 'gsap', 'matter-js', 'p5', 'three'],
  blockedBuiltins: blockedRuntimeBuiltins,
  lifecycleScripts: false,
  remoteRuntimeUrls: false,
};

const noRuntimeDependencyPolicy: BackyInteractiveComponentRegistryEntry['dependencyPolicy'] = {
  preset: 'no-runtime-deps',
  allowedPackagePatterns: [],
  blockedBuiltins: blockedRuntimeBuiltins,
  lifecycleScripts: false,
  remoteRuntimeUrls: false,
};

const trustedFigureCompatibility: BackyInteractiveComponentRegistryEntry['compatibility'] = {
  backyRuntime: '>=1.0.0',
  renderTargets: ['trusted-component', 'static-fallback'],
  animationLibraries: ['Backy renderer'],
  browserSupport: ['modern evergreen browsers'],
  reducedMotion: 'required',
};

const sandboxAnimationCompatibility: BackyInteractiveComponentRegistryEntry['compatibility'] = {
  backyRuntime: '>=1.0.0',
  renderTargets: ['sandbox-iframe', 'static-fallback'],
  animationLibraries: ['canvas', 'WebGL-style', 'd3', 'gsap', 'matter-js', 'p5', 'three'],
  browserSupport: ['modern evergreen browsers with iframe sandbox support'],
  reducedMotion: 'required',
};

export const buildPublicInteractiveComponentRegistry = (
  siteId: string,
  registryEntries: BackyInteractiveComponentRegistryEntry[] = [],
) => {
  const contract = buildInteractiveComponentManifestContract();
  const signatureRequiredForCustomCode = contract.registry.signedBundles || contract.sandbox.enabled;
  const sandboxedComponentKey = 'backy.custom.sandboxed';
  const sandboxedComponentVersion = '1.0.0';
  const sandboxUrl = `/api/sites/${encodeURIComponent(siteId)}/interactive-components/${encodeURIComponent(sandboxedComponentKey)}/${encodeURIComponent(sandboxedComponentVersion)}/sandbox`;
  const bundleUrl = contract.registry.bundleBaseUrl
    ? `${contract.registry.bundleBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(sandboxedComponentKey)}/${encodeURIComponent(sandboxedComponentVersion)}/index.js`
    : null;
  const canvasComponentKey = 'backy.canvas.sandboxed';
  const canvasComponentVersion = '1.0.0';
  const canvasSandboxUrl = `/api/sites/${encodeURIComponent(siteId)}/interactive-components/${encodeURIComponent(canvasComponentKey)}/${encodeURIComponent(canvasComponentVersion)}/sandbox`;
  const canvasBundleUrl = contract.registry.bundleBaseUrl
    ? `${contract.registry.bundleBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(canvasComponentKey)}/${encodeURIComponent(canvasComponentVersion)}/index.js`
    : null;
  const builtInComponents: BackyInteractiveComponentRegistryEntry[] = [
    {
      componentKey: 'backy.figure.rounds',
      displayName: 'Communication rounds figure',
      type: 'interactiveFigure',
      status: 'active',
      version: '1.0.0',
      renderMode: 'trusted-component',
      source: 'built-in',
      description: 'Animated communication-round and self-correction figure with static fallback support.',
      allowedDataScopes: ['collections', 'page', 'blog'],
      requiredFields: ['componentKey', 'version', 'props', 'fallback'],
      controls: [
        {
          key: 'rounds',
          label: 'Rounds',
          type: 'range',
          min: 1,
          max: 12,
          step: 1,
          defaultValue: 4,
        },
        {
          key: 'speed',
          label: 'Speed',
          type: 'select',
          options: ['slow', 'normal', 'fast'],
          defaultValue: 'normal',
        },
      ],
      fallback: {
        required: true,
        supported: ['title', 'text', 'html', 'imageUrl', 'alt', 'ariaLabel'],
      },
      security: {
        adminApiAccess: false,
        parentDomAccess: false,
        parentCookieAccess: false,
        secretsInPayload: false,
        communication: 'postMessage-only',
      },
      integrity: {
        signed: false,
        signatureRequiredForCustomCode,
      },
      runtime: {
        sandboxUrl: null,
        bundleUrl: null,
        iframeSandbox: undefined,
        allowedPermissions: [],
        postMessageProtocol: 'backy.interactive-component.v1',
      },
      dependencyPolicy: builtInDependencyPolicy,
      compatibility: trustedFigureCompatibility,
      dataBindingPresets: [
        { id: 'rounds-from-page', label: 'Page narrative rounds', scope: 'page', targetPath: 'props.rounds', mode: 'read' },
        { id: 'rounds-from-collection', label: 'Collection round sequence', scope: 'collections', targetPath: 'props.rounds', mode: 'list' },
      ],
    },
    {
      componentKey: 'backy.figure.stepper',
      displayName: 'Step-through diagram',
      type: 'interactiveFigure',
      status: 'active',
      version: '1.0.0',
      renderMode: 'trusted-component',
      source: 'built-in',
      description: 'Step-controlled explanatory figure for blog diagrams, simulations, and process walkthroughs.',
      allowedDataScopes: ['collections', 'page', 'blog'],
      requiredFields: ['componentKey', 'version', 'props', 'controls', 'fallback'],
      controls: [
        {
          key: 'steps',
          label: 'Steps',
          type: 'range',
          min: 2,
          max: 10,
          step: 1,
          defaultValue: 4,
        },
        {
          key: 'mode',
          label: 'Mode',
          type: 'select',
          options: ['click', 'scroll', 'auto'],
          defaultValue: 'click',
        },
      ],
      fallback: {
        required: true,
        supported: ['title', 'text', 'html', 'imageUrl', 'alt', 'ariaLabel'],
      },
      security: {
        adminApiAccess: false,
        parentDomAccess: false,
        parentCookieAccess: false,
        secretsInPayload: false,
        communication: 'postMessage-only',
      },
      integrity: {
        signed: false,
        signatureRequiredForCustomCode,
      },
      runtime: {
        sandboxUrl: null,
        bundleUrl: null,
        iframeSandbox: undefined,
        allowedPermissions: [],
        postMessageProtocol: 'backy.interactive-component.v1',
      },
      dependencyPolicy: builtInDependencyPolicy,
      compatibility: trustedFigureCompatibility,
      dataBindingPresets: [
        { id: 'stepper-from-blog', label: 'Blog section steps', scope: 'blog', targetPath: 'props.steps', mode: 'list' },
        { id: 'stepper-from-collection', label: 'Collection walkthrough', scope: 'collections', targetPath: 'props.steps', mode: 'list' },
      ],
    },
    {
      componentKey: 'backy.chart.line',
      displayName: 'Line chart',
      type: 'interactiveFigure',
      status: 'active',
      version: '1.0.0',
      renderMode: 'trusted-component',
      source: 'built-in',
      description: 'Data-bound responsive line chart for collection, page, or blog datasets.',
      allowedDataScopes: ['collections', 'page', 'blog'],
      requiredFields: ['componentKey', 'version', 'props', 'dataBindings', 'fallback'],
      controls: [
        {
          key: 'series',
          label: 'Series',
          type: 'select',
          options: [],
          required: true,
        },
      ],
      fallback: {
        required: true,
        supported: ['title', 'text', 'html', 'imageUrl', 'alt', 'ariaLabel'],
      },
      security: {
        adminApiAccess: false,
        parentDomAccess: false,
        parentCookieAccess: false,
        secretsInPayload: false,
        communication: 'postMessage-only',
      },
      integrity: {
        signed: false,
        signatureRequiredForCustomCode,
      },
      runtime: {
        sandboxUrl: null,
        bundleUrl: null,
        iframeSandbox: undefined,
        allowedPermissions: [],
        postMessageProtocol: 'backy.interactive-component.v1',
      },
      dependencyPolicy: builtInDependencyPolicy,
      compatibility: {
        ...trustedFigureCompatibility,
        animationLibraries: ['Backy renderer', 'chart primitives'],
      },
      dataBindingPresets: [
        { id: 'chart-series', label: 'Collection series', scope: 'collections', targetPath: 'props.series', mode: 'list' },
        { id: 'chart-summary', label: 'Metric summary', scope: 'collections', targetPath: 'fallback.text', mode: 'aggregate' },
      ],
    },
    {
      componentKey: 'backy.figure.timeline',
      displayName: 'Timeline figure',
      type: 'interactiveFigure',
      status: 'active',
      version: '1.0.0',
      renderMode: 'trusted-component',
      source: 'built-in',
      description: 'Interactive milestone timeline for articles, roadmaps, releases, and research phases.',
      allowedDataScopes: ['collections', 'page', 'blog'],
      requiredFields: ['componentKey', 'version', 'props', 'controls', 'fallback'],
      controls: [
        {
          key: 'density',
          label: 'Density',
          type: 'select',
          options: ['compact', 'comfortable', 'detailed'],
          defaultValue: 'comfortable',
        },
        {
          key: 'focusIndex',
          label: 'Focus milestone',
          type: 'range',
          min: 0,
          max: 8,
          step: 1,
          defaultValue: 0,
        },
      ],
      fallback: {
        required: true,
        supported: ['title', 'text', 'html', 'imageUrl', 'alt', 'ariaLabel'],
      },
      security: {
        adminApiAccess: false,
        parentDomAccess: false,
        parentCookieAccess: false,
        secretsInPayload: false,
        communication: 'postMessage-only',
      },
      integrity: {
        signed: false,
        signatureRequiredForCustomCode,
      },
      runtime: {
        sandboxUrl: null,
        bundleUrl: null,
        iframeSandbox: undefined,
        allowedPermissions: [],
        postMessageProtocol: 'backy.interactive-component.v1',
      },
      dependencyPolicy: builtInDependencyPolicy,
      compatibility: trustedFigureCompatibility,
      dataBindingPresets: [
        { id: 'timeline-milestones', label: 'Milestone records', scope: 'collections', targetPath: 'props.milestones', mode: 'list' },
        { id: 'timeline-blog', label: 'Blog timeline', scope: 'blog', targetPath: 'props.milestones', mode: 'list' },
      ],
    },
    {
      componentKey: 'backy.simulation.parameter',
      displayName: 'Parameter simulation',
      type: 'interactiveFigure',
      status: 'active',
      version: '1.0.0',
      renderMode: 'trusted-component',
      source: 'built-in',
      description: 'Parameter-driven simulation block for explainers, calculators, and what-if figures.',
      allowedDataScopes: ['collections', 'page', 'blog', 'commerce'],
      requiredFields: ['componentKey', 'version', 'props', 'controls', 'fallback'],
      controls: [
        {
          key: 'parameterA',
          label: 'Parameter A',
          type: 'range',
          min: 0,
          max: 100,
          step: 1,
          defaultValue: 50,
        },
        {
          key: 'scenario',
          label: 'Scenario',
          type: 'select',
          options: ['baseline', 'optimistic', 'stress'],
          defaultValue: 'baseline',
        },
      ],
      fallback: {
        required: true,
        supported: ['title', 'text', 'html', 'imageUrl', 'alt', 'ariaLabel'],
      },
      security: {
        adminApiAccess: false,
        parentDomAccess: false,
        parentCookieAccess: false,
        secretsInPayload: false,
        communication: 'postMessage-only',
      },
      integrity: {
        signed: false,
        signatureRequiredForCustomCode,
      },
      runtime: {
        sandboxUrl: null,
        bundleUrl: null,
        iframeSandbox: undefined,
        allowedPermissions: [],
        postMessageProtocol: 'backy.interactive-component.v1',
      },
      dependencyPolicy: builtInDependencyPolicy,
      compatibility: trustedFigureCompatibility,
      dataBindingPresets: [
        { id: 'simulation-inputs', label: 'Scenario inputs', scope: 'collections', targetPath: 'props.parameters', mode: 'read' },
        { id: 'simulation-commerce', label: 'Commerce metrics', scope: 'commerce', targetPath: 'props.metrics', mode: 'aggregate' },
      ],
    },
    {
      componentKey: 'backy.data.explorer',
      displayName: 'Data explorer',
      type: 'interactiveFigure',
      status: 'active',
      version: '1.0.0',
      renderMode: 'trusted-component',
      source: 'built-in',
      description: 'Filterable data-exploration block for collection-backed tables, cards, and charts.',
      allowedDataScopes: ['collections', 'media', 'forms', 'commerce', 'page', 'blog'],
      requiredFields: ['componentKey', 'version', 'props', 'controls', 'dataBindings', 'fallback'],
      controls: [
        {
          key: 'view',
          label: 'View',
          type: 'select',
          options: ['table', 'cards', 'chart'],
          defaultValue: 'table',
        },
        {
          key: 'showFilters',
          label: 'Show filters',
          type: 'toggle',
          defaultValue: true,
        },
      ],
      fallback: {
        required: true,
        supported: ['title', 'text', 'html', 'imageUrl', 'alt', 'ariaLabel'],
      },
      security: {
        adminApiAccess: false,
        parentDomAccess: false,
        parentCookieAccess: false,
        secretsInPayload: false,
        communication: 'postMessage-only',
      },
      integrity: {
        signed: false,
        signatureRequiredForCustomCode,
      },
      runtime: {
        sandboxUrl: null,
        bundleUrl: null,
        iframeSandbox: undefined,
        allowedPermissions: [],
        postMessageProtocol: 'backy.interactive-component.v1',
      },
      dependencyPolicy: builtInDependencyPolicy,
      compatibility: trustedFigureCompatibility,
      dataBindingPresets: [
        { id: 'explorer-records', label: 'Collection records', scope: 'collections', targetPath: 'props.records', mode: 'list' },
        { id: 'explorer-commerce', label: 'Commerce catalog', scope: 'commerce', targetPath: 'props.records', mode: 'list' },
      ],
    },
    {
      componentKey: canvasComponentKey,
      displayName: 'Sandboxed canvas animation',
      type: 'codeComponent',
      status: contract.sandbox.enabled ? 'active' : 'disabled',
      version: canvasComponentVersion,
      renderMode: 'sandbox-iframe',
      source: 'custom',
      description: 'Canvas/WebGL-style animation bundle mounted in a constrained iframe with explicit controls and fallback.',
      allowedDataScopes: contract.dataBindingScopes,
      requiredFields: ['componentKey', 'version', 'fallback', 'renderCapabilities', 'runtime.sandboxUrl'],
      controls: [
        {
          key: 'playback',
          label: 'Playback',
          type: 'select',
          options: ['manual', 'auto', 'scroll'],
          defaultValue: 'manual',
        },
        {
          key: 'intensity',
          label: 'Intensity',
          type: 'range',
          min: 0,
          max: 100,
          step: 5,
          defaultValue: 50,
        },
        {
          key: 'accentColor',
          label: 'Accent color',
          type: 'color',
          defaultValue: '#38bdf8',
        },
        {
          key: 'caption',
          label: 'Fallback caption',
          type: 'textarea',
          defaultValue: 'Animated canvas module with a static accessible fallback.',
        },
        {
          key: 'runtimeConfig',
          label: 'Runtime config',
          type: 'json',
          defaultValue: {
            reducedMotionFallback: true,
            frameBudget: 60,
          },
        },
      ],
      fallback: {
        required: true,
        supported: ['title', 'text', 'html', 'imageUrl', 'alt', 'ariaLabel'],
      },
      security: {
        adminApiAccess: false,
        parentDomAccess: false,
        parentCookieAccess: false,
        secretsInPayload: false,
        communication: 'postMessage-only',
      },
      integrity: {
        signed: contract.registry.signedBundles,
        signatureRequiredForCustomCode,
      },
      runtime: {
        sandboxUrl: canvasSandboxUrl,
        bundleUrl: canvasBundleUrl,
        iframeSandbox: contract.sandbox.iframeSandbox,
        allowedPermissions: [],
        postMessageProtocol: 'backy.interactive-component.v1',
      },
      dependencyPolicy: signedSandboxDependencyPolicy,
      compatibility: sandboxAnimationCompatibility,
      dataBindingPresets: [
        { id: 'canvas-frame-data', label: 'Frame data', scope: 'collections', targetPath: 'props.frames', mode: 'list' },
        { id: 'canvas-page-state', label: 'Page state', scope: 'page', targetPath: 'props.state', mode: 'read' },
      ],
    },
    {
      componentKey: sandboxedComponentKey,
      displayName: 'Sandboxed custom component',
      type: 'codeComponent',
      status: contract.sandbox.enabled ? 'active' : 'disabled',
      version: sandboxedComponentVersion,
      renderMode: 'sandbox-iframe',
      source: 'custom',
      description: 'Versioned custom component bundle mounted in a constrained iframe with explicit data bindings.',
      allowedDataScopes: contract.dataBindingScopes,
      requiredFields: ['componentKey', 'version', 'fallback', 'renderCapabilities', 'runtime.sandboxUrl'],
      controls: [],
      fallback: {
        required: true,
        supported: ['title', 'text', 'html', 'imageUrl', 'alt', 'ariaLabel'],
      },
      security: {
        adminApiAccess: false,
        parentDomAccess: false,
        parentCookieAccess: false,
        secretsInPayload: false,
        communication: 'postMessage-only',
      },
      integrity: {
        signed: contract.registry.signedBundles,
        signatureRequiredForCustomCode,
      },
      runtime: {
        sandboxUrl,
        bundleUrl,
        iframeSandbox: contract.sandbox.iframeSandbox,
        allowedPermissions: [],
        postMessageProtocol: 'backy.interactive-component.v1',
      },
      dependencyPolicy: noRuntimeDependencyPolicy,
      compatibility: sandboxAnimationCompatibility,
      dataBindingPresets: [
        { id: 'custom-records', label: 'Collection payload', scope: 'collections', targetPath: 'props.data', mode: 'list' },
        { id: 'custom-page-context', label: 'Page context', scope: 'page', targetPath: 'props.context', mode: 'read' },
      ],
    },
  ];
  const registryComponentKeys = new Set(
    registryEntries.map((entry) => `${entry.componentKey}@${entry.version}`),
  );
  const components = [
    ...builtInComponents.filter((entry) => !registryComponentKeys.has(`${entry.componentKey}@${entry.version}`)),
    ...registryEntries,
  ];

  return {
    schemaVersion: 'backy.interactive-component-registry.v1',
    siteId,
    generatedAt: new Date().toISOString(),
    contract,
    components,
    pagination: {
      total: components.length,
      limit: components.length,
      offset: 0,
      hasMore: false,
    },
  };
};

/**
 * Site-scoped sandbox bootstrap for public interactive code components.
 *
 * Reviewed uploaded modules execute only after signature and stored-byte
 * verification, inside an opaque iframe with the public message contract.
 */

import { getSiteByIdOrSlug, listInteractiveComponents } from '@/lib/backyStore';
import { buildPublicInteractiveComponentRegistry, type BackyInteractiveComponentRegistryEntry } from '@/lib/interactiveComponentRegistry';
import { publicContractResponse } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { InteractiveComponentBundleError, loadVerifiedInteractiveComponentBundle } from '@/lib/interactiveComponentBundle';
import type { BackyInteractiveComponentIntegrity } from '@backy-cms/core';
import { normalizePublicOrigin } from '@/lib/publicOriginPolicy';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    componentKey: string;
    version: string;
  }>;
}

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const SANDBOX_SCHEMA_VERSION = 'backy.interactive-component-sandbox.v1';
const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const sandboxPermissionsPolicy = [
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
].join(', ');

const sandboxHeaders = (contentSecurityPolicy: string) => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
  'Content-Security-Policy': contentSecurityPolicy,
  'Permissions-Policy': sandboxPermissionsPolicy,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

const sandboxErrorHeaders = (contentSecurityPolicy: string) => ({
  ...sandboxHeaders(contentSecurityPolicy),
  'Cache-Control': 'no-store',
});

const sandboxError = ({
  status,
  title,
  detail,
  request,
  requestId,
  siteId,
}: {
  status: number;
  title: string;
  detail: string;
  request: Request;
  requestId: string;
  siteId?: string;
}) => publicContractResponse(
  `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></body></html>`,
  {
    status,
    requestId,
    request,
    cache: 'error',
    siteId,
    schemaVersion: SANDBOX_SCHEMA_VERSION,
  },
  {
    headers: sandboxErrorHeaders([
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      "img-src data:",
      "font-src 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "worker-src 'none'",
      "manifest-src 'none'",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ')),
  },
);

type PublicRegistryComponent = {
  componentKey: string;
  displayName: string;
  type: BackyInteractiveComponentRegistryEntry['type'];
  status: 'active' | 'disabled' | 'archived' | string;
  reviewStatus?: string;
  version: string;
  renderMode: BackyInteractiveComponentRegistryEntry['renderMode'];
  source: BackyInteractiveComponentRegistryEntry['source'];
  description?: string;
  allowedDataScopes?: string[];
  requiredFields?: string[];
  controls?: Array<Record<string, unknown>>;
  fallback?: BackyInteractiveComponentRegistryEntry['fallback'];
  integrity?: BackyInteractiveComponentIntegrity;
  runtime?: BackyInteractiveComponentRegistryEntry['runtime'];
};

const toPublicRegistryEntry = (component: PublicRegistryComponent): BackyInteractiveComponentRegistryEntry => ({
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
  fallback: component.fallback || { required: true, supported: [] },
  security: {
    adminApiAccess: false,
    parentDomAccess: false,
    parentCookieAccess: false,
    secretsInPayload: false,
    communication: 'postMessage-only',
  },
  integrity: component.integrity || { signed: false, signatureRequiredForCustomCode: true },
  runtime: component.runtime,
});

const resolvePublishedSiteId = async (siteId: string): Promise<string | null> => {
  if (!shouldUseDemoStoreFallback()) {
    const repositories = await getRequiredDatabaseRepositories();
    const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
    return site?.isPublished ? site.id : null;
  }

  const site = getSiteByIdOrSlug(siteId);
  return site?.isPublished ? site.id : null;
};

const buildSandboxHtml = ({
  componentKey,
  displayName,
  version,
  protocol,
  bundleBase64,
}: {
  componentKey: string;
  displayName: string;
  version: string;
  protocol: string;
  bundleBase64?: string;
}) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(displayName)}</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; background: #111827; color: #f9fafb; }
    main { min-height: 100vh; display: grid; align-content: center; gap: 12px; padding: 18px; box-sizing: border-box; }
    strong { font-size: 18px; line-height: 1.25; }
    p { margin: 0; color: #d1d5db; font-size: 14px; line-height: 1.5; }
    code { color: #93c5fd; word-break: break-word; }
    pre { max-height: 160px; overflow: auto; margin: 0; padding: 10px; border: 1px solid #374151; border-radius: 8px; color: #d1d5db; background: #030712; font-size: 12px; }
  </style>
</head>
<body>
  <main aria-live="polite">
    <div id="fallback">
      <strong id="title">${escapeHtml(displayName)}</strong>
      <p id="description">Waiting for Backy component payload.</p>
      <pre id="payload" hidden></pre>
    </div>
    <div id="component-root" hidden></div>
  </main>
  <script>
    (function () {
      var protocol = ${scriptJson(protocol)};
      var componentKey = ${scriptJson(componentKey)};
      var version = ${scriptJson(version)};
      var title = document.getElementById('title');
      var description = document.getElementById('description');
      var payloadNode = document.getElementById('payload');
      var bundleBase64 = ${JSON.stringify(bundleBase64 || '')};
      var root = document.getElementById('component-root');
      var fallbackNode = document.getElementById('fallback');
      var mounted = false;
      var cleanup;
      var updates = Promise.resolve();
      var modulePromise = bundleBase64 ? (async function () {
        var bytes = Uint8Array.from(atob(bundleBase64), function (character) { return character.charCodeAt(0); });
        var url = URL.createObjectURL(new Blob([bytes], { type: 'application/javascript' }));
        try {
          var module = await import(url);
          if (typeof module.mount !== 'function') throw new Error('Component bundle must export mount(context).');
          return module;
        } finally { URL.revokeObjectURL(url); }
      }()) : Promise.resolve(null);
      modulePromise.catch(reportError);

      function resize() {
        parent.postMessage({
          type: 'backy.interactive-component.resize',
          protocol: protocol,
          componentKey: componentKey,
          version: version,
          height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
        }, '*');
      }

      function reportError(error) {
        parent.postMessage({
          type: 'backy.interactive-component.error',
          protocol: protocol,
          componentKey: componentKey,
          version: version,
          message: error && error.message ? error.message : String(error || 'Unknown sandbox error')
        }, '*');
      }

      window.addEventListener('message', function (event) {
        try {
          var data = event.data || {};
          if (event.source !== parent || data.type !== 'backy.interactive-component.init' || data.protocol !== protocol
            || data.componentKey !== componentKey || data.version !== version) {
            return;
          }

          var fallback = data.fallback || {};
          title.textContent = fallback.title || data.componentKey || componentKey;
          description.textContent = fallback.text || 'Sandboxed Backy component loaded.';
          payloadNode.textContent = JSON.stringify({
            componentKey: data.componentKey,
            version: data.version,
            props: data.props || {},
            controls: data.controls || []
          }, null, 2);
          payloadNode.hidden = Boolean(bundleBase64);
          if (bundleBase64) {
            updates = updates.then(async function () {
              var module = await modulePromise;
              var context = { root: root, props: data.props || {}, controls: data.controls || [], dataBindings: data.dataBindings || {}, componentKey: componentKey, version: version, resize: resize };
              root.hidden = false;
              if (mounted && typeof module.update === 'function') {
                await module.update(context);
              } else {
                if (typeof cleanup === 'function') await cleanup();
                root.replaceChildren();
                cleanup = await module.mount(context);
                mounted = true;
              }
              fallbackNode.hidden = true;
              resize();
            }).catch(function (error) {
              root.hidden = true;
              fallbackNode.hidden = false;
              reportError(error);
            });
          }
          resize();
        } catch (error) {
          reportError(error);
        }
      });

      window.addEventListener('error', function (event) {
        reportError(event.error || event.message);
      });

      window.addEventListener('unhandledrejection', function (event) {
        reportError(event.reason);
      });

      modulePromise.then(function () {
        parent.postMessage({
          type: 'backy.interactive-component.ready',
          protocol: protocol,
          componentKey: componentKey,
          version: version
        }, '*');
      }).catch(function () {});
      resize();
    }());
  </script>
</body>
</html>`;

export async function GET(request: Request, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const { siteId, componentKey, version } = await params;
  const resolvedSiteId = await resolvePublishedSiteId(siteId);

  if (!resolvedSiteId) {
    return sandboxError({
      status: 404,
      title: 'Site not found',
      detail: 'The requested site is not published or does not exist.',
      request,
      requestId,
    });
  }

  const storedEntries = shouldUseDemoStoreFallback()
    ? listInteractiveComponents(resolvedSiteId, { publicOnly: true })
    : (await (await getRequiredDatabaseRepositories()).interactiveComponents.list({
        siteId: resolvedSiteId,
        publicOnly: true,
        limit: 100,
        offset: 0,
      })).items;
  const registryEntries = storedEntries.map(toPublicRegistryEntry);
  const registry = buildPublicInteractiveComponentRegistry(resolvedSiteId, registryEntries);
  const component = registry.components.find((entry) => (
    entry.componentKey === decodeURIComponent(componentKey)
    && entry.version === decodeURIComponent(version)
  ));

  if (!component || component.type !== 'codeComponent' || component.renderMode !== 'sandbox-iframe') {
    return sandboxError({
      status: 404,
      title: 'Component not found',
      detail: 'The requested sandbox component is not registered for this site.',
      request,
      requestId,
      siteId: resolvedSiteId,
    });
  }

  if (component.status !== 'active') {
    return sandboxError({
      status: 403,
      title: 'Component disabled',
      detail: 'Custom code components are disabled for this site runtime.',
      request,
      requestId,
      siteId: resolvedSiteId,
    });
  }

  const storedComponent = storedEntries.find((entry) => entry.componentKey === component.componentKey && entry.version === component.version);
  let bundleBase64: string | undefined;
  if (storedComponent) {
    if (!registry.contract.sandbox.enabled) {
      return sandboxError({ status: 403, title: 'Component disabled', detail: 'Custom code execution is disabled.', request, requestId, siteId: resolvedSiteId });
    }
    if (process.env.NODE_ENV === 'production' && normalizePublicOrigin(registry.contract.sandbox.origin) !== new URL(request.url).origin) {
      return sandboxError({ status: 503, title: 'Component unavailable', detail: 'A matching dedicated sandbox origin must be configured for production execution.', request, requestId, siteId: resolvedSiteId });
    }
    try {
      bundleBase64 = await loadVerifiedInteractiveComponentBundle({ ...storedComponent, siteId: resolvedSiteId });
    } catch (error) {
      return sandboxError({ status: error instanceof InteractiveComponentBundleError ? error.status : 503, title: 'Component unavailable', detail: error instanceof InteractiveComponentBundleError ? error.message : 'Component bundle verification failed.', request, requestId, siteId: resolvedSiteId });
    }
  }

  const csp = [
    'sandbox allow-scripts allow-forms',
    "default-src 'none'",
    bundleBase64 ? "script-src 'unsafe-inline' blob:" : "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: https: http:",
    "media-src data: blob:",
    `connect-src ${registry.contract.sandbox.allowedConnectSrc || "'self'"}`,
    "font-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    registry.contract.sandbox.responseHeaders.contentSecurityPolicy.find((directive) => directive.startsWith('frame-ancestors ')) || "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  const html = buildSandboxHtml({
    componentKey: component.componentKey,
    displayName: component.displayName,
    version: component.version,
    protocol: component.runtime?.postMessageProtocol || registry.contract.renderContract.postMessageProtocol,
    bundleBase64,
  });

  return publicContractResponse(
    html,
    {
      requestId,
      request,
      cache: bundleBase64 ? 'private' : 'discovery',
      siteId: resolvedSiteId,
      schemaVersion: SANDBOX_SCHEMA_VERSION,
      etagSeed: {
        siteId: resolvedSiteId,
        componentKey: component.componentKey,
        version: component.version,
        status: component.status,
        displayName: component.displayName,
        protocol: component.runtime?.postMessageProtocol || registry.contract.renderContract.postMessageProtocol,
        html,
      },
    },
    {
      status: 200,
      headers: sandboxHeaders(csp),
    },
  );
}

/**
 * Site-scoped sandbox bootstrap for public interactive code components.
 *
 * This route intentionally serves a constrained HTML shell. Fully custom
 * uploaded bundles still need the governed registry/review/signing pipeline;
 * this shell gives the renderer a safe postMessage target and static fallback.
 */

import { getSiteByIdOrSlug, listInteractiveComponents } from '@/lib/backyStore';
import { buildPublicInteractiveComponentRegistry, type BackyInteractiveComponentRegistryEntry } from '@/lib/interactiveComponentRegistry';
import { publicContractResponse } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

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
  version: string;
  renderMode: BackyInteractiveComponentRegistryEntry['renderMode'];
  source: BackyInteractiveComponentRegistryEntry['source'];
  description?: string;
  allowedDataScopes?: string[];
  requiredFields?: string[];
  controls?: Array<Record<string, unknown>>;
  fallback?: BackyInteractiveComponentRegistryEntry['fallback'];
  integrity?: BackyInteractiveComponentRegistryEntry['integrity'];
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
}: {
  componentKey: string;
  displayName: string;
  version: string;
  protocol: string;
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
    <strong id="title">${escapeHtml(displayName)}</strong>
    <p id="description">Waiting for Backy component payload.</p>
    <p><code>${escapeHtml(componentKey)}@${escapeHtml(version)}</code></p>
    <pre id="payload" hidden></pre>
  </main>
  <script>
    (function () {
      var protocol = ${JSON.stringify(protocol)};
      var componentKey = ${JSON.stringify(componentKey)};
      var version = ${JSON.stringify(version)};
      var title = document.getElementById('title');
      var description = document.getElementById('description');
      var payloadNode = document.getElementById('payload');

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
          if (data.type !== 'backy.interactive-component.init' || data.protocol !== protocol) {
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
          payloadNode.hidden = false;
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

      parent.postMessage({
        type: 'backy.interactive-component.ready',
        protocol: protocol,
        componentKey: componentKey,
        version: version
      }, '*');
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

  const registryEntries = shouldUseDemoStoreFallback()
    ? listInteractiveComponents(resolvedSiteId, { publicOnly: true }).map(toPublicRegistryEntry)
    : (await (await getRequiredDatabaseRepositories()).interactiveComponents.list({
        siteId: resolvedSiteId,
        publicOnly: true,
        limit: 100,
        offset: 0,
      })).items.map(toPublicRegistryEntry);
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

  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: https: http:",
    "media-src data: blob:",
    `connect-src ${registry.contract.sandbox.allowedConnectSrc || "'self'"}`,
    "font-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  const html = buildSandboxHtml({
    componentKey: component.componentKey,
    displayName: component.displayName,
    version: component.version,
    protocol: component.runtime?.postMessageProtocol || registry.contract.renderContract.postMessageProtocol,
  });

  return publicContractResponse(
    html,
    {
      requestId,
      request,
      cache: 'discovery',
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

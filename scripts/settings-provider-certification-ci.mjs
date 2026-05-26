#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const publicRoot = new URL('apps/public/', root);
const rootPath = fileURLToPath(root);
const publicRootPath = fileURLToPath(publicRoot);
const NEXT_BIN = path.join(rootPath, 'node_modules/next/dist/bin/next');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const requireCertification = process.env.BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED === '1';
const externalBaseUrl = (process.env.BACKY_SETTINGS_CERTIFICATION_BASE_URL || '').replace(/\/$/, '');
const generatedAdminKey = `settings-provider-cert-${Date.now()}`;
const providedAdminKey = process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY || '';
const adminKey = providedAdminKey || generatedAdminKey;
const certifyStorage = process.env.BACKY_SETTINGS_CERTIFY_STORAGE === '1';
const certifyRotation = process.env.BACKY_SETTINGS_CERTIFY_ROTATION === '1';
const certifyVercelSecrets = process.env.BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS === '1';
const certifyNotification = process.env.BACKY_SETTINGS_CERTIFY_NOTIFICATION === '1';
const certifyPublicApiCors = process.env.BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS === '1';
const certifyCommerce = process.env.BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED === '1';
const requestedStorageProvider = (process.env.BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER || 'auto').trim().toLowerCase();
const requestedNotificationProvider = (process.env.BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER || 'auto').trim().toLowerCase();
const requestedPublicApiOrigin = (
  process.env.BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN ||
  process.env.BACKY_CERTIFY_PUBLIC_API_ORIGIN ||
  ''
).trim();
const requestedVercelProjectId = (process.env.BACKY_SETTINGS_CERTIFY_VERCEL_PROJECT_ID || '').trim();
const requestedVercelTeamId = (process.env.BACKY_SETTINGS_CERTIFY_VERCEL_TEAM_ID || '').trim();
const settingsCertificationSiteId = (
  process.env.BACKY_SETTINGS_CERTIFY_SITE_ID ||
  process.env.BACKY_SETTINGS_CERTIFICATION_SITE_ID ||
  'site-demo'
).trim() || 'site-demo';
const certificationOutputPath = (process.env.BACKY_SETTINGS_CERTIFICATION_OUTPUT || '').trim();
const certifiedAt = new Date().toISOString();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const isHttpUrl = (url) => /^https?:\/\//i.test(url);
const RAW_SECRET_VALUE_PATTERN = /(sk_live|sk_test|whsec_|AKIA|-----BEGIN|xox[baprs]-)/i;
const URL_WITH_CREDENTIALS_PATTERN = /\b(?:https?|postgres(?:ql)?):\/\/[^/\s:@]+:[^@\s/]+@/i;
const FORBIDDEN_CERTIFICATION_ARTIFACT_FIELD_NAMES = new Set([
  'adminkey',
  'adminapikey',
  'authorization',
  'cookie',
  'setcookie',
  'databaseurl',
  'databaseuri',
  'externalbaseurl',
  'externalurl',
  'targeturl',
  'webhookbody',
  'webhookpayload',
  'rawwebhookbody',
  'rawwebhookpayload',
  'providercredential',
  'providercredentials',
  'credential',
  'credentials',
  'paymentreference',
  'paymentreferences',
  'providerpaymentreference',
  'customerpayload',
  'rawcustomerpayload',
  'orderpayload',
  'raworderpayload',
  'raworder',
  'raworders',
  'privatekey',
  'servicerolekey',
]);

if (requireCertification && !adminKey) {
  throw new Error('BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1 requires BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY.');
}

if (requireCertification && externalBaseUrl && !isHttpUrl(externalBaseUrl)) {
  throw new Error('BACKY_SETTINGS_CERTIFICATION_BASE_URL must be an http:// or https:// URL when Settings provider certification targets an external deployment.');
}

if (requireCertification && externalBaseUrl && !providedAdminKey) {
  throw new Error('BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1 with BACKY_SETTINGS_CERTIFICATION_BASE_URL requires BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY.');
}

if (requireCertification && ![
  certifyStorage,
  certifyRotation,
  certifyVercelSecrets,
  certifyNotification,
  certifyPublicApiCors,
].some(Boolean)) {
  throw new Error('BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1 requires at least one Settings certification group: BACKY_SETTINGS_CERTIFY_STORAGE, BACKY_SETTINGS_CERTIFY_ROTATION, BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS, BACKY_SETTINGS_CERTIFY_NOTIFICATION, or BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS.');
}

if (requireCertification && !externalBaseUrl) {
  const missing = [];
  if (
    (certifyStorage || certifyRotation) &&
    !(process.env.BACKY_STORAGE_PROVIDER || process.env.BACKY_MEDIA_STORAGE_PROVIDER) &&
    requestedStorageProvider !== 'local'
  ) missing.push('BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER');
  if (certifyVercelSecrets && !(process.env.VERCEL_TOKEN || process.env.BACKY_VERCEL_TOKEN)) missing.push('VERCEL_TOKEN or BACKY_VERCEL_TOKEN');
  if (certifyVercelSecrets && !(process.env.VERCEL_PROJECT_ID || process.env.BACKY_VERCEL_PROJECT_ID)) missing.push('VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID');
  if (certifyRotation && !Object.keys(process.env).some((key) => key.includes('_NEXT_'))) missing.push('BACKY_*_NEXT_* replacement storage env');
  if (certifyPublicApiCors && !(process.env.BACKY_CORS_ALLOWED_ORIGINS || requestedPublicApiOrigin)) missing.push('BACKY_CORS_ALLOWED_ORIGINS or BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN');
  if (missing.length > 0) {
    throw new Error(`Settings provider certification is missing required env: ${missing.join(', ')}`);
  }
}

if (requestedPublicApiOrigin && !isHttpUrl(requestedPublicApiOrigin)) {
  throw new Error('BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN must be an http:// or https:// origin.');
}

if (!['auto', 'local', 's3', 'supabase'].includes(requestedStorageProvider)) {
  throw new Error('BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER must be auto, local, s3, or supabase.');
}

if (!['auto', 'webhook', 'http-endpoint', 'resend', 'smtp', 'local-outbox'].includes(requestedNotificationProvider)) {
  throw new Error('BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER must be auto, webhook, http-endpoint, resend, smtp, or local-outbox.');
}

const listen = (server, port = 0) => new Promise((resolve) => {
  server.listen(port, '127.0.0.1', () => resolve(server.address()));
});

const closeServer = (server) => new Promise((resolve) => {
  server.close(() => resolve());
});

const freePort = async () => {
  const server = net.createServer();
  const address = await listen(server);
  await closeServer(server);
  return address.port;
};

const waitForExit = (childProcess, timeoutMs = 1500) => new Promise((resolve) => {
  if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) {
    resolve(true);
    return;
  }
  const timeout = setTimeout(() => {
    childProcess.off('exit', onExit);
    resolve(false);
  }, timeoutMs);
  const onExit = () => {
    clearTimeout(timeout);
    resolve(true);
  };
  childProcess.once('exit', onExit);
});

const stopProcess = async (childProcess) => {
  if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) return;
  childProcess.kill('SIGTERM');
  if (!(await waitForExit(childProcess))) {
    childProcess.kill('SIGKILL');
    await waitForExit(childProcess, 500);
  }
};

const startPublicServer = async () => {
  if (externalBaseUrl) return { baseUrl: externalBaseUrl };

  const port = await freePort();
  const childProcess = spawn(process.execPath, [NEXT_BIN, 'dev', '-p', String(port)], {
    cwd: publicRootPath,
    env: {
      ...process.env,
      BACKY_ADMIN_API_KEY: adminKey,
      ...(certifyPublicApiCors && requestedPublicApiOrigin && !process.env.BACKY_CORS_ALLOWED_ORIGINS
        ? { BACKY_CORS_ALLOWED_ORIGINS: requestedPublicApiOrigin }
        : {}),
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-8000);
  };
  childProcess.stdout.on('data', append);
  childProcess.stderr.on('data', append);

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
      throw new Error(`Public Next server exited early:\n${output}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/sites`);
      if (response.status < 500) return { baseUrl, childProcess };
    } catch {
      // Keep waiting for Next dev.
    }
    await sleep(250);
  }
  throw new Error(`Public Next server did not become ready:\n${output}`);
};

const requestJson = async (baseUrl, pathName, init = {}) => {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-backy-admin-key': adminKey,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.ok && payload.success !== false, `${pathName} failed with ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
  return payload;
};

const assertNoRawSecretsInPayload = (payload, label) => {
  const serialized = JSON.stringify(payload);
  assert(
    !RAW_SECRET_VALUE_PATTERN.test(serialized),
    `${label} appears to expose a raw secret-like value.`,
  );
};

const normalizeArtifactFieldName = (name) => name.replace(/[^a-z0-9]/gi, '').toLowerCase();

const collectForbiddenArtifactFields = (input, pathSegments = []) => {
  if (Array.isArray(input)) {
    return input.flatMap((item, index) => collectForbiddenArtifactFields(item, [...pathSegments, String(index)]));
  }

  if (!input || typeof input !== 'object') {
    if (typeof input === 'string' && URL_WITH_CREDENTIALS_PATTERN.test(input)) {
      return [pathSegments.join('.') || '$'];
    }
    return [];
  }

  return Object.entries(input).flatMap(([key, nestedValue]) => {
    const nextPath = [...pathSegments, key];
    const normalizedKey = normalizeArtifactFieldName(key);
    const fieldLeak = FORBIDDEN_CERTIFICATION_ARTIFACT_FIELD_NAMES.has(normalizedKey)
      ? [nextPath.join('.')]
      : [];
    return [
      ...fieldLeak,
      ...collectForbiddenArtifactFields(nestedValue, nextPath),
    ];
  });
};

const assertNoForbiddenArtifactFields = (payload, label) => {
  const forbiddenFields = collectForbiddenArtifactFields(payload);
  assert(
    forbiddenFields.length === 0,
    `${label} contains forbidden sensitive artifact fields: ${forbiddenFields.join(', ')}`,
  );
};

const postSettingsAction = async (baseUrl, body) => {
  const payload = await requestJson(baseUrl, '/api/admin/settings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return payload.data;
};

const startNotificationCapture = async () => {
  const deliveries = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    deliveries.push({
      method: request.method,
      headers: request.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    });
    response.writeHead(204);
    response.end();
  });
  const address = await listen(server);
  return {
    deliveries,
    url: `http://127.0.0.1:${address.port}/settings-provider-certification`,
    close: () => closeServer(server),
  };
};

const requiredDiagnosticAreas = [
  'database',
  'storage',
  'supabase',
  'mediaScanner',
  'vercel',
  'notifications',
  'commerce',
  'interactiveComponents',
  'publicApi',
];

const normalizeOrigin = (value) => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '*') return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
};

const configuredCorsOrigins = () => (process.env.BACKY_CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

const assertDiagnosticAreasPresent = (diagnostics) => {
  const areas = new Set(diagnostics.map((group) => group.area).filter(Boolean));
  const missing = requiredDiagnosticAreas.filter((area) => !areas.has(area));
  assert(missing.length === 0, `Settings provider certification diagnostics are missing areas: ${missing.join(', ')}`);
};

const requestedDiagnosticAreas = () => {
  const areas = [];
  if (certifyStorage || certifyRotation) areas.push('storage', 'supabase');
  if (certifyVercelSecrets) areas.push('vercel');
  if (certifyNotification) areas.push('notifications');
  if (certifyPublicApiCors) areas.push('publicApi');
  if (certifyCommerce) areas.push('commerce');
  return new Set(areas);
};

const selectPublicApiCorsOrigin = (settings) => {
  const requested = normalizeOrigin(requestedPublicApiOrigin);
  const runtimeOrigins = Array.isArray(settings.runtimePublicApi?.allowedOrigins)
    ? settings.runtimePublicApi.allowedOrigins.map(normalizeOrigin).filter(Boolean)
    : [];
  const configured = configuredCorsOrigins();
  return requested || runtimeOrigins[0] || configured[0] || null;
};

const selectedStorageCertificationProvider = () => {
  if (requestedStorageProvider !== 'auto') return requestedStorageProvider;
  return (
    process.env.BACKY_STORAGE_PROVIDER ||
    process.env.BACKY_MEDIA_STORAGE_PROVIDER ||
    'local'
  ).trim().toLowerCase();
};

const inferNotificationCertificationProvider = () => {
  if (requestedNotificationProvider !== 'auto') return requestedNotificationProvider;
  const explicitProvider = (process.env.BACKY_EMAIL_PROVIDER || process.env.BACKY_TRANSACTIONAL_EMAIL_PROVIDER || '').trim().toLowerCase();
  if (explicitProvider === 'webhook') return 'http-endpoint';
  if (['http-endpoint', 'resend', 'smtp', 'local-outbox'].includes(explicitProvider)) return explicitProvider;
  if (process.env.BACKY_EMAIL_DELIVERY_ENDPOINT || process.env.BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL) return 'http-endpoint';
  if (process.env.BACKY_RESEND_API_KEY || process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BACKY_SMTP_HOST || process.env.SMTP_HOST) return 'smtp';
  return 'webhook';
};

const inferStorageCertificationProvider = (provider) => {
  if (requestedStorageProvider !== 'auto') return requestedStorageProvider;
  return provider || 'local';
};

const assertStorageProviderMatches = (result, label) => {
  const expected = inferStorageCertificationProvider(result?.provider);
  assert(result && result.provider, `${label} response is missing provider: ${JSON.stringify(result).slice(0, 800)}`);
  assert(
    result.provider === expected,
    `${label} expected ${expected} storage, but runtime certified ${result.provider}.`,
  );
  return expected;
};

const assertVercelTargetMatches = (result) => {
  assert(result && result.projectId, `Vercel secret-manager certification is missing projectId: ${JSON.stringify(result).slice(0, 800)}`);
  if (requestedVercelProjectId) {
    assert(
      result.projectId === requestedVercelProjectId,
      `Vercel secret-manager certification expected project ${requestedVercelProjectId}, but runtime planned ${result.projectId}.`,
    );
  }
  if (requestedVercelTeamId) {
    assert(
      result.teamId === requestedVercelTeamId,
      `Vercel secret-manager certification expected team ${requestedVercelTeamId}, but runtime planned ${result.teamId || 'none'}.`,
    );
  }
  return {
    projectId: result.projectId,
    teamId: result.teamId || null,
  };
};

const assertNotificationRuntimeReady = (settings) => {
  if (!certifyNotification) return null;

  const provider = inferNotificationCertificationProvider();
  if (provider === 'webhook') {
    return { provider };
  }

  const runtime = settings.runtimeNotifications || {};
  assert(
    runtime.emailProvider === provider,
    `Notification provider certification expected ${provider}, but runtime selected ${runtime.emailProvider || 'unknown'}.`,
  );
  assert(runtime.configured === true, `Notification provider ${provider} is not fully configured: ${JSON.stringify(runtime).slice(0, 800)}`);
  if (provider !== 'local-outbox') {
    assert(runtime.productionReady === true, `Notification provider ${provider} is not production-ready: ${JSON.stringify(runtime).slice(0, 800)}`);
  }
  return {
    provider,
    productionReady: Boolean(runtime.productionReady),
  };
};

const assertPublicApiCorsReady = async (baseUrl, settings) => {
  if (!certifyPublicApiCors) return null;

  const origin = selectPublicApiCorsOrigin(settings);
  const runtime = settings.runtimePublicApi || {};
  const allowedOrigins = Array.isArray(runtime.allowedOrigins)
    ? runtime.allowedOrigins.map(normalizeOrigin).filter(Boolean)
    : [];
  const exposedHeaders = Array.isArray(runtime.exposedContractHeaders)
    ? runtime.exposedContractHeaders
    : [];

  assert(origin, 'Public API/CORS certification requires BACKY_CORS_ALLOWED_ORIGINS or BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN.');
  assert(runtime.corsAllowedOriginsConfigured === true, `Public API/CORS runtime is missing configured origins: ${JSON.stringify(runtime).slice(0, 800)}`);
  assert(
    allowedOrigins.includes(origin),
    `Public API/CORS runtime did not include expected origin ${origin}: ${JSON.stringify(runtime).slice(0, 800)}`,
  );
  assert(
    exposedHeaders.includes('x-backy-request-id') && exposedHeaders.includes('x-backy-contract-version'),
    `Public API/CORS runtime did not expose Backy contract headers: ${JSON.stringify(exposedHeaders)}`,
  );

  const preflight = await fetch(`${baseUrl}/api/sites`, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'x-request-id',
    },
  });
  assert(preflight.status === 204, `Public API/CORS preflight returned ${preflight.status}.`);
  assert(
    preflight.headers.get('access-control-allow-origin') === origin,
    `Public API/CORS preflight did not echo ${origin}: ${preflight.headers.get('access-control-allow-origin') || 'missing'}`,
  );

  const response = await fetch(`${baseUrl}/api/sites`, {
    headers: { origin },
  });
  assert(response.status < 500, `Public API/CORS GET /api/sites returned ${response.status}.`);
  assert(
    response.headers.get('access-control-allow-origin') === origin,
    `Public API/CORS GET did not echo ${origin}: ${response.headers.get('access-control-allow-origin') || 'missing'}`,
  );
  const exposed = response.headers.get('access-control-expose-headers') || '';
  assert(
    exposed.toLowerCase().includes('x-backy-request-id') &&
      exposed.toLowerCase().includes('x-backy-contract-version'),
    `Public API/CORS response did not expose Backy contract headers: ${exposed || 'missing'}`,
  );

  return {
    origin,
    allowedOriginCount: allowedOrigins.length,
    exposedHeaderCount: exposedHeaders.length,
    preflightStatus: preflight.status,
    getStatus: response.status,
  };
};

const assertSettingsAdminApiHandoff = (settingsPayload, siteId) => {
  const settings = settingsPayload.data?.settings || {};
  const providerCertification = settings.providerCertification;
  const scenarioEvidence = providerCertification?.scenarioEvidence;
  const operatorEvidencePacket = providerCertification?.operatorEvidencePacket;
  const operatorEvidenceTarget = operatorEvidencePacket?.target || {};
  const commandPreview = operatorEvidencePacket?.commandPreview || {};
  const commandPreviewTargetInputs = Array.isArray(commandPreview.targetInputs)
    ? commandPreview.targetInputs
    : [];
  const completionStatus = settings.completionStatus;

  assert(
    providerCertification?.schemaVersion === 'backy.settings-provider-certification-handoff.v1',
    `Settings admin API is missing provider certification handoff: ${JSON.stringify(settingsPayload).slice(0, 900)}`,
  );
  assert(
    scenarioEvidence?.schemaVersion === 'backy.settings-provider-certification-evidence.v1',
    `Settings admin API is missing provider scenario evidence: ${JSON.stringify(providerCertification).slice(0, 900)}`,
  );
  assert(
    operatorEvidencePacket?.schemaVersion === 'backy.settings-provider-certification-evidence-packet.v1',
    `Settings admin API is missing operator evidence packet: ${JSON.stringify(providerCertification).slice(0, 900)}`,
  );
  assert(
    operatorEvidenceTarget.siteId === siteId &&
      operatorEvidenceTarget.settingsSiteSelectorEnv === 'BACKY_SETTINGS_CERTIFY_SITE_ID' &&
      operatorEvidenceTarget.commerceSiteSelectorEnv === 'BACKY_COMMERCE_CERTIFY_SITE_ID' &&
      commandPreviewTargetInputs.includes('BACKY_SETTINGS_CERTIFY_SITE_ID') &&
      commandPreviewTargetInputs.includes('BACKY_COMMERCE_CERTIFY_SITE_ID'),
    `Settings admin API operator evidence packet is not tied to ${siteId}: ${JSON.stringify(operatorEvidencePacket).slice(0, 900)}`,
  );
  assert(
    completionStatus?.schemaVersion === 'backy.completion-status.v1',
    `Settings admin API is missing completion status handoff: ${JSON.stringify(settings).slice(0, 900)}`,
  );
  assertNoRawSecretsInPayload(
    { providerCertification, completionStatus },
    'Settings admin API provider certification handoff',
  );

  return {
    status: 'certified',
    providerSchema: providerCertification.schemaVersion,
    scenarioEvidenceSchema: scenarioEvidence.schemaVersion,
    scenarioStatus: scenarioEvidence.status,
    scenarioCoverage: scenarioEvidence.coverage || null,
    evidencePacketSchema: operatorEvidencePacket.schemaVersion,
    evidencePacketStatus: operatorEvidencePacket.status,
    targetSiteId: operatorEvidenceTarget.siteId,
    settingsSiteSelectorEnv: operatorEvidenceTarget.settingsSiteSelectorEnv,
    commerceSiteSelectorEnv: operatorEvidenceTarget.commerceSiteSelectorEnv,
    commandPreviewTargetInputsIncludeSettingsSiteSelector: commandPreviewTargetInputs.includes('BACKY_SETTINGS_CERTIFY_SITE_ID'),
    commandPreviewTargetInputsIncludeCommerceSiteSelector: commandPreviewTargetInputs.includes('BACKY_COMMERCE_CERTIFY_SITE_ID'),
    completionStatusSchema: completionStatus.schemaVersion,
    surfaceRunbookCount: Array.isArray(completionStatus.surfaceRunbooks) ? completionStatus.surfaceRunbooks.length : 0,
  };
};

const assertSiteScopedSettingsApiHandoff = async (baseUrl, siteId) => {
  const payload = await requestJson(
    baseUrl,
    `/api/admin/sites/${encodeURIComponent(siteId)}/settings`,
  );
  const settings = payload.data?.settings || {};
  const scope = settings.scope || {};
  const mediaStorageHandoff = settings.mediaStorageHandoff;
  const frontendDatabaseCertification = settings.frontendDatabaseCertification;
  const scenarioEvidence = frontendDatabaseCertification?.scenarioEvidence;

  assert(
    settings.schemaVersion === 'backy.site-settings-scope.v1',
    `Site-scoped Settings API is missing site settings schema: ${JSON.stringify(payload).slice(0, 900)}`,
  );
  assert(
    scope.level === 'site' && typeof scope.siteId === 'string' && scope.siteId.length > 0,
    `Site-scoped Settings API is missing site scope metadata: ${JSON.stringify(settings).slice(0, 900)}`,
  );
  assert(
    mediaStorageHandoff?.schemaVersion === 'backy.media-storage-handoff.v1' &&
      mediaStorageHandoff.source === 'admin-site-settings-api' &&
      mediaStorageHandoff.selectedSiteId === scope.siteId,
    `Site-scoped Settings API is missing media storage handoff: ${JSON.stringify(mediaStorageHandoff).slice(0, 900)}`,
  );
  assert(
    frontendDatabaseCertification?.schemaVersion === 'backy.frontend-database-certification.v1' &&
      frontendDatabaseCertification.source === 'admin-site-settings-api',
    `Site-scoped Settings API is missing frontend database certification handoff: ${JSON.stringify(frontendDatabaseCertification).slice(0, 900)}`,
  );
  assert(
    scenarioEvidence?.schemaVersion === 'backy.frontend-database-certification-evidence.v1',
    `Site-scoped Settings API is missing frontend database scenario evidence: ${JSON.stringify(frontendDatabaseCertification).slice(0, 900)}`,
  );
  assertNoRawSecretsInPayload(
    { mediaStorageHandoff, frontendDatabaseCertification },
    'Site-scoped Settings API handoff',
  );

  return {
    status: 'certified',
    requestedSiteId: siteId,
    resolvedSiteId: scope.siteId,
    settingsSchema: settings.schemaVersion,
    source: mediaStorageHandoff.source,
    mediaStorageSchema: mediaStorageHandoff.schemaVersion,
    frontendDatabaseSchema: frontendDatabaseCertification.schemaVersion,
    frontendDatabaseEvidenceSchema: scenarioEvidence.schemaVersion,
  };
};

const writeCertificationOutput = async (payload) => {
  if (!certificationOutputPath) return;
  const outputPath = path.isAbsolute(certificationOutputPath)
    ? certificationOutputPath
    : path.join(rootPath, certificationOutputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const shouldRequireDiagnosticCheck = (group, check) => {
  if ((certifyStorage || certifyRotation) && (group.area === 'storage' || group.area === 'supabase')) {
    const provider = selectedStorageCertificationProvider();
    if (group.area === 'supabase' && provider !== 'supabase') {
      return false;
    }
    if (group.area === 'storage' && provider === 'local' && [
      'Storage bucket',
      'Public asset URL',
      'Storage secret refs',
    ].includes(check.label)) {
      return false;
    }
  }
  return true;
};

const assertRequiredDiagnosticsReady = (diagnostics, requestedAreas) => {
  const blockedRequired = diagnostics.flatMap((group) => (
    (group.checks || [])
      .filter(() => requestedAreas.has(group.area))
      .filter((check) => shouldRequireDiagnosticCheck(group, check))
      .filter((check) => check.required && !check.ready)
      .map((check) => `${group.area || group.label || group.title}:${check.label}`)
  ));
  assert(blockedRequired.length === 0, `Required Settings provider diagnostics are blocked: ${blockedRequired.join(', ')}`);
};

const main = async () => {
  const preflight = spawn(npmBin, ['run', 'test:settings-provider-certification-preflight-contract'], {
    cwd: rootPath,
    stdio: 'inherit',
  });
  const preflightExit = await new Promise((resolve) => preflight.on('exit', resolve));
  assert(preflightExit === 0, `Settings provider certification preflight exited with ${preflightExit}`);

  const server = await startPublicServer();
  let notificationCapture;

  try {
	    const settingsPayload = await requestJson(
	      server.baseUrl,
	      `/api/admin/settings?certificationSiteId=${encodeURIComponent(settingsCertificationSiteId)}`,
	    );
	    const settings = settingsPayload.data?.settings || {};
	    const settingsAdminApiHandoff = assertSettingsAdminApiHandoff(settingsPayload, settingsCertificationSiteId);
	    const siteScopedSettingsApiHandoff = await assertSiteScopedSettingsApiHandoff(
	      server.baseUrl,
	      settingsCertificationSiteId,
	    );
	    const diagnostics = await postSettingsAction(server.baseUrl, {
      action: 'validate-infrastructure',
      deliveryMode: settings.deliveryMode || 'custom-frontend',
      integrations: settings.integrations || {},
      recordHistory: true,
    });
    assert(Array.isArray(diagnostics.diagnostics), `Infrastructure diagnostics payload is missing diagnostics: ${JSON.stringify(diagnostics).slice(0, 800)}`);
    assertDiagnosticAreasPresent(diagnostics.diagnostics);
    const requestedAreas = requestedDiagnosticAreas();
    if (requireCertification) assertRequiredDiagnosticsReady(diagnostics.diagnostics, requestedAreas);

    const results = {
      infrastructure: {
        groups: diagnostics.diagnostics.length,
        areas: requiredDiagnosticAreas,
        requestedAreas: Array.from(requestedAreas),
        requiredReady: true,
      },
    };

    if (certifyStorage) {
      const storage = await postSettingsAction(server.baseUrl, {
        action: 'media-storage-provisioning-probe',
      });
      const provider = assertStorageProviderMatches(storage, 'Storage provisioning certification');
      assert(storage.status === 'ready', `Storage provisioning certification failed: ${JSON.stringify(storage).slice(0, 1000)}`);
      results.storage = { provider, status: storage.status };
    }

    if (certifyRotation) {
      const rotation = await postSettingsAction(server.baseUrl, {
        action: 'media-storage-credential-rotation-probe',
      });
      const provider = assertStorageProviderMatches(rotation, 'Storage rotation certification');
      assert(rotation.status === 'ready', `Storage rotation certification failed: ${JSON.stringify(rotation).slice(0, 1000)}`);
      assert(!JSON.stringify(rotation).match(/secret|token|password/i) || !JSON.stringify(rotation).match(/sk_live|whsec|AKIA/i), 'Rotation result appears to leak a raw secret.');
      results.rotation = { provider, status: rotation.status };
    }

    if (certifyVercelSecrets) {
      const secretManager = await postSettingsAction(server.baseUrl, {
        action: 'media-storage-secret-manager',
        mode: 'plan',
        dryRun: true,
        targetEnvironments: ['production', 'preview'],
      });
      assert(secretManager.status === 'ready', `Vercel secret-manager certification failed: ${JSON.stringify(secretManager).slice(0, 1000)}`);
      const vercelTarget = assertVercelTargetMatches(secretManager);
      if (certifyStorage || certifyRotation) {
        assertStorageProviderMatches(secretManager, 'Vercel storage secret-manager certification');
      }
      assert(secretManager.dryRun === true && secretManager.executed === false, `Certification must plan Vercel env operations without writes: ${JSON.stringify(secretManager).slice(0, 1000)}`);
      results.vercelSecretManager = { provider: secretManager.provider, status: secretManager.status, ...vercelTarget };
    }

    if (certifyNotification) {
      const runtimeNotification = assertNotificationRuntimeReady(settings);
      notificationCapture = await startNotificationCapture();
      const notification = await postSettingsAction(server.baseUrl, {
        action: 'test-notification-webhook',
        webhookUrl: notificationCapture.url,
      });
      const delivery = notification.delivery;
      assert(delivery && typeof delivery === 'object', `Notification webhook certification response is missing delivery: ${JSON.stringify(notification).slice(0, 800)}`);
      assert(delivery.status === 'succeeded', `Notification webhook certification failed: ${JSON.stringify(delivery).slice(0, 800)}`);
      assert(notificationCapture.deliveries.length === 1, 'Notification webhook certification did not deliver to the capture server.');
      results.notification = {
        provider: runtimeNotification?.provider || 'webhook',
        productionReady: runtimeNotification?.productionReady,
        webhookStatus: delivery.status,
      };
    }

    if (certifyPublicApiCors) {
      results.publicApiCors = await assertPublicApiCorsReady(server.baseUrl, settings);
    }

    const certificationPayload = {
      ok: true,
      contract: 'backy.settings-provider-certification.v1',
      certifiedAt,
      artifact: {
        schemaVersion: 'backy.settings-provider-certification-artifact.v1',
        outputPathConfigured: Boolean(certificationOutputPath),
        fileName: path.basename(certificationOutputPath || 'backy-settings-provider-certification.json'),
        secretHandling: 'Certification artifacts contain provider names, booleans, scenario counts, target mode, and non-secret result summaries only; admin keys, external target URLs, provider credentials, webhook bodies, and customer/order payloads stay in CI secrets or runtime logs.',
      },
      required: requireCertification,
      target: {
        mode: externalBaseUrl ? 'external' : 'local',
        externalBaseUrlConfigured: Boolean(externalBaseUrl),
      },
      requested: {
        storage: certifyStorage,
        rotation: certifyRotation,
        vercelSecrets: certifyVercelSecrets,
        notification: certifyNotification,
        publicApiCors: certifyPublicApiCors,
      },
	      requestedProviders: {
	        storage: requestedStorageProvider,
	        notification: requestedNotificationProvider,
	        publicApiOrigin: requestedPublicApiOrigin || 'auto',
	        vercelProjectId: requestedVercelProjectId || 'auto',
	        vercelTeamId: requestedVercelTeamId || 'auto',
	        siteId: settingsCertificationSiteId,
	      },
	      apiHandoffs: {
	        settingsAdminApi: settingsAdminApiHandoff,
	        siteScopedSettingsApi: siteScopedSettingsApiHandoff,
	      },
	      certified: Object.keys(results),
	      results,
	    };
    assertNoRawSecretsInPayload(certificationPayload, 'Settings provider certification artifact');
    assertNoForbiddenArtifactFields(certificationPayload, 'Settings provider certification artifact');
    await writeCertificationOutput(certificationPayload);
    console.log(JSON.stringify(certificationPayload));
  } finally {
    await notificationCapture?.close();
    await stopProcess(server.childProcess);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node

import { spawn } from 'node:child_process';
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
const adminKey = process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY || generatedAdminKey;
const certifyStorage = process.env.BACKY_SETTINGS_CERTIFY_STORAGE === '1';
const certifyRotation = process.env.BACKY_SETTINGS_CERTIFY_ROTATION === '1';
const certifyVercelSecrets = process.env.BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS === '1';
const certifyNotification = process.env.BACKY_SETTINGS_CERTIFY_NOTIFICATION === '1';
const certifyCommerce = process.env.BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED === '1';
const requestedStorageProvider = (process.env.BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER || 'auto').trim().toLowerCase();
const requestedNotificationProvider = (process.env.BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER || 'auto').trim().toLowerCase();
const requestedVercelProjectId = (process.env.BACKY_SETTINGS_CERTIFY_VERCEL_PROJECT_ID || '').trim();
const requestedVercelTeamId = (process.env.BACKY_SETTINGS_CERTIFY_VERCEL_TEAM_ID || '').trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

if (requireCertification && !adminKey) {
  throw new Error('BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1 requires BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY.');
}

if (requireCertification && !externalBaseUrl) {
  const missing = [];
  if ((certifyStorage || certifyRotation) && !process.env.BACKY_STORAGE_PROVIDER && requestedStorageProvider !== 'local') missing.push('BACKY_STORAGE_PROVIDER');
  if (certifyVercelSecrets && !(process.env.VERCEL_TOKEN || process.env.BACKY_VERCEL_TOKEN)) missing.push('VERCEL_TOKEN or BACKY_VERCEL_TOKEN');
  if (certifyVercelSecrets && !(process.env.VERCEL_PROJECT_ID || process.env.BACKY_VERCEL_PROJECT_ID)) missing.push('VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID');
  if (certifyRotation && !Object.keys(process.env).some((key) => key.includes('_NEXT_'))) missing.push('BACKY_*_NEXT_* replacement storage env');
  if (missing.length > 0) {
    throw new Error(`Settings provider certification is missing required env: ${missing.join(', ')}`);
  }
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
];

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
  if (certifyCommerce) areas.push('commerce');
  return new Set(areas);
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
    const settingsPayload = await requestJson(server.baseUrl, '/api/admin/settings');
    const settings = settingsPayload.data?.settings || {};
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

    console.log(JSON.stringify({
      ok: true,
      contract: 'backy.settings-provider-certification.v1',
      required: requireCertification,
      target: {
        mode: externalBaseUrl ? 'external' : 'local',
        externalBaseUrlConfigured: Boolean(externalBaseUrl),
      },
      requestedProviders: {
        storage: requestedStorageProvider,
        notification: requestedNotificationProvider,
        vercelProjectId: requestedVercelProjectId || 'auto',
        vercelTeamId: requestedVercelTeamId || 'auto',
      },
      certified: Object.keys(results),
      results,
    }));
  } finally {
    await notificationCapture?.close();
    await stopProcess(server.childProcess);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

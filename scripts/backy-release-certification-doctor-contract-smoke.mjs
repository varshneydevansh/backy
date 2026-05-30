#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const runDoctor = (env) => new Promise((resolve) => {
  const child = spawn(process.execPath, ['scripts/backy-release-certification-doctor.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  child.on('close', (code) => resolve({ code, stdout, stderr }));
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const parseJson = (result, label) => {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label} did not emit JSON: ${error instanceof Error ? error.message : error}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
};

const DEFAULT_AUDIT_COUNTS = {
  ready: 41,
  partial: 4,
  prototype: 0,
  missing: 0,
  total: 45,
  readyPercent: 91,
};

const ARTIFACT_ACCEPTED_AUDIT_COUNTS = {
  ready: 45,
  partial: 0,
  prototype: 0,
  missing: 0,
  total: 45,
  readyPercent: 100,
};

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const assertDoctorAuditModes = (json, artifactAccepted, label) => {
  const readiness = json.partialClosureReadiness;
  assert(readiness?.auditImpact?.schemaVersion === 'backy.partial-closure-audit-impact.v1', `${label} should expose auditImpact schema.`);
  assert(
    sameJson(readiness.auditImpact.defaultNoArtifactAudit, DEFAULT_AUDIT_COUNTS) &&
      sameJson(readiness.auditImpact.artifactAcceptedAudit, ARTIFACT_ACCEPTED_AUDIT_COUNTS) &&
      readiness.auditImpact.readyRowsAdded === 4 &&
      readiness.auditImpact.partialRowsClosed === 4,
    `${label} should expose default 41/4 and artifact-backed 45/0 audit counts: ${JSON.stringify(readiness?.auditImpact)}`,
  );
  assert(
    readiness.defaultNoArtifactMode?.active === !artifactAccepted &&
      readiness.defaultNoArtifactMode?.ready === false &&
      readiness.defaultNoArtifactMode?.readyCount === 0 &&
      readiness.defaultNoArtifactMode?.partialCount === 4 &&
      readiness.defaultNoArtifactMode?.status === 'partial' &&
      sameJson(readiness.defaultNoArtifactMode?.audit, DEFAULT_AUDIT_COUNTS) &&
      readiness.defaultNoArtifactMode?.description.includes('41 Ready / 4 Partial'),
    `${label} should expose default no-artifact mode: ${JSON.stringify(readiness?.defaultNoArtifactMode)}`,
  );
  assert(
    readiness.artifactAcceptedMode?.active === artifactAccepted &&
      readiness.artifactAcceptedMode?.ready === artifactAccepted &&
      readiness.artifactAcceptedMode?.readyCount === 4 &&
      readiness.artifactAcceptedMode?.partialCount === 0 &&
      readiness.artifactAcceptedMode?.status === (artifactAccepted ? 'ready' : 'awaiting-artifacts') &&
      sameJson(readiness.artifactAcceptedMode?.audit, ARTIFACT_ACCEPTED_AUDIT_COUNTS) &&
      readiness.artifactAcceptedMode?.description.includes('45 Ready / 0 Partial'),
    `${label} should expose artifact-accepted mode: ${JSON.stringify(readiness?.artifactAcceptedMode)}`,
  );
  assert(
    readiness.currentAuditMode === (artifactAccepted ? 'artifactAcceptedMode' : 'defaultNoArtifactMode') &&
      sameJson(readiness.currentAudit, artifactAccepted ? ARTIFACT_ACCEPTED_AUDIT_COUNTS : DEFAULT_AUDIT_COUNTS),
    `${label} should expose the active audit mode and counts: ${JSON.stringify({ currentAuditMode: readiness?.currentAuditMode, currentAudit: readiness?.currentAudit })}`,
  );
};

const assertMissingProvider = async ({ label, env, failure }) => {
  const result = await runDoctor({
    BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
    ...env,
  });
  assert(result.code === 1, `Doctor ${label} mode should exit 1 without required credentials, got ${result.code}.`);
  const json = parseJson(result, `missing ${label} doctor`);
  assert(json.ok === false, `Doctor ${label} mode should report ok=false.`);
  assert(
    json.failures.includes(failure),
    `Doctor ${label} mode should report ${failure} failure. Actual failures: ${JSON.stringify(json.failures)}`,
  );
  return json;
};

const assertProviderAliasReady = async ({ label, env }) => {
  const result = await runDoctor({
    BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    ...env,
  });
  assert(result.code === 0, `Doctor ${label} mode should accept provider-native aliases, got ${result.code}.`);
  const json = parseJson(result, `${label} alias-ready doctor`);
  assert(json.ok === true, `Doctor ${label} alias-ready mode should report ok=true.`);
  return json;
};

const artifactTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backy-release-doctor-'));
const settingsArtifactPath = path.join(artifactTempDir, 'backy-settings-provider-certification.json');
const staleSettingsArtifactPath = path.join(artifactTempDir, 'backy-settings-provider-certification-stale.json');
const untargetedSettingsArtifactPath = path.join(artifactTempDir, 'backy-settings-provider-certification-untargeted.json');
const missingResultSettingsArtifactPath = path.join(artifactTempDir, 'backy-settings-provider-certification-missing-result.json');
const expiredSettingsArtifactPath = path.join(artifactTempDir, 'backy-settings-provider-certification-expired.json');
const leakedSettingsArtifactPath = path.join(artifactTempDir, 'backy-settings-provider-certification-leaked-secret.json');
const forbiddenFieldSettingsArtifactPath = path.join(artifactTempDir, 'backy-settings-provider-certification-forbidden-field.json');
const commerceArtifactPath = path.join(artifactTempDir, 'backy-commerce-provider-certification.json');
const staleCommerceArtifactPath = path.join(artifactTempDir, 'backy-commerce-provider-certification-stale.json');
const artifactTargetMissingCommerceArtifactPath = path.join(artifactTempDir, 'backy-commerce-provider-certification-missing-target.json');
const artifactTargetMismatchCommerceArtifactPath = path.join(artifactTempDir, 'backy-commerce-provider-certification-mismatched-target.json');
const untargetedCommerceArtifactPath = path.join(artifactTempDir, 'backy-commerce-provider-certification-untargeted.json');
const missingResultCommerceArtifactPath = path.join(artifactTempDir, 'backy-commerce-provider-certification-missing-result.json');
const expiredCommerceArtifactPath = path.join(artifactTempDir, 'backy-commerce-provider-certification-expired.json');
const freshCertifiedAt = new Date().toISOString();
const expiredCertifiedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
const settingsRequestedGroups = {
  storage: true,
  rotation: false,
  vercelSecrets: false,
  notification: true,
  publicApiCors: true,
};
const settingsResults = {
  infrastructure: {
    groups: 9,
    areas: ['database', 'storage', 'supabase', 'mediaScanner', 'vercel', 'notifications', 'commerce', 'interactiveComponents', 'publicApi'],
    requestedAreas: ['storage', 'supabase', 'notifications', 'publicApi'],
    requiredReady: true,
  },
  storage: { provider: 's3', status: 'ready' },
  notification: { provider: 'resend', productionReady: true, webhookStatus: 'succeeded' },
  publicApiCors: { origin: 'https://app.example.test', preflightStatus: 204, getStatus: 200 },
};
const rawSecretLeakFixtures = [
  'BACKY_SECRET_TEST_VALUE_releaseDoctorShouldReject123',
  ['Bearer', `provider_${'A'.repeat(40)}`].join(' '),
  ['ghp', 'B'.repeat(36)].join('_'),
  ['vercel', 'C'.repeat(40)].join('_'),
  [`eyJ${'D'.repeat(16)}`, 'E'.repeat(24), 'F'.repeat(24)].join('.'),
];
fs.writeFileSync(settingsArtifactPath, JSON.stringify({
  ok: true,
  contract: 'backy.settings-provider-certification.v1',
  certifiedAt: freshCertifiedAt,
  artifact: {
    schemaVersion: 'backy.settings-provider-certification-artifact.v1',
    outputPathConfigured: true,
    fileName: 'backy-settings-provider-certification.json',
    secretHandling: 'Certification artifacts contain provider names, booleans, scenario counts, target mode, and non-secret result summaries only; admin keys, external target URLs, provider credentials, webhook bodies, and customer/order payloads stay in CI secrets or runtime logs.',
  },
  required: true,
  target: { mode: 'local', externalBaseUrlConfigured: false },
  requested: settingsRequestedGroups,
  requestedProviders: { storage: 's3', notification: 'resend', publicApiOrigin: 'https://app.example.test' },
  certified: ['infrastructure', 'storage', 'notification', 'publicApiCors'],
  apiHandoffs: {
    settingsAdminApi: {
      status: 'certified',
      providerSchema: 'backy.settings-provider-certification-handoff.v1',
      scenarioEvidenceSchema: 'backy.settings-provider-certification-evidence.v1',
      scenarioStatus: 'ready',
      scenarioCoverage: { covered: 8, total: 8, missing: [] },
      evidencePacketSchema: 'backy.settings-provider-certification-evidence-packet.v1',
      evidencePacketStatus: 'evidence-complete',
      targetSiteId: 'site-demo',
      settingsSiteSelectorEnv: 'BACKY_SETTINGS_CERTIFY_SITE_ID',
      commerceSiteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
      commandPreviewTargetInputsIncludeSettingsSiteSelector: true,
      commandPreviewTargetInputsIncludeCommerceSiteSelector: true,
      completionStatusSchema: 'backy.completion-status.v1',
      surfaceRunbookCount: 4,
    },
    siteScopedSettingsApi: {
      status: 'certified',
      requestedSiteId: 'site-demo',
      resolvedSiteId: 'site-demo',
      settingsSchema: 'backy.site-settings-scope.v1',
      source: 'admin-site-settings-api',
      mediaStorageSchema: 'backy.media-storage-handoff.v1',
      frontendDatabaseSchema: 'backy.frontend-database-certification.v1',
      frontendDatabaseEvidenceSchema: 'backy.frontend-database-certification-evidence.v1',
    },
  },
  results: settingsResults,
}, null, 2));
fs.writeFileSync(staleSettingsArtifactPath, JSON.stringify({
  ok: true,
  contract: 'backy.settings-provider-certification.v1',
  certifiedAt: freshCertifiedAt,
  artifact: {
    schemaVersion: 'backy.settings-provider-certification-artifact.v1',
    outputPathConfigured: true,
    fileName: 'backy-settings-provider-certification.json',
    secretHandling: 'Certification artifacts contain provider names, booleans, scenario counts, target mode, and non-secret result summaries only; admin keys, external target URLs, provider credentials, webhook bodies, and customer/order payloads stay in CI secrets or runtime logs.',
  },
  required: true,
  target: { mode: 'local', externalBaseUrlConfigured: false },
  requested: settingsRequestedGroups,
  requestedProviders: { storage: 's3', notification: 'resend', publicApiOrigin: 'https://app.example.test' },
  certified: ['infrastructure', 'storage', 'notification', 'publicApiCors'],
  results: settingsResults,
}, null, 2));
fs.writeFileSync(untargetedSettingsArtifactPath, JSON.stringify({
  ok: true,
  contract: 'backy.settings-provider-certification.v1',
  certifiedAt: freshCertifiedAt,
  artifact: {
    schemaVersion: 'backy.settings-provider-certification-artifact.v1',
    outputPathConfigured: true,
    fileName: 'backy-settings-provider-certification.json',
    secretHandling: 'Certification artifacts contain provider names, booleans, scenario counts, target mode, and non-secret result summaries only; admin keys, external target URLs, provider credentials, webhook bodies, and customer/order payloads stay in CI secrets or runtime logs.',
  },
  required: true,
  target: { mode: 'local', externalBaseUrlConfigured: false },
  requested: settingsRequestedGroups,
  requestedProviders: { storage: 's3', notification: 'resend', publicApiOrigin: 'https://app.example.test' },
  certified: ['infrastructure', 'storage', 'notification', 'publicApiCors'],
  apiHandoffs: {
    settingsAdminApi: {
      status: 'certified',
      providerSchema: 'backy.settings-provider-certification-handoff.v1',
      scenarioEvidenceSchema: 'backy.settings-provider-certification-evidence.v1',
      scenarioStatus: 'ready',
      scenarioCoverage: { covered: 8, total: 8, missing: [] },
      evidencePacketSchema: 'backy.settings-provider-certification-evidence-packet.v1',
      evidencePacketStatus: 'evidence-complete',
      completionStatusSchema: 'backy.completion-status.v1',
      surfaceRunbookCount: 4,
    },
    siteScopedSettingsApi: {
      status: 'certified',
      requestedSiteId: 'site-demo',
      resolvedSiteId: 'site-demo',
      settingsSchema: 'backy.site-settings-scope.v1',
      source: 'admin-site-settings-api',
      mediaStorageSchema: 'backy.media-storage-handoff.v1',
      frontendDatabaseSchema: 'backy.frontend-database-certification.v1',
      frontendDatabaseEvidenceSchema: 'backy.frontend-database-certification-evidence.v1',
    },
  },
  results: settingsResults,
}, null, 2));
fs.writeFileSync(leakedSettingsArtifactPath, JSON.stringify({
  ok: true,
  contract: 'backy.settings-provider-certification.v1',
  certifiedAt: freshCertifiedAt,
  artifact: {
    schemaVersion: 'backy.settings-provider-certification-artifact.v1',
    outputPathConfigured: true,
    fileName: 'backy-settings-provider-certification.json',
    secretHandling: 'Certification artifacts contain provider names, booleans, scenario counts, target mode, and non-secret result summaries only; admin keys, external target URLs, provider credentials, webhook bodies, and customer/order payloads stay in CI secrets or runtime logs.',
  },
  required: true,
  target: { mode: 'local', externalBaseUrlConfigured: false },
  requested: settingsRequestedGroups,
  requestedProviders: { storage: 's3', notification: 'resend', publicApiOrigin: 'https://app.example.test' },
  certified: ['infrastructure', 'storage', 'notification', 'publicApiCors'],
  apiHandoffs: {
    settingsAdminApi: {
      status: 'certified',
      providerSchema: 'backy.settings-provider-certification-handoff.v1',
      scenarioEvidenceSchema: 'backy.settings-provider-certification-evidence.v1',
      scenarioStatus: 'ready',
      evidencePacketSchema: 'backy.settings-provider-certification-evidence-packet.v1',
      evidencePacketStatus: 'evidence-complete',
      targetSiteId: 'site-demo',
      settingsSiteSelectorEnv: 'BACKY_SETTINGS_CERTIFY_SITE_ID',
      commerceSiteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
      commandPreviewTargetInputsIncludeSettingsSiteSelector: true,
      commandPreviewTargetInputsIncludeCommerceSiteSelector: true,
      completionStatusSchema: 'backy.completion-status.v1',
    },
    siteScopedSettingsApi: {
      status: 'certified',
      requestedSiteId: 'site-demo',
      resolvedSiteId: 'site-demo',
      settingsSchema: 'backy.site-settings-scope.v1',
      source: 'admin-site-settings-api',
      mediaStorageSchema: 'backy.media-storage-handoff.v1',
      frontendDatabaseSchema: 'backy.frontend-database-certification.v1',
      frontendDatabaseEvidenceSchema: 'backy.frontend-database-certification-evidence.v1',
    },
  },
  results: {
    ...settingsResults,
    leakedCredentials: rawSecretLeakFixtures,
  },
}, null, 2));
const forbiddenFieldSettingsArtifactPayload = JSON.parse(fs.readFileSync(settingsArtifactPath, 'utf8'));
forbiddenFieldSettingsArtifactPayload.target.externalBaseUrl = 'https://backy-admin.example.test';
forbiddenFieldSettingsArtifactPayload.results.webhookBody = '{"event":"should-not-be-in-artifact"}';
forbiddenFieldSettingsArtifactPayload.results.providerSummary = 'https://user:password@backy-admin.example.test/provider';
fs.writeFileSync(forbiddenFieldSettingsArtifactPath, JSON.stringify(forbiddenFieldSettingsArtifactPayload, null, 2));
const expiredSettingsArtifactPayload = JSON.parse(fs.readFileSync(settingsArtifactPath, 'utf8'));
expiredSettingsArtifactPayload.certifiedAt = expiredCertifiedAt;
fs.writeFileSync(expiredSettingsArtifactPath, JSON.stringify(expiredSettingsArtifactPayload, null, 2));
const missingResultSettingsArtifactPayload = JSON.parse(fs.readFileSync(settingsArtifactPath, 'utf8'));
missingResultSettingsArtifactPayload.certified = ['infrastructure', 'storage', 'notification'];
delete missingResultSettingsArtifactPayload.results.publicApiCors;
fs.writeFileSync(missingResultSettingsArtifactPath, JSON.stringify(missingResultSettingsArtifactPayload, null, 2));
fs.writeFileSync(commerceArtifactPath, JSON.stringify({
  ok: true,
  contract: 'backy.commerce-provider-certification.v1',
  certifiedAt: freshCertifiedAt,
  artifact: {
    schemaVersion: 'backy.commerce-provider-certification-artifact.v1',
    outputPathConfigured: true,
    fileName: 'backy-commerce-provider-certification.json',
    secretHandling: 'Certification artifacts contain provider names, readiness booleans, target mode, non-secret runtime selections, and diagnostic counts only; admin keys, external target URLs, provider credentials, payment references, webhook bodies, and customer/order payloads stay in CI secrets or runtime logs.',
  },
  required: true,
  target: {
    mode: 'local',
    externalBaseUrlConfigured: false,
    siteId: 'site-demo',
    siteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
  },
  requested: { payment: true, tax: true, shipping: true },
  readiness: { payment: true, tax: true, shipping: true },
  requestedProviders: { payment: 'stripe', tax: 'taxjar', shipping: 'easypost' },
  certified: ['payment', 'tax', 'shipping'],
  runtime: { missing: [] },
  diagnostics: { groups: 1, commerceGroup: 1 },
  apiHandoffs: {
    siteId: 'site-demo',
    publicApis: {
      status: 'certified',
      manifestProviderSchema: 'backy.commerce-provider-certification-handoff.v1',
      runtimeProviderSchema: 'backy.commerce-provider-certification-handoff.v1',
      catalogSchema: 'backy.commerce-catalog.v1',
      catalogProviderSchema: 'backy.commerce-provider-certification-handoff.v1',
      catalogProductCount: 1,
      orderContractSchema: 'backy.commerce-orders.v1',
      orderProviderSchema: 'backy.commerce-provider-certification-handoff.v1',
    },
    product: {
      status: 'certified',
      productId: 'product_demo',
      providerSchema: 'backy.commerce-provider-certification-handoff.v1',
      productEvidenceSchema: 'backy.product-provider-certification-evidence.v1',
      packetSchema: 'backy.commerce-provider-certification-evidence-packet.v1',
      targetSiteId: 'site-demo',
      siteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
      commandPreviewTargetInputsIncludeSiteSelector: true,
      storefrontSchema: 'backy.product-storefront-handoff.v1',
      designReadinessStatus: 'ready',
    },
    orders: {
      status: 'certified',
      analyticsSchema: 'backy.order-analytics.v1',
      providerSchema: 'backy.commerce-provider-certification-handoff.v1',
      orderEvidenceSchema: 'backy.order-provider-certification-evidence.v1',
      packetSchema: 'backy.order-provider-certification-evidence-packet.v1',
      targetSiteId: 'site-demo',
      siteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
      commandPreviewTargetInputsIncludeSiteSelector: true,
      orderCount: 3,
    },
  },
}, null, 2));
const expiredCommerceArtifactPayload = JSON.parse(fs.readFileSync(commerceArtifactPath, 'utf8'));
expiredCommerceArtifactPayload.certifiedAt = expiredCertifiedAt;
fs.writeFileSync(expiredCommerceArtifactPath, JSON.stringify(expiredCommerceArtifactPayload, null, 2));
const missingResultCommerceArtifactPayload = JSON.parse(fs.readFileSync(commerceArtifactPath, 'utf8'));
missingResultCommerceArtifactPayload.certified = ['payment', 'shipping'];
missingResultCommerceArtifactPayload.readiness.tax = false;
fs.writeFileSync(missingResultCommerceArtifactPath, JSON.stringify(missingResultCommerceArtifactPayload, null, 2));
const artifactTargetMissingCommerceArtifactPayload = JSON.parse(fs.readFileSync(commerceArtifactPath, 'utf8'));
delete artifactTargetMissingCommerceArtifactPayload.target.siteId;
delete artifactTargetMissingCommerceArtifactPayload.target.siteSelectorEnv;
fs.writeFileSync(artifactTargetMissingCommerceArtifactPath, JSON.stringify(artifactTargetMissingCommerceArtifactPayload, null, 2));
const artifactTargetMismatchCommerceArtifactPayload = JSON.parse(fs.readFileSync(commerceArtifactPath, 'utf8'));
artifactTargetMismatchCommerceArtifactPayload.target.siteId = 'site-other';
fs.writeFileSync(artifactTargetMismatchCommerceArtifactPath, JSON.stringify(artifactTargetMismatchCommerceArtifactPayload, null, 2));
fs.writeFileSync(staleCommerceArtifactPath, JSON.stringify({
  ok: true,
  contract: 'backy.commerce-provider-certification.v1',
  certifiedAt: freshCertifiedAt,
  artifact: {
    schemaVersion: 'backy.commerce-provider-certification-artifact.v1',
    outputPathConfigured: true,
    fileName: 'backy-commerce-provider-certification.json',
    secretHandling: 'Certification artifacts contain provider names, readiness booleans, target mode, non-secret runtime selections, and diagnostic counts only; admin keys, external target URLs, provider credentials, payment references, webhook bodies, and customer/order payloads stay in CI secrets or runtime logs.',
  },
  required: true,
  target: {
    mode: 'local',
    externalBaseUrlConfigured: false,
    siteId: 'site-demo',
    siteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
  },
  requested: { payment: true, tax: true, shipping: true },
  readiness: { payment: true, tax: true, shipping: true },
  requestedProviders: { payment: 'stripe', tax: 'taxjar', shipping: 'easypost' },
  certified: ['payment', 'tax', 'shipping'],
  runtime: { missing: [] },
  diagnostics: { groups: 1, commerceGroup: 1 },
}, null, 2));
fs.writeFileSync(untargetedCommerceArtifactPath, JSON.stringify({
  ok: true,
  contract: 'backy.commerce-provider-certification.v1',
  certifiedAt: freshCertifiedAt,
  artifact: {
    schemaVersion: 'backy.commerce-provider-certification-artifact.v1',
    outputPathConfigured: true,
    fileName: 'backy-commerce-provider-certification.json',
    secretHandling: 'Certification artifacts contain provider names, readiness booleans, target mode, non-secret runtime selections, and diagnostic counts only; admin keys, external target URLs, provider credentials, payment references, webhook bodies, and customer/order payloads stay in CI secrets or runtime logs.',
  },
  required: true,
  target: {
    mode: 'local',
    externalBaseUrlConfigured: false,
    siteId: 'site-demo',
    siteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
  },
  requested: { payment: true, tax: true, shipping: true },
  readiness: { payment: true, tax: true, shipping: true },
  requestedProviders: { payment: 'stripe', tax: 'taxjar', shipping: 'easypost' },
  certified: ['payment', 'tax', 'shipping'],
  runtime: { missing: [] },
  diagnostics: { groups: 1, commerceGroup: 1 },
  apiHandoffs: {
    siteId: 'site-demo',
    publicApis: {
      status: 'certified',
      manifestProviderSchema: 'backy.commerce-provider-certification-handoff.v1',
      runtimeProviderSchema: 'backy.commerce-provider-certification-handoff.v1',
      catalogSchema: 'backy.commerce-catalog.v1',
      catalogProviderSchema: 'backy.commerce-provider-certification-handoff.v1',
      catalogProductCount: 1,
      orderContractSchema: 'backy.commerce-orders.v1',
      orderProviderSchema: 'backy.commerce-provider-certification-handoff.v1',
    },
    product: {
      status: 'certified',
      productId: 'product_demo',
      providerSchema: 'backy.commerce-provider-certification-handoff.v1',
      productEvidenceSchema: 'backy.product-provider-certification-evidence.v1',
      packetSchema: 'backy.commerce-provider-certification-evidence-packet.v1',
      storefrontSchema: 'backy.product-storefront-handoff.v1',
      designReadinessStatus: 'ready',
    },
    orders: {
      status: 'certified',
      analyticsSchema: 'backy.order-analytics.v1',
      providerSchema: 'backy.commerce-provider-certification-handoff.v1',
      orderEvidenceSchema: 'backy.order-provider-certification-evidence.v1',
      packetSchema: 'backy.order-provider-certification-evidence-packet.v1',
      orderCount: 3,
    },
  },
}, null, 2));

const normal = await runDoctor({});
assert(normal.code === 0, `Doctor default mode should exit 0, got ${normal.code}: ${normal.stderr}`);
const normalJson = parseJson(normal, 'default doctor');
assert(normalJson.contract === 'backy.release-certification-doctor.v1', 'Doctor default mode missing contract.');
assert(normalJson.ok === true, 'Doctor default mode should be ok when no certification groups are requested.');
assert(
  Array.isArray(normalJson.partialGateMap) && normalJson.partialGateMap.length === 4,
  'Doctor default mode should expose the current Partial-to-gate map.',
);
assert(
  normalJson.partialClosureReadiness?.schemaVersion === 'backy.partial-closure-readiness.v1' &&
    normalJson.partialClosureReadiness?.source === 'release-certification-doctor' &&
    normalJson.partialClosureReadiness?.status === 'external-artifacts-required' &&
    normalJson.partialClosureReadiness?.ready === false &&
    normalJson.partialClosureReadiness?.readyCount === 0 &&
    normalJson.partialClosureReadiness?.partialCount === 4 &&
    normalJson.partialClosureReadiness?.prototypeCount === 0 &&
    normalJson.partialClosureReadiness?.missingCount === 0 &&
    normalJson.partialClosureReadiness?.total === 4 &&
	    normalJson.partialClosureReadiness?.aggregatePreflight === 'npm run test:partial-gate-preflights' &&
	    normalJson.partialClosureReadiness?.doctorCommand === 'npm run doctor:release-certification' &&
	    normalJson.partialClosureReadiness?.artifactAdmissionCommand === 'npm run ci:provider-artifact-admission' &&
	    normalJson.partialClosureReadiness?.artifactAdmissionModes?.settings?.command === 'BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=settings npm run ci:provider-artifact-admission' &&
	    normalJson.partialClosureReadiness?.artifactAdmissionModes?.commerce?.command === 'BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=commerce npm run ci:provider-artifact-admission' &&
	    normalJson.partialClosureReadiness?.artifactAdmissionModes?.settings?.requiredEnv === 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1' &&
	    normalJson.partialClosureReadiness?.artifactAdmissionModes?.commerce?.requiredEnv === 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1' &&
	    normalJson.partialClosureReadiness?.artifactRequiredEnv === 'BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1' &&
    Array.isArray(normalJson.partialClosureReadiness?.rows) &&
    normalJson.partialClosureReadiness.rows.length === 4,
  'Doctor default mode should expose explicit Partial closure readiness separate from diagnostic ok=true.',
);
assertDoctorAuditModes(normalJson, false, 'Doctor default mode');
for (const row of ['/settings', 'Settings admin APIs', '/products', '/orders']) {
  const closure = normalJson.partialClosureReadiness.rows.find((item) => item.row === row);
  assert(closure, `Doctor Partial closure readiness missing ${row}.`);
  assert(closure.ready === false && closure.status === 'partial', `Doctor default closure row ${row} should remain partial without artifacts.`);
  assert(
    closure.evidenceMode === 'live-provider-certification-artifact' &&
      closure.aggregatePreflight === 'npm run test:partial-gate-preflights' &&
      closure.adminSourceGuard === 'npm run test:admin-contract-source' &&
      closure.doctorRequiredEnv === 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1' &&
      typeof closure.gate === 'string' &&
      typeof closure.preflight === 'string' &&
      typeof closure.sourceOnlyGuard === 'string' &&
      typeof closure.workflow === 'string' &&
      typeof closure.requiredInputFamily === 'string' &&
      typeof closure.artifactRequiredEnv === 'string' &&
      typeof closure.artifactSchemaVersion === 'string' &&
      closure.nextAction.includes(closure.gate) &&
      closure.nextAction.includes('npm run doctor:release-certification'),
    `Doctor Partial closure row ${row} should be self-contained with gate, guard, workflow, artifact, and next-action metadata.`,
  );
  if (row === '/settings' || row === 'Settings admin APIs') {
    assert(
      closure.artifactKey === 'settings' &&
        closure.requiredArtifact === 'Settings certification artifact' &&
	        closure.artifactPathEnv === 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT' &&
	        closure.artifactRequiredEnv.includes('BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1') &&
	        closure.artifactSchemaVersion === 'backy.settings-provider-certification-artifact.v1' &&
	        closure.artifactAdmissionCommand === 'BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=settings npm run ci:provider-artifact-admission' &&
	        closure.gate === 'npm run ci:settings-provider-certification' &&
        closure.preflight === 'npm run test:settings-provider-certification-preflight-contract' &&
        closure.sourceOnlyGuard === 'npm run test:settings-source-only' &&
        closure.mockGate === null &&
        closure.workflow === '.github/workflows/settings-provider-certification.yml' &&
        closure.reason.includes('not configured'),
      `Doctor default closure row ${row} should point at the Settings artifact.`,
    );
  } else {
    assert(
      closure.artifactKey === 'commerce' &&
        closure.requiredArtifact === 'Commerce certification artifact' &&
	        closure.artifactPathEnv === 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT' &&
	        closure.artifactRequiredEnv.includes('BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1') &&
	        closure.artifactSchemaVersion === 'backy.commerce-provider-certification-artifact.v1' &&
	        closure.artifactAdmissionCommand === 'BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=commerce npm run ci:provider-artifact-admission' &&
	        closure.gate === 'npm run ci:commerce-provider-certification' &&
        closure.preflight === 'npm run test:commerce-provider-certification-preflight-contract' &&
        closure.mockGate === 'npm run ci:commerce-provider-smoke' &&
        closure.workflow === '.github/workflows/commerce-provider-certification.yml' &&
        closure.reason.includes('not configured'),
      `Doctor default closure row ${row} should point at the Commerce artifact.`,
    );
  }
}
for (const { row, gate, preflight, workflow, requiredInputFamily, sourceOnlyGuard, mockGate, doctorRequiredEnv } of [
  {
    row: '/settings',
    gate: 'npm run ci:settings-provider-certification',
    preflight: 'npm run test:settings-provider-certification-preflight-contract',
    sourceOnlyGuard: 'npm run test:settings-source-only',
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    workflow: '.github/workflows/settings-provider-certification.yml',
    requiredInputFamily: 'storage, Vercel, notification, custom frontend CORS',
  },
  {
    row: 'Settings admin APIs',
    gate: 'npm run ci:settings-provider-certification',
    preflight: 'npm run test:settings-provider-certification-preflight-contract',
    sourceOnlyGuard: 'npm run test:settings-source-only',
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    workflow: '.github/workflows/settings-provider-certification.yml',
    requiredInputFamily: 'storage, Vercel, notification, custom frontend CORS',
  },
  {
    row: '/products',
    gate: 'npm run ci:commerce-provider-certification',
    preflight: 'npm run test:commerce-provider-certification-preflight-contract',
    sourceOnlyGuard: 'npm run test:commerce-source-only',
    mockGate: 'npm run ci:commerce-provider-smoke',
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    workflow: '.github/workflows/commerce-provider-certification.yml',
    requiredInputFamily: 'payment, tax, shipping',
  },
  {
    row: '/orders',
    gate: 'npm run ci:commerce-provider-certification',
    preflight: 'npm run test:commerce-provider-certification-preflight-contract',
    sourceOnlyGuard: 'npm run test:orders-source-only',
    mockGate: 'npm run ci:commerce-provider-smoke',
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    workflow: '.github/workflows/commerce-provider-certification.yml',
    requiredInputFamily: 'payment, tax, shipping',
  },
]) {
  const entry = normalJson.partialGateMap.find((item) => item.row === row);
  assert(entry, `Doctor Partial-to-gate map missing ${row}.`);
  assert(entry.gate === gate, `Doctor Partial-to-gate map for ${row} should use ${gate}.`);
  assert(entry.preflight === preflight, `Doctor Partial-to-gate map for ${row} should use ${preflight}.`);
  assert(entry.aggregatePreflight === 'npm run test:partial-gate-preflights', `Doctor Partial-to-gate map for ${row} should expose the aggregate Partial preflight.`);
  assert(entry.adminSourceGuard === 'npm run test:admin-contract-source', `Doctor Partial-to-gate map for ${row} should expose the admin source guard.`);
  assert(entry.sourceOnlyGuard === sourceOnlyGuard, `Doctor Partial-to-gate map for ${row} should expose ${sourceOnlyGuard}.`);
  assert(entry.workflow === workflow, `Doctor Partial-to-gate map for ${row} should use ${workflow}.`);
  if (mockGate) {
    assert(entry.mockGate === mockGate, `Doctor Partial-to-gate map for ${row} should use ${mockGate}.`);
  }
  if (doctorRequiredEnv) {
    assert(entry.doctorRequiredEnv === doctorRequiredEnv, `Doctor Partial-to-gate map for ${row} should document ${doctorRequiredEnv}.`);
  }
  assert(
    typeof entry.requiredInputFamily === 'string' && entry.requiredInputFamily.includes(requiredInputFamily),
    `Doctor Partial-to-gate map for ${row} should document ${requiredInputFamily} input requirements.`,
  );
  if (row === '/settings' || row === 'Settings admin APIs') {
    assert(
      entry.artifactPathEnv === 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT' &&
        entry.artifactRequiredEnv.includes('BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1') &&
        entry.artifactSchemaVersion === 'backy.settings-provider-certification-artifact.v1',
      `Doctor Partial-to-gate map for ${row} should document Settings artifact verification inputs.`,
    );
  } else {
    assert(
      entry.artifactPathEnv === 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT' &&
        entry.artifactRequiredEnv.includes('BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1') &&
        entry.artifactSchemaVersion === 'backy.commerce-provider-certification-artifact.v1',
      `Doctor Partial-to-gate map for ${row} should document Commerce artifact verification inputs.`,
    );
  }
}
assert(
  normalJson.certificationArtifacts?.settings?.configured === false &&
    normalJson.certificationArtifacts?.settings?.ready === false &&
    normalJson.certificationArtifacts?.commerce?.configured === false &&
    normalJson.certificationArtifacts?.commerce?.ready === false,
  'Doctor default mode should expose optional certification artifact verification state without requiring artifacts.',
);
assert(
  Array.isArray(normalJson.certifiedGates) && normalJson.certifiedGates.length === 2,
  'Doctor default mode should expose certified database gates separately from current Partial rows.',
);
for (const { row, gate, preflight, disposableGuard, workflow } of [
  {
    row: '/forms',
    gate: 'npm run ci:forms-postgres',
    preflight: 'npm run test:forms-postgres-preflight-contract',
    disposableGuard: 'npm run test:forms-postgres-disposable-guard',
    workflow: '.github/workflows/forms-postgres-contract.yml',
  },
  {
    row: 'Frontend manifest/OpenAPI/SDK APIs',
    gate: 'npm run ci:sdk-postgres-smoke',
    preflight: 'npm run test:sdk-postgres-preflight-contract',
    disposableGuard: 'npm run test:sdk-postgres-disposable-guard',
    workflow: '.github/workflows/sdk-postgres-smoke.yml',
  },
]) {
  const entry = normalJson.certifiedGates.find((item) => item.row === row);
  assert(entry, `Doctor certified gate map missing ${row}.`);
  assert(entry.gate === gate, `Doctor certified gate map for ${row} should use ${gate}.`);
  assert(entry.preflight === preflight, `Doctor certified gate map for ${row} should use ${preflight}.`);
  assert(entry.disposableGuard === disposableGuard, `Doctor certified gate map for ${row} should use ${disposableGuard}.`);
  assert(entry.workflow === workflow, `Doctor certified gate map for ${row} should use ${workflow}.`);
  assert(entry.status === 'certified-regression', `Doctor certified gate map for ${row} should be marked as certified regression.`);
  assert(entry.certifiedOn === '2026-05-21', `Doctor certified gate map for ${row} should carry the certification date.`);
}

const missingCertificationArtifacts = await runDoctor({
  BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingCertificationArtifacts.code === 1,
  `Doctor artifact-required mode should exit 1 without artifact paths, got ${missingCertificationArtifacts.code}.`,
);
const missingCertificationArtifactsJson = parseJson(missingCertificationArtifacts, 'missing certification artifacts doctor');
assert(missingCertificationArtifactsJson.ok === false, 'Doctor artifact-required mode should report ok=false.');
assert(
  missingCertificationArtifactsJson.failures.includes('Settings certification artifact') &&
    missingCertificationArtifactsJson.failures.includes('Commerce certification artifact'),
  `Doctor artifact-required mode should report missing Settings and Commerce artifacts. Actual failures: ${JSON.stringify(missingCertificationArtifactsJson.failures)}`,
);
assert(
  missingCertificationArtifactsJson.partialClosureReadiness?.ready === false &&
    missingCertificationArtifactsJson.partialClosureReadiness?.status === 'external-artifacts-required' &&
    missingCertificationArtifactsJson.partialClosureReadiness?.readyCount === 0 &&
    missingCertificationArtifactsJson.partialClosureReadiness?.partialCount === 4 &&
    missingCertificationArtifactsJson.partialClosureReadiness?.rows.every((row) => row.status === 'partial'),
  'Doctor artifact-required mode should keep all four Partial closure rows unready when artifacts are missing.',
);
assertDoctorAuditModes(missingCertificationArtifactsJson, false, 'Doctor artifact-required missing-artifact mode');

const validCertificationArtifacts = await runDoctor({
  BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH: settingsArtifactPath,
  BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH: commerceArtifactPath,
});
assert(
  validCertificationArtifacts.code === 0,
  `Doctor artifact-required mode should accept valid redacted artifacts, got ${validCertificationArtifacts.code}.`,
);
const validCertificationArtifactsJson = parseJson(validCertificationArtifacts, 'valid certification artifacts doctor');
assert(validCertificationArtifactsJson.ok === true, 'Doctor valid artifact mode should report ok=true.');
assert(
  validCertificationArtifactsJson.partialClosureReadiness?.ready === true &&
    validCertificationArtifactsJson.partialClosureReadiness?.status === 'artifact-accepted' &&
    validCertificationArtifactsJson.partialClosureReadiness?.readyCount === 4 &&
    validCertificationArtifactsJson.partialClosureReadiness?.partialCount === 0 &&
    validCertificationArtifactsJson.partialClosureReadiness?.rows.every((row) => row.ready === true && row.status === 'ready' && row.nextAction.includes('Archive')) &&
    validCertificationArtifactsJson.partialClosureReadiness?.rows.filter((row) => row.artifactKey === 'settings').length === 2 &&
    validCertificationArtifactsJson.partialClosureReadiness?.rows.filter((row) => row.artifactKey === 'commerce').length === 2,
  'Doctor valid artifact mode should mark all four remaining Partial closure rows ready.',
);
assertDoctorAuditModes(validCertificationArtifactsJson, true, 'Doctor valid artifact mode');
assert(
  validCertificationArtifactsJson.certificationArtifacts.settings.ready === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.schemaReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.certifiedAtReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.artifactFreshReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.artifactMaxAgeHours === 168 &&
    validCertificationArtifactsJson.certificationArtifacts.settings.settingsInfrastructureEvidenceReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.settingsRequestedGroupEvidenceReady === true &&
    JSON.stringify(validCertificationArtifactsJson.certificationArtifacts.settings.requestedSettingsResultKeys) === JSON.stringify(['storage', 'notification', 'publicApiCors']) &&
    validCertificationArtifactsJson.certificationArtifacts.settings.certifiedSettingsGroups.includes('infrastructure') &&
    validCertificationArtifactsJson.certificationArtifacts.settings.noSecretBoundaryReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.noRawSecretValuesReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.noForbiddenArtifactFieldsReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.settingsApiHandoffSchemaReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.settingsApiHandoffReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.settingsApiHandoffSiteTargetReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.settingsApiHandoffTargetSiteId === 'site-demo' &&
    validCertificationArtifactsJson.certificationArtifacts.settings.siteSettingsApiHandoffReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.siteSettingsApiHandoffSiteId === 'site-demo' &&
    validCertificationArtifactsJson.certificationArtifacts.settings.settingsApiHandoffSettingsSiteSelectorEnv === 'BACKY_SETTINGS_CERTIFY_SITE_ID' &&
    validCertificationArtifactsJson.certificationArtifacts.settings.settingsApiHandoffCommerceSiteSelectorEnv === 'BACKY_COMMERCE_CERTIFY_SITE_ID' &&
    validCertificationArtifactsJson.certificationArtifacts.settings.settingsScenarioEvidenceReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.settingsEvidencePacketReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.settings.settingsCompletionStatusReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.ready === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.schemaReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.certifiedAtReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.artifactFreshReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.artifactMaxAgeHours === 168 &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.commerceRequestedGroupEvidenceReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.commerceRuntimeEvidenceReady === true &&
    JSON.stringify(validCertificationArtifactsJson.certificationArtifacts.commerce.requestedCommerceGroups) === JSON.stringify(['payment', 'tax', 'shipping']) &&
    JSON.stringify(validCertificationArtifactsJson.certificationArtifacts.commerce.certifiedCommerceGroups) === JSON.stringify(['payment', 'tax', 'shipping']) &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.noSecretBoundaryReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.noRawSecretValuesReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.noForbiddenArtifactFieldsReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.commerceArtifactSiteTargetReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.commerceArtifactTargetSiteId === 'site-demo' &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.commerceArtifactSiteSelectorEnvReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.commerceArtifactSiteSelectorEnv === 'BACKY_COMMERCE_CERTIFY_SITE_ID' &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.apiHandoffReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.publicCommerceApiHandoffReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.productApiHandoffSchemaReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.productApiHandoffReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.productApiHandoffSiteTargetReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.productApiHandoffTargetSiteId === 'site-demo' &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.orderApiHandoffSchemaReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.orderApiHandoffReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.orderApiHandoffSiteTargetReady === true &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.orderApiHandoffTargetSiteId === 'site-demo' &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.apiHandoffSiteId === 'site-demo' &&
    validCertificationArtifactsJson.certificationArtifacts.commerce.commerceApiHandoffSiteSelectorEnv === 'BACKY_COMMERCE_CERTIFY_SITE_ID',
  'Doctor valid artifact mode should expose schema, no-secret, selected-site target, and API-handoff readiness for both artifacts.',
);

const validSettingsOnlyArtifact = await runDoctor({
  BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH: settingsArtifactPath,
});
assert(
  validSettingsOnlyArtifact.code === 0,
  `Doctor Settings-only artifact-required mode should accept a valid Settings artifact without requiring Commerce, got ${validSettingsOnlyArtifact.code}.`,
);
const validSettingsOnlyArtifactJson = parseJson(validSettingsOnlyArtifact, 'valid settings-only artifact doctor');
assert(
  validSettingsOnlyArtifactJson.ok === true &&
    validSettingsOnlyArtifactJson.certificationArtifacts.settings.ready === true &&
    validSettingsOnlyArtifactJson.certificationArtifacts.commerce.required === false &&
    validSettingsOnlyArtifactJson.partialClosureReadiness?.ready === false &&
    validSettingsOnlyArtifactJson.partialClosureReadiness?.readyCount === 2 &&
    validSettingsOnlyArtifactJson.partialClosureReadiness?.partialCount === 2 &&
    validSettingsOnlyArtifactJson.partialClosureReadiness?.rows.filter((row) => row.artifactKey === 'settings').every((row) => row.ready === true && row.status === 'ready') &&
    validSettingsOnlyArtifactJson.partialClosureReadiness?.rows.filter((row) => row.artifactKey === 'commerce').every((row) => row.ready === false && row.status === 'partial'),
  `Doctor Settings-only artifact mode should advance only the Settings closure rows: ${JSON.stringify(validSettingsOnlyArtifactJson.partialClosureReadiness)}`,
);
assertDoctorAuditModes(validSettingsOnlyArtifactJson, false, 'Doctor Settings-only artifact mode');

const validCommerceOnlyArtifact = await runDoctor({
  BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH: commerceArtifactPath,
});
assert(
  validCommerceOnlyArtifact.code === 0,
  `Doctor Commerce-only artifact-required mode should accept a valid Commerce artifact without requiring Settings, got ${validCommerceOnlyArtifact.code}.`,
);
const validCommerceOnlyArtifactJson = parseJson(validCommerceOnlyArtifact, 'valid commerce-only artifact doctor');
assert(
  validCommerceOnlyArtifactJson.ok === true &&
    validCommerceOnlyArtifactJson.certificationArtifacts.commerce.ready === true &&
    validCommerceOnlyArtifactJson.certificationArtifacts.settings.required === false &&
    validCommerceOnlyArtifactJson.partialClosureReadiness?.ready === false &&
    validCommerceOnlyArtifactJson.partialClosureReadiness?.readyCount === 2 &&
    validCommerceOnlyArtifactJson.partialClosureReadiness?.partialCount === 2 &&
    validCommerceOnlyArtifactJson.partialClosureReadiness?.rows.filter((row) => row.artifactKey === 'commerce').every((row) => row.ready === true && row.status === 'ready') &&
    validCommerceOnlyArtifactJson.partialClosureReadiness?.rows.filter((row) => row.artifactKey === 'settings').every((row) => row.ready === false && row.status === 'partial'),
  `Doctor Commerce-only artifact mode should advance only the Commerce closure rows: ${JSON.stringify(validCommerceOnlyArtifactJson.partialClosureReadiness)}`,
);
assertDoctorAuditModes(validCommerceOnlyArtifactJson, false, 'Doctor Commerce-only artifact mode');

const expiredSettingsArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH: expiredSettingsArtifactPath,
  BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS: '1',
});
assert(
  expiredSettingsArtifact.code === 1,
  `Doctor should reject an expired Settings certification artifact, got ${expiredSettingsArtifact.code}.`,
);
const expiredSettingsArtifactJson = parseJson(expiredSettingsArtifact, 'expired settings certification artifact doctor');
assert(
  expiredSettingsArtifactJson.failures.includes('Settings certification artifact') &&
    expiredSettingsArtifactJson.certificationArtifacts.settings.certifiedAtReady === true &&
    expiredSettingsArtifactJson.certificationArtifacts.settings.artifactFreshReady === false &&
    expiredSettingsArtifactJson.certificationArtifacts.settings.artifactMaxAgeHours === 1 &&
    expiredSettingsArtifactJson.certificationArtifacts.settings.settingsApiHandoffReady === true,
  'Doctor should reject expired Settings artifacts without hiding valid API-handoff evidence.',
);

const expiredCommerceArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH: expiredCommerceArtifactPath,
  BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS: '1',
});
assert(
  expiredCommerceArtifact.code === 1,
  `Doctor should reject an expired Commerce certification artifact, got ${expiredCommerceArtifact.code}.`,
);
const expiredCommerceArtifactJson = parseJson(expiredCommerceArtifact, 'expired commerce certification artifact doctor');
assert(
  expiredCommerceArtifactJson.failures.includes('Commerce certification artifact') &&
    expiredCommerceArtifactJson.certificationArtifacts.commerce.certifiedAtReady === true &&
    expiredCommerceArtifactJson.certificationArtifacts.commerce.artifactFreshReady === false &&
    expiredCommerceArtifactJson.certificationArtifacts.commerce.artifactMaxAgeHours === 1 &&
    expiredCommerceArtifactJson.certificationArtifacts.commerce.apiHandoffReady === true,
  'Doctor should reject expired Commerce artifacts without hiding valid API-handoff evidence.',
);

const missingResultSettingsArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH: missingResultSettingsArtifactPath,
});
assert(
  missingResultSettingsArtifact.code === 1,
  `Doctor should reject a Settings artifact that lacks requested group result evidence, got ${missingResultSettingsArtifact.code}.`,
);
const missingResultSettingsArtifactJson = parseJson(missingResultSettingsArtifact, 'missing-result settings certification artifact doctor');
assert(
  missingResultSettingsArtifactJson.failures.includes('Settings certification artifact') &&
    missingResultSettingsArtifactJson.certificationArtifacts.settings.settingsApiHandoffReady === true &&
    missingResultSettingsArtifactJson.certificationArtifacts.settings.settingsInfrastructureEvidenceReady === true &&
    missingResultSettingsArtifactJson.certificationArtifacts.settings.settingsRequestedGroupEvidenceReady === false &&
    missingResultSettingsArtifactJson.certificationArtifacts.settings.requestedSettingsResultKeys.includes('publicApiCors'),
  'Doctor should reject Settings artifacts that omit requested provider result evidence while preserving API-handoff diagnostics.',
);

const missingResultCommerceArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH: missingResultCommerceArtifactPath,
});
assert(
  missingResultCommerceArtifact.code === 1,
  `Doctor should reject a Commerce artifact that lacks requested group readiness evidence, got ${missingResultCommerceArtifact.code}.`,
);
const missingResultCommerceArtifactJson = parseJson(missingResultCommerceArtifact, 'missing-result commerce certification artifact doctor');
assert(
  missingResultCommerceArtifactJson.failures.includes('Commerce certification artifact') &&
    missingResultCommerceArtifactJson.certificationArtifacts.commerce.apiHandoffReady === true &&
    missingResultCommerceArtifactJson.certificationArtifacts.commerce.commerceRuntimeEvidenceReady === true &&
    missingResultCommerceArtifactJson.certificationArtifacts.commerce.commerceRequestedGroupEvidenceReady === false &&
    missingResultCommerceArtifactJson.certificationArtifacts.commerce.requestedCommerceGroups.includes('tax'),
  'Doctor should reject Commerce artifacts that omit requested provider readiness evidence while preserving API-handoff diagnostics.',
);

const staleSettingsArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH: staleSettingsArtifactPath,
});
assert(
  staleSettingsArtifact.code === 1,
  `Doctor should reject a Settings artifact that lacks admin API handoff evidence, got ${staleSettingsArtifact.code}.`,
);
const staleSettingsArtifactJson = parseJson(staleSettingsArtifact, 'stale settings certification artifact doctor');
assert(
    staleSettingsArtifactJson.failures.includes('Settings certification artifact') &&
    staleSettingsArtifactJson.certificationArtifacts.settings.settingsApiHandoffReady === false &&
    staleSettingsArtifactJson.certificationArtifacts.settings.siteSettingsApiHandoffReady === false &&
    staleSettingsArtifactJson.certificationArtifacts.settings.settingsScenarioEvidenceReady === false &&
    staleSettingsArtifactJson.certificationArtifacts.settings.settingsEvidencePacketReady === false,
  'Doctor should report missing Settings admin API handoff evidence.',
);

const untargetedSettingsArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH: untargetedSettingsArtifactPath,
});
assert(
  untargetedSettingsArtifact.code === 1,
  `Doctor should reject a Settings artifact whose operator evidence packet is not site-targeted, got ${untargetedSettingsArtifact.code}.`,
);
const untargetedSettingsArtifactJson = parseJson(untargetedSettingsArtifact, 'untargeted settings certification artifact doctor');
assert(
  untargetedSettingsArtifactJson.failures.includes('Settings certification artifact') &&
    untargetedSettingsArtifactJson.certificationArtifacts.settings.settingsApiHandoffSchemaReady === true &&
    untargetedSettingsArtifactJson.certificationArtifacts.settings.siteSettingsApiHandoffReady === true &&
    untargetedSettingsArtifactJson.certificationArtifacts.settings.settingsApiHandoffSiteTargetReady === false &&
    untargetedSettingsArtifactJson.certificationArtifacts.settings.settingsApiHandoffReady === false,
  'Doctor should reject Settings artifacts when schema handoffs exist but lack BACKY_SETTINGS_CERTIFY_SITE_ID/BACKY_COMMERCE_CERTIFY_SITE_ID target proof.',
);

const leakedSettingsArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH: leakedSettingsArtifactPath,
});
assert(
  leakedSettingsArtifact.code === 1,
  `Doctor should reject a Settings artifact that contains raw secret-like values, got ${leakedSettingsArtifact.code}.`,
);
const leakedSettingsArtifactJson = parseJson(leakedSettingsArtifact, 'leaked settings certification artifact doctor');
assert(
  leakedSettingsArtifactJson.failures.includes('Settings certification artifact') &&
    leakedSettingsArtifactJson.certificationArtifacts.settings.noRawSecretValuesReady === false &&
    leakedSettingsArtifactJson.certificationArtifacts.settings.settingsApiHandoffReady === true &&
    leakedSettingsArtifactJson.certificationArtifacts.settings.siteSettingsApiHandoffReady === true,
  'Doctor should report raw secret-like value failures without hiding that the Settings API handoff itself was present.',
);

const forbiddenFieldSettingsArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH: forbiddenFieldSettingsArtifactPath,
});
assert(
  forbiddenFieldSettingsArtifact.code === 1,
  `Doctor should reject a Settings artifact that contains forbidden sensitive artifact fields, got ${forbiddenFieldSettingsArtifact.code}.`,
);
const forbiddenFieldSettingsArtifactJson = parseJson(forbiddenFieldSettingsArtifact, 'forbidden-field settings certification artifact doctor');
assert(
  forbiddenFieldSettingsArtifactJson.failures.includes('Settings certification artifact') &&
    forbiddenFieldSettingsArtifactJson.certificationArtifacts.settings.noRawSecretValuesReady === true &&
    forbiddenFieldSettingsArtifactJson.certificationArtifacts.settings.noForbiddenArtifactFieldsReady === false &&
    forbiddenFieldSettingsArtifactJson.certificationArtifacts.settings.forbiddenArtifactFields.includes('target.externalBaseUrl') &&
    forbiddenFieldSettingsArtifactJson.certificationArtifacts.settings.forbiddenArtifactFields.includes('results.webhookBody') &&
    forbiddenFieldSettingsArtifactJson.certificationArtifacts.settings.forbiddenArtifactFields.includes('results.providerSummary') &&
    forbiddenFieldSettingsArtifactJson.certificationArtifacts.settings.settingsApiHandoffReady === true,
  'Doctor should reject forbidden Settings artifact field names without requiring raw secret-looking values.',
);

const staleCommerceArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH: staleCommerceArtifactPath,
});
assert(
  staleCommerceArtifact.code === 1,
  `Doctor should reject a Commerce artifact that lacks product/order API handoff evidence, got ${staleCommerceArtifact.code}.`,
);
const staleCommerceArtifactJson = parseJson(staleCommerceArtifact, 'stale commerce certification artifact doctor');
assert(
  staleCommerceArtifactJson.failures.includes('Commerce certification artifact') &&
    staleCommerceArtifactJson.certificationArtifacts.commerce.apiHandoffReady === false &&
    staleCommerceArtifactJson.certificationArtifacts.commerce.commerceArtifactSiteTargetReady === false &&
    staleCommerceArtifactJson.certificationArtifacts.commerce.publicCommerceApiHandoffReady === false &&
    staleCommerceArtifactJson.certificationArtifacts.commerce.productApiHandoffReady === false &&
    staleCommerceArtifactJson.certificationArtifacts.commerce.orderApiHandoffReady === false,
  'Doctor should report missing Commerce product/order API-handoff evidence.',
);

const artifactTargetMissingCommerceArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH: artifactTargetMissingCommerceArtifactPath,
});
assert(
  artifactTargetMissingCommerceArtifact.code === 1,
  `Doctor should reject a Commerce artifact that lacks top-level selected-site target proof, got ${artifactTargetMissingCommerceArtifact.code}.`,
);
const artifactTargetMissingCommerceArtifactJson = parseJson(
  artifactTargetMissingCommerceArtifact,
  'missing commerce certification artifact target doctor',
);
assert(
  artifactTargetMissingCommerceArtifactJson.failures.includes('Commerce certification artifact') &&
    artifactTargetMissingCommerceArtifactJson.certificationArtifacts.commerce.apiHandoffReady === true &&
    artifactTargetMissingCommerceArtifactJson.certificationArtifacts.commerce.commerceArtifactSiteTargetReady === false &&
    artifactTargetMissingCommerceArtifactJson.certificationArtifacts.commerce.commerceArtifactTargetSiteId === null &&
    artifactTargetMissingCommerceArtifactJson.certificationArtifacts.commerce.commerceArtifactSiteSelectorEnvReady === false &&
    artifactTargetMissingCommerceArtifactJson.certificationArtifacts.commerce.productApiHandoffSiteTargetReady === true &&
    artifactTargetMissingCommerceArtifactJson.certificationArtifacts.commerce.orderApiHandoffSiteTargetReady === true,
  'Doctor should reject Commerce artifacts whose nested handoffs are site-targeted but whose artifact boundary omits BACKY_COMMERCE_CERTIFY_SITE_ID proof.',
);

const artifactTargetMismatchCommerceArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH: artifactTargetMismatchCommerceArtifactPath,
});
assert(
  artifactTargetMismatchCommerceArtifact.code === 1,
  `Doctor should reject a Commerce artifact whose top-level selected-site target does not match apiHandoffs.siteId, got ${artifactTargetMismatchCommerceArtifact.code}.`,
);
const artifactTargetMismatchCommerceArtifactJson = parseJson(
  artifactTargetMismatchCommerceArtifact,
  'mismatched commerce certification artifact target doctor',
);
assert(
  artifactTargetMismatchCommerceArtifactJson.failures.includes('Commerce certification artifact') &&
    artifactTargetMismatchCommerceArtifactJson.certificationArtifacts.commerce.apiHandoffReady === true &&
    artifactTargetMismatchCommerceArtifactJson.certificationArtifacts.commerce.apiHandoffSiteId === 'site-demo' &&
    artifactTargetMismatchCommerceArtifactJson.certificationArtifacts.commerce.commerceArtifactSiteTargetReady === false &&
    artifactTargetMismatchCommerceArtifactJson.certificationArtifacts.commerce.commerceArtifactTargetSiteId === 'site-other' &&
    artifactTargetMismatchCommerceArtifactJson.certificationArtifacts.commerce.commerceArtifactSiteSelectorEnvReady === true &&
    artifactTargetMismatchCommerceArtifactJson.certificationArtifacts.commerce.productApiHandoffSiteTargetReady === true &&
    artifactTargetMismatchCommerceArtifactJson.certificationArtifacts.commerce.orderApiHandoffSiteTargetReady === true,
  'Doctor should reject Commerce artifacts whose artifact target site disagrees with otherwise valid selected-site API handoffs.',
);

const untargetedCommerceArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH: untargetedCommerceArtifactPath,
});
assert(
  untargetedCommerceArtifact.code === 1,
  `Doctor should reject a Commerce artifact whose product/order evidence packets are not site-targeted, got ${untargetedCommerceArtifact.code}.`,
);
const untargetedCommerceArtifactJson = parseJson(untargetedCommerceArtifact, 'untargeted commerce certification artifact doctor');
assert(
  untargetedCommerceArtifactJson.failures.includes('Commerce certification artifact') &&
    untargetedCommerceArtifactJson.certificationArtifacts.commerce.publicCommerceApiHandoffReady === true &&
    untargetedCommerceArtifactJson.certificationArtifacts.commerce.productApiHandoffSchemaReady === true &&
    untargetedCommerceArtifactJson.certificationArtifacts.commerce.orderApiHandoffSchemaReady === true &&
    untargetedCommerceArtifactJson.certificationArtifacts.commerce.productApiHandoffSiteTargetReady === false &&
    untargetedCommerceArtifactJson.certificationArtifacts.commerce.orderApiHandoffSiteTargetReady === false &&
    untargetedCommerceArtifactJson.certificationArtifacts.commerce.productApiHandoffReady === false &&
    untargetedCommerceArtifactJson.certificationArtifacts.commerce.orderApiHandoffReady === false,
  'Doctor should reject Commerce artifacts when Products/Orders schema handoffs exist but lack BACKY_COMMERCE_CERTIFY_SITE_ID target proof.',
);

const invalidCertificationArtifact = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH: commerceArtifactPath,
});
assert(
  invalidCertificationArtifact.code === 1,
  `Doctor should reject a configured artifact with the wrong schema, got ${invalidCertificationArtifact.code}.`,
);
const invalidCertificationArtifactJson = parseJson(invalidCertificationArtifact, 'invalid certification artifact doctor');
assert(
  invalidCertificationArtifactJson.failures.includes('Settings certification artifact') &&
    invalidCertificationArtifactJson.certificationArtifacts.settings.contractReady === false,
  'Doctor should report configured artifact schema failures in the Settings artifact verifier.',
);

const missingDatabase = await runDoctor({
  BACKY_RELEASE_CERTIFY_DATABASE: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(missingDatabase.code === 1, `Doctor required database mode should exit 1 without DB URL, got ${missingDatabase.code}.`);
const missingDatabaseJson = parseJson(missingDatabase, 'missing database doctor');
assert(missingDatabaseJson.ok === false, 'Doctor required database mode should report ok=false.');
assert(missingDatabaseJson.failures.includes('database URL'), 'Doctor required database mode should report database URL failure.');
assert(
  missingDatabaseJson.failures.includes('database disposable confirmation'),
  'Doctor required database mode should report disposable confirmation failure.',
);
assert(
  missingDatabaseJson.database.disposableConfirmed === false &&
    missingDatabaseJson.database.readyForCertification === false &&
    missingDatabaseJson.database.missingConfirmation.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true'),
  'Doctor required database mode should expose missing disposable confirmation evidence.',
);

const invalidDatabaseUrl = await runDoctor({
  BACKY_RELEASE_CERTIFY_DATABASE: '1',
  BACKY_DATABASE_URL: 'not-a-postgres-url',
  BACKY_DATABASE_DISPOSABLE_CONFIRMED: 'true',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(invalidDatabaseUrl.code === 1, `Doctor required database mode should exit 1 with invalid DB URL, got ${invalidDatabaseUrl.code}.`);
const invalidDatabaseUrlJson = parseJson(invalidDatabaseUrl, 'invalid database URL doctor');
assert(invalidDatabaseUrlJson.ok === false, 'Doctor invalid database URL mode should report ok=false.');
assert(
  invalidDatabaseUrlJson.failures.includes('database URL format'),
  'Doctor required database mode should report database URL format failure.',
);
assert(
  invalidDatabaseUrlJson.database.urlValid === false,
  'Doctor required database mode should expose urlValid=false for malformed database URLs.',
);

const missingDatabaseConfirmation = await runDoctor({
  BACKY_RELEASE_CERTIFY_DATABASE: '1',
  BACKY_DATABASE_URL: 'postgresql://user:pass@example.test:5432/backy_release_doctor',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingDatabaseConfirmation.code === 1,
  `Doctor required database mode should exit 1 without disposable confirmation, got ${missingDatabaseConfirmation.code}.`,
);
const missingDatabaseConfirmationJson = parseJson(missingDatabaseConfirmation, 'missing database confirmation doctor');
assert(missingDatabaseConfirmationJson.ok === false, 'Doctor missing confirmation mode should report ok=false.');
assert(
  !missingDatabaseConfirmationJson.failures.includes('database URL') &&
    !missingDatabaseConfirmationJson.failures.includes('database URL format') &&
    missingDatabaseConfirmationJson.failures.includes('database disposable confirmation'),
  `Doctor missing confirmation mode should report only the disposable confirmation database failure. Actual failures: ${JSON.stringify(missingDatabaseConfirmationJson.failures)}`,
);
assert(
  missingDatabaseConfirmationJson.database.ready === true &&
    missingDatabaseConfirmationJson.database.urlValid === true &&
    missingDatabaseConfirmationJson.database.disposableConfirmed === false &&
    missingDatabaseConfirmationJson.database.readyForCertification === false,
  'Doctor missing confirmation mode should expose URL readiness while blocking certification readiness.',
);

const confirmedDatabase = await runDoctor({
  BACKY_RELEASE_CERTIFY_DATABASE: '1',
  BACKY_DATABASE_URL: 'postgresql://user:pass@example.test:5432/backy_release_doctor',
  BACKY_DATABASE_DISPOSABLE_CONFIRMED: 'true',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(confirmedDatabase.code === 0, `Doctor required database mode should accept a valid confirmed disposable database target, got ${confirmedDatabase.code}.`);
const confirmedDatabaseJson = parseJson(confirmedDatabase, 'confirmed database doctor');
assert(confirmedDatabaseJson.ok === true, 'Doctor confirmed database mode should report ok=true.');
assert(
  confirmedDatabaseJson.database.disposableConfirmed === true &&
    confirmedDatabaseJson.database.readyForCertification === true &&
    confirmedDatabaseJson.database.missingConfirmation.length === 0,
  'Doctor confirmed database mode should expose disposable confirmation readiness.',
);

const missingSettingsGroup = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(missingSettingsGroup.code === 1, `Doctor required Settings mode should exit 1 without provider groups, got ${missingSettingsGroup.code}.`);
const missingSettingsGroupJson = parseJson(missingSettingsGroup, 'missing settings group doctor');
assert(missingSettingsGroupJson.ok === false, 'Doctor required Settings mode should report ok=false.');
assert(
  missingSettingsGroupJson.failures.includes('settings provider group selection'),
  'Doctor required Settings mode should report settings provider group selection failure.',
);

const missingCommerceGroup = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(missingCommerceGroup.code === 1, `Doctor required Commerce mode should exit 1 without provider groups, got ${missingCommerceGroup.code}.`);
const missingCommerceGroupJson = parseJson(missingCommerceGroup, 'missing commerce group doctor');
assert(missingCommerceGroupJson.ok === false, 'Doctor required Commerce mode should report ok=false.');
assert(
  missingCommerceGroupJson.failures.includes('commerce provider group selection'),
  'Doctor required Commerce mode should report commerce provider group selection failure.',
);

const missingSettingsExternalAdminKey = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFICATION_BASE_URL: 'https://backy-settings.example.test',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingSettingsExternalAdminKey.code === 1,
  `Doctor external Settings mode should exit 1 without admin key, got ${missingSettingsExternalAdminKey.code}.`,
);
const missingSettingsExternalAdminKeyJson = parseJson(missingSettingsExternalAdminKey, 'missing Settings external admin key doctor');
assert(missingSettingsExternalAdminKeyJson.ok === false, 'Doctor external Settings mode should report ok=false.');
assert(
  missingSettingsExternalAdminKeyJson.failures.includes('Settings external admin key'),
  'Doctor external Settings mode should report Settings external admin key failure.',
);

const settingsExternalAdminAliasReady = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFICATION_BASE_URL: 'https://backy-settings.example.test',
  BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY: 'settings-external-admin-key',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  settingsExternalAdminAliasReady.code === 0,
  `Doctor external Settings mode should accept BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY, got ${settingsExternalAdminAliasReady.code}.`,
);

const invalidSettingsExternalBaseUrl = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFICATION_BASE_URL: 'backy-settings.example.test',
  BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY: 'settings-external-admin-key',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  invalidSettingsExternalBaseUrl.code === 1,
  `Doctor external Settings mode should exit 1 with invalid base URL, got ${invalidSettingsExternalBaseUrl.code}.`,
);
const invalidSettingsExternalBaseUrlJson = parseJson(invalidSettingsExternalBaseUrl, 'invalid Settings external base URL doctor');
assert(invalidSettingsExternalBaseUrlJson.ok === false, 'Doctor invalid external Settings URL mode should report ok=false.');
assert(
  invalidSettingsExternalBaseUrlJson.failures.includes('Settings external base URL'),
  'Doctor invalid external Settings URL mode should report Settings external base URL failure.',
);

const missingCommerceExternalAdminKey = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_TAX: '1',
  BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'http',
  BACKY_COMMERCE_CERTIFICATION_BASE_URL: 'https://backy-commerce.example.test',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingCommerceExternalAdminKey.code === 1,
  `Doctor external Commerce mode should exit 1 without admin key, got ${missingCommerceExternalAdminKey.code}.`,
);
const missingCommerceExternalAdminKeyJson = parseJson(missingCommerceExternalAdminKey, 'missing Commerce external admin key doctor');
assert(missingCommerceExternalAdminKeyJson.ok === false, 'Doctor external Commerce mode should report ok=false.');
assert(
  missingCommerceExternalAdminKeyJson.failures.includes('Commerce external admin key'),
  'Doctor external Commerce mode should report Commerce external admin key failure.',
);

const commerceExternalAdminAliasReady = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_TAX: '1',
  BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'http',
  BACKY_COMMERCE_CERTIFICATION_BASE_URL: 'https://backy-commerce.example.test',
  BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY: 'commerce-external-admin-key',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  commerceExternalAdminAliasReady.code === 0,
  `Doctor external Commerce mode should accept BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY, got ${commerceExternalAdminAliasReady.code}.`,
);

const invalidCommerceExternalBaseUrl = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_TAX: '1',
  BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'http',
  BACKY_COMMERCE_CERTIFICATION_BASE_URL: 'backy-commerce.example.test',
  BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY: 'commerce-external-admin-key',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  invalidCommerceExternalBaseUrl.code === 1,
  `Doctor external Commerce mode should exit 1 with invalid base URL, got ${invalidCommerceExternalBaseUrl.code}.`,
);
const invalidCommerceExternalBaseUrlJson = parseJson(invalidCommerceExternalBaseUrl, 'invalid Commerce external base URL doctor');
assert(invalidCommerceExternalBaseUrlJson.ok === false, 'Doctor invalid external Commerce URL mode should report ok=false.');
assert(
  invalidCommerceExternalBaseUrlJson.failures.includes('Commerce external base URL'),
  'Doctor invalid external Commerce URL mode should report Commerce external base URL failure.',
);

await assertMissingProvider({
  label: 'auto Razorpay payment partial credentials',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
    BACKY_RAZORPAY_KEY_ID: 'rzp_key_only',
  },
  failure: 'auto payment credentials',
});

const completeAutoRazorpayPayment = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
  RAZORPAY_KEY_ID: 'rzp_alias_key',
  RAZORPAY_KEY_SECRET: 'rzp_alias_secret',
});
assert(
  completeAutoRazorpayPayment.code === 0,
  `Doctor auto Razorpay payment mode should accept complete alias credentials, got ${completeAutoRazorpayPayment.code}.`,
);

await assertMissingProvider({
  label: 'auto Avalara tax partial credentials',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_TAX: '1',
    BACKY_AVALARA_ACCOUNT_ID: 'avalara_account_only',
  },
  failure: 'auto tax credentials',
});

const completeAutoAvalaraTax = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_TAX: '1',
  AVALARA_ACCOUNT_ID: 'avalara_alias_account',
  AVALARA_LICENSE_KEY: 'avalara_alias_license',
  AVALARA_COMPANY_CODE: 'avalara_alias_company',
});
assert(
  completeAutoAvalaraTax.code === 0,
  `Doctor auto Avalara tax mode should accept complete alias credentials, got ${completeAutoAvalaraTax.code}.`,
);

await assertMissingProvider({
  label: 'auto discount missing credentials',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_DISCOUNT: '1',
  },
  failure: 'auto discount credentials',
});

const completeAutoDiscount = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_DISCOUNT: '1',
  COMMERCE_DISCOUNT_PROVIDER_URL: 'https://commerce-http.example.test/discount',
});
assert(
  completeAutoDiscount.code === 0,
  `Doctor auto discount mode should accept a configured HTTP discount endpoint, got ${completeAutoDiscount.code}.`,
);

await assertMissingProvider({
  label: 'auto Shopify catalog partial credentials',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_CATALOG: '1',
    BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN: 'shopify_token_only',
  },
  failure: 'auto catalog credentials',
});

const completeAutoShopifyCatalog = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_CATALOG: '1',
  SHOPIFY_ADMIN_ACCESS_TOKEN: 'shopify_alias_token',
  SHOPIFY_ADMIN_API_BASE_URL: 'https://shop.example.test/admin/api/2024-10',
});
assert(
  completeAutoShopifyCatalog.code === 0,
  `Doctor auto Shopify catalog mode should accept complete alias/base URL credentials, got ${completeAutoShopifyCatalog.code}.`,
);

const missingS3Storage = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER: 's3',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(missingS3Storage.code === 1, `Doctor S3 storage mode should exit 1 without S3 credentials, got ${missingS3Storage.code}.`);
const missingS3StorageJson = parseJson(missingS3Storage, 'missing S3 storage doctor');
assert(missingS3StorageJson.ok === false, 'Doctor S3 storage mode should report ok=false.');
assert(
  missingS3StorageJson.failures.includes('S3 storage credentials'),
  'Doctor S3 storage mode should report S3 credential failure.',
);

const s3StorageAliases = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE: '1',
  BACKY_MEDIA_STORAGE_PROVIDER: 's3',
  AWS_ACCESS_KEY_ID: 'aws_alias_access',
  AWS_SECRET_ACCESS_KEY: 'aws_alias_secret',
  BACKY_STORAGE_BUCKET: 'backy-alias-bucket',
  AWS_REGION: 'us-east-1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  s3StorageAliases.code === 0,
  `Doctor S3 storage mode should accept runtime storage aliases, got ${s3StorageAliases.code}.`,
);

const missingSupabaseStorage = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER: 'supabase',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingSupabaseStorage.code === 1,
  `Doctor Supabase storage mode should exit 1 without Supabase credentials, got ${missingSupabaseStorage.code}.`,
);
const missingSupabaseStorageJson = parseJson(missingSupabaseStorage, 'missing Supabase storage doctor');
assert(missingSupabaseStorageJson.ok === false, 'Doctor Supabase storage mode should report ok=false.');
assert(
  missingSupabaseStorageJson.failures.includes('Supabase storage credentials'),
  'Doctor Supabase storage mode should report Supabase credential failure.',
);

const supabaseStorageAliases = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER: 'supabase',
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'supabase_alias_service_role',
  BACKY_STORAGE_BUCKET: 'backy-alias-bucket',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  supabaseStorageAliases.code === 0,
  `Doctor Supabase storage mode should accept runtime storage aliases, got ${supabaseStorageAliases.code}.`,
);

const missingResendNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'resend',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingResendNotification.code === 1,
  `Doctor Resend notification mode should exit 1 without Resend credentials, got ${missingResendNotification.code}.`,
);
const missingResendNotificationJson = parseJson(missingResendNotification, 'missing Resend notification doctor');
assert(missingResendNotificationJson.ok === false, 'Doctor Resend notification mode should report ok=false.');
assert(
  missingResendNotificationJson.failures.includes('Resend notification credentials'),
  'Doctor Resend notification mode should report Resend credential failure.',
);

const missingSmtpNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'smtp',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingSmtpNotification.code === 1,
  `Doctor SMTP notification mode should exit 1 without SMTP host, got ${missingSmtpNotification.code}.`,
);
const missingSmtpNotificationJson = parseJson(missingSmtpNotification, 'missing SMTP notification doctor');
assert(
  missingSmtpNotificationJson.failures.includes('SMTP notification credentials'),
  'Doctor SMTP notification mode should report SMTP credential failure.',
);

const missingHttpNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'http-endpoint',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingHttpNotification.code === 1,
  `Doctor HTTP notification mode should exit 1 without endpoint, got ${missingHttpNotification.code}.`,
);
const missingHttpNotificationJson = parseJson(missingHttpNotification, 'missing HTTP notification doctor');
assert(
  missingHttpNotificationJson.failures.includes('HTTP notification endpoint'),
  'Doctor HTTP notification mode should report HTTP endpoint failure.',
);

const resendAliasNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'resend',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  RESEND_API_KEY: 'resend_alias_key',
});
assert(
  resendAliasNotification.code === 0,
  `Doctor Resend notification mode should accept RESEND_API_KEY alias, got ${resendAliasNotification.code}.`,
);

const smtpHostOnlyNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'smtp',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  SMTP_HOST: 'smtp.example.test',
});
assert(
  smtpHostOnlyNotification.code === 0,
  `Doctor SMTP notification mode should accept host-only SMTP runtime, got ${smtpHostOnlyNotification.code}.`,
);

const httpAliasNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'http-endpoint',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL: 'https://notify.example.test/backy',
});
assert(
  httpAliasNotification.code === 0,
  `Doctor HTTP notification mode should accept transactional webhook URL alias, got ${httpAliasNotification.code}.`,
);

const missingPublicApiCors = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingPublicApiCors.code === 1,
  `Doctor Public API/CORS mode should exit 1 without an origin, got ${missingPublicApiCors.code}.`,
);
const missingPublicApiCorsJson = parseJson(missingPublicApiCors, 'missing Public API/CORS doctor');
assert(
  missingPublicApiCorsJson.failures.includes('Public API CORS origin'),
  'Doctor Public API/CORS mode should report missing origin failure.',
);

const publicApiCorsAlias = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_CORS_ALLOWED_ORIGINS: 'https://app.example.test',
});
assert(
  publicApiCorsAlias.code === 0,
  `Doctor Public API/CORS mode should accept BACKY_CORS_ALLOWED_ORIGINS, got ${publicApiCorsAlias.code}.`,
);

const missingVercelSecrets = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingVercelSecrets.code === 1,
  `Doctor Vercel secrets mode should exit 1 without Vercel credentials, got ${missingVercelSecrets.code}.`,
);
const missingVercelSecretsJson = parseJson(missingVercelSecrets, 'missing Vercel secrets doctor');
assert(missingVercelSecretsJson.ok === false, 'Doctor Vercel secrets mode should report ok=false.');
assert(
  missingVercelSecretsJson.failures.includes('Vercel token') &&
    missingVercelSecretsJson.failures.includes('Vercel project'),
  'Doctor Vercel secrets mode should report token and project failures.',
);

const backyVercelAliases = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_VERCEL_TOKEN: 'backy_vercel_alias_token',
  BACKY_VERCEL_PROJECT_ID: 'backy-vercel-project',
  BACKY_VERCEL_TEAM_ID: 'backy-vercel-team',
});
assert(
  backyVercelAliases.code === 0,
  `Doctor Vercel secrets mode should accept BACKY_VERCEL_* aliases, got ${backyVercelAliases.code}.`,
);

const stripePayment = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
  BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'stripe',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(stripePayment.code === 1, `Doctor Stripe payment mode should exit 1 without Stripe key, got ${stripePayment.code}.`);
const stripePaymentJson = parseJson(stripePayment, 'missing Stripe payment doctor');
assert(
  stripePaymentJson.failures.includes('Stripe payment/refund credentials'),
  'Doctor Stripe payment mode should report Stripe credential failure.',
);

const razorpayPayment = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
  BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'razorpay',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(razorpayPayment.code === 1, `Doctor Razorpay payment mode should exit 1 without Razorpay keys, got ${razorpayPayment.code}.`);
const razorpayPaymentJson = parseJson(razorpayPayment, 'missing Razorpay payment doctor');
assert(
  razorpayPaymentJson.failures.includes('Razorpay payment/subscription credentials'),
  'Doctor Razorpay payment mode should report Razorpay credential failure.',
);

const razorpaySubscription = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
  BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'razorpay',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(razorpaySubscription.code === 1, `Doctor Razorpay subscription mode should exit 1 without Razorpay keys, got ${razorpaySubscription.code}.`);
const razorpaySubscriptionJson = parseJson(razorpaySubscription, 'missing Razorpay subscription doctor');
assert(
  razorpaySubscriptionJson.failures.includes('Razorpay payment/subscription credentials'),
  'Doctor Razorpay subscription mode should report Razorpay credential failure.',
);

for (const { provider, failure } of [
  { provider: 'stripe', failure: 'Stripe payment/refund credentials' },
  { provider: 'paypal', failure: 'PayPal payment/subscription credentials' },
  { provider: 'paddle', failure: 'Paddle payment/subscription credentials' },
  { provider: 'square', failure: 'Square payment/subscription credentials' },
  { provider: 'adyen', failure: 'Adyen credentials' },
  { provider: 'mollie', failure: 'Mollie payment/subscription credentials' },
]) {
  await assertMissingProvider({
    label: `${provider} subscription`,
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: provider,
    },
    failure,
  });
}

const taxJarTax = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_TAX: '1',
  BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'taxjar',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(taxJarTax.code === 1, `Doctor TaxJar tax mode should exit 1 without TaxJar key, got ${taxJarTax.code}.`);
const taxJarTaxJson = parseJson(taxJarTax, 'missing TaxJar tax doctor');
assert(
  taxJarTaxJson.failures.includes('TaxJar credentials'),
  'Doctor TaxJar tax mode should report TaxJar credential failure.',
);

await assertMissingProvider({
  label: 'Avalara tax',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_TAX: '1',
    BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'avalara',
  },
  failure: 'Avalara credentials',
});

const easyPostShipping = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
  BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'easypost',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  easyPostShipping.code === 1,
  `Doctor EasyPost shipping mode should exit 1 without EasyPost key, got ${easyPostShipping.code}.`,
);
const easyPostShippingJson = parseJson(easyPostShipping, 'missing EasyPost shipping doctor');
assert(
  easyPostShippingJson.failures.includes('EasyPost credentials'),
  'Doctor EasyPost shipping mode should report EasyPost credential failure.',
);

await assertMissingProvider({
  label: 'Shippo shipping',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
    BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'shippo',
  },
  failure: 'Shippo credentials',
});

await assertMissingProvider({
  label: 'Stripe promotion-code discount',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_DISCOUNT: '1',
    BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER: 'stripe',
  },
  failure: 'Stripe promotion-code discount credentials',
});

for (const { label, env, failure } of [
  {
    label: 'HTTP tax',
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_TAX: '1',
      BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'http',
    },
    failure: 'HTTP tax provider URL',
  },
  {
    label: 'HTTP shipping',
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
      BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'http',
    },
    failure: 'HTTP shipping provider URL',
  },
  {
    label: 'HTTP discount',
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_DISCOUNT: '1',
      BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER: 'http',
    },
    failure: 'HTTP discount provider URL',
  },
  {
    label: 'HTTP catalog',
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'http',
    },
    failure: 'HTTP catalog provider URL',
  },
  {
    label: 'HTTP subscription',
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'http',
    },
    failure: 'HTTP subscription provider URL',
  },
]) {
  await assertMissingProvider({ label, env, failure });
}

const shopifyCatalog = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_CATALOG: '1',
  BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'shopify',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  shopifyCatalog.code === 1,
  `Doctor Shopify catalog mode should exit 1 without Shopify credentials, got ${shopifyCatalog.code}.`,
);
const shopifyCatalogJson = parseJson(shopifyCatalog, 'missing Shopify catalog doctor');
assert(
  shopifyCatalogJson.failures.includes('Shopify catalog credentials'),
  'Doctor Shopify catalog mode should report Shopify credential failure.',
);

const magentoCatalog = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_CATALOG: '1',
  BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'magento',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  magentoCatalog.code === 1,
  `Doctor Magento catalog mode should exit 1 without Magento credentials, got ${magentoCatalog.code}.`,
);
const magentoCatalogJson = parseJson(magentoCatalog, 'missing Magento catalog doctor');
assert(
  magentoCatalogJson.failures.includes('Magento catalog credentials'),
  'Doctor Magento catalog mode should report Magento credential failure.',
);

for (const { provider, failure } of [
  { provider: 'bigcommerce', failure: 'BigCommerce catalog credentials' },
  { provider: 'woocommerce', failure: 'WooCommerce catalog credentials' },
  { provider: 'etsy', failure: 'Etsy catalog credentials' },
]) {
  await assertMissingProvider({
    label: `${provider} catalog`,
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: provider,
    },
    failure,
  });
}

for (const { label, env } of [
  {
    label: 'selected Stripe payment',
    env: {
      BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
      BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'stripe_alias_secret',
    },
  },
  {
    label: 'selected PayPal payment',
    env: {
      BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
      BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'paypal',
      PAYPAL_ACCESS_TOKEN: 'paypal_alias_token',
    },
  },
  {
    label: 'selected Paddle subscription',
    env: {
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'paddle',
      PADDLE_API_KEY: 'paddle_alias_key',
    },
  },
  {
    label: 'selected Square payment',
    env: {
      BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
      BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'square',
      SQUARE_ACCESS_TOKEN: 'square_alias_token',
    },
  },
  {
    label: 'selected Adyen subscription',
    env: {
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'adyen',
      ADYEN_API_KEY: 'adyen_alias_key',
      ADYEN_MERCHANT_ACCOUNT: 'adyen_alias_merchant',
    },
  },
  {
    label: 'selected Mollie payment',
    env: {
      BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
      BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'mollie',
      MOLLIE_API_KEY: 'mollie_alias_key',
    },
  },
  {
    label: 'selected Razorpay subscription',
    env: {
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'razorpay',
      RAZORPAY_KEY_ID: 'razorpay_alias_key',
      RAZORPAY_KEY_SECRET: 'razorpay_alias_secret',
    },
  },
  {
    label: 'selected TaxJar tax',
    env: {
      BACKY_COMMERCE_CERTIFY_TAX: '1',
      BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'taxjar',
      TAXJAR_API_KEY: 'taxjar_alias_key',
    },
  },
  {
    label: 'selected Avalara tax',
    env: {
      BACKY_COMMERCE_CERTIFY_TAX: '1',
      BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'avalara',
      AVALARA_ACCOUNT_ID: 'avalara_alias_account',
      AVALARA_LICENSE_KEY: 'avalara_alias_license',
      AVALARA_COMPANY_CODE: 'avalara_alias_company',
    },
  },
  {
    label: 'selected EasyPost shipping',
    env: {
      BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
      BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'easypost',
      EASYPOST_API_KEY: 'easypost_alias_key',
    },
  },
  {
    label: 'selected Shippo shipping',
    env: {
      BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
      BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'shippo',
      SHIPPO_API_KEY: 'shippo_alias_key',
    },
  },
  {
    label: 'selected HTTP tax',
    env: {
      BACKY_COMMERCE_CERTIFY_TAX: '1',
      BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'http',
      COMMERCE_TAX_PROVIDER_URL: 'https://commerce-http.example.test/tax',
    },
  },
  {
    label: 'selected HTTP shipping',
    env: {
      BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
      BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'http',
      COMMERCE_SHIPPING_PROVIDER_URL: 'https://commerce-http.example.test/shipping',
    },
  },
  {
    label: 'selected Stripe discount',
    env: {
      BACKY_COMMERCE_CERTIFY_DISCOUNT: '1',
      BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'stripe_alias_key',
    },
  },
  {
    label: 'selected HTTP discount',
    env: {
      BACKY_COMMERCE_CERTIFY_DISCOUNT: '1',
      BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER: 'http',
      COMMERCE_DISCOUNT_PROVIDER_URL: 'https://commerce-http.example.test/discount',
    },
  },
  {
    label: 'selected Shopify catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'shopify',
      SHOPIFY_ADMIN_ACCESS_TOKEN: 'shopify_alias_token',
      SHOPIFY_STORE_DOMAIN: 'shop.example.test',
    },
  },
  {
    label: 'selected HTTP catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'http',
      COMMERCE_PRODUCT_SYNC_URL: 'https://commerce-http.example.test/catalog',
    },
  },
  {
    label: 'selected HTTP subscription',
    env: {
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'http',
      COMMERCE_SUBSCRIPTION_ACTION_URL: 'https://commerce-http.example.test/subscription',
    },
  },
  {
    label: 'selected BigCommerce catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'bigcommerce',
      BIGCOMMERCE_ACCESS_TOKEN: 'bigcommerce_alias_token',
      BIGCOMMERCE_STORE_HASH: 'store_hash',
    },
  },
  {
    label: 'selected WooCommerce catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'woocommerce',
      WOOCOMMERCE_CONSUMER_KEY: 'woocommerce_alias_key',
      WOOCOMMERCE_CONSUMER_SECRET: 'woocommerce_alias_secret',
      WOOCOMMERCE_STORE_URL: 'https://woo.example.test',
    },
  },
  {
    label: 'selected Etsy catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'etsy',
      ETSY_ACCESS_TOKEN: 'etsy_alias_token',
      ETSY_API_KEY: 'etsy_alias_key',
      ETSY_SHOP_ID: 'etsy_shop',
    },
  },
  {
    label: 'selected Magento catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'magento',
      MAGENTO_ACCESS_TOKEN: 'magento_alias_token',
      MAGENTO_STORE_URL: 'https://magento.example.test',
    },
  },
]) {
  await assertProviderAliasReady({ label, env });
}

const commerceWebhook = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_WEBHOOKS: '1',
  BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER: 'stripe',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  commerceWebhook.code === 1,
  `Doctor Commerce webhook mode should exit 1 without webhook secret, got ${commerceWebhook.code}.`,
);
const commerceWebhookJson = parseJson(commerceWebhook, 'missing Commerce webhook doctor');
assert(
  commerceWebhookJson.failures.includes('Commerce webhook secret'),
  'Doctor Commerce webhook mode should report webhook secret failure.',
);

await assertProviderAliasReady({
  label: 'selected commerce webhook',
  env: {
    BACKY_COMMERCE_CERTIFY_WEBHOOKS: '1',
    BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER: 'generic',
    COMMERCE_WEBHOOK_SECRET: 'commerce_webhook_alias_secret',
  },
});

await assertMissingProvider({
  label: 'selected Razorpay commerce webhook',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_WEBHOOKS: '1',
    BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER: 'razorpay',
    COMMERCE_WEBHOOK_SECRET: 'commerce_webhook_alias_secret',
  },
  failure: 'Razorpay webhook credentials',
});

await assertProviderAliasReady({
  label: 'selected Razorpay commerce webhook',
  env: {
    BACKY_COMMERCE_CERTIFY_WEBHOOKS: '1',
    BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER: 'razorpay',
    COMMERCE_WEBHOOK_SECRET: 'commerce_webhook_alias_secret',
    RAZORPAY_KEY_ID: 'razorpay_alias_key',
    RAZORPAY_KEY_SECRET: 'razorpay_alias_secret',
  },
});

fs.rmSync(artifactTempDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.release-certification-doctor-contract.v1',
}, null, 2));

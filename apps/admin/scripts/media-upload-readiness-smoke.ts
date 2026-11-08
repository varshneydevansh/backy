import assert from 'node:assert/strict';
import { getMediaUploadRuntimeDisabledReason, getMediaUploadConfigurationDisabledReason, getMediaUploadScanPolicyNotice, type MediaUploadReadiness } from '../src/lib/mediaUploadReadiness';
import type { SiteSettingsInput } from '../src/lib/adminContentApi';

const scanner: NonNullable<SiteSettingsInput['runtimeMediaScanner']> = {
  provider: 'http', enabled: true, configured: true, endpointConfigured: true,
  apiKeyConfigured: false, timeoutMs: 5000, failOpen: false, missing: [],
};
assert.equal(getMediaUploadRuntimeDisabledReason(undefined, undefined), '', 'Unknown diagnostics must not lock out media roles without Settings permission');
assert.equal(getMediaUploadRuntimeDisabledReason(undefined, scanner), '', 'Configured scanner permits the upload controls');
assert.match(getMediaUploadRuntimeDisabledReason(undefined, { ...scanner, configured: false, endpointConfigured: false }), /HTTP or ClamAV/, 'Missing scanner endpoint must disable upload controls');
assert.match(getMediaUploadRuntimeDisabledReason(undefined, { ...scanner, provider: 'none', enabled: false, configured: false }), /scanning/, 'Explicitly disabled production scanner remains blocked');
assert.match(getMediaUploadRuntimeDisabledReason(undefined, { ...scanner, configured: false, failOpen: true, error: 'Production media scanner provider is not configured.' }), /scanning/, 'Fail-open must not override a server configuration error');
assert.equal(getMediaUploadRuntimeDisabledReason(undefined, { ...scanner, configured: false, endpointConfigured: false, failOpen: true }), '', 'Existing server-authorized availability fail-open remains available');
assert.equal(getMediaUploadRuntimeDisabledReason(undefined, { ...scanner, provider: 'none', enabled: false, configured: true }), '', 'Development static scanning remains available when the server permits it');
assert.match(getMediaUploadRuntimeDisabledReason({ provider: 'supabase', configured: false, missing: [] }, scanner), /storage/, 'Known missing storage blocks before scanner readiness');
const readiness: MediaUploadReadiness = {
  schemaVersion: 'backy.media-upload-readiness.v1', state: 'blocked', evidence: 'configuration-only',
  blockingReasons: [{ code: 'MEDIA_SCANNER_REQUIRED', message: 'Ask a site owner to configure scanning. Existing media remain available.' }],
};
assert.match(getMediaUploadConfigurationDisabledReason(readiness), /site owner/, 'Site-scoped diagnostics must work without Settings permission');
assert.equal(getMediaUploadConfigurationDisabledReason(undefined), '', 'Older or unverified metadata is not a known configuration blocker');
assert.equal(getMediaUploadConfigurationDisabledReason({ ...readiness, state: 'admissible', blockingReasons: [] }), '', 'Configuration admission permits an attempt only');
assert.match(getMediaUploadConfigurationDisabledReason({ ...readiness, blockingReasons: [] }), /Uploads unavailable/, 'An empty blocked diagnostic must not enable uploading');
const ownerStatic: MediaUploadReadiness = {
  ...readiness, state: 'admissible', blockingReasons: [], scanPolicy: { mode: 'owner-static', malwareScanned: false },
};
const disabledScanner = { ...scanner, provider: 'none' as const, enabled: false, configured: false };
assert.equal(getMediaUploadRuntimeDisabledReason(undefined, disabledScanner, ownerStatic), '', 'Explicit site admission overrides global scanner diagnostics for owner uploads');
assert.equal(getMediaUploadRuntimeDisabledReason(undefined, disabledScanner, { ...ownerStatic, scanPolicy: undefined }), '', 'Admission remains authoritative for scanner diagnostics even without optional policy details');
assert.match(getMediaUploadRuntimeDisabledReason({ provider: 'supabase', configured: false, missing: [] }, disabledScanner, ownerStatic), /storage/, 'Owner admission must not override missing storage');
assert.equal(getMediaUploadScanPolicyNotice(undefined), '', 'Unknown policy must not claim owner-static scanning');
assert.equal(getMediaUploadScanPolicyNotice({ ...ownerStatic, state: 'blocked' }), '', 'Blocked uploads must not display an admitted owner policy');
assert.equal(getMediaUploadScanPolicyNotice({ ...ownerStatic, scanPolicy: undefined }), '', 'Scanner-backed admission does not show an antivirus-disabled notice');
assert.equal(getMediaUploadScanPolicyNotice(ownerStatic), 'Owner uploads use basic file checks. Antivirus scanning is not enabled. Visitor file uploads remain unavailable without a scanner.', 'Owner policy explains basic checks and preserves the visitor scanner boundary');
console.log('Media upload runtime readiness: 19 checks passed.');

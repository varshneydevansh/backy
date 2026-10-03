import assert from 'node:assert/strict';
import { getMediaUploadRuntimeDisabledReason } from '../src/lib/mediaUploadReadiness';
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
console.log('Media upload runtime readiness: 8 checks passed.');

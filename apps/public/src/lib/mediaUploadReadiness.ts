import { MediaSafetyError, resolveMediaScannerConfig, type OwnerMediaUploadContext } from '@/lib/mediaSafety';
import { getMediaStorageConfigSummary } from '@/lib/mediaStorage';

export type MediaUploadReadinessCode =
  | 'MEDIA_STORAGE_NOT_CONFIGURED'
  | 'MEDIA_SCANNER_REQUIRED'
  | 'MEDIA_SCANNER_UNSUPPORTED'
  | 'MEDIA_SCANNER_ENDPOINT_REQUIRED'
  | 'MEDIA_UPLOAD_CONFIGURATION_INVALID';

export interface MediaUploadReadiness {
  schemaVersion: 'backy.media-upload-readiness.v1';
  state: 'admissible' | 'blocked';
  evidence: 'configuration-only';
  scanPolicy?: { mode: 'owner-static'; malwareScanned: false };
  blockingReasons: Array<{ code: MediaUploadReadinessCode; message: string }>;
}

const scannerAction = 'Uploads unavailable. Ask a site owner to configure HTTP or ClamAV scanning on the Backy backend. You can still use existing media.';

/** Safe author diagnostics; never a provider probe or substitute for upload admission. */
export function getMediaUploadReadiness(context?: OwnerMediaUploadContext): MediaUploadReadiness {
  const blockingReasons: MediaUploadReadiness['blockingReasons'] = [];
  let scanPolicy: MediaUploadReadiness['scanPolicy'];
  try {
    if (!getMediaStorageConfigSummary().configured) {
      blockingReasons.push({ code: 'MEDIA_STORAGE_NOT_CONFIGURED', message: 'Uploads unavailable. Ask a site owner to configure media storage on the Backy backend. You can still use existing media.' });
    }
  } catch {
    blockingReasons.push({ code: 'MEDIA_UPLOAD_CONFIGURATION_INVALID', message: 'Uploads unavailable. Ask a site owner to review media storage configuration on the Backy backend. You can still use existing media.' });
  }

  try {
    const scanner = resolveMediaScannerConfig(context);
    if (scanner.ownerUploadPolicy) scanPolicy = { mode: 'owner-static', malwareScanned: false };
    // This mirrors actual scan admission, including an explicitly allowed static
    // scanner and HTTP fail-open. Configured ClamAV/HTTP still need a real verdict.
    if (scanner.provider === 'http' && !scanner.endpoint && !scanner.failOpen) {
      blockingReasons.push({ code: 'MEDIA_SCANNER_ENDPOINT_REQUIRED', message: scannerAction });
    }
  } catch (error) {
    const code: MediaUploadReadinessCode = error instanceof MediaSafetyError
      ? error.details.reason === 'production-media-scanner-required'
        ? 'MEDIA_SCANNER_REQUIRED'
        : error.message === 'Unsupported media scan provider.'
          ? 'MEDIA_SCANNER_UNSUPPORTED'
          : 'MEDIA_UPLOAD_CONFIGURATION_INVALID'
      : 'MEDIA_UPLOAD_CONFIGURATION_INVALID';
    blockingReasons.push({ code, message: scannerAction });
  }

  return {
    schemaVersion: 'backy.media-upload-readiness.v1',
    state: blockingReasons.length ? 'blocked' : 'admissible',
    evidence: 'configuration-only',
    ...(scanPolicy ? { scanPolicy } : {}),
    blockingReasons,
  };
}

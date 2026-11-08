import type { SiteSettingsInput } from './adminContentApi';

export interface MediaUploadReadiness {
  schemaVersion: 'backy.media-upload-readiness.v1';
  state: 'admissible' | 'blocked';
  evidence: 'configuration-only';
  blockingReasons: Array<{ code: string; message: string }>;
  scanPolicy?: { mode: 'owner-static'; malwareScanned: false };
}

export const getMediaUploadScanPolicyNotice = (
  readiness: MediaUploadReadiness | undefined,
): string => readiness?.state === 'admissible' && readiness.scanPolicy?.mode === 'owner-static'
  && readiness.scanPolicy.malwareScanned === false
  ? 'Owner uploads use basic file checks. Antivirus scanning is not enabled. Visitor file uploads remain unavailable without a scanner.'
  : '';

/** Admission is configuration evidence, never proof of provider health or delivery. */
export const getMediaUploadConfigurationDisabledReason = (
  readiness: MediaUploadReadiness | undefined,
): string => readiness?.state === 'blocked'
  ? readiness.blockingReasons.map((reason) => reason.message).filter(Boolean).join(' ')
    || 'Uploads unavailable. Ask a site owner to review the Backy backend media configuration. You can still use existing media.'
  : '';

/** Only block on known server diagnostics; media roles may not have Settings access. */
export const getMediaUploadRuntimeDisabledReason = (
  storage: SiteSettingsInput['runtimeStorage'],
  scanner: SiteSettingsInput['runtimeMediaScanner'],
  readiness?: MediaUploadReadiness,
): string => {
  if (storage?.configured === false) {
    return 'Media storage is not configured. Review Storage health before uploading.';
  }
  // Site-scoped admission accounts for the owner's policy; global scanner diagnostics do not.
  if (readiness?.state === 'admissible') return '';
  if (scanner?.configured === false && (scanner.error || !scanner.failOpen)) {
    return 'Upload scanning is not configured. Connect an HTTP or ClamAV scanner in Storage health before uploading.';
  }
  return '';
};

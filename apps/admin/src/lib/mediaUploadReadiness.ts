import type { SiteSettingsInput } from './adminContentApi';

/** Only block on known server diagnostics; media roles may not have Settings access. */
export const getMediaUploadRuntimeDisabledReason = (
  storage: SiteSettingsInput['runtimeStorage'],
  scanner: SiteSettingsInput['runtimeMediaScanner'],
): string => {
  if (storage?.configured === false) {
    return 'Media storage is not configured. Review Storage health before uploading.';
  }
  if (scanner?.configured === false && (scanner.error || !scanner.failOpen)) {
    return 'Upload scanning is not configured. Connect an HTTP or ClamAV scanner in Storage health before uploading.';
  }
  return '';
};

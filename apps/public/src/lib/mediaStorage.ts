import { join } from 'node:path';
import { createLocalAdapter, type StorageAdapter } from '@backy/storage';

const UPLOAD_PUBLIC_PREFIX = '/uploads';

export const getMediaStorageAdapter = (): StorageAdapter => (
  createLocalAdapter({
    provider: 'local',
    basePath: join(process.cwd(), 'public', 'uploads'),
    publicUrl: UPLOAD_PUBLIC_PREFIX,
  })
);

export const getMediaStoragePath = (input: {
  siteId: string;
  mediaFolder: string;
  storedFilename: string;
}): string => (
  `sites/${input.siteId}/${input.mediaFolder}/${input.storedFilename}`
);

export const getMediaStoragePathFromUrl = (siteId: string, url: string | null | undefined): string | null => {
  const prefix = `${UPLOAD_PUBLIC_PREFIX}/sites/${siteId}/`;

  if (!url?.startsWith(prefix)) {
    return null;
  }

  return url.slice(UPLOAD_PUBLIC_PREFIX.length + 1);
};

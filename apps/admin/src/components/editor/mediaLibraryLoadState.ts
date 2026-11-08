export type MediaLibrarySnapshot<TMedia, TFolder> = { state: 'ready'; media: TMedia[]; folders: TFolder[] } | { state: 'failed'; message: string };

export async function readMediaLibrarySnapshot<TMedia, TFolder>(loadMedia: () => Promise<TMedia[]>, loadFolders: () => Promise<TFolder[]>): Promise<MediaLibrarySnapshot<TMedia, TFolder>> {
  try {
    const [media, folders] = await Promise.all([loadMedia(), loadFolders()]);
    return { state: 'ready', media, folders };
  } catch (error) {
    return { state: 'failed', message: error instanceof Error ? error.message : 'Unable to load media library.' };
  }
}

export const mediaLibraryResultVisible = (canView: boolean, loading: boolean, failed: boolean): boolean => canView && !loading && !failed;

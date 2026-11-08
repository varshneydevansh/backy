export type MediaUploadStatus = 'queued' | 'uploading' | 'saved' | 'failed' | 'skipped' | 'stopped';

export interface MediaUploadRow {
  id: number;
  name: string;
  bytes: number;
  status: MediaUploadStatus;
  message?: string;
}

/** Stops pending work only. An admitted request must finish so a saved upload
 * is never reported as cancelled, nor silently retried after an ambiguous error. */
export async function runMediaUploadBatch<T>(options: {
  files: readonly File[];
  reject: (file: File) => string | undefined;
  upload: (file: File) => Promise<T>;
  shouldContinue: () => boolean;
  onRows: (rows: MediaUploadRow[]) => void;
}): Promise<{ rows: MediaUploadRow[]; uploaded: T[] }> {
  const rows: MediaUploadRow[] = options.files.map((file, id) => {
    const message = options.reject(file);
    return { id, name: file.name, bytes: file.size, status: message ? 'skipped' : 'queued', message };
  });
  const uploaded: T[] = [];
  const report = () => options.onRows(rows.map(row => ({ ...row })));
  report();
  for (const row of rows) {
    if (row.status !== 'queued') continue;
    if (!options.shouldContinue()) {
      for (const pending of rows) {
        if (pending.status === 'queued') {
          pending.status = 'stopped';
          pending.message = 'Not started. Select this file again to upload it.';
        }
      }
      report();
      break;
    }
    row.status = 'uploading';
    report();
    try {
      const asset = await options.upload(options.files[row.id]);
      uploaded.push(asset);
      row.status = 'saved';
    } catch (error) {
      row.status = 'failed';
      const message = error instanceof Error ? error.message : 'Upload could not be confirmed.';
      row.message = /before (retrying|trying again)/i.test(message) ? message : `${message} Check the library before trying again.`;
    }
    report();
  }
  return { rows: rows.map(row => ({ ...row })), uploaded };
}

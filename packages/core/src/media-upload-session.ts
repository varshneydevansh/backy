/** Private, server-managed upload staging. Binary chunks never enter public media. */
export interface BackyMediaUploadSession {
  id: string;
  siteId: string;
  actorId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  offset: number;
  fields: Record<string, string>;
  state: 'uploading' | 'completing' | 'complete' | 'failed';
  mediaId: string | null;
  expiresAt: string;
}
export interface BackyMediaUploadSessionRepository {
  list(siteId: string, actorId: string, limit: number, offset: number): Promise<{items: BackyMediaUploadSession[]; total: number}>;
  create(input: Omit<BackyMediaUploadSession, 'offset' | 'state' | 'mediaId'>): Promise<BackyMediaUploadSession>;
  get(siteId: string, actorId: string, id: string): Promise<BackyMediaUploadSession | null>;
  append(siteId: string, actorId: string, id: string, offset: number, bytes: Uint8Array): Promise<BackyMediaUploadSession | null>;
  claim(siteId: string, actorId: string, id: string): Promise<BackyMediaUploadSession | null>;
  readChunks(siteId: string, actorId: string, id: string): Promise<Uint8Array[]>;
  settle(siteId: string, actorId: string, id: string, mediaId: string | null): Promise<void>;
  cancel(siteId: string, actorId: string, id: string): Promise<boolean>;
  reservedBytes(siteId: string, excludeId?: string): Promise<number>;
  pruneExpired(siteId: string): Promise<void>;
}

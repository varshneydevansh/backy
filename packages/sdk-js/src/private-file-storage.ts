export interface BackyPrivateFileVersion {
  id: string;
  productId: string;
  filename: string;
  sizeBytes: number;
  expiresDays: number;
  maxDownloads: number;
  createdAt: string;
  state: "planned" | "active" | "retiring" | "removed";
  protected: boolean;
  cleanupPending: boolean;
  errorCode: string | null;
}
export interface BackyPrivateFileStorage {
  schemaVersion: "backy.private-file-storage.v1";
  files: BackyPrivateFileVersion[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  reservedAndRetainedBytes: number;
  maxUploadBytes: 3145728;
  retention: string;
}
export interface BackyPrivateFileRecovery {
  schemaVersion: "backy.private-file-recovery.v1";
  fileId: string;
  state: "registered" | "removed";
  removedBytes: number;
}
/** Supply an explicitly authenticated admin fetch. Never put an admin credential in a public frontend environment. */
export function createBackyPrivateFileStorageClient(options: {
  baseUrl: string;
  siteId: string;
  fetch: typeof fetch;
}) {
  const base = options.baseUrl
      .replace(/\/+$/, "")
      .replace(/\/api(?:\/admin)?$/, ""),
    endpoint = `${base}/api/admin/sites/${encodeURIComponent(options.siteId)}/commerce/private-files`;
  const request = async <T>(
    url: string,
    init: RequestInit = {},
  ): Promise<T> => {
    const response = await options.fetch(url, { ...init, cache: "no-store" }),
      body = await response.json();
    if (!response.ok || !body.success)
      throw Error(body.error?.message || "Private file storage unavailable.");
    return body.data;
  };
  const action = (id: string, action: "recover" | "retire") =>
    request<BackyPrivateFileRecovery>(
      `${endpoint}/${encodeURIComponent(id)}/lifecycle`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
  return {
    list: (input: { limit?: number; offset?: number } = {}) =>
      request<BackyPrivateFileStorage>(
        `${endpoint}?limit=${input.limit ?? 25}&offset=${input.offset ?? 0}`,
      ),
    recover: (fileId: string) => action(fileId, "recover"),
    retire: (fileId: string) => action(fileId, "retire"),
  };
}

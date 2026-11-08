export interface BackyDigitalFile {
  id: string;
  productId: string;
  filename: string;
  sizeBytes: number;
  expiresDays: number;
  maxDownloads: number;
  createdAt: string;
}
export interface BackyBuyerEntitlement {
  id: string;
  productId: string;
  filename: string;
  state: "active" | "revoked" | "expired" | "exhausted" | "payment-held";
  expiresAt: string;
  maxDownloads: number;
  downloads: number;
  revokedAt: string | null;
}
export interface BackyBuyerOrder {
  orderId: string;
  paymentStatus: string;
  entitlements: BackyBuyerEntitlement[];
  history: Array<{
    kind: string;
    createdAt: string;
    entitlementId: string | null;
  }>;
}
export class CommerceEntitlementError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface BackyCommerceEntitlementRepository extends BackyPrivateFileLifecycleRepository {
  currentFile(
    siteId: string,
    productId: string,
  ): Promise<BackyDigitalFile | null>;
  registerFile(
    siteId: string,
    productId: string,
    input: {
      id: string;
      jobId: string;
      filename: string;
      sizeBytes: number;
      storagePath: string;
      binaryFingerprint: string;
      expiresDays: number;
      maxDownloads: number;
    },
    actorId: string | null,
  ): Promise<BackyDigitalFile>;
  order(
    siteId: string,
    orderId: string,
    tokenHash: string | null,
  ): Promise<BackyBuyerOrder>;
  revoke(
    siteId: string,
    orderId: string,
    entitlementId: string,
    actorId: string | null,
  ): Promise<BackyBuyerOrder>;
  download<T>(
    siteId: string,
    orderId: string,
    entitlementId: string,
    tokenHash: string,
    read: (file: {
      filename: string;
      sizeBytes: number;
      storagePath: string;
      binaryFingerprint: string;
      storageIdentity: string;
      storageProvider: string;
    }) => Promise<T>,
  ): Promise<T>;
}

export interface BackyPrivateFileVersion extends BackyDigitalFile {
  state: "planned" | "active" | "retiring" | "removed";
  protected: boolean;
  cleanupPending: boolean;
  errorCode: string | null;
}
export interface BackyPrivateFileJob {
  id: string;
  siteId: string;
  productId: string;
  filename: string;
  sizeBytes: number;
  storagePath: string;
  storageIdentity: string;
  storageProvider: string;
  binaryFingerprint: string;
  expiresDays: number;
  maxDownloads: number;
  state: "planned" | "registered" | "cleanup-pending" | "removed";
  createdAt: string;
  errorCode: string | null;
}
export interface BackyPrivateFileLifecycleRepository {
  beginFileUpload(
    siteId: string,
    productId: string,
    input: {
      id: string;
      filename: string;
      sizeBytes: number;
      storagePath: string;
      binaryFingerprint: string;
      storageIdentity: string;
      storageProvider: string;
      expiresDays: number;
      maxDownloads: number;
    },
    actorId: string | null,
  ): Promise<BackyPrivateFileJob>;
  privateFileJob(
    siteId: string,
    id: string,
  ): Promise<BackyPrivateFileJob | null>;
  fileStorageUsage(siteId: string): Promise<number>;
  assertPrivateFilesDeleted(siteId: string): Promise<void>;
  privateFileVersions(
    siteId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: BackyPrivateFileVersion[]; total: number }>;
  requestFileCleanup(
    siteId: string,
    id: string,
    retire: boolean,
    actorId: string | null,
  ): Promise<BackyPrivateFileJob>;
  recordFileCleanup(
    siteId: string,
    id: string,
    identity: string,
    removed: boolean,
    errorCode: string | null,
  ): Promise<void>;
}

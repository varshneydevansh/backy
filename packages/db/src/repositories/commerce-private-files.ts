import { sql } from "drizzle-orm";
import type { DatabaseInstance } from "../adapters";
import { postgresResultRows } from "../adapters/postgres-result";
import {
  CommerceEntitlementError,
  type BackyPrivateFileLifecycleRepository,
  type BackyPrivateFileJob,
} from "@backy-cms/core";
const uuid = (id: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
const fail = (code: string, status: number, message: string): never => {
  throw new CommerceEntitlementError(code, status, message);
};
const rows = async (tx: any, q: any): Promise<any[]> =>
  postgresResultRows(await tx.execute(q));
export const commercePrivateJob = (j: any): BackyPrivateFileJob => ({
  id: j.id,
  siteId: j.site_id,
  productId: j.product_id,
  filename: j.filename,
  sizeBytes: j.size_bytes,
  storagePath: j.storage_path,
  storageIdentity: j.storage_identity,
  storageProvider: j.storage_provider,
  binaryFingerprint: j.binary_fingerprint,
  expiresDays: j.expires_days,
  maxDownloads: j.max_downloads,
  state: j.state,
  createdAt: new Date(j.created_at).toISOString(),
  errorCode: j.error_code,
});
export function createCommercePrivateFileLifecycle(
  db: DatabaseInstance,
  adapterType: string,
): BackyPrivateFileLifecycleRepository {
  const transaction = <T>(
    siteId: string,
    operation: (tx: any) => Promise<T>,
  ): Promise<T> => {
    if (adapterType !== "postgres" || !uuid(siteId))
      fail(
        "COMMERCE_PRIVATE_LIFECYCLE_UNAVAILABLE",
        503,
        "Private file lifecycle requires persisted PostgreSQL.",
      );
    return (db as any).transaction(operation);
  };
  const protectedFile = async (tx: any, siteId: string, id: string) => {
    const [r] = await rows(
      tx,
      sql`SELECT EXISTS(SELECT 1 FROM commerce_private_file_claims WHERE site_id=${siteId}::uuid AND file_id=${id}::uuid) OR EXISTS(SELECT 1 FROM commerce_buyer_entitlements WHERE site_id=${siteId}::uuid AND file_id=${id}::uuid) AS protected`,
    );
    return r.protected;
  };
  const lockedJob = async (tx: any, siteId: string, id: string) => {
    if (!uuid(id))
      fail(
        "COMMERCE_PRIVATE_JOB_NOT_FOUND",
        404,
        "Private file recovery record unavailable.",
      );
    const [j] = await rows(
      tx,
      sql`SELECT * FROM commerce_private_file_jobs WHERE site_id=${siteId}::uuid AND id=${id}::uuid FOR UPDATE`,
    );
    if (!j)
      fail(
        "COMMERCE_PRIVATE_JOB_NOT_FOUND",
        404,
        "Private file recovery record unavailable.",
      );
    return j;
  };
  return {
    beginFileUpload: (siteId, productId, input, actorId) =>
      transaction(siteId, async (tx) => {
        if (
          !uuid(productId) ||
          !uuid(input.id) ||
          input.storagePath !==
            `sites/${siteId}/products/${productId}/${input.id}` ||
          !/^[a-f0-9]{64}$/.test(input.binaryFingerprint) ||
          !/^[a-f0-9]{64}$/.test(input.storageIdentity) ||
          !["local", "s3", "supabase"].includes(input.storageProvider) ||
          !input.filename ||
          input.filename.length > 180 ||
          /[\/\\\p{Cc}]/u.test(input.filename) ||
          !Number.isInteger(input.sizeBytes) ||
          input.sizeBytes < 1 ||
          input.sizeBytes > 3145728 ||
          !Number.isInteger(input.expiresDays) ||
          input.expiresDays < 1 ||
          input.expiresDays > 365 ||
          !Number.isInteger(input.maxDownloads) ||
          input.maxDownloads < 1 ||
          input.maxDownloads > 100
        )
          fail(
            "DIGITAL_FILE_INVALID",
            400,
            "Invalid private file staging request.",
          );
        const [p] = await rows(
          tx,
          sql`SELECT r.id FROM content_collection_records r JOIN content_collections c ON c.id=r.collection_id AND c.site_id=r.site_id WHERE r.site_id=${siteId}::uuid AND r.id=${productId}::uuid AND c.slug='products' AND r.values->>'producttype'='digital' FOR SHARE OF r`,
        );
        if (!p)
          fail(
            "DIGITAL_PRODUCT_NOT_FOUND",
            404,
            "Save a digital product in this site first.",
          );
        const [j] = await rows(
          tx,
          sql`INSERT INTO commerce_private_file_jobs(id,site_id,product_id,filename,size_bytes,storage_path,storage_identity,storage_provider,binary_fingerprint,expires_days,max_downloads,actor_id) VALUES(${input.id}::uuid,${siteId}::uuid,${productId}::uuid,${input.filename},${input.sizeBytes},${input.storagePath},${input.storageIdentity},${input.storageProvider},${input.binaryFingerprint},${input.expiresDays},${input.maxDownloads},${actorId}::uuid) RETURNING *`,
        );
        return commercePrivateJob(j);
      }),
    privateFileJob: (siteId, id) =>
      transaction(siteId, async (tx) => {
        if (!uuid(id)) return null;
        const [j] = await rows(
          tx,
          sql`SELECT * FROM commerce_private_file_jobs WHERE site_id=${siteId}::uuid AND id=${id}::uuid`,
        );
        return j ? commercePrivateJob(j) : null;
      }),
    fileStorageUsage: (siteId) =>
      transaction(siteId, async (tx) => {
        const [r] = await rows(
          tx,
          sql`SELECT COALESCE((SELECT SUM(size_bytes) FROM commerce_digital_files WHERE site_id=${siteId}::uuid AND state<>'removed'),0)+COALESCE((SELECT SUM(j.size_bytes) FROM commerce_private_file_jobs j WHERE j.site_id=${siteId}::uuid AND j.state IN('planned','cleanup-pending','registered') AND NOT EXISTS(SELECT 1 FROM commerce_digital_files f WHERE f.site_id=j.site_id AND f.id=j.id AND f.state<>'removed')),0) AS bytes`,
        );
        return Number(r.bytes);
      }),
    assertPrivateFilesDeleted: (siteId) =>
      transaction(siteId, async (tx) => {
        const [r] = await rows(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM commerce_digital_files WHERE site_id=${siteId}::uuid AND state<>'removed') OR EXISTS(SELECT 1 FROM commerce_private_file_jobs WHERE site_id=${siteId}::uuid AND state<>'removed') AS remaining`,
        );
        if (r.remaining)
          fail(
            "SITE_PRIVATE_COMMERCE_FILES_REMAIN",
            409,
            "Private commerce files or recovery evidence remain. Recover and retire unpurchased versions first; purchased versions must be retained.",
          );
      }),
    privateFileVersions: (siteId, limit, offset) =>
      transaction(siteId, async (tx) => {
        const pageLimit = Math.max(1, Math.min(100, Math.trunc(limit))),
          pageOffset = Math.max(0, Math.trunc(offset));
        const [count] = await rows(
          tx,
          sql`SELECT COUNT(*) AS total FROM (SELECT id FROM commerce_digital_files WHERE site_id=${siteId}::uuid UNION SELECT id FROM commerce_private_file_jobs WHERE site_id=${siteId}::uuid) all_files`,
        );
        const result = await rows(
          tx,
          sql`SELECT COALESCE(f.id,j.id) AS id,COALESCE(f.product_id,j.product_id) AS product_id,COALESCE(f.filename,j.filename) AS filename,COALESCE(f.size_bytes,j.size_bytes) AS size_bytes,COALESCE(f.expires_days,j.expires_days) AS expires_days,COALESCE(f.max_downloads,j.max_downloads) AS max_downloads,COALESCE(f.created_at,j.created_at) AS created_at,COALESCE(f.state,CASE WHEN j.state='removed' THEN 'removed' ELSE 'planned' END) AS state,j.state AS job_state,COALESCE(j.error_code,CASE WHEN f.id IS NOT NULL AND f.storage_identity IS NULL THEN 'COMMERCE_PRIVATE_FILE_UNVERIFIED' ELSE NULL END) AS error_code FROM commerce_digital_files f FULL JOIN commerce_private_file_jobs j ON f.id=j.id AND f.site_id=j.site_id WHERE COALESCE(f.site_id,j.site_id)=${siteId}::uuid ORDER BY COALESCE(f.created_at,j.created_at) DESC,COALESCE(f.id,j.id) DESC LIMIT ${pageLimit} OFFSET ${pageOffset}`,
        );
        const items = [];
        for (const f of result)
          items.push({
            id: f.id,
            productId: f.product_id,
            filename: f.filename,
            sizeBytes: f.size_bytes,
            expiresDays: f.expires_days,
            maxDownloads: f.max_downloads,
            createdAt: new Date(f.created_at).toISOString(),
            state: f.state,
            protected: await protectedFile(tx, siteId, f.id),
            cleanupPending:
              f.job_state === "planned" || f.job_state === "cleanup-pending",
            errorCode: f.error_code || null,
          });
        return { items, total: Number(count.total) };
      }),
    requestFileCleanup: (siteId, id, retire, actorId) =>
      transaction(siteId, async (tx) => {
        const [f] = await rows(
          tx,
          sql`SELECT * FROM commerce_digital_files WHERE site_id=${siteId}::uuid AND id=${id}::uuid FOR UPDATE`,
        );
        const j = await lockedJob(tx, siteId, id);
        if (j.state === "removed") return commercePrivateJob(j);
        if (f && !retire && f.state === "active") return commercePrivateJob(j);
        if (await protectedFile(tx, siteId, id))
          fail(
            "COMMERCE_PRIVATE_FILE_PROTECTED",
            409,
            "Checkout or entitlement history protects this immutable file.",
          );
        if (
          f &&
          (!f.storage_identity ||
            f.storage_identity !== j.storage_identity ||
            f.storage_provider !== j.storage_provider ||
            f.storage_path !== j.storage_path)
        )
          fail(
            "COMMERCE_PRIVATE_FILE_UNVERIFIED",
            409,
            "Private file storage identity is unverified. Its file and evidence were retained.",
          );
        if (f)
          await tx.execute(
            sql`UPDATE commerce_digital_files SET state='retiring' WHERE id=${id}::uuid AND site_id=${siteId}::uuid`,
          );
        const [updated] = await rows(
          tx,
          sql`UPDATE commerce_private_file_jobs SET state='cleanup-pending',cleanup_actor_id=${actorId}::uuid,updated_at=clock_timestamp() WHERE site_id=${siteId}::uuid AND id=${id}::uuid RETURNING *`,
        );
        return commercePrivateJob(updated);
      }),
    recordFileCleanup: (siteId, id, identity, removed, errorCode) =>
      transaction(siteId, async (tx) => {
        const [f] = await rows(
          tx,
          sql`SELECT * FROM commerce_digital_files WHERE site_id=${siteId}::uuid AND id=${id}::uuid FOR UPDATE`,
        );
        const j = await lockedJob(tx, siteId, id);
        if (j.storage_identity !== identity)
          fail(
            "COMMERCE_PRIVATE_DESTINATION_CHANGED",
            409,
            "Restore the matching private storage destination before recovery.",
          );
        if (removed && (await protectedFile(tx, siteId, id)))
          fail(
            "COMMERCE_PRIVATE_FILE_PROTECTED",
            409,
            "Checkout or entitlement history protects this immutable file.",
          );
        if (removed && f && f.state !== "retiring")
          fail(
            "COMMERCE_PRIVATE_FILE_PROTECTED",
            409,
            "Retire this unpurchased version before removing its bytes.",
          );
        if (removed && f)
          await tx.execute(
            sql`UPDATE commerce_digital_files SET state='removed' WHERE site_id=${siteId}::uuid AND id=${id}::uuid`,
          );
        await tx.execute(
          sql`UPDATE commerce_private_file_jobs SET state=${removed ? "removed" : j.state === "registered" ? "registered" : "cleanup-pending"},error_code=${errorCode?.slice(0, 100) || null},attempts=attempts+1,updated_at=clock_timestamp() WHERE site_id=${siteId}::uuid AND id=${id}::uuid`,
        );
      }),
  };
}

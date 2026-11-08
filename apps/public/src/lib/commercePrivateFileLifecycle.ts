import {
  CommerceEntitlementError,
  type BackyRepositories,
  type BackyPrivateFileJob,
} from "@backy-cms/core";
import { createHash } from "node:crypto";
import { getCommercePrivateStorageContext } from "./commercePrivateStorage";
export async function assertSiteCommercePrivateFilesDeleted(
  siteId: string,
  repositories: BackyRepositories | null,
): Promise<void> {
  if (repositories?.commerceEntitlements)
    await repositories.commerceEntitlements.assertPrivateFilesDeleted(siteId);
}
/** Caller holds the shared website storage lock. No provider location is accepted from the client. */
export async function recoverCommercePrivateFile(
  siteId: string,
  fileId: string,
  retire: boolean,
  actorId: string | null,
  repositories: BackyRepositories,
) {
  const repository = repositories.commerceEntitlements;
  if (!repository)
    throw new CommerceEntitlementError(
      "COMMERCE_PRIVATE_LIFECYCLE_UNAVAILABLE",
      503,
      "Private file recovery unavailable.",
    );
  let job = await repository.privateFileJob(siteId, fileId);
  if (!job)
    throw new CommerceEntitlementError(
      "COMMERCE_PRIVATE_JOB_NOT_FOUND",
      404,
      "Private file recovery record unavailable.",
    );
  if (job.state === "removed")
    return { fileId, state: "removed", removedBytes: 0 };
  const context = await getCommercePrivateStorageContext();
  if (
    context.storageIdentity !== job.storageIdentity ||
    context.storageProvider !== job.storageProvider
  )
    throw new CommerceEntitlementError(
      "COMMERCE_PRIVATE_DESTINATION_CHANGED",
      409,
      "Restore the matching verified private storage destination before recovery.",
    );
  job = await repository.requestFileCleanup(siteId, fileId, retire, actorId);
  if (job.state === "registered")
    return { fileId, state: "registered", removedBytes: 0 };
  if (job.state === "removed")
    return { fileId, state: "removed", removedBytes: 0 };
  let active = true,
    timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (!active)
      throw new CommerceEntitlementError(
        "COMMERCE_PRIVATE_RECOVERY_TIMEOUT",
        503,
        "Private cleanup timed out; its bytes and recovery evidence remain reserved.",
      );
  };
  try {
    return await Promise.race([
      (async () => {
        const before = await context.storage.stat(job!.storagePath);
        check();
        if (before) {
          if (before.size !== job!.sizeBytes)
            throw new CommerceEntitlementError(
              "COMMERCE_PRIVATE_FILE_UNVERIFIED",
              409,
              "Private file size changed. Its bytes and recovery evidence were retained.",
            );
          const bytes = await context.storage.read(job!.storagePath);
          check();
          if (
            bytes.length !== job!.sizeBytes ||
            createHash("sha256").update(bytes).digest("hex") !==
              job!.binaryFingerprint
          )
            throw new CommerceEntitlementError(
              "COMMERCE_PRIVATE_FILE_UNVERIFIED",
              409,
              "Private file content changed. Its bytes and recovery evidence were retained.",
            );
          await context.storage.delete(job!.storagePath);
          check();
          if (await context.storage.stat(job!.storagePath))
            throw new CommerceEntitlementError(
              "COMMERCE_PRIVATE_CLEANUP_PENDING",
              503,
              "Private file removal could not be verified. Its bytes remain reserved.",
            );
          check();
        }
        await repository.recordFileCleanup(
          siteId,
          fileId,
          context.storageIdentity,
          true,
          null,
        );
        return {
          fileId,
          state: "removed",
          removedBytes: before ? job!.sizeBytes : 0,
        };
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          active = false;
          reject(
            new CommerceEntitlementError(
              "COMMERCE_PRIVATE_RECOVERY_TIMEOUT",
              503,
              "Private cleanup timed out; its bytes and recovery evidence remain reserved.",
            ),
          );
        }, 15000);
      }),
    ]);
  } catch (error) {
    const code =
      error instanceof CommerceEntitlementError
        ? error.code
        : "COMMERCE_PRIVATE_CLEANUP_PENDING";
    await repository
      .recordFileCleanup(siteId, fileId, context.storageIdentity, false, code)
      .catch(() => {});
    throw error;
  } finally {
    active = false;
    if (timer) clearTimeout(timer);
  }
}
export function privateFileUploadInput(job: BackyPrivateFileJob) {
  return {
    id: job.id,
    jobId: job.id,
    filename: job.filename,
    sizeBytes: job.sizeBytes,
    storagePath: job.storagePath,
    binaryFingerprint: job.binaryFingerprint,
    expiresDays: job.expiresDays,
    maxDownloads: job.maxDownloads,
  };
}

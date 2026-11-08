import { createCommercePrivateFileLifecycle } from "./commerce-private-files";
import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DatabaseInstance } from "../adapters";
import {
  CommerceEntitlementError,
  type BackyCommerceEntitlementRepository,
  type BackyBuyerOrder,
  type BackyDigitalFile,
} from "@backy-cms/core";
import { postgresResultRows } from "../adapters/postgres-result";
const fail = (code: string, status: number, message: string): never => {
  throw new CommerceEntitlementError(code, status, message);
};
const uuid = (id: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
const rows = async (tx: any, query: any): Promise<any[]> =>
  postgresResultRows(await tx.execute(query));
const file = (f: any): BackyDigitalFile => ({
  id: f.id,
  productId: f.product_id,
  filename: f.filename,
  sizeBytes: f.size_bytes,
  expiresDays: f.expires_days,
  maxDownloads: f.max_downloads,
  createdAt: new Date(f.created_at).toISOString(),
});
export function createCommerceEntitlementRepository(
  db: DatabaseInstance,
  adapterType: string,
): BackyCommerceEntitlementRepository {
  const transaction = <T>(
    siteId: string,
    operation: (tx: any) => Promise<T>,
  ): Promise<T> => {
    if (adapterType !== "postgres")
      fail(
        "BUYER_ENTITLEMENTS_UNAVAILABLE",
        503,
        "Paid downloads require persisted PostgreSQL.",
      );
    if (!uuid(siteId))
      fail("BUYER_ORDER_UNAVAILABLE", 403, "Buyer order proof unavailable.");
    return (db as any).transaction(operation);
  };
  const lock = async (
    tx: any,
    siteId: string,
    orderId: string,
    hash: string | null,
  ) => {
    if (!uuid(orderId))
      fail("BUYER_ORDER_UNAVAILABLE", 403, "Buyer order proof unavailable.");
    const [order] = await rows(
      tx,
      sql`SELECT r.*, clock_timestamp() AS checked_at FROM content_collection_records r JOIN content_collections c ON c.id=r.collection_id AND c.site_id=r.site_id JOIN sites s ON s.id=r.site_id WHERE r.site_id=${siteId}::uuid AND r.id=${orderId}::uuid AND c.slug='orders' AND (s.is_published=true OR ${hash === null}) FOR UPDATE OF r`,
    );
    if (!order)
      fail("BUYER_ORDER_UNAVAILABLE", 403, "Buyer order proof unavailable.");
    const v = order.values || {},
      stored = String(v.statusaccesstokenhash || ""),
      expiry = Date.parse(String(v.statusaccesstokenexpiresat || ""));
    if (
      hash !== null &&
      (!/^[a-f0-9]{64}$/.test(hash) ||
        stored.length !== hash.length ||
        !timingSafeEqual(Buffer.from(stored), Buffer.from(hash)) ||
        !Number.isFinite(expiry) ||
        expiry <= Date.now())
    )
      fail("BUYER_ORDER_UNAVAILABLE", 403, "Buyer order proof unavailable.");
    return order;
  };
  const paid = (order: any) =>
    order.values.paymentstatus === "paid" &&
    !["cancelled", "canceled", "refunded"].includes(order.values.orderstatus) &&
    !(Number(order.values.refundamount) > 0) &&
    !(Number(order.values.providerrefundamount) > 0) &&
    !["requested", "succeeded", "requires_action"].includes(
      order.values.providerrefundstatus,
    );
  const event = async (
    tx: any,
    siteId: string,
    orderId: string | null,
    id: string | null,
    kind: string,
    actorId: string | null,
  ) => {
    await tx.execute(
      sql`INSERT INTO commerce_entitlement_events(site_id,order_id,entitlement_id,kind,actor_id) VALUES(${siteId}::uuid,${orderId}::uuid,${id}::uuid,${kind},${actorId}::uuid)`,
    );
  };
  const project = async (
    tx: any,
    siteId: string,
    order: any,
  ): Promise<BackyBuyerOrder> => {
    const result = await rows(
      tx,
      sql`SELECT e.*,f.product_id,f.filename FROM commerce_buyer_entitlements e JOIN commerce_digital_files f ON f.id=e.file_id AND f.site_id=e.site_id WHERE e.site_id=${siteId}::uuid AND e.order_id=${order.id}::uuid ORDER BY e.created_at,e.id`,
    );
    const history = await rows(
      tx,
      sql`SELECT kind,created_at,entitlement_id FROM commerce_entitlement_events WHERE site_id=${siteId}::uuid AND order_id=${order.id}::uuid ORDER BY created_at DESC,id DESC LIMIT 100`,
    );
    return {
      orderId: order.id,
      paymentStatus: String(order.values.paymentstatus || "pending"),
      entitlements: result.map((e) => ({
        id: e.id,
        productId: e.product_id,
        filename: e.filename,
        state: e.revoked_at
          ? "revoked"
          : !paid(order)
            ? "payment-held"
            : new Date(e.expires_at).getTime() <= Date.now()
              ? "expired"
              : e.downloads >= e.max_downloads
                ? "exhausted"
                : "active",
        expiresAt: new Date(e.expires_at).toISOString(),
        maxDownloads: e.max_downloads,
        downloads: e.downloads,
        revokedAt: e.revoked_at ? new Date(e.revoked_at).toISOString() : null,
      })),
      history: history.map((e) => ({
        kind: e.kind,
        createdAt: new Date(e.created_at).toISOString(),
        entitlementId: e.entitlement_id,
      })),
    };
  };
  const issue = async (tx: any, siteId: string, order: any) => {
    if (!paid(order)) return;
    let items: any[] = [];
    try {
      const value =
        typeof order.values.items === "string"
          ? JSON.parse(order.values.items)
          : order.values.items;
      if (Array.isArray(value)) items = value;
    } catch {}
    if (items.length > 100)
      fail("BUYER_ORDER_ITEMS_INVALID", 409, "Order item snapshot is invalid.");
    for (const item of items) {
      if (
        !uuid(String(item.digitalFileId || "")) ||
        !uuid(String(item.productId || ""))
      )
        continue;
      const [f] = await rows(
        tx,
        sql`SELECT * FROM commerce_digital_files WHERE site_id=${siteId}::uuid AND id=${item.digitalFileId}::uuid AND product_id=${item.productId}::uuid`,
      );
      if (!f) continue;
      const expiresAt = new Date(
        new Date(order.created_at).getTime() + f.expires_days * 86400000,
      );
      const [e] = await rows(
        tx,
        sql`INSERT INTO commerce_buyer_entitlements(site_id,order_id,file_id,expires_at,max_downloads) VALUES(${siteId}::uuid,${order.id}::uuid,${f.id}::uuid,${expiresAt.toISOString()}::timestamptz,${f.max_downloads}) ON CONFLICT(site_id,order_id,file_id) DO NOTHING RETURNING id`,
      );
      if (e) await event(tx, siteId, order.id, e.id, "issued", null);
    }
  };
  return {
    ...createCommercePrivateFileLifecycle(db, adapterType),
    currentFile: (siteId, productId) =>
      transaction(siteId, async (tx) => {
        if (!uuid(productId)) return null;
        const [f] = await rows(
          tx,
          sql`SELECT * FROM commerce_digital_files WHERE site_id=${siteId}::uuid AND product_id=${productId}::uuid ORDER BY created_at DESC,id DESC LIMIT 1`,
        );
        return f &&
          f.state === "active" &&
          /^[a-f0-9]{64}$/.test(f.storage_identity || "") &&
          ["local", "s3", "supabase"].includes(f.storage_provider)
          ? file(f)
          : null;
      }),
    registerFile: (siteId, productId, input, actorId) =>
      transaction(siteId, async (tx) => {
        if (
          !uuid(productId) ||
          !uuid(input.id) ||
          !Number.isInteger(input.sizeBytes) ||
          input.sizeBytes < 1 ||
          input.sizeBytes > 3145728 ||
          !Number.isInteger(input.expiresDays) ||
          input.expiresDays < 1 ||
          input.expiresDays > 365 ||
          !Number.isInteger(input.maxDownloads) ||
          input.maxDownloads < 1 ||
          input.maxDownloads > 100 ||
          !/^[a-f0-9]{64}$/.test(input.binaryFingerprint) ||
          input.storagePath !==
            `sites/${siteId}/products/${productId}/${input.id}` ||
          !input.filename ||
          input.filename.length > 180 ||
          /[\/\\\p{Cc}]/u.test(input.filename)
        )
          fail("DIGITAL_FILE_INVALID", 400, "Invalid private digital file.");
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
        const [job] = await rows(
          tx,
          sql`SELECT * FROM commerce_private_file_jobs WHERE site_id=${siteId}::uuid AND id=${input.jobId}::uuid FOR UPDATE`,
        );
        if (
          !job ||
          job.id !== input.id ||
          job.state !== "planned" ||
          job.product_id !== productId ||
          job.filename !== input.filename ||
          job.size_bytes !== input.sizeBytes ||
          job.storage_path !== input.storagePath ||
          job.binary_fingerprint !== input.binaryFingerprint ||
          job.expires_days !== input.expiresDays ||
          job.max_downloads !== input.maxDownloads
        )
          fail(
            "COMMERCE_PRIVATE_STAGING_CONFLICT",
            409,
            "Private file staging evidence changed. Recover the retained record before retrying.",
          );
        const [f] = await rows(
          tx,
          sql`INSERT INTO commerce_digital_files(id,site_id,product_id,filename,size_bytes,storage_path,binary_fingerprint,expires_days,max_downloads,storage_identity,storage_provider) VALUES(${input.id}::uuid,${siteId}::uuid,${productId}::uuid,${input.filename},${input.sizeBytes},${input.storagePath},${input.binaryFingerprint},${input.expiresDays},${input.maxDownloads},${job.storage_identity},${job.storage_provider}) RETURNING *`,
        );
        await tx.execute(
          sql`INSERT INTO commerce_entitlement_events(site_id,file_id,kind,actor_id) VALUES(${siteId}::uuid,${f.id}::uuid,'file.registered',${actorId}::uuid)`,
        );
        await tx.execute(
          sql`UPDATE commerce_private_file_jobs SET state='registered',updated_at=clock_timestamp() WHERE site_id=${siteId}::uuid AND id=${job.id}::uuid`,
        );
        return file(f);
      }),
    order: (siteId, orderId, hash) =>
      transaction(siteId, async (tx) => {
        const order = await lock(tx, siteId, orderId, hash);
        await issue(tx, siteId, order);
        return project(tx, siteId, order);
      }),
    revoke: (siteId, orderId, id, actorId) =>
      transaction(siteId, async (tx) => {
        const order = await lock(tx, siteId, orderId, null);
        if (!uuid(id))
          fail("ENTITLEMENT_NOT_FOUND", 404, "Entitlement unavailable.");
        const [e] = await rows(
          tx,
          sql`UPDATE commerce_buyer_entitlements SET revoked_at=clock_timestamp() WHERE site_id=${siteId}::uuid AND order_id=${orderId}::uuid AND id=${id}::uuid AND revoked_at IS NULL RETURNING id`,
        );
        if (e) await event(tx, siteId, orderId, id, "revoked", actorId);
        else {
          const [existing] = await rows(
            tx,
            sql`SELECT id FROM commerce_buyer_entitlements WHERE site_id=${siteId}::uuid AND order_id=${orderId}::uuid AND id=${id}::uuid`,
          );
          if (!existing)
            fail("ENTITLEMENT_NOT_FOUND", 404, "Entitlement unavailable.");
        }
        return project(tx, siteId, order);
      }),
    download: (siteId, orderId, id, hash, read) =>
      transaction(siteId, async (tx) => {
        const order = await lock(tx, siteId, orderId, hash);
        if (!paid(order))
          fail(
            "BUYER_PAYMENT_HELD",
            403,
            "Payment is not eligible for downloads.",
          );
        if (!uuid(id))
          fail("ENTITLEMENT_NOT_FOUND", 404, "Entitlement unavailable.");
        const [e] = await rows(
          tx,
          sql`SELECT e.*,f.filename,f.size_bytes,f.storage_path,f.binary_fingerprint,f.storage_identity,f.storage_provider,f.state AS file_state FROM commerce_buyer_entitlements e JOIN commerce_digital_files f ON f.id=e.file_id AND f.site_id=e.site_id WHERE e.site_id=${siteId}::uuid AND e.order_id=${orderId}::uuid AND e.id=${id}::uuid FOR UPDATE OF e`,
        );
        if (
          !e ||
          e.revoked_at ||
          e.file_state !== "active" ||
          !/^[a-f0-9]{64}$/.test(e.storage_identity || "") ||
          new Date(e.expires_at).getTime() <= Date.now() ||
          e.downloads >= e.max_downloads
        )
          fail(
            "BUYER_DOWNLOAD_DENIED",
            403,
            "Download is revoked, expired or exhausted.",
          );
        const result = await read({
          filename: e.filename,
          sizeBytes: e.size_bytes,
          storagePath: e.storage_path,
          binaryFingerprint: e.binary_fingerprint,
          storageIdentity: e.storage_identity,
          storageProvider: e.storage_provider,
        });
        // Recheck expiry after the bounded storage read; failed bytes consume no allowance.
        if (
          new Date(e.expires_at).getTime() <= Date.now() ||
          Date.parse(String(order.values.statusaccesstokenexpiresat)) <=
            Date.now()
        )
          fail(
            "BUYER_DOWNLOAD_DENIED",
            403,
            "Download proof expired during storage retrieval.",
          );
        await tx.execute(
          sql`UPDATE commerce_buyer_entitlements SET downloads=downloads+1 WHERE id=${id}::uuid`,
        );
        await event(tx, siteId, orderId, id, "download.admitted", null);
        return result;
      }),
  };
}

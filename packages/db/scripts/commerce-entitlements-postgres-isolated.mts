#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from "node:assert/strict";
import * as core from "@backy-cms/core";
import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, randomUUID } from "node:crypto";
import postgres from "postgres";
import { createStorageAdapter } from "@backy/storage";
import pg from "pg";
import { drizzle as nativeDrizzle } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/schema/index.ts";
import { createDatabaseRepositories } from "../src/repositories/factory.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const Ajv2020 = createRequire(
  new URL("../../../apps/public/package.json", import.meta.url),
)("ajv/dist/2020.js").default;
import {
  loadMediaFixture,
  installActualMediaRecovery,
} from "../../../apps/public/scripts/media-storage-recovery-fixture.mts";

if (process.argv.length > 2)
  throw new Error("This test accepts no database target arguments.");
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const binaryDirectory =
  process.env.BACKY_POSTGRES_BIN_DIR || "/opt/homebrew/bin";
for (const binary of ["initdb", "pg_ctl", "psql", "postgres"])
  assert(
    existsSync(join(binaryDirectory, binary)),
    `Missing local PostgreSQL binary: ${binary}`,
  );
const clusterRoot = mkdtempSync("/tmp/backy-buyer-postgres-");
const data = join(clusterRoot, "cluster"),
  socket = join(clusterRoot, "socket"),
  log = join(clusterRoot, "postgres.log");
const port = randomInt(20000, 60000),
  username = "backy_fixture",
  clients = [];
const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !key.startsWith("PG") &&
      !["DATABASE_URL", "BACKY_DATABASE_URL"].includes(key),
  ),
);
// Postgres.js also reads PG* defaults directly. Clear them inside this test process only.
for (const key of Object.keys(process.env))
  if (
    key.startsWith("PG") ||
    ["DATABASE_URL", "BACKY_DATABASE_URL"].includes(key)
  )
    delete process.env[key];
let cleanupPromise;
function run(binary, args, label) {
  try {
    return execFileSync(join(binaryDirectory, binary), args, {
      env: environment,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `${label}: ${String(error.stderr || error.message)
        .trim()
        .split("\n")
        .slice(-3)
        .join(" ")}`,
    );
  }
}
function cleanup() {
  return (cleanupPromise ||= (async () => {
    await Promise.allSettled(
      clients.map((client) => client.end({ timeout: 2 })),
    );
    // The only directory we may stop/remove was created by this invocation.
    assert(/^\/tmp\/backy-buyer-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
    if (existsSync(join(data, "postmaster.pid")))
      run(
        "pg_ctl",
        ["-D", data, "-m", "fast", "-w", "-t", "15", "stop"],
        "Stopping owned temporary cluster",
      );
    assert(
      !existsSync(join(data, "postmaster.pid")),
      "Owned cluster still running; its directory was retained",
    );
    rmSync(clusterRoot, { recursive: true, force: true });
  })());
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(130));
  });
const connection = (name) => {
  const client = postgres({
    host: socket,
    port,
    username,
    database: "postgres",
    max: 5,
    connect_timeout: 5,
    connection: { application_name: name },
    onnotice() {},
  });
  clients.push(client);
  return client;
};
const bundle = (client) =>
  createDatabaseRepositories({
    adapter: {
      type: "postgres",
      db: drizzle(client, { schema }),
      isConnected: async () => true,
      close: async () => {},
    },
  });
try {
  run(
    "initdb",
    [
      "-D",
      data,
      "--username",
      username,
      "--encoding",
      "UTF8",
      "--no-locale",
      "--auth-local",
      "trust",
      "--auth-host",
      "reject",
    ],
    "Initializing owned temporary cluster",
  );
  mkdirSync(socket, { mode: 0o700 });
  writeFileSync(
    join(data, "postgresql.auto.conf"),
    `listen_addresses = ''\nunix_socket_directories = '${socket}'\nport = ${port}\nmax_connections = 20\n`,
  );
  run(
    "pg_ctl",
    ["-D", data, "-l", log, "-w", "-t", "15", "start"],
    "Starting owned socket-only cluster",
  );
  const psql = [
    "-X",
    "--no-password",
    "-h",
    socket,
    "-p",
    String(port),
    "-U",
    username,
    "-d",
    "postgres",
    "--set",
    "ON_ERROR_STOP=1",
  ];
  run(
    "psql",
    [
      ...psql,
      "-c",
      `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`,
    ],
    "Bootstrapping isolated Supabase role/auth fixtures",
  );
  const migrations = readdirSync(join(repositoryRoot, "supabase/migrations"))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const migration of migrations)
    run(
      "psql",
      [...psql, "-f", join(repositoryRoot, "supabase/migrations", migration)],
      `Applying actual ${migration}`,
    );
  assert(migrations.includes("015_template_revision_history.sql"));
  assert(migrations.includes("016_explicit_operator_profile_provisioning.sql"));

  const sqlA = connection("buyer-a"),
    sqlB = connection("buyer-b"),
    owner = connection("buyer-owner"),
    a = bundle(sqlA),
    b = bundle(sqlB);
  const team = (
    await a.teams.create({
      name: "Synthetic buyer team",
      slug: "buyer-team",
      ownerId: null,
    })
  ).item;
  const site = (
      await a.sites.create({
        teamId: team.id,
        name: "Synthetic buyer site",
        slug: "buyer-site",
        status: "published",
        isPublished: true,
      })
    ).item,
    foreign = (
      await a.sites.create({
        teamId: team.id,
        name: "Foreign buyer",
        slug: "buyer-foreign",
        status: "published",
        isPublished: true,
      })
    ).item;
  await owner`UPDATE sites SET is_published=true WHERE id IN (${site.id},${foreign.id})`;
  const productCollection = randomUUID(),
    orderCollection = randomUUID(),
    productId = randomUUID(),
    orderId = randomUUID();
  await owner`INSERT INTO content_collections(id,site_id,name,slug,status,permissions) VALUES(${productCollection},${site.id},'Products','products','published','{"publicRead":true}'),(${orderCollection},${site.id},'Orders','orders','published','{"publicRead":false}')`;
  await owner`INSERT INTO content_collection_records(id,site_id,collection_id,slug,status,values) VALUES(${productId},${site.id},${productCollection},'digital','published','{"producttype":"digital"}')`;
  const repo = a.commerceEntitlements!,
    other = b.commerceEntitlements!,
    fileId = randomUUID(),
    token = "synthetic-checkout-proof-0123456789",
    hash = createHash("sha256")
      .update(`backy.order-status:${site.id}:${token}`)
      .digest("hex");
  await repo.beginFileUpload(
    site.id,
    productId,
    {
      id: fileId,
      filename: "guide.pdf",
      sizeBytes: 3,
      binaryFingerprint: createHash("sha256").update("ABC").digest("hex"),
      storagePath: `sites/${site.id}/products/${productId}/${fileId}`,
      storageIdentity: "1".repeat(64),
      storageProvider: "local",
      expiresDays: 30,
      maxDownloads: 2,
    },
    null,
  );
  const asset = await repo.registerFile(
    site.id,
    productId,
    {
      id: fileId,
      jobId: fileId,
      filename: "guide.pdf",
      sizeBytes: 3,
      binaryFingerprint: createHash("sha256").update("ABC").digest("hex"),
      storagePath: `sites/${site.id}/products/${productId}/${fileId}`,
      expiresDays: 30,
      maxDownloads: 2,
    },
    null,
  );
  let checks = 0;
  assert.equal((await repo.currentFile(site.id, productId))!.id, fileId);
  assert.equal(await repo.currentFile(foreign.id, productId), null);
  checks += 2;
  await assert.rejects(
    repo.registerFile(
      foreign.id,
      productId,
      {
        id: randomUUID(),
        filename: "wrong.pdf",
        sizeBytes: 3,
        binaryFingerprint: createHash("sha256").update("ABC").digest("hex"),
        storagePath: `sites/${foreign.id}/products/${productId}/${randomUUID()}`,
        expiresDays: 30,
        maxDownloads: 2,
      },
      null,
    ),
  );
  checks++;
  let values: any = {
    items: JSON.stringify([{ productId, digitalFileId: fileId }]),
    paymentstatus: "pending",
    orderstatus: "pending",
    providerrefundstatus: "none",
    statusaccesstokenhash: hash,
    statusaccesstokenissuedat: new Date().toISOString(),
    statusaccesstokenexpiresat: new Date(Date.now() + 86400000).toISOString(),
  };
  await owner`INSERT INTO content_collection_records(id,site_id,collection_id,slug,status,values) VALUES(${orderId},${site.id},${orderCollection},'buyer-order','published',${owner.json(values)})`;
  const save = async (patch: any) => {
    values = { ...values, ...patch };
    await owner`UPDATE content_collection_records SET values=${owner.json(values)} WHERE id=${orderId}`;
  };
  assert.equal(
    (await repo.order(site.id, orderId, hash)).entitlements.length,
    0,
  );
  checks++;
  await save({ providerpaymentstatus: "accepted" });
  assert.equal(
    (await repo.order(site.id, orderId, hash)).entitlements.length,
    0,
  );
  checks++;
  await assert.rejects(repo.order(site.id, orderId, "0".repeat(64)));
  await assert.rejects(repo.order(foreign.id, orderId, hash));
  checks += 2;
  await save({ paymentstatus: "paid", orderstatus: "paid" });
  const issued = await repo.order(site.id, orderId, hash),
    entitlementId = issued.entitlements[0].id;
  assert.equal(issued.entitlements[0].state, "active");
  assert.equal(
    (await repo.order(site.id, orderId, hash)).entitlements.length,
    1,
  );
  assert.equal(issued.history.filter((e) => e.kind === "issued").length, 1);
  checks += 3;
  let reads = 0;
  const bytes = async () => {
    reads++;
    return Buffer.from("ABC");
  };
  await assert.rejects(
    repo.download(site.id, orderId, entitlementId, hash, async () => {
      throw Error("synthetic storage failure");
    }),
  );
  assert.equal(
    (await repo.order(site.id, orderId, hash)).entitlements[0].downloads,
    0,
  );
  checks++;
  const competing = await Promise.allSettled([
    repo.download(site.id, orderId, entitlementId, hash, bytes),
    other.download(site.id, orderId, entitlementId, hash, bytes),
    other.download(site.id, orderId, entitlementId, hash, bytes),
  ]);
  assert.equal(competing.filter((v) => v.status === "fulfilled").length, 2);
  assert.equal(reads, 2);
  assert.equal(
    (await repo.order(site.id, orderId, hash)).entitlements[0].state,
    "exhausted",
  );
  checks += 3;
  await owner`UPDATE commerce_buyer_entitlements SET downloads=0 WHERE id=${entitlementId}`;
  await save({ providerrefundstatus: "requested" });
  await assert.rejects(
    repo.download(site.id, orderId, entitlementId, hash, bytes),
  );
  assert.equal(
    (await repo.order(site.id, orderId, hash)).entitlements[0].state,
    "payment-held",
  );
  checks += 2;
  await save({ providerrefundstatus: "none", refundamount: 1 });
  await assert.rejects(
    repo.download(site.id, orderId, entitlementId, hash, bytes),
  );
  checks++;
  await save({ refundamount: 0, paymentstatus: "refunded" });
  await assert.rejects(
    repo.download(site.id, orderId, entitlementId, hash, bytes),
  );
  checks++;
  await save({ paymentstatus: "paid" });
  await owner`UPDATE commerce_buyer_entitlements SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${entitlementId}`;
  await assert.rejects(
    repo.download(site.id, orderId, entitlementId, hash, bytes),
  );
  checks++;
  await owner`UPDATE commerce_buyer_entitlements SET expires_at=clock_timestamp()+interval '1 day' WHERE id=${entitlementId}`;
  // Actual handlers use the real repository and a local private storage fixture, zero provider requests.
  const privateObjects = new Map<string, Buffer>([
    [`sites/${site.id}/products/${productId}/${fileId}`, Buffer.from("ABC")],
  ]);
  let denied = 0,
    storageReads = 0,
    storageCorrupt = false,
    uploads = 0,
    scans = 0,
    privateDeletes = 0,
    failDelete = false,
    failUploadAfterWrite = false,
    failStat = false,
    contextIdentity = "1".repeat(64),
    pauseUpload = false,
    enteredUpload: any,
    releaseUpload: any,
    uploadBarrier: Promise<void> | null = null;
  const env = { NODE_ENV: "test" },
    mocks: any = {
      "@backy-cms/core": core,
      "@/lib/repositoryRuntime": {
        shouldUseDemoStoreFallback: () => false,
        getRequiredDatabaseRepositories: async () => a,
      },
      "@/lib/adminAccess": {
        requireAdminAccess: async (_request: any, _id: any, options: any) => {
          assert(
            (options.permissions || [options.permission]).some(
              (v: string) => v === "commerce.view" || v === "commerce.edit",
            ),
          );
          return denied
            ? NextResponse.json({ success: false }, { status: denied })
            : { session: null };
        },
      },
      "@/lib/mediaSafety": {
        scanMediaUploadWithProviders: async () => {
          scans++;
          return { status: "clean" };
        },
      },
      "@/lib/commercePrivateStorage": {
        getCommercePrivateStorageContext: async () => ({
          storageIdentity: contextIdentity,
          storageProvider: "local",
          storage: {
            upload: async (bytes: any, options: any) => {
              uploads++;
              if (pauseUpload) {
                enteredUpload();
                await uploadBarrier;
              }
              privateObjects.set(options.path, Buffer.from(bytes));
              if (failUploadAfterWrite)
                throw Error("Synthetic provider response lost after write");
              return { path: options.path, size: bytes.length };
            },
            delete: async (path: string) => {
              privateDeletes++;
              if (failDelete) throw Error("Synthetic cleanup failure");
              privateObjects.delete(path);
            },
            stat: async (path: string) => {
              if (failStat) throw Error("Synthetic storage inventory failure");
              return privateObjects.has(path)
                ? { size: privateObjects.get(path)!.length }
                : null;
            },
            read: async (path: string) => {
              storageReads++;
              return storageCorrupt
                ? Buffer.from("DEF")
                : privateObjects.get(path)!;
            },
          },
        }),
      },
    };
  mocks["@/lib/backyStore"] = {
    getSiteByIdOrSlug: () => null,
    listMedia: () => [],
  };
  mocks["@/lib/collectionExportPagination"] = loadMediaFixture(
    "../src/lib/collectionExportPagination.ts",
    mocks,
    { env },
  );
  mocks["@/lib/mediaInventory"] = loadMediaFixture(
    "../src/lib/mediaInventory.ts",
    mocks,
    { env },
  );
  mocks["@/lib/mediaUploadReservationContext"] = loadMediaFixture(
    "../src/lib/mediaUploadReservationContext.ts",
    mocks,
    { env },
  );
  const actualRecovery = installActualMediaRecovery(
    mocks,
    a,
    clusterRoot + "/regular-storage",
    { env, cwd: () => clusterRoot },
  );
  mocks["@/lib/mediaStorageRecovery"] = {
    ...actualRecovery,
    mediaStorageUsageWithPending: async (sid: string, repositories: any) =>
      actualRecovery.mediaStorageUsageWithPending(sid, repositories),
  };
  mocks["@/lib/mediaStorageMutation"] = loadMediaFixture(
    "../src/lib/mediaStorageMutation.ts",
    mocks,
    { env },
  );
  mocks["@/lib/mediaUploadPolicy"] = loadMediaFixture(
    "../src/lib/mediaUploadPolicy.ts",
    mocks,
    { env },
  );
  mocks["@/lib/commercePrivateFileLifecycle"] = loadMediaFixture(
    "../src/lib/commercePrivateFileLifecycle.ts",
    mocks,
    { env },
    { setTimeout, clearTimeout },
  );
  mocks["@/lib/commerceEntitlementRoutes"] = loadMediaFixture(
    "../src/lib/commerceEntitlementRoutes.ts",
    mocks,
    { env },
  );
  const buyer = loadMediaFixture(
      "../src/app/api/sites/[siteId]/commerce/orders/[orderId]/entitlements/route.ts",
      mocks,
      { env },
    ),
    download = loadMediaFixture(
      "../src/app/api/sites/[siteId]/commerce/orders/[orderId]/entitlements/[entitlementId]/download/route.ts",
      mocks,
      { env },
      { setTimeout, clearTimeout },
    ),
    admin = loadMediaFixture(
      "../src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/entitlements/route.ts",
      mocks,
      { env },
    );
  const call = async (
    route: any,
    method: string,
    proof = token,
    extra: any = {},
  ) =>
    route[method](
      new NextRequest(
        "http://fixture.invalid/api/sites/" +
          site.slug +
          "/commerce/orders/" +
          orderId +
          "/entitlements",
        { method, headers: { "X-Backy-Order-Status-Token": proof }, ...extra },
      ),
      {
        params: Promise.resolve({ siteId: site.slug, orderId, entitlementId }),
      },
    );
  let response = await call(buyer, "GET");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.historyScope, "presented-order-proof");
  assert(!JSON.stringify(payload).includes("storagePath"));
  assert(!JSON.stringify(payload).includes(hash));
  assert(!JSON.stringify(payload).includes(token));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  checks += 6;
  response = await call(download, "POST");
  assert.equal(response.status, 200);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "ABC");
  assert.equal(
    response.headers.get("content-type"),
    "application/octet-stream",
  );
  assert(response.headers.get("content-disposition")!.includes("guide.pdf"));
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  checks += 5;
  await owner`UPDATE commerce_buyer_entitlements SET downloads=0 WHERE id=${entitlementId}`;
  storageCorrupt = true;
  assert.equal((await call(download, "POST")).status, 409);
  assert.equal(
    (await repo.order(site.id, orderId, hash)).entitlements[0].downloads,
    0,
  );
  checks += 2;
  storageCorrupt = false;
  storageReads = 1;
  assert.equal(
    (await call(download, "POST", "wrong-proof-01234567890123456789")).status,
    403,
  );
  assert.equal(storageReads, 1);
  checks += 2;
  for (denied of [401, 403]) {
    assert.equal((await call(admin, "GET")).status, denied);
    assert.equal(
      (
        await call(admin, "POST", token, {
          body: JSON.stringify({ action: "revoke", entitlementId }),
        })
      ).status,
      denied,
    );
    checks += 2;
  }
  denied = 0;
  assert.equal(
    (
      await call(admin, "POST", token, {
        body: JSON.stringify({ action: "revoke", entitlementId }),
      })
    ).status,
    200,
  );
  assert.equal((await call(download, "POST")).status, 403);
  assert.equal(storageReads, 1);
  assert.equal(
    (await repo.order(site.id, orderId, hash)).entitlements[0].state,
    "revoked",
  );
  checks += 4;
  // Actual shared central authorization, with synthetic credential persistence only.
  // Route handlers are real; no replacement guard makes admission decisions.
  let settingsWrites = 0,
    entitlementCalls = 0,
    session: any = null;
  const key = "synthetic-commerce-selected-site-key",
    keyId = randomUUID(),
    operatorId = randomUUID();
  let settings: any = {
    auth: {
      apiKeyServiceKeys: [
        {
          id: keyId,
          keyHash: createHash("sha256").update(key).digest("hex"),
          scope: {
            version: 1,
            revision: 1,
            mode: "selected-sites",
            siteIds: [site.id],
            permissions: ["commerce.view"],
            expiresAt: null,
          },
          lastUsedAt: null,
        },
      ],
    },
  };
  const guardRepositories: any = {
    ...a,
    settings: {
      get: async () => structuredClone(settings),
      update: async (patch: any) => {
        settingsWrites++;
        settings = { ...settings, ...patch };
        return { item: structuredClone(settings) };
      },
    },
    teams: {
      ...a.teams,
      listMembers: async () => ({
        items: [{ userId: operatorId, role: "admin" }],
        pagination: { total: 1, limit: 1, offset: 0, hasMore: false },
      }),
    },
    commerceEntitlements: {
      ...repo,
      order: async (...args: any[]) => {
        entitlementCalls++;
        return (repo.order as any)(...args);
      },
      currentFile: async (...args: any[]) => {
        entitlementCalls++;
        return (repo.currentFile as any)(...args);
      },
      revoke: async (...args: any[]) => {
        entitlementCalls++;
        return (repo.revoke as any)(...args);
      },
    },
  };
  const centralMocks: any = {
    ...mocks,
    "@/lib/repositoryRuntime": {
      shouldUseDemoStoreFallback: () => false,
      getRequiredDatabaseRepositories: async () => guardRepositories,
    },
    "@/lib/backyStore": {
      getAdminSettings: () => settings,
      getSiteByIdOrSlug: () => null,
      listAdminTeamMembers: () => [],
      listAdminUserPermissionOverrides: () => [],
      updateAdminSettings: () => {
        throw Error("Demo settings must not be used.");
      },
    },
    "@/lib/admin-auth/sessionStore": {
      getAdminSessionWithPersistence: async (token: string) =>
        token === "synthetic-operator-session" ? session : null,
      listAdminSessionPermissionOverrides: () => [],
    },
  };
  centralMocks["@/lib/adminPermissions"] = loadMediaFixture(
    "../src/lib/adminPermissions.ts",
    centralMocks,
    { env },
  );
  centralMocks["@/lib/adminServiceKeyScope"] = loadMediaFixture(
    "../src/lib/adminServiceKeyScope.ts",
    centralMocks,
    { env },
  );
  centralMocks["@/lib/adminOperatorSiteScope"] = loadMediaFixture(
    "../src/lib/adminOperatorSiteScope.ts",
    centralMocks,
    { env },
  );
  centralMocks["@/lib/admin-auth/sessionCookie"] = loadMediaFixture(
    "../src/lib/admin-auth/sessionCookie.ts",
    centralMocks,
    { env },
  );
  centralMocks["@/lib/admin-auth/cookieWriteOrigin"] = loadMediaFixture(
    "../src/lib/admin-auth/cookieWriteOrigin.ts",
    centralMocks,
    { env },
  );
  centralMocks["@/lib/adminAccess"] = loadMediaFixture(
    "../src/lib/adminAccess.ts",
    centralMocks,
    { env },
  );
  centralMocks["@/lib/commerceEntitlementRoutes"] = loadMediaFixture(
    "../src/lib/commerceEntitlementRoutes.ts",
    centralMocks,
    { env },
  );
  const centralOrder = loadMediaFixture(
    "../src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/entitlements/route.ts",
    centralMocks,
    { env },
  );
  const centralProduct = loadMediaFixture(
    "../src/app/api/admin/sites/[siteId]/commerce/products/[productId]/digital-file/route.ts",
    centralMocks,
    { env },
  );
  const centralCall = async (
    route: any,
    method: string,
    kind: string,
    sid = site.slug,
    headers: any = {},
  ) => {
    const suffix =
        kind === "orders"
          ? `orders/${orderId}/entitlements`
          : `products/${productId}/digital-file`,
      request = new NextRequest(
        `http://fixture.invalid/api/admin/sites/${sid}/commerce/${suffix}`,
        {
          method,
          headers,
          ...(method === "POST"
            ? {
                body:
                  kind === "orders"
                    ? JSON.stringify({ action: "revoke", entitlementId })
                    : "ABC",
              }
            : {}),
        },
      );
    const response = await route[method](request, {
      params: Promise.resolve({ siteId: sid, orderId, productId }),
    });
    return { response, request };
  };
  const keyHeaders = { "x-backy-admin-key": key };
  const beforeCalls = entitlementCalls,
    beforeReads = storageReads,
    beforeScans = scans,
    beforeUploads = uploads;
  for (const [route, kind] of [
    [centralOrder, "orders"],
    [centralProduct, "products"],
  ] as const) {
    assert.equal(
      centralMocks[
        "@/lib/adminServiceKeyScope"
      ].serviceKeySiteRouteIsClassified(
        `http://fixture.invalid/api/admin/sites/${site.slug}/commerce/${kind}/${kind === "orders" ? orderId : productId}/${kind === "orders" ? "entitlements" : "digital-file"}`,
      ),
      true,
    );
    checks++;
    for (const method of ["GET", "POST"]) {
      const noCredential = await centralCall(route, method, kind);
      assert.equal(noCredential.response.status, 401);
      assert.equal(noCredential.request.bodyUsed, false);
      checks += 2;
      const foreignScope = await centralCall(
        route,
        method,
        kind,
        foreign.slug,
        keyHeaders,
      );
      assert.equal(foreignScope.response.status, 403);
      assert.equal(
        (await foreignScope.response.json()).error.code,
        method === "POST"
          ? "FORBIDDEN_SERVICE_KEY_PERMISSION"
          : "FORBIDDEN_SITE_SCOPE",
      );
      assert.equal(foreignScope.request.bodyUsed, false);
      checks += 3;
    }
    const missingEdit = await centralCall(
      route,
      "POST",
      kind,
      site.slug,
      keyHeaders,
    );
    assert.equal(missingEdit.response.status, 403);
    assert.equal(
      (await missingEdit.response.json()).error.code,
      "FORBIDDEN_SERVICE_KEY_PERMISSION",
    );
    assert.equal(missingEdit.request.bodyUsed, false);
    checks += 3;
  }
  assert.equal(settingsWrites, 0);
  assert.equal(settings.auth.apiKeyServiceKeys[0].lastUsedAt, null);
  assert.equal(entitlementCalls, beforeCalls);
  assert.equal(storageReads, beforeReads);
  assert.equal(scans, beforeScans);
  assert.equal(uploads, beforeUploads);
  checks += 6;
  let admittedRead = await centralCall(
    centralProduct,
    "GET",
    "products",
    site.slug,
    keyHeaders,
  );
  assert.equal(admittedRead.response.status, 200);
  assert.equal(settingsWrites, 1);
  assert.equal(entitlementCalls, beforeCalls + 1);
  assert(settings.auth.apiKeyServiceKeys[0].lastUsedAt);
  checks += 4;
  // With full commerce capability, foreign scope must still deny without a usage touch.
  settings.auth.apiKeyServiceKeys[0].scope.permissions = [
    "commerce.view",
    "commerce.edit",
  ];
  const usageAfterRead = settingsWrites,
    calledAfterRead = entitlementCalls;
  for (const [route, kind] of [
    [centralOrder, "orders"],
    [centralProduct, "products"],
  ] as const) {
    const denied = await centralCall(
      route,
      "POST",
      kind,
      foreign.slug,
      keyHeaders,
    );
    assert.equal(denied.response.status, 403);
    assert.equal(
      (await denied.response.json()).error.code,
      "FORBIDDEN_SITE_SCOPE",
    );
    checks += 2;
  }
  assert.equal(settingsWrites, usageAfterRead);
  assert.equal(entitlementCalls, calledAfterRead);
  checks += 2;
  session = {
    token: "synthetic-operator-session",
    user: {
      id: operatorId,
      role: "admin",
      status: "active",
      email: "operator@example.test",
      name: "Synthetic operator",
    },
  };
  settings.auth.userSiteGrants = [
    {
      userId: operatorId,
      scope: {
        version: 1,
        revision: 1,
        mode: "selected-sites",
        grants: [{ siteId: site.id, permissions: ["commerce.view"] }],
        expiresAt: null,
      },
    },
  ];
  for (const [route, kind] of [
    [centralOrder, "orders"],
    [centralProduct, "products"],
  ] as const) {
    const headers = { authorization: "Bearer synthetic-operator-session" };
    const missing = await centralCall(route, "POST", kind, site.slug, headers);
    assert.equal(missing.response.status, 403);
    assert.equal(
      (await missing.response.json()).error.code,
      "FORBIDDEN_OPERATOR_SITE_PERMISSION",
    );
    const foreignDenied = await centralCall(
      route,
      "GET",
      kind,
      foreign.slug,
      headers,
    );
    assert.equal(foreignDenied.response.status, 403);
    assert.equal(
      (await foreignDenied.response.json()).error.code,
      "FORBIDDEN_SITE_SCOPE",
    );
    checks += 4;
  }
  assert.equal(entitlementCalls, calledAfterRead);
  assert.equal(settingsWrites, usageAfterRead);
  checks += 2;
  const permittedEdit = await centralCall(
    centralOrder,
    "POST",
    "orders",
    site.slug,
    keyHeaders,
  );
  assert.equal(permittedEdit.response.status, 200);
  assert.equal(settingsWrites, usageAfterRead + 1);
  assert.equal(entitlementCalls, calledAfterRead + 1);
  checks += 3;
  const permittedOperatorRead = await centralCall(
    centralOrder,
    "GET",
    "orders",
    site.slug,
    { authorization: "Bearer synthetic-operator-session" },
  );
  assert.equal(permittedOperatorRead.response.status, 200);
  assert.equal(settingsWrites, usageAfterRead + 1);
  assert.equal(entitlementCalls, calledAfterRead + 2);
  checks += 3;
  for (const [route, kind] of [
    [centralOrder, "orders"],
    [centralProduct, "products"],
  ] as const) {
    const denied = await centralCall(route, "POST", kind, site.slug, {
      cookie: "backy_admin_session=synthetic-operator-session",
      origin: "https://untrusted.fixture.invalid",
    });
    assert.equal(denied.response.status, 403);
    assert.equal(
      (await denied.response.json()).error.code,
      "ADMIN_COOKIE_ORIGIN_DENIED",
    );
    assert.equal(denied.request.bodyUsed, false);
    checks += 3;
  }
  assert.equal(settingsWrites, usageAfterRead + 1);
  assert.equal(entitlementCalls, calledAfterRead + 2);
  checks += 2;
  // Actual private upload route validates site/product before any storage side effect.
  const upload = loadMediaFixture(
    "../src/app/api/admin/sites/[siteId]/commerce/products/[productId]/digital-file/route.ts",
    mocks,
    { env },
  );
  const uploadCall = (pid = productId, query = "", bytes = "ABC") =>
    upload.POST(
      new NextRequest(
        "http://fixture.invalid/api/admin/sites/" +
          site.slug +
          "/commerce/products/" +
          pid +
          "/digital-file" +
          query,
        {
          method: "POST",
          headers: {
            "X-Backy-File-Name": "guide-v2.pdf",
            "Content-Type": "application/pdf",
          },
          body: bytes,
        },
      ),
      { params: Promise.resolve({ siteId: site.slug, productId: pid }) },
    );
  for (denied of [401, 403]) {
    assert.equal((await uploadCall()).status, denied);
    checks++;
  }
  denied = 0;
  assert.equal(uploads, 0);
  assert.equal(scans, 0);
  checks += 2;
  assert.equal((await uploadCall(randomUUID())).status, 404);
  assert.equal(uploads, 0);
  assert.equal(scans, 0);
  checks += 3;
  assert.equal((await uploadCall(productId, "?maxDownloads=101")).status, 400);
  assert.equal((await uploadCall(productId, "", "")).status, 400);
  assert.equal(uploads, 0);
  checks += 3;
  response = await uploadCall(productId, "", Buffer.alloc(3145729) as any);
  assert.equal(response.status, 413);
  assert.equal(scans, 0);
  assert.equal(uploads, 0);
  checks += 3;
  response = await uploadCall(productId, "", Buffer.alloc(3145728) as any);

  assert.equal(response.status, 201);
  const uploaded = await response.json();
  assert.equal(uploaded.data.file.filename, "guide-v2.pdf");
  assert.equal(uploaded.data.file.sizeBytes, 3145728);
  checks++;
  assert(!JSON.stringify(uploaded).includes("storagePath"));
  assert.equal(uploads, 1);
  assert.equal(scans, 1);
  assert.equal(
    (await repo.currentFile(site.id, productId))!.id,
    uploaded.data.file.id,
  );
  assert.equal(
    (await repo.order(site.id, orderId, hash)).entitlements[0].filename,
    "guide.pdf",
  );
  checks += 7;
  // Refund transaction waits for the admitted download to commit, then blocks the next request.
  await owner`UPDATE commerce_buyer_entitlements SET downloads=0,revoked_at=NULL WHERE id=${entitlementId}`;
  let enter: any, release: any;
  const started = new Promise<void>((r) => (enter = r)),
    barrier = new Promise<void>((r) => (release = r));
  const admitted = repo.download(
    site.id,
    orderId,
    entitlementId,
    hash,
    async () => {
      enter();
      await barrier;
      return Buffer.from("ABC");
    },
  );
  await started;
  let refundFinished = false;
  const refund = save({ paymentstatus: "refunded" }).then(() => {
    refundFinished = true;
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(refundFinished, false);
  release();
  assert.equal((await admitted).toString(), "ABC");
  await refund;
  await assert.rejects(
    other.download(site.id, orderId, entitlementId, hash, bytes),
  );
  checks += 3;
  await save({ paymentstatus: "paid", statusaccesstokenexpiresat: "invalid" });
  assert.equal((await call(buyer, "GET")).status, 403);
  checks++;
  await save({
    statusaccesstokenexpiresat: new Date(Date.now() + 86400000).toISOString(),
    paymentstatus: "paid",
  });
  const pool = new pg.Pool({
    host: socket,
    port,
    user: username,
    database: "postgres",
    max: 2,
    ssl: false,
  });
  try {
    const native = createDatabaseRepositories({
      adapter: {
        type: "postgres",
        db: nativeDrizzle(pool, { schema }),
        isConnected: async () => true,
        close: async () => {},
      },
    }).commerceEntitlements!;
    assert.equal(
      (await native.currentFile(site.id, productId))!.id,
      uploaded.data.file.id,
    );
    assert.equal((await native.order(site.id, orderId, hash)).orderId, orderId);
    checks += 2;
  } finally {
    await pool.end();
  }
  await owner`DELETE FROM content_collection_records WHERE id=${productId}`;
  assert.equal(
    (await repo.currentFile(site.id, productId))!.id,
    uploaded.data.file.id,
  );
  checks++;
  const roles =
    await owner`SELECT has_table_privilege('anon','commerce_buyer_entitlements','SELECT') AS anon,has_table_privilege('authenticated','commerce_digital_files','SELECT') AS authenticated`;
  assert.equal(roles[0].anon, false);
  assert.equal(roles[0].authenticated, false);
  checks += 2;
  await owner`INSERT INTO content_collection_records(id,site_id,collection_id,slug,status,values) VALUES(${productId},${site.id},${productCollection},'digital','published','{"producttype":"digital"}')`;
  // Durable private file lifecycle, exact provider identity, quota and source recovery routes.
  const lifecycle = loadMediaFixture(
    "../src/app/api/admin/sites/[siteId]/commerce/private-files/[fileId]/lifecycle/route.ts",
    mocks,
    { env },
    { setTimeout, clearTimeout },
  );
  const inventoryRoute = loadMediaFixture(
    "../src/app/api/admin/sites/[siteId]/commerce/private-files/route.ts",
    mocks,
    { env },
  );
  const lifecycleCall = (id: string, action = "recover", sid = site.slug) =>
    lifecycle.POST(
      new NextRequest(
        `http://fixture.invalid/api/admin/sites/${sid}/commerce/private-files/${id}/lifecycle`,
        { method: "POST", body: JSON.stringify({ action }) },
      ),
      { params: Promise.resolve({ siteId: sid, fileId: id }) },
    );
  const usageBefore = await repo.fileStorageUsage(site.id);
  assert.equal(
    await actualRecovery.mediaStorageUsageWithPending(site.id, a),
    usageBefore,
  );
  checks++;
  const providerBefore = uploads,
    scannerBefore = scans;
  (env as any).BACKY_SITE_MEDIA_QUOTA_BYTES = String(usageBefore + 2);
  response = await uploadCall();
  assert.equal(response.status, 413);
  assert.equal(uploads, providerBefore);
  assert.equal(scans, scannerBefore);
  checks += 3;
  delete (env as any).BACKY_SITE_MEDIA_QUOTA_BYTES;
  // Upload reaches provider storage, cleanup fails: retained journal reserves every byte.
  failUploadAfterWrite = true;
  failDelete = true;
  response = await uploadCall();
  assert.equal(response.status, 503);
  failUploadAfterWrite = false;
  checks++;
  const pending = (await repo.privateFileVersions(site.id, 100, 0)).items.find(
    (v) => v.cleanupPending && !v.protected,
  )!;
  assert(pending);
  const pendingJob = (await repo.privateFileJob(site.id, pending.id))!;
  assert.equal(pendingJob.state, "cleanup-pending");
  assert(privateObjects.has(pendingJob.storagePath));
  assert.equal(await repo.fileStorageUsage(site.id), usageBefore + 3);
  assert.equal(
    await actualRecovery.mediaStorageUsageWithPending(site.id, a),
    usageBefore + 3,
  );
  checks += 5;
  await assert.rejects(repo.assertPrivateFilesDeleted(site.id));
  await assert.rejects(owner`DELETE FROM sites WHERE id=${site.id}`);
  checks += 2;
  const deletesBefore = privateDeletes;
  contextIdentity = "2".repeat(64);
  response = await lifecycleCall(pending.id);
  assert.equal(response.status, 409);
  assert.equal(privateDeletes, deletesBefore);
  assert.equal(await repo.fileStorageUsage(site.id), usageBefore + 3);
  checks += 3;
  contextIdentity = "1".repeat(64);
  // Wrong same-size content and unverifiable provider inventory are retained, never deleted.
  failDelete = false;
  storageCorrupt = true;
  response = await lifecycleCall(pending.id);
  assert.equal(response.status, 409);
  assert.equal(privateDeletes, deletesBefore);
  checks += 2;
  storageCorrupt = false;
  failStat = true;
  response = await lifecycleCall(pending.id);
  assert.equal(response.status, 503);
  assert.equal(privateDeletes, deletesBefore);
  checks += 2;
  failStat = false;
  response = await lifecycleCall(pending.id);
  assert.equal(response.status, 200);
  assert(!privateObjects.has(pendingJob.storagePath));
  assert.equal(
    (await repo.privateFileJob(site.id, pending.id))!.state,
    "removed",
  );
  assert.equal(await repo.fileStorageUsage(site.id), usageBefore);
  checks += 4;
  // A lost registration response is recovered from committed metadata; its bytes are not erased.
  const registerOriginal = repo.registerFile;
  repo.registerFile = async (...args: any[]) => {
    await (registerOriginal as any)(...args);
    throw Error("Synthetic registration response lost");
  };
  const deletedBeforeRegistration = privateDeletes;
  response = await uploadCall();
  assert.equal(response.status, 201);
  const recoveredRegistration = await response.json();
  assert.equal(
    recoveredRegistration.data.completionWarning,
    "COMMERCE_PRIVATE_REGISTRATION_RESPONSE_RECOVERED",
  );
  assert.equal(privateDeletes, deletedBeforeRegistration);
  repo.registerFile = registerOriginal;
  checks += 3;
  const unpurchasedId = recoveredRegistration.data.file.id;
  assert.equal(
    (await repo.privateFileJob(site.id, unpurchasedId))!.state,
    "registered",
  );
  checks++;
  response = await lifecycleCall(unpurchasedId, "retire");
  assert.equal(response.status, 200);
  assert.equal(await repo.currentFile(site.id, productId), null);
  assert.equal(
    (await repo.privateFileJob(site.id, unpurchasedId))!.state,
    "removed",
  );
  checks += 3;
  // Pending checkout claims and entitlements protect old immutable versions, even after order deletion.
  const deletedBeforeProtected = privateDeletes;
  response = await lifecycleCall(fileId, "retire");
  assert.equal(response.status, 409);
  assert.equal(privateDeletes, deletedBeforeProtected);
  checks += 2;
  await owner`DELETE FROM content_collection_records WHERE id=${orderId}`;
  response = await lifecycleCall(fileId, "retire");
  assert.equal(response.status, 409);
  assert.equal(privateDeletes, deletedBeforeProtected);
  checks += 2;
  // Retired identity cannot appear in a new checkout snapshot, closing read/retire/create races.
  await assert.rejects(
    owner`INSERT INTO content_collection_records(id,site_id,collection_id,slug,status,values) VALUES(${randomUUID()},${site.id},${orderCollection},'retired-snapshot','published',${owner.json({ items: JSON.stringify([{ productId, digitalFileId: unpurchasedId }]) })})`,
  );
  checks++;
  response = await inventoryRoute.GET(
    new NextRequest(
      "http://fixture.invalid/api/admin/sites/" +
        site.slug +
        "/commerce/private-files",
    ),
    { params: Promise.resolve({ siteId: site.slug }) },
  );
  assert.equal(response.status, 200);
  const safeInventory = await response.json();
  assert(!JSON.stringify(safeInventory).includes("storagePath"));
  assert(!JSON.stringify(safeInventory).includes("storageIdentity"));
  assert(!JSON.stringify(safeInventory).includes("binaryFingerprint"));
  assert(safeInventory.data.files.find((v: any) => v.id === fileId).protected);
  checks += 5;
  assert.equal(
    (await lifecycleCall(pending.id, "recover", foreign.slug)).status,
    404,
  );
  checks++;
  // Actual private local bytes, not a memory-provider substitute, prove cleanup and claim races.
  const diskDirectory = join(clusterRoot, "private-commerce");
  mkdirSync(diskDirectory, { mode: 0o700 });
  const diskStorage = await createStorageAdapter({
      provider: "local",
      basePath: diskDirectory,
      publicUrl: "",
    }),
    diskIdentity = createHash("sha256")
      .update(
        JSON.stringify([
          "backy.commerce-private.v1",
          "local",
          realpathSync(diskDirectory),
        ]),
      )
      .digest("hex");
  const previousContext =
    mocks["@/lib/commercePrivateStorage"].getCommercePrivateStorageContext;
  mocks["@/lib/commercePrivateStorage"].getCommercePrivateStorageContext =
    async () => ({
      storage: diskStorage,
      storageIdentity: diskIdentity,
      storageProvider: "local",
    });
  const diskFile = async () => {
    const id = randomUUID(),
      path = `sites/${site.id}/products/${productId}/${id}`,
      input = {
        id,
        jobId: id,
        filename: "owned-local-proof.pdf",
        sizeBytes: 3,
        binaryFingerprint: createHash("sha256").update("ABC").digest("hex"),
        storagePath: path,
        storageIdentity: diskIdentity,
        storageProvider: "local",
        expiresDays: 30,
        maxDownloads: 5,
      };
    await repo.beginFileUpload(site.id, productId, input, null);
    await diskStorage.upload(Buffer.from("ABC"), {
      path,
      filename: input.filename,
    });
    await repo.registerFile(site.id, productId, input, null);
    return { id, path };
  };
  const disposableDisk = await diskFile();
  assert.equal((await diskStorage.read(disposableDisk.path)).toString(), "ABC");
  response = await lifecycleCall(disposableDisk.id, "retire");
  assert.equal(response.status, 200);
  assert.equal(await diskStorage.stat(disposableDisk.path), null);
  assert.equal(
    (await repo.privateFileJob(site.id, disposableDisk.id))!.state,
    "removed",
  );
  checks += 4;
  const racedDisk = await diskFile(),
    raceOrder = randomUUID();
  let enterRace: any, releaseRace: any;
  const raceStarted = new Promise<void>((r) => (enterRace = r)),
    raceBarrier = new Promise<void>((r) => (releaseRace = r));
  const orderAdmission = owner.begin(async (tx: any) => {
    await tx`SELECT id FROM commerce_digital_files WHERE id=${racedDisk.id} FOR SHARE`;
    enterRace();
    await raceBarrier;
    await tx`INSERT INTO content_collection_records(id,site_id,collection_id,slug,status,values) VALUES(${raceOrder},${site.id},${orderCollection},'pending-race','published',${tx.json({ paymentstatus: "pending", items: JSON.stringify([{ productId, digitalFileId: racedDisk.id }]) })})`;
  });
  await raceStarted;
  let retirementFinished = false;
  const retirement = lifecycleCall(racedDisk.id, "retire").then((r) => {
    retirementFinished = true;
    return r;
  });
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(retirementFinished, false);
  releaseRace();
  await orderAdmission;
  response = await retirement;
  assert.equal(response.status, 409);
  assert.equal((await diskStorage.read(racedDisk.path)).toString(), "ABC");
  assert(
    (await repo.privateFileVersions(site.id, 100, 0)).items.find(
      (v) => v.id === racedDisk.id,
    )!.protected,
  );
  checks += 4;
  await owner`DELETE FROM content_collection_records WHERE id=${raceOrder}`;
  response = await lifecycleCall(racedDisk.id, "retire");
  assert.equal(response.status, 409);
  assert.equal((await diskStorage.read(racedDisk.path)).toString(), "ABC");
  checks += 2;
  mocks["@/lib/commercePrivateStorage"].getCommercePrivateStorageContext =
    previousContext;
  // The same site admission serializes ordinary media and private upload reservations.
  const beforePausedUsage = await repo.fileStorageUsage(site.id),
    pausedStarted = new Promise<void>((r) => (enteredUpload = r));
  uploadBarrier = new Promise<void>((r) => (releaseUpload = r));
  pauseUpload = true;
  const pausedUpload = uploadCall();
  await pausedStarted;
  const stagedDuringUpload = (
    await repo.privateFileVersions(site.id, 100, 0)
  ).items.find((v) => v.state === "planned" && v.cleanupPending)!;
  assert(stagedDuringUpload);
  const stagedJob = (await repo.privateFileJob(
    site.id,
    stagedDuringUpload.id,
  ))!;
  assert.equal(stagedJob.state, "planned");
  assert(!privateObjects.has(stagedJob.storagePath));
  assert.equal(
    await actualRecovery.mediaStorageUsageWithPending(site.id, a),
    beforePausedUsage + 3,
  );
  checks += 4;
  let ordinaryAdmitted = 0;
  const ordinary = mocks["@/lib/mediaStorageMutation"].withMediaStorageMutation(
    b.media,
    site.id,
    "synthetic-ordinary-media",
    async () => {
      ordinaryAdmitted++;
      return "unexpected";
    },
  );
  const blockedOrdinary = await ordinary;
  assert.equal(blockedOrdinary.status, 503);
  assert.equal(ordinaryAdmitted, 0);
  checks += 2;
  pauseUpload = false;
  releaseUpload();
  response = await pausedUpload;
  assert.equal(response.status, 201);
  assert.equal(
    (await repo.privateFileJob(site.id, stagedJob.id))!.state,
    "registered",
  );
  checks += 2;
  console.log(
    JSON.stringify({
      suite: "commerce-entitlements-postgres-isolated",
      checks,
      providerRequests: 0,
      configuredDatabaseRead: false,
      scope: "presented-order-proof;actual-routes;isolated-PostgreSQL",
    }),
  );
} finally {
  await cleanup();
}

import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { loadMediaFixture } from "./media-storage-recovery-fixture.mts";
const directory = mkdtempSync("/tmp/backy-commerce-private-storage-");
let checks = 0;
try {
  const publicPath = directory + "/public";
  mkdirSync(publicPath);
  let bucketPublic = false,
    failLookup = false,
    bucketCalls = 0,
    configuration: any;
  const config: any = {
    provider: "supabase",
    url: "https://synthetic.invalid",
    key: "synthetic-not-a-key",
    bucket: "already-private",
  };
  const mocks: any = {
    "@/lib/mediaStorage": { resolveMediaStorageConfig: () => ({ config }) },
    "@backy/storage": {
      createStorageAdapter: async (value: any) => {
        configuration = value;
        return { provider: value.provider };
      },
    },
    "@supabase/supabase-js": {
      createClient: () => ({
        storage: {
          getBucket: async () => {
            bucketCalls++;
            return failLookup
              ? { error: {} }
              : { data: { public: bucketPublic } };
          },
        },
      }),
    },
  };
  const env: any = {};
  const storage = loadMediaFixture(
    "../src/lib/commercePrivateStorage.ts",
    mocks,
    { env, cwd: () => directory },
  );
  await storage.getCommercePrivateStorage();
  assert.equal(configuration.bucket, "already-private");
  assert.equal(bucketCalls, 1);
  checks += 2;
  bucketPublic = true;
  await assert.rejects(storage.getCommercePrivateStorage());
  checks++;
  bucketPublic = false;
  failLookup = true;
  await assert.rejects(storage.getCommercePrivateStorage());
  checks++;
  failLookup = false;
  env.BACKY_COMMERCE_PRIVATE_BUCKET = "separate-private";
  await storage.getCommercePrivateStorage();
  assert.equal(configuration.bucket, "separate-private");
  checks++;
  config.provider = "local";
  config.basePath = publicPath;
  config.publicUrl = "/uploads";
  delete env.BACKY_COMMERCE_PRIVATE_BUCKET;
  await storage.getCommercePrivateStorage();
  assert.equal(
    configuration.basePath,
    realpathSync(directory) + "/.backy-private/commerce",
  );
  assert.equal(configuration.publicUrl, "");
  checks += 2;
  env.BACKY_COMMERCE_PRIVATE_DIR = publicPath + "/commerce";
  await assert.rejects(storage.getCommercePrivateStorage());
  checks++;
  symlinkSync(publicPath, directory + "/linked-public", "dir");
  env.BACKY_COMMERCE_PRIVATE_DIR = directory + "/linked-public/commerce";
  await assert.rejects(storage.getCommercePrivateStorage());
  checks++;
  console.log(
    JSON.stringify({
      suite: "commerce-private-storage",
      checks,
      providerRequests: 0,
      scope: "actual-storage-privacy-admission;mocked-provider-metadata",
    }),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}

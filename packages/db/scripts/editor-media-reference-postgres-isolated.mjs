#!/usr/bin/env node
import {verifyEditorMediaReferenceRacePostgres} from "../../../apps/public/scripts/editor-media-reference-race-smoke.mjs";
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, randomUUID, createHash } from "node:crypto";
import postgres from "postgres";
import { tsImport } from "tsx/esm/api";
import { createDatabaseAdapter } from "../dist/adapters/index.js";
import { createDatabaseRepositories } from "../dist/repositories/index.js";
import {
  createBackyContentDocument,
  BackyContentConflictError,
} from "../../core/dist/index.mjs";

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
const clusterRoot = mkdtempSync("/tmp/backy-editor-media-reference-postgres-");
const data = join(clusterRoot, "cluster"),
  socket = join(clusterRoot, "socket"),
  log = join(clusterRoot, "postgres.log");
const port = randomInt(20000, 60000),
  username = "backy_fixture",
  clients = [], adapters = [];
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
    await Promise.allSettled([ ...clients.map((client) => client.end({ timeout: 2 })), ...adapters.map(adapter => adapter.close()) ]);
    // The only directory we may stop/remove was created by this invocation.
    assert(
      /^\/tmp\/backy-editor-media-reference-postgres-[A-Za-z0-9]+$/.test(
        clusterRoot,
      ),
    );
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
    max: 1,
    connect_timeout: 5,
    connection: { application_name: name },
    onnotice() {},
  });
  clients.push(client);
  return client;
};
const bundle = async () => {
  const adapter = await createDatabaseAdapter({ type: "postgres", url: `postgresql://${username}@localhost:${port}/postgres?host=${encodeURIComponent(socket)}` });
  adapters.push(adapter);
  return createDatabaseRepositories({ adapter });
};
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

  const owner = connection("backy-content-cas-lock-holder"),
    monitor = connection("backy-content-cas-monitor"),
    sqlA = connection("backy-content-cas-writer-a"),
    sqlB = connection("backy-content-cas-writer-b");
  await Promise.all([
    owner`SELECT 1`,
    monitor`SELECT 1`,
    sqlA`SELECT 1`,
    sqlB`SELECT 1`,
  ]);
  const [identity] =
    await owner`SELECT current_user, current_database(), current_setting('listen_addresses') AS listeners, current_setting('data_directory') AS directory`;
  assert.equal(identity.current_user, username);
  assert.equal(identity.current_database, "postgres");
  assert.equal(identity.listeners, "");
  assert.equal(identity.directory, data);
  const a = await bundle(),
    b = await bundle();
  let checks = 0;
  const team = (
    await a.teams.create({
      name: "Disposable CAS team",
      slug: "cas-team",
      ownerId: null,
    })
  ).item;
  const site = (
    await a.sites.create({
      teamId: team.id,
      name: "Disposable CAS site",
      slug: "cas-site",
      status: "draft",
    })
  ).item;
  checks = await verifyEditorMediaReferenceRacePostgres({repositories:a,competing:b,sql:owner,site});
  console.log(`Atomic document/media PostgreSQL safety gate passed ${checks} checks; ${migrations.length} actual migrations.`);
} catch (error) {
  console.error(
    `Disposable editor media reference PostgreSQL proof failed: ${String(error.stack || error.message).split("\n").slice(0, 7).join("\n")}`,
  );
  process.exitCode = 1;
} finally {
  await cleanup();
  console.log(
    "Owned editor media reference PostgreSQL cluster stopped and removed. Existing database configuration was not used.",
  );
}

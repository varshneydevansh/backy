import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../dist/schema/index.js";
import { createDatabaseRepositories } from "../dist/repositories/index.js";
import {
  serializeTemplateRevisionValue,
  unrelatedSiteSettingsPatch,
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
const clusterRoot = mkdtempSync("/tmp/backy-form-template-postgres-");
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
    assert(
      /^\/tmp\/backy-form-template-postgres-[A-Za-z0-9]+$/.test(clusterRoot),
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
const fingerprint = (value) =>
  createHash("sha256")
    .update(serializeTemplateRevisionValue(value))
    .digest("hex");
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

  const owner = connection("backy-history-lock-holder"),
    monitor = connection("backy-history-monitor"),
    sqlA = connection("backy-history-writer-a"),
    sqlB = connection("backy-history-writer-b");
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
  const a = bundle(sqlA),
    b = bundle(sqlB);

  const require = createRequire(import.meta.url),
    cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    vm.runInNewContext(
      ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      {
        module,
        exports: module.exports,
        Object,
        JSON,
        structuredClone,
        URL,
        Buffer,
        process,
        console,
        require: (id) =>
          id === "./backyStore" || id === "@/lib/backyStore"
            ? {}
            : id.startsWith("./")
              ? load(resolve(dirname(file), id + ".ts"))
              : require(id),
      },
      { filename: file },
    );
    return module.exports;
  }
  const helper = load(
    join(repositoryRoot, "apps/public/src/lib/formTemplatePackImport.ts"),
  );

  const [team] =
    await owner`INSERT INTO public.teams(name,slug) VALUES ('Disposable form import team','form-import-proof') RETURNING id`;
  const site = (
    await a.sites.create({
      teamId: team.id,
      name: "Form import proof",
      slug: "form-import-proof",
      status: "draft",
      settings: {},
    })
  ).item;
  const foreign = (
    await a.sites.create({
      teamId: team.id,
      name: "Foreign import proof",
      slug: "form-import-foreign",
      status: "draft",
      settings: {},
    })
  ).item;
  const make = (id) => ({
    schemaVersion: "backy.form-template.v1",
    id,
    title: id,
    audience: "public",
    isActive: true,
    fields: [
      {
        key: "email",
        label: "Email",
        type: "email",
        unknown: { keep: [false, 0] },
      },
    ],
    settings: { extension: { keep: true } },
    unknownManifest: { retain: true },
  });
  const body = {
    action: "review",
    pack: {
      schemaVersion: "backy.form-template-pack.v1",
      site: { id: foreign.id },
      builtInTemplates: [make("first"), make("second")],
    },
    selection: ["builtin:first", "builtin:second"],
    names: {},
    references: {},
    acknowledgeUnverified: false,
  };
  const input = helper.parseFormTemplatePackRequest(body);
  const review = helper.reviewFormTemplatePack(
    input,
    await helper.readFormPackInventory(site.id, input, a),
  );
  let checks = 0;
  assert(review.canApply);
  assert.equal((await a.forms.list({ siteId: site.id })).pagination.total, 0);
  checks += 2;
  const apply = {
    ...input,
    action: "apply",
    reviewVersion: review.reviewVersion,
  };
  await owner.unsafe(
    `CREATE FUNCTION form_import_reject_second() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='second' THEN RAISE EXCEPTION 'PRIVATE synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER form_import_reject_second BEFORE INSERT ON form_definitions FOR EACH ROW EXECUTE FUNCTION form_import_reject_second()`,
  );
  await assert.rejects(helper.applyFormTemplatePack(apply, site.id, null, a));
  assert.equal((await a.forms.list({ siteId: site.id })).pagination.total, 0);
  checks += 2;
  await owner.unsafe(
    "DROP TRIGGER form_import_reject_second ON form_definitions; DROP FUNCTION form_import_reject_second()",
  );
  // Canonical destination and semantic snapshots prevent a reviewed package being applied after any current form mutation.
  const existing = (
    await b.forms.create({
      siteId: site.id,
      name: "other-current",
      audience: "public",
      isActive: false,
      fields: [],
      settings: { extension: { keep: true } },
    })
  ).item;
  await assert.rejects(
    helper.applyFormTemplatePack(apply, site.id, null, a),
    (e) => e.code === "FORM_TEMPLATE_REVIEW_STALE",
  );
  assert.equal((await a.forms.list({ siteId: site.id })).pagination.total, 1);
  checks += 2;
  const current = helper.reviewFormTemplatePack(
    input,
    await helper.readFormPackInventory(site.id, input, a),
  );
  const success = await helper.applyFormTemplatePack(
    { ...apply, reviewVersion: current.reviewVersion },
    site.id,
    null,
    a,
  );
  assert.equal(success.forms.length, 2);
  assert.equal(
    success.concurrencyBoundary,
    "database-serializable-transaction",
  );
  checks += 2;
  for (const entry of success.forms) {
    const persisted = await a.forms.getById(site.id, entry.form.id);
    assert.equal(persisted.isActive, false);
    assert.equal(persisted.pageId, null);
    assert.equal(persisted.siteId, site.id);
    assert.deepEqual(persisted.fields[0].unknown, { keep: [false, 0] });
    assert.deepEqual(
      persisted.settings.formTemplateImport.manifest.unknownManifest,
      { retain: true },
    );
    assert.equal(await a.forms.getById(foreign.id, entry.form.id), null);
    checks += 6;
  }
  // Two independent clients apply exactly the same reviewed names. One admission succeeds; the other conflicts, never duplicate names/partial rows.
  const concurrent = helper.parseFormTemplatePackRequest({
      ...body,
      names: {
        "builtin:first": "concurrent-first",
        "builtin:second": "concurrent-second",
      },
    }),
    preview = helper.reviewFormTemplatePack(
      concurrent,
      await helper.readFormPackInventory(site.id, concurrent, a),
    );
  const results = await Promise.allSettled([
    helper.applyFormTemplatePack(
      { ...concurrent, action: "apply", reviewVersion: preview.reviewVersion },
      site.id,
      null,
      a,
    ),
    helper.applyFormTemplatePack(
      { ...concurrent, action: "apply", reviewVersion: preview.reviewVersion },
      site.id,
      null,
      b,
    ),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const rejected = results.find((x) => x.status === "rejected");
  assert(
    ["40001", "FORM_TEMPLATE_REVIEW_STALE"].includes(rejected.reason.code),
  );
  const forms = (await a.forms.list({ siteId: site.id })).items;
  assert.equal(forms.filter((x) => x.name === "concurrent-first").length, 1);
  assert.equal(forms.filter((x) => x.name === "concurrent-second").length, 1);
  checks += 4;
  // The ordinary adapter cannot claim atomic import capability when not PostgreSQL.
  const unavailable = createDatabaseRepositories({
    adapter: {
      type: "sqlite",
      db: drizzle(sqlA, { schema }),
      isConnected: async () => true,
      close: async () => {},
    },
  });
  await assert.rejects(
    helper.applyFormTemplatePack(
      { ...concurrent, action: "apply", reviewVersion: preview.reviewVersion },
      site.id,
      null,
      unavailable,
    ),
    (e) => e.code === "FORM_TEMPLATE_IMPORT_UNAVAILABLE",
  );
  checks++;
  console.log(
    `Form template pack isolated PostgreSQL admission passed ${checks} checks (${migrations.length} actual migrations): late second insert rollback, fresh inventory conflict, canonical inactive standalone fields/extensions, foreign denial, independent writer same-review conflict and unsupported-adapter refusal. Owned socket-only cluster; no configured DB.`,
  );
} finally {
  await cleanup();
}

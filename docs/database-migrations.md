# Canonical database migrations

## Application PostgreSQL connections

The application adapter uses Drizzle with node-postgres. Its pool has five connections per warm adapter and disables query pipelining. Existing media and backup admission guards may hold up to four connections while their callbacks commit through another connection; reducing this pool to one would deadlock those operations. Transactions own a checked-out connection through completion, validate the COMMIT acknowledgement, and release or discard it on failure. Unnamed parameterized statements are compatible with transaction-mode poolers. Migration commands below retain their separate stable-session requirements.

For an endpoint whose CA is absent from Node's default trust store, configure the complete provider CA PEM as server-only `BACKY_DATABASE_SSL_CA_PEM`. Download it from the provider's documented certificate source and verify it against the intended endpoint. Explicit CA configuration retains certificate and hostname verification; conflicting URL client-certificate/root-certificate settings must be resolved explicitly. Do not copy a local certificate file path into a serverless connection URL. A configured CA or successful read-only connection does not prove writes, revisions, rollback, or deployment acceptance.

## Migration runner

Backy's deployment schema is the ordered SQL in `supabase/migrations`, currently001–024. `npm run db:migrate` and `npm run migrate --workspace @backy/db` use this source. Drizzle generation remains a separate development tool and does not certify that this SQL ran.

```sh
npm run db:migrate -- --offline  # File names/checksums only; never connects.
npm run db:migrate              # Read-only database plan if a supported URL is supplied.
npm run db:migrate -- --apply   # Explicitly authorizes canonical SQL and ledger writes.
```

Supply the reviewed database URL through `BACKY_DATABASE_URL`, `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL` or `POSTGRES_PRISMA_URL` in that precedence. Explicit Backy/database overrides remain authoritative; otherwise the direct provider URL takes precedence over pooled URLs. Its name does not certify session affinity: the selected URL still passes the transaction-pooler admission guard. No `.env` file is loaded, credential command argument accepted or localhost target assumed. The host and database must be explicit in the URL or separately reviewed PGHOST/PGDATABASE environment (the isolated Unix-socket CLI test constructs these itself). Review the target outside this command; output omits URLs, hosts, passwords and raw database errors. With no URL, the default prints an offline inventory and explicitly says applied state is unknown. Use a migration owner connection, not a public API identity, and a stable direct/session connection: session advisory locks are incompatible with transaction-mode pooling. Known Supabase `.pooler.supabase.com:6543` URLs and explicit truthy `pgbouncer` flags are rejected before connection. A custom/unknown pooler can still evade URL detection; verify its session mode independently. `client.reserve()` reserves a driver connection and does not certify backend session affinity through a pooler. Identity infrastructure (`auth.users`, `auth.uid()` and Supabase-compatible roles) must already exist; the runner never creates provider identities.

A single reserved PostgreSQL session holds the migration advisory lock. A read-only repeatable-read transaction checks history before any DDL. Each missing file and its `backy_migrations.migrations` ledger row commit in one transaction; a failure rolls back that file/row while retaining earlier successful files. This permits enum additions in003 to commit before subsequent migrations use them. DDL lock timeout is10s and statement timeout120s per file. A competing runner refuses with `MIGRATION_BUSY`. Operators should also stop incompatible application writes during a reviewed migration window; this lock coordinates this runner, not arbitrary SQL or application requests.

The ledger records exact file name, version and SHA256 bytes. Unknown versions, missing history, changed names/checksums or gaps refuse both plan and apply. Do not edit a previously executed migration: add a new numbered SQL file. Transaction control and unsupported nontransactional statements refuse source admission. A lost commit acknowledgment reports `MIGRATION_COMMIT_UNCERTAIN`, never a claimed rollback: close the connection and rerun the read-only plan before retrying. There is no automatic retry. This is migration identity evidence, not a complete audit of current schema or proof of application/provider readiness. Ledger schema/table privileges are revoked from public/browser roles.

## Existing databases without the ledger

An existing Backy table, type or function with an absent/empty ledger returns `MIGRATION_BASELINE_REQUIRED`. No canonical SQL is replayed and no ledger is created. There is deliberately no automatic baseline, force, stamp-all or infer-from-table-names switch.

Reconciliation requires a separate operator review:

1. Verify the target and take a recoverable backup. Inventory migration history from trusted deployment records and inspect the actual schema, policies, constraints, triggers and functions against those exact SQL versions. Table presence alone does not establish completion. Historical manual `psql` execution may have no Supabase migration-history entry.
2. Identify a contiguous compatible canonical prefix. Compare original file identities/checksums when trustworthy historical artifacts exist. If they are unavailable or differ, independently review the current schema and record the compatibility decision explicitly; never claim these bytes previously executed.
3. Prepare and review a **ledger-only baseline transaction** separately from this runner. Its schema/table DDL is exported as `ledgerDDL` from `packages/db/scripts/canonical-migrations.mjs`. Insert only the reviewed prefix with exact current version/name/checksum, `provenance='reconciled'`, and nonempty `evidence` pointing to the reviewed history/schema/backup record. Ordinary runner entries use `provenance='executed'`. Reconciled entries attest operator-reviewed compatibility; they are not execution proof. Restrict this privileged baseline to the migration owner and hold the same advisory lock (1111573337,1296648018) throughout. Do not include provider credentials or private submission values in evidence.
4. Run the read-only connected plan again. Independently review each remaining file and possible application impact, then use explicit `--apply` in the authorized migration window. If history/schema is inconsistent, restore or repair through a reviewed change rather than fabricating ledger rows.

This runner cannot safely reconcile an unknown existing deployment by itself. The disposable acceptance tests prove fresh installation, replay prevention, checksum/history drift denial, transactional failure rollback, lock admission and untracked-schema refusal. They do not prove an existing production baseline or authorize a production migration.

```sh
npm run test:canonical-migrations:postgres --workspace @backy/db
```

## Browser table privilege hardening

Migration023 removes TRUNCATE, REFERENCES, TRIGGER and (on PostgreSQL17+) MAINTAIN from browser roles on the40 canonical Backy tables. It preserves CRUD grants and row policies. Effective inherited/PUBLIC privileges and unsafe current-owner global defaults refuse and roll back rather than silently reporting success. Future public-table defaults are hardened only for the migration owner; other provider creators require separate review. This migration does not certify browser/JWT row visibility or remove provider-wide grants.

## Backup restore rehearsal before upgrading an existing database

Keep database archives private and outside the repository. Use a pg_dump client compatible with the server major, then execute a restore on a newly owned socket-only cluster; archive listing alone is insufficient. A public/auth scoped archive includes backend records and auth data but excludes storage bytes, global role attributes/memberships, and provider extension schemas. Provision only reviewed archive dependencies (for example uuid-ossp in extensions and pg_trgm in public) and referenced roles in the disposable environment. Preserve owner/ACL entries and require all restore phases to succeed. Verify original-table row hashes before and after the reviewed baseline/missing-migration rehearsal; do not ignore restore errors or equate synthetic role provisioning with provider identity readiness.

Before live application, verify the executing role's effective table authority and default ACLs. Provider delegation may authorize operations on auth tables even when ordinary ownership checks fail; inspect the explicit installed delegation rather than granting new authority or assuming a superuser connection. Recheck the actual schema and data-only backfill prerequisites, retain a recoverable backup, and record compatibility baselines as reconciled evidence rather than claiming historical execution.

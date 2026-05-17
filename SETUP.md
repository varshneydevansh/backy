# Backy Setup

## Local environment

```bash
cd "/Users/devanshvarshney/backy"
npm install
```

## Environment variables

Create a `.env` at repo root:

```bash
# Database (SQLite for quick local run)
DATABASE_TYPE=sqlite
DATABASE_URL=./data/backy.sqlite

# PostgreSQL (production pattern)
# DATABASE_TYPE=postgres
# DATABASE_URL=postgresql://user:password@localhost:5432/backy

# Storage (local for local)
STORAGE_PROVIDER=local
STORAGE_LOCAL_PATH=./uploads

# Auth
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRY=7d

# Optional OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Admin + public endpoints
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_URL=http://localhost:3000
PUBLIC_SITE_URL=http://localhost:3001
```

## Run apps

```bash
npm run dev
```

You can also run separately:

- Admin: `cd apps/admin && npm run dev`
- Public: `cd apps/public && npm run dev`

## DB and storage workflows

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

## Forms database contract smoke

The Forms/Contacts database-mode gate runs against a real Postgres-compatible database, including Supabase Postgres:

```bash
BACKY_DATABASE_URL="postgresql://user:password@host:5432/backy" npm run ci:forms-postgres
```

The smoke first checks the required Backy Forms/Contacts tables and columns, then creates a temporary site, page, form, submission, and contact, verifies read/update/filter/merge behavior through the database repositories, and deletes the temporary site afterward. GitHub Actions also exposes a manual **Forms Postgres Contract** workflow; configure the repository secret `BACKY_DATABASE_URL` or `DATABASE_URL` with a disposable migrated Supabase/Postgres database and set `disposable_database_confirmed=true` before running it.

The SDK database-mode gate starts the public app in database mode and runs the generated/custom frontend contract smoke against the same configured database:

```bash
BACKY_DATABASE_URL="postgresql://user:password@host:5432/backy" npm run ci:sdk-postgres-smoke
```

It preflights the required public contract tables, including content collections, reusable sections, forms, comments, media, events, settings, and interactive component registry tables, before booting the public app. GitHub Actions exposes this as the manual **SDK Postgres Smoke** workflow using the same `BACKY_DATABASE_URL`/`DATABASE_URL` secret alias and the same `disposable_database_confirmed=true` confirmation.

## Commerce provider mock smoke

The commerce provider CI gate starts the public and admin apps, configures the existing commerce/order smoke tests to use their local mock provider servers, and runs product catalog sync, checkout/subscription actions, quote providers, shipping labels/tracking, refunds, and webhook/reconciliation coverage without live provider credentials:

```bash
npm run ci:commerce-provider-smoke
```

On Linux CI it expects Chrome at `/usr/bin/google-chrome`; locally set `CHROME_BIN` if Chrome is installed somewhere else. GitHub Actions runs the same gate through the **Commerce Provider Smoke** workflow.

## Backy release certification

The manual **Backy Release Certification** workflow (`.github/workflows/backy-release-certification.yml`) is the current production-readiness gate. It runs the local source preflights first, then optionally runs the database, Settings provider, and Commerce provider certification gates:

```bash
npm run test:release-certification-preflight-contract
npm run test:release-certification-doctor-contract
```

Before running the external gates, use the non-secret readiness doctor to see which database, Settings, and Commerce credential groups are configured or missing:

```bash
npm run doctor:release-certification
```

Set `BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1` when you want that doctor to fail the command if a requested certification group is missing required variables.
For Commerce certification, required mode also fails when `BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1` is set but no `BACKY_COMMERCE_CERTIFY_*` provider group is selected.

The release, standalone Settings provider, and standalone Commerce provider workflows run the same doctor after source preflights so every manual certification run leaves a safe readiness report in the GitHub logs before database or provider certification begins.

Run the GitHub workflow with `certify_database=true` and `disposable_database_confirmed=true` only after `BACKY_DATABASE_URL` or `DATABASE_URL` points at a disposable migrated Supabase/Postgres database. Set `database_expected_host` and/or `database_expected_name` when you want the Forms and SDK database gates to fail before schema checks if the secret points at the wrong Postgres/Supabase host or database. The database smoke scripts emit JSON evidence showing whether those target guards were active. That database gate runs both:

```bash
npm run ci:forms-postgres
npm run ci:sdk-postgres-smoke
```

When `certify_database=false`, the release workflow keeps local provider certification in demo data mode unless you supply an external `BACKY_SETTINGS_CERTIFICATION_BASE_URL` or `BACKY_COMMERCE_CERTIFICATION_BASE_URL`. That lets Settings/Commerce provider gates run without accidentally forcing database mode in repositories that have not configured `BACKY_DATABASE_URL`.

Use the workflow inputs to choose the external provider depth:

- `certify_settings_providers`: runs `npm run ci:settings-provider-certification`.
- `certify_commerce_providers`: runs `npm run ci:commerce-provider-certification`.
- `payment_provider`, `tax_provider`, `shipping_provider`, `catalog_provider`, `subscription_provider`, and `webhook_provider` can be left as `auto` to certify the first matching configured credential family, or set explicitly to prove one provider such as PayPal, Razorpay, TaxJar, EasyPost, Shopify, Magento, Paddle, or a Stripe-managed webhook. Local demo certification only mutates disposable Settings provider selection and webhook metadata before checking readiness; when `BACKY_COMMERCE_CERTIFICATION_BASE_URL` points at a deployed Backy instance, the gate is read-only and verifies the provider already selected in that instance's Settings where Settings selection applies. Required webhook certification requires an env-backed signing secret and a configured provider webhook URL; `webhook_provider=generic` proves the endpoint/secret without tying it to a payment provider.
- `certify_storage`: checks live local/S3/Supabase storage provisioning diagnostics. `storage_provider` can be left as `auto` or set to `local`, `s3`, or `supabase` so Settings certification fails if the runtime is wired to the wrong media storage family.
- `certify_rotation`: checks replacement storage credential validation before promotion.
- `certify_vercel_secrets`: checks Vercel env secret-manager dry-run planning. `vercel_project_id` and `vercel_team_id` can be set to make certification fail if the dry-run plan targets the wrong Vercel project or team.
- `certify_notification`: checks configured notification delivery diagnostics. `notification_provider` can be left as `auto` or set to `webhook`, `http-endpoint`, `resend`, `smtp`, or `local-outbox`; webhook mode proves the Settings webhook delivery action end-to-end, while email-provider modes additionally verify the selected `runtimeNotifications.emailProvider` is configured before running the webhook capture. Notification certification follows the runtime aliases: Resend accepts `BACKY_RESEND_API_KEY` or `RESEND_API_KEY`, SMTP accepts `BACKY_SMTP_HOST` or `SMTP_HOST` plus optional auth, and HTTP endpoint delivery accepts `BACKY_EMAIL_DELIVERY_ENDPOINT` or `BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL`.

Settings and Commerce provider certification scripts emit JSON evidence with a non-secret `target.mode` of `local` or `external`, plus an `externalBaseUrlConfigured` boolean. Use that output to confirm whether a release run certified a disposable local instance or a deployed Backy target without exposing the target URL or admin key.

The standalone Forms and SDK Postgres workflows run the doctor and write non-secret GitHub job summaries listing disposable confirmation and whether expected database host/name guards were configured. The release workflow, standalone Settings provider workflow, and standalone Commerce provider workflow also run the doctor and write non-secret summaries listing requested gates, external-target booleans, and selected provider families. These reports intentionally do not print database URLs, external base URLs, admin keys, or provider secrets.

Configure repository secrets/vars for the provider families you enable: `BACKY_DATABASE_URL`/`DATABASE_URL`; storage/Supabase/S3 values such as `BACKY_STORAGE_PROVIDER`, `BACKY_SUPABASE_URL`, `BACKY_SUPABASE_SERVICE_ROLE_KEY`, `BACKY_SUPABASE_STORAGE_BUCKET`, `BACKY_S3_ACCESS_KEY_ID`, and `BACKY_S3_SECRET_ACCESS_KEY`; Vercel values such as `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `VERCEL_TEAM_ID`; notification values such as `BACKY_RESEND_API_KEY`/`RESEND_API_KEY`, `BACKY_SMTP_HOST`/`SMTP_HOST` with optional SMTP auth, or `BACKY_EMAIL_DELIVERY_ENDPOINT`/`BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL`; and commerce values for Stripe, TaxJar, Avalara, EasyPost, Shippo, PayPal, Paddle, Square, Adyen, Mollie, Razorpay, Shopify, BigCommerce, WooCommerce, Etsy, and Magento. Keep live provider gates disabled until the matching provider credentials and non-secret base URLs are intentionally configured.

## Deployment (Vercel)

Backy can be deployed as two Vercel apps:

1. `backy-admin` from `apps/admin`
2. `backy-public` from `apps/public`

Shared storage and database keys must be set in both apps (or only on `backy-public` for read-only flows).

The root `vercel.json` registers a daily scheduled reconciliation call:

```json
{ "path": "/api/admin/commerce/reconcile?limit=100", "schedule": "0 3 * * *" }
```

For that cron to authenticate, configure `CRON_SECRET` to the same server-only value as `BACKY_ADMIN_API_KEY` or `BACKY_ADMIN_SECRET_KEY` on the deployed `backy-public` app. Vercel sends `Authorization: Bearer $CRON_SECRET`, and Backy treats bearer admin keys the same as `X-Backy-Admin-Key`.

## Security status notes

- Current local auth flow in `apps/admin` uses `mockStore` + mocked login helper for fast dev.
- SSO providers are scaffolded through environment settings and the auth package, but admin login is not yet production-grade.
- Public endpoints are also mostly scaffolded on top of mock data today and should be switched to DB-backed auth + RBAC before launch.

## Custom frontend and domain model

Use `backy-public` as the API host and renderer host:

1. Configure a custom domain on Vercel for `backy-public` (e.g. `content.your-domain.com`).
2. Use `/api/sites`, `/api/sites/:siteId/pages`, `/api/sites/:siteId/blog/...`, and form/comment endpoints in your frontend.
3. For custom customer domains, resolve domain-to-site mapping in your route layer before page render.
4. Move from path-based site slug (`/sites/[subdomain]/...`) to host-based lookup as part of production hardening.

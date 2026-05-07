# Decision 0001: Canonical Database Boundary

## Status

Accepted

## Context

Backy currently has two database-oriented workspace packages:

- `packages/db` published as `@backy/db`
- `packages/database` published as `@backy-cms/database`

This split makes it unclear which package owns schemas, query APIs, migrations, and future repository implementations. A backend product that supports custom frontends needs one stable persistence boundary so admin APIs, public APIs, SDKs, and generated frontends do not depend on different data shapes.

## Decision

`@backy/db` is the canonical database package for Backy.

It owns:

- Drizzle schema definitions.
- Database adapter creation.
- Future repository implementations for sites, pages, posts, collections, media, forms, comments, users, settings, audit logs, and events.
- Migration and studio commands exposed from the root package scripts.

`@backy-cms/database` is legacy Supabase scaffolding. New Backy code must not import it. It should remain only as a temporary compatibility package until its useful types or helpers are either migrated into `@backy/db` repositories or deleted.

## Consequences

- New admin/public/server code imports database schema, adapters, or repositories from `@backy/db`.
- Admin browser code must not import database clients directly. It should call admin/public APIs that depend on repository interfaces server-side.
- Repository interfaces live in `@backy-cms/core`; concrete repository adapters live in `@backy/db`.
- Existing references to `packages/database` in older phase docs are superseded by this decision.
- Deleting `packages/database` is a later cleanup step after all useful Supabase-only scaffolding is confirmed unused or migrated.

## Validation

Use:

```bash
rg "@backy-cms/database|@db/|packages/database" apps packages specs
```

Expected result after this decision:

- No app or package source imports `@backy-cms/database` or `@db/*`.
- `packages/database` may appear only inside its own package files and historical/spec references that explicitly describe it as legacy.

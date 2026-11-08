# Component version migration authoring

The selected site frontend design workspace includes **Component version migrations**
at `/sites/:siteId#site-component-migrations`, beside compatibility and template
history. Discovery uses the complete authenticated component catalog. Page view
permission enables discovery; page edit permission is required by the backend for
both preview and apply. The panel selects exact current and active target versions,
shows affected page/post identities, status, reference count and nested content
paths, and links each document to its editor. Templates and reusable sections are
outside the current migration scope.

Preview is read-only. Authors confirm the concrete document and reference counts
before applying. The panel sends the server's `reviewedPreview` manifest, containing
canonical site/source/target identity, a target-definition fingerprint, and exact
per-document fingerprints. Fingerprints cover content, timestamp, title, slug and
status. If a matching document is added, removed, changed, or the target registry
definition changes after review, the handler returns409 `MIGRATION_PREVIEW_CONFLICT`
before any migration writes. The author must reload and review the new preview.
Malformed/duplicate manifests return400 `INVALID_MIGRATION_PREVIEW`.

`reviewedPreview` is additive and optional for historical API/SDK callers. Omitting
it retains legacy unbound inventory migration behavior. The admin panel always
requires and sends it for apply, and rejects older incompatible backend responses.
The manifest is conflict evidence, not a signed permission grant or live-render
certification; request-time authorization remains authoritative.

Target admission requires an active, approved registry version in both storage modes, matching public exact-version rendering and authenticated authoring discovery. Disabled, draft and rejected versions return422 `TARGET_COMPONENT_NOT_READY` before document writes. Approval does not certify arbitrary frontend execution; static fallback and authored fallback boundaries remain unchanged.

Before preview or apply, all matching canvas/rich-content instances are checked against the authoritative target `propsSchema` (including `dependencyMetadata.propsSchema`). A mismatched value or unsupported schema returns422 `MIGRATION_PROPS_INCOMPATIBLE`, with bounded values-free document/element/JSON-pointer/keyword findings. Validation never coerces values, inserts defaults or removes properties. Draft7 and 2020-12 JSON Schema are supported by the installed validator; unknown formats, unresolved remote references, asynchronous schemas and excessive schema size fail closed. Supplied references are never fetched. A reviewed preview also fingerprints this authoritative schema through the complete target definition.

A compatible migration replaces saved schema and control definitions with target definitions, including schema-derived controls. It retains authored prop values, matching control values (including zero/false) and matching control extension metadata, fallback content and unrelated node metadata. Controls removed by the target definition are removed from the current authoring controls; authored properties are never deleted. Definitions without a declared target schema/control list retain the legacy metadata boundary. Migration validates and copies metadata; it does not synthesize runtime code or transform incompatible prop types.

After inventory verification, independent document writes still use the existing
content/timestamp CAS. Concurrent author edits can produce a partial outcome. The
panel distinguishes confirmed commits, failed document IDs/codes, and completion
warnings for audit, cache or webhook operations. It never retries automatically or
reuses an applied preview. Reloading the preview skips references already moved to
the target version and lets authors review failed/current documents before trying
again. A lost response also consumes the preview; reload before deciding what to do.

Verification: admin `test:component-migrations` exercises the actual adapter with
mock transport, complete discovery pagination, fingerprint submission, conflict
errors, partial response accounting, cancellation, and production component markup.
Public `test:component-migration-cas` executes the actual migration handler and
persisted isolated demo store in both adapter branches, including preview/apply
interleavings, schema validation, mixed failure and current-content retry. Database
repository atomic proof is covered separately by `test:content-cas:postgres`.
Browser interaction and served HTTP proof are separate acceptance gates; these tests
do not certify production or arbitrary custom frontend hydration.

`test:component-migration-props` validates actual route envelopes against OpenAPI in both demo and repository-adapter branches: denied target policy, nested incompatible properties with no writes, authoritative definition drift409, refreshed controls/schema, retained authored values/fallback/control extensions, bounded invalid-schema findings and early auth denials. The repository adapter is a test boundary; this new admission slice does not add independent PostgreSQL/browser/deployment proof. `test:component-migrations` also proves the admin adapter carries precise findings into the existing error display.

Local served schema-admission acceptance (2026-10-06):
`apps/admin/scripts/component-schema-upgrade-browser-fixture.mts` serves the actual
`ComponentMigrationPanel`, shared `CanvasEditor`, discovery/migration handlers and
page/blog handlers over an isolated persistent demo store. Run with
`TSX_TSCONFIG_PATH=/Users/devanshvarshney/backy/apps/public/tsconfig.json npx tsx apps/admin/scripts/component-schema-upgrade-browser-fixture.mts`
from the repository root; interact through the browser, then stop with SIGINT.
The fixture seeds synthetic static registry versions and authenticated owner scope;
it does not exercise real login, code signing, provider execution or SQL.

The completed CUA journey rejected an incompatible target with precise `/count`
findings for both documents, then rejected an already-reviewed target after approval
revocation. Both refusals left the complete page/blog snapshots unchanged. An
approved compatible target previewed and migrated both documents. The shared editor
showed refreshed numeric controls (0–99), retained false-valued props, fallback,
recognized binding and unknown metadata. A numeric page edit saved as8 and reopened;
the blog saved/reopened with its original7. Persisted disk and canonical elements
retained version3, target schema, authored values and extensions. Draft version4
was absent from discovery.

`node apps/admin/scripts/component-schema-upgrade-browser-evidence.mjs` validates
60 assertions against the captured denial/final HTTP and disk evidence. Screenshots
and JSON are under `/tmp/backy-component-schema-*`; these are finite local browser
artifacts, separate from production deployment and independent PostgreSQL proof.
The server removes its owned scratch directory on exit. No production source repair
was needed for this journey.

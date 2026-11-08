# Guided frontend composition import

The site detail **Import frontend composition** panel accepts JSON file/paste, shows selected and excluded routes/templates, full nested fields/references, stable IDs, and a bounded declared-layout diagram. Review executes no imported HTML/CSS/React/JS, fetches no source URL or asset, and certifies no renderer, motion or interaction behavior. Template registration alone does not import live frontend routes.

## Wire

`POST /api/admin/sites/:siteId/frontend-design/composition-import` accepts `action: review|apply`, `composition`, explicit unique `selection`, `acknowledgeUnverified`, and an apply `reviewVersion`.

The package is `schemaVersion: backy.frontend-composition-import.v1`, optional canonical `siteId`, optional existing `frontendDesign` declaration (explicit templates array), and `routes: [{id,type:page|blogPost,path,title,content,meta?,templateId?,...extensions}]`. Concrete content uses the existing canvas/canonical JSON tree, assets, editable map, bindings, motion and responsive overrides. Templates require unique explicit IDs/names, supported types and concrete trees. Selection IDs are `route:<import-id>`, `template:<template-id>` and `design`; site declarations and templates are selected independently.

Review `200` returns `data: FrontendCompositionReview` (`backy.frontend-composition-review.v1`): canonical site, SHA-256 `composition-v1:<64hex>` review version, selection/acknowledgment, full targets, blocking/unverified issues, `canApply` and boundary. It writes nothing. Excluded-target findings remain visible; selected unverified mappings require acknowledgment.

Apply resubmits the same package, selection and acknowledgment with that version. `201` returns `FrontendCompositionApplyResult` (`backy.frontend-composition-applied.v1`): new draft IDs/paths/editor URLs, selected template IDs, `designSaved`, and `publication: draft-only`. Open the ordinary page/blog editor; use existing GET/PATCH/preview/readiness/publish APIs afterward. Publishing remains separate.

## Admission and preservation

Complete same-site page, blog, collection, media, component-version and form inventories are required. Incomplete, stalled, duplicate or foreign inventory fails closed. Existing routes, collection patterns, redirects, reserved modules, owned template IDs and default-template conflicts block selected targets. Nested pages require existing or selected parent pages; the current repository also requires unique leaf slugs per site. Blog paths use `/blog/<slug>`. Dynamic patterns remain templates, not automatically created live routes.

Stable element IDs are unique per target; editable-map references resolve inside the tree. Media/font/form/collection IDs and declared collection fields must resolve in the canonical site. Components require exact registered key/version; registration does not certify runtime approval or installed renderer mapping. Unknown JSON remains in content/declaration snapshots; package/route extensions remain in `meta.frontendCompositionImport` alongside provenance. Generated IDs/title/slug/draft status/no-index remain authoritative.

Unsafe prototype/accessor input, non-JSON/nonfinite values, executable URL schemes and imported `customJS` are refused. Credential-named fields and URL credentials are removed before review/storage; findings expose paths, never removed values. This bounded scrubber does not certify arbitrary free text as secret-free.

Limits: 2 MiB, 60,000 values/depth64, routes48/templates48/selections97, IDs128/title300/path500; complete inventory budget20,000 per catalog. Split larger packages.

## Permissions and atomicity

Review requires `sites.view`; apply requires `sites.configure` and additionally `pages.edit` for selected routes. Existing operator/service-key site restrictions apply before body parsing. Optional package site ID must match canonical scope.

PostgreSQL uses a serializable transaction/site row lock, fresh full inventory fingerprint, and one design/history/draft/audit commit. Failed later writes roll back all earlier targets. Canonical document IDs reconcile to generated row IDs within the transaction. Stale/replayed review or serialization/uniqueness conflicts refuse with409 rather than overwrite.

Demo admission is synchronous and atomic within **one process**, with fresh-load guard, full preparation, one strict persisted admin-content commit and in-memory rollback on failure. It is not a cross-process file lock. Its audit is postcommit; provider/storage-catalog side effects are outside that content-store commit. Draft media references remain in content and normal authoring saves reconcile existing media catalogs. No provider upload/deployment occurs.

Standard error envelope: `{success:false,requestId,error:{code,message}}`. Statuses:400 invalid,401/403 denied,404 missing site,409 stale/conflict,413 budgets,422 blocked/unacknowledged review,503 incomplete inventory/missing atomic adapter,500 transactional failure. Handler responses and shared admin proxy use private/no-store caching.

## Local evidence

- `npm run test:frontend-composition-import --workspace @backy/public`: actual handler/normalizer, isolated demo disk/rollback, actual permission evaluator, stale/replay, nested identities/history and extension/redaction checks.
- `npm run test:frontend-composition-import:postgres --workspace @backy/db`: owned socket-only temporary PostgreSQL, actual migrations/repositories, late rollback, competing author, simultaneous apply and complete catalog205; never reads a configured DB URL, removes only its own cluster.
- `tsx --tsconfig apps/admin/tsconfig.json apps/admin/scripts/frontend-composition-browser-fixture.mts`: disposable actual handler/store/shared editor service5188 (`BACKY_COMPOSITION_FIXTURE_PORT` override), synthetic identities/provider effects. CUA proved review/no-write, opaque mapping disabled, native oversized file clears stale targets,409/403 retry, fresh201, nested text edit/PATCH/GET reopen and persisted identity/metadata/assets/mobile override.

Disposable browser/DB fixtures are distinct from deployed auth, production provider execution and a personal frontend's fidelity.

## Typed SDK and discovery

The site OpenAPI document includes `reviewOrApplyAdminFrontendComposition` with package, request, target, issue, review and apply schemas. The SDK generator reads the repository-owned split schema module, so these components and the operation participate in generated contract types. No uploaded frontend code is evaluated during generation.

```ts
const review = await backy.reviewAdminFrontendComposition({
  composition, selection: ['route:home'], acknowledgeUnverified: false,
}, { siteId, credentials: 'include' });
// Inspect issues and explicitly resolve/acknowledge selected unverified mappings first.
if (review.data.canApply) {
  const applied = await backy.applyAdminFrontendComposition({
    composition, selection: review.data.selection,
    acknowledgeUnverified: review.data.acknowledgeUnverified,
    reviewVersion: review.data.reviewVersion,
  }, { siteId, credentials: 'include' });
  // Open applied.data.drafts[n].editUrl. Publishing remains a separate action.
}
```

The SDK requires `reviewVersion` for apply and preserves opaque nested content. It sends authenticated scoped POSTs and surfaces stale409 without automatic replay. `BackyFrontendCompositionReviewResponse` and `BackyFrontendCompositionApplyResponse` alias the generated OpenAPI envelopes. SDK transport tests establish request behavior; actual handler/AJV tests separately validate returned review200/apply201 envelopes.

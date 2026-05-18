# Backy JavaScript SDK

Small TypeScript client for custom/generated frontends that consume Backy through public APIs.

```ts
import { createBackyClient } from '@backy/sdk-js';

const backy = createBackyClient({ baseUrl: 'https://your-backy-host.com' });

await backy.discoverSite('demo');
const manifest = await backy.manifest();
const localeRoutes = manifest.data.modules.routing.localizedRoutePatterns || [];
const page = await backy.render('/');
const seo = await backy.seo();
const sections = await backy.reusableSections();
const media = await backy.media({ limit: 1 });
const asset = media.data.media[0] ? await backy.mediaAsset(media.data.media[0].id) : null;
const catalog = await backy.commerceCatalog({ featured: true });

page.data.content.elements.forEach((element) => {
  console.log(element.id, element.type);
});

console.log(manifest.data.delivery.localeStrategy, localeRoutes.map((entry) => entry.locale));
console.log(sections.data.sections.map((section) => section.name));
console.log(asset?.data.media.id);
console.log(catalog.data.products.map((product) => product.title));
console.log(seo.data.sitemap.url);
```

Commerce storefronts can read the normalized product catalog and submit a checkout cart into Backy's private order queue:

```ts
const certification = catalog.data.commerce.providerCertification;
const order = await backy.createCommerceOrder({
  customer: { name: 'Jane Customer', email: 'jane@example.com' },
  items: [{ slug: 'starter-template', quantity: 1 }],
  paymentProvider: 'manual',
});

console.log(certification.liveCertificationGate, certification.groups.map((group) => group.family));
console.log(order.data.order.orderNumber, order.data.order.paymentStatus);
```

`manifest.data.modules.commerce`, `catalog.data.commerce`, and `commerceOrderContract().data.commerce` expose the same non-secret storefront contract. Its `providerCertification` block uses `backy.commerce-provider-certification-handoff.v1` so generated frontends can display the local mock gate, live provider certification gate, provider families, and server-side secret-handling expectations without calling admin APIs. Generated OpenAPI exports include `GeneratedBackyOpenApiCommerceProviderCertification` and `GeneratedBackyOpenApiCommerceStorefrontContract`.

Conditional discovery/frontend-design/render/navigation/SEO/media/data helpers expose Backy's response metadata and handle `If-None-Match` revalidation:

```ts
const first = await backy.renderCached('/');

if (!first.notModified) {
  console.log(first.meta.etag, first.body.data.content.elements);
}

const second = await backy.renderCached('/', { etag: first.meta.etag });

if (second.notModified) {
  console.log('Reuse your cached render payload.');
}

const designFirst = await backy.frontendDesignCached();
const designSecond = await backy.frontendDesignCached({ etag: designFirst.meta.etag });

if (designSecond.notModified) {
  console.log('Reuse your cached frontend design contract.');
}

const navFirst = await backy.navigationCached();
const navSecond = await backy.navigationCached({ etag: navFirst.meta.etag });

if (navSecond.notModified) {
  console.log('Reuse your cached navigation tree.');
}

const pageFirst = await backy.pagesCached({ path: '/about' });
const pageSecond = await backy.pagesCached({ path: '/about', etag: pageFirst.meta.etag });

if (pageSecond.notModified) {
  console.log('Reuse your cached page payload.');
}

const blogFirst = await backy.blogCached({ limit: 10 });
const blogSecond = await backy.blogCached({ limit: 10, etag: blogFirst.meta.etag });

if (blogSecond.notModified) {
  console.log('Reuse your cached blog index.');
}

const categoriesFirst = await backy.blogCategoriesCached();
const categoriesSecond = await backy.blogCategoriesCached({ etag: categoriesFirst.meta.etag });

if (categoriesSecond.notModified) {
  console.log('Reuse your cached blog category archive metadata.');
}

const formsFirst = await backy.formsCached();
const formsSecond = await backy.formsCached({ etag: formsFirst.meta.etag });

if (formsSecond.notModified) {
  console.log('Reuse your cached form directory.');
}

const reportReasonsFirst = await backy.reportReasonsCached();
const reportReasonsSecond = await backy.reportReasonsCached({ etag: reportReasonsFirst.meta.etag });

if (reportReasonsSecond.notModified) {
  console.log('Reuse your cached comment report reasons.');
}

const seoFirst = await backy.seoCached();
const seoSecond = await backy.seoCached({ etag: seoFirst.meta.etag });

if (seoSecond.notModified) {
  console.log('Reuse your cached SEO route index.');
}

const recordsFirst = await backy.recordsCached<{ title: string }>('articles', { limit: 10 });
const recordsSecond = await backy.recordsCached('articles', { limit: 10, etag: recordsFirst.meta.etag });

if (recordsSecond.notModified) {
  console.log('Reuse your cached collection records.');
}

const collectionsFirst = await backy.collectionsCached();
const collectionsSecond = await backy.collectionsCached({ etag: collectionsFirst.meta.etag });

if (collectionsSecond.notModified) {
  console.log('Reuse your cached collection schemas.');
}

const catalogFirst = await backy.commerceCatalogCached({ featured: true });
const catalogSecond = await backy.commerceCatalogCached({ featured: true, etag: catalogFirst.meta.etag });

if (catalogSecond.notModified) {
  console.log('Reuse your cached product catalog.');
}

const orderContractFirst = await backy.commerceOrderContractCached();
const orderContractSecond = await backy.commerceOrderContractCached({ etag: orderContractFirst.meta.etag });

if (orderContractSecond.notModified) {
  console.log('Reuse your cached checkout order contract.');
}

const fontsFirst = await backy.mediaFontsCached();
const fontsSecond = await backy.mediaFontsCached({ etag: fontsFirst.meta.etag });

if (fontsSecond.notModified) {
  console.log('Reuse your cached uploaded font manifest and CSS.');
}
```

The SDK intentionally does not import admin/editor code. It wraps the public site bootstrap, manifest/OpenAPI discovery, frontend-design contract, route resolution, render payload, SEO discovery, media, collection, commerce, reusable-section, blog taxonomy, form, comment, report, and event endpoints documented in `specs/backy-api-contracts.md`.
Manifest responses expose site-settings-backed locale discovery through `data.delivery` and per-locale router expansions through `data.modules.routing.localizedRoutePatterns`, so custom frontends can honor Backy's `none`, `path-prefix`, or `domain` locale strategy before calling `resolve()`/`render()`. The convenience SDK exports `BackyLocaleStrategy`, narrows `BackyManifestDeliveryDiscovery.localeStrategy` to those documented routing modes, and types `BackyManifestRoutePattern`, `BackyManifestRouteFrontendDesign`, `BackyManifestLocalizedRoutePatternGroup`, `BackyManifestRedirectRule`, `BackyManifestRoutingModule`, `BackyManifestPageResource`, `BackyManifestPostResource`, `BackyManifestBlogModule`, `BackyManifestBlogCategory`, `BackyManifestBlogTag`, `BackyManifestBlogAuthor`, `BackyManifestCollectionSchema`, `BackyManifestReusableSection`, `BackyManifestReusableSectionsModule`, `BackyManifestFormDefinition`, and `BackyManifestMediaModule` for locale-aware router, redirect, route-template, blog archive/feed, dynamic collection, reusable-block, public form, and media discovery setup.
The default return types expose Backy contract shapes such as `BackyFrontendDesignContract`, `BackyRenderPayload`, `BackyContentDocument`, `BackySeoDiscovery`, `BackyMediaAsset`, `BackyFontManifest`, `BackyCollectionRecord`, `BackyBlogCategory`, `BackyBlogTag`, `BackyBlogAuthor`, `BackyCommerceProduct`, `BackyCommerceOrderSummary`, `BackyReusableSection`, `BackyFormSubmission`, `BackyComment`, `BackyInteractionEvent`, `BackyResponseMeta`, and `BackyConditionalResult`. Collection record reads/writes are generic, so a frontend can pass its own value shape: `backy.records<{ title: string }>(collectionId)`.
Schema-derived public contract types are generated from `specs/ai-frontend-contract/*.schema.json` into `src/generated-contract-types.ts` before SDK build/typecheck. The generator also reads the live public OpenAPI route source to export `GeneratedBackyOpenApiOperationId`, `GeneratedBackyOpenApiComponentName`, per-component `GeneratedBackyOpenApi*` schema shapes, dedicated route resource/route-resolution types, typed navigation/SEO/page/blog/font/frontend-design schemas, typed media asset/reference/editable-metadata schemas, typed collection field/permission/record schemas, typed form list/detail/definition/submission/validation/contact schemas, typed comment/moderation/report/blocklist schemas, typed interaction-event/runtime-record schemas, typed commerce catalog/order/webhook schemas, reusable-section content/document schemas, generated render-payload media/font/form/comment/navigation/frontend-design subtypes, generated content action/data-binding/editable-map subtypes, and dedicated interactive registry/runtime request types for the advertised operation/component inventory. Consumers can import generated shapes such as `GeneratedBackyFrontendManifest`, `GeneratedBackyFrontendManifestNavigationItem`, `GeneratedBackyPublicRenderPayload`, `GeneratedBackyThemeTokens`, `GeneratedBackyContentElement`, `GeneratedBackyContentStatus`, `GeneratedBackyRenderMediaAsset`, `GeneratedBackyRenderNavigationItem`, `GeneratedBackyRenderFrontendDesign`, `GeneratedBackyFrontendDesignContract`, `GeneratedBackyElementAction`, `GeneratedBackyDataBinding`, `GeneratedBackyEditableMap`, `GeneratedBackyOpenApiDocument`, `GeneratedBackyOpenApiRouteResolveEnvelope`, `GeneratedBackyOpenApiGoneRouteResolveEnvelope`, `GeneratedBackyOpenApiPageRouteResource`, `GeneratedBackyOpenApiDynamicItemRouteResource`, `GeneratedBackyOpenApiNavigationEnvelope`, `GeneratedBackyOpenApiSeoDiscoveryEnvelope`, `GeneratedBackyOpenApiPageEnvelope`, `GeneratedBackyOpenApiBlogPostEnvelope`, `GeneratedBackyOpenApiFontManifestEnvelope`, `GeneratedBackyOpenApiFrontendDesignEnvelope`, `GeneratedBackyOpenApiMediaAsset`, `GeneratedBackyOpenApiMediaReferences`, `GeneratedBackyOpenApiCollectionFieldSchema`, `GeneratedBackyOpenApiCollectionSchema`, `GeneratedBackyOpenApiCollectionRecordEnvelope`, `GeneratedBackyOpenApiFormListEnvelope`, `GeneratedBackyOpenApiFormDefinitionEnvelope`, `GeneratedBackyOpenApiFormSubmissionValidationErrorEnvelope`, `GeneratedBackyOpenApiCommentBlocklistDeleteRequest`, `GeneratedBackyOpenApiCommentReportEnvelope`, `GeneratedBackyOpenApiEventsEnvelope`, `GeneratedBackyOpenApiRuntimeEventRecordEnvelope`, `GeneratedBackyOpenApiCommerceProduct`, `GeneratedBackyOpenApiCommerceOrderEnvelope`, `GeneratedBackyOpenApiBackyContentDocument`, `GeneratedBackyOpenApiBackyReusableSectionContent`, `GeneratedBackyOpenApiInteractiveComponentRegistryEnvelope`, and `GeneratedBackyOpenApiInteractiveRuntimeEventRequest` when they need the strict schema contract rather than the more permissive convenience SDK interfaces.
Manifest `data.contract.databaseCertification` and OpenAPI `x-backy-database-certification` publish the non-secret database certification handoff for production custom frontends. The generated SDK exports this as `GeneratedBackyFrontendManifestDatabaseCertification`; it names `npm run ci:sdk-postgres-smoke`, `.github/workflows/sdk-postgres-smoke.yml`, `BACKY_DATABASE_URL`/`DATABASE_URL`, target guard env vars, and the disposable migrated Supabase/Postgres requirement while keeping database URLs and service credentials outside public responses.
`submitForm()` accepts field values under `values`, `fields`, `data`, `submission`, or direct field keys for custom frontend compatibility. Validation failures throw `BackyApiError` with `code === "VALIDATION_ERROR"` and a `validation` array of `{ field, code, message, label? }` details.

## Local validation

```sh
npm run generate:types --workspace @backy/sdk-js
npm run build --workspace @backy/sdk-js
npm run test:generated-types --workspace @backy/sdk-js
npm run test:smoke --workspace @backy/sdk-js
npm run ci:sdk-postgres-smoke
```

`test:smoke` expects a running Backy public app at `http://localhost:3001` unless `BACKY_SDK_BASE_URL` is set.
By default it also creates and deletes a temporary site through the local admin API so it can verify SDK SEO/reusable-section reads and public writes for collection records, forms, contacts, comments, reports, and events. Set `BACKY_SDK_SKIP_WRITE_SMOKE=1` to run the read-only smoke against an environment where admin fixture setup is unavailable.
`ci:sdk-postgres-smoke` runs the same SDK typecheck/build/server/smoke flow with `BACKY_DATA_MODE=database`; it requires `BACKY_DATABASE_URL` or `DATABASE_URL` pointing at a disposable migrated Supabase/Postgres database. The manual `SDK Postgres Smoke` GitHub Actions workflow runs this gate with the `BACKY_DATABASE_URL` or `DATABASE_URL` repository secret alias and an ephemeral admin API key.

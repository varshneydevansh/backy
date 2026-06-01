# Backy JavaScript SDK

Small TypeScript client for custom/generated frontends that consume Backy through public APIs.

For a minimal separate website project, start from [../../examples/custom-frontend-next](../../examples/custom-frontend-next). It vendors a tiny public client with the same `createBackyCustomFrontendClient({ env: process.env })` shape, host-aware `render()`, API-addressable element attributes, newsletter signup, and public form submissions without placing admin/database/provider secrets in the frontend. Use the full SDK here when it is published to your package registry.

```ts
import {
  buildBackyAdminBlogPostUpdateInput,
  buildBackyAdminCommerceProductCreateInput,
  buildBackyAdminCommerceProductUpdateInput,
  buildBackyAdminPageCreateInput,
  buildBackyAdminPageUpdateInput,
  buildBackyAdminReusableSectionCreateInput,
  buildBackyAdminReusableSectionUpdateInput,
  buildBackyCommerceOrderInput,
  buildBackyContentDesignPayload,
  buildBackyContentDownloadFilePatch,
  buildBackyMediaDownloadLinkProps,
  createBackyClient,
} from '@backy/sdk-js';

const backy = createBackyClient({ baseUrl: 'https://your-backy-host.com' });

await backy.discoverSite('demo');
const agentHandoff = await backy.customFrontendAgentHandoff();
const manifest = await backy.manifest();
const localeRoutes = manifest.data.modules.routing.localizedRoutePatterns || [];
const page = await backy.render('/');
const seo = await backy.seo();
const sections = await backy.reusableSections();
const media = await backy.media({ limit: 1 });
const asset = media.data.media[0] ? await backy.mediaAsset(media.data.media[0].id) : null;
const downloadProps = asset
  ? buildBackyMediaDownloadLinkProps(manifest.data.site.id, asset.data.media.id, {
    baseUrl: 'https://your-backy-host.com',
  })
  : null;
const downloadPatch = asset
  ? buildBackyContentDownloadFilePatch('button_cta', manifest.data.site.id, asset.data.media.id, {
    baseUrl: 'https://your-backy-host.com',
  })
  : null;
const catalog = await backy.commerceCatalog({ featured: true });
const productRoute = await backy.resolve('/products/starter-template');
const productRender = await backy.render('/products/starter-template');
const customDesignContent = buildBackyContentDesignPayload({
  templateId: 'external-landing-template',
  customCss: '.hero { color: var(--backy-color-primary); }',
  customJs: 'window.__landingReady = true;',
  contentDocument: {
    schemaVersion: 'backy.content.v1',
    elements: [
      {
        id: 'hero-title',
        type: 'heading',
        x: 64,
        y: 64,
        width: 720,
        height: 96,
        props: { content: 'External Landing', mediaId: 'hero-image' },
        animation: { type: 'fadeIn', duration: 420 },
      },
      {
        id: 'hero-cta',
        type: 'button',
        x: 64,
        y: 184,
        width: 180,
        height: 48,
        props: { label: 'Start', fileMediaIds: ['brochure-file'] },
        responsive: { mobile: { props: { label: 'Start now' } } },
        actions: [{ type: 'navigate', href: '/start' }],
      },
    ],
  },
  animations: [{ id: 'hero-intro', targetId: 'hero-title' }],
  editableMap: { 'hero.title': { elementId: 'hero-title', targetPath: 'props.content' } },
});
const draftPageInput = buildBackyAdminPageCreateInput({
  title: 'External Landing',
  slug: 'external-landing',
  design: customDesignContent,
});
const savedSectionInput = buildBackyAdminReusableSectionCreateInput({
  name: 'External Hero Block',
  slug: 'external-hero-block',
  design: customDesignContent,
});
const pageRefreshInput = buildBackyAdminPageUpdateInput({
  expectedUpdatedAt: page.data.updatedAt,
  design: customDesignContent,
});
const sectionRefreshInput = buildBackyAdminReusableSectionUpdateInput({
  expectedVersion: 2,
  design: customDesignContent,
});
const productCreateInput = buildBackyAdminCommerceProductCreateInput({
  slug: 'external-product',
  values: { title: 'External Product', sku: 'EXTERNAL-PRODUCT', price: 49 },
  design: customDesignContent,
});
const productRefreshInput = buildBackyAdminCommerceProductUpdateInput({
  values: { title: 'External Product Refresh' },
  design: customDesignContent,
});

page.data.content.elements.forEach((element) => {
  console.log(element.id, element.type);
});

console.log(manifest.data.delivery.localeStrategy, localeRoutes.map((entry) => entry.locale));
console.log(sections.data.sections.map((section) => section.name));
console.log(asset?.data.media.id, asset?.data.media.organization?.folderPath);
console.log(downloadProps?.href, downloadProps?.fileMediaId);
console.log(downloadPatch?.changes?.['props.downloadMediaId']);
console.log(catalog.data.products.map((product) => product.title));
console.log(productRoute.data.route.resource?.designReadiness?.status);
console.log(productRender.data.route.resource?.designReadiness?.counts?.animations);
console.log(agentHandoff.data.readStart.endpoint, agentHandoff.data.readStart.manifestPointer);
console.log(customDesignContent.editableMap?.['hero-cta.props.fileMediaIds']?.valueType);
console.log(draftPageInput.content?.animations?.length);
console.log(productCreateInput.values.design?.animations?.length);
console.log(productRefreshInput.values?.frontendDesignTemplateId);
console.log(seo.data.sitemap.url);
```

`buildBackyContentDesignPayload()` preserves any explicit `editableMap` entries and also infers missing controls from the supplied elements: layout, visibility, text, button/link, media/file, responsive overrides, style/token refs, animation, actions, data bindings, and binding slots. The admin page/blog/reusable-section/collection/product helpers carry that merged map into content and `frontendDesignEditableMap` provenance so SDK-created designs can reopen in a rich Backy/custom frontend editor.

Commerce storefronts can read the normalized product catalog and submit a checkout cart into Backy's private order queue:

```ts
const certification = catalog.data.commerce.providerCertification;
const orderInput = buildBackyCommerceOrderInput({
  customerName: 'Jane Customer',
  customerEmail: 'jane@example.com',
  cart: { items: [{ productSlug: 'starter-template', qty: '1' }] },
  payment: { provider: 'manual' },
});
const order = await backy.createCommerceOrder(orderInput);

console.log(certification.liveCertificationGate, certification.groups.map((group) => group.family));
console.log(order.data.order.orderNumber, order.data.statusHandoff.customer.maskedEmail);
```

`buildBackyCommerceOrderInput()` accepts the same storefront aliases documented by the manifest (`items`, `lineItems`, `cartItems`, `cart.items`, `productSlug`, `qty`, top-level customer fields, payment objects, coupon codes, and checkout session objects), then emits the canonical private-order payload with quantity bounds and normalized email/discount fields. `createCommerceOrder()` returns `data.statusHandoff` as a `BackyCommerceOrderStatusHandoff`, so custom order-confirmation, tracking, refund, and support views can bind to masked customer/order/tracking/refund/digital-delivery fields immediately after checkout while raw contact, addresses, payment references, provider ids, and download URLs stay out of the public response. `manifest.data.modules.commerce`, `catalog.data.commerce`, and `commerceOrderContract().data.commerce` expose the same non-secret storefront contract. Its `paymentProvider` preserves the Settings handoff value (`none`, `stripe`, `paypal`, `paddle`, `square`, `adyen`, `mollie`, `razorpay`, or `manual`) while checkout execution remains constrained by the available provider adapter and server-side credentials. Its `providerCertification` block uses `backy.commerce-provider-certification-handoff.v1` so generated frontends can display the local mock gate, live provider certification gate, provider families, each group's non-secret `requiredInputs` aliases, `operatorCommandTemplate` for the guarded live-provider command, runtime provider-family readiness booleans, and server-side secret-handling expectations without calling admin APIs or receiving provider secrets. Authenticated custom admin clients can discover the matching route, permission, helper, response-contract, and privacy handoff at `manifest.data.modules.commerceRuntime.managementPolicy`, mirrored in OpenAPI as `x-backy-commerce-management` with `backy.commerce-management.v1`. Generated OpenAPI exports include `GeneratedBackyOpenApiCommerceProviderCertification`, `GeneratedBackyOpenApiCommerceStorefrontContract`, and `GeneratedBackyOpenApiCommerceManagementPolicy`.
Authenticated custom admin clients can also call `commerceOrderAnalytics()` to read private/no-store order analytics plus Orders provider-certification evidence, `commerceOrderStatusHandoff(orderId)` for the masked customer-safe order-status projection, `commerceOrderQuote()`/`refreshCommerceOrderQuote()`, `commerceOrderShippingLabel()`/`createCommerceOrderShippingLabel()`/`voidCommerceOrderShippingLabel()`, `commerceOrderFulfillment()`/`dispatchCommerceOrderFulfillment()`, `commerceOrderTracking()`/`refreshCommerceOrderTracking()`, `commerceOrderProviderRefund()`/`createCommerceOrderProviderRefund()`/`refreshCommerceOrderProviderRefund()`, `runCommerceReconciliation({ dryRun })`, `scheduledCommerceReconciliation({ dryRun })`, `commerceReconciliationReadiness()`, `scheduledPlatformCommerceReconciliation({ dryRun })`, `commerceProductProviderSync(productId)`, `syncCommerceProductProvider(productId, { provider })`, `commerceProductSubscriptions(productId)`, and `runCommerceProductSubscriptionAction(productId, orderId, { action })` to drive the audited commerce admin routes when the caller has the matching admin permission. `commerceProductProviderSync(productId).data.storefrontHandoff` returns the bounded `backy.product-storefront-handoff.v1` projection for custom product-page builders, with launch readiness, endpoint pointers, pricing/inventory/media/merchandising summaries, provider-sync booleans, and privacy flags that exclude provider secrets, raw provider responses, private orders, customer payloads, raw checkout sessions, and digital delivery URLs. `commerceOrderAnalytics().data.providerCertification.operatorEvidencePacket` and `commerceProductProviderSync(productId).data.providerCertification.operatorEvidencePacket` expose the redacted order/product provider-certification evidence packets for custom admin UIs without returning provider secrets, customer payloads, or raw order payloads. `orderDeliveryEvents()` and `productNotificationEvents()` read the protected delivery/notification event feed for custom back-office consoles. These methods return bounded non-secret handoff metadata, include the platform cron-readiness/batch reconciliation contract, keep provider credentials server-side, and require the same per-call admin auth options as the other admin SDK methods.

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

const mediaFileFirst = await backy.mediaFileCached('media_123', { disposition: 'attachment' });
const mediaFileSecond = await backy.mediaFileCached('media_123', {
  disposition: 'attachment',
  etag: mediaFileFirst.meta.etag,
});

const transformFirst = await backy.mediaTransformCached('media_123', { width: 1200, quality: 80 });
const transformSecond = await backy.mediaTransformCached('media_123', {
  width: 1200,
  quality: 80,
  etag: transformFirst.meta.etag,
});
```

The SDK intentionally does not import admin/editor code. It wraps the public site bootstrap, manifest/OpenAPI discovery, frontend-design contract, route resolution, render payload, SEO discovery, media, authenticated media binding, collection, commerce, reusable-section, blog taxonomy, form, comment, report, and event endpoints documented in `specs/backy-api-contracts.md`.
Manifest responses expose site-settings-backed locale discovery through `data.delivery` and per-locale router expansions through `data.modules.routing.localizedRoutePatterns`, so custom frontends can honor Backy's `none`, `path-prefix`, or `domain` locale strategy before calling `resolve()`/`render()`. Manifest media discovery also exposes typed `data.modules.media.fileCategories`, `deliveryPolicy`, and `managementPolicy` (`backy.media-management.v1`) so media pickers and authenticated custom admin shells can distinguish images, video, audio, documents/files, fonts, and other uploads, then choose direct public URLs, signed private-file URLs, responsive image transforms, downloadable assets, font manifests, or the admin upload/folder/version/signed-url/bind/transform helpers without hardcoding Backy routes or permissions. The convenience SDK exports `BackyLocaleStrategy`, narrows `BackyManifestDeliveryDiscovery.localeStrategy` to those documented routing modes, and types `BackyManifestRoutePattern`, `BackyManifestRouteFrontendDesign`, `BackyManifestLocalizedRoutePatternGroup`, `BackyManifestRedirectRule`, `BackyManifestRoutingModule`, `BackyManifestPageResource`, `BackyManifestPostResource`, `BackyManifestBlogModule`, `BackyManifestBlogCategory`, `BackyManifestBlogTag`, `BackyManifestBlogAuthor`, `BackyManifestCollectionSchema`, `BackyManifestReusableSection`, `BackyManifestReusableSectionsModule`, `BackyManifestFormDefinition`, `BackyManifestFormsManagementPolicy`, `BackyManifestMediaManagementPolicy`, `BackyManifestMediaModule`, `BackyManifestCommerceRuntimeModule`, and `BackyManifestCommerceManagementPolicy` for locale-aware router, redirect, route-template, blog archive/feed, dynamic collection, reusable-block, public form, forms management, media, commerce runtime, and commerce management discovery setup.
Manifest forms discovery also publishes `data.modules.formsRuntime.managementPolicy` and OpenAPI `x-backy-forms-management` as `backy.forms-management.v1`, covering authenticated form-builder CRUD, embed-block creation, analytics, submission moderation, delivery retries, contact/CRM automation, consent retention, required permissions, SDK helper names, and privacy guarantees for custom admin/frontends.
Authenticated custom admin/editor clients can use `buildBackyMediaBindingInput()` with aliases such as `target.type`, `target.id`, `pageId`, `postId`, `blogId`, `usage`, `context`, `actor`, and `editor`, then pass the canonical payload to `bindMedia()` to attach or detach a central media-library asset from a page or blog post through the audited admin media binding API. Public media delivery can use `buildBackyMediaFilePath()`, `buildBackyMediaFileUrl()`, or `backy.mediaFileUrl()` for the canonical `/api/sites/:siteId/media/:mediaId/file` endpoint, `buildBackyMediaTransformPath()`, `buildBackyMediaTransformUrl()`, or `backy.mediaTransformUrl()` for image optimizer redirects, and `mediaFileCached()` / `mediaTransformCached()` for `ETag` / `If-None-Match` revalidation with `x-backy-cache-revision`, content-disposition, redirect location, media id, and transform metadata. `buildBackyMediaDownloadLinkProps()` / `backy.mediaDownloadLinkProps()` emit the same downloadable button/link props Backy's editor stores: `href`, `download: true`, `fileMediaId`, `downloadMediaId`, plural media-id arrays, attachment disposition, and the admin signed-url endpoint hint. Private media delivery can use `buildBackyMediaSignedUrlInput()` with disposition aliases such as `download` plus TTL aliases such as `ttl`/`expiresIn`, then call `createMediaSignedUrl()` before passing the returned signed URL to a custom frontend. Custom admin clients can call `adminSites()`, `createAdminSite()`, `adminSite()`, `updateAdminSite()`, `deleteAdminSite()`, `adminSiteReadiness()`, and `duplicateAdminSite()` for authenticated multi-site lifecycle management, and `adminSettings()` plus `adminSiteSettings()` with the same per-call auth options as live-management methods to read the non-secret Settings provider-certification and frontend-database-certification handoffs without scraping the admin UI; update helpers forward authenticated PATCH writes while keeping `requestId` in the request header. Settings action helpers also expose `regenerateAdminSettingsApiKeys()`, `issueAdminSettingsApiKey()`, `revokeAdminSettingsApiKey()`, `validateAdminSettingsInfrastructure()`, `runAdminSettingsStorageProvisioningProbe()`, `runAdminSettingsStorageCredentialRotationProbe()`, `runAdminSettingsStorageSecretManager()`, and `testAdminSettingsNotificationWebhook()` so operations dashboards can drive audited API-key, provider-readiness, storage, Vercel-secret planning, and notification-test workflows without importing the Backy admin app. The authenticated site-structure bridge also exposes `adminNavigation()`/`updateAdminNavigation()`, `adminSeo()`/`updateAdminSeo()`, and `adminRedirects()`/`previewAdminRedirects()`/`updateAdminRedirects()` so external builders can manage menu trees, SEO defaults/route overrides, redirects, and 410 routes through Backy's audited APIs.
The SDK smoke now executes the safe Settings action helpers locally: named admin service-key issue/use/revoke without leaking the raw key into persisted settings, infrastructure diagnostics, storage provisioning readiness, credential-rotation readiness, Vercel secret-manager dry-run planning, and notification webhook delivery through an ephemeral local receiver. Live Supabase/Vercel/storage/notification provider certification remains gated by the Settings provider workflow and real credentials.
The authenticated custom-frontend design bridge exposes `adminFrontendDesign()`, `updateAdminFrontendDesign()`, `importAdminFrontendDesign()`, `captureAdminSiteDefaults()`, `captureAdminContentTemplate()`, and `adminTemplates()`. External builders can import frontend chrome/tokens/editable maps, capture page/blog/form/product/collection/section templates, inspect clone targets, and create new content with `frontendDesignTemplateId` without scraping the Backy admin UI.
`buildBackyContentDesignPayload()`, `buildBackyAdminPageCreateInput()`, `buildBackyAdminPageUpdateInput()`, `buildBackyAdminBlogPostCreateInput()`, `buildBackyAdminBlogPostUpdateInput()`, `buildBackyAdminReusableSectionCreateInput()`, `buildBackyAdminReusableSectionUpdateInput()`, `buildBackyAdminCollectionRecordCreateInput()`, `buildBackyAdminCollectionRecordUpdateInput()`, `buildBackyAdminCommerceProductCreateInput()`, and `buildBackyAdminCommerceProductUpdateInput()` normalize external design envelopes before create/update calls, preserving custom CSS/JS, canonical content documents, elements, canvas size, theme-token refs, assets, animation timelines, interactions, data bindings, editable maps, SEO, metadata, optimistic conflict fields, and `frontendDesign*` provenance. Product and collection-record helpers store the same editor state under `values.design` plus flat `values.frontendDesign*` fields so custom storefront pages can reopen page-builder state without reshaping Backy's CMS values by hand.
External editor shells can also read and save site-scoped collection binding presets with `adminCollectionBindingPresets()` and `updateAdminCollectionBindingPresets({ presets })`, preserving the same dataset field, target path, query, sort, pagination, and author metadata used by the built-in canvas Data panel.
Interactive builder consoles can manage reviewed rich components through `adminInteractiveComponents()`, `createAdminInteractiveComponent()`, `adminInteractiveComponent()`, `updateAdminInteractiveComponent()`, `deleteAdminInteractiveComponent()`, `adminInteractiveComponentUsage()`, `exportAdminInteractiveComponent()`, `reviewAdminInteractiveComponent()`, `uploadAdminInteractiveComponentBundle()`, `migrateAdminInteractiveComponentVersion()`, and `rollbackAdminInteractiveComponentVersion()`. These wrap the audited registry, usage inventory, portable export, submit/approve/reject flows, signed bundle storage, content migration, and version rollback while keeping sandbox validation and component execution on Backy's backend/runtime boundary.
The same authenticated SDK surface now covers central media-library management for custom editors: `adminMedia()`, `uploadMedia({ file, filename, folderId, visibility, tags })`, `updateAdminMedia()`, `replaceMedia()`, `deleteAdminMedia()`, `adminMediaFolders()`, `createMediaFolder()`, `updateMediaFolder()`, and `deleteMediaFolder()`. Upload and replacement calls send multipart `FormData`, keep admin credentials in headers/cookies, and preserve folder, scope, visibility, font, tag, and metadata fields used by the admin Media page.
Custom media consoles can also call `adminMediaVersions()`, `restoreMediaVersion()`, `deleteMediaVersion()`, `prepareMediaTransforms()`, and `ingestMediaProviderAnalytics()` for retained file history, responsive image variant generation, and provider-delivery analytics ingestion through the same audited central media workflows.
The SDK smoke now executes the central media lifecycle bridge against a temporary backend site: folder create/update/delete, public image upload, metadata update, page bind/unbind, responsive transform preparation, file replacement with retained-version listing, private PDF upload, signed download URL creation, and media cleanup.
Authenticated custom CMS clients can manage collection schemas and records without scraping the admin app: `adminCollections()`, `createAdminCollection()`, `adminCollection()`, `updateAdminCollection()`, `deleteAdminCollection()`, `exportAdminCollectionsBackup()`, `importAdminCollectionsBackup()`, `adminCollectionRecords()`, `createAdminCollectionRecord()`, `adminCollectionRecord()`, `updateAdminCollectionRecord()`, and `deleteAdminCollectionRecord()` wrap the admin collection APIs with the same per-call admin auth options as live-management.
Commerce admin consoles can use the product/order convenience wrappers `adminCommerceProducts()`, `createAdminCommerceProduct()`, `adminCommerceProduct()`, `updateAdminCommerceProduct()`, `deleteAdminCommerceProduct()`, `adminCommerceProductsCsv()`, `importAdminCommerceProductsCsv()`, `bulkAdminCommerceProducts()`, `adminCommerceOrders()`, `createAdminCommerceOrder()`, `adminCommerceOrder()`, `updateAdminCommerceOrder()`, `deleteAdminCommerceOrder()`, `adminCommerceOrdersCsv()`, `importAdminCommerceOrdersCsv()`, and `bulkAdminCommerceOrders()` over the audited `products` and `orders` collection-record APIs, with `collectionId` overrides for custom schema slugs. Generic CMS clients can call the matching collection-level batch helpers `adminCollectionRecordsCsv()`, `importAdminCollectionRecordsCsv()`, and `bulkAdminCollectionRecords()`.
The SDK smoke executes the CMS/commerce batch bridge against a temporary site: generic collection CSV import, bulk status update, bulk delete, product/order alias CSV imports with override collections, product/order alias bulk deletes, portable collection backup import, include-record backup export, and cleanup through `deleteAdminCollection()`.
Authenticated workspace tools can manage Backy user accounts through the SDK as well: `adminUsers()`, `createAdminUser()`, `adminUser()`, `updateAdminUser()`, `deleteAdminUser()`, `bulkAdminUsers()`, `adminUserPermissions()`, `updateAdminUserPermissions()`, `adminUserMfa()`, `updateAdminUserMfa()`, `createAdminUserInvite()`, `createAdminUserPasswordReset()`, `transferAdminUserOwnership()`, `adminAuthSessions()`, `revokeAdminAuthSession()`, `importAdminUsersCsv()`, and `rollbackAdminUsersImport()` wrap the audited Users/auth-session APIs with the same admin auth options. CSV import sends raw `text/csv` instead of JSON so external admin consoles can use Backy's existing duplicate, dry-run, upsert, billing-seat, and rollback safeguards.
The same workspace SDK layer covers team-scoped multi-site ownership: `adminTeams()`, `createAdminTeam()`, `adminTeam()`, `updateAdminTeam()`, `deleteAdminTeam()`, `adminTeamMembers()`, `inviteAdminTeamMember()`, `updateAdminTeamMember()`, and `removeAdminTeamMember()` wrap Backy's team/member APIs, preserving workspace site summaries, invite delivery metadata, membership-policy guards, and billing-limit enforcement for custom admin consoles.
Custom admin consoles can also read Backy's request-id-backed activity trail with `adminAuditLogs({ siteId, teamId, actorId, entity, entityId, action, auditRequestId, limit, offset })`, which wraps the same `activity.export`-gated audit log endpoint used by the built-in Site, Media, Users, Teams, and Settings activity panels.
Authenticated custom editor clients can manage reusable section libraries with `adminReusableSections()`, `createAdminReusableSection()`, `adminReusableSection()`, `updateAdminReusableSection()`, `deleteAdminReusableSection()`, `adminReusableSectionVersions()`, `restoreAdminReusableSectionVersion()`, `exportAdminReusableSections()`, `importAdminReusableSections()`, `adminReusableSectionInstances()`, `refreshAdminReusableSectionInstances()`, `adminReusableSectionMetadata()`, and `updateAdminReusableSectionMetadata()`, preserving Backy's saved-block version history, portable JSON import/export, synced-instance propagation, direct design-envelope create/update payloads, and library metadata workflow for external builders.
The default return types expose Backy contract shapes such as `BackyFrontendDesignContract`, `BackyRenderPayload`, `BackyContentDocument`, `BackySeoDiscovery`, `BackyMediaAsset`, `BackyMediaBindingResponse`, `BackyMediaSignedUrlResponse`, `BackyAdminSettings`, `BackySiteSettingsScope`, `BackyFontManifest`, `BackyCollectionRecord`, `BackyBlogCategory`, `BackyBlogTag`, `BackyBlogAuthor`, `BackyCommerceProduct`, `BackyCommerceOrderSummary`, `BackyReusableSection`, `BackyFormSubmission`, `BackyComment`, `BackyInteractionEvent`, `BackyResponseMeta`, and `BackyConditionalResult`. Collection record reads/writes are generic, so a frontend can pass its own value shape: `backy.records<{ title: string }>(collectionId)`. `buildBackyCollectionRecordWriteInput()` maps UI labels or field keys through a public collection schema, applies `metadata.visitorWritePolicy` create/update allowlists, reports ignored fields, and returns `{ values, options }` for `createRecord()` or `updateRecord()`.
Schema-derived public contract types are generated from `specs/ai-frontend-contract/*.schema.json` into `src/generated-contract-types.ts` before SDK build/typecheck. The generator also reads the live public OpenAPI route source to export `GeneratedBackyOpenApiOperationId`, `GeneratedBackyOpenApiComponentName`, per-component `GeneratedBackyOpenApi*` schema shapes, dedicated route resource/route-resolution types, typed navigation/SEO/page/blog/font/frontend-design schemas, typed media asset/reference/editable-metadata/management-policy schemas, typed collection field/permission/record schemas, typed form list/detail/definition/submission/validation/contact schemas, typed comment/moderation/report/blocklist schemas, typed interaction-event/runtime-record schemas, typed commerce catalog/order/webhook schemas, reusable-section content/document schemas, generated render-payload media/font/form/comment/navigation/frontend-design subtypes, generated content action/data-binding/editable-map subtypes, and dedicated interactive registry/runtime request types for the advertised operation/component inventory. Consumers can import generated shapes such as `GeneratedBackyFrontendManifest`, `GeneratedBackyFrontendManifestCompletionStatus`, `GeneratedBackyFrontendManifestNavigationItem`, `GeneratedBackyPublicRenderPayload`, `GeneratedBackyThemeTokens`, `GeneratedBackyContentElement`, `GeneratedBackyContentStatus`, `GeneratedBackyRenderMediaAsset`, `GeneratedBackyRenderNavigationItem`, `GeneratedBackyRenderFrontendDesign`, `GeneratedBackyFrontendDesignContract`, `GeneratedBackyElementAction`, `GeneratedBackyDataBinding`, `GeneratedBackyEditableMap`, `GeneratedBackyOpenApiDocument`, `GeneratedBackyOpenApiBackyCompletionStatus`, `GeneratedBackyOpenApiRouteResolveEnvelope`, `GeneratedBackyOpenApiGoneRouteResolveEnvelope`, `GeneratedBackyOpenApiPageRouteResource`, `GeneratedBackyOpenApiDynamicItemRouteResource`, `GeneratedBackyOpenApiNavigationEnvelope`, `GeneratedBackyOpenApiSeoDiscoveryEnvelope`, `GeneratedBackyOpenApiPageEnvelope`, `GeneratedBackyOpenApiBlogPostEnvelope`, `GeneratedBackyOpenApiFontManifestEnvelope`, `GeneratedBackyOpenApiFrontendDesignEnvelope`, `GeneratedBackyOpenApiMediaAsset`, `GeneratedBackyOpenApiMediaReferences`, `GeneratedBackyOpenApiMediaManagementPolicy`, `GeneratedBackyOpenApiCollectionFieldSchema`, `GeneratedBackyOpenApiCollectionSchema`, `GeneratedBackyOpenApiCollectionRecordEnvelope`, `GeneratedBackyOpenApiFormListEnvelope`, `GeneratedBackyOpenApiFormDefinitionEnvelope`, `GeneratedBackyOpenApiFormsManagementPolicy`, `GeneratedBackyOpenApiFormSubmissionValidationErrorEnvelope`, `GeneratedBackyOpenApiCommentBlocklistDeleteRequest`, `GeneratedBackyOpenApiCommentReportEnvelope`, `GeneratedBackyOpenApiEventsEnvelope`, `GeneratedBackyOpenApiRuntimeEventRecordEnvelope`, `GeneratedBackyOpenApiCommerceProduct`, `GeneratedBackyOpenApiCommerceOrderEnvelope`, `GeneratedBackyOpenApiCommerceManagementPolicy`, `GeneratedBackyOpenApiBackyContentDocument`, `GeneratedBackyOpenApiBackyReusableSectionContent`, `GeneratedBackyOpenApiInteractiveComponentRegistryEnvelope`, and `GeneratedBackyOpenApiInteractiveRuntimeEventRequest` when they need the strict schema contract rather than the more permissive convenience SDK interfaces.
Manifest `data.contract.databaseCertification` and OpenAPI `x-backy-database-certification` publish the non-secret database certification handoff for production custom frontends. The generated SDK exports this as `GeneratedBackyFrontendManifestDatabaseCertification`, and the convenience SDK manifest type exposes the same shape as `BackyFrontendDatabaseCertification` at `BackyFrontendManifest.contract.databaseCertification`; it names `npm run ci:sdk-postgres-smoke`, `.github/workflows/sdk-postgres-smoke.yml`, `BACKY_DATABASE_URL`/`DATABASE_URL`, `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true`, `BACKY_SDK_REQUIRE_DATABASE=1`, target guard env vars, the disposable migrated Supabase/Postgres requirement, and coverage families for media, forms, commerce, generated SDK/cache behavior, and interactive components while keeping database URLs and service credentials outside public responses. The same contract includes `operatorCommandTemplate` for a copyable guarded SDK Postgres command with `npm run doctor:release-certification`, `backy.frontend-database-certification-evidence.v1` scenario coverage for manifest/OpenAPI discovery, render and route resolution, media/font delivery, CMS/reusable content, forms/comments/events, commerce contracts, interactive runtime, generated SDK/cache behavior, and database runtime guards, plus `runtime` evidence for configured database URL alias presence, data mode/type, disposable confirmation state, target-guard presence, missing inputs, and certification readiness without returning the URL.
Manifest `data.contract.frontendLaunchReadiness` and OpenAPI `x-backy-frontend-launch-readiness` publish the non-secret launch summary for custom frontend operators. The generated SDK exports this as `GeneratedBackyFrontendManifestLaunchReadiness`, and the convenience SDK manifest type exposes `BackyFrontendLaunchReadiness` at `BackyFrontendManifest.contract.frontendLaunchReadiness`; it uses `backy.frontend-launch-readiness.v1` plus `backy.frontend-launch-action-plan.v1` to report status, score, endpoint/route/module counts, routing/render, CMS/design, media/font, visitor interaction, commerce, live-management, and database-certification checks, recommended commands such as `npm run ci:sdk-postgres-smoke`, and the explicit privacy boundary. This readiness handoff does not expose database URLs, provider keys, order records, or submission values. Manifest `data.contract.completionStatus` and OpenAPI `x-backy-completion-status` add the broader Backy completion handoff with `backy.completion-status.v1`, audited counts, the four remaining Partial surfaces, exact remaining gate commands/workflows, certified Forms/SDK database gates, required env aliases, runtime alias-presence booleans, and `surfaceRunbooks` for `/settings`, Settings admin APIs, `/products`, and `/orders`. `partialClosureReadiness.auditImpact` publishes the artifact-backed audit view: default no-artifact mode stays at `41 Ready / 4 Partial`, while accepted Settings and Commerce artifacts move the closure view to `45 Ready / 0 Partial`. Each runbook names the target inputs, evidence packet schema, evidence API/panel, source-only guard, expected artifacts, structured `evidenceArtifacts`, `artifactVerifier` doctor command/path/schema/no-secret/freshness checks, runtime family gaps, and no-secret boundary for the live provider gate. The verifier metadata includes `certifiedAtReady`, `artifactFreshReady`, the artifact age fields, and the default 168-hour/15-minute freshness window env controls used by `npm run doctor:release-certification`. The generated SDK exports `GeneratedBackyFrontendManifestCompletionStatus` and `GeneratedBackyOpenApiBackyCompletionStatus`, while the convenience SDK exposes `BackyCompletionStatus` plus `BackyCompletionArtifactVerifier`. The completion-status handoff uses the same no-secret boundary.
Live-management discovery is available through manifest `data.modules.liveManagement` and OpenAPI `x-backy-live-management`, with generated SDK typing for `GeneratedBackyOpenApiLiveManagementDiscovery`. It advertises page/blog edit bridges, optimistic `expectedUpdatedAt` guidance, editable target paths for text, links, media, layout, appearance, responsive overrides, and form controls, plus supported inline element groups and a versioned `backy.editor-composition-commands.v1` command handoff for custom frontend editing surfaces. The target list includes durable media design state such as `props.mediaId`, `props.fontMediaId`, focal/image presentation props, `assetIds`, `tokenRefs.*`, `animation.tokenRefs.*`, `responsive.mobile.x`, `responsive.tablet.width`, `responsive.*.props.*`, `responsive.*.styles.*`, and `responsive.*.tokenRefs.*` so a custom frontend can round-trip the same media/font/animation and breakpoint design details saved by Backy's editor. Authenticated custom frontends can call `adminPages()`, `createAdminPage()`, `adminPage()`, `updateAdminPage()`, `deleteAdminPage()`, `adminPageReadiness()`, `publishAdminPage()`, `archiveAdminPage()`, `createAdminPagePreviewToken()`, `adminPageRevisions()`, and `rollbackAdminPage()` for full page lifecycle management, and `adminBlogPosts()`, `createAdminBlogPost()`, `adminBlogPost()`, `updateAdminBlogPost()`, `deleteAdminBlogPost()`, `adminBlogPostReadiness()`, `publishAdminBlogPost()`, `archiveAdminBlogPost()`, `createAdminBlogPostPreviewToken()`, `adminBlogPostRevisions()`, and `rollbackAdminBlogPost()` for full blog-post lifecycle management. The admin blog taxonomy bridge also exposes `adminBlogCategories()`, `createAdminBlogCategory()`, `adminBlogCategory()`, `updateAdminBlogCategory()`, `deleteAdminBlogCategory()`, `adminBlogTags()`, `createAdminBlogTag()`, `adminBlogTag()`, `updateAdminBlogTag()`, `deleteAdminBlogTag()`, and `adminBlogAuthors()` for WordPress-style category, tag, and author admin clients. They can then use `liveManagedPage()`, `updateLiveManagedPage()`, `liveManagedBlogPost()`, and `updateLiveManagedBlogPost()` for inline page/blog editing with default headers or per-call `adminKey`, `apiKey`, `adminSession`, bearer token, actor, and credentials options. Update inputs are typed from the generated OpenAPI `PageUpdateRequest` and `BlogPostUpdateRequest` contracts, including canvas-object design state for elements, styles, responsive overrides, animations, token refs, assets, interactions, SEO, data bindings, editable maps, metadata, `customCSS`, `customJS`, and canonical content documents. `listBackyContentElements()` returns a flat external-editor layer inventory with parent/depth/path metadata plus editable target paths, including existing responsive override descriptors, while `findBackyContentElement()`, `addBackyContentElement()`, `duplicateBackyContentElement()`, `deleteBackyContentElements()`, `transformBackyContentElements()`, `groupBackyContentElements()`, `ungroupBackyContentElements()`, `patchBackyContentElement()`, `patchBackyContentElementDownloadFile()`, `patchBackyContentElements()`, `patchBackyContentEditableField()`, `patchBackyContentEditableFields()`, `patchBackyContentEditableMapEntry()`, `patchBackyContentEditableMapEntries()`, and `patchBackyContentEditableMapValues()` apply Canva-style add/duplicate/delete/move/resize/group/ungroup commands, uploaded-file download bindings, editable target paths, render `editableMap`-style `{ elementId, field, value }` updates, keyed editable-map updates, or form-state objects such as `{ "hero.title": "New headline" }` to nested page/blog content. Those patch helpers can write responsive target paths directly, including `responsive.mobile.styles.color`, `responsive.mobile.props.mediaId`, and editable-map `targetPath` aliases for per-breakpoint controls. Media/font patches through `props.mediaId`, `props.fontMediaId`, fallback image media, poster/background media, responsive media refs, downloadable-file helpers through `buildBackyContentDownloadFilePatch()` / `patchBackyContentElementDownloadFile()`, or `assetIds` automatically keep element-level `assetIds` in sync in the returned content tree. The discovery command handoff names the add/duplicate/delete/transform/group/ungroup SDK helpers, Insert, Cmd/Ctrl+D, Delete/Backspace, drag, Cmd/Ctrl+G, and Shift+Cmd/Ctrl+G shortcuts, same-parent/unlocked constraints where relevant, `props.editorGroup` marker, and tablet/mobile responsive geometry preservation. Command helpers block locked-layer mutations by default, rewrite child `parentId`s, preserve nested element trees, support responsive breakpoint transforms, and return changed content ready for `updateLiveManagedPage()`/`updateLiveManagedBlogPost()`. `buildBackyLiveManagedPageEditableMapUpdate()` and `buildBackyLiveManagedBlogPostEditableMapUpdate()` package editable-map edits into full conflict-safe update bodies with `expectedUpdatedAt`.
`evaluateBackyEditorCommandRegistry()` turns the discovered `backy.editor-command-registry.v1` into `backy.editor-command-registry-evaluation.v1` ready/disabled/hidden toolbar state from local content, selected ids, clipboard count, history state, permission flags, preview/save flags, and editor mode. Custom frontends can use it to bind Backy-compatible editor controls while persisting layout, responsive, animation, asset, data-binding, and editable-map changes through the live-management helpers above.
The SDK smoke now executes the page lifecycle bridge against a temporary backend page: create, conflict-safe update with `expectedUpdatedAt`, readiness, preview-token generation, publish, archive, revision listing, and delete.

`buildBackyFormSubmissionInput()` accepts a public form definition plus UI state from generated/custom frontends, maps canonical field keys or `frontendFieldKeyMap` aliases into `values`, keeps reserved transport metadata such as `requestId`, `pageId`, `postId`, `honeypot`, `startedAt`, captcha tokens, and contact-share overrides out of the field map, and returns the payload for `submitForm()`. `submitForm()` also accepts field values under `values`, `fields`, `data`, `submission`, or direct field keys for custom frontend compatibility. Validation failures throw `BackyApiError` with `code === "VALIDATION_ERROR"` and a `validation` array of `{ field, code, message, label? }` details.
Authenticated custom admin clients can call `adminForms()`, `createAdminForm()`, `adminForm()`, `updateAdminForm()`, `deleteAdminForm()`, `cloneAdminForm()`, `createAdminFormEmbedBlock()`, `formsAnalytics()`, `formContactSegments()`, `formContactLists()`, `saveFormContactList()`, and `deleteFormContactList()` with the same per-call admin auth options as live-management. Existing submission/contact methods also accept those options, and moderation/delivery/retention actions are available through `reviewFormSubmission()`, `retryFormSubmissionWebhook()`, `retryFormSubmissionEmail()`, `commentAnalytics()`, `retryCommentDelivery()`, `formDeliveryEvents()`, `adminSiteEvents()`, `applyAdminFormConsentRetention()`, and `applyAdminFormsConsentRetention()`. Contact and CRM automation can use `createFormContact()`, `importFormContactsCsv()`, `promoteFormContactToUser()`, `promoteFormContactToCustomer()`, `syncFormContacts()`, and `applyFormContactConsentRetention()`, so external form builders, CRM views, comment moderation consoles, and contact-list tools can drive Backy's backend without scraping the admin app.
The SDK smoke executes those safe Forms actions against a temporary site, including webhook retry through an ephemeral local receiver and email retry only when the admin runtime reports `local-outbox` delivery unless `BACKY_SDK_ALLOW_EXTERNAL_EMAIL_RETRY_SMOKE=1` is explicitly set.
The SDK write smoke exercises those Forms action bridges on a temporary site by creating a reusable form embed block, cloning a form, reviewing a submission, creating/updating/deleting a backend delivery-retry form, retrying a submission webhook through an ephemeral local receiver, retrying email through local outbox when safe, creating/importing contacts, saving/deleting a qualified-contact list, promoting contacts into an invited Backy user and the private customer collection, syncing a selected contact through an ephemeral local webhook receiver, and dry-running submission/contact consent retention before fixture cleanup.
`buildBackyCommentInput()` accepts generated/custom comment form state using aliases such as `content`, `body`, `comment`, `message`, `text`, `name`, `email`, `website`, `replyToId`, and `threadId`, then emits the canonical page/blog comment payload for `submitPageComment()` or `submitBlogComment()`. The helper normalizes author email casing and keeps request, thread, reply, guest/user identity, honeypot, `startedAt`, captcha-token, moderation-mode, and rate-limit metadata in transport fields instead of leaking UI-only aliases into the public comment body.
`buildBackyCommentReportInput()` accepts public comment-report UI state using aliases such as `reason`, `reportReason`, `category`, `actor`, `reporterEmail`, `email`, `details`, `message`, and `note`, then emits the canonical report payload for `reportComment()`. The public report endpoint returns the normalized report object and stores details in the comment-reported event metadata so external moderation UIs can correlate report submissions without scraping private admin state.
Authenticated moderation consoles can use the typed comment workflow helpers `siteComments()`, `updateComments()`, `clearCommentReports()`, `commentBlocklist()`, `deleteCommentBlocklistEntries()`, `comment()`, `updateComment()`, and `deleteComment()` for site-wide queues, bulk status changes, report resolution, blocked-author cleanup, single-comment moderation, and deletion without importing the admin Comments page.
`buildBackyInteractiveRuntimeEventInput()` accepts sandbox `postMessage`-style telemetry payloads, including prefixed lifecycle names such as `backy.interactive-component.error`, nested `component` metadata, nested `data` context, and error objects. It normalizes them into the bounded payload accepted by `recordInteractiveRuntimeEvent()` so custom frontends can report ready/init/resize/error/fallback/blocked diagnostics for registry-backed interactive figures and code components without depending on admin internals.

## Local validation

```sh
npm run generate:types --workspace @backy/sdk-js
npm run build --workspace @backy/sdk-js
npm run test:generated-types --workspace @backy/sdk-js
npm run test:smoke --workspace @backy/sdk-js
BACKY_DATABASE_DISPOSABLE_CONFIRMED=true BACKY_DATABASE_URL="postgresql://user:password@host:5432/backy" npm run ci:sdk-postgres-smoke
```

`test:smoke` expects a running Backy public app at `http://localhost:3001` unless `BACKY_SDK_BASE_URL` is set.
By default it also creates and deletes a temporary site through the local admin API so it can verify SDK SEO/reusable-section reads and public writes for collection records, forms, form delivery retries, contacts, comments, reports, and events. Set `BACKY_SDK_SKIP_WRITE_SMOKE=1` to run the read-only smoke against an environment where admin fixture setup is unavailable.
`ci:sdk-postgres-smoke` runs the same SDK typecheck/build/server/smoke flow with `BACKY_DATA_MODE=database`; it requires `BACKY_DATABASE_URL` or `DATABASE_URL` pointing at a disposable migrated Supabase/Postgres database plus `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true` after confirming the target is safe. The manual `SDK Postgres Smoke` GitHub Actions workflow runs this gate with the `BACKY_DATABASE_URL` or `DATABASE_URL` repository secret alias, forwards `disposable_database_confirmed=true` to `BACKY_DATABASE_DISPOSABLE_CONFIRMED`, and uses an ephemeral admin API key.

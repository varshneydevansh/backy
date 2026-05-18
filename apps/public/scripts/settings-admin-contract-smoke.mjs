#!/usr/bin/env node

import fs from "node:fs";

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), "utf8");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const includesAll = (source, snippets, label) => {
  for (const snippet of snippets) {
    assert(
      source.includes(snippet),
      `${label} missing required contract snippet: ${snippet}`,
    );
  }
};

const listRouteFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(
      `${entry.name}${entry.isDirectory() ? "/" : ""}`,
      directory,
    );
    if (entry.isDirectory()) {
      return listRouteFiles(child);
    }

    return entry.isFile() && entry.name === "route.ts" ? [child] : [];
  });

const routeSource = read("../src/app/api/admin/settings/route.ts");
const adminContractSmokeSource = read("./admin-contract-smoke.mjs");
const siteRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/settings/route.ts",
);
const siteDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/route.ts",
);
const siteSeoRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/seo/route.ts",
);
const siteNavigationRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/navigation/route.ts",
);
const siteRedirectsRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/redirects/route.ts",
);
const siteFrontendDesignRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/frontend-design/route.ts",
);
const sitePagePublishRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/pages/[pageId]/publish/route.ts",
);
const sitePageArchiveRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/pages/[pageId]/archive/route.ts",
);
const sitePageRollbackRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/pages/[pageId]/rollback/route.ts",
);
const siteBlogPublishRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/blog/[postId]/publish/route.ts",
);
const siteBlogArchiveRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/blog/[postId]/archive/route.ts",
);
const siteBlogRollbackRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/blog/[postId]/rollback/route.ts",
);
const sitePagesRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/pages/route.ts",
);
const sitePageDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts",
);
const siteBlogRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/blog/route.ts",
);
const siteBlogDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/blog/[postId]/route.ts",
);
const siteBlogCategoriesRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/blog/categories/route.ts",
);
const siteBlogCategoryDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/blog/categories/[categoryId]/route.ts",
);
const siteBlogTagsRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/blog/tags/route.ts",
);
const siteBlogTagDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/blog/tags/[tagId]/route.ts",
);
const siteReusableSectionsRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/reusable-sections/route.ts",
);
const siteReusableSectionDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/route.ts",
);
const siteReusableSectionsImportRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/reusable-sections/import/route.ts",
);
const siteReusableSectionMetadataRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/metadata/route.ts",
);
const siteReusableSectionRestoreRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/versions/[version]/restore/route.ts",
);
const siteReusableSectionInstancesRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances/route.ts",
);
const siteCollectionsRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/collections/route.ts",
);
const siteCollectionsImportRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/collections/import/route.ts",
);
const siteCollectionDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/collections/[collectionId]/route.ts",
);
const siteCollectionRecordsRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts",
);
const siteCollectionRecordDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts",
);
const siteCollectionRecordBulkRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/bulk/route.ts",
);
const siteCollectionRecordImportRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/import/route.ts",
);
const siteMediaRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/media/route.ts",
);
const siteMediaDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts",
);
const siteMediaBindRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/media/[mediaId]/bind/route.ts",
);
const siteMediaTransformsRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/media/[mediaId]/transforms/route.ts",
);
const siteMediaVersionDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/media/[mediaId]/versions/[versionId]/route.ts",
);
const siteMediaProviderAnalyticsRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/media/provider-analytics/route.ts",
);
const siteMediaFoldersRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/media/folders/route.ts",
);
const siteMediaFolderDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/media/folders/[folderId]/route.ts",
);
const siteFormEmbedBlockRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/forms/[formId]/embed-block/route.ts",
);
const siteCommerceProductProviderSyncRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/commerce/products/[productId]/provider-sync/route.ts",
);
const siteCommerceProductSubscriptionActionRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/commerce/products/[productId]/subscriptions/[orderId]/action/route.ts",
);
const siteCommerceOrderQuoteRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/quote/route.ts",
);
const siteCommerceOrderTrackingRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/tracking/route.ts",
);
const siteCommerceOrderFulfillmentRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/fulfillment/route.ts",
);
const siteCommerceOrderShippingLabelRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/shipping-label/route.ts",
);
const siteCommerceOrderProviderRefundRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/provider-refund/route.ts",
);
const siteInteractiveComponentsRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/interactive-components/route.ts",
);
const siteInteractiveComponentDetailRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/route.ts",
);
const siteInteractiveComponentReviewRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/review/route.ts",
);
const siteInteractiveComponentBundleRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/bundle/route.ts",
);
const siteInteractiveComponentMigrationRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/migrate/route.ts",
);
const siteInteractiveComponentRollbackRouteSource = read(
  "../src/app/api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/rollback/route.ts",
);
const siteOpenApiRouteSource = read(
  "../src/app/api/sites/[siteId]/openapi/route.ts",
);
const siteWebhookDeliverySource = read("../src/lib/siteWebhookDelivery.ts");
const proxySource = read("../src/proxy.ts");
const adminAccessSource = read("../src/lib/adminAccess.ts");
const coreTypesSource = read("../../../packages/core/src/types/index.ts");
const sdkIndexSource = read("../../../packages/sdk-js/src/index.ts");
const sdkGeneratedTypesSmokeSource = read(
  "../../../packages/sdk-js/scripts/generated-contract-types.ts",
);
const sdkTypeGeneratorSource = read(
  "../../../packages/sdk-js/scripts/generate-contract-types.mjs",
);
const adminSiteDetailSource = read(
  "../../../apps/admin/src/routes/sites.$siteId.tsx",
);
const apiContracts = read("../../../specs/backy-api-contracts.md");
const audit = read(
  "../../../specs/page-completion-audit/backy-page-surface-audit.md",
);
const billingRoutes = {
  sites: read("../src/app/api/admin/sites/route.ts"),
  siteDuplicate: read("../src/app/api/admin/sites/[siteId]/duplicate/route.ts"),
  siteUpdate: read("../src/app/api/admin/sites/[siteId]/route.ts"),
  teams: read("../src/app/api/admin/teams/route.ts"),
  teamMembers: read("../src/app/api/admin/teams/[teamId]/members/route.ts"),
  users: read("../src/app/api/admin/users/route.ts"),
  userImport: read("../src/app/api/admin/users/import/route.ts"),
  contactPromote: read(
    "../src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/[contactId]/promote/route.ts",
  ),
  pages: read("../src/app/api/admin/sites/[siteId]/pages/route.ts"),
  collections: read("../src/app/api/admin/sites/[siteId]/collections/route.ts"),
  forms: read("../src/app/api/admin/sites/[siteId]/forms/route.ts"),
  products: read(
    "../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts",
  ),
  mediaUpload: read("../src/app/api/admin/sites/[siteId]/media/route.ts"),
  mediaReplace: read(
    "../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts",
  ),
  mediaTransforms: read(
    "../src/app/api/admin/sites/[siteId]/media/[mediaId]/transforms/route.ts",
  ),
  publicOrders: read("../src/app/api/sites/[siteId]/commerce/orders/route.ts"),
};
const billingSmokeScripts = {
  sites: read("../../../apps/admin/scripts/sites-smoke.mjs"),
  teams: read("../../../apps/admin/scripts/teams-smoke.mjs"),
  users: read("../../../apps/admin/scripts/users-smoke.mjs"),
  contacts: read("../../../apps/admin/scripts/contacts-smoke.mjs"),
  pages: read("../../../apps/admin/scripts/pages-list-smoke.mjs"),
  collections: read("../../../apps/admin/scripts/collections-smoke.mjs"),
  forms: read("../../../apps/admin/scripts/forms-smoke.mjs"),
  media: read("../../../apps/admin/scripts/media-smoke.mjs"),
  commerce: read("../../../apps/admin/scripts/commerce-smoke.mjs"),
};

includesAll(
  routeSource,
  [
    "const ADMIN_SETTINGS_SCHEMA = 'backy.admin-settings.v1'",
    "schemaVersion: ADMIN_SETTINGS_SCHEMA",
    "workspaceSettingsScope: 'global'",
    "siteSettingsScope: 'site'",
    "siteSettingsEndpointTemplate: '/api/admin/sites/:siteId/settings'",
    "workspaceSettings: '/api/admin/settings'",
    "siteSettings: '/api/admin/sites/:siteId/settings'",
  ],
  "Admin settings payload schema/scope",
);

includesAll(
  proxySource,
  [
    "const BACKY_ADMIN_SETTINGS_SCHEMA_VERSION = 'backy.admin-settings.v1'",
    "const isAdminSettingsRequest",
    "schemaVersion?: string",
    "response.headers.set('x-backy-schema-version', schemaVersion)",
    "isAdminSettingsRequest(request) ? BACKY_ADMIN_SETTINGS_SCHEMA_VERSION : undefined",
  ],
  "Admin settings proxy headers",
);

includesAll(
  siteRouteSource,
  [
    'const SITE_SETTINGS_SCOPE_SCHEMA = "backy.site-settings-scope.v1"',
    'permission: "sites.view"',
    'permission: "sites.configure"',
    "filteredSiteSettingsPatch",
    "unsupportedSiteSettingsKeys",
    "NO_SITE_SETTINGS_CHANGES",
    "UNSUPPORTED_SITE_SETTINGS_KEYS",
    "normalizeSiteLocalization",
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    'kind: "site-updated"',
    'reason: "site.settings.updated"',
    "changedKeys",
    'source: "admin-site-settings-api"',
    "site.settings.updated",
    'workspaceSettingsScope: "global"',
    'siteSettingsScope: "site"',
    'workspaceSettings: "/api/admin/settings"',
    "siteSettings: `/api/admin/sites/${encodeURIComponent(site.id)}/settings`",
  ],
  "Site-scoped settings route contract",
);

includesAll(
  coreTypesSource,
  ['"site-created"', '"site-updated"', '"site-deleted"'],
  "Core site webhook event contract",
);

includesAll(
  adminSiteDetailSource,
  [
    '{ value: "site-created", label: "Site created" }',
    '{ value: "site-updated", label: "Site settings updated" }',
    '{ value: "site-deleted", label: "Site deleted" }',
  ],
  "Admin site webhook event selector",
);

includesAll(
  billingRoutes.sites,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    'kind: "site-created"',
    'reason: "site.created"',
    'lifecycle: "created"',
  ],
  "Admin site create webhook dispatch",
);

includesAll(
  siteDetailRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    'kind: "site-updated"',
    'kind: "site-deleted"',
    "siteWebhookPatchMetadata",
    "reason: auditAction",
    'reason: "site.deleted"',
    'lifecycle: "deleted"',
  ],
  "Admin site update webhook dispatch",
);

includesAll(
  siteSeoRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    'kind: "site-updated"',
    'reason: "site.seo.updated"',
    'changedKeys: ["seo"]',
    'source: "admin-site-seo-api"',
  ],
  "Admin site SEO webhook dispatch",
);

includesAll(
  siteNavigationRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    'kind: "site-updated"',
    'reason: "site.navigation.updated"',
    'changedKeys: ["navigation"]',
    'source: "admin-site-navigation-api"',
  ],
  "Admin site navigation webhook dispatch",
);

includesAll(
  siteRedirectsRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    'kind: "site-updated"',
    'reason: "site.redirects.updated"',
    'changedKeys: ["redirectRules"]',
    'source: "admin-site-redirects-api"',
  ],
  "Admin site redirects webhook dispatch",
);

includesAll(
  siteFrontendDesignRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverFrontendDesignSiteWebhook",
    'kind: "site-updated"',
    'changedKeys: ["frontendDesign"]',
    'source: "admin-site-frontend-design-api"',
    "frontendDesign.update",
    "frontendDesign.import",
    "frontendDesign.template.capture",
    "frontendDesign.capture",
  ],
  "Admin site frontend design webhook dispatch",
);

includesAll(
  sitePagePublishRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverPagePublishWebhook",
    'kind: "site-updated"',
    'reason: "page.published"',
    'changedKeys: ["content"]',
    'source: "admin-page-publish-api"',
    "pagePublishWebhookSnapshot",
  ],
  "Admin page publish webhook dispatch",
);

includesAll(
  siteBlogPublishRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverPostPublishWebhook",
    'kind: "site-updated"',
    'reason: "blog.post.published"',
    'changedKeys: ["content"]',
    'source: "admin-blog-publish-api"',
    "postPublishWebhookSnapshot",
  ],
  "Admin blog publish webhook dispatch",
);

includesAll(
  sitePageArchiveRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverPageArchiveWebhook",
    'reason: "page.archived"',
    'changedKeys: ["content"]',
    'source: "admin-page-archive-api"',
    "pageArchiveWebhookSnapshot",
  ],
  "Admin page archive webhook dispatch",
);

includesAll(
  sitePageRollbackRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverPageRollbackWebhook",
    'reason: "page.rolledBack"',
    'reason: "page-rolled-back"',
    'changedKeys: ["content"]',
    'source: "admin-page-rollback-api"',
    "pageRollbackWebhookSnapshot",
  ],
  "Admin page rollback webhook dispatch",
);

includesAll(
  siteBlogArchiveRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverPostArchiveWebhook",
    'reason: "blog.post.archived"',
    'changedKeys: ["content"]',
    'source: "admin-blog-archive-api"',
    "postArchiveWebhookSnapshot",
  ],
  "Admin blog archive webhook dispatch",
);

includesAll(
  siteBlogRollbackRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverPostRollbackWebhook",
    'reason: "blog.post.rolledBack"',
    'reason: "post-rolled-back"',
    'changedKeys: ["content"]',
    'source: "admin-blog-rollback-api"',
    "postRollbackWebhookSnapshot",
  ],
  "Admin blog rollback webhook dispatch",
);

includesAll(
  sitePagesRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverPageContentWebhook",
    "reason: params.action",
    "page.created",
    'changedKeys: ["content"]',
    'source: "admin-pages-api"',
  ],
  "Admin page create webhook dispatch",
);

includesAll(
  sitePageDetailRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverPageContentWebhook",
    "page.updated",
    "page.deleted",
    'changedKeys: ["content"]',
    'source: "admin-page-detail-api"',
    "changedFields",
  ],
  "Admin page detail webhook dispatch",
);

includesAll(
  siteBlogRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverPostContentWebhook",
    "reason: params.action",
    "blog.post.created",
    'changedKeys: ["content"]',
    'source: "admin-blog-api"',
  ],
  "Admin blog create webhook dispatch",
);

includesAll(
  siteBlogDetailRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverPostContentWebhook",
    "blog.post.updated",
    "blog.post.deleted",
    'changedKeys: ["content"]',
    'source: "admin-blog-detail-api"',
    "changedFields",
  ],
  "Admin blog detail webhook dispatch",
);

includesAll(
  siteBlogCategoriesRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverBlogCategoryWebhook",
    "blog.category.created",
    'changedKeys: ["content"]',
    'source: "admin-blog-categories-api"',
    "blogCategoryWebhookSnapshot",
  ],
  "Admin blog category create webhook dispatch",
);

includesAll(
  siteBlogCategoryDetailRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverBlogCategoryWebhook",
    "blog.category.updated",
    "blog.category.deleted",
    'changedKeys: ["content"]',
    'source: "admin-blog-category-detail-api"',
    "changedFields",
  ],
  "Admin blog category detail webhook dispatch",
);

includesAll(
  siteBlogTagsRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverBlogTagWebhook",
    "blog.tag.created",
    'changedKeys: ["content"]',
    'source: "admin-blog-tags-api"',
    "blogTagWebhookSnapshot",
  ],
  "Admin blog tag create webhook dispatch",
);

includesAll(
  siteBlogTagDetailRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverBlogTagWebhook",
    "blog.tag.updated",
    "blog.tag.deleted",
    'changedKeys: ["content"]',
    'source: "admin-blog-tag-detail-api"',
    "changedFields",
  ],
  "Admin blog tag detail webhook dispatch",
);

includesAll(
  siteReusableSectionsRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverReusableSectionWebhook",
    "reusableSection.created",
    'changedKeys: ["content"]',
    'source: "admin-reusable-sections-api"',
    "reusableSectionWebhookSnapshot",
  ],
  "Admin reusable section create webhook dispatch",
);

includesAll(
  siteReusableSectionDetailRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverReusableSectionWebhook",
    "reusableSection.updated",
    "reusableSection.deleted",
    'changedKeys: ["content"]',
    'source: "admin-reusable-section-detail-api"',
    "changedFields",
  ],
  "Admin reusable section detail webhook dispatch",
);

includesAll(
  siteReusableSectionsImportRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverReusableSectionImportWebhook",
    "reusableSection.imported",
    'changedKeys: ["content"]',
    'source: "admin-reusable-section-import-api"',
    "reusableSectionImportSnapshot",
  ],
  "Admin reusable section import webhook dispatch",
);

includesAll(
  siteReusableSectionMetadataRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverReusableSectionMetadataWebhook",
    "reusableSection.metadata.updated",
    'changedKeys: ["content"]',
    'source: "admin-reusable-section-metadata-api"',
    "changedFields",
  ],
  "Admin reusable section metadata webhook dispatch",
);

includesAll(
  siteReusableSectionRestoreRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverReusableSectionRestoreWebhook",
    "reusableSection.restored",
    'changedKeys: ["content"]',
    'source: "admin-reusable-section-restore-api"',
    "restoredFromVersion",
  ],
  "Admin reusable section restore webhook dispatch",
);

includesAll(
  siteReusableSectionInstancesRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverReusableSectionInstancesWebhook",
    "reusableSection.instances.refreshed",
    'changedKeys: ["content"]',
    'source: "admin-reusable-section-instances-api"',
    "refreshedTargets.length > 0",
  ],
  "Admin reusable section instance-refresh webhook dispatch",
);

includesAll(
  siteCollectionsRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverCollectionSchemaWebhook",
    "collection.created",
    'changedKeys: ["content", "collections"]',
    'source: "admin-collections-api"',
    "collectionAuditMetadata",
  ],
  "Admin collection create webhook dispatch",
);

includesAll(
  siteCollectionsImportRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverCollectionImportWebhook",
    "collection.imported",
    'changedKeys: ["content", "collections"]',
    'source: "admin-collections-import-api"',
    "importedCollectionSnapshot",
    "importedRecordSnapshot",
  ],
  "Admin collections import webhook dispatch",
);

includesAll(
  siteCollectionDetailRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverCollectionSchemaWebhook",
    "collection.updated",
    "collection.deleted",
    'changedKeys: ["content", "collections"]',
    'source: "admin-collection-detail-api"',
    "changedFields",
  ],
  "Admin collection detail webhook dispatch",
);

includesAll(
  siteCollectionRecordsRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverCollectionRecordWebhook",
    "collectionRecord.created",
    'changedKeys: ["content", "collections"]',
    'source: "admin-collection-records-api"',
    "collectionRecordAuditMetadata",
  ],
  "Admin collection record create webhook dispatch",
);

includesAll(
  siteCollectionRecordDetailRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverCollectionRecordWebhook",
    "collectionRecord.updated",
    "collectionRecord.deleted",
    'changedKeys: ["content", "collections"]',
    'source: "admin-collection-record-detail-api"',
    "changedFields",
  ],
  "Admin collection record detail webhook dispatch",
);

includesAll(
  siteCollectionRecordBulkRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverCollectionRecordBulkWebhook",
    "collectionRecord.bulk.deleted",
    "collectionRecord.bulk.statusUpdated",
    'changedKeys: ["content", "collections"]',
    'source: "admin-collection-record-bulk-api"',
    "requestedRecordIds",
  ],
  "Admin collection record bulk webhook dispatch",
);

includesAll(
  siteCollectionRecordImportRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverCollectionRecordImportWebhook",
    "collectionRecord.imported",
    'changedKeys: ["content", "collections"]',
    'source: "admin-collection-record-import-api"',
    "importedRecordSnapshot",
  ],
  "Admin collection record import webhook dispatch",
);

includesAll(
  siteMediaRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverMediaAssetWebhook",
    "media.created",
    'changedKeys: ["media"]',
    'source: "admin-media-api"',
    "mediaAssetWebhookSnapshot",
  ],
  "Admin media upload webhook dispatch",
);

includesAll(
  siteMediaDetailRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverMediaAssetWebhook",
    "media.updated",
    "media.replaced",
    "media.deleted",
    'changedKeys: ["media"]',
    'source: "admin-media-detail-api"',
    "changedFields",
  ],
  "Admin media detail webhook dispatch",
);

includesAll(
  siteMediaBindRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverMediaBindingWebhook",
    "media.bound",
    "media.unbound",
    'changedKeys: ["media"]',
    'source: "admin-media-bind-api"',
    "mediaBindingWebhookSnapshot",
    "targetType",
    "targetId",
  ],
  "Admin media bind webhook dispatch",
);

includesAll(
  siteMediaTransformsRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverMediaTransformWebhook",
    "media.transforms.prepared",
    'changedKeys: ["media"]',
    'source: "admin-media-transforms-api"',
    "mediaTransformWebhookSnapshot",
    "generatedBytes",
  ],
  "Admin media transforms webhook dispatch",
);

includesAll(
  siteMediaVersionDetailRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverMediaVersionWebhook",
    "media.version.restored",
    "media.version.deleted",
    'changedKeys: ["media"]',
    'source: "admin-media-version-detail-api"',
    "mediaVersionWebhookSnapshot",
    "versionSource",
  ],
  "Admin media retained-version webhook dispatch",
);

includesAll(
  siteMediaProviderAnalyticsRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverMediaProviderAnalyticsWebhook",
    "media.provider-analytics.ingest",
    'changedKeys: ["media"]',
    'source: "admin-media-provider-analytics-api"',
    "providerAnalyticsMediaWebhookSnapshot",
    "matchedCount",
    "unmatchedCount",
  ],
  "Admin media provider analytics webhook dispatch",
);

includesAll(
  siteMediaFoldersRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverMediaFolderWebhook",
    "mediaFolder.created",
    'changedKeys: ["media"]',
    'source: "admin-media-folders-api"',
    "mediaFolderWebhookSnapshot",
  ],
  "Admin media folder create webhook dispatch",
);

includesAll(
  siteMediaFolderDetailRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverMediaFolderWebhook",
    "mediaFolder.updated",
    "mediaFolder.deleted",
    'changedKeys: ["media"]',
    'source: "admin-media-folder-detail-api"',
    "changedFields",
  ],
  "Admin media folder detail webhook dispatch",
);

includesAll(
  siteFormEmbedBlockRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverFormEmbedBlockWebhook",
    "form.embedBlock.created",
    'changedKeys: ["content", "forms"]',
    'source: "admin-form-embed-block-api"',
    "formEmbedSectionWebhookSnapshot",
    "formEmbedWebhookSnapshot",
  ],
  "Admin form embed block webhook dispatch",
);

includesAll(
  siteCommerceProductProviderSyncRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverCommerceProductProviderSyncWebhook",
    "commerce.product.provider_sync",
    'changedKeys: ["content", "collections", "commerce"]',
    'source: "admin-commerce-product-provider-sync-api"',
    "providerSyncWebhookSnapshot",
    "commerceProductRecordWebhookSnapshot",
  ],
  "Admin commerce product provider-sync webhook dispatch",
);

includesAll(
  siteCommerceProductSubscriptionActionRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverProductSubscriptionActionWebhook",
    "commerce.product.subscription_action",
    'changedKeys: ["content", "collections", "commerce"]',
    'source: "admin-commerce-product-subscription-action-api"',
    "subscriptionOrderWebhookSnapshot",
    "subscriptionActionWebhookSnapshot",
  ],
  "Admin commerce product subscription action webhook dispatch",
);

includesAll(
  siteCommerceOrderQuoteRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverOrderQuoteWebhook",
    "commerce.order.quote_refreshed",
    'changedKeys: ["content", "collections", "commerce"]',
    'source: "admin-commerce-order-quote-api"',
    "quoteWebhookSnapshot",
    "orderRecordWebhookSnapshot",
  ],
  "Admin commerce order quote webhook dispatch",
);

includesAll(
  siteCommerceOrderTrackingRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverOrderTrackingWebhook",
    "commerce.order.tracking_refreshed",
    'changedKeys: ["content", "collections", "commerce"]',
    'source: "admin-commerce-order-tracking-api"',
    "trackingWebhookSnapshot",
    "orderRecordWebhookSnapshot",
  ],
  "Admin commerce order tracking webhook dispatch",
);

includesAll(
  siteCommerceOrderFulfillmentRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverOrderFulfillmentWebhook",
    "commerce.order.fulfillment_dispatched",
    'changedKeys: ["content", "collections", "commerce"]',
    'source: "admin-commerce-order-fulfillment-api"',
    "fulfillmentWebhookSnapshot",
    "orderRecordWebhookSnapshot",
  ],
  "Admin commerce order fulfillment webhook dispatch",
);

includesAll(
  siteCommerceOrderShippingLabelRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverOrderShippingLabelWebhook",
    "commerce.order.shipping_label_prepared",
    "commerce.order.shipping_label_voided",
    'changedKeys: ["content", "collections", "commerce"]',
    'source: "admin-commerce-order-shipping-label-api"',
    "shippingLabelWebhookSnapshot",
    "orderRecordWebhookSnapshot",
  ],
  "Admin commerce order shipping-label webhook dispatch",
);

includesAll(
  siteCommerceOrderProviderRefundRouteSource,
  [
    'import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";',
    "deliverOrderProviderRefundWebhook",
    "commerce.order.provider_refund_requested",
    "commerce.order.provider_refund_refreshed",
    'changedKeys: ["content", "collections", "commerce"]',
    'source: "admin-commerce-order-provider-refund-api"',
    "providerRefundWebhookSnapshot",
    "orderRecordWebhookSnapshot",
  ],
  "Admin commerce order provider-refund webhook dispatch",
);

includesAll(
  siteInteractiveComponentsRouteSource,
  [
    "import { deliverSiteWebhooks } from '@/lib/siteWebhookDelivery';",
    "deliverInteractiveComponentRegistryWebhook",
    "interactiveComponent.create",
    "changedKeys: ['interactiveComponents']",
    "source: 'admin-interactive-components-api'",
    "interactiveComponentWebhookSnapshot",
  ],
  "Admin interactive component create webhook dispatch",
);

includesAll(
  siteInteractiveComponentDetailRouteSource,
  [
    "import { deliverSiteWebhooks } from '@/lib/siteWebhookDelivery';",
    "deliverInteractiveComponentDetailWebhook",
    "interactiveComponent.update",
    "interactiveComponent.delete",
    "changedKeys: ['interactiveComponents']",
    "source: 'admin-interactive-component-detail-api'",
    "interactiveComponentWebhookSnapshot",
  ],
  "Admin interactive component update/delete webhook dispatch",
);

includesAll(
  siteInteractiveComponentReviewRouteSource,
  [
    "import { deliverSiteWebhooks } from '@/lib/siteWebhookDelivery';",
    "deliverInteractiveComponentReviewWebhook",
    "interactiveComponent.review.",
    "changedKeys: ['interactiveComponents']",
    "source: 'admin-interactive-component-review-api'",
    "interactiveComponentWebhookSnapshot",
  ],
  "Admin interactive component review webhook dispatch",
);

includesAll(
  siteInteractiveComponentBundleRouteSource,
  [
    "import { deliverSiteWebhooks } from '@/lib/siteWebhookDelivery';",
    "deliverInteractiveComponentBundleWebhook",
    "interactiveComponent.bundle.upload",
    "changedKeys: ['interactiveComponents']",
    "source: 'admin-interactive-component-bundle-api'",
    "interactiveComponentWebhookSnapshot",
    "sha256: params.bundle.sha256",
  ],
  "Admin interactive component bundle webhook dispatch",
);

includesAll(
  siteInteractiveComponentMigrationRouteSource,
  [
    "import { deliverSiteWebhooks } from '@/lib/siteWebhookDelivery';",
    "deliverInteractiveComponentMigrationWebhook",
    "interactiveComponent.migrate",
    "changedKeys: ['content', 'interactiveComponents']",
    "source: 'admin-interactive-component-migration-api'",
    "interactiveComponentWebhookSnapshot",
    "migratedTargets",
    "migratedElements",
  ],
  "Admin interactive component migration webhook dispatch",
);

includesAll(
  siteInteractiveComponentRollbackRouteSource,
  [
    "import { deliverSiteWebhooks } from '@/lib/siteWebhookDelivery';",
    "deliverInteractiveComponentRollbackWebhook",
    "interactiveComponent.rollback",
    "changedKeys: ['interactiveComponents']",
    "source: 'admin-interactive-component-rollback-api'",
    "interactiveComponentWebhookSnapshot",
    "restoredFromVersion",
    "disabledVersions",
  ],
  "Admin interactive component rollback webhook dispatch",
);

includesAll(
  siteWebhookDeliverySource,
  [
    "schemaVersion: 'backy.site-webhook.v1'",
    "kind: params.kind",
    "'x-backy-site-webhook-event': params.kind",
    "'x-backy-webhook-endpoint-id': endpoint.id",
    "channel: 'site-webhook'",
    "status: 'queued'",
    "response.ok ? 'succeeded'",
    "status: 'failed'",
    "recordRepositoryInteractionEvent",
    "trackWebhookEvent(event)",
    "DELIVERY_TIMEOUT_MS = 5000",
  ],
  "Site webhook delivery helper",
);

includesAll(
  routeSource,
  [
    "runtimeDatabase: getDatabaseRuntimeSummary()",
    "runtimeSupabase: getSupabaseRuntimeSummary()",
    "runtimeVercel: getVercelRuntimeSummary()",
    "runtimeNotifications: getNotificationRuntimeSummary()",
    "runtimeCommerce: getCommerceRuntimeSummary(settings)",
    "runtimeInteractiveComponents: getInteractiveComponentRuntimeSummary()",
    "BACKY_ETSY_ACCESS_TOKEN",
    "etsyAccessTokenConfigured",
    "etsyApiKeyConfigured",
    "etsyShopConfigured",
  ],
  "Admin settings runtime diagnostics",
);

includesAll(
  routeSource,
  [
    "validateSecretReferencePolicy(integrations)",
    "SECRET_REFERENCE_REQUIRED",
    "validateCommerceProviderEndpoints(integrations)",
    "subscriptionActionProvider",
    "catalogSyncProvider",
    "validateInfrastructureProviderSettings(integrations)",
    "validateAuthPolicySettings",
    "sanitizeSettingsAuditSnapshot",
  ],
  "Admin settings validation/audit guard",
);

includesAll(
  routeSource,
  [
    "body.action === 'media-storage-provisioning-probe'",
    "body.action === 'media-storage-credential-rotation-probe'",
    "body.action === 'media-storage-secret-manager'",
    "body.action === 'test-notification-webhook'",
    "runStorageContainerAutomation",
    "runStorageOperationChecks",
    "runMediaStorageCredentialRotationProbe",
    "runMediaStorageSecretManager",
    "vercelEnvRequest",
    "createVercelEnvKey",
    "deleteVercelEnvKey",
    "settings.media_storage.provisioning_probe",
    "settings.media_storage.credential_rotation_probe",
    "settings.media_storage.secret_manager",
    "settings.notification_webhook.test",
  ],
  "Admin settings executable provider operation contract",
);

includesAll(
  adminContractSmokeSource,
  [
    "backy.settings-provider-certification-handoff.v1",
    "providerCertificationRequiredInputs",
    "missing provider certification required input",
    "BACKY_DATABASE_URL or DATABASE_URL",
    "BACKY_SUPABASE_URL or SUPABASE_URL",
    "BACKY_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY",
    "BACKY_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY",
    "BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER",
    "BACKY_SUPABASE_STORAGE_BUCKET or BACKY_STORAGE_BUCKET",
    "BACKY_S3_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID",
    "BACKY_S3_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY",
    "VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID",
    "BACKY_EMAIL_DELIVERY_ENDPOINT or BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL",
    "BACKY_RESEND_API_KEY or RESEND_API_KEY",
    "BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY",
    "BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY",
    "BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY",
    "BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY",
    "BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET",
  ],
  "Admin settings runtime provider certification handoff contract",
);

includesAll(
  routeSource,
  [
    "body.action === 'issue-admin-api-key'",
    "body.action === 'revoke-admin-api-key'",
    "sanitizeServiceKeyGrant",
    "keyHash: _keyHash",
    "settings.api_keys.issue",
    "settings.api_keys.revoke",
  ],
  "Admin settings service-key contract",
);

includesAll(
  routeSource,
  [
    "monthlyOrderLimit",
    "siteLimit",
    "teamLimit",
    "seatLimit",
    "['block', 'warn', 'manual-review'].includes(overageMode)",
  ],
  "Admin settings billing-limit normalization",
);

includesAll(
  billingRoutes.sites,
  ["enforceSiteBillingLimit", "BILLING_SITE_LIMIT", "overageMode", "siteLimit"],
  "Site creation billing guard",
);

includesAll(
  billingRoutes.siteDuplicate,
  [
    "enforceSiteBillingLimit",
    "BILLING_SITE_LIMIT",
    "before duplicating another site",
  ],
  "Site duplication billing guard",
);

includesAll(
  billingRoutes.siteUpdate,
  [
    "enforceCustomDomainBillingLimit",
    "BILLING_CUSTOM_DOMAIN_LIMIT",
    "customDomainLimit",
  ],
  "Custom domain billing guard",
);

includesAll(
  billingRoutes.teams,
  ["enforceTeamBillingLimit", "BILLING_TEAM_LIMIT", "teamLimit"],
  "Team creation billing guard",
);

includesAll(
  billingRoutes.teamMembers,
  ["enforceSeatBillingLimit", "BILLING_SEAT_LIMIT", "seatLimit"],
  "Team member seat billing guard",
);

includesAll(
  billingRoutes.users,
  ["enforceSeatBillingLimit", "BILLING_SEAT_LIMIT", "seatLimit"],
  "User creation billing guard",
);

includesAll(
  billingRoutes.userImport,
  [
    "enforceImportSeatBillingLimit",
    "BILLING_SEAT_LIMIT",
    "requestedCreateCount",
  ],
  "User import seat billing guard",
);

includesAll(
  billingRoutes.contactPromote,
  [
    "enforceSeatBillingLimit",
    "BILLING_SEAT_LIMIT",
    "before promoting another contact to a user",
  ],
  "Contact promotion seat billing guard",
);

includesAll(
  billingRoutes.pages,
  ["enforcePageBillingLimit", "BILLING_PAGE_LIMIT", "pageLimit"],
  "Page quota billing guard",
);

includesAll(
  billingRoutes.collections,
  [
    "enforceCollectionBillingLimit",
    "BILLING_COLLECTION_LIMIT",
    "collectionLimit",
  ],
  "Collection quota billing guard",
);

includesAll(
  billingRoutes.forms,
  ["enforceFormBillingLimit", "BILLING_FORM_LIMIT", "formLimit"],
  "Form quota billing guard",
);

includesAll(
  billingRoutes.products,
  ["enforceProductBillingLimit", "BILLING_PRODUCT_LIMIT", "productLimit"],
  "Product quota billing guard",
);

includesAll(
  billingRoutes.mediaUpload,
  ["enforceMediaBillingLimit", "BILLING_MEDIA_LIMIT", "readMediaBillingLimit"],
  "Media upload billing guard",
);

includesAll(
  billingRoutes.mediaReplace,
  ["BILLING_MEDIA_LIMIT", "readMediaBillingLimit", "replacementVersionBytes"],
  "Media replacement billing guard",
);

includesAll(
  billingRoutes.mediaTransforms,
  ["BILLING_MEDIA_LIMIT", "readMediaBillingLimit", "generatedTransformBytes"],
  "Media transform billing guard",
);

includesAll(
  billingRoutes.publicOrders,
  [
    "enforceMonthlyOrderBillingLimit",
    "BILLING_ORDER_LIMIT",
    "monthlyOrderLimit",
  ],
  "Public checkout order billing guard",
);

includesAll(
  billingSmokeScripts.sites,
  ["BILLING_SITE_LIMIT", "BILLING_CUSTOM_DOMAIN_LIMIT"],
  "Sites billing smoke coverage",
);

includesAll(
  billingSmokeScripts.teams,
  ["BILLING_TEAM_LIMIT", "BILLING_SEAT_LIMIT"],
  "Teams billing smoke coverage",
);

includesAll(
  billingSmokeScripts.users,
  ["BILLING_SEAT_LIMIT", "Billing seat-limited import"],
  "Users billing smoke coverage",
);

includesAll(
  billingSmokeScripts.contacts,
  ["BILLING_SEAT_LIMIT", "Billing seat-limited contact promotion"],
  "Contact promotion billing smoke coverage",
);

includesAll(
  billingSmokeScripts.pages,
  ["BILLING_PAGE_LIMIT"],
  "Pages billing smoke coverage",
);

includesAll(
  billingSmokeScripts.collections,
  ["BILLING_COLLECTION_LIMIT"],
  "Collections billing smoke coverage",
);

includesAll(
  billingSmokeScripts.forms,
  ["BILLING_FORM_LIMIT"],
  "Forms billing smoke coverage",
);

includesAll(
  billingSmokeScripts.media,
  [
    "BILLING_MEDIA_LIMIT",
    "Billing media replacement limit",
    "Billing media transform limit",
  ],
  "Media billing smoke coverage",
);

includesAll(
  billingSmokeScripts.commerce,
  ["BILLING_PRODUCT_LIMIT", "BILLING_ORDER_LIMIT"],
  "Commerce billing smoke coverage",
);

includesAll(
  adminAccessSource,
  [
    "findActiveServiceAdminKey",
    "touchLastUsed",
    "Owner-only permissions require an owner admin session",
  ],
  "Admin service-key access boundary",
);

includesAll(
  apiContracts,
  [
    "x-backy-schema-version: backy.admin-settings.v1",
    'data.settings.schemaVersion: "backy.admin-settings.v1"',
    'data.settings.scope.workspaceSettingsScope: "global"',
    "/api/admin/sites/:siteId/settings",
    "backy.site-settings-scope.v1",
    "UNSUPPORTED_SITE_SETTINGS_KEYS",
    "`localization`",
    "`site.settings.updated`",
    '"issue-admin-api-key"',
    '"revoke-admin-api-key"',
    "settings.api_keys.issue",
    "settings.api_keys.revoke",
  ],
  "Settings API contracts documentation",
);

includesAll(
  apiContracts,
  [
    "backy.site-webhook.v1",
    "SiteWebhookPayload",
    "GeneratedBackyOpenApiSiteWebhookPayload",
    "x-backy-site-webhook-event",
    "x-backy-webhook-endpoint-id",
    "site-created",
    "site-updated",
    "site-deleted",
    "form-submission",
    "commerce-webhook",
    "interactive-runtime",
  ],
  "Site webhook API contracts documentation",
);

includesAll(
  audit,
  [
    "`GET/PATCH/POST /api/admin/settings` responses now advertise the stable `backy.admin-settings.v1` schema",
    "success payloads include schema/scope/endpoint metadata",
    "`GET/PATCH /api/admin/sites/:siteId/settings` now provides a dedicated `backy.site-settings-scope.v1` envelope",
    "workspace-vs-site scope envelope",
    "named service-key issue/authenticate/owner-only denial/last-used/revoke behavior",
    "Settings billing enforcement contract update",
    "broad site-owned webhook dispatch coverage",
    "no longer carries a generic broader-contract-test blocker",
    "executable provider-operation actions for storage provisioning",
    "Real-provider certification for Supabase, Vercel, storage, notification, and commerce providers.",
    "Backy release certification workflow",
    "SETUP.md",
  ],
  "Settings page audit documentation",
);

includesAll(
  siteOpenApiRouteSource,
  [
    "SiteWebhookPayload",
    "backy.site-webhook.v1",
    "site-created",
    "site-updated",
    "site-deleted",
    "form-submission",
    "commerce-webhook",
    "interactive-runtime",
  ],
  "Site webhook OpenAPI payload contract",
);

includesAll(
  sdkIndexSource,
  ["GeneratedBackyOpenApiSiteWebhookPayload"],
  "SDK site webhook payload export",
);

includesAll(
  sdkGeneratedTypesSmokeSource,
  [
    "GeneratedBackyOpenApiSiteWebhookPayload",
    "siteWebhookPayload",
    "invalidSiteWebhookSchemaVersion",
    "invalidSiteWebhookKind",
  ],
  "SDK generated site webhook payload type smoke",
);

includesAll(
  sdkTypeGeneratorSource,
  ["operationId:\\s*['\"]([^'\"]+)['\"]"],
  "SDK OpenAPI operation id generator quote handling",
);

const siteOwnedInvalidationRoutesMissingWebhooks = listRouteFiles(
  new URL("../src/app/api/admin/sites/[siteId]/", import.meta.url),
)
  .map((fileUrl) => ({
    fileUrl,
    source: fs.readFileSync(fileUrl, "utf8"),
  }))
  .filter(({ source }) => source.includes("recordSiteCacheInvalidation"))
  .filter(({ source }) => !source.includes("deliverSiteWebhooks"))
  .map(({ fileUrl }) =>
    decodeURIComponent(fileUrl.pathname).replace(process.cwd(), "."),
  );

assert(
  siteOwnedInvalidationRoutesMissingWebhooks.length === 0,
  `Site-owned cache invalidation routes must dispatch site webhooks: ${siteOwnedInvalidationRoutesMissingWebhooks.join(", ")}`,
);

console.log(
  JSON.stringify({
    ok: true,
    contracts: ["backy.admin-settings.v1", "backy.site-settings-scope.v1"],
  }),
);

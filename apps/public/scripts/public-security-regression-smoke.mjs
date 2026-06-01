#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname, "..");

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, needle, label) {
  assert(source.includes(needle), `${label} missing ${needle}`);
}

function assertExcludes(source, needle, label) {
  assert(!source.includes(needle), `${label} unexpectedly includes ${needle}`);
}

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1;
}

function regexOccurrenceCount(source, pattern) {
  return Array.from(source.matchAll(pattern)).length;
}

const publicRouteStateSource = read("apps/public/src/components/PublicRouteState.tsx");
const publicNotFoundSource = read("apps/public/src/app/not-found.tsx");
const publicUnauthorizedSource = read("apps/public/src/app/unauthorized.tsx");
const publicForbiddenSource = read("apps/public/src/app/forbidden.tsx");
const publicErrorSource = read("apps/public/src/app/error.tsx");

for (const needle of [
  "data-backy-public-route-state",
  "data-backy-error-status",
  "data-backy-error-code",
  'data-backy-route-state-contract="backy.public-route-state.v1"',
  "aria-live={kind === 'not-found' ? 'polite' : 'assertive'}",
  "Public API clients receive the matching normalized error code through Backy JSON endpoints.",
]) {
  assertIncludes(
    publicRouteStateSource,
    needle,
    "public hosted route states must expose stable recovery and API-contract hooks",
  );
}

for (const [label, source, status, code, kind] of [
  ["not-found", publicNotFoundSource, "404", "NOT_FOUND", 'kind="not-found"'],
  ["unauthorized", publicUnauthorizedSource, "401", "AUTH_REQUIRED", 'kind="auth-required"'],
  ["forbidden", publicForbiddenSource, "403", "FORBIDDEN", 'kind="forbidden"'],
  ["error", publicErrorSource, "500", "INTERNAL_SERVER_ERROR", 'kind="error"'],
]) {
  assertIncludes(source, "PublicRouteState", `public ${label} route boundary must use shared Backy state UI`);
  assertIncludes(source, `statusCode={${status}}`, `public ${label} route boundary must expose ${status}`);
  assertIncludes(source, `code="${code}"`, `public ${label} route boundary must expose ${code}`);
  assertIncludes(source, kind, `public ${label} route boundary must expose stable route-state kind`);
}

assertIncludes(
  publicErrorSource,
  "onRetry={reset}",
  "public runtime error boundary must expose a retry action instead of a dead end",
);

const sdkClientSource = read("packages/sdk-js/src/index.ts");
assertIncludes(
  sdkClientSource,
  "export const BACKY_MAX_LIST_LIMIT = 100",
  "JS SDK must expose the public list limit cap",
);
assertIncludes(
  sdkClientSource,
  "function normalizeListLimit",
  "JS SDK must normalize public list limits",
);
assertIncludes(
  sdkClientSource,
  "function normalizeListQuery",
  "JS SDK must normalize public list query objects",
);
assert(
  regexOccurrenceCount(
    sdkClientSource,
    /normalizeListQuery\s*\(\s*queryOptions/g,
  ) >= 15,
  "JS SDK public list methods must clamp limit/offset query options before requests",
);
assertIncludes(
  sdkClientSource,
  "query: { limit: normalizeListLimit(options.limit) }",
  "JS SDK RSS fetch helper must clamp limit before request",
);

function functionSource(source, functionName, label) {
  const start = source.indexOf(`export async function ${functionName}`);
  assert(start !== -1, `${label} missing ${functionName} handler`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

const protectedRoutes = [
  {
    file: "apps/public/src/app/api/sites/[siteId]/comments/route.ts",
    gates: ["permission: 'comments.view'", "permission: 'comments.manage'"],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/comments/[commentId]/route.ts",
    gates: ["permission: 'comments.view'", "permission: 'comments.manage'"],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/comments/blocklist/route.ts",
    gates: ["permission: 'comments.view'", "permission: 'comments.manage'"],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/[commentId]/route.ts",
    gates: ["permission: 'comments.view'", "permission: 'comments.manage'"],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/[commentId]/route.ts",
    gates: ["permission: 'comments.view'", "permission: 'comments.manage'"],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts",
    gates: ["permission: 'forms.view'"],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/[submissionId]/route.ts",
    gates: ["permission: 'forms.view'", "permission: 'forms.manage'"],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/forms/[formId]/contacts/route.ts",
    gates: ["permission: 'forms.view'"],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/forms/[formId]/contacts/[contactId]/route.ts",
    gates: ["permission: 'forms.view'", "permission: 'forms.manage'"],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/events/route.ts",
    gates: [
      "permission: permissionForKind(kind)",
      "'forms.view'",
      "'comments.view'",
      "'commerce.view'",
      "'activity.export'",
    ],
  },
  {
    file: "apps/public/src/app/api/admin/teams/route.ts",
    gates: ["permission: 'users.view'", "permission: 'users.manage'"],
  },
  {
    file: "apps/public/src/app/api/admin/teams/[teamId]/route.ts",
    gates: ["permission: 'users.view'", "permission: 'users.manage'"],
  },
  {
    file: "apps/public/src/app/api/admin/teams/[teamId]/members/route.ts",
    gates: ["permission: 'users.view'", "permission: 'users.manage'"],
  },
  {
    file: "apps/public/src/app/api/admin/teams/[teamId]/members/[memberId]/route.ts",
    gates: ["permission: 'users.manage'"],
  },
];

for (const route of protectedRoutes) {
  const source = read(route.file);
  assertIncludes(source, "from '@/lib/adminAccess'", route.file);
  assertIncludes(source, "requireAdminAccess(", route.file);
  for (const gate of route.gates) {
    assertIncludes(source, gate, route.file);
  }
}

const publicIntakeRoutes = [
  {
    file: "apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts",
    required: [
      "validateAndClassifyFormSubmission(",
      "captchaErrorResponseIfNeeded(",
      "form.isActive",
    ],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts",
    required: [
      "resolveCommentSubmissionPolicy(",
      "validateAndClassifyComment(",
      "honeypot",
    ],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts",
    required: [
      "resolveCommentSubmissionPolicy(",
      "validateAndClassifyComment(",
      "honeypot",
    ],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/comments/[commentId]/report/route.ts",
    required: ["enableReports", "reportRepositoryComment(", "reportComment("],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/collections/[collectionId]/records/route.ts",
    required: [
      "collection.permissions.publicCreate",
      "status: 'draft'",
      "validateCollectionRecordValues(",
      "applyVisitorCreateFieldPolicy(",
    ],
  },
  {
    file: "apps/public/src/app/api/sites/[siteId]/commerce/orders/route.ts",
    required: [
      "ORDER_QUEUE_NOT_PRIVATE",
      "hasPublicOrderCollectionAccess(ordersCollection.permissions)",
      "collections.createRecord(",
      "collections.updateRecord(",
    ],
  },
];

for (const route of publicIntakeRoutes) {
  const source = read(route.file);
  for (const needle of route.required) {
    assertIncludes(source, needle, route.file);
  }
}

const adminSitesRoute = read("apps/public/src/app/api/admin/sites/route.ts");
for (const needle of [
  "resolveSiteCreateTeamId",
  "BACKY_DEFAULT_TEAM_ID",
  "BACKY_TEAM_ID",
  "existingSites.pagination.hasMore",
  "TEAM_REQUIRED",
]) {
  assertIncludes(
    adminSitesRoute,
    needle,
    "admin sites route must infer or clearly require a database team id",
  );
}
assertExcludes(
  adminSitesRoute,
  "'Team ID is required in database mode'",
  "admin sites route must not hard-fail when UI omits teamId",
);

const adminTeamsRoute = read("apps/public/src/app/api/admin/teams/route.ts");
assertIncludes(
  adminTeamsRoute,
  "repositories.teams.list",
  "admin teams route must list database-backed teams",
);
assertIncludes(
  adminTeamsRoute,
  "repositories.teams.create",
  "admin teams route must create database-backed teams",
);
assertIncludes(
  adminTeamsRoute,
  "repositories.teams.addMember",
  "admin teams route must add the owner membership on create",
);
const adminTeamRoute = read(
  "apps/public/src/app/api/admin/teams/[teamId]/route.ts",
);
assertIncludes(
  adminTeamRoute,
  "repositories.teams.update",
  "admin team detail route must update database-backed teams",
);
assertIncludes(
  adminTeamRoute,
  "repositories.teams.delete",
  "admin team detail route must delete database-backed teams",
);
assertIncludes(
  adminTeamRoute,
  "TEAM_HAS_SITES",
  "admin team delete must block teams that still own sites",
);
const adminTeamsUiRoute = read("apps/admin/src/routes/teams.tsx");
assertIncludes(
  adminTeamsUiRoute,
  "getUserPermissions",
  "teams admin page must load frontend permissions",
);
assertIncludes(
  adminTeamsUiRoute,
  "'users.manage'",
  "teams admin page must gate mutations on users.manage",
);
assertIncludes(
  adminTeamsUiRoute,
  "canManageTeams={canManageTeams}",
  "teams admin page must pass mutation permission to team controls",
);
assertIncludes(
  adminTeamsUiRoute,
  "getTeamMemberMutationBlockReason",
  "teams admin page must guard unsafe member role/remove mutations",
);
assertIncludes(
  adminTeamsUiRoute,
  "Use another owner/admin account to change your own team membership.",
  "teams admin page must protect current admin team membership",
);
assertIncludes(
  adminTeamsUiRoute,
  "Add another owner before removing the final team owner.",
  "teams admin page must protect final owner removal",
);
assertIncludes(
  adminTeamsUiRoute,
  "latestInviteDelivery",
  "admin teams page must persist the latest invite delivery result",
);
assertIncludes(
  adminTeamsUiRoute,
  'data-testid="team-invite-delivery-panel"',
  "admin teams page must render a persistent invite delivery panel",
);
assertIncludes(
  adminTeamsUiRoute,
  "navigator.clipboard.writeText(latestInviteDelivery.invite.inviteUrl)",
  "admin teams invite panel must expose copyable invite URLs",
);
const teamManagementComponent = read(
  "apps/admin/src/components/teams/TeamManagement.tsx",
);
assertIncludes(
  teamManagementComponent,
  "busyMemberAction",
  "team management controls must track member mutation busy state",
);
assertIncludes(
  teamManagementComponent,
  "handleUpdateMemberRole",
  "team management role changes must catch and show mutation failures",
);
assertIncludes(
  teamManagementComponent,
  "handleRemoveMember",
  "team management removals must catch and show mutation failures",
);
assertIncludes(
  teamManagementComponent,
  "disabled={mutationsDisabled}",
  "team management create/edit/delete/invite controls must disable without permission",
);
assertIncludes(
  teamManagementComponent,
  "memberMutationBlockReason",
  "team management controls must compute per-member safety blocks",
);
assertIncludes(
  teamManagementComponent,
  "currentAdminId && member.userId === currentAdminId",
  "team management controls must identify current admin memberships by id",
);
assertIncludes(
  teamManagementComponent,
  "removeDisabled",
  "team management remove buttons must disable when membership guardrails apply",
);
const adminTeamMembersRoute = read(
  "apps/public/src/app/api/admin/teams/[teamId]/members/route.ts",
);
assertIncludes(
  adminTeamMembersRoute,
  "repositories.teams.addMember",
  "admin team members route must add database-backed team members",
);
assertIncludes(
  adminTeamMembersRoute,
  "repositories.users.create",
  "admin team member invite must create invited users when needed",
);
const adminTeamMemberRoute = read(
  "apps/public/src/app/api/admin/teams/[teamId]/members/[memberId]/route.ts",
);
assertIncludes(
  adminTeamMemberRoute,
  "repositories.teams.updateMember",
  "admin team member route must update roles",
);
assertIncludes(
  adminTeamMemberRoute,
  "repositories.teams.removeMember",
  "admin team member route must remove members",
);

const commerceCollectionAdminRoutes = [
  {
    file: "apps/public/src/app/api/admin/sites/[siteId]/collections/route.ts",
    handlers: [
      {
        name: "POST",
        collectionPermission: "'collections.edit'",
        commerceOperations: ["'configure'"],
      },
    ],
  },
  {
    file: "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/route.ts",
    handlers: [
      {
        name: "GET",
        collectionPermission: "'collections.view'",
        commerceOperations: ["'view'"],
      },
      {
        name: "PATCH",
        collectionPermission: "'collections.edit'",
        commerceOperations: ["'configure'"],
      },
      {
        name: "DELETE",
        collectionPermission: "'collections.delete'",
        commerceOperations: ["'delete'"],
      },
    ],
  },
  {
    file: "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts",
    handlers: [
      {
        name: "GET",
        collectionPermission: "'collections.view'",
        commerceOperations: ["'view'"],
      },
      {
        name: "POST",
        collectionPermission: "'collections.edit'",
        commerceOperations: ["'edit'"],
      },
    ],
  },
  {
    file: "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts",
    handlers: [
      {
        name: "GET",
        collectionPermission: "'collections.view'",
        commerceOperations: ["'view'"],
      },
      {
        name: "PATCH",
        collectionPermission: "'collections.edit'",
        commerceOperations: ["'edit'"],
      },
      {
        name: "DELETE",
        collectionPermission: "'collections.delete'",
        commerceOperations: ["'delete'"],
      },
    ],
  },
  {
    file: "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/bulk/route.ts",
    handlers: [
      {
        name: "POST",
        collectionPermission: "'collections.",
        commerceOperations: ["'edit'", "'delete'"],
      },
    ],
  },
  {
    file: "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/import/route.ts",
    handlers: [
      {
        name: "POST",
        collectionPermission: "'collections.edit'",
        commerceOperations: ["'edit'"],
      },
    ],
  },
];

const commerceCollectionAccess = read(
  "apps/public/src/lib/adminCommerceCollectionAccess.ts",
);
for (const needle of [
  "'products'",
  "'orders'",
  "view: 'commerce.view'",
  "edit: 'commerce.edit'",
  "delete: 'commerce.delete'",
  "configure: 'commerce.configure'",
  "requireAdminAccess(",
]) {
  assertIncludes(
    commerceCollectionAccess,
    needle,
    "commerce collection access helper",
  );
}

for (const route of commerceCollectionAdminRoutes) {
  const source = read(route.file);
  assertIncludes(source, "@/lib/adminAccess", route.file);
  assertIncludes(source, "requireAdminAccess(", route.file);
  assertIncludes(source, "@/lib/adminCommerceCollectionAccess", route.file);
  if (
    route.file ===
      "apps/public/src/app/api/admin/sites/[siteId]/collections/route.ts" ||
    route.file ===
      "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/route.ts"
  ) {
    assertIncludes(source, "parseAdminCollectionFields(", route.file);
  }
  for (const handler of route.handlers) {
    const handlerSource = functionSource(source, handler.name, route.file);
    assert(
      handlerSource.includes(handler.collectionPermission) ||
        handlerSource.includes(
          handler.collectionPermission.replaceAll("'", '"'),
        ),
      `${route.file} ${handler.name} missing ${handler.collectionPermission}`,
    );
    assert(
      /requireCommerceCollection(?:Slug)?Access\(/.test(handlerSource),
      `${route.file} ${handler.name} must call commerce collection access after resolving products/orders`,
    );
    for (const operation of handler.commerceOperations) {
      assert(
        handlerSource.includes(operation) ||
          handlerSource.includes(operation.replaceAll("'", '"')),
        `${route.file} ${handler.name} must require commerce ${operation} for products/orders in addition to ${handler.collectionPermission}`,
      );
    }
  }
}

const commerceOrderRecordDetailRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts",
);
const orderInventoryRestoreHelper = read(
  "apps/public/src/lib/orderInventoryRestore.ts",
);
const commerceWebhookRoute = read(
  "apps/public/src/app/api/sites/[siteId]/commerce/webhook/route.ts",
);
const commerceReconcileSettlementRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/commerce/reconcile/route.ts",
);
assertIncludes(
  commerceWebhookRoute,
  "@/lib/publicContractResponse",
  "commerce webhook route must use shared contract response headers",
);
assertIncludes(
  commerceWebhookRoute,
  "private",
  "commerce webhook success responses must be no-store/private",
);
assertIncludes(
  commerceWebhookRoute,
  "error",
  "commerce webhook error responses must be no-store",
);
assertIncludes(
  commerceWebhookRoute,
  "schemaVersion: EVENT_SCHEMA_VERSION",
  "commerce webhook responses must expose the schema version header",
);
assertIncludes(
  commerceWebhookRoute,
  "siteId: site.id",
  "commerce webhook responses must expose the site id header",
);
for (const needle of ["inventoryrestoredat", "shouldRestoreOrderInventory"]) {
  assertIncludes(
    orderInventoryRestoreHelper,
    needle,
    "shared order inventory helper must restore reserved inventory once on cancel/refund",
  );
}
for (const [source, label] of [
  [commerceOrderRecordDetailRoute, "admin order workflow"],
  [commerceWebhookRoute, "commerce webhook settlement"],
  [commerceReconcileSettlementRoute, "commerce reconciliation"],
]) {
  assertIncludes(
    source,
    "applyRepositoryOrderInventoryRestore",
    `${label} must restore repository inventory on terminal order states`,
  );
  assertIncludes(
    source,
    "applyDemoOrderInventoryRestore",
    `${label} must restore demo inventory on terminal order states`,
  );
}

const adminCollectionFields = read(
  "apps/public/src/lib/adminCollectionFields.ts",
);
for (const needle of [
  "COLLECTION_FIELD_TYPES",
  "isCollectionFieldType",
  "Collection fields must be an array.",
  "has an unsupported type.",
  "is duplicated.",
  "default value must be JSON-compatible.",
]) {
  assertIncludes(
    adminCollectionFields,
    needle,
    "admin collection field validator",
  );
}

const adminCollectionImportRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/collections/import/route.ts",
);
for (const needle of [
  "parseAdminCollectionFields",
  "@/lib/adminCollectionFields",
  "const parsedFields = parseAdminCollectionFields(value.fields);",
  "VALIDATION_ERROR",
  "parsed.message",
  "parsed.details",
]) {
  assertIncludes(
    adminCollectionImportRoute,
    needle,
    "admin collection backup import field validation",
  );
}
assertExcludes(
  adminCollectionImportRoute,
  "const parseFields =",
  "admin collection backup import field validation",
);

const repositoryCollectionRecordWriteRoutes = [
  "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/import/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/collections/import/route.ts",
  "apps/public/src/app/api/sites/[siteId]/collections/[collectionId]/records/route.ts",
  "apps/public/src/app/api/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts",
  "apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/route.ts",
];

for (const route of repositoryCollectionRecordWriteRoutes) {
  const source = read(route);
  assertIncludes(
    source,
    "validateRepositoryCollectionRecordValues",
    `${route} repository-backed collection record validation`,
  );
  assertIncludes(
    source,
    "validateRepositoryCollectionRecordValues({",
    `${route} repository-backed collection record validation`,
  );
}

const commerceReconcileRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/commerce/reconcile/route.ts",
);
const commerceReconcilePost = functionSource(
  commerceReconcileRoute,
  "POST",
  "commerce reconcile route",
);
assertIncludes(
  commerceReconcileRoute,
  "@/lib/publicContractResponse",
  "site commerce reconcile route must use shared contract response headers",
);
assertIncludes(
  commerceReconcileRoute,
  "private",
  "site commerce reconcile success responses must be no-store/private",
);
assertIncludes(
  commerceReconcileRoute,
  "error",
  "site commerce reconcile error responses must be no-store",
);
assertIncludes(
  commerceReconcileRoute,
  "schemaVersion: RECONCILIATION_SCHEMA_VERSION",
  "site commerce reconcile responses must expose the schema version header",
);
assertIncludes(
  commerceReconcileRoute,
  "siteId: site.id",
  "site commerce reconcile responses must expose the site id header",
);
assertIncludes(
  commerceReconcilePost,
  "permission: 'commerce.configure'",
  "commerce reconcile route must match configure-only admin UI policy",
);
const commerceBatchReconcileRoute = read(
  "apps/public/src/app/api/admin/commerce/reconcile/route.ts",
);
assertIncludes(
  commerceBatchReconcileRoute,
  "@/lib/publicContractResponse",
  "platform commerce reconcile route must use shared contract response headers",
);
assertIncludes(
  commerceBatchReconcileRoute,
  "private",
  "platform commerce reconcile success responses must be no-store/private",
);
assertIncludes(
  commerceBatchReconcileRoute,
  "error",
  "platform commerce reconcile error responses must be no-store",
);
assertIncludes(
  commerceBatchReconcileRoute,
  "schemaVersion: BATCH_SCHEMA_VERSION",
  "platform commerce reconcile responses must expose the schema version header",
);
const commerceReconcileReadinessRoute = read(
  "apps/public/src/app/api/admin/commerce/reconcile/readiness/route.ts",
);
assertIncludes(
  commerceReconcileReadinessRoute,
  "@/lib/publicContractResponse",
  "commerce reconcile readiness route must use shared contract response headers",
);
assertIncludes(
  commerceReconcileReadinessRoute,
  "private",
  "commerce reconcile readiness success responses must be no-store/private",
);
assertIncludes(
  commerceReconcileReadinessRoute,
  "error",
  "commerce reconcile readiness error responses must be no-store",
);
assertIncludes(
  commerceReconcileReadinessRoute,
  "schemaVersion: READINESS_SCHEMA_VERSION",
  "commerce reconcile readiness responses must expose the schema version header",
);

const publicFormAudienceAccess = read(
  "apps/public/src/lib/publicFormAudienceAccess.ts",
);
for (const needle of [
  "isPublicFormAudience",
  "filterPublicAudienceForms",
  "requirePublicFormAudienceAccess",
  "permission = action === 'submit' && audience === 'adminOnly' ? 'forms.manage' : 'forms.view'",
  "FORM_AUTHENTICATION_REQUIRED",
  "FORM_ADMIN_ONLY",
]) {
  assertIncludes(
    publicFormAudienceAccess,
    needle,
    "public form audience access helper",
  );
}

const publicFormsListRoute = read(
  "apps/public/src/app/api/sites/[siteId]/forms/route.ts",
);
assertIncludes(
  publicFormsListRoute,
  "filterPublicAudienceForms(payload.items)",
  "public forms list must hide non-public repository forms",
);
assertIncludes(
  publicFormsListRoute,
  "filterPublicAudienceForms(listFormsBySite",
  "public forms list must hide non-public demo forms",
);

const publicFormDefinitionRoute = read(
  "apps/public/src/app/api/sites/[siteId]/forms/[formId]/definition/route.ts",
);
assertIncludes(
  publicFormDefinitionRoute,
  "@/lib/publicFormAudienceAccess",
  "public form definition route must import audience guard",
);
assertIncludes(
  functionSource(
    publicFormDefinitionRoute,
    "GET",
    "public form definition route",
  ),
  "requirePublicFormAudienceAccess(request, requestId, form, 'definition')",
  "public form definition route must enforce audience before disclosure",
);
assertIncludes(
  publicFormDefinitionRoute,
  "cache: form.audience === 'public' ? 'discovery' : 'private'",
  "restricted form definitions must not use public discovery cache",
);
assert(
  occurrenceCount(
    publicFormDefinitionRoute,
    "requirePublicFormAudienceAccess(request, requestId, form, 'definition')",
  ) >= 2,
  "public form definition route must enforce audience in repository and demo branches",
);

const publicFormDetailRoute = read(
  "apps/public/src/app/api/sites/[siteId]/forms/[formId]/route.ts",
);
assertIncludes(
  publicFormDetailRoute,
  "@/lib/publicFormAudienceAccess",
  "public form detail route must import audience guard",
);
assertIncludes(
  functionSource(publicFormDetailRoute, "GET", "public form detail route"),
  "requirePublicFormAudienceAccess(_request, requestId, form, 'definition')",
  "public form detail route must enforce audience before disclosure",
);
assert(
  occurrenceCount(
    publicFormDetailRoute,
    "requirePublicFormAudienceAccess(_request, requestId, form, 'definition')",
  ) >= 2,
  "public form detail route must enforce audience in repository and demo branches",
);

const publicFormSubmissionRoute = read(
  "apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts",
);
assertIncludes(
  publicFormSubmissionRoute,
  "@/lib/publicFormAudienceAccess",
  "public form submission route must import audience guard",
);
assertIncludes(
  functionSource(
    publicFormSubmissionRoute,
    "POST",
    "public form submission route",
  ),
  "requirePublicFormAudienceAccess(request, responseRequestId, form, 'submit')",
  "public form submission route must enforce audience before parsing submissions",
);
assertIncludes(
  publicFormSubmissionRoute,
  "normalizeFrontendSubmissionValueKeys(form, parsed.values)",
  "public form submission route must map trusted frontend field aliases before filtering",
);
assertIncludes(
  publicFormSubmissionRoute,
  "normalizeFormSubmissionValues(form, frontendNormalizedValues)",
  "public form submission route must strip undeclared submission keys before storage and routing",
);
assertIncludes(
  publicFormSubmissionRoute,
  "enabled: formShareEnabled,",
  "public form submission route must only use admin-configured contact sharing",
);
assertExcludes(
  publicFormSubmissionRoute,
  "parsed.contactShareOverride",
  "public form submission route must ignore public contact-share overrides",
);
assertExcludes(
  publicFormSubmissionRoute,
  "ContactShareOverridePayload",
  "public form submission route must not parse public contact-share overrides",
);
assertExcludes(
  publicFormSubmissionRoute,
  "classification.status === 'approved' || classification.status === 'pending'",
  "public form submission route must not route pending submissions into contacts or collections",
);
assert(
  occurrenceCount(
    publicFormSubmissionRoute,
    "requirePublicFormAudienceAccess(request, responseRequestId, form, 'submit')",
  ) >= 2,
  "public form submission route must enforce audience in repository and demo branches",
);
assert(
  occurrenceCount(
    publicFormSubmissionRoute,
    "const frontendNormalizedValues = normalizeFrontendSubmissionValueKeys(form, parsed.values);",
  ) >= 2,
  "public form submission route must normalize frontend field aliases in repository and demo branches",
);
assert(
  occurrenceCount(
    publicFormSubmissionRoute,
    "const submissionValues = normalizeFormSubmissionValues(form, frontendNormalizedValues);",
  ) >= 2,
  "public form submission route must normalize declared submission fields in repository and demo branches",
);
assert(
  occurrenceCount(publicFormSubmissionRoute, "values: submissionValues") >= 4,
  "public form submission route must persist and notify with normalized submission values",
);
assertIncludes(
  publicFormSubmissionRoute,
  "resolveFormSubmissionEmailRecipient(params.form, notifications)",
  "public form submission route must use the global settings recipient as an email fallback",
);
assertIncludes(
  publicFormSubmissionRoute,
  "recipientSource: recipient.source",
  "public form submission route must disclose whether email delivery used form or settings recipient",
);
assert(
  occurrenceCount(publicFormSubmissionRoute, "parsed.values") ===
    occurrenceCount(
      publicFormSubmissionRoute,
      "normalizeFrontendSubmissionValueKeys(form, parsed.values)",
    ),
  "public form submission route must not pass raw parsed submission values beyond normalization",
);

const backyStoreSource = read("apps/public/src/lib/backyStore.ts");
for (const needle of [
  "invalid_number",
  "invalid_date",
  "invalid_tel",
  "invalid_file",
  "normalizeFormSubmissionValues",
]) {
  assertIncludes(
    backyStoreSource,
    needle,
    "form submission validation must enforce intrinsic field types and declared keys",
  );
}

const adminFormSubmissionReviewRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/route.ts",
);
assertIncludes(
  adminFormSubmissionReviewRoute,
  "createRepositoryCollectionRecordFromSubmission",
  "admin submission review must route approved repository submissions into collection records",
);
assertIncludes(
  adminFormSubmissionReviewRoute,
  "createCollectionRecordFromFormSubmission(",
  "admin submission review must route approved demo submissions into collection records",
);
assertIncludes(
  adminFormSubmissionReviewRoute,
  "updated.status === 'approved' && form.collectionTarget?.enabled && !updated.collectionRecord",
  "admin submission review must create missing collection records only on approval",
);

const adminPasswordPolicy = read(
  "apps/public/src/lib/admin-auth/passwordPolicy.ts",
);
assertIncludes(
  adminPasswordPolicy,
  "getAdminAuthPolicySettings",
  "admin password policy must read persisted auth settings",
);
assertIncludes(
  adminPasswordPolicy,
  "minPasswordLength",
  "admin password policy must expose minimum length",
);
assertIncludes(
  adminPasswordPolicy,
  "MIN_PASSWORD_LENGTH = 8",
  "admin password policy must preserve lower UI bound",
);
assertIncludes(
  adminPasswordPolicy,
  "MAX_PASSWORD_LENGTH = 128",
  "admin password policy must preserve upper UI bound",
);
const adminAuthPolicyHelper = read(
  "apps/public/src/lib/admin-auth/emailPolicy.ts",
);
assertIncludes(
  adminAuthPolicyHelper,
  "await repositories.settings.get()",
  "admin auth policy helper must read database settings when repositories are configured",
);
assertIncludes(
  adminAuthPolicyHelper,
  "getAdminSettings()",
  "admin auth policy helper must read demo settings during local fallback",
);
const resetPasswordRoute = read(
  "apps/public/src/app/api/admin/auth/reset-password/route.ts",
);
assertIncludes(
  resetPasswordRoute,
  "@/lib/admin-auth/passwordPolicy",
  "reset password route must import password policy",
);
assertIncludes(
  resetPasswordRoute,
  "validateAdminPasswordPolicy(password, authSettings)",
  "reset password route must enforce persisted password policy",
);
assertIncludes(
  resetPasswordRoute,
  "getRequiredDatabaseRepositories",
  "reset password route must support database-backed users",
);
assertIncludes(
  resetPasswordRoute,
  "await resetAdminPasswordToken(token, password, repositories",
  "reset password route must await repository-aware invite-only reset policy checks",
);
assertIncludes(
  resetPasswordRoute,
  "repositories.users.setPasswordCredential(userId, credential)",
  "reset password route must persist database-backed password credentials",
);
assertIncludes(
  resetPasswordRoute,
  "credentialMode: repositories ? 'database' : 'local-demo'",
  "reset password route audit must disclose credential persistence mode",
);
assertIncludes(
  resetPasswordRoute,
  "'INVITE_ONLY_REQUIRED'",
  "reset password route must return stable invite-only policy code",
);
assertExcludes(
  resetPasswordRoute,
  "password.length < 8",
  "reset password route",
);

const passwordRecoveryRoute = read(
  "apps/public/src/app/api/admin/auth/password-recovery/route.ts",
);
for (const needle of [
  "createAdminPasswordResetToken",
  "getEmailDeliveryConfig",
  "isExternalEmailDeliveryConfigured",
  "canIssueRecoveryToken",
  "deliverAdminPasswordResetEmail",
  "validateAdminInviteOnlyActivationPolicy",
  "getRequiredDatabaseRepositories",
  "BACKY_EXPOSE_LOCAL_RECOVERY_TOKEN",
]) {
  assertIncludes(
    passwordRecoveryRoute,
    needle,
    "password recovery route must create and deliver reset tokens without account enumeration",
  );
}
const adminUserEmailDelivery = read(
  "apps/public/src/lib/adminUserEmailDelivery.ts",
);
assertIncludes(
  adminUserEmailDelivery,
  "sendEmailMessage",
  "admin user email delivery helper must use configured email sender",
);

const adminEmailPolicy = read("apps/public/src/lib/admin-auth/emailPolicy.ts");
assertIncludes(
  adminEmailPolicy,
  "getAdminSettings()",
  "admin email policy must read persisted settings",
);
assertIncludes(
  adminEmailPolicy,
  "getRequiredDatabaseRepositories()",
  "admin email policy must read database-backed settings",
);
assertIncludes(
  adminEmailPolicy,
  "allowedEmailDomains",
  "admin email policy must enforce configured domains",
);
assertIncludes(
  adminEmailPolicy,
  "validateAdminEmailDomainPolicy",
  "admin email policy must expose validator",
);
assertIncludes(
  adminEmailPolicy,
  "validateAdminInviteOnlyCreatePolicy",
  "admin email policy must expose invite-only create validator",
);
assertIncludes(
  adminEmailPolicy,
  "validateAdminInviteOnlyActivationPolicy",
  "admin email policy must expose invite-only activation validator",
);
for (const route of [
  "apps/public/src/app/api/admin/users/route.ts",
  "apps/public/src/app/api/admin/users/[userId]/route.ts",
  "apps/public/src/app/api/admin/users/import/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/[contactId]/promote/route.ts",
]) {
  const source = read(route);
  assertIncludes(
    source,
    "@/lib/admin-auth/emailPolicy",
    `${route} must import email domain policy`,
  );
  assertIncludes(
    source,
    "validateAdminEmailDomainPolicy(",
    `${route} must enforce email domain policy`,
  );
  assertIncludes(
    source,
    "EMAIL_DOMAIN_NOT_ALLOWED",
    `${route} must use a stable email-domain error code`,
  );
  assertIncludes(
    source,
    "INVITE_ONLY_REQUIRED",
    `${route} must use a stable invite-only error code`,
  );
}
const adminLoginRoute = read(
  "apps/public/src/app/api/admin/auth/login/route.ts",
);
assertExcludes(
  adminLoginRoute,
  "@/lib/admin-auth/emailPolicy",
  "login route must not lock out existing admins when domains change",
);
assertIncludes(
  adminLoginRoute,
  "authenticateAdminCredentialsWithPersistence",
  "login route must use repository-backed user lookup outside demo mode",
);
assertIncludes(
  adminLoginRoute,
  "repositories.users.getByEmail",
  "login route must resolve database users by email outside demo mode",
);
assertIncludes(
  adminLoginRoute,
  "repositories.users.getPasswordCredentialByEmail",
  "login route must verify database-backed password credentials outside demo mode",
);
const adminAccessSource = read("apps/public/src/lib/adminAccess.ts");
assertIncludes(
  adminAccessSource,
  "export async function requireAdminAccess",
  "admin access checks must support repository-backed async API key lookup",
);
assertIncludes(
  adminAccessSource,
  "const settings = await repositories.settings.get()",
  "admin access checks must read DB-mode platform settings",
);
assertIncludes(
  adminAccessSource,
  "settings.apiKeys?.secretKeyId",
  "admin access checks must accept DB-mode regenerated admin keys",
);
assertIncludes(
  adminAccessSource,
  "const environmentKeys = getEnvironmentAdminKeys()",
  "admin access checks must try environment admin keys before DB settings lookup",
);
assertIncludes(
  adminAccessSource,
  "getAdminSessionWithPersistence",
  "admin access checks must refresh sessions through repository-backed users",
);
assertIncludes(
  adminAccessSource,
  "repositories.users.getById",
  "admin access checks must use database users in DB mode",
);

const adminUsersRoute = read("apps/public/src/app/api/admin/users/route.ts");
assertIncludes(
  adminUsersRoute,
  "createAdminInviteToken",
  "admin user create route must create invite tokens for invited users",
);
assertIncludes(
  adminUsersRoute,
  "const shouldCreateInvite = status ===",
  "admin user create route must gate invite token creation by invited status",
);
assertIncludes(
  adminUsersRoute,
  "inviteTokenId",
  "admin user create route must audit generated invite token ids",
);
assertIncludes(
  adminUsersRoute,
  "invite,",
  "admin user create route must return generated invite token data",
);
const adminUsersUiRoute = read("apps/admin/src/routes/users.tsx");
assertIncludes(
  adminUsersUiRoute,
  "notice: normalizedUsersSearchString(search.notice)",
  "admin users list route must accept redirect success notices",
);
assertIncludes(
  adminUsersUiRoute,
  "const routeNotice = routeSearch.notice ||",
  "admin users list route must render one-time redirect notices",
);
assertIncludes(
  adminUsersUiRoute,
  "const pendingRouteNotice = routeNoticeRef.current",
  "admin users list load must not clear redirect success notices",
);
const adminPermissionUi = read("apps/admin/src/lib/adminPermissionUi.ts");
assertIncludes(
  adminPermissionUi,
  "return false;",
  "admin permission helper must fail closed when backend permission rules are unavailable",
);
assertIncludes(
  adminPermissionUi,
  "Permission matrix unavailable. Reload permissions before using this capability.",
  "admin permission helper must explain fail-closed permission matrix state",
);
assertExcludes(
  adminPermissionUi,
  "? `Allowed by ${currentAdmin.role} role defaults.`",
  "admin permission helper must not allow actions from role defaults without backend matrix rules",
);
for (const route of [
  "apps/admin/src/routes/collections.tsx",
  "apps/admin/src/routes/media.tsx",
  "apps/admin/src/routes/sites.tsx",
  "apps/admin/src/routes/sites.new.tsx",
  "apps/admin/src/routes/sites.$siteId.tsx",
  "apps/admin/src/routes/pages.$pageId.edit.tsx",
  "apps/admin/src/routes/index.tsx",
]) {
  const source = read(route);
  assertIncludes(
    source,
    "Permission matrix unavailable. Reload permissions before using this capability.",
    `${route} must explain fail-closed permission matrix state`,
  );
  assertExcludes(
    source,
    "? `Allowed by ${currentAdmin.role} role defaults.`",
    `${route} must not allow actions from role defaults without backend matrix rules`,
  );
}
const adminUsersNewUiRoute = read("apps/admin/src/routes/users.new.tsx");
assertIncludes(
  adminUsersNewUiRoute,
  "notice: `${created.user.fullName} was created.`",
  "admin user create page must carry a success notice back to the users list",
);
const adminUserDetailUiRoute = read("apps/admin/src/routes/users.$userId.tsx");
assertIncludes(
  adminUserDetailUiRoute,
  "notice: `${saved.fullName} was saved.`",
  "admin user edit page must carry a save success notice back to the users list",
);
assertIncludes(
  adminUserDetailUiRoute,
  "notice: `${user.fullName} was removed.`",
  "admin user edit page must carry a delete success notice back to the users list",
);
assertIncludes(
  adminUserDetailUiRoute,
  "const [isLoadingUser, setIsLoadingUser] = useState(!user)",
  "admin user detail must start loading when deep-linked user is not in the local store",
);
assertIncludes(
  adminUserDetailUiRoute,
  "if (!user && (isLoadingUser || isCurrentAdminPermissionMatrixPending))",
  "admin user detail must not render not-found before backend lookup finishes",
);
assertIncludes(
  adminUserDetailUiRoute,
  'title="Loading user"',
  "admin user detail must show a loading state while resolving direct links",
);

const adminPasswordResetTokenRoute = read(
  "apps/public/src/app/api/admin/users/[userId]/password-reset/route.ts",
);
assertIncludes(
  adminPasswordResetTokenRoute,
  "@/lib/admin-auth/emailPolicy",
  "admin reset-token route must import invite-only policy",
);
assertIncludes(
  adminPasswordResetTokenRoute,
  "validateAdminInviteOnlyActivationPolicy(user.status,",
  "admin reset-token route must block invite-only activation bypass",
);
assertIncludes(
  adminPasswordResetTokenRoute,
  "'INVITE_ONLY_REQUIRED'",
  "admin reset-token route must return stable invite-only policy code",
);

const adminSessionStore = read(
  "apps/public/src/lib/admin-auth/sessionStore.ts",
);
assertIncludes(
  adminSessionStore,
  "@/lib/admin-auth/emailPolicy",
  "admin session store must import invite-only policy",
);
assertIncludes(
  adminSessionStore,
  "await validateAdminInviteOnlyActivationPolicy(currentUser.status,",
  "admin password reset accept must enforce invite-only policy before activation",
);
assertIncludes(
  adminSessionStore,
  "reason: 'invite-only'",
  "admin password reset accept must expose invite-only failure",
);
assertIncludes(
  adminSessionStore,
  "authenticateAdminCredentialsWithPersistence",
  "admin session store must support repository-backed credential lookup",
);
assertIncludes(
  adminSessionStore,
  "getAdminSessionWithPersistence",
  "admin session store must refresh sessions from repository-backed users",
);
assertIncludes(
  adminSessionStore,
  "persistence.getUserByEmail",
  "admin session store must support repository-backed login user lookup",
);
assertIncludes(
  adminSessionStore,
  "persistence.getPasswordCredentialByEmail",
  "admin session store must support repository-backed password verification",
);
assertIncludes(
  adminSessionStore,
  "persistence.setPasswordCredential",
  "admin session store must persist reset passwords through repository-backed credentials",
);
assertIncludes(
  adminSessionStore,
  "persistence.getUserById",
  "admin session store must support repository-backed invite/reset user lookup",
);
assertIncludes(
  adminSessionStore,
  "persistence.updateUser",
  "admin session store must support repository-backed invite/reset user updates",
);

const acceptInviteRoute = read(
  "apps/public/src/app/api/admin/auth/accept-invite/route.ts",
);
assertIncludes(
  acceptInviteRoute,
  "getRequiredDatabaseRepositories",
  "accept invite route must support database-backed users",
);
assertIncludes(
  acceptInviteRoute,
  "await acceptAdminInviteToken(token, repositories",
  "accept invite route must pass repository callbacks into invite acceptance",
);

const contactEmailPolicy = read("apps/public/src/lib/contactEmailPolicy.ts");
assertIncludes(
  contactEmailPolicy,
  "CONTACT_EMAIL_PATTERN",
  "contact email policy must define a validation pattern",
);
assertIncludes(
  contactEmailPolicy,
  "validateOptionalContactEmail",
  "contact email policy must expose optional email validator",
);
for (const route of [
  "apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/[contactId]/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/import/route.ts",
]) {
  const source = read(route);
  assertIncludes(
    source,
    "@/lib/contactEmailPolicy",
    `${route} must import contact email policy`,
  );
  assertIncludes(
    source,
    "validateOptionalContactEmail(",
    `${route} must validate contact emails`,
  );
  assertIncludes(
    source,
    "INVALID_CONTACT_EMAIL",
    `${route} must use a stable invalid-contact-email error code`,
  );
}

const adminFormFieldPolicy = read(
  "apps/public/src/lib/adminFormFieldPolicy.ts",
);
assertIncludes(
  adminFormFieldPolicy,
  "uniqueFieldKey",
  "admin form field policy must enforce unique field keys",
);
assertIncludes(
  adminFormFieldPolicy,
  "parseValidationRules",
  "admin form field policy must sanitize validation rules",
);
assertIncludes(
  adminFormFieldPolicy,
  "FIELD_TYPES",
  "admin form field policy must enforce known field types",
);
for (const route of [
  "apps/public/src/app/api/admin/sites/[siteId]/forms/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/route.ts",
]) {
  const source = read(route);
  assertIncludes(
    source,
    "@/lib/adminFormFieldPolicy",
    `${route} must import shared form field policy`,
  );
  assertIncludes(
    source,
    "parseFormFields(",
    `${route} must sanitize form fields`,
  );
  assertExcludes(
    source,
    "value as FormFieldDefinition[]",
    `${route} must not cast raw fields directly`,
  );
}

const adminFormCollectionTargetPolicy = read(
  "apps/public/src/lib/adminFormCollectionTargetPolicy.ts",
);
for (const needle of [
  "validateAdminFormCollectionTarget",
  "FORM_COLLECTION_TARGET_NOT_FOUND",
  "FORM_COLLECTION_TARGET_NOT_WRITABLE",
  "collection.status !==",
  "!collection.permissions.publicCreate",
  "FORM_COLLECTION_TARGET_FIELD_NOT_FOUND",
  "FORM_COLLECTION_TARGET_SLUG_FIELD_NOT_FOUND",
]) {
  assertIncludes(
    adminFormCollectionTargetPolicy,
    needle,
    "admin form collection target policy",
  );
}
for (const route of [
  "apps/public/src/app/api/admin/sites/[siteId]/forms/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/route.ts",
]) {
  const source = read(route);
  assertIncludes(
    source,
    "@/lib/adminFormCollectionTargetPolicy",
    `${route} must import collection target policy`,
  );
  assertIncludes(
    source,
    "validateAdminFormCollectionTarget({",
    `${route} must validate collection targets before persistence`,
  );
}

const backyStore = read("apps/public/src/lib/backyStore.ts");
assertIncludes(
  backyStore,
  "enabled: formShareEnabled && contactShareOverride?.enabled !== false",
  "demo contact share helper must not let public overrides enable disabled contact sharing",
);
const pageRenderer = read("apps/public/src/components/PageRenderer.tsx");
assertExcludes(
  pageRenderer,
  "buildContactShareOverride",
  "public page renderer must not send client-controlled contact-share overrides",
);
assertExcludes(
  pageRenderer,
  "contactShareOverride",
  "public page renderer must not submit contact-share overrides",
);
const submissionValidationStart = backyStore.indexOf(
  "function validateSubmissionValues(",
);
const submissionValidationEnd = backyStore.indexOf(
  "\nfunction makeSubmissionSignature",
  submissionValidationStart,
);
assert(
  submissionValidationStart !== -1 && submissionValidationEnd !== -1,
  "backyStore missing submission validation function",
);
const submissionValidationSource = backyStore.slice(
  submissionValidationStart,
  submissionValidationEnd,
);
assertIncludes(
  backyStore,
  "function validateIntrinsicSubmissionField(",
  "backyStore must have intrinsic form field validation",
);
assertIncludes(
  submissionValidationSource,
  "const intrinsicViolation = validateIntrinsicSubmissionField(",
  "submission validation must call intrinsic email/url validation",
);
assert(
  submissionValidationSource.indexOf(
    "validateIntrinsicSubmissionField(field, fieldLabel, fieldValue)",
  ) <
    submissionValidationSource.indexOf(
      "if (!field.validation || field.validation.length === 0)",
    ),
  "submission validation must enforce intrinsic email/url checks even when custom validation rules are present",
);

const adminContentStatusPolicy = read(
  "apps/public/src/lib/adminContentStatusPolicy.ts",
);
for (const needle of [
  "statusRequiresPublishPermission",
  "status === 'published' || status === 'scheduled'",
  "validateScheduledContentStatus",
  "SCHEDULED_AT_REQUIRED",
  "SCHEDULED_AT_INVALID",
  "SCHEDULED_AT_NOT_FUTURE",
  "scheduledAtMs <= Date.now()",
  "scheduledAt must be in the future when status is scheduled.",
]) {
  assertIncludes(
    adminContentStatusPolicy,
    needle,
    "admin content status policy",
  );
}
for (const route of [
  "apps/public/src/app/api/admin/sites/[siteId]/pages/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/blog/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/blog/[postId]/route.ts",
]) {
  const source = read(route);
  assertIncludes(
    source,
    "@/lib/adminContentStatusPolicy",
    `${route} must import content status policy`,
  );
  assertIncludes(
    source,
    "pages.publish",
    `${route} must require publish permission for published/scheduled status`,
  );
  assertIncludes(
    source,
    "statusRequiresPublishPermission(",
    `${route} must check publish-status permission`,
  );
  assertIncludes(
    source,
    "validateScheduledContentStatus(",
    `${route} must validate scheduled status`,
  );
}
for (const route of [
  "apps/public/src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/blog/[postId]/route.ts",
]) {
  assertIncludes(
    read(route),
    "Array.isArray(rawContent.elements)",
    `${route} PATCH content normalization must extract elements arrays`,
  );
}
for (const route of [
  "apps/public/src/app/api/admin/sites/[siteId]/pages/[pageId]/publish/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/pages/[pageId]/archive/route.ts",
]) {
  const source = read(route);
  assertIncludes(
    source,
    "const body = await parseJsonBody(request);",
    `${route} must parse status mutation bodies`,
  );
  assertIncludes(
    source,
    "expectedUpdatedAt",
    `${route} must read optimistic concurrency tokens`,
  );
  assertIncludes(
    source,
    "PAGE_VERSION_CONFLICT",
    `${route} must reject stale page status mutations`,
  );
  assertIncludes(
    source,
    "currentUpdatedAt",
    `${route} must return current version details on conflicts`,
  );
  assert(
    occurrenceCount(
      source,
      "expectedUpdatedAt && expectedUpdatedAt !== currentPage.updatedAt",
    ) >= 2,
    `${route} must enforce optimistic concurrency in repository and demo-store paths`,
  );
}
const canvasEditorSource = read(
  "apps/admin/src/components/editor/CanvasEditor.tsx",
);
assertIncludes(
  canvasEditorSource,
  "publicationStateChanging",
  "canvas editor settings save must guard publication status changes",
);
assertIncludes(
  canvasEditorSource,
  "disabled={isSaving || !canEdit || !canPublish || (pageSettings.status !== 'published' && effectivePublishDisabled)}",
  "canvas editor publish/unpublish button must require pages.publish in both directions",
);
const pageSettingsModalSource = read(
  "apps/admin/src/components/editor/PageSettingsModal.tsx",
);
assertIncludes(
  pageSettingsModalSource,
  "isPublicationStatus(initialSettings.status)",
  "page settings modal must guard unpublishing published or scheduled pages",
);
const canvasSource = read("apps/admin/src/components/editor/Canvas.tsx");
assertIncludes(
  canvasSource,
  "handleFormPreviewSubmit",
  "editor form preview must have a submit workflow",
);
assertIncludes(
  canvasSource,
  "editor-form-preview-feedback",
  "editor form preview must render visible submission feedback",
);
assertIncludes(
  canvasSource,
  "new FormData(form)",
  "editor form preview must collect configured field values before submitting",
);
assertIncludes(
  canvasSource,
  "await fetch(actionUrl",
  "editor form preview must call the configured action URL",
);
assertExcludes(
  canvasSource,
  "data-testid=\"editor-form-schema\"\n              data-form-id={formId}\n              data-form-active={formActive ? 'true' : 'false'}\n              data-form-field-count={schemaFields.length}\n              onSubmit={(event) => event.preventDefault()}",
  "editor form preview must not silently swallow schema form submissions",
);
const publicRenderRoute = read(
  "apps/public/src/app/api/sites/[siteId]/render/route.ts",
);
assertIncludes(
  publicRenderRoute,
  "if (!site || !site.isPublished)",
  "public render endpoint must not expose unpublished sites",
);
assertIncludes(
  publicRenderRoute,
  "resolveLocalizedRoutePath(site.settings, requestedPath, { host: routeHost })",
  "public render endpoint must resolve configured locale path/domain routing before page, blog, and dynamic route matching",
);
assertIncludes(
  publicRenderRoute,
  "locale: localized.locale.code",
  "public render endpoint must pass resolved locale metadata into render payloads",
);
const hostedSiteRoute = read(
  "apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx",
);
assertIncludes(
  hostedSiteRoute,
  "return site?.isPublished ? { mode: 'database', site, repositories } as HostedSite : null;",
  "hosted database site renderer must not render unpublished sites",
);
assertIncludes(
  hostedSiteRoute,
  "return site?.isPublished ? { mode: 'demo', site, repositories: null } as HostedSite : null;",
  "hosted demo site renderer must not render unpublished sites",
);
assertIncludes(
  hostedSiteRoute,
  "const routeHost = await getHostedRouteHost(resolvedSearchParams);",
  "hosted renderer must resolve host/domain context before route matching",
);
assertIncludes(
  hostedSiteRoute,
  "const hostedSite = await getSite(subdomain, routeHost);",
  "hosted renderer must resolve sites by request host before slug fallback",
);
assertIncludes(
  hostedSiteRoute,
  "resolveRepositorySiteRoute(hostedSite.repositories, site, routePath, { previewToken, host: routeHost })",
  "hosted database renderer must reuse the repository route resolver with host context",
);
assertIncludes(
  hostedSiteRoute,
  "resolveSiteRoute(site, routePath, { previewToken, host: routeHost })",
  "hosted demo renderer must reuse the route resolver with host context",
);
assertIncludes(
  hostedSiteRoute,
  "getResolvedRepositoryDynamicCollectionRoute(hostedSite, route)",
  "hosted database dynamic routes must hydrate content from resolved route decisions",
);
assertIncludes(
  hostedSiteRoute,
  "publicRouteHostMatchesSite(candidate, normalizedHost)",
  "hosted renderer must match custom, verification, and locale domains before slug fallback",
);
assertExcludes(
  hostedSiteRoute,
  "matchCollectionListRoute(",
  "hosted database renderer must not duplicate collection list route matching",
);
assertExcludes(
  hostedSiteRoute,
  "matchCollectionItemRoute(",
  "hosted database renderer must not duplicate collection item route matching",
);
const publicResolveRoute = read(
  "apps/public/src/app/api/sites/[siteId]/resolve/route.ts",
);
const publicSiteDiscoveryRoute = read("apps/public/src/app/api/sites/route.ts");
const publicRouteHostSource = read("apps/public/src/lib/publicRouteHost.ts");
assertIncludes(
  publicRouteHostSource,
  "verification?.status === 'verified'",
  "public custom-domain host matching must require verified DNS state by default",
);
assertIncludes(
  publicRouteHostSource,
  "publicRouteHostAliasesForSite(site.settings).some",
  "public custom-domain host matching must include verified same-site domain aliases",
);
assertIncludes(
  publicRouteHostSource,
  "domainAlias.status === 'verified'",
  "public custom-domain aliases must not bypass domain verification",
);
assertIncludes(
  publicRouteHostSource,
  "allowUnverifiedCustomHosts",
  "public custom-domain host matching must keep an explicit source-guarded test/demo escape hatch",
);
assertIncludes(
  publicRouteHostSource,
  "hostsEqual(locale.domain, normalizedHost) && verified",
  "public locale-domain host matching must not bypass domain verification",
);
assertIncludes(
  publicSiteDiscoveryRoute,
  "publicRouteHostMatchesSite(site, identifier)",
  "public site discovery must not resolve custom domains without verified host matching",
);
assertIncludes(
  publicSiteDiscoveryRoute,
  "publicRouteHostMatchesSite(site, normalizedDomain)",
  "repository site discovery must not resolve custom domains without verified host matching",
);
assertIncludes(
  publicResolveRoute,
  "resolveRepositorySiteRoute(repositories, site, path, { previewToken, host: routeHost })",
  "database public route resolve API must reuse the repository route resolver",
);
assertIncludes(
  publicResolveRoute,
  "const routeHost = resolveRequestHost(request, searchParams);",
  "public route resolve API must accept host/domain context for localized domain routing",
);
assertIncludes(
  publicResolveRoute,
  "const site = await findRepositorySite(repositories, siteId);",
  "public route resolve API must resolve database sites by id, slug, or custom domain",
);
assertExcludes(
  publicResolveRoute,
  "matchCollectionListRoute(",
  "database public route resolve API must not duplicate collection list route matching",
);
assertExcludes(
  publicResolveRoute,
  "matchCollectionItemRoute(",
  "database public route resolve API must not duplicate collection item route matching",
);
const routeResolverSource = read("apps/public/src/lib/routeResolver.ts");
const repositoryRouteResolverSource = read("apps/public/src/lib/repositoryRouteResolver.ts");
const siteLocalizationSource = read("apps/public/src/lib/siteLocalization.ts");
assertIncludes(
  siteLocalizationSource,
  "export const resolveLocalizedRoutePath =",
  "public localization helper must normalize locale-aware route paths",
);
assertIncludes(
  siteLocalizationSource,
  "matchedBy: 'path-prefix'",
  "public localization helper must strip configured path-prefix locale routes",
);
assertIncludes(
  siteLocalizationSource,
  "matchedBy: 'domain'",
  "public localization helper must resolve configured locale domains",
);
assertIncludes(
  routeResolverSource,
  "resolveLocalizedRoutePath(site.settings, rawPath, { host: options.host })",
  "demo route resolver must match localized path/domain variants before route lookup",
);
assertIncludes(
  routeResolverSource,
  "withLocalizedPathQuery(resource.renderUrl, canonical)",
  "route resolver must publish localized render URLs for custom frontends",
);
assertIncludes(
  repositoryRouteResolverSource,
  "resolveLocalizedRoutePath(site.settings, rawPath, { host: options.host })",
  "repository route resolver must match localized path/domain variants before route lookup",
);
const pageRendererSource = read("apps/public/src/components/PageRenderer.tsx");
assertIncludes(
  pageRendererSource,
  "const getSafeFormRedirectUrl = (value: unknown): string =>",
  "public form renderer must sanitize success redirects",
);
assertIncludes(
  pageRendererSource,
  "parsed.origin !== window.location.origin",
  "public form renderer must reject unsafe cross-origin success redirects",
);
assertIncludes(
  pageRendererSource,
  "window.location.assign(safeSuccessRedirectUrl)",
  "public form renderer must only navigate to sanitized success redirects",
);
const pageCreateRoute = read("apps/admin/src/routes/pages.new.tsx");
assertIncludes(
  pageCreateRoute,
  "page-create-dataset-selector",
  "page creation must expose a first-class dataset selector",
);
assertIncludes(
  pageCreateRoute,
  "page-dataset-collection-select",
  "page creation must let users choose a collection without URL params",
);
assertIncludes(
  pageCreateRoute,
  "(['list', 'item'] as PageDatasetMode[]).map",
  "page creation must expose list and item dataset modes",
);
assertIncludes(
  pageCreateRoute,
  "page-dataset-mode-${mode}",
  "page creation must test dataset mode controls",
);
assertExcludes(
  pageCreateRoute,
  "if (!siteId || !formData.collectionId)",
  "page creation must load collections for selector use, not only URL-param dataset imports",
);
assertIncludes(
  pageCreateRoute,
  "findCollectionRouteConflictForPageCreate",
  "page creation must preflight collection route conflicts before submit",
);
assertIncludes(
  pageCreateRoute,
  "routePathMatchesPatternForPageCreate",
  "page creation must match dynamic collection item route patterns before submit",
);
assertIncludes(
  pageCreateRoute,
  "&& !collectionRouteCheckError",
  "page creation must block submit when collection route verification fails",
);
assertIncludes(
  pageCreateRoute,
  "checkedCollections: collections.length",
  "page creation route handoff must report collection route checks",
);
assertIncludes(
  pageCreateRoute,
  "schemaVersion: 'backy.collection-dataset-page.v1'",
  "page creation must save a versioned collection dataset page contract",
);
assertIncludes(
  pageCreateRoute,
  "collectionDataset: selectedDatasetContract || undefined",
  "page creation must persist dataset route contracts in page meta",
);
assertIncludes(
  pageCreateRoute,
  "recordParam: mode === 'item' ? 'recordSlug' : null",
  "dataset detail pages must persist their record slug parameter contract",
);
const publicRenderPayload = read("apps/public/src/lib/renderPayload.ts");
assertIncludes(
  publicRenderPayload,
  "const collectionDataset = isRecord(page.meta.collectionDataset)",
  "public render payload must read saved collection dataset contracts",
);
assertIncludes(
  publicRenderPayload,
  "dataset: collectionDataset",
  "public render route metadata must expose collection dataset contracts",
);
assertIncludes(
  publicRenderPayload,
  "collectionDataset,",
  "public render data bindings must expose collection dataset contracts",
);
const publicRenderRouteSource = read(
  "apps/public/src/app/api/sites/[siteId]/render/route.ts",
);
assertIncludes(
  publicRenderRouteSource,
  "collectionDataset: page.meta?.collectionDataset",
  "database render adapter must preserve collection dataset page meta",
);

for (const file of [
  "apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts",
  "apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts",
  "apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts",
  "apps/public/src/app/api/sites/[siteId]/openapi/route.ts",
  "packages/sdk-js/src/index.ts",
]) {
  assertExcludes(read(file), "rateLimitBypass", file);
}

for (const route of [
  "apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts",
  "apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts",
  "apps/public/src/app/api/sites/[siteId]/comments/blocklist/route.ts",
]) {
  const source = read(route);
  assertIncludes(
    source,
    "parseBoundedInteger",
    `${route} must parse bounded pagination parameters`,
  );
  assertIncludes(
    source,
    "parseBoundedInteger(searchParams.get('limit')",
    `${route} must clamp requested limits`,
  );
  assertIncludes(
    source,
    "Number.MAX_SAFE_INTEGER",
    `${route} must normalize non-negative offsets`,
  );
  assertExcludes(
    source,
    "Number.isFinite(limit) ? limit",
    `${route} must not pass through unbounded finite limits`,
  );
}

for (const route of [
  "apps/public/src/app/api/sites/[siteId]/events/route.ts",
  "apps/public/src/app/api/sites/[siteId]/forms/[formId]/contacts/route.ts",
  "apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts",
  "apps/public/src/app/api/sites/[siteId]/blog/rss/route.ts",
]) {
  const source = read(route);
  assert(
    source.includes("Math.min(100") || source.includes("Math.min(parsed, 100)"),
    `${route} must cap caller-provided list limits at 100`,
  );
  assertExcludes(
    source,
    "Number.isFinite(parsed) && parsed > 0 ? parsed",
    `${route} must not return unbounded positive limits`,
  );
}
const publicOpenApiRoute = read(
  "apps/public/src/app/api/sites/[siteId]/openapi/route.ts",
);
assertIncludes(
  publicOpenApiRoute,
  "maximum: 100",
  "public OpenAPI route must document capped list limits",
);
assertExcludes(
  publicOpenApiRoute,
  "queryParameter('limit', { type: 'integer', minimum: 1 })",
  "public OpenAPI route must not advertise unbounded list limits",
);
assertExcludes(
  publicOpenApiRoute,
  "schema: { type: 'integer', minimum: 1 }",
  "public OpenAPI route must not advertise direct unbounded limit parameters",
);
assertExcludes(
  publicOpenApiRoute,
  "contactShareOverride",
  "public OpenAPI schema must not document public contact-share overrides",
);

for (const route of [
  "apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts",
  "apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts",
]) {
  const source = read(route);
  assertIncludes(
    source,
    "@/lib/adminAccess",
    `${route} must import admin access checks`,
  );
  assertIncludes(
    source,
    "status !== 'approved'",
    `${route} must distinguish public approved comments from moderation statuses`,
  );
  assertIncludes(
    source,
    "permission: 'comments.view'",
    `${route} must require comments.view for non-approved comment lists`,
  );
  assertIncludes(
    source,
    "access instanceof NextResponse",
    `${route} must return the admin access denial response`,
  );
}

const checkoutRoute = read(
  "apps/public/src/app/api/sites/[siteId]/commerce/orders/route.ts",
);
const checkoutGet = functionSource(checkoutRoute, "GET", "checkout route");
for (const needle of [
  "PRODUCT_CATALOG_NOT_FOUND",
  "ORDER_QUEUE_NOT_FOUND",
  "ORDER_QUEUE_NOT_PRIVATE",
  "privateOrderQueue: true",
]) {
  assertIncludes(
    checkoutGet,
    needle,
    "checkout GET must report only real order-intake readiness",
  );
}
assertIncludes(
  checkoutRoute,
  "GUEST_CHECKOUT_DISABLED",
  "checkout POST must reject public order intake when guest checkout is disabled",
);
assertIncludes(
  checkoutRoute,
  "!commerce.checkout.guestCheckout",
  "checkout POST must read the guest checkout setting before creating orders",
);
const guestCheckoutGuards =
  checkoutRoute.match(
    /requireGuestCheckoutAllowed\s*\(\s*commerce\s*,\s*requestId\s*,?\s*\)/g,
  ) || [];
assert(
  guestCheckoutGuards.length >= 2,
  "checkout POST must enforce guest checkout policy in both repository and demo-store paths",
);
const variantAwareProductStockGuards =
  checkoutRoute.match(
    /reservationsEnabled && !variant && !product\.inventory\.inStock/g,
  ) || [];
assert(
  variantAwareProductStockGuards.length >= 2,
  "checkout POST must not reject variant carts on parent product stock before variant stock validation",
);
const orderCreateAnchor = "let order: Awaited<";
const orderCreateAnchorIndex = checkoutRoute.indexOf(orderCreateAnchor);
const applyRepositoryReservationsIndex = checkoutRoute.indexOf(
  "await applyRepositoryInventoryReservations({",
);
const createOrderIndex = checkoutRoute.indexOf(
  "repositories.collections.createRecord({",
  orderCreateAnchorIndex,
);
const rollbackOnOrderFailureIndex = checkoutRoute.indexOf(
  "await rollbackInventoryReservations();",
  createOrderIndex,
);
const applyRepositoryRollbackIndex = checkoutRoute.indexOf(
  "repositories.collections.updateRecord(",
);
const originalValuesRollbackIndex = checkoutRoute.indexOf(
  "values: toJsonRecord(reservation.originalValues)",
  applyRepositoryRollbackIndex,
);
assert(
  orderCreateAnchorIndex !== -1,
  "checkout route missing public order create anchor",
);
assert(
  applyRepositoryReservationsIndex !== -1,
  "checkout route missing repository inventory reservation application",
);
assert(createOrderIndex !== -1, "checkout route missing order create");
assert(
  rollbackOnOrderFailureIndex !== -1,
  "checkout route must roll back inventory reservations when order creation fails",
);
assert(
  applyRepositoryRollbackIndex !== -1,
  "checkout route missing repository inventory rollback update",
);
assert(
  originalValuesRollbackIndex !== -1,
  "checkout route must restore original inventory values on rollback",
);
assert(
  applyRepositoryReservationsIndex < createOrderIndex,
  "checkout route must reserve inventory before creating the private order",
);
assert(
  createOrderIndex < rollbackOnOrderFailureIndex,
  "checkout route must roll back after failed order creation",
);
for (const provider of [
  '"http"',
  '"taxjar"',
  '"avalara"',
  '"easypost"',
  '"shippo"',
  '"stripe"',
]) {
  assertIncludes(
    checkoutRoute,
    provider,
    "public checkout provider adjustments must expose first-class tax, shipping, and discount providers",
  );
}
assertIncludes(
  checkoutRoute,
  'if (kind === "tax" && mode === "taxjar")',
  "public checkout must execute TaxJar tax quotes when Settings selects TaxJar",
);
assertIncludes(
  checkoutRoute,
  "return callTaxJarCheckoutProvider({",
  "public checkout must call the TaxJar adapter for TaxJar tax quotes",
);
assertIncludes(
  checkoutRoute,
  'if (kind === "tax" && mode === "avalara")',
  "public checkout must execute Avalara tax quotes when Settings selects Avalara",
);
assertIncludes(
  checkoutRoute,
  "return callAvalaraCheckoutProvider({",
  "public checkout must call the Avalara adapter for Avalara tax quotes",
);
assertIncludes(
  checkoutRoute,
  'if (kind === "shipping" && mode === "easypost")',
  "public checkout must execute EasyPost shipping quotes when Settings selects EasyPost",
);
assertIncludes(
  checkoutRoute,
  'if (kind === "shipping" && mode === "shippo")',
  "public checkout must execute Shippo shipping quotes when Settings selects Shippo",
);
assertIncludes(
  checkoutRoute,
  "return callEasyPostCheckoutShippingProvider({",
  "public checkout must call the EasyPost adapter for shipping quotes",
);
assertIncludes(
  checkoutRoute,
  "return callShippoCheckoutShippingProvider({",
  "public checkout must call the Shippo adapter for shipping quotes",
);
assertIncludes(
  checkoutRoute,
  "const callStripeCheckoutDiscountProvider = async",
  "public checkout route must include the Stripe promotion-code discount adapter",
);
assertIncludes(
  checkoutRoute,
  "/v1/promotion_codes?",
  "public checkout Stripe discount execution must look up promotion codes through the Stripe API",
);
assertIncludes(
  checkoutRoute,
  'if (kind === "discount" && mode === "stripe")',
  "public checkout must execute Stripe promotion-code discounts when Settings selects Stripe discounts",
);
assertIncludes(
  checkoutRoute,
  "return callStripeCheckoutDiscountProvider({ quote, requestId });",
  "public checkout must call the Stripe discount adapter for discount quotes",
);

const orderQuoteRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/quote/route.ts",
);
const orderQuoteGet = functionSource(
  orderQuoteRoute,
  "GET",
  "order quote route",
);
const orderQuotePost = functionSource(
  orderQuoteRoute,
  "POST",
  "order quote route",
);
assertIncludes(
  orderQuoteRoute,
  "@/lib/publicContractResponse",
  "order quote route must use shared contract response headers",
);
assertIncludes(
  orderQuoteRoute,
  "private",
  "order quote success responses must be no-store/private",
);
assertIncludes(
  orderQuoteRoute,
  "error",
  "order quote error responses must be no-store",
);
assertIncludes(
  orderQuoteRoute,
  "schemaVersion: ORDER_QUOTE_SCHEMA_VERSION",
  "order quote responses must expose the schema version header",
);
assertIncludes(
  orderQuoteRoute,
  "siteId,",
  "order quote responses must expose the site id header",
);
for (const [source, label] of [
  [orderQuoteGet, "order quote GET"],
  [orderQuotePost, "order quote POST"],
]) {
  assertIncludes(
    source,
    "const settings = await repositories.settings.get()",
    `${label} repository branch must read persisted Settings`,
  );
  assertIncludes(
    source,
    "commerceContractForSite(site.id, settings)",
    `${label} repository branch must build pricing from persisted Settings`,
  );
  assertIncludes(
    source,
    "commerceSettingsFromSettings(settings)",
    `${label} repository branch must pass provider settings from persisted Settings`,
  );
}
assertIncludes(
  orderQuotePost,
  "buildQuoteUpdate(",
  "order quote POST must pass persisted provider settings into quote refresh",
);
assertIncludes(
  orderQuoteRoute,
  'provider: "http" | "stripe" | "taxjar" | "avalara" | "easypost" | "shippo"',
  "order quote provider adjustments must expose first-class tax and shipping providers",
);
assertIncludes(
  orderQuoteRoute,
  "process.env.BACKY_TAXJAR_API_KEY?.trim()",
  "order quote TaxJar execution must read the server-only TaxJar API key",
);
assertIncludes(
  orderQuoteRoute,
  'if (kind === "tax" && mode === "taxjar")',
  "order quote refresh must execute the TaxJar tax provider only when Settings selects it",
);
assertIncludes(
  orderQuoteRoute,
  "return callTaxJarProvider({",
  "order quote refresh must call the TaxJar adapter for TaxJar tax quotes",
);
assertIncludes(
  orderQuoteRoute,
  "process.env.BACKY_AVALARA_ACCOUNT_ID?.trim()",
  "order quote Avalara execution must read the server-only Avalara account id",
);
assertIncludes(
  orderQuoteRoute,
  "process.env.BACKY_AVALARA_LICENSE_KEY?.trim()",
  "order quote Avalara execution must read the server-only Avalara license key",
);
assertIncludes(
  orderQuoteRoute,
  'if (kind === "tax" && mode === "avalara")',
  "order quote refresh must execute the Avalara tax provider only when Settings selects it",
);
assertIncludes(
  orderQuoteRoute,
  "return callAvalaraProvider({",
  "order quote refresh must call the Avalara adapter for Avalara tax quotes",
);
assertIncludes(
  orderQuoteRoute,
  "process.env.BACKY_EASYPOST_API_KEY?.trim()",
  "order quote EasyPost execution must read the server-only EasyPost API key",
);
assertIncludes(
  orderQuoteRoute,
  "process.env.BACKY_SHIPPO_API_KEY?.trim()",
  "order quote Shippo execution must read the server-only Shippo API key",
);
assertIncludes(
  orderQuoteRoute,
  'if (kind === "shipping" && mode === "easypost")',
  "order quote refresh must execute EasyPost rate quotes only when Settings selects it",
);
assertIncludes(
  orderQuoteRoute,
  'if (kind === "shipping" && mode === "shippo")',
  "order quote refresh must execute Shippo rate quotes only when Settings selects it",
);
assertIncludes(
  orderQuoteRoute,
  "return callEasyPostShippingProvider({",
  "order quote refresh must call the EasyPost rate adapter for shipping quotes",
);
assertIncludes(
  orderQuoteRoute,
  "return callShippoShippingProvider({",
  "order quote refresh must call the Shippo rate adapter for shipping quotes",
);
assertIncludes(
  orderQuoteRoute,
  "const callStripeDiscountProvider = async",
  "order quote route must include the Stripe promotion-code discount adapter",
);
assertIncludes(
  orderQuoteRoute,
  "/v1/promotion_codes?",
  "order quote Stripe discount execution must look up promotion codes through the Stripe API",
);
assertIncludes(
  orderQuoteRoute,
  'if (kind === "discount" && mode === "stripe")',
  "order quote refresh must execute Stripe promotion-code discounts only when Settings selects it",
);
assertIncludes(
  orderQuoteRoute,
  "return callStripeDiscountProvider({",
  "order quote refresh must call the Stripe discount adapter for discount quotes",
);

const orderShippingLabelRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/shipping-label/route.ts",
);
assertIncludes(
  orderShippingLabelRoute,
  "@/lib/publicContractResponse",
  "order shipping-label route must use shared contract response headers",
);
assertIncludes(
  orderShippingLabelRoute,
  "private",
  "order shipping-label success responses must be no-store/private",
);
assertIncludes(
  orderShippingLabelRoute,
  "error",
  "order shipping-label error responses must be no-store",
);
assertIncludes(
  orderShippingLabelRoute,
  "schemaVersion: SHIPPING_LABEL_SCHEMA_VERSION",
  "order shipping-label responses must expose the schema version header",
);
assertIncludes(
  orderShippingLabelRoute,
  "siteId,",
  "order shipping-label responses must expose the site id header",
);

const orderTrackingRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/tracking/route.ts",
);
const orderTrackingPost = functionSource(
  orderTrackingRoute,
  "POST",
  "order tracking route",
);
assertIncludes(
  orderTrackingRoute,
  "@/lib/publicContractResponse",
  "order tracking route must use shared contract response headers",
);
assertIncludes(
  orderTrackingRoute,
  "private",
  "order tracking success responses must be no-store/private",
);
assertIncludes(
  orderTrackingRoute,
  "error",
  "order tracking error responses must be no-store",
);
assertIncludes(
  orderTrackingRoute,
  "schemaVersion: TRACKING_SCHEMA_VERSION",
  "order tracking responses must expose the schema version header",
);
assertIncludes(
  orderTrackingRoute,
  "siteId,",
  "order tracking responses must expose the site id header",
);
assertIncludes(
  orderTrackingRoute,
  "const commerce = commerceSettingsFromSettings(settings);",
  "order tracking route must resolve provider from Settings",
);
assertIncludes(
  orderTrackingRoute,
  "textValue(values.shippinglabelprovider)",
  "order tracking provider resolution must prefer the saved label provider",
);
assertIncludes(
  orderTrackingRoute,
  "textValue(commerce.shippingLabelProvider)",
  "order tracking provider resolution must use Settings before raw carrier fallback",
);
assertIncludes(
  orderTrackingRoute,
  "textValue(values.fulfillmentcarrier)",
  "order tracking provider resolution must keep raw carrier as a fallback",
);
assertIncludes(
  orderTrackingPost,
  "const settings = await repositories.settings.get()",
  "order tracking POST repository branch must read persisted Settings",
);
assertIncludes(
  orderTrackingPost,
  "buildTrackingUpdate(record, body, settings)",
  "order tracking POST must pass persisted Settings into tracking refresh",
);

const orderProviderRefundRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/provider-refund/route.ts",
);
const orderProviderRefundPost = functionSource(
  orderProviderRefundRoute,
  "POST",
  "order provider-refund route",
);
assertIncludes(
  orderProviderRefundRoute,
  "@/lib/publicContractResponse",
  "order provider-refund route must use shared contract response headers",
);
assertIncludes(
  orderProviderRefundRoute,
  "private",
  "order provider-refund success responses must be no-store/private",
);
assertIncludes(
  orderProviderRefundRoute,
  "error",
  "order provider-refund error responses must be no-store",
);
assertIncludes(
  orderProviderRefundRoute,
  "schemaVersion: PROVIDER_REFUND_SCHEMA_VERSION",
  "order provider-refund responses must expose the schema version header",
);
assertIncludes(
  orderProviderRefundRoute,
  "siteId,",
  "order provider-refund responses must expose the site id header",
);
assertIncludes(
  orderProviderRefundRoute,
  "textValue(commerce.paymentProvider)",
  "order provider refund must use Settings payment provider before manual fallback",
);
assertIncludes(
  orderProviderRefundPost,
  "const settings = await repositories.settings.get()",
  "order provider-refund POST repository branch must read persisted Settings",
);
assertIncludes(
  orderProviderRefundPost,
  "buildProviderRefundUpdate(",
  "order provider-refund POST must pass persisted Settings into refund creation",
);

const orderFulfillmentRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/fulfillment/route.ts",
);
const orderFulfillmentPost = functionSource(
  orderFulfillmentRoute,
  "POST",
  "order fulfillment route",
);
assertIncludes(
  orderFulfillmentRoute,
  "@/lib/publicContractResponse",
  "order fulfillment route must use shared contract response headers",
);
assertIncludes(
  orderFulfillmentRoute,
  "private",
  "order fulfillment success responses must be no-store/private",
);
assertIncludes(
  orderFulfillmentRoute,
  "error",
  "order fulfillment error responses must be no-store",
);
assertIncludes(
  orderFulfillmentRoute,
  "schemaVersion: FULFILLMENT_DISPATCH_SCHEMA_VERSION",
  "order fulfillment responses must expose the schema version header",
);
assertIncludes(
  orderFulfillmentRoute,
  "siteId,",
  "order fulfillment responses must expose the site id header",
);
assertIncludes(
  orderFulfillmentRoute,
  "fulfillmentProviderUrl(settings)",
  "order fulfillment route must derive provider URL from supplied Settings",
);
assertIncludes(
  orderFulfillmentPost,
  "const settings = await repositories.settings.get()",
  "order fulfillment POST repository branch must read persisted Settings",
);
assertIncludes(
  orderFulfillmentPost,
  "buildFulfillmentDispatch(",
  "order fulfillment POST must pass persisted Settings into dispatch execution",
);

const orderAnalyticsRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/commerce/orders/analytics/route.ts",
);
assertIncludes(
  orderAnalyticsRoute,
  "@/lib/publicContractResponse",
  "order analytics must use shared contract response headers",
);
assertIncludes(
  orderAnalyticsRoute,
  "private",
  "order analytics success responses must be no-store/private",
);
assertIncludes(
  orderAnalyticsRoute,
  "error",
  "order analytics error responses must be no-store",
);
assertIncludes(
  orderAnalyticsRoute,
  "schemaVersion: ORDER_ANALYTICS_SCHEMA_VERSION",
  "order analytics responses must expose the schema version header",
);
assertIncludes(
  orderAnalyticsRoute,
  "siteId,",
  "order analytics responses must expose the site id header",
);
assertIncludes(
  orderAnalyticsRoute,
  "providerOperations",
  "order analytics must expose provider execution analytics",
);
assertIncludes(
  orderAnalyticsRoute,
  "paymentProviderBuckets",
  "order analytics must aggregate payment provider mix",
);
assertIncludes(
  orderAnalyticsRoute,
  "providerRefundBuckets",
  "order analytics must aggregate provider refund pipeline state",
);
assertIncludes(
  orderAnalyticsRoute,
  "fulfillmentProviderBuckets",
  "order analytics must aggregate fulfillment provider dispatch state",
);
assertIncludes(
  orderAnalyticsRoute,
  "shippingLabelProviderBuckets",
  "order analytics must aggregate shipping-label provider state",
);
assertIncludes(
  orderAnalyticsRoute,
  "providerRefundRequiresActionCount",
  "order analytics must expose provider refund attention counters",
);

const settingsRoute = read("apps/admin/src/routes/settings.tsx");
const ordersRoute = read("apps/admin/src/routes/orders.tsx");
const adminContentApiClient = read("apps/admin/src/lib/adminContentApi.ts");
const commerceSettingsApiRoute = read(
  "apps/public/src/app/api/admin/settings/route.ts",
);
const siteScopedSettingsApiRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/settings/route.ts",
);
assertIncludes(
  siteScopedSettingsApiRoute,
  "@/lib/publicContractResponse",
  "site-scoped settings API must use shared Backy contract response headers",
);
assertIncludes(
  siteScopedSettingsApiRoute,
  "SITE_SETTINGS_SCOPE_SCHEMA",
  "site-scoped settings API must expose a versioned response schema",
);
assertIncludes(
  siteScopedSettingsApiRoute,
  "private",
  "site-scoped settings API route helper must keep settings responses no-store before admin proxy headers",
);
assertIncludes(
  siteScopedSettingsApiRoute,
  "schemaVersion: SITE_SETTINGS_SCOPE_SCHEMA",
  "site-scoped settings API responses must expose schema version headers",
);
assertIncludes(
  siteScopedSettingsApiRoute,
  "siteId,",
  "site-scoped settings API success responses must expose the site id header",
);
assertIncludes(
  commerceSettingsApiRoute,
  "taxjar",
  "settings API must preserve TaxJar as an allowed commerce tax provider",
);
assertIncludes(
  commerceSettingsApiRoute,
  "envValue(['BACKY_TAXJAR_API_KEY', 'TAXJAR_API_KEY'])",
  "settings API runtime diagnostics must report TaxJar API key readiness",
);
assertIncludes(
  commerceSettingsApiRoute,
  "avalara",
  "settings API must preserve Avalara as an allowed commerce tax provider",
);
assertIncludes(
  commerceSettingsApiRoute,
  "envValue(['BACKY_AVALARA_ACCOUNT_ID', 'AVALARA_ACCOUNT_ID'])",
  "settings API runtime diagnostics must report Avalara account readiness",
);
assertIncludes(
  commerceSettingsApiRoute,
  "shippingProviderValue",
  "settings API must preserve EasyPost and Shippo as allowed shipping quote providers",
);
assertIncludes(
  commerceSettingsApiRoute,
  "discountProviderValue",
  "settings API must preserve Stripe as an allowed discount quote provider",
);
assertIncludes(
  commerceSettingsApiRoute,
  "envValue(['BACKY_STRIPE_DISCOUNT_API_BASE_URL'])",
  "settings API runtime diagnostics must report the Stripe discount API base URL override",
);
assertIncludes(
  commerceSettingsApiRoute,
  "envValue(['BACKY_STRIPE_API_VERSION', 'STRIPE_API_VERSION'])",
  "settings API runtime diagnostics must report the Stripe API version override",
);
assertIncludes(
  settingsRoute,
  "env:STRIPE_WEBHOOK_SECRET",
  "settings UI must show env-reference webhook secret guidance",
);
assertIncludes(
  settingsRoute,
  '<option value="taxjar">TaxJar</option>',
  "settings UI must expose TaxJar as a tax provider option",
);
assertIncludes(
  settingsRoute,
  "commerce?.taxProvider === 'taxjar'",
  "settings UI must mark TaxJar API key required when TaxJar is selected",
);
assertIncludes(
  settingsRoute,
  '<option value="avalara">Avalara AvaTax</option>',
  "settings UI must expose Avalara as a tax provider option",
);
assertIncludes(
  settingsRoute,
  "commerce?.taxProvider === 'avalara'",
  "settings UI must mark Avalara credentials required when Avalara is selected",
);
assertIncludes(
  settingsRoute,
  '<option value="easypost">EasyPost rates</option>',
  "settings UI must expose EasyPost as a shipping quote provider option",
);
assertIncludes(
  settingsRoute,
  '<option value="shippo">Shippo rates</option>',
  "settings UI must expose Shippo as a shipping quote provider option",
);
assertIncludes(
  settingsRoute,
  '<option value="stripe">Stripe promotion codes</option>',
  "settings UI must expose Stripe promotion codes as a discount provider option",
);
assertIncludes(
  settingsRoute,
  "commerce?.paymentProvider === 'stripe' || commerce?.taxProvider === 'stripe' || commerce?.discountProvider === 'stripe'",
  "settings UI must mark Stripe API key required when Stripe discounts are selected",
);
assertIncludes(
  settingsRoute,
  "BACKY_STRIPE_DISCOUNT_API_BASE_URL",
  "settings UI must expose the Stripe discount API base URL override",
);
assertIncludes(
  settingsRoute,
  "BACKY_STRIPE_API_VERSION",
  "settings UI must expose the Stripe API version override",
);
assertIncludes(
  ordersRoute,
  "runtime.stripeDiscountApiBaseUrl || runtime.stripeApiBaseUrl",
  "orders readiness must report the Stripe discount-specific API base URL before the generic Stripe base URL",
);
assertIncludes(
  ordersRoute,
  "runtime?.stripeApiVersion",
  "orders readiness must surface the optional Stripe API version override for quote providers",
);
assertIncludes(
  ordersRoute,
  "providerAnalytics: orderAnalytics?.providerOperations || null",
  "orders handoff manifest must expose provider analytics for custom admin frontends",
);
assertIncludes(
  adminContentApiClient,
  "provider: 'http' | 'stripe' | 'taxjar' | 'avalara' | 'easypost' | 'shippo'",
  "admin API client quote type must expose all first-class quote provider adjustments",
);
assertIncludes(
  settingsRoute,
  "commerce?.shippingLabelProvider === 'easypost' || commerce?.shippingProvider === 'easypost'",
  "settings UI must mark EasyPost API key required when EasyPost quotes or labels are selected",
);
assertIncludes(
  settingsRoute,
  "commerce?.shippingLabelProvider === 'shippo' || commerce?.shippingProvider === 'shippo'",
  "settings UI must mark Shippo API key required when Shippo quotes or labels are selected",
);
assertIncludes(
  settingsRoute,
  "Store the provider signing secret in the runtime environment",
  "settings UI must explain webhook secret references",
);
assertExcludes(
  settingsRoute,
  'placeholder="stripe_whsec_live"',
  "settings UI must not encourage storing raw webhook secrets",
);
assertIncludes(
  settingsRoute,
  "pendingRotateKey",
  "settings UI must require confirmation before API key rotation",
);
assertIncludes(
  settingsRoute,
  "settings-api-key-rotation-confirm-dialog",
  "settings UI must render an API key rotation confirmation dialog",
);
assertIncludes(
  settingsRoute,
  "Existing integrations using",
  "settings UI must warn that key rotation breaks existing integrations",
);
assertIncludes(
  settingsRoute,
  "const statusLabel = !canShowValue",
  "settings UI must show redacted admin API keys as hidden, not unconfigured",
);
assertIncludes(
  settingsRoute,
  "Hidden without settings.manageKeys",
  "settings UI must explain hidden admin API key values",
);
assertIncludes(
  settingsRoute,
  "runSettingsStorageProvisioningProbe",
  "settings UI must expose the media storage provisioning probe client action",
);
assertIncludes(
  settingsRoute,
  "Run storage probe",
  "settings UI must render a storage provisioning probe button",
);
assertIncludes(
  settingsRoute,
  "storageProvisioningResult.rotation.fields.map",
  "settings UI must render storage credential rotation guidance from the provisioning probe",
);

const siteDetailUiRoute = read("apps/admin/src/routes/sites.$siteId.tsx");
assertIncludes(
  siteDetailUiRoute,
  "siteSettingsNotice",
  "site settings page must render a save success notice",
);
assertIncludes(
  siteDetailUiRoute,
  "setSiteSettingsNotice(`${savedSite.name} settings saved.`);",
  "site settings save must stay on-page with success context",
);
assertExcludes(
  siteDetailUiRoute,
  "navigate({ to: '/sites' });\n    } catch (error) {",
  "site settings save must not immediately redirect away after saving",
);

const adminSiteDetailRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/route.ts",
);
assertIncludes(
  adminSiteDetailRoute,
  "siteStatus: nextStatus",
  "admin site detail route must persist archived site lifecycle state in settings",
);
assertIncludes(
  adminSiteDetailRoute,
  "persistedSiteStatus(site)",
  "admin site detail route must return persisted archived site status",
);
assertIncludes(
  adminSiteDetailRoute,
  'nextStatus === "archived"',
  "admin site detail route must keep archived sites unpublished in repository mode",
);
assertIncludes(
  adminSiteDetailRoute,
  '? "draft"',
  "admin site detail route must map non-published lifecycle state to draft publication state",
);
const adminSitesLifecycleRoute = read(
  "apps/public/src/app/api/admin/sites/route.ts",
);
assertIncludes(
  adminSitesLifecycleRoute,
  "siteStatus: status",
  "admin sites route must persist site lifecycle status on create",
);
const siteRepository = read("packages/db/src/repositories/site-page-post.ts");
assertIncludes(
  siteRepository,
  "normalizeSiteStatus(site) === status",
  "site repository status filters must distinguish archived from draft",
);
const auditLogRepository = read("packages/db/src/repositories/audit-logs.ts");
assertIncludes(
  auditLogRepository,
  "if (input.actorId) conditions.push(eq(activityLogs.userId, input.actorId));",
  "audit log repository must push actor filters into the database query",
);
assertIncludes(
  auditLogRepository,
  "if (input.entity) conditions.push(eq(activityLogs.entityType, input.entity));",
  "audit log repository must push entity filters into the database query",
);
assertIncludes(
  auditLogRepository,
  "if (input.action) conditions.push(eq(activityLogs.action, input.action));",
  "audit log repository must push action filters into the database query",
);
assertIncludes(
  auditLogRepository,
  "if (input.teamId) conditions.push(sql`${activityLogs.details}->>'teamId' = ${input.teamId}`);",
  "audit log repository must push team metadata filters into the database query",
);
assertIncludes(
  auditLogRepository,
  "if (input.requestId) conditions.push(sql`${activityLogs.details}->>'requestId' = ${input.requestId}`);",
  "audit log repository must push request metadata filters into the database query",
);
const pageWorkflowAdminContentApi = read(
  "apps/admin/src/lib/adminContentApi.ts",
);
assertIncludes(
  pageWorkflowAdminContentApi,
  "export async function unpublishPage",
  "admin content API must expose a first-class page unpublish operation",
);
assertIncludes(
  pageWorkflowAdminContentApi,
  "revisionNote: 'Before unpublish'",
  "page unpublish operation must record an explicit revision note",
);
const pagesAdminRoute = read("apps/admin/src/routes/pages.tsx");
assertIncludes(
  pagesAdminRoute,
  "data-testid={`pages-unpublish-${page.id}`}",
  "pages list must expose per-page unpublish controls",
);
assertIncludes(
  pagesAdminRoute,
  '<option value="unpublish">Unpublish selected</option>',
  "pages list must expose bulk unpublish",
);
const pageEditorRoute = read("apps/admin/src/routes/pages.$pageId.edit.tsx");
assertIncludes(
  pageEditorRoute,
  "applyWorkflow('unpublish')",
  "page editor must expose unpublish from the page workflow panel",
);
assertIncludes(
  pageEditorRoute,
  "'Page unpublished.'",
  "page editor must show an unpublish success notice",
);
const adminPageDetailRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts",
);
assertIncludes(
  adminPageDetailRoute,
  "pageStatusMutationRequiresPublishPermission",
  "admin page update route must guard unpublish status changes with the publish permission",
);
assertIncludes(
  adminPageDetailRoute,
  'currentStatus === "published" || currentStatus === "scheduled"',
  "admin page update route must treat public-to-draft transitions as publish-status mutations",
);

const adminContractSmoke = read("apps/public/scripts/admin-contract-smoke.mjs");
assertIncludes(
  adminContractSmoke,
  "providerWebhookSecretId: `env:",
  "admin contract smoke must use webhook secret references",
);
assertExcludes(
  adminContractSmoke,
  "providerWebhookSecretId: `stripe_whsec_",
  "admin contract smoke must not persist raw webhook secrets",
);

const productsAdminRoute = read("apps/admin/src/routes/products.tsx");
assertIncludes(
  productsAdminRoute,
  "listCollectionRecords",
  "products admin route must use paged collection record loads",
);
assertIncludes(
  productsAdminRoute,
  "PRODUCT_RECORD_PAGE_SIZE",
  "products admin route must use an explicit product page size",
);
assertIncludes(
  productsAdminRoute,
  "loadMoreProducts",
  "products admin route must expose incremental catalog loading",
);
assertExcludes(
  productsAdminRoute,
  "listAllCollectionRecords",
  "products admin route must not walk every product record on page load",
);

const ordersAdminRoute = read("apps/admin/src/routes/orders.tsx");
assertIncludes(
  ordersAdminRoute,
  "listCollectionRecords",
  "orders admin route must use paged collection record loads",
);
assertIncludes(
  ordersAdminRoute,
  "ORDER_RECORD_PAGE_SIZE",
  "orders admin route must use an explicit order page size",
);
assertIncludes(
  ordersAdminRoute,
  "loadMoreOrders",
  "orders admin route must expose incremental queue loading",
);
assertExcludes(
  ordersAdminRoute,
  "listAllCollectionRecords",
  "orders admin route must not walk every order record on page load",
);

const collectionsAdminRoute = read("apps/admin/src/routes/collections.tsx");
const templatePreviewCopyIndex = collectionsAdminRoute.indexOf(
  "collections-template-preview-copy-render",
);
assert(
  templatePreviewCopyIndex !== -1,
  "collections admin route must expose template preview render URL copy control",
);
const templatePreviewCopySource = collectionsAdminRoute.slice(
  Math.max(0, templatePreviewCopyIndex - 800),
  templatePreviewCopyIndex + 600,
);
assertIncludes(
  templatePreviewCopySource,
  "key: 'collections.export'",
  "template preview render URL copy must require collections.export",
);
assertIncludes(
  templatePreviewCopySource,
  "!canExportCollections",
  "template preview render URL copy must be disabled without collections.export",
);
assertIncludes(
  collectionsAdminRoute,
  "MediaLibraryModal",
  "collections record editor must use central media picker for media fields",
);
assertIncludes(
  collectionsAdminRoute,
  "collections-record-media-picker-",
  "collections record editor must expose media picker controls per media field",
);
assertIncludes(
  collectionsAdminRoute,
  "referenceRecordsByCollection",
  "collections record editor must preload cross-collection reference records",
);
assertIncludes(
  collectionsAdminRoute,
  "collections-record-reference-picker-",
  "collections record editor must expose record picker controls for relationship fields",
);
assertIncludes(
  collectionsAdminRoute,
  "Backy media ID from the central library",
  "collections media field helper text must describe central media IDs",
);
assertIncludes(
  collectionsAdminRoute,
  "isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.view'",
  "collections media picker must respect media.view",
);
assertIncludes(
  collectionsAdminRoute,
  "canView={canViewMedia}",
  "collections media picker modal must receive media.view state",
);
assertIncludes(
  collectionsAdminRoute,
  "canCreate={canCreateMedia}",
  "collections media picker modal must receive media.create state",
);
assertIncludes(
  collectionsAdminRoute,
  "setNotice(`Collection record ${selectedRecordId ? 'updated' : 'created'}.`);",
  "collections record save must show a success notice",
);
assertIncludes(
  collectionsAdminRoute,
  "const isCollectionMultiFileField = (field: CollectionField): boolean => {",
  "collections file media fields must support explicit multi-file semantics",
);
assertIncludes(
  collectionsAdminRoute,
  "validation: { multiple: true }",
  "collections gallery template field must be marked as multi-file",
);
assertIncludes(
  collectionsAdminRoute,
  "Allow multiple media files",
  "collections schema editor must expose multi-file toggle for file fields",
);
assertIncludes(
  collectionsAdminRoute,
  "Stores an ordered list of Backy media IDs from the central library",
  "collections record editor must describe multi-file media storage",
);
assertIncludes(
  collectionsAdminRoute,
  "formatCollectionListValue([...currentItems, asset.id])",
  "collections media picker must append selected assets for multi-file fields",
);
const adminContentApiSource = read("apps/admin/src/lib/adminContentApi.ts");
assertIncludes(
  adminContentApiSource,
  "validation?: Record<string, unknown>;",
  "admin content API collection field type must carry validation metadata",
);
assertIncludes(
  adminContentApiSource,
  "validation: field.validation,",
  "admin content API collection field mapper must preserve validation metadata",
);
const publicBackyStoreSource = read("apps/public/src/lib/backyStore.ts");
assertIncludes(
  publicBackyStoreSource,
  "validation?: BackyJsonObject;",
  "fallback collection fields must persist validation metadata",
);
assertIncludes(
  publicBackyStoreSource,
  "const isCollectionMultiFileField = (field: StoreCollectionField): boolean => {",
  "fallback collection normalizer must detect multi-file media fields",
);
assertIncludes(
  publicBackyStoreSource,
  "return normalizeCollectionListValue(value);",
  "fallback collection normalizer must preserve multi-file arrays",
);
assertIncludes(
  publicBackyStoreSource,
  "max_items",
  "fallback collection validation must enforce multi-file maxItems",
);
const collectionRecordValidationSource = read(
  "apps/public/src/lib/collectionRecordValidation.ts",
);
assertIncludes(
  collectionRecordValidationSource,
  "export const normalizeCollectionRecordMediaValues =",
  "collection record API validation must expose schema-aware media value normalization",
);
assertIncludes(
  collectionRecordValidationSource,
  "mediaRepository?: CollectionMediaRepository;",
  "collection record API validation must accept media repository checks",
);
assertIncludes(
  collectionRecordValidationSource,
  "code: 'invalid_media_shape'",
  "collection record API validation must reject array values for single media fields",
);
assertIncludes(
  collectionRecordValidationSource,
  "code: 'media_not_found'",
  "collection record API validation must reject missing Backy media references",
);
assertIncludes(
  collectionRecordValidationSource,
  "code: 'media_type_mismatch'",
  "collection record API validation must reject image/video media type mismatches",
);
for (const routePath of [
  "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts",
  "apps/public/src/app/api/sites/[siteId]/collections/[collectionId]/records/route.ts",
  "apps/public/src/app/api/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts",
]) {
  const routeSource = read(routePath);
  assertIncludes(
    routeSource,
    "normalizeCollectionRecordMediaValues",
    `${routePath} must normalize schema-aware media values before persistence`,
  );
}
for (const routePath of [
  "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts",
  "apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts",
  "apps/public/src/app/api/sites/[siteId]/collections/[collectionId]/records/route.ts",
  "apps/public/src/app/api/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts",
]) {
  const routeSource = read(routePath);
  assertIncludes(
    routeSource,
    "mediaRepository: repositories.media",
    `${routePath} must validate Backy media references in repository mode`,
  );
}

const mediaAdminRoute = read("apps/admin/src/routes/media.tsx");
assertIncludes(
  mediaAdminRoute,
  "setBulkNotice(`Deleted ${file.name}.`);",
  "single media delete must show a success notice",
);
assertIncludes(
  mediaAdminRoute,
  "setBulkNotice(`${updated.name} details saved.`);",
  "media metadata save must show a success notice",
);
assertIncludes(
  mediaAdminRoute,
  "const deniedExportMessage = `Your account needs activity.export to export media manifests and audit feeds. ${activityPermissionTitle}`;",
  "media manifest export must explain activity.export permission failures",
);
assertIncludes(
  mediaAdminRoute,
  "const copyMediaHandoffManifest = async () => {",
  "media manifest copy must use a dedicated permission-checked handler",
);
assertIncludes(
  mediaAdminRoute,
  "setError(deniedExportMessage);",
  "media manifest export handlers must fail closed without activity.export",
);
assertIncludes(
  mediaAdminRoute,
  "const canBulkSelectMedia = canEditMedia || canDeleteMedia;",
  "media bulk selection must require edit or delete permissions",
);
assertIncludes(
  mediaAdminRoute,
  "const bulkSelectionPermissionTitle = canBulkSelectMedia",
  "media bulk selection must explain edit/delete permission failures",
);
assertIncludes(
  mediaAdminRoute,
  "const bulkManagementDescription = canEditMedia && canDeleteMedia",
  "media bulk panel copy must reflect available edit/delete actions",
);
assertIncludes(
  mediaAdminRoute,
  "setError(deniedBulkSelectionMessage);",
  "media bulk selection handlers must fail closed without edit/delete permissions",
);
assertIncludes(
  mediaAdminRoute,
  "const mediaBulkAddVisibleDisabledReason = mediaBulkBusyReason ||",
  "media select-visible control must derive its disabled reason from busy/permission/selection state",
);
assertIncludes(
  mediaAdminRoute,
  "mediaBulkSelectPermissionReason ||",
  "media select-visible control must include edit/delete permission failures in its disabled reason",
);
assertIncludes(
  mediaAdminRoute,
  "disabled={Boolean(mediaBulkAddVisibleDisabledReason)}",
  "media select-visible control must be disabled when its permission-aware guard is blocked",
);
assertIncludes(
  mediaAdminRoute,
  "disabled={isMediaLibraryBusy || !canBulkSelectMedia}",
  "media grid selection controls must be disabled without edit/delete permissions",
);
assertIncludes(
  mediaAdminRoute,
  "const hiddenSelectedMediaCount = useMemo(",
  "media bulk selection must track selected assets hidden by current filters",
);
assertIncludes(
  mediaAdminRoute,
  "const handleClearHiddenSelection = () => {",
  "media bulk selection must let users clear hidden selected assets",
);
assertIncludes(
  mediaAdminRoute,
  "Selected hidden assets remain selected and are included in bulk actions until cleared.",
  "media bulk selection copy must disclose hidden selected assets",
);
assertIncludes(
  mediaAdminRoute,
  "if (!canExportMediaActivity) {",
  "media audit CSV export must fail closed without activity.export",
);
assertIncludes(
  mediaAdminRoute,
  "const mediaPreviewBlockedReason = (",
  "media previews must centralize private/quarantine blocking",
);
assertIncludes(
  mediaAdminRoute,
  "<MediaPreviewBlocked reason={blockedReason} />",
  "media grid previews must block private or quarantined raw URLs",
);
assertIncludes(
  mediaAdminRoute,
  "<MediaPreviewBlocked reason={selectedAssetPreviewBlockedReason} />",
  "media detail previews must block private or quarantined raw URLs",
);
assertIncludes(
  mediaAdminRoute,
  "version.url && !retainedPreviewBlockedReason",
  "media retained version links must not expose private or quarantined raw URLs",
);
assertIncludes(
  mediaAdminRoute,
  "blockedReason={retainedPreviewBlockedReason}",
  "media retained version previews must block private or quarantined raw URLs",
);
assertIncludes(
  mediaAdminRoute,
  "const getMediaFolderAncestorIds = (",
  "media folder chip counts must understand ancestor folders",
);
assertIncludes(
  mediaAdminRoute,
  "const folderSubtreeAssetCounts = useMemo(() => {",
  "media folder chip counts must include descendant folders",
);
assertIncludes(
  mediaAdminRoute,
  "assetCount: folderSubtreeAssetCounts.get(folder.id) || 0",
  "media folder handoff manifest must expose subtree asset counts",
);
assertIncludes(
  mediaAdminRoute,
  "directAssetCount: folderAssetCounts.get(folder.id) || 0",
  "media folder handoff manifest must preserve direct asset counts",
);
assertIncludes(
  mediaAdminRoute,
  "including descendant folders",
  "media folder chip title must explain subtree counts",
);
assert(
  occurrenceCount(
    mediaAdminRoute,
    "onClick={() => void copyMediaHandoffManifest()}",
  ) >= 2,
  "media manifest copy controls must route through the permission-checked handler",
);
assert(
  occurrenceCount(
    mediaAdminRoute,
    "disabled={isMediaLibraryBusy || !canExportMediaActivity}",
  ) >= 3,
  "media manifest copy/download controls must be disabled without activity.export",
);

const catalogRoute = read(
  "apps/public/src/app/api/sites/[siteId]/commerce/catalog/route.ts",
);
for (const needle of [
  "CATALOG_RECORD_PAGE_SIZE",
  "listAllRepositoryCatalogRecords",
  "listAllDemoCatalogRecords",
  "page.pagination.hasMore",
]) {
  assertIncludes(
    catalogRoute,
    needle,
    "commerce catalog route must page through all records before filtering/faceting",
  );
}
assertExcludes(
  catalogRoute,
  "limit: 100,",
  "commerce catalog route must not cap catalog reads before filtering",
);

for (const route of [
  "apps/admin/src/routes/pages.$pageId.edit.tsx",
  "apps/admin/src/routes/blog.$postId.tsx",
]) {
  const source = read(route);
  assertIncludes(
    source,
    "rollbackMethod: 'POST'",
    `${route} editor handoff must document rollback method`,
  );
  assertIncludes(
    source,
    "rollbackBody: { revisionId: '{revisionId}' }",
    `${route} editor handoff must document rollback body`,
  );
  assertExcludes(
    source,
    "/rollback/{revisionId}",
    `${route} editor handoff must not advertise path-based rollback ids`,
  );
}

const adminContentApi = read("apps/admin/src/lib/adminContentApi.ts");
for (const needle of [
  "exportReusableSections(",
  "importReusableSections(",
  "listReusableSectionVersions(",
  "restoreReusableSectionVersion(",
  "getReusableSectionInstances(",
  "refreshReusableSectionInstances(",
  "getReusableSectionMetadata(",
  "updateReusableSectionMetadata(",
  "/reusable-sections/export",
  "/reusable-sections/import",
  "/versions/${version}/restore",
  "/instances",
  "/metadata",
]) {
  assertIncludes(
    adminContentApi,
    needle,
    "admin reusable section workflow API client",
  );
}

const mediaSafety = read("apps/public/src/lib/mediaSafety.ts");
for (const needle of [
  "deliveryPolicy",
  "attachment-only",
  "ACTIVE_WEB_CONTENT_EXTENSIONS",
  "'text/html'",
  "'application/javascript'",
  "'image/svg+xml'",
  "requiresAttachmentDelivery",
  "scanMediaUploadWithProviders",
  "BACKY_MEDIA_SCAN_ENDPOINT",
  "provider-http-scan",
]) {
  assertIncludes(mediaSafety, needle, "mediaSafety");
}

const adminSettingsRoute = read(
  "apps/public/src/app/api/admin/settings/route.ts",
);
for (const needle of [
  "runtimeMediaScanner",
  "getMediaScannerRuntimeSummary",
  "BACKY_MEDIA_SCAN_PROVIDER",
  "BACKY_MEDIA_SCAN_ENDPOINT",
]) {
  assertIncludes(adminSettingsRoute, needle, "admin settings route");
}
const mediaStorageSettingsPatchStart = adminSettingsRoute.indexOf(
  "const isMediaStorageSettingsPatch",
);
const mediaStorageSettingsPatchEnd = adminSettingsRoute.indexOf(
  "const isMediaStorageInfrastructureCheck",
);
assert(
  mediaStorageSettingsPatchStart !== -1 && mediaStorageSettingsPatchEnd !== -1,
  "admin settings route missing media storage patch classifier",
);
const mediaStorageSettingsPatchSource = adminSettingsRoute.slice(
  mediaStorageSettingsPatchStart,
  mediaStorageSettingsPatchEnd,
);
assertIncludes(
  mediaStorageSettingsPatchSource,
  "key !== 'integrations'",
  "media.configure settings patch must be scoped to storage integrations only",
);
assertExcludes(
  mediaStorageSettingsPatchSource,
  "key !== 'deliveryMode' && key !== 'integrations'",
  "media.configure settings patch must not include deliveryMode",
);

const mediaFileRoute = read(
  "apps/public/src/app/api/sites/[siteId]/media/[mediaId]/file/route.ts",
);
for (const needle of [
  "BACKY_PUBLIC_CONTRACT_VERSION",
  "MEDIA_FILE_SCHEMA_VERSION = 'backy.media-file.v1'",
  "publicContractJson",
  "requiresAttachmentDelivery(media)",
  "const disposition = requiresAttachment ? 'attachment' : requestedDisposition",
  "disposition: requestedDisposition",
  "'x-content-type-options': 'nosniff'",
  "'x-backy-contract-version': BACKY_PUBLIC_CONTRACT_VERSION",
  "'x-backy-schema-version': MEDIA_FILE_SCHEMA_VERSION",
  "'x-backy-media-delivery-policy': 'attachment-only'",
]) {
  assertIncludes(mediaFileRoute, needle, "media file delivery route");
}

const mediaResponsive = read("apps/public/src/lib/mediaResponsive.ts");
for (const needle of [
  "publicMediaFilePath",
  "deliveryUrl",
  "downloadUrl",
  "url: deliveryUrl",
  "src: publicMediaFilePath(siteId, media.id)",
]) {
  assertIncludes(mediaResponsive, needle, "media responsive public contract");
}

const mediaTransformRoute = read(
  "apps/public/src/app/api/sites/[siteId]/media/[mediaId]/transform/route.ts",
);
for (const needle of [
  "BACKY_PUBLIC_CONTRACT_VERSION",
  "MEDIA_TRANSFORM_SCHEMA_VERSION = 'backy.media-transform.v1'",
  "publicMediaFilePath",
  "transformUrl.searchParams.set('url', publicMediaFilePath(site.id, media.id))",
  "'x-backy-contract-version': BACKY_PUBLIC_CONTRACT_VERSION",
  "'x-backy-schema-version': MEDIA_TRANSFORM_SCHEMA_VERSION",
  "Object.entries(commonHeaders).forEach(([key, value]) => {",
]) {
  assertIncludes(mediaTransformRoute, needle, "media transform route");
}

const adminMediaDetailRoute = read(
  "apps/public/src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts",
);
const adminMediaDelete = functionSource(
  adminMediaDetailRoute,
  "DELETE",
  "admin media detail route",
);
for (const needle of [
  "collectRetainedVersionStoragePaths",
  "generatedTransformStoragePaths(media.metadata)",
  "addScopedStoragePath(siteId, storagePaths, version.storagePath)",
  "storagePath.startsWith(`sites/${siteId}/`)",
]) {
  assertIncludes(
    adminMediaDetailRoute,
    needle,
    "admin media delete storage cleanup",
  );
}
for (const needle of [
  "repositories.media.listVersions({",
  "const retainedVersionStoragePaths = collectRetainedVersionStoragePaths(",
  "await repositories.media.delete(site.id, mediaId)",
  "await deleteUploadedFile(site.id, media, retainedVersionStoragePaths)",
]) {
  assertIncludes(
    adminMediaDelete,
    needle,
    "admin media delete storage cleanup",
  );
}
assert(
  adminMediaDelete.indexOf("repositories.media.listVersions({") <
    adminMediaDelete.indexOf(
      "await repositories.media.delete(site.id, mediaId)",
    ),
  "admin media delete must capture retained version storage paths before deleting version rows",
);
assert(
  adminMediaDelete.indexOf(
    "await repositories.media.delete(site.id, mediaId)",
  ) <
    adminMediaDelete.indexOf(
      "await deleteUploadedFile(site.id, media, retainedVersionStoragePaths)",
    ),
  "admin media delete must clean up storage with retained version paths after catalog delete",
);

console.log("Public security regression smoke passed");

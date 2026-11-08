// Pure discovery declarations: no runtime repository or storage imports.
const text = { type: "string" },
  uuid = { type: "string", format: "uuid" },
  schema = (name: string) => ({ $ref: `#/components/schemas/${name}` });
export const commerceEntitlementSchemas = {
  BackyPrivateFileVersion: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "productId",
      "filename",
      "sizeBytes",
      "expiresDays",
      "maxDownloads",
      "createdAt",
      "state",
      "protected",
      "cleanupPending",
      "errorCode",
    ],
    properties: {
      id: uuid,
      productId: uuid,
      filename: text,
      sizeBytes: { type: "integer", minimum: 1, maximum: 3145728 },
      expiresDays: { type: "integer", minimum: 1, maximum: 365 },
      maxDownloads: { type: "integer", minimum: 1, maximum: 100 },
      createdAt: text,
      state: { enum: ["planned", "active", "retiring", "removed"] },
      protected: { type: "boolean" },
      cleanupPending: { type: "boolean" },
      errorCode: { type: ["string", "null"] },
    },
  },
  BackyPrivateFileStorage: {
    type: "object",
    required: [
      "schemaVersion",
      "files",
      "pagination",
      "reservedAndRetainedBytes",
      "maxUploadBytes",
      "retention",
    ],
    properties: {
      schemaVersion: { const: "backy.private-file-storage.v1" },
      files: {
        type: "array",
        items: schema("BackyPrivateFileVersion"),
        maxItems: 100,
      },
      pagination: {
        type: "object",
        properties: {
          total: { type: "integer" },
          limit: { type: "integer", maximum: 100 },
          offset: { type: "integer" },
          hasMore: { type: "boolean" },
        },
      },
      reservedAndRetainedBytes: { type: "integer", minimum: 0 },
      maxUploadBytes: { const: 3145728 },
      retention: text,
    },
  },
  BackyPrivateFileAction: {
    type: "object",
    additionalProperties: false,
    required: ["action"],
    properties: { action: { enum: ["recover", "retire"] } },
  },
  BackyPrivateFileRecovery: {
    type: "object",
    required: ["schemaVersion", "fileId", "state", "removedBytes"],
    properties: {
      schemaVersion: { const: "backy.private-file-recovery.v1" },
      fileId: uuid,
      state: { enum: ["registered", "removed"] },
      removedBytes: { type: "integer", minimum: 0 },
    },
  },

  BackyBuyerEntitlement: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "productId",
      "filename",
      "state",
      "expiresAt",
      "maxDownloads",
      "downloads",
      "revokedAt",
    ],
    properties: {
      id: uuid,
      productId: uuid,
      filename: text,
      state: {
        enum: ["active", "revoked", "expired", "exhausted", "payment-held"],
      },
      expiresAt: { type: "string", format: "date-time" },
      maxDownloads: { type: "integer", minimum: 1, maximum: 100 },
      downloads: { type: "integer", minimum: 0 },
      revokedAt: { type: ["string", "null"] },
    },
  },
  BackyBuyerOrder: {
    type: "object",
    required: [
      "schemaVersion",
      "orderId",
      "paymentStatus",
      "entitlements",
      "history",
    ],
    properties: {
      schemaVersion: { const: "backy.buyer-order.v1" },
      orderId: uuid,
      paymentStatus: text,
      entitlements: { type: "array", items: schema("BackyBuyerEntitlement") },
      history: {
        type: "array",
        maxItems: 100,
        items: {
          type: "object",
          properties: {
            kind: { enum: ["issued", "download.admitted", "revoked"] },
            createdAt: text,
            entitlementId: { type: ["string", "null"] },
          },
        },
      },
      historyScope: { const: "presented-order-proof" },
      settlementBoundary: text,
    },
  },
  BackyDigitalFile: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "productId",
      "filename",
      "sizeBytes",
      "expiresDays",
      "maxDownloads",
      "createdAt",
    ],
    properties: {
      id: uuid,
      productId: uuid,
      filename: { type: "string", maxLength: 180 },
      sizeBytes: { type: "integer", minimum: 1, maximum: 3145728 },
      expiresDays: { type: "integer", minimum: 1, maximum: 365 },
      maxDownloads: { type: "integer", minimum: 1, maximum: 100 },
      createdAt: text,
    },
  },
  BackyEntitlementRevokeInput: {
    type: "object",
    additionalProperties: false,
    required: ["action", "entitlementId"],
    properties: { action: { const: "revoke" }, entitlementId: uuid },
  },
};
export function commerceEntitlementPaths(siteIdentifier = "{siteId}") {
  const site = siteIdentifier,
    publicBase = `/api/sites/${site}/commerce/orders/{orderId}/entitlements`,
    adminBase = `/api/admin/sites/${site}/commerce/orders/{orderId}/entitlements`,
    product = `/api/admin/sites/${site}/commerce/products/{productId}/digital-file`;
  const path = (name: string) => ({
    name,
    in: "path",
    required: true,
    schema: name === "siteId" ? text : uuid,
  });
  const params = (...names: string[]) => [
    ...(site.includes("{siteId}") ? [path("siteId")] : []),
    ...names.map(path),
  ];
  const auth = {
    tags: ["Buyer Downloads"],
    parameters: params("orderId"),
    security: [{ BackyOrderStatusToken: [] }, { BackyBuyerBearer: [] }],
    "x-backy-runtime-requirement": "PostgreSQL migrations034–035",
    description:
      "Requires an exact site/order checkout proof in X-Backy-Order-Status-Token or Bearer. Never accepts email/order ID as ownership proof. Grants require authoritative persisted paid state; refunds, cancellation, revocation, expiry and count limits hold access. Provider certification remains separate. History covers this explicitly proven order only.",
  };
  const jsonResponse = (name: string) => ({
    description: "Private no-store response",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            success: { const: true },
            requestId: text,
            data: schema(name),
          },
        },
      },
    },
  });
  const admin = {
    tags: ["Admin Commerce"],
    security: [{ BackyAdminSession: [] }, { BackyAdminSessionHeader: [] }],
    "x-backy-runtime-requirement": "PostgreSQL migrations034–035",
  };
  const privateFiles = `/api/admin/sites/${site}/commerce/private-files`;
  return {
    [privateFiles]: {
      get: {
        ...admin,
        parameters: [
          ...params(),
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", minimum: 0, default: 0 },
          },
        ],
        "x-backy-permissions": ["commerce.view"],
        operationId: "getPrivateCommerceFileStorage",
        responses: { "200": jsonResponse("BackyPrivateFileStorage") },
        description:
          "Migration035 durable staging/cleanup journal. Private bytes share website media quota; safe version metadata only. All checkout claims, including pending and deleted orders, retain immutable purchased versions.",
      },
    },
    [privateFiles + "/{fileId}/lifecycle"]: {
      post: {
        ...admin,
        parameters: params("fileId"),
        "x-backy-permissions": ["commerce.edit"],
        operationId: "recoverOrRetirePrivateCommerceFile",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: schema("BackyPrivateFileAction") },
          },
        },
        responses: { "200": jsonResponse("BackyPrivateFileRecovery") },
        description:
          "Explicit recover or retire action under shared website storage admission. Never deletes checkout/entitlement protected versions. Exact private destination/provider plus size/SHA256 are verified before deletion; unknown outcomes retain quota and evidence. Site deletion is blocked until every private file and journal is resolved. No client storage paths or URLs are accepted.",
      },
    },
    [publicBase]: {
      get: {
        ...auth,
        operationId: "getBuyerOrderEntitlements",
        responses: { "200": jsonResponse("BackyBuyerOrder") },
      },
    },
    [publicBase + "/{entitlementId}/download"]: {
      post: {
        ...auth,
        parameters: params("orderId", "entitlementId"),
        operationId: "downloadBuyerDigitalFile",
        description:
          auth.description +
          " Atomic bounded byte proxy; order lock is held through verified storage read. Admission before a later refund/revocation may complete. No URL is issued. Failed storage reads consume no allowance; client transport failure after committed admission may consume one.",
        responses: {
          "200": {
            description:
              "Attachment; private/no-store; octet-stream; nosniff; sandbox CSP",
            content: {
              "application/octet-stream": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
        },
      },
    },
    [adminBase]: {
      get: {
        ...admin,
        parameters: params("orderId"),
        "x-backy-permissions": ["commerce.view"],
        operationId: "getAdminBuyerEntitlements",
        responses: { "200": jsonResponse("BackyBuyerOrder") },
      },
      post: {
        ...admin,
        parameters: params("orderId"),
        "x-backy-permissions": ["commerce.edit"],
        operationId: "revokeBuyerEntitlement",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: schema("BackyEntitlementRevokeInput"),
            },
          },
        },
        responses: { "200": jsonResponse("BackyBuyerOrder") },
      },
    },
    [product]: {
      get: {
        ...admin,
        parameters: params("productId"),
        "x-backy-permissions": ["commerce.view"],
        operationId: "getProductPrivateDigitalFile",
        responses: {
          "200": { description: "Current private file metadata or null" },
        },
      },
      post: {
        ...admin,
        parameters: [
          ...params("productId"),
          {
            name: "x-backy-file-name",
            in: "header",
            required: true,
            schema: { type: "string", description: "URI encoded filename" },
          },
          {
            name: "expiresDays",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 365, default: 30 },
          },
          {
            name: "maxDownloads",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 5 },
          },
        ],
        "x-backy-permissions": ["commerce.edit"],
        operationId: "uploadProductPrivateDigitalFile",
        description:
          "Raw file body up to 3MiB; verified private storage and existing owner scanner admission. Durable planned bytes precede storage writes and share website media quota; unknown outcomes retain evidence until explicit recovery. Save a digital product first. New orders capture the immutable current file ID; existing orders retain their original version. Expiry starts at checkout creation.",
        requestBody: {
          required: true,
          content: {
            "application/octet-stream": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        responses: {
          "201": {
            description: "Safe metadata; no storage path or signed URL",
          },
        },
      },
    },
  };
}
export const commerceEntitlementSecuritySchemes = {
  BackyBuyerBearer: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "checkout-status-proof",
    description:
      "Exact site/order checkout proof; this is not a visitor session.",
  },
  BackyOrderStatusToken: {
    type: "apiKey",
    in: "header",
    name: "X-Backy-Order-Status-Token",
    description:
      "Private checkout proof; site-bound token hash is persisted. Never put tokens in URLs.",
  },
};

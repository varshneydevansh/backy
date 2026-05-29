#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

const ADMIN_BASE_URL =
  process.env.BACKY_ADMIN_BASE_URL || "http://localhost:5173";
const API_BASE_URL =
  process.env.BACKY_PUBLIC_API_BASE_URL || "http://localhost:3001";
const SITE_ID = process.env.BACKY_COMMERCE_SMOKE_SITE_ID || "site-demo";
const CHROME_BIN =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.BACKY_COMMERCE_CDP_PORT || 9378);
const SCREENSHOT_PATH =
  process.env.BACKY_COMMERCE_SCREENSHOT ||
  path.join(os.tmpdir(), "backy-commerce-smoke.png");
const STRIPE_MOCK_PORT = Number(process.env.BACKY_STRIPE_MOCK_PORT || 45678);
const STRIPE_MOCK_BASE_URL = `http://127.0.0.1:${STRIPE_MOCK_PORT}`;
const COMMERCE_PROVIDER_MOCK_PORT = Number(
  process.env.BACKY_COMMERCE_PROVIDER_MOCK_PORT || 45679,
);
const COMMERCE_PROVIDER_MOCK_BASE_URL = `http://127.0.0.1:${COMMERCE_PROVIDER_MOCK_PORT}`;
const SOURCE_ONLY_MODE = process.env.BACKY_COMMERCE_SOURCE_ONLY === "1"
  || process.env.BACKY_PRODUCTS_SOURCE_ONLY === "1"
  || process.env.BACKY_COMMERCE_SMOKE_SOURCE_ONLY === "1";
const PROVIDER_CERTIFICATION_RENDERED_ONLY_MODE =
  process.env.BACKY_COMMERCE_PROVIDER_CERTIFICATION_RENDERED_ONLY === "1" ||
  process.env.BACKY_PRODUCTS_PROVIDER_CERTIFICATION_RENDERED_ONLY === "1";

const PRODUCT_COLLECTION_SLUG = "products";
const ORDERS_COLLECTION_SLUG = "orders";
const CUSTOMERS_COLLECTION_SLUG = "customers";
const PRODUCT_REQUIRED_FIELD_COUNT = 31;
const ORDER_REQUIRED_FIELD_COUNT = 57;
const FRONTEND_PRODUCT_TEMPLATE_ID = "smoke-product-contract-template";
const FRONTEND_PRODUCT_TEMPLATE_NAME = "Smoke Frontend Product";
const COMMERCE_WEBHOOK_SECRET = "smoke-commerce-webhook-secret";
const COMMERCE_WEBHOOK_SECRET_REFERENCE = "env:BACKY_COMMERCE_WEBHOOK_SECRET";
let apiAdminSessionToken = "";
let stripeCheckoutMock = null;
let commerceProviderMock = null;

const PRODUCT_VALUE_KEYS = {
  title: "title",
  sku: "sku",
  variants: "variants",
  price: "price",
  compareAtPrice: "compareatprice",
  currency: "currency",
  inventory: "inventory",
  lowStockThreshold: "lowstockthreshold",
  inventoryPolicy: "inventorypolicy",
  productType: "producttype",
  downloadUrl: "downloadurl",
  downloadMediaId: "downloadmediaid",
  downloadMediaName: "downloadmedianame",
  downloadMediaType: "downloadmediatype",
  downloadMediaFolderId: "downloadmediafolderid",
  downloadMediaFolderPath: "downloadmediafolderpath",
  downloadMediaVisibility: "downloadmediavisibility",
  downloadMediaScope: "downloadmediascope",
  downloadMediaScopeTargetId: "downloadmediascopetargetid",
  downloadMediaOrganization: "downloadmediaorganization",
  checkoutUrl: "checkouturl",
  subscriptionEnabled: "subscriptionenabled",
  subscriptionInterval: "subscriptioninterval",
  subscriptionTrialDays: "subscriptiontrialdays",
  shippingRequired: "shippingrequired",
  shippingProfile: "shippingprofile",
  weight: "weight",
  taxClass: "taxclass",
  discountCode: "discountcode",
  returnPolicy: "returnpolicy",
  imageUrl: "imageurl",
  galleryImages: "galleryimages",
  category: "category",
  tags: "tags",
  vendor: "vendor",
  description: "description",
  seoTitle: "seotitle",
  featured: "featured",
  taxable: "taxable",
  providerSync: "providersync",
};

const productFieldKey = (key) => PRODUCT_VALUE_KEYS[key] || key;
const readProductValue = (values, key) =>
  Object.prototype.hasOwnProperty.call(values || {}, productFieldKey(key))
    ? values[productFieldKey(key)]
    : values?.[key];

const PRODUCT_SCHEMA_FIELDS = [
  {
    key: "title",
    label: "Title",
    type: "text",
    required: true,
    unique: false,
    sortOrder: 10,
  },
  {
    key: "sku",
    label: "SKU",
    type: "text",
    required: true,
    unique: true,
    sortOrder: 20,
  },
  {
    key: "price",
    label: "Price",
    type: "number",
    required: true,
    unique: false,
    sortOrder: 30,
  },
  {
    key: productFieldKey("compareAtPrice"),
    label: "Compare at price",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 40,
  },
  {
    key: "currency",
    label: "Currency",
    type: "text",
    required: true,
    unique: false,
    sortOrder: 50,
    defaultValue: "USD",
  },
  {
    key: "variants",
    label: "Variants",
    type: "json",
    required: false,
    unique: false,
    sortOrder: 60,
    defaultValue: [],
  },
  {
    key: "inventory",
    label: "Inventory",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 70,
    defaultValue: 0,
  },
  {
    key: productFieldKey("lowStockThreshold"),
    label: "Low Stock Threshold",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 80,
    defaultValue: 5,
  },
  {
    key: productFieldKey("inventoryPolicy"),
    label: "Inventory Policy",
    type: "select",
    required: false,
    unique: false,
    sortOrder: 90,
    options: ["deny", "continue", "preorder"],
    defaultValue: "deny",
  },
  {
    key: productFieldKey("productType"),
    label: "Product Type",
    type: "select",
    required: true,
    unique: false,
    sortOrder: 100,
    options: ["physical", "digital", "service"],
    defaultValue: "physical",
  },
  {
    key: productFieldKey("downloadUrl"),
    label: "Digital Delivery URL",
    type: "url",
    required: false,
    unique: false,
    sortOrder: 110,
  },
  {
    key: productFieldKey("downloadMediaId"),
    label: "Digital Delivery Media ID",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 111,
  },
  {
    key: productFieldKey("downloadMediaName"),
    label: "Digital Delivery Media Name",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 112,
  },
  {
    key: productFieldKey("downloadMediaType"),
    label: "Digital Delivery Media Type",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 113,
  },
  {
    key: productFieldKey("downloadMediaFolderId"),
    label: "Digital Delivery Folder ID",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 114,
  },
  {
    key: productFieldKey("downloadMediaFolderPath"),
    label: "Digital Delivery Folder Path",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 115,
  },
  {
    key: productFieldKey("downloadMediaVisibility"),
    label: "Digital Delivery Visibility",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 116,
  },
  {
    key: productFieldKey("downloadMediaScope"),
    label: "Digital Delivery Scope",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 117,
  },
  {
    key: productFieldKey("downloadMediaScopeTargetId"),
    label: "Digital Delivery Scope Target",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 118,
  },
  {
    key: productFieldKey("downloadMediaOrganization"),
    label: "Digital Delivery Organization",
    type: "json",
    required: false,
    unique: false,
    sortOrder: 119,
  },
  {
    key: productFieldKey("checkoutUrl"),
    label: "Checkout URL",
    type: "url",
    required: false,
    unique: false,
    sortOrder: 120,
  },
  {
    key: productFieldKey("subscriptionEnabled"),
    label: "Subscription Enabled",
    type: "boolean",
    required: false,
    unique: false,
    sortOrder: 130,
    defaultValue: false,
  },
  {
    key: productFieldKey("subscriptionInterval"),
    label: "Subscription Interval",
    type: "select",
    required: false,
    unique: false,
    sortOrder: 140,
    options: ["weekly", "monthly", "quarterly", "yearly"],
    defaultValue: "monthly",
  },
  {
    key: productFieldKey("subscriptionTrialDays"),
    label: "Subscription Trial Days",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 150,
    defaultValue: 0,
  },
  {
    key: productFieldKey("shippingRequired"),
    label: "Requires Shipping",
    type: "boolean",
    required: false,
    unique: false,
    sortOrder: 160,
    defaultValue: true,
  },
  {
    key: productFieldKey("shippingProfile"),
    label: "Shipping Profile",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 170,
  },
  {
    key: "weight",
    label: "Weight",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 180,
  },
  {
    key: productFieldKey("taxClass"),
    label: "Tax Class",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 190,
  },
  {
    key: productFieldKey("discountCode"),
    label: "Discount Code",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 200,
  },
  {
    key: productFieldKey("returnPolicy"),
    label: "Return Policy",
    type: "richText",
    required: false,
    unique: false,
    sortOrder: 210,
  },
  {
    key: productFieldKey("imageUrl"),
    label: "Image URL",
    type: "url",
    required: false,
    unique: false,
    sortOrder: 220,
  },
  {
    key: productFieldKey("galleryImages"),
    label: "Gallery Images",
    type: "json",
    required: false,
    unique: false,
    sortOrder: 230,
    defaultValue: [],
  },
  {
    key: "category",
    label: "Category",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 240,
  },
  {
    key: "tags",
    label: "Tags",
    type: "tags",
    required: false,
    unique: false,
    sortOrder: 250,
  },
  {
    key: "vendor",
    label: "Vendor",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 260,
  },
  {
    key: "description",
    label: "Description",
    type: "richText",
    required: false,
    unique: false,
    sortOrder: 270,
  },
  {
    key: productFieldKey("seoTitle"),
    label: "SEO Title",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 280,
  },
  {
    key: "featured",
    label: "Featured",
    type: "boolean",
    required: false,
    unique: false,
    sortOrder: 290,
    defaultValue: false,
  },
  {
    key: "taxable",
    label: "Taxable",
    type: "boolean",
    required: false,
    unique: false,
    sortOrder: 300,
    defaultValue: true,
  },
  {
    key: productFieldKey("providerSync"),
    label: "Provider Sync",
    type: "json",
    required: false,
    unique: false,
    sortOrder: 310,
  },
];

const ORDER_SCHEMA_FIELDS = [
  {
    key: "ordernumber",
    label: "Order Number",
    type: "text",
    required: true,
    unique: true,
    sortOrder: 10,
  },
  {
    key: "customername",
    label: "Customer Name",
    type: "text",
    required: true,
    unique: false,
    sortOrder: 20,
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    required: true,
    unique: false,
    sortOrder: 30,
  },
  {
    key: "phone",
    label: "Phone",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 40,
  },
  {
    key: "total",
    label: "Total",
    type: "number",
    required: true,
    unique: false,
    sortOrder: 50,
  },
  {
    key: "subtotal",
    label: "Subtotal",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 55,
  },
  {
    key: "taxamount",
    label: "Tax Amount",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 56,
  },
  {
    key: "shippingamount",
    label: "Shipping Amount",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 57,
  },
  {
    key: "discountamount",
    label: "Discount Amount",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 58,
  },
  {
    key: "currency",
    label: "Currency",
    type: "text",
    required: true,
    unique: false,
    sortOrder: 60,
    defaultValue: "USD",
  },
  {
    key: "items",
    label: "Items",
    type: "richText",
    required: true,
    unique: false,
    sortOrder: 70,
  },
  {
    key: "ordersource",
    label: "Order Source",
    type: "select",
    required: false,
    unique: false,
    sortOrder: 75,
    options: ["web", "manual", "api", "import", "pos"],
    defaultValue: "web",
  },
  {
    key: "checkoutsessionid",
    label: "Checkout Session ID",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 76,
  },
  {
    key: "customerid",
    label: "Customer ID",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 77,
  },
  {
    key: "orderstatus",
    label: "Order Status",
    type: "select",
    required: true,
    unique: false,
    sortOrder: 80,
    options: ["open", "paid", "fulfilled", "cancelled", "refunded"],
    defaultValue: "open",
  },
  {
    key: "paymentstatus",
    label: "Payment Status",
    type: "select",
    required: true,
    unique: false,
    sortOrder: 90,
    options: ["pending", "paid", "failed", "refunded"],
    defaultValue: "pending",
  },
  {
    key: "paymentprovider",
    label: "Payment Provider",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 100,
  },
  {
    key: "paymentreference",
    label: "Payment Reference",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 110,
  },
  {
    key: "paidat",
    label: "Paid At",
    type: "date",
    required: false,
    unique: false,
    sortOrder: 120,
  },
  {
    key: "fulfillmentstatus",
    label: "Fulfillment Status",
    type: "select",
    required: true,
    unique: false,
    sortOrder: 130,
    options: ["unfulfilled", "processing", "fulfilled", "cancelled"],
    defaultValue: "unfulfilled",
  },
  {
    key: "fulfillmentcarrier",
    label: "Fulfillment Carrier",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 140,
  },
  {
    key: "trackingnumber",
    label: "Tracking Number",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 150,
  },
  {
    key: "trackingurl",
    label: "Tracking URL",
    type: "url",
    required: false,
    unique: false,
    sortOrder: 160,
  },
  {
    key: "trackingstatus",
    label: "Tracking Status",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 165,
  },
  {
    key: "trackinglastcheckedat",
    label: "Tracking Last Checked At",
    type: "date",
    required: false,
    unique: false,
    sortOrder: 166,
  },
  {
    key: "fulfilledat",
    label: "Fulfilled At",
    type: "date",
    required: false,
    unique: false,
    sortOrder: 170,
  },
  {
    key: "shippinglabelstatus",
    label: "Shipping Label Status",
    type: "select",
    required: false,
    unique: false,
    sortOrder: 171,
    options: ["none", "draft", "purchased", "voided"],
    defaultValue: "none",
  },
  {
    key: "shippinglabelprovider",
    label: "Shipping Label Provider",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 172,
  },
  {
    key: "shippinglabelid",
    label: "Shipping Label ID",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 173,
  },
  {
    key: "shippinglabelurl",
    label: "Shipping Label URL",
    type: "url",
    required: false,
    unique: false,
    sortOrder: 174,
  },
  {
    key: "shippingservicelevel",
    label: "Shipping Service Level",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 175,
  },
  {
    key: "shippinglabelcost",
    label: "Shipping Label Cost",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 176,
  },
  {
    key: "shippinglabelcreatedat",
    label: "Shipping Label Created At",
    type: "date",
    required: false,
    unique: false,
    sortOrder: 177,
  },
  {
    key: "fulfillmentdispatchstatus",
    label: "Fulfillment Dispatch Status",
    type: "select",
    required: false,
    unique: false,
    sortOrder: 178,
    options: ["none", "requested", "succeeded", "failed", "requires_action"],
    defaultValue: "none",
  },
  {
    key: "fulfillmentprovider",
    label: "Fulfillment Provider",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 179,
  },
  {
    key: "fulfillmentid",
    label: "Fulfillment ID",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 180,
  },
  {
    key: "fulfillmentrequestedat",
    label: "Fulfillment Requested At",
    type: "date",
    required: false,
    unique: false,
    sortOrder: 181,
  },
  {
    key: "fulfillmentcompletedat",
    label: "Fulfillment Completed At",
    type: "date",
    required: false,
    unique: false,
    sortOrder: 182,
  },
  {
    key: "fulfillmentpayload",
    label: "Fulfillment Payload",
    type: "richText",
    required: false,
    unique: false,
    sortOrder: 183,
  },
  {
    key: "riskscore",
    label: "Risk Score",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 180,
    defaultValue: 0,
  },
  {
    key: "risklevel",
    label: "Risk Level",
    type: "select",
    required: false,
    unique: false,
    sortOrder: 182,
    options: ["low", "medium", "high"],
    defaultValue: "low",
  },
  {
    key: "riskreasons",
    label: "Risk Reasons",
    type: "richText",
    required: false,
    unique: false,
    sortOrder: 184,
  },
  {
    key: "riskreviewstatus",
    label: "Risk Review Status",
    type: "select",
    required: false,
    unique: false,
    sortOrder: 186,
    options: ["cleared", "pending_review", "approved", "held"],
    defaultValue: "cleared",
  },
  {
    key: "shippingaddress",
    label: "Shipping Address",
    type: "richText",
    required: false,
    unique: false,
    sortOrder: 190,
  },
  {
    key: "billingaddress",
    label: "Billing Address",
    type: "richText",
    required: false,
    unique: false,
    sortOrder: 200,
  },
  {
    key: "refundamount",
    label: "Refund Amount",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 210,
  },
  {
    key: "refundreason",
    label: "Refund Reason",
    type: "richText",
    required: false,
    unique: false,
    sortOrder: 220,
  },
  {
    key: "providerrefundstatus",
    label: "Provider Refund Status",
    type: "select",
    required: false,
    unique: false,
    sortOrder: 221,
    options: ["none", "requested", "succeeded", "failed", "requires_action"],
    defaultValue: "none",
  },
  {
    key: "providerrefundprovider",
    label: "Provider Refund Provider",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 222,
  },
  {
    key: "providerrefundid",
    label: "Provider Refund ID",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 223,
  },
  {
    key: "providerrefundreference",
    label: "Provider Refund Reference",
    type: "text",
    required: false,
    unique: false,
    sortOrder: 224,
  },
  {
    key: "providerrefundamount",
    label: "Provider Refund Amount",
    type: "number",
    required: false,
    unique: false,
    sortOrder: 225,
  },
  {
    key: "providerrefundreason",
    label: "Provider Refund Reason",
    type: "richText",
    required: false,
    unique: false,
    sortOrder: 226,
  },
  {
    key: "providerrefundrequestedat",
    label: "Provider Refund Requested At",
    type: "date",
    required: false,
    unique: false,
    sortOrder: 227,
  },
  {
    key: "providerrefundcompletedat",
    label: "Provider Refund Completed At",
    type: "date",
    required: false,
    unique: false,
    sortOrder: 228,
  },
  {
    key: "providerrefundpayload",
    label: "Provider Refund Payload",
    type: "richText",
    required: false,
    unique: false,
    sortOrder: 229,
  },
  {
    key: "notes",
    label: "Internal Notes",
    type: "richText",
    required: false,
    unique: false,
    sortOrder: 240,
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertProductsApiContractsSource = () => {
  const commerceSmokeSource = fs.readFileSync(
    new URL("./commerce-smoke.mjs", import.meta.url),
    "utf8",
  );
  const source = fs.readFileSync(
    new URL("../src/routes/products.tsx", import.meta.url),
    "utf8",
  );
  const ordersSource = fs.readFileSync(
    new URL("../src/routes/orders.tsx", import.meta.url),
    "utf8",
  );
  const providerSyncSource = fs.readFileSync(
    new URL(
      "../../public/src/app/api/admin/sites/[siteId]/commerce/products/[productId]/provider-sync/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const lifecycleSource = fs.readFileSync(
    new URL(
      "../../public/src/app/api/admin/sites/[siteId]/commerce/products/[productId]/subscriptions/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const actionSource = fs.readFileSync(
    new URL(
      "../../public/src/app/api/admin/sites/[siteId]/commerce/products/[productId]/subscriptions/[orderId]/action/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const publicOrderRouteSource = fs.readFileSync(
    new URL(
      "../../public/src/app/api/sites/[siteId]/commerce/orders/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const adminContentApiSource = fs.readFileSync(
    new URL("../src/lib/adminContentApi.ts", import.meta.url),
    "utf8",
  );
  const commerceCatalogSource = fs.readFileSync(
    new URL("../../public/src/lib/commerceCatalog.ts", import.meta.url),
    "utf8",
  );
  const routeResolverSource = fs.readFileSync(
    new URL("../../public/src/lib/routeResolver.ts", import.meta.url),
    "utf8",
  );
  const repositoryRouteResolverSource = fs.readFileSync(
    new URL("../../public/src/lib/repositoryRouteResolver.ts", import.meta.url),
    "utf8",
  );
  const renderPayloadSource = fs.readFileSync(
    new URL("../../public/src/lib/renderPayload.ts", import.meta.url),
    "utf8",
  );
  const openapiSource = fs.readFileSync(
    new URL("../../public/src/app/api/sites/[siteId]/openapi/route.ts", import.meta.url),
    "utf8",
  );
  const frontendDesignContractSource = fs.readFileSync(
    new URL("../../public/src/lib/frontendDesignContract.ts", import.meta.url),
    "utf8",
  );
  const sdkSource = fs.readFileSync(
    new URL("../../../packages/sdk-js/src/index.ts", import.meta.url),
    "utf8",
  );
  const sdkSmokeSource = fs.readFileSync(
    new URL("../../../packages/sdk-js/scripts/smoke.mjs", import.meta.url),
    "utf8",
  );
  assert(
    source.includes("import { EmptyState } from '@/components/ui/EmptyState';"),
    "Products route must use the shared EmptyState component",
  );
  assert(
    source.includes('data-testid="products-error-state"') &&
      source.includes("Products workspace needs attention"),
    "Products route must expose a labelled backend error state",
  );
  assert(
    source.includes('aria-label="Retry loading products"') &&
      source.includes("Clear filters"),
    "Products backend error state must expose retry and filter recovery actions",
  );
  assert(
    source.includes('data-testid="products-permission-state"') &&
      source.includes("Product permissions could not be verified"),
    "Products route must expose a labelled permission error state",
  );
  assert(
    source.includes("const canUseProductRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);") &&
      source.includes("const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseProductRoleDefaults;") &&
      source.includes("const isProductPermissionAllowed = (key: ProductPermissionKey) => (") &&
      source.includes("const canViewCommerce = isProductPermissionAllowed('commerce.view');") &&
      source.includes("const canEditCommerce = isProductPermissionAllowed('commerce.edit');") &&
      source.includes("const canConfigureCommerce = isProductPermissionAllowed('commerce.configure');") &&
      source.includes("const canDeleteCommerce = isProductPermissionAllowed('commerce.delete');") &&
      source.includes("const canViewCollections = isProductPermissionAllowed('collections.view');") &&
      source.includes("const canEditCollections = isProductPermissionAllowed('collections.edit');") &&
      source.includes("const canExportCollections = isProductPermissionAllowed('collections.export');") &&
      source.includes("const canDeleteCollections = isProductPermissionAllowed('collections.delete');") &&
      source.includes("const canViewMedia = isProductPermissionAllowed('media.view');") &&
      source.includes("const canCreateMedia = isProductPermissionAllowed('media.create');") &&
      source.includes("const canEditPages = isProductPermissionAllowed('pages.edit');") &&
      source.includes("const isProductsAccessBusy = isProductsBusy;") &&
      source.includes("const isProductPageTemplateActionDisabled = !canEditPages;") &&
      source.includes('data-testid="products-permission-sync-state"') &&
      !source.includes("const canViewCommerce = !isPermissionMatrixPending") &&
      !source.includes("const isProductsAccessBusy = isProductsBusy || isPermissionMatrixPending;") &&
      !source.includes("const isProductPageTemplateActionDisabled = isPermissionMatrixPending || !canEditPages;"),
    "Products route must keep role-default commerce workflows usable while permission details hydrate",
  );
  assert(
    source.includes('data-testid="products-command-secondary-actions"') &&
      source.includes("const productsCommandSecondaryActionStatusId = 'products-command-secondary-action-status';") &&
      source.includes('data-testid="products-command-secondary-action-status"') &&
      source.includes('data-testid="products-command-secondary-action-menu"') &&
      source.includes('aria-describedby={productsCommandSecondaryActionStatusId}') &&
      source.includes('data-action-state={productsCommandSecondaryActionState}') &&
      source.includes('data-action-status={productsCommandSecondaryActionStatus}') &&
      source.includes('data-testid="products-readiness-details"') &&
      source.includes('data-testid="products-control-map"') &&
      source.includes('data-default-collapsed="true"') &&
      source.includes("Catalog readiness, workflow, and navigation") &&
      source.includes('data-testid="products-command-copy-manifest"') &&
      source.includes('data-action-status={productsCommandCopyManifestActionStatus}') &&
      source.includes('aria-label="Copy product handoff manifest"') &&
      source.includes('data-testid="products-command-download-json"') &&
      source.includes('data-action-status={productsCommandDownloadJsonActionStatus}') &&
      source.includes('aria-label="Download product handoff JSON"') &&
      source.includes('data-testid="products-command-export-csv"') &&
      source.includes('data-action-status={productsCommandExportCsvActionStatus}') &&
      source.includes('data-disabled-reason={productsCommandCsvExportDisabledReason || undefined}') &&
      source.includes('aria-label="Export filtered products CSV"') &&
      source.includes('data-testid="products-command-csv-template"') &&
      source.includes('data-action-status={productsCommandCsvTemplateActionStatus}') &&
      source.includes('aria-label="Download product CSV template"') &&
      source.includes('data-testid="products-command-import-csv"') &&
      source.includes('data-action-status={productsCommandImportCsvActionStatus}') &&
      source.includes('aria-label="Import products CSV"') &&
      source.includes('data-testid="products-command-storefront-page"') &&
      source.includes('data-action-status={productsCommandStorefrontPageActionStatus}') &&
      source.includes('aria-label="Create storefront page"') &&
      source.includes('aria-label="More catalog actions"') &&
      source.indexOf('New product') < source.indexOf('data-testid="products-command-secondary-actions"'),
    "Products command center must keep New product primary while grouping secondary catalog and readiness actions with ready/blocked state metadata",
  );
  assert(
    source.includes("const productsStorefrontApiActionStatusId = 'products-storefront-api-action-status';") &&
      source.includes("const productsStorefrontApiSecondaryActionStatusId = 'products-storefront-api-secondary-action-status';") &&
      source.includes('const productsStorefrontApiActionStatus = [') &&
      source.includes('const productsStorefrontApiSecondaryActionStatus = [') &&
      source.includes('data-testid="products-storefront-api-actions"') &&
      source.includes('data-testid="products-storefront-api-action-status"') &&
      source.includes('data-testid="products-storefront-api-secondary-action-status"') &&
      source.includes('data-testid="products-storefront-api-primary-actions"') &&
      source.includes('data-testid="products-storefront-api-sync-schema"') &&
      source.includes('data-testid="products-storefront-api-import-csv"') &&
      source.includes('data-testid="products-storefront-api-storefront-page"') &&
      source.includes('data-testid="products-storefront-api-open-api"') &&
      source.includes('data-testid="products-storefront-api-secondary-actions"') &&
      source.includes('data-action-status={productsStorefrontApiSecondaryActionStatus}') &&
      source.includes('data-target-site-id={activeSiteId}') &&
      source.includes('data-default-collapsed="true"') &&
      source.includes('data-testid="products-storefront-api-more-actions"') &&
      source.includes('data-testid="products-storefront-api-copy-url"') &&
      source.includes('data-testid="products-storefront-api-copy-manifest"') &&
      source.includes('data-testid="products-storefront-api-export-csv"') &&
      source.includes('data-testid="products-storefront-api-csv-template"') &&
      source.indexOf('data-testid="products-storefront-api-sync-schema"') < source.indexOf('data-testid="products-storefront-api-import-csv"') &&
      source.indexOf('data-testid="products-storefront-api-import-csv"') < source.indexOf('data-testid="products-storefront-api-secondary-actions"'),
    "Products storefront API panel must lead with import/storefront/open actions while grouping URL, manifest, CSV export, and template actions behind More actions",
  );
  assert(
    source.includes('const productActionStatusId = `products-actions-status-${product.id}`;') &&
      source.includes('data-testid="products-product-card"') &&
      source.includes('data-testid="products-action-group"') &&
      source.includes('data-testid="products-action-status"') &&
      source.includes('data-action-status={productActionStatus}') &&
      source.includes('aria-label={`Actions for ${title}`}') &&
      source.includes('aria-describedby={productActionStatusId}') &&
      source.includes('data-testid="products-edit-product"') &&
      source.includes('data-testid="products-publish-product"') &&
      source.includes('data-testid="products-archive-product"') &&
      source.includes('data-testid="products-delete-product"') &&
      source.includes("data-action-state={publishDisabledReason ? 'blocked' : 'ready'}") &&
      source.includes("data-disabled-reason={deleteProductDisabledReason || undefined}") &&
      source.includes("Product actions are temporarily unavailable while Backy updates catalog data") &&
      source.includes("This product is already published") &&
      source.includes("This product is already archived"),
    "Products product cards must expose named action groups, status summaries, and explicit action-state metadata",
  );
  assert(
    ordersSource.includes('data-testid="orders-command-secondary-actions"') &&
      ordersSource.includes('data-testid="orders-command-copy-manifest"') &&
      ordersSource.includes('data-testid="orders-command-download-json"') &&
      ordersSource.includes('data-testid="orders-command-export-csv"') &&
      ordersSource.includes('data-testid="orders-command-csv-template"') &&
      ordersSource.includes('data-testid="orders-command-import-csv"') &&
      ordersSource.includes('data-testid="orders-command-products"') &&
      ordersSource.includes('data-testid="orders-command-storefront-page"') &&
      ordersSource.includes('aria-label="More order actions"') &&
      ordersSource.indexOf('New order') < ordersSource.indexOf('data-testid="orders-command-secondary-actions"'),
    "Orders command center must keep New order primary while grouping secondary order actions",
  );
  assert(
    source.includes('to="/users"') &&
      source.includes("Review users") &&
      source.includes('aria-label="Retry loading product permissions"'),
    "Products permission error state must expose user-management and retry actions",
  );
  for (const emptyStateTitle of [
    'title="No private order records yet"',
    'title="No product performance yet"',
    'title="No product automation events"',
    "title={products.length === 0 ? 'No products yet' : 'No products match this view'}",
    'title="No subscription orders yet"',
    'title="No provider catalog run recorded"',
    'title="No customer profiles yet"',
  ]) {
    assert(
      source.includes(emptyStateTitle),
      `Products route must keep shared empty state visible: ${emptyStateTitle}`,
    );
  }
  assert(
    source.includes('Save a product and run a provider sync to store checkout catalog metadata, handoff status, and provider product or price IDs.'),
    "Products provider-sync empty state must explain how catalog handoff metadata is created",
  );
  assert(
    source.includes("Customer profiles are created automatically from checkout intake and stay in the private customers collection."),
    "Products customer profiles empty state must explain checkout intake and private storage",
  );
  assert(
    source.includes("const hydratedCustomerProfileIdRef = useRef<string | null>(null);") &&
      source.includes("if (hydratedCustomerProfileIdRef.current === selectedProfileId) return;") &&
      source.includes("hydratedCustomerProfileIdRef.current = updated.id;") &&
      source.includes("setCustomerProfileDraft(customerProfileToDraft(updated));"),
    "Products customer profile editor must not wipe in-progress edits during background profile refreshes",
  );
  assert(
    source.includes("const PRODUCT_GALLERY_IMAGE_LIMIT = 12;") &&
      source.includes("galleryImageUrls.length >= PRODUCT_GALLERY_IMAGE_LIMIT") &&
      source.includes("Product galleries support up to ${PRODUCT_GALLERY_IMAGE_LIMIT} images. Remove an image before adding another.") &&
      source.includes("That image is already in this product gallery.") &&
      source.includes("const [galleryImageSubmitted, setGalleryImageSubmitted] = useState(false);") &&
      source.includes("const galleryImageInlineError = galleryImageSubmitted") &&
      source.includes("setError('Fix gallery image URL before adding.')") &&
      source.includes('data-testid="products-gallery-image-url-input"') &&
      source.includes('data-testid="products-gallery-image-url-error"') &&
      source.includes('data-testid="products-gallery-image-url-add"') &&
      source.includes("disabled={galleryImageUrls.length >= PRODUCT_GALLERY_IMAGE_LIMIT || isProductsAccessBusy || !canEditProducts}") &&
      !source.includes("disabled={!galleryImageDraft.trim() || galleryImageUrls.length >= PRODUCT_GALLERY_IMAGE_LIMIT}"),
    "Products gallery controls must enforce image caps, duplicate prevention, and reachable inline URL validation",
  );
  assert(
    source.includes("const PRODUCT_VARIANT_LIMIT = 50;") &&
      source.includes("productVariants.length >= PRODUCT_VARIANT_LIMIT") &&
      source.includes(".slice(0, PRODUCT_VARIANT_LIMIT)") &&
      source.includes("const [variantDraftSubmitted, setVariantDraftSubmitted] = useState(false);") &&
      source.includes("const [variantMatrixSubmitted, setVariantMatrixSubmitted] = useState(false);") &&
      source.includes("const variantDraftIdentityInlineError = variantDraftSubmitted && variantDraftIdentityMissing") &&
      source.includes("const optionMatrixInlineError = variantMatrixSubmitted && optionMatrixOptionsMissing") &&
      source.includes("setError('Fix product variant fields before adding.')") &&
      source.includes("setError('Fix option matrix fields before generating variants.')") &&
      source.includes('data-testid="products-variant-identity-error"') &&
      source.includes('data-testid="products-variant-add"') &&
      source.includes('data-testid="products-variant-matrix-options-error"') &&
      source.includes('data-testid="products-variant-matrix-price-error"') &&
      source.includes('data-testid="products-variant-matrix-inventory-error"') &&
      source.includes("disabled={productVariants.length >= PRODUCT_VARIANT_LIMIT || isProductsAccessBusy || !canEditProducts}") &&
      !source.includes("disabled={(!variantDraft.title.trim() && !variantDraft.option.trim()) || productVariants.length >= PRODUCT_VARIANT_LIMIT}") &&
      !source.includes("disabled={!optionMatrixDraft.options.trim() || productVariants.length >= PRODUCT_VARIANT_LIMIT || isProductsAccessBusy || !canEditProducts}"),
    "Products variant controls must enforce variant caps through a shared source limit with reachable inline validation",
  );
  assert(
    source.includes("getScheduledProductDateError") &&
      source.includes("scheduledAtMs <= Date.now()") &&
      source.includes("Choose a future publish date before scheduling this product.") &&
      source.includes("const scheduledProductInlineError = productFormSubmitted && scheduledProductDateError") &&
      source.includes("aria-invalid={Boolean(scheduledProductInlineError)}") &&
      source.includes("aria-describedby={scheduledProductInlineError ? 'products-scheduled-at-error' : undefined}") &&
      source.includes('data-testid="products-scheduled-at-input"') &&
      source.includes('data-testid="products-scheduled-at-error"'),
    "Products scheduled status must show reachable inline validation for non-future publish dates before save",
  );
  assert(
    source.includes("const [productFormSubmitted, setProductFormSubmitted] = useState(false);") &&
      source.includes("const productTitleInlineError = productFormSubmitted && !formState.title.trim()") &&
      source.includes("const productSkuInlineError = productFormSubmitted && !formState.sku.trim()") &&
      source.includes("setError('Fix product identity fields before saving.')") &&
      source.includes("<form onSubmit={saveProduct} noValidate") &&
      source.includes('data-testid="products-title-input"') &&
      source.includes('aria-describedby={productTitleInlineError ?') &&
      source.includes('data-testid="products-title-error"') &&
      source.includes('data-testid="products-sku-input"') &&
      source.includes('aria-describedby={productSkuInlineError ?') &&
      source.includes('data-testid="products-sku-error"') &&
      source.includes("disabled={isProductsAccessBusy || !canEditProducts}") &&
      !source.includes("disabled={isProductsAccessBusy || !canEditProducts || Boolean(scheduledProductDateError)}"),
    "Products editor must expose inline title/SKU/schedule validation instead of silently disabling the save action",
  );
  assert(
    source.includes("const PRODUCT_EDITOR_SECTIONS = [") &&
      source.includes("xl:max-h-[calc(100vh-2rem)]") &&
      source.includes('data-testid="products-editor-panel"') &&
      source.includes('data-testid="products-editor-sticky-actions"') &&
      source.includes('data-testid="products-editor-sticky-save"') &&
      source.includes('data-testid="products-editor-section-nav"') &&
      source.includes('aria-label="Product editor sections"') &&
      source.includes('id="products-editor-identity"') &&
      source.includes('id="products-editor-variants"') &&
      source.includes('id="products-editor-fulfillment"') &&
      source.includes('id="products-editor-subscriptions"') &&
      source.includes('id="products-editor-provider-sync"') &&
      source.includes('id="products-editor-media"') &&
      source.includes('id="products-editor-publishing"'),
    "Products editor must stay constrained with sticky save actions and section shortcuts so the side pane remains operable",
  );
  assert(
    source.includes("apiContracts: PRODUCT_API_CONTRACTS.map"),
    "Products handoff manifest must expose API response contracts for custom frontends",
  );
  assert(
    source.includes("frontendDesignCustomJs") &&
      source.includes("frontendDesignContentDocument") &&
      source.includes("frontendDesignThemeTokenRefs") &&
      source.includes("frontendDesignAnimations") &&
      source.includes("frontendDesignInteractions") &&
      source.includes("frontendDesignEditableMap") &&
      source.includes("const designEnvelope = optionalRecordFromRecord(values, 'design');") &&
      source.includes("designValue('customJs', 'frontendDesignCustomJs')") &&
      source.includes("const assets = optionalArrayOrRecordFromRecord(content, 'assets') || optionalArrayOrRecordFromRecord(metadata, 'assets');") &&
      source.includes("const animations = optionalArrayOrRecordFromRecord(content, 'animations') || optionalArrayOrRecordFromRecord(metadata, 'animations');") &&
      source.includes("const interactions = optionalArrayOrRecordFromRecord(content, 'interactions') || optionalArrayOrRecordFromRecord(metadata, 'interactions');") &&
      source.includes("const animationCount = designStateItemCount(designAnimations);") &&
      source.includes("const assetCount = designStateItemCount(designAssets);") &&
      commerceCatalogSource.includes("frontendDesignContentDocument") &&
      commerceCatalogSource.includes("frontendDesignCustomJs") &&
      commerceCatalogSource.includes("frontendDesignElements") &&
      commerceCatalogSource.includes("frontendDesignAssets") &&
      commerceCatalogSource.includes("frontendDesignAnimations") &&
      commerceCatalogSource.includes("frontendDesignEditableMap") &&
      commerceCatalogSource.includes("const designEnvelope = normalizeDesignRecord(values.design);") &&
      commerceCatalogSource.includes("designValue('customJs', 'frontendDesignCustomJs')") &&
      commerceCatalogSource.includes("const buildProductDesignReadiness = (") &&
      commerceCatalogSource.includes("export const productDesignReadinessFromValues = (") &&
      commerceCatalogSource.includes("designReadiness: buildProductDesignReadiness(design)") &&
      routeResolverSource.includes("productDesignReadinessFromValues(record.values)") &&
      repositoryRouteResolverSource.includes("productDesignReadinessFromValues(record.values)") &&
      renderPayloadSource.includes("const designReadiness = collection.slug === PRODUCT_COLLECTION_SLUG") &&
      renderPayloadSource.includes("...(designReadiness ? { designReadiness } : {})") &&
      sdkSmokeSource.includes("product design missing clean design-envelope binding hint") &&
      sdkSmokeSource.includes("partial design update wiped existing product design content document") &&
      frontendDesignContractSource.includes("frontendDesignContentDocument") &&
      frontendDesignContractSource.includes("frontendDesignThemeTokenRefs") &&
      frontendDesignContractSource.includes("frontendDesignAnimations") &&
      frontendDesignContractSource.includes("frontendDesignMetadata") &&
      source.includes('data-testid="products-frontend-template-options"') &&
      source.includes("const productsFrontendTemplateActionStatusId = 'products-frontend-template-action-status';") &&
      source.includes("const getProductFrontendTemplateCreateDisabledReason = (template: SiteFrontendDesignTemplate): string =>") &&
      source.includes("const getProductFrontendTemplateCopyDisabledReason = (): string =>") &&
      source.includes("const getProductFrontendTemplateCardActionState = (template: SiteFrontendDesignTemplate)") &&
      source.includes("const getProductFrontendTemplateCreateActionStatus = (") &&
      source.includes("const getProductFrontendTemplateCopyActionStatus = (template: SiteFrontendDesignTemplate)") &&
      source.includes('data-testid="products-frontend-template-action-status"') &&
      source.includes('data-testid={`products-frontend-template-card-${template.id}`}') &&
      source.includes("aria-describedby={productsFrontendTemplateActionStatusId}") &&
      source.includes("data-action-state={cardActionState}") &&
      source.includes("data-action-status={createActionStatus}") &&
      source.includes("data-action-state={createDisabledReason ?") &&
      source.includes("data-action-state={copyDisabledReason ?") &&
      source.includes('data-testid={`products-frontend-template-copy-${template.id}`}') &&
      source.includes("data-target-template-id={template.id}") &&
      source.includes("data-target-template-name={template.name}") &&
      source.includes("data-target-site-id={activeSiteId}") &&
      source.includes("const revealActiveTemplate = () =>") &&
      source.includes("'[data-testid^=\"products-frontend-template-card-\"]'") &&
      source.includes("'[data-action=\"products.create.frontendTemplate\"]'") &&
      source.includes("card?.scrollIntoView({ block: 'center', behavior: 'smooth' });") &&
      source.includes("createButton?.focus({ preventScroll: true });") &&
      source.includes("open={activeFrontendTemplateId ? true : undefined}") &&
      source.includes("data-default-collapsed={activeFrontendTemplateId ? 'false' : 'true'}") &&
      source.includes("data-route-revealed-template={activeFrontendTemplateId || undefined}") &&
      source.includes('data-action="products.create.frontendTemplate"') &&
      source.includes('data-action="products.copy.frontendTemplateSchema"') &&
      source.includes('data-action-route={`/products?siteId=${encodeURIComponent(activeSiteId)}&frontendTemplate=${encodeURIComponent(template.id)}`}') &&
      source.includes("templateSource: 'backy-canvas'") &&
      source.includes("focus: 'canvas'") &&
      source.includes('templateSource=backy-canvas&focus=canvas') &&
      source.includes("navigate({ to: '/pages/new', search: { siteId: activeSiteId, template: 'storefront', templateSource: 'backy-canvas', focus: 'canvas' } })") &&
      source.includes('data-testid="products-created-canvas-action"') &&
      source.includes("action: 'products.open.createdProductCanvas'") &&
      source.includes('data-action={noticeCanvasAction.action}') &&
      source.includes("Show templates") &&
      source.includes('data-testid="products-frontend-template-design-readiness"') &&
      source.includes("const designValues = buildFrontendProductTemplateValues(template, frontendDesign);") &&
      source.includes("const designReadiness = buildProductDesignReadiness(designValues);") &&
      source.includes("designReadiness,") &&
      source.includes("Template carries content, animation, and editable binding state into the created product record."),
    "Products must durably store and expose custom frontend product design state for external storefront editors",
  );
  assert(
    source.includes("productMediaAttachmentUrl") &&
      source.includes("productDownloadMediaState") &&
      source.includes("clearProductDownloadMediaState") &&
      source.includes("[productFieldKey('downloadMediaId')]: formState.downloadMediaId.trim()") &&
      source.includes("[productFieldKey('downloadMediaOrganization')]: formState.downloadMediaOrganization") &&
      source.includes('data-testid="products-download-media-binding"') &&
      source.includes('data-testid="products-download-media-clear"') &&
      source.includes("download_media_id") &&
      source.includes("downloadMediaId=${downloadMediaId ? 'present' : 'missing'}") &&
      commerceCatalogSource.includes("downloadMediaId: 'downloadmediaid'") &&
      commerceCatalogSource.includes("readProductValue(values, 'downloadMediaId')"),
    "Products digital delivery must persist stable media bindings for downloadable files and catalog readiness",
  );
  assert(
    source.includes('data-testid="products-storefront-api-details"') &&
      source.includes('data-disclosure="products-storefront-api-handoff"') &&
      source.includes('Storefront API and provider handoff') &&
      source.includes('data-testid="products-api-contracts"'),
    "Products page must keep API response contracts available behind a compact storefront/provider disclosure for custom frontends",
  );
  assert(
    source.includes('data-testid="products-provider-certification"'),
    "Products page must render the live provider certification handoff",
  );
  assert(
    source.includes("const productsProviderCertificationActionStatusId = 'products-provider-certification-action-status';") &&
      source.includes('data-testid="products-provider-certification-action-status"') &&
      source.includes('aria-label="Products provider certification actions"') &&
      source.includes('aria-describedby={productsProviderCertificationActionStatusId}') &&
      source.includes('data-action-status={productsProviderCertificationActionStatus}') &&
      source.includes('data-action-state={productsProviderCertificationCommandDisabledReason ?') &&
      source.includes('data-disabled-reason={productsProviderCertificationCommandDisabledReason || undefined}') &&
      source.includes('const productsProviderCertificationControlProps = (') &&
      source.includes('data-provider-certification-family={item.key}') &&
      source.includes('productsProviderCertificationPaymentProviderDisabledReason') &&
      source.includes('productsProviderCertificationCatalogProviderDisabledReason') &&
      source.includes("{...productsProviderCertificationControlProps('Webhook provider selector'") &&
      source.includes('Copy provider handoff available.') &&
      source.includes('Copy evidence packet available.'),
    "Products provider certification actions and family/provider controls must expose shared ready/blocked status metadata",
  );
  assert(
    commerceSmokeSource.includes("PROVIDER_CERTIFICATION_RENDERED_ONLY_MODE") &&
      commerceSmokeSource.includes("assertProductsProviderCertificationLayout") &&
      commerceSmokeSource.includes("commerce-provider-certification-rendered-only"),
    "Products commerce smoke must expose a focused rendered provider-certification mode",
  );
  assert(
    source.includes('data-testid="products-launch-readiness"') &&
      source.includes('data-testid="products-launch-readiness-copy-button"') &&
      source.includes('data-testid="products-storefront-handoff-copy-button"') &&
      source.includes('data-testid="products-sellability-impact"') &&
      source.includes('data-testid="products-sellability-impact-copy-button"') &&
      source.includes('data-testid="products-sellability-impact-blockers"') &&
      source.includes('data-testid="products-launch-readiness-action-plan"') &&
      source.includes("schemaVersion: 'backy.product-launch-readiness.v1'") &&
      source.includes("schemaVersion: 'backy.product-storefront-handoff.v1'") &&
      source.includes("schemaVersion: 'backy.product-sellability-impact.v1'") &&
      source.includes("selectedProductLaunchReadinessText") &&
      source.includes("selectedProductStorefrontHandoffText") &&
      source.includes("selectedProductSellabilityImpactText") &&
      source.includes("sellabilityImpact: buildProductSellabilityImpact") &&
      source.includes("buildProductStorefrontHandoff") &&
      source.includes("schemaVersion: 'backy.product-design-readiness.v1'") &&
      source.includes("designReadiness: buildProductDesignReadiness(design)") &&
      source.includes("designReadiness: buildProductDesignReadiness(null)") &&
      source.includes("key: 'frontend-design'") &&
      source.includes("label: 'Custom frontend design'") &&
      source.includes("contentDocument=${hasContentDocument ? 'present' : 'missing'}") &&
      source.includes("editableMap=${hasEditableMap ? 'present' : 'missing'}") &&
      source.includes("dataBindings=${hasDataBindings ? 'present' : 'missing'}") &&
      source.includes("productHandoff.providerExecution.selectedProductLaunchReadiness") &&
      source.includes("selectedProductStorefrontHandoff") &&
      source.includes("Product storefront handoff") &&
      source.includes("const design = buildProductStorefrontDesign(values)") &&
      source.includes("design,") &&
      source.includes("frontendDesignEditableMap: editableMap") &&
      source.includes("providerSync: providerSyncApi") &&
      source.includes("includesProviderSecrets: false") &&
      source.includes("includesProviderResponses: false") &&
      source.includes("includesPrivateOrders: false") &&
      source.includes("includesDigitalDeliveryUrl: false") &&
      source.includes("includesCustomerPayloads: false") &&
      source.includes("includesRawCheckoutSessions: false") &&
      source.includes("Selected-product sellability checklist for custom storefront, hosted page, and provider handoff."),
    "Products page must render copyable selected-product launch readiness and storefront handoff manifests",
  );
  assert(
    providerSyncSource.includes("buildProductStorefrontHandoff") &&
      providerSyncSource.includes('schemaVersion: "backy.product-storefront-handoff.v1"') &&
      providerSyncSource.includes('schemaVersion: "backy.product-design-readiness.v1"') &&
      providerSyncSource.includes('source: "admin-product-provider-sync-api"') &&
      providerSyncSource.includes("design: product.design || null") &&
      providerSyncSource.includes("designReadiness,") &&
      providerSyncSource.includes('key: "frontend-design"') &&
      providerSyncSource.includes("storefrontHandoff,") &&
      providerSyncSource.includes("includesProviderSecrets: false") &&
      providerSyncSource.includes("includesProviderResponses: false") &&
      providerSyncSource.includes("includesPrivateOrders: false") &&
      providerSyncSource.includes("includesCustomerPayloads: false") &&
      providerSyncSource.includes("includesDigitalDeliveryUrl: false") &&
      providerSyncSource.includes("includesRawCheckoutSessions: false"),
    "Product provider-sync API must return a bounded storefront handoff for custom admin clients",
  );
  assert(
    openapiSource.includes('CommerceProductStorefrontHandoff') &&
      openapiSource.includes('CommerceProductDesignReadiness') &&
      openapiSource.includes('"design"') &&
      openapiSource.includes('"designReadiness"') &&
      openapiSource.includes('$ref: "#/components/schemas/CommerceProductDesign"'),
    "Product storefront handoff OpenAPI schema must expose the editable frontend design envelope",
  );
  assert(
    sdkSource.includes("design?: BackyCommerceProductDesign | null") &&
      sdkSource.includes("BackyCommerceProductDesignReadiness") &&
      sdkSmokeSource.includes("commerceProductProviderSync:productDesignHandoff") &&
      sdkSmokeSource.includes("productDynamicRoute:designReadiness") &&
      sdkSmokeSource.includes("storefrontHandoff?.design?.customJs") &&
      sdkSmokeSource.includes("resolve() product dynamic route missing design readiness schema") &&
      sdkSmokeSource.includes("render() product dynamic route missing design readiness schema") &&
      sdkSmokeSource.includes("storefrontHandoff?.design?.animations") &&
      sdkSmokeSource.includes("storefrontHandoff?.design?.editableMap") &&
      sdkSmokeSource.includes("storefrontHandoff?.designReadiness?.schemaVersion") &&
      sdkSmokeSource.includes("launchReadiness?.checks?.some"),
    "SDK product provider-sync storefront handoff must type and smoke-test the editable frontend design envelope",
  );
  assert(
    source.includes('data-testid="products-subscription-action-plan"') &&
      source.includes('data-testid="products-subscription-certification"') &&
      source.includes("Lifecycle action plan") &&
      source.includes("Lifecycle certification evidence") &&
      source.includes("backy.product-subscription-action-plan-summary.v1") &&
      source.includes("backy.product-subscription-certification.v1") &&
      source.includes("launch scenarios evidenced") &&
      source.includes("subscription.actionPlan.recommendation") &&
      source.includes("subscription.actionPlan.handoffRequired"),
    "Products page must render the subscription lifecycle action plan, certification evidence, and per-subscription recommendations",
  );
  assert(
    source.includes('data-testid="products-provider-certification-evidence"') &&
      source.includes("productProviderCertificationEvidence") &&
      source.includes("certificationEvidence: productProviderCertificationEvidence") &&
      source.includes("backy.product-provider-certification-evidence.v1") &&
      source.includes("Product provider certification evidence") &&
      source.includes("Catalog publication") &&
      source.includes("Checkout settlement") &&
      source.includes("Quote adjustments") &&
      source.includes("Provider catalog sync") &&
      source.includes("Webhook settlement") &&
      source.includes("Subscription lifecycle") &&
      source.includes("Inventory automation") &&
      source.includes("Customer and performance signal") &&
      source.includes("Product provider certification evidence reports scenario names, counts, gates, and non-secret provider families only"),
    "Products page must render non-secret provider certification scenario evidence",
  );
  assert(
      source.includes('data-testid="products-provider-certification-evidence-packet"') &&
      source.includes('data-testid="products-provider-certification-evidence-packet-copy-button"') &&
      source.includes('data-testid="products-provider-certification-readiness-summary"') &&
      source.includes('data-testid="products-provider-certification-next-action"') &&
      source.includes("providerCertificationEvidencePacket") &&
      source.includes("providerCertificationEvidencePacketText") &&
      source.includes("operatorNextAction") &&
      source.includes("providerCertificationReadinessItems") &&
      source.includes("providerCertificationRuntimeGapDetail") &&
      source.includes("PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV") &&
      source.includes("PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT") &&
      source.includes("PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV") &&
      source.includes("PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV") &&
      source.includes("PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_DOCTOR_COMMAND") &&
      source.includes("[PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV, PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT]") &&
      source.includes("operatorEvidencePacket: providerCertificationEvidencePacket") &&
      source.includes("backy.commerce-provider-certification-evidence-packet.v1") &&
      source.includes("Product certification readiness summary") &&
      source.includes("Runtime credentials") &&
      source.includes("Scenario coverage") &&
      source.includes("Artifact output") &&
      source.includes("Gate command") &&
      source.includes("Required site selector") &&
      source.includes("Next operator action") &&
      source.includes("Configure live provider credentials") &&
      source.includes("Attach live scenario evidence") &&
      source.includes("Attach certification artifact") &&
      source.includes("BACKY_COMMERCE_CERTIFICATION_OUTPUT") &&
      source.includes("artifacts/backy-commerce-provider-certification.json") &&
      source.includes("Secret boundary: no commerce provider credentials, customer payloads, private order payloads, or webhook bodies are copied.") &&
      source.includes("Copy evidence packet") &&
      source.includes("Redacted operator attachment manifest") &&
      source.includes("targetInputs: PRODUCT_PROVIDER_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.targetInputs") &&
      source.includes("redactionPolicy") &&
      source.includes("includesWebhookBodies: false") &&
      source.includes("Scenario attachments") &&
      source.includes("expectedArtifacts") &&
      source.includes("captureSource"),
    "Products page must render a copyable live-provider evidence packet for selected certification families",
  );
  assert(
    source.includes("bulkUpdateCollectionRecords") &&
      source.includes("const filteredProductIds = useMemo") &&
      source.includes("const visibleIds = new Set(filteredProductIds)") &&
      source.includes("filteredProductIds.filter((productId) => !current.includes(productId))") &&
      source.includes('data-testid="products-bulk-toolbar"') &&
      source.includes("const productsBulkActionStatusId = 'products-bulk-action-status';") &&
      source.includes('const productsBulkActionStatus = [') &&
      source.includes('data-testid="products-bulk-action-status"') &&
      source.includes('aria-label="Selected product bulk actions"') &&
      source.includes('data-action-status={productsBulkActionStatus}') &&
      source.includes("data-action-state={productsBulkStatusDisabledReason ? 'blocked' : 'ready'}") &&
      source.includes("data-disabled-reason={productsBulkDeleteDisabledReason || undefined}") &&
      source.includes('data-testid="products-bulk-selection-summary"') &&
      source.includes('data-testid="products-bulk-delete-modal"') &&
      source.includes("Select all visible products") &&
      source.includes("exportSelectedProductsCsv") &&
      source.includes("Bulk actions will include"),
    "Products catalog must expose selected-row bulk publish, archive, delete, and selected CSV export controls",
  );
  assert(
    source.includes("const productDeleteConfirmActionStatusId = 'products-delete-confirm-action-status';") &&
      source.includes("const productBulkDeleteConfirmActionStatusId = 'products-bulk-delete-confirm-action-status';") &&
      source.includes('data-testid="products-delete-confirm-dialog"') &&
      source.includes('data-testid="products-delete-confirm-action-status"') &&
      source.includes('data-testid="products-delete-confirm-cancel"') &&
      source.includes('data-testid="products-delete-confirm-button"') &&
      source.includes('aria-labelledby={productDeleteConfirmTitleId}') &&
      source.includes('aria-describedby={`${productDeleteConfirmDescriptionId} ${productDeleteConfirmImpactId} ${productDeleteConfirmActionStatusId}`}') &&
      source.includes('data-action-state={productDeleteConfirmActionState}') &&
      source.includes('data-action-status={productDeleteConfirmActionStatus}') &&
      source.includes('data-disabled-reason={productDeleteConfirmDisabledReason || undefined}') &&
      source.includes("event.key !== 'Escape' || isProductsAccessBusy") &&
      source.includes('handleProductDeleteDialogKeyDown') &&
      source.includes('setPendingDeleteProduct(null)'),
    'Products single-delete confirmation must expose labelled dialog semantics, action status metadata, and Escape recovery.',
  );
  assert(
    source.includes('data-confirm-dialog-id="products-bulk-delete-confirm-dialog"') &&
      source.includes('data-testid="products-bulk-delete-confirm-action-status"') &&
      source.includes('data-testid="products-bulk-delete-confirm-cancel"') &&
      source.includes('data-testid="products-bulk-delete-confirm-button"') &&
      source.includes('aria-labelledby={productBulkDeleteConfirmTitleId}') &&
      source.includes('aria-describedby={`${productBulkDeleteConfirmDescriptionId} ${productBulkDeleteConfirmImpactId} ${productBulkDeleteConfirmActionStatusId}`}') &&
      source.includes('data-selected-product-count={selectedLoadedProducts.length}') &&
      source.includes('data-action-state={productBulkDeleteConfirmActionState}') &&
      source.includes('data-action-status={productBulkDeleteConfirmActionStatus}') &&
      source.includes('data-disabled-reason={productsBulkDeleteDisabledReason || undefined}') &&
      source.includes('setPendingBulkDeleteProducts(false)'),
    'Products bulk-delete confirmation must expose labelled dialog semantics, selected-count metadata, and cancel/Escape recovery.',
  );
  assert(
    publicOrderRouteSource.includes("firstCheckoutItemArray") &&
      publicOrderRouteSource.includes("items.length > 0") &&
      publicOrderRouteSource.includes("body.lineItems") &&
      publicOrderRouteSource.includes("body.cartItems") &&
      publicOrderRouteSource.includes("cart.items") &&
      publicOrderRouteSource.includes("body.customerEmail") &&
      publicOrderRouteSource.includes("body.email") &&
      publicOrderRouteSource.includes("firstText(record.variantSku, record.variant_sku, record.sku)") &&
      publicOrderRouteSource.includes("body.discountCode || body.couponCode || body.promoCode") &&
      publicOrderRouteSource.includes("checkoutSession.id || body.checkoutSession") &&
      publicOrderRouteSource.includes("schemaVersion: ORDER_CONTRACT_VERSION") &&
      publicOrderRouteSource.includes('"lineItems"') &&
      publicOrderRouteSource.includes('"checkoutSession.id"'),
    "Public commerce order intake must normalize common custom storefront checkout aliases",
  );
  assert(
    source.includes('data-testid="products-provider-certification-download-button"') &&
      source.includes('data-testid="products-provider-certification-copy-button"') &&
      source.includes('data-testid="products-provider-certification-command-copy-button"') &&
      source.includes('data-testid="products-provider-certification-action-status"') &&
      source.includes('data-testid="products-provider-certification-operator-details"') &&
      source.includes('data-testid="products-provider-certification-command-builder"') &&
      source.includes('data-testid="products-provider-certification-env-copy-button"') &&
      source.includes('data-testid="products-provider-certification-env-template"') &&
      source.includes('data-testid="products-provider-certification-env-template-body"') &&
      source.includes('data-testid="products-provider-certification-command-builder-copy-button"') &&
      source.includes('data-testid="products-provider-certification-site-target"') &&
      source.includes('data-testid="products-provider-certification-readiness-summary"') &&
      source.includes("providerCertificationHandoffText") &&
      source.includes("providerCertificationEnvTemplate") &&
      source.includes("catalogEvidence") &&
      source.includes("endpointEvidence") &&
      source.includes("providerRuntimeEvidence") &&
      source.includes("-backy-products-provider-certification.json") &&
      source.includes("Products provider certification handoff downloaded."),
    "Products page must expose a focused provider certification JSON export",
  );
  assert(
    source.includes("providerCertification") &&
      source.includes("schemaVersion: 'backy.commerce-provider-certification-handoff.v1'") &&
      source.includes("requiredFor: 'live-commerce-provider-launch'") &&
      source.includes("ci:commerce-provider-smoke") &&
      source.includes("ci:commerce-provider-certification") &&
      source.includes("BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:commerce-provider-certification") &&
      source.includes("buildProductProviderCertificationCommand") &&
      source.includes("buildProductProviderCertificationEnvTemplate") &&
      source.includes("operatorEnvTemplate") &&
      source.includes("backy.commerce-provider-certification-env-template.v1") &&
      source.includes("Copy env template") &&
      source.includes("operatorCommandTemplate") &&
      source.includes("products-provider-certification-payment-toggle") &&
      source.includes('data-testid="products-provider-certification-tax-provider-select"') &&
      source.includes('data-testid="products-provider-certification-discount-provider-select"') &&
      source.includes('data-testid="products-provider-certification-external-target-input"') &&
      source.includes('data-testid="products-provider-certification-doctor-toggle"') &&
      source.includes("BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER") &&
      source.includes("BACKY_COMMERCE_CERTIFY_SITE_ID") &&
      source.includes("BACKY_COMMERCE_CERTIFICATION_BASE_URL") &&
      source.includes("npm run test:commerce-provider-certification-preflight-contract") &&
      source.includes("BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1 npm run doctor:release-certification") &&
      source.includes('data-testid="products-provider-runtime-evidence"') &&
      source.includes('data-testid="products-provider-certification-runbook"') &&
      source.includes('data-testid="products-provider-certification-evidence"') &&
      source.includes("Provider secret values are never returned") &&
      source.includes("requiredInputs"),
    "Products handoff manifest must expose mock and live provider certification gates",
  );
  for (const providerLabel of [
    "Schema",
    "TaxJar",
    "Avalara",
    "EasyPost",
    "Shippo",
    "Stripe promotion codes",
    "Subscription lifecycle providers",
    "Razorpay",
    "Magento",
    "BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY",
    "BACKY_COMMERCE_TAX_PROVIDER_URL or COMMERCE_TAX_PROVIDER_URL",
    "BACKY_COMMERCE_SHIPPING_PROVIDER_URL or COMMERCE_SHIPPING_PROVIDER_URL",
    "BACKY_COMMERCE_DISCOUNT_PROVIDER_URL or COMMERCE_DISCOUNT_PROVIDER_URL",
    "BACKY_COMMERCE_PRODUCT_SYNC_URL or COMMERCE_PRODUCT_SYNC_URL",
    "BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL or COMMERCE_SUBSCRIPTION_ACTION_URL",
    "BACKY_RAZORPAY_KEY_ID/BACKY_RAZORPAY_KEY_SECRET or RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET",
    "BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET",
    "BACKY_COMMERCE_CERTIFY_CATALOG=1 with BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER",
    "BACKY_COMMERCE_CERTIFY_DISCOUNT=1 with BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER",
    "selected provider-family flags",
    "credentialed provider readiness check output",
    "Copy CI command",
    "Required inputs",
    "Product certification readiness summary",
    "Runtime credentials",
    "Artifact output",
    "BACKY_COMMERCE_CERTIFICATION_OUTPUT",
    "artifacts/backy-commerce-provider-certification.json",
    "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH",
    "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED",
  ]) {
    assert(
      source.includes(providerLabel),
      `Products certification handoff must name ${providerLabel}`,
    );
  }
  for (const schemaVersion of [
    "backy.commerce-catalog.v1",
    "backy.commerce-order.v1",
    "backy.commerce-product-sync.v1",
    "backy.product-subscription-lifecycle.v1",
    "backy.product-subscription-action.v1",
    "backy.interaction-event.v1",
  ]) {
    assert(
      source.includes(schemaVersion),
      `Products API contract handoff must include ${schemaVersion}`,
    );
  }
  assert(
    providerSyncSource.includes("publicContractJson") &&
      providerSyncSource.includes("productSyncResponse") &&
      providerSyncSource.includes("PROVIDER_SYNC_SCHEMA_VERSION") &&
      providerSyncSource.includes("export async function GET") &&
      providerSyncSource.includes("buildProductProviderCertification") &&
      providerSyncSource.includes("buildProductProviderCertificationEvidencePacket") &&
      providerSyncSource.includes("source: \"admin-product-provider-sync-api\"") &&
      providerSyncSource.includes("schemaVersion: \"backy.product-provider-certification-evidence.v1\"") &&
      providerSyncSource.includes("operatorEvidencePacket") &&
      providerSyncSource.includes("backy.commerce-provider-certification-evidence-packet.v1") &&
      providerSyncSource.includes("redactionPolicy") &&
      providerSyncSource.includes("captureSource") &&
      providerSyncSource.includes("expectedArtifacts") &&
      providerSyncSource.includes("Redacted operator attachment manifest only") &&
      providerSyncSource.includes("PRODUCT_PROVIDER_CERTIFICATION_SCENARIOS") &&
      providerSyncSource.includes("providerCertification,") &&
      providerSyncSource.includes("Product provider certification evidence reports scenario names, counts, gates, and non-secret provider families only"),
    "Product provider-sync endpoint must emit Backy contract/cache headers and provider certification evidence",
  );
  assert(
    adminContentApiSource.includes("export interface ProductProviderCertificationHandoff") &&
      adminContentApiSource.includes("providerCertification?: ProductProviderCertificationHandoff") &&
      adminContentApiSource.includes("getCommerceProductProviderSync"),
    "Admin content API must type and expose the product provider-sync certification handoff",
  );
  assert(
    providerSyncSource.includes('"etsy"') &&
      providerSyncSource.includes("executeEtsyProductSync") &&
      providerSyncSource.includes("BACKY_ETSY_ACCESS_TOKEN"),
    "Product provider-sync endpoint must keep the Etsy draft-listing adapter wired",
  );
  assert(
    providerSyncSource.includes('"magento"') &&
      providerSyncSource.includes("executeMagentoProductSync") &&
      providerSyncSource.includes("BACKY_MAGENTO_ACCESS_TOKEN"),
    "Product provider-sync endpoint must keep the Magento catalog adapter wired",
  );
  assert(
    source.includes("['etsy', 'Etsy']"),
    "Products page must expose the Etsy provider sync control",
  );
  assert(
    source.includes("['magento', 'Magento']"),
    "Products page must expose the Magento provider sync control",
  );
  assert(
    lifecycleSource.includes("publicContractJson") &&
      lifecycleSource.includes("lifecycleResponse") &&
      lifecycleSource.includes("backy.product-subscription-lifecycle.v1") &&
      lifecycleSource.includes("backy.product-subscription-certification.v1") &&
      lifecycleSource.includes("actionExecutionModes") &&
      lifecycleSource.includes("buildSubscriptionActionPlan") &&
      lifecycleSource.includes("backy.product-subscription-action-plan.v1") &&
      lifecycleSource.includes("actionPlanSummary") &&
      lifecycleSource.includes("razorpayCredentialsConfigured") &&
      lifecycleSource.includes("Settled checkout") &&
      lifecycleSource.includes("Trial ending") &&
      lifecycleSource.includes("Cancellation") &&
      lifecycleSource.includes("requiredGate: 'npm run ci:commerce-provider-certification'") &&
      lifecycleSource.includes("provider secrets, customer payloads, and raw order values stay private"),
    "Product subscription lifecycle endpoint must emit Backy contract/cache headers, action planning metadata, and certification scenario evidence",
  );
  assert(
    actionSource.includes("publicContractJson") &&
      actionSource.includes("subscriptionActionResponse") &&
      actionSource.includes("SUBSCRIPTION_ACTION_SCHEMA_VERSION"),
    "Product subscription action endpoint must emit Backy contract/cache headers",
  );
  assert(
    actionSource.includes('"razorpay-api"') &&
      actionSource.includes("executeRazorpaySubscriptionAction") &&
      actionSource.includes("BACKY_RAZORPAY_KEY_ID") &&
      actionSource.includes("BACKY_RAZORPAY_KEY_SECRET") &&
      actionSource.includes("httpFallbackActions") &&
      actionSource.includes("providerTarget"),
    "Product subscription action endpoint must keep the Razorpay subscription adapter wired",
  );
};

const assertCommerceProviderCertificationResponse = (commerce, label) => {
  const certification = commerce?.providerCertification;
  assert(
    certification,
    `${label} must expose commerce provider certification metadata: ${JSON.stringify(commerce).slice(0, 700)}`,
  );
  assert(
    certification.schemaVersion === "backy.commerce-provider-certification-handoff.v1",
    `${label} provider certification schema drifted: ${JSON.stringify(certification)}`,
  );
  assert(
    certification.status === "external-live-provider-gate",
    `${label} provider certification status drifted: ${JSON.stringify(certification)}`,
  );
  assert(
    certification.localMockGate === "ci:commerce-provider-smoke",
    `${label} provider certification missing mock gate: ${JSON.stringify(certification)}`,
  );
  assert(
    certification.liveCertificationGate === "ci:commerce-provider-certification",
    `${label} provider certification missing live gate: ${JSON.stringify(certification)}`,
  );
  assert(
    certification.requiredFor === "live-commerce-provider-launch",
    `${label} provider certification must name the live launch requirement: ${JSON.stringify(certification)}`,
  );
  assert(
    typeof certification.secretHandling === "string" &&
      certification.secretHandling.includes("Provider credentials stay in server environment/configuration"),
    `${label} provider certification must describe non-secret handling: ${JSON.stringify(certification)}`,
  );
  const operatorTemplate = certification.operatorCommandTemplate;
  assert(
    typeof operatorTemplate?.command === "string" &&
      operatorTemplate.command.includes("npm run ci:commerce-provider-certification") &&
      operatorTemplate.command.includes("BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED") &&
      operatorTemplate.command.includes("BACKY_COMMERCE_CERTIFY_SITE_ID"),
    `${label} provider certification must expose the guarded operator command template: ${JSON.stringify(certification)}`,
  );
  assert(
    typeof operatorTemplate.envTemplate === "string" &&
      operatorTemplate.envTemplate.includes("BACKY_COMMERCE_CERTIFY_SITE_ID=site-demo"),
    `${label} provider certification must expose a site-targeted env template: ${JSON.stringify(certification)}`,
  );
  assert(
    typeof certification.operatorEnvTemplate?.body === "string" &&
      certification.operatorEnvTemplate.body.includes("BACKY_COMMERCE_CERTIFY_SITE_ID=site-demo"),
    `${label} provider certification must expose a site-targeted operator env template: ${JSON.stringify(certification)}`,
  );
  assert(
    Array.isArray(operatorTemplate.providerChoices?.payment) &&
      operatorTemplate.providerChoices.payment.includes("stripe") &&
      operatorTemplate.providerChoices.payment.includes("razorpay"),
    `${label} provider certification must expose payment selector choices: ${JSON.stringify(certification)}`,
  );
  assert(
    Array.isArray(operatorTemplate.providerChoices?.tax) &&
      operatorTemplate.providerChoices.tax.includes("taxjar") &&
      operatorTemplate.providerChoices.tax.includes("avalara"),
    `${label} provider certification must expose tax selector choices: ${JSON.stringify(certification)}`,
  );
  assert(
    Array.isArray(operatorTemplate.providerChoices?.discount) &&
      operatorTemplate.providerChoices.discount.includes("stripe") &&
      operatorTemplate.providerChoices.discount.includes("http"),
    `${label} provider certification must expose discount selector choices: ${JSON.stringify(certification)}`,
  );
  assert(
    Array.isArray(operatorTemplate.requiredInputs) &&
      operatorTemplate.requiredInputs.includes("BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1") &&
      operatorTemplate.requiredInputs.includes("BACKY_COMMERCE_CERTIFY_SITE_ID") &&
      operatorTemplate.requiredInputs.includes("BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET"),
    `${label} provider certification must expose operator required input aliases: ${JSON.stringify(certification)}`,
  );
  assert(
    Array.isArray(operatorTemplate.targetInputs) &&
      operatorTemplate.targetInputs.includes("BACKY_COMMERCE_CERTIFICATION_BASE_URL") &&
      operatorTemplate.targetInputs.includes("BACKY_COMMERCE_CERTIFY_SITE_ID"),
    `${label} provider certification must expose site and external target guard inputs: ${JSON.stringify(certification)}`,
  );
  const groups = Array.isArray(certification.groups) ? certification.groups : [];
  const families = groups.map((group) => group.family);
  const providers = groups.flatMap((group) =>
    Array.isArray(group.providers) ? group.providers : [],
  );
  const requiredInputs = groups.flatMap((group) =>
    Array.isArray(group.requiredInputs) ? group.requiredInputs : [],
  );
  for (const family of [
    "Checkout and payment settlement",
    "Tax quote providers",
    "Shipping rate, label, and tracking providers",
    "Discount quote providers",
    "Catalog sync providers",
    "Subscription lifecycle providers",
    "Mock provider regression",
  ]) {
    assert(
      families.includes(family),
      `${label} provider certification missing family ${family}: ${JSON.stringify(certification)}`,
    );
  }
  for (const provider of [
    "Stripe webhooks",
    "TaxJar",
    "Avalara",
    "EasyPost",
    "Shippo",
    "Stripe promotion codes",
    "Magento",
    "Razorpay",
    "Local provider mocks",
  ]) {
    assert(
      providers.includes(provider),
      `${label} provider certification missing provider ${provider}: ${JSON.stringify(certification)}`,
    );
  }
  for (const requiredInput of [
    "BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY",
    "BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY",
    "BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code",
    "BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY",
    "BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY",
    "BACKY_COMMERCE_DISCOUNT_PROVIDER_URL or COMMERCE_DISCOUNT_PROVIDER_URL",
    "BACKY_COMMERCE_PRODUCT_SYNC_URL or COMMERCE_PRODUCT_SYNC_URL",
    "BACKY_RAZORPAY_KEY_ID/BACKY_RAZORPAY_KEY_SECRET or RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET",
    "BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL or COMMERCE_SUBSCRIPTION_ACTION_URL",
    "BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET",
  ]) {
    assert(
      requiredInputs.includes(requiredInput),
      `${label} provider certification missing required input ${requiredInput}: ${JSON.stringify(certification)}`,
    );
  }
};

const waitForExit = (childProcess, timeoutMs = 1500) =>
  new Promise((resolve) => {
    if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
      resolve(true);
      return;
    }

    const timeout = setTimeout(() => {
      childProcess.off("exit", onExit);
      resolve(false);
    }, timeoutMs);

    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };

    childProcess.once("exit", onExit);
  });

const requestApi = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...((endpoint.startsWith("/api/admin/") ||
        endpoint.includes("/events?")) &&
      apiAdminSessionToken
        ? { authorization: `Bearer ${apiAdminSessionToken}` }
        : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(
      `${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`,
    );
  }

  return payload;
};

const requestApiRaw = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...((endpoint.startsWith("/api/admin/") ||
        endpoint.includes("/events?")) &&
      apiAdminSessionToken
        ? { authorization: `Bearer ${apiAdminSessionToken}` }
        : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const commerceWebhookSignature = (body) =>
  `sha256=${createHmac("sha256", COMMERCE_WEBHOOK_SECRET).update(body, "utf8").digest("hex")}`;

const postCommerceWebhook = async (body, headers = {}) => {
  const rawBody = JSON.stringify(body);
  return requestApi(`/api/sites/${SITE_ID}/commerce/webhook`, {
    method: "POST",
    headers: {
      ...headers,
      "x-backy-webhook-signature": commerceWebhookSignature(rawBody),
    },
    body: rawBody,
  });
};

const stripeCheckoutExecutionEnabled = () => {
  const secret =
    process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || "";
  const apiBaseUrl =
    process.env.BACKY_STRIPE_API_BASE_URL ||
    process.env.STRIPE_API_BASE_URL ||
    "";
  return Boolean(secret && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const paypalSubscriptionExecutionEnabled = () => {
  const token =
    process.env.BACKY_PAYPAL_ACCESS_TOKEN ||
    process.env.PAYPAL_ACCESS_TOKEN ||
    "";
  const apiBaseUrl =
    process.env.BACKY_PAYPAL_API_BASE_URL ||
    process.env.PAYPAL_API_BASE_URL ||
    "";
  return Boolean(token && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const paddleSubscriptionExecutionEnabled = () => {
  const token =
    process.env.BACKY_PADDLE_API_KEY || process.env.PADDLE_API_KEY || "";
  const apiBaseUrl =
    process.env.BACKY_PADDLE_API_BASE_URL ||
    process.env.PADDLE_API_BASE_URL ||
    "";
  return Boolean(token && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const squareSubscriptionExecutionEnabled = () => {
  const token =
    process.env.BACKY_SQUARE_ACCESS_TOKEN ||
    process.env.SQUARE_ACCESS_TOKEN ||
    "";
  const apiBaseUrl =
    process.env.BACKY_SQUARE_API_BASE_URL ||
    process.env.SQUARE_API_BASE_URL ||
    "";
  return Boolean(token && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const adyenSubscriptionExecutionEnabled = () => {
  const key =
    process.env.BACKY_ADYEN_API_KEY || process.env.ADYEN_API_KEY || "";
  const merchant =
    process.env.BACKY_ADYEN_MERCHANT_ACCOUNT ||
    process.env.ADYEN_MERCHANT_ACCOUNT ||
    "";
  const apiBaseUrl =
    process.env.BACKY_ADYEN_RECURRING_API_BASE_URL ||
    process.env.ADYEN_RECURRING_API_BASE_URL ||
    "";
  return Boolean(key && merchant && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const mollieSubscriptionExecutionEnabled = () => {
  const key =
    process.env.BACKY_MOLLIE_API_KEY || process.env.MOLLIE_API_KEY || "";
  const apiBaseUrl =
    process.env.BACKY_MOLLIE_API_BASE_URL ||
    process.env.MOLLIE_API_BASE_URL ||
    "";
  return Boolean(key && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const razorpaySubscriptionExecutionEnabled = () => {
  const keyId =
    process.env.BACKY_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "";
  const keySecret =
    process.env.BACKY_RAZORPAY_KEY_SECRET ||
    process.env.RAZORPAY_KEY_SECRET ||
    "";
  const apiBaseUrl =
    process.env.BACKY_RAZORPAY_API_BASE_URL ||
    process.env.RAZORPAY_API_BASE_URL ||
    "";
  return Boolean(keyId && keySecret && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const paddleCatalogSyncEnabled = () => {
  const token =
    process.env.BACKY_PADDLE_API_KEY || process.env.PADDLE_API_KEY || "";
  const apiBaseUrl =
    process.env.BACKY_PADDLE_API_BASE_URL ||
    process.env.PADDLE_API_BASE_URL ||
    "";
  return Boolean(token && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const squareCatalogSyncEnabled = () => {
  const token =
    process.env.BACKY_SQUARE_ACCESS_TOKEN ||
    process.env.SQUARE_ACCESS_TOKEN ||
    "";
  const apiBaseUrl =
    process.env.BACKY_SQUARE_API_BASE_URL ||
    process.env.SQUARE_API_BASE_URL ||
    "";
  return Boolean(token && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const shopifyCatalogSyncEnabled = () => {
  const token =
    process.env.BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN ||
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
    "";
  const apiBaseUrl =
    process.env.BACKY_SHOPIFY_ADMIN_API_BASE_URL ||
    process.env.SHOPIFY_ADMIN_API_BASE_URL ||
    "";
  return Boolean(token && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const bigCommerceCatalogSyncEnabled = () => {
  const token =
    process.env.BACKY_BIGCOMMERCE_ACCESS_TOKEN ||
    process.env.BIGCOMMERCE_ACCESS_TOKEN ||
    "";
  const apiBaseUrl =
    process.env.BACKY_BIGCOMMERCE_API_BASE_URL ||
    process.env.BIGCOMMERCE_API_BASE_URL ||
    "";
  return Boolean(token && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const wooCommerceCatalogSyncEnabled = () => {
  const key =
    process.env.BACKY_WOOCOMMERCE_CONSUMER_KEY ||
    process.env.WOOCOMMERCE_CONSUMER_KEY ||
    "";
  const secret =
    process.env.BACKY_WOOCOMMERCE_CONSUMER_SECRET ||
    process.env.WOOCOMMERCE_CONSUMER_SECRET ||
    "";
  const apiBaseUrl =
    process.env.BACKY_WOOCOMMERCE_API_BASE_URL ||
    process.env.WOOCOMMERCE_API_BASE_URL ||
    "";
  return Boolean(key && secret && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const etsyCatalogSyncEnabled = () => {
  const token =
    process.env.BACKY_ETSY_ACCESS_TOKEN || process.env.ETSY_ACCESS_TOKEN || "";
  const apiKey =
    process.env.BACKY_ETSY_API_KEY || process.env.ETSY_API_KEY || "";
  const shopId =
    process.env.BACKY_ETSY_SHOP_ID || process.env.ETSY_SHOP_ID || "";
  const apiBaseUrl =
    process.env.BACKY_ETSY_API_BASE_URL ||
    process.env.ETSY_API_BASE_URL ||
    "";
  return Boolean(token && apiKey && shopId && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const magentoCatalogSyncEnabled = () => {
  const token =
    process.env.BACKY_MAGENTO_ACCESS_TOKEN ||
    process.env.MAGENTO_ACCESS_TOKEN ||
    "";
  const apiBaseUrl =
    process.env.BACKY_MAGENTO_API_BASE_URL ||
    process.env.MAGENTO_API_BASE_URL ||
    "";
  return Boolean(token && apiBaseUrl === `${STRIPE_MOCK_BASE_URL}/magento/V1`);
};

const directCatalogProviderMockEnabled = () =>
  stripeCheckoutExecutionEnabled() ||
  paddleCatalogSyncEnabled() ||
  squareCatalogSyncEnabled() ||
  shopifyCatalogSyncEnabled() ||
  bigCommerceCatalogSyncEnabled() ||
  wooCommerceCatalogSyncEnabled() ||
  etsyCatalogSyncEnabled() ||
  magentoCatalogSyncEnabled();

const httpSubscriptionExecutionEnabled = () => {
  const url =
    process.env.BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL ||
    process.env.COMMERCE_SUBSCRIPTION_ACTION_URL ||
    "";
  return url === `${COMMERCE_PROVIDER_MOCK_BASE_URL}/subscription/action`;
};

const firstClassCheckoutProviderMockEnabled = () => {
  const stripeSecret =
    process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || "";
  const stripeDiscountBaseUrl =
    process.env.BACKY_STRIPE_DISCOUNT_API_BASE_URL ||
    process.env.STRIPE_DISCOUNT_API_BASE_URL ||
    process.env.BACKY_STRIPE_API_BASE_URL ||
    process.env.STRIPE_API_BASE_URL ||
    "";
  const taxJarKey =
    process.env.BACKY_TAXJAR_API_KEY || process.env.TAXJAR_API_KEY || "";
  const taxJarBaseUrl =
    process.env.BACKY_TAXJAR_API_BASE_URL ||
    process.env.TAXJAR_API_BASE_URL ||
    "";
  const avalaraAccount =
    process.env.BACKY_AVALARA_ACCOUNT_ID ||
    process.env.AVALARA_ACCOUNT_ID ||
    "";
  const avalaraLicense =
    process.env.BACKY_AVALARA_LICENSE_KEY ||
    process.env.AVALARA_LICENSE_KEY ||
    "";
  const avalaraCompany =
    process.env.BACKY_AVALARA_COMPANY_CODE ||
    process.env.AVALARA_COMPANY_CODE ||
    "";
  const avalaraBaseUrl =
    process.env.BACKY_AVALARA_API_BASE_URL ||
    process.env.AVALARA_API_BASE_URL ||
    "";
  const easyPostKey =
    process.env.BACKY_EASYPOST_API_KEY || process.env.EASYPOST_API_KEY || "";
  const easyPostBaseUrl =
    process.env.BACKY_EASYPOST_API_BASE_URL ||
    process.env.EASYPOST_API_BASE_URL ||
    "";
  const shippoKey =
    process.env.BACKY_SHIPPO_API_KEY || process.env.SHIPPO_API_KEY || "";
  const shippoBaseUrl =
    process.env.BACKY_SHIPPO_API_BASE_URL ||
    process.env.SHIPPO_API_BASE_URL ||
    "";
  return Boolean(
    stripeSecret &&
    stripeDiscountBaseUrl === COMMERCE_PROVIDER_MOCK_BASE_URL &&
    taxJarKey &&
    taxJarBaseUrl === `${COMMERCE_PROVIDER_MOCK_BASE_URL}/v2` &&
    avalaraAccount &&
    avalaraLicense &&
    avalaraCompany &&
    avalaraBaseUrl === COMMERCE_PROVIDER_MOCK_BASE_URL &&
    easyPostKey &&
    easyPostBaseUrl === `${COMMERCE_PROVIDER_MOCK_BASE_URL}/v2` &&
    shippoKey &&
    shippoBaseUrl === COMMERCE_PROVIDER_MOCK_BASE_URL,
  );
};

const readRequestBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });

const startStripeCheckoutMock = async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body,
      form: Object.fromEntries(new URLSearchParams(body).entries()),
    });

    if (request.method === "POST" && request.url === "/v1/products") {
      const form = new URLSearchParams(body);
      const id = `prod_mock_${requests.length}`;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id,
          object: "product",
          active: form.get("active") !== "false",
          name: form.get("name"),
          description: form.get("description"),
          livemode: false,
          url: `${STRIPE_MOCK_BASE_URL}/products/${id}`,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/prices") {
      const form = new URLSearchParams(body);
      const id = `price_mock_${requests.length}`;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id,
          object: "price",
          active: true,
          currency: form.get("currency"),
          unit_amount: Number(form.get("unit_amount") || 0),
          product: form.get("product"),
          livemode: false,
        }),
      );
      return;
    }

    if (
      request.method === "POST" &&
      request.url === "/products" &&
      String(request.headers.authorization || "").startsWith("Bearer ")
    ) {
      const payload = JSON.parse(body || "{}");
      const id = `pro_mock_${requests.length}`;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: {
            id,
            type: "product",
            status: "active",
            name: payload.name,
            description: payload.description,
            tax_category: payload.tax_category,
            image_url: payload.image_url,
            custom_data: payload.custom_data,
          },
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/prices") {
      const payload = JSON.parse(body || "{}");
      const id = `pri_mock_${requests.length}`;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: {
            id,
            type: "price",
            status: "active",
            product_id: payload.product_id,
            description: payload.description,
            unit_price: payload.unit_price,
            billing_cycle: payload.billing_cycle,
            trial_period: payload.trial_period,
            custom_data: payload.custom_data,
          },
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v2/catalog/object") {
      const payload = JSON.parse(body || "{}");
      const itemId = `sq_item_mock_${requests.length}`;
      const variationId = `sq_variation_mock_${requests.length}`;
      const item = payload.object || {};
      const itemData = item.item_data || {};
      const variation = Array.isArray(itemData.variations)
        ? itemData.variations[0] || {}
        : {};
      const variationData = variation.item_variation_data || {};
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          catalog_object: {
            ...item,
            id: itemId,
            type: "ITEM",
            is_deleted: false,
            item_data: {
              ...itemData,
              variations: [
                {
                  ...variation,
                  id: variationId,
                  type: "ITEM_VARIATION",
                  is_deleted: false,
                  item_variation_data: {
                    ...variationData,
                    item_id: itemId,
                  },
                },
              ],
            },
          },
          id_mappings: [
            { client_object_id: item.id, object_id: itemId },
            { client_object_id: variation.id, object_id: variationId },
          ],
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/products.json") {
      const payload = JSON.parse(body || "{}");
      const product = payload.product || {};
      const id = `shopify_product_mock_${requests.length}`;
      const variantId = `shopify_variant_mock_${requests.length}`;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          product: {
            id,
            admin_graphql_api_id: `gid://shopify/Product/${id}`,
            title: product.title,
            handle: "smoke-product",
            status: product.status || "active",
            variants: (product.variants || []).map((variant, index) => ({
              id: index === 0 ? variantId : `${variantId}_${index}`,
              admin_graphql_api_id: `gid://shopify/ProductVariant/${index === 0 ? variantId : `${variantId}_${index}`}`,
              sku: variant.sku,
              price: variant.price,
            })),
            metafields: product.metafields || [],
          },
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/catalog/products") {
      const payload = JSON.parse(body || "{}");
      const productId = `bigcommerce_product_mock_${requests.length}`;
      const variantId = `bigcommerce_variant_mock_${requests.length}`;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: {
            id: productId,
            name: payload.name,
            type: payload.type,
            sku: payload.sku,
            price: payload.price,
            is_visible: payload.is_visible,
            custom_fields: payload.custom_fields || [],
            variants: (payload.variants || []).map((variant, index) => ({
              id: index === 0 ? variantId : `${variantId}_${index}`,
              sku: variant.sku,
              price: variant.price,
            })),
          },
        }),
      );
      return;
    }

    const etsyListingMatch = request.url.match(/^\/shops\/([^/]+)\/listings$/);
    if (request.method === "POST" && etsyListingMatch) {
      const form = new URLSearchParams(body);
      const id = `etsy_listing_mock_${requests.length}`;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          listing_id: id,
          state: "draft",
          title: form.get("title"),
          description: form.get("description"),
          quantity: Number(form.get("quantity") || 0),
          price: {
            amount: Math.round(Number(form.get("price") || 0) * 100),
            divisor: 100,
            currency_code: "USD",
          },
          url: `${STRIPE_MOCK_BASE_URL}/listing/${id}`,
          taxonomy_id: Number(form.get("taxonomy_id") || 0),
          shop_id: etsyListingMatch[1],
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/magento/V1/products") {
      const payload = JSON.parse(body || "{}");
      const product = payload.product || {};
      const id = `magento_product_mock_${requests.length}`;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id,
          sku: product.sku,
          name: product.name,
          price: product.price,
          status: product.status,
          type_id: product.type_id,
          custom_attributes: product.custom_attributes || [],
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/products") {
      const payload = JSON.parse(body || "{}");
      const id =
        payload.type === "variable"
          ? `woocommerce_variable_mock_${requests.length}`
          : `woocommerce_product_mock_${requests.length}`;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id,
          name: payload.name,
          type: payload.type,
          status: payload.status,
          sku: payload.sku,
          price: payload.regular_price || payload.price || "49.00",
          permalink: `${STRIPE_MOCK_BASE_URL}/product/${id}`,
          meta_data: payload.meta_data || [],
        }),
      );
      return;
    }

    const wooCommerceVariationMatch = request.url.match(
      /^\/products\/([^/]+)\/variations$/,
    );
    if (request.method === "POST" && wooCommerceVariationMatch) {
      const payload = JSON.parse(body || "{}");
      const id = `woocommerce_variation_mock_${requests.length}`;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id,
          sku: payload.sku,
          price: payload.regular_price,
          stock_quantity: payload.stock_quantity,
          attributes: payload.attributes || [],
        }),
      );
      return;
    }

    const subscriptionMatch = request.url.match(
      /^\/v1\/subscriptions\/([^/]+)(?:\/resume)?$/,
    );
    if (
      subscriptionMatch &&
      (request.method === "POST" || request.method === "DELETE")
    ) {
      const subscriptionId = decodeURIComponent(subscriptionMatch[1]);
      const isResume = request.url.endsWith("/resume");
      const form = new URLSearchParams(body);
      const status =
        request.method === "DELETE"
          ? "canceled"
          : isResume
            ? "active"
            : form.has("pause_collection[behavior]")
              ? "paused"
              : "active";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: subscriptionId,
          object: "subscription",
          status,
          cancel_at_period_end: false,
          canceled_at:
            request.method === "DELETE" ? Math.floor(Date.now() / 1000) : null,
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          pause_collection:
            status === "paused"
              ? { behavior: form.get("pause_collection[behavior]") || "void" }
              : null,
        }),
      );
      return;
    }

    const paypalSubscriptionMatch = request.url.match(
      /^\/v1\/billing\/subscriptions\/([^/]+)\/(suspend|activate|cancel)$/,
    );
    if (paypalSubscriptionMatch && request.method === "POST") {
      response.writeHead(204, { "content-type": "application/json" });
      response.end();
      return;
    }

    const paddleSubscriptionMatch = request.url.match(
      /^\/subscriptions\/([^/]+)\/(pause|resume|cancel)$/,
    );
    if (paddleSubscriptionMatch && request.method === "POST") {
      const subscriptionId = decodeURIComponent(paddleSubscriptionMatch[1]);
      const action = paddleSubscriptionMatch[2];
      const payload = JSON.parse(body || "{}");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: {
            id: subscriptionId,
            status:
              action === "pause"
                ? "paused"
                : action === "resume"
                  ? "active"
                  : "canceled",
            currency_code: "USD",
            next_billed_at:
              action === "cancel"
                ? null
                : new Date(Date.now() + 86400000).toISOString(),
            paused_at: action === "pause" ? new Date().toISOString() : null,
            canceled_at: action === "cancel" ? new Date().toISOString() : null,
            scheduled_change: {
              action,
              effective_at:
                payload.effective_from === "next_billing_period"
                  ? new Date(Date.now() + 86400000).toISOString()
                  : new Date().toISOString(),
            },
          },
        }),
      );
      return;
    }

    const squareSubscriptionMatch = request.url.match(
      /^\/v2\/subscriptions\/([^/]+)\/(pause|resume|cancel)$/,
    );
    if (squareSubscriptionMatch && request.method === "POST") {
      const subscriptionId = decodeURIComponent(squareSubscriptionMatch[1]);
      const action = squareSubscriptionMatch[2];
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          subscription: {
            id: subscriptionId,
            status:
              action === "pause"
                ? "PAUSED"
                : action === "resume"
                  ? "ACTIVE"
                  : "CANCELED",
            version: 3,
            start_date: "2026-05-16",
            canceled_date: action === "cancel" ? "2026-05-16" : null,
            paid_until_date: "2026-06-16",
            timezone: "UTC",
          },
          actions: [
            {
              id: `sq_subscription_action_${requests.length}`,
              type: action.toUpperCase(),
              effective_date: "2026-05-16",
            },
          ],
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/disable") {
      const payload = JSON.parse(body || "{}");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          response: "[detail-successfully-disabled]",
          merchantAccount: payload.merchantAccount,
          shopperReference: payload.shopperReference,
          recurringDetailReference:
            payload.selectedRecurringDetailReference || "ALL",
          pspReference: `adyen_disable_${requests.length}`,
        }),
      );
      return;
    }

    const mollieSubscriptionMatch = request.url.match(
      /^\/customers\/([^/]+)\/subscriptions\/([^/]+)$/,
    );
    if (mollieSubscriptionMatch && request.method === "DELETE") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: decodeURIComponent(mollieSubscriptionMatch[2]),
          customerId: decodeURIComponent(mollieSubscriptionMatch[1]),
          status: "canceled",
          mode: "test",
          description: "Backy smoke subscription",
          canceledAt: new Date().toISOString(),
        }),
      );
      return;
    }

    const razorpaySubscriptionMatch = request.url.match(
      /^\/v1\/subscriptions\/([^/]+)\/(pause|resume|cancel)$/,
    );
    if (razorpaySubscriptionMatch && request.method === "POST") {
      const subscriptionId = decodeURIComponent(razorpaySubscriptionMatch[1]);
      const action = razorpaySubscriptionMatch[2];
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: subscriptionId,
          entity: "subscription",
          status:
            action === "pause"
              ? "paused"
              : action === "resume"
                ? "active"
                : "cancelled",
          plan_id: "plan_backy_smoke",
          current_start: Math.floor(Date.now() / 1000),
          current_end: Math.floor(Date.now() / 1000) + 86400,
          ended_at:
            action === "cancel" ? Math.floor(Date.now() / 1000) : null,
          paid_count: 1,
          remaining_count: action === "cancel" ? 0 : 11,
        }),
      );
      return;
    }

    if (request.method !== "POST" || request.url !== "/v1/checkout/sessions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Not found" } }));
      return;
    }

    const form = new URLSearchParams(body);
    const id = `cs_mock_${requests.length}`;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id,
        object: "checkout.session",
        url: `${STRIPE_MOCK_BASE_URL}/checkout/${id}`,
        status: "open",
        payment_status: "unpaid",
        livemode: false,
        client_reference_id: form.get("client_reference_id"),
        metadata: {
          siteId: form.get("metadata[siteId]"),
          orderNumber: form.get("metadata[orderNumber]"),
          orderSlug: form.get("metadata[orderSlug]"),
          requestId: form.get("metadata[requestId]"),
        },
      }),
    );
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(STRIPE_MOCK_PORT, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const startCommerceProviderMock = async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");
    const quote = payload.quote || {};
    const checkout = payload.checkout || {};
    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body,
      payload,
    });

    if (request.method === "POST" && request.url === "/catalog/products") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: `http_product_${requests.length}`,
          productId: `http_product_${requests.length}`,
          priceId: `http_price_${requests.length}`,
          reference: `provider_catalog_${requests.length}`,
          status: "synced",
          url: `${COMMERCE_PROVIDER_MOCK_BASE_URL}/catalog/products/${payload.product?.slug || payload.product?.id || requests.length}`,
          product: {
            id: `http_product_${requests.length}`,
            name: payload.product?.title,
            active: payload.product?.status !== "archived",
            url: `${COMMERCE_PROVIDER_MOCK_BASE_URL}/catalog/products/${payload.product?.slug || payload.product?.id || requests.length}`,
          },
          price: {
            id: `http_price_${requests.length}`,
            currency: String(payload.product?.currency || "USD").toLowerCase(),
            unitAmount: Math.round(Number(payload.product?.price || 0) * 100),
          },
          requestId: payload.requestId,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/subscription/action") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: `http_subscription_action_${requests.length}`,
          actionId: `http_subscription_action_${requests.length}`,
          status: "succeeded",
          provider: payload.provider || "generic-http",
          reference: payload.subscription?.reference,
          message: `${payload.action || "action"} accepted`,
          nextStatus:
            payload.action === "pause"
              ? "paused"
              : payload.action === "resume"
                ? "active"
                : "cancelled",
          requestId: payload.idempotencyKey,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v2/taxes") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          tax: {
            amount_to_collect: 8.25,
            taxable_amount: payload.amount,
            rate: 0.084,
            transaction_reference_id: `taxjar_checkout_${requests.length}`,
          },
        }),
      );
      return;
    }

    if (
      request.method === "POST" &&
      request.url === "/api/v2/transactions/create"
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: `avalara_checkout_${requests.length}`,
          code: `avalara_checkout_${requests.length}`,
          totalTaxCalculated: 6.4,
          lines: [
            {
              lineNumber: "1",
              taxCalculated: 6.4,
              provider: "avalara",
            },
          ],
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v2/shipments") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: `easypost_checkout_${requests.length}`,
          rates: [
            {
              id: "rate_easy_ground",
              carrier: "USPS",
              service: "Ground",
              rate: "11.40",
            },
            {
              id: "rate_easy_express",
              carrier: "USPS",
              service: "Express",
              rate: "16.90",
            },
          ],
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/shipments/") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          object_id: `shippo_checkout_${requests.length}`,
          rates: [
            {
              object_id: "rate_shippo_ground",
              provider: "ShippoMock",
              servicelevel: {
                token: "ground",
                name: "Ground",
              },
              amount: "12.30",
            },
            {
              object_id: "rate_shippo_express",
              provider: "ShippoMock",
              servicelevel: {
                token: "express",
                name: "Express",
              },
              amount: "18.10",
            },
          ],
        }),
      );
      return;
    }

    if (
      request.method === "GET" &&
      request.url?.startsWith("/v1/promotion_codes?")
    ) {
      const url = new URL(request.url, COMMERCE_PROVIDER_MOCK_BASE_URL);
      const code = String(url.searchParams.get("code") || "").toUpperCase();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data:
            code === "SMOKE10"
              ? [
                  {
                    id: "promo_checkout_smoke10",
                    code,
                    coupon: {
                      id: "coupon_checkout_20",
                      percent_off: 20,
                      currency: "usd",
                    },
                  },
                ]
              : [],
        }),
      );
      return;
    }

    if (request.method !== "POST" || !request.url?.startsWith("/quote/")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Not found" } }));
      return;
    }

    const kind = request.url.split("/").pop();
    const discountAmount = checkout.discountCode ? 13.25 : 0;
    const fixedAmounts = {
      tax: 7.75,
      shipping: 9.5,
      discount: discountAmount,
    };
    const amount = fixedAmounts[kind];
    if (typeof amount !== "number") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: { message: "Unknown provider kind" } }),
      );
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        [`${kind}Amount`]: amount,
        reference: `provider_${kind}_${requests.length}`,
        lines: [
          {
            provider: "commerce-smoke-http",
            kind,
            subtotal: quote.subtotal,
            amount,
          },
        ],
      }),
    );
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(COMMERCE_PROVIDER_MOCK_PORT, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const loginAdminApi = async () => {
  const login = (twoFactorCode) =>
    fetch(`${API_BASE_URL}/api/admin/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "admin@backy.io",
        password: process.env.BACKY_ADMIN_DEMO_PASSWORD || "admin123",
        ...(twoFactorCode ? { twoFactorCode } : {}),
      }),
    });

  let response = await login();
  let payload = await response.json().catch(() => ({}));
  const smokeMfaCode =
    process.env.BACKY_COMMERCE_SMOKE_MFA_CODE ||
    process.env.BACKY_ADMIN_MFA_CODE ||
    process.env.BACKY_ADMIN_2FA_CODE ||
    "backy-dev-mfa";
  if (!response.ok && payload.error?.code === "MFA_REQUIRED" && smokeMfaCode) {
    response = await login(smokeMfaCode);
    payload = await response.json().catch(() => ({}));
  }

  if (
    !response.ok ||
    payload.success === false ||
    !payload.data?.session?.token
  ) {
    throw new Error(
      `Unable to create API admin session: ${JSON.stringify(payload).slice(0, 500)}`,
    );
  }

  apiAdminSessionToken = payload.data.session.token;
  return payload.data;
};

const getFrontendDesign = async () => {
  const payload = await requestApi(
    `/api/admin/sites/${SITE_ID}/frontend-design`,
  );
  const frontendDesign = payload.data?.frontendDesign;
  assert(
    frontendDesign?.schemaVersion === "backy.frontend-design.v1",
    `Unexpected frontend design response: ${JSON.stringify(payload).slice(0, 500)}`,
  );
  return frontendDesign;
};

const patchFrontendDesign = async (frontendDesign) => {
  const payload = await requestApi(
    `/api/admin/sites/${SITE_ID}/frontend-design`,
    {
      method: "PATCH",
      body: JSON.stringify({ frontendDesign }),
    },
  );
  const updated = payload.data?.frontendDesign;
  assert(
    updated?.schemaVersion === "backy.frontend-design.v1",
    `Patch did not return frontend design: ${JSON.stringify(payload).slice(0, 500)}`,
  );
  return updated;
};

const getSettings = async () => {
  const payload = await requestApi("/api/admin/settings");
  const settings = payload.data?.settings;
  assert(
    settings?.integrations,
    `Settings response did not include integrations: ${JSON.stringify(payload).slice(0, 500)}`,
  );
  return JSON.parse(JSON.stringify(settings));
};

const getSite = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}`);
  const site = payload.data?.site || payload.site;
  assert(
    site?.id,
    `Site response did not include a site: ${JSON.stringify(payload).slice(0, 500)}`,
  );
  return JSON.parse(JSON.stringify(site));
};

const patchSite = async (input) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return payload.data?.site || payload.site;
};

const patchSettingsFromSnapshot = async (settings) => {
  const payload = await requestApi("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify({
      deliveryMode: settings.deliveryMode,
      auth: settings.auth,
      storage: settings.storage,
      integrations: settings.integrations,
    }),
  });
  return payload.data?.settings;
};

const enableCommercePricingSettings = async (settings) => {
  const next = JSON.parse(JSON.stringify(settings));
  next.integrations = {
    ...(next.integrations || {}),
    commerce: {
      ...(next.integrations?.commerce || {}),
      mode: "checkout-provider",
      paymentProvider: "manual",
      providerMode: "test",
      checkoutSuccessPath: "/checkout/success",
      checkoutCancelPath: "/checkout/cancel",
      providerWebhookUrl: "https://hooks.example.com/backy-commerce-smoke",
      providerWebhookSecretId: COMMERCE_WEBHOOK_SECRET_REFERENCE,
      providerWebhookEvents:
        "checkout.session.completed,charge.refunded,payment_intent.payment_failed,invoice.payment_succeeded,customer.subscription.updated,customer.subscription.paused,customer.subscription.resumed,customer.subscription.trial_will_end,customer.subscription.deleted",
      webhookEventsEnabled: true,
      reconciliationMode: "webhook",
      taxEnabled: true,
      shippingEnabled: true,
      discountsEnabled: true,
      taxProvider: "http",
      taxProviderUrl: `${COMMERCE_PROVIDER_MOCK_BASE_URL}/quote/tax`,
      shippingProvider: "http",
      shippingProviderUrl: `${COMMERCE_PROVIDER_MOCK_BASE_URL}/quote/shipping`,
      discountProvider: "http",
      discountProviderUrl: `${COMMERCE_PROVIDER_MOCK_BASE_URL}/quote/discount`,
      catalogSyncProvider: "http",
      catalogSyncProviderUrl: `${COMMERCE_PROVIDER_MOCK_BASE_URL}/catalog/products`,
      taxRatePercent: 10,
      digitalTaxRatePercent: 5,
      shippingBaseAmount: 12,
      shippingWeightRate: 2,
      discountPercent: 12,
    },
    notifications: {
      ...(next.integrations?.notifications || {}),
      digestFrequency: "instant",
      email: {
        ...(next.integrations?.notifications?.email || {}),
        orderCreated: true,
        productLowStock: true,
        recipient: "commerce-ops@example.com",
      },
    },
  };
  return patchSettingsFromSnapshot(next);
};

const providerAddressRecord = {
  name: "Backy Commerce Smoke",
  street: "100 Test Street",
  city: "New York",
  state: "NY",
  zip: "10001",
  country: "US",
};

const providerParcelRecord = {
  length: 8,
  width: 6,
  height: 4,
  weight: 12,
};

const enableFirstClassCheckoutProviderSettings = async ({
  taxProvider,
  shippingProvider,
}) => {
  const current = await getSettings();
  const next = JSON.parse(JSON.stringify(current));
  next.integrations = {
    ...(next.integrations || {}),
    commerce: {
      ...(next.integrations?.commerce || {}),
      mode: "checkout-provider",
      paymentProvider: "manual",
      providerMode: "test",
      checkoutSuccessPath: "/checkout/success",
      checkoutCancelPath: "/checkout/cancel",
      taxEnabled: true,
      shippingEnabled: true,
      discountsEnabled: true,
      taxProvider,
      taxProviderUrl: "",
      shippingProvider,
      shippingProviderUrl: "",
      discountProvider: "stripe",
      discountProviderUrl: "",
      shippingOriginAddress: JSON.stringify(providerAddressRecord),
      shippingDestinationAddress: JSON.stringify(providerAddressRecord),
      shippingDefaultParcel: JSON.stringify(providerParcelRecord),
      shippingDefaultCarrier: "",
      shippingDefaultServiceLevel: "",
      shippingDefaultRateId: "",
      taxRatePercent: 10,
      digitalTaxRatePercent: 5,
      shippingBaseAmount: 12,
      shippingWeightRate: 2,
      discountPercent: 12,
    },
  };
  return patchSettingsFromSnapshot(next);
};

const enableStripeCommerceSettings = async () => {
  const current = await getSettings();
  const next = JSON.parse(JSON.stringify(current));
  next.integrations = {
    ...(next.integrations || {}),
    commerce: {
      ...(next.integrations?.commerce || {}),
      mode: "checkout-provider",
      paymentProvider: "stripe",
      providerMode: "test",
      checkoutSuccessPath: "/checkout/success",
      checkoutCancelPath: "/checkout/cancel",
      providerWebhookUrl: "https://hooks.example.com/backy-commerce-smoke",
      providerWebhookSecretId: COMMERCE_WEBHOOK_SECRET_REFERENCE,
      providerWebhookEvents:
        "checkout.session.completed,charge.refunded,payment_intent.payment_failed,invoice.payment_succeeded,customer.subscription.updated,customer.subscription.paused,customer.subscription.resumed,customer.subscription.trial_will_end,customer.subscription.deleted",
      webhookEventsEnabled: true,
      reconciliationMode: "webhook",
      taxEnabled: false,
      shippingEnabled: false,
      discountsEnabled: false,
      taxRatePercent: 0,
      digitalTaxRatePercent: 0,
      shippingBaseAmount: 0,
      shippingWeightRate: 0,
      discountPercent: 0,
    },
  };
  return patchSettingsFromSnapshot(next);
};

const smokeFrontendDesignContract = () => ({
  schemaVersion: "backy.frontend-design.v1",
  status: "synced",
  source: {
    type: "custom-frontend",
    label: "Smoke commerce frontend",
    url: "https://example.com/smoke-commerce-frontend",
    repository: "example/backy-smoke-commerce-frontend",
    branch: "main",
  },
  tokens: {
    colors: {
      primary: "#0f766e",
      accent: "#f59e0b",
    },
    fonts: {
      heading: "Inter",
      body: "Inter",
    },
    customCss: ":root { --backy-smoke-commerce-primary: #0f766e; }",
  },
  chrome: {
    header: {
      component: "SmokeCommerceHeader",
      source: "site.navigation.primary",
    },
    navigation: {
      component: "SmokeCommerceNavigation",
      source: "site.navigation.primary",
    },
    footer: {
      component: "SmokeCommerceFooter",
      source: "site.navigation.footer",
    },
  },
  templates: [
    {
      id: FRONTEND_PRODUCT_TEMPLATE_ID,
      type: "product",
      name: FRONTEND_PRODUCT_TEMPLATE_NAME,
      routePattern: "/products/smoke-contract-product",
      description:
        "Frontend contract product template used by the commerce smoke.",
      content: {
        title: "Smoke frontend product",
        slug: "smoke-frontend-product",
        sku: "SMOKE-FRONTEND-PRODUCT",
        price: 39,
        compareAtPrice: 59,
        currency: "USD",
        inventory: 11,
        lowStockThreshold: 3,
        inventoryPolicy: "deny",
        productType: "physical",
        checkoutUrl: "https://checkout.example.com/smoke-frontend-product",
        shippingRequired: true,
        shippingProfile: "standard-box",
        weight: 1.25,
        taxClass: "standard",
        discountCode: "FRONTEND10",
        returnPolicy:
          "Frontend template products allow returns within 30 days.",
        imageUrl:
          "https://images.unsplash.com/photo-1498050108023-c5249f4df085",
        galleryImages: [
          "https://images.unsplash.com/photo-1498050108023-c5249f4df085",
        ],
        category: "Frontend templates",
        tags: ["frontend-design", "commerce"],
        vendor: "Backy",
        description: "A product seeded from a custom frontend design contract.",
        seoTitle: "Smoke frontend product | Backy",
        featured: true,
        taxable: true,
        customCSS: ".smoke-product-hero { color: var(--backy-smoke-commerce-primary); }",
        customJS: "window.__backySmokeProduct = true;",
        canvasSize: {
          width: 1440,
          height: 960,
        },
        themeTokenRefs: {
          ctaColor: "colors.primary",
        },
        assets: {
          hero: {
            id: "smoke-product-hero-asset",
            kind: "image",
            role: "hero",
          },
        },
        animations: {
          intro: {
            id: "smoke-product-intro",
            trigger: "load",
            target: "smoke-product-hero",
            timeline: ["fade-up", "cta-pop"],
          },
        },
        interactions: {
          hoverPreview: {
            trigger: "hover",
            target: "smoke-product-card",
            action: "preview",
          },
        },
        dataBindings: {
          title: {
            source: "product.title",
          },
        },
        editableMap: {
          "product.title": {
            elementId: "smoke-product-title",
            targetPath: "props.content",
          },
        },
        seo: {
          title: "Smoke frontend product | Backy",
        },
        metadata: {
          templateKind: "product-detail",
          animationTimeline: "smoke-product-intro",
        },
        elements: [
          {
            id: "smoke-product-hero",
            type: "section",
            animation: {
              preset: "fade-up",
              durationMs: 420,
            },
            children: [
              {
                id: "smoke-product-title",
                type: "heading",
                props: {
                  binding: "product.title",
                },
              },
            ],
          },
        ],
        contentDocument: {
          schemaVersion: "backy.content.v1",
          canvasSize: {
            width: 1440,
            height: 960,
          },
          elements: [
            {
              id: "smoke-product-hero",
              type: "section",
              animation: {
                preset: "fade-up",
                durationMs: 420,
              },
            },
          ],
          editableMap: {
            "product.title": {
              elementId: "smoke-product-title",
              targetPath: "props.content",
            },
          },
          metadata: {
            templateKind: "product-detail",
          },
        },
      },
      bindingHints: [
        { role: "product.title", binding: "product.title" },
        { role: "product.price", binding: "product.price" },
        { role: "product.media", binding: "product.imageUrl" },
      ],
    },
  ],
  editableMap: [
    {
      selector: '[data-backy-role="product-card"]',
      role: "product.card",
      binding: "product",
      fields: ["title", "price", "imageUrl", "checkoutUrl"],
    },
  ],
  notes:
    "Temporary contract for validating product creation from custom frontend templates.",
});

const listCollections = async () => {
  const payload = await requestApi(
    `/api/admin/sites/${SITE_ID}/collections?limit=200`,
  );
  return payload.data?.collections || [];
};

const findCollection = async (slug) => {
  const collections = await listCollections();
  return collections.find((collection) => collection.slug === slug) || null;
};

const snapshotCollection = (collection) =>
  collection
    ? JSON.parse(
        JSON.stringify({
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
          description: collection.description,
          status: collection.status,
          fields: (collection.fields || []).map(sanitizeSchemaField),
          permissions: collection.permissions || {},
          routePattern: collection.routePattern || null,
          listRoutePattern: collection.listRoutePattern || null,
        }),
      )
    : null;

const restoreCollection = async (snapshot, currentCollection) => {
  if (snapshot) {
    await requestApi(`/api/admin/sites/${SITE_ID}/collections/${snapshot.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: snapshot.name,
        slug: snapshot.slug,
        description: snapshot.description,
        status: snapshot.status,
        fields: (snapshot.fields || []).map(sanitizeSchemaField),
        permissions: snapshot.permissions,
        routePattern: snapshot.routePattern,
        listRoutePattern: snapshot.listRoutePattern,
      }),
    });
    return;
  }

  if (currentCollection?.id) {
    await requestApi(
      `/api/admin/sites/${SITE_ID}/collections/${currentCollection.id}`,
      {
        method: "DELETE",
      },
    );
  }
};

const updateCollectionPermissions = async (collection, permissions) => {
  assert(
    collection?.id,
    `Cannot update permissions for missing collection: ${JSON.stringify(collection)}`,
  );
  const payload = await requestApi(
    `/api/admin/sites/${SITE_ID}/collections/${collection.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ permissions }),
    },
  );

  return payload.data?.collection || payload.data || payload.collection;
};

const assertOrderIntakeReadinessRequiresPrivateOrders = async (
  ordersCollection,
) => {
  assert(
    ordersCollection?.id,
    "Orders collection was not available for order intake readiness check",
  );
  const originalPermissions = {
    publicRead: false,
    publicCreate: false,
    publicUpdate: false,
    publicDelete: false,
    ...(ordersCollection.permissions || {}),
  };
  const exposedUpdatePermissions = {
    ...originalPermissions,
    publicRead: false,
    publicCreate: false,
    publicUpdate: true,
    publicDelete: false,
  };

  try {
    const orderReadinessPayload = await requestApi(
      `/api/sites/${SITE_ID}/commerce/orders`,
    );
    assertCommerceProviderCertificationResponse(
      orderReadinessPayload.data?.commerce || orderReadinessPayload.commerce,
      "Public order contract",
    );

    await updateCollectionPermissions(
      ordersCollection,
      exposedUpdatePermissions,
    );

    const catalogPayload = await requestApi(
      `/api/sites/${SITE_ID}/commerce/catalog?limit=1`,
    );
    const catalogCommerce =
      catalogPayload.data?.commerce || catalogPayload.commerce;
    assertCommerceProviderCertificationResponse(
      catalogCommerce,
      "Public catalog contract",
    );
    assert(
      catalogCommerce?.capabilities?.catalog === true,
      `Catalog capability should remain available: ${JSON.stringify(catalogCommerce)}`,
    );
    assert(
      catalogCommerce.capabilities.orderIntake === false,
      `Catalog advertised order intake while orders.publicUpdate was enabled: ${JSON.stringify(catalogCommerce)}`,
    );

    const manifestPayload = await requestApi(`/api/sites/${SITE_ID}/manifest`);
    const manifestCommerce =
      manifestPayload.data?.modules?.commerce ||
      manifestPayload.data?.site?.commerce ||
      manifestPayload.site?.commerce ||
      manifestPayload.data?.commerce ||
      manifestPayload.commerce ||
      (typeof manifestPayload.data?.capabilities?.commerceOrderIntake ===
      "boolean"
        ? {
            capabilities: {
              orderIntake:
                manifestPayload.data.capabilities.commerceOrderIntake,
            },
          }
        : undefined);
    assertCommerceProviderCertificationResponse(
      manifestCommerce,
      "Public manifest commerce module",
    );
    assert(
      manifestCommerce?.capabilities?.orderIntake === false,
      `Manifest advertised order intake while orders.publicUpdate was enabled: ${JSON.stringify(manifestCommerce)}`,
    );

    const orderContractResponse = await fetch(
      `${API_BASE_URL}/api/sites/${SITE_ID}/commerce/orders`,
    );
    const orderContractPayload = await orderContractResponse
      .json()
      .catch(() => ({}));
    assert(
      orderContractResponse.status === 409,
      `Order contract should reject public order collection access: ${orderContractResponse.status} ${JSON.stringify(orderContractPayload)}`,
    );
    assert(
      orderContractPayload?.error?.code === "ORDER_QUEUE_NOT_PRIVATE",
      `Order contract returned wrong private queue error: ${JSON.stringify(orderContractPayload)}`,
    );
  } finally {
    await updateCollectionPermissions(ordersCollection, originalPermissions);
  }

  const restored = await findCollection(ORDERS_COLLECTION_SLUG);
  assert(
    restored?.permissions?.publicRead === originalPermissions.publicRead &&
      restored?.permissions?.publicCreate ===
        originalPermissions.publicCreate &&
      restored?.permissions?.publicUpdate ===
        originalPermissions.publicUpdate &&
      restored?.permissions?.publicDelete === originalPermissions.publicDelete,
    `Orders permissions were not restored after readiness check: ${JSON.stringify(restored?.permissions)}`,
  );

  return restored;
};

const mergeSchemaFields = (currentFields = [], requiredFields = []) => {
  const currentByKey = new Map(
    currentFields.map((field) => [field.key, field]),
  );
  const requiredKeys = new Set(requiredFields.map((field) => field.key));
  const mergedRequired = requiredFields.map((field) =>
    sanitizeSchemaField({
      ...(currentByKey.get(field.key) || {}),
      ...field,
      sortOrder: field.sortOrder,
    }),
  );
  const customFields = currentFields.filter(
    (field) => !requiredKeys.has(field.key),
  );
  return [...mergedRequired, ...customFields].sort(
    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0),
  );
};

const sanitizeSchemaField = (field) => {
  const nextField = { ...field };
  if (!["select", "tags"].includes(nextField.type)) {
    delete nextField.options;
  }
  return nextField;
};

const upsertCollectionSchema = async ({
  slug,
  name,
  description,
  listRoutePattern,
  routePattern,
  fields,
  permissions,
}) => {
  const current = await findCollection(slug);
  const body = current
    ? {
        name: current.name || name,
        slug,
        description: current.description || description,
        status: "published",
        listRoutePattern: current.listRoutePattern || listRoutePattern,
        routePattern: current.routePattern || routePattern,
        fields: mergeSchemaFields(current.fields || [], fields),
        permissions: {
          ...(current.permissions || {}),
          ...permissions,
        },
      }
    : {
        name,
        slug,
        description,
        status: "published",
        listRoutePattern,
        routePattern,
        fields,
        permissions,
      };

  const payload = await requestApi(
    current
      ? `/api/admin/sites/${SITE_ID}/collections/${current.id}`
      : `/api/admin/sites/${SITE_ID}/collections`,
    {
      method: current ? "PATCH" : "POST",
      body: JSON.stringify(body),
    },
  );

  return payload.data?.collection || payload.data || payload.collection;
};

const ensureCommerceSchemasReadyViaApi = async () => {
  const products = await upsertCollectionSchema({
    slug: PRODUCT_COLLECTION_SLUG,
    name: "Products",
    description:
      "Sellable products controlled by Backy and available to custom frontends through collection APIs.",
    listRoutePattern: "/products",
    routePattern: "/products/:recordSlug",
    fields: PRODUCT_SCHEMA_FIELDS,
    permissions: {
      publicRead: true,
      publicCreate: false,
      publicUpdate: false,
      publicDelete: false,
    },
  });
  const orders = await upsertCollectionSchema({
    slug: ORDERS_COLLECTION_SLUG,
    name: "Orders",
    description:
      "Commerce orders for storefronts, custom checkout flows, and fulfillment dashboards.",
    listRoutePattern: "/orders",
    routePattern: "/orders/:recordSlug",
    fields: ORDER_SCHEMA_FIELDS,
    permissions: {
      publicRead: false,
      publicCreate: false,
      publicUpdate: false,
      publicDelete: false,
    },
  });

  return {
    products: {
      id: products?.id,
      fieldCount: products?.fields?.length || 0,
      permissions: products?.permissions,
    },
    orders: {
      id: orders?.id,
      fieldCount: orders?.fields?.length || 0,
      permissions: orders?.permissions,
    },
  };
};

const listCollectionRecords = async (collectionId, query = "") => {
  const payload = await requestApi(
    `/api/admin/sites/${SITE_ID}/collections/${collectionId}/records${query}`,
  );
  return payload.data?.records || [];
};

const listAllCollectionRecords = async (collectionId, query = "") => {
  const baseParams = new URLSearchParams(
    query.startsWith("?") ? query.slice(1) : query,
  );
  const records = [];
  let offset = Number(baseParams.get("offset") || 0);
  const limit = Number(baseParams.get("limit") || 100);

  for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
    const params = new URLSearchParams(baseParams);
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    const payload = await requestApi(
      `/api/admin/sites/${SITE_ID}/collections/${collectionId}/records?${params.toString()}`,
    );
    const pageRecords = payload.data?.records || [];
    const pagination = payload.data?.pagination || {
      limit,
      offset,
      hasMore: false,
    };

    records.push(...pageRecords);
    const nextOffset =
      Number(pagination.offset || offset) + Number(pagination.limit || limit);
    if (!pagination.hasMore || nextOffset <= offset) {
      break;
    }

    offset = nextOffset;
  }

  return records;
};

const getCollectionRecordBySlug = async (collectionId, slug) => {
  const records = await listCollectionRecords(
    collectionId,
    `?slug=${encodeURIComponent(slug)}`,
  );
  return records[0] || null;
};

const assertProductBillingLimitEnforced = async (productCollection, suffix) => {
  assert(
    productCollection?.id,
    "Products collection is required for billing limit smoke.",
  );
  const site = await getSite();
  const settings = await getSettings();
  const existingProducts = await listAllCollectionRecords(productCollection.id);
  const originalSiteSettings = site.settings || {};
  const originalBillingQuota = originalSiteSettings.billingQuota || {};
  const originalLimits = originalBillingQuota.limits || {};
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const blockedSlug = `blocked-product-limit-${suffix}`;

  await patchSettingsFromSnapshot({
    ...settings,
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        overageMode: "block",
      },
    },
  });
  await patchSite({
    settings: {
      ...originalSiteSettings,
      billingQuota: {
        ...originalBillingQuota,
        limits: {
          ...originalLimits,
          products: existingProducts.length,
        },
      },
    },
  });

  try {
    const { response, payload } = await requestApiRaw(
      `/api/admin/sites/${SITE_ID}/collections/${productCollection.id}/records`,
      {
        method: "POST",
        body: JSON.stringify({
          slug: blockedSlug,
          status: "draft",
          values: {
            title: `Blocked Product Limit ${suffix}`,
            sku: `BLOCKED-${suffix.toUpperCase()}`,
            price: 29,
            currency: "USD",
            producttype: "physical",
            inventory: 3,
          },
        }),
      },
    );

    assert(
      response.status === 402,
      `Billing product limit should reject product creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`,
    );
    assert(
      payload?.error?.code === "BILLING_PRODUCT_LIMIT",
      `Billing product limit should return BILLING_PRODUCT_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`,
    );
    const persisted = await getCollectionRecordBySlug(
      productCollection.id,
      blockedSlug,
    );
    assert(
      !persisted,
      `Billing-limited product creation unexpectedly persisted a product: ${JSON.stringify(persisted).slice(0, 500)}`,
    );
  } finally {
    await patchSite({ settings: originalSiteSettings });
    await patchSettingsFromSnapshot({
      ...settings,
      integrations: originalIntegrations,
    });
  }
};

const temporarilyAllowProductSeedQuota = async (productCollection, extraProducts = 4) => {
  assert(
    productCollection?.id,
    "Products collection is required to lift product seed quota.",
  );
  const site = await getSite();
  const settings = await getSettings();
  const existingProducts = await listAllCollectionRecords(productCollection.id);
  const originalSiteSettings = site.settings || {};
  const originalBillingQuota = originalSiteSettings.billingQuota || {};
  const originalLimits = originalBillingQuota.limits || {};
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const currentProductLimit = Number(originalLimits.products || 0);
  const nextProductLimit = Math.max(
    currentProductLimit,
    existingProducts.length + extraProducts,
  );

  await patchSettingsFromSnapshot({
    ...settings,
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        overageMode: "allow",
      },
    },
  });
  await patchSite({
    settings: {
      ...originalSiteSettings,
      billingQuota: {
        ...originalBillingQuota,
        limits: {
          ...originalLimits,
          products: nextProductLimit,
        },
      },
    },
  });

  return {
    siteSettings: originalSiteSettings,
  };
};

const currentMonthStartMs = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
};

const currentMonthRecords = (records) => {
  const monthStart = currentMonthStartMs();
  return records.filter((record) => {
    const timestamp = Date.parse(
      record.createdAt ||
        record.values?.createdat ||
        record.values?.createdAt ||
        "",
    );
    return Number.isFinite(timestamp) && timestamp >= monthStart;
  });
};

const assertOrderBillingLimitEnforced = async ({
  productCollection,
  ordersCollection,
  slug,
  suffix,
}) => {
  assert(
    productCollection?.id,
    "Products collection is required for order billing limit smoke.",
  );
  assert(
    ordersCollection?.id,
    "Orders collection is required for order billing limit smoke.",
  );
  const settings = await getSettings();
  const existingOrders = currentMonthRecords(
    await listAllCollectionRecords(
      ordersCollection.id,
      "?limit=100&status=all",
    ),
  );
  const productBefore = await getCollectionRecordBySlug(
    productCollection.id,
    slug,
  );
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const blockedSessionId = `cs_blocked_order_limit_${suffix}`;

  await patchSettingsFromSnapshot({
    ...settings,
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        overageMode: "block",
        monthlyOrderLimit: existingOrders.length,
      },
    },
  });

  try {
    const { response, payload } = await requestApiRaw(
      `/api/sites/${SITE_ID}/commerce/orders`,
      {
        method: "POST",
        body: JSON.stringify({
          customer: {
            name: "Blocked Order Limit Buyer",
            email: `blocked-order-limit-${suffix}@example.com`,
          },
          items: [{ slug, quantity: 1 }],
          paymentProvider: "manual",
          paymentReference: `manual-blocked-order-limit-${suffix}`,
          checkoutSessionId: blockedSessionId,
        }),
      },
    );

    assert(
      response.status === 402,
      `Billing order limit should reject checkout order creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`,
    );
    assert(
      payload?.error?.code === "BILLING_ORDER_LIMIT",
      `Billing order limit should return BILLING_ORDER_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`,
    );
    const ordersAfter = await listAllCollectionRecords(
      ordersCollection.id,
      "?limit=100&status=all",
    );
    assert(
      !ordersAfter.some(
        (record) => record.values?.checkoutsessionid === blockedSessionId,
      ),
      `Billing-limited checkout unexpectedly persisted an order: ${JSON.stringify(ordersAfter.slice(-3)).slice(0, 900)}`,
    );
    const productAfter = await getCollectionRecordBySlug(
      productCollection.id,
      slug,
    );
    assert(
      productAfter?.values?.inventory === productBefore?.values?.inventory,
      `Billing-limited checkout unexpectedly reserved inventory: before=${productBefore?.values?.inventory} after=${productAfter?.values?.inventory}`,
    );
  } finally {
    await patchSettingsFromSnapshot({
      ...settings,
      integrations: originalIntegrations,
    });
  }
};

const deleteCollectionRecord = async (collectionId, recordId) => {
  if (!collectionId || !recordId) return;

  try {
    await requestApi(
      `/api/admin/sites/${SITE_ID}/collections/${collectionId}/records/${recordId}`,
      {
        method: "DELETE",
      },
    );
  } catch {
    await requestApi(
      `/api/admin/sites/${SITE_ID}/collections/${collectionId}/records/bulk`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "delete",
          recordIds: [recordId],
        }),
      },
    );
  }
};

const csvEscape = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const fetchJson = async (endpoint) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
  if (!response.ok) {
    throw new Error(`${endpoint} returned ${response.status}`);
  }
  return response.json();
};

const waitForCdp = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await fetchJson("/json/list");
    } catch {
      await sleep(100);
    }
  }

  throw new Error(`Chrome DevTools did not start on port ${PORT}`);
};

const connectCdp = (webSocketDebuggerUrl) => {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        request.reject(new Error(JSON.stringify(message.error)));
      } else {
        request.resolve(message.result);
      }
      return;
    }

    events.push(message);
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    events,
    opened,
    close: () => socket.close(),
    send: (method, params = {}) => {
      const messageId = (id += 1);
      socket.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
      });
    },
  };
};

const authStorageScript = (sessionToken) => `
localStorage.setItem('backy-auth-storage', ${JSON.stringify(
  JSON.stringify({
    state: {
      user: {
        id: "user-admin",
        email: "admin@backy.io",
        fullName: "Admin User",
        role: "admin",
      },
      session: {
        token: sessionToken,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        authMode: "local-demo",
      },
    },
    version: 0,
  }),
)});
`;

const evaluate = async (client, expression) => {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(
      `Runtime evaluation failed: ${JSON.stringify(result.exceptionDetails)}`,
    );
  }

  return result.result.value;
};

const pressEscape = async (client) => {
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
};

const navigateToRoute = async (client, route, testId, expectedText) => {
  await client.send("Page.navigate", {
    url: `${ADMIN_BASE_URL}${route}?siteId=${encodeURIComponent(SITE_ID)}`,
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => ({
      ready: Boolean(document.querySelector('[data-testid="${testId}"]')),
      expected: document.body?.innerText?.includes(${JSON.stringify(expectedText)}) || false,
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`,
    );

    if (state.ready && state.expected) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(
        `${route} did not render expected controls: ${JSON.stringify(state)}`,
      );
    }

    await sleep(250);
  }

  return null;
};

const clickByText = async (client, text, options = {}) => {
  const result = await evaluate(
    client,
    `(() => {
    const text = ${JSON.stringify(text)};
    const exact = ${JSON.stringify(Boolean(options.exact))};
    const candidates = Array.from(document.querySelectorAll('button, a'));
    const target = candidates.find((candidate) => {
      const label = (candidate.textContent || '').replace(/\\s+/g, ' ').trim();
      return exact ? label === text : label.includes(text);
    });
    if (!(target instanceof HTMLElement)) {
      return { ok: false, text };
    }
    target.click();
    return { ok: true, text: target.textContent || '', tag: target.tagName };
  })()`,
  );
  assert(
    result.ok,
    `Unable to click control with text ${text}: ${JSON.stringify(result)}`,
  );
  await sleep(250);
  return result;
};

const clickIfPresent = async (client, text) => {
  const result = await evaluate(
    client,
    `(() => {
    const text = ${JSON.stringify(text)};
    const candidates = Array.from(document.querySelectorAll('button, a'));
    const matches = candidates.filter((candidate) => (candidate.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase().includes(text.toLowerCase()));
    const target = matches.find((candidate) => candidate instanceof HTMLElement && candidate.getAttribute('aria-disabled') !== 'true' && !candidate.disabled);
    if (!(target instanceof HTMLElement)) {
      return {
        ok: false,
        text,
        matches: matches.map((candidate) => ({
          text: (candidate.textContent || '').replace(/\\s+/g, ' ').trim(),
          disabled: candidate.disabled || candidate.getAttribute('aria-disabled') === 'true',
        })).slice(0, 6),
      };
    }
    target.click();
    return { ok: true, text: target.textContent || '' };
  })()`,
  );

  if (result.ok) {
    await sleep(500);
  }

  return result.ok;
};

const waitUntilIdle = async (client, pageName) => {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => ({
      hasBusyButton: Array.from(document.querySelectorAll('button')).some((button) => /Saving|Setting up|Loading/.test(button.textContent || '')),
      notice: Array.from(document.querySelectorAll('div')).some((node) => /created|synced|updated|ready/i.test(node.textContent || '')),
      error: document.body?.innerText?.includes('Unable to') || false,
      body: document.body?.innerText?.slice(0, 400) || '',
    }))()`,
    );

    if (!state.hasBusyButton) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(
        `${pageName} did not become idle: ${JSON.stringify(state)}`,
      );
    }

    await sleep(200);
  }

  return null;
};

const setLabeledControl = async (client, labelText, value, options = {}) => {
  const result = await evaluate(
    client,
    `(() => {
    const labelText = ${JSON.stringify(labelText)};
    const value = ${JSON.stringify(value)};
    const exact = ${JSON.stringify(Boolean(options.exact))};
    const labels = Array.from(document.querySelectorAll('label'));
    const normalized = (text) => (text || '').replace(/\\s+/g, ' ').trim();
    const label = labels.find((candidate) => {
      const text = normalized(candidate.textContent);
      return exact ? text === labelText : text.includes(labelText);
    });
    if (!(label instanceof HTMLLabelElement)) {
      return { ok: false, reason: 'label-not-found', labelText };
    }
    const control = label.querySelector('input, select, textarea') || (
      label.htmlFor ? document.getElementById(label.htmlFor) : null
    );
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: 'control-not-found', labelText, text: normalized(label.textContent) };
    }
    if (control.disabled) {
      return { ok: false, reason: 'control-disabled', labelText };
    }
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      if (control.checked !== Boolean(value)) {
        control.click();
      }
      return { ok: true, labelText, type: control.type, value: control.checked };
    }
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, labelText, value: control.value, tag: control.tagName };
  })()`,
  );
  assert(result.ok, `Unable to set ${labelText}: ${JSON.stringify(result)}`);
  await sleep(75);
  return result;
};

const setAriaControl = async (client, ariaLabel, value) => {
  const result = await evaluate(
    client,
    `(() => {
    const ariaLabel = ${JSON.stringify(ariaLabel)};
    const value = ${JSON.stringify(value)};
    const control = document.querySelector('[aria-label="' + CSS.escape(ariaLabel) + '"]');
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'control-not-found', ariaLabel };
    }
    if (control.disabled) {
      return { ok: false, reason: 'control-disabled', ariaLabel };
    }
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, ariaLabel, value: control.value };
  })()`,
  );
  assert(
    result.ok,
    `Unable to set aria control ${ariaLabel}: ${JSON.stringify(result)}`,
  );
  await sleep(75);
  return result;
};

const ensureCollectionReadyFromUi = async (
  client,
  route,
  testId,
  expectedText,
  setupText,
  readyCheck,
) => {
  await navigateToRoute(client, route, testId, expectedText);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await readyCheck();
    if (state.ready) {
      return state;
    }

    const clickedSetup = await clickIfPresent(client, setupText);
    if (clickedSetup) {
      await waitUntilIdle(client, route);
    }

    const clickedSync = await clickIfPresent(client, "Sync Schema");
    if (clickedSync) {
      await waitUntilIdle(client, route);
    }

    if (attempt === 79) {
      throw new Error(
        `${route} collection did not become ready: ${JSON.stringify(state)}`,
      );
    }

    await sleep(250);
  }

  return null;
};

const ensureOrdersReady = async (client) =>
  ensureCollectionReadyFromUi(
    client,
    "/orders",
    "orders-command-center",
    "Order command center",
    "Set up orders",
    async () => {
      const collection = await findCollection(ORDERS_COLLECTION_SLUG);
      return {
        ready: Boolean(
          collection?.id &&
          collection.status === "published" &&
          !collection.permissions?.publicRead &&
          !collection.permissions?.publicCreate &&
          !collection.permissions?.publicUpdate &&
          !collection.permissions?.publicDelete &&
          (collection.fields?.length || 0) >= ORDER_REQUIRED_FIELD_COUNT,
        ),
        collectionId: collection?.id,
        fieldCount: collection?.fields?.length || 0,
        permissions: collection?.permissions,
      };
    },
  );

const ensureProductsReady = async (client) =>
  ensureCollectionReadyFromUi(
    client,
    "/products",
    "products-command-center",
    "Catalog command center",
    "Set up products",
    async () => {
      const collection = await findCollection(PRODUCT_COLLECTION_SLUG);
      return {
        ready: Boolean(
          collection?.id &&
          collection.status === "published" &&
          collection.permissions?.publicRead &&
          (collection.fields?.length || 0) >= PRODUCT_REQUIRED_FIELD_COUNT,
        ),
        collectionId: collection?.id,
        fieldCount: collection?.fields?.length || 0,
        permissions: collection?.permissions,
      };
    },
  );

const fillProductEditor = async (client, suffix) => {
  const slug = `commerce-smoke-${suffix}`;
  await setLabeledControl(client, "Title", `Commerce Smoke ${suffix}`);
  await setLabeledControl(client, "Slug", slug);
  await setLabeledControl(client, "SKU", `SMOKE-${suffix.toUpperCase()}`);
  await setLabeledControl(client, "Price", "49");
  await setLabeledControl(client, "Compare at", "79");
  await setLabeledControl(client, "Currency", "USD");
  await setLabeledControl(client, "Stock", "7");
  await setLabeledControl(client, "Low stock at", "4");
  await setLabeledControl(client, "Inventory policy", "deny");
  await setLabeledControl(client, "Type", "physical");
  await setLabeledControl(
    client,
    "Checkout URL",
    `https://checkout.example.com/${slug}`,
  );
  await setLabeledControl(client, "Subscription", true, { exact: true });
  await sleep(150);
  await setLabeledControl(client, "Subscription interval", "monthly");
  await setLabeledControl(client, "Trial days", "14");
  await setLabeledControl(client, "Tax class", "standard");
  await setLabeledControl(client, "Shipping profile", "standard-box");
  await setLabeledControl(client, "Discount code", "SMOKE10");
  await setLabeledControl(
    client,
    "Return policy",
    "30-day returns for unopened smoke-test products.",
  );
  await setAriaControl(
    client,
    "Image URL",
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085",
  );
  await setLabeledControl(client, "Category", "Templates");
  await setLabeledControl(client, "Vendor", "Backy");
  await setLabeledControl(
    client,
    "Description",
    "A smoke-tested commerce product that verifies catalog publishing, storefront API handoff, and order intake inventory reservation.",
  );
  await setLabeledControl(
    client,
    "SEO title",
    `Commerce Smoke ${suffix} | Backy`,
  );
  await setLabeledControl(client, "Status", "published");
  await setLabeledControl(client, "Featured", true);
  await setLabeledControl(client, "Taxable", true);
  await setLabeledControl(client, "Ships", true);
  const generatedVariantMatrix = await evaluate(
    client,
    `(() => {
    const setNativeValue = (element, value) => {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
      descriptor?.set?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const options = document.querySelector('[data-testid="products-variant-matrix-options"]');
    const prefix = document.querySelector('[data-testid="products-variant-matrix-sku-prefix"]');
    const price = document.querySelector('[data-testid="products-variant-matrix-price"]');
    const stock = document.querySelector('[data-testid="products-variant-matrix-stock"]');
    const button = document.querySelector('[data-testid="products-variant-matrix-generate"]');
    if (!(options instanceof HTMLTextAreaElement) || !(prefix instanceof HTMLInputElement) || !(price instanceof HTMLInputElement) || !(stock instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'missing-matrix-controls',
        hasOptions: Boolean(options),
        hasPrefix: Boolean(prefix),
        hasPrice: Boolean(price),
        hasStock: Boolean(stock),
        hasButton: Boolean(button),
        body: document.body?.innerText?.slice(0, 800) || '',
      };
    }

    setNativeValue(options, 'Size: S, M\\nColor: Black, White');
    setNativeValue(prefix, 'SMOKE-${suffix.toUpperCase()}');
    setNativeValue(price, '59');
    setNativeValue(stock, '4');
    button.click();
    return { ok: true };
  })()`,
  );
  assert(
    generatedVariantMatrix.ok,
    `Unable to generate product variant matrix: ${JSON.stringify(generatedVariantMatrix)}`,
  );
  await sleep(500);
  const generatedVariantState = await evaluate(
    client,
    `(() => {
    const text = document.querySelector('[data-testid="products-variant-matrix"]')?.parentElement?.textContent || document.body?.innerText || '';
    return {
      hasSmallBlack: text.includes('S / Black') && text.includes('Size: S / Color: Black'),
      hasMediumWhite: text.includes('M / White') && text.includes('Size: M / Color: White'),
      countText: text.match(/\\d+\\/50/)?.[0] || '',
      text: text.slice(0, 1400),
    };
  })()`,
  );
  assert(
    generatedVariantState.hasSmallBlack &&
      generatedVariantState.hasMediumWhite &&
      generatedVariantState.countText === "4/50",
    `Product variant matrix did not render generated combinations: ${JSON.stringify(generatedVariantState)}`,
  );

  await sleep(500);
  await clickByText(client, "Create Product", { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => ({
      created: document.body?.innerText?.includes('Product created.') || false,
      titleVisible: document.body?.innerText?.includes(${JSON.stringify(`Commerce Smoke ${suffix}`)}) || false,
      buttonText: Array.from(document.querySelectorAll('button')).map((button) => button.textContent || '').join(' | '),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`,
    );

    if (state.created && state.titleVisible) {
      return { slug, state };
    }

    if (attempt === 79) {
      throw new Error(
        `Product was not created from UI: ${JSON.stringify(state)}`,
      );
    }

    await sleep(250);
  }

  return { slug };
};

const clickFrontendTemplateCreateProduct = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(
      client,
      `(() => {
      const section = document.querySelector('[data-testid="products-frontend-template-options"]');
      const button = document.querySelector('[data-testid="products-frontend-template-${FRONTEND_PRODUCT_TEMPLATE_ID}"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return {
          ok: false,
          section: Boolean(section),
          button: button?.textContent || null,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          body: document.body?.innerText?.slice(0, 700) || '',
        };
      }
      button.click();
      return { ok: true, text: button.textContent || '' };
    })()`,
    );

    if (result.ok) {
      return;
    }

    if (attempt === 79) {
      throw new Error(
        `Unable to click frontend product template Create product: ${JSON.stringify(result)}`,
      );
    }

    await sleep(250);
  }
};

const waitForFrontendTemplateProduct = async (productCollection) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const records = await listAllCollectionRecords(
      productCollection.id,
      "?limit=100&status=all",
    );
    const record = records.find(
      (candidate) =>
        candidate.values?.frontendDesignTemplateId ===
        FRONTEND_PRODUCT_TEMPLATE_ID,
    );

    if (record) {
      return record;
    }

    if (attempt === 99) {
      throw new Error(
        `Frontend product template was not created: ${JSON.stringify(
          records
            .map((record) => ({
              id: record.id,
              slug: record.slug,
              values: record.values,
            }))
            .slice(0, 8),
        )}`,
      );
    }

    await sleep(250);
  }

  return null;
};

const assertCreatedProductCanvasAction = async (client, productId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => {
      const button = document.querySelector('[data-testid="products-created-canvas-action"]');
      return {
        ready: button instanceof HTMLButtonElement && !button.disabled,
        text: button?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        action: button?.getAttribute('data-action') || '',
        target: button?.getAttribute('data-action-target') || '',
        route: button?.getAttribute('data-action-route') || '',
        state: button?.getAttribute('data-action-state') || '',
      };
    })()`,
    );

    if (
      state.ready &&
      state.text.includes("Open editable canvas") &&
      state.action === "products.open.createdProductCanvas" &&
      state.target === productId &&
      state.route.includes("/pages/new") &&
      state.route.includes("templateSource=backy-canvas") &&
      state.route.includes("focus=canvas") &&
      state.route.includes("datasetMode=item")
    ) {
      return state;
    }

    if (attempt === 79) {
      throw new Error(
        `Created product canvas action missing or miswired: ${JSON.stringify({
          productId,
          state,
        })}`,
      );
    }

    await sleep(250);
  }

  return null;
};

const deleteExistingFrontendTemplateProducts = async (productCollection) => {
  const records = await listAllCollectionRecords(
    productCollection.id,
    "?limit=100&status=all",
  );
  const staleRecords = records.filter(
    (record) =>
      record.values?.frontendDesignTemplateId === FRONTEND_PRODUCT_TEMPLATE_ID,
  );

  for (const record of staleRecords) {
    await deleteCollectionRecord(productCollection.id, record.id);
  }
};

const assertFrontendTemplateProduct = async ({ productCollection, record }) => {
  assert(
    record?.values?.title === "Smoke frontend product",
    `Frontend product title mismatch: ${JSON.stringify(record?.values)}`,
  );
  assert(
    record.values.frontendDesignTemplateId === FRONTEND_PRODUCT_TEMPLATE_ID,
    `Frontend template id was not stored: ${JSON.stringify(record.values)}`,
  );
  assert(
    record.values.frontendDesignTemplateName === FRONTEND_PRODUCT_TEMPLATE_NAME,
    `Frontend template name was not stored: ${JSON.stringify(record.values)}`,
  );
  assert(
    record.values.frontendDesignSource?.label === "Smoke commerce frontend",
    `Frontend source snapshot missing: ${JSON.stringify(record.values)}`,
  );
  assert(
    record.values.frontendDesignRoutePattern ===
      "/products/smoke-contract-product",
    `Frontend route pattern missing: ${JSON.stringify(record.values)}`,
  );
  assert(
    record.values.frontendDesignChrome?.header?.component ===
      "SmokeCommerceHeader",
    `Frontend chrome snapshot missing: ${JSON.stringify(record.values)}`,
  );
  assert(
    record.values.frontendDesignTokens?.fonts?.heading === "Inter",
    `Frontend token snapshot missing: ${JSON.stringify(record.values)}`,
  );
  assert(
    Array.isArray(record.values.frontendDesignBindingHints) &&
      record.values.frontendDesignBindingHints.length === 3,
    `Frontend binding hints missing: ${JSON.stringify(record.values)}`,
  );
  assert(
    record.values.frontendDesignCustomCss?.includes("smoke-product-hero") &&
      record.values.frontendDesignCustomJs?.includes("__backySmokeProduct") &&
      record.values.frontendDesignContentDocument?.schemaVersion === "backy.content.v1" &&
      record.values.frontendDesignElements?.[0]?.animation?.preset === "fade-up" &&
      record.values.frontendDesignThemeTokenRefs?.ctaColor === "colors.primary" &&
      record.values.frontendDesignAssets?.hero?.id === "smoke-product-hero-asset" &&
      record.values.frontendDesignAnimations?.intro?.timeline?.includes("cta-pop") &&
      record.values.frontendDesignInteractions?.hoverPreview?.trigger === "hover" &&
      record.values.frontendDesignDataBindings?.title?.source === "product.title" &&
      record.values.frontendDesignEditableMap?.["product.title"]?.elementId === "smoke-product-title" &&
      record.values.frontendDesignMetadata?.animationTimeline === "smoke-product-intro",
    `Frontend product design state was not stored durably: ${JSON.stringify(record.values).slice(0, 1200)}`,
  );
  assert(
    readProductValue(record.values, "price") === 39,
    `Frontend product price mismatch: ${readProductValue(record.values, "price")}`,
  );
  assert(
    readProductValue(record.values, "inventory") === 11,
    `Frontend product inventory mismatch: ${readProductValue(record.values, "inventory")}`,
  );
  assert(
    readProductValue(record.values, "shippingProfile") === "standard-box",
    `Frontend product shipping profile mismatch: ${readProductValue(record.values, "shippingProfile")}`,
  );
  assert(
    readProductValue(record.values, "taxClass") === "standard",
    `Frontend product tax class mismatch: ${readProductValue(record.values, "taxClass")}`,
  );
  assert(
    readProductValue(record.values, "discountCode") === "FRONTEND10",
    `Frontend product discount code mismatch: ${readProductValue(record.values, "discountCode")}`,
  );
  assert(
    readProductValue(record.values, "returnPolicy") ===
      "Frontend template products allow returns within 30 days.",
    `Frontend product return policy mismatch: ${readProductValue(record.values, "returnPolicy")}`,
  );

  const publishPayload = await requestApi(
    `/api/admin/sites/${SITE_ID}/collections/${productCollection.id}/records/bulk`,
    {
      method: "POST",
      body: JSON.stringify({
        action: "updateStatus",
        status: "published",
        recordIds: [record.id],
      }),
    },
  );
  assert(
    publishPayload.data?.updated === 1,
    `Frontend template product was not published: ${JSON.stringify(publishPayload).slice(0, 500)}`,
  );

  const catalog = await requestApi(
    `/api/sites/${SITE_ID}/commerce/catalog?slug=${encodeURIComponent(record.slug)}`,
  );
  const product = catalog.data?.products?.[0] || catalog.products?.[0];
  assert(
    product?.design?.frontendDesignTemplateId === FRONTEND_PRODUCT_TEMPLATE_ID,
    `Public catalog did not expose frontend product design metadata: ${JSON.stringify(product)}`,
  );
  assert(
    product.design.frontendDesignTemplateName ===
      FRONTEND_PRODUCT_TEMPLATE_NAME,
    `Public catalog did not expose frontend template name: ${JSON.stringify(product.design)}`,
  );
  assert(
    product.design.frontendDesignSource?.label === "Smoke commerce frontend",
    `Public catalog did not expose frontend source: ${JSON.stringify(product.design)}`,
  );
  assert(
    product.design.frontendDesignBindingHints?.length === 3,
    `Public catalog did not expose binding hints: ${JSON.stringify(product.design)}`,
  );
  assert(
    product.design.frontendDesignCustomJs?.includes("__backySmokeProduct") &&
      product.design.frontendDesignContentDocument?.schemaVersion === "backy.content.v1" &&
      product.design.frontendDesignElements?.[0]?.animation?.preset === "fade-up" &&
      product.design.frontendDesignThemeTokenRefs?.ctaColor === "colors.primary" &&
      product.design.frontendDesignAssets?.hero?.id === "smoke-product-hero-asset" &&
      product.design.frontendDesignAnimations?.intro?.target === "smoke-product-hero" &&
      product.design.frontendDesignInteractions?.hoverPreview?.target === "smoke-product-card" &&
      product.design.frontendDesignEditableMap?.["product.title"]?.targetPath === "props.content" &&
      product.design.frontendDesignMetadata?.animationTimeline === "smoke-product-intro",
    `Public catalog did not expose product design state: ${JSON.stringify(product.design).slice(0, 1200)}`,
  );
  assert(
    product.designReadiness?.counts?.assets === 1 &&
      product.designReadiness?.counts?.animations === 1,
    `Public catalog did not count record-shaped product design state: ${JSON.stringify(product.designReadiness).slice(0, 900)}`,
  );

  return product;
};

const assertFirstClassCheckoutProviderExecution = async ({
  slug,
  taxProvider,
  shippingProvider,
  expectedTaxAmount,
  expectedShippingAmount,
  expectedProviderUrls,
  commerceProviderMock,
}) => {
  await enableFirstClassCheckoutProviderSettings({
    taxProvider,
    shippingProvider,
  });
  const providerRequestStart = commerceProviderMock?.requests.length || 0;
  const orderPayload = await requestApi(
    `/api/sites/${SITE_ID}/commerce/orders`,
    {
      method: "POST",
      body: JSON.stringify({
        customer: {
          name: `Commerce Smoke ${taxProvider} ${shippingProvider}`,
          email: `commerce-smoke-${taxProvider}-${shippingProvider}@example.com`,
        },
        items: [{ slug, quantity: 1 }],
        shippingAddress: JSON.stringify(providerAddressRecord),
        billingAddress: JSON.stringify(providerAddressRecord),
        paymentProvider: "manual",
        paymentReference: `manual-${taxProvider}-${shippingProvider}-${slug}`,
        checkoutSessionId: `cs_${taxProvider}_${shippingProvider}_${slug}`,
        discountCode: "SMOKE10",
      }),
    },
  );

  const quote = orderPayload.data?.quote;
  const order = orderPayload.data?.order;
  assert(
    order?.id,
    `First-class provider checkout did not create an order: ${JSON.stringify(orderPayload).slice(0, 500)}`,
  );
  assert(
    quote?.subtotal === 49,
    `First-class provider checkout subtotal was unexpected: ${JSON.stringify(quote)}`,
  );
  assert(
    quote.discountAmount === 9.8,
    `Stripe promotion-code discount was not applied: ${JSON.stringify(quote)}`,
  );
  assert(
    quote.taxAmount === expectedTaxAmount,
    `${taxProvider} tax quote was not applied: ${JSON.stringify(quote)}`,
  );
  assert(
    quote.shippingAmount === expectedShippingAmount,
    `${shippingProvider} shipping quote was not applied: ${JSON.stringify(quote)}`,
  );
  assert(
    order.total ===
      Number(
        (49 - 9.8 + expectedTaxAmount + expectedShippingAmount).toFixed(2),
      ),
    `First-class provider checkout total was unexpected: ${JSON.stringify({ order, quote })}`,
  );
  const providerAdjustments = quote.providerAdjustments || [];
  assert(
    providerAdjustments.some(
      (adjustment) =>
        adjustment.kind === "tax" &&
        adjustment.provider === taxProvider &&
        adjustment.status === "succeeded" &&
        adjustment.amount === expectedTaxAmount,
    ),
    `First-class tax provider adjustment missing: ${JSON.stringify(providerAdjustments)}`,
  );
  assert(
    providerAdjustments.some(
      (adjustment) =>
        adjustment.kind === "shipping" &&
        adjustment.provider === shippingProvider &&
        adjustment.status === "succeeded" &&
        adjustment.amount === expectedShippingAmount,
    ),
    `First-class shipping provider adjustment missing: ${JSON.stringify(providerAdjustments)}`,
  );
  assert(
    providerAdjustments.some(
      (adjustment) =>
        adjustment.kind === "discount" &&
        adjustment.provider === "stripe" &&
        adjustment.status === "succeeded" &&
        adjustment.amount === 9.8,
    ),
    `Stripe discount provider adjustment missing: ${JSON.stringify(providerAdjustments)}`,
  );

  const checkoutProviderRequests = (commerceProviderMock?.requests || []).slice(
    providerRequestStart,
  );
  for (const expectedUrl of expectedProviderUrls) {
    assert(
      checkoutProviderRequests.some(
        (request) =>
          request.url === expectedUrl ||
          request.url?.startsWith(`${expectedUrl}?`),
      ),
      `Expected first-class provider request ${expectedUrl} was not sent: ${JSON.stringify(checkoutProviderRequests)}`,
    );
  }
  assert(
    checkoutProviderRequests.some(
      (request) =>
        request.method === "GET" &&
        request.url?.startsWith("/v1/promotion_codes?"),
    ),
    `Stripe promotion code lookup was not sent: ${JSON.stringify(checkoutProviderRequests)}`,
  );
};

const assertPublicCommerce = async ({
  productCollection,
  ordersCollection,
  slug,
  commerceProviderMock,
}) => {
  const productRecord = await getCollectionRecordBySlug(
    productCollection.id,
    slug,
  );
  assert(productRecord, `Created product record was not found by slug ${slug}`);
  assert(
    productRecord.status === "published",
    `Created product was not published: ${productRecord.status}`,
  );
  assert(
    productRecord.values?.inventory === 7,
    `Created product inventory was unexpected: ${productRecord.values?.inventory}`,
  );
  assert(
    readProductValue(productRecord.values, "subscriptionEnabled") === true,
    `Created product subscription flag was unexpected: ${JSON.stringify(productRecord.values)}`,
  );
  assert(
    readProductValue(productRecord.values, "subscriptionInterval") ===
      "monthly",
    `Created product subscription interval was unexpected: ${JSON.stringify(productRecord.values)}`,
  );
  assert(
    readProductValue(productRecord.values, "subscriptionTrialDays") === 14,
    `Created product subscription trial days was unexpected: ${JSON.stringify(productRecord.values)}`,
  );
  assert(
    Array.isArray(productRecord.values?.variants) &&
      productRecord.values.variants.length === 4 &&
      productRecord.values.variants.some(
        (variant) =>
          variant?.title === "S / Black" &&
          variant?.option === "Size: S / Color: Black" &&
          variant?.price === 59 &&
          variant?.inventory === 4,
      ),
    `Created product variant matrix did not persist: ${JSON.stringify(productRecord.values?.variants)}`,
  );

  const catalog = await requestApi(
    `/api/sites/${SITE_ID}/commerce/catalog?slug=${encodeURIComponent(slug)}`,
  );
  const product = catalog.data?.products?.[0] || catalog.products?.[0];
  assert(product, `Public catalog did not return ${slug}`);
  assert(
    product.price === 49,
    `Public product price was unexpected: ${product.price}`,
  );
  assert(
    product.compareAtPrice === 79,
    `Public compare-at price was unexpected: ${product.compareAtPrice}`,
  );
  assert(
    product.productType === "physical",
    `Public product type was unexpected: ${product.productType}`,
  );
  assert(
    product.imageUrl ===
      "https://images.unsplash.com/photo-1498050108023-c5249f4df085",
    `Public image URL was unexpected: ${product.imageUrl}`,
  );
  assert(
    product.variants?.length === 4,
    `Public product variants were not generated from matrix: ${JSON.stringify(product.variants)}`,
  );
  assert(
    product.variants.some(
      (variant) =>
        variant.sku ===
          `SMOKE-${slug.split("-").at(-1)?.toUpperCase()}-S-BLACK` ||
        (variant.title === "S / Black" &&
          variant.option === "Size: S / Color: Black"),
    ),
    `Public product variant matrix missing S / Black: ${JSON.stringify(product.variants)}`,
  );
  assert(
    product.inventory?.quantity === 7,
    `Public product inventory was unexpected: ${JSON.stringify(product.inventory)}`,
  );
  assert(
    product.inventory?.lowStockThreshold === 4,
    `Public low stock threshold was unexpected: ${JSON.stringify(product.inventory)}`,
  );
  assert(
    product.inventory?.policy === "deny",
    `Public inventory policy was unexpected: ${JSON.stringify(product.inventory)}`,
  );
  assert(
    product.featured === true,
    "Public product featured flag was not true",
  );
  assert(
    product.checkout?.url === `https://checkout.example.com/${slug}`,
    `Public checkout URL was unexpected: ${JSON.stringify(product.checkout)}`,
  );
  assert(
    product.checkout?.discountCode === "SMOKE10",
    `Public discount code was unexpected: ${JSON.stringify(product.checkout)}`,
  );
  assert(
    product.subscription?.enabled === true,
    `Public subscription flag was unexpected: ${JSON.stringify(product.subscription)}`,
  );
  assert(
    product.subscription?.interval === "monthly",
    `Public subscription interval was unexpected: ${JSON.stringify(product.subscription)}`,
  );
  assert(
    product.subscription?.trialDays === 14,
    `Public subscription trial days was unexpected: ${JSON.stringify(product.subscription)}`,
  );
  assert(
    product.delivery?.shippingProfile === "standard-box",
    `Public shipping profile was unexpected: ${JSON.stringify(product.delivery)}`,
  );
  assert(
    product.delivery?.taxClass === "standard",
    `Public tax class was unexpected: ${JSON.stringify(product.delivery)}`,
  );
  assert(
    product.delivery?.returnPolicy ===
      "30-day returns for unopened smoke-test products.",
    `Public return policy was unexpected: ${JSON.stringify(product.delivery)}`,
  );

  const invalidQuantityResponse = await fetch(
    `${API_BASE_URL}/api/sites/${SITE_ID}/commerce/orders`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        customer: {
          name: "Commerce Smoke Buyer",
          email: "commerce-smoke-invalid-quantity@example.com",
        },
        items: [{ slug, quantity: 1.5 }],
      }),
    },
  );
  const invalidQuantityPayload = await invalidQuantityResponse
    .json()
    .catch(() => ({}));
  assert(
    invalidQuantityResponse.status === 400,
    `Fractional checkout quantity should be rejected: ${invalidQuantityResponse.status} ${JSON.stringify(invalidQuantityPayload).slice(0, 500)}`,
  );
  assert(
    invalidQuantityPayload.error?.code === "VALIDATION_ERROR",
    `Fractional checkout quantity returned wrong error: ${JSON.stringify(invalidQuantityPayload).slice(0, 500)}`,
  );
  assert(
    JSON.stringify(invalidQuantityPayload.error?.details || []).includes(
      "whole number between 1 and 999",
    ),
    `Fractional checkout quantity did not expose the quantity validation detail: ${JSON.stringify(invalidQuantityPayload).slice(0, 500)}`,
  );

  const defaultQuantityPayload = await requestApi(
    `/api/sites/${SITE_ID}/commerce/orders`,
    {
      method: "POST",
      body: JSON.stringify({
        customer: {
          name: "Commerce Smoke Default Quantity",
          email: "commerce-smoke-default-quantity@example.com",
        },
        items: [{ slug }],
        paymentProvider: "manual",
        paymentReference: `manual-default-${slug}`,
        checkoutSessionId: `cs_default_${slug}`,
      }),
    },
  );
  const defaultQuantityOrder = defaultQuantityPayload.data?.order;
  const defaultQuantityLineItem = defaultQuantityPayload.data?.lineItems?.[0];
  assert(
    defaultQuantityOrder?.itemCount === 1,
    `Omitted checkout quantity did not default order item count to 1: ${JSON.stringify(defaultQuantityPayload).slice(0, 500)}`,
  );
  assert(
    defaultQuantityLineItem?.quantity === 1,
    `Omitted checkout quantity did not default line item quantity to 1: ${JSON.stringify(defaultQuantityPayload).slice(0, 500)}`,
  );

  const productAfterDefaultQuantity = await getCollectionRecordBySlug(
    productCollection.id,
    slug,
  );
  assert(
    productAfterDefaultQuantity.values?.inventory === 6,
    `Default checkout quantity did not reserve exactly one item: ${productAfterDefaultQuantity.values?.inventory}`,
  );

  const providerRequestStart = commerceProviderMock?.requests.length || 0;
  const orderPayload = await requestApi(
    `/api/sites/${SITE_ID}/commerce/orders`,
    {
      method: "POST",
      body: JSON.stringify({
        customer: {
          name: "Commerce Smoke Buyer",
          email: "commerce-smoke@example.com",
          phone: "+1 555 0101",
        },
        items: [{ slug, quantity: 2 }],
        shippingAddress: "100 Test Street, New York, NY",
        billingAddress: "100 Test Street, New York, NY",
        notes: "Smoke order created through public commerce order intake.",
        paymentProvider: "manual",
        paymentReference: `manual-${slug}`,
        checkoutSessionId: `cs_${slug}`,
        discountCode: "SMOKE10",
      }),
    },
  );

  const order = orderPayload.data?.order;
  const customer = orderPayload.data?.customer;
  const checkoutSession = orderPayload.data?.checkoutSession;
  const quote = orderPayload.data?.quote;
  const deliveries = orderPayload.data?.deliveries || [];
  assert(
    order?.id,
    `Public order intake did not return an order: ${JSON.stringify(orderPayload).slice(0, 500)}`,
  );
  assert(
    customer?.id,
    `Public order intake did not return a customer link: ${JSON.stringify(orderPayload).slice(0, 500)}`,
  );
  assert(
    deliveries.some(
      (delivery) =>
        delivery.channel === "email" &&
        delivery.status === "succeeded" &&
        delivery.provider === "local-outbox",
    ),
    `Public order intake did not report local order email delivery: ${JSON.stringify(deliveries)}`,
  );
  assert(
    deliveries.some(
      (delivery) =>
        delivery.channel === "email" &&
        delivery.event === "product.low_stock" &&
        delivery.status === "succeeded" &&
        delivery.provider === "local-outbox",
    ),
    `Public order intake did not report product low-stock email delivery: ${JSON.stringify(deliveries)}`,
  );
  assert(
    checkoutSession?.id === `cs_${slug}`,
    `Checkout session id was unexpected: ${JSON.stringify(checkoutSession)}`,
  );
  assert(
    checkoutSession.provider === "manual",
    `Checkout session provider was unexpected: ${JSON.stringify(checkoutSession)}`,
  );
  assert(
    checkoutSession.amountTotal === 102,
    `Checkout session amount was unexpected: ${JSON.stringify(checkoutSession)}`,
  );
  assert(
    checkoutSession.url?.includes("/checkout/success"),
    `Checkout session handoff URL was unexpected: ${JSON.stringify(checkoutSession)}`,
  );
  assert(
    quote?.subtotal === 98,
    `Quote subtotal was unexpected: ${JSON.stringify(quote)}`,
  );
  assert(
    quote.discountAmount === 13.25,
    `Quote discount was unexpected: ${JSON.stringify(quote)}`,
  );
  assert(
    quote.shippingAmount === 9.5,
    `Quote shipping was unexpected: ${JSON.stringify(quote)}`,
  );
  assert(
    quote.taxAmount === 7.75,
    `Quote tax was unexpected: ${JSON.stringify(quote)}`,
  );
  assert(
    order.total === 102,
    `Order total was unexpected: ${JSON.stringify({ order, quote })}`,
  );
  const providerAdjustments = quote.providerAdjustments || [];
  assert(
    providerAdjustments.some(
      (adjustment) =>
        adjustment.kind === "tax" &&
        adjustment.status === "succeeded" &&
        adjustment.amount === 7.75,
    ),
    `Public quote did not include succeeded tax provider adjustment: ${JSON.stringify(quote)}`,
  );
  assert(
    providerAdjustments.some(
      (adjustment) =>
        adjustment.kind === "shipping" &&
        adjustment.status === "succeeded" &&
        adjustment.amount === 9.5,
    ),
    `Public quote did not include succeeded shipping provider adjustment: ${JSON.stringify(quote)}`,
  );
  assert(
    providerAdjustments.some(
      (adjustment) =>
        adjustment.kind === "discount" &&
        adjustment.status === "succeeded" &&
        adjustment.amount === 13.25,
    ),
    `Public quote did not include succeeded discount provider adjustment: ${JSON.stringify(quote)}`,
  );
  const checkoutProviderRequests = (commerceProviderMock?.requests || []).slice(
    providerRequestStart,
  );
  assert(
    checkoutProviderRequests.some(
      (request) =>
        request.url === "/quote/tax" &&
        request.headers["x-backy-provider-kind"] === "tax",
    ),
    `Tax quote provider was not called during public checkout: ${JSON.stringify(checkoutProviderRequests)}`,
  );
  assert(
    checkoutProviderRequests.some(
      (request) =>
        request.url === "/quote/shipping" &&
        request.headers["x-backy-provider-kind"] === "shipping",
    ),
    `Shipping quote provider was not called during public checkout: ${JSON.stringify(checkoutProviderRequests)}`,
  );
  assert(
    checkoutProviderRequests.some(
      (request) =>
        request.url === "/quote/discount" &&
        request.headers["x-backy-provider-kind"] === "discount",
    ),
    `Discount quote provider was not called during public checkout: ${JSON.stringify(checkoutProviderRequests)}`,
  );
  assert(
    quote.pricing?.rules?.taxRatePercent === 10,
    `Quote pricing rules were not exposed: ${JSON.stringify(quote)}`,
  );
  assert(
    order.itemCount === 2,
    `Order item count was unexpected: ${order.itemCount}`,
  );
  assert(
    orderPayload.data?.risk?.level === "medium" &&
      orderPayload.data?.risk?.reviewStatus === "pending_review",
    `Order risk assessment was not returned: ${JSON.stringify(orderPayload.data?.risk)}`,
  );

  const updatedProduct = await getCollectionRecordBySlug(
    productCollection.id,
    slug,
  );
  assert(
    updatedProduct.values?.inventory === 4,
    `Inventory reservation did not reduce stock to 4 after default and explicit checkout quantities: ${updatedProduct.values?.inventory}`,
  );

  const orderRecord = await getCollectionRecordBySlug(
    ordersCollection.id,
    order.slug,
  );
  assert(
    orderRecord?.id,
    `Order record was not available in private queue by slug ${order.slug}`,
  );
  assert(
    orderRecord.values?.customername === "Commerce Smoke Buyer",
    "Order customer name was not persisted",
  );
  assert(
    orderRecord.values?.customerid === customer.id,
    `Order did not link to the private customer profile: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.checkoutsessionid === checkoutSession.id,
    `Order checkout session was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.paymentprovider === checkoutSession.provider,
    `Order payment provider was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.paymentreference === checkoutSession.reference,
    `Order payment reference was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.subtotal === 98,
    `Order subtotal was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.discountamount === 13.25,
    `Order discount was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.shippingamount === 9.5,
    `Order shipping was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.taxamount === 7.75,
    `Order tax was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.riskscore === 25,
    `Order risk score was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.risklevel === "medium",
    `Order risk level was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.riskreviewstatus === "pending_review",
    `Order risk review status was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    String(orderRecord.values?.riskreasons || "").includes(
      "Manual payment capture",
    ),
    `Order risk reasons were not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.shippinglabelstatus === "none",
    `Order shipping label default was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );
  assert(
    orderRecord.values?.providerrefundstatus === "none",
    `Order provider refund default was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );

  const orderEventsPayload = await requestApi(
    `/api/sites/${SITE_ID}/events?kind=commerce-order&requestId=${encodeURIComponent(orderPayload.requestId || "")}&limit=20`,
  );
  const orderEvents =
    orderEventsPayload.data?.events || orderEventsPayload.events || [];
  const orderDeliveryEvents = orderEvents.filter(
    (event) =>
      event.metadata?.orderId === order.id &&
      event.metadata?.channel === "email",
  );
  const orderDeliveryStatuses = new Set(
    orderDeliveryEvents.map((event) => event.status),
  );
  assert(
    orderDeliveryStatuses.has("queued") &&
      orderDeliveryStatuses.has("succeeded"),
    `Commerce order delivery events were not exposed through /events: ${JSON.stringify(orderEventsPayload)}`,
  );
  const succeededOrderEmailEvent = orderDeliveryEvents.find(
    (event) => event.status === "succeeded",
  );
  assert(
    succeededOrderEmailEvent?.target === "mailto:commerce-ops@example.com",
    `Commerce order delivery target was unexpected: ${JSON.stringify(succeededOrderEmailEvent)}`,
  );
  assert(
    succeededOrderEmailEvent?.metadata?.provider === "local-outbox",
    `Commerce order delivery provider metadata was unexpected: ${JSON.stringify(succeededOrderEmailEvent)}`,
  );
  assert(
    succeededOrderEmailEvent?.metadata?.orderNumber === order.orderNumber,
    `Commerce order delivery metadata did not include order number: ${JSON.stringify(succeededOrderEmailEvent)}`,
  );
  const productEventsPayload = await requestApi(
    `/api/sites/${SITE_ID}/events?kind=commerce-product&requestId=${encodeURIComponent(orderPayload.requestId || "")}&limit=20`,
  );
  const productEvents =
    productEventsPayload.data?.events || productEventsPayload.events || [];
  const productDeliveryEvents = productEvents.filter(
    (event) =>
      event.metadata?.productSlug === slug &&
      event.metadata?.event === "product.low_stock",
  );
  const productDeliveryStatuses = new Set(
    productDeliveryEvents.map((event) => event.status),
  );
  assert(
    productDeliveryStatuses.has("queued") &&
      productDeliveryStatuses.has("succeeded"),
    `Product low-stock delivery events were not exposed through /events: ${JSON.stringify(productEventsPayload)}`,
  );
  const succeededProductEmailEvent = productDeliveryEvents.find(
    (event) => event.status === "succeeded",
  );
  assert(
    succeededProductEmailEvent?.target === "mailto:commerce-ops@example.com",
    `Product low-stock delivery target was unexpected: ${JSON.stringify(succeededProductEmailEvent)}`,
  );
  assert(
    succeededProductEmailEvent?.metadata?.provider === "local-outbox",
    `Product low-stock provider metadata was unexpected: ${JSON.stringify(succeededProductEmailEvent)}`,
  );
  assert(
    succeededProductEmailEvent?.metadata?.inventory === 4,
    `Product low-stock inventory metadata was unexpected: ${JSON.stringify(succeededProductEmailEvent)}`,
  );
  assert(
    succeededProductEmailEvent?.metadata?.lowStockThreshold === 4,
    `Product low-stock threshold metadata was unexpected: ${JSON.stringify(succeededProductEmailEvent)}`,
  );
  assert(
    orderRecord.values?.total === 102,
    `Order quote total was not persisted: ${JSON.stringify(orderRecord.values)}`,
  );

  const customersCollection = await findCollection(CUSTOMERS_COLLECTION_SLUG);
  assert(
    customersCollection?.id,
    "Private customers collection was not created from checkout intake",
  );
  assert(
    customersCollection.permissions?.publicRead === false &&
      customersCollection.permissions?.publicCreate === false,
    `Customers collection was not private: ${JSON.stringify(customersCollection.permissions)}`,
  );
  const customerRecord = await getCollectionRecordBySlug(
    customersCollection.id,
    customer.slug,
  );
  assert(
    customerRecord?.id === customer.id,
    `Customer record was not available by slug ${customer.slug}: ${JSON.stringify(customerRecord)}`,
  );
  assert(
    customerRecord.values?.email === "commerce-smoke@example.com",
    `Customer email was not persisted: ${JSON.stringify(customerRecord.values)}`,
  );
  assert(
    customerRecord.values?.ordercount === 1,
    `Customer order count was unexpected: ${JSON.stringify(customerRecord.values)}`,
  );
  assert(
    customerRecord.values?.totalspent === 102,
    `Customer total spent was unexpected: ${JSON.stringify(customerRecord.values)}`,
  );
  assert(
    customerRecord.values?.lastorderid === order.id,
    `Customer last order id was unexpected: ${JSON.stringify(customerRecord.values)}`,
  );
  assert(
    customerRecord.values?.lastordernumber === order.orderNumber,
    `Customer last order number was unexpected: ${JSON.stringify(customerRecord.values)}`,
  );
  assert(
    customerRecord.values?.sourcevalues?.lastCheckoutOrder?.orderId ===
      order.id,
    `Customer source order id was unexpected: ${JSON.stringify(customerRecord.values?.sourcevalues)}`,
  );

  if (firstClassCheckoutProviderMockEnabled()) {
    const checkoutProviderSettingsSnapshot = await getSettings();
    try {
      await assertFirstClassCheckoutProviderExecution({
        slug,
        taxProvider: "taxjar",
        shippingProvider: "easypost",
        expectedTaxAmount: 8.25,
        expectedShippingAmount: 11.4,
        expectedProviderUrls: ["/v2/taxes", "/v2/shipments"],
        commerceProviderMock,
      });
      await assertFirstClassCheckoutProviderExecution({
        slug,
        taxProvider: "avalara",
        shippingProvider: "shippo",
        expectedTaxAmount: 6.4,
        expectedShippingAmount: 12.3,
        expectedProviderUrls: ["/api/v2/transactions/create", "/shipments/"],
        commerceProviderMock,
      });
    } finally {
      await patchSettingsFromSnapshot(checkoutProviderSettingsSnapshot);
    }
  } else {
    console.warn(
      "[commerce-smoke] Skipping first-class checkout provider execution; mock provider environment variables are not configured on the public app.",
    );
  }

  const webhookRequestId = `commerce-webhook-${slug}`;
  const webhookBody = {
    id: `evt_${slug}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: checkoutSession.id,
        payment_intent: `pi_${slug}`,
        amount_total: Math.round(checkoutSession.amountTotal * 100),
        currency: checkoutSession.currency.toLowerCase(),
        metadata: {
          orderNumber: order.orderNumber,
          orderSlug: order.slug,
        },
      },
    },
  };
  const invalidSignatureResponse = await fetch(
    `${API_BASE_URL}/api/sites/${SITE_ID}/commerce/webhook`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": `${webhookRequestId}-invalid-signature`,
        "x-backy-webhook-signature":
          "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      },
      body: JSON.stringify(webhookBody),
    },
  );
  const invalidSignaturePayload = await invalidSignatureResponse
    .json()
    .catch(() => ({}));
  assert(
    invalidSignatureResponse.status === 401,
    `Invalid commerce webhook signature should be rejected: ${invalidSignatureResponse.status} ${JSON.stringify(invalidSignaturePayload)}`,
  );
  assert(
    invalidSignaturePayload?.error?.code ===
      "COMMERCE_WEBHOOK_SIGNATURE_INVALID",
    `Invalid commerce webhook signature returned wrong code: ${JSON.stringify(invalidSignaturePayload)}`,
  );

  const webhookPayload = await postCommerceWebhook(webhookBody, {
    "x-request-id": webhookRequestId,
  });
  assert(
    webhookPayload.data?.event?.status === "paid",
    `Commerce webhook did not mark payment paid: ${JSON.stringify(webhookPayload)}`,
  );
  assert(
    webhookPayload.data?.order?.paymentStatus === "paid",
    `Commerce webhook order response was unexpected: ${JSON.stringify(webhookPayload)}`,
  );

  const settledOrderRecord = await getCollectionRecordBySlug(
    ordersCollection.id,
    order.slug,
  );
  assert(
    settledOrderRecord.values?.orderstatus === "paid",
    `Webhook did not persist paid order status: ${JSON.stringify(settledOrderRecord.values)}`,
  );
  assert(
    settledOrderRecord.values?.paymentstatus === "paid",
    `Webhook did not persist paid payment status: ${JSON.stringify(settledOrderRecord.values)}`,
  );
  assert(
    settledOrderRecord.values?.paymentreference === `pi_${slug}`,
    `Webhook did not persist payment reference: ${JSON.stringify(settledOrderRecord.values)}`,
  );
  assert(
    Boolean(settledOrderRecord.values?.paidat),
    `Webhook did not persist paid timestamp: ${JSON.stringify(settledOrderRecord.values)}`,
  );
  assert(
    String(settledOrderRecord.values?.notes || "").includes(
      "checkout.session.completed",
    ),
    `Webhook settlement note missing: ${JSON.stringify(settledOrderRecord.values)}`,
  );

  const duplicateWebhookPayload = await postCommerceWebhook(webhookBody, {
    "x-request-id": `${webhookRequestId}-duplicate`,
  });
  assert(
    duplicateWebhookPayload.data?.event?.status === "duplicate",
    `Duplicate commerce webhook was not idempotent: ${JSON.stringify(duplicateWebhookPayload)}`,
  );
  const duplicateOrderRecord = await getCollectionRecordBySlug(
    ordersCollection.id,
    order.slug,
  );
  const settlementNoteMatches =
    String(duplicateOrderRecord.values?.notes || "").match(
      /checkout\.session\.completed/g,
    ) || [];
  assert(
    settlementNoteMatches.length === 1,
    `Duplicate commerce webhook appended a second settlement note: ${JSON.stringify(duplicateOrderRecord.values)}`,
  );

  const commerceEventsPayload = await requestApi(
    `/api/sites/${SITE_ID}/events?kind=commerce-webhook&requestId=${encodeURIComponent(webhookRequestId)}`,
  );
  const commerceEvents =
    commerceEventsPayload.data?.events || commerceEventsPayload.events || [];
  const commerceEvent = commerceEvents.find(
    (event) => event.metadata?.providerEventId === `evt_${slug}`,
  );
  assert(
    commerceEvent?.status === "succeeded",
    `Commerce webhook event was not exposed through /events: ${JSON.stringify(commerceEventsPayload)}`,
  );
  assert(
    commerceEvent.metadata?.orderId === order.id,
    `Commerce webhook event did not include order id: ${JSON.stringify(commerceEvent)}`,
  );

  const stripeCheckoutExecution = await assertStripeCheckoutExecution({
    productCollection,
    ordersCollection,
    customersCollection,
    productRecord,
    slug,
  });

  return {
    productRecord,
    updatedProduct,
    order,
    orderRecord: settledOrderRecord,
    customersCollection,
    customerRecord,
    stripeCheckoutExecution,
  };
};

const assertProductProviderSync = async ({
  productCollection,
  productRecord,
}) => {
  const beforeRequests = stripeCheckoutMock?.requests.length || 0;
  const payload = await requestApi(
    `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/provider-sync`,
    {
      method: "POST",
      body: JSON.stringify({ provider: "stripe" }),
    },
  );
  const sync = payload.data?.sync || payload.sync;
  const updated = payload.data?.product || payload.product;
  const providerCertification = payload.data?.providerCertification || payload.providerCertification;
  const storefrontHandoff = payload.data?.storefrontHandoff || payload.storefrontHandoff;
  assert(
    sync?.provider === "stripe",
    `Product provider sync did not return Stripe metadata: ${JSON.stringify(payload).slice(0, 500)}`,
  );
  assert(
    storefrontHandoff?.schemaVersion === "backy.product-storefront-handoff.v1" &&
      storefrontHandoff.source === "admin-product-provider-sync-api" &&
      storefrontHandoff.product?.id === productRecord.id &&
      Object.prototype.hasOwnProperty.call(storefrontHandoff, "design") &&
      storefrontHandoff.designReadiness?.schemaVersion === "backy.product-design-readiness.v1" &&
      storefrontHandoff.launchReadiness?.checks?.some?.((check) => check.key === "frontend-design") &&
      storefrontHandoff.launchReadiness?.schemaVersion === "backy.product-launch-readiness.v1" &&
      storefrontHandoff.privacy?.includesProviderSecrets === false &&
      storefrontHandoff.privacy?.includesPrivateOrders === false &&
      storefrontHandoff.privacy?.includesCustomerPayloads === false &&
      storefrontHandoff.privacy?.includesDigitalDeliveryUrl === false,
    `Product provider sync did not return the bounded storefront handoff: ${JSON.stringify(storefrontHandoff).slice(0, 900)}`,
  );
  assert(
    providerCertification?.schemaVersion === "backy.commerce-provider-certification-handoff.v1",
    `Product provider sync did not return provider certification handoff: ${JSON.stringify(payload).slice(0, 700)}`,
  );
  assert(
    providerCertification.source === "admin-product-provider-sync-api" &&
      providerCertification.syncSchemaVersion === "backy.commerce-product-sync.v1",
    `Product provider certification handoff did not identify the provider-sync API source: ${JSON.stringify(providerCertification).slice(0, 700)}`,
  );
  assert(
    providerCertification.operatorGate === "BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:commerce-provider-certification",
    `Product provider certification handoff missing operator gate: ${JSON.stringify(providerCertification).slice(0, 700)}`,
  );
  assert(
    providerCertification.certificationEvidence?.schemaVersion === "backy.product-provider-certification-evidence.v1" &&
      providerCertification.certificationEvidence.coverage?.total === 8 &&
      providerCertification.certificationEvidence.scenarios?.some((scenario) => scenario.key === "provider-catalog-sync") &&
      providerCertification.certificationEvidence.scenarios?.some((scenario) => scenario.key === "customer-signal"),
    `Product provider certification handoff missing scenario evidence: ${JSON.stringify(providerCertification).slice(0, 700)}`,
  );
  assert(
    providerCertification.operatorEvidencePacket?.schemaVersion === "backy.commerce-provider-certification-evidence-packet.v1" &&
      providerCertification.operatorEvidencePacket.operatorNextAction?.command?.includes("ci:commerce-provider-certification") &&
      providerCertification.operatorEvidencePacket.operatorNextAction?.artifactEnv === "BACKY_COMMERCE_CERTIFICATION_OUTPUT" &&
      providerCertification.operatorEvidencePacket.operatorArtifacts?.some((artifact) => artifact.key === "payment-checkout") &&
      providerCertification.operatorEvidencePacket.operatorArtifacts?.some((artifact) => artifact.key === "catalog-sync") &&
      providerCertification.operatorEvidencePacket.scenarioAttachments?.some((scenario) => scenario.key === "provider-catalog-sync") &&
      providerCertification.operatorEvidencePacket.commandPreview?.targetInputs?.includes("BACKY_COMMERCE_CERTIFICATION_BASE_URL") &&
      providerCertification.operatorEvidencePacket.commandPreview?.targetInputs?.includes("BACKY_COMMERCE_CERTIFY_SITE_ID") &&
      providerCertification.operatorEvidencePacket.target?.siteSelectorEnv === "BACKY_COMMERCE_CERTIFY_SITE_ID" &&
      providerCertification.operatorEvidencePacket.target?.siteId === SITE_ID &&
      providerCertification.operatorEvidencePacket.redactionPolicy?.includesProviderSecrets === false &&
      providerCertification.operatorEvidencePacket.redactionPolicy?.includesWebhookBodies === false &&
      providerCertification.operatorEvidencePacket.secretHandling?.includes("Redacted operator attachment manifest only"),
    `Product provider certification handoff missing operator evidence packet: ${JSON.stringify(providerCertification).slice(0, 900)}`,
  );
  assert(
    typeof providerCertification.secretHandling === "string" &&
      providerCertification.secretHandling.includes("Provider credentials stay in server environment/configuration"),
    `Product provider certification handoff must preserve non-secret boundary: ${JSON.stringify(providerCertification).slice(0, 700)}`,
  );
  assert(
    ["handoff", "synced", "failed"].includes(sync.status),
    `Product provider sync returned unexpected status: ${JSON.stringify(sync)}`,
  );
  assert(
    updated?.id === productRecord.id,
    `Product provider sync did not return the updated product: ${JSON.stringify(updated)}`,
  );

  const refreshed = await getCollectionRecordBySlug(
    productCollection.id,
    productRecord.slug,
  );
  const persisted = readProductValue(refreshed.values, "providerSync");
  assert(
    persisted?.requestId === sync.requestId,
    `Product provider sync was not persisted: ${JSON.stringify(refreshed.values)}`,
  );
  assert(
    persisted.status === sync.status,
    `Persisted provider sync status differed: ${JSON.stringify({ persisted, sync })}`,
  );
  const readbackPayload = await requestApi(
    `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/provider-sync`,
  );
  const readbackCertification = readbackPayload.data?.providerCertification || readbackPayload.providerCertification;
  assert(
    readbackPayload.data?.sync?.requestId === sync.requestId &&
      readbackCertification?.certificationEvidence?.schemaVersion === "backy.product-provider-certification-evidence.v1",
    `Product provider-sync GET did not return persisted sync and certification evidence: ${JSON.stringify(readbackPayload).slice(0, 700)}`,
  );

  if (stripeCheckoutExecutionEnabled()) {
    assert(
      sync.status === "synced",
      `Stripe product provider sync did not execute against the mock provider: ${JSON.stringify(sync)}`,
    );
    assert(
      /^prod_mock_/.test(sync.product?.id || ""),
      `Stripe product id was not returned: ${JSON.stringify(sync)}`,
    );
    assert(
      /^price_mock_/.test(sync.price?.id || ""),
      `Stripe price id was not returned: ${JSON.stringify(sync)}`,
    );
    const productRequest = stripeCheckoutMock.requests
      .slice(beforeRequests)
      .find((request) => request.url === "/v1/products");
    const priceRequest = stripeCheckoutMock.requests
      .slice(beforeRequests)
      .find((request) => request.url === "/v1/prices");
    const expectedSecret =
      process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    assert(
      productRequest?.headers.authorization === `Bearer ${expectedSecret}`,
      `Stripe product sync did not use bearer auth: ${JSON.stringify(productRequest)}`,
    );
    assert(
      productRequest.form.name ===
        readProductValue(productRecord.values, "title"),
      `Stripe product form did not include product name: ${JSON.stringify(productRequest.form)}`,
    );
    assert(
      productRequest.form["metadata[backyProductId]"] === productRecord.id,
      `Stripe product form did not include Backy product metadata: ${JSON.stringify(productRequest.form)}`,
    );
    assert(
      priceRequest?.form.product === sync.product.id,
      `Stripe price form did not target the created product: ${JSON.stringify(priceRequest?.form)}`,
    );
    assert(
      priceRequest.form.currency ===
        String(
          readProductValue(productRecord.values, "currency"),
        ).toLowerCase(),
      `Stripe price form currency was unexpected: ${JSON.stringify(priceRequest.form)}`,
    );
    assert(
      Number(priceRequest.form.unit_amount) === 4900,
      `Stripe price form amount was unexpected: ${JSON.stringify(priceRequest.form)}`,
    );
    assert(
      priceRequest.form["recurring[interval]"] === "month",
      `Stripe price form did not include subscription recurrence: ${JSON.stringify(priceRequest.form)}`,
    );
  } else {
    assert(
      sync.status === "handoff",
      `Product provider sync should fall back to handoff without Stripe mock env: ${JSON.stringify(sync)}`,
    );
    assert(
      sync.executionMode === "handoff",
      `Product provider sync handoff mode was unexpected: ${JSON.stringify(sync)}`,
    );
    assert(
      String(sync.reason || "").includes("STRIPE_SECRET_KEY"),
      `Product provider sync did not explain missing Stripe credentials: ${JSON.stringify(sync)}`,
    );
  }

  if (paddleCatalogSyncEnabled()) {
    const beforePaddleRequests = stripeCheckoutMock?.requests.length || 0;
    const paddlePayload = await requestApi(
      `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/provider-sync`,
      {
        method: "POST",
        body: JSON.stringify({ provider: "paddle" }),
      },
    );
    const paddleSync = paddlePayload.data?.sync || paddlePayload.sync;
    const paddleUpdated = paddlePayload.data?.product || paddlePayload.product;
    assert(
      paddleSync?.provider === "paddle",
      `Paddle product provider sync did not return Paddle metadata: ${JSON.stringify(paddlePayload).slice(0, 500)}`,
    );
    assert(
      paddleSync.status === "synced",
      `Paddle product provider sync did not execute against the mock provider: ${JSON.stringify(paddleSync)}`,
    );
    assert(
      paddleSync.executionMode === "paddle-api",
      `Paddle product sync execution mode was unexpected: ${JSON.stringify(paddleSync)}`,
    );
    assert(
      /^pro_mock_/.test(paddleSync.product?.id || ""),
      `Paddle product id was not returned: ${JSON.stringify(paddleSync)}`,
    );
    assert(
      /^pri_mock_/.test(paddleSync.price?.id || ""),
      `Paddle price id was not returned: ${JSON.stringify(paddleSync)}`,
    );
    assert(
      paddleSync.price?.unitAmount === 4900,
      `Paddle price amount was unexpected: ${JSON.stringify(paddleSync.price)}`,
    );
    assert(
      paddleUpdated?.id === productRecord.id,
      `Paddle product provider sync did not return the updated product: ${JSON.stringify(paddleUpdated)}`,
    );

    const paddleRequests =
      stripeCheckoutMock.requests.slice(beforePaddleRequests);
    const paddleProductRequest = paddleRequests.find(
      (request) => request.method === "POST" && request.url === "/products",
    );
    const paddlePriceRequest = paddleRequests.find(
      (request) => request.method === "POST" && request.url === "/prices",
    );
    const expectedPaddleAuth = `Bearer ${process.env.BACKY_PADDLE_API_KEY || process.env.PADDLE_API_KEY}`;
    assert(
      paddleProductRequest?.headers.authorization === expectedPaddleAuth,
      `Paddle product sync did not send bearer auth: ${JSON.stringify(paddleProductRequest?.headers)}`,
    );
    assert(
      paddlePriceRequest?.headers.authorization === expectedPaddleAuth,
      `Paddle price sync did not send bearer auth: ${JSON.stringify(paddlePriceRequest?.headers)}`,
    );
    const paddleProductBody = JSON.parse(paddleProductRequest.body || "{}");
    const paddlePriceBody = JSON.parse(paddlePriceRequest.body || "{}");
    assert(
      paddleProductBody.name ===
        readProductValue(productRecord.values, "title"),
      `Paddle product body did not include product name: ${JSON.stringify(paddleProductBody)}`,
    );
    assert(
      paddleProductBody.tax_category === "standard",
      `Paddle product body did not include the default tax category: ${JSON.stringify(paddleProductBody)}`,
    );
    assert(
      paddleProductBody.custom_data?.backyProductId === productRecord.id,
      `Paddle product body did not include Backy product metadata: ${JSON.stringify(paddleProductBody)}`,
    );
    assert(
      paddleProductBody.custom_data?.backySku ===
        readProductValue(productRecord.values, "sku"),
      `Paddle product body did not include Backy SKU metadata: ${JSON.stringify(paddleProductBody)}`,
    );
    assert(
      paddlePriceBody.product_id === paddleSync.product.id,
      `Paddle price body did not target the created product: ${JSON.stringify(paddlePriceBody)}`,
    );
    assert(
      paddlePriceBody.unit_price?.amount === "4900",
      `Paddle price amount was unexpected: ${JSON.stringify(paddlePriceBody)}`,
    );
    assert(
      paddlePriceBody.unit_price?.currency_code ===
        String(
          readProductValue(productRecord.values, "currency"),
        ).toUpperCase(),
      `Paddle price currency was unexpected: ${JSON.stringify(paddlePriceBody)}`,
    );
    assert(
      paddlePriceBody.billing_cycle?.interval === "month" &&
        paddlePriceBody.billing_cycle?.frequency === 1,
      `Paddle price body did not include monthly subscription recurrence: ${JSON.stringify(paddlePriceBody)}`,
    );
    assert(
      paddlePriceBody.trial_period?.interval === "day" &&
        paddlePriceBody.trial_period?.frequency === 14,
      `Paddle price body did not include trial period: ${JSON.stringify(paddlePriceBody)}`,
    );

    const paddleRefreshed = await getCollectionRecordBySlug(
      productCollection.id,
      productRecord.slug,
    );
    const paddlePersisted = readProductValue(
      paddleRefreshed.values,
      "providerSync",
    );
    assert(
      paddlePersisted?.requestId === paddleSync.requestId,
      `Paddle product provider sync was not persisted: ${JSON.stringify(paddleRefreshed.values)}`,
    );
    assert(
      paddlePersisted.executionMode === "paddle-api",
      `Persisted Paddle provider sync mode differed: ${JSON.stringify(paddlePersisted)}`,
    );
  }

  if (squareCatalogSyncEnabled()) {
    const beforeSquareRequests = stripeCheckoutMock?.requests.length || 0;
    const squarePayload = await requestApi(
      `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/provider-sync`,
      {
        method: "POST",
        body: JSON.stringify({ provider: "square" }),
      },
    );
    const squareSync = squarePayload.data?.sync || squarePayload.sync;
    const squareUpdated = squarePayload.data?.product || squarePayload.product;
    assert(
      squareSync?.provider === "square",
      `Square product provider sync did not return Square metadata: ${JSON.stringify(squarePayload).slice(0, 500)}`,
    );
    assert(
      squareSync.status === "synced",
      `Square product provider sync did not execute against the mock provider: ${JSON.stringify(squareSync)}`,
    );
    assert(
      squareSync.executionMode === "square-api",
      `Square product sync execution mode was unexpected: ${JSON.stringify(squareSync)}`,
    );
    assert(
      /^sq_item_mock_/.test(squareSync.product?.id || ""),
      `Square item id was not returned: ${JSON.stringify(squareSync)}`,
    );
    assert(
      /^sq_variation_mock_/.test(squareSync.price?.id || ""),
      `Square variation id was not returned: ${JSON.stringify(squareSync)}`,
    );
    assert(
      squareSync.price?.unitAmount === 4900,
      `Square variation price amount was unexpected: ${JSON.stringify(squareSync.price)}`,
    );
    assert(
      squareUpdated?.id === productRecord.id,
      `Square product provider sync did not return the updated product: ${JSON.stringify(squareUpdated)}`,
    );

    const squareRequests =
      stripeCheckoutMock.requests.slice(beforeSquareRequests);
    const squareCatalogRequest = squareRequests.find(
      (request) =>
        request.method === "POST" && request.url === "/v2/catalog/object",
    );
    assert(
      squareCatalogRequest?.headers.authorization ===
        `Bearer ${process.env.BACKY_SQUARE_ACCESS_TOKEN || process.env.SQUARE_ACCESS_TOKEN}`,
      `Square product sync did not send bearer auth: ${JSON.stringify(squareCatalogRequest?.headers)}`,
    );
    assert(
      squareCatalogRequest.headers["square-version"] ===
        (process.env.BACKY_SQUARE_VERSION ||
          process.env.SQUARE_VERSION ||
          "2026-01-22"),
      `Square product sync did not send Square-Version: ${JSON.stringify(squareCatalogRequest.headers)}`,
    );
    const squareBody = JSON.parse(squareCatalogRequest.body || "{}");
    const squareObject = squareBody.object || {};
    const squareItemData = squareObject.item_data || {};
    const squareVariation = Array.isArray(squareItemData.variations)
      ? squareItemData.variations[0] || {}
      : {};
    const squareVariationData = squareVariation.item_variation_data || {};
    assert(
      squareBody.idempotency_key,
      `Square catalog body did not include idempotency key: ${JSON.stringify(squareBody)}`,
    );
    assert(
      squareObject.type === "ITEM",
      `Square catalog body did not create an ITEM: ${JSON.stringify(squareBody)}`,
    );
    assert(
      squareItemData.name === readProductValue(productRecord.values, "title"),
      `Square item body did not include product name: ${JSON.stringify(squareBody)}`,
    );
    assert(
      squareVariation.type === "ITEM_VARIATION",
      `Square catalog body did not include an ITEM_VARIATION: ${JSON.stringify(squareBody)}`,
    );
    assert(
      squareVariationData.sku === readProductValue(productRecord.values, "sku"),
      `Square variation body did not include SKU: ${JSON.stringify(squareBody)}`,
    );
    assert(
      squareVariationData.price_money?.amount === 4900,
      `Square variation body amount was unexpected: ${JSON.stringify(squareBody)}`,
    );
    assert(
      squareVariationData.price_money?.currency ===
        String(
          readProductValue(productRecord.values, "currency"),
        ).toUpperCase(),
      `Square variation body currency was unexpected: ${JSON.stringify(squareBody)}`,
    );

    const squareRefreshed = await getCollectionRecordBySlug(
      productCollection.id,
      productRecord.slug,
    );
    const squarePersisted = readProductValue(
      squareRefreshed.values,
      "providerSync",
    );
    assert(
      squarePersisted?.requestId === squareSync.requestId,
      `Square product provider sync was not persisted: ${JSON.stringify(squareRefreshed.values)}`,
    );
    assert(
      squarePersisted.executionMode === "square-api",
      `Persisted Square provider sync mode differed: ${JSON.stringify(squarePersisted)}`,
    );
  }

  if (shopifyCatalogSyncEnabled()) {
    const beforeShopifyRequests = stripeCheckoutMock?.requests.length || 0;
    const shopifyPayload = await requestApi(
      `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/provider-sync`,
      {
        method: "POST",
        body: JSON.stringify({ provider: "shopify" }),
      },
    );
    const shopifySync = shopifyPayload.data?.sync || shopifyPayload.sync;
    assert(
      shopifySync?.provider === "shopify",
      `Shopify product provider sync did not return Shopify metadata: ${JSON.stringify(shopifyPayload).slice(0, 500)}`,
    );
    assert(
      shopifySync.status === "synced",
      `Shopify product provider sync did not execute against the mock provider: ${JSON.stringify(shopifySync)}`,
    );
    assert(
      shopifySync.executionMode === "shopify-api",
      `Shopify product sync execution mode was unexpected: ${JSON.stringify(shopifySync)}`,
    );
    assert(
      /^gid:\/\/shopify\/Product\/shopify_product_mock_/.test(
        shopifySync.product?.id || "",
      ),
      `Shopify product id was not returned: ${JSON.stringify(shopifySync)}`,
    );
    assert(
      /^gid:\/\/shopify\/ProductVariant\/shopify_variant_mock_/.test(
        shopifySync.price?.id || "",
      ),
      `Shopify variant id was not returned: ${JSON.stringify(shopifySync)}`,
    );
    const shopifyRequest = stripeCheckoutMock.requests
      .slice(beforeShopifyRequests)
      .find(
        (request) =>
          request.method === "POST" && request.url === "/products.json",
      );
    assert(
      shopifyRequest?.headers["x-shopify-access-token"] ===
        (process.env.BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN ||
          process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
      `Shopify product sync did not send access token: ${JSON.stringify(shopifyRequest?.headers)}`,
    );
    const shopifyBody = JSON.parse(shopifyRequest.body || "{}");
    assert(
      shopifyBody.product?.title ===
        readProductValue(productRecord.values, "title"),
      `Shopify product body did not include product title: ${JSON.stringify(shopifyBody)}`,
    );
    assert(
      Array.isArray(shopifyBody.product?.variants) &&
        shopifyBody.product.variants.length === 4,
      `Shopify product body did not include Backy variants: ${JSON.stringify(shopifyBody)}`,
    );
    assert(
      shopifyBody.product?.metafields?.some(
        (field) =>
          field.namespace === "backy" &&
          field.key === "product_id" &&
          field.value === productRecord.id,
      ),
      `Shopify product body did not include Backy product metafield: ${JSON.stringify(shopifyBody)}`,
    );
    const shopifyRefreshed = await getCollectionRecordBySlug(
      productCollection.id,
      productRecord.slug,
    );
    const shopifyPersisted = readProductValue(
      shopifyRefreshed.values,
      "providerSync",
    );
    assert(
      shopifyPersisted?.requestId === shopifySync.requestId,
      `Shopify product provider sync was not persisted: ${JSON.stringify(shopifyRefreshed.values)}`,
    );
    assert(
      shopifyPersisted.executionMode === "shopify-api",
      `Persisted Shopify provider sync mode differed: ${JSON.stringify(shopifyPersisted)}`,
    );
  }

  if (bigCommerceCatalogSyncEnabled()) {
    const beforeBigCommerceRequests = stripeCheckoutMock?.requests.length || 0;
    const bigCommercePayload = await requestApi(
      `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/provider-sync`,
      {
        method: "POST",
        body: JSON.stringify({ provider: "bigcommerce" }),
      },
    );
    const bigCommerceSync =
      bigCommercePayload.data?.sync || bigCommercePayload.sync;
    assert(
      bigCommerceSync?.provider === "bigcommerce",
      `BigCommerce product provider sync did not return BigCommerce metadata: ${JSON.stringify(bigCommercePayload).slice(0, 500)}`,
    );
    assert(
      bigCommerceSync.status === "synced",
      `BigCommerce product provider sync did not execute against the mock provider: ${JSON.stringify(bigCommerceSync)}`,
    );
    assert(
      bigCommerceSync.executionMode === "bigcommerce-api",
      `BigCommerce product sync execution mode was unexpected: ${JSON.stringify(bigCommerceSync)}`,
    );
    assert(
      /^bigcommerce_product_mock_/.test(bigCommerceSync.product?.id || ""),
      `BigCommerce product id was not returned: ${JSON.stringify(bigCommerceSync)}`,
    );
    assert(
      /^bigcommerce_variant_mock_/.test(bigCommerceSync.price?.id || ""),
      `BigCommerce variant id was not returned: ${JSON.stringify(bigCommerceSync)}`,
    );
    const bigCommerceRequest = stripeCheckoutMock.requests
      .slice(beforeBigCommerceRequests)
      .find(
        (request) =>
          request.method === "POST" && request.url === "/catalog/products",
      );
    assert(
      bigCommerceRequest?.headers["x-auth-token"] ===
        (process.env.BACKY_BIGCOMMERCE_ACCESS_TOKEN ||
          process.env.BIGCOMMERCE_ACCESS_TOKEN),
      `BigCommerce product sync did not send auth token: ${JSON.stringify(bigCommerceRequest?.headers)}`,
    );
    const bigCommerceBody = JSON.parse(bigCommerceRequest.body || "{}");
    assert(
      bigCommerceBody.name === readProductValue(productRecord.values, "title"),
      `BigCommerce product body did not include product title: ${JSON.stringify(bigCommerceBody)}`,
    );
    assert(
      Array.isArray(bigCommerceBody.variants) &&
        bigCommerceBody.variants.length === 4,
      `BigCommerce product body did not include Backy variants: ${JSON.stringify(bigCommerceBody)}`,
    );
    assert(
      bigCommerceBody.custom_fields?.some(
        (field) =>
          field.name === "backyProductId" && field.value === productRecord.id,
      ),
      `BigCommerce product body did not include Backy product custom field: ${JSON.stringify(bigCommerceBody)}`,
    );
    const bigCommerceRefreshed = await getCollectionRecordBySlug(
      productCollection.id,
      productRecord.slug,
    );
    const bigCommercePersisted = readProductValue(
      bigCommerceRefreshed.values,
      "providerSync",
    );
    assert(
      bigCommercePersisted?.requestId === bigCommerceSync.requestId,
      `BigCommerce product provider sync was not persisted: ${JSON.stringify(bigCommerceRefreshed.values)}`,
    );
    assert(
      bigCommercePersisted.executionMode === "bigcommerce-api",
      `Persisted BigCommerce provider sync mode differed: ${JSON.stringify(bigCommercePersisted)}`,
    );
  }

  if (wooCommerceCatalogSyncEnabled()) {
    const beforeWooCommerceRequests = stripeCheckoutMock?.requests.length || 0;
    const wooCommercePayload = await requestApi(
      `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/provider-sync`,
      {
        method: "POST",
        body: JSON.stringify({ provider: "woocommerce" }),
      },
    );
    const wooCommerceSync =
      wooCommercePayload.data?.sync || wooCommercePayload.sync;
    assert(
      wooCommerceSync?.provider === "woocommerce",
      `WooCommerce product provider sync did not return WooCommerce metadata: ${JSON.stringify(wooCommercePayload).slice(0, 500)}`,
    );
    assert(
      wooCommerceSync.status === "synced",
      `WooCommerce product provider sync did not execute against the mock provider: ${JSON.stringify(wooCommerceSync)}`,
    );
    assert(
      wooCommerceSync.executionMode === "woocommerce-api",
      `WooCommerce product sync execution mode was unexpected: ${JSON.stringify(wooCommerceSync)}`,
    );
    assert(
      /^woocommerce_variable_mock_/.test(wooCommerceSync.product?.id || ""),
      `WooCommerce variable product id was not returned: ${JSON.stringify(wooCommerceSync)}`,
    );
    assert(
      /^woocommerce_variation_mock_/.test(wooCommerceSync.price?.id || ""),
      `WooCommerce variation id was not returned: ${JSON.stringify(wooCommerceSync)}`,
    );
    const wooCommerceRequests = stripeCheckoutMock.requests.slice(
      beforeWooCommerceRequests,
    );
    const wooProductRequest = wooCommerceRequests.find(
      (request) => request.method === "POST" && request.url === "/products",
    );
    const wooVariationRequests = wooCommerceRequests.filter(
      (request) =>
        request.method === "POST" &&
        /\/products\/[^/]+\/variations$/.test(request.url),
    );
    const expectedAuth = `Basic ${Buffer.from(`${process.env.BACKY_WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.BACKY_WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64")}`;
    assert(
      wooProductRequest?.headers.authorization === expectedAuth,
      `WooCommerce product sync did not send basic auth: ${JSON.stringify(wooProductRequest?.headers)}`,
    );
    const wooProductBody = JSON.parse(wooProductRequest.body || "{}");
    assert(
      wooProductBody.name === readProductValue(productRecord.values, "title"),
      `WooCommerce product body did not include product title: ${JSON.stringify(wooProductBody)}`,
    );
    assert(
      wooProductBody.type === "variable",
      `WooCommerce product body did not create a variable product for variants: ${JSON.stringify(wooProductBody)}`,
    );
    assert(
      wooProductBody.meta_data?.some(
        (field) =>
          field.key === "backy_product_id" && field.value === productRecord.id,
      ),
      `WooCommerce product body did not include Backy product metadata: ${JSON.stringify(wooProductBody)}`,
    );
    assert(
      wooVariationRequests.length === 4,
      `WooCommerce product sync did not create one variation per Backy variant: ${JSON.stringify(wooCommerceRequests)}`,
    );
    const firstWooVariationBody = JSON.parse(
      wooVariationRequests[0].body || "{}",
    );
    assert(
      firstWooVariationBody.attributes?.[0]?.name === "Variant",
      `WooCommerce variation body did not include Variant attribute: ${JSON.stringify(firstWooVariationBody)}`,
    );
    const wooCommerceRefreshed = await getCollectionRecordBySlug(
      productCollection.id,
      productRecord.slug,
    );
    const wooCommercePersisted = readProductValue(
      wooCommerceRefreshed.values,
      "providerSync",
    );
    assert(
      wooCommercePersisted?.requestId === wooCommerceSync.requestId,
      `WooCommerce product provider sync was not persisted: ${JSON.stringify(wooCommerceRefreshed.values)}`,
    );
    assert(
      wooCommercePersisted.executionMode === "woocommerce-api",
      `Persisted WooCommerce provider sync mode differed: ${JSON.stringify(wooCommercePersisted)}`,
    );
  }

  if (etsyCatalogSyncEnabled()) {
    const beforeEtsyRequests = stripeCheckoutMock?.requests.length || 0;
    const etsyPayload = await requestApi(
      `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/provider-sync`,
      {
        method: "POST",
        body: JSON.stringify({ provider: "etsy" }),
      },
    );
    const etsySync = etsyPayload.data?.sync || etsyPayload.sync;
    assert(
      etsySync?.provider === "etsy",
      `Etsy product provider sync did not return Etsy metadata: ${JSON.stringify(etsyPayload).slice(0, 500)}`,
    );
    assert(
      etsySync.status === "synced",
      `Etsy product provider sync did not execute against the mock provider: ${JSON.stringify(etsySync)}`,
    );
    assert(
      etsySync.executionMode === "etsy-api",
      `Etsy product sync execution mode was unexpected: ${JSON.stringify(etsySync)}`,
    );
    assert(
      /^etsy_listing_mock_/.test(etsySync.product?.id || ""),
      `Etsy listing id was not returned: ${JSON.stringify(etsySync)}`,
    );
    const etsyRequest = stripeCheckoutMock.requests
      .slice(beforeEtsyRequests)
      .find(
        (request) =>
          request.method === "POST" &&
          /^\/shops\/[^/]+\/listings$/.test(request.url),
      );
    assert(
      etsyRequest?.headers.authorization ===
        `Bearer ${process.env.BACKY_ETSY_ACCESS_TOKEN || process.env.ETSY_ACCESS_TOKEN}`,
      `Etsy product sync did not send bearer auth: ${JSON.stringify(etsyRequest?.headers)}`,
    );
    assert(
      etsyRequest?.headers["x-api-key"] ===
        (process.env.BACKY_ETSY_API_KEY || process.env.ETSY_API_KEY),
      `Etsy product sync did not send API key: ${JSON.stringify(etsyRequest?.headers)}`,
    );
    const etsyParams = new URLSearchParams(etsyRequest.body || "");
    const etsyForm = Object.fromEntries(etsyParams.entries());
    assert(
      etsyForm.title === readProductValue(productRecord.values, "title"),
      `Etsy listing body did not include product title: ${JSON.stringify(etsyForm)}`,
    );
    assert(
      etsyParams.getAll("sku[]").includes(readProductValue(productRecord.values, "sku")),
      `Etsy listing body did not include product SKU: ${JSON.stringify(etsyForm)}`,
    );
    assert(
      etsyForm.taxonomy_id ===
        (process.env.BACKY_ETSY_TAXONOMY_ID || process.env.ETSY_TAXONOMY_ID || "1"),
      `Etsy listing body did not include taxonomy id: ${JSON.stringify(etsyForm)}`,
    );
    const etsyRefreshed = await getCollectionRecordBySlug(
      productCollection.id,
      productRecord.slug,
    );
    const etsyPersisted = readProductValue(etsyRefreshed.values, "providerSync");
    assert(
      etsyPersisted?.requestId === etsySync.requestId,
      `Etsy product provider sync was not persisted: ${JSON.stringify(etsyRefreshed.values)}`,
    );
    assert(
      etsyPersisted.executionMode === "etsy-api",
      `Persisted Etsy provider sync mode differed: ${JSON.stringify(etsyPersisted)}`,
    );
  }

  if (magentoCatalogSyncEnabled()) {
    const beforeMagentoRequests = stripeCheckoutMock?.requests.length || 0;
    const magentoPayload = await requestApi(
      `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/provider-sync`,
      {
        method: "POST",
        body: JSON.stringify({ provider: "magento" }),
      },
    );
    const magentoSync = magentoPayload.data?.sync || magentoPayload.sync;
    assert(
      magentoSync?.provider === "magento",
      `Magento product provider sync did not return Magento metadata: ${JSON.stringify(magentoPayload).slice(0, 500)}`,
    );
    assert(
      magentoSync.status === "synced",
      `Magento product provider sync did not execute against the mock provider: ${JSON.stringify(magentoSync)}`,
    );
    assert(
      magentoSync.executionMode === "magento-api",
      `Magento product sync execution mode was unexpected: ${JSON.stringify(magentoSync)}`,
    );
    assert(
      /^magento_product_mock_/.test(magentoSync.product?.id || ""),
      `Magento product id was not returned: ${JSON.stringify(magentoSync)}`,
    );
    const magentoRequest = stripeCheckoutMock.requests
      .slice(beforeMagentoRequests)
      .find(
        (request) =>
          request.method === "POST" &&
          request.url === "/magento/V1/products",
      );
    assert(
      magentoRequest?.headers.authorization ===
        `Bearer ${process.env.BACKY_MAGENTO_ACCESS_TOKEN || process.env.MAGENTO_ACCESS_TOKEN}`,
      `Magento product sync did not send bearer auth: ${JSON.stringify(magentoRequest?.headers)}`,
    );
    const magentoBody = JSON.parse(magentoRequest.body || "{}");
    assert(
      magentoBody.product?.name === readProductValue(productRecord.values, "title"),
      `Magento product body did not include product title: ${JSON.stringify(magentoBody)}`,
    );
    assert(
      magentoBody.product?.sku === readProductValue(productRecord.values, "sku"),
      `Magento product body did not include product SKU: ${JSON.stringify(magentoBody)}`,
    );
    assert(
      magentoBody.product?.custom_attributes?.some(
        (attribute) =>
          attribute.attribute_code === "backy_product_id" &&
          attribute.value === productRecord.id,
      ),
      `Magento product body did not include Backy product metadata: ${JSON.stringify(magentoBody)}`,
    );
    const magentoRefreshed = await getCollectionRecordBySlug(
      productCollection.id,
      productRecord.slug,
    );
    const magentoPersisted = readProductValue(
      magentoRefreshed.values,
      "providerSync",
    );
    assert(
      magentoPersisted?.requestId === magentoSync.requestId,
      `Magento product provider sync was not persisted: ${JSON.stringify(magentoRefreshed.values)}`,
    );
    assert(
      magentoPersisted.executionMode === "magento-api",
      `Persisted Magento provider sync mode differed: ${JSON.stringify(magentoPersisted)}`,
    );
  }

  const beforeHttpRequests = commerceProviderMock?.requests.length || 0;
  const httpPayload = await requestApi(
    `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/provider-sync`,
    {
      method: "POST",
      body: JSON.stringify({ provider: "http" }),
    },
  );
  const httpSync = httpPayload.data?.sync || httpPayload.sync;
  const httpUpdated = httpPayload.data?.product || httpPayload.product;
  assert(
    httpSync?.provider === "http",
    `HTTP product provider sync did not return HTTP metadata: ${JSON.stringify(httpPayload).slice(0, 500)}`,
  );
  assert(
    httpSync.status === "synced",
    `HTTP product provider sync did not execute against the mock provider: ${JSON.stringify(httpSync)}`,
  );
  assert(
    httpSync.executionMode === "http-api",
    `HTTP product sync execution mode was unexpected: ${JSON.stringify(httpSync)}`,
  );
  assert(
    /^http_product_/.test(httpSync.product?.id || ""),
    `HTTP product sync did not persist provider product id: ${JSON.stringify(httpSync)}`,
  );
  assert(
    /^http_price_/.test(httpSync.price?.id || ""),
    `HTTP product sync did not persist provider price id: ${JSON.stringify(httpSync)}`,
  );
  assert(
    httpUpdated?.id === productRecord.id,
    `HTTP product provider sync did not return the updated product: ${JSON.stringify(httpUpdated)}`,
  );
  const catalogRequest = commerceProviderMock.requests
    .slice(beforeHttpRequests)
    .find((request) => request.url === "/catalog/products");
  assert(
    catalogRequest?.headers["x-backy-provider-kind"] === "product-catalog",
    `HTTP product sync did not mark provider kind: ${JSON.stringify(catalogRequest)}`,
  );
  assert(
    catalogRequest.payload?.schemaVersion === "backy.commerce-product-sync.v1",
    `HTTP product sync payload schema was unexpected: ${JSON.stringify(catalogRequest?.payload)}`,
  );
  assert(
    catalogRequest.payload?.siteId === SITE_ID,
    `HTTP product sync payload site id was unexpected: ${JSON.stringify(catalogRequest?.payload)}`,
  );
  assert(
    catalogRequest.payload?.product?.id === productRecord.id,
    `HTTP product sync payload product id was unexpected: ${JSON.stringify(catalogRequest?.payload)}`,
  );
  assert(
    catalogRequest.payload?.product?.subscription?.enabled === true,
    `HTTP product sync payload did not include subscription metadata: ${JSON.stringify(catalogRequest?.payload)}`,
  );

  const httpRefreshed = await getCollectionRecordBySlug(
    productCollection.id,
    productRecord.slug,
  );
  const httpPersisted = readProductValue(httpRefreshed.values, "providerSync");
  assert(
    httpPersisted?.requestId === httpSync.requestId,
    `HTTP product provider sync was not persisted: ${JSON.stringify(httpRefreshed.values)}`,
  );
  assert(
    httpPersisted.executionMode === "http-api",
    `Persisted HTTP provider sync mode differed: ${JSON.stringify(httpPersisted)}`,
  );

  return httpRefreshed;
};

const assertStripeCheckoutExecution = async ({
  productCollection,
  ordersCollection,
  customersCollection,
  productRecord,
  slug,
}) => {
  if (!stripeCheckoutExecutionEnabled()) {
    return {
      skipped: true,
      reason:
        "BACKY_STRIPE_SECRET_KEY and BACKY_STRIPE_API_BASE_URL mock env were not configured",
    };
  }

  const beforeRequests = stripeCheckoutMock?.requests.length || 0;
  const settingsBefore = await getSettings();
  await enableStripeCommerceSettings();

  try {
    const stripePayload = await requestApi(
      `/api/sites/${SITE_ID}/commerce/orders`,
      {
        method: "POST",
        body: JSON.stringify({
          customer: {
            name: "Commerce Stripe Smoke Buyer",
            email: "commerce-stripe-smoke@example.com",
          },
          items: [{ slug, quantity: 1 }],
          shippingAddress: "200 Provider Street, New York, NY",
          billingAddress: "200 Provider Street, New York, NY",
          notes:
            "Smoke subscription order created through Stripe checkout execution.",
        }),
      },
    );

    const checkoutSession = stripePayload.data?.checkoutSession;
    const order = stripePayload.data?.order;
    assert(
      checkoutSession?.provider === "stripe",
      `Stripe checkout did not select Stripe provider: ${JSON.stringify(checkoutSession)}`,
    );
    assert(
      checkoutSession.status === "provider_created",
      `Stripe checkout was not executed: ${JSON.stringify(checkoutSession)}`,
    );
    assert(
      /^cs_mock_/.test(checkoutSession.id),
      `Stripe checkout did not return provider session id: ${JSON.stringify(checkoutSession)}`,
    );
    assert(
      checkoutSession.url ===
        `${STRIPE_MOCK_BASE_URL}/checkout/${checkoutSession.id}`,
      `Stripe checkout did not expose provider URL: ${JSON.stringify(checkoutSession)}`,
    );
    assert(
      checkoutSession.reference === `stripe:${checkoutSession.id}`,
      `Stripe checkout reference did not use provider session id: ${JSON.stringify(checkoutSession)}`,
    );
    assert(
      checkoutSession.amountTotal === 49,
      `Stripe subscription checkout amount was unexpected: ${JSON.stringify(checkoutSession)}`,
    );
    assert(
      checkoutSession.providerPayload?.mode === "subscription",
      `Stripe provider payload did not switch to subscription mode: ${JSON.stringify(checkoutSession.providerPayload)}`,
    );
    assert(
      checkoutSession.providerPayload?.providerResponse?.id ===
        checkoutSession.id,
      `Stripe provider response was not exposed safely: ${JSON.stringify(checkoutSession.providerPayload)}`,
    );

    const stripeRequest = stripeCheckoutMock.requests[beforeRequests];
    assert(
      stripeRequest?.method === "POST" &&
        stripeRequest.url === "/v1/checkout/sessions",
      `Stripe mock did not receive checkout session create: ${JSON.stringify(stripeCheckoutMock.requests)}`,
    );
    const expectedSecret =
      process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    assert(
      stripeRequest.headers.authorization === `Bearer ${expectedSecret}`,
      `Stripe mock did not receive bearer auth: ${JSON.stringify(stripeRequest.headers)}`,
    );
    assert(
      stripeRequest.form.mode === "subscription",
      `Stripe checkout form did not request subscription mode: ${JSON.stringify(stripeRequest.form)}`,
    );
    assert(
      stripeRequest.form.client_reference_id ===
        checkoutSession.metadata.orderNumber,
      `Stripe checkout form did not include order reference: ${JSON.stringify(stripeRequest.form)}`,
    );
    assert(
      stripeRequest.form["metadata[siteId]"] === SITE_ID,
      `Stripe checkout form did not include site metadata: ${JSON.stringify(stripeRequest.form)}`,
    );
    assert(
      stripeRequest.form["metadata[orderSlug]"] ===
        checkoutSession.metadata.orderSlug,
      `Stripe checkout form did not include order slug metadata: ${JSON.stringify(stripeRequest.form)}`,
    );
    assert(
      stripeRequest.form.success_url?.includes("{CHECKOUT_SESSION_ID}"),
      `Stripe checkout success URL did not include provider session placeholder: ${JSON.stringify(stripeRequest.form)}`,
    );
    assert(
      stripeRequest.form["line_items[0][price_data][recurring][interval]"] ===
        "month",
      `Stripe checkout did not send monthly recurring price data: ${JSON.stringify(stripeRequest.form)}`,
    );
    assert(
      stripeRequest.form["subscription_data[trial_period_days]"] === "14",
      `Stripe checkout did not send the product trial days: ${JSON.stringify(stripeRequest.form)}`,
    );
    assert(
      Number(stripeRequest.form["line_items[0][price_data][unit_amount]"]) ===
        Math.round(checkoutSession.amountTotal * 100),
      `Stripe checkout amount did not match subscription price: ${JSON.stringify({ form: stripeRequest.form, checkoutSession })}`,
    );
    assert(
      stripeRequest.form["metadata[amountTotal]"] ===
        String(checkoutSession.amountTotal),
      `Stripe checkout metadata did not include quote total: ${JSON.stringify(stripeRequest.form)}`,
    );

    let orderRecord = await getCollectionRecordBySlug(
      ordersCollection.id,
      order.slug,
    );
    assert(
      orderRecord.values?.checkoutsessionid === checkoutSession.id,
      `Stripe checkout session id was not persisted: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      orderRecord.values?.paymentprovider === "stripe",
      `Stripe payment provider was not persisted: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      orderRecord.values?.paymentreference === `stripe:${checkoutSession.id}`,
      `Stripe payment reference was not persisted: ${JSON.stringify(orderRecord.values)}`,
    );

    const subscriptionWebhookPayload = await postCommerceWebhook(
      {
        id: `evt_sub_${slug}`,
        type: "checkout.session.completed",
        data: {
          object: {
            id: checkoutSession.id,
            subscription: `sub_${slug}`,
            amount_total: Math.round(checkoutSession.amountTotal * 100),
            currency: checkoutSession.currency.toLowerCase(),
            metadata: {
              orderNumber: order.orderNumber,
              orderSlug: order.slug,
            },
          },
        },
      },
      { "x-request-id": `commerce-subscription-webhook-${slug}` },
    );
    assert(
      subscriptionWebhookPayload.data?.event?.status === "paid",
      `Stripe subscription webhook did not mark payment paid: ${JSON.stringify(subscriptionWebhookPayload)}`,
    );
    assert(
      subscriptionWebhookPayload.data?.order?.paymentReference ===
        `sub_${slug}`,
      `Stripe subscription webhook did not return the subscription reference: ${JSON.stringify(subscriptionWebhookPayload)}`,
    );
    orderRecord = await getCollectionRecordBySlug(
      ordersCollection.id,
      order.slug,
    );
    assert(
      orderRecord.values?.paymentstatus === "paid",
      `Stripe subscription webhook did not persist paid status: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      orderRecord.values?.paymentreference === `sub_${slug}`,
      `Stripe subscription webhook did not persist subscription reference: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      String(orderRecord.values?.notes || "").includes(
        "checkout.session.completed",
      ),
      `Stripe subscription webhook settlement note missing: ${JSON.stringify(orderRecord.values)}`,
    );

    const renewalInvoicePayload = await postCommerceWebhook(
      {
        id: `evt_invoice_${slug}`,
        type: "invoice.payment_succeeded",
        data: {
          object: {
            id: `in_${slug}`,
            object: "invoice",
            subscription: `sub_${slug}`,
            payment_intent: `pi_invoice_${slug}`,
            amount_paid: Math.round(checkoutSession.amountTotal * 100),
            currency: checkoutSession.currency.toLowerCase(),
            metadata: {
              orderNumber: order.orderNumber,
              orderSlug: order.slug,
            },
          },
        },
      },
      { "x-request-id": `commerce-subscription-invoice-${slug}` },
    );
    assert(
      renewalInvoicePayload.data?.event?.status === "paid",
      `Stripe subscription renewal invoice did not mark payment paid: ${JSON.stringify(renewalInvoicePayload)}`,
    );
    assert(
      renewalInvoicePayload.data?.order?.paymentReference === `sub_${slug}`,
      `Stripe subscription renewal invoice should keep the subscription reference: ${JSON.stringify(renewalInvoicePayload)}`,
    );
    orderRecord = await getCollectionRecordBySlug(
      ordersCollection.id,
      order.slug,
    );
    assert(
      orderRecord.values?.paymentstatus === "paid",
      `Stripe subscription renewal invoice changed paid status unexpectedly: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      orderRecord.values?.paymentreference === `sub_${slug}`,
      `Stripe subscription renewal invoice did not preserve subscription reference: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      String(orderRecord.values?.notes || "").includes(
        "invoice.payment_succeeded",
      ),
      `Stripe subscription renewal invoice settlement note missing: ${JSON.stringify(orderRecord.values)}`,
    );

    const dunningPayload = await postCommerceWebhook(
      {
        id: `evt_subscription_past_due_${slug}`,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: `sub_${slug}`,
            object: "subscription",
            status: "past_due",
            metadata: {
              orderNumber: order.orderNumber,
              orderSlug: order.slug,
            },
          },
        },
      },
      { "x-request-id": `commerce-subscription-dunning-${slug}` },
    );
    assert(
      dunningPayload.data?.event?.status === "failed",
      `Stripe subscription dunning webhook did not mark payment failed: ${JSON.stringify(dunningPayload)}`,
    );
    assert(
      dunningPayload.data?.order?.paymentReference === `sub_${slug}`,
      `Stripe subscription dunning webhook should keep the subscription reference: ${JSON.stringify(dunningPayload)}`,
    );
    orderRecord = await getCollectionRecordBySlug(
      ordersCollection.id,
      order.slug,
    );
    assert(
      orderRecord.values?.paymentstatus === "failed",
      `Stripe subscription dunning webhook did not persist failed payment state: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      orderRecord.values?.paymentreference === `sub_${slug}`,
      `Stripe subscription dunning webhook did not preserve subscription reference: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      String(orderRecord.values?.notes || "").includes(
        "customer.subscription.updated",
      ),
      `Stripe subscription dunning settlement note missing: ${JSON.stringify(orderRecord.values)}`,
    );

    const pausedPayload = await postCommerceWebhook(
      {
        id: `evt_subscription_paused_${slug}`,
        type: "customer.subscription.paused",
        data: {
          object: {
            id: `sub_${slug}`,
            object: "subscription",
            status: "paused",
            metadata: {
              orderNumber: order.orderNumber,
              orderSlug: order.slug,
            },
          },
        },
      },
      { "x-request-id": `commerce-subscription-paused-${slug}` },
    );
    assert(
      pausedPayload.data?.event?.status === "paused",
      `Stripe subscription pause webhook did not record paused lifecycle state: ${JSON.stringify(pausedPayload)}`,
    );
    assert(
      pausedPayload.data?.order?.paymentReference === `sub_${slug}`,
      `Stripe subscription pause webhook should keep the subscription reference: ${JSON.stringify(pausedPayload)}`,
    );
    orderRecord = await getCollectionRecordBySlug(
      ordersCollection.id,
      order.slug,
    );
    assert(
      orderRecord.values?.paymentreference === `sub_${slug}`,
      `Stripe subscription pause webhook did not preserve subscription reference: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      String(orderRecord.values?.notes || "").includes(
        "customer.subscription.paused",
      ),
      `Stripe subscription pause lifecycle note missing: ${JSON.stringify(orderRecord.values)}`,
    );

    const resumedPayload = await postCommerceWebhook(
      {
        id: `evt_subscription_resumed_${slug}`,
        type: "customer.subscription.resumed",
        data: {
          object: {
            id: `sub_${slug}`,
            object: "subscription",
            status: "active",
            metadata: {
              orderNumber: order.orderNumber,
              orderSlug: order.slug,
            },
          },
        },
      },
      { "x-request-id": `commerce-subscription-resumed-${slug}` },
    );
    assert(
      resumedPayload.data?.event?.status === "resumed",
      `Stripe subscription resume webhook did not record resumed lifecycle state: ${JSON.stringify(resumedPayload)}`,
    );
    assert(
      resumedPayload.data?.order?.paymentReference === `sub_${slug}`,
      `Stripe subscription resume webhook should keep the subscription reference: ${JSON.stringify(resumedPayload)}`,
    );
    orderRecord = await getCollectionRecordBySlug(
      ordersCollection.id,
      order.slug,
    );
    assert(
      orderRecord.values?.paymentstatus === "paid",
      `Stripe subscription resume webhook did not restore paid payment state: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      orderRecord.values?.paymentreference === `sub_${slug}`,
      `Stripe subscription resume webhook did not preserve subscription reference: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      String(orderRecord.values?.notes || "").includes(
        "customer.subscription.resumed",
      ),
      `Stripe subscription resume lifecycle note missing: ${JSON.stringify(orderRecord.values)}`,
    );

    const trialEndingPayload = await postCommerceWebhook(
      {
        id: `evt_subscription_trial_end_${slug}`,
        type: "customer.subscription.trial_will_end",
        data: {
          object: {
            id: `sub_${slug}`,
            object: "subscription",
            status: "trialing",
            metadata: {
              orderNumber: order.orderNumber,
              orderSlug: order.slug,
            },
          },
        },
      },
      { "x-request-id": `commerce-subscription-trial-ending-${slug}` },
    );
    assert(
      trialEndingPayload.data?.event?.status === "trial_will_end",
      `Stripe subscription trial-ending webhook did not record trial lifecycle state: ${JSON.stringify(trialEndingPayload)}`,
    );
    assert(
      trialEndingPayload.data?.order?.paymentReference === `sub_${slug}`,
      `Stripe subscription trial-ending webhook should keep the subscription reference: ${JSON.stringify(trialEndingPayload)}`,
    );
    orderRecord = await getCollectionRecordBySlug(
      ordersCollection.id,
      order.slug,
    );
    assert(
      orderRecord.values?.paymentreference === `sub_${slug}`,
      `Stripe subscription trial-ending webhook did not preserve subscription reference: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      String(orderRecord.values?.notes || "").includes(
        "customer.subscription.trial_will_end",
      ),
      `Stripe subscription trial-ending lifecycle note missing: ${JSON.stringify(orderRecord.values)}`,
    );

    const cancellationPayload = await postCommerceWebhook(
      {
        id: `evt_subscription_deleted_${slug}`,
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: `sub_${slug}`,
            object: "subscription",
            status: "canceled",
            metadata: {
              orderNumber: order.orderNumber,
              orderSlug: order.slug,
            },
          },
        },
      },
      { "x-request-id": `commerce-subscription-cancelled-${slug}` },
    );
    assert(
      cancellationPayload.data?.event?.status === "cancelled",
      `Stripe subscription cancellation webhook did not cancel the order: ${JSON.stringify(cancellationPayload)}`,
    );
    assert(
      cancellationPayload.data?.order?.paymentReference === `sub_${slug}`,
      `Stripe subscription cancellation webhook should keep the subscription reference: ${JSON.stringify(cancellationPayload)}`,
    );
    orderRecord = await getCollectionRecordBySlug(
      ordersCollection.id,
      order.slug,
    );
    assert(
      orderRecord.values?.orderstatus === "cancelled",
      `Stripe subscription cancellation webhook did not persist cancelled order state: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      orderRecord.values?.fulfillmentstatus === "cancelled",
      `Stripe subscription cancellation webhook did not cancel fulfillment: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      orderRecord.values?.paymentreference === `sub_${slug}`,
      `Stripe subscription cancellation webhook did not preserve subscription reference: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      String(orderRecord.values?.notes || "").includes(
        "customer.subscription.deleted",
      ),
      `Stripe subscription cancellation settlement note missing: ${JSON.stringify(orderRecord.values)}`,
    );

    const subscriptionAnalyticsPayload = await requestApi(
      `/api/admin/sites/${SITE_ID}/commerce/orders/analytics`,
    );
    const subscriptionAnalytics = subscriptionAnalyticsPayload.data?.analytics;
    assert(
      subscriptionAnalytics?.operations?.subscriptionOrderCount >= 1,
      `Order analytics did not count subscription orders: ${JSON.stringify(subscriptionAnalyticsPayload).slice(0, 500)}`,
    );
    assert(
      subscriptionAnalytics.operations.subscriptionRenewalCount >= 1,
      `Order analytics did not count subscription renewals: ${JSON.stringify(subscriptionAnalyticsPayload).slice(0, 500)}`,
    );
    assert(
      subscriptionAnalytics.operations.subscriptionDunningCount >= 1,
      `Order analytics did not count subscription dunning attention: ${JSON.stringify(subscriptionAnalyticsPayload).slice(0, 500)}`,
    );
    assert(
      subscriptionAnalytics.operations.subscriptionPausedCount >= 1,
      `Order analytics did not count subscription pauses: ${JSON.stringify(subscriptionAnalyticsPayload).slice(0, 500)}`,
    );
    assert(
      subscriptionAnalytics.operations.subscriptionResumedCount >= 1,
      `Order analytics did not count subscription resumes: ${JSON.stringify(subscriptionAnalyticsPayload).slice(0, 500)}`,
    );
    assert(
      subscriptionAnalytics.operations.subscriptionTrialEndingCount >= 1,
      `Order analytics did not count subscription trial-ending notices: ${JSON.stringify(subscriptionAnalyticsPayload).slice(0, 500)}`,
    );
    assert(
      subscriptionAnalytics.operations.subscriptionCancelledCount >= 1,
      `Order analytics did not count subscription cancellations: ${JSON.stringify(subscriptionAnalyticsPayload).slice(0, 500)}`,
    );

    const lifecyclePayload = await requestApi(
      `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions`,
    );
    const lifecycle =
      lifecyclePayload.data?.lifecycle || lifecyclePayload.lifecycle;
    assert(
      lifecycle?.schemaVersion === "backy.product-subscription-lifecycle.v1",
      `Product subscription lifecycle schema was unexpected: ${JSON.stringify(lifecyclePayload).slice(0, 500)}`,
    );
    assert(
      lifecycle.product?.id === productRecord.id,
      `Product subscription lifecycle targeted the wrong product: ${JSON.stringify(lifecycle?.product)}`,
    );
    assert(
      lifecycle.summary?.total >= 1,
      `Product subscription lifecycle did not count subscription orders: ${JSON.stringify(lifecycle?.summary)}`,
    );
    assert(
      lifecycle.summary?.cancelled >= 1,
      `Product subscription lifecycle did not count cancellation settlement: ${JSON.stringify(lifecycle?.summary)}`,
    );
    assert(
      lifecycle.subscriptions?.some(
        (entry) => entry.subscriptionReference === `sub_${slug}`,
      ),
      `Product subscription lifecycle did not expose the subscription reference: ${JSON.stringify(lifecycle?.subscriptions)}`,
    );
    const stripeLifecycleEntry = lifecycle.subscriptions?.find(
      (entry) => entry.subscriptionReference === `sub_${slug}`,
    );
    assert(
      stripeLifecycleEntry?.paymentProvider === "stripe",
      `Product subscription lifecycle did not expose payment provider readiness: ${JSON.stringify(stripeLifecycleEntry)}`,
    );
    assert(
      stripeLifecycleEntry?.actionExecutionMode === "stripe-api",
      `Product subscription lifecycle did not expose Stripe execution readiness: ${JSON.stringify(stripeLifecycleEntry)}`,
    );
    assert(
      stripeLifecycleEntry?.actionExecutionModes?.pause === "stripe-api" &&
        stripeLifecycleEntry?.actionExecutionModes?.resume === "stripe-api" &&
        stripeLifecycleEntry?.actionExecutionModes?.cancel === "stripe-api",
      `Product subscription lifecycle did not expose per-action execution readiness: ${JSON.stringify(stripeLifecycleEntry)}`,
    );
    const stripeCancelAction = stripeLifecycleEntry?.actionPlan?.availableActions?.find(
      (action) => action.action === "cancel",
    );
    assert(
      stripeLifecycleEntry?.actionPlan?.schemaVersion ===
        "backy.product-subscription-action-plan.v1" &&
        Array.isArray(stripeLifecycleEntry?.actionPlan?.availableActions) &&
        stripeCancelAction?.executionMode === "stripe-api" &&
        typeof stripeCancelAction.enabled === "boolean" &&
        (
          stripeCancelAction.enabled === true ||
          (
            stripeLifecycleEntry.actionPlan.status === "cancelled" &&
            String(stripeCancelAction.reason || "").includes("already cancelled")
          )
        ),
      `Product subscription lifecycle did not expose per-order action plan: ${JSON.stringify(stripeLifecycleEntry)}`,
    );
    assert(
      lifecycle.actionPlan?.schemaVersion ===
        "backy.product-subscription-action-plan-summary.v1" &&
        Number.isFinite(lifecycle.actionPlan.attentionRequired) &&
        Number.isFinite(lifecycle.actionPlan.executableNow),
      `Product subscription lifecycle did not expose action plan summary: ${JSON.stringify(lifecycle?.actionPlan)}`,
    );
    assert(
      lifecycle.execution?.schemaVersion ===
        "backy.product-subscription-execution-readiness.v1",
      `Product subscription execution readiness schema was unexpected: ${JSON.stringify(lifecycle?.execution)}`,
    );
    assert(
      lifecycle.execution?.summary?.executableSubscriptions >= 1,
      `Product subscription execution readiness did not count executable subscriptions: ${JSON.stringify(lifecycle?.execution)}`,
    );
    assert(
      lifecycle.execution?.providers?.some(
        (provider) =>
          provider.provider === "stripe" &&
          provider.configured === true &&
          provider.executionMode === "stripe-api",
      ),
      `Product subscription execution readiness omitted Stripe provider state: ${JSON.stringify(lifecycle?.execution)}`,
    );
    if (paypalSubscriptionExecutionEnabled()) {
      assert(
        lifecycle.execution?.providers?.some(
          (provider) =>
            provider.provider === "paypal" &&
            provider.configured === true &&
            provider.executionMode === "paypal-api",
        ),
        `Product subscription execution readiness omitted PayPal provider state: ${JSON.stringify(lifecycle?.execution)}`,
      );
    }
    if (paddleSubscriptionExecutionEnabled()) {
      assert(
        lifecycle.execution?.providers?.some(
          (provider) =>
            provider.provider === "paddle" &&
            provider.configured === true &&
            provider.executionMode === "paddle-api",
        ),
        `Product subscription execution readiness omitted Paddle provider state: ${JSON.stringify(lifecycle?.execution)}`,
      );
    }
    if (squareSubscriptionExecutionEnabled()) {
      assert(
        lifecycle.execution?.providers?.some(
          (provider) =>
            provider.provider === "square" &&
            provider.configured === true &&
            provider.executionMode === "square-api",
        ),
        `Product subscription execution readiness omitted Square provider state: ${JSON.stringify(lifecycle?.execution)}`,
      );
    }
    if (adyenSubscriptionExecutionEnabled()) {
      assert(
        lifecycle.execution?.providers?.some(
          (provider) =>
            provider.provider === "adyen" &&
            provider.configured === true &&
            provider.executionMode === "adyen-api" &&
            Array.isArray(provider.nativeDirectActions),
        ),
        `Product subscription execution readiness omitted Adyen provider state: ${JSON.stringify(lifecycle?.execution)}`,
      );
    }
    if (mollieSubscriptionExecutionEnabled()) {
      assert(
        lifecycle.execution?.providers?.some(
          (provider) =>
            provider.provider === "mollie" &&
            provider.configured === true &&
            provider.executionMode === "mollie-api" &&
            Array.isArray(provider.nativeDirectActions),
        ),
        `Product subscription execution readiness omitted Mollie provider state: ${JSON.stringify(lifecycle?.execution)}`,
      );
    }
    if (razorpaySubscriptionExecutionEnabled()) {
      assert(
        lifecycle.execution?.providers?.some(
          (provider) =>
            provider.provider === "razorpay" &&
            provider.configured === true &&
            provider.executionMode === "razorpay-api",
        ),
        `Product subscription execution readiness omitted Razorpay provider state: ${JSON.stringify(lifecycle?.execution)}`,
      );
    }
    if (httpSubscriptionExecutionEnabled()) {
      assert(
        lifecycle.execution?.providers?.some(
          (provider) =>
            provider.provider === "http" &&
            provider.configured === true &&
            provider.executionMode === "http-api",
        ),
        `Product subscription execution readiness omitted HTTP provider state: ${JSON.stringify(lifecycle?.execution)}`,
      );
    }
    assert(
      lifecycle.contract?.webhookApi?.includes("/commerce/webhook"),
      `Product subscription lifecycle contract omitted webhook API: ${JSON.stringify(lifecycle?.contract)}`,
    );

    const beforeActionRequests = stripeCheckoutMock.requests.length;
    const actionPayload = await requestApi(
      `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions/${orderRecord.id}/action`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "cancel",
          reason: "Smoke provider subscription cancellation action.",
        }),
      },
    );
    const subscriptionAction =
      actionPayload.data?.action || actionPayload.action;
    assert(
      subscriptionAction?.schemaVersion ===
        "backy.product-subscription-action.v1",
      `Subscription action schema was unexpected: ${JSON.stringify(actionPayload).slice(0, 500)}`,
    );
    assert(
      subscriptionAction.status === "succeeded",
      `Subscription action did not execute against Stripe mock: ${JSON.stringify(subscriptionAction)}`,
    );
    assert(
      subscriptionAction.executionMode === "stripe-api",
      `Subscription action did not use Stripe execution: ${JSON.stringify(subscriptionAction)}`,
    );
    assert(
      subscriptionAction.subscriptionReference === `sub_${slug}`,
      `Subscription action used the wrong subscription reference: ${JSON.stringify(subscriptionAction)}`,
    );
    const actionRequest = stripeCheckoutMock.requests
      .slice(beforeActionRequests)
      .find(
        (request) =>
          request.method === "DELETE" &&
          request.url === `/v1/subscriptions/sub_${slug}`,
      );
    assert(
      actionRequest,
      `Stripe mock did not receive subscription cancellation action: ${JSON.stringify(stripeCheckoutMock.requests.slice(beforeActionRequests))}`,
    );
    assert(
      actionRequest.headers.authorization === `Bearer ${expectedSecret}`,
      `Stripe subscription action did not send bearer auth: ${JSON.stringify(actionRequest.headers)}`,
    );
    assert(
      actionRequest.form["metadata[backy_subscription_action]"] === "cancel",
      `Stripe subscription action omitted action metadata: ${JSON.stringify(actionRequest.form)}`,
    );
    orderRecord = await getCollectionRecordBySlug(
      ordersCollection.id,
      order.slug,
    );
    assert(
      String(orderRecord.values?.notes || "").includes(
        "Subscription action executed succeeded",
      ),
      `Subscription action note was not persisted: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      Array.isArray(orderRecord.values?.subscriptionactionhistory),
      `Subscription action history was not persisted: ${JSON.stringify(orderRecord.values)}`,
    );
    assert(
      orderRecord.values.subscriptionactionhistory[0]?.id ===
        subscriptionAction.id,
      `Subscription action history did not store the latest action id: ${JSON.stringify(orderRecord.values.subscriptionactionhistory)}`,
    );
    assert(
      orderRecord.values.subscriptionactionhistory[0]?.executionMode ===
        "stripe-api",
      `Subscription action history did not store execution mode: ${JSON.stringify(orderRecord.values.subscriptionactionhistory)}`,
    );

    const lifecycleAfterActionPayload = await requestApi(
      `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions`,
    );
    const lifecycleAfterAction =
      lifecycleAfterActionPayload.data?.lifecycle ||
      lifecycleAfterActionPayload.lifecycle;
    const lifecycleActionEntry = lifecycleAfterAction?.subscriptions?.find(
      (entry) => entry.subscriptionReference === `sub_${slug}`,
    );
    assert(
      lifecycleActionEntry?.lastAction?.id === subscriptionAction.id,
      `Product lifecycle did not expose last subscription action: ${JSON.stringify(lifecycleActionEntry)}`,
    );
    assert(
      lifecycleActionEntry?.actionHistory?.[0]?.executionMode === "stripe-api",
      `Product lifecycle did not expose subscription action history: ${JSON.stringify(lifecycleActionEntry)}`,
    );

    if (paypalSubscriptionExecutionEnabled()) {
      const beforePayPalActionRequests = stripeCheckoutMock.requests.length;
      const paypalActionPayload = await requestApi(
        `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions/${orderRecord.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "cancel",
            provider: "paypal",
            subscriptionReference: `I-${slug}`,
            reason: "Smoke PayPal subscription cancellation action.",
          }),
        },
      );
      const paypalSubscriptionAction =
        paypalActionPayload.data?.action || paypalActionPayload.action;
      assert(
        paypalSubscriptionAction?.status === "succeeded",
        `PayPal subscription action did not execute against mock: ${JSON.stringify(paypalActionPayload).slice(0, 500)}`,
      );
      assert(
        paypalSubscriptionAction.executionMode === "paypal-api",
        `PayPal subscription action did not use PayPal execution: ${JSON.stringify(paypalSubscriptionAction)}`,
      );
      assert(
        paypalSubscriptionAction.subscriptionReference === `I-${slug}`,
        `PayPal subscription action used the wrong subscription reference: ${JSON.stringify(paypalSubscriptionAction)}`,
      );
      const paypalActionRequest = stripeCheckoutMock.requests
        .slice(beforePayPalActionRequests)
        .find(
          (request) =>
            request.method === "POST" &&
            request.url === `/v1/billing/subscriptions/I-${slug}/cancel`,
        );
      assert(
        paypalActionRequest,
        `PayPal mock did not receive subscription cancellation action: ${JSON.stringify(stripeCheckoutMock.requests.slice(beforePayPalActionRequests))}`,
      );
      assert(
        paypalActionRequest.headers.authorization ===
          `Bearer ${process.env.BACKY_PAYPAL_ACCESS_TOKEN || process.env.PAYPAL_ACCESS_TOKEN}`,
        `PayPal subscription action did not send bearer auth: ${JSON.stringify(paypalActionRequest.headers)}`,
      );
      assert(
        paypalActionRequest.headers["paypal-request-id"],
        `PayPal subscription action did not send idempotency header: ${JSON.stringify(paypalActionRequest.headers)}`,
      );
    }

    if (paddleSubscriptionExecutionEnabled()) {
      const beforePaddleActionRequests = stripeCheckoutMock.requests.length;
      const paddleActionPayload = await requestApi(
        `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions/${orderRecord.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "pause",
            provider: "paddle",
            subscriptionReference: `sub_paddle_${slug}`,
            reason: "Smoke Paddle subscription pause action.",
          }),
        },
      );
      const paddleSubscriptionAction =
        paddleActionPayload.data?.action || paddleActionPayload.action;
      assert(
        paddleSubscriptionAction?.status === "succeeded",
        `Paddle subscription action did not execute against mock: ${JSON.stringify(paddleActionPayload).slice(0, 500)}`,
      );
      assert(
        paddleSubscriptionAction.executionMode === "paddle-api",
        `Paddle subscription action did not use Paddle execution: ${JSON.stringify(paddleSubscriptionAction)}`,
      );
      assert(
        paddleSubscriptionAction.subscriptionReference === `sub_paddle_${slug}`,
        `Paddle subscription action used the wrong subscription reference: ${JSON.stringify(paddleSubscriptionAction)}`,
      );
      const paddleActionRequest = stripeCheckoutMock.requests
        .slice(beforePaddleActionRequests)
        .find(
          (request) =>
            request.method === "POST" &&
            request.url === `/subscriptions/sub_paddle_${slug}/pause`,
        );
      assert(
        paddleActionRequest,
        `Paddle mock did not receive subscription pause action: ${JSON.stringify(stripeCheckoutMock.requests.slice(beforePaddleActionRequests))}`,
      );
      assert(
        paddleActionRequest.headers.authorization ===
          `Bearer ${process.env.BACKY_PADDLE_API_KEY || process.env.PADDLE_API_KEY}`,
        `Paddle subscription action did not send bearer auth: ${JSON.stringify(paddleActionRequest.headers)}`,
      );
      const paddleActionBody = JSON.parse(paddleActionRequest.body || "{}");
      assert(
        paddleActionBody.effective_from === "next_billing_period",
        `Paddle subscription pause body was unexpected: ${JSON.stringify(paddleActionBody)}`,
      );
    }

    if (squareSubscriptionExecutionEnabled()) {
      const beforeSquareActionRequests = stripeCheckoutMock.requests.length;
      const squareActionPayload = await requestApi(
        `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions/${orderRecord.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "pause",
            provider: "square",
            subscriptionReference: `sq_sub_${slug}`,
            reason: "Smoke Square subscription pause action.",
          }),
        },
      );
      const squareSubscriptionAction =
        squareActionPayload.data?.action || squareActionPayload.action;
      assert(
        squareSubscriptionAction?.status === "succeeded",
        `Square subscription action did not execute against mock: ${JSON.stringify(squareActionPayload).slice(0, 500)}`,
      );
      assert(
        squareSubscriptionAction.executionMode === "square-api",
        `Square subscription action did not use Square execution: ${JSON.stringify(squareSubscriptionAction)}`,
      );
      assert(
        squareSubscriptionAction.subscriptionReference === `sq_sub_${slug}`,
        `Square subscription action used the wrong subscription reference: ${JSON.stringify(squareSubscriptionAction)}`,
      );
      const squareActionRequest = stripeCheckoutMock.requests
        .slice(beforeSquareActionRequests)
        .find(
          (request) =>
            request.method === "POST" &&
            request.url === `/v2/subscriptions/sq_sub_${slug}/pause`,
        );
      assert(
        squareActionRequest,
        `Square mock did not receive subscription pause action: ${JSON.stringify(stripeCheckoutMock.requests.slice(beforeSquareActionRequests))}`,
      );
      assert(
        squareActionRequest.headers.authorization ===
          `Bearer ${process.env.BACKY_SQUARE_ACCESS_TOKEN || process.env.SQUARE_ACCESS_TOKEN}`,
        `Square subscription action did not send bearer auth: ${JSON.stringify(squareActionRequest.headers)}`,
      );
      assert(
        squareActionRequest.headers["square-version"] ===
          (process.env.BACKY_SQUARE_VERSION ||
            process.env.SQUARE_VERSION ||
            "2026-01-22"),
        `Square subscription action did not send Square-Version: ${JSON.stringify(squareActionRequest.headers)}`,
      );
      const squareActionBody = JSON.parse(squareActionRequest.body || "{}");
      assert(
        squareActionBody.pause_reason ===
          "Smoke Square subscription pause action.",
        `Square subscription pause body was unexpected: ${JSON.stringify(squareActionBody)}`,
      );
    }

    if (adyenSubscriptionExecutionEnabled()) {
      const beforeAdyenActionRequests = stripeCheckoutMock.requests.length;
      const adyenActionPayload = await requestApi(
        `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions/${orderRecord.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "cancel",
            provider: "adyen",
            subscriptionReference: `shopper_${slug}:adyen_recurring_${slug}`,
            reason: "Smoke Adyen subscription cancellation action.",
          }),
        },
      );
      const adyenSubscriptionAction =
        adyenActionPayload.data?.action || adyenActionPayload.action;
      assert(
        adyenSubscriptionAction?.status === "succeeded",
        `Adyen subscription action did not execute against mock: ${JSON.stringify(adyenActionPayload).slice(0, 500)}`,
      );
      assert(
        adyenSubscriptionAction.executionMode === "adyen-api",
        `Adyen subscription action did not use Adyen execution: ${JSON.stringify(adyenSubscriptionAction)}`,
      );
      assert(
        adyenSubscriptionAction.subscriptionReference ===
          `shopper_${slug}:adyen_recurring_${slug}`,
        `Adyen subscription action used the wrong subscription reference: ${JSON.stringify(adyenSubscriptionAction)}`,
      );
      const adyenActionRequest = stripeCheckoutMock.requests
        .slice(beforeAdyenActionRequests)
        .find(
          (request) => request.method === "POST" && request.url === "/disable",
        );
      assert(
        adyenActionRequest,
        `Adyen mock did not receive subscription cancellation action: ${JSON.stringify(stripeCheckoutMock.requests.slice(beforeAdyenActionRequests))}`,
      );
      assert(
        adyenActionRequest.headers["x-api-key"] ===
          (process.env.BACKY_ADYEN_API_KEY || process.env.ADYEN_API_KEY),
        `Adyen subscription action did not send API key auth: ${JSON.stringify(adyenActionRequest.headers)}`,
      );
      const adyenActionBody = JSON.parse(adyenActionRequest.body || "{}");
      assert(
        adyenActionBody.merchantAccount ===
          (process.env.BACKY_ADYEN_MERCHANT_ACCOUNT ||
            process.env.ADYEN_MERCHANT_ACCOUNT),
        `Adyen subscription action did not send merchant account: ${JSON.stringify(adyenActionBody)}`,
      );
      assert(
        adyenActionBody.shopperReference === `shopper_${slug}`,
        `Adyen subscription action used wrong shopper reference: ${JSON.stringify(adyenActionBody)}`,
      );
      assert(
        adyenActionBody.selectedRecurringDetailReference ===
          `adyen_recurring_${slug}`,
        `Adyen subscription action used wrong recurring detail: ${JSON.stringify(adyenActionBody)}`,
      );
    }

    if (mollieSubscriptionExecutionEnabled()) {
      const beforeMollieActionRequests = stripeCheckoutMock.requests.length;
      const mollieActionPayload = await requestApi(
        `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions/${orderRecord.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "cancel",
            provider: "mollie",
            subscriptionReference: `cst_${slug}:sub_mollie_${slug}`,
            reason: "Smoke Mollie subscription cancellation action.",
          }),
        },
      );
      const mollieSubscriptionAction =
        mollieActionPayload.data?.action || mollieActionPayload.action;
      assert(
        mollieSubscriptionAction?.status === "succeeded",
        `Mollie subscription action did not execute against mock: ${JSON.stringify(mollieActionPayload).slice(0, 500)}`,
      );
      assert(
        mollieSubscriptionAction.executionMode === "mollie-api",
        `Mollie subscription action did not use Mollie execution: ${JSON.stringify(mollieSubscriptionAction)}`,
      );
      assert(
        mollieSubscriptionAction.subscriptionReference ===
          `cst_${slug}:sub_mollie_${slug}`,
        `Mollie subscription action used the wrong subscription reference: ${JSON.stringify(mollieSubscriptionAction)}`,
      );
      const mollieActionRequest = stripeCheckoutMock.requests
        .slice(beforeMollieActionRequests)
        .find(
          (request) =>
            request.method === "DELETE" &&
            request.url ===
              `/customers/cst_${slug}/subscriptions/sub_mollie_${slug}`,
        );
      assert(
        mollieActionRequest,
        `Mollie mock did not receive subscription cancellation action: ${JSON.stringify(stripeCheckoutMock.requests.slice(beforeMollieActionRequests))}`,
      );
      assert(
        mollieActionRequest.headers.authorization ===
          `Bearer ${process.env.BACKY_MOLLIE_API_KEY || process.env.MOLLIE_API_KEY}`,
        `Mollie subscription action did not send bearer auth: ${JSON.stringify(mollieActionRequest.headers)}`,
      );
    }

    if (razorpaySubscriptionExecutionEnabled()) {
      const beforeRazorpayActionRequests = stripeCheckoutMock.requests.length;
      const razorpayActionPayload = await requestApi(
        `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions/${orderRecord.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "resume",
            provider: "razorpay",
            subscriptionReference: `sub_razorpay_${slug}`,
            reason: "Smoke Razorpay subscription resume action.",
          }),
        },
      );
      const razorpaySubscriptionAction =
        razorpayActionPayload.data?.action || razorpayActionPayload.action;
      assert(
        razorpaySubscriptionAction?.status === "succeeded",
        `Razorpay subscription action did not execute against mock: ${JSON.stringify(razorpayActionPayload).slice(0, 500)}`,
      );
      assert(
        razorpaySubscriptionAction.executionMode === "razorpay-api",
        `Razorpay subscription action did not use Razorpay execution: ${JSON.stringify(razorpaySubscriptionAction)}`,
      );
      assert(
        razorpaySubscriptionAction.subscriptionReference ===
          `sub_razorpay_${slug}`,
        `Razorpay subscription action used the wrong subscription reference: ${JSON.stringify(razorpaySubscriptionAction)}`,
      );
      const razorpayActionRequest = stripeCheckoutMock.requests
        .slice(beforeRazorpayActionRequests)
        .find(
          (request) =>
            request.method === "POST" &&
            request.url ===
              `/v1/subscriptions/sub_razorpay_${slug}/resume`,
        );
      assert(
        razorpayActionRequest,
        `Razorpay mock did not receive subscription resume action: ${JSON.stringify(stripeCheckoutMock.requests.slice(beforeRazorpayActionRequests))}`,
      );
      const expectedRazorpayAuth = `Basic ${Buffer.from(`${process.env.BACKY_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID}:${process.env.BACKY_RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
      assert(
        razorpayActionRequest.headers.authorization === expectedRazorpayAuth,
        `Razorpay subscription action did not send Basic auth: ${JSON.stringify(razorpayActionRequest.headers)}`,
      );
      const razorpayActionBody = JSON.parse(
        razorpayActionRequest.body || "{}",
      );
      assert(
        razorpayActionBody.resume_at === "now",
        `Razorpay subscription resume body was unexpected: ${JSON.stringify(razorpayActionBody)}`,
      );
      assert(
        razorpayActionBody.notes?.backy_subscription_action === "resume",
        `Razorpay subscription action omitted Backy metadata: ${JSON.stringify(razorpayActionBody)}`,
      );
    }

    if (httpSubscriptionExecutionEnabled()) {
      const beforeAdyenHttpActionRequests = commerceProviderMock.requests.length;
      const adyenHttpActionPayload = await requestApi(
        `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions/${orderRecord.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "pause",
            provider: "adyen",
            subscriptionReference: `shopper_${slug}:adyen_recurring_${slug}`,
            reason: "Smoke Adyen subscription HTTP fallback pause action.",
          }),
        },
      );
      const adyenHttpSubscriptionAction =
        adyenHttpActionPayload.data?.action || adyenHttpActionPayload.action;
      assert(
        adyenHttpSubscriptionAction?.status === "succeeded",
        `Adyen HTTP fallback subscription action did not execute against mock: ${JSON.stringify(adyenHttpActionPayload).slice(0, 500)}`,
      );
      assert(
        adyenHttpSubscriptionAction.executionMode === "http-api",
        `Adyen HTTP fallback subscription action did not use HTTP execution: ${JSON.stringify(adyenHttpSubscriptionAction)}`,
      );
      const adyenHttpActionRequest = commerceProviderMock.requests
        .slice(beforeAdyenHttpActionRequests)
        .find(
          (request) =>
            request.method === "POST" &&
            request.url === "/subscription/action" &&
            request.payload?.provider === "adyen",
        );
      assert(
        adyenHttpActionRequest,
        `HTTP provider mock did not receive Adyen fallback subscription action: ${JSON.stringify(commerceProviderMock.requests.slice(beforeAdyenHttpActionRequests))}`,
      );
      assert(
        adyenHttpActionRequest.payload?.providerTarget?.shopperReference ===
          `shopper_${slug}`,
        `Adyen HTTP fallback did not include provider target: ${JSON.stringify(adyenHttpActionRequest.payload)}`,
      );

      const beforeMollieHttpActionRequests = commerceProviderMock.requests.length;
      const mollieHttpActionPayload = await requestApi(
        `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions/${orderRecord.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "resume",
            provider: "mollie",
            subscriptionReference: `cst_${slug}:sub_mollie_${slug}`,
            reason: "Smoke Mollie subscription HTTP fallback resume action.",
          }),
        },
      );
      const mollieHttpSubscriptionAction =
        mollieHttpActionPayload.data?.action || mollieHttpActionPayload.action;
      assert(
        mollieHttpSubscriptionAction?.status === "succeeded",
        `Mollie HTTP fallback subscription action did not execute against mock: ${JSON.stringify(mollieHttpActionPayload).slice(0, 500)}`,
      );
      assert(
        mollieHttpSubscriptionAction.executionMode === "http-api",
        `Mollie HTTP fallback subscription action did not use HTTP execution: ${JSON.stringify(mollieHttpSubscriptionAction)}`,
      );
      const mollieHttpActionRequest = commerceProviderMock.requests
        .slice(beforeMollieHttpActionRequests)
        .find(
          (request) =>
            request.method === "POST" &&
            request.url === "/subscription/action" &&
            request.payload?.provider === "mollie",
        );
      assert(
        mollieHttpActionRequest,
        `HTTP provider mock did not receive Mollie fallback subscription action: ${JSON.stringify(commerceProviderMock.requests.slice(beforeMollieHttpActionRequests))}`,
      );
      assert(
        mollieHttpActionRequest.payload?.providerTarget?.customerId ===
          `cst_${slug}` &&
          mollieHttpActionRequest.payload?.providerTarget?.subscriptionId ===
            `sub_mollie_${slug}`,
        `Mollie HTTP fallback did not include provider target: ${JSON.stringify(mollieHttpActionRequest.payload)}`,
      );

      const beforeHttpSubscriptionRequests =
        commerceProviderMock.requests.length;
      const httpActionPayload = await requestApi(
        `/api/admin/sites/${SITE_ID}/commerce/products/${productRecord.id}/subscriptions/${orderRecord.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "pause",
            provider: "generic-http",
            subscriptionReference: `http-sub-${slug}`,
            reason: "Smoke generic HTTP subscription pause action.",
          }),
        },
      );
      const httpSubscriptionAction =
        httpActionPayload.data?.action || httpActionPayload.action;
      assert(
        httpSubscriptionAction?.status === "succeeded",
        `HTTP subscription action did not execute against mock: ${JSON.stringify(httpActionPayload).slice(0, 500)}`,
      );
      assert(
        httpSubscriptionAction.executionMode === "http-api",
        `HTTP subscription action did not use HTTP execution: ${JSON.stringify(httpSubscriptionAction)}`,
      );
      assert(
        httpSubscriptionAction.subscriptionReference === `http-sub-${slug}`,
        `HTTP subscription action used the wrong subscription reference: ${JSON.stringify(httpSubscriptionAction)}`,
      );
      const httpActionRequest = commerceProviderMock.requests
        .slice(beforeHttpSubscriptionRequests)
        .find(
          (request) =>
            request.method === "POST" && request.url === "/subscription/action",
        );
      assert(
        httpActionRequest,
        `HTTP provider mock did not receive subscription action: ${JSON.stringify(commerceProviderMock.requests.slice(beforeHttpSubscriptionRequests))}`,
      );
      assert(
        httpActionRequest.headers["x-backy-provider-kind"] ===
          "subscription-action",
        `HTTP subscription action omitted provider-kind header: ${JSON.stringify(httpActionRequest.headers)}`,
      );
      assert(
        httpActionRequest.headers["x-backy-subscription-action"] === "pause",
        `HTTP subscription action omitted action header: ${JSON.stringify(httpActionRequest.headers)}`,
      );
      assert(
        httpActionRequest.payload?.schemaVersion ===
          "backy.product-subscription-action-request.v1",
        `HTTP subscription action sent unexpected schema: ${JSON.stringify(httpActionRequest.payload)}`,
      );
      assert(
        httpActionRequest.payload?.subscription?.reference ===
          `http-sub-${slug}`,
        `HTTP subscription action sent wrong reference: ${JSON.stringify(httpActionRequest.payload)}`,
      );
    }

    const stripeCustomerRecord = customersCollection?.id
      ? await getCollectionRecordBySlug(
          customersCollection.id,
          "commerce-stripe-smoke-at-example-com",
        )
      : null;
    if (stripeCustomerRecord?.id) {
      await deleteCollectionRecord(
        customersCollection.id,
        stripeCustomerRecord.id,
      );
    }
    if (orderRecord?.id) {
      await deleteCollectionRecord(ordersCollection.id, orderRecord.id);
    }

    return {
      skipped: false,
      sessionId: checkoutSession.id,
      providerUrl: checkoutSession.url,
      amountTotal: checkoutSession.amountTotal,
      requestCount: stripeCheckoutMock.requests.length - beforeRequests,
    };
  } finally {
    await patchSettingsFromSnapshot(settingsBefore);
  }
};

const assertProductCsvImport = async ({ productCollection, suffix }) => {
  const slug = `commerce-import-${suffix}`;
  const headers = [
    "slug",
    "status",
    "scheduledAt",
    "title",
    "sku",
    "price",
    productFieldKey("compareAtPrice"),
    "currency",
    "variants",
    "inventory",
    productFieldKey("lowStockThreshold"),
    productFieldKey("inventoryPolicy"),
    productFieldKey("productType"),
    productFieldKey("downloadUrl"),
    productFieldKey("downloadMediaId"),
    productFieldKey("downloadMediaName"),
    productFieldKey("downloadMediaType"),
    productFieldKey("downloadMediaFolderId"),
    productFieldKey("downloadMediaFolderPath"),
    productFieldKey("downloadMediaVisibility"),
    productFieldKey("downloadMediaScope"),
    productFieldKey("downloadMediaScopeTargetId"),
    productFieldKey("downloadMediaOrganization"),
    productFieldKey("checkoutUrl"),
    productFieldKey("subscriptionEnabled"),
    productFieldKey("subscriptionInterval"),
    productFieldKey("subscriptionTrialDays"),
    productFieldKey("shippingRequired"),
    productFieldKey("shippingProfile"),
    "weight",
    productFieldKey("taxClass"),
    productFieldKey("discountCode"),
    productFieldKey("returnPolicy"),
    productFieldKey("imageUrl"),
    productFieldKey("galleryImages"),
    "category",
    "tags",
    "vendor",
    "description",
    productFieldKey("seoTitle"),
    "featured",
    "taxable",
  ];
  const row = [
    slug,
    "published",
    "",
    `Imported Commerce ${suffix}`,
    `CSV-${suffix.toUpperCase()}`,
    "99",
    "129",
    "USD",
    JSON.stringify([
      {
        id: "csv-team",
        title: "Team",
        sku: `CSV-${suffix.toUpperCase()}-TEAM`,
        option: "Seats",
        price: 149,
        inventory: 3,
      },
    ]),
    "0",
    "4",
    "continue",
    "digital",
    `https://downloads.example.com/${slug}.zip`,
    `media-download-${suffix}`,
    `Imported download ${suffix}.zip`,
    "file",
    "folder-digital-delivery",
    "/Digital delivery",
    "private",
    "site",
    SITE_ID,
    JSON.stringify({
      folderPath: "/Digital delivery",
      root: false,
    }),
    "",
    "true",
    "yearly",
    "30",
    "false",
    "digital-delivery",
    "",
    "digital-standard",
    "CSV10",
    "CSV imports can be refunded within 7 days.",
    "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%230f766e%22/%3E%3Ctext x=%2232%22 y=%2238%22 text-anchor=%22middle%22 font-size=%2214%22 fill=%22white%22%3ECSV%3C/text%3E%3C/svg%3E",
    JSON.stringify([
      "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%230f766e%22/%3E%3Ctext x=%2232%22 y=%2238%22 text-anchor=%22middle%22 font-size=%2214%22 fill=%22white%22%3ECSV%3C/text%3E%3C/svg%3E",
    ]),
    "Templates",
    "csv,imported",
    "Backy",
    "Imported by the commerce smoke test.",
    `Imported Commerce ${suffix}`,
    "true",
    "false",
  ];
  const csv = `${headers.join(",")}\n${row.map(csvEscape).join(",")}\n`;

  const result = await requestApi(
    `/api/admin/sites/${SITE_ID}/collections/${productCollection.id}/records/import?upsert=true`,
    {
      method: "POST",
      headers: { "content-type": "text/csv; charset=utf-8" },
      body: csv,
    },
  );
  const summary = result.data?.import;
  assert(
    summary?.created === 1 || summary?.updated === 1,
    `Product CSV import did not save a record: ${JSON.stringify(summary)}`,
  );
  assert(
    summary.skipped === 0,
    `Product CSV import skipped rows: ${JSON.stringify(summary)}`,
  );

  const record = await getCollectionRecordBySlug(productCollection.id, slug);
  assert(record?.id, `Imported product was not found by slug ${slug}`);
  assert(
    record.values?.price === 99,
    `Imported price did not stay numeric: ${JSON.stringify(record.values?.price)}`,
  );
  assert(
    record.values?.inventory === 0,
    `Imported digital inventory did not stay numeric zero: ${JSON.stringify(record.values?.inventory)}`,
  );
  assert(
    readProductValue(record.values, "subscriptionEnabled") === true,
    `Imported subscription flag did not stay boolean true: ${JSON.stringify(readProductValue(record.values, "subscriptionEnabled"))}`,
  );
  assert(
    readProductValue(record.values, "subscriptionInterval") === "yearly",
    `Imported subscription interval did not persist: ${JSON.stringify(readProductValue(record.values, "subscriptionInterval"))}`,
  );
  assert(
    readProductValue(record.values, "subscriptionTrialDays") === 30,
    `Imported subscription trial days did not stay numeric: ${JSON.stringify(readProductValue(record.values, "subscriptionTrialDays"))}`,
  );
  assert(
    readProductValue(record.values, "shippingRequired") === false,
    `Imported shipping flag did not stay boolean false: ${JSON.stringify(readProductValue(record.values, "shippingRequired"))}`,
  );
  assert(
    readProductValue(record.values, "shippingProfile") === "digital-delivery",
    `Imported shipping profile did not persist: ${JSON.stringify(readProductValue(record.values, "shippingProfile"))}`,
  );
  assert(
    readProductValue(record.values, "taxClass") === "digital-standard",
    `Imported tax class did not persist: ${JSON.stringify(readProductValue(record.values, "taxClass"))}`,
  );
  assert(
    readProductValue(record.values, "discountCode") === "CSV10",
    `Imported discount code did not persist: ${JSON.stringify(readProductValue(record.values, "discountCode"))}`,
  );
  assert(
    readProductValue(record.values, "returnPolicy") ===
      "CSV imports can be refunded within 7 days.",
    `Imported return policy did not persist: ${JSON.stringify(readProductValue(record.values, "returnPolicy"))}`,
  );
  assert(
    readProductValue(record.values, "downloadMediaId") ===
      `media-download-${suffix}` &&
      readProductValue(record.values, "downloadMediaName") ===
        `Imported download ${suffix}.zip` &&
      readProductValue(record.values, "downloadMediaType") === "file" &&
      readProductValue(record.values, "downloadMediaFolderPath") ===
        "/Digital delivery",
    `Imported digital delivery media binding did not persist: ${JSON.stringify(record.values)}`,
  );
  assert(
    record.values?.taxable === false,
    `Imported taxable flag did not stay boolean false: ${JSON.stringify(record.values?.taxable)}`,
  );
  assert(
    record.values?.featured === true,
    `Imported featured flag did not stay boolean true: ${JSON.stringify(record.values?.featured)}`,
  );
  assert(
    Array.isArray(record.values?.tags) &&
      record.values.tags.includes("imported"),
    `Imported tags did not parse as an array: ${JSON.stringify(record.values?.tags)}`,
  );
  assert(
    Array.isArray(record.values?.variants) &&
      record.values.variants.length === 1,
    `Imported variants did not parse JSON: ${JSON.stringify(record.values?.variants)}`,
  );

  const catalog = await requestApi(
    `/api/sites/${SITE_ID}/commerce/catalog?slug=${encodeURIComponent(slug)}`,
  );
  const product = catalog.data?.products?.[0] || catalog.products?.[0];
  assert(
    product?.productType === "digital",
    `Imported public product type was unexpected: ${JSON.stringify(product)}`,
  );
  assert(
    product.inventory?.quantity === 0,
    `Imported public inventory quantity was unexpected: ${JSON.stringify(product?.inventory)}`,
  );
  assert(
    product.inventory?.inStock === true,
    `Imported zero-inventory digital product should be in stock: ${JSON.stringify(product?.inventory)}`,
  );
  assert(
    product.inventory?.lowStock === false,
    `Imported zero-inventory digital product should not be low stock: ${JSON.stringify(product?.inventory)}`,
  );
  assert(
    product.subscription?.enabled === true &&
      product.subscription?.interval === "yearly" &&
      product.subscription?.trialDays === 30,
    `Imported public subscription metadata was unexpected: ${JSON.stringify(product?.subscription)}`,
  );
  assert(
    product.delivery?.hasDigitalDelivery === true,
    `Imported digital product should report digital delivery configured: ${JSON.stringify(product?.delivery)}`,
  );

  return record;
};

const assertProductBulkActionStatus = async (client) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => {
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const clear = document.querySelector('[data-testid="products-bulk-clear-selection"]');
      if (clear instanceof HTMLButtonElement && !clear.disabled) {
        clear.click();
        return { ok: false, reason: 'cleared-existing-selection' };
      }
      const status = document.querySelector('[data-testid="products-bulk-action-status"]');
      const selectVisible = document.querySelector('input[aria-label="Select all visible products"]');
      const statusText = normalize(status?.textContent);
      return {
        ok: status?.id === 'products-bulk-action-status' &&
          statusText.includes('Select visible available for') &&
          statusText.includes('Publish selected unavailable: Select one or more loaded products first.') &&
          selectVisible instanceof HTMLInputElement &&
          selectVisible.getAttribute('aria-describedby') === 'products-bulk-action-status' &&
          selectVisible.getAttribute('data-action-state') === 'ready' &&
          selectVisible.getAttribute('data-action-status') === statusText &&
          !selectVisible.disabled,
        reason: 'initial-bulk-status-mismatch',
        statusId: status?.id || '',
        statusText,
        selectVisible: selectVisible instanceof HTMLInputElement ? {
          describedBy: selectVisible.getAttribute('aria-describedby') || '',
          state: selectVisible.getAttribute('data-action-state') || '',
          disabledReason: selectVisible.getAttribute('data-disabled-reason') || '',
          disabled: selectVisible.disabled,
        } : null,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`,
    );
    if (state.ok) break;
    if (attempt === 59) {
      throw new Error(`Products bulk initial action status contract failed: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => {
      const card = document.querySelector('[data-testid="products-product-card"]');
      const checkbox = card?.querySelector('input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement)) {
        return { ok: false, reason: 'product-checkbox-missing', body: document.body?.innerText?.slice(0, 900) || '' };
      }
      if (!checkbox.checked) checkbox.click();
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const group = document.querySelector('[data-testid="products-bulk-toolbar"]');
      const status = document.querySelector('[data-testid="products-bulk-action-status"]');
      const statusText = normalize(status?.textContent);
      const statusId = status?.id || '';
      const summary = document.querySelector('[data-testid="products-bulk-selection-summary"]');
      const controls = [
        'products-bulk-publish',
        'products-bulk-draft',
        'products-bulk-archive',
        'products-bulk-export',
        'products-bulk-clear-selection',
        'products-bulk-delete',
      ].map((testId) => {
        const control = document.querySelector('[data-testid="' + testId + '"]');
        return {
          testId,
          text: normalize(control?.textContent),
          describedBy: control?.getAttribute('aria-describedby') || '',
          state: control?.getAttribute('data-action-state') || '',
          disabledReason: control?.getAttribute('data-disabled-reason') || '',
          disabled: control instanceof HTMLButtonElement ? control.disabled : null,
        };
      });
      return {
        ok: group?.getAttribute('role') === 'group' &&
          group?.getAttribute('aria-label') === 'Selected product bulk actions' &&
          group?.getAttribute('aria-describedby') === statusId &&
          normalize(group?.getAttribute('data-action-status')) === statusText &&
          normalize(summary?.textContent) === '1 selected product' &&
          statusText.includes('Publish selected available for 1 selected product.') &&
          statusText.includes('Draft selected available for 1 selected product.') &&
          statusText.includes('Archive selected available for 1 selected product.') &&
          statusText.includes('Export selected available for 1 selected product.') &&
          statusText.includes('Clear selection available for 1 selected product.') &&
          statusText.includes('Delete selected available for 1 selected product.') &&
          controls.every((control) => control.describedBy === statusId) &&
          controls.every((control) => control.state === 'ready') &&
          controls.every((control) => control.disabled === false) &&
          controls.every((control) => control.disabledReason === ''),
        reason: 'selected-bulk-status-mismatch',
        statusText,
        groupRole: group?.getAttribute('role') || '',
        groupLabel: group?.getAttribute('aria-label') || '',
        groupDescribedBy: group?.getAttribute('aria-describedby') || '',
        groupStatus: normalize(group?.getAttribute('data-action-status')),
        summary: normalize(summary?.textContent),
        controls,
      };
    })()`,
    );
    if (state.ok) break;
    if (attempt === 79) {
      throw new Error(`Products bulk selected action status contract failed: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => {
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const trigger = document.querySelector('[data-testid="products-bulk-delete"]');
      if (!(trigger instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'bulk-delete-trigger-missing' };
      }
      if (trigger.disabled) {
        return { ok: false, reason: 'bulk-delete-trigger-disabled', disabledReason: trigger.getAttribute('data-disabled-reason') || '' };
      }
      trigger.click();
      const dialog = document.querySelector('[data-testid="products-bulk-delete-modal"]');
      const status = document.querySelector('[data-testid="products-bulk-delete-confirm-action-status"]');
      const cancel = document.querySelector('[data-testid="products-bulk-delete-confirm-cancel"]');
      const confirm = document.querySelector('[data-testid="products-bulk-delete-confirm-button"]');
      const statusText = normalize(status?.textContent);
      const opened = dialog?.getAttribute('role') === 'dialog' &&
        dialog?.getAttribute('aria-modal') === 'true' &&
        dialog?.getAttribute('aria-labelledby') === 'products-bulk-delete-confirm-title' &&
        dialog?.getAttribute('aria-describedby') === 'products-bulk-delete-confirm-description products-bulk-delete-confirm-impact products-bulk-delete-confirm-action-status' &&
        dialog?.getAttribute('data-action-state') === 'ready' &&
        dialog?.getAttribute('data-action-status') === statusText &&
        dialog?.getAttribute('data-selected-product-count') === '1' &&
        statusText.includes('Bulk delete confirmation ready for 1 selected product') &&
        cancel instanceof HTMLButtonElement &&
        cancel.getAttribute('aria-describedby') === 'products-bulk-delete-confirm-action-status' &&
        cancel.getAttribute('data-action-state') === 'ready' &&
        confirm instanceof HTMLButtonElement &&
        confirm.getAttribute('aria-describedby') === 'products-bulk-delete-confirm-action-status' &&
        confirm.getAttribute('data-action-state') === 'ready' &&
        confirm.getAttribute('data-selected-product-count') === '1' &&
        confirm.disabled === false;
      return {
        ok: opened,
        reason: 'bulk-delete-dialog-contract-mismatch',
        opened,
        statusText,
        dialogRole: dialog?.getAttribute('role') || '',
        dialogLabelledBy: dialog?.getAttribute('aria-labelledby') || '',
        dialogDescribedBy: dialog?.getAttribute('aria-describedby') || '',
        dialogState: dialog?.getAttribute('data-action-state') || '',
        confirmState: confirm?.getAttribute('data-action-state') || '',
      };
    })()`,
    );
    if (state.ok) {
      await sleep(100);
      await pressEscape(client);
      const closeState = await evaluate(
        client,
        `(() => ({
          closed: !document.querySelector('[data-testid="products-bulk-delete-modal"]'),
          body: document.body?.innerText?.slice(0, 800) || '',
        }))()`,
      );
      assert(closeState.closed, `Products bulk delete confirmation did not close on Escape: ${JSON.stringify(closeState)}`);
      break;
    }
    if (attempt === 59) {
      throw new Error(`Products bulk delete confirmation recovery failed: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => {
      const clear = document.querySelector('[data-testid="products-bulk-clear-selection"]');
      if (!(clear instanceof HTMLButtonElement)) return { ok: false, reason: 'clear-missing' };
      if (clear.disabled) return { ok: false, reason: 'clear-disabled' };
      clear.click();
      return { ok: true };
    })()`,
    );
    if (state.ok) break;
    if (attempt === 59) {
      throw new Error(`Unable to clear products bulk selection: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => {
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const status = document.querySelector('[data-testid="products-bulk-action-status"]');
      return {
        ok: !document.querySelector('[data-testid="products-bulk-toolbar"]') &&
          normalize(status?.textContent).includes('Publish selected unavailable: Select one or more loaded products first.'),
        statusText: normalize(status?.textContent),
        hasToolbar: Boolean(document.querySelector('[data-testid="products-bulk-toolbar"]')),
      };
    })()`,
    );
    if (state.ok) return state;
    if (attempt === 59) {
      throw new Error(`Products bulk selection did not clear: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertProductDeleteConfirmationRecovery = async (client) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => {
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const card = document.querySelector('[data-testid="products-product-card"]');
      const trigger = card?.querySelector('[data-testid="products-delete-product"]');
      if (!(trigger instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'delete-trigger-missing' };
      }
      if (trigger.disabled) {
        return { ok: false, reason: 'delete-trigger-disabled', disabledReason: trigger.getAttribute('data-disabled-reason') || '' };
      }
      trigger.click();
      const dialog = document.querySelector('[data-testid="products-delete-confirm-dialog"]');
      const status = document.querySelector('[data-testid="products-delete-confirm-action-status"]');
      const cancel = document.querySelector('[data-testid="products-delete-confirm-cancel"]');
      const confirm = document.querySelector('[data-testid="products-delete-confirm-button"]');
      const statusText = normalize(status?.textContent);
      const targetProductId = dialog?.getAttribute('data-target-product-id') || '';
      const opened = dialog?.getAttribute('role') === 'dialog' &&
        dialog?.getAttribute('aria-modal') === 'true' &&
        dialog?.getAttribute('aria-labelledby') === 'products-delete-confirm-title' &&
        dialog?.getAttribute('aria-describedby') === 'products-delete-confirm-description products-delete-confirm-impact products-delete-confirm-action-status' &&
        dialog?.getAttribute('data-action-state') === 'ready' &&
        dialog?.getAttribute('data-action-status') === statusText &&
        targetProductId.length > 0 &&
        statusText.includes('Delete product confirmation ready') &&
        cancel instanceof HTMLButtonElement &&
        cancel.getAttribute('aria-describedby') === 'products-delete-confirm-action-status' &&
        cancel.getAttribute('data-action-state') === 'ready' &&
        confirm instanceof HTMLButtonElement &&
        confirm.getAttribute('aria-describedby') === 'products-delete-confirm-action-status' &&
        confirm.getAttribute('data-action-state') === 'ready' &&
        confirm.getAttribute('data-target-product-id') === targetProductId &&
        confirm.disabled === false;
      return {
        ok: opened,
        reason: 'product-delete-dialog-contract-mismatch',
        opened,
        statusText,
        targetProductId,
        dialogRole: dialog?.getAttribute('role') || '',
        dialogLabelledBy: dialog?.getAttribute('aria-labelledby') || '',
        dialogDescribedBy: dialog?.getAttribute('aria-describedby') || '',
        dialogState: dialog?.getAttribute('data-action-state') || '',
        confirmState: confirm?.getAttribute('data-action-state') || '',
      };
    })()`,
    );
    if (state.ok) {
      await sleep(100);
      await pressEscape(client);
      const closeState = await evaluate(
        client,
        `(() => ({
          closed: !document.querySelector('[data-testid="products-delete-confirm-dialog"]'),
          body: document.body?.innerText?.slice(0, 800) || '',
        }))()`,
      );
      assert(closeState.closed, `Products delete confirmation did not close on Escape: ${JSON.stringify(closeState)}`);
      return state;
    }
    if (attempt === 59) {
      throw new Error(`Products delete confirmation recovery failed: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertProductsProviderCertificationLayout = async (client) => {
  await navigateToRoute(
    client,
    "/products",
    "products-command-center",
    "Catalog command center",
  );
  await clickByText(client, "Refresh", { exact: true }).catch(() => null);
  await waitUntilIdle(client, "/products refresh before provider certification assertion");

  let providerCertificationState = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    providerCertificationState = await evaluate(
      client,
      `(() => {
        const providerCertification = document.querySelector('[data-testid="products-provider-certification"]');
        const providerCertificationText = providerCertification?.textContent || '';
        const actionStatus = document.querySelector('[data-testid="products-provider-certification-action-status"]');
        const actionStatusId = actionStatus?.id || '';
        const actionStatusText = actionStatus?.textContent || '';
        const actionTestIds = [
          'products-provider-certification-copy-button',
          'products-provider-certification-command-copy-button',
          'products-provider-certification-download-button',
          'products-provider-certification-env-copy-button',
          'products-provider-certification-command-builder-copy-button',
          'products-provider-certification-evidence-packet-copy-button',
        ];
        const controlTestIds = [
          'products-provider-certification-payment-toggle',
          'products-provider-certification-tax-toggle',
          'products-provider-certification-shipping-toggle',
          'products-provider-certification-discount-toggle',
          'products-provider-certification-catalog-toggle',
          'products-provider-certification-subscriptions-toggle',
          'products-provider-certification-webhooks-toggle',
          'products-provider-certification-payment-provider-select',
          'products-provider-certification-tax-provider-select',
          'products-provider-certification-shipping-provider-select',
          'products-provider-certification-discount-provider-select',
          'products-provider-certification-catalog-provider-select',
          'products-provider-certification-subscription-provider-select',
          'products-provider-certification-webhook-provider-select',
        ];
        const collect = (testIds) => testIds.map((testId) => {
          const element = document.querySelector('[data-testid="' + testId + '"]');

          return {
            testId,
            state: element?.getAttribute('data-action-state') || '',
            describedBy: element?.getAttribute('aria-describedby') || '',
            status: element?.getAttribute('data-action-status') || '',
            disabledReason: element?.getAttribute('data-disabled-reason') || '',
            family: element?.getAttribute('data-provider-certification-family') || '',
            disabled: Boolean(element?.disabled || element?.getAttribute('aria-disabled') === 'true'),
          };
        });
        const actions = collect(actionTestIds);
        const controls = collect(controlTestIds);

        return {
          wrapper: Boolean(providerCertification),
          wrapperLabel: providerCertification?.getAttribute('aria-label') === 'Products provider certification actions',
          wrapperDescribedBy: providerCertification?.getAttribute('aria-describedby') === actionStatusId,
          wrapperStatus: providerCertification?.getAttribute('data-action-status') === actionStatusText,
          actionStatus: Boolean(actionStatus),
          actionStatusId: actionStatusId === 'products-provider-certification-action-status',
          actionStatusText: actionStatusText.includes('Copy provider handoff available.') &&
            actionStatusText.includes('Copy CI command available.') &&
            actionStatusText.includes('Copy env template available.') &&
            actionStatusText.includes('Copy guarded command available.') &&
            actionStatusText.includes('Copy evidence packet available.'),
          actionStates: actions.length === 6 && actions.every((action) => action.state === 'ready'),
          actionDescriptions: actions.every((action) => action.describedBy === actionStatusId),
          actionStatuses: actions.every((action) => action.status === actionStatusText),
          actionDisabledReasons: actions.every((action) => action.disabledReason === ''),
          actionEnabled: actions.every((action) => action.disabled === false),
          controlStates: controls.length === 14 && controls.every((control) => control.state === 'ready'),
          controlDescriptions: controls.every((control) => control.describedBy === actionStatusId),
          controlStatuses: controls.every((control) => control.status.includes('ready for this certification run.')),
          controlDisabledReasons: controls.every((control) => control.disabledReason === ''),
          controlFamilies: controls.every((control) => control.family.length > 0),
          controlEnabled: controls.every((control) => control.disabled === false),
          commandBuilder: Boolean(document.querySelector('[data-testid="products-provider-certification-command-builder"]')),
          siteTarget: Boolean(document.querySelector('[data-testid="products-provider-certification-site-target"]')),
          readinessSummary: Boolean(document.querySelector('[data-testid="products-provider-certification-readiness-summary"]')),
          nextAction: Boolean(document.querySelector('[data-testid="products-provider-certification-next-action"]')),
          evidence: Boolean(document.querySelector('[data-testid="products-provider-certification-evidence"]')),
          text: providerCertificationText.slice(0, 1600),
        };
      })()`,
    );

    if (
      providerCertificationState.wrapper &&
      providerCertificationState.actionStatus &&
      providerCertificationState.commandBuilder &&
      providerCertificationState.controlStates
    ) {
      break;
    }
    await sleep(250);
  }

  assert(
    providerCertificationState?.wrapper &&
      providerCertificationState.wrapperLabel &&
      providerCertificationState.wrapperDescribedBy &&
      providerCertificationState.wrapperStatus &&
      providerCertificationState.actionStatus &&
      providerCertificationState.actionStatusId &&
      providerCertificationState.actionStatusText &&
      providerCertificationState.actionStates &&
      providerCertificationState.actionDescriptions &&
      providerCertificationState.actionStatuses &&
      providerCertificationState.actionDisabledReasons &&
      providerCertificationState.actionEnabled &&
      providerCertificationState.controlStates &&
      providerCertificationState.controlDescriptions &&
      providerCertificationState.controlStatuses &&
      providerCertificationState.controlDisabledReasons &&
      providerCertificationState.controlFamilies &&
      providerCertificationState.controlEnabled &&
      providerCertificationState.commandBuilder &&
      providerCertificationState.siteTarget &&
      providerCertificationState.readinessSummary &&
      providerCertificationState.nextAction &&
      providerCertificationState.evidence,
    `Products provider certification rendered contract failed: ${JSON.stringify(providerCertificationState)}`,
  );

  return providerCertificationState;
};

const assertProductsLayout = async (client) => {
  await clickByText(client, "Refresh", { exact: true }).catch(() => null);
  await waitUntilIdle(client, "/products refresh before layout assertion");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const previewState = await evaluate(
      client,
      `(() => {
      const candidates = Array.from(document.querySelectorAll('button'));
      const button = candidates.find((candidate) => (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Preview reconciliation');
      return {
        present: Boolean(button),
        disabled: Boolean(button?.disabled || button?.getAttribute('aria-disabled') === 'true'),
      };
    })()`,
    );
    if (previewState.present && !previewState.disabled) {
      await clickByText(client, "Preview reconciliation", { exact: true });
      break;
    }
    await sleep(250);
  }
  await waitUntilIdle(
    client,
    "/products reconciliation preview before layout assertion",
  );

  let layout = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    layout = await evaluate(
      client,
      `(() => {
      const productPerformance = document.querySelector('[data-testid="products-product-performance"]');
      const productPerformanceText = productPerformance?.textContent || '';
      const backendCommerceAnalytics = document.querySelector('[data-testid="products-backend-commerce-analytics"]');
      const backendCommerceAnalyticsText = backendCommerceAnalytics?.textContent || '';
      const productAutomation = document.querySelector('[data-testid="products-notification-automation"]');
      const productAutomationText = productAutomation?.textContent || '';
	      const providerReconciliation = document.querySelector('[data-testid="products-provider-reconciliation"]');
	      const providerReconciliationText = providerReconciliation?.textContent || '';
	      const providerCertification = document.querySelector('[data-testid="products-provider-certification"]');
	      const providerCertificationText = providerCertification?.textContent || '';
        const providerCertificationActionStatus = document.querySelector('[data-testid="products-provider-certification-action-status"]');
        const providerCertificationActionStatusText = (providerCertificationActionStatus?.textContent || '').replace(/\s+/g, ' ').trim();
        const providerCertificationActionStatusId = providerCertificationActionStatus?.id || '';
        const providerCertificationActionTestIds = [
          'products-provider-certification-copy-button',
          'products-provider-certification-command-copy-button',
          'products-provider-certification-download-button',
          'products-provider-certification-env-copy-button',
          'products-provider-certification-command-builder-copy-button',
          'products-provider-certification-evidence-packet-copy-button',
        ];
        const providerCertificationActions = providerCertificationActionTestIds.map((testId) => {
          const element = document.querySelector('[data-testid="' + testId + '"]');

          return {
            testId,
            state: element?.getAttribute('data-action-state') || '',
            describedBy: element?.getAttribute('aria-describedby') || '',
            status: element?.getAttribute('data-action-status') || '',
            disabledReason: element?.getAttribute('data-disabled-reason') || '',
            disabled: Boolean(element?.disabled || element?.getAttribute('aria-disabled') === 'true'),
          };
        });
        const providerCertificationControlTestIds = [
          'products-provider-certification-payment-toggle',
          'products-provider-certification-tax-toggle',
          'products-provider-certification-shipping-toggle',
          'products-provider-certification-discount-toggle',
          'products-provider-certification-catalog-toggle',
          'products-provider-certification-subscriptions-toggle',
          'products-provider-certification-webhooks-toggle',
          'products-provider-certification-payment-provider-select',
          'products-provider-certification-tax-provider-select',
          'products-provider-certification-shipping-provider-select',
          'products-provider-certification-discount-provider-select',
          'products-provider-certification-catalog-provider-select',
          'products-provider-certification-subscription-provider-select',
          'products-provider-certification-webhook-provider-select',
        ];
        const providerCertificationControls = providerCertificationControlTestIds.map((testId) => {
          const element = document.querySelector('[data-testid="' + testId + '"]');

          return {
            testId,
            state: element?.getAttribute('data-action-state') || '',
            describedBy: element?.getAttribute('aria-describedby') || '',
            status: element?.getAttribute('data-action-status') || '',
            disabledReason: element?.getAttribute('data-disabled-reason') || '',
            family: element?.getAttribute('data-provider-certification-family') || '',
            disabled: Boolean(element?.disabled || element?.getAttribute('aria-disabled') === 'true'),
          };
        });
	      const productsStorefrontApiDetails = document.querySelector('[data-testid="products-storefront-api-details"]');
	      const productsStorefrontApiText = productsStorefrontApiDetails?.textContent || '';
        const storefrontActionMeta = (selector) => Array.from(document.querySelectorAll(selector)).map((element) => ({
          testId: element.getAttribute('data-testid') || '',
          label: (element.textContent || '').replace(/\\s+/g, ' ').trim(),
          state: element.getAttribute('data-action-state') || '',
          describedBy: element.getAttribute('aria-describedby') || '',
          status: element.getAttribute('data-action-status') || '',
          disabledReason: element.getAttribute('data-disabled-reason') || '',
          targetSiteId: element.getAttribute('data-target-site-id') || '',
          disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
        }));
        const storefrontApiPrimaryActions = storefrontActionMeta('[data-testid="products-storefront-api-primary-actions"] button, [data-testid="products-storefront-api-primary-actions"] a');
        const storefrontApiPrimaryLabels = storefrontApiPrimaryActions.map((action) => action.label);
        const storefrontApiPrimaryStates = storefrontApiPrimaryActions.map((action) => action.state);
        const storefrontApiSecondaryActions = storefrontActionMeta('[data-testid="products-storefront-api-secondary-action-menu"] button');
        const storefrontApiSecondaryLabels = storefrontApiSecondaryActions.map((action) => action.label);
        const productsCommandSecondaryActions = storefrontActionMeta('[data-testid="products-command-secondary-action-menu"] button');
        const productsCommandSecondaryLabels = productsCommandSecondaryActions.map((action) => action.label);
        const productsCommandSecondaryStatus = document.querySelector('[data-testid="products-command-secondary-action-status"]');
        const productsCommandSecondaryDetails = document.querySelector('[data-testid="products-command-secondary-actions"]');
	      const productsApiContracts = document.querySelector('[data-testid="products-api-contracts"]');
	      const commerceAnalytics = document.querySelector('[data-testid="products-commerce-analytics"]');
	      const commerceAnalyticsText = commerceAnalytics?.textContent || '';
	      const customerProfileManager = document.querySelector('[data-testid="products-customer-profile-manager"]');
	      const customerProfileManagerText = customerProfileManager?.textContent || '';
	      const customerProfileSelector = document.querySelector('[aria-label="Customer profile"]');
	      const pageBindingContract = document.querySelector('[data-testid="products-page-binding-contract"]');
	      const pageBindingContractText = pageBindingContract?.textContent || '';
	      const productPageTemplates = document.querySelector('[data-testid="products-page-templates"]');
	      const productPageTemplatesText = productPageTemplates?.textContent || '';
      const productLaunchReadiness = document.querySelector('[data-testid="products-launch-readiness"]');
	      const productLaunchReadinessText = productLaunchReadiness?.textContent || '';
	      const productsReadinessDetails = document.querySelector('[data-testid="products-readiness-details"]');
	      const productsControlMap = document.querySelector('[data-testid="products-control-map"]');
	      const frontendTemplateOptions = document.querySelector('[data-testid="products-frontend-template-options"]');
        const frontendTemplateActionStatus = document.querySelector('[data-testid="products-frontend-template-action-status"]');
        const frontendTemplateActionStatusText = (frontendTemplateActionStatus?.textContent || '').replace(/\\s+/g, ' ').trim();
        const frontendTemplateCard = document.querySelector('[data-testid="products-frontend-template-card-${FRONTEND_PRODUCT_TEMPLATE_ID}"]');
        const frontendTemplateCreate = document.querySelector('[data-testid="products-frontend-template-${FRONTEND_PRODUCT_TEMPLATE_ID}"]');
        const frontendTemplateCopy = document.querySelector('[data-testid="products-frontend-template-copy-${FRONTEND_PRODUCT_TEMPLATE_ID}"]');
	      const providerCertificationOperatorDetails = document.querySelector('[data-testid="products-provider-certification-operator-details"]');
        const productEditorPanel = document.querySelector('[data-testid="products-editor-panel"]');
        const productEditorPanelClass = productEditorPanel?.getAttribute('class') || '';
        const productEditorSectionNav = document.querySelector('[data-testid="products-editor-section-nav"]');
        const productEditorLinks = Array.from(productEditorSectionNav?.querySelectorAll('a') || []).map((link) => link.getAttribute('href'));
        const productCard = document.querySelector('[data-testid="products-product-card"]');
        const productActionGroup = productCard?.querySelector('[data-testid="products-action-group"]');
        const productActionStatus = productCard?.querySelector('[data-testid="products-action-status"]');
        const productActionStatusText = (productActionStatus?.textContent || '').replace(/\\s+/g, ' ').trim();
        const productActionStatusId = productActionStatus?.id || '';
        const productActionGroupStatus = productActionGroup?.getAttribute('data-action-status') || '';
        const productActionGroupLabel = productActionGroup?.getAttribute('aria-label') || '';
        const productEditAction = productCard?.querySelector('[data-testid="products-edit-product"]');
        const productPublishAction = productCard?.querySelector('[data-testid="products-publish-product"]');
        const productArchiveAction = productCard?.querySelector('[data-testid="products-archive-product"]');
        const productDeleteAction = productCard?.querySelector('[data-testid="products-delete-product"]');
        const productActions = [productEditAction, productPublishAction, productArchiveAction, productDeleteAction];
        const productActionStates = productActions.map((action) => action?.getAttribute('data-action-state') || '');
        const productActionDescriptions = productActions.map((action) => action?.getAttribute('aria-describedby') || '');
        const productActionDisabledReasons = productActions.map((action) => action?.getAttribute('data-disabled-reason') || '');
	      return {
	        width: window.innerWidth,
	        scrollWidth: document.documentElement.scrollWidth,
	        hasCommandCenter: Boolean(document.querySelector('[data-testid="products-command-center"]')),
          hasProductsCommandSecondaryActions: Boolean(productsCommandSecondaryDetails),
          productsCommandSecondaryCollapsed: productsCommandSecondaryDetails instanceof HTMLDetailsElement && productsCommandSecondaryDetails.open === false,
          productsCommandSecondaryDescribedBy: productsCommandSecondaryDetails?.getAttribute('aria-describedby') || '',
          productsCommandSecondaryStatusId: productsCommandSecondaryStatus?.id || '',
          productsCommandSecondaryStatusText: (productsCommandSecondaryStatus?.textContent || '').replace(/\\s+/g, ' ').trim(),
          productsCommandSecondaryStatusData: productsCommandSecondaryDetails?.getAttribute('data-action-status') || '',
          productsCommandSecondaryState: productsCommandSecondaryDetails?.getAttribute('data-action-state') || '',
          productsCommandSecondaryActions,
          productsCommandSecondaryLabels,
	        readinessDetailsCollapsed: productsReadinessDetails instanceof HTMLDetailsElement && productsReadinessDetails.open === false,
	        controlMapCollapsed: productsControlMap instanceof HTMLDetailsElement && productsControlMap.open === false,
	        frontendTemplateOptionsCollapsed: frontendTemplateOptions instanceof HTMLDetailsElement && frontendTemplateOptions.open === false,
          frontendTemplateOptionsDescribedBy: frontendTemplateOptions?.getAttribute('aria-describedby') || '',
          frontendTemplateOptionsActionState: frontendTemplateOptions?.getAttribute('data-action-state') || '',
          frontendTemplateOptionsActionStatus: frontendTemplateOptions?.getAttribute('data-action-status') || '',
          frontendTemplateOptionsTemplateCount: frontendTemplateOptions?.getAttribute('data-template-count') || '',
          frontendTemplateOptionsActiveTemplateId: frontendTemplateOptions?.getAttribute('data-active-template-id') || '',
          frontendTemplateOptionsRouteRevealed: frontendTemplateOptions?.getAttribute('data-route-revealed-template') || '',
          frontendTemplateActionStatusId: frontendTemplateActionStatus?.id || '',
          frontendTemplateActionStatusText,
          frontendTemplateCardActionState: frontendTemplateCard?.getAttribute('data-action-state') || '',
          frontendTemplateCardActionStatus: frontendTemplateCard?.getAttribute('data-action-status') || '',
          frontendTemplateCardDisabledReason: frontendTemplateCard?.getAttribute('data-disabled-reason') || '',
          frontendTemplateCardTargetTemplateId: frontendTemplateCard?.getAttribute('data-target-template-id') || '',
          frontendTemplateCardTargetTemplateName: frontendTemplateCard?.getAttribute('data-target-template-name') || '',
          frontendTemplateCardTargetSiteId: frontendTemplateCard?.getAttribute('data-target-site-id') || '',
          frontendTemplateCreateActionState: frontendTemplateCreate?.getAttribute('data-action-state') || '',
          frontendTemplateCreateActionStatus: frontendTemplateCreate?.getAttribute('data-action-status') || '',
          frontendTemplateCreateAction: frontendTemplateCreate?.getAttribute('data-action') || '',
          frontendTemplateCreateActionRoute: frontendTemplateCreate?.getAttribute('data-action-route') || '',
          frontendTemplateCreateDescribedBy: frontendTemplateCreate?.getAttribute('aria-describedby') || '',
          frontendTemplateCreateDisabledReason: frontendTemplateCreate?.getAttribute('data-disabled-reason') || '',
          frontendTemplateCreateDisabled: frontendTemplateCreate instanceof HTMLButtonElement ? frontendTemplateCreate.disabled : null,
          frontendTemplateCreateTargetTemplateId: frontendTemplateCreate?.getAttribute('data-target-template-id') || '',
          frontendTemplateCreateTargetTemplateName: frontendTemplateCreate?.getAttribute('data-target-template-name') || '',
          frontendTemplateCreateTargetSiteId: frontendTemplateCreate?.getAttribute('data-target-site-id') || '',
          frontendTemplateCopyActionState: frontendTemplateCopy?.getAttribute('data-action-state') || '',
          frontendTemplateCopyActionStatus: frontendTemplateCopy?.getAttribute('data-action-status') || '',
          frontendTemplateCopyAction: frontendTemplateCopy?.getAttribute('data-action') || '',
          frontendTemplateCopyActionRoute: frontendTemplateCopy?.getAttribute('data-action-route') || '',
          frontendTemplateCopyDescribedBy: frontendTemplateCopy?.getAttribute('aria-describedby') || '',
          frontendTemplateCopyDisabledReason: frontendTemplateCopy?.getAttribute('data-disabled-reason') || '',
          frontendTemplateCopyDisabled: frontendTemplateCopy instanceof HTMLButtonElement ? frontendTemplateCopy.disabled : null,
          frontendTemplateCopyTargetTemplateId: frontendTemplateCopy?.getAttribute('data-target-template-id') || '',
          frontendTemplateCopyTargetTemplateName: frontendTemplateCopy?.getAttribute('data-target-template-name') || '',
          frontendTemplateCopyTargetSiteId: frontendTemplateCopy?.getAttribute('data-target-site-id') || '',
          hasFrontendTemplateActionContract: Boolean(frontendTemplateOptions) &&
            frontendTemplateOptions?.getAttribute('aria-describedby') === 'products-frontend-template-action-status' &&
            frontendTemplateActionStatus?.id === 'products-frontend-template-action-status' &&
            frontendTemplateActionStatusText.includes('frontend product template') &&
            frontendTemplateOptions?.getAttribute('data-action-status') === frontendTemplateActionStatusText &&
            frontendTemplateCard?.getAttribute('data-action-status')?.includes(${JSON.stringify(FRONTEND_PRODUCT_TEMPLATE_NAME)}) &&
            frontendTemplateCreate?.getAttribute('data-action-status')?.includes(${JSON.stringify(FRONTEND_PRODUCT_TEMPLATE_NAME)}) &&
            frontendTemplateCopy?.getAttribute('data-action-status')?.includes(${JSON.stringify(FRONTEND_PRODUCT_TEMPLATE_NAME)}),
	        storefrontApiDetailsCollapsed: productsStorefrontApiDetails instanceof HTMLDetailsElement && productsStorefrontApiDetails.open === false,
          hasStorefrontApiActions: Boolean(document.querySelector('[data-testid="products-storefront-api-actions"]')),
          hasStorefrontApiStatus: Boolean(document.querySelector('[data-testid="products-storefront-api-action-status"]')),
          storefrontApiStatusId: document.querySelector('[data-testid="products-storefront-api-action-status"]')?.id || '',
          storefrontApiStatusText: (document.querySelector('[data-testid="products-storefront-api-action-status"]')?.textContent || '').replace(/\\s+/g, ' ').trim(),
          storefrontApiGroupStatus: document.querySelector('[data-testid="products-storefront-api-actions"]')?.getAttribute('data-action-status') || '',
          storefrontApiSecondaryStatusId: document.querySelector('[data-testid="products-storefront-api-secondary-action-status"]')?.id || '',
          storefrontApiSecondaryStatusText: (document.querySelector('[data-testid="products-storefront-api-secondary-action-status"]')?.textContent || '').replace(/\\s+/g, ' ').trim(),
          storefrontApiPrimaryActions,
          storefrontApiPrimaryLabels,
          storefrontApiPrimaryStates,
          hasStorefrontApiSecondaryActions: Boolean(document.querySelector('[data-testid="products-storefront-api-secondary-actions"]')),
          storefrontApiSecondaryDescribedBy: document.querySelector('[data-testid="products-storefront-api-secondary-actions"]')?.getAttribute('aria-describedby') || '',
          storefrontApiSecondaryStatusData: document.querySelector('[data-testid="products-storefront-api-secondary-actions"]')?.getAttribute('data-action-status') || '',
          storefrontApiSecondaryState: document.querySelector('[data-testid="products-storefront-api-secondary-actions"]')?.getAttribute('data-action-state') || '',
          storefrontApiSecondaryTargetSiteId: document.querySelector('[data-testid="products-storefront-api-secondary-actions"]')?.getAttribute('data-target-site-id') || '',
          storefrontApiSecondaryDefaultCollapsed: document.querySelector('[data-testid="products-storefront-api-secondary-actions"]')?.getAttribute('data-default-collapsed') === 'true',
          storefrontApiSecondaryOpen: document.querySelector('[data-testid="products-storefront-api-secondary-actions"]')?.hasAttribute('open') || false,
          hasStorefrontApiMoreActions: Boolean(document.querySelector('[data-testid="products-storefront-api-more-actions"]')),
          storefrontApiMoreActionsDescribedBy: document.querySelector('[data-testid="products-storefront-api-more-actions"]')?.getAttribute('aria-describedby') || '',
          storefrontApiSecondaryActions,
          storefrontApiSecondaryLabels,
          storefrontApiPrimaryHasSecondaryOnlyActions: Boolean(document.querySelector('[data-testid="products-storefront-api-primary-actions"] [data-testid="products-storefront-api-copy-url"], [data-testid="products-storefront-api-primary-actions"] [data-testid="products-storefront-api-copy-manifest"], [data-testid="products-storefront-api-primary-actions"] [data-testid="products-storefront-api-export-csv"], [data-testid="products-storefront-api-primary-actions"] [data-testid="products-storefront-api-csv-template"]')),
	        providerCertificationOperatorDetailsCollapsed: providerCertificationOperatorDetails instanceof HTMLDetailsElement && providerCertificationOperatorDetails.open === false,
	        hasApiPanel: Boolean(productsStorefrontApiDetails) && (document.body?.innerText?.includes('Storefront API and provider handoff') || false),
        hasApiContracts: Boolean(productsApiContracts) &&
          productsStorefrontApiText.includes('Product API response contracts') &&
          productsStorefrontApiText.includes('backy.commerce-product-sync.v1') &&
          productsStorefrontApiText.includes('backy.product-subscription-lifecycle.v1') &&
          productsStorefrontApiText.includes('backy.product-subscription-action.v1') &&
          productsStorefrontApiText.includes('backy.interaction-event.v1'),
        hasCommerceAnalytics: Boolean(commerceAnalytics) &&
          commerceAnalyticsText.includes('Commerce analytics and customer profiles') &&
          commerceAnalyticsText.includes('Paid revenue') &&
          commerceAnalyticsText.includes('Customer profiles'),
        hasBackendCommerceAnalytics: Boolean(backendCommerceAnalytics) &&
          backendCommerceAnalyticsText.includes('Backend order analytics') &&
          backendCommerceAnalyticsText.includes('Payment attention') &&
          backendCommerceAnalyticsText.includes('Fulfillment backlog') &&
          backendCommerceAnalyticsText.includes('Tax collected') &&
          backendCommerceAnalyticsText.includes('Subscription operations') &&
          backendCommerceAnalyticsText.includes('Renewals') &&
          backendCommerceAnalyticsText.includes('Dunning'),
        backendCommerceAnalyticsText,
        hasProductPerformance: Boolean(productPerformance) &&
          productPerformanceText.includes('Product performance') &&
          productPerformanceText.includes('ranked') &&
          /\\b[1-9][0-9]*\\s+unit/.test(productPerformanceText),
        productPerformanceText,
        hasProductAutomation: Boolean(productAutomation) &&
          productAutomationText.includes('Product automation') &&
          productAutomationText.includes('/events?kind=commerce-product') &&
          productAutomationText.includes('product.low_stock') &&
          productAutomationText.includes('4 in stock'),
        productAutomationText,
        hasCustomerProfileManager: (
          Boolean(customerProfileManager) &&
          customerProfileManagerText.includes('Manage profile') &&
          customerProfileManagerText.includes('Save profile')
        ) || (
          customerProfileSelector instanceof HTMLSelectElement &&
          commerceAnalyticsText.includes('Top customer profiles') &&
          commerceAnalyticsText.includes('Customer profile')
        ),
        hasSubscriptionMetadata: Boolean(document.querySelector('[data-testid="products-subscription-metadata"]')) &&
          document.body?.innerText?.includes('Subscription metadata') &&
          document.body?.innerText?.includes('Trial days'),
        hasSubscriptionLifecycle: Boolean(document.querySelector('[data-testid="products-subscription-lifecycle"]')) &&
          document.body?.innerText?.includes('Subscription lifecycle') &&
          document.body?.innerText?.includes('Lifecycle action plan') &&
          document.body?.innerText?.includes('backy.product-subscription-action-plan-summary.v1') &&
          document.body?.innerText?.includes('Action execution readiness') &&
          document.body?.innerText?.includes('backy.product-subscription-execution-readiness.v1') &&
          document.body?.innerText?.includes('Lifecycle certification evidence') &&
          document.body?.innerText?.includes('backy.product-subscription-certification.v1') &&
          document.body?.innerText?.includes('Settled checkout') &&
          document.body?.innerText?.includes('Trial ending') &&
          document.body?.innerText?.includes('Cancellation') &&
          document.body?.innerText?.includes('Recent subscription orders') &&
          document.body?.innerText?.includes('backy.product-subscription-lifecycle.v1') &&
          document.body?.innerText?.includes('/api/admin/sites/:siteId/commerce/products/:productId/subscriptions/:orderId/action') &&
          document.body?.innerText?.includes('/api/sites/:siteId/commerce/webhook'),
        hasProductLaunchReadiness: Boolean(productLaunchReadiness) &&
          productLaunchReadinessText.includes('Product launch readiness') &&
          productLaunchReadinessText.includes('Launch action plan') &&
          productLaunchReadinessText.includes('backy.product-launch-readiness.v1') &&
          productLaunchReadinessText.includes('backy.product-storefront-handoff.v1') &&
          productLaunchReadinessText.includes('Custom frontend design') &&
          productLaunchReadinessText.includes('Copy storefront JSON') &&
          productLaunchReadinessText.includes('Copy launch JSON') &&
          Boolean(document.querySelector('[data-testid="products-storefront-handoff-copy-button"]')) &&
          (
            productLaunchReadinessText.includes('Selected product') ||
            (
              productLaunchReadinessText.includes('Checkout handoff') &&
              productLaunchReadinessText.includes('Provider catalog sync')
            )
          ),
        productLaunchReadinessText,
        hasProviderSync: Boolean(document.querySelector('[data-testid="products-provider-sync"]')) &&
          document.body?.innerText?.includes('Provider catalog sync') &&
          document.body?.innerText?.includes('Paddle') &&
          document.body?.innerText?.includes('Square') &&
          document.body?.innerText?.includes('Shopify') &&
          document.body?.innerText?.includes('BigCommerce') &&
          document.body?.innerText?.includes('WooCommerce') &&
          document.body?.innerText?.includes('Etsy') &&
          document.body?.innerText?.includes('HTTP') &&
          document.body?.innerText?.includes('configured HTTP product and price metadata'),
        hasProviderReconciliation: Boolean(providerReconciliation) &&
          providerReconciliationText.includes('Provider execution and reconciliation') &&
          providerReconciliationText.includes('Scheduled worker') &&
          providerReconciliationText.includes('/api/admin/commerce/reconcile?limit=100') &&
          providerReconciliationText.includes('Preview reconciliation') &&
          /\\d+ events \\/ \\d+ eligible/.test(providerReconciliationText),
        providerReconciliationText,
        hasProviderCertificationExport: Boolean(providerCertification) &&
          providerCertification?.getAttribute('aria-label') === 'Products provider certification actions' &&
          providerCertification?.getAttribute('aria-describedby') === providerCertificationActionStatusId &&
          providerCertification?.getAttribute('data-action-status') === providerCertificationActionStatusText &&
          Boolean(providerCertificationActionStatus) &&
          providerCertificationActionStatusId === 'products-provider-certification-action-status' &&
          providerCertificationActionStatusText.includes('Copy provider handoff available.') &&
          providerCertificationActionStatusText.includes('Copy CI command available.') &&
          providerCertificationActionStatusText.includes('Copy env template available.') &&
          providerCertificationActionStatusText.includes('Copy guarded command available.') &&
          providerCertificationActionStatusText.includes('Copy evidence packet available.') &&
          providerCertificationActions.length === 6 &&
          providerCertificationActions.every((action) => action.state === 'ready') &&
          providerCertificationActions.every((action) => action.describedBy === providerCertificationActionStatusId) &&
          providerCertificationActions.every((action) => action.status === providerCertificationActionStatusText) &&
          providerCertificationActions.every((action) => action.disabledReason === '') &&
          providerCertificationActions.every((action) => action.disabled === false) &&
          providerCertificationControls.length === 14 &&
          providerCertificationControls.every((control) => control.state === 'ready') &&
          providerCertificationControls.every((control) => control.describedBy === providerCertificationActionStatusId) &&
          providerCertificationControls.every((control) => control.status.includes('ready for this certification run.')) &&
          providerCertificationControls.every((control) => control.disabledReason === '') &&
          providerCertificationControls.every((control) => control.family.length > 0) &&
          providerCertificationControls.every((control) => control.disabled === false) &&
          Boolean(document.querySelector('[data-testid="products-provider-certification-download-button"]')) &&
          Boolean(document.querySelector('[data-testid="products-provider-certification-copy-button"]')) &&
          Boolean(document.querySelector('[data-testid="products-provider-certification-command-builder"]')) &&
          Boolean(document.querySelector('[data-testid="products-provider-certification-command-builder-copy-button"]')) &&
          Boolean(document.querySelector('[data-testid="products-provider-certification-site-target"]')) &&
          Boolean(document.querySelector('[data-testid="products-provider-certification-readiness-summary"]')) &&
          Boolean(document.querySelector('[data-testid="products-provider-certification-next-action"]')) &&
          Boolean(document.querySelector('[data-testid="products-provider-certification-payment-toggle"]')) &&
          Boolean(document.querySelector('[data-testid="products-provider-certification-tax-provider-select"]')) &&
          Boolean(document.querySelector('[data-testid="products-provider-certification-command"]')) &&
          Boolean(document.querySelector('[data-testid="products-provider-certification-evidence"]')) &&
          providerCertificationText.includes('Live provider certification') &&
          providerCertificationText.includes('Product certification readiness summary') &&
          providerCertificationText.includes('Runtime credentials') &&
          providerCertificationText.includes('Artifact output') &&
          providerCertificationText.includes('BACKY_COMMERCE_CERTIFICATION_OUTPUT') &&
          providerCertificationText.includes('artifacts/backy-commerce-provider-certification.json') &&
          providerCertificationText.includes('Required site selector') &&
          providerCertificationText.includes('Next operator action') &&
          (
            providerCertificationText.includes('Configure live provider credentials') ||
            providerCertificationText.includes('Attach live scenario evidence') ||
            providerCertificationText.includes('Attach certification artifact')
          ) &&
          providerCertificationText.includes('Provider certification command builder') &&
          providerCertificationText.includes('Product provider certification evidence') &&
          providerCertificationText.includes('backy.product-provider-certification-evidence.v1') &&
          providerCertificationText.includes('Catalog publication') &&
          providerCertificationText.includes('Checkout settlement') &&
          providerCertificationText.includes('Provider catalog sync') &&
          providerCertificationText.includes('Webhook settlement') &&
          providerCertificationText.includes('BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER') &&
          providerCertificationText.includes('BACKY_COMMERCE_CERTIFY_SITE_ID') &&
          providerCertificationText.includes('BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED') &&
          providerCertificationText.includes('Download provider JSON'),
        providerCertificationText,
        hasPageBindingContract: Boolean(pageBindingContract) &&
          pageBindingContractText.includes('Page and editor binding contract') &&
          pageBindingContractText.includes('Product card blocks') &&
          pageBindingContractText.includes('Cart and order intake'),
        hasProductPageTemplates: Boolean(productPageTemplates) &&
          Boolean(productPageTemplates.querySelector('[data-testid="products-page-template-list"]')) &&
          Boolean(productPageTemplates.querySelector('[data-testid="products-page-template-item"]')) &&
          Boolean(productPageTemplates.querySelector('[data-testid="products-page-template-featured-collection"]')) &&
          Boolean(productPageTemplates.querySelector('[data-testid="products-page-template-product-launch"]')) &&
          productPageTemplatesText.includes('Product page templates') &&
          productPageTemplatesText.includes('Featured collection') &&
          productPageTemplatesText.includes('Product launch') &&
          productPageTemplatesText.includes('Route model'),
        hasEditor: document.body?.innerText?.includes('New product') || document.body?.innerText?.includes('Edit product') || false,
        hasEditorActionBar: Boolean(productEditorPanel) &&
          productEditorPanelClass.includes('xl:max-h-[calc(100vh-2rem)]') &&
          productEditorPanelClass.includes('xl:overflow-y-auto') &&
          Boolean(document.querySelector('[data-testid="products-editor-sticky-actions"]')) &&
          Boolean(document.querySelector('[data-testid="products-editor-sticky-save"]')) &&
          Boolean(document.querySelector('[data-testid="products-editor-sticky-clear"]')) &&
          Boolean(productEditorSectionNav) &&
          [
            '#products-editor-identity',
            '#products-editor-variants',
            '#products-editor-fulfillment',
            '#products-editor-subscriptions',
            '#products-editor-provider-sync',
            '#products-editor-media',
            '#products-editor-publishing',
          ].every((href) => productEditorLinks.includes(href)),
        hasProductActionStatus: Boolean(productCard) &&
          productActionGroup?.getAttribute('role') === 'group' &&
          productActionGroupLabel.startsWith('Actions for ') &&
          productActionGroup?.getAttribute('aria-describedby') === productActionStatusId &&
          productActionStatusId.startsWith('products-actions-status-') &&
          productActionGroupStatus === productActionStatusText &&
          productActionStatusText.includes('Edit ') &&
          productActionStatusText.includes('Publish ') &&
          productActionStatusText.includes('Archive ') &&
          productActionStatusText.includes('Delete ') &&
          productActions.every(Boolean) &&
          productActionDescriptions.every((description) => description === productActionStatusId) &&
          productActionStates.every((state) => state === 'ready' || state === 'blocked') &&
          productActionStates.some((state) => state === 'ready') &&
          productActionDisabledReasons.every((reason, index) => productActionStates[index] === 'blocked' ? Boolean(reason) : reason === ''),
        productActionGroupLabel,
        productActionStatusText,
        productActionStates,
        productActionDisabledReasons,
        hasImportControls: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').includes('Import CSV')) &&
          Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').includes('CSV template')),
      };
    })()`,
    );
    if (
      layout.hasProductPerformance &&
      layout.hasProductAutomation &&
      layout.hasBackendCommerceAnalytics &&
      layout.hasSubscriptionLifecycle &&
      layout.hasProductLaunchReadiness &&
      layout.hasProductActionStatus &&
      layout.hasProviderReconciliation
    ) {
      break;
    }
    await sleep(250);
  }

  assert(
    layout.scrollWidth <= layout.width + 8,
    `Products page has horizontal overflow: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.hasProductsCommandSecondaryActions &&
      layout.productsCommandSecondaryCollapsed &&
      layout.productsCommandSecondaryDescribedBy === 'products-command-secondary-action-status' &&
      layout.productsCommandSecondaryStatusId === 'products-command-secondary-action-status' &&
      layout.productsCommandSecondaryStatusText &&
      layout.productsCommandSecondaryStatusData === layout.productsCommandSecondaryStatusText &&
      layout.productsCommandSecondaryState === 'ready' &&
      JSON.stringify(layout.productsCommandSecondaryLabels) === JSON.stringify(['Copy manifest', 'Download JSON', 'Export CSV', 'CSV template', 'Import CSV', 'Storefront page']) &&
      layout.productsCommandSecondaryActions.every((action) => action.state === 'ready' || action.state === 'blocked') &&
      layout.productsCommandSecondaryActions.every((action) => action.describedBy === 'products-command-secondary-action-status') &&
      layout.productsCommandSecondaryActions.every((action) => action.status && layout.productsCommandSecondaryStatusText.includes(action.status)) &&
      layout.productsCommandSecondaryActions.every((action) => action.state === 'blocked' ? Boolean(action.disabledReason) : action.disabledReason === '') &&
      layout.productsCommandSecondaryActions.every((action) => action.disabled === (action.state === 'blocked')) &&
      layout.productsCommandSecondaryActions.some((action) => action.testId === 'products-command-copy-manifest' && action.status.includes('Copy manifest available')) &&
      layout.productsCommandSecondaryActions.some((action) => action.testId === 'products-command-export-csv' && action.status.includes('Export CSV available')),
    `Products catalog More actions should be collapsed and expose ready/blocked metadata for every catalog action: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.hasStorefrontApiActions &&
      layout.hasStorefrontApiStatus &&
      layout.storefrontApiStatusId === 'products-storefront-api-action-status' &&
      layout.storefrontApiGroupStatus === layout.storefrontApiStatusText &&
      (
        JSON.stringify(layout.storefrontApiPrimaryLabels) === JSON.stringify(['Import CSV', 'Storefront page', 'Open API']) ||
        JSON.stringify(layout.storefrontApiPrimaryLabels) === JSON.stringify(['Sync Schema', 'Import CSV', 'Storefront page', 'Open API'])
      ) &&
      layout.storefrontApiPrimaryStates.every((state) => state === 'ready' || state === 'blocked') &&
      layout.storefrontApiPrimaryActions.every((action) => action.describedBy === 'products-storefront-api-action-status') &&
      layout.storefrontApiPrimaryActions.every((action) => action.status === layout.storefrontApiStatusText) &&
      layout.storefrontApiPrimaryActions.every((action) => action.state === 'blocked' ? Boolean(action.disabledReason) : action.disabledReason === '') &&
      layout.storefrontApiPrimaryActions.every((action) => action.disabled === (action.state === 'blocked')),
    `Products storefront API primary actions should prioritize schema/import/storefront/open API work with action metadata: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.hasStorefrontApiSecondaryActions &&
      layout.storefrontApiSecondaryStatusId === 'products-storefront-api-secondary-action-status' &&
      layout.storefrontApiSecondaryStatusText.length > 0 &&
      layout.storefrontApiSecondaryDescribedBy === layout.storefrontApiSecondaryStatusId &&
      layout.storefrontApiSecondaryStatusData === layout.storefrontApiSecondaryStatusText &&
      (layout.storefrontApiSecondaryState === 'ready' || layout.storefrontApiSecondaryState === 'blocked') &&
      layout.storefrontApiSecondaryTargetSiteId.length > 0 &&
      layout.storefrontApiSecondaryDefaultCollapsed &&
      !layout.storefrontApiSecondaryOpen &&
      layout.hasStorefrontApiMoreActions &&
      layout.storefrontApiMoreActionsDescribedBy === layout.storefrontApiSecondaryStatusId &&
      layout.storefrontApiSecondaryLabels[0] === 'Copy URL' &&
      layout.storefrontApiSecondaryLabels.includes('Copy manifest') &&
      layout.storefrontApiSecondaryLabels.includes('Export CSV') &&
      layout.storefrontApiSecondaryLabels.includes('CSV template') &&
      layout.storefrontApiSecondaryActions.every((action) => action.state === 'ready' || action.state === 'blocked') &&
      layout.storefrontApiSecondaryActions.every((action) => action.describedBy === layout.storefrontApiSecondaryStatusId) &&
      layout.storefrontApiSecondaryActions.every((action) => action.status.length > 0 && layout.storefrontApiSecondaryStatusText.includes(action.status)) &&
      layout.storefrontApiSecondaryActions.every((action) => action.targetSiteId === layout.storefrontApiSecondaryTargetSiteId) &&
      layout.storefrontApiSecondaryActions.every((action) => action.state === 'blocked' ? Boolean(action.disabledReason) : action.disabledReason === '') &&
      layout.storefrontApiSecondaryActions.every((action) => action.disabled === (action.state === 'blocked')) &&
      !layout.storefrontApiPrimaryHasSecondaryOnlyActions,
    `Products storefront API URL/export/handoff actions should stay nested behind collapsed More actions: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.hasFrontendTemplateActionContract &&
      layout.frontendTemplateOptionsDescribedBy === 'products-frontend-template-action-status' &&
      layout.frontendTemplateOptionsActionState === 'ready' &&
      Number(layout.frontendTemplateOptionsTemplateCount) >= 1 &&
      layout.frontendTemplateActionStatusId === 'products-frontend-template-action-status' &&
      layout.frontendTemplateOptionsActionStatus === layout.frontendTemplateActionStatusText &&
      layout.frontendTemplateCardActionState === 'ready' &&
      layout.frontendTemplateCardDisabledReason === '' &&
      layout.frontendTemplateCardTargetTemplateId === FRONTEND_PRODUCT_TEMPLATE_ID &&
      layout.frontendTemplateCardTargetTemplateName === FRONTEND_PRODUCT_TEMPLATE_NAME &&
      layout.frontendTemplateCardTargetSiteId === SITE_ID &&
      layout.frontendTemplateCreateActionState === 'ready' &&
      layout.frontendTemplateCreateAction === 'products.create.frontendTemplate' &&
      layout.frontendTemplateCreateActionRoute === `/products?siteId=${encodeURIComponent(SITE_ID)}&frontendTemplate=${encodeURIComponent(FRONTEND_PRODUCT_TEMPLATE_ID)}` &&
      layout.frontendTemplateCreateDescribedBy === 'products-frontend-template-action-status' &&
      layout.frontendTemplateCreateDisabledReason === '' &&
      layout.frontendTemplateCreateDisabled === false &&
      layout.frontendTemplateCreateTargetTemplateId === FRONTEND_PRODUCT_TEMPLATE_ID &&
      layout.frontendTemplateCreateTargetTemplateName === FRONTEND_PRODUCT_TEMPLATE_NAME &&
      layout.frontendTemplateCreateTargetSiteId === SITE_ID &&
      layout.frontendTemplateCopyActionState === 'ready' &&
      layout.frontendTemplateCopyAction === 'products.copy.frontendTemplateSchema' &&
      layout.frontendTemplateCopyActionRoute === `/products?siteId=${encodeURIComponent(SITE_ID)}&frontendTemplate=${encodeURIComponent(FRONTEND_PRODUCT_TEMPLATE_ID)}` &&
      layout.frontendTemplateCopyDescribedBy === 'products-frontend-template-action-status' &&
      layout.frontendTemplateCopyDisabledReason === '' &&
      layout.frontendTemplateCopyDisabled === false &&
      layout.frontendTemplateCopyTargetTemplateId === FRONTEND_PRODUCT_TEMPLATE_ID &&
      layout.frontendTemplateCopyTargetTemplateName === FRONTEND_PRODUCT_TEMPLATE_NAME &&
      layout.frontendTemplateCopyTargetSiteId === SITE_ID,
    `Products frontend product template actions should expose ready metadata for create/copy/template cards: ${JSON.stringify(layout)}`,
  );
	  assert(
	      layout.hasCommandCenter &&
	      layout.readinessDetailsCollapsed &&
	      layout.controlMapCollapsed &&
	      layout.frontendTemplateOptionsCollapsed &&
      layout.hasFrontendTemplateActionContract &&
	      layout.storefrontApiDetailsCollapsed &&
	      layout.providerCertificationOperatorDetailsCollapsed &&
	      layout.hasApiPanel &&
      layout.hasApiContracts &&
      layout.hasCommerceAnalytics &&
      layout.hasBackendCommerceAnalytics &&
      layout.hasProductPerformance &&
      layout.hasProductAutomation &&
      layout.hasCustomerProfileManager &&
      layout.hasSubscriptionMetadata &&
      layout.hasSubscriptionLifecycle &&
      layout.hasProductLaunchReadiness &&
      layout.hasProviderSync &&
      layout.hasProviderReconciliation &&
      layout.hasProviderCertificationExport &&
      layout.hasPageBindingContract &&
      layout.hasProductPageTemplates &&
      layout.hasEditor &&
      layout.hasEditorActionBar &&
      layout.hasProductActionStatus &&
      layout.hasImportControls,
    `Products page missing expected regions: ${JSON.stringify(layout)}`,
  );
  await assertProductBulkActionStatus(client);
  await assertProductDeleteConfirmationRecovery(client);
  return layout;
};

const assertCustomerProfileManagement = async (
  client,
  customersCollection,
  customerRecord,
) => {
  assert(
    customersCollection?.id,
    "Customers collection is required for profile management smoke coverage",
  );
  assert(
    customerRecord?.id,
    "Customer record is required for profile management smoke coverage",
  );

  await navigateToRoute(
    client,
    "/products",
    "products-command-center",
    "Catalog command center",
  );

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => {
      const selector = document.querySelector('[aria-label="Customer profile"]');
      const manager = document.querySelector('[data-testid="products-customer-profile-manager"]');
      return {
        hasSelector: selector instanceof HTMLSelectElement,
        hasCustomerOption: selector instanceof HTMLSelectElement
          ? Array.from(selector.options).some((option) => option.value === ${JSON.stringify(customerRecord.id)})
          : false,
        hasManager: Boolean(manager),
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`,
    );
    if (state.hasSelector && state.hasCustomerOption && state.hasManager) {
      break;
    }
    if (attempt === 99) {
      throw new Error(
        `Customer profile manager did not load checkout customer: ${JSON.stringify(state)}`,
      );
    }
    await sleep(250);
  }

  await setAriaControl(client, "Customer profile", customerRecord.id);
  await setLabeledControl(client, "Customer name", "Commerce Smoke VIP Buyer", {
    exact: true,
  });
  await setLabeledControl(client, "Customer phone", "+1 555 0199", {
    exact: true,
  });
  await setLabeledControl(client, "Customer status", "vip");
  await setLabeledControl(
    client,
    "Customer notes",
    "Flagged by commerce smoke profile management.",
    { exact: true },
  );
  await clickByText(client, "Save profile", { exact: true });
  await waitUntilIdle(client, "/products customer profile");

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const updated = await getCollectionRecordBySlug(
      customersCollection.id,
      customerRecord.slug,
    );
    if (
      updated?.values?.name === "Commerce Smoke VIP Buyer" &&
      updated.values?.status === "vip" &&
      updated.values?.phone === "+1 555 0199" &&
      String(updated.values?.notes || "").includes(
        "commerce smoke profile management",
      )
    ) {
      return updated;
    }
    await sleep(250);
  }

  const current = await getCollectionRecordBySlug(
    customersCollection.id,
    customerRecord.slug,
  );
  throw new Error(
    `Customer profile management did not persist changes: ${JSON.stringify(current?.values)}`,
  );
};

const assertProductPageTemplateShortcut = async (
  client,
  productCollection,
  template,
) => {
  const mode = template.mode;
  const testId = template.testId || `products-page-template-${mode}`;
  await navigateToRoute(
    client,
    "/products",
    "products-command-center",
    "Catalog command center",
  );

  let clickState = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    clickState = await evaluate(
      client,
      `(() => {
      const button = document.querySelector('[data-testid="${testId}"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return {
          ok: false,
          button: button?.textContent || null,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          hasTemplates: Boolean(document.querySelector('[data-testid="products-page-templates"]')),
          body: document.body?.innerText?.slice(0, 900) || '',
        };
      }
      button.click();
      return { ok: true, text: button.textContent || '' };
    })()`,
    );

    if (clickState.ok) {
      break;
    }

    if (attempt === 239) {
      break;
    }

    await sleep(250);
  }

  assert(
    clickState.ok,
    `Unable to click product ${mode} page template shortcut: ${JSON.stringify(clickState)}`,
  );

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(
      client,
      `(() => {
      const params = new URLSearchParams(window.location.search);
      const payload = JSON.parse(document.querySelector('#page-payload pre')?.textContent || '{}');
      const importPanel = document.querySelector('[data-testid="page-create-dataset-import"]');
      const createButton = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Create Page'));
      return {
        path: window.location.pathname,
        template: params.get('template') || '',
        collectionId: params.get('collectionId') || '',
        datasetMode: params.get('datasetMode') || '',
        title: document.querySelector('#page-title')?.value || '',
        slug: document.querySelector('#page-slug')?.value || '',
        nav: document.querySelector('#page-navigation-placement-select')?.value || '',
        payloadTemplate: payload.template || '',
        payloadDatasetMode: payload.datasetImport?.mode || '',
        payloadCollectionId: payload.datasetImport?.collectionId || '',
        importPanel: Boolean(importPanel),
        importText: importPanel?.textContent || '',
        createButtonDisabled: createButton instanceof HTMLButtonElement ? createButton.disabled : null,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`,
    );

    if (
      state.path === "/pages/new" &&
      state.template === "storefront" &&
      state.collectionId === productCollection.id &&
      state.datasetMode === mode &&
      state.title === template.title &&
      state.slug === template.slug &&
      state.nav === template.nav &&
      state.payloadTemplate === "storefront" &&
      state.payloadDatasetMode === mode &&
      state.payloadCollectionId === productCollection.id &&
      state.importPanel &&
      state.importText.includes(productCollection.name) &&
      state.importText.includes(productCollection.id) &&
      state.createButtonDisabled === false
    ) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(
        `Product ${mode} page template did not open dataset page creation: ${JSON.stringify(state)}`,
      );
    }

    await sleep(250);
  }

  return null;
};

const assertDigitalStockFilters = async (client, productTitle) => {
  const navigateToProductFilter = async (stock) => {
    const url = new URL(`${ADMIN_BASE_URL}/products`);
    url.searchParams.set("siteId", SITE_ID);
    url.searchParams.set("type", "digital");
    url.searchParams.set("stock", stock);
    url.searchParams.set("q", productTitle);
    await client.send("Page.navigate", { url: url.toString() });

    for (let attempt = 0; attempt < 240; attempt += 1) {
      const state = await evaluate(
        client,
        `(() => {
        const body = document.body?.innerText || '';
        const stockFilter = document.querySelector('select[aria-label="Product stock filter"]');
        const typeFilter = document.querySelector('select[aria-label="Product type filter"]');
        const search = document.querySelector('input[aria-label="Search products"]');
        return {
          ready: Boolean(document.querySelector('[data-testid="products-command-center"]')),
          filtersReady: stockFilter instanceof HTMLSelectElement &&
            typeFilter instanceof HTMLSelectElement &&
            search instanceof HTMLInputElement,
          stockValue: stockFilter instanceof HTMLSelectElement ? stockFilter.value : null,
          typeValue: typeFilter instanceof HTMLSelectElement ? typeFilter.value : null,
          searchValue: search instanceof HTMLInputElement ? search.value : null,
          hasProduct: body.includes(${JSON.stringify(productTitle)}),
          hasAvailableStock: body.includes('Available') && body.includes('No physical stock limit'),
          hasEmptyState: body.includes('No products match this view') || body.includes('No products found'),
          body: body.slice(0, 1600),
        };
      })()`,
      );

      if (
        state.ready &&
        state.filtersReady &&
        state.stockValue === stock &&
        state.typeValue === "digital" &&
        state.searchValue === productTitle &&
        (state.hasProduct || state.hasEmptyState)
      ) {
        return state;
      }

      if (attempt === 239) {
        throw new Error(
          `Digital stock filter did not hydrate for ${stock}: ${JSON.stringify(state)}`,
        );
      }
      await sleep(250);
    }

    return null;
  };

  const inStockState = await navigateToProductFilter("in-stock");
  assert(
    inStockState.hasProduct && inStockState.hasAvailableStock,
    `Zero-inventory digital product should appear in stock: ${JSON.stringify(inStockState)}`,
  );

  const outOfStockState = await navigateToProductFilter("out-of-stock");
  assert(
    !outOfStockState.hasProduct && outOfStockState.hasEmptyState,
    `Zero-inventory digital product should not appear out of stock: ${JSON.stringify(outOfStockState)}`,
  );

  await navigateToRoute(
    client,
    "/products",
    "products-command-center",
    "Catalog command center",
  );
  return { inStockState, outOfStockState };
};

const launchChrome = () => {
  assert(
    fs.existsSync(CHROME_BIN),
    `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`,
  );

  const userDataDir = path.join(os.tmpdir(), `backy-commerce-${Date.now()}`);
  const childProcess = spawn(
    CHROME_BIN,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1680,1180",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  return { childProcess, userDataDir };
};

const cleanupBrowser = async ({ client, childProcess, userDataDir }) => {
  if (client) {
    try {
      await client.send("Browser.close");
    } catch {
      // Chrome may already be closing.
    }
    client.close();
  }

  if (childProcess.exitCode === null && childProcess.signalCode === null) {
    childProcess.kill("SIGTERM");
    const exited = await waitForExit(childProcess);
    if (!exited) {
      childProcess.kill("SIGKILL");
      await waitForExit(childProcess, 500);
    }
  }

  fs.rmSync(userDataDir, { recursive: true, force: true });
};

const main = async () => {
  assertProductsApiContractsSource();
  if (SOURCE_ONLY_MODE) {
    console.log(JSON.stringify({
      ok: true,
      mode: "commerce-source-only",
      guard: "products-commerce-provider-certification",
      contracts: [
        "products-provider-certification-ui",
        "product-provider-sync-api",
        "commerce-management-sdk",
        "public-commerce-contracts",
      ],
    }));
    return;
  }

  await loginAdminApi();
  const suffix = Date.now().toString(36);
  const originalSettings = await getSettings();
  await enableCommercePricingSettings(originalSettings);
  const originalFrontendDesign = await getFrontendDesign();
  await patchFrontendDesign(smokeFrontendDesignContract());
  const originalProductCollection = snapshotCollection(
    await findCollection(PRODUCT_COLLECTION_SLUG),
  );
  const originalOrdersCollection = snapshotCollection(
    await findCollection(ORDERS_COLLECTION_SLUG),
  );
  const originalCustomerCollection = snapshotCollection(
    await findCollection(CUSTOMERS_COLLECTION_SLUG),
  );
  const apiSchemaSetup = await ensureCommerceSchemasReadyViaApi();
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let frontendProductRecordId = null;
  let productRecordId = null;
  let importedProductRecordId = null;
  let orderRecordId = null;
  let customerRecordId = null;
  let finalProductCollection = null;
  let finalOrdersCollection = null;
  let finalCustomerCollection = null;
  let frontendProductCleaned = false;
  let restored = false;
  let frontendTemplateProduct = null;
  let frontendCatalogProduct = null;
  let managedCustomerProfile = null;
  let productSeedQuotaRestore = null;

  try {
    if (!PROVIDER_CERTIFICATION_RENDERED_ONLY_MODE) {
      commerceProviderMock = await startCommerceProviderMock();
      stripeCheckoutMock = directCatalogProviderMockEnabled()
        ? await startStripeCheckoutMock()
        : null;
    }
    await waitForCdp();
    const page = (await fetchJson("/json/list")).find(
      (candidate) => candidate.type === "page",
    );
    assert(page?.webSocketDebuggerUrl, "No Chrome page target found");

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("DOM.enable");
    await client.send("Log.enable");
    await client.send("Network.enable");
    await client.send("Network.setCookie", {
      url: API_BASE_URL,
      name: "backy_admin_session",
      value: apiAdminSessionToken,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    });
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: authStorageScript(apiAdminSessionToken),
    });

    if (PROVIDER_CERTIFICATION_RENDERED_ONLY_MODE) {
      const providerCertificationLayout =
        await assertProductsProviderCertificationLayout(client);
      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: "commerce-provider-certification-rendered-only",
            siteId: SITE_ID,
            route: `${ADMIN_BASE_URL}/products?siteId=${SITE_ID}`,
            apiSchemaSetup,
            providerCertificationLayout,
          },
          null,
          2,
        ),
      );
      return;
    }

    const ordersReady = await ensureOrdersReady(client);
    const productsReady = await ensureProductsReady(client);

    finalProductCollection = await findCollection(PRODUCT_COLLECTION_SLUG);
    assert(
      finalProductCollection?.id,
      "Products collection was not available after UI setup",
    );
    await assertProductBillingLimitEnforced(finalProductCollection, suffix);
    productSeedQuotaRestore = await temporarilyAllowProductSeedQuota(
      finalProductCollection,
      4,
    );
    await deleteExistingFrontendTemplateProducts(finalProductCollection);
    await clickFrontendTemplateCreateProduct(client);
    frontendTemplateProduct = await waitForFrontendTemplateProduct(
      finalProductCollection,
    );
    frontendProductRecordId = frontendTemplateProduct.id;
    await assertCreatedProductCanvasAction(client, frontendProductRecordId);
    frontendCatalogProduct = await assertFrontendTemplateProduct({
      productCollection: finalProductCollection,
      record: frontendTemplateProduct,
    });
    await deleteCollectionRecord(
      finalProductCollection.id,
      frontendProductRecordId,
    );
    frontendProductRecordId = null;
    frontendProductCleaned = true;
    await clickByText(client, "New product");

    const { slug } = await fillProductEditor(client, suffix);

    finalProductCollection = await findCollection(PRODUCT_COLLECTION_SLUG);
    finalOrdersCollection = await findCollection(ORDERS_COLLECTION_SLUG);
    assert(
      finalProductCollection?.id,
      "Products collection was not available after UI setup",
    );
    assert(
      finalOrdersCollection?.id,
      "Orders collection was not available after UI setup",
    );
    finalOrdersCollection =
      await assertOrderIntakeReadinessRequiresPrivateOrders(
        finalOrdersCollection,
      );

    const importedProduct = await assertProductCsvImport({
      productCollection: finalProductCollection,
      suffix,
    });
    importedProductRecordId = importedProduct.id;
    await assertDigitalStockFilters(client, `Imported Commerce ${suffix}`);
    await assertOrderBillingLimitEnforced({
      productCollection: finalProductCollection,
      ordersCollection: finalOrdersCollection,
      slug,
      suffix,
    });

    const publicCommerce = await assertPublicCommerce({
      productCollection: finalProductCollection,
      ordersCollection: finalOrdersCollection,
      slug,
      commerceProviderMock,
    });
    productRecordId = publicCommerce.productRecord.id;
    await assertProductProviderSync({
      productCollection: finalProductCollection,
      productRecord: publicCommerce.productRecord,
    });
    orderRecordId = publicCommerce.orderRecord.id;
    finalCustomerCollection = publicCommerce.customersCollection;
    customerRecordId = publicCommerce.customerRecord.id;
    managedCustomerProfile = await assertCustomerProfileManagement(
      client,
      finalCustomerCollection,
      publicCommerce.customerRecord,
    );

    const layout = await assertProductsLayout(client);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
    });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
    const productListPageTemplate = await assertProductPageTemplateShortcut(
      client,
      finalProductCollection,
      {
        mode: "list",
        testId: "products-page-template-list",
        title: "Product catalog",
        slug: "products-list",
        nav: "primary",
      },
    );
    const featuredProductPageTemplate = await assertProductPageTemplateShortcut(
      client,
      finalProductCollection,
      {
        mode: "list",
        testId: "products-page-template-featured-collection",
        title: "Featured products",
        slug: "featured-products",
        nav: "primary",
      },
    );
    const productDetailPageTemplate = await assertProductPageTemplateShortcut(
      client,
      finalProductCollection,
      {
        mode: "item",
        testId: "products-page-template-item",
        title: "Product detail",
        slug: "product-detail",
        nav: "none",
      },
    );
    const productLaunchPageTemplate = await assertProductPageTemplateShortcut(
      client,
      finalProductCollection,
      {
        mode: "item",
        testId: "products-page-template-product-launch",
        title: "Product launch",
        slug: "product-launch",
        nav: "none",
      },
    );

    const browserErrors = client.events
      .filter(
        (event) =>
          event.method === "Runtime.exceptionThrown" ||
          (event.method === "Log.entryAdded" &&
            event.params?.entry?.level === "error"),
      )
      .map((event) => event.params);

    assert(
      browserErrors.length === 0,
      `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`,
    );

    await deleteCollectionRecord(finalOrdersCollection.id, orderRecordId);
    await deleteCollectionRecord(finalCustomerCollection.id, customerRecordId);
    await deleteCollectionRecord(finalProductCollection.id, productRecordId);
    await deleteCollectionRecord(
      finalProductCollection.id,
      importedProductRecordId,
    );
    productRecordId = null;
    importedProductRecordId = null;
    orderRecordId = null;
    customerRecordId = null;

    await restoreCollection(originalProductCollection, finalProductCollection);
    await restoreCollection(originalOrdersCollection, finalOrdersCollection);
    await restoreCollection(
      originalCustomerCollection,
      finalCustomerCollection,
    );
    restored = true;

    console.log(
      JSON.stringify(
        {
          ok: true,
          siteId: SITE_ID,
          routes: {
            products: `${ADMIN_BASE_URL}/products?siteId=${SITE_ID}`,
            orders: `${ADMIN_BASE_URL}/orders?siteId=${SITE_ID}`,
            catalog: `${API_BASE_URL}/api/sites/${SITE_ID}/commerce/catalog?slug=${slug}`,
            orderIntake: `${API_BASE_URL}/api/sites/${SITE_ID}/commerce/orders`,
          },
          apiSchemaSetup,
          ordersReady,
          productsReady,
          product: {
            slug,
            recordId: publicCommerce.productRecord.id,
            startingInventory: publicCommerce.productRecord.values?.inventory,
            endingInventory: publicCommerce.updatedProduct.values?.inventory,
          },
          frontendTemplateProduct: {
            slug: frontendTemplateProduct.slug,
            recordId: frontendTemplateProduct.id,
            templateId:
              frontendTemplateProduct.values?.frontendDesignTemplateId,
            publicTemplateId:
              frontendCatalogProduct.design?.frontendDesignTemplateId,
            bindingHints:
              frontendCatalogProduct.design?.frontendDesignBindingHints
                ?.length || 0,
          },
          importedProduct: {
            slug: importedProduct.slug,
            recordId: importedProduct.id,
          },
          order: {
            id: publicCommerce.order.id,
            slug: publicCommerce.order.slug,
            total: publicCommerce.order.total,
            itemCount: publicCommerce.order.itemCount,
          },
          stripeCheckoutExecution: publicCommerce.stripeCheckoutExecution,
          customer: {
            id: publicCommerce.customerRecord.id,
            slug: publicCommerce.customerRecord.slug,
            orderCount: publicCommerce.customerRecord.values?.ordercount,
            totalSpent: publicCommerce.customerRecord.values?.totalspent,
            managedStatus: managedCustomerProfile?.values?.status,
          },
          layout,
          productPageTemplates: {
            list: {
              collectionId: productListPageTemplate.collectionId,
              datasetMode: productListPageTemplate.datasetMode,
              slug: productListPageTemplate.slug,
            },
            detail: {
              collectionId: productDetailPageTemplate.collectionId,
              datasetMode: productDetailPageTemplate.datasetMode,
              slug: productDetailPageTemplate.slug,
            },
            featured: {
              collectionId: featuredProductPageTemplate.collectionId,
              datasetMode: featuredProductPageTemplate.datasetMode,
              slug: featuredProductPageTemplate.slug,
            },
            launch: {
              collectionId: productLaunchPageTemplate.collectionId,
              datasetMode: productLaunchPageTemplate.datasetMode,
              slug: productLaunchPageTemplate.slug,
            },
          },
          frontendProductCleaned,
          restored,
          screenshotPath: SCREENSHOT_PATH,
        },
        null,
        2,
      ),
    );
  } finally {
    if (!restored) {
      if (finalProductCollection?.id && frontendProductRecordId) {
        await deleteCollectionRecord(
          finalProductCollection.id,
          frontendProductRecordId,
        ).catch((error) => {
          console.warn(
            "Unable to delete frontend template smoke product:",
            error instanceof Error ? error.message : error,
          );
        });
      }
      if (finalOrdersCollection?.id && orderRecordId) {
        await deleteCollectionRecord(
          finalOrdersCollection.id,
          orderRecordId,
        ).catch((error) => {
          console.warn(
            "Unable to delete smoke order:",
            error instanceof Error ? error.message : error,
          );
        });
      }
      if (finalCustomerCollection?.id && customerRecordId) {
        await deleteCollectionRecord(
          finalCustomerCollection.id,
          customerRecordId,
        ).catch((error) => {
          console.warn(
            "Unable to delete smoke customer:",
            error instanceof Error ? error.message : error,
          );
        });
      }
      if (finalProductCollection?.id && productRecordId) {
        await deleteCollectionRecord(
          finalProductCollection.id,
          productRecordId,
        ).catch((error) => {
          console.warn(
            "Unable to delete smoke product:",
            error instanceof Error ? error.message : error,
          );
        });
      }
      if (finalProductCollection?.id && importedProductRecordId) {
        await deleteCollectionRecord(
          finalProductCollection.id,
          importedProductRecordId,
        ).catch((error) => {
          console.warn(
            "Unable to delete imported smoke product:",
            error instanceof Error ? error.message : error,
          );
        });
      }
      await restoreCollection(
        originalProductCollection,
        finalProductCollection ||
          (await findCollection(PRODUCT_COLLECTION_SLUG)),
      ).catch((error) => {
        console.warn(
          "Unable to restore product collection:",
          error instanceof Error ? error.message : error,
        );
      });
      await restoreCollection(
        originalOrdersCollection,
        finalOrdersCollection || (await findCollection(ORDERS_COLLECTION_SLUG)),
      ).catch((error) => {
        console.warn(
          "Unable to restore orders collection:",
          error instanceof Error ? error.message : error,
        );
      });
      await restoreCollection(
        originalCustomerCollection,
        finalCustomerCollection ||
          (await findCollection(CUSTOMERS_COLLECTION_SLUG)),
      ).catch((error) => {
        console.warn(
          "Unable to restore customers collection:",
          error instanceof Error ? error.message : error,
        );
      });
    }
	    await patchFrontendDesign(originalFrontendDesign).catch((error) => {
	      console.warn(
	        "Unable to restore original frontend design contract:",
	        error instanceof Error ? error.message : error,
	      );
	    });
	    if (productSeedQuotaRestore?.siteSettings) {
	      await patchSite({ settings: productSeedQuotaRestore.siteSettings }).catch(
	        (error) => {
	          console.warn(
	            "Unable to restore product seed quota settings:",
	            error instanceof Error ? error.message : error,
	          );
	        },
	      );
	    }
	    await patchSettingsFromSnapshot(originalSettings).catch((error) => {
      console.warn(
        "Unable to restore original settings:",
        error instanceof Error ? error.message : error,
      );
    });

    await cleanupBrowser({ client, childProcess, userDataDir });
    if (stripeCheckoutMock) {
      await stripeCheckoutMock.close();
      stripeCheckoutMock = null;
    }
    if (commerceProviderMock) {
      await commerceProviderMock.close();
      commerceProviderMock = null;
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

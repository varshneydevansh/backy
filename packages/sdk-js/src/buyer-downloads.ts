export interface BackyBuyerEntitlement {
  id: string;
  productId: string;
  filename: string;
  state: "active" | "revoked" | "expired" | "exhausted" | "payment-held";
  expiresAt: string;
  maxDownloads: number;
  downloads: number;
  revokedAt: string | null;
}
export interface BackyBuyerOrder {
  schemaVersion: "backy.buyer-order.v1";
  orderId: string;
  paymentStatus: string;
  entitlements: BackyBuyerEntitlement[];
  history: Array<{
    kind: string;
    createdAt: string;
    entitlementId: string | null;
  }>;
  historyScope?: "presented-order-proof";
  settlementBoundary?: string;
}
/** Keep checkout proof in the customer's private session. Never put it in URLs, discovery, analytics or logs. */
export function createBackyBuyerDownloadsClient(options: {
  baseUrl: string;
  siteId: string;
  orderId: string;
  statusToken: string;
  fetch?: typeof fetch;
}) {
  const base = options.baseUrl.replace(/\/+$/, "").replace(/\/api$/, ""),
    request = options.fetch || globalThis.fetch;
  const endpoint = `${base}/api/sites/${encodeURIComponent(options.siteId)}/commerce/orders/${encodeURIComponent(options.orderId)}/entitlements`;
  const headers = { Authorization: `Bearer ${options.statusToken}` };
  return {
    async order(): Promise<BackyBuyerOrder> {
      const response = await request(endpoint, {
          headers,
          cache: "no-store",
          credentials: "omit",
        }),
        body = await response.json();
      if (!response.ok || !body.success)
        throw Error(body.error?.message || "Buyer order unavailable.");
      return body.data;
    },
    async download(entitlementId: string): Promise<Blob> {
      const response = await request(
        `${endpoint}/${encodeURIComponent(entitlementId)}/download`,
        { method: "POST", headers, cache: "no-store", credentials: "omit" },
      );
      if (!response.ok) {
        const body = await response.json();
        throw Error(body.error?.message || "Download unavailable.");
      }
      return response.blob();
    },
  };
}

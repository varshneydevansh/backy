import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  OrderBuyerEntitlementPanel,
  ProductPrivateFilePanel,
  SitePrivateFileRecoveryPanel,
} from "../src/components/commerce/BuyerDownloads";
export async function runBuyerDownloadsMountedTests(container: HTMLElement) {
  const originalFetch = globalThis.fetch,
    requests: Array<{ path: string; method: string; body: any }> = [],
    checks: Array<{ name: string; passed: boolean }> = [];
  let deny = false,
    held: ((value: Response) => void) | null = null,
    delay = false;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let privateVersions: any[] = [
    {
      id: "protected-fixture",
      filename: "purchased-guide.pdf",
      sizeBytes: 3,
      state: "active",
      protected: true,
      cleanupPending: false,
      errorCode: null,
    },
    {
      id: "unused-fixture",
      filename: "unused-guide.pdf",
      sizeBytes: 3,
      state: "active",
      protected: false,
      cleanupPending: false,
      errorCode: null,
    },
    {
      id: "pending-fixture",
      filename: "failed-upload.pdf",
      sizeBytes: 3,
      state: "planned",
      protected: false,
      cleanupPending: true,
      errorCode: "COMMERCE_PRIVATE_CLEANUP_PENDING",
    },
    ...Array.from({ length: 22 }, (_, i) => ({
      id: "protected-" + i,
      filename: "retained-" + i + ".pdf",
      sizeBytes: 3,
      state: "active",
      protected: true,
      cleanupPending: false,
      errorCode: null,
    })),
  ];
  const order = {
    paymentStatus: "paid",
    entitlements: [
      {
        id: "entitlement-fixture",
        filename: "guide.pdf",
        state: "active",
        downloads: 0,
        maxDownloads: 5,
        expiresAt: "2026-11-12T00:00:00Z",
      },
    ],
    history: [{ kind: "issued", createdAt: "2026-10-13T00:00:00Z" }],
  };
  const response = (data: any, status = 200) =>
    new Response(
      JSON.stringify({
        success: status < 300,
        ...(status < 300
          ? { data }
          : { error: { message: "Permission denied" } }),
      }),
      { status },
    );
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const path = new URL(String(input), location.origin).pathname,
      method = init.method || "GET";
    requests.push({ path, method, body: init.body });
    if (deny) return response({}, 403);
    if (delay) return new Promise<Response>((resolve) => (held = resolve));
    if (path.includes("/commerce/private-files")) {
      if (method === "POST") {
        const action = JSON.parse(String(init.body)).action,
          id = path.split("/").at(-2);
        privateVersions = privateVersions.map((v) =>
          v.id === id
            ? { ...v, state: "removed", cleanupPending: false, errorCode: null }
            : v,
        );
        return response({ fileId: id, state: "removed", removedBytes: 3 });
      }
      const offset = Number(
        new URL(String(input), location.origin).searchParams.get("offset") || 0,
      );
      return response({
        files: offset
          ? [
              {
                id: "tail-fixture",
                filename: "tail-version.pdf",
                sizeBytes: 3,
                state: "active",
                protected: true,
                cleanupPending: false,
                errorCode: null,
              },
            ]
          : privateVersions,
        pagination: { total: 26, limit: 25, offset, hasMore: offset === 0 },
        reservedAndRetainedBytes:
          privateVersions.filter((v) => v.state !== "removed").length * 3,
      });
    }
    if (path.endsWith("/digital-file"))
      return response(
        {
          file: {
            filename: "guide-v2.pdf",
            sizeBytes: 3,
            expiresDays: 30,
            maxDownloads: 5,
          },
        },
        method === "POST" ? 201 : 200,
      );
    return response(
      method === "POST"
        ? {
            ...order,
            entitlements: [{ ...order.entitlements[0], state: "revoked" }],
          }
        : order,
    );
  }) as typeof fetch;
  const root = createRoot(container),
    check = (name: string, value: boolean) => {
      checks.push({ name, passed: value });
      if (!value) throw Error(name + " | " + container.textContent);
    },
    flush = async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    },
    render = async (element: any) => {
      await act(async () => root.render(element));
      await flush();
    },
    click = async (text: string) => {
      const button = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === text,
      );
      if (!button) throw Error("Missing " + text);
      await act(async () => button.click());
      await flush();
    };
  try {
    await render(
      <OrderBuyerEntitlementPanel
        key="first"
        siteId="first-site"
        orderId="first-order"
        canEdit={true}
      />,
    );
    check(
      "Explicit loading issues no request before buyer access action",
      requests.length === 0,
    );
    await click("Load file access");
    check(
      "Order read displays safe file status and allowance",
      container.textContent!.includes("guide.pdf") &&
        container.textContent!.includes("0/5 downloads"),
    );
    check(
      "Order request addresses exact selected scope",
      requests[0].path.includes(
        "/first-site/commerce/orders/first-order/entitlements",
      ),
    );
    await click("Revoke access");
    check(
      "Revocation sends exact entitlement action",
      JSON.parse(requests[1].body).action === "revoke" &&
        JSON.parse(requests[1].body).entitlementId === "entitlement-fixture",
    );
    check(
      "Revoked status removes repeat revoke button",
      container.textContent!.includes("revoked") &&
        !Array.from(container.querySelectorAll("button")).some(
          (b) => b.textContent === "Revoke access",
        ),
    );
    deny = true;
    await click("Load file access");
    check(
      "Current403 clears cached private filename and history",
      !container.textContent!.includes("guide.pdf") &&
        container.textContent!.includes("Permission denied"),
    );
    deny = false;
    delay = true;
    await click("Load file access");
    await render(
      <OrderBuyerEntitlementPanel
        key="second"
        siteId="second-site"
        orderId="second-order"
        canEdit={false}
      />,
    );
    check(
      "Site/order change clears previous private data",
      !container.textContent!.includes("guide.pdf"),
    );
    delay = false;
    await act(async () => held!(response(order)));
    await flush();
    check(
      "Departed read completion cannot publish into new order",
      !container.textContent!.includes("guide.pdf"),
    );
    await click("Load file access");
    check(
      "Current read goes to new site/order",
      requests
        .at(-1)!
        .path.includes(
          "/second-site/commerce/orders/second-order/entitlements",
        ),
    );
    check(
      "Read-only operator cannot revoke",
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Revoke access",
      )!.disabled,
    );
    const before = requests.length;
    await render(
      <ProductPrivateFilePanel
        key="product"
        siteId="second-site"
        productId="product-fixture"
        canEdit={true}
      />,
    );
    check(
      "Product private file panel requires explicit read/upload",
      before === requests.length,
    );
    await click("Read current file");
    check(
      "Product file metadata shows scope and finite policy",
      container.textContent!.includes("guide-v2.pdf") &&
        container.textContent!.includes("30 days") &&
        container.textContent!.includes("5 downloads"),
    );
    const input =
      container.querySelector<HTMLInputElement>("input[type=file]")!;
    const requestsBeforeOversize = requests.length;
    Object.defineProperty(input, "files", {
      value: [
        new File([new Uint8Array(3145729)], "oversize.pdf", {
          type: "application/pdf",
        }),
      ],
      configurable: true,
    });
    await act(async () =>
      input.dispatchEvent(new Event("change", { bubbles: true })),
    );
    await flush();
    check(
      "Raw private upload above3MiB is disabled without a request",
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Upload private file",
      )!.disabled && requests.length === requestsBeforeOversize,
    );
    Object.defineProperty(input, "files", {
      value: [new File(["ABC"], "guide-v2.pdf", { type: "application/pdf" })],
      configurable: true,
    });
    await act(async () =>
      input.dispatchEvent(new Event("change", { bubbles: true })),
    );
    await flush();
    await click("Upload private file");
    check(
      "One explicit upload posts raw File bytes",
      requests.filter(
        (r) => r.method === "POST" && r.path.endsWith("/digital-file"),
      ).length === 1 && requests.at(-1)!.body instanceof File,
    );
    check(
      "Successful file upload explains immutable order boundary",
      container.textContent!.includes(
        "previous orders retain their original file",
      ),
    );
    deny = true;
    await click("Read current file");
    check(
      "Product403 clears prior private filename notice",
      container.textContent!.includes("Permission denied") &&
        !container.textContent!.includes("guide-v2.pdf"),
    );
    deny = false;
    const beforeRecoveryReads = requests.length;
    await render(
      <SitePrivateFileRecoveryPanel
        key="storage-first"
        siteId="first-site"
        canEdit={true}
      />,
    );
    check(
      "Recovery inventory requires explicit read",
      requests.length === beforeRecoveryReads,
    );
    await click("Read private storage");
    check(
      "Private storage shows safe retention and pending evidence",
      container.textContent!.includes("purchased-guide.pdf") &&
        container.textContent!.includes("checkout protected") &&
        container.textContent!.includes("cleanup evidence pending"),
    );
    await click("Recover cleanup");
    check(
      "Recovery posts explicit exact file action",
      JSON.parse(
        requests.find((r) => r.path.includes("pending-fixture/lifecycle"))!
          .body,
      ).action === "recover",
    );
    check(
      "Verified orphan removal replaces pending state",
      !container.textContent!.includes("cleanup evidence pending"),
    );
    const beforeRetire = requests.filter((r) =>
      r.path.endsWith("/lifecycle"),
    ).length;
    await click("Review retirement");
    check(
      "Retirement review performs no write",
      requests.filter((r) => r.path.endsWith("/lifecycle")).length ===
        beforeRetire &&
        container.textContent!.includes("Retire unused-guide.pdf"),
    );
    await click("Retire and remove this version");
    check(
      "Confirmed retirement addresses exact unpurchased version",
      JSON.parse(
        requests.find((r) => r.path.includes("unused-fixture/lifecycle"))!.body,
      ).action === "retire",
    );
    check(
      "Protected rows expose no removal control",
      !Array.from(container.querySelectorAll("button")).some(
        (b) => b.textContent === "Review retirement",
      ),
    );
    await click("Next versions");
    check(
      "Paged private inventory replaces earlier rows",
      container.textContent!.includes("tail-version.pdf") &&
        !container.textContent!.includes("purchased-guide.pdf"),
    );
    await click("Previous versions");
    check(
      "Previous page retains safe tombstones and protected history",
      container.textContent!.includes("purchased-guide.pdf") &&
        container.textContent!.includes("removed"),
    );
    deny = true;
    await click("Read private storage");
    check(
      "Recovery403 clears private names and cached review",
      !container.textContent!.includes("purchased-guide.pdf") &&
        container.textContent!.includes("Permission denied"),
    );
    deny = false;
    delay = true;
    await click("Read private storage");
    await render(
      <SitePrivateFileRecoveryPanel
        key="storage-second"
        siteId="second-site"
        canEdit={false}
      />,
    );
    delay = false;
    await act(async () =>
      held!(
        response({
          files: privateVersions,
          pagination: { total: 25, limit: 25, offset: 0, hasMore: false },
          reservedAndRetainedBytes: 75,
        }),
      ),
    );
    await flush();
    check(
      "Departed private inventory read cannot publish into another site",
      !container.textContent!.includes("purchased-guide.pdf"),
    );
    return {
      ok: true,
      checks,
      providerRequests: 0,
      boundary:
        "Mounted actual admin paid-file panels; synthetic fetch. PostgreSQL and actual handler evidence is separate.",
    };
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;
  }
}

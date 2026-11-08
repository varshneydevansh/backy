import { Button } from "@/components/ui/Button";
import { useEffect, useRef, useState } from "react";
import { adminFetch, getAdminApiBase } from "@/lib/adminContentApi";
type Entitlement = {
  id: string;
  filename: string;
  state: string;
  downloads: number;
  maxDownloads: number;
  expiresAt: string;
};
function useRequestAuthority() {
  const current = useRef(true);
  useEffect(() => {
    current.current = true;
    return () => {
      current.current = false;
    };
  }, []);
  return current;
}
async function readResponse(response: Response) {
  const body = await response.json();
  if (!response.ok || !body.success)
    throw Error(body.error?.message || "Private fulfilment unavailable.");
  return body.data;
}
export function OrderBuyerEntitlementPanel({
  siteId,
  orderId,
  canEdit,
}: {
  siteId: string;
  orderId: string;
  canEdit: boolean;
}) {
  const [data, setData] = useState<{
      paymentStatus: string;
      entitlements: Entitlement[];
      history: Array<{ kind: string; createdAt: string }>;
    } | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    authority = useRequestAuthority();
  const endpoint = `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/commerce/orders/${encodeURIComponent(orderId)}/entitlements`;
  const run = async (id?: string) => {
    setBusy(true);
    setNotice("");
    try {
      const next = await readResponse(
        await adminFetch(
          endpoint,
          id
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "revoke", entitlementId: id }),
              }
            : { cache: "no-store" },
        ),
      );
      if (authority.current) setData(next);
    } catch (e) {
      if (authority.current) {
        setData(null);
        setNotice(e instanceof Error ? e.message : "Unavailable.");
      }
    } finally {
      if (authority.current) setBusy(false);
    }
  };
  return (
    <section
      className="mb-4 rounded-lg border p-3"
      aria-busy={busy}
      data-testid="order-buyer-entitlements"
    >
      <h3 className="font-semibold">Paid file access</h3>
      <p className="my-2 text-sm text-muted-foreground">
        Persisted paid orders only. Refunds hold access immediately. Buyer
        history requires the checkout proof for each order.
      </p>
      <Button
        type="button"
        className="rounded border px-3 py-2 text-sm"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? "Loading access…" : "Load file access"}
      </Button>
      {notice && (
        <p role="alert" className="mt-2 text-sm">
          {notice}
        </p>
      )}
      {data && (
        <>
          <p className="my-2 text-sm">Payment: {data.paymentStatus}</p>
          {data.entitlements.length ? (
            data.entitlements.map((e) => (
              <div key={e.id} className="my-2 rounded border p-2 text-sm">
                <p>
                  {e.filename} · {e.state}
                </p>
                <p>
                  {e.downloads}/{e.maxDownloads} downloads · expires{" "}
                  {new Date(e.expiresAt).toLocaleDateString()}
                </p>
                {e.state !== "revoked" && (
                  <Button
                    type="button"
                    className="mt-2 rounded border px-3 py-2"
                    disabled={busy || !canEdit}
                    onClick={() => void run(e.id)}
                  >
                    Revoke access
                  </Button>
                )}
              </div>
            ))
          ) : (
            <p className="mt-2 text-sm">
              No private file snapshot was captured for this order.
            </p>
          )}
          <details className="mt-2 text-sm">
            <summary>
              Access history ({data.history.length}, latest 100)
            </summary>
            {data.history.map((e, i) => (
              <p key={i}>
                {e.kind} · {e.createdAt}
              </p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
export function ProductPrivateFilePanel({
  siteId,
  productId,
  canEdit,
}: {
  siteId: string;
  productId: string;
  canEdit: boolean;
}) {
  const [file, setFile] = useState<File | null>(null),
    [days, setDays] = useState(30),
    [limit, setLimit] = useState(5),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    authority = useRequestAuthority();
  const endpoint = `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/commerce/products/${encodeURIComponent(productId)}/digital-file`;
  const run = async (upload = false) => {
    setBusy(true);
    setNotice("");
    try {
      const next = await readResponse(
        await adminFetch(
          endpoint +
            (upload ? `?expiresDays=${days}&maxDownloads=${limit}` : ""),
          upload && file
            ? {
                method: "POST",
                headers: {
                  "Content-Type": file.type || "application/octet-stream",
                  "X-Backy-File-Name": encodeURIComponent(file.name),
                },
                body: file,
              }
            : { cache: "no-store" },
        ),
      );
      if (authority.current) {
        setNotice(
          next.file
            ? `${next.file.filename} · ${next.file.sizeBytes} bytes · ${next.file.expiresDays} days · ${next.file.maxDownloads} downloads. Future checkout orders capture this file; previous orders retain their original file.`
            : "No private paid file configured.",
        );
        if (upload) setFile(null);
      }
    } catch (e) {
      if (authority.current)
        setNotice(e instanceof Error ? e.message : "Unavailable.");
    } finally {
      if (authority.current) setBusy(false);
    }
  };
  return (
    <section
      className="mt-3 rounded-lg border p-3"
      aria-busy={busy}
      data-testid="product-private-paid-file"
    >
      <h3 className="font-semibold">Private paid file</h3>
      <p className="my-2 text-sm text-muted-foreground">
        Upload a file up to 3MiB to verified private storage. Expiry starts at
        checkout creation. This does not enable payments or certify a payment
        provider.
      </p>
      <Button
        type="button"
        className="rounded border px-3 py-2 text-sm"
        disabled={busy}
        onClick={() => void run()}
      >
        Read current file
      </Button>
      <div className="mt-3 grid gap-2">
        <input
          aria-label="Private paid file"
          type="file"
          disabled={busy || !canEdit}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <label className="text-sm">
          Expiry days{" "}
          <input
            aria-label="Paid file expiry days"
            type="number"
            min={1}
            max={365}
            value={days}
            disabled={busy || !canEdit}
            onChange={(e) => setDays(Number(e.target.value))}
            className="ml-2 min-h-11 w-20 rounded border px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Download limit{" "}
          <input
            aria-label="Paid file download limit"
            type="number"
            min={1}
            max={100}
            value={limit}
            disabled={busy || !canEdit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="ml-2 min-h-11 w-20 rounded border px-2 py-1"
          />
        </label>
        <Button
          type="button"
          className="rounded border px-3 py-2 text-sm"
          disabled={
            busy ||
            !canEdit ||
            !file ||
            file.size > 3145728 ||
            !Number.isInteger(days) ||
            days < 1 ||
            days > 365 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
          }
          onClick={() => void run(true)}
        >
          Upload private file
        </Button>
      </div>
      {notice && (
        <p role="status" className="mt-2 text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}

type PrivateVersion = {
  id: string;
  productId: string;
  filename: string;
  sizeBytes: number;
  state: string;
  protected: boolean;
  cleanupPending: boolean;
  errorCode: string | null;
};
/** Explicit website inventory; paths, provider credentials and proof tokens never enter this view. */
export function SitePrivateFileRecoveryPanel({
  siteId,
  canEdit,
}: {
  siteId: string;
  canEdit: boolean;
}) {
  const [page, setPage] = useState<{
      files: PrivateVersion[];
      pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
      reservedAndRetainedBytes: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [review, setReview] = useState<PrivateVersion | null>(null),
    authority = useRequestAuthority();
  const endpoint = `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/commerce/private-files`;
  const run = async (offset = 0, file?: PrivateVersion, retire = false) => {
    setBusy(true);
    setNotice("");
    try {
      if (file)
        await readResponse(
          await adminFetch(
            `${endpoint}/${encodeURIComponent(file.id)}/lifecycle`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: retire ? "retire" : "recover" }),
            },
          ),
        );
      const next = await readResponse(
        await adminFetch(`${endpoint}?limit=25&offset=${offset}`, {
          cache: "no-store",
        }),
      );
      if (authority.current) {
        setPage(next);
        setReview(null);
        if (file)
          setNotice(
            "Storage state refreshed. Protected versions and uncertain cleanup retain their bytes.",
          );
      }
    } catch (e) {
      if (authority.current) {
        setPage(null);
        setReview(null);
        setNotice(
          e instanceof Error ? e.message : "Private storage unavailable.",
        );
      }
    } finally {
      if (authority.current) setBusy(false);
    }
  };
  return (
    <section
      className="mb-4 border-y py-3"
      aria-busy={busy}
      data-testid="private-file-recovery"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Private file storage</h3>
        <Button disabled={busy} onClick={() => void run()}>
          Read private storage
        </Button>
      </div>
      <p className="my-2 text-sm text-muted-foreground">
        Planned uploads and retained versions share the website media quota.
        Checkout history protects purchased and pending versions. Recover
        interrupted uploads or explicitly retire an unpurchased version before
        removing verified bytes.
      </p>
      {notice && (
        <p role="status" className="my-2 text-sm">
          {notice}
        </p>
      )}
      {page && (
        <>
          <p className="my-2 text-sm tabular-nums">
            {page.reservedAndRetainedBytes} bytes reserved or retained ·{" "}
            {page.pagination.total} versions
          </p>
          {page.files.length ? (
            page.files.map((file) => (
              <div
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="break-all">
                    {file.filename} · {file.state}
                    {file.protected ? " · checkout protected" : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {file.sizeBytes} bytes
                    {file.cleanupPending ? " · cleanup evidence pending" : ""}
                    {file.errorCode ? ` · ${file.errorCode}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {file.cleanupPending && !file.protected && (
                    <Button
                      disabled={busy || !canEdit}
                      onClick={() => void run(page.pagination.offset, file)}
                    >
                      Recover cleanup
                    </Button>
                  )}
                  {file.state === "active" &&
                    !file.protected &&
                    file.errorCode !== "COMMERCE_PRIVATE_FILE_UNVERIFIED" && (
                      <Button
                        disabled={busy || !canEdit}
                        onClick={() => setReview(file)}
                      >
                        Review retirement
                      </Button>
                    )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm">No private file storage records.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              disabled={busy || page.pagination.offset === 0}
              onClick={() => void run(Math.max(0, page.pagination.offset - 25))}
            >
              Previous versions
            </Button>
            <Button
              disabled={busy || !page.pagination.hasMore}
              onClick={() => void run(page.pagination.offset + 25)}
            >
              Next versions
            </Button>
          </div>
        </>
      )}
      {review && (
        <div
          className="mt-3 border border-destructive/30 p-3 text-sm"
          role="alert"
        >
          <p className="break-all">
            Retire {review.filename} and remove its verified unpurchased bytes?
            Future checkouts will no longer select this version. Checkout or
            entitlement claims will block removal.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={busy || !canEdit}
              onClick={() =>
                void run(page?.pagination.offset || 0, review, true)
              }
            >
              Retire and remove this version
            </Button>
            <Button disabled={busy} onClick={() => setReview(null)}>
              Cancel retirement
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

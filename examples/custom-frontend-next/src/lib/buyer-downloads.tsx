"use client";
import { useEffect, useRef, useState } from "react";
type Entitlement = {
  id: string;
  filename: string;
  state: string;
  downloads: number;
  maxDownloads: number;
  expiresAt: string;
};
/** Optional presented-order view. Supply the checkout proof from a private customer session. */
export function BuyerDownloads(props: {
  apiBaseUrl: string;
  siteId: string;
  orderId: string;
  statusToken: string;
}) {
  return (
    <BuyerDownloadsSession
      key={`${props.siteId}:${props.orderId}:${props.statusToken}`}
      {...props}
    />
  );
}
function BuyerDownloadsSession({
  apiBaseUrl,
  siteId,
  orderId,
  statusToken,
}: {
  apiBaseUrl: string;
  siteId: string;
  orderId: string;
  statusToken: string;
}) {
  const [items, setItems] = useState<Entitlement[]>([]),
    [loaded, setLoaded] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    current = useRef(true);
  useEffect(() => {
    current.current = true;
    return () => {
      current.current = false;
    };
  }, []);
  const base = apiBaseUrl.replace(/\/+$/, "").replace(/\/api$/, ""),
    url = `${base}/api/sites/${encodeURIComponent(siteId)}/commerce/orders/${encodeURIComponent(orderId)}/entitlements`,
    headers = { Authorization: `Bearer ${statusToken}` };
  const run = async (item?: Entitlement) => {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        item ? `${url}/${encodeURIComponent(item.id)}/download` : url,
        {
          method: item ? "POST" : "GET",
          headers,
          cache: "no-store",
          credentials: "omit",
        },
      );
      if (!response.ok) {
        const body = await response.json();
        throw Error(body.error?.message || "Buyer access unavailable.");
      }
      if (item) {
        const bytes = await response.blob();
        if (!current.current) return;
        const objectUrl = URL.createObjectURL(bytes),
          anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = item.filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        setNotice(
          "Download admitted. Reload access to refresh the remaining allowance.",
        );
      } else {
        const body = await response.json();
        if (current.current) {
          setItems(body.data.entitlements);
          setLoaded(true);
        }
      }
    } catch (e) {
      if (current.current) {
        setItems([]);
        setLoaded(false);
        setNotice(e instanceof Error ? e.message : "Unavailable.");
      }
    } finally {
      if (current.current) setBusy(false);
    }
  };
  return (
    <section aria-label="Purchased file downloads">
      <h2>Purchased files</h2>
      <button disabled={busy} onClick={() => void run()}>
        Load purchased file access
      </button>
      {loaded && items.length === 0 && (
        <p>No private file was captured for this order.</p>
      )}
      {items.map((item) => (
        <div key={item.id}>
          <p>
            {item.filename}: {item.state} · {item.downloads}/{item.maxDownloads}{" "}
            downloads · expires {new Date(item.expiresAt).toLocaleDateString()}
          </p>
          <button
            disabled={busy || item.state !== "active"}
            onClick={() => void run(item)}
          >
            Download {item.filename}
          </button>
        </div>
      ))}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

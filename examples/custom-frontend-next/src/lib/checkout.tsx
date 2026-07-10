"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { BackyCommerceCatalog, BackyCommerceProduct } from "./backy-client";

type CheckoutContract = Record<string, unknown>;
type Cart = Record<string, number>;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asText = (...values: unknown[]): string => {
  const found = values.find((value) => typeof value === "string" && value.trim());
  return typeof found === "string" ? found.trim() : "";
};

const asBoolean = (value: unknown): boolean => value === true;

const money = (value: number, currency: string): string => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

const safeProviderUrl = (value: unknown): string => {
  const candidate = asText(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    const stripeHost = url.hostname === "checkout.stripe.com" || url.hostname.endsWith(".checkout.stripe.com");
    return url.protocol === "https:" && stripeHost ? url.toString() : "";
  } catch {
    return "";
  }
};

const productKey = (product: BackyCommerceProduct): string => product.id || product.slug;

export function BackyCheckout({
  catalog,
  contract,
  initialProduct,
  siteName,
}: {
  catalog: BackyCommerceCatalog;
  contract: CheckoutContract;
  initialProduct?: string;
  siteName: string;
}) {
  const products = catalog.products || [];
  const initial = products.find((product) => [product.id, product.slug].includes(initialProduct || ""));
  const [cart, setCart] = useState<Cart>(() => initial ? { [productKey(initial)]: 1 } : {});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState<Record<string, unknown> | null>(null);
  const submissionInFlight = useRef(false);
  const idempotencyKey = useRef("");

  const commerce = asRecord(catalog.commerce || asRecord(contract).commerce);
  const capabilities = asRecord(commerce.capabilities);
  const providerCheckout = asBoolean(capabilities.providerCheckout);
  const orderIntake = capabilities.orderIntake !== false;
  const currency = asText(commerce.currency, products[0]?.currency) || "USD";
  const selected = useMemo(() => products
    .filter((product) => (cart[productKey(product)] || 0) > 0)
    .map((product) => ({ product, quantity: cart[productKey(product)] })), [cart, products]);
  const total = selected.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  const setQuantity = (product: BackyCommerceProduct, quantity: number) => {
    const key = productKey(product);
    setCart((current) => {
      const next = { ...current };
      if (quantity < 1) delete next[key];
      else next[key] = Math.min(999, quantity);
      return next;
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionInFlight.current) return;
    if (selected.length === 0) {
      setMessage("Add at least one product before continuing.");
      return;
    }
    submissionInFlight.current = true;
    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID();
    }
    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/backy-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: form.get("name"),
            email: form.get("email"),
            phone: form.get("phone"),
          },
          items: selected.map(({ product, quantity }) => ({
            productId: product.id,
            slug: product.slug,
            quantity,
          })),
          shippingAddress: form.get("shippingAddress"),
          notes: form.get("notes"),
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const payload = asRecord(await response.json().catch(() => ({})));
      if (!response.ok || payload.success === false) {
        const error = asRecord(payload.error);
        throw new Error(asText(error.message, payload.message) || "The order could not be created.");
      }
      const data = asRecord(payload.data);
      const checkoutSession = asRecord(data.checkoutSession);
      const providerUrl = safeProviderUrl(checkoutSession.url);
      if (
        checkoutSession.provider === "stripe" &&
        checkoutSession.handoffMode === "provider" &&
        checkoutSession.status === "provider_created" &&
        providerUrl
      ) {
        window.location.assign(providerUrl);
        return;
      }
      setCompleted(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The order could not be created.");
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  };

  if (completed) {
    const order = asRecord(completed.order);
    const checkoutSession = asRecord(completed.checkoutSession);
    const providerUnavailable = providerCheckout && checkoutSession.status !== "provider_created";
    return (
      <main data-backy-checkout="complete" className="backy-checkout-shell">
        <section className="backy-checkout-result" aria-labelledby="checkout-complete-title">
          <p className="backy-eyebrow">Order received</p>
          <h1 id="checkout-complete-title">Thank you. Your order is recorded.</h1>
          <p>Reference <strong>{asText(order.orderNumber, order.slug, order.id)}</strong></p>
          <dl>
            <div><dt>Total</dt><dd>{money(Number(order.total || 0), asText(order.currency) || currency)}</dd></div>
            <div><dt>Payment</dt><dd>{asText(order.paymentStatus) || "pending"}</dd></div>
            <div><dt>Fulfillment</dt><dd>{asText(order.fulfillmentStatus) || "unfulfilled"}</dd></div>
          </dl>
          <p>{providerUnavailable ? "Your order is recorded, but a secure payment session is not available yet. The site owner will contact you before payment or fulfillment." : providerCheckout ? "Payment status will update after the provider confirms checkout." : "This storefront is accepting manual orders. The site owner will contact you about payment and fulfillment."}</p>
          <a href="/products">Continue browsing</a>
        </section>
      </main>
    );
  }

  return (
    <main data-backy-checkout="order-intake" className="backy-checkout-shell">
      <header className="backy-checkout-header">
        <p className="backy-eyebrow">{siteName}</p>
        <h1>Checkout</h1>
        <p>{providerCheckout ? "Confirm your cart, then continue to the secure payment provider." : "Submit your order request. Payment details are never collected on this page."}</p>
      </header>

      {products.length === 0 ? (
        <section className="backy-checkout-empty">
          <h2>The catalog is being prepared</h2>
          <p>No published products are available yet.</p>
          <a href="/products">Return to products</a>
        </section>
      ) : (
        <div className="backy-checkout-layout">
          <section aria-labelledby="catalog-title">
            <h2 id="catalog-title">Products</h2>
            <div className="backy-checkout-products">
              {products.map((product) => {
                const quantity = cart[productKey(product)] || 0;
                return (
                  <article key={productKey(product)}>
                    {product.imageUrl ? <img src={product.imageUrl} alt="" /> : null}
                    <div>
                      <h3>{product.title}</h3>
                      {product.description ? <p>{product.description}</p> : null}
                      <strong>{money(product.price, product.currency || currency)}</strong>
                    </div>
                    {quantity > 0 ? (
                      <label>Quantity
                        <input type="number" min="0" max="999" value={quantity} onChange={(event) => setQuantity(product, Number(event.target.value))} />
                      </label>
                    ) : (
                      <button type="button" onClick={() => setQuantity(product, 1)}>Add to cart</button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="backy-checkout-order" aria-labelledby="order-title">
            <h2 id="order-title">Your order</h2>
            {selected.length === 0 ? <p>Your cart is empty.</p> : (
              <ul>{selected.map(({ product, quantity }) => <li key={productKey(product)}><span>{product.title} × {quantity}</span><strong>{money(product.price * quantity, product.currency || currency)}</strong></li>)}</ul>
            )}
            <p className="backy-checkout-total"><span>Estimated subtotal</span><strong>{money(total, currency)}</strong></p>
            <form onSubmit={submit}>
              <label>Name<input name="name" autoComplete="name" required /></label>
              <label>Email<input name="email" type="email" autoComplete="email" required /></label>
              <label>Phone <span>(optional)</span><input name="phone" type="tel" autoComplete="tel" /></label>
              <label>Shipping address <span>(optional)</span><textarea name="shippingAddress" autoComplete="street-address" rows={3} /></label>
              <label>Order notes <span>(optional)</span><textarea name="notes" rows={3} /></label>
              {message ? <p role="alert" className="backy-checkout-error">{message}</p> : null}
              <button type="submit" disabled={!orderIntake || selected.length === 0 || submitting}>{submitting ? "Creating order…" : providerCheckout ? "Continue to payment" : "Submit order request"}</button>
              <small>Do not enter card details. Secure payment, when enabled, happens with the configured provider.</small>
            </form>
          </aside>
        </div>
      )}
    </main>
  );
}

export function BackyCheckoutResult({
  state,
  orderReference,
}: {
  state: "success" | "cancel";
  orderReference?: string;
}) {
  const success = state === "success";
  const [verifiedOrder, setVerifiedOrder] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!success) return;
    let active = true;
    fetch("/api/backy-checkout?status=latest", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!active || !payload) return;
        const data = asRecord(asRecord(payload).data);
        const statusHandoff = asRecord(data.statusHandoff);
        setVerifiedOrder(asRecord(statusHandoff.order));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [success]);

  const verifiedReference = asText(verifiedOrder?.orderNumber, orderReference);
  return (
    <main data-backy-checkout-result={state} className="backy-checkout-shell">
      <section className="backy-checkout-result">
        <p className="backy-eyebrow">Checkout</p>
        <h1>{success ? "Your checkout is being confirmed" : "Checkout was canceled"}</h1>
        <p>{success ? "The payment provider has returned you to the storefront. Backy will reconcile the final payment and fulfillment status." : "No additional payment was collected. Your cart can be reviewed before trying again."}</p>
        {verifiedReference ? <p>Order reference <strong>{verifiedReference}</strong></p> : null}
        {verifiedOrder ? <p>Current status: <strong>{asText(verifiedOrder.paymentStatus) || "pending"}</strong> payment, <strong>{asText(verifiedOrder.fulfillmentStatus) || "unfulfilled"}</strong> fulfillment.</p> : null}
        <a href={success ? "/products" : "/checkout"}>{success ? "Continue browsing" : "Return to checkout"}</a>
      </section>
    </main>
  );
}

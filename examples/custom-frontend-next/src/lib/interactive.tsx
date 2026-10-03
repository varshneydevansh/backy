"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BackyElement } from "./backy-client";

const protocol = "backy.interactive-component.v1";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";

export function sandboxComponentUrl(apiBase: string, siteId: string, key: string, version: string): string {
  if (!siteId || !key || !version) return "";
  try {
    const base = new URL(apiBase);
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) return "";
    base.search = "";
    base.hash = "";
    return `${base.href.replace(/\/+$/, "")}/sites/${encodeURIComponent(siteId)}/interactive-components/${encodeURIComponent(key)}/${encodeURIComponent(version)}/sandbox`;
  } catch { return ""; }
}

export function isWidgetMessage(source: unknown, frame: unknown, data: unknown, key: string, version: string): boolean {
  const message = record(data);
  return Boolean(frame) && source === frame && message.protocol === protocol && message.componentKey === key && message.version === version;
}

export function widgetInitPayload(element: BackyElement) {
  const props = { ...record(element.props) };
  for (const key of ["sandboxUrl", "iframeUrl", "url", "src", "bundleUrl", "runtime", "fallback", "renderCapabilities"]) delete props[key];
  return {
    type: "backy.interactive-component.init", protocol,
    componentKey: text(element.componentKey) || text(element.props?.componentKey),
    version: text(element.version) || text(element.props?.version),
    props,
    controls: element.controls ?? element.props?.controls ?? [],
    dataBindings: element.dataBindings ?? element.props?.dataBindings ?? {},
    fallback: element.fallback ?? element.props?.fallback ?? {},
  };
}

export function BackyInteractiveComponent({ element, siteId, publicApiBaseUrl }: { element: BackyElement; siteId: string; publicApiBaseUrl: string }) {
  const props = record(element.props);
  const fallbackValue = element.fallback ?? props.fallback;
  const fallback = typeof fallbackValue === "string" ? { text: fallbackValue } : record(fallbackValue);
  const title = text(fallback.title) || text(props.title) || text(props.componentKey) || "Interactive component";
  const summary = text(fallback.text) || text(props.fallbackText) || "Interactive content is available in supported frontends.";
  let imageUrl = "";
  try {
    const url = new URL(text(fallback.imageUrl), publicApiBaseUrl);
    if (text(fallback.imageUrl) && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password) imageUrl = url.href;
  } catch { /* Text fallback remains available without a valid media URL. */ }
  const capabilities = record(element.renderCapabilities ?? props.renderCapabilities);
  const init = useMemo(() => widgetInitPayload(element), [element]);
  // Always address the configured Backy API. Never embed a saved arbitrary URL or import a bundle into this frontend.
  const src = element.type === "codeComponent" && capabilities.hydrationMode === "sandbox-iframe"
    ? sandboxComponentUrl(publicApiBaseUrl, siteId, init.componentKey, init.version) : "";
  const frame = useRef<HTMLIFrameElement>(null);
  const initRef = useRef(init);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(Math.max(120, Math.min(2400, element.height || 300)));
  const [error, setError] = useState("");
  const sendInit = useCallback(() => frame.current?.contentWindow?.postMessage(initRef.current, "*"), []);

  useEffect(() => {
    if (!src) return;
    setReady(false);
    setError("");
    const timeout = window.setTimeout(() => setError("Interactive component could not be loaded."), 10000);
    const receive = (event: MessageEvent) => {
      if (!isWidgetMessage(event.source, frame.current?.contentWindow, event.data, init.componentKey, init.version)) return;
      const message = record(event.data);
      if (message.type === "backy.interactive-component.ready") {
        window.clearTimeout(timeout);
        setReady(true);
        setError("");
        sendInit();
      } else if (message.type === "backy.interactive-component.resize") {
        const size = Number(message.height);
        if (Number.isFinite(size)) {
          // The SSR iframe may load before hydration installs this listener.
          // A scoped resize reply to init also proves the sandbox is responding.
          window.clearTimeout(timeout);
          setReady(true);
          setHeight(Math.max(120, Math.min(2400, Math.round(size))));
        }
      } else if (message.type === "backy.interactive-component.error") {
        window.clearTimeout(timeout);
        setError(text(message.message).slice(0, 500) || "Interactive component failed to load.");
      }
    };
    window.addEventListener("message", receive);
    return () => { window.clearTimeout(timeout); window.removeEventListener("message", receive); };
  }, [src, init.componentKey, init.version, sendInit]);

  useEffect(() => { initRef.current = init; if (src) sendInit(); }, [src, init, sendInit]);
  const showFrame = Boolean(src && ready && !error);
  return (
    <div data-backy-interactive-component={init.componentKey} data-backy-interactive-version={init.version} data-backy-hydration-mode={src ? "sandbox-iframe" : "static-fallback"} data-backy-sandbox-runtime-error={error || undefined}>
      {src ? <iframe ref={frame} title={title} src={src} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" onLoad={sendInit} style={{ display: error ? "none" : "block", width: "100%", height, border: 0 }} /> : null}
      {!showFrame ? <figure data-backy-interactive-fallback="" style={{ margin: 0 }}>{imageUrl ? <img src={imageUrl} alt={text(fallback.alt) || title} /> : null}<figcaption><strong>{title}</strong><p>{summary}</p>{error ? <p role="status">{error}</p> : null}</figcaption></figure> : null}
    </div>
  );
}

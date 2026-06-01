import type { CSSProperties, ReactNode } from "react";

import type { BackyElement, BackyMediaAsset, BackyRenderPayload } from "./backy-client";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
};

const asNumber = (value: unknown): number | undefined => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const elementChildren = (element: BackyElement): BackyElement[] =>
  Array.isArray(element.children) ? (element.children as BackyElement[]) : [];

export function extractBackyElements(payload: BackyRenderPayload): BackyElement[] {
  const content = asRecord(payload.content);
  const nestedDocument = asRecord(content.contentDocument);
  const directElements = Array.isArray(content.elements) ? content.elements : [];
  const nestedElements = Array.isArray(nestedDocument.elements) ? nestedDocument.elements : [];
  return (directElements.length > 0 ? directElements : nestedElements) as BackyElement[];
}

function mediaUrl(element: BackyElement, assets: BackyMediaAsset[]): string {
  const props = asRecord(element.props);
  const id = asText(props.mediaId, props.imageId, props.assetId);
  const direct = asText(props.src, props.url, props.deliveryUrl);
  const asset = id ? assets.find((candidate) => candidate.id === id) : undefined;
  return direct || asset?.deliveryUrl || asset?.url || asset?.src || "";
}

function elementStyle(element: BackyElement): CSSProperties {
  const props = asRecord(element.props);
  const style = asRecord(element.style);
  const styles = asRecord(element.styles);
  const x = asNumber(element.x);
  const y = asNumber(element.y);
  const width = asNumber(element.width);
  const height = asNumber(element.height);
  const zIndex = asNumber(element.zIndex);
  return {
    position: x !== undefined || y !== undefined ? "absolute" : undefined,
    left: x,
    top: y,
    width,
    minHeight: height,
    zIndex,
    color: asText(styles.color, style.color, props.color) || undefined,
    background: asText(styles.background, style.background, props.backgroundColor) || undefined,
    borderRadius: asText(styles.borderRadius, style.borderRadius, props.borderRadius) || undefined,
  };
}

function BackyElementFrame({
  element,
  children,
}: {
  element: BackyElement;
  children: ReactNode;
}) {
  if (element.visible === false || element.hidden === true) return null;
  return (
    <div
      data-backy-element-id={element.id}
      data-backy-element-type={element.type}
      data-backy-component-key={typeof element.componentKey === "string" ? element.componentKey : undefined}
      style={elementStyle(element)}
    >
      {children}
    </div>
  );
}

export function BackyElementView({
  element,
  payload,
}: {
  element: BackyElement;
  payload: BackyRenderPayload;
}) {
  const props = asRecord(element.props);
  const children = elementChildren(element);
  const text = asText(props.content, props.text, props.label, element.name);

  if (element.type === "image") {
    const src = mediaUrl(element, payload.assets.media);
    return (
      <BackyElementFrame element={element}>
        {src ? <img src={src} alt={asText(props.alt, props.title)} /> : null}
      </BackyElementFrame>
    );
  }

  if (element.type === "button" || element.type === "link") {
    const href = asText(props.href, props.url) || "#";
    return (
      <BackyElementFrame element={element}>
        <a href={href}>{text || "Read more"}</a>
      </BackyElementFrame>
    );
  }

  if (element.type === "navigation" || element.type === "nav") {
    return (
      <BackyElementFrame element={element}>
        <nav aria-label={asText(props.ariaLabel) || "Primary navigation"}>
          {(payload.navigation.primary || []).map((item) => (
            <a key={item.id || item.href || item.label} href={item.href || "#"}>
              {item.label || item.title || item.href}
            </a>
          ))}
        </nav>
      </BackyElementFrame>
    );
  }

  if (element.type === "form") {
    const formId = asText(props.formId, props.id);
    return (
      <BackyElementFrame element={element}>
        <form method="post" action="/api/backy-form" data-backy-form-id={formId}>
          <input type="hidden" name="formId" value={formId} />
          <input name="email" type="email" placeholder="Email" />
          <textarea name="message" placeholder="Message" />
          <button type="submit">{asText(props.submitLabel) || "Submit"}</button>
        </form>
      </BackyElementFrame>
    );
  }

  if (children.length > 0) {
    return (
      <BackyElementFrame element={element}>
        {children.map((child) => (
          <BackyElementView key={child.id} element={child} payload={payload} />
        ))}
      </BackyElementFrame>
    );
  }

  if (element.type === "heading") {
    return (
      <BackyElementFrame element={element}>
        <h1>{text || "Untitled"}</h1>
      </BackyElementFrame>
    );
  }

  return (
    <BackyElementFrame element={element}>
      <p>{text}</p>
    </BackyElementFrame>
  );
}

export function BackyPage({
  payload,
}: {
  payload: BackyRenderPayload;
}) {
  const elements = extractBackyElements(payload);
  const canvas = asRecord(payload.content.canvas);
  const width = asNumber(canvas.width) || 1200;
  const height = asNumber(canvas.height) || 900;

  return (
    <main
      data-backy-site-id={payload.site.id}
      data-backy-route={payload.route.path}
      style={{ position: "relative", minHeight: height, width: "100%", maxWidth: width, margin: "0 auto" }}
    >
      {elements.map((element) => (
        <BackyElementView key={element.id} element={element} payload={payload} />
      ))}
    </main>
  );
}

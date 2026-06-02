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

const attrList = (values: unknown): string | undefined => {
  const list = Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];
  return list.length > 0 ? list.join(",") : undefined;
};

const keyList = (value: unknown): string | undefined => {
  const keys = Object.keys(asRecord(value)).sort();
  return keys.length > 0 ? keys.join(",") : undefined;
};

const countAttr = (values: unknown): number | undefined =>
  Array.isArray(values) && values.length > 0 ? values.length : undefined;

const typeAttr = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const responsiveBreakpointOrder = ["tablet", "mobile"] as const;

const responsiveBreakpointMedia: Record<(typeof responsiveBreakpointOrder)[number], string> = {
  tablet: "(max-width: 1024px)",
  mobile: "(max-width: 767px)",
};

const cssIdentifierValue = (value: unknown): string =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\A ");

const cssPropertyName = (value: string): string =>
  value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

const cssTextValue = (value: unknown): string | undefined => {
  const text = asText(value);
  if (!text || /[{};<>]/.test(text) || /[\r\n]/.test(text)) return undefined;
  return text;
};

const cssLengthValue = (value: unknown): string | undefined => {
  const numeric = asNumber(value);
  if (numeric !== undefined) return `${numeric}px`;
  return cssTextValue(value);
};

const cssRawValue = (value: unknown): string | undefined => {
  const numeric = asNumber(value);
  if (numeric !== undefined) return String(numeric);
  return cssTextValue(value);
};

const addCssDeclaration = (
  declarations: string[],
  property: string,
  value: unknown,
  options: { important?: boolean; length?: boolean } = {},
) => {
  const renderedValue = options.length ? cssLengthValue(value) : cssRawValue(value);
  if (!renderedValue) return;
  declarations.push(`${property}: ${renderedValue}${options.important === false ? "" : " !important"};`);
};

const responsiveOverrideRecord = (
  element: BackyElement,
  breakpoint: (typeof responsiveBreakpointOrder)[number],
): Record<string, unknown> => asRecord(asRecord(element.responsive)[breakpoint]);

const responsiveStyleDeclarations = (
  element: BackyElement,
  breakpoint: (typeof responsiveBreakpointOrder)[number],
): string[] => {
  const override = responsiveOverrideRecord(element, breakpoint);
  if (Object.keys(override).length === 0) return [];

  const style = asRecord(override.style);
  const styles = asRecord(override.styles);
  const props = asRecord(override.props);
  const declarations: string[] = [];

  addCssDeclaration(declarations, "left", override.x, { length: true });
  addCssDeclaration(declarations, "top", override.y, { length: true });
  addCssDeclaration(declarations, "width", override.width, { length: true });
  addCssDeclaration(declarations, "min-height", override.height, { length: true });
  addCssDeclaration(declarations, "z-index", override.zIndex);

  if (override.visible === false || override.hidden === true) {
    declarations.push("display: none !important;");
  } else if (override.visible === true || override.hidden === false) {
    declarations.push("display: block !important;");
  }

  const knownStyleValues: Record<string, unknown> = {
    color: styles.color ?? style.color ?? props.color,
    background: styles.background ?? style.background ?? styles.backgroundColor ?? style.backgroundColor ?? props.backgroundColor,
    borderRadius: styles.borderRadius ?? style.borderRadius ?? props.borderRadius,
    borderColor: styles.borderColor ?? style.borderColor ?? props.borderColor,
    borderStyle: styles.borderStyle ?? style.borderStyle ?? props.borderStyle,
    borderWidth: styles.borderWidth ?? style.borderWidth ?? props.borderWidth,
    fontFamily: styles.fontFamily ?? style.fontFamily ?? props.fontFamily,
    fontSize: styles.fontSize ?? style.fontSize ?? props.fontSize,
    fontWeight: styles.fontWeight ?? style.fontWeight ?? props.fontWeight,
    lineHeight: styles.lineHeight ?? style.lineHeight ?? props.lineHeight,
    opacity: styles.opacity ?? style.opacity ?? props.opacity,
    padding: styles.padding ?? style.padding ?? props.padding,
    margin: styles.margin ?? style.margin ?? props.margin,
    transform: styles.transform ?? style.transform ?? props.transform,
  };

  for (const [property, value] of Object.entries(knownStyleValues)) {
    addCssDeclaration(
      declarations,
      cssPropertyName(property),
      value,
      { length: ["borderRadius", "borderWidth", "fontSize", "padding", "margin"].includes(property) },
    );
  }

  return declarations;
};

const elementHasResponsiveVisibilityOverride = (element: BackyElement): boolean =>
  responsiveBreakpointOrder.some((breakpoint) => {
    const override = responsiveOverrideRecord(element, breakpoint);
    return override.visible === true || override.hidden === false;
  });

const collectResponsiveElements = (elements: BackyElement[], collected: BackyElement[] = []): BackyElement[] => {
  for (const element of elements) {
    if (Object.keys(asRecord(element.responsive)).length > 0) collected.push(element);
    collectResponsiveElements(elementChildren(element), collected);
  }
  return collected;
};

function buildBackyResponsiveCss(elements: BackyElement[]): string {
  const responsiveElements = collectResponsiveElements(elements);
  const rules: string[] = [];

  for (const breakpoint of responsiveBreakpointOrder) {
    const breakpointRules = responsiveElements
      .map((element) => {
        const declarations = responsiveStyleDeclarations(element, breakpoint);
        if (declarations.length === 0) return "";
        return `  [data-backy-element-id="${cssIdentifierValue(element.id)}"] {\n    ${declarations.join("\n    ")}\n  }`;
      })
      .filter(Boolean);
    if (breakpointRules.length > 0) {
      rules.push(`@media ${responsiveBreakpointMedia[breakpoint]} {\n${breakpointRules.join("\n")}\n}`);
    }
  }

  return rules.join("\n\n");
}

function editableEntryCount(payload: BackyRenderPayload, elementId: string): number | undefined {
  const editableMap = payload.editableMap;
  if (Array.isArray(editableMap)) {
    const count = editableMap.filter((entry) => asText(asRecord(entry).elementId) === elementId).length;
    return count > 0 ? count : undefined;
  }
  const editableRecord = asRecord(editableMap);
  const direct = editableRecord[elementId];
  if (Array.isArray(direct)) return direct.length > 0 ? direct.length : undefined;
  if (direct && typeof direct === "object") return 1;
  const entries = editableRecord.entries;
  if (Array.isArray(entries)) {
    const count = entries.filter((entry) => asText(asRecord(entry).elementId) === elementId).length;
    return count > 0 ? count : undefined;
  }
  return undefined;
}

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
    display: element.visible === false || element.hidden === true ? "none" : undefined,
    zIndex,
    color: asText(styles.color, style.color, props.color) || undefined,
    background: asText(styles.background, style.background, props.backgroundColor) || undefined,
    borderRadius: asText(styles.borderRadius, style.borderRadius, props.borderRadius) || undefined,
  };
}

function BackyElementFrame({
  element,
  payload,
  children,
}: {
  element: BackyElement;
  payload: BackyRenderPayload;
  children: ReactNode;
}) {
  if ((element.visible === false || element.hidden === true) && !elementHasResponsiveVisibilityOverride(element)) return null;
  const animation = asRecord(element.animation);
  const accessibility = asRecord(element.accessibility);
  return (
    <div
      data-backy-element-id={element.id}
      data-backy-element-type={element.type}
      data-backy-parent-id={element.parentId}
      data-backy-component-key={typeof element.componentKey === "string" ? element.componentKey : undefined}
      data-backy-component-contract-pointer={`agent-handoff.componentApiContract.componentTypeContracts.${element.type}`}
      data-backy-prop-keys={keyList(element.props)}
      data-backy-style-keys={keyList(element.styles || element.style)}
      data-backy-responsive-breakpoints={keyList(element.responsive)}
      data-backy-responsive-css="media-query"
      data-backy-responsive-style-pointer="render.generatedResponsiveCss"
      data-backy-token-ref-keys={keyList(element.tokenRefs)}
      data-backy-asset-ids={attrList(element.assetIds)}
      data-backy-action-count={countAttr(element.actions)}
      data-backy-binding-count={countAttr(element.dataBindings)}
      data-backy-binding-slot-count={countAttr(element.bindingSlots)}
      data-backy-animation-type={typeAttr(animation.type)}
      data-backy-accessibility-label={typeAttr(accessibility.label)}
      data-backy-editable-entry-count={editableEntryCount(payload, element.id)}
      data-backy-editable-map-pointer="render.data.editableMap"
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
      <BackyElementFrame element={element} payload={payload}>
        {src ? <img src={src} alt={asText(props.alt, props.title)} /> : null}
      </BackyElementFrame>
    );
  }

  if (element.type === "button" || element.type === "link") {
    const href = asText(props.href, props.url) || "#";
    return (
      <BackyElementFrame element={element} payload={payload}>
        <a href={href}>{text || "Read more"}</a>
      </BackyElementFrame>
    );
  }

  if (element.type === "navigation" || element.type === "nav") {
    return (
      <BackyElementFrame element={element} payload={payload}>
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
      <BackyElementFrame element={element} payload={payload}>
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
      <BackyElementFrame element={element} payload={payload}>
        {children.map((child) => (
          <BackyElementView key={child.id} element={child} payload={payload} />
        ))}
      </BackyElementFrame>
    );
  }

  if (element.type === "heading") {
    return (
      <BackyElementFrame element={element} payload={payload}>
        <h1>{text || "Untitled"}</h1>
      </BackyElementFrame>
    );
  }

  return (
    <BackyElementFrame element={element} payload={payload}>
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
  const responsiveCss = buildBackyResponsiveCss(elements);

  return (
    <main
      data-backy-site-id={payload.site.id}
      data-backy-route={payload.route.path}
      data-backy-component-contract-pointer="agent-handoff.componentApiContract.componentTypeContracts"
      data-backy-property-map-pointer="agent-handoff.componentApiContract.propertyMap"
      data-backy-editable-map-pointer="render.data.editableMap"
      data-backy-responsive-style-pointer="render.generatedResponsiveCss"
      style={{ position: "relative", minHeight: height, width: "100%", maxWidth: width, margin: "0 auto" }}
    >
      {responsiveCss ? (
        <style data-backy-responsive-css="media-query">{responsiveCss}</style>
      ) : null}
      {elements.map((element) => (
        <BackyElementView key={element.id} element={element} payload={payload} />
      ))}
    </main>
  );
}

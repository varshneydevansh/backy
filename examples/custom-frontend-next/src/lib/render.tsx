import type { CSSProperties, ReactNode } from "react";

import type {
  BackyElement,
  BackyFormFieldDefinition,
  BackyMediaAsset,
  BackyRenderPayload,
} from "./backy-client";

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
  const id = asText(props.mediaId, props.imageId, props.videoId, props.audioId, props.fileMediaId, props.assetId);
  const direct = asText(props.src, props.url, props.deliveryUrl);
  const asset = id ? assets.find((candidate) => candidate.id === id) : undefined;
  return direct || asset?.deliveryUrl || asset?.url || asset?.src || "";
}

const recordPathValue = (record: Record<string, unknown>, path: string): unknown => {
  const segments = path.split(".").filter(Boolean);
  let current: unknown = record;
  for (const segment of segments) {
    const next = asRecord(current);
    if (!(segment in next)) return undefined;
    current = next[segment];
  }
  return current;
};

const repeaterValue = (
  record: Record<string, unknown>,
  field: unknown,
  fallbacks: string[],
): unknown => {
  const values = { ...asRecord(record.values), ...record };
  const paths = [asText(field), ...fallbacks].filter(Boolean);
  for (const path of paths) {
    const value = recordPathValue(values, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

const formFields = (
  element: BackyElement,
  payload: BackyRenderPayload,
): BackyFormFieldDefinition[] => {
  const props = asRecord(element.props);
  if (Array.isArray(props.fields)) return props.fields.map(asRecord) as BackyFormFieldDefinition[];
  const formId = asText(props.formId, props.id);
  const definition = (payload.interactions.forms || []).find((form) => form.id === formId);
  return definition?.fields || [];
};

const formOption = (option: string | { label?: string; value?: string }) =>
  typeof option === "string"
    ? { label: option, value: option }
    : { label: option.label || option.value || "Option", value: option.value || option.label || "" };

function BackyFormField({ field }: { field: BackyFormFieldDefinition }) {
  const type = asText(field.type).toLowerCase() || "text";
  const label = asText(field.label) || field.key;
  const placeholder = asText(field.placeholder) || label;
  const options = (field.options || []).map(formOption);

  if (type === "textarea" || type === "long-text") {
    return (
      <label>
        <span>{label}</span>
        <textarea name={field.key} placeholder={placeholder} required={field.required} />
      </label>
    );
  }

  if (type === "select") {
    return (
      <label>
        <span>{label}</span>
        <select name={field.key} required={field.required} defaultValue="">
          <option value="" disabled>{placeholder}</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  }

  if (type === "checkbox") {
    return (
      <label>
        <input name={field.key} type="checkbox" value="true" required={field.required} />
        <span>{label}</span>
      </label>
    );
  }

  const inputType = ["email", "tel", "url", "number", "date", "time", "password"].includes(type)
    ? type
    : "text";
  return (
    <label>
      <span>{label}</span>
      <input name={field.key} type={inputType} placeholder={placeholder} required={field.required} />
    </label>
  );
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

  if (element.type === "video") {
    const src = mediaUrl(element, payload.assets.media);
    return (
      <BackyElementFrame element={element} payload={payload}>
        {src ? <video src={src} controls={props.controls !== false} /> : null}
      </BackyElementFrame>
    );
  }

  if (element.type === "audio") {
    const src = mediaUrl(element, payload.assets.media);
    return (
      <BackyElementFrame element={element} payload={payload}>
        {src ? (
          <figure data-backy-audio-player="">
            {asText(props.caption, props.title, props.mediaName) ? <figcaption>{asText(props.caption, props.title, props.mediaName)}</figcaption> : null}
            <audio src={src} controls={props.controls !== false} />
            {asText(props.transcript) ? <figcaption data-backy-audio-transcript-text="">{asText(props.transcript)}</figcaption> : null}
          </figure>
        ) : null}
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

  if (element.type === "repeater") {
    const records = Array.isArray(props.records) ? props.records.map(asRecord) : [];
    const columns = Math.max(1, Math.min(4, asNumber(props.columns) || 3));
    const emptyMessage = asText(props.emptyMessage) || "No published items yet.";
    return (
      <BackyElementFrame element={element} payload={payload}>
        <div
          data-backy-repeater={asText(props.datasetId, props.collectionId) || element.id}
          style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: asNumber(props.gap) || 20 }}
        >
          {records.length === 0 ? <p>{emptyMessage}</p> : records.map((record, index) => {
            const id = asText(record.id, record.slug) || String(index);
            const title = asText(repeaterValue(record, props.titleField, ["title", "name", "label", "slug"]));
            const description = asText(repeaterValue(record, props.descriptionField, ["excerpt", "summary", "description"]));
            const image = asText(repeaterValue(record, props.imageField, ["imageUrl", "image", "thumbnail", "coverImage"]));
            const href = asText(repeaterValue(record, props.linkField, ["path", "href", "url", "links.publicPath"]));
            const checkoutUrl = asText(repeaterValue(record, props.checkoutField, ["checkoutUrl", "checkout.url", "links.checkout"]));
            const price = repeaterValue(record, props.priceField, ["price"]);
            const currency = asText(repeaterValue(record, props.currencyField, ["currency"]));
            const orderIntakeUrl = price !== undefined && !checkoutUrl
              ? `/checkout?product=${encodeURIComponent(asText(record.slug, record.id) || id)}`
              : "";
            return (
              <article key={id} data-backy-repeater-record={id}>
                {image ? <img src={image} alt="" /> : null}
                {title ? <h2>{href ? <a href={href}>{title}</a> : title}</h2> : null}
                {description ? <p>{description}</p> : null}
                {price !== undefined ? <p>{currency ? `${currency} ` : ""}{String(price)}</p> : null}
                {checkoutUrl ? <a href={checkoutUrl} data-backy-checkout-mode="direct-checkout-url">Buy</a> : null}
                {orderIntakeUrl ? <a href={orderIntakeUrl} data-backy-checkout-mode="order-intake">Buy</a> : null}
              </article>
            );
          })}
        </div>
      </BackyElementFrame>
    );
  }

  if (element.type === "form") {
    const formId = asText(props.formId, props.id);
    const fields = formFields(element, payload);
    return (
      <BackyElementFrame element={element} payload={payload}>
        <form method="post" action="/api/backy-form" data-backy-form-id={formId}>
          <input type="hidden" name="formId" value={formId} />
          {(fields.length > 0 ? fields : [
            { key: "email", label: "Email", type: "email", required: true },
            { key: "message", label: "Message", type: "textarea" },
          ]).map((field) => <BackyFormField key={field.key} field={field} />)}
          <button type="submit">{asText(props.submitLabel) || "Submit"}</button>
        </form>
      </BackyElementFrame>
    );
  }

  if (element.type === "codeBlock") {
    return (
      <BackyElementFrame element={element} payload={payload}>
        <pre data-backy-code-language={asText(props.language) || "text"}><code>{asText(props.code, props.content, props.text)}</code></pre>
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

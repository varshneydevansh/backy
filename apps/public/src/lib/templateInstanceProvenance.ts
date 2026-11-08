import { createHash } from "node:crypto";
import {
  canvasContentPayloadToBackyContentDocument,
  canonicalProductTemplateDesign,
  serializeTemplateRevisionValue,
  type BackyTemplateInstanceProvenance,
  formTemplateDesignFields,
  collectionTemplateDesignFields,
} from "@backy-cms/core";
export const templateInstanceFingerprint = (value: unknown) =>
  createHash("sha256")
    .update(serializeTemplateRevisionValue(value))
    .digest("hex");
export function canonicalTemplateInstanceContent(
  content: unknown,
  type: "page" | "post" | "section" | "product" | "form" | "collection",
) {
  // A section is an editable subtree, not a page envelope. Preserve every JSON field.
  if (type === "product") return canonicalProductTemplateDesign({ design: content as Record<string, unknown> });
  if (type === "form" || type === "collection") {
    assertTemplateInstanceContentSafe(content);
    if (!content || typeof content !== 'object' || Array.isArray(content)) throw Error('TEMPLATE_INSTANCE_UNSAFE');
    return JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
  }
  if (type === "section") {
    assertTemplateInstanceContentSafe(content);
    if (!content || typeof content !== "object" || Array.isArray(content)) throw Error("TEMPLATE_INSTANCE_UNSAFE");
    return JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
  }
  return canvasContentPayloadToBackyContentDocument({
    rawContent: content,
    id: "template-instance",
    kind: type,
    title: "",
    slug: "",
    status: "draft",
  }) as unknown as Record<string, unknown>;
}
export function pinTemplateInstance(
  template: { id: string; version?: string | number; [key: string]: unknown },
  content: unknown,
  type: "page" | "post" | "section" | "product" | "form" | "collection",
  seedContext?: BackyTemplateInstanceProvenance["seedContext"],
): BackyTemplateInstanceProvenance {
  assertTemplateInstanceContentSafe(content);
  const baseContent = canonicalTemplateInstanceContent(content, type);
  assertTemplateInstanceContentSafe(baseContent);
  const pin: BackyTemplateInstanceProvenance = {
    schemaVersion: "backy.template-instance.v1",
    templateId: template.id,
    templateFingerprint: templateInstanceFingerprint(template),
    templateVersion: template.version ?? null,
    baseContentFingerprint: templateInstanceFingerprint(baseContent),
    baseContent,
    ...(["section", "product", "form", "collection"].includes(type) ? { instanceType: type as "section" | "product" | "form" | "collection" } : {}),
    ...(seedContext ? { seedContext } : {}),
  };
  // Section history stores the complete pin: admit exactly the same bound here.
  if (type === "section" || type === "product" || type === "form" || type === "collection") assertTemplateInstanceContentSafe(pin);
  return pin;
}
/** Baselines contain editable content only, never site settings or registry credential records. */
export function assertTemplateInstanceContentSafe(value: unknown) {
  const stack = [{ value, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++count > 60000 || item.depth > 64)
      throw Error("TEMPLATE_INSTANCE_LIMIT");
    if (!item.value || typeof item.value !== "object") continue;
    for (const [key, child] of Object.entries(item.value)) {
      if (
        ["__proto__", "constructor", "prototype"].includes(key) ||
        /^(?:password|accessToken|refreshToken|sessionToken|apiKey|serviceRoleKey|privateKey|clientSecret|databaseUrl|smtpPassword|authorization|cookie|credentials)$/i.test(
          key,
        )
      )
        throw Error("TEMPLATE_INSTANCE_UNSAFE");
      stack.push({ value: child, depth: item.depth + 1 });
    }
  }
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 2 * 1024 * 1024)
    throw Error("TEMPLATE_INSTANCE_LIMIT");
}

/** Only verified bounded section pins may cross the recoverable history boundary. */
export function isValidSectionTemplateInstancePin(value: unknown): value is BackyTemplateInstanceProvenance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const pin = value as BackyTemplateInstanceProvenance;
  if (pin.schemaVersion !== "backy.template-instance.v1" || pin.instanceType !== "section"
    || typeof pin.templateId !== "string" || !pin.templateId || pin.templateId.length > 128
    || typeof pin.templateFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(pin.templateFingerprint)
    || !pin.baseContent || typeof pin.baseContent !== "object" || Array.isArray(pin.baseContent)) return false;
  try {
    assertTemplateInstanceContentSafe(pin);
    return pin.baseContentFingerprint === templateInstanceFingerprint(pin.baseContent);
  } catch { return false; }
}

export function isValidProductTemplateInstancePin(value: unknown): value is BackyTemplateInstanceProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pin = value as BackyTemplateInstanceProvenance;
  if (pin.schemaVersion !== 'backy.template-instance.v1' || pin.instanceType !== 'product'
      || typeof pin.templateId !== 'string' || !pin.templateId || pin.templateId.length > 128
      || typeof pin.templateFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(pin.templateFingerprint)
      || !pin.baseContent || typeof pin.baseContent !== 'object' || Array.isArray(pin.baseContent)) return false;
  try { assertTemplateInstanceContentSafe(pin); return pin.baseContentFingerprint === templateInstanceFingerprint(pin.baseContent); } catch { return false; }
}

export function isValidFormTemplateInstancePin(value: unknown): value is BackyTemplateInstanceProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pin = value as BackyTemplateInstanceProvenance;
  if (pin.schemaVersion !== 'backy.template-instance.v1' || pin.instanceType !== 'form'
    || typeof pin.templateId !== 'string' || !pin.templateId || pin.templateId.length > 128
    || typeof pin.templateFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(pin.templateFingerprint)
    || !pin.baseContent || typeof pin.baseContent !== 'object' || Array.isArray(pin.baseContent)) return false;
  try {
    assertTemplateInstanceContentSafe(pin);
    formTemplateDesignFields(pin.baseContent as unknown as import('@backy-cms/core').BackyFormTemplateDesign);
    return pin.baseContentFingerprint === templateInstanceFingerprint(pin.baseContent);
  } catch { return false; }
}

export function isValidCollectionTemplateInstancePin(value: unknown): value is BackyTemplateInstanceProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pin = value as BackyTemplateInstanceProvenance;
  if (pin.schemaVersion !== 'backy.template-instance.v1' || pin.instanceType !== 'collection'
    || typeof pin.templateId !== 'string' || !pin.templateId || pin.templateId.length > 128
    || typeof pin.templateFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(pin.templateFingerprint)
    || !pin.baseContent || typeof pin.baseContent !== 'object' || Array.isArray(pin.baseContent)) return false;
  try {
    assertTemplateInstanceContentSafe(pin);
    collectionTemplateDesignFields(pin.baseContent as unknown as import('@backy-cms/core').BackyCollectionTemplateDesign);
    return pin.baseContentFingerprint === templateInstanceFingerprint(pin.baseContent);
  } catch { return false; }
}

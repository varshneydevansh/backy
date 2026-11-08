import {
  mergeBackyTemplateInstance,
  type BackyTemplateInstanceTarget,
  type BackyTemplateRevision,
  type Site,
} from "@backy-cms/core";
import {
  assertTemplateInstanceContentSafe,
  canonicalTemplateInstanceContent,
  pinTemplateInstance,
  templateInstanceFingerprint,
} from "./templateInstanceProvenance";
import { buildFrontendTemplateInstanceBaseline } from "./frontendDesignContract";

export type TemplateInstanceDocument = {
  type: "page" | "post" | "section";
  id: string;
  siteId: string;
  title: string;
  status: string;
  updatedAt: string;
  content: any;
  meta?: any;
  metadata?: any;
  [key: string]: any;
};
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export const templateInstanceMetadata = (document: TemplateInstanceDocument) => document.type === "section" ? document.metadata : document.meta;
export const templateInstanceIdentity = (document: TemplateInstanceDocument) =>
  templateInstanceMetadata(document)?.frontendTemplateInstance?.templateId ||
  templateInstanceMetadata(document)?.frontendDesignTemplateId ||
  document.content?.metadata?.frontendDesignTemplateId;
/** Display aliases must not become part of the actual resource CAS snapshot. */
export const templateInstanceDocumentFingerprint = (document: TemplateInstanceDocument) => {
  if (document.type !== "section") return templateInstanceFingerprint(document);
  const { title: _displayTitle, ...section } = document;
  return templateInstanceFingerprint(section);
};
export function planTemplateInstance(
  document: TemplateInstanceDocument,
  site: Site,
  revision: BackyTemplateRevision,
) {
  const metadata = templateInstanceMetadata(document);
  const provenance = metadata?.frontendTemplateInstance;
  const pinPath = document.type === "section" ? "/metadata/frontendTemplateInstance" : "/meta/frontendTemplateInstance";
  const summary: BackyTemplateInstanceTarget = {
    type: document.type,
    id: document.id,
    title: document.title,
    status: document.status,
    pinnedFingerprint:
      object(provenance) && typeof provenance.templateFingerprint === "string"
        ? provenance.templateFingerprint
        : null,
    contentFingerprint: templateInstanceDocumentFingerprint(document),
    changedPaths: [],
    conflicts: [],
    state: "blocked",
  };
  if (
    !object(provenance) ||
    provenance.schemaVersion !== "backy.template-instance.v1"
  ) {
    summary.conflicts = [
      { path: pinPath, code: "UNPINNED_INSTANCE" },
    ];
    return { summary };
  }
  if (
    (document.type === "section" && provenance.instanceType !== "section") ||
    provenance.templateId !== revision.templateId ||
    !object(provenance.baseContent) ||
    !/^[a-f0-9]{64}$/.test(provenance.templateFingerprint) ||
    provenance.baseContentFingerprint !==
      templateInstanceFingerprint(provenance.baseContent)
  ) {
    summary.conflicts = [
      { path: pinPath, code: "INVALID_PROVENANCE" },
    ];
    return { summary };
  }
  if (!site.settings.frontendDesign)
    throw Error("TEMPLATE_INSTANCE_UNAVAILABLE");
  assertTemplateInstanceContentSafe(provenance.baseContent);
  assertTemplateInstanceContentSafe(document.content);
  const context =
    object(provenance.seedContext) &&
    typeof provenance.seedContext.title === "string"
      ? provenance.seedContext
      : { title: document.title };
  const baseline = buildFrontendTemplateInstanceBaseline(
    site.settings.frontendDesign,
    revision.snapshot,
    document.type,
    context as { title: string },
  );
  const target = pinTemplateInstance(
    revision.snapshot,
    baseline,
    document.type,
    context as { title: string },
  );
  if (
    serializeSize(provenance.baseContent) > 2 * 1024 * 1024 ||
    serializeSize(document.content) > 2 * 1024 * 1024 ||
    serializeSize(target.baseContent) > 2 * 1024 * 1024
  )
    throw Error("TEMPLATE_INSTANCE_LIMIT");
  const merged = mergeBackyTemplateInstance(
    provenance.baseContent,
    canonicalTemplateInstanceContent(document.content, document.type),
    target.baseContent,
  );
  summary.conflicts = merged.conflicts;
  summary.changedPaths = merged.changedPaths;
  summary.state = merged.conflicts.length
    ? "blocked"
    : provenance.templateFingerprint === revision.fingerprint &&
        !merged.changedPaths.length
      ? "current"
      : "ready";
  return {
    summary,
    content: merged.content,
    meta: {
      ...metadata,
      frontendTemplateInstance: { ...provenance, ...target },
    },
  };
}
const serializeSize = (value: unknown) =>
  Buffer.byteLength(JSON.stringify(value), "utf8");

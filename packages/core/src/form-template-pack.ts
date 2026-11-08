import type { FormDefinition } from "./types";
export const FORM_TEMPLATE_PACK_SCHEMA = "backy.form-template-pack.v1" as const;
export const FORM_TEMPLATE_PACK_MAX_BYTES = 2097152;
export interface FormTemplatePack {
  schemaVersion: typeof FORM_TEMPLATE_PACK_SCHEMA;
  site?: Record<string, unknown>;
  builtInTemplates?: Record<string, unknown>[];
  frontendTemplates?: Array<{
    schemaVersion: string;
    template: Record<string, unknown>;
    form: Record<string, unknown>;
    settings?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}
export type FormTemplateReferenceKind =
  | "collections"
  | "pages"
  | "posts"
  | "media"
  | "components";
export interface FormTemplatePackImportRequest {
  action: "review" | "apply";
  pack: FormTemplatePack;
  selection: string[];
  names: Record<string, string>;
  references: Partial<
    Record<FormTemplateReferenceKind, Record<string, string>>
  >;
  acknowledgeUnverified: boolean;
  reviewVersion?: string;
}
export interface FormTemplatePackIssue {
  code: string;
  severity: "blocking" | "unverified";
  path: string;
  message: string;
  targetId?: string;
}
export interface FormTemplatePackTarget {
  id: string;
  title: string;
  name: string;
  source: "builtin" | "frontend";
  selected: boolean;
  form: Omit<FormDefinition, "id" | "createdAt" | "updatedAt">;
  fieldCount: number;
  hasCapturedLayout: boolean;
}
export interface FormTemplatePackReview {
  schemaVersion: "backy.form-template-pack-review.v1";
  siteId: string;
  reviewVersion: string;
  selection: string[];
  targets: FormTemplatePackTarget[];
  issues: FormTemplatePackIssue[];
  canApply: boolean;
  publication: "inactive-standalone";
  concurrencyBoundary:
    | "database-serializable-transaction"
    | "demo-single-process";
}
export interface FormTemplatePackApplied {
  schemaVersion: "backy.form-template-pack-applied.v1";
  siteId: string;
  reviewVersion: string;
  forms: Array<{ importId: string; form: FormDefinition; editUrl: string }>;
  publication: "inactive-standalone";
  completionWarnings: string[];
  concurrencyBoundary: FormTemplatePackReview["concurrencyBoundary"];
}

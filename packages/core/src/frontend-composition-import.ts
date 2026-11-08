import type { BackyJsonObject } from "./content-contract";
import type { SiteFrontendDesignContract } from "./types";

export const FRONTEND_COMPOSITION_IMPORT_SCHEMA =
  "backy.frontend-composition-import.v1" as const;
export const FRONTEND_COMPOSITION_IMPORT_MAX_BYTES = 2097152;
export interface FrontendCompositionRoute {
  id: string;
  type: "page" | "blogPost";
  path: string;
  title: string;
  content: BackyJsonObject;
  meta?: BackyJsonObject;
  templateId?: string;
  [key: string]: unknown;
}
export interface FrontendCompositionImport {
  schemaVersion: typeof FRONTEND_COMPOSITION_IMPORT_SCHEMA;
  siteId?: string;
  frontendDesign?: SiteFrontendDesignContract;
  routes: FrontendCompositionRoute[];
  [key: string]: unknown;
}
export interface FrontendCompositionIssue {
  code: string;
  severity: "blocking" | "unverified";
  path: string;
  message: string;
  targetId?: string;
}
export interface FrontendCompositionTarget {
  id: string;
  type: "page" | "blogPost" | "template" | "frontendDesign";
  title: string;
  path: string;
  selected: boolean;
  elementCount: number;
  content: BackyJsonObject;
  existingId?: string;
}
export interface FrontendCompositionReview {
  schemaVersion: "backy.frontend-composition-review.v1";
  siteId: string;
  reviewVersion: string;
  selection: string[];
  acknowledgeUnverified: boolean;
  targets: FrontendCompositionTarget[];
  issues: FrontendCompositionIssue[];
  canApply: boolean;
  boundary: string;
}
export interface FrontendCompositionImportRequest {
  action: "review" | "apply";
  composition: FrontendCompositionImport;
  selection: string[];
  acknowledgeUnverified: boolean;
  reviewVersion?: string;
}
export interface FrontendCompositionApplyResult {
  schemaVersion: "backy.frontend-composition-applied.v1";
  siteId: string;
  reviewVersion: string;
  drafts: Array<{
    importId: string;
    id: string;
    type: "page" | "blogPost";
    path: string;
    editUrl: string;
  }>;
  templateIds: string[];
  designSaved: boolean;
  publication: "draft-only";
}

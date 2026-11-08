import type { GeneratedBackyPublicRenderPayload, GeneratedBackyPublicRenderPayloadContentDocument } from './generated-contract-types';

export const BACKY_RUNTIME_RENDER_SCHEMA = 'backy.content-payload.runtime.v1';
export const BACKY_RUNTIME_CONTENT_SCHEMA = 'backy.content.runtime.v1';
export const BACKY_RUNTIME_EDITABLE_MAP_REF = '#/data/editableMap';

type EditableMap = GeneratedBackyPublicRenderPayload['editableMap'];
type RuntimeMap =
  | { editableMap: EditableMap; editableMapRef?: never }
  | { editableMap?: never; editableMapRef: typeof BACKY_RUNTIME_EDITABLE_MAP_REF };
/** Response-only; never pass a runtime document to content writes/imports. */
export type BackyRuntimeContentDocument = Pick<GeneratedBackyPublicRenderPayloadContentDocument, 'id' | 'kind' | 'title' | 'slug' | 'locale' | 'status' | 'version' | 'elements' | 'themeTokenRefs' | 'assets' | 'interactions' | 'seo' | 'dataBindings' | 'metadata'> & {
  schemaVersion: typeof BACKY_RUNTIME_CONTENT_SCHEMA;
} & RuntimeMap & Record<string, unknown>;
export type BackyRuntimeRenderContent = Omit<GeneratedBackyPublicRenderPayload['content'], 'schemaVersion' | 'editableMap' | 'contentDocument'> & {
  schemaVersion: typeof BACKY_RUNTIME_CONTENT_SCHEMA;
  contentDocument?: BackyRuntimeContentDocument;
} & (RuntimeMap | { editableMap?: never; editableMapRef?: never });
export type BackyRuntimeRenderPayload = Omit<GeneratedBackyPublicRenderPayload, 'content'> & {
  content: BackyRuntimeRenderContent;
};

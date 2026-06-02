#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const canvasSource = read('../src/components/editor/Canvas.tsx');
const canvasEditorSource = read('../src/components/editor/CanvasEditor.tsx');
const componentLibrarySource = read('../src/components/editor/ComponentLibrary.tsx');
const editorCatalogSource = read('../src/components/editor/editorCatalog.ts');
const mediaPickerActionsSource = read('../src/components/editor/editorMediaPickerActions.ts');
const propertyPanelSource = read('../src/components/editor/PropertyPanel.tsx');
const editorTypesSource = read('../src/types/editor.ts');
const apiTypesSource = read('../src/types/api.ts');
const editorDragSmokeSource = read('./editor-drag-smoke.mjs');
const packageJsonSource = read('../package.json');
const publicRendererSource = fs.readFileSync(new URL('../../public/src/components/PageRenderer.tsx', import.meta.url), 'utf8');
const starterRendererSource = fs.readFileSync(new URL('../../../examples/custom-frontend-next/src/lib/render.tsx', import.meta.url), 'utf8');
const handoffSource = fs.readFileSync(new URL('../../../packages/core/src/custom-frontend-agent-handoff.ts', import.meta.url), 'utf8');

const assertIncludes = (source, snippets, label) => {
  const missing = snippets.filter((snippet) => !source.includes(snippet));
  assert.deepEqual(missing, [], `${label} missing snippets: ${missing.join(', ')}`);
};

assertIncludes(canvasSource, [
  'onMediaFilesDrop',
  'onExternalMediaUrlDrop',
  'canvas-asset-drop-target',
  'data-media-drop-action',
  'data-parent-id={parentId ?? undefined}',
  'canvas-file-drop',
  'canvas-url-drop',
  'targetParentId?: string | null',
  "coordinateSpace?: 'canvas' | 'parent'",
  'canvasPoint?: { x: number; y: number }',
  'const getNestedDropPoint = useCallback',
  'const getEventNestedDropParentId = useCallback',
  'handleCanvasAssetDrop(event, forcedParentId)',
  'handleCanvasAssetDrop(event, nestedDropParentId || undefined)',
  'isDroppedUrlLike',
  'getPrimaryDroppedUrl',
  "^data:audio\\/",
  'type CanvasDropKind',
  "case 'audio'",
  'data-backy-audio-player',
  'data-backy-audio-transcript',
], 'Canvas');

assertIncludes(canvasEditorSource, [
  'getPublicMediaFileUrl',
  'uploadMedia',
  "const MAX_CANVAS_WIDTH = 3840",
  'const MAX_CANVAS_HEIGHT = 24000',
  "clampCanvasDimension(nextSize.height, 'height')",
  'CANVAS_MEDIA_DROP_GAP',
  'mediaElementTypeForAsset',
  'buildCanvasElementForMediaAsset',
  'buildCanvasElementForExternalMediaUrl',
  'backy.canvas-asset-drop.v1',
  'assetIds: [media.id]',
  "type === 'audio'",
  "mediaInsertedVia: 'canvas-url-drop'",
  'insertRootCanvasElements',
  'insertNestedCanvasElements',
  'const boundedNewElements = newElements.map((element) => clampElementWithinParent(element, parentElement));',
  'insertElementAsChild(nextElements, parentId, element)',
  'canvasRootPoint: metadata.canvasPoint || point',
  'coordinateSpace: metadata.coordinateSpace || \'canvas\'',
  'targetParentId: metadata.targetParentId || null',
  'handleCanvasMediaFilesDrop',
  'handleCanvasExternalMediaUrlDrop',
  'onMediaFilesDrop={handleCanvasMediaFilesDrop}',
  'onExternalMediaUrlDrop={handleCanvasExternalMediaUrlDrop}',
], 'CanvasEditor');

assertIncludes(componentLibrarySource, [
  'Volume2',
  "case 'Volume2'",
  "'audio'",
], 'ComponentLibrary');

assertIncludes(editorCatalogSource, [
  "type: 'audio'",
  "icon: 'Volume2'",
  "category: 'media'",
  "transcript: ''",
  'Audio player for podcasts, interviews, voice notes, and transcripts',
], 'editorCatalog');

assertIncludes(mediaPickerActionsSource, [
  "'audio'",
  "return 'audio'",
], 'editorMediaPickerActions');

assertIncludes(propertyPanelSource, [
  "setMediaAllowedTypes('audio')",
  "setMediaUploadFilter('audio')",
  "mediaField === 'audio'",
  'editor-audio-src',
  'editor-audio-select-media',
  'editor-audio-upload-media',
  'editor-audio-caption',
  'editor-audio-transcript',
  "'video',\n    'audio',\n    'icon'",
  "data-testid={`editor-audio-${setting.key}`}",
  "{ key: 'controls', label: 'Show controls', fallback: true }",
  "{ key: 'autoplay', label: 'Autoplay', fallback: false }",
  "{ key: 'loop', label: 'Loop', fallback: false }",
  "{ key: 'muted', label: 'Muted', fallback: false }",
], 'PropertyPanel');

assertIncludes(editorTypesSource, ["| 'audio'"], 'editor types');
assertIncludes(apiTypesSource, [
  "| 'audio'",
  'Image/Video/Audio/Embed URL',
  'Backy media asset id for image/video/audio/file references',
  'Media caption or audio episode title',
  'Audio transcript or accessible media notes',
  'Video/audio controls',
], 'API types');

assertIncludes(publicRendererSource, [
  "| 'audio'",
  'function AudioElement',
  'data-backy-audio-player',
  'data-backy-audio-media-id',
  'data-backy-audio-transcript',
  'audio: AudioElement',
], 'public PageRenderer');

assertIncludes(starterRendererSource, [
  'element.type === "audio"',
  'data-backy-audio-player',
  'data-backy-audio-transcript',
  'mediaUrl(element, payload.assets.media)',
], 'custom frontend starter renderer');

assertIncludes(handoffSource, [
  'audio: { width: 420, height: 104 }',
  "audio: { src: '', mediaId: '', caption: '', transcript: '', controls: true, autoplay: false, loop: false }",
  "componentTypeContract('audio', 'media', 'Audio'",
  'props.transcript',
  'supportsMediaAssets: true',
], 'custom frontend handoff');

assertIncludes(editorDragSmokeSource, [
  'BACKY_EDITOR_CANVAS_MEDIA_DROP_RENDERED_SMOKE',
  'testRenderedCanvasMediaDrop',
  'dispatchCanvasAudioFileDrop',
  'CANVAS_DROP_SMOKE_NESTED_URL',
  '[data-testid="editor-canvas"] [data-element-id="${options.targetElementId}"]',
  "target-not-nested-drop-capable",
  'targetElementId: \'smoke-box\'',
  'element.parentId === \'smoke-box\'',
  'nestedLink?.type === \'link\'',
  'nestedLinkInParentTree?.id === nestedLink.id',
  'nestedLink.parentId === \'smoke-box\'',
  'persistedNestedLink',
  'CANVAS_DROP_SMOKE_TRANSCRIPT',
  'waitForPersistedCanvasMediaDrop',
  'page?.content?.canvasSize?.height > 2100',
], 'editor rendered media-drop smoke');

assertIncludes(packageJsonSource, [
  'test:editor-canvas-media-drop-rendered',
  'BACKY_EDITOR_CANVAS_MEDIA_DROP_RENDERED_SMOKE=1 node scripts/editor-drag-smoke.mjs',
], 'admin package scripts');

console.log(JSON.stringify({
  ok: true,
  smoke: 'editor-canvas-media-drop-source',
  contracts: [
    'canvas-file-drop',
    'canvas-url-drop',
    'audio-element',
    'transcript-props',
    'public-renderer',
    'custom-frontend-starter',
    'component-api-contract',
    'long-page-height-clamp',
    'nested-media-drop-target',
    'rendered-nested-media-drop',
  ],
}));

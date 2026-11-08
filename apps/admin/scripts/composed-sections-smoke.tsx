import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import {
  CANVAS_COMPONENT_LIBRARY, createCanvasElementFromLibraryItem,
  normalizeSavedCanvasContent, serializeCanvasContent,
} from '../src/components/editor/editorCatalog';
import { ComponentLibrary, ComponentPreviewArtwork, isSectionLibraryItem, itemMatchesSearch } from '../src/components/editor/ComponentLibrary';
import * as publicRendererModule from '../../public/src/components/PageRenderer';
const PageRenderer = (publicRendererModule as any).PageRenderer || (publicRendererModule as any).default?.PageRenderer;
import type { CanvasElement, ComponentLibraryChild } from '../src/types/editor';

async function main() {
  const require = createRequire(import.meta.url);
  const previous = require.extensions['.css'];
  require.extensions['.css'] = () => {};
  const { CanvasElementComponent } = require('../src/components/editor/Canvas');
  const { ActiveEditorProvider } = require('../src/components/editor/ActiveEditorContext');
  const { PropertyPanel } = require('../src/components/editor/PropertyPanel');
  if (previous) require.extensions['.css'] = previous;
  else delete require.extensions['.css'];

  const headerItem = CANVAS_COMPONENT_LIBRARY.find((item) => item.id === 'site-header-section')!;
  const heroItem = CANVAS_COMPONENT_LIBRARY.find((item) => item.id === 'hero-section')!;
  const collapsibleItem = CANVAS_COMPONENT_LIBRARY.find((item) => item.type === 'collapsible')!;
  assert(headerItem && heroItem && collapsibleItem);
  assert(isSectionLibraryItem(headerItem));
  assert(itemMatchesSearch(headerItem, 'logo'));
  assert(itemMatchesSearch(headerItem, 'contact link'), 'Search must include named nested layers.');
  const library = renderToStaticMarkup(<ComponentLibrary />);
  assert(library.includes('editor-component-section-starter-add-site-header-section'));
  assert(library.includes('Composed sections'));
  for (const item of [headerItem, heroItem]) {
    const preview = renderToStaticMarkup(<ComponentPreviewArtwork item={item} />);
    assert(preview.includes('data-component-composition-preview'));
    const types = (children: ComponentLibraryChild[]): string[] => children.flatMap((child) => [child.type, ...types(child.children || [])]);
    assert.equal((preview.match(/data-preview-child-type=/g) || []).length, types(item.defaultChildren || []).length, 'Preview must retain every nested layer.');
  }
  const header = createCanvasElementFromLibraryItem(headerItem, 0, 0);
  const another = createCanvasElementFromLibraryItem(headerItem, 0, 0);
  assert.equal(header.props.componentPresetId, headerItem.id);
  const customPreset = createCanvasElementFromLibraryItem(headerItem, 0, 0, { props: { componentPresetId: 'registered-custom-header', customFrontendField: { keep: true } } });
  assert.equal(customPreset.props.componentPresetId, 'registered-custom-header');
  assert.deepEqual(customPreset.props.customFrontendField, { keep: true });
  assert.equal(createCanvasElementFromLibraryItem(heroItem, 0, 0).props.componentPresetId, heroItem.id);
  const ids = (node: CanvasElement): string[] => [node.id, ...(node.children || []).flatMap(ids)];
  assert.equal(new Set(ids(header)).size, ids(header).length);
  assert(!ids(header).some((id) => ids(another).includes(id)), 'Each insertion gets new IDs at every level.');
  const inspect = (nodes: CanvasElement[], templates: ComponentLibraryChild[], parentId: string) => nodes.forEach((node, index) => {
    assert.equal(node.parentId, parentId);
    assert.deepEqual(node.responsive, templates[index].responsive);
    assert.deepEqual(node.bindingSlots, templates[index].bindingSlots);
    inspect(node.children || [], templates[index].children || [], node.id);
  });
  inspect(header.children!, headerItem.defaultChildren!, header.id);
  for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
    const checkBounds = (node: CanvasElement) => {
      const parent = { ...node, ...(breakpoint === 'desktop' ? {} : node.responsive?.[breakpoint]) };
      const siblings = (node.children || []).map((child) => ({ ...child, ...(breakpoint === 'desktop' ? {} : child.responsive?.[breakpoint]) }));
      for (let i = 0; i < siblings.length; i++) for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i]; const b = siblings[j];
        assert(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${breakpoint} ${a.name}/${b.name} controls must not collide.`);
      }
      for (const child of node.children || []) {
        const geometry = { ...child, ...(breakpoint === 'desktop' ? {} : child.responsive?.[breakpoint]) };
        assert(geometry.x >= 0 && geometry.y >= 0 && geometry.x + geometry.width <= parent.width && geometry.y + geometry.height <= parent.height, `${breakpoint} ${child.name} must fit its parent.`);
        checkBounds(child);
      }
    };
    checkBounds(header);
  }
  const saved = serializeCanvasContent([header], { width: 1200, height: 800 });
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeSavedCanvasContent(saved).elements[0])), JSON.parse(JSON.stringify(header)), 'Save/reopen preserves nested composition and binding metadata.');
  const publicHeader = renderToStaticMarkup(<PageRenderer content={{ elements: [header], canvasSize: { width: 1200, height: 800 } } as any} />);
  for (const output of ['<img', 'Site logo', 'placeholder-image.jpg', '>Your site</a>', '<nav', '>Home</a>', '>About</a>', '>Contact</a>', '>Get in touch</a>', 'data-backy-navigation-binding="site.navigation.primary"']) assert(publicHeader.includes(output), `Public header missing ${output}`);
  assert.equal((publicHeader.match(/>Home<\/a>/g) || []).length, 1, 'Child navigation and fallback navItems must not duplicate links.');
  const empty = () => {};
  const adminElement = (element: CanvasElement, editingId: string | null = null, isPreview = false) => renderToStaticMarkup(<ActiveEditorProvider><CanvasElementComponent
    element={element} parentId={null} isSelected selectedId={editingId || element.id} selectedIds={[]} draggingId={null}
    isPreview={isPreview} isEditing={editingId === element.id} editingId={editingId}
    onDragStart={empty} onResizeStart={empty} onClick={empty} onSelectElement={empty}
    onUpdate={empty} onUpdateElement={empty} onDoubleClick={empty} /></ActiveEditorProvider>);
  const adminHeader = adminElement(header);
  for (const output of ['Site logo', '<nav', '>Home</a>', '>About</a>', '>Contact</a>', '>Get in touch</button>']) assert(adminHeader.includes(output), `Admin header missing ${output}`);
  const hero = createCanvasElementFromLibraryItem(heroItem, 0, 160);
  const nestedCaption = hero.children!.find((node) => node.type === 'box')!.children!.find((node) => node.type === 'text')!;
  const editableHero = adminElement(hero, nestedCaption.id);
  assert(editableHero.includes(`data-element-id="${nestedCaption.id}"`));
  assert.equal((editableHero.match(/data-backy-text-editor-editable="true"/g) || []).length, 2, 'Only the selected nested text layer and its editor host become editable.');
  assert(editableHero.includes('contenteditable="true"'));

  const collapsible = createCanvasElementFromLibraryItem(collapsibleItem, 20, 160, { props: { title: '<script>safe title</script>', content: [{ type: 'p', children: [{ text: 'Body emphasis', bold: true }] }] } });
  const publicCollapsed = renderToStaticMarkup(<PageRenderer content={{ elements: [collapsible], canvasSize: { width: 1200, height: 800 } } as any} />);
  assert(publicCollapsed.includes('<details') && publicCollapsed.includes('<strong>Body emphasis</strong>'));
  assert(publicCollapsed.includes('&lt;script&gt;safe title&lt;/script&gt;') && !publicCollapsed.includes('<script>'));
  assert(!/<details[^>]*\sopen[\s=>]/.test(publicCollapsed));
  assert(!/<details[^>]*\sopen[\s=>]/.test(adminElement(collapsible, null, true)), 'Canvas preview honors defaultOpen=false.');
  const editBody = adminElement(collapsible, collapsible.id);
  assert(/<details[^>]*\sopen[\s=>]/.test(editBody) && editBody.includes('contenteditable="true"'));
  const inspector = renderToStaticMarkup(<ActiveEditorProvider><PropertyPanel element={collapsible} onChange={empty} onEditText={empty} embedded /></ActiveEditorProvider>);
  for (const control of ['editor-collapsible-title', 'editor-collapsible-default-open', 'editor-collapsible-edit-body']) assert(inspector.includes(control), `Inspector missing ${control}: ${inspector.slice(0, 240)}`);
  const opened = { ...collapsible, props: { ...collapsible.props, defaultOpen: true } };
  assert(/<details[^>]*\sopen[\s=>]/.test(adminElement(opened, null, true)));
  const reopened = normalizeSavedCanvasContent(serializeCanvasContent([collapsible], { width: 1200, height: 800 }));
  assert.deepEqual(reopened.elements[0].props, collapsible.props);
  console.log('Composed sections: discovery/nested preview, fresh IDs/parent IDs, breakpoint bounds/binding serialization, admin/public header, nested rich edit mode and collapsible renderer/inspector passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

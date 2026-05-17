#!/usr/bin/env node

import {
  buildBackyElementIndex,
  canvasElementsToBackyContentDocument,
  normalizeBackyContentElements,
  validateBackyContentDocument,
} from '../dist/index.mjs';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const legacyCanvasPayload = {
  elements: [
    {
      id: 'hero',
      type: 'section',
      name: 'Hero',
      x: '0',
      y: 0,
      width: 1200,
      height: 520,
      zIndex: 1,
      props: {
        backgroundColor: '#f8fafc',
      },
      styles: {
        display: 'grid',
        gridTemplateColumns: '1fr 420px',
      },
      animation: {
        type: 'fadeIn',
        duration: 0.4,
      },
      children: [
        {
          id: 'hero_title',
          type: 'heading',
          x: 80,
          y: 96,
          width: 620,
          height: 96,
          zIndex: 2,
          props: {
            content: 'Reusable canvas content',
            level: 'h1',
          },
          dataBindings: [
            {
              collectionId: 'collection_pages',
              field: 'headline',
              targetPath: 'props.content',
            },
          ],
          actions: [
            {
              href: '/about',
              label: 'About',
            },
          ],
        },
        {
          id: 'hero_image',
          type: 'image',
          x: 720,
          y: 64,
          width: 380,
          height: 320,
          zIndex: 2,
          props: {
            mediaId: 'media_hero',
            src: '/uploads/sites/site_demo/hero.jpg',
            alt: 'Hero image',
          },
        },
      ],
    },
    {
      id: 'hero_title',
      type: 'text',
      x: 80,
      y: 230,
      width: 560,
      height: 80,
      zIndex: 3,
      props: {
        content: 'A duplicate legacy id gets a deterministic suffix.',
      },
    },
    {
      id: 'figure_rounds',
      type: 'interactiveFigure',
      componentKey: 'aiowls.self-correction-rounds',
      version: '1.0.0',
      props: {
        title: 'Self-correction at work',
      },
      controls: [
        {
          key: 'rounds',
          label: 'Rounds',
          type: 'range',
          value: 4,
          min: 1,
          max: 8,
          step: 1,
        },
      ],
      dataBindings: [
        {
          id: 'binding_rounds',
          targetPath: 'props.roundData',
          source: {
            kind: 'collection',
            collectionId: 'communication_rounds',
            field: 'metrics',
          },
          mode: 'json',
        },
      ],
      fallback: {
        title: 'Self-correction at work',
        text: 'Static summary shown when the interactive figure cannot hydrate.',
      },
      renderCapabilities: {
        hydrationMode: 'trusted-component',
        fallbackRequired: true,
        postMessageProtocol: 'backy.interactive-component.v1',
      },
      accessibility: {
        label: 'Self-correction across communication rounds',
      },
      propsIgnored: {
        shouldRemainInLegacyMetadata: true,
      },
    },
    {
      id: 'ignored_blank',
      props: {
        content: 'Missing type should not enter the canonical document.',
      },
    },
  ],
  canvasSize: {
    width: 1200,
    height: 900,
  },
  customCSS: '.hero { min-height: 520px; }',
};

const elements = normalizeBackyContentElements(legacyCanvasPayload);
assert(elements.length === 3, 'Expected invalid legacy element to be skipped');
assert(elements[0].children.length === 2, 'Expected nested children to be preserved');
assert(elements[0].children[1].assetIds?.includes('media_hero'), 'Expected mediaId to become an asset reference');
assert(elements[0].children[0].dataBindings?.[0]?.source.collectionId === 'collection_pages', 'Expected collection binding migration');
assert(elements[0].metadata?.animation?.type === 'fadeIn', 'Expected legacy animation to be preserved in metadata');
assert(elements[1].id === 'hero_title_2', 'Expected duplicate ids to be suffixed');
assert(elements[2].type === 'interactiveFigure', 'Expected interactive figure to be preserved');
assert(elements[2].componentKey === 'aiowls.self-correction-rounds', 'Expected interactive component key to be preserved');
assert(elements[2].version === '1.0.0', 'Expected interactive component version to be preserved');
assert(elements[2].controls?.[0]?.key === 'rounds', 'Expected interactive controls to be preserved');
assert(elements[2].fallback?.text?.includes('Static summary'), 'Expected interactive fallback to be preserved');
assert(elements[2].renderCapabilities?.hydrationMode === 'trusted-component', 'Expected interactive render capability metadata');
assert(elements[2].dataBindings?.[0]?.source.collectionId === 'communication_rounds', 'Expected interactive data binding to be preserved');

const document = canvasElementsToBackyContentDocument({
  id: 'page_legacy_canvas',
  kind: 'page',
  title: 'Legacy Canvas',
  slug: 'legacy-canvas',
  status: 'draft',
  elements: legacyCanvasPayload,
  canvasSize: legacyCanvasPayload.canvasSize,
  customCSS: legacyCanvasPayload.customCSS,
  editableMap: {
    'hero.title': {
      elementId: 'hero_title',
      field: 'props.content',
      editable: true,
      valueType: 'string',
      scope: 'element',
    },
  },
});

const validation = validateBackyContentDocument(document);
assert(validation.valid, `Expected migrated document to validate: ${JSON.stringify(validation.issues)}`);
assert(document.metadata?.canvasSize?.width === 1200, 'Expected canvas size metadata');
assert(document.metadata?.customCSS === legacyCanvasPayload.customCSS, 'Expected custom CSS metadata');

const index = buildBackyElementIndex(document.elements);
assert(index.order.join(',') === 'hero,hero_title,hero_image,hero_title_2,figure_rounds', `Unexpected migrated order ${index.order.join(',')}`);
assert(index.byId.hero_image?.accessibility?.alt === 'Hero image', 'Expected alt text to become accessibility metadata');
assert(index.byId.figure_rounds?.fallback?.title === 'Self-correction at work', 'Expected indexed interactive fallback metadata');

console.log('Backy content migrations smoke passed');

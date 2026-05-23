#!/usr/bin/env node

import {
  buildBackyElementIndex,
  canvasContentPayloadToBackyContentDocument,
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
      visible: 'false',
      locked: 'yes',
      props: {
        backgroundColor: '#f8fafc',
        editorGroup: true,
      },
      styles: {
        display: 'grid',
        gridTemplateColumns: '1fr 420px',
      },
      animation: {
        type: 'slideIn',
        duration: 0.4,
        delay: 0.1,
        easing: 'power2.out',
        direction: 'up',
        trigger: 'scroll',
        scrollTrigger: {
          start: 'top 85%',
          end: 'bottom 30%',
          scrub: true,
        },
        from: {
          opacity: 0,
          y: 48,
        },
        to: {
          opacity: 1,
          y: 0,
        },
        tokenRefs: {
          duration: 'motion.duration.normal',
          easing: 'motion.easing.standard',
        },
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
            mediaIds: ['media_gallery_one', 'media_gallery_two'],
            src: '/uploads/sites/site_demo/hero.jpg',
            alt: 'Hero image',
          },
          responsive: {
            mobile: {
              visible: 'off',
              locked: '1',
              props: {
                mediaIds: ['media_mobile_hero'],
                fontMediaIds: ['font_mobile_caption'],
              },
              styles: {
                backgroundMediaIds: ['media_mobile_background'],
                posterMediaIds: ['media_mobile_poster'],
              },
            },
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
      fontMediaId: 'font_heading',
      href: '/contact',
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
  customJS: 'window.__backyHeroReady = true;',
  themeTokenRefs: {
    primary: 'colors.primary',
  },
  assets: {
    media: [
      {
        id: 'media_hero',
        type: 'image',
        url: '/uploads/sites/site_demo/hero.jpg',
      },
    ],
  },
  interactions: {
    actions: {
      schemaVersion: 'backy.actions.v1',
      actions: [],
    },
  },
  seo: {
    title: 'Legacy Canvas',
    description: 'A canonical page-builder payload',
  },
  dataBindings: {
    datasets: [
      {
        id: 'dataset_pages',
        collectionId: 'collection_pages',
      },
    ],
    bindings: [],
  },
  metadata: {
    editorState: {
      selectedBreakpoint: 'desktop',
      animationTimeline: 'hero-intro',
    },
  },
};

const elements = normalizeBackyContentElements(legacyCanvasPayload);
assert(elements.length === 3, 'Expected invalid legacy element to be skipped');
assert(elements[0].children.length === 2, 'Expected nested children to be preserved');
assert(elements[0].visible === false, 'Expected boolean-like visible string to normalize to false');
assert(elements[0].locked === true, 'Expected boolean-like locked string to normalize to true');
assert(elements[0].children[0].parentId === 'hero', 'Expected nested child parentId to be stored as a first-class element field');
assert(elements[0].children[0].metadata?.parentId === 'hero', 'Expected nested child parentId to remain available in metadata for older clients');
assert(elements[0].children[1].assetIds?.includes('media_hero'), 'Expected mediaId to become an asset reference');
assert(elements[0].children[1].assetIds?.includes('media_gallery_one'), 'Expected plural mediaIds to become asset references');
assert(elements[0].children[1].assetIds?.includes('media_mobile_hero'), 'Expected responsive plural mediaIds to become asset references');
assert(elements[0].children[1].assetIds?.includes('font_mobile_caption'), 'Expected responsive plural fontMediaIds to become asset references');
assert(elements[0].children[1].assetIds?.includes('media_mobile_background'), 'Expected responsive plural backgroundMediaIds to become asset references');
assert(elements[0].children[1].assetIds?.includes('media_mobile_poster'), 'Expected responsive plural posterMediaIds to become asset references');
assert(elements[0].children[1].responsive?.mobile?.visible === false, 'Expected boolean-like responsive visible override to normalize to false');
assert(elements[0].children[1].responsive?.mobile?.locked === true, 'Expected boolean-like responsive locked override to normalize to true');
assert(elements[0].children[0].dataBindings?.[0]?.source.collectionId === 'collection_pages', 'Expected collection binding migration');
assert(elements[0].animation?.type === 'slideIn', 'Expected legacy animation to become canonical element animation');
assert(elements[0].animation?.scrollTrigger?.scrub === true, 'Expected scroll animation metadata to be preserved');
assert(elements[0].animation?.from?.y === 48, 'Expected custom animation from-state to be preserved');
assert(elements[0].animation?.tokenRefs?.duration === 'motion.duration.normal', 'Expected animation motion token refs to be preserved');
assert(elements[0].metadata?.animation?.type === 'slideIn', 'Expected legacy animation to remain available in metadata for old clients');
assert(elements[1].id === 'hero_title_2', 'Expected duplicate ids to be suffixed');
assert(elements[1].assetIds?.includes('font_heading'), 'Expected fontMediaId to become an asset reference');
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
assert(document.metadata?.editorComposition?.schemaVersion === 'backy.editor-composition-summary.v1', 'Expected editor composition summary metadata');
assert(document.metadata?.editorComposition?.metrics?.totalLayers === 5, `Expected editor composition total layer count, received ${JSON.stringify(document.metadata?.editorComposition)}`);
assert(document.metadata?.editorComposition?.metrics?.groupLayers === 1, 'Expected editor group layer count');
assert(document.metadata?.editorComposition?.metrics?.nestedLayers === 2, 'Expected nested layer count');
assert(document.metadata?.editorComposition?.metrics?.animatedLayers === 1, 'Expected animated layer count');
assert(document.metadata?.editorComposition?.metrics?.actionLayers === 2, 'Expected action layer count');
assert(document.metadata?.editorComposition?.metrics?.dataBoundLayers === 2, 'Expected data-bound layer count');
assert(document.metadata?.editorComposition?.metrics?.tokenRefLayers === 1, 'Expected token-ref layer count');
assert(document.metadata?.editorComposition?.metrics?.assetBoundLayers === 3, 'Expected asset-bound layer count');
assert(document.metadata?.editorComposition?.metrics?.interactiveLayers === 1, 'Expected interactive layer count');
assert(document.metadata?.editorComposition?.metrics?.hiddenLayers === 1, 'Expected boolean-like hidden layer count');
assert(document.metadata?.editorComposition?.metrics?.lockedLayers === 1, 'Expected boolean-like locked layer count');
assert(document.metadata?.editorComposition?.groupIds?.includes('hero'), 'Expected editor group ids to include hero');
assert(document.metadata?.editorComposition?.animatedElementIds?.includes('hero'), 'Expected animated element ids to include hero');
assert(document.metadata?.editorComposition?.actionElementIds?.includes('hero_title'), 'Expected action element ids to include hero title');
assert(document.metadata?.editorComposition?.actionElementIds?.includes('hero_title_2'), 'Expected action element ids to include prop-wired link layer');
assert(document.metadata?.editorComposition?.dataBoundElementIds?.includes('figure_rounds'), 'Expected data-bound element ids to include interactive figure');
assert(document.metadata?.editorComposition?.tokenRefElementIds?.includes('hero'), 'Expected token-ref element ids to include hero');
assert(document.metadata?.editorComposition?.assetBoundElementIds?.includes('hero_image'), 'Expected asset-bound element ids to include hero image');
assert(document.metadata?.editorComposition?.interactiveElementIds?.includes('figure_rounds'), 'Expected interactive element ids to include figure');
assert(document.metadata?.editorComposition?.hasAnimations === true, 'Expected editor composition to report animation design state');
assert(document.metadata?.editorComposition?.hasDataBindings === true, 'Expected editor composition to report data-bound design state');
assert(document.metadata?.editorComposition?.hasAssetRefs === true, 'Expected editor composition to report asset-bound design state');
assert(document.metadata?.editorComposition?.hasInteractiveComponents === true, 'Expected editor composition to report interactive design state');
assert(document.metadata?.editorComposition?.invariants?.editorGroupMarker === 'props.editorGroup', 'Expected editor group marker invariant');
assert(document.metadata?.editorComposition?.shortcuts?.group === 'Cmd/Ctrl+G', 'Expected group shortcut metadata');

const payloadDocument = canvasContentPayloadToBackyContentDocument({
  id: 'page_canvas_payload',
  kind: 'page',
  title: 'Canvas Payload',
  slug: 'canvas-payload',
  status: 'draft',
  rawContent: legacyCanvasPayload,
});
assert(payloadDocument.metadata?.customJS === legacyCanvasPayload.customJS, 'Expected custom JS metadata from canvas payload');
assert(payloadDocument.themeTokenRefs?.primary === 'colors.primary', 'Expected theme token refs from canvas payload');
assert(payloadDocument.assets?.media?.[0]?.id === 'media_hero', 'Expected media assets from canvas payload');
assert(payloadDocument.interactions?.actions?.schemaVersion === 'backy.actions.v1', 'Expected interactions from canvas payload');
assert(payloadDocument.seo?.title === 'Legacy Canvas', 'Expected SEO metadata from canvas payload');
assert(payloadDocument.dataBindings?.datasets?.[0]?.collectionId === 'collection_pages', 'Expected document data bindings from canvas payload');
assert(payloadDocument.metadata?.editorState?.animationTimeline === 'hero-intro', 'Expected editor animation timeline metadata from canvas payload');
assert(payloadDocument.metadata?.editorComposition?.metrics?.groupLayers === 1, 'Expected editor composition metadata from canvas payload');

const richFallbackDocument = canvasElementsToBackyContentDocument({
  id: 'page_rich_fallback',
  kind: 'page',
  title: 'Rich fallback',
  slug: 'rich-fallback',
  status: 'draft',
  elements: legacyCanvasPayload,
  canvasSize: legacyCanvasPayload.canvasSize,
  customCSS: legacyCanvasPayload.customCSS,
  customJS: legacyCanvasPayload.customJS,
  themeTokenRefs: legacyCanvasPayload.themeTokenRefs,
  assets: legacyCanvasPayload.assets,
  interactions: legacyCanvasPayload.interactions,
  seo: legacyCanvasPayload.seo,
  dataBindings: legacyCanvasPayload.dataBindings,
  editableMap: {
    'hero.title': {
      elementId: 'hero_title',
      field: 'props.content',
      editable: true,
      valueType: 'string',
      scope: 'element',
    },
  },
  metadata: legacyCanvasPayload.metadata,
});
const minimalEditorSaveDocument = canvasElementsToBackyContentDocument({
  id: 'page_rich_fallback',
  kind: 'page',
  title: 'Edited rich fallback',
  slug: 'rich-fallback',
  status: 'draft',
  elements: [
    {
      id: 'hero',
      type: 'section',
      props: {},
      children: [],
    },
  ],
  canvasSize: {
    width: 1440,
    height: 960,
  },
});
const preservedDesignDocument = canvasContentPayloadToBackyContentDocument({
  id: 'page_rich_fallback',
  kind: 'page',
  title: 'Edited rich fallback',
  slug: 'rich-fallback',
  status: 'draft',
  rawContent: {
    elements: minimalEditorSaveDocument.elements,
    canvasSize: {
      width: 1440,
      height: 960,
    },
    contentDocument: minimalEditorSaveDocument,
  },
  fallbackDocument: richFallbackDocument,
});
assert(preservedDesignDocument.metadata?.customCSS === legacyCanvasPayload.customCSS, 'Expected fallback custom CSS to survive minimal editor save payload');
assert(preservedDesignDocument.metadata?.customJS === legacyCanvasPayload.customJS, 'Expected fallback custom JS to survive minimal editor save payload');
assert(preservedDesignDocument.themeTokenRefs?.primary === 'colors.primary', 'Expected fallback theme token refs to survive minimal editor save payload');
assert(preservedDesignDocument.assets?.media?.[0]?.id === 'media_hero', 'Expected fallback asset manifest to survive minimal editor save payload');
assert(preservedDesignDocument.interactions?.actions?.schemaVersion === 'backy.actions.v1', 'Expected fallback interaction manifest to survive minimal editor save payload');
assert(preservedDesignDocument.seo?.title === 'Legacy Canvas', 'Expected fallback SEO manifest to survive minimal editor save payload');
assert(preservedDesignDocument.dataBindings?.datasets?.[0]?.collectionId === 'collection_pages', 'Expected fallback data bindings to survive minimal editor save payload');
assert(preservedDesignDocument.editableMap?.['hero.title']?.field === 'props.content', 'Expected fallback editable map to survive minimal editor save payload');
assert(preservedDesignDocument.metadata?.editorState?.animationTimeline === 'hero-intro', 'Expected fallback editor metadata to survive minimal editor save payload');
assert(preservedDesignDocument.metadata?.canvasSize?.width === 1440, 'Expected current editor save canvas size to override fallback metadata');
assert(preservedDesignDocument.metadata?.editorComposition?.metrics?.totalLayers === 1, 'Expected current editor save composition summary to override fallback composition metadata');
assert(preservedDesignDocument.metadata?.editorComposition?.metrics?.groupLayers === 0, 'Expected current editor save group count to override fallback composition metadata');

const index = buildBackyElementIndex(document.elements);
assert(index.order.join(',') === 'hero,hero_title,hero_image,hero_title_2,figure_rounds', `Unexpected migrated order ${index.order.join(',')}`);
assert(index.byId.hero_image?.accessibility?.alt === 'Hero image', 'Expected alt text to become accessibility metadata');
assert(index.byId.figure_rounds?.fallback?.title === 'Self-correction at work', 'Expected indexed interactive fallback metadata');

console.log('Backy content migrations smoke passed');

#!/usr/bin/env node

import {
  BACKY_CONTENT_SCHEMA_VERSION,
  buildBackyElementIndex,
  createBackyContentDocument,
  findBackyElementById,
  isBackyContentDocument,
  validateBackyContentDocument,
} from '../dist/index.mjs';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const pageDocument = createBackyContentDocument({
  id: 'page_contract_smoke',
  kind: 'page',
  title: 'Contract smoke page',
  status: 'draft',
  elements: [
    {
      id: 'hero',
      type: 'section',
      x: 0,
      y: 0,
      width: 1200,
      height: 520,
      zIndex: 1,
      children: [
        {
          id: 'hero_title',
          type: 'heading',
          x: 80,
          y: 96,
          width: 640,
          height: 96,
          zIndex: 1,
          children: [],
          props: {
            content: 'Every visible thing is addressable',
          },
          styles: {
            fontFamily: '{typography.families.heading}',
          },
          responsive: {
            mobile: {
              x: 24,
              y: 56,
              width: 342,
              height: 120,
            },
          },
          animation: {
            type: 'fadeIn',
            duration: 0.2,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            trigger: 'load',
            tokenRefs: {
              duration: 'motion.duration.normal',
              easing: 'motion.easing.standard',
            },
          },
          dataBindings: [
            {
              id: 'bind_hero_title',
              elementId: 'hero_title',
              targetPath: 'props.content',
              source: {
                kind: 'collection',
                collectionId: 'collection_pages',
                field: 'headline',
              },
              mode: 'text',
            },
          ],
          actions: [
            {
              id: 'action_hero_title_route',
              type: 'route',
              target: '/about',
            },
          ],
          accessibility: {
            role: 'heading',
            label: 'Hero headline',
          },
          assetIds: [],
          permissions: {
            editContent: true,
            editStyle: true,
          },
        },
      ],
      props: {},
      styles: {},
      permissions: {
        editLayout: true,
      },
    },
  ],
  assets: {
    media: [
      {
        id: 'media_hero',
        type: 'image',
        url: '/uploads/sites/site_demo/hero.jpg',
        alt: 'Hero',
        visibility: 'public',
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
    title: 'Contract smoke page',
    robots: {
      index: true,
      follow: true,
    },
  },
  editableMap: {
    'headline.hero': {
      elementId: 'hero_title',
      field: 'props.content',
      editable: true,
      valueType: 'string',
      scope: 'element',
    },
  },
});

const postDocument = createBackyContentDocument({
  id: 'post_contract_smoke',
  kind: 'post',
  title: 'Contract smoke post',
  elements: [
    {
      id: 'post_body',
      type: 'text',
      children: [],
      props: {
        content: 'Post content shares the same element contract.',
      },
    },
  ],
});

assert(pageDocument.schemaVersion === BACKY_CONTENT_SCHEMA_VERSION, 'createBackyContentDocument should set schemaVersion');
assert(validateBackyContentDocument(pageDocument).valid, 'Expected page document to validate');
assert(validateBackyContentDocument(postDocument).valid, 'Expected post document to validate');
assert(isBackyContentDocument(pageDocument), 'Expected page document type guard to pass');

const index = buildBackyElementIndex(pageDocument.elements);
assert(index.order.join(',') === 'hero,hero_title', `Unexpected element order ${index.order.join(',')}`);
assert(index.byId.hero_title?.type === 'heading', 'Expected flat lookup by id');
assert(index.byId.hero_title?.parentId === 'hero', 'Expected canonical children to expose parentId for editor grouping round-trips');
assert(index.byId.hero_title?.animation?.tokenRefs?.easing === 'motion.easing.standard', 'Expected canonical animation token refs');
assert(findBackyElementById(pageDocument.elements, 'hero_title')?.id === 'hero_title', 'Expected findBackyElementById lookup');

const invalidDocument = {
  ...pageDocument,
  elements: [
    pageDocument.elements[0],
    pageDocument.elements[0],
  ],
};

const invalidResult = validateBackyContentDocument(invalidDocument);
assert(!invalidResult.valid, 'Expected duplicate element ids to fail validation');
assert(invalidResult.issues.some((issue) => issue.message.includes('Duplicate element id')), 'Expected duplicate id issue');

console.log('Backy content contract smoke passed');

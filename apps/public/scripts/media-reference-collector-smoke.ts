import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BackyMediaRepository, MediaItem } from '@backy-cms/core';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const tempRoot = mkdtempSync(join(tmpdir(), 'backy-media-reference-'));
const originalCwd = process.cwd();

async function main(): Promise<void> {
  process.chdir(tempRoot);
  const store = await import(new URL('../src/lib/backyStore.ts', import.meta.url).href);
  const repositoryMediaReferenceSync = await import(new URL('../src/lib/repositoryMediaReferenceSync.ts', import.meta.url).href);
  const siteId = 'site-media-reference-smoke';
  const pageId = 'page-media-reference-smoke';
  const postId = 'post-media-reference-smoke';
  const collectionId = 'products';
  const recordId = 'product-media-reference-smoke';

  const createAsset = (type: 'image' | 'video' | 'font', name: string) => store.createMediaItem(siteId, {
    filename: `${name}.${type === 'font' ? 'woff2' : type === 'video' ? 'mp4' : 'jpg'}`,
    originalName: `${name}.${type === 'font' ? 'woff2' : type === 'video' ? 'mp4' : 'jpg'}`,
    mimeType: type === 'font' ? 'font/woff2' : type === 'video' ? 'video/mp4' : 'image/jpeg',
    sizeBytes: 1024,
    type,
    url: `/uploads/${name}`,
    visibility: 'public',
  });

  const desktopGallery = createAsset('image', 'desktop-gallery');
  const mobileGallery = createAsset('image', 'mobile-gallery');
  const mobileAlt = createAsset('image', 'mobile-gallery-alt');
  const tabletBackground = createAsset('image', 'tablet-background');
  const mobileFont = createAsset('font', 'mobile-font');
  const mobilePoster = createAsset('video', 'mobile-poster');
  const explicitDesignAsset = createAsset('image', 'explicit-design-asset');
  const pageFrontendDesignAsset = createAsset('image', 'page-frontend-design-asset');
  const pageDocumentMediaAsset = createAsset('image', 'page-document-media-asset');
  const pageDocumentFontAsset = createAsset('font', 'page-document-font-asset');
  const postFrontendDesignAsset = createAsset('image', 'post-frontend-design-asset');
  const postDocumentMediaAsset = createAsset('image', 'post-document-media-asset');
  const postFeaturedImage = createAsset('image', 'post-featured-image');
  const productFrontendDesignAsset = createAsset('image', 'product-frontend-design-asset');
  const productDownloadAsset = createAsset('image', 'product-download-asset');
  const unusedAsset = createAsset('image', 'unused-asset');

  store.createAdminPage(siteId, {
    id: pageId,
    title: 'Media Reference Smoke',
    slug: 'media-reference-smoke',
    status: 'draft',
    meta: {
      frontendDesignAssets: [
        {
          id: 'page-hero-design-asset',
          mediaId: pageFrontendDesignAsset.id,
          type: 'image',
          label: 'Hero design asset',
        },
      ],
    },
    content: {
      canvasSize: { width: 1200, height: 800 },
      assets: {
        media: [
          {
            id: pageDocumentMediaAsset.id,
            type: 'image',
            url: pageDocumentMediaAsset.url,
          },
        ],
        fonts: [
          {
            id: pageDocumentFontAsset.id,
            type: 'font',
            url: pageDocumentFontAsset.url,
          },
        ],
      },
      elements: [
        {
          id: 'gallery-element',
          type: 'gallery',
          x: 0,
          y: 0,
          width: 1200,
          height: 480,
          zIndex: 1,
          props: {
            mediaIds: [desktopGallery.id],
          },
          responsive: {
            mobile: {
              props: {
                mediaIds: [mobileGallery.id, mobileAlt.id],
                fontMediaIds: [mobileFont.id],
              },
              styles: {
                posterMediaIds: [mobilePoster.id],
              },
            },
            tablet: {
              assetIds: [explicitDesignAsset.id],
              styles: {
                backgroundMediaIds: [tabletBackground.id],
              },
            },
          },
        },
      ],
    },
  });

  store.createAdminBlogPost(siteId, {
    id: postId,
    title: 'Media Reference Blog Smoke',
    slug: 'media-reference-blog-smoke',
    status: 'draft',
    featuredImageId: postFeaturedImage.id,
    meta: {
      frontendDesignAssets: [
        {
          id: 'post-card-design-asset',
          mediaId: postFrontendDesignAsset.id,
          type: 'image',
          label: 'Post card design asset',
        },
      ],
    },
    content: {
      elements: [],
      assets: {
        media: [
          {
            id: postDocumentMediaAsset.id,
            type: 'image',
            url: postDocumentMediaAsset.url,
          },
        ],
      },
    },
  });

  store.createAdminCollection(siteId, {
    id: collectionId,
    name: 'Products',
    slug: 'products',
    status: 'published',
    permissions: { publicRead: true },
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'frontendDesignAssets', label: 'Frontend design assets', type: 'json' },
      { key: 'downloadMedia', label: 'Download media', type: 'json' },
    ],
  });

  store.createAdminCollectionRecord(siteId, collectionId, {
    id: recordId,
    slug: 'media-reference-product',
    status: 'published',
    values: {
      title: 'Media reference product',
      frontendDesignAssets: [
        {
          id: 'product-card-design-asset',
          mediaId: productFrontendDesignAsset.id,
          type: 'image',
          label: 'Product design asset',
        },
      ],
      downloadMedia: {
        mediaId: productDownloadAsset.id,
        label: 'Product download',
      },
    },
  });

  const assertPageRef = (mediaId: string, expected: boolean, label: string): void => {
    const media = store.getMediaById(siteId, mediaId);
    const pageIds = Array.isArray(media?.pageIds) ? media.pageIds : [];
    assert(
      pageIds.includes(pageId) === expected,
      `${label} page reference ${expected ? 'missing' : 'unexpected'}: ${JSON.stringify(pageIds)}`,
    );
  };

  const assertPostRef = (mediaId: string, expected: boolean, label: string): void => {
    const media = store.getMediaById(siteId, mediaId);
    const postIds = Array.isArray(media?.postIds) ? media.postIds : [];
    assert(
      postIds.includes(postId) === expected,
      `${label} post reference ${expected ? 'missing' : 'unexpected'}: ${JSON.stringify(postIds)}`,
    );
  };

  const assertCollectionRecordRef = (mediaId: string, expected: boolean, label: string): void => {
    const media = store.getMediaById(siteId, mediaId);
    const bindings = Array.isArray(media?.metadata?.bindings) ? media.metadata.bindings : [];
    const hasBinding = bindings.some((binding: unknown) => {
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return false;
      const record = binding as Record<string, unknown>;
      return record.scope === 'collectionRecord' &&
        record.collectionId === collectionId &&
        record.targetId === recordId;
    });
    assert(
      hasBinding === expected,
      `${label} collection record reference ${expected ? 'missing' : 'unexpected'}: ${JSON.stringify(bindings)}`,
    );
  };

  assertPageRef(desktopGallery.id, true, 'desktop plural mediaIds');
  assertPageRef(mobileGallery.id, true, 'responsive plural mediaIds');
  assertPageRef(mobileAlt.id, true, 'responsive second plural mediaIds');
  assertPageRef(mobileFont.id, true, 'responsive plural fontMediaIds');
  assertPageRef(mobilePoster.id, true, 'responsive plural posterMediaIds');
  assertPageRef(tabletBackground.id, true, 'responsive plural backgroundMediaIds');
  assertPageRef(explicitDesignAsset.id, true, 'responsive explicit assetIds');
  assertPageRef(pageFrontendDesignAsset.id, true, 'page frontendDesignAssets mediaId');
  assertPageRef(pageDocumentMediaAsset.id, true, 'page contentDocument assets.media id');
  assertPageRef(pageDocumentFontAsset.id, true, 'page contentDocument assets.fonts id');
  assertPostRef(postFrontendDesignAsset.id, true, 'post frontendDesignAssets mediaId');
  assertPostRef(postDocumentMediaAsset.id, true, 'post contentDocument assets.media id');
  assertPostRef(postFeaturedImage.id, true, 'post featuredImageId');
  assertCollectionRecordRef(productFrontendDesignAsset.id, true, 'product frontendDesignAssets mediaId');
  assertCollectionRecordRef(productDownloadAsset.id, true, 'product file mediaId');
  assertPageRef(unusedAsset.id, false, 'unused media');

  store.updateAdminPage(siteId, pageId, {
    meta: {
      frontendDesignAssets: [],
    },
    content: {
      canvasSize: { width: 1200, height: 800 },
      assets: {
        media: [],
        fonts: [],
      },
      elements: [
        {
          id: 'gallery-element',
          type: 'gallery',
          x: 0,
          y: 0,
          width: 1200,
          height: 480,
          zIndex: 1,
          props: {
            mediaIds: [mobileGallery.id],
          },
        },
      ],
    },
  });

  store.updateAdminBlogPost(siteId, postId, {
    featuredImageId: null,
    meta: {
      frontendDesignAssets: [],
    },
    content: {
      elements: [],
      assets: {
        media: [],
      },
    },
  });

  store.updateAdminCollectionRecord(siteId, collectionId, recordId, {
    values: {
      title: 'Media reference product',
      frontendDesignAssets: [],
      downloadMedia: null,
    },
  });

  assertPageRef(desktopGallery.id, false, 'removed desktop plural mediaIds');
  assertPageRef(mobileGallery.id, true, 'retained plural mediaIds');
  assertPageRef(mobileAlt.id, false, 'removed responsive plural mediaIds');
  assertPageRef(mobileFont.id, false, 'removed responsive plural fontMediaIds');
  assertPageRef(mobilePoster.id, false, 'removed responsive plural posterMediaIds');
  assertPageRef(tabletBackground.id, false, 'removed responsive plural backgroundMediaIds');
  assertPageRef(explicitDesignAsset.id, false, 'removed responsive explicit assetIds');
  assertPageRef(pageFrontendDesignAsset.id, false, 'removed page frontendDesignAssets mediaId');
  assertPageRef(pageDocumentMediaAsset.id, false, 'removed page contentDocument assets.media id');
  assertPageRef(pageDocumentFontAsset.id, false, 'removed page contentDocument assets.fonts id');
  assertPostRef(postFrontendDesignAsset.id, false, 'removed post frontendDesignAssets mediaId');
  assertPostRef(postDocumentMediaAsset.id, false, 'removed post contentDocument assets.media id');
  assertPostRef(postFeaturedImage.id, false, 'removed post featuredImageId');
  assertCollectionRecordRef(productFrontendDesignAsset.id, false, 'removed product frontendDesignAssets mediaId');
  assertCollectionRecordRef(productDownloadAsset.id, false, 'removed product file mediaId');

  const now = new Date().toISOString();
  const createRepositoryAsset = (id: string): MediaItem => ({
    id,
    siteId,
    filename: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    type: 'image',
    url: `/uploads/${id}.jpg`,
    thumbnailUrl: null,
    folderId: null,
    pageIds: [],
    postIds: [],
    tags: [],
    metadata: { visibility: 'public', scope: 'global' },
    altText: null,
    caption: null,
    uploadedBy: null,
    scope: 'global',
    scopeTargetId: null,
    visibility: 'public',
    createdAt: now,
    updatedAt: now,
  });

  const repositoryDesignAsset = createRepositoryAsset('repository-product-design-asset');
  repositoryDesignAsset.metadata.bindings = [{
    id: 'legacy-repository-product-binding',
    mediaId: repositoryDesignAsset.id,
    scope: 'collectionRecord',
    targetId: recordId,
    usageType: 'collection-record',
    attachedBy: 'legacy-import',
  }];
  const repositoryDocumentAsset = createRepositoryAsset('repository-product-document-asset');
  const repositoryRemovedAsset = createRepositoryAsset('repository-removed-product-asset');
  repositoryRemovedAsset.metadata.bindings = [{
    id: 'stale-repository-product-binding',
    mediaId: repositoryRemovedAsset.id,
    scope: 'collectionRecord',
    collectionId,
    targetId: recordId,
    usageType: 'collection-record',
    attachedBy: 'repository-sync',
  }];
  const repositoryPageAsset = createRepositoryAsset('repository-page-asset');
  repositoryPageAsset.metadata.bindings = [{
    id: 'repository-page-binding',
    mediaId: repositoryPageAsset.id,
    scope: 'page',
    targetId: pageId,
    usageType: 'content',
    attachedBy: 'repository-sync',
  }];
  repositoryPageAsset.metadata.pageIds = [pageId];
  const repositoryPageDesignAsset = createRepositoryAsset('repository-page-design-asset');
  const repositoryPageDocumentAsset = createRepositoryAsset('repository-page-document-asset');
  const repositoryPostDesignAsset = createRepositoryAsset('repository-post-design-asset');
  const repositoryPostFeaturedAsset = createRepositoryAsset('repository-post-featured-asset');

  const repositoryMedia = new Map<string, MediaItem>([
    repositoryDesignAsset,
    repositoryDocumentAsset,
    repositoryRemovedAsset,
    repositoryPageAsset,
    repositoryPageDesignAsset,
    repositoryPageDocumentAsset,
    repositoryPostDesignAsset,
    repositoryPostFeaturedAsset,
  ].map((item) => [item.id, item]));

  const repository = {
    list: async () => ({
      items: Array.from(repositoryMedia.values()),
      pagination: {
        total: repositoryMedia.size,
        limit: 10000,
        offset: 0,
        hasMore: false,
      },
    }),
    update: async (_siteId: string, mediaId: string, input: { metadata?: MediaItem['metadata'] }) => {
      const media = repositoryMedia.get(mediaId);
      assert(media, `repository media ${mediaId} missing`);
      const updated = {
        ...media,
        metadata: input.metadata || media.metadata,
        updatedAt: new Date().toISOString(),
      };
      repositoryMedia.set(mediaId, updated);
      return { item: updated };
    },
  } as unknown as BackyMediaRepository;

  const repositoryValues = {
    frontendDesignAssets: [
      {
        id: 'repository-product-design-token',
        mediaId: repositoryDesignAsset.id,
        label: 'Repository product design asset',
      },
    ],
    contentDocument: {
      assets: {
        media: [
          {
            id: repositoryDocumentAsset.id,
            type: 'image',
            url: repositoryDocumentAsset.url,
          },
        ],
      },
    },
  };
  const collectedRepositoryMediaIds = repositoryMediaReferenceSync.collectRepositoryMediaReferenceIds(repositoryValues);
  assert(collectedRepositoryMediaIds.has(repositoryDesignAsset.id), 'repository collector must find frontendDesignAssets mediaId');
  assert(collectedRepositoryMediaIds.has(repositoryDocumentAsset.id), 'repository collector must find content document assets.media id');

  const assertRepositoryCollectionRecordRef = (mediaId: string, expected: boolean, label: string): void => {
    const media = repositoryMedia.get(mediaId);
    const bindings = Array.isArray(media?.metadata.bindings) ? media.metadata.bindings : [];
    const hasBinding = bindings.some((binding: unknown) => {
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return false;
      const record = binding as Record<string, unknown>;
      return record.scope === 'collectionRecord' &&
        record.collectionId === collectionId &&
        record.targetId === recordId;
    });
    assert(
      hasBinding === expected,
      `${label} repository collection record reference ${expected ? 'missing' : 'unexpected'}: ${JSON.stringify(bindings)}`,
    );
  };

  await repositoryMediaReferenceSync.syncRepositoryCollectionRecordMediaReferences({
    mediaRepository: repository,
    siteId,
    collectionId,
    recordId,
    values: repositoryValues,
  });
  assertRepositoryCollectionRecordRef(repositoryDesignAsset.id, true, 'repository frontendDesignAssets mediaId');
  assertRepositoryCollectionRecordRef(repositoryDocumentAsset.id, true, 'repository content document assets.media id');
  assertRepositoryCollectionRecordRef(repositoryRemovedAsset.id, false, 'repository stale media binding');
  const repositoryPageBindings = repositoryMedia.get(repositoryPageAsset.id)?.metadata.bindings;
  assert(
    Array.isArray(repositoryPageBindings) && repositoryPageBindings[0]?.scope === 'page',
    'repository sync must preserve unrelated page bindings',
  );

  await repositoryMediaReferenceSync.removeRepositoryCollectionRecordMediaReferences({
    mediaRepository: repository,
    siteId,
    collectionId,
    recordId,
  });
  assertRepositoryCollectionRecordRef(repositoryDesignAsset.id, false, 'removed repository frontendDesignAssets mediaId');
  assertRepositoryCollectionRecordRef(repositoryDocumentAsset.id, false, 'removed repository content document assets.media id');

  const repositoryTargetRefs = (mediaId: string, key: 'pageIds' | 'postIds'): string[] => {
    const media = repositoryMedia.get(mediaId);
    const metadataRefs = Array.isArray(media?.metadata[key]) ? media.metadata[key] : [];
    const itemRefs = Array.isArray(media?.[key]) ? media[key] : [];
    return Array.from(new Set([...metadataRefs, ...itemRefs].filter((entry): entry is string => typeof entry === 'string')));
  };
  const assertRepositoryPageRef = (mediaId: string, expected: boolean, label: string): void => {
    const refs = repositoryTargetRefs(mediaId, 'pageIds');
    assert(
      refs.includes(pageId) === expected,
      `${label} repository page reference ${expected ? 'missing' : 'unexpected'}: ${JSON.stringify(refs)}`,
    );
  };
  const assertRepositoryPostRef = (mediaId: string, expected: boolean, label: string): void => {
    const refs = repositoryTargetRefs(mediaId, 'postIds');
    assert(
      refs.includes(postId) === expected,
      `${label} repository post reference ${expected ? 'missing' : 'unexpected'}: ${JSON.stringify(refs)}`,
    );
  };

  await repositoryMediaReferenceSync.syncRepositoryPageMediaReferences({
    mediaRepository: repository,
    siteId,
    pageId,
    meta: {
      frontendDesignAssets: [{ mediaId: repositoryPageDesignAsset.id }],
    },
    content: {
      assets: {
        media: [{ id: repositoryPageDocumentAsset.id, type: 'image' }],
      },
    },
  });
  assertRepositoryPageRef(repositoryPageDesignAsset.id, true, 'repository page frontendDesignAssets mediaId');
  assertRepositoryPageRef(repositoryPageDocumentAsset.id, true, 'repository page content document assets.media id');
  assertRepositoryPageRef(repositoryPageAsset.id, false, 'repository stale page media binding');

  await repositoryMediaReferenceSync.syncRepositoryPageMediaReferences({
    mediaRepository: repository,
    siteId,
    pageId,
    meta: {},
    content: {},
  });
  assertRepositoryPageRef(repositoryPageDesignAsset.id, false, 'removed repository page frontendDesignAssets mediaId');
  assertRepositoryPageRef(repositoryPageDocumentAsset.id, false, 'removed repository page content document assets.media id');

  await repositoryMediaReferenceSync.syncRepositoryPostMediaReferences({
    mediaRepository: repository,
    siteId,
    postId,
    featuredImageId: repositoryPostFeaturedAsset.id,
    meta: {
      frontendDesignAssets: [{ mediaId: repositoryPostDesignAsset.id }],
    },
    content: {},
  });
  assertRepositoryPostRef(repositoryPostDesignAsset.id, true, 'repository post frontendDesignAssets mediaId');
  assertRepositoryPostRef(repositoryPostFeaturedAsset.id, true, 'repository post featuredImageId');

  await repositoryMediaReferenceSync.removeRepositoryPostMediaReferences({
    mediaRepository: repository,
    siteId,
    postId,
  });
  assertRepositoryPostRef(repositoryPostDesignAsset.id, false, 'removed repository post frontendDesignAssets mediaId');
  assertRepositoryPostRef(repositoryPostFeaturedAsset.id, false, 'removed repository post featuredImageId');

  console.log(JSON.stringify({ ok: true, smoke: 'media-reference-collector' }));
}

main()
  .finally(() => {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  });

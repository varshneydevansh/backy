#!/usr/bin/env node

import { createBackyContentDocument } from '../../core/dist/index.mjs';
import {
  createCollectionRepository,
  createDatabaseRepositories,
  createMediaRepository,
  createPageRepository,
  createPostRepository,
  createSiteRepository,
  createUnimplementedRepositoryProxy,
} from '../dist/index.js';
import {
  blogPosts,
  contentCollectionRecords,
  contentCollections,
  media,
  mediaFolders,
  pages,
  sites,
} from '../dist/schema/index.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const tableName = (table) => {
  if (table === sites) return 'sites';
  if (table === pages) return 'pages';
  if (table === blogPosts) return 'blogPosts';
  if (table === contentCollections) return 'contentCollections';
  if (table === contentCollectionRecords) return 'contentCollectionRecords';
  if (table === media) return 'media';
  if (table === mediaFolders) return 'mediaFolders';
  throw new Error('Unknown table passed to fake DB');
};

const createFakeDb = () => {
  const state = {
    sites: [],
    pages: [],
    blogPosts: [],
    contentCollections: [],
    contentCollectionRecords: [],
    media: [],
    mediaFolders: [],
  };
  const counters = {
    sites: 0,
    pages: 0,
    blogPosts: 0,
    contentCollections: 0,
    contentCollectionRecords: 0,
    media: 0,
    mediaFolders: 0,
  };

  const now = () => new Date().toISOString();
  const nextId = (name) => {
    counters[name] += 1;
    return `${name}_${counters[name]}`;
  };
  const withDefaults = (name, values) => {
    const timestamp = now();
    if (name === 'sites') {
      return {
        id: nextId(name),
        teamId: 'team_default',
        name: 'Untitled site',
        slug: 'untitled',
        description: null,
        customDomain: null,
        domainStatus: 'pending',
        sslEnabled: false,
        theme: {},
        settings: {},
        isPublished: false,
        publishedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...values,
      };
    }
    if (name === 'pages') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        title: 'Untitled page',
        slug: 'untitled',
        description: null,
        content: { elements: [] },
        meta: {},
        status: 'draft',
        publishedAt: null,
        scheduledAt: null,
        isHomepage: false,
        parentId: null,
        sortOrder: 0,
        createdBy: null,
        updatedBy: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...values,
      };
    }
    if (name === 'blogPosts') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        title: 'Untitled post',
        slug: 'untitled',
        excerpt: null,
        content: { elements: [] },
        contentFormat: 'editor',
        featuredImageId: null,
        authorId: null,
        status: 'draft',
        publishedAt: null,
        scheduledAt: null,
        meta: {},
        viewCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...values,
      };
    }
    if (name === 'mediaFolders') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        parentId: null,
        name: 'Untitled folder',
        sortOrder: 0,
        createdAt: timestamp,
        ...values,
      };
    }
    if (name === 'contentCollections') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        name: 'Untitled collection',
        slug: 'untitled-collection',
        description: null,
        status: 'draft',
        fields: [],
        permissions: {
          publicRead: true,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
        ...values,
      };
    }
    if (name === 'contentCollectionRecords') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        collectionId: 'contentCollections_1',
        slug: 'untitled-record',
        status: 'draft',
        values: {},
        publishedAt: null,
        scheduledAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...values,
      };
    }
    return {
      id: nextId(name),
      siteId: 'site_default',
      filename: 'asset.bin',
      originalName: 'asset.bin',
      mimeType: 'application/octet-stream',
      sizeBytes: 0,
      type: 'other',
      url: '/uploads/asset.bin',
      thumbnailUrl: null,
      folderId: null,
      tags: [],
      metadata: {},
      altText: null,
      caption: null,
      uploadedBy: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...values,
    };
  };

  const queryFor = (name) => {
    let rows = [...state[name]];
    const query = {
      where: () => query,
      orderBy: () => query,
      limit: (limit) => {
        rows = rows.slice(0, limit);
        return query;
      },
      offset: (offset) => {
        rows = rows.slice(offset);
        return query;
      },
      then: (resolve, reject) => Promise.resolve([...rows]).then(resolve, reject),
    };
    return query;
  };

  return {
    state,
    select: () => ({
      from: (table) => queryFor(tableName(table)),
    }),
    insert: (table) => ({
      values: (values) => ({
        returning: async () => {
          const name = tableName(table);
          const row = withDefaults(name, values);
          state[name].push(row);
          return [row];
        },
      }),
    }),
    update: (table) => ({
      set: (values) => ({
        where: () => ({
          returning: async () => {
            const name = tableName(table);
            const current = state[name][0];
            if (!current) {
              return [];
            }
            const updated = {
              ...current,
              ...values,
            };
            state[name][0] = updated;
            return [updated];
          },
        }),
      }),
    }),
    delete: (table) => ({
      where: async () => {
        state[tableName(table)].shift();
      },
    }),
  };
};

const db = createFakeDb();
const repositorySet = createDatabaseRepositories({
  adapter: {
    type: 'postgres',
    db,
    isConnected: async () => true,
    close: async () => undefined,
  },
});
assert(repositorySet.sites && repositorySet.pages && repositorySet.posts, 'Expected repository set factories');
assert(repositorySet.media, 'Expected media repository factory');
assert(repositorySet.collections, 'Expected collection repository factory');

const siteRepository = createSiteRepository(db);
const pageRepository = createPageRepository(db);
const postRepository = createPostRepository(db);
const mediaRepository = createMediaRepository(db);
const collectionRepository = createCollectionRepository(db);

const site = (await siteRepository.create({
  teamId: 'team_contract',
  name: 'Repository Contract Site',
  slug: 'repo-contract',
  status: 'published',
})).item;

assert(site.id === 'sites_1', 'Expected fake site id');
assert(site.isPublished, 'Expected published site to be marked published');
assert(site.publishedAt, 'Expected published site timestamp');
assert((await siteRepository.getById(site.id))?.slug === 'repo-contract', 'Expected site getById');
assert((await siteRepository.getBySlug(site.slug))?.id === site.id, 'Expected site getBySlug');
assert(!(await siteRepository.checkSlug({ slug: site.slug, teamId: site.teamId })).available, 'Expected site slug conflict');

const siteList = await siteRepository.list({ teamId: site.teamId, status: 'published' });
assert(siteList.items.length === 1 && siteList.pagination.total === 1, 'Expected published site list result');

const contentDocument = createBackyContentDocument({
  id: 'page_contract_doc',
  kind: 'page',
  title: 'Repository Page',
  slug: 'repository-page',
  status: 'draft',
  elements: [
    {
      id: 'headline',
      type: 'heading',
      children: [],
      props: {
        content: 'Repository-backed content',
      },
    },
  ],
});

const page = (await pageRepository.create({
  siteId: site.id,
  title: 'Repository Page',
  slug: 'repository-page',
  status: 'draft',
  content: contentDocument,
})).item;

assert(page.content.schemaVersion === 'backy.content.v1', 'Expected canonical page content');
assert(page.content.elements[0]?.id === 'headline', 'Expected page content element');
assert((await pageRepository.list({ siteId: site.id })).items.length === 0, 'Expected draft pages hidden by default');
assert((await pageRepository.list({ siteId: site.id, includeUnpublished: true })).items.length === 1, 'Expected draft pages with includeUnpublished');

const publishedPage = (await pageRepository.publish(site.id, page.id)).item;
assert(publishedPage.status === 'published', 'Expected published page status');
assert(publishedPage.publishedAt, 'Expected page publishedAt after publish');
assert((await pageRepository.checkSlug({ siteId: site.id, slug: page.slug })).conflictingId === page.id, 'Expected page slug conflict');

db.state.pages.push({
  id: 'legacy_page',
  siteId: site.id,
  title: 'Legacy Page',
  slug: 'legacy-page',
  description: null,
  content: {
    elements: [
      {
        id: 'legacy_text',
        type: 'text',
        children: [],
        props: { content: 'Legacy content' },
      },
    ],
    canvasSize: { width: 1200, height: 700 },
  },
  meta: {},
  status: 'published',
  publishedAt: new Date().toISOString(),
  scheduledAt: null,
  isHomepage: false,
  parentId: null,
  sortOrder: 0,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
const legacyPage = await pageRepository.getBySlug(site.id, 'legacy-page');
assert(legacyPage?.content.schemaVersion === 'backy.content.v1', 'Expected legacy page to normalize to canonical content');

const postDocument = createBackyContentDocument({
  id: 'post_contract_doc',
  kind: 'post',
  title: 'Repository Post',
  slug: 'repository-post',
  status: 'draft',
  elements: [
    {
      id: 'post_body',
      type: 'text',
      children: [],
      props: { content: 'Post body' },
    },
  ],
});

const post = (await postRepository.create({
  siteId: site.id,
  title: 'Repository Post',
  slug: 'repository-post',
  status: 'draft',
  content: postDocument,
})).item;
assert(post.content.kind === 'post', 'Expected canonical post content');
assert((await postRepository.list({ siteId: site.id })).items.length === 0, 'Expected draft posts hidden by default');
assert((await postRepository.list({ siteId: site.id, includeUnpublished: true })).items.length === 1, 'Expected draft posts with includeUnpublished');

const archivedPost = (await postRepository.archive(site.id, post.id)).item;
assert(archivedPost.status === 'archived', 'Expected archived post');
assert((await postRepository.checkSlug({ siteId: site.id, slug: post.slug })).conflictingId === post.id, 'Expected post slug conflict');

db.state.mediaFolders.push({
  id: 'folder_assets',
  siteId: site.id,
  parentId: null,
  name: 'Assets',
  sortOrder: 10,
  createdAt: new Date().toISOString(),
});

const mediaItem = (await mediaRepository.create({
  siteId: site.id,
  filename: 'hero.jpg',
  originalName: 'Hero Image.jpg',
  mimeType: 'image/jpeg',
  size: 128000,
  url: '/uploads/sites/repo-contract/hero.jpg',
  type: 'image',
  folderId: 'folder_assets',
  altText: 'Hero image',
  caption: 'Homepage hero',
  visibility: 'public',
  metadata: {
    width: 1600,
    height: 900,
    tags: ['hero', 'image'],
    scope: 'page',
    scopeTargetId: page.id,
    pageIds: [page.id],
  },
  uploadedBy: 'user_admin',
})).item;
assert(mediaItem.sizeBytes === 128000, 'Expected media size normalization');
assert(mediaItem.tags.includes('hero'), 'Expected media tags from metadata');
assert(mediaItem.visibility === 'public', 'Expected media visibility metadata');
assert(mediaItem.scope === 'page' && mediaItem.scopeTargetId === page.id, 'Expected media scope metadata');
assert(mediaItem.pageIds.includes(page.id), 'Expected media page binding metadata');
assert((await mediaRepository.getById(site.id, mediaItem.id))?.url === mediaItem.url, 'Expected media getById');
assert((await mediaRepository.list({ siteId: site.id, type: 'image', visibility: 'public' })).items.length === 1, 'Expected media list filter');
const updatedMedia = (await mediaRepository.update(site.id, mediaItem.id, {
  altText: 'Updated hero image',
  visibility: 'private',
  tags: ['updated'],
})).item;
assert(updatedMedia.altText === 'Updated hero image', 'Expected media alt update');
assert(updatedMedia.visibility === 'private', 'Expected media visibility update');
assert(updatedMedia.tags.includes('updated'), 'Expected media tags update');
assert((await mediaRepository.listFolders(site.id)).some((folder) => folder.id === 'folder_assets'), 'Expected media folders');
assert(await mediaRepository.delete(site.id, mediaItem.id), 'Expected media delete');

const collection = (await collectionRepository.create({
  siteId: site.id,
  name: 'Products',
  slug: 'products',
  description: 'Catalog content',
  status: 'published',
  fields: [
    {
      id: 'field_title',
      key: 'title',
      label: 'Title',
      type: 'text',
      required: true,
    },
    {
      id: 'field_price',
      key: 'price',
      label: 'Price',
      type: 'number',
    },
  ],
  permissions: {
    publicRead: true,
    publicCreate: true,
  },
})).item;
assert(collection.id === 'contentCollections_1', 'Expected fake collection id');
assert(collection.permissions.publicCreate, 'Expected collection permissions');
assert((await collectionRepository.getBySlug(site.id, 'products'))?.id === collection.id, 'Expected collection getBySlug');
assert((await collectionRepository.list({ siteId: site.id })).items.length === 1, 'Expected published collection list');

const draftCollection = (await collectionRepository.create({
  siteId: site.id,
  name: 'Internal Notes',
  slug: 'internal-notes',
  status: 'draft',
  fields: [],
})).item;
assert((await collectionRepository.list({ siteId: site.id })).items.length === 1, 'Expected draft collection hidden by default');
assert((await collectionRepository.list({ siteId: site.id, includeUnpublished: true })).items.length === 2, 'Expected draft collection with includeUnpublished');
const updatedCollection = (await collectionRepository.update(site.id, collection.id, {
  status: 'published',
  description: 'Published later',
})).item;
assert(updatedCollection.status === 'published' && updatedCollection.description === 'Published later', 'Expected collection update');

const record = (await collectionRepository.createRecord({
  siteId: site.id,
  collectionId: collection.id,
  slug: 'starter-pack',
  status: 'draft',
  values: {
    title: 'Starter Pack',
    price: 49,
  },
})).item;
assert(record.id === 'contentCollectionRecords_1', 'Expected fake collection record id');
assert((await collectionRepository.listRecords({ siteId: site.id, collectionId: collection.id })).items.length === 0, 'Expected draft records hidden by default');
const publishedRecord = (await collectionRepository.updateRecord(site.id, collection.id, record.id, {
  status: 'published',
  scheduledAt: '2030-01-02T03:04:05.000Z',
  values: {
    title: 'Starter Pack',
    price: 59,
  },
})).item;
assert(publishedRecord.status === 'published' && publishedRecord.publishedAt, 'Expected published collection record');
assert(publishedRecord.scheduledAt === '2030-01-02T03:04:05.000Z', 'Expected collection record scheduledAt update');
assert(publishedRecord.values.price === 59, 'Expected record values update');
assert((await collectionRepository.getRecordBySlug(site.id, collection.id, 'starter-pack'))?.id === record.id, 'Expected record getBySlug');
assert((await collectionRepository.listRecords({
  siteId: site.id,
  collectionId: collection.id,
  fieldKey: 'price',
  fieldValue: 59,
})).items.length === 1, 'Expected field value filter');
assert(await collectionRepository.deleteRecord(site.id, collection.id, record.id), 'Expected collection record delete');
assert(await collectionRepository.delete(site.id, updatedCollection.id), 'Expected collection delete');
assert(await collectionRepository.delete(site.id, collection.id), 'Expected published collection delete');

assert(await pageRepository.delete(site.id, publishedPage.id), 'Expected page delete');
assert(await postRepository.delete(site.id, archivedPost.id), 'Expected post delete');
assert(await siteRepository.delete(site.id), 'Expected site delete');

let unimplementedBlocked = false;
try {
  createUnimplementedRepositoryProxy('media');
} catch {
  unimplementedBlocked = true;
}
assert(unimplementedBlocked, 'Expected unimplemented repository proxy to fail loudly');

console.log('Backy DB repository smoke passed');

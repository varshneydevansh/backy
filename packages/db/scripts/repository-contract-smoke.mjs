#!/usr/bin/env node

import { createBackyContentDocument } from '../../core/dist/index.mjs';
import {
  createDatabaseRepositories,
  createPageRepository,
  createPostRepository,
  createSiteRepository,
  createUnimplementedRepositoryProxy,
} from '../dist/index.js';
import {
  blogPosts,
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
  throw new Error('Unknown table passed to fake DB');
};

const createFakeDb = () => {
  const state = {
    sites: [],
    pages: [],
    blogPosts: [],
  };
  const counters = {
    sites: 0,
    pages: 0,
    blogPosts: 0,
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

const siteRepository = createSiteRepository(db);
const pageRepository = createPageRepository(db);
const postRepository = createPostRepository(db);

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

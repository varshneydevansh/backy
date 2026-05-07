#!/usr/bin/env node

import { createBackyContentDocument } from '../../core/dist/index.mjs';
import {
  createAuditLogRepository,
  createCollectionRepository,
  createCommentRepository,
  createDatabaseRepositories,
  createFormRepository,
  createMediaRepository,
  createPageRepository,
  createPostRepository,
  createSiteRepository,
  createUnimplementedRepositoryProxy,
  createUserRepository,
} from '../dist/index.js';
import {
  blogPosts,
  activityLogs,
  comments,
  contentCollectionRecords,
  contentCollections,
  formContacts,
  formDefinitions,
  formSubmissions,
  media,
  mediaFolders,
  pages,
  profiles,
  sites,
} from '../dist/schema/index.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const tableName = (table) => {
  if (table === activityLogs) return 'activityLogs';
  if (table === sites) return 'sites';
  if (table === pages) return 'pages';
  if (table === profiles) return 'profiles';
  if (table === blogPosts) return 'blogPosts';
  if (table === comments) return 'comments';
  if (table === contentCollections) return 'contentCollections';
  if (table === contentCollectionRecords) return 'contentCollectionRecords';
  if (table === formDefinitions) return 'formDefinitions';
  if (table === formSubmissions) return 'formSubmissions';
  if (table === formContacts) return 'formContacts';
  if (table === media) return 'media';
  if (table === mediaFolders) return 'mediaFolders';
  throw new Error('Unknown table passed to fake DB');
};

const createFakeDb = () => {
  const state = {
    activityLogs: [],
    sites: [],
    pages: [],
    profiles: [],
    blogPosts: [],
    comments: [],
    contentCollections: [],
    contentCollectionRecords: [],
    formDefinitions: [],
    formSubmissions: [],
    formContacts: [],
    media: [],
    mediaFolders: [],
  };
  const counters = {
    activityLogs: 0,
    sites: 0,
    pages: 0,
    profiles: 0,
    blogPosts: 0,
    comments: 0,
    contentCollections: 0,
    contentCollectionRecords: 0,
    formDefinitions: 0,
    formSubmissions: 0,
    formContacts: 0,
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
    if (name === 'profiles') {
      return {
        id: nextId(name),
        email: 'user@example.com',
        fullName: 'Repository User',
        avatarUrl: null,
        role: 'viewer',
        isActive: true,
        status: 'active',
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
    if (name === 'formDefinitions') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        pageId: null,
        postId: null,
        name: 'Contact',
        title: 'Contact',
        description: null,
        audience: 'public',
        isActive: true,
        fields: [],
        notificationEmail: null,
        notificationWebhook: null,
        successRedirectUrl: null,
        successMessage: null,
        enableHoneypot: true,
        enableCaptcha: false,
        moderationMode: 'manual',
        contactShare: {},
        collectionTarget: {},
        createdBy: null,
        updatedBy: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...values,
      };
    }
    if (name === 'formSubmissions') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        formId: 'formDefinitions_1',
        pageId: null,
        postId: null,
        values: {},
        ipHash: null,
        userAgent: null,
        requestId: null,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        adminNotes: null,
        collectionRecord: null,
        collectionRecordErrors: [],
        submittedAt: timestamp,
        updatedAt: timestamp,
        ...values,
      };
    }
    if (name === 'formContacts') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        formId: 'formDefinitions_1',
        pageId: null,
        postId: null,
        name: null,
        email: null,
        phone: null,
        notes: null,
        sourceValues: {},
        status: 'new',
        sourceSubmissionId: null,
        requestId: null,
        sourceIpHash: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...values,
      };
    }
    if (name === 'comments') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        targetType: 'page',
        targetId: 'pages_1',
        commentThreadId: null,
        authorName: null,
        authorEmail: null,
        authorWebsite: null,
        userId: null,
        content: 'Comment body',
        status: 'pending',
        parentId: null,
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        blockReason: null,
        blockedBy: null,
        blockedAt: null,
        reportCount: 0,
        reportReasons: [],
        requestId: null,
        ipHash: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...values,
      };
    }
    if (name === 'activityLogs') {
      return {
        id: nextId(name),
        siteId: null,
        userId: null,
        action: 'create',
        entityType: 'auditLog',
        entityId: null,
        details: {},
        ipAddress: null,
        userAgent: null,
        createdAt: timestamp,
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
assert(repositorySet.forms, 'Expected form repository factory');
assert(repositorySet.comments, 'Expected comment repository factory');
assert(repositorySet.users, 'Expected user repository factory');
assert(repositorySet.auditLogs, 'Expected audit log repository factory');

const siteRepository = createSiteRepository(db);
const pageRepository = createPageRepository(db);
const postRepository = createPostRepository(db);
const mediaRepository = createMediaRepository(db);
const collectionRepository = createCollectionRepository(db);
const formRepository = createFormRepository(db);
const commentRepository = createCommentRepository(db);
const auditLogRepository = createAuditLogRepository(db);
const userRepository = createUserRepository(db);

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

const form = (await formRepository.create({
  siteId: site.id,
  pageId: publishedPage.id,
  postId: null,
  name: 'Contact Form',
  title: 'Contact us',
  description: 'Lead capture',
  audience: 'public',
  isActive: true,
  fields: [
    {
      key: 'email',
      label: 'Email',
      type: 'email',
      required: true,
    },
    {
      key: 'message',
      label: 'Message',
      type: 'textarea',
      required: true,
    },
  ],
  notificationEmail: 'team@example.com',
  notificationWebhook: null,
  successRedirectUrl: null,
  successMessage: 'Thanks',
  enableHoneypot: true,
  enableCaptcha: false,
  moderationMode: 'manual',
  contactShare: {
    enabled: true,
    emailField: 'email',
    notesField: 'message',
  },
  collectionTarget: null,
  createdBy: 'user_admin',
  updatedBy: 'user_admin',
})).item;
assert(form.id === 'formDefinitions_1', 'Expected fake form id');
assert((await formRepository.list({ siteId: site.id, pageId: publishedPage.id })).items.length === 1, 'Expected form page filter');
assert((await formRepository.getById(site.id, form.id))?.title === 'Contact us', 'Expected form getById');
const updatedForm = (await formRepository.update(site.id, form.id, { title: 'Contact the team', isActive: false })).item;
assert(updatedForm.title === 'Contact the team' && !updatedForm.isActive, 'Expected form update');

const submission = (await formRepository.createSubmission({
  siteId: site.id,
  formId: form.id,
  pageId: publishedPage.id,
  postId: null,
  values: {
    email: 'reader@example.com',
    message: 'Hello from repository smoke',
  },
  ipHash: '127.0.0.1',
  userAgent: 'repository-smoke',
  requestId: 'req_form_contract',
  status: 'pending',
  reviewedBy: null,
  reviewedAt: null,
  adminNotes: null,
  collectionRecord: null,
  collectionRecordErrors: [],
})).item;
assert(submission.id === 'formSubmissions_1', 'Expected fake submission id');
assert((await formRepository.listSubmissions({ siteId: site.id, formId: form.id, requestId: 'req_form_contract' })).items.length === 1, 'Expected submission request filter');
const approvedSubmission = (await formRepository.updateSubmission(site.id, submission.id, {
  status: 'approved',
  reviewedBy: 'user_admin',
  adminNotes: 'Looks good',
})).item;
assert(approvedSubmission.status === 'approved' && approvedSubmission.reviewedBy === 'user_admin', 'Expected submission update');
assert((await formRepository.getSubmissionById(site.id, form.id, submission.id))?.status === 'approved', 'Expected submission getById');

const contact = (await formRepository.createContact({
  siteId: site.id,
  formId: form.id,
  pageId: publishedPage.id,
  postId: null,
  name: 'Reader',
  email: 'reader@example.com',
  phone: null,
  notes: 'Hello from repository smoke',
  sourceValues: approvedSubmission.values,
  status: 'new',
  sourceSubmissionId: approvedSubmission.id,
  requestId: approvedSubmission.requestId,
  sourceIpHash: approvedSubmission.ipHash,
})).item;
assert(contact.id === 'formContacts_1', 'Expected fake contact id');
assert((await formRepository.listContacts({ siteId: site.id, formId: form.id, requestId: 'req_form_contract' })).items.length === 1, 'Expected contact request filter');
const qualifiedContact = (await formRepository.updateContact(site.id, contact.id, { status: 'qualified' })).item;
assert(qualifiedContact.status === 'qualified', 'Expected contact update');
assert((await formRepository.getContactById(site.id, form.id, contact.id))?.status === 'qualified', 'Expected contact getById');
assert(await formRepository.delete(site.id, form.id), 'Expected form delete');

const rootComment = (await commentRepository.create({
  siteId: site.id,
  targetType: 'page',
  targetId: publishedPage.id,
  commentThreadId: 'thread_main',
  content: 'Repository comments work',
  authorName: 'Reader',
  authorEmail: 'reader@example.com',
  authorWebsite: 'https://example.com',
  userId: 'user_reader',
  status: 'approved',
  parentId: null,
  requestId: 'req_comment_contract',
  ipHash: '127.0.0.1',
})).item;
assert(rootComment.id === 'comments_1', 'Expected fake comment id');
assert(rootComment.status === 'approved', 'Expected comment status');
assert((await commentRepository.list({
  siteId: site.id,
  targetType: 'page',
  targetId: publishedPage.id,
  status: 'approved',
  requestId: 'req_comment_contract',
  q: 'comments work',
  commentThreadId: 'thread_main',
})).items.length === 1, 'Expected comment list filters');

const replyComment = (await commentRepository.create({
  siteId: site.id,
  targetType: 'page',
  targetId: publishedPage.id,
  commentThreadId: 'thread_main',
  content: 'Reply comment',
  authorName: 'Editor',
  status: 'pending',
  parentId: rootComment.id,
})).item;
assert((await commentRepository.list({
  siteId: site.id,
  targetType: 'page',
  targetId: publishedPage.id,
  parentOnly: true,
  parentId: rootComment.id,
  status: 'all',
})).items.some((comment) => comment.id === replyComment.id), 'Expected comment parent filter');

const updatedComment = (await commentRepository.update(site.id, rootComment.id, {
  status: 'blocked',
  reviewedBy: 'user_admin',
  reviewedAt: '2030-02-03T04:05:06.000Z',
  rejectionReason: 'Manual review',
  blockReason: 'spam',
  blockedBy: 'user_admin',
  blockedAt: '2030-02-03T04:05:06.000Z',
  reportCount: 3,
  reportReasons: ['spam', 'other'],
})).item;
assert(updatedComment.status === 'blocked' && updatedComment.reportCount === 3, 'Expected comment moderation update');
assert((await commentRepository.getById(site.id, rootComment.id))?.blockReason === 'spam', 'Expected comment getById');
assert(await commentRepository.delete(site.id, replyComment.id), 'Expected comment delete');
assert(await commentRepository.delete(site.id, rootComment.id), 'Expected root comment delete');

const auditEntry = await auditLogRepository.record({
  siteId: site.id,
  teamId: site.teamId,
  actorId: 'user_admin',
  entity: 'comment',
  entityId: rootComment.id,
  action: 'comment-status',
  before: { status: 'approved' },
  after: { status: 'blocked' },
  metadata: {
    targetType: 'page',
    requestId: 'req_audit_contract',
  },
  requestId: 'req_audit_contract',
});
assert(auditEntry.id === 'activityLogs_1', 'Expected fake audit log id');
assert(auditEntry.entity === 'comment' && auditEntry.action === 'comment-status', 'Expected audit log mapping');
assert((await auditLogRepository.list({
  siteId: site.id,
  entity: 'comment',
  entityId: rootComment.id,
  action: 'comment-status',
  requestId: 'req_audit_contract',
})).items.length === 1, 'Expected audit log filters');

const user = (await userRepository.create({
  fullName: 'Repository User',
  email: 'repository.user@example.com',
  role: 'editor',
  status: 'invited',
})).item;
assert(user.id === 'profiles_1', 'Expected fake user id');
assert(user.email === 'repository.user@example.com', 'Expected user email normalization');
assert((await userRepository.getByEmail(user.email))?.id === user.id, 'Expected user getByEmail');
assert((await userRepository.list({ role: 'editor', status: 'invited', search: 'repository.user' })).items.length === 1, 'Expected user list filters');
const activeUser = (await userRepository.update(user.id, {
  status: 'active',
  role: 'admin',
  avatarUrl: 'https://example.com/avatar.png',
})).item;
assert(activeUser.status === 'active' && activeUser.role === 'admin', 'Expected user update');
assert(await userRepository.delete(activeUser.id), 'Expected user delete');

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

#!/usr/bin/env node

import { createBackyContentDocument } from '../../core/dist/index.mjs';
import {
  createAuditLogRepository,
  createBlogTaxonomyRepository,
  createCacheInvalidationRepository,
  createCollectionRepository,
  createCommentRepository,
  createContentWorkflowRepository,
  createDatabaseRepositories,
  createFormRepository,
  createMediaRepository,
  createPageRepository,
  createPostRepository,
  createReusableSectionRepository,
  createSettingsRepository,
  createSiteRepository,
  createUnimplementedRepositoryProxy,
  createUserRepository,
} from '../dist/index.js';
import {
  blogPosts,
  blogCategories,
  blogTags,
  cacheInvalidationEvents,
  activityLogs,
  comments,
  commentBlocklist,
  contentCollectionRecords,
  contentCollections,
  contentRevisions,
  formContacts,
  formDefinitions,
  formSubmissions,
  media,
  mediaFolders,
  mediaVersions,
  pages,
  platformSettings,
  previewTokens,
  profiles,
  adminUserCredentials,
  reusableSections,
  sites,
} from '../dist/schema/index.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const tableName = (table) => {
  if (table === activityLogs) return 'activityLogs';
  if (table === cacheInvalidationEvents) return 'cacheInvalidationEvents';
  if (table === sites) return 'sites';
  if (table === pages) return 'pages';
  if (table === platformSettings) return 'platformSettings';
  if (table === previewTokens) return 'previewTokens';
  if (table === profiles) return 'profiles';
  if (table === adminUserCredentials) return 'adminUserCredentials';
  if (table === reusableSections) return 'reusableSections';
  if (table === blogPosts) return 'blogPosts';
  if (table === blogCategories) return 'blogCategories';
  if (table === blogTags) return 'blogTags';
  if (table === comments) return 'comments';
  if (table === commentBlocklist) return 'commentBlocklist';
  if (table === contentCollections) return 'contentCollections';
  if (table === contentCollectionRecords) return 'contentCollectionRecords';
  if (table === contentRevisions) return 'contentRevisions';
  if (table === formDefinitions) return 'formDefinitions';
  if (table === formSubmissions) return 'formSubmissions';
  if (table === formContacts) return 'formContacts';
  if (table === media) return 'media';
  if (table === mediaFolders) return 'mediaFolders';
  if (table === mediaVersions) return 'mediaVersions';
  throw new Error('Unknown table passed to fake DB');
};

const createFakeDb = () => {
  const state = {
    activityLogs: [],
    cacheInvalidationEvents: [],
    sites: [],
    pages: [],
    platformSettings: [],
    previewTokens: [],
    profiles: [],
    adminUserCredentials: [],
    reusableSections: [],
    blogPosts: [],
    blogCategories: [],
    blogTags: [],
    comments: [],
    commentBlocklist: [],
    contentCollections: [],
    contentCollectionRecords: [],
    contentRevisions: [],
    formDefinitions: [],
    formSubmissions: [],
    formContacts: [],
    media: [],
    mediaFolders: [],
    mediaVersions: [],
  };
  const queryStats = [];
  const counters = {
    activityLogs: 0,
    cacheInvalidationEvents: 0,
    sites: 0,
    pages: 0,
    platformSettings: 0,
    previewTokens: 0,
    profiles: 0,
    adminUserCredentials: 0,
    reusableSections: 0,
    blogPosts: 0,
    blogCategories: 0,
    blogTags: 0,
    comments: 0,
    commentBlocklist: 0,
    contentCollections: 0,
    contentCollectionRecords: 0,
    contentRevisions: 0,
    formDefinitions: 0,
    formSubmissions: 0,
    formContacts: 0,
    media: 0,
    mediaFolders: 0,
    mediaVersions: 0,
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
    if (name === 'adminUserCredentials') {
      return {
        userId: 'profiles_1',
        passwordHash: 'hash',
        salt: 'salt',
        updatedAt: timestamp,
        ...values,
      };
    }
    if (name === 'platformSettings') {
      return {
        id: 'default',
        deliveryMode: 'managed-hosting',
        apiKeys: {},
        storage: {},
        auth: {},
        integrations: {},
        updatedAt: timestamp,
        ...values,
      };
    }
    if (name === 'previewTokens') {
      return {
        token: `preview_${nextId(name)}`,
        siteId: 'site_default',
        targetType: 'page',
        targetId: 'pages_1',
        createdAt: timestamp,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        createdBy: null,
        ...values,
      };
    }
    if (name === 'reusableSections') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        name: 'Reusable section',
        slug: 'reusable-section',
        description: null,
        category: 'general',
        status: 'active',
        tags: [],
        content: {},
        sourceElementId: null,
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
    if (name === 'blogCategories') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        name: 'Category',
        slug: 'category',
        description: null,
        color: null,
        sortOrder: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...values,
      };
    }
    if (name === 'blogTags') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        name: 'Tag',
        slug: 'tag',
        description: null,
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
    if (name === 'mediaVersions') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        mediaId: 'media_1',
        filename: 'previous.jpg',
        originalName: 'Previous Image.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 64000,
        type: 'image',
        url: '/uploads/sites/repo-contract/previous.jpg',
        thumbnailUrl: null,
        storagePath: null,
        storageProvider: null,
        replacedAt: timestamp,
        replacedBy: null,
        reason: null,
        metadata: {},
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
    if (name === 'contentRevisions') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        targetType: 'page',
        targetId: 'pages_1',
        snapshot: {},
        note: null,
        createdBy: null,
        createdAt: timestamp,
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
    if (name === 'commentBlocklist') {
      return {
        id: nextId(name),
        siteId: 'site_default',
        type: 'email',
        value: 'reader@example.com',
        reason: 'manual-block',
        actor: null,
        requestId: null,
        createdAt: timestamp,
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
    if (name === 'cacheInvalidationEvents') {
      return {
        id: nextId(name),
        siteId: null,
        scope: 'all',
        entityType: 'cacheInvalidation',
        entityId: null,
        reason: 'manual',
        revision: `rev_${counters[name]}`,
        metadata: {},
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

  const camelCaseColumnName = (name) => name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

  const readEqualities = (condition, equalities = []) => {
    const chunks = condition?.queryChunks;
    if (!Array.isArray(chunks)) {
      return equalities;
    }

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (Array.isArray(chunk?.queryChunks)) {
        readEqualities(chunk, equalities);
        continue;
      }

      const operator = chunks[index + 1];
      const param = chunks[index + 2];
      if (
        typeof chunk?.name === 'string'
        && Array.isArray(operator?.value)
        && operator.value.join('') === ' = '
        && param?.constructor?.name === 'Param'
      ) {
        equalities.push([camelCaseColumnName(chunk.name), param.value]);
      }
    }

    return equalities;
  };

  const matchesCondition = (row, condition) => {
    const equalities = readEqualities(condition);
    if (!equalities.length) {
      return true;
    }
    return equalities.every(([key, value]) => row[key] === value);
  };

  const readOrderTokens = (value, tokens = []) => {
    if (!value) {
      return tokens;
    }
    if (typeof value === 'string') {
      tokens.push({ type: 'literal', value });
      return tokens;
    }
    if (typeof value.name === 'string') {
      tokens.push({ type: 'column', value: camelCaseColumnName(value.name) });
    }
    if (Array.isArray(value.value)) {
      tokens.push(...value.value.map((entry) => ({ type: 'literal', value: String(entry) })));
    }
    if (Array.isArray(value.queryChunks)) {
      for (const chunk of value.queryChunks) {
        readOrderTokens(chunk, tokens);
      }
    }
    return tokens;
  };

  const readOrder = (columns) => {
    const tokens = columns.flatMap((column) => readOrderTokens(column));
    const literals = tokens.filter((token) => token.type === 'literal').map((token) => token.value);
    const columnsByName = tokens.filter((token) => token.type === 'column').map((token) => token.value);
    const direction = literals.join(' ').toLowerCase().includes(' desc') ? -1 : 1;

    if (columnsByName.includes('values')) {
      const fieldKey = literals.find((value) => !/[>\s()]/.test(value) && value.length > 0);
      if (fieldKey) {
        return { key: fieldKey, direction, source: 'values' };
      }
    }

    return {
      key: columnsByName.at(-1) || 'updatedAt',
      direction,
      source: 'row',
    };
  };

  const compareOrderValue = (left, right) => {
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }
    return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
  };

  const queryFor = (name, projection) => {
    let rows = [...state[name]];
    let requestedLimit = null;
    let requestedOffset = 0;
    const countProjection = Boolean(
      projection
        && typeof projection === 'object'
        && !Array.isArray(projection)
        && Object.prototype.hasOwnProperty.call(projection, 'total'),
    );
    const query = {
      where: (condition) => {
        rows = rows.filter((row) => matchesCondition(row, condition));
        return query;
      },
      orderBy: (...columns) => {
        const order = readOrder(columns);
        rows = [...rows].sort((left, right) => {
          const leftValue = order.source === 'values' ? left.values?.[order.key] : left[order.key];
          const rightValue = order.source === 'values' ? right.values?.[order.key] : right[order.key];
          return compareOrderValue(leftValue, rightValue) * order.direction;
        });
        return query;
      },
      limit: (limit) => {
        requestedLimit = limit;
        return query;
      },
      offset: (offset) => {
        requestedOffset = offset;
        return query;
      },
      then: (resolve, reject) => {
        const pagedRows = rows.slice(
          requestedOffset,
          requestedLimit === null ? undefined : requestedOffset + requestedLimit,
        );
        const result = countProjection ? [{ total: rows.length }] : pagedRows;
        queryStats.push({
          table: name,
          projection: countProjection ? 'count' : 'rows',
          rows: result.length,
        });
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  };

  return {
    state,
    queryStats,
    select: (projection) => ({
      from: (table) => queryFor(tableName(table), projection),
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
        where: (condition) => ({
          returning: async () => {
            const name = tableName(table);
            const updatedRows = [];
            state[name] = state[name].map((row) => {
              if (!matchesCondition(row, condition)) {
                return row;
              }
              const updated = {
                ...row,
                ...values,
              };
              updatedRows.push(updated);
              return updated;
            });
            return updatedRows;
          },
        }),
      }),
    }),
    delete: (table) => ({
      where: async (condition) => {
        const name = tableName(table);
        state[name] = state[name].filter((row) => !matchesCondition(row, condition));
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
assert(repositorySet.blogTaxonomy, 'Expected blog taxonomy repository factory');
assert(repositorySet.media, 'Expected media repository factory');
assert(repositorySet.collections, 'Expected collection repository factory');
assert(repositorySet.forms, 'Expected form repository factory');
assert(repositorySet.comments, 'Expected comment repository factory');
assert(repositorySet.reusableSections, 'Expected reusable section repository factory');
assert(repositorySet.contentWorkflows, 'Expected content workflow repository factory');
assert(repositorySet.users, 'Expected user repository factory');
assert(repositorySet.settings, 'Expected settings repository factory');
assert(repositorySet.auditLogs, 'Expected audit log repository factory');
assert(repositorySet.cacheInvalidations, 'Expected cache invalidation repository factory');

const siteRepository = createSiteRepository(db);
const pageRepository = createPageRepository(db);
const postRepository = createPostRepository(db);
const blogTaxonomyRepository = createBlogTaxonomyRepository(db);
const mediaRepository = createMediaRepository(db);
const collectionRepository = createCollectionRepository(db);
const formRepository = createFormRepository(db);
const commentRepository = createCommentRepository(db);
const auditLogRepository = createAuditLogRepository(db);
const cacheInvalidationRepository = createCacheInvalidationRepository(db);
const contentWorkflowRepository = createContentWorkflowRepository(db);
const userRepository = createUserRepository(db);
const settingsRepository = createSettingsRepository(db);
const reusableSectionRepository = createReusableSectionRepository(db);

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

const siteControlPlaneSettings = {
  domainVerification: {
    status: 'verified',
    method: 'dns-txt',
    domain: 'repo-contract.example.com',
    token: 'backy-repository-contract',
    txtHost: '_backy.repo-contract.example.com',
    txtValue: 'backy-site-verification=backy-repository-contract',
    cnameTarget: 'repo-contract.backy.app',
    requestedAt: '2026-05-13T00:00:00.000Z',
    checkedAt: '2026-05-13T00:01:00.000Z',
    verifiedAt: '2026-05-13T00:01:00.000Z',
    lastError: null,
  },
  vercelDeployment: {
    status: 'production_ready',
    projectId: 'prj_repo_contract',
    teamSlug: 'backy-repo',
    productionDomain: 'repo-contract.example.com',
    previewUrl: 'https://repo-contract-preview.vercel.app',
    productionUrl: 'https://repo-contract.example.com',
    deploymentId: 'dpl_repo_contract',
    environment: 'production',
    lastAction: 'promote-production',
    requestedAt: '2026-05-13T00:02:00.000Z',
    completedAt: '2026-05-13T00:03:00.000Z',
    promotedAt: '2026-05-13T00:03:00.000Z',
    rolledBackAt: null,
    command: 'vercel deploy --prebuilt --prod',
    missing: [],
    history: [
      {
        id: 'deploy_repo_contract',
        action: 'promote-production',
        status: 'production_ready',
        environment: 'production',
        targetUrl: 'https://repo-contract.example.com',
        command: 'vercel deploy --prebuilt --prod',
        requestedAt: '2026-05-13T00:02:00.000Z',
        completedAt: '2026-05-13T00:03:00.000Z',
        missing: [],
      },
    ],
  },
  billingQuota: {
    plan: 'business',
    status: 'active',
    billingOwnerId: 'profiles_1',
    billingEmail: 'billing@example.com',
    renewalAt: '2026-06-13T00:00:00.000Z',
    limits: {
      pages: 250,
      mediaGb: 100,
      bandwidthGb: 1000,
      forms: 75,
      products: 5000,
      collections: 100,
      teamMembers: 25,
      customDomains: 20,
    },
    usage: {
      pages: 4,
      mediaGb: 2,
      bandwidthGb: 20,
      forms: 1,
      products: 12,
      collections: 2,
      teamMembers: 3,
      customDomains: 1,
      updatedAt: '2026-05-13T00:04:00.000Z',
    },
    lastAction: 'refresh-usage',
    notes: 'Repository persistence smoke',
    history: [
      {
        id: 'quota_repo_contract',
        action: 'refresh-usage',
        plan: 'business',
        status: 'active',
        requestedAt: '2026-05-13T00:04:00.000Z',
        usage: {
          pages: 4,
          mediaGb: 2,
          bandwidthGb: 20,
          forms: 1,
          products: 12,
          collections: 2,
          teamMembers: 3,
          customDomains: 1,
          updatedAt: '2026-05-13T00:04:00.000Z',
        },
        limits: {
          pages: 250,
          mediaGb: 100,
          bandwidthGb: 1000,
          forms: 75,
          products: 5000,
          collections: 100,
          teamMembers: 25,
          customDomains: 20,
        },
      },
    ],
  },
};
const settingsSite = (await siteRepository.update(site.id, {
  settings: {
    ...site.settings,
    ...siteControlPlaneSettings,
  },
})).item;
const reloadedSettingsSite = await siteRepository.getById(site.id);
assert(settingsSite.settings.domainVerification?.status === 'verified', 'Expected site domain verification settings to return from repository update');
assert(reloadedSettingsSite?.settings.domainVerification?.txtValue === siteControlPlaneSettings.domainVerification.txtValue, 'Expected site domain verification settings to persist through repository read');
assert(reloadedSettingsSite?.settings.vercelDeployment?.history?.[0]?.targetUrl === siteControlPlaneSettings.vercelDeployment.productionUrl, 'Expected site Vercel deployment history to persist through repository read');
assert(reloadedSettingsSite?.settings.billingQuota?.plan === 'business', 'Expected site billing quota plan to persist through repository read');
assert(reloadedSettingsSite?.settings.billingQuota?.usage.pages === 4, 'Expected site billing quota usage to persist through repository read');
assert(db.state.sites[0].settings?.domainVerification?.token === siteControlPlaneSettings.domainVerification.token, 'Expected domain verification settings to persist in DB settings JSON');
assert(db.state.sites[0].settings?.vercelDeployment?.status === 'production_ready', 'Expected Vercel deployment settings to persist in DB settings JSON');
assert(db.state.sites[0].settings?.billingQuota?.limits?.pages === 250, 'Expected billing quota settings to persist in DB settings JSON');

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

const category = (await blogTaxonomyRepository.createCategory({
  siteId: site.id,
  name: 'Announcements',
  slug: 'announcements',
  description: 'Product updates',
  color: '#2563eb',
})).item;
const tag = (await blogTaxonomyRepository.createTag({
  siteId: site.id,
  name: 'Launch',
  slug: 'launch',
  description: 'Launch posts',
})).item;
const categorizedPost = (await postRepository.update(site.id, post.id, {
  categoryIds: [category.id],
  tagIds: [tag.id],
})).item;
assert(categorizedPost.categoryIds.includes(category.id), 'Expected post category assignment');
assert(categorizedPost.tagIds.includes(tag.id), 'Expected post tag assignment');
assert((await blogTaxonomyRepository.listCategories(site.id))[0]?.postCount === 1, 'Expected category post count');
assert((await blogTaxonomyRepository.listTags(site.id))[0]?.postCount === 1, 'Expected tag post count');
assert((await blogTaxonomyRepository.getCategoryByIdOrSlug(site.id, 'announcements'))?.id === category.id, 'Expected category slug lookup');
assert((await blogTaxonomyRepository.getTagByIdOrSlug(site.id, 'launch'))?.id === tag.id, 'Expected tag slug lookup');

const archivedPost = (await postRepository.archive(site.id, post.id)).item;
assert(archivedPost.status === 'archived', 'Expected archived post');
assert((await postRepository.checkSlug({ siteId: site.id, slug: post.slug })).conflictingId === post.id, 'Expected post slug conflict');

const mediaFolder = (await mediaRepository.createFolder({
  siteId: site.id,
  parentId: null,
  name: 'Assets',
  sortOrder: 10,
})).item;
assert(mediaFolder.name === 'Assets', 'Expected media folder create');
const updatedMediaFolder = (await mediaRepository.updateFolder(site.id, mediaFolder.id, {
  name: 'Brand assets',
  sortOrder: 20,
})).item;
assert(updatedMediaFolder.name === 'Brand assets' && updatedMediaFolder.sortOrder === 20, 'Expected media folder update');

const mediaItem = (await mediaRepository.create({
  siteId: site.id,
  filename: 'hero.jpg',
  originalName: 'Hero Image.jpg',
  mimeType: 'image/jpeg',
  size: 128000,
  url: '/uploads/sites/repo-contract/hero.jpg',
  type: 'image',
  folderId: mediaFolder.id,
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
const mediaVersion = (await mediaRepository.createVersion({
  siteId: site.id,
  mediaId: mediaItem.id,
  filename: mediaItem.filename,
  originalName: mediaItem.originalName,
  mimeType: mediaItem.mimeType,
  sizeBytes: mediaItem.sizeBytes,
  type: mediaItem.type,
  url: mediaItem.url,
  thumbnailUrl: mediaItem.thumbnailUrl,
  storagePath: '/uploads/sites/repo-contract/hero.jpg',
  storageProvider: 'local',
  replacedAt: new Date().toISOString(),
  replacedBy: 'user_admin',
  reason: 'Repository contract replacement',
  metadata: {
    source: 'repository-contract',
  },
})).item;
assert(mediaVersion.mediaId === mediaItem.id && mediaVersion.originalName === mediaItem.originalName, 'Expected media version create');
const listedMediaVersions = await mediaRepository.listVersions({ siteId: site.id, mediaId: mediaItem.id });
assert(listedMediaVersions.items.length === 1 && listedMediaVersions.items[0].id === mediaVersion.id, 'Expected media version list');
assert(await mediaRepository.deleteVersion({ siteId: site.id, mediaId: mediaItem.id, versionId: mediaVersion.id }), 'Expected media version delete');
assert((await mediaRepository.listVersions({ siteId: site.id, mediaId: mediaItem.id })).items.length === 0, 'Expected retained version delete');
await mediaRepository.createVersion({
  siteId: site.id,
  mediaId: mediaItem.id,
  filename: mediaItem.filename,
  originalName: mediaItem.originalName,
  mimeType: mediaItem.mimeType,
  sizeBytes: mediaItem.sizeBytes,
  type: mediaItem.type,
  url: mediaItem.url,
  thumbnailUrl: mediaItem.thumbnailUrl,
  storagePath: '/uploads/sites/repo-contract/hero-cascade.jpg',
  storageProvider: 'local',
  replacedAt: new Date().toISOString(),
  replacedBy: 'user_admin',
  reason: 'Repository contract cascade cleanup',
  metadata: {
    source: 'repository-contract',
  },
});
assert((await mediaRepository.listFolders(site.id)).some((folder) => folder.id === mediaFolder.id), 'Expected media folders');
assert((await mediaRepository.getFolderById(site.id, mediaFolder.id))?.name === 'Brand assets', 'Expected media folder getById');
assert(await mediaRepository.deleteFolder(site.id, mediaFolder.id), 'Expected media folder delete');
assert((await mediaRepository.getById(site.id, mediaItem.id))?.folderId === null, 'Expected media folder delete to detach media assets');
assert(await mediaRepository.delete(site.id, mediaItem.id), 'Expected media delete');
assert((await mediaRepository.listVersions({ siteId: site.id, mediaId: mediaItem.id })).items.length === 0, 'Expected media delete to remove retained versions');

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
    tags: ['starter', 'featured'],
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
assert((await collectionRepository.listRecords({
  siteId: site.id,
  collectionId: collection.id,
  fieldKey: 'price',
  fieldValue: '59',
})).items.length === 1, 'Expected URL string field value filter');
assert((await collectionRepository.listRecords({
  siteId: site.id,
  collectionId: collection.id,
  fieldKey: 'tags',
  fieldValue: 'featured',
})).items.length === 1, 'Expected array field value filter');
const premiumRecord = (await collectionRepository.createRecord({
  siteId: site.id,
  collectionId: collection.id,
  slug: 'premium-pack',
  status: 'published',
  values: {
    title: 'Premium Pack',
    price: 129,
    tags: ['featured'],
  },
})).item;
const searchedRecords = await collectionRepository.listRecords({
  siteId: site.id,
  collectionId: collection.id,
  search: 'premium',
});
assert(searchedRecords.items.length === 1 && searchedRecords.items[0].id === premiumRecord.id, 'Expected collection record search');
const sortedRecords = await collectionRepository.listRecords({
  siteId: site.id,
  collectionId: collection.id,
  sortBy: 'price',
  sortDirection: 'asc',
  limit: 1,
  offset: 1,
});
assert(sortedRecords.pagination.total === 2, 'Expected collection record pagination total');
assert(sortedRecords.items.length === 1 && sortedRecords.items[0].id === premiumRecord.id, 'Expected collection record sort and offset');
const generatedRecords = [];
for (let index = 0; index < 5; index += 1) {
  generatedRecords.push((await collectionRepository.createRecord({
    siteId: site.id,
    collectionId: collection.id,
    slug: `bulk-pack-${index}`,
    status: 'published',
    values: {
      title: `Bulk Pack ${index}`,
      price: 200 + index,
    },
  })).item);
}
db.queryStats.length = 0;
const pagedLargeRecords = await collectionRepository.listRecords({
  siteId: site.id,
  collectionId: collection.id,
  limit: 3,
  offset: 2,
});
assert(pagedLargeRecords.pagination.total === 7, 'Expected DB collection record count to include rows outside the returned page');
assert(pagedLargeRecords.pagination.limit === 3 && pagedLargeRecords.pagination.offset === 2, 'Expected DB collection record limit and offset metadata');
assert(pagedLargeRecords.pagination.hasMore, 'Expected DB collection record page to report more rows');
assert(pagedLargeRecords.items.length === 3, 'Expected DB collection record query to return only the requested page');
const pagedRecordQuery = db.queryStats.findLast((entry) => (
  entry.table === 'contentCollectionRecords' && entry.projection === 'rows'
));
assert(pagedRecordQuery?.rows === 3, 'Expected DB collection record repository to apply limit/offset before materializing rows');
for (const generatedRecord of generatedRecords) {
  assert(await collectionRepository.deleteRecord(site.id, collection.id, generatedRecord.id), 'Expected generated collection record delete');
}
assert(await collectionRepository.deleteRecord(site.id, collection.id, premiumRecord.id), 'Expected extra collection record delete');
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
  spamSettings: {
    minFillMs: 1500,
    rateLimitWindowMs: 60000,
    rateLimitMax: 4,
    duplicateWindowMs: 300000,
    blockedTerms: ['blocked'],
  },
  consentSettings: {
    policyLabel: 'Repository consent policy',
    retentionDays: 30,
    deleteAfterDays: 365,
    requestEmail: 'privacy@example.com',
    exportIncludesIp: false,
  },
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
assert(form.spamSettings?.minFillMs === 1500, 'Expected form spam settings to roundtrip through repository settings');
assert(form.consentSettings?.policyLabel === 'Repository consent policy', 'Expected form consent settings to roundtrip through repository settings');
assert(db.state.formDefinitions[0].settings?.spam?.blockedTerms?.includes('blocked'), 'Expected form spam settings to persist in DB settings JSON');
assert(db.state.formDefinitions[0].settings?.consent?.requestEmail === 'privacy@example.com', 'Expected form consent settings to persist in DB settings JSON');
assert((await formRepository.list({ siteId: site.id, pageId: publishedPage.id })).items.length === 1, 'Expected form page filter');
assert((await formRepository.getById(site.id, form.id))?.title === 'Contact us', 'Expected form getById');
const updatedForm = (await formRepository.update(site.id, form.id, {
  title: 'Contact the team',
  isActive: false,
  spamSettings: {
    rateLimitMax: 8,
  },
  consentSettings: {
    retentionDays: 45,
  },
})).item;
assert(updatedForm.title === 'Contact the team' && !updatedForm.isActive, 'Expected form update');
assert(updatedForm.spamSettings?.minFillMs === 1500 && updatedForm.spamSettings?.rateLimitMax === 8, 'Expected form spam settings update to merge with existing settings');
assert(updatedForm.consentSettings?.retentionDays === 45 && updatedForm.consentSettings?.requestEmail === 'privacy@example.com', 'Expected form consent settings update to merge with existing settings');

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

const duplicateContact = (await formRepository.createContact({
  siteId: site.id,
  formId: form.id,
  pageId: publishedPage.id,
  postId: null,
  name: 'Reader Duplicate',
  email: 'reader@example.com',
  phone: '+15555550123',
  notes: 'Second lead from same person',
  sourceValues: {
    email: 'reader@example.com',
    message: 'Follow-up from duplicate lead',
    consent: true,
    segment: 'qualified',
  },
  status: 'contacted',
  sourceSubmissionId: approvedSubmission.id,
  requestId: 'req_contact_duplicate',
  sourceIpHash: 'duplicate_ip_hash',
})).item;
const unrelatedContact = (await formRepository.createContact({
  siteId: site.id,
  formId: form.id,
  pageId: publishedPage.id,
  postId: null,
  name: 'Other Reader',
  email: 'other.reader@example.com',
  phone: null,
  notes: 'Separate lead',
  sourceValues: {
    email: 'other.reader@example.com',
    consent: true,
  },
  status: 'new',
  sourceSubmissionId: null,
  requestId: 'req_contact_other',
  sourceIpHash: 'other_ip_hash',
})).item;
assert((await formRepository.listContacts({ siteId: site.id, formId: form.id, status: 'contacted' })).items.map((item) => item.id).includes(duplicateContact.id), 'Expected contact status filter');
assert((await formRepository.listContacts({ siteId: site.id, formId: form.id, search: 'duplicate' })).items.map((item) => item.id).includes(duplicateContact.id), 'Expected contact search filter');
assert((await formRepository.getContactById(site.id, form.id, unrelatedContact.id))?.email === 'other.reader@example.com', 'Expected contact getById to honor contact id');

const promotedContact = (await formRepository.updateContact(site.id, duplicateContact.id, {
  status: 'qualified',
  notes: 'Merged duplicate into primary contact',
  sourceValues: {
    ...duplicateContact.sourceValues,
    __backyMerge: {
      primaryContactId: duplicateContact.id,
      mergedDuplicateIds: [contact.id],
      mergedAt: '2030-01-02T03:04:05.000Z',
    },
    __backyPromotion: {
      userId: 'user_promoted_reader',
      email: 'reader@example.com',
      status: 'invited',
      promotedAt: '2030-01-02T03:04:05.000Z',
    },
    __backyCustomerPromotion: {
      collectionId: 'collection_customers',
      recordId: 'record_reader',
      promotedAt: '2030-01-02T03:04:05.000Z',
    },
  },
})).item;
const archivedMergedContact = (await formRepository.updateContact(site.id, contact.id, {
  status: 'archived',
  notes: 'Merged into reader@example.com primary contact',
})).item;
assert(promotedContact.id === duplicateContact.id && promotedContact.sourceValues?.__backyPromotion?.userId === 'user_promoted_reader', 'Expected promotion metadata to persist on exact contact');
assert(archivedMergedContact.id === contact.id && archivedMergedContact.status === 'archived', 'Expected duplicate merge to archive exact contact');
assert((await formRepository.getContactById(site.id, form.id, contact.id))?.notes?.includes('Merged into'), 'Expected archived duplicate notes to persist');

const retainedContact = (await formRepository.updateContact(site.id, unrelatedContact.id, {
  sourceIpHash: null,
  sourceValues: {
    ...unrelatedContact.sourceValues,
    consent: null,
    __backyConsentRetention: {
      appliedAt: '2030-01-03T04:05:06.000Z',
      retentionDays: 30,
      deleteAfterDays: 365,
    },
  },
})).item;
assert(retainedContact.id === unrelatedContact.id && retainedContact.sourceIpHash === null, 'Expected contact consent retention to clear source IP hash');
assert(retainedContact.sourceValues?.consent === null && retainedContact.sourceValues?.__backyConsentRetention?.retentionDays === 30, 'Expected contact consent retention metadata to persist');
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
const blockedIdentities = await commentRepository.blockIdentity({
  siteId: site.id,
  reason: updatedComment.blockReason,
  actor: updatedComment.blockedBy,
  requestId: updatedComment.requestId,
  email: updatedComment.authorEmail,
  ipHash: updatedComment.ipHash,
});
assert(blockedIdentities.length === 2, 'Expected durable comment blocklist entries');
assert((await commentRepository.listBlocklist({
  siteId: site.id,
  type: 'email',
  q: 'reader@example.com',
})).items.length === 1, 'Expected comment blocklist email filter');
const deletedBlocklist = await commentRepository.deleteBlocklistEntries(site.id, [
  `${site.id}:email:reader@example.com`,
  `${site.id}:ip:127.0.0.1`,
  `${site.id}:email:missing@example.com`,
]);
assert(deletedBlocklist.deleted.length === 2 && deletedBlocklist.missingIds.length === 1, 'Expected comment blocklist delete result');
const postComment = (await commentRepository.create({
  siteId: site.id,
  targetType: 'post',
  targetId: archivedPost.id,
  content: 'Post comment cleanup',
  authorName: 'Reader',
  status: 'pending',
})).item;
assert(await commentRepository.getById(site.id, postComment.id), 'Expected post comment before cleanup');

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
const contactPromotionAuditEntry = await auditLogRepository.record({
  siteId: site.id,
  teamId: site.teamId,
  actorId: 'user_admin',
  entity: 'contact',
  entityId: promotedContact.id,
  action: 'contact.promote.user',
  before: {
    status: 'contacted',
  },
  after: {
    status: promotedContact.status,
    userId: promotedContact.sourceValues.__backyPromotion.userId,
  },
  metadata: {
    requestId: 'req_contact_promotion_audit',
  },
  requestId: 'req_contact_promotion_audit',
});
assert(contactPromotionAuditEntry.entity === 'contact' && contactPromotionAuditEntry.action === 'contact.promote.user', 'Expected contact promotion audit mapping');
assert((await auditLogRepository.list({
  siteId: site.id,
  entity: 'contact',
  entityId: promotedContact.id,
  action: 'contact.promote.user',
  requestId: 'req_contact_promotion_audit',
})).items.length === 1, 'Expected contact promotion audit filters');
const contactRetentionAuditEntry = await auditLogRepository.record({
  siteId: site.id,
  teamId: site.teamId,
  actorId: 'user_admin',
  entity: 'contact',
  entityId: retainedContact.id,
  action: 'contact.consentRetention',
  after: {
    sourceIpHash: retainedContact.sourceIpHash,
    retentionDays: retainedContact.sourceValues.__backyConsentRetention.retentionDays,
  },
  metadata: {
    requestId: 'req_contact_retention_audit',
  },
  requestId: 'req_contact_retention_audit',
});
assert(contactRetentionAuditEntry.entity === 'contact' && contactRetentionAuditEntry.action === 'contact.consentRetention', 'Expected contact retention audit mapping');
assert((await auditLogRepository.list({
  siteId: site.id,
  entity: 'contact',
  entityId: retainedContact.id,
  action: 'contact.consentRetention',
  requestId: 'req_contact_retention_audit',
})).items.length === 1, 'Expected contact retention audit filters');

const cacheInvalidation = await cacheInvalidationRepository.record({
  siteId: site.id,
  scope: 'seo',
  entity: 'site',
  entityId: site.id,
  reason: 'seo-settings-updated',
  revision: 'rev_contract_seo',
  metadata: {
    requestId: 'req_cache_contract',
  },
});
assert(cacheInvalidation.id === 'cacheInvalidationEvents_1', 'Expected fake cache invalidation id');
assert(cacheInvalidation.revision === 'rev_contract_seo', 'Expected cache invalidation revision');
assert((await cacheInvalidationRepository.list({
  siteId: site.id,
  scope: 'seo',
  entity: 'site',
  entityId: site.id,
})).items.length === 1, 'Expected cache invalidation filters');
assert(await cacheInvalidationRepository.latestRevision({
  siteId: site.id,
  scope: 'seo',
}) === 'rev_contract_seo', 'Expected latest cache invalidation revision');

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
const credential = await userRepository.setPasswordCredential(activeUser.id, {
  passwordHash: 'hash_one',
  salt: 'salt_one',
});
assert(credential.userId === activeUser.id && credential.email === activeUser.email, 'Expected user credential owner metadata');
assert((await userRepository.getPasswordCredentialByEmail(activeUser.email))?.passwordHash === 'hash_one', 'Expected user credential getByEmail');
const updatedCredential = await userRepository.setPasswordCredential(activeUser.id, {
  passwordHash: 'hash_two',
  salt: 'salt_two',
});
assert(updatedCredential.passwordHash === 'hash_two' && db.state.adminUserCredentials.length === 1, 'Expected user credential update to replace existing hash');
assert(await userRepository.delete(activeUser.id), 'Expected user delete');

const settings = await settingsRepository.get();
assert(settings.deliveryMode === 'managed-hosting', 'Expected default settings delivery mode');
assert(settings.apiKeys.publicKey, 'Expected default public API key');
const updatedSettings = (await settingsRepository.update({
  deliveryMode: 'custom-frontend',
  apiKeys: {
    publicKey: 'pk_manual_contract',
    secretKeyId: 'sk_manual_contract',
  },
  storage: { provider: 's3' },
  rotatePublicKey: true,
})).item;
assert(updatedSettings.deliveryMode === 'custom-frontend', 'Expected settings delivery mode update');
assert(updatedSettings.apiKeys.publicKey !== 'pk_manual_contract', 'Expected public key rotation');
assert(updatedSettings.apiKeys.secretKeyId === 'sk_manual_contract', 'Expected secret key manual update');
assert(updatedSettings.storage?.provider === 's3', 'Expected settings storage update');

const reusableSection = (await reusableSectionRepository.create({
  siteId: site.id,
  name: 'Saved Hero',
  slug: 'saved-hero',
  description: 'Reusable hero',
  category: 'hero',
  status: 'active',
  tags: ['landing', 'hero'],
  content: {
    elements: [{ id: 'hero_root', type: 'section' }],
    canvasSize: { width: 1200, height: 640 },
  },
  sourceElementId: 'hero_root',
  createdBy: 'user_admin',
})).item;
assert(reusableSection.id === 'reusableSections_1', 'Expected fake reusable section id');
assert((await reusableSectionRepository.getBySlug(site.id, 'saved-hero'))?.id === reusableSection.id, 'Expected reusable section getBySlug');
assert((await reusableSectionRepository.list({ siteId: site.id, category: 'hero', tag: 'landing', search: 'saved' })).items.length === 1, 'Expected reusable section filters');
const reusableSectionAuditEntry = await auditLogRepository.record({
  siteId: site.id,
  teamId: site.teamId,
  actorId: 'user_admin',
  entity: 'reusableSection',
  entityId: reusableSection.id,
  action: 'reusableSection.create',
  after: {
    id: reusableSection.id,
    slug: reusableSection.slug,
  },
  metadata: {
    requestId: 'req_reusable_section_contract',
  },
  requestId: 'req_reusable_section_contract',
});
assert(reusableSectionAuditEntry.entity === 'reusableSection', 'Expected reusable section audit entity mapping');
assert((await auditLogRepository.list({
  siteId: site.id,
  entity: 'reusableSection',
  entityId: reusableSection.id,
  action: 'reusableSection.create',
  requestId: 'req_reusable_section_contract',
})).items.length === 1, 'Expected reusable section audit log filters');
const archivedReusableSection = (await reusableSectionRepository.update(site.id, reusableSection.id, {
  status: 'archived',
  tags: ['archived'],
})).item;
assert(archivedReusableSection.status === 'archived', 'Expected reusable section update');
assert(await reusableSectionRepository.delete(site.id, reusableSection.id), 'Expected reusable section delete');

const revision = await contentWorkflowRepository.createRevision({
  siteId: site.id,
  targetType: 'page',
  targetId: publishedPage.id,
  snapshot: {
    id: publishedPage.id,
    title: publishedPage.title,
    content: publishedPage.content,
  },
  note: 'Before workflow change',
  createdBy: 'user_admin',
});
assert(revision.id === 'contentRevisions_1', 'Expected fake content revision id');
assert((await contentWorkflowRepository.listRevisions({
  siteId: site.id,
  targetType: 'page',
  targetId: publishedPage.id,
})).items.length === 1, 'Expected content revision list');
assert((await contentWorkflowRepository.getRevisionById(site.id, 'page', publishedPage.id, revision.id))?.note === 'Before workflow change', 'Expected content revision getById');

const preview = await contentWorkflowRepository.createPreviewToken({
  siteId: site.id,
  targetType: 'page',
  targetId: publishedPage.id,
  ttlSeconds: 600,
  createdBy: 'user_admin',
});
assert(preview.token.startsWith('preview_'), 'Expected preview token');
assert(await contentWorkflowRepository.validatePreviewToken(site.id, 'page', publishedPage.id, preview.token), 'Expected valid preview token');
assert(await contentWorkflowRepository.deletePreviewTokensForTarget(site.id, 'page', publishedPage.id) === 1, 'Expected preview token cleanup');
assert(!(await contentWorkflowRepository.validatePreviewToken(site.id, 'page', publishedPage.id, preview.token)), 'Expected preview token invalid after cleanup');

assert(await pageRepository.delete(site.id, publishedPage.id), 'Expected page delete');
assert((await commentRepository.list({
  siteId: site.id,
  targetType: 'page',
  targetId: publishedPage.id,
  status: 'all',
})).pagination.total === 0, 'Expected page delete to clean comments');
assert(await postRepository.delete(site.id, archivedPost.id), 'Expected post delete');
assert((await commentRepository.list({
  siteId: site.id,
  targetType: 'post',
  targetId: archivedPost.id,
  status: 'all',
})).pagination.total === 0, 'Expected post delete to clean comments');
assert(await siteRepository.delete(site.id), 'Expected site delete');

let unimplementedBlocked = false;
try {
  createUnimplementedRepositoryProxy('media');
} catch {
  unimplementedBlocked = true;
}
assert(unimplementedBlocked, 'Expected unimplemented repository proxy to fail loudly');

console.log('Backy DB repository smoke passed');

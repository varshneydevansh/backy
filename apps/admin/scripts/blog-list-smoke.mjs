#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_BLOG_LIST_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_BLOG_LIST_CDP_PORT || 9388);
const SCREENSHOT_PATH = process.env.BACKY_BLOG_LIST_SCREENSHOT || path.join(os.tmpdir(), 'backy-blog-list-smoke.png');
const VISUAL_SCREENSHOT_DIR = process.env.BACKY_BLOG_LIST_VISUAL_DIR || path.join(os.tmpdir(), 'backy-blog-list-visual');
const DESKTOP_VISUAL_SCREENSHOT_PATH = path.join(VISUAL_SCREENSHOT_DIR, 'backy-blog-list-desktop.png');
const BULK_STATUS_SMOKE = process.env.BACKY_BLOG_BULK_STATUS_SMOKE === '1';
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertBlogTaxonomyEmptyStatesUseSharedComponent = () => {
  const source = fs.readFileSync(new URL('../src/routes/blog.tsx', import.meta.url), 'utf8');
  const smokeSource = fs.readFileSync(new URL(import.meta.url), 'utf8');
  const completionSpec = fs.readFileSync(new URL('../../../specs/backy-cms-completion-spec.md', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Blog list route must use the shared EmptyState component');
  assert(source.includes('title="No categories yet"'), 'Blog taxonomy manager must keep the categories empty-state title visible');
  assert(source.includes('Create category terms to power blog archive navigation'), 'Blog categories empty state must explain frontend archive/filter value');
  assert(source.includes('title="No tags yet"'), 'Blog taxonomy manager must keep the tags empty-state title visible');
  assert(source.includes('Create tags to expose lightweight topic filters'), 'Blog tags empty state must explain frontend topic/filter value');
  assert(source.includes('No saved snapshots yet'), 'Blog revision column must keep an explicit empty revision title visible');
  assert(source.includes('Save this post in the editor to capture a rollback-ready revision.'), 'Blog revision empty state must explain how snapshots are captured');
  assert(source.includes('data-testid="blog-error-state"') && source.includes('Blog workspace needs attention'), 'Blog list must expose a labelled backend error state');
  assert(source.includes('aria-label="Retry loading blog posts"') && source.includes('Retry load'), 'Blog list backend error state must expose a retry action');
  assert(source.includes('hasBlogFilters') && source.includes('Clear filters'), 'Blog list backend error state must expose filter recovery when filters are active');
  assert(source.includes('data-testid="blog-permission-state"') && source.includes('Blog permissions could not be verified'), 'Blog list must expose a labelled permission error state');
  assert(source.includes('const loadBlogPermissions = useCallback(() => {'), 'Blog list must keep permission loading in a reusable retryable callback');
  assert(source.includes('aria-label="Retry loading blog permissions"') && source.includes('Retry permissions'), 'Blog permission error state must expose a retry action');
  assert(source.includes('to="/users"') && source.includes('Review users'), 'Blog permission error state must link to user access management');
  assert(
    source.includes("const canEditBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', BLOG_PERMISSION_ROLE_DEFAULTS)") &&
      source.includes('const isBlogPreviewBusy = isPostPreviewBusy;') &&
      source.includes('const isBlogWorkflowBusy = isBulkBusy;') &&
      source.includes('const isBlogTaxonomyControlsBusy = isBulkBusy || isTaxonomyBusy;') &&
      source.includes('const isBlogRowMutationBusy = isBulkBusy || isPostMutationBusy;') &&
      source.includes('const isBlogSeoControlsBusy = isBulkBusy || isPostMutationBusy || isSeoBusy;') &&
      source.includes('const isBlogBulkActionBusy = isBulkBusy || isPostMutationBusy || isPostPreviewBusy || isSeoBusy;') &&
      source.includes('if (isBlogWorkflowBusy || isPostMutationBusy || isBlogPreviewBusy) return;') &&
      source.includes('const previewDisabledReason = !canPublishBlog') &&
      source.includes('isBlogPreviewBusy || isBlogRowMutationBusy') &&
      source.includes('disabled={Boolean(previewDisabledReason)}') &&
      source.includes('disabled={!bulkAction || selectedPosts.length === 0 || isBlogBulkActionBusy || !canRunBulkAction}') &&
      !source.includes('const isBlogWorkflowBusy = isBlogMutationBusy') &&
      !source.includes('const canEditBlog = !isPermissionMatrixPending') &&
      !source.includes('if (isPermissionMatrixPending) return;'),
    'Blog list must keep New post, filters, handoffs, taxonomy, SEO, previews, and unrelated row controls responsive with role-default permission fallback and scoped busy states.',
  );
  assert(
    source.includes('getPostScheduleSummary') &&
      source.includes('scheduled_state') &&
      source.includes('blog-post-schedule-state-') &&
      source.includes('Schedule integrity'),
    'Blog list must surface scheduled post health in the table, export, handoff, and readiness checklist',
  );
  assert(
    source.includes('filteredData: filteredPosts') &&
      source.includes('const selectedFilteredPosts = filteredPosts.filter') &&
      source.includes('const bulkSelectionStatus = selectedPosts.length === 0') &&
      source.includes('const bulkActionStatus = selectedPosts.length === 0') &&
      source.includes('const bulkActionReady = Boolean(') &&
      source.includes('role="group"') &&
      source.includes('aria-label="Bulk blog post actions"') &&
      source.includes('data-testid="blog-bulk-toolbar"') &&
      source.includes('data-testid="blog-bulk-selection-status"') &&
      source.includes('const allFilteredPostsSelected = filteredPosts.length > 0 && selectedFilteredPosts.length === filteredPosts.length') &&
      source.includes('data-testid="blog-bulk-select-visible"') &&
      source.includes('data-testid="blog-bulk-select-filtered"') &&
      source.includes('data-testid="blog-bulk-action-select"') &&
      source.includes('data-testid="blog-bulk-action-apply"') &&
      source.includes('data-testid="blog-bulk-action-status"') &&
      source.includes('data-action-state={bulkActionReady ?') &&
      source.includes('data-testid="blog-bulk-clear-selection"') &&
      source.includes('data-testid="blog-bulk-clear-non-visible"') &&
      source.includes('Select all filtered') &&
      source.includes('setPostSelection(filteredPosts, !allFilteredPostsSelected)'),
    'Blog bulk toolbar must expose live selection/action status while selecting or clearing every post matching the current search/status/taxonomy/author filters, not only the visible page',
  );
  assert(
    source.includes('const [categoryDraftSubmitted, setCategoryDraftSubmitted] = useState(false);') &&
      source.includes('const [tagDraftSubmitted, setTagDraftSubmitted] = useState(false);') &&
      source.includes('const nameInlineError = submitted && draft.name.trim().length === 0') &&
      source.includes('data-testid={`blog-${kind}-name-error`}') &&
      source.includes('aria-invalid={Boolean(nameInlineError)}') &&
      source.includes('aria-describedby={nameInlineError ? nameErrorId : undefined}') &&
      source.includes('disabled={busy}'),
    'Blog taxonomy manager must keep category/tag Save reachable and expose inline name validation',
  );
  assert(!source.includes('disabled={busy || !draft.name.trim()}'), 'Blog taxonomy Save must not hide blank-name validation behind a disabled state');
  assert(
    source.includes("const getTaxonomyActionStatus = (kind: 'category' | 'tag', name: string) => [") &&
      source.includes('data-testid={`blog-category-actions-${category.id}`}') &&
      source.includes('data-testid={`blog-category-actions-status-${category.id}`}') &&
      source.includes('data-testid={`blog-category-edit-${category.id}`}') &&
      source.includes('data-testid={`blog-category-delete-${category.id}`}') &&
      source.includes('data-testid={`blog-tag-actions-${tag.id}`}') &&
      source.includes('data-testid={`blog-tag-actions-status-${tag.id}`}') &&
      source.includes('data-testid={`blog-tag-edit-${tag.id}`}') &&
      source.includes('data-testid={`blog-tag-delete-${tag.id}`}') &&
      source.includes('data-action-state={taxonomyEditDisabledReason ?') &&
      source.includes('data-action-state={taxonomyDeleteDisabledReason ?'),
    'Blog taxonomy category/tag action groups must expose status summaries and ready/blocked metadata for edit/delete controls',
  );
  assert(
    source.includes('data-testid={`blog-post-edit-${post.id}`}') &&
      source.includes('const postActionStatusId = `blog-post-actions-status-${post.id}`;') &&
      source.includes('const postActionStatus = [') &&
      source.includes('aria-label={`Actions for ${post.title}`}') &&
      source.includes('aria-describedby={postActionStatusId}') &&
      source.includes('data-testid={`blog-post-actions-${post.id}`}') &&
      source.includes('data-action-status={postActionStatus}') &&
      source.includes('data-testid={`blog-post-actions-status-${post.id}`}') &&
      source.includes('aria-label={`Open published post ${post.title}`}') &&
      source.includes('data-testid={`blog-post-open-${post.id}`}') &&
      source.includes('aria-label={`Preview ${post.title}`}') &&
      source.includes('data-testid={`blog-post-preview-${post.id}`}') &&
      source.includes('aria-label={`Edit ${post.title}`}') &&
      source.includes('data-action-state={previewDisabledReason ? \'blocked\' : \'ready\'}') &&
      source.includes('data-disabled-reason={previewDisabledReason || undefined}') &&
      source.includes("navigate({ to: '/blog/$postId', params: { postId: post.id }, search: { siteId: activeSiteId, focus: 'canvas' } });"),
    'Blog list row actions must expose named group/status semantics and Edit must open posts directly in focused canvas mode with a stable test id',
  );
  assert(
    source.includes('const handlePostDeleteDialogKeyDown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || mutatingPostId === pendingDeletePost.id) return;") &&
      source.includes("document.addEventListener('keydown', handlePostDeleteDialogKeyDown, true)") &&
      source.includes('data-testid={`blog-post-delete-${post.id}`}') &&
      source.includes('aria-label={`Delete ${post.title}`}') &&
      source.includes('role="dialog"') &&
      source.includes('aria-modal="true"') &&
      source.includes('aria-labelledby="blog-post-delete-confirm-title"') &&
      source.includes('aria-describedby="blog-post-delete-confirm-description blog-post-delete-confirm-impact"') &&
      source.includes('id="blog-post-delete-confirm-title"') &&
      source.includes('id="blog-post-delete-confirm-description"') &&
      source.includes('id="blog-post-delete-confirm-impact"') &&
      source.includes('data-testid="blog-post-delete-cancel-button"') &&
      source.includes('data-testid="blog-post-delete-confirm-button"') &&
      source.includes('aria-label={`Cancel deleting ${pendingDeletePost.title}`}') &&
      source.includes('aria-label={`Confirm deleting ${pendingDeletePost.title}`}') &&
      smokeSource.includes('BACKY_BLOG_LIST_DELETE_DIALOG_SMOKE') &&
      smokeSource.includes('assertBlogDeleteDialogRecovery'),
    'Blog single-post delete confirmation must expose accessible dialog semantics, explicit actions, and Escape recovery.',
  );
  assert(
    source.includes('const handleTaxonomyDeleteDialogKeyDown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || isTaxonomyBusy) return;") &&
      source.includes("document.addEventListener('keydown', handleTaxonomyDeleteDialogKeyDown, true)") &&
      source.includes('role="dialog"') &&
      source.includes('aria-labelledby="blog-taxonomy-delete-confirm-title"') &&
      source.includes('aria-describedby="blog-taxonomy-delete-confirm-description blog-taxonomy-delete-confirm-impact"') &&
      source.includes('data-testid="blog-taxonomy-delete-confirm-dialog"') &&
      source.includes('id="blog-taxonomy-delete-confirm-title"') &&
      source.includes('id="blog-taxonomy-delete-confirm-description"') &&
      source.includes('id="blog-taxonomy-delete-confirm-impact"') &&
      source.includes('data-testid="blog-taxonomy-delete-cancel-button"') &&
      source.includes('aria-label={`Cancel deleting ${pendingTaxonomyDelete.name} ${pendingTaxonomyDelete.type}`}') &&
      source.includes('aria-label={`Confirm deleting ${pendingTaxonomyDelete.name} ${pendingTaxonomyDelete.type}`}') &&
      smokeSource.includes('BACKY_BLOG_LIST_TAXONOMY_DELETE_DIALOG_SMOKE') &&
      smokeSource.includes('assertBlogTaxonomyDeleteDialogRecovery'),
    'Blog taxonomy delete confirmation must expose accessible dialog semantics, explicit actions, and Escape recovery.',
  );
  assert(
    source.includes('data-testid="blog-command-create"') &&
      source.includes('data-testid="blog-command-secondary-actions"') &&
      source.includes("const blogCommandSecondaryActionStatusId = 'blog-command-secondary-action-status';") &&
      source.includes('data-testid="blog-command-secondary-action-status"') &&
      source.includes('data-action-state={blogCommandSecondaryActionState}') &&
      source.includes('data-action-status={blogCommandSecondaryActionStatus}') &&
      source.includes('data-testid="blog-command-copy-handoff"') &&
      source.includes('data-testid="blog-command-download-handoff"') &&
      source.includes('data-testid="blog-command-export-csv"') &&
      source.includes('aria-describedby={blogCommandSecondaryActionStatusId}') &&
      source.includes('data-disabled-reason={blogCommandExportDisabledReason || undefined}') &&
      source.includes('More actions') &&
      source.indexOf('data-testid="blog-command-create"') < source.indexOf('data-testid="blog-command-secondary-actions"'),
    'Blog command center must keep New post primary while grouping handoff/export actions behind a secondary disclosure with observable action metadata.',
  );
  assert(
    source.includes('const createPostLinkDisabled = !canEditBlog') &&
      source.includes("templateSource: 'backy-canvas' as const") &&
      source.includes("const createPostActionStatusId = 'blog-create-action-status';") &&
      source.includes('const createPostActionDisabledReason = createPostLinkDisabled') &&
      source.includes('const createPostActionStatus = createPostActionDisabledReason') &&
      source.includes('data-testid="blog-header-create"') &&
      source.includes('data-testid="blog-create-action-status"') &&
      source.includes('aria-disabled={createPostLinkDisabled}') &&
      source.includes('aria-describedby={createPostActionStatusId}') &&
      source.includes('data-action-state={createPostActionDisabledReason ?') &&
      source.includes('data-action-status={createPostActionStatus}') &&
      source.includes('data-disabled-reason={createPostActionDisabledReason || undefined}') &&
      source.includes('data-target-site-id={activeSiteId}') &&
      source.includes("createPostLinkDisabled && 'pointer-events-none opacity-60'") &&
      !source.includes('aria-disabled={isBlogWorkflowBusy || !canEditBlog}') &&
      smokeSource.includes('const assertBlogCommandCreateOpensWorkspace = async') &&
      smokeSource.includes("document.querySelector('[data-testid=\"blog-command-create\"]')") &&
      smokeSource.includes("path === '/blog/new'"),
    'Blog New post links must stay reachable during background list, taxonomy, preview, SEO, or bulk activity, only disable when pages.edit is unavailable, and the rendered smoke must click the primary command create link.',
  );
  assert(
    source.includes('data-testid="blog-readiness-details"') &&
      source.includes('Editorial readiness and workflow') &&
      source.includes('detail: `${editorialReadiness.readyCount}/${editorialReadiness.total} checks`') &&
      source.includes('data-testid="blog-advanced-workflows-details"') &&
      source.includes('data-disclosure="advanced-editorial-workflows"') &&
      source.includes('data-testid="blog-connected-workflows-details"') &&
      source.includes('data-testid="blog-api-contract"') &&
      source.includes('data-disclosure="blog-api-contract"') &&
      source.includes('data-testid="blog-api-details"') &&
      source.includes('API endpoints and frontend systems') &&
      source.includes('data-testid="blog-taxonomy-manager"') &&
      source.includes('data-disclosure="blog-taxonomy-manager"'),
    'Blog command center must keep secondary readiness, connected workflow, API, and taxonomy detail behind compact disclosures.',
  );
  assert(!completionSpec.includes('Missing dedicated blog content model'), 'Completion spec must not regress to stale blog-missing language');
  assert(completionSpec.includes('Blog authoring is implemented through the dedicated admin blog surfaces'), 'Completion spec must document current blog authoring implementation');
  assert(completionSpec.includes('templateType: "blogPost"'), 'Completion spec must document frontend-design blog template provenance');
};

const waitForExit = (childProcess, timeoutMs = 1500) => new Promise((resolve) => {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    resolve(true);
    return;
  }

  const timeout = setTimeout(() => {
    childProcess.off('exit', onExit);
    resolve(false);
  }, timeoutMs);

  const onExit = () => {
    clearTimeout(timeout);
    resolve(true);
  };

  childProcess.once('exit', onExit);
});

const requestApi = async (endpoint, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (endpoint.startsWith('/api/admin/') && apiAdminSessionToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiAdminSessionToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    const errorPayload = typeof payload.error === 'string'
      ? payload
      : payload.error || payload;
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(errorPayload).slice(0, 500)}`);
  }

  return payload;
};

const loginAdminApi = async () => {
  const login = (twoFactorCode) => fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });

  let response = await login();
  let payload = await response.json().catch(() => ({}));
  const smokeMfaCode = process.env.BACKY_BLOG_LIST_SMOKE_MFA_CODE
    || process.env.BACKY_ADMIN_MFA_CODE
    || process.env.BACKY_ADMIN_2FA_CODE
    || 'backy-dev-mfa';
  if (!response.ok && payload.error?.code === 'MFA_REQUIRED' && smokeMfaCode) {
    response = await login(smokeMfaCode);
    payload = await response.json().catch(() => ({}));
  }

  if (!response.ok || payload.success === false || !payload.data?.session?.token) {
    throw new Error(`Unable to create API admin session: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  apiAdminSessionToken = payload.data.session.token;
  return payload.data;
};

const createBlogCategory = async ({ name, slug }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/categories`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      description: 'Temporary smoke category for editorial list filtering.',
      color: '#0f766e',
    }),
  });
  const category = payload.data?.category || payload.category;
  assert(category?.id, `Create category did not return a category: ${JSON.stringify(payload).slice(0, 500)}`);
  return category;
};

const createBlogTag = async ({ name, slug }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/tags`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      description: 'Temporary smoke tag for editorial list filtering.',
    }),
  });
  const tag = payload.data?.tag || payload.tag;
  assert(tag?.id, `Create tag did not return a tag: ${JSON.stringify(payload).slice(0, 500)}`);
  return tag;
};

const listBlogCategories = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/categories`);
  return payload.data?.categories || payload.categories || [];
};

const listBlogTags = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/tags`);
  return payload.data?.tags || payload.tags || [];
};

const listAuthors = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/authors`);
  return payload.data?.authors || payload.authors || [];
};

const createBlogPost = async ({ title, slug, categoryId, tagId, authorId }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      slug,
      excerpt: 'Temporary blog list smoke excerpt for filters, public feeds, preview links, and bulk publishing.',
      status: 'draft',
      authorId,
      categoryIds: [categoryId],
      tagIds: [tagId],
      meta: {
        title: `${title} SEO`,
        description: 'Temporary smoke SEO description used to prove list handoff data stays connected.',
        canonical: `/blog/${slug}`,
        noIndex: true,
      },
      content: {
        elements: [
          {
            id: `smoke-heading-${slug}`,
            type: 'heading',
            x: 72,
            y: 56,
            width: 780,
            height: 96,
            content: {
              text: title,
              level: 1,
            },
          },
          {
            id: `smoke-text-${slug}`,
            type: 'text',
            x: 72,
            y: 180,
            width: 760,
            height: 140,
            content: {
              text: 'This post is created by the blog list smoke test and removed after verification.',
            },
          },
        ],
        canvasSize: {
          width: 1200,
          height: 800,
        },
      },
    }),
  });
  const post = payload.data?.post || payload.post;
  assert(post?.id, `Create post did not return a post: ${JSON.stringify(payload).slice(0, 500)}`);
  return post;
};

const recordBlogPostRevision = async ({ postId, excerpt, expectedUpdatedAt }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/${postId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      excerpt,
      revisionNote: 'Blog list revision smoke snapshot',
      expectedUpdatedAt,
    }),
  });
  const post = payload.data?.post || payload.post;
  assert(post?.id, `Revision snapshot update did not return a post: ${JSON.stringify(payload).slice(0, 500)}`);
  return post;
};

const submitBlogComment = async ({ postId, requestId }) => {
  const uniqueSuffix = String(requestId || Date.now()).replace(/[^a-z0-9-]/gi, '').slice(-24) || Date.now().toString(36);
  const uniqueOctet = Math.max(2, Math.min(254, (Number.parseInt(uniqueSuffix.slice(-6), 36) % 253) + 2));
  const payload = await requestApi(`/api/sites/${SITE_ID}/blog/${postId}/comments`, {
    method: 'POST',
    headers: {
      'x-forwarded-for': `198.51.100.${uniqueOctet}`,
    },
    body: JSON.stringify({
      authorName: `Blog List Smoke Reader ${uniqueSuffix}`,
      authorEmail: `blog-list-smoke-${uniqueSuffix}@example.com`,
      content: `Temporary comment proving the blog list row shows moderation counts. ${uniqueSuffix}`,
      requestId,
      startedAt: Date.now() - 5000,
      rateLimitBypass: true,
    }),
  });
  const comment = payload.data?.comment || payload.comment;
  assert(comment?.id, `Submit blog comment did not return a comment: ${JSON.stringify(payload).slice(0, 500)}`);
  return comment;
};

const deleteBlogPost = async (postId) => {
  if (!postId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/blog/${postId}`, { method: 'DELETE' });
};

const deleteBlogCategory = async (categoryId) => {
  if (!categoryId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/blog/categories/${categoryId}`, { method: 'DELETE' });
};

const deleteBlogTag = async (tagId) => {
  if (!tagId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/blog/tags/${tagId}`, { method: 'DELETE' });
};

const fetchPostBySlug = async (slug) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog?limit=100`);
  const posts = payload.data?.posts || payload.posts || [];
  return posts.find((post) => post.slug === slug) || null;
};

const waitForPostStatus = async (slug, status) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const post = await fetchPostBySlug(slug);
    if (post?.status === status) {
      return post;
    }
    await sleep(250);
  }

  throw new Error(`Blog post ${slug} did not reach status ${status}`);
};

const assertPublicPost = async (slug, categoryId, tagId) => {
  const bySlugPayload = await requestApi(`/api/sites/${SITE_ID}/blog?slug=${encodeURIComponent(slug)}`);
  const post = bySlugPayload.data?.post || bySlugPayload.post;
  assert(post?.slug === slug && post.status === 'published', `Public slug endpoint did not return published post ${slug}: ${JSON.stringify(bySlugPayload).slice(0, 500)}`);

  const filteredPayload = await requestApi(`/api/sites/${SITE_ID}/blog?categoryId=${encodeURIComponent(categoryId)}&tagId=${encodeURIComponent(tagId)}`);
  const posts = filteredPayload.data?.posts || filteredPayload.posts || [];
  assert(posts.some((candidate) => candidate.slug === slug), `Public taxonomy feed did not include ${slug}: ${JSON.stringify(filteredPayload).slice(0, 500)}`);

  return post;
};

const assertPublicSearchAndArchiveFeeds = async ({ slug, title, publishedAt }) => {
  const searchPayload = await requestApi(`/api/sites/${SITE_ID}/blog?q=${encodeURIComponent(title)}`);
  const searchPosts = searchPayload.data?.posts || searchPayload.posts || [];
  assert(searchPosts.some((candidate) => candidate.slug === slug), `Public search feed did not include ${slug}: ${JSON.stringify(searchPayload).slice(0, 500)}`);

  const sourceDate = publishedAt ? new Date(publishedAt) : new Date();
  const safeDate = Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate;
  const year = safeDate.getUTCFullYear();
  const month = safeDate.getUTCMonth() + 1;
  const archivePayload = await requestApi(`/api/sites/${SITE_ID}/blog?year=${year}&month=${month}`);
  const archivePosts = archivePayload.data?.posts || archivePayload.posts || [];
  assert(archivePosts.some((candidate) => candidate.slug === slug), `Public archive feed did not include ${slug}: ${JSON.stringify(archivePayload).slice(0, 500)}`);

  return { year, month };
};

const fetchJson = async (endpoint) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
  if (!response.ok) {
    throw new Error(`${endpoint} returned ${response.status}`);
  }
  return response.json();
};

const waitForCdp = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetchJson('/json/list');
      const page = pages.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
    } catch {
      await sleep(100);
    }
  }

  throw new Error(`Chrome DevTools did not start on port ${PORT}`);
};

const connectCdp = (webSocketDebuggerUrl) => {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        request.reject(new Error(JSON.stringify(message.error)));
      } else {
        request.resolve(message.result);
      }
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    opened,
    close: () => socket.close(),
    send: (method, params = {}) => {
      const messageId = id += 1;
      socket.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
      });
    },
  };
};

const authStorageScript = (sessionToken) => `
localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({
  state: {
    user: { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' },
    session: {
      token: sessionToken,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authMode: 'local-demo',
    },
  },
  version: 0,
}))});
window.__backyOpenedUrls = [];
window.open = (url) => {
  window.__backyOpenedUrls.push(String(url || ''));
  return null;
};
`;

const seedBrowserSessionCookie = async (client, sessionToken) => {
  await client.send('Network.enable');
  await client.send('Network.setCookie', {
    url: API_BASE_URL,
    name: 'backy_admin_session',
    value: sessionToken,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
};

const evaluate = async (client, expression) => {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(`Runtime evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }

  return result.result.value;
};

const captureScreenshot = async (client, screenshotPath, options = {}) => {
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    ...options,
  });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return screenshotPath;
};

const navigateToBlog = async (client, title, postId = '', options = {}) => {
  const requireSeededRevision = options.requireSeededRevision !== false;
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/blog?siteId=${encodeURIComponent(SITE_ID)}` });

  const editSelector = postId ? `[data-testid="blog-post-edit-${postId}"]` : '';
  const commentSelector = postId ? `[data-testid="blog-post-comments-${postId}"]` : '';
  const revisionSelector = postId ? `[data-testid="blog-post-revisions-${postId}"]` : '';

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="blog-command-center"]')) &&
        Boolean(document.querySelector('[data-testid="blog-taxonomy-manager"]')) &&
        Boolean(document.querySelector('#blog-bulk')) &&
        Boolean(document.querySelector('#blog-filters')) &&
        Boolean(document.querySelector('#blog-posts')) &&
        !document.body?.innerText?.includes('Loading blog posts from backend...') &&
        document.body?.innerText?.includes(${JSON.stringify(title)}) &&
        (${JSON.stringify(editSelector)} ? Boolean(document.querySelector(${JSON.stringify(editSelector)})) : true) &&
        (${JSON.stringify(commentSelector)} ? Boolean(document.querySelector(${JSON.stringify(commentSelector)})) : true) &&
        (${JSON.stringify(revisionSelector)} ? Boolean(document.querySelector(${JSON.stringify(revisionSelector)})) : true) &&
        (${JSON.stringify(revisionSelector)} && ${JSON.stringify(requireSeededRevision)} ? document.body?.innerText?.includes('Blog list revision smoke snapshot') : true) &&
        document.querySelectorAll('#blog-posts tbody tr').length > 0,
      command: Boolean(document.querySelector('[data-testid="blog-command-center"]')),
      taxonomy: Boolean(document.querySelector('[data-testid="blog-taxonomy-manager"]')),
      bulk: Boolean(document.querySelector('#blog-bulk')),
      filters: Boolean(document.querySelector('#blog-filters')),
      posts: Boolean(document.querySelector('#blog-posts')),
      loading: document.body?.innerText?.includes('Loading blog posts from backend...') || false,
      rowCount: document.querySelectorAll('#blog-posts tbody tr').length,
      editFound: ${JSON.stringify(editSelector)} ? Boolean(document.querySelector(${JSON.stringify(editSelector)})) : true,
      commentFound: ${JSON.stringify(commentSelector)} ? Boolean(document.querySelector(${JSON.stringify(commentSelector)})) : true,
      revisionFound: ${JSON.stringify(revisionSelector)} ? Boolean(document.querySelector(${JSON.stringify(revisionSelector)})) : true,
      revisionSnapshotFound: ${JSON.stringify(revisionSelector)} ? document.body?.innerText?.includes('Blog list revision smoke snapshot') : true,
      requireSeededRevision: ${JSON.stringify(requireSeededRevision)},
      titleFound: document.body?.innerText?.includes(${JSON.stringify(title)}) || false,
      body: document.body?.innerText?.slice(0, 400) || '',
    }))()`);

    if (state.ready) {
      return state;
    }

    if (attempt === 179) {
      throw new Error(`Blog list page did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertBlogListLayout = async (client, { title, categoryName, tagName, authorName, postId }) => {
  const state = await evaluate(client, `(() => {
    const bodyText = document.body?.innerText || '';
    const apiContract = document.querySelector('[data-testid="blog-api-contract"]');
    const apiDetails = document.querySelector('[data-testid="blog-api-details"]');
    const taxonomyManager = document.querySelector('[data-testid="blog-taxonomy-manager"]');
    const apiText = [bodyText, apiContract?.textContent || '', apiDetails?.textContent || ''].join('\\n');
    const taxonomyText = [bodyText, taxonomyManager?.textContent || ''].join('\\n');
    const postId = ${JSON.stringify(postId)};
    const actionGroup = document.querySelector(\`[data-testid="blog-post-actions-\${postId}"]\`);
    const actionStatus = document.querySelector(\`[data-testid="blog-post-actions-status-\${postId}"]\`);
    const commandSecondaryActions = document.querySelector('[data-testid="blog-command-secondary-actions"]');
    const commandSecondaryStatus = document.querySelector('[data-testid="blog-command-secondary-action-status"]');
    const actionAttr = (testId, attr) => document.querySelector(\`[data-testid="\${testId}"]\`)?.getAttribute(attr) || '';

    return {
      commandCenter: Boolean(document.querySelector('[data-testid="blog-command-center"]')),
      commandCreate: Boolean(document.querySelector('[data-testid="blog-command-create"]')),
      commandSecondaryCollapsed: commandSecondaryActions instanceof HTMLDetailsElement && commandSecondaryActions.open === false,
      commandSecondaryDescribedBy: commandSecondaryActions?.getAttribute('aria-describedby') || '',
      commandSecondaryStatusId: commandSecondaryStatus?.id || '',
      commandSecondaryStatusText: commandSecondaryStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      commandSecondaryStatusData: commandSecondaryActions?.getAttribute('data-action-status') || '',
      commandSecondaryState: commandSecondaryActions?.getAttribute('data-action-state') || '',
      commandCopyLabel: actionAttr('blog-command-copy-handoff', 'aria-label'),
      commandCopyDescribedBy: actionAttr('blog-command-copy-handoff', 'aria-describedby'),
      commandCopyState: actionAttr('blog-command-copy-handoff', 'data-action-state'),
      commandCopyStatus: actionAttr('blog-command-copy-handoff', 'data-action-status'),
      commandDownloadLabel: actionAttr('blog-command-download-handoff', 'aria-label'),
      commandDownloadDescribedBy: actionAttr('blog-command-download-handoff', 'aria-describedby'),
      commandDownloadState: actionAttr('blog-command-download-handoff', 'data-action-state'),
      commandDownloadStatus: actionAttr('blog-command-download-handoff', 'data-action-status'),
      commandExportLabel: actionAttr('blog-command-export-csv', 'aria-label'),
      commandExportDescribedBy: actionAttr('blog-command-export-csv', 'aria-describedby'),
      commandExportState: actionAttr('blog-command-export-csv', 'data-action-state'),
      commandExportStatus: actionAttr('blog-command-export-csv', 'data-action-status'),
      commandExportDisabledReasonReady: actionAttr('blog-command-export-csv', 'data-disabled-reason') === '',
      advancedWorkflowsCollapsed: document.querySelector('[data-testid="blog-advanced-workflows-details"]') instanceof HTMLDetailsElement &&
        document.querySelector('[data-testid="blog-advanced-workflows-details"]').open === false,
      apiContract: Boolean(apiContract) && bodyText.includes('Blog API contract'),
      apiContractCollapsed: apiContract instanceof HTMLDetailsElement && apiContract.open === false,
      apiDetailsCollapsed: apiDetails instanceof HTMLDetailsElement && apiDetails.open === false,
      publicPostsApi: apiText.includes('/api/sites/${SITE_ID}/blog'),
      searchFeed: apiText.includes('?q='),
      archiveFeed: apiText.includes('?year='),
      taxonomyManager: Boolean(taxonomyManager),
      taxonomyCollapsed: taxonomyManager instanceof HTMLDetailsElement && taxonomyManager.open === false,
      previewEndpoint: apiText.includes('/preview'),
      bulkControl: Boolean(document.querySelector('#blog-bulk select')),
      filters: Boolean(document.querySelector('#blog-filters input[placeholder="Search posts..."]')),
      bulkToolbarRole: document.querySelector('[data-testid="blog-bulk-toolbar"]')?.getAttribute('role') || '',
      bulkToolbarLabel: document.querySelector('[data-testid="blog-bulk-toolbar"]')?.getAttribute('aria-label') || '',
      bulkToolbarDescribedBy: document.querySelector('[data-testid="blog-bulk-toolbar"]')?.getAttribute('aria-describedby') || '',
      bulkSelectionStatusId: document.querySelector('[data-testid="blog-bulk-selection-status"]')?.id || '',
      bulkActionStatusId: document.querySelector('[data-testid="blog-bulk-action-status"]')?.id || '',
      bulkSelectionStatus: document.querySelector('[data-testid="blog-bulk-selection-status"]')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      bulkActionStatus: document.querySelector('[data-testid="blog-bulk-action-status"]')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      bulkSelectedCount: document.querySelector('[data-testid="blog-bulk-toolbar"]')?.getAttribute('data-selected-count') || '',
      bulkActionReady: document.querySelector('[data-testid="blog-bulk-toolbar"]')?.getAttribute('data-bulk-action-ready') || '',
      bulkApplyState: document.querySelector('[data-testid="blog-bulk-action-apply"]')?.getAttribute('data-action-state') || '',
      bulkApplyDescribedBy: document.querySelector('[data-testid="blog-bulk-action-apply"]')?.getAttribute('aria-describedby') || '',
      category: taxonomyText.includes(${JSON.stringify(categoryName)}) || false,
      tag: taxonomyText.includes(${JSON.stringify(tagName)}) || false,
      author: ${JSON.stringify(Boolean(authorName))} ? bodyText.includes(${JSON.stringify(authorName || '')}) : true,
      post: bodyText.includes(${JSON.stringify(title)}) || false,
      previewButton: Boolean(Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('title') === 'Preview post')),
      editButton: Boolean(Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('title') === 'Edit post')),
      actionGroupRole: actionGroup?.getAttribute('role') || '',
      actionGroupLabel: actionGroup?.getAttribute('aria-label') || '',
      actionGroupDescribedBy: actionGroup?.getAttribute('aria-describedby') || '',
      actionStatusId: actionStatus?.id || '',
      actionStatusText: actionStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      actionStatusData: actionGroup?.getAttribute('data-action-status') || '',
      previewLabel: actionAttr(\`blog-post-preview-\${postId}\`, 'aria-label'),
      previewDescribedBy: actionAttr(\`blog-post-preview-\${postId}\`, 'aria-describedby'),
      previewState: actionAttr(\`blog-post-preview-\${postId}\`, 'data-action-state'),
      editLabel: actionAttr(\`blog-post-edit-\${postId}\`, 'aria-label'),
      editDescribedBy: actionAttr(\`blog-post-edit-\${postId}\`, 'aria-describedby'),
      editState: actionAttr(\`blog-post-edit-\${postId}\`, 'data-action-state'),
      deleteLabel: actionAttr(\`blog-post-delete-\${postId}\`, 'aria-label'),
      deleteDescribedBy: actionAttr(\`blog-post-delete-\${postId}\`, 'aria-describedby'),
      deleteState: actionAttr(\`blog-post-delete-\${postId}\`, 'data-action-state'),
      seoToggle: Boolean(document.querySelector('[data-testid^="blog-post-seo-noindex-"]')),
      commentSummary: Boolean(document.querySelector('[data-testid^="blog-post-comments-"]')),
      revisionSummary: Boolean(document.querySelector('[data-testid^="blog-post-revisions-"]')) &&
        bodyText.includes('Blog list revision smoke snapshot'),
    };
  })()`);

  assert(Object.entries(state).every(([, value]) => Boolean(value)), `Blog list layout missing expected regions: ${JSON.stringify(state)}`);
  assert(state.commandSecondaryCollapsed, `Blog command secondary actions should start collapsed: ${JSON.stringify(state)}`);
  assert(state.commandSecondaryDescribedBy === state.commandSecondaryStatusId, `Blog secondary command actions must point at their shared status: ${JSON.stringify(state)}`);
  assert(state.commandSecondaryState === 'ready', `Blog secondary command action group should be ready for admin smoke data: ${JSON.stringify(state)}`);
  assert(state.commandSecondaryStatusData === state.commandSecondaryStatusText, `Blog secondary command status data must mirror hidden copy: ${JSON.stringify(state)}`);
  assert(
    state.commandSecondaryStatusText.includes('Copy handoff available.') &&
      state.commandSecondaryStatusText.includes('Download JSON available.') &&
      state.commandSecondaryStatusText.includes('Export CSV available for'),
    `Blog secondary command status must summarize handoff/export readiness: ${JSON.stringify(state)}`,
  );
  assert(state.commandCopyLabel === 'Copy blog handoff manifest' && state.commandCopyDescribedBy === state.commandSecondaryStatusId && state.commandCopyState === 'ready' && state.commandCopyStatus === 'Copy handoff available.', `Blog copy handoff action lacks ready metadata: ${JSON.stringify(state)}`);
  assert(state.commandDownloadLabel === 'Download blog handoff JSON' && state.commandDownloadDescribedBy === state.commandSecondaryStatusId && state.commandDownloadState === 'ready' && state.commandDownloadStatus === 'Download JSON available.', `Blog download handoff action lacks ready metadata: ${JSON.stringify(state)}`);
  assert(state.commandExportLabel === 'Export visible blog posts CSV' && state.commandExportDescribedBy === state.commandSecondaryStatusId && state.commandExportState === 'ready' && state.commandExportStatus.includes('Export CSV available for') && state.commandExportDisabledReasonReady, `Blog export CSV action lacks ready metadata: ${JSON.stringify(state)}`);
  assert(state.actionGroupRole === 'group' && state.actionGroupLabel === `Actions for ${title}`, `Blog post actions must be a named group: ${JSON.stringify(state)}`);
  assert(state.actionGroupDescribedBy === state.actionStatusId, `Blog post action group must be described by its status summary: ${JSON.stringify(state)}`);
  assert(
    state.actionStatusText.includes('Preview available.') &&
      state.actionStatusText.includes('Edit available.') &&
      state.actionStatusText.includes('Delete available.'),
    `Blog post action status should summarize available row actions: ${JSON.stringify(state)}`,
  );
  assert(state.actionStatusData === state.actionStatusText, `Blog post action status data must mirror hidden status copy: ${JSON.stringify(state)}`);
  assert(state.previewLabel === `Preview ${title}` && state.previewDescribedBy === state.actionStatusId && state.previewState === 'ready', `Blog post preview action lacks ready labelled status: ${JSON.stringify(state)}`);
  assert(state.editLabel === `Edit ${title}` && state.editDescribedBy === state.actionStatusId && state.editState === 'ready', `Blog post edit action lacks ready labelled status: ${JSON.stringify(state)}`);
  assert(state.deleteLabel === `Delete ${title}` && state.deleteDescribedBy === state.actionStatusId && state.deleteState === 'ready', `Blog post delete action lacks ready labelled status: ${JSON.stringify(state)}`);
  assert(state.bulkToolbarRole === 'group' && state.bulkToolbarLabel === 'Bulk blog post actions', `Blog bulk toolbar must be a named action group: ${JSON.stringify(state)}`);
  assert(
    state.bulkToolbarDescribedBy.includes(state.bulkSelectionStatusId) &&
      state.bulkToolbarDescribedBy.includes(state.bulkActionStatusId),
    `Blog bulk toolbar must be described by selection and action status: ${JSON.stringify(state)}`,
  );
  assert(state.bulkSelectionStatus.includes('No blog posts selected.') && state.bulkSelectedCount === '0', `Blog bulk selection status must explain the empty selection: ${JSON.stringify(state)}`);
  assert(state.bulkActionStatus === 'Select one or more blog posts to enable bulk actions.' && state.bulkActionReady === 'false' && state.bulkApplyState === 'blocked', `Blog bulk action status must explain the initial blocked action: ${JSON.stringify(state)}`);
  assert(state.bulkApplyDescribedBy === state.bulkActionStatusId, `Blog bulk apply action must point at its status: ${JSON.stringify(state)}`);
  return state;
};

const readBlogBulkStatus = async (client) => evaluate(client, `(() => {
  const toolbar = document.querySelector('[data-testid="blog-bulk-toolbar"]');
  const selectionStatus = document.querySelector('[data-testid="blog-bulk-selection-status"]');
  const actionStatus = document.querySelector('[data-testid="blog-bulk-action-status"]');
  const select = document.querySelector('[data-testid="blog-bulk-action-select"]');
  const apply = document.querySelector('[data-testid="blog-bulk-action-apply"]');
  const clearSelection = document.querySelector('[data-testid="blog-bulk-clear-selection"]');
  return {
    role: toolbar?.getAttribute('role') || '',
    label: toolbar?.getAttribute('aria-label') || '',
    describedBy: toolbar?.getAttribute('aria-describedby') || '',
    selectedCount: toolbar?.getAttribute('data-selected-count') || '',
    visibleSelectedCount: toolbar?.getAttribute('data-visible-selected-count') || '',
    hiddenSelectedCount: toolbar?.getAttribute('data-hidden-selected-count') || '',
    filteredSelectedCount: toolbar?.getAttribute('data-filtered-selected-count') || '',
    filteredTotalCount: toolbar?.getAttribute('data-filtered-total-count') || '',
    bulkAction: toolbar?.getAttribute('data-bulk-action') || '',
    bulkActionReady: toolbar?.getAttribute('data-bulk-action-ready') || '',
    selectionStatusId: selectionStatus?.id || '',
    actionStatusId: actionStatus?.id || '',
    selectionStatusText: selectionStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
    actionStatusText: actionStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
    selectLabel: select?.getAttribute('aria-label') || '',
    selectDescribedBy: select?.getAttribute('aria-describedby') || '',
    applyLabel: apply?.getAttribute('aria-label') || '',
    applyDescribedBy: apply?.getAttribute('aria-describedby') || '',
    applyState: apply?.getAttribute('data-action-state') || '',
    applyStatus: apply?.getAttribute('data-bulk-action-status') || '',
    applyReady: apply?.getAttribute('data-bulk-action-ready') || '',
    applyDisabledReason: apply?.getAttribute('data-disabled-reason') || '',
    applyDisabled: apply instanceof HTMLButtonElement ? apply.disabled : null,
    clearSelectionLabel: clearSelection?.getAttribute('aria-label') || '',
    clearSelectionVisible: Boolean(clearSelection),
  };
})()`);

const assertBlogBulkActionStatus = async (client, { title }) => {
  const initial = await readBlogBulkStatus(client);
  assert(initial.role === 'group' && initial.label === 'Bulk blog post actions', `Blog bulk toolbar lacks named group semantics: ${JSON.stringify(initial)}`);
  assert(initial.describedBy.includes(initial.selectionStatusId) && initial.describedBy.includes(initial.actionStatusId), `Blog bulk toolbar must reference both status messages: ${JSON.stringify(initial)}`);
  assert(initial.selectedCount === '0' && initial.selectionStatusText.includes('No blog posts selected.'), `Blog bulk toolbar should start with a no-selection status: ${JSON.stringify(initial)}`);
  assert(initial.actionStatusText === 'Select one or more blog posts to enable bulk actions.' && initial.applyState === 'blocked' && initial.applyDisabled === true, `Blog bulk apply should explain the blocked no-selection state: ${JSON.stringify(initial)}`);

  const selected = await evaluate(client, `(() => {
    const checkbox = Array.from(document.querySelectorAll('input[type="checkbox"]')).find((candidate) => (
      candidate.getAttribute('aria-label') === ${JSON.stringify(`Select ${title}`)}
    ));
    if (!(checkbox instanceof HTMLInputElement)) {
      return { ok: false, found: Boolean(checkbox), reason: 'missing checkbox' };
    }
    if (checkbox.disabled) {
      return { ok: false, found: true, disabled: true };
    }
    if (!checkbox.checked) {
      checkbox.click();
    }
    return { ok: checkbox.checked };
  })()`);
  assert(selected.ok, `Unable to select blog row for bulk status check: ${JSON.stringify(selected)}`);

  const afterSelection = await readBlogBulkStatus(client);
  assert(afterSelection.selectedCount === '1' && afterSelection.visibleSelectedCount === '1', `Blog bulk status must count the selected visible row: ${JSON.stringify(afterSelection)}`);
  assert(afterSelection.selectionStatusText.includes('1 blog post selected.') && afterSelection.actionStatusText === 'Choose a bulk action for 1 selected blog post.', `Blog bulk status must prompt for an action after selection: ${JSON.stringify(afterSelection)}`);

  assert(await setSelectValue(client, '[data-testid="blog-bulk-action-select"]', 'publish'), 'Unable to choose blog bulk publish action for status check');
  const afterAction = await readBlogBulkStatus(client);
  assert(afterAction.bulkAction === 'publish' && afterAction.bulkActionReady === 'true' && afterAction.applyReady === 'true', `Blog bulk toolbar must mark publish ready after selecting one post: ${JSON.stringify(afterAction)}`);
  assert(afterAction.applyState === 'ready' && afterAction.applyDisabled === false, `Blog bulk apply should be enabled and marked ready: ${JSON.stringify(afterAction)}`);
  assert(afterAction.actionStatusText === 'Ready to publish 1 post.' && afterAction.applyStatus === afterAction.actionStatusText, `Blog bulk action status must mirror ready apply state: ${JSON.stringify(afterAction)}`);
  assert(afterAction.applyLabel === 'Apply blog bulk action: Publish 1 post' && afterAction.applyDescribedBy === afterAction.actionStatusId, `Blog bulk apply action lacks a specific accessible label/status: ${JSON.stringify(afterAction)}`);
  assert(afterAction.clearSelectionVisible && afterAction.clearSelectionLabel === 'Clear selection for 1 selected blog post', `Blog bulk clear-selection action must be labelled after selection: ${JSON.stringify(afterAction)}`);

  return { initial, afterSelection, afterAction };
};

const assertBlogCommandCreateOpensWorkspace = async (client, title, postId) => {
  let clicked = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const link = document.querySelector('[data-testid="blog-command-create"]');
      const commandCenter = document.querySelector('[data-testid="blog-command-center"]');
      const status = document.querySelector('[data-testid="blog-create-action-status"]');
      if (!(link instanceof HTMLAnchorElement)) {
        return {
          clicked: false,
          found: Boolean(link),
          tag: link?.tagName || null,
          ready: Boolean(commandCenter),
          path: window.location.pathname,
          body: document.body?.innerText?.slice(0, 700) || '',
        };
      }
      const actionState = {
        statusId: status?.id || '',
        statusText: (status?.textContent || '').replace(/\\s+/g, ' ').trim(),
        describedBy: link.getAttribute('aria-describedby') || '',
        dataStatus: link.getAttribute('data-action-status') || '',
        dataState: link.getAttribute('data-action-state') || '',
        disabledReason: link.getAttribute('data-disabled-reason') || '',
        targetSiteId: link.getAttribute('data-target-site-id') || '',
        ariaDisabled: link.getAttribute('aria-disabled') || '',
      };
      if (
        !(status instanceof HTMLElement) ||
        actionState.statusId !== 'blog-create-action-status' ||
        actionState.describedBy !== actionState.statusId ||
        actionState.statusText !== actionState.dataStatus ||
        !actionState.statusText.includes('New post available') ||
        actionState.dataState !== 'ready' ||
        actionState.disabledReason !== '' ||
        actionState.targetSiteId !== ${JSON.stringify(SITE_ID)}
      ) {
        return { clicked: false, reason: 'create-action-status', actionState, href: link.href, ready: Boolean(commandCenter) };
      }
      const disabled = link.getAttribute('aria-disabled') === 'true';
      if (disabled) {
        return { clicked: false, found: true, disabled, href: link.href, ready: Boolean(commandCenter), actionState };
      }
      link.scrollIntoView({ block: 'center', inline: 'center' });
      link.click();
      return { clicked: true, href: link.href, disabled, actionState };
    })()`);

    if (clicked.clicked) {
      break;
    }

    await sleep(250);
  }
  assert(clicked?.clicked, `Blog command New post link was not clickable: ${JSON.stringify(clicked)}`);

  let state = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    state = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      ready: Boolean(document.querySelector('[data-testid="blog-create-command-center"]')),
      targetSite: document.querySelector('#blog-create-active-site')?.value || '',
      title: document.querySelector('#blog-create-title')?.value || '',
      slug: document.querySelector('#blog-create-slug')?.value || '',
      submitButton: Boolean(document.querySelector('[data-testid="blog-create-submit-button"]')),
      submitState: document.querySelector('[data-testid="blog-create-submit-button"]')?.getAttribute('data-state') || '',
      submitCanSubmit: document.querySelector('[data-testid="blog-create-submit-button"]')?.getAttribute('data-can-submit') || '',
      submitBlocker: document.querySelector('[data-testid="blog-create-submit-blocker"]')?.textContent || '',
      body: document.body?.innerText?.slice(0, 700) || '',
    }))()`);

    if (
      state.path === '/blog/new' &&
      state.search.includes(`siteId=${encodeURIComponent(SITE_ID)}`) &&
      state.search.includes('templateSource=backy-canvas') &&
      state.ready &&
      state.targetSite === SITE_ID &&
      state.submitButton &&
      state.submitState === 'blocked' &&
      state.submitCanSubmit === 'false' &&
      state.submitBlocker.includes('Save is blocked')
    ) {
      await navigateToBlog(client, title, postId);
      return { clicked, state };
    }

    if (attempt === 99) {
      throw new Error(`Blog command New post did not open a usable create workspace: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForBlogDeleteDialogClosed = async (client, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      open: Boolean(document.querySelector('[data-testid="blog-post-delete-confirm-dialog"]')),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (!state.open) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Blog delete dialog did not close after ${label}`);
};

const openBlogDeleteDialog = async (client, { postId, title }) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[data-testid="blog-post-delete-${postId}"]`)});
      if (!(button instanceof HTMLButtonElement)) {
        return {
          ok: false,
          found: Boolean(button),
          ready: Boolean(document.querySelector('[data-testid="blog-command-center"]')),
          hasPost: document.body?.innerText?.includes(${JSON.stringify(title)}) || false,
          body: document.body?.innerText?.slice(0, 700) || '',
        };
      }
      if (button.disabled) {
        return {
          ok: false,
          found: true,
          disabled: true,
          label: button.getAttribute('aria-label') || '',
          title: button.getAttribute('title') || '',
        };
      }
      button.scrollIntoView({ block: 'center', inline: 'center' });
      button.click();
      const dialog = document.querySelector('[data-testid="blog-post-delete-confirm-dialog"]');
      const titleNode = document.querySelector('#blog-post-delete-confirm-title');
      const description = document.querySelector('#blog-post-delete-confirm-description');
      const impact = document.querySelector('#blog-post-delete-confirm-impact');
      const cancelButton = document.querySelector('[data-testid="blog-post-delete-cancel-button"]');
      const confirmButton = document.querySelector('[data-testid="blog-post-delete-confirm-button"]');
      return {
        ok: Boolean(dialog),
        deleteButtonLabel: button.getAttribute('aria-label') || '',
        role: dialog?.getAttribute('role') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        describedBy: dialog?.getAttribute('aria-describedby') || '',
        title: titleNode?.textContent?.trim() || '',
        description: description?.textContent?.trim() || '',
        impact: impact?.textContent?.trim() || '',
        cancelLabel: cancelButton?.getAttribute('aria-label') || '',
        confirmLabel: confirmButton?.getAttribute('aria-label') || '',
        cancelDisabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null,
        confirmDisabled: confirmButton instanceof HTMLButtonElement ? confirmButton.disabled : null,
      };
    })()`);

    if (state.ok) {
      return state;
    }

    if (attempt === 79) {
      throw new Error(`Blog delete dialog did not open: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertBlogDeleteDialogRecovery = async (client, { postId, title, slug }) => {
  const semantics = await openBlogDeleteDialog(client, { postId, title });
  assert(semantics.deleteButtonLabel === `Delete ${title}`, `Blog delete row action lacks an accessible label: ${JSON.stringify(semantics)}`);
  assert(semantics.role === 'dialog', `Blog delete confirmation must use role=dialog: ${JSON.stringify(semantics)}`);
  assert(semantics.modal === 'true', `Blog delete confirmation must be modal: ${JSON.stringify(semantics)}`);
  assert(semantics.labelledBy === 'blog-post-delete-confirm-title', `Blog delete confirmation must link its title: ${JSON.stringify(semantics)}`);
  assert(
    semantics.describedBy === 'blog-post-delete-confirm-description blog-post-delete-confirm-impact',
    `Blog delete confirmation must describe impact and target route: ${JSON.stringify(semantics)}`,
  );
  assert(semantics.title.includes(`Delete ${title}?`), `Blog delete confirmation title did not name the post: ${JSON.stringify(semantics)}`);
  assert(semantics.description.includes('removes the post from the backend'), `Blog delete confirmation did not explain persistence impact: ${JSON.stringify(semantics)}`);
  assert(semantics.impact.includes(`/blog/${slug}`), `Blog delete confirmation did not name the route: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelLabel === `Cancel deleting ${title}`, `Blog delete cancel action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmLabel === `Confirm deleting ${title}`, `Blog delete confirm action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelDisabled === false, `Blog delete cancel action should be available before deletion starts: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmDisabled === false, `Blog delete confirm action should be available before deletion starts: ${JSON.stringify(semantics)}`);

  const escapeResult = await evaluate(client, `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return {
      stillOpen: Boolean(document.querySelector('[data-testid="blog-post-delete-confirm-dialog"]')),
      path: window.location.pathname,
    };
  })()`);
  assert(escapeResult.path === '/blog', `Blog delete Escape recovery navigated unexpectedly: ${JSON.stringify(escapeResult)}`);
  await waitForBlogDeleteDialogClosed(client, 'Escape');

  await openBlogDeleteDialog(client, { postId, title });
  const cancelResult = await evaluate(client, `(() => {
    const cancelButton = document.querySelector('[data-testid="blog-post-delete-cancel-button"]');
    if (!(cancelButton instanceof HTMLButtonElement) || cancelButton.disabled) {
      return { ok: false, found: Boolean(cancelButton), disabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null };
    }
    cancelButton.click();
    return { ok: true };
  })()`);
  assert(cancelResult.ok, `Blog delete cancel button was not clickable: ${JSON.stringify(cancelResult)}`);
  await waitForBlogDeleteDialogClosed(client, 'Cancel');

  return semantics;
};

const assertEditButtonOpensFocusedCanvas = async (client, { postId, title }) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[data-testid="blog-post-edit-${postId}"]`)});
      return {
        ready: Boolean(document.querySelector('[data-testid="blog-command-center"]')),
        hasPost: document.body?.innerText?.includes(${JSON.stringify(title)}) || false,
        path: window.location.pathname,
        editFound: Boolean(button),
        editDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (state.ready && state.hasPost && state.path === '/blog' && state.editFound && state.editDisabled === false) {
      break;
    }

    if (attempt === 119) {
      throw new Error(`Blog list did not expose editable row before focus assertion: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector(${JSON.stringify(`[data-testid="blog-post-edit-${postId}"]`)});
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, found: Boolean(button), disabled: button instanceof HTMLButtonElement ? button.disabled : null };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Blog row edit button was not ready: ${JSON.stringify(clicked)}`);

  let focused = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    focused = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      focusBanner: Boolean(document.querySelector('[data-testid="blog-editor-focus-banner"]')),
      focusDensity: document.querySelector('[data-testid="blog-editor-focus-banner"]')?.getAttribute('data-density') || '',
      commandCenter: Boolean(document.querySelector('[data-testid="blog-editor-command-center"]')),
      canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
      shellFocusMode: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-focus-mode') || '',
      componentPanelVisible: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-component-panel-visible') || '',
      inspectorPanelVisible: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-inspector-panel-visible') || '',
      componentLibrary: Boolean(document.querySelector('[data-testid="editor-component-library"]')),
      inspector: Boolean(document.querySelector('[data-testid="editor-inspector"]')),
      adminSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
      adminHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
      showPanels: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'Show panels'),
      body: document.body?.innerText?.slice(0, 700) || '',
    }))()`);

    if (
      focused.path === `/blog/${postId}` &&
      focused.search.includes('focus=canvas') &&
      focused.focusBanner &&
      focused.focusDensity === 'compact' &&
      focused.canvas &&
      focused.showPanels &&
      focused.shellFocusMode === 'true' &&
      focused.componentPanelVisible === 'false' &&
      focused.inspectorPanelVisible === 'false' &&
      !focused.componentLibrary &&
      !focused.inspector &&
      !focused.commandCenter &&
      !focused.adminSidebar &&
      !focused.adminHeader
    ) {
      break;
    }

    if (attempt === 119) {
      throw new Error(`Blog edit button did not open focused canvas editor: ${JSON.stringify(focused)}`);
    }

    await sleep(250);
  }

  await navigateToBlog(client, title, postId, { requireSeededRevision: false });
  return focused;
};

const assertBlogVisualState = async (client, label, screenshotPath, { title } = {}) => {
  await evaluate(client, `(() => {
    window.scrollTo(0, 0);
    return true;
  })()`);
  await sleep(250);

  let state = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    state = await evaluate(client, `(() => {
    const bodyText = document.body?.innerText || '';
    const commandCenter = document.querySelector('[data-testid="blog-command-center"]');
    const advancedWorkflows = document.querySelector('[data-testid="blog-advanced-workflows-details"]');
    const apiContract = document.querySelector('[data-testid="blog-api-contract"]');
    const taxonomyManager = document.querySelector('[data-testid="blog-taxonomy-manager"]');
    const postsRegion = document.querySelector('#blog-posts');
    const filtersRegion = document.querySelector('#blog-filters');
    const bulkRegion = document.querySelector('#blog-bulk');
    const apiDetails = document.querySelector('[data-testid="blog-api-details"]');
    const apiSnippetLabels = Array.from(document.querySelectorAll('#blog-api code, #blog-api [data-testid], #blog-api *'))
      .map((node) => node.textContent || '')
      .join('\\n');
    const tableRows = Array.from(document.querySelectorAll('#blog-posts tbody tr'));
    const revisionBlocks = Array.from(document.querySelectorAll('[data-testid^="blog-post-revisions-"]'));
    const commandRect = commandCenter?.getBoundingClientRect();
    const postsRect = postsRegion?.getBoundingClientRect();
    const taxonomyRect = taxonomyManager?.getBoundingClientRect();
    const taxonomySummaryRect = taxonomyManager?.querySelector('summary')?.getBoundingClientRect();
    const expectedTitle = ${JSON.stringify(title || '')};

    return {
      label: ${JSON.stringify(label)},
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      commandVisible: Boolean(commandRect && commandRect.width > 320 && commandRect.height > 120),
      advancedWorkflowsOpen: advancedWorkflows instanceof HTMLDetailsElement ? advancedWorkflows.open : null,
      filtersVisible: Boolean(filtersRegion),
      bulkVisible: Boolean(bulkRegion),
      postsVisible: Boolean(postsRect && postsRect.width > 320 && postsRect.height > 180),
      taxonomyManagerPresent: Boolean(taxonomyManager),
      taxonomySummaryVisible: Boolean(taxonomySummaryRect && taxonomySummaryRect.width > 280 && taxonomySummaryRect.height >= 40),
      taxonomyDetailsOpen: taxonomyManager instanceof HTMLDetailsElement ? taxonomyManager.open : null,
      tableRows: tableRows.length,
      hasExpectedPost: expectedTitle ? bodyText.includes(expectedTitle) : true,
      hasApiContract: bodyText.includes('Blog API contract'),
      apiContractOpen: apiContract instanceof HTMLDetailsElement ? apiContract.open : null,
      apiDetailsPresent: Boolean(apiDetails),
      apiDetailsOpen: apiDetails instanceof HTMLDetailsElement ? apiDetails.open : null,
      hasPublicPostsSnippet: apiSnippetLabels.includes('/api/sites/${SITE_ID}/blog'),
      hasSearchFeedSnippet: apiSnippetLabels.includes('Search feed') && apiSnippetLabels.includes('?q='),
      hasArchiveFeedSnippet: apiSnippetLabels.includes('Archive feed') && apiSnippetLabels.includes('?year=') && apiSnippetLabels.includes('&month='),
      hasTaxonomyControls: bodyText.includes('Taxonomy manager') || bodyText.includes('Categories') && bodyText.includes('Tags'),
      hasSeoControls: Boolean(document.querySelector('[data-testid^="blog-post-seo-noindex-"]')),
      hasCommentSummary: Boolean(document.querySelector('[data-testid^="blog-post-comments-"]')),
      hasRevisionSummary: revisionBlocks.some((node) => {
        const text = node.textContent || '';
        return !text.includes('No saved snapshots yet') && /revision/i.test(text);
      }),
      hasFrameworkOverlay: /Failed to compile|Unhandled Runtime Error|Vite Error|Internal Server Error/i.test(bodyText),
      apiSnippetLabels: apiSnippetLabels.slice(0, 1200),
      body: bodyText.slice(0, 3000),
    };
  })()`);

    if (
      state.commandVisible &&
      state.postsVisible &&
      state.tableRows >= 1 &&
      state.hasExpectedPost &&
      state.hasSeoControls &&
      state.hasCommentSummary &&
      state.hasRevisionSummary
    ) {
      break;
    }

    if (attempt < 79) {
      await sleep(250);
    }
  }

  assert(state.commandVisible, `${label} command center was not visibly rendered: ${JSON.stringify(state)}`);
  assert(state.advancedWorkflowsOpen === false, `${label} advanced workflow map should stay collapsed until requested: ${JSON.stringify(state)}`);
  assert(state.filtersVisible && state.bulkVisible, `${label} filter or bulk controls missing: ${JSON.stringify(state)}`);
  assert(state.postsVisible && state.tableRows >= 1 && state.hasExpectedPost, `${label} post table did not render the expected smoke post: ${JSON.stringify(state)}`);
  assert(
    state.taxonomyManagerPresent && state.taxonomySummaryVisible && state.taxonomyDetailsOpen === false && state.hasTaxonomyControls,
    `${label} taxonomy manager should be present but collapsed by default: ${JSON.stringify(state)}`,
  );
  assert(state.hasApiContract && state.hasPublicPostsSnippet, `${label} API contract snippets missing: ${JSON.stringify(state)}`);
  assert(
    state.apiContractOpen === false && state.apiDetailsPresent && state.apiDetailsOpen === false,
    `${label} API contract and endpoint details should stay collapsed until requested: ${JSON.stringify(state)}`,
  );
  assert(state.hasSearchFeedSnippet && state.hasArchiveFeedSnippet, `${label} search/archive feed snippets missing: ${JSON.stringify(state)}`);
  assert(state.hasSeoControls && state.hasCommentSummary, `${label} row SEO/comment controls missing: ${JSON.stringify(state)}`);
  assert(state.hasRevisionSummary, `${label} row revision summary missing: ${JSON.stringify(state)}`);
  assert(state.horizontalOverflow <= 4, `${label} has horizontal overflow: ${JSON.stringify(state)}`);
  assert(!state.hasFrameworkOverlay, `${label} rendered a framework/runtime overlay: ${JSON.stringify(state)}`);

  await captureScreenshot(client, screenshotPath);
  return { ...state, screenshotPath };
};

const setInputValue = async (client, selector, value) => evaluate(client, `(() => {
  const node = document.querySelector(${JSON.stringify(selector)});
  if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
    return false;
  }
  const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(node, ${JSON.stringify(value)});
  node.dispatchEvent(new Event('input', { bubbles: true }));
  node.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);

const setSelectValue = async (client, selector, value) => evaluate(client, `(() => {
  const node = document.querySelector(${JSON.stringify(selector)});
  if (!(node instanceof HTMLSelectElement)) {
    return false;
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setter?.call(node, ${JSON.stringify(value)});
  node.dispatchEvent(new Event('input', { bubbles: true }));
  node.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);

const assertPostVisible = async (client, title, message) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      visible: document.body?.innerText?.includes(${JSON.stringify(title)}) || false,
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (state.visible) {
      return state;
    }
    if (attempt === 39) {
      throw new Error(`${message}: ${JSON.stringify(state)}`);
    }
    await sleep(200);
  }

  return null;
};

const exerciseFilters = async (client, { title, categoryId, tagId, authorId }) => {
  assert(await setInputValue(client, '#blog-filters input[placeholder="Search posts..."]', title), 'Unable to set blog search field');
  await assertPostVisible(client, title, 'Search filter hid the smoke post');

  assert(await setSelectValue(client, '#blog-filters select:nth-of-type(1)', categoryId), 'Unable to set category filter');
  await assertPostVisible(client, title, 'Category filter hid the smoke post');

  assert(await setSelectValue(client, '#blog-filters select:nth-of-type(2)', tagId), 'Unable to set tag filter');
  await assertPostVisible(client, title, 'Tag filter hid the smoke post');

  if (authorId) {
    assert(await setSelectValue(client, '#blog-filters select:nth-of-type(3)', authorId), 'Unable to set author filter');
    await assertPostVisible(client, title, 'Author filter hid the smoke post');
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const cleared = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="blog-clear-filters"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return {
          ok: false,
          found: Boolean(button),
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          busyButtons: Array.from(document.querySelectorAll('#blog-filters button')).map((candidate) => ({
            text: (candidate.textContent || '').trim(),
            disabled: candidate instanceof HTMLButtonElement ? candidate.disabled : null,
          })),
        };
      }
      button.click();
      return { ok: true };
    })()`);
    if (cleared.ok) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Unable to clear blog filters: ${JSON.stringify(cleared)}`);
    }

    await sleep(200);
  }

  await assertPostVisible(client, title, 'Smoke post disappeared after clearing filters');
};

const waitForTaxonomy = async ({ kind, slug, exists = true }) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const items = kind === 'category' ? await listBlogCategories() : await listBlogTags();
    const item = items.find((candidate) => candidate.slug === slug);
    if (exists && item) {
      return item;
    }
    if (!exists && !item) {
      return null;
    }
    await sleep(250);
  }

  throw new Error(`Blog ${kind} ${slug} ${exists ? 'was not created' : 'was not deleted'}`);
};

const clickButtonByTestId = async (client, testId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, found: Boolean(button), disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);
    if (clicked.ok) {
      return;
    }
    if (attempt === 79) {
      throw new Error(`Unable to click ${testId}: ${JSON.stringify(clicked)}`);
    }
    await sleep(200);
  }
};

const clickButtonByLabel = async (client, label) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, found: Boolean(button), disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);
    if (clicked.ok) {
      return;
    }
    if (attempt === 79) {
      throw new Error(`Unable to click ${label}: ${JSON.stringify(clicked)}`);
    }
    await sleep(200);
  }
};

const openBlogTaxonomyManager = async (client) => {
  assert(await evaluate(client, `(() => {
    const details = document.querySelector('[data-testid="blog-taxonomy-manager"]');
    if (!(details instanceof HTMLDetailsElement)) {
      return false;
    }
    details.open = true;
    return true;
  })()`), 'Unable to open blog taxonomy manager disclosure');
  await sleep(100);
};

const readBlogTaxonomyActionStatus = async (client, { kind, id }) => evaluate(client, `(() => {
  const group = document.querySelector(${JSON.stringify(`[data-testid="blog-${kind}-actions-${id}"]`)});
  const status = document.querySelector(${JSON.stringify(`[data-testid="blog-${kind}-actions-status-${id}"]`)});
  const edit = document.querySelector(${JSON.stringify(`[data-testid="blog-${kind}-edit-${id}"]`)});
  const remove = document.querySelector(${JSON.stringify(`[data-testid="blog-${kind}-delete-${id}"]`)});
  return {
    role: group?.getAttribute('role') || '',
    label: group?.getAttribute('aria-label') || '',
    describedBy: group?.getAttribute('aria-describedby') || '',
    statusId: status?.id || '',
    statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
    statusData: group?.getAttribute('data-action-status') || '',
    editLabel: edit?.getAttribute('aria-label') || '',
    editDescribedBy: edit?.getAttribute('aria-describedby') || '',
    editState: edit?.getAttribute('data-action-state') || '',
    editDisabledReason: edit?.getAttribute('data-disabled-reason') || '',
    editDisabled: edit instanceof HTMLButtonElement ? edit.disabled : null,
    deleteLabel: remove?.getAttribute('aria-label') || '',
    deleteDescribedBy: remove?.getAttribute('aria-describedby') || '',
    deleteState: remove?.getAttribute('data-action-state') || '',
    deleteDisabledReason: remove?.getAttribute('data-disabled-reason') || '',
    deleteDisabled: remove instanceof HTMLButtonElement ? remove.disabled : null,
  };
})()`);

const assertBlogTaxonomyActionStatus = async (client, { kind, id, name }) => {
  let state = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    state = await readBlogTaxonomyActionStatus(client, { kind, id });
    if (state.role === 'group' && state.statusText.includes(name)) {
      break;
    }
    await sleep(150);
  }

  assert(state.role === 'group' && state.label === `Actions for ${kind} ${name}`, `Blog ${kind} action group must be named: ${JSON.stringify(state)}`);
  assert(state.describedBy === state.statusId, `Blog ${kind} action group must be described by its hidden status: ${JSON.stringify(state)}`);
  assert(state.statusData === state.statusText, `Blog ${kind} action status data must mirror hidden copy: ${JSON.stringify(state)}`);
  assert(
    state.statusText.includes(`Edit ${kind} ${name} available.`) &&
      state.statusText.includes(`Delete ${kind} ${name} available.`),
    `Blog ${kind} action status must summarize ready edit/delete actions: ${JSON.stringify(state)}`,
  );
  assert(
    state.editLabel === `Edit ${kind} ${name}` &&
      state.editDescribedBy === state.statusId &&
      state.editState === 'ready' &&
      state.editDisabled === false &&
      state.editDisabledReason === '',
    `Blog ${kind} edit action must expose ready status metadata: ${JSON.stringify(state)}`,
  );
  assert(
    state.deleteLabel === `Delete ${kind} ${name}` &&
      state.deleteDescribedBy === state.statusId &&
      state.deleteState === 'ready' &&
      state.deleteDisabled === false &&
      state.deleteDisabledReason === '',
    `Blog ${kind} delete action must expose ready status metadata: ${JSON.stringify(state)}`,
  );
  return state;
};

const waitForBlogTaxonomyDeleteDialogClosed = async (client, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      open: Boolean(document.querySelector('[data-testid="blog-taxonomy-delete-confirm-dialog"]')),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (!state.open) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Blog taxonomy delete dialog did not close after ${label}`);
};

const readBlogTaxonomyDeleteDialog = async (client) => evaluate(client, `(() => {
  const dialog = document.querySelector('[data-testid="blog-taxonomy-delete-confirm-dialog"]');
  const titleNode = document.querySelector('#blog-taxonomy-delete-confirm-title');
  const description = document.querySelector('#blog-taxonomy-delete-confirm-description');
  const impact = document.querySelector('#blog-taxonomy-delete-confirm-impact');
  const cancelButton = document.querySelector('[data-testid="blog-taxonomy-delete-cancel-button"]');
  const confirmButton = document.querySelector('[data-testid="blog-taxonomy-confirm-delete"]');
  return {
    ok: Boolean(dialog),
    role: dialog?.getAttribute('role') || '',
    modal: dialog?.getAttribute('aria-modal') || '',
    labelledBy: dialog?.getAttribute('aria-labelledby') || '',
    describedBy: dialog?.getAttribute('aria-describedby') || '',
    title: titleNode?.textContent?.trim() || '',
    description: description?.textContent?.trim() || '',
    impact: impact?.textContent?.trim() || '',
    cancelLabel: cancelButton?.getAttribute('aria-label') || '',
    confirmLabel: confirmButton?.getAttribute('aria-label') || '',
    cancelDisabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null,
    confirmDisabled: confirmButton instanceof HTMLButtonElement ? confirmButton.disabled : null,
  };
})()`);

const assertBlogTaxonomyDeleteDialogRecovery = async (client, { kind, name, postCount }) => {
  const actionLabel = `Delete ${kind} ${name}`;
  await clickButtonByLabel(client, actionLabel);
  const semantics = await readBlogTaxonomyDeleteDialog(client);
  assert(semantics.ok, `Blog taxonomy delete dialog did not open for ${actionLabel}: ${JSON.stringify(semantics)}`);
  assert(semantics.role === 'dialog', `Blog taxonomy delete confirmation must use role=dialog: ${JSON.stringify(semantics)}`);
  assert(semantics.modal === 'true', `Blog taxonomy delete confirmation must be modal: ${JSON.stringify(semantics)}`);
  assert(semantics.labelledBy === 'blog-taxonomy-delete-confirm-title', `Blog taxonomy delete confirmation must link its title: ${JSON.stringify(semantics)}`);
  assert(
    semantics.describedBy === 'blog-taxonomy-delete-confirm-description blog-taxonomy-delete-confirm-impact',
    `Blog taxonomy delete confirmation must describe API impact and assigned posts: ${JSON.stringify(semantics)}`,
  );
  assert(semantics.title.includes(`Delete ${name}?`), `Blog taxonomy delete confirmation title did not name the ${kind}: ${JSON.stringify(semantics)}`);
  assert(semantics.description.includes(`removes the ${kind} from the blog taxonomy API`), `Blog taxonomy delete confirmation did not explain API impact: ${JSON.stringify(semantics)}`);
  assert(semantics.impact.includes(`Assigned posts: ${postCount}`), `Blog taxonomy delete confirmation did not show assigned post count: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelLabel === `Cancel deleting ${name} ${kind}`, `Blog taxonomy delete cancel action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmLabel === `Confirm deleting ${name} ${kind}`, `Blog taxonomy delete confirm action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelDisabled === false, `Blog taxonomy delete cancel action should be available before deletion starts: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmDisabled === false, `Blog taxonomy delete confirm action should be available before deletion starts: ${JSON.stringify(semantics)}`);

  const escapeResult = await evaluate(client, `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return {
      stillOpen: Boolean(document.querySelector('[data-testid="blog-taxonomy-delete-confirm-dialog"]')),
      path: window.location.pathname,
    };
  })()`);
  assert(escapeResult.path === '/blog', `Blog taxonomy delete Escape recovery navigated unexpectedly: ${JSON.stringify(escapeResult)}`);
  await waitForBlogTaxonomyDeleteDialogClosed(client, 'Escape');

  await clickButtonByLabel(client, actionLabel);
  const cancelResult = await evaluate(client, `(() => {
    const cancelButton = document.querySelector('[data-testid="blog-taxonomy-delete-cancel-button"]');
    if (!(cancelButton instanceof HTMLButtonElement) || cancelButton.disabled) {
      return { ok: false, found: Boolean(cancelButton), disabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null };
    }
    cancelButton.click();
    return { ok: true };
  })()`);
  assert(cancelResult.ok, `Blog taxonomy delete cancel button was not clickable: ${JSON.stringify(cancelResult)}`);
  await waitForBlogTaxonomyDeleteDialogClosed(client, 'Cancel');

  return semantics;
};

const manageTaxonomyInUi = async (client, suffix) => {
  const categoryName = `Smoke UI Category ${suffix}`;
  const categorySlug = `smoke-ui-category-${suffix}`;
  const updatedCategoryName = `${categoryName} Updated`;
  const updatedCategorySlug = `${categorySlug}-updated`;
  const tagName = `Smoke UI Tag ${suffix}`;
  const tagSlug = `smoke-ui-tag-${suffix}`;
  const updatedTagName = `${tagName} Updated`;
  const updatedTagSlug = `${tagSlug}-updated`;

  await openBlogTaxonomyManager(client);

  assert(await setInputValue(client, '[data-testid="blog-category-name"]', categoryName), 'Unable to set category name');
  assert(await setInputValue(client, '[data-testid="blog-category-slug"]', categorySlug), 'Unable to set category slug');
  assert(await setInputValue(client, '[data-testid="blog-category-description"]', 'Created from the rendered taxonomy manager.'), 'Unable to set category description');
  assert(await setInputValue(client, '[data-testid="blog-category-color"]', '#7c3aed'), 'Unable to set category color');
  await clickButtonByTestId(client, 'blog-category-save');
  const createdCategory = await waitForTaxonomy({ kind: 'category', slug: categorySlug });
  assert(createdCategory.color === '#7c3aed', `Category color did not persist: ${JSON.stringify(createdCategory)}`);

  await clickButtonByLabel(client, `Edit category ${categoryName}`);
  assert(await setInputValue(client, '[data-testid="blog-category-name"]', updatedCategoryName), 'Unable to update category name');
  assert(await setInputValue(client, '[data-testid="blog-category-slug"]', updatedCategorySlug), 'Unable to update category slug');
  assert(await setInputValue(client, '[data-testid="blog-category-description"]', 'Updated from the rendered taxonomy manager.'), 'Unable to update category description');
  await clickButtonByTestId(client, 'blog-category-save');
  const updatedCategory = await waitForTaxonomy({ kind: 'category', slug: updatedCategorySlug });
  assert(updatedCategory.name === updatedCategoryName, `Category edit did not persist: ${JSON.stringify(updatedCategory)}`);
  const categoryActionStatus = await assertBlogTaxonomyActionStatus(client, {
    kind: 'category',
    id: updatedCategory.id,
    name: updatedCategoryName,
  });

  assert(await setInputValue(client, '[data-testid="blog-tag-name"]', tagName), 'Unable to set tag name');
  assert(await setInputValue(client, '[data-testid="blog-tag-slug"]', tagSlug), 'Unable to set tag slug');
  assert(await setInputValue(client, '[data-testid="blog-tag-description"]', 'Created from the rendered taxonomy manager.'), 'Unable to set tag description');
  await clickButtonByTestId(client, 'blog-tag-save');
  await waitForTaxonomy({ kind: 'tag', slug: tagSlug });

  await clickButtonByLabel(client, `Edit tag ${tagName}`);
  assert(await setInputValue(client, '[data-testid="blog-tag-name"]', updatedTagName), 'Unable to update tag name');
  assert(await setInputValue(client, '[data-testid="blog-tag-slug"]', updatedTagSlug), 'Unable to update tag slug');
  assert(await setInputValue(client, '[data-testid="blog-tag-description"]', 'Updated from the rendered taxonomy manager.'), 'Unable to update tag description');
  await clickButtonByTestId(client, 'blog-tag-save');
  const updatedTag = await waitForTaxonomy({ kind: 'tag', slug: updatedTagSlug });
  assert(updatedTag.name === updatedTagName, `Tag edit did not persist: ${JSON.stringify(updatedTag)}`);
  const tagActionStatus = await assertBlogTaxonomyActionStatus(client, {
    kind: 'tag',
    id: updatedTag.id,
    name: updatedTagName,
  });

  const categoryDeleteDialog = await assertBlogTaxonomyDeleteDialogRecovery(client, {
    kind: 'category',
    name: updatedCategoryName,
    postCount: updatedCategory.postCount || 0,
  });
  await clickButtonByLabel(client, `Delete category ${updatedCategoryName}`);
  await clickButtonByTestId(client, 'blog-taxonomy-confirm-delete');
  await waitForTaxonomy({ kind: 'category', slug: updatedCategorySlug, exists: false });

  const tagDeleteDialog = await assertBlogTaxonomyDeleteDialogRecovery(client, {
    kind: 'tag',
    name: updatedTagName,
    postCount: updatedTag.postCount || 0,
  });
  await clickButtonByLabel(client, `Delete tag ${updatedTagName}`);
  await clickButtonByTestId(client, 'blog-taxonomy-confirm-delete');
  await waitForTaxonomy({ kind: 'tag', slug: updatedTagSlug, exists: false });

  return {
    categorySlug: updatedCategorySlug,
    tagSlug: updatedTagSlug,
    categoryActionStatus,
    tagActionStatus,
    categoryDeleteDialog,
    tagDeleteDialog,
  };
};

const toggleNoIndexInUi = async (client, postId) => {
  const before = await fetchPostBySlugFromAdminId(postId);
  assert(before?.updatedAt, `Blog post ${postId} did not expose updatedAt before SEO toggle: ${JSON.stringify(before).slice(0, 500)}`);
  const nextNoIndex = before.meta?.noIndex !== true;

  const captureInstalled = await evaluate(client, `(() => {
    window.__backyBlogSeoPatchBodies = [];
    if (!window.__backyOriginalFetchForBlogSeo) {
      window.__backyOriginalFetchForBlogSeo = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(input instanceof Request ? input.url : input || '');
        const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'PATCH' && url.includes(${JSON.stringify(`/api/admin/sites/${SITE_ID}/blog/${postId}`)})) {
          let body = init?.body || '';
          if (typeof body !== 'string') {
            body = String(body || '');
          }
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          window.__backyBlogSeoPatchBodies.push({ url, method, body: parsed });
        }
        return window.__backyOriginalFetchForBlogSeo(input, init);
      };
    }
    return true;
  })()`);
  assert(captureInstalled, 'Unable to install blog SEO PATCH capture');

  await clickButtonByTestId(client, `blog-post-seo-noindex-${postId}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const post = await fetchPostBySlugFromAdminId(postId);
    const captured = await evaluate(client, `window.__backyBlogSeoPatchBodies || []`);
    const seoPatch = captured.find((entry) => entry?.body?.meta && Object.prototype.hasOwnProperty.call(entry.body.meta, 'noIndex'));
    if (post?.meta?.noIndex === nextNoIndex && seoPatch) {
      assert(
        seoPatch.body.expectedUpdatedAt === before.updatedAt,
        `Blog list row SEO toggle did not send expectedUpdatedAt guard: ${JSON.stringify(seoPatch).slice(0, 500)}`,
      );
      assert(
        seoPatch.body.meta.noIndex === nextNoIndex,
        `Blog list row SEO toggle sent unexpected noIndex value: ${JSON.stringify(seoPatch).slice(0, 500)}`,
      );
      return post;
    }
    await sleep(250);
  }

  throw new Error(`Blog post ${postId} did not persist guarded noIndex toggle from list row`);
};

const fetchPostBySlugFromAdminId = async (postId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog?limit=100`);
  const posts = payload.data?.posts || payload.posts || [];
  return posts.find((post) => post.id === postId) || null;
};

const assertRowSeoAndComments = async (client, { postId }) => {
  const expectedTargetIdParam = `targetId=${encodeURIComponent(postId)}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const seo = document.querySelector(${JSON.stringify(`[data-testid="blog-post-seo-noindex-${postId}"]`)});
      const comments = document.querySelector(${JSON.stringify(`[data-testid="blog-post-comments-${postId}"]`)});
      return {
        seoText: seo?.textContent || '',
        commentsText: comments?.textContent || '',
        commentsHref: comments instanceof HTMLAnchorElement ? comments.href : '',
      };
    })()`);
    if (
      /Index|Noindex/.test(state.seoText) &&
      /1 comments/.test(state.commentsText) &&
      state.commentsHref.includes('/comments') &&
      state.commentsHref.includes('targetType=post') &&
      state.commentsHref.includes(expectedTargetIdParam)
    ) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Blog row did not expose SEO/comment controls: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const clickPreview = async (client, title) => {
  const clicked = await evaluate(client, `(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const row = rows.find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(title)}));
    const button = Array.from((row || document).querySelectorAll('button')).find((candidate) => (
      candidate.getAttribute('title') === 'Preview post'
    ));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, hasRow: Boolean(row), disabled: button instanceof HTMLButtonElement ? button.disabled : null };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to click preview button: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const opened = await evaluate(client, `window.__backyOpenedUrls || []`);
    if (opened.some((url) => url.includes('/blog') && url.includes('previewToken='))) {
      return opened;
    }
    await sleep(250);
  }

  const state = await evaluate(client, `(() => ({
    opened: window.__backyOpenedUrls || [],
    errorText: Array.from(document.querySelectorAll('.border-amber-200, [role="alert"]')).map((node) => node.textContent?.trim()).filter(Boolean),
    previewing: Array.from(document.querySelectorAll('button')).filter((button) => button.getAttribute('title') === 'Preview post').map((button) => ({
      disabled: button.disabled,
      text: button.textContent || '',
    })),
    body: document.body?.innerText?.slice(0, 800) || '',
  }))()`);
  throw new Error(`Preview action did not open a tokenized blog preview URL: ${JSON.stringify(state)}`);
};

const bulkPublishPost = async (client, title, postId) => {
  const before = await fetchPostBySlugFromAdminId(postId);
  assert(before?.updatedAt, `Blog post ${postId} did not expose updatedAt before bulk publish: ${JSON.stringify(before).slice(0, 500)}`);

  const captureInstalled = await evaluate(client, `(() => {
    window.__backyBlogStatusRequests = [];
    window.__backyBlogStatusPostBodies = [];
    if (!window.__backyOriginalFetchForBlogStatus) {
      window.__backyOriginalFetchForBlogStatus = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(input instanceof Request ? input.url : input || '');
        const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'GET' && url.includes(${JSON.stringify(`/api/admin/sites/${SITE_ID}/blog/${postId}/readiness`)})) {
          window.__backyBlogStatusRequests.push({ url, method });
        }
        if (method === 'POST' && url.includes(${JSON.stringify(`/api/admin/sites/${SITE_ID}/blog/${postId}/publish`)})) {
          let body = init?.body || '';
          if (typeof body !== 'string') {
            body = String(body || '');
          }
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          window.__backyBlogStatusPostBodies.push({ url, method, body: parsed });
          window.__backyBlogStatusRequests.push({ url, method });
        }
        return window.__backyOriginalFetchForBlogStatus(input, init);
      };
    }
    return true;
  })()`);
  assert(captureInstalled, 'Unable to install blog status POST capture');

  const selected = await evaluate(client, `(() => {
    const input = Array.from(document.querySelectorAll('input[type="checkbox"]')).find((candidate) => (
      candidate.getAttribute('aria-label') === ${JSON.stringify(`Select ${title}`)}
    ));
    if (!(input instanceof HTMLInputElement) || input.disabled) {
      return { ok: false, found: Boolean(input), disabled: input instanceof HTMLInputElement ? input.disabled : null };
    }
    if (!input.checked) {
      input.click();
    }
    return { ok: input.checked };
  })()`);
  assert(selected.ok, `Unable to select smoke post row: ${JSON.stringify(selected)}`);

  assert(await setSelectValue(client, '#blog-bulk select', 'publish'), 'Unable to choose blog bulk publish action');

  const submitted = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('#blog-bulk button')).find((candidate) => (
      /Publish/.test(candidate.textContent || '')
    ));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(submitted.ok, `Unable to submit blog bulk publish action: ${JSON.stringify(submitted)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      notice: document.body?.innerText?.includes('published.') || false,
      body: document.body?.innerText?.slice(0, 600) || '',
    }))()`);
    const captured = await evaluate(client, `window.__backyBlogStatusPostBodies || []`);
    const capturedRequests = await evaluate(client, `window.__backyBlogStatusRequests || []`);
    const statusPost = captured.find((entry) => entry?.body && Object.prototype.hasOwnProperty.call(entry.body, 'expectedUpdatedAt'));
    if (state.notice || statusPost) {
      const readinessIndex = capturedRequests.findIndex((entry) => entry?.method === 'GET' && String(entry.url || '').includes('/readiness'));
      const publishIndex = capturedRequests.findIndex((entry) => entry?.method === 'POST' && String(entry.url || '').includes('/publish'));
      assert(
        readinessIndex !== -1,
        `Blog list bulk publish did not preflight post readiness: ${JSON.stringify(capturedRequests).slice(0, 500)}`,
      );
      assert(
        publishIndex !== -1 && readinessIndex < publishIndex,
        `Blog list bulk publish did not preflight readiness before publishing: ${JSON.stringify(capturedRequests).slice(0, 500)}`,
      );
      assert(
        statusPost?.body?.expectedUpdatedAt === before.updatedAt,
        `Blog list bulk publish did not send expectedUpdatedAt guard: ${JSON.stringify(captured).slice(0, 500)}`,
      );
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Blog bulk publish action did not settle: ${JSON.stringify(state)}`);
    }
    await sleep(200);
  }

  return null;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-blog-list-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1720,1180',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const cleanup = async ({ client, childProcess, userDataDir, postId, categoryId, tagId }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
    client.close();
  }

  if (childProcess && !(await waitForExit(childProcess))) {
    childProcess.kill('SIGTERM');
    if (!(await waitForExit(childProcess, 1000))) {
      childProcess.kill('SIGKILL');
    }
  }

  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  if (postId) {
    try {
      await deleteBlogPost(postId);
    } catch {
      // The smoke creates a temporary post and deletes it best-effort.
    }
  }

  if (categoryId) {
    try {
      await deleteBlogCategory(categoryId);
    } catch {
      // The smoke creates a temporary category and deletes it best-effort.
    }
  }

  if (tagId) {
    try {
      await deleteBlogTag(tagId);
    } catch {
      // The smoke creates a temporary tag and deletes it best-effort.
    }
  }
};

const runBlogDeleteDialogSmoke = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let postId;
  let categoryId;
  let tagId;
  const suffix = Date.now().toString(36);
  const categoryName = `Delete Dialog Editorial ${suffix}`;
  const categorySlug = `delete-dialog-editorial-${suffix}`;
  const tagName = `Delete Dialog Launch ${suffix}`;
  const tagSlug = `delete-dialog-launch-${suffix}`;
  const title = `Delete dialog blog ${suffix}`;
  const slug = `delete-dialog-blog-${suffix}`;

  try {
    const [category, tag, authors] = await Promise.all([
      createBlogCategory({ name: categoryName, slug: categorySlug }),
      createBlogTag({ name: tagName, slug: tagSlug }),
      listAuthors(),
    ]);
    categoryId = category.id;
    tagId = tag.id;
    const authorId = authors[0]?.id || 'admin';
    const post = await createBlogPost({ title, slug, categoryId, tagId, authorId });
    postId = post.id;
    await recordBlogPostRevision({
      postId,
      excerpt: 'Temporary blog delete dialog smoke revision snapshot.',
      expectedUpdatedAt: post.updatedAt,
    });
    await submitBlogComment({
      postId,
      requestId: `blog-delete-dialog-comment-${suffix}`,
    });

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 960,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });

    await navigateToBlog(client, title, postId);
    const deleteDialog = await assertBlogDeleteDialogRecovery(client, { postId, title, slug });
    const stillPresent = await fetchPostBySlug(slug);
    assert(stillPresent?.id === postId, `Blog post disappeared after Escape/cancel delete-dialog recovery: ${JSON.stringify(stillPresent)}`);

    console.log(JSON.stringify({
      ok: true,
      guard: 'blog-list-delete-dialog',
      siteId: SITE_ID,
      postId,
      slug,
      title,
      deleteDialog,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, postId, categoryId, tagId });
  }
};

const runBlogTaxonomyDeleteDialogSmoke = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let postId;
  let categoryId;
  let tagId;
  const suffix = Date.now().toString(36);
  const categoryName = `Taxonomy Delete Dialog ${suffix}`;
  const categorySlug = `taxonomy-delete-dialog-${suffix}`;
  const tagName = `Taxonomy Delete Tag ${suffix}`;
  const tagSlug = `taxonomy-delete-tag-${suffix}`;
  const title = `Taxonomy delete dialog blog ${suffix}`;
  const slug = `taxonomy-delete-dialog-blog-${suffix}`;

  try {
    const [category, tag, authors] = await Promise.all([
      createBlogCategory({ name: categoryName, slug: categorySlug }),
      createBlogTag({ name: tagName, slug: tagSlug }),
      listAuthors(),
    ]);
    categoryId = category.id;
    tagId = tag.id;
    const authorId = authors[0]?.id || 'admin';
    const post = await createBlogPost({ title, slug, categoryId, tagId, authorId });
    postId = post.id;
    await recordBlogPostRevision({
      postId,
      excerpt: 'Temporary blog taxonomy delete dialog smoke revision snapshot.',
      expectedUpdatedAt: post.updatedAt,
    });
    await submitBlogComment({
      postId,
      requestId: `blog-taxonomy-delete-dialog-comment-${suffix}`,
    });
    const categoryWithPost = await waitForTaxonomy({ kind: 'category', slug: categorySlug });
    const tagWithPost = await waitForTaxonomy({ kind: 'tag', slug: tagSlug });

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 960,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });

    await navigateToBlog(client, title, postId);
    await openBlogTaxonomyManager(client);
    const categoryDeleteDialog = await assertBlogTaxonomyDeleteDialogRecovery(client, {
      kind: 'category',
      name: categoryName,
      postCount: categoryWithPost.postCount ?? 1,
    });
    const tagDeleteDialog = await assertBlogTaxonomyDeleteDialogRecovery(client, {
      kind: 'tag',
      name: tagName,
      postCount: tagWithPost.postCount ?? 1,
    });
    const categoryStillPresent = await waitForTaxonomy({ kind: 'category', slug: categorySlug });
    const tagStillPresent = await waitForTaxonomy({ kind: 'tag', slug: tagSlug });

    console.log(JSON.stringify({
      ok: true,
      guard: 'blog-list-taxonomy-delete-dialog',
      siteId: SITE_ID,
      postId,
      slug,
      categorySlug,
      tagSlug,
      categoryStillPresent: Boolean(categoryStillPresent),
      tagStillPresent: Boolean(tagStillPresent),
      categoryDeleteDialog,
      tagDeleteDialog,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, postId, categoryId, tagId });
  }
};

const main = async () => {
  assertBlogTaxonomyEmptyStatesUseSharedComponent();
  if (process.env.BACKY_BLOG_LIST_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, guard: 'blog-list-source' }));
    return;
  }
  await loginAdminApi();
  if (process.env.BACKY_BLOG_LIST_TAXONOMY_DELETE_DIALOG_SMOKE === '1') {
    await runBlogTaxonomyDeleteDialogSmoke();
    return;
  }
  if (process.env.BACKY_BLOG_LIST_DELETE_DIALOG_SMOKE === '1') {
    await runBlogDeleteDialogSmoke();
    return;
  }
  let client;
  let childProcess;
  let userDataDir;
  let postId;
  let categoryId;
  let tagId;
  const suffix = Date.now().toString(36);
  const categoryName = `Smoke Editorial ${suffix}`;
  const categorySlug = `smoke-editorial-${suffix}`;
  const tagName = `Smoke Launch ${suffix}`;
  const tagSlug = `smoke-launch-${suffix}`;
  const title = `Smoke blog list ${suffix}`;
  const slug = `smoke-blog-list-${suffix}`;

  try {
    const [category, tag, authors] = await Promise.all([
      createBlogCategory({ name: categoryName, slug: categorySlug }),
      createBlogTag({ name: tagName, slug: tagSlug }),
      listAuthors(),
    ]);
    categoryId = category.id;
    tagId = tag.id;
    const author = authors[0] || null;
    const authorId = author?.id || 'admin';
    const post = await createBlogPost({ title, slug, categoryId, tagId, authorId });
    postId = post.id;
    await recordBlogPostRevision({
      postId,
      excerpt: 'Temporary blog list smoke excerpt with a saved revision snapshot.',
      expectedUpdatedAt: post.updatedAt,
    });
    await submitBlogComment({
      postId,
      requestId: `blog-list-row-comment-${suffix}`,
    });

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1720,
      height: 1180,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });

    await navigateToBlog(client, title, postId);
    await assertBlogListLayout(client, { title, categoryName, tagName, authorName: author?.name || null, postId });
    const bulkActionStatus = await assertBlogBulkActionStatus(client, { title });
    if (BULK_STATUS_SMOKE) {
      console.log(JSON.stringify({
        ok: true,
        mode: 'blog-bulk-status',
        siteId: SITE_ID,
        title,
        slug,
        bulkActionStatus,
      }, null, 2));
      return;
    }
    const commandCreate = await assertBlogCommandCreateOpensWorkspace(client, title, postId);
    const editFocusedCanvas = await assertEditButtonOpensFocusedCanvas(client, { postId, title });
    const visualState = await assertBlogVisualState(client, 'blog list desktop', DESKTOP_VISUAL_SCREENSHOT_PATH, { title });
    await assertRowSeoAndComments(client, { postId });
    await toggleNoIndexInUi(client, postId);
    const taxonomyUi = await manageTaxonomyInUi(client, suffix);
    await exerciseFilters(client, { title, categoryId, tagId, authorId });
    const previewUrls = await clickPreview(client, title);
    await bulkPublishPost(client, title, postId);
    const publishedPost = await waitForPostStatus(slug, 'published');
    await assertPublicPost(slug, categoryId, tagId);
    const archiveFeed = await assertPublicSearchAndArchiveFeeds({ slug, title, publishedAt: publishedPost.publishedAt });

    await captureScreenshot(client, SCREENSHOT_PATH);

    await deleteBlogPost(postId);
    postId = null;
    await deleteBlogCategory(categoryId);
    categoryId = null;
    await deleteBlogTag(tagId);
    tagId = null;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      title,
      slug,
      categorySlug,
      tagSlug,
      taxonomyUi,
      archiveFeed,
      commandCreate,
      visualState: {
        screenshotPath: visualState.screenshotPath,
        horizontalOverflow: visualState.horizontalOverflow,
        tableRows: visualState.tableRows,
      },
      editFocusedCanvas,
      previewUrl: previewUrls[previewUrls.length - 1],
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, postId, categoryId, tagId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

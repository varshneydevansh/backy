#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_BLOG_EDITOR_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_BLOG_EDITOR_CDP_PORT || 9378);
const SCREENSHOT_PATH = process.env.BACKY_BLOG_EDITOR_SCREENSHOT || path.join(os.tmpdir(), 'backy-blog-editor-smoke.png');
const FRONTEND_BLOG_TEMPLATE_ID = 'smoke-blog-editor-template';
const FRONTEND_BLOG_TEMPLATE_NAME = 'Smoke Blog Editor Template';
const ROUTE_CHECK_ERROR_SMOKE = process.env.BACKY_BLOG_EDITOR_ROUTE_CHECK_ERROR_SMOKE === '1';
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertBlogEditorFallbackIsReadOnly = () => {
  const source = fs.readFileSync(new URL('../src/routes/blog.$postId.tsx', import.meta.url), 'utf8');
  const smokeSource = fs.readFileSync(new URL(import.meta.url), 'utf8');
  const visualDiffSource = fs.readFileSync(new URL('../src/components/editor/RevisionCanvasVisualDiff.tsx', import.meta.url), 'utf8');
  const revisionMetadataSource = fs.readFileSync(new URL('../src/lib/revisionMetadata.ts', import.meta.url), 'utf8');
  const blogRevisionRouteSource = fs.readFileSync(new URL('../../public/src/app/api/admin/sites/[siteId]/blog/[postId]/revisions/route.ts', import.meta.url), 'utf8');
  const revisionBranchMetadataSource = fs.readFileSync(new URL('../../public/src/lib/contentRevisionBranchMetadata.ts', import.meta.url), 'utf8');
  assert(source.includes('isUsingLocalPostCopy'), 'Blog editor must track backend-load fallback state');
  assert(source.includes('localPostCopyDisabledMessage'), 'Blog editor must explain that local fallback copies are read-only');
  assert(source.includes('canEdit={canEditBlog && !isUsingLocalPostCopy}'), 'Blog editor canvas editing must be disabled for local fallback copies');
  assert(source.includes('editorBusy || !canEditBlog || isUsingLocalPostCopy'), 'Blog editor canvas changes must ignore local fallback copies');
  assert(
    source.includes("const canViewBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);") &&
      source.includes("const canEditBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);") &&
      !source.includes('const canEditBlog = !isPermissionMatrixPending') &&
      source.includes('const workspaceFocusDisabled = isLoadingPost || isLoading || isWorkflowBusy;') &&
      source.includes('if (isLoadingPost || isLoading || isWorkflowBusy) return;') &&
      source.includes('disabled={workspaceFocusDisabled}'),
    'Blog editor focus mode must stay available while backend permissions hydrate, using role-default access until the matrix arrives.',
  );
  assert(
    source.includes('const routeSettingsChanged = normalizedSlug !== savedRouteSlug;') &&
      source.includes('const routeSaveBlocked = Boolean(routeConflict) || (routeSettingsChanged && (isCheckingRoutes || Boolean(routeCheckError)));') &&
      source.includes('&& !routeSaveBlocked') &&
      source.includes('const routeSaveBlockedReason = routeConflict') &&
      source.includes('|| routeSaveBlockedReason') &&
      source.includes('const saveActionBusy = editorBusy || isPreviewBusy || readinessLoading;') &&
      source.includes('if (saveActionBusy) return;') &&
      source.includes('disabled={saveActionBusy || isUsingLocalPostCopy || !canSave') &&
      source.includes('Backy is still checking route availability. Wait for the route check before publishing.'),
    'Blog editor saves must not be blocked by route-check loading/errors unless the post slug changed, while publish route guardrails remain intact.',
  );
  assert(
    smokeSource.includes('BACKY_BLOG_EDITOR_ROUTE_CHECK_ERROR_SMOKE') &&
      smokeSource.includes('assertUnchangedRouteSaveWithRouteCheckError') &&
      smokeSource.includes('Smoke route check unavailable') &&
      smokeSource.includes('unchanged-route save stayed enabled'),
    'Blog editor smoke must render-test unchanged-route saves while backend route checks fail.',
  );
  assert(
    source.includes("contentClassName={isWorkspaceFocus ? 'h-full min-h-0' : 'flex flex-col gap-5'}") &&
      source.includes('data-testid="blog-editor-command-center"') &&
      source.includes('data-default-editor-order="after-canvas"') &&
      source.includes("data-default-editor-order={isWorkspaceFocus ? 'focused-canvas' : 'canvas-first'}") &&
      source.includes("!isWorkspaceFocus && 'order-1'") &&
      source.includes('id="blog-editor-canvas"') &&
      source.includes("isWorkspaceFocus ? 'h-full min-h-0' : 'order-1'") &&
      source.includes('initialCanvasFocusMode={isWorkspaceFocus}') &&
      source.includes('actions={isWorkspaceFocus ? (') &&
      source.includes('onClick={() => void generatePreview()}'),
    'Blog editor default layout must open on the canvas first, boot the inner editor in focus mode, keep Save/Preview actions on the canvas frame, and move the dense command center below it',
  );
  assert(
    source.includes("const blogEditorCommandActionStatusId = 'blog-editor-command-action-status';") &&
      source.includes("const BLOG_EDITOR_STATUS_OPTIONS: ContentStatus[] = ['draft', 'published', 'scheduled', 'archived'];") &&
      source.includes('data-testid="blog-editor-back-to-blog"') &&
      source.includes('data-action-status={blogEditorBackActionStatus}') &&
      source.includes('data-testid="blog-editor-focus-toggle"') &&
      source.includes('data-action-status={blogEditorFocusActionStatus}') &&
      source.includes('data-testid="blog-editor-command-action-status"') &&
      source.includes('data-action-status={blogEditorCommandActionStatus}') &&
      source.includes('data-testid={`blog-editor-status-${nextStatus}`}') &&
      source.includes('data-action-status={statusActionStatus}') &&
      source.includes('data-testid="blog-editor-copy-handoff"') &&
      source.includes('data-testid="blog-editor-download-handoff"') &&
      source.includes('data-testid="blog-editor-save"') &&
      source.includes('data-testid="blog-editor-preview"') &&
      source.includes('data-testid="blog-editor-refresh-readiness"') &&
      source.includes('data-testid="blog-editor-publish-panel-refresh-readiness"') &&
      source.includes('data-testid="blog-editor-copy-publish-impact"') &&
      source.includes('data-action-status={blogEditorPublishImpactActionStatus}') &&
      source.includes('data-testid="blog-editor-publish"') &&
      source.includes('data-action-status={blogEditorPublishActionStatus}') &&
      source.includes('data-testid="blog-editor-archive"') &&
      source.includes('data-action-status={blogEditorArchiveActionStatus}') &&
      source.includes('data-testid="blog-editor-publish-panel-save"') &&
      source.includes('data-testid="blog-editor-publish-panel-preview"') &&
      source.includes('data-testid="blog-editor-discard"') &&
      source.includes('data-action-status={blogEditorDiscardActionStatus}') &&
      source.includes('data-testid="blog-editor-delete"') &&
      source.includes('data-action-status={blogEditorDeleteActionStatus}') &&
      source.includes('data-testid="blog-editor-delete-confirm"') &&
      source.includes('data-testid="blog-editor-cancel-delete"') &&
      source.includes('data-testid="blog-editor-confirm-delete"') &&
      source.includes('data-testid="blog-editor-copy-api-url"') &&
      source.includes('data-testid="blog-editor-control-map-copy-handoff"') &&
      source.includes('data-testid="blog-editor-select-featured-image"') &&
      source.includes('data-action-status={blogEditorMediaSelectActionStatus}') &&
      source.includes('data-testid="blog-editor-clear-featured-image"') &&
      source.includes('data-action-status={blogEditorMediaClearActionStatus}') &&
      source.includes('data-testid="blog-editor-refresh-comments"') &&
      source.includes('data-action-status={blogEditorCommentsRefreshActionStatus}') &&
      source.includes('data-testid="blog-editor-approve-pending-comments"') &&
      source.includes('data-action-status={blogEditorCommentsApprovePendingActionStatus}') &&
      source.includes('data-testid="blog-editor-reject-pending-comments"') &&
      source.includes('data-action-status={blogEditorCommentsRejectPendingActionStatus}') &&
      source.includes('data-testid={`blog-editor-approve-comment-${comment.id}`}') &&
      source.includes('data-testid={`blog-editor-reject-comment-${comment.id}`}') &&
      source.includes('data-testid="blog-editor-open-comments-queue"') &&
      source.includes('data-action-status={blogEditorCommentsOpenQueueActionStatus}') &&
      source.includes('data-testid="blog-editor-copy-comments-api"') &&
      source.includes('data-action-status={blogEditorCommentsApiActionStatus}') &&
      source.includes('data-testid="blog-editor-copy-public-url"') &&
      source.includes('data-testid="blog-editor-handoff-panel-copy-handoff"') &&
      source.includes('data-action-status={blogEditorRevisionGraphCopyActionStatus}') &&
      source.includes('data-action-status={blogEditorRevisionGraphToggleActionStatus}') &&
      source.includes('data-testid={`blog-editor-restore-revision-${revision.id}`}') &&
      source.includes('data-action-status={blogEditorRestoreActionStatus}') &&
      source.includes('data-action-status={blogEditorRestoreCancelActionStatus}') &&
      source.includes('data-testid="blog-editor-author-select"') &&
      source.includes('data-action-status={blogEditorAuthorActionStatus}') &&
      source.includes('data-testid={`blog-editor-taxonomy-${kind}-${item.id}`}') &&
      source.includes('data-action-status={actionStatus}') &&
      source.includes('data-testid="blog-editor-canvas-save"') &&
      source.includes('data-testid="blog-editor-canvas-preview"') &&
      source.includes('data-testid="blog-editor-focus-banner-show-panels"'),
    'Blog editor route controls must expose action-state/status metadata for navigation, focus, handoff, save, preview, readiness, publish, archive, discard, delete, media, comments, revisions, taxonomy, author, and status actions.',
  );
  assert(source.includes('setLoadError(null);') && source.includes('Latest backend post loaded into the editor.'), 'Blog editor reload must clear fallback state after loading backend content');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Blog editor must use the shared EmptyState component for sidebar empty states');
  assert(source.includes('Public comments for this post will appear here for quick review'), 'Blog editor comments empty state must explain how post comments populate');
  assert(source.includes('create a restorable revision snapshot'), 'Blog editor revision empty state must explain how revisions populate');
  assert(source.includes('blogRevisionDiff') && source.includes('data-testid={`blog-editor-revision-diff-${revision.id}`}') && source.includes('compareToCurrent: revisionDiffById.get(revision.id)'), 'Blog editor revisions must expose current-vs-snapshot diff summaries in the UI and handoff manifest');
  assert(source.includes("schema: 'backy.blog-revision-compare.v1'") && source.includes('copyBlogRevisionCompare') && source.includes('data-testid={`blog-editor-copy-revision-compare-${revision.id}`}'), 'Blog editor revisions must expose copyable revision comparison briefs');
  assert(source.includes('details: BlogRevisionDiffDetail[]') && source.includes('data-testid={`blog-editor-revision-diff-details-${revision.id}`}') && source.includes('Snapshot </span>'), 'Blog editor revision cards must show field-level diff details, not only summary text');
  assert(source.includes('compareCanvasRevisionElements') && source.includes('elementDiff: CanvasRevisionElementDiff') && source.includes('data-testid={`blog-editor-revision-element-diff-${revision.id}`}'), 'Blog editor revision cards must show canvas element/property diffs');
  assert(source.includes('<details className="pl-2"') && source.includes('change.properties.map((property)') && source.includes('changed propert{change.propertyChangeCount === 1'), 'Blog editor revision cards must drill into changed element properties');
  assert(source.includes('RevisionCanvasVisualDiff') && source.includes('testId={`blog-editor-revision-visual-diff-${revision.id}`}') && source.includes('currentElements={canvasElements}'), 'Blog editor revision cards must show side-by-side visual canvas diffs');
  assert(visualDiffSource.includes('Visual diff focus') && visualDiffSource.includes('changeIndexById') && visualDiffSource.includes('data-testid={`${testId}-focus`}'), 'Shared revision visual diff must show numbered changed-element focus markers');
  assert(source.includes('renderedPixelDiff: RevisionCanvasPixelComparison') && source.includes('getRevisionCanvasPixelComparison') && source.includes('pixelComparison={revisionDiff.renderedPixelDiff}'), 'Blog editor revision diffs must include rendered pixel comparison metadata in cards and handoff manifests');
  assert(visualDiffSource.includes('Rendered pixel comparison') && visualDiffSource.includes('data-testid={`${testId}-pixel-comparison`}') && visualDiffSource.includes('data-changed-pixels') && visualDiffSource.includes('changedPixelRatio'), 'Shared revision visual diff must expose sampled rendered-pixel comparison metrics');
  assert(source.includes("schema: 'backy.blog-revision-graph.v1'") && source.includes('blogRevisionTimeline') && source.includes('data-testid="blog-editor-revision-graph"') && source.includes('data-testid="blog-editor-toggle-revision-graph"'), 'Blog editor revisions must expose graph timeline navigation and handoff metadata');
  assert(
    source.includes("schema: 'backy.blog-revision-branch-graph.v1'") &&
      source.includes('buildBlogRevisionBranchGraph') &&
      source.includes('rollbackNotePattern') &&
      source.includes('branchGraph: blogRevisionBranchGraph') &&
      source.includes('data-testid="blog-editor-revision-branch-graph"') &&
      source.includes('data-testid="blog-editor-copy-revision-branch-graph"') &&
      source.includes('data-testid="blog-editor-revision-branch-edges"') &&
      source.includes('branchRole') &&
      source.includes('revision.branchMetadata?.schemaVersion === \'backy.content-revision-branch-metadata.v1\'') &&
      source.includes('revision-api-branch-metadata') &&
      source.includes('explicit-api-metadata') &&
      source.includes('parentRevisionId: revision.parentRevisionId') &&
      source.includes('operation: revision.operation') &&
      source.includes('restoreTargetRevisionId: revision.restoreTargetRevisionId') &&
      source.includes('branchMetadata,') &&
      blogRevisionRouteSource.includes('withContentRevisionBranchMetadata(result.items, \'admin-blog-revisions-api\')') &&
      blogRevisionRouteSource.includes('withContentRevisionBranchMetadata(payload.revisions, \'admin-blog-revisions-api\')') &&
      revisionBranchMetadataSource.includes('backy.content-revision-branch-metadata.v1') &&
      revisionBranchMetadataSource.includes('CONTENT_REVISION_RESTORE_TARGET_PATTERN') &&
      revisionBranchMetadataSource.includes('persisted-revision-lineage') &&
      revisionBranchMetadataSource.includes('parentRevisionId') &&
      revisionBranchMetadataSource.includes('restoreTargetRevisionId') &&
      revisionBranchMetadataSource.includes('persistedFields'),
    'Blog editor revisions must consume persisted backend branch metadata, expose rollback edges, copyable branch graph handoff, and per-node branch roles',
  );
  assert(source.includes('summary: getContentRevisionGraphNodeLabel(revision') && source.includes('data-testid="blog-editor-revision-graph-summary"') && source.includes('data-action={node.action}') && source.includes('snapshotUpdatedLabel') && revisionMetadataSource.includes('getContentRevisionGraphNodeLabel'), 'Blog editor revision graph nodes must expose action/actor/status metadata');
  assert(source.includes('pendingRestoreRevisionDiff') && source.includes('data-testid="blog-editor-restore-impact"') && source.includes('data-testid="blog-editor-confirm-restore"') && source.includes('Current </span>'), 'Blog editor restore confirmation must preview restore impact before rollback');
  assert(source.includes('data-testid={`blog-editor-revision-metadata-${revision.id}`}') && source.includes('createdBy: revision.createdBy') && source.includes('action: getContentRevisionActionLabel(revision)') && revisionMetadataSource.includes('operation') && revisionMetadataSource.includes('getContentRevisionActorLabel') && revisionMetadataSource.includes('getContentRevisionActionLabel'), 'Blog editor revisions must expose persisted operation plus actor/action metadata in cards and handoff summaries');
  assert(
    source.includes('getScheduledBlogEditorDateError') &&
      source.includes('Date.parse(scheduledAt)') &&
      source.includes('scheduledAtMs <= Date.now()') &&
      source.includes('Choose a future publish date before scheduling changes.'),
    'Blog editor must block scheduled posts with non-future publish dates before save',
  );
  assert(
    source.includes('customCSS: savedCustomCSS') &&
      source.includes('customJS: savedCustomJS') &&
      source.includes('themeTokenRefs: savedThemeTokenRefs') &&
      source.includes('assets: savedDesignAssets') &&
      source.includes('interactions: savedDesignInteractions') &&
      source.includes('dataBindings: savedDesignDataBindings') &&
      source.includes('editableMap: savedEditableMap') &&
      source.includes('metadata: savedDesignMetadata') &&
      source.includes('const content = serializeCanvasContent(canvasElements, canvasSize, savedCustomCSS,'),
    'Blog editor save must preserve the stored custom frontend design envelope while updating editable article elements',
  );
  assert(
    source.includes('canvasElementsToBackyContentDocument') &&
      source.includes("schemaVersion: 'backy.custom-frontend-design-envelope.v1'") &&
      source.includes('source: savedContentDocument ?') &&
      source.includes('contentDocumentSummary: {') &&
      source.includes('contentDocument: currentDesignDocument') &&
      source.includes('elements: canvasElements') &&
      source.includes('canvasSize') &&
      source.includes('customCSS: savedCustomCSS ||') &&
      source.includes('customJS: savedCustomJS ||') &&
      source.includes('themeTokenRefCount: recordKeyCount(currentDesignDocument.themeTokenRefs)') &&
      source.includes('assetCount: arrayCount(currentDesignDocument.assets?.media) + arrayCount(currentDesignDocument.assets?.fonts)') &&
      source.includes('animationTimelineCount: arrayCount(currentDesignDocument.metadata?.animations)') &&
      source.includes('dataBindingDatasetCount: arrayCount(currentDesignDocument.dataBindings?.datasets)') &&
      source.includes('editableFieldCount: recordKeyCount(currentDesignDocument.editableMap)') &&
      source.includes('editorComposition: currentDesignDocument.metadata?.editorComposition || null'),
    'Blog editor handoff manifest must expose the stored custom frontend design envelope and editor composition metadata for custom frontends',
  );
  assert(
    source.includes("schemaVersion: 'backy.blog-publish-impact.v1'") &&
      source.includes('const blogPublishImpact = {') &&
      source.includes('publishImpact: blogPublishImpact') &&
      source.includes('data-testid="blog-editor-publish-impact"') &&
      source.includes('data-testid="blog-editor-copy-publish-impact"') &&
      source.includes('data-testid="blog-editor-publish-impact-taxonomy"') &&
      source.includes('featuredImageReady: Boolean(selectedFeaturedImage)') &&
      source.includes('moderationMode: siteCommentPolicy?.moderationMode || \'manual\'') &&
      source.includes('includesCanvasContent: false') &&
      source.includes('includesPrivateComments: false'),
    'Blog editor publish panel must expose a copyable taxonomy, media, comment, readiness, and action-impact handoff before status changes',
  );
  assert(
    source.includes('const loadBlogEditorPermissions = useCallback(() => {') &&
      source.includes('data-testid="blog-editor-permission-state"') &&
      source.includes('Blog editor permissions could not be verified') &&
      source.includes('aria-label="Retry loading blog editor permissions"') &&
      source.includes('Retry permissions') &&
      source.includes('to="/users"') &&
      source.includes('Review users'),
    'Blog editor permission alert must expose retryable permission recovery and user-access handoff',
  );
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
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(endpoint.startsWith('/api/admin/') && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 400)}`);
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
  const smokeMfaCode = process.env.BACKY_BLOG_EDITOR_SMOKE_MFA_CODE
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
      return await fetchJson('/json/list');
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
  const events = [];

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
      return;
    }

    events.push(message);
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    events,
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
`;

const routeCheckFailureScript = () => `
(() => {
  if (window.__backyBlogEditorRouteCheckFailureInstalled) return;
  window.__backyBlogEditorRouteCheckFailureInstalled = true;
  window.__backyBlogEditorRouteCheckFailures = 0;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const rawUrl = String(input instanceof Request ? input.url : input || '');
    const requestUrl = new URL(rawUrl, window.location.origin);
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method === 'GET' && requestUrl.pathname === ${JSON.stringify(`/api/admin/sites/${SITE_ID}/blog`)}) {
      window.__backyBlogEditorRouteCheckFailures += 1;
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Smoke route check unavailable',
        },
      }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };
})();
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

const createBlogPost = async (slug) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Smoke Blog Editor',
      slug,
      excerpt: 'Temporary blog editor smoke excerpt for editor layout, focus mode, handoff, and publishing controls.',
      status: 'draft',
      authorId: 'admin',
      categoryIds: [],
      tagIds: [],
      meta: {
        title: 'Smoke Blog Editor SEO',
        description: 'Temporary SEO description long enough to validate the blog editor readiness and frontend handoff contract.',
        canonical: `/blog/${slug}`,
        noIndex: true,
        frontendDesignTemplateId: FRONTEND_BLOG_TEMPLATE_ID,
        frontendDesignTemplateName: FRONTEND_BLOG_TEMPLATE_NAME,
        frontendDesignRoutePattern: '/blog/smoke-editor-template',
        frontendDesignSource: {
          type: 'custom-frontend',
          label: 'Smoke blog editor frontend',
        },
        frontendDesignChrome: {
          header: { component: 'SmokeHeader' },
          footer: { component: 'SmokeFooter' },
        },
        frontendDesignTokens: {
          colors: { primary: '#0f766e' },
          fonts: { heading: 'Inter', body: 'Inter' },
        },
        frontendDesignBindingHints: [
          { role: 'post.title', binding: 'post.title' },
          { role: 'post.content', binding: 'post.content' },
        ],
      },
      content: {
        elements: [
          {
            id: `frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}`,
            type: 'section',
            x: 0,
            y: 0,
            width: 1200,
            height: 760,
            props: {
              frontendTemplateId: FRONTEND_BLOG_TEMPLATE_ID,
              frontendTemplateName: FRONTEND_BLOG_TEMPLATE_NAME,
              routePattern: '/blog/smoke-editor-template',
              backgroundColor: '#ffffff',
              borderRadius: 0,
            },
            dataBindings: [{ source: 'blog', mode: 'current', fields: ['title', 'excerpt', 'content'] }],
            children: [
              {
                id: `frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}-title`,
                type: 'heading',
                x: 72,
                y: 72,
                width: 820,
                height: 96,
                props: {
                  content: 'Smoke Blog Editor',
                  level: 'h1',
                  fontSize: 52,
                  binding: 'post.title',
                },
              },
              {
                id: `frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}-body`,
                type: 'paragraph',
                x: 72,
                y: 192,
                width: 780,
                height: 140,
                props: {
                  content: 'This template-backed post verifies the editable blog canvas and focus workspace.',
                  fontSize: 18,
                  binding: 'post.content',
                },
              },
            ],
          },
        ],
        canvasSize: {
          width: 1200,
          height: 800,
        },
        customCSS: '.smoke-blog-editor-template { color: var(--backy-smoke-blog-editor-primary); }',
        customJS: 'window.__backySmokeBlogEditorTemplate = true;',
        themeTokenRefs: {
          primary: 'tokens.colors.primary',
          bodyFont: 'tokens.fonts.body',
        },
        assets: {
          media: [
            {
              id: 'media-smoke-blog-editor-cover',
              type: 'image',
              role: 'cover',
            },
          ],
        },
        interactions: {
          timeline: [
            {
              target: `frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}-title`,
              animation: 'fade-up',
            },
          ],
        },
        dataBindings: {
          datasets: [
            {
              id: 'dataset_smoke_blog_editor_post',
              source: 'blog',
            },
          ],
        },
        editableMap: {
          'post.hero.title': {
            elementId: `frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}-title`,
            field: 'props.content',
            editable: true,
            valueType: 'string',
            scope: 'element',
          },
        },
        seo: {
          titleTemplate: '{title} | Smoke Blog Editor',
        },
        metadata: {
          animationTimeline: [
            {
              id: 'blog-editor-title-enter',
              target: `frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}-title`,
            },
          ],
        },
      },
    }),
  });
  const post = payload.data?.post || payload.post;
  assert(post?.id, `Create post did not return a post: ${JSON.stringify(payload).slice(0, 500)}`);
  return post;
};

const assertBlogUpdateConflict = async (post) => {
  assert(post.updatedAt, `Created smoke post did not include updatedAt for conflict testing: ${JSON.stringify(post).slice(0, 500)}`);
  const firstUpdate = await requestApi(`/api/admin/sites/${SITE_ID}/blog/${post.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: `${post.title} conflict baseline`,
      expectedUpdatedAt: post.updatedAt,
      revisionNote: 'Smoke conflict baseline',
    }),
  });
  const updatedPost = firstUpdate.data?.post || firstUpdate.post;
  assert(updatedPost?.updatedAt && updatedPost.updatedAt !== post.updatedAt, `Initial conflict setup did not advance updatedAt: ${JSON.stringify(firstUpdate).slice(0, 500)}`);

  const response = await fetch(`${API_BASE_URL}/api/admin/sites/${SITE_ID}/blog/${post.id}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiAdminSessionToken}`,
    },
    body: JSON.stringify({
      title: `${post.title} stale overwrite`,
      expectedUpdatedAt: post.updatedAt,
      revisionNote: 'Smoke stale overwrite',
    }),
  });
  const payload = await response.json().catch(() => ({}));

  assert(response.status === 409, `Stale blog update should return 409, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.error?.code === 'BLOG_VERSION_CONFLICT', `Stale blog update should return BLOG_VERSION_CONFLICT: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.error?.details?.currentUpdatedAt === updatedPost.updatedAt, `Conflict response missing current updatedAt: ${JSON.stringify(payload).slice(0, 500)}`);
  return updatedPost;
};

const deleteBlogPost = async (postId) => {
  if (!postId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/blog/${postId}`, { method: 'DELETE' });
};

const launchChrome = () => {
  const userDataDir = path.join(os.tmpdir(), `backy-blog-editor-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1680,1180',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const waitForEditor = async (client, postId) => {
  await client.send('Page.navigate', {
    url: `${ADMIN_BASE_URL}/blog/${encodeURIComponent(postId)}?siteId=${encodeURIComponent(SITE_ID)}`,
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const grid = document.querySelector('[data-testid="blog-editor-workspace-grid"]');
      const canvasShell = document.querySelector('[data-testid="blog-editor-canvas-shell"]');
      const commandCenter = document.querySelector('[data-testid="blog-editor-command-center"]');
      const draftPanel = document.querySelector('#blog-editor-draft');
      const canvas = document.querySelector('[data-testid="editor-canvas"]');
      const saveStatus = document.querySelector('[data-testid="editor-save-status"]');
      const rect = canvasShell?.getBoundingClientRect();
      const commandRect = commandCenter?.getBoundingClientRect();
      const draftRect = draftPanel?.getBoundingClientRect();
      const commandStatus = document.querySelector('[data-testid="blog-editor-command-action-status"]');
      const readRouteAction = (testId) => {
        const control = document.querySelector('[data-testid="' + testId + '"]');
        const disabled = control instanceof HTMLButtonElement ||
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement
          ? control.disabled
          : null;
        return {
          exists: control instanceof HTMLElement,
          describedBy: control?.getAttribute('aria-describedby') || '',
          actionState: control?.getAttribute('data-action-state') || '',
          actionStatus: control?.getAttribute('data-action-status') || '',
          disabledReason: control?.getAttribute('data-disabled-reason') || '',
          disabled,
        };
      };
      const readFirstRouteAction = (selector) => {
        const control = document.querySelector(selector);
        const disabled = control instanceof HTMLButtonElement ||
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement
          ? control.disabled
          : null;
        return {
          exists: control instanceof HTMLElement,
          testId: control?.getAttribute('data-testid') || '',
          describedBy: control?.getAttribute('aria-describedby') || '',
          actionState: control?.getAttribute('data-action-state') || '',
          actionStatus: control?.getAttribute('data-action-status') || '',
          disabledReason: control?.getAttribute('data-disabled-reason') || '',
          disabled,
        };
      };
      const routeActions = {
        back: readRouteAction('blog-editor-back-to-blog'),
        focus: readRouteAction('blog-editor-focus-toggle'),
        statusDraft: readRouteAction('blog-editor-status-draft'),
        statusPublished: readRouteAction('blog-editor-status-published'),
        statusScheduled: readRouteAction('blog-editor-status-scheduled'),
        statusArchived: readRouteAction('blog-editor-status-archived'),
        copy: readRouteAction('blog-editor-copy-handoff'),
        download: readRouteAction('blog-editor-download-handoff'),
        save: readRouteAction('blog-editor-save'),
        preview: readRouteAction('blog-editor-preview'),
        readiness: readRouteAction('blog-editor-refresh-readiness'),
        publishPanelReadiness: readRouteAction('blog-editor-publish-panel-refresh-readiness'),
        publishImpactCopy: readRouteAction('blog-editor-copy-publish-impact'),
        publish: readRouteAction('blog-editor-publish'),
        archive: readRouteAction('blog-editor-archive'),
        publishPanelSave: readRouteAction('blog-editor-publish-panel-save'),
        publishPanelPreview: readRouteAction('blog-editor-publish-panel-preview'),
        discard: readRouteAction('blog-editor-discard'),
        deletePost: readRouteAction('blog-editor-delete'),
        copyApiUrl: readRouteAction('blog-editor-copy-api-url'),
        controlMapCopyHandoff: readRouteAction('blog-editor-control-map-copy-handoff'),
        selectFeaturedImage: readRouteAction('blog-editor-select-featured-image'),
        clearFeaturedImage: readRouteAction('blog-editor-clear-featured-image'),
        refreshComments: readRouteAction('blog-editor-refresh-comments'),
        openCommentsQueue: readRouteAction('blog-editor-open-comments-queue'),
        copyCommentsApi: readRouteAction('blog-editor-copy-comments-api'),
        copyPublicUrl: readRouteAction('blog-editor-copy-public-url'),
        handoffPanelCopyHandoff: readRouteAction('blog-editor-handoff-panel-copy-handoff'),
        revisionGraphCopy: readRouteAction('blog-editor-copy-revision-branch-graph'),
        revisionCompareCopy: readFirstRouteAction('[data-testid^="blog-editor-copy-revision-compare-"]'),
        revisionRestore: readFirstRouteAction('[data-testid^="blog-editor-restore-revision-"]'),
        authorSelect: readRouteAction('blog-editor-author-select'),
        taxonomyCategory: readFirstRouteAction('[data-testid^="blog-editor-taxonomy-category-"]'),
        taxonomyTag: readFirstRouteAction('[data-testid^="blog-editor-taxonomy-tag-"]'),
        canvasSave: readRouteAction('blog-editor-canvas-save'),
        canvasPreview: readRouteAction('blog-editor-canvas-preview'),
      };
      const describedRouteActions = [
        routeActions.statusDraft,
        routeActions.statusPublished,
        routeActions.statusScheduled,
        routeActions.statusArchived,
        routeActions.copy,
        routeActions.download,
        routeActions.save,
        routeActions.preview,
        routeActions.readiness,
        routeActions.publishPanelReadiness,
        routeActions.publishImpactCopy,
        routeActions.publish,
        routeActions.archive,
        routeActions.publishPanelSave,
        routeActions.publishPanelPreview,
        routeActions.discard,
        routeActions.deletePost,
        routeActions.copyApiUrl,
        routeActions.controlMapCopyHandoff,
        routeActions.selectFeaturedImage,
        routeActions.clearFeaturedImage,
        routeActions.refreshComments,
        routeActions.openCommentsQueue,
        routeActions.copyCommentsApi,
        routeActions.copyPublicUrl,
        routeActions.handoffPanelCopyHandoff,
        routeActions.revisionGraphCopy,
        routeActions.revisionCompareCopy,
        routeActions.revisionRestore,
        routeActions.authorSelect,
      ];
      const optionalDescribedRouteActions = [
        routeActions.publishPanelReadiness,
        routeActions.taxonomyCategory,
        routeActions.taxonomyTag,
      ];
      const requiredRouteActions = Object.entries(routeActions)
        .filter(([name]) => name !== 'publishPanelReadiness' && name !== 'taxonomyCategory' && name !== 'taxonomyTag')
        .map(([, action]) => action);
      const validState = (action) => ['ready', 'busy', 'blocked', 'selected'].includes(action.actionState);
      return {
        ready: Boolean(commandCenter),
        grid: Boolean(grid),
        commandCenter: Boolean(commandCenter),
        commandCenterOrder: commandCenter?.getAttribute('data-default-editor-order') || '',
        commandActionState: commandCenter?.getAttribute('data-action-state') || '',
        commandActionStatus: commandCenter?.getAttribute('data-action-status') || '',
        commandStatusId: commandStatus?.id || '',
        commandStatusText: commandStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        routeActions,
        routeActionsOk: Boolean(commandStatus?.id) &&
          commandCenter?.getAttribute('aria-describedby') === commandStatus.id &&
          commandCenter?.getAttribute('data-action-status') === commandStatus.textContent?.replace(/\\s+/g, ' ').trim() &&
          requiredRouteActions.every((action) => action.exists && validState(action) && action.actionStatus) &&
          (!routeActions.publishPanelReadiness.exists || (validState(routeActions.publishPanelReadiness) && routeActions.publishPanelReadiness.actionStatus)) &&
          optionalDescribedRouteActions.filter((action) => action.exists).every((action) => validState(action) && action.actionStatus) &&
          describedRouteActions.filter((action) => action.exists).every((action) => action.describedBy === commandStatus.id) &&
          optionalDescribedRouteActions.filter((action) => action.exists).every((action) => action.describedBy === commandStatus.id) &&
          routeActions.focus.describedBy === commandStatus.id &&
          routeActions.back.describedBy === commandStatus.id &&
          Boolean(routeActions.canvasSave.actionStatus) &&
          Boolean(routeActions.canvasPreview.actionStatus),
        workspaceOrder: grid?.getAttribute('data-default-editor-order') || '',
        canvasOrder: canvasShell?.getAttribute('data-default-editor-order') || '',
        canvasTop: Math.round(rect?.top || 0),
        commandCenterTop: Math.round(commandRect?.top || 0),
        draftTop: Math.round(draftRect?.top || 0),
        canvasFrameSaveAction: Boolean(canvasShell?.querySelector('button[type="submit"][form="blog-editor-form"]')),
        canvasFramePreviewAction: Array.from(canvasShell?.querySelectorAll('button') || []).some((button) => (button.textContent || '').trim() === 'Preview'),
        canvasShell: Boolean(canvasShell),
        canvas: Boolean(canvas),
        draft: Boolean(document.querySelector('#blog-editor-draft')),
        seo: Boolean(document.querySelector('#blog-editor-seo')),
        publish: Boolean(document.querySelector('#blog-editor-publish')),
        media: Boolean(document.querySelector('#blog-editor-media')),
        comments: Boolean(document.querySelector('#blog-editor-comments')),
        handoff: Boolean(document.querySelector('#blog-editor-handoff')),
        taxonomy: Boolean(document.querySelector('#blog-editor-taxonomy')),
        revisions: Boolean(document.querySelector('#blog-editor-revisions')),
        templatePanel: Boolean(document.querySelector('[data-testid="blog-editor-template-provenance"]')),
        templateId: document.querySelector('[data-testid="blog-editor-template-provenance"]')?.getAttribute('data-template-id') || '',
        handoffTemplateId: (() => {
          try {
            return JSON.parse(document.querySelector('[data-testid="blog-editor-handoff-json"]')?.textContent || '{}')?.template?.id || '';
          } catch {
            return '';
          }
        })(),
        savePersistence: saveStatus?.getAttribute('data-save-persistence') || '',
        saveStatusText: saveStatus?.textContent || '',
        focusButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'Focus canvas'),
        focusButtonReady: Array.from(document.querySelectorAll('button')).some((button) => (
          (button.textContent || '').trim() === 'Focus canvas' &&
          button instanceof HTMLButtonElement &&
          !button.disabled
        )),
        width: rect?.width || 0,
        height: rect?.height || 0,
        body: document.body?.innerText?.slice(0, 1200) || '',
      };
    })()`);

    if (
      state.ready &&
      state.grid &&
      state.commandCenter &&
      state.commandCenterOrder === 'after-canvas' &&
      state.routeActionsOk &&
      state.workspaceOrder === 'canvas-first' &&
      state.canvasOrder === 'canvas-first' &&
      state.canvasTop > 0 &&
      state.commandCenterTop > state.canvasTop &&
      state.draftTop > state.canvasTop &&
      state.canvasFrameSaveAction &&
      state.canvasFramePreviewAction &&
      state.canvasShell &&
      state.canvas &&
      state.draft &&
      state.seo &&
      state.publish &&
      state.media &&
      state.comments &&
      state.handoff &&
      state.taxonomy &&
      state.revisions &&
      state.templatePanel &&
      state.templateId === FRONTEND_BLOG_TEMPLATE_ID &&
      state.handoffTemplateId === FRONTEND_BLOG_TEMPLATE_ID &&
      state.savePersistence === 'parent' &&
      state.saveStatusText.includes('Post save') &&
      !state.saveStatusText.includes('Saved') &&
      state.focusButtonReady &&
      state.width >= 900 &&
      state.height >= 760
    ) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(`Blog editor did not render the complete workspace: ${JSON.stringify(state)}`);
    }

    await sleep(200);
  }

  return null;
};

const assertFocusMode = async (client) => {
  let clicked = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').trim() === 'Focus canvas'
      ));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);

    if (clicked.ok) {
      break;
    }

    await sleep(200);
  }
  assert(clicked?.ok, `Focus canvas button was not ready: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const canvasShell = document.querySelector('[data-testid="blog-editor-canvas-shell"]');
      const rect = canvasShell?.getBoundingClientRect();
      return {
        path: window.location.pathname,
        search: window.location.search,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        banner: Boolean(document.querySelector('[data-testid="blog-editor-focus-banner"]')),
        density: document.querySelector('[data-testid="blog-editor-focus-banner"]')?.getAttribute('data-density') || '',
        commandCenter: Boolean(document.querySelector('[data-testid="blog-editor-command-center"]')),
        draftPanel: Boolean(document.querySelector('#blog-editor-draft')),
        publishPanel: Boolean(document.querySelector('#blog-editor-publish')),
        adminSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
        adminHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
        canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
        shellFocusMode: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-focus-mode') || '',
        componentPanelVisible: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-component-panel-visible') || '',
        inspectorPanelVisible: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-inspector-panel-visible') || '',
        componentLibrary: Boolean(document.querySelector('[data-testid="editor-component-library"]')),
        inspector: Boolean(document.querySelector('[data-testid="editor-inspector"]')),
        showPanels: Boolean(document.querySelector('[data-testid="blog-editor-focus-banner-show-panels"]')),
        showPanelsState: document.querySelector('[data-testid="blog-editor-focus-banner-show-panels"]')?.getAttribute('data-action-state') || '',
        showPanelsStatus: document.querySelector('[data-testid="blog-editor-focus-banner-show-panels"]')?.getAttribute('data-action-status') || '',
        canvasShellWidth: rect?.width || 0,
        canvasShellHeight: rect?.height || 0,
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    })()`);

    if (
      state.banner &&
      state.density === 'compact' &&
      state.canvas &&
      state.showPanels &&
      state.showPanelsState === 'ready' &&
      /Show blog panels available/i.test(state.showPanelsStatus) &&
      state.shellFocusMode === 'true' &&
      state.componentPanelVisible === 'false' &&
      state.inspectorPanelVisible === 'false' &&
      !state.componentLibrary &&
      !state.inspector &&
      !state.commandCenter &&
      !state.draftPanel &&
      !state.publishPanel &&
      !state.adminSidebar &&
      !state.adminHeader &&
      state.search.includes('focus=canvas') &&
      state.canvasShellWidth >= state.viewport.width - 48 &&
      state.canvasShellHeight >= state.viewport.height - 140 &&
      state.horizontalOverflow <= 4
    ) {
      return state;
    }

    if (attempt === 79) {
      throw new Error(`Blog editor focus mode did not expose a full-width canvas: ${JSON.stringify(state)}`);
    }

    await sleep(200);
  }

  return null;
};

const assertUnsavedWorkflowGuard = async (client, originalTitle) => {
  const changed = await evaluate(client, `(() => {
    const draftPanel = document.querySelector('#blog-editor-draft');
    const titleInput = draftPanel?.querySelector('input[type="text"]');
    if (!(titleInput instanceof HTMLInputElement)) {
      return { ok: false, reason: 'title-input-missing', body: document.body?.innerText?.slice(0, 1200) || '' };
    }

    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(titleInput, ${JSON.stringify(`${originalTitle} unsaved`)});
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  })()`);
  assert(changed.ok, `Unable to create unsaved blog editor change: ${JSON.stringify(changed)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const guard = document.querySelector('[data-testid="blog-editor-unsaved-workflow-guard"]');
      const buttons = Array.from(document.querySelectorAll('#blog-editor-publish button'));
      const buttonState = (label) => {
        const button = buttons.find((candidate) => (candidate.textContent || '').trim() === label);
        return button instanceof HTMLButtonElement ? { found: true, disabled: button.disabled, title: button.getAttribute('title') || '' } : { found: false };
      };
      return {
        hasGuard: Boolean(guard),
        guardText: guard?.textContent || '',
        preview: buttonState('Preview'),
        publish: buttonState('Publish'),
        archive: buttonState('Archive'),
      };
    })()`);

    if (
      state.hasGuard &&
      state.guardText.includes('Save this post before preview') &&
      state.preview.found &&
      state.preview.disabled === true &&
      state.publish.found &&
      state.publish.disabled === true &&
      state.archive.found &&
      state.archive.disabled === true
    ) {
      return state;
    }

    if (attempt === 79) {
      throw new Error(`Unsaved blog workflow guard did not activate: ${JSON.stringify(state)}`);
    }

    await sleep(150);
  }

  return null;
};

const assertUnchangedRouteSaveWithRouteCheckError = async (client, post) => {
  const nextTitle = `${post.title} route-check save`;
  let readyState = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    readyState = await evaluate(client, `(() => {
      const routeFailures = window.__backyBlogEditorRouteCheckFailures || 0;
      const routeErrorVisible = /Smoke route check unavailable|Retry route check|could not verify existing blog routes/i.test(document.body?.innerText || '');
      const saveButtons = Array.from(document.querySelectorAll('button[type="submit"][form="blog-editor-form"], form#blog-editor-form button[type="submit"]'))
        .filter((button) => button instanceof HTMLButtonElement)
        .map((button) => ({
          text: button.textContent?.trim() || '',
          disabled: button.disabled,
          title: button.getAttribute('title') || '',
          visible: Boolean(button.offsetWidth || button.offsetHeight || button.getClientRects().length),
        }));
      const publishButton = Array.from(document.querySelectorAll('#blog-editor-publish button')).find((button) => (
        (button.textContent || '').trim() === 'Publish'
      ));
      return {
        routeFailures,
        routeErrorVisible,
        saveButtons,
        hasEnabledVisibleSave: saveButtons.some((button) => button.visible && !button.disabled),
        publishDisabled: publishButton instanceof HTMLButtonElement ? publishButton.disabled : null,
        publishTitle: publishButton instanceof HTMLButtonElement ? publishButton.getAttribute('title') || '' : '',
        body: document.body?.innerText?.slice(0, 1000) || '',
      };
    })()`);

    if (readyState.routeFailures > 0 && readyState.routeErrorVisible && readyState.hasEnabledVisibleSave && readyState.publishDisabled === true) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Blog editor unchanged-route save did not stay enabled while route check failed: ${JSON.stringify(readyState)}`);
    }

    await sleep(200);
  }

  const changed = await evaluate(client, `(() => {
    const draftPanel = document.querySelector('#blog-editor-draft');
    const titleInput = draftPanel?.querySelector('input[type="text"]');
    if (!(titleInput instanceof HTMLInputElement)) {
      return { ok: false, reason: 'title-input-missing', body: document.body?.innerText?.slice(0, 1200) || '' };
    }

    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(titleInput, ${JSON.stringify(nextTitle)});
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: titleInput.value };
  })()`);
  assert(changed.ok, `Unable to create unchanged-route blog title change: ${JSON.stringify(changed)}`);

  const clicked = await evaluate(client, `(() => {
    const buttons = Array.from(document.querySelectorAll('button[type="submit"][form="blog-editor-form"], form#blog-editor-form button[type="submit"]'))
      .filter((button) => button instanceof HTMLButtonElement);
    const button = buttons.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      return !candidate.disabled &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none';
    });
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'enabled-save-missing',
        buttons: buttons.map((candidate) => ({
          text: candidate.textContent?.trim() || '',
          disabled: candidate.disabled,
          title: candidate.getAttribute('title') || '',
        })),
      };
    }
    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.click();
    return { ok: true, text: button.textContent?.trim() || '', title: button.getAttribute('title') || '' };
  })()`);
  assert(clicked.ok, `Unable to click unchanged-route save while route check failed: ${JSON.stringify(clicked)}`);

  let persisted = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/${post.id}`);
    persisted = payload.data?.post || payload.post;
    if (persisted?.title === nextTitle && persisted.slug === post.slug) {
      return {
        readyState,
        changed,
        clicked,
        persistedTitle: persisted.title,
        persistedSlug: persisted.slug,
        routeCheckFailures: readyState.routeFailures,
      };
    }
    await sleep(250);
  }

  throw new Error(`Unchanged-route save did not persist while route check failed: ${JSON.stringify({ expectedTitle: nextTitle, persisted })}`);
};

const assertPublishWorkflowVersionGuard = async (client, post) => {
  assert(post?.updatedAt, `Smoke post did not expose updatedAt before publish workflow: ${JSON.stringify(post).slice(0, 500)}`);

  const captureInstalled = await evaluate(client, `(() => {
    window.__backyBlogEditorPublishBodies = [];
    if (!window.__backyOriginalFetchForBlogEditorPublish) {
      window.__backyOriginalFetchForBlogEditorPublish = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(input instanceof Request ? input.url : input || '');
        const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'POST' && url.includes(${JSON.stringify(`/api/admin/sites/${SITE_ID}/blog/${post.id}/publish`)})) {
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
          window.__backyBlogEditorPublishBodies.push({ url, method, body: parsed });
        }
        return window.__backyOriginalFetchForBlogEditorPublish(input, init);
      };
    }
    return true;
  })()`);
  assert(captureInstalled, 'Unable to install blog editor publish capture');

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('#blog-editor-publish button')).find((candidate) => (
        (candidate.textContent || '').trim() === 'Publish'
      ));
      if (button instanceof HTMLButtonElement && !button.disabled) {
        button.click();
        return { ok: true };
      }
      return {
        ok: false,
        found: Boolean(button),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        title: button instanceof HTMLButtonElement ? button.getAttribute('title') || '' : '',
        body: document.body?.innerText?.slice(0, 1000) || '',
      };
    })()`);
    if (clicked.ok) break;
    if (attempt === 79) {
      throw new Error(`Blog editor publish button was not ready: ${JSON.stringify(clicked)}`);
    }
    await sleep(200);
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const published = await requestApi(`/api/admin/sites/${SITE_ID}/blog?limit=100`).then((payload) => {
      const posts = payload.data?.posts || payload.posts || [];
      return posts.find((candidate) => candidate.id === post.id);
    });
    const captured = await evaluate(client, `window.__backyBlogEditorPublishBodies || []`);
    const publishPost = captured.find((entry) => entry?.body && Object.prototype.hasOwnProperty.call(entry.body, 'expectedUpdatedAt'));

    if (published?.status === 'published' && publishPost) {
      assert(
        publishPost.body.expectedUpdatedAt === post.updatedAt,
        `Blog editor publish workflow did not send expectedUpdatedAt guard: ${JSON.stringify(publishPost).slice(0, 500)}`,
      );
      return {
        status: published.status,
        expectedUpdatedAt: publishPost.body.expectedUpdatedAt,
      };
    }

    await sleep(250);
  }

  throw new Error('Blog editor publish workflow did not persist a guarded publish request');
};

const assertDeleteConfirmActionContract = async (client) => {
  let openedState = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    openedState = await evaluate(client, `(() => {
      const readAction = (testId) => {
        const control = document.querySelector('[data-testid="' + testId + '"]');
        return {
          exists: control instanceof HTMLElement,
          describedBy: control?.getAttribute('aria-describedby') || '',
          actionState: control?.getAttribute('data-action-state') || '',
          actionStatus: control?.getAttribute('data-action-status') || '',
          disabledReason: control?.getAttribute('data-disabled-reason') || '',
          disabled: control instanceof HTMLButtonElement ? control.disabled : null,
        };
      };
      const status = document.querySelector('[data-testid="blog-editor-command-action-status"]');
      const deleteAction = readAction('blog-editor-delete');
      if (deleteAction.exists && deleteAction.disabled === false && deleteAction.actionState === 'ready') {
        document.querySelector('[data-testid="blog-editor-delete"]').click();
        return { ok: true, commandStatusId: status?.id || '', deleteAction };
      }
      return { ok: false, commandStatusId: status?.id || '', deleteAction, body: document.body?.innerText?.slice(0, 1000) || '' };
    })()`);

    if (openedState.ok) break;

    if (attempt === 79) {
      throw new Error(`Blog editor delete action was not ready for confirmation contract check: ${JSON.stringify(openedState)}`);
    }

    await sleep(200);
  }

  let modalState = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    modalState = await evaluate(client, `(() => {
      const readAction = (testId) => {
        const control = document.querySelector('[data-testid="' + testId + '"]');
        return {
          exists: control instanceof HTMLElement,
          describedBy: control?.getAttribute('aria-describedby') || '',
          actionState: control?.getAttribute('data-action-state') || '',
          actionStatus: control?.getAttribute('data-action-status') || '',
          disabledReason: control?.getAttribute('data-disabled-reason') || '',
          disabled: control instanceof HTMLButtonElement ? control.disabled : null,
        };
      };
      const status = document.querySelector('[data-testid="blog-editor-command-action-status"]');
      return {
        modal: Boolean(document.querySelector('[data-testid="blog-editor-delete-confirm"]')),
        commandStatusId: status?.id || '',
        cancel: readAction('blog-editor-cancel-delete'),
        confirm: readAction('blog-editor-confirm-delete'),
      };
    })()`);

    if (
      modalState.modal &&
      modalState.commandStatusId &&
      modalState.cancel.exists &&
      modalState.cancel.describedBy === modalState.commandStatusId &&
      modalState.cancel.actionState === 'ready' &&
      /Cancel delete available/i.test(modalState.cancel.actionStatus) &&
      modalState.confirm.exists &&
      modalState.confirm.describedBy === modalState.commandStatusId &&
      modalState.confirm.actionState === 'ready' &&
      /Delete post available/i.test(modalState.confirm.actionStatus)
    ) {
      break;
    }

    if (attempt === 39) {
      throw new Error(`Blog editor delete confirmation controls did not expose action metadata: ${JSON.stringify(modalState)}`);
    }

    await sleep(150);
  }

  const dismissed = await evaluate(client, `(() => {
    const cancel = document.querySelector('[data-testid="blog-editor-cancel-delete"]');
    if (!(cancel instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'cancel-missing' };
    }
    cancel.click();
    return {
      ok: true,
      modalStillVisible: Boolean(document.querySelector('[data-testid="blog-editor-delete-confirm"]')),
    };
  })()`);
  assert(dismissed.ok, `Unable to cancel blog editor delete confirmation: ${JSON.stringify(dismissed)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const hidden = await evaluate(client, `!document.querySelector('[data-testid="blog-editor-delete-confirm"]')`);
    if (hidden) {
      return { openedState, modalState, dismissed: { ok: dismissed.ok, modalClosed: true } };
    }
    await sleep(100);
  }

  throw new Error('Blog editor delete confirmation did not close after cancel');
};

const assertRestoreConfirmActionContract = async (client) => {
  let openedState = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    openedState = await evaluate(client, `(() => {
      const readAction = (control) => ({
        exists: control instanceof HTMLElement,
        testId: control?.getAttribute('data-testid') || '',
        describedBy: control?.getAttribute('aria-describedby') || '',
        actionState: control?.getAttribute('data-action-state') || '',
        actionStatus: control?.getAttribute('data-action-status') || '',
        disabledReason: control?.getAttribute('data-disabled-reason') || '',
        disabled: control instanceof HTMLButtonElement ? control.disabled : null,
      });
      const status = document.querySelector('[data-testid="blog-editor-command-action-status"]');
      const restoreButton = document.querySelector('[data-testid^="blog-editor-restore-revision-"]');
      const restoreAction = readAction(restoreButton);
      if (restoreButton instanceof HTMLButtonElement && restoreButton.disabled === false && restoreAction.actionState === 'ready') {
        restoreButton.click();
        return { ok: true, commandStatusId: status?.id || '', restoreAction };
      }
      return { ok: false, commandStatusId: status?.id || '', restoreAction, body: document.body?.innerText?.slice(0, 1000) || '' };
    })()`);

    if (openedState.ok) break;

    if (attempt === 79) {
      throw new Error(`Blog editor restore action was not ready for confirmation contract check: ${JSON.stringify(openedState)}`);
    }

    await sleep(200);
  }

  let modalState = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    modalState = await evaluate(client, `(() => {
      const readAction = (testId) => {
        const control = document.querySelector('[data-testid="' + testId + '"]');
        return {
          exists: control instanceof HTMLElement,
          describedBy: control?.getAttribute('aria-describedby') || '',
          actionState: control?.getAttribute('data-action-state') || '',
          actionStatus: control?.getAttribute('data-action-status') || '',
          disabledReason: control?.getAttribute('data-disabled-reason') || '',
          disabled: control instanceof HTMLButtonElement ? control.disabled : null,
        };
      };
      const status = document.querySelector('[data-testid="blog-editor-command-action-status"]');
      return {
        modal: Boolean(document.querySelector('[data-testid="blog-editor-restore-confirm"]')),
        impact: Boolean(document.querySelector('[data-testid="blog-editor-restore-impact"]')),
        commandStatusId: status?.id || '',
        cancel: readAction('blog-editor-cancel-restore'),
        confirm: readAction('blog-editor-confirm-restore'),
      };
    })()`);

    if (
      modalState.modal &&
      modalState.impact &&
      modalState.commandStatusId &&
      modalState.cancel.exists &&
      modalState.cancel.describedBy === modalState.commandStatusId &&
      modalState.cancel.actionState === 'ready' &&
      /Cancel restore available/i.test(modalState.cancel.actionStatus) &&
      modalState.confirm.exists &&
      modalState.confirm.describedBy === modalState.commandStatusId &&
      modalState.confirm.actionState === 'ready' &&
      /Restore revision available/i.test(modalState.confirm.actionStatus)
    ) {
      break;
    }

    if (attempt === 39) {
      throw new Error(`Blog editor restore confirmation controls did not expose action metadata: ${JSON.stringify(modalState)}`);
    }

    await sleep(150);
  }

  const dismissed = await evaluate(client, `(() => {
    const cancel = document.querySelector('[data-testid="blog-editor-cancel-restore"]');
    if (!(cancel instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'cancel-missing' };
    }
    cancel.click();
    return { ok: true };
  })()`);
  assert(dismissed.ok, `Unable to cancel blog editor restore confirmation: ${JSON.stringify(dismissed)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const hidden = await evaluate(client, `!document.querySelector('[data-testid="blog-editor-restore-confirm"]')`);
    if (hidden) {
      return { openedState, modalState, dismissed: { ok: dismissed.ok, modalClosed: true } };
    }
    await sleep(100);
  }

  throw new Error('Blog editor restore confirmation did not close after cancel');
};

const captureScreenshot = async (client, screenshotPath) => {
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return screenshotPath;
};

const cleanup = async ({ client, childProcess, userDataDir, postId }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closed.
    }
    client.close();
  }

  if (childProcess && childProcess.exitCode === null && childProcess.signalCode === null) {
    childProcess.kill('SIGTERM');
    const exited = await waitForExit(childProcess);
    if (!exited) {
      childProcess.kill('SIGKILL');
      await waitForExit(childProcess, 500);
    }
  }

  if (postId) {
    try {
      await deleteBlogPost(postId);
    } catch (error) {
      console.warn(`Unable to delete smoke post ${postId}:`, error instanceof Error ? error.message : error);
    }
  }

  fs.rmSync(userDataDir, { recursive: true, force: true });
};

const main = async () => {
  assertBlogEditorFallbackIsReadOnly();
  if (process.env.BACKY_BLOG_EDITOR_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, guard: 'blog-editor-source' }));
    return;
  }

  await loginAdminApi();
  const slug = `blog-editor-smoke-${Date.now().toString(36)}`;
  const post = await assertBlogUpdateConflict(await createBlogPost(slug));
  const { childProcess, userDataDir } = launchChrome();
  let client;

  try {
    await waitForCdp();
    const page = (await fetchJson('/json/list')).find((candidate) => candidate.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });
    if (ROUTE_CHECK_ERROR_SMOKE) {
      await client.send('Page.addScriptToEvaluateOnNewDocument', { source: routeCheckFailureScript() });
    }

    const editorState = await waitForEditor(client, post.id);
    if (ROUTE_CHECK_ERROR_SMOKE) {
      const unchangedRouteSave = await assertUnchangedRouteSaveWithRouteCheckError(client, post);
      const screenshotPath = await captureScreenshot(client, SCREENSHOT_PATH);

      const browserErrors = client.events
        .filter((event) => (
          event.method === 'Runtime.exceptionThrown'
          || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
        ))
        .map((event) => event.params);

      assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

      console.log(JSON.stringify({
        ok: true,
        mode: 'route-check-error-save',
        postId: post.id,
        slug,
        editorState,
        unchangedRouteSave,
        screenshotPath,
      }, null, 2));
      return;
    }

    const publishWorkflowState = await assertPublishWorkflowVersionGuard(client, post);
    const restoreConfirmState = await assertRestoreConfirmActionContract(client);
    const deleteConfirmState = await assertDeleteConfirmActionContract(client);
    const unsavedGuardState = await assertUnsavedWorkflowGuard(client, post.title);
    const focusState = await assertFocusMode(client);
    const screenshotPath = await captureScreenshot(client, SCREENSHOT_PATH);

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    console.log(JSON.stringify({
      ok: true,
      postId: post.id,
      slug,
      editorState,
      publishWorkflowState,
      restoreConfirmState,
      deleteConfirmState,
      unsavedGuardState,
      focusState,
      screenshotPath,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, postId: post.id });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

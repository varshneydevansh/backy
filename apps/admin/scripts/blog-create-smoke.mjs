#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withSmokeLock } from './smoke-lock.mjs';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_BLOG_CREATE_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_BLOG_CREATE_CDP_PORT || 9371);
const SCREENSHOT_PATH = process.env.BACKY_BLOG_CREATE_SCREENSHOT || path.join(os.tmpdir(), 'backy-blog-create-smoke.png');
const VISUAL_SCREENSHOT_DIR = process.env.BACKY_BLOG_CREATE_VISUAL_DIR || path.join(os.tmpdir(), 'backy-blog-create-visual');
const DESKTOP_VISUAL_SCREENSHOT_PATH = path.join(VISUAL_SCREENSHOT_DIR, 'backy-blog-create-desktop.png');
const FOCUS_VISUAL_SCREENSHOT_PATH = path.join(VISUAL_SCREENSHOT_DIR, 'backy-blog-create-focus.png');
const FRONTEND_BLOG_TEMPLATE_ID = 'smoke-blog-create-contract-template';
const FRONTEND_BLOG_TEMPLATE_NAME = 'Smoke Blog Contract';
const BLOG_CREATE_CONTROL_WAIT_ATTEMPTS = Number(process.env.BACKY_BLOG_CREATE_CONTROL_WAIT_ATTEMPTS || 240);
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertBlogCreateSourceContract = () => {
  const source = fs.readFileSync(new URL('../src/routes/blog.new.tsx', import.meta.url), 'utf8');
  const editorCatalogSource = fs.readFileSync(new URL('../src/components/editor/editorCatalog.ts', import.meta.url), 'utf8');
  const frontendDesignContractSource = fs.readFileSync(new URL('../../public/src/lib/frontendDesignContract.ts', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Blog create route must use the shared EmptyState component');
  assert(source.includes('title="No blog templates captured yet"'), 'Blog create frontend template panel must keep the empty template title visible');
  assert(source.includes('Save a frontend design contract with blog post templates to seed this article from the connected custom frontend.'), 'Blog create frontend template empty state must explain how templates are captured');
  assert(
    source.includes('normalizedFrontendDesignTemplateSearch') &&
      source.includes("type BlogTemplateSourceMode = 'backy-canvas' | 'custom-frontend';") &&
      source.includes('templateSource: isBlogTemplateSourceMode(search.templateSource) ? search.templateSource : undefined') &&
      source.includes('search.frontendDesignTemplateId') &&
      source.includes('search.frontendTemplate') &&
      source.includes('designTemplate: normalizedFrontendDesignTemplateSearch(search)'),
    'Blog create route must accept templateSource plus designTemplate, frontendDesignTemplateId, and frontendTemplate aliases for custom frontend template handoffs',
  );
  assert(
    source.includes('data-testid="blog-template-source-switch"') &&
      source.includes('data-testid="blog-template-source-backy-canvas"') &&
      source.includes('data-testid="blog-template-source-custom-frontend"') &&
      source.includes('data-testid="blog-template-source-status"') &&
      source.includes("const blogTemplateSelectionActionStatusId = 'blog-template-selection-action-status';") &&
      source.includes('const blogTemplateSelectionDisabledReason = isCreateBusy') &&
      source.includes('const blogTemplateSelectionControlDisabled = Boolean(blogTemplateSelectionDisabledReason);') &&
      source.includes('const getBlogTemplateSelectionActionState = (selected: boolean) => blogTemplateSelectionDisabledReason') &&
      source.includes('const getBlogTemplateSourceActionStatus = (sourceMode: BlogTemplateSourceMode) =>') &&
      source.includes('const getBlogFrontendTemplateActionStatus = (template: SiteFrontendDesignTemplate) =>') &&
      source.includes('data-testid="blog-template-selection-action-status"') &&
      source.includes('aria-describedby={blogTemplateSelectionActionStatusId}') &&
      source.includes('data-action-status={getBlogTemplateSourceActionStatus(\'backy-canvas\')}') &&
      source.includes('data-action-status={getBlogTemplateSourceActionStatus(\'custom-frontend\')}') &&
      source.includes('data-testid="blog-starter-library-shell"') &&
      source.includes('BLOG_STARTER_INTENTS.map((intent) =>') &&
      source.includes('findFrontendBlogTemplateForStarter(frontendBlogTemplates, selectedBlogStarterIntent)') &&
      source.includes('data-testid={`blog-starter-intent-${intent.id}`}') &&
      source.includes('data-frontend-template-match={isCustomFrontendTemplateSource ? frontendMatchState : undefined}') &&
      source.includes('data-action-status={getBlogStarterIntentActionStatus(intent)}') &&
      source.includes('data-action-status={getBlogFrontendTemplateActionStatus(template)}') &&
      source.includes('data-disabled-reason={blogTemplateSelectionDisabledReason || undefined}') &&
      source.includes('const templateSourceReady = !isCustomFrontendTemplateSource || Boolean(effectiveFrontendTemplate);') &&
      source.includes("templateSource: effectiveFrontendTemplate ? 'custom-frontend' : templateSourceMode") &&
      source.includes("templateSourceLabel: effectiveFrontendTemplate ? 'Custom frontend' : 'Backy canvas'") &&
      source.includes("backyCanvasTemplateId: effectiveFrontendTemplate ? undefined : 'blog-article'") &&
      source.includes('metadata: templateMetadata,') &&
      source.includes('templateSourceMode,'),
    'Blog create must expose Backy canvas vs custom frontend source controls and persist template source into post meta, autosave, and serialized content metadata',
  );
  assert(
    source.includes('extractFrontendTemplateDesignSerialization') &&
      source.includes('const frontendTemplateDesignState = effectiveFrontendTemplate') &&
      source.includes('...(frontendTemplateDesignState?.options || {})') &&
      source.includes('frontendDesignCustomJs: frontendTemplateDesignState?.provenance.customJS') &&
      source.includes('frontendDesignContentDocument: frontendTemplateDesignState?.provenance.contentDocument') &&
      source.includes('frontendDesignThemeTokenRefs: frontendTemplateDesignState?.provenance.themeTokenRefs') &&
      source.includes('frontendDesignAssets: frontendTemplateDesignState?.provenance.assets') &&
      source.includes('frontendDesignAnimations: frontendTemplateDesignState?.provenance.animations') &&
      source.includes('frontendDesignInteractions: frontendTemplateDesignState?.provenance.interactions') &&
      source.includes('frontendDesignDataBindings: frontendTemplateDesignState?.provenance.dataBindings') &&
      source.includes('frontendDesignEditableMap: frontendTemplateDesignState?.provenance.editableMap') &&
      source.includes('frontendDesignMetadata: frontendTemplateDesignState?.provenance.metadata') &&
      !source.includes('frontendDesignProvenanceArray') &&
      editorCatalogSource.includes('const templateProvenanceArrayOrRecord = (') &&
      editorCatalogSource.includes('return record && Object.keys(record).length > 0 ? record : undefined;') &&
      frontendDesignContractSource.includes('const assets = cloneArrayOrRecord(current.frontendDesignAssets)') &&
      frontendDesignContractSource.includes('|| cloneArrayOrRecord(content.assets)') &&
      frontendDesignContractSource.includes('const interactions = cloneArrayOrRecord(current.frontendDesignInteractions)') &&
      frontendDesignContractSource.includes('|| cloneArrayOrRecord(content.interactions)'),
    'Blog create frontend template seeding must preserve custom JS, content document, assets, animations, interactions, data bindings, editable map, and metadata in content plus meta provenance',
  );
  assert(
    source.includes('getScheduledBlogPostDateError') &&
      source.includes('Date.parse(scheduledAt)') &&
      source.includes('scheduledAtMs <= Date.now()') &&
      source.includes('Choose a future publish date before scheduling.'),
    'Blog create route must block scheduled posts with non-future publish dates before submit',
  );
  assert(
    source.includes('const [blogCreateFormSubmitted, setBlogCreateFormSubmitted] = useState(false);') &&
      source.includes('const blogTitleInlineError = blogCreateFormSubmitted && !title.trim()') &&
      source.includes('const blogSlugInlineError = blogCreateFormSubmitted') &&
      source.includes('const blogCanonicalInlineError = blogCreateFormSubmitted && !canonicalValid') &&
      source.includes('const blogScheduleInlineError = blogCreateFormSubmitted && scheduleValidationMessage') &&
      source.includes('setBlogCreateFormSubmitted(true);') &&
      source.includes('<form id="blog-create-form" onSubmit={handleSubmit} noValidate') &&
      source.includes('data-testid="blog-create-title-input"') &&
      source.includes('aria-describedby={blogTitleInlineError ?') &&
      source.includes('data-testid="blog-create-title-error"') &&
      source.includes('data-testid="blog-create-slug-input"') &&
      source.includes('data-testid="blog-create-slug-error"') &&
      source.includes('data-testid="blog-create-canonical-input"') &&
      source.includes('data-testid="blog-create-canonical-error"') &&
      source.includes('data-testid="blog-create-schedule-input"') &&
      source.includes('data-testid="blog-create-schedule-error"') &&
      source.includes('data-testid="blog-create-control-map"') &&
      source.includes('data-testid="blog-create-submit-button"') &&
      source.includes('const isCreateBusy = isLoading || isPreviewAfterCreateBusy;') &&
      source.includes('const createFormDisabled = isCreateBusy || !canEditBlog;') &&
      /const canCreateDraft =[\s\S]*?&& !isCheckingPosts[\s\S]*?const canCreatePreviewDraft =/.test(source) &&
      /const canCreatePreviewDraft =[\s\S]*?&& !isCheckingPosts[\s\S]*?const canAttemptCreatePreviewDraft =/.test(source) &&
      source.includes('const canAttemptCreatePreviewDraft = canEditBlog && canPublishBlog;') &&
      source.includes("const submitBlockerMessage = isLoading || canSubmit ? null : getCreateBlockedMessage('save');") &&
      source.includes("const previewDraftBlockerMessage = isPreviewAfterCreateBusy || canCreatePreviewDraft ? null : getCreateBlockedMessage('preview');") &&
      source.includes("id=\"blog-create-submit-blocker\"") &&
      source.includes('data-testid="blog-create-submit-blocker"') &&
      source.includes('data-state={submitControlState}') &&
      source.includes("const blogCreateSubmitActionStatusId = 'blog-create-submit-action-status';") &&
      source.includes("const blogCreatePreviewActionStatusId = 'blog-create-preview-action-status';") &&
      source.includes("const blogCreateCommandActionStatusId = 'blog-create-command-action-status';") &&
      source.includes("const blogCreateCommandSecondaryActionStatusId = 'blog-create-command-secondary-action-status';") &&
      source.includes("const blogCreateRecoveryActionStatusId = 'blog-create-recovery-action-status';") &&
      source.includes('const blogCreateBackActionStatus = isCreateBusy') &&
      source.includes('const blogCreateFocusActionStatus = isCreateBusy') &&
      source.includes('const blogCreateCopyActionStatus = isCreateBusy') &&
      source.includes('const blogCreateDownloadActionStatus = isCreateBusy') &&
      source.includes('const blogCreateCommandSecondaryActionStatus = [') &&
      source.includes('const blogCreateRouteRetryActionStatus = isCreateBusy') &&
      source.includes('const blogCreateDiscardRecoveryActionStatus = isCreateBusy') &&
      source.includes('const blogCreateRestoreRecoveryActionStatus = isCreateBusy') &&
      source.includes('data-testid="blog-create-command-action-status"') &&
      source.includes('data-testid="blog-create-command-secondary-action-status"') &&
      source.includes('data-testid="blog-create-back-to-blog"') &&
      source.includes('data-testid="blog-create-focus-toggle"') &&
      source.includes('data-testid="blog-create-copy-handoff"') &&
      source.includes('data-testid="blog-create-download-handoff"') &&
      source.includes('data-testid="blog-create-route-check-retry"') &&
      source.includes('data-testid="blog-create-recovery-action-status"') &&
      source.includes('data-testid="blog-create-discard-recovery"') &&
      source.includes('data-testid="blog-create-restore-recovery"') &&
      source.includes('const blogCreateSubmitActionState = blogCreateSubmitDisabledReason || submitBlockerMessage ?') &&
      source.includes('const blogCreatePreviewActionState = blogCreatePreviewDisabledReason || previewDraftBlockerMessage ?') &&
      source.includes('const blogCreateSubmitDescribedBy = submitBlockerMessage') &&
      source.includes('const blogCreatePreviewDescribedBy = previewDraftBlockerMessage && submitBlockerMessage') &&
      source.includes('data-testid="blog-create-submit-action-status"') &&
      source.includes('data-testid="blog-create-preview-action-status"') &&
      source.includes('aria-describedby={blogCreateSubmitDescribedBy}') &&
      source.includes('aria-describedby={blogCreatePreviewDescribedBy}') &&
      source.includes('data-action-state={blogCreateSubmitActionState}') &&
      source.includes('data-action-status={blogCreateSubmitActionStatus}') &&
      source.includes('data-disabled-reason={blogCreateSubmitDisabledReason || undefined}') &&
      source.includes('data-target-site-id={activeSiteId || undefined}') &&
      source.includes('data-target-route={routePath}') &&
      source.includes('data-target-status={status}') &&
      source.includes('data-target-template={blogCreateTemplateName}') &&
      source.includes('data-action-state={blogCreatePreviewActionState}') &&
      source.includes('data-action-status={blogCreatePreviewActionStatus}') &&
      source.includes('data-disabled-reason={blogCreatePreviewDisabledReason || undefined}') &&
      source.includes('data-target-status="draft"') &&
      source.includes('disabled={isCreateBusy || !canAttemptCreatePreviewDraft}') &&
      source.includes('data-can-preview={String(canCreatePreviewDraft)}') &&
      source.includes('data-can-submit={String(canSubmit)}') &&
      source.includes("data-blocker={previewDraftBlockerMessage || ''}") &&
      source.includes("data-blocker={submitBlockerMessage || ''}") &&
      !source.includes('const isCreateBusy = isLoading || isPreviewAfterCreateBusy || isPermissionMatrixPending;') &&
      !source.includes('disabled={isLoading || isPreviewAfterCreateBusy || !canCreatePreviewDraft}'),
    'Blog create must expose inline title/slug/canonical/schedule validation plus submit/preview blocker states while keeping save and preview reachable during permission sync and background route checks',
  );
  assert(
    source.includes('const loadBlogCreatePermissions = useCallback(() => {') &&
      source.includes('data-testid="blog-create-permission-state"') &&
      source.includes("const blogCreatePermissionActionStatusId = 'blog-create-permission-action-status';") &&
      source.includes('const blogCreatePermissionRetryActionStatus = isPermissionsLoading') &&
      source.includes('const blogCreatePermissionReviewActionStatus =') &&
      source.includes('data-testid="blog-create-permission-action-status"') &&
      source.includes('data-testid="blog-create-permission-retry"') &&
      source.includes('data-testid="blog-create-permission-review-users"') &&
      source.includes('Blog creation permissions could not be verified') &&
      source.includes('aria-label="Retry loading blog creation permissions"') &&
      source.includes('Retry permissions') &&
      source.includes('to="/users"') &&
      source.includes('Review users'),
    'Blog create permission alert must expose retryable permission recovery and user-access handoff',
  );
  assert(
    source.includes('data-testid="blog-create-command-center"') &&
      source.includes('Draft, preview, publish, taxonomy, frontend handoff, and public canvas controls stay together without pushing the editor out of reach.') &&
      source.includes('data-testid="blog-create-readiness-summary"') &&
      source.includes('{readinessChecks.filter((check) => check.complete).length} of {readinessChecks.length} checks passing.') &&
      source.includes('data-testid="blog-create-control-map"') &&
      source.includes('aria-label="Post creation control map"') &&
      source.includes('aria-label={`${area.title}: ${area.detail}`}') &&
      source.includes('inline-flex min-h-10 items-center rounded-lg') &&
      source.includes('{BLOG_CREATE_CONTROL_AREAS.length} areas') &&
      source.includes("data-editor-management-layout={isWorkspaceFocus ? 'hidden' : 'below-canvas'}") &&
      source.includes('data-testid="blog-create-management-panels"') &&
      !source.includes("!isWorkspaceFocus && '2xl:grid-cols-[minmax(0,1fr)_380px]'") &&
      !source.includes('2xl:sticky 2xl:top-5 2xl:block 2xl:self-start 2xl:space-y-4') &&
      source.includes("density={isWorkspaceFocus ? 'compact' : 'default'}") &&
      source.includes('initialCanvasFocusMode={isWorkspaceFocus}') &&
      source.includes("data-testid={isWorkspaceFocus ? 'blog-create-focus-banner' : undefined}"),
    'Blog create default shell must stay compact, keep management panels below the canvas, and boot the inner editor in focused canvas mode.',
  );
  {
    const commandCenterBlockStart = source.indexOf('data-testid="blog-create-command-center"');
    const commandCenterBlockEnd = source.indexOf('span id={blogCreateSubmitActionStatusId}', commandCenterBlockStart);
    const commandCenterBlock = commandCenterBlockStart >= 0
      ? source.slice(commandCenterBlockStart, commandCenterBlockEnd >= 0 ? commandCenterBlockEnd : commandCenterBlockStart + 4200)
      : '';
    const commandCenterSubmitButtonIndex = commandCenterBlock.indexOf('data-testid="blog-create-submit-button"');
    const commandCenterPreviewButtonIndex = commandCenterBlock.indexOf('Save draft and preview');
    const commandCenterSubmitLabelIndex = source.indexOf('const blogCreateSubmitActionLabel');
    const commandCenterCopyHandoffIndex = commandCenterBlock.indexOf('data-testid="blog-create-copy-handoff"');
    const commandCenterDownloadHandoffIndex = commandCenterBlock.indexOf('data-testid="blog-create-download-handoff"');
    const commandCenterMoreActionsIndex = commandCenterBlock.indexOf('More actions');
    const copyHandoffBlockStart = commandCenterBlock.lastIndexOf('<Button', commandCenterCopyHandoffIndex);
    const copyHandoffBlockEnd = commandCenterBlock.indexOf('</Button>', commandCenterCopyHandoffIndex);
    const copyHandoffBlock = copyHandoffBlockStart >= 0 && copyHandoffBlockEnd > copyHandoffBlockStart
      ? commandCenterBlock.slice(copyHandoffBlockStart, copyHandoffBlockEnd)
      : '';
    const downloadHandoffBlockStart = commandCenterBlock.lastIndexOf('<Button', commandCenterDownloadHandoffIndex);
    const downloadHandoffBlockEnd = commandCenterBlock.indexOf('</Button>', commandCenterDownloadHandoffIndex);
    const downloadHandoffBlock = downloadHandoffBlockStart >= 0 && downloadHandoffBlockEnd > downloadHandoffBlockStart
      ? commandCenterBlock.slice(downloadHandoffBlockStart, downloadHandoffBlockEnd)
      : '';
    const commandCenterPrimaryActionMaxIndex = Math.max(commandCenterSubmitButtonIndex, commandCenterPreviewButtonIndex);
    const handoffHierarchyMode = commandCenterMoreActionsIndex >= 0
      ? commandCenterMoreActionsIndex > commandCenterPrimaryActionMaxIndex && commandCenterCopyHandoffIndex > commandCenterMoreActionsIndex && commandCenterDownloadHandoffIndex > commandCenterMoreActionsIndex
      : commandCenterCopyHandoffIndex > commandCenterPrimaryActionMaxIndex && commandCenterDownloadHandoffIndex > commandCenterPrimaryActionMaxIndex;
    assert(
      commandCenterSubmitButtonIndex >= 0 &&
        commandCenterPreviewButtonIndex >= 0 &&
        commandCenterSubmitLabelIndex >= 0 &&
        commandCenterCopyHandoffIndex >= 0 &&
        commandCenterDownloadHandoffIndex >= 0 &&
        handoffHierarchyMode,
      'Blog create command center must keep primary create actions ahead of Copy handoff/Download JSON; handoff actions must be secondary or behind More actions.',
    );
    assert(
      copyHandoffBlock.includes('aria-describedby={blogCreateCommandSecondaryActionStatusId}') &&
        downloadHandoffBlock.includes('aria-describedby={blogCreateCommandSecondaryActionStatusId}'),
      'Blog create quick-create handoff buttons must expose the secondary handoff status for grouped action readiness and assistive feedback.',
    );
    const focusActionsBlockStart = source.indexOf('actions={isWorkspaceFocus');
    const focusActionsBlockEnd = source.indexOf('density={isWorkspaceFocus', focusActionsBlockStart);
    const focusActionsBlock = focusActionsBlockStart >= 0
      ? source.slice(focusActionsBlockStart, focusActionsBlockEnd >= 0 ? focusActionsBlockEnd : focusActionsBlockStart + 3200)
      : '';
    const focusSubmitIndex = focusActionsBlock.indexOf('data-testid="blog-create-focus-submit-button"');
    const focusPreviewIndex = focusActionsBlock.indexOf('Save draft and preview');
    const focusPanelsIndex = focusActionsBlock.indexOf('Show panels');
    assert(
      focusSubmitIndex >= 0 &&
        focusPreviewIndex > focusSubmitIndex &&
        focusPanelsIndex > focusPreviewIndex,
      'Blog create focused canvas actions must keep Save/Publish first, Preview second, and Show panels last.',
    );
  }
  assert(
    source.includes("search: { siteId: activeSiteId, focus: 'canvas' }") &&
      source.includes("navigate({ to: '/blog/$postId', params: { postId: created.id }, search: { siteId: activeSiteId, focus: 'canvas' } });"),
    'Blog create save and preview handoffs must open the newly created post in focused canvas mode instead of returning users to the list',
  );
};

const isIgnorableBrowserLogError = (event) => (
  event.method === 'Log.entryAdded' &&
  event.params?.entry?.source === 'intervention' &&
  /beforeunload.*confirmation panel/i.test(event.params?.entry?.text || '')
);

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
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 300)}`);
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
  const smokeMfaCode = process.env.BACKY_BLOG_CREATE_SMOKE_MFA_CODE
    || process.env.BACKY_EDITOR_SMOKE_MFA_CODE
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

const getFrontendDesign = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`);
  const frontendDesign = payload.data?.frontendDesign;
  assert(frontendDesign?.schemaVersion === 'backy.frontend-design.v1', `Unexpected frontend design response: ${JSON.stringify(payload).slice(0, 500)}`);
  return frontendDesign;
};

const patchFrontendDesign = async (frontendDesign) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`, {
    method: 'PATCH',
    body: JSON.stringify({ frontendDesign }),
  });
  const updated = payload.data?.frontendDesign;
  assert(updated?.schemaVersion === 'backy.frontend-design.v1', `Patch did not return frontend design: ${JSON.stringify(payload).slice(0, 500)}`);
  return updated;
};

const smokeFrontendDesignContract = () => ({
  schemaVersion: 'backy.frontend-design.v1',
  status: 'synced',
  source: {
    type: 'custom-frontend',
    label: 'Smoke blog frontend',
    url: 'https://example.com/smoke-blog-frontend',
    repository: 'example/backy-smoke-blog-frontend',
    branch: 'main',
  },
  tokens: {
    colors: {
      primary: '#0f766e',
      text: '#111827',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
    },
    customCss: ':root { --backy-smoke-blog-primary: #0f766e; }',
  },
  chrome: {
    header: { component: 'SmokeBlogHeader', source: 'site.navigation.primary' },
    navigation: { component: 'SmokeBlogNavigation', source: 'site.navigation.primary' },
    footer: { component: 'SmokeBlogFooter', source: 'site.navigation.footer' },
  },
  templates: [
    {
      id: FRONTEND_BLOG_TEMPLATE_ID,
      type: 'blogPost',
      name: FRONTEND_BLOG_TEMPLATE_NAME,
      routePattern: '/blog/smoke-contract',
      description: 'Frontend contract blog template used by the blog create smoke.',
      canvasSize: { width: 1260, height: 940 },
      content: {
        customCSS: ':root { --backy-smoke-blog-primary: #0f766e; }',
        customJS: 'window.__backySmokeBlogTemplate = true;',
        themeTokenRefs: {
          primary: 'tokens.colors.primary',
          text: 'tokens.colors.text',
        },
        assets: {
          media: [{ id: 'media-smoke-blog-cover', role: 'cover-image', source: 'custom-frontend' }],
          fonts: [{ id: 'font-smoke-blog-heading', family: 'Inter', source: 'custom-frontend' }],
        },
        animations: {
          titleEnter: { id: 'post-title-enter-animation', target: 'post.title', timeline: ['post-title-enter'], easing: 'ease-out' },
        },
        interactions: {
          timeline: [{ id: 'post-title-enter', target: 'post.title', animation: 'slide-up' }],
        },
        dataBindings: {
          datasets: [{ id: 'current-post', source: 'blog', mode: 'current' }],
          bindings: [{ elementId: `frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}-heading`, source: 'post.title', target: 'props.content' }],
        },
        editableMap: {
          'post.hero.title': {
            elementId: `frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}-heading`,
            field: 'props.content',
            label: 'Post title',
          },
        },
        seo: {
          titleTemplate: '{title} | Smoke Blog',
        },
        metadata: {
          animationTimeline: [{ id: 'post-title-enter', duration: 360, easing: 'ease-out' }],
          editableSurface: 'blog-create-smoke',
        },
      },
      bindingHints: [
        { role: 'post.title', binding: 'post.title' },
        { role: 'post.content', binding: 'post.content' },
      ],
    },
  ],
  editableMap: [
    {
      selector: '[data-backy-role="post-title"]',
      role: 'post.title',
      binding: 'post.title',
      fields: ['content'],
    },
  ],
  notes: 'Temporary contract for validating blog creation from custom frontend templates.',
});

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

const isUsablePageTarget = (target) => {
  if (!target || target.type !== 'page' || !target.webSocketDebuggerUrl) return false;
  const url = target.url || '';
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('devtools://') ||
    url.startsWith('chrome-error://') ||
    url.startsWith('chrome-extension://')
  );
};

const getTargetScore = (target) => {
  const url = target.url || '';
  if (url.startsWith(ADMIN_BASE_URL)) return 0;
  if (url === 'about:blank') return 1;
  if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return 2;
  if (url.startsWith('http://') || url.startsWith('https://')) return 3;
  return 4;
};

const selectUsablePageTarget = (targets) => (
  [...targets]
    .filter(isUsablePageTarget)
    .sort((left, right) => getTargetScore(left) - getTargetScore(right))[0]
);

const waitForUsablePageTarget = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const targets = await waitForCdp();
    const target = selectUsablePageTarget(targets);
    if (target) return target;
    await sleep(100);
  }

  const targets = await fetchJson('/json/list').catch(() => []);
  throw new Error(`No usable Chrome page target found on port ${PORT}: ${JSON.stringify(targets).slice(0, 1000)}`);
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

const seedBrowserAuthStorage = async (client, sessionToken) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/login` });
  await sleep(250);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      ${authStorageScript(sessionToken)}
      let hasToken = false;
      try {
        hasToken = Boolean(JSON.parse(localStorage.getItem('backy-auth-storage') || '{}')?.state?.session?.token);
      } catch {
        hasToken = false;
      }
      return {
        href: window.location.href,
        hasToken,
      };
    })()`);

    if (state.href.startsWith(ADMIN_BASE_URL) && state.hasToken) {
      return state;
    }

    await sleep(250);
  }

  throw new Error('Unable to seed browser auth storage for blog create smoke.');
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

const assertBlogCreateVisualState = async (client, label, screenshotPath, { focus = false } = {}) => {
  await evaluate(client, `(() => {
    window.scrollTo(0, 0);
    return true;
  })()`);
  await sleep(250);

  const state = await evaluate(client, `(() => {
    const bodyText = document.body?.innerText || '';
    const commandCenter = document.querySelector('[data-testid="blog-create-command-center"]');
    const submitBlocker = document.querySelector('[data-testid="blog-create-submit-blocker"]');
    const submitButton = document.querySelector('[data-testid="blog-create-submit-button"]');
    const workspaceGrid = document.querySelector('[data-testid="blog-create-workspace-grid"]');
    const canvasShell = document.querySelector('[data-testid="blog-create-canvas-shell"]');
    const editorCanvas = document.querySelector('[data-testid="editor-canvas"]');
    const componentLibrary = document.querySelector('[data-testid="editor-component-library"]');
    const inspector = document.querySelector('[data-testid="editor-inspector"]');
    const focusBanner = document.querySelector('[data-testid="blog-create-focus-banner"]');
    const controlMap = document.querySelector('[data-testid="blog-create-control-map"]');
    const managementPanels = document.querySelector('[data-testid="blog-create-management-panels"]');
    const frontendTemplatePanel = document.querySelector('[data-testid="blog-frontend-template-panel"]');
    const writingPanel = document.querySelector('[data-testid="blog-create-writing-panel"]');
    const frontendTemplateRoot = document.querySelector('[data-element-id="frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}"]');
    const activeTemplate = document.querySelector('[data-testid="blog-frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}"]');
    const templateSourceSwitch = document.querySelector('[data-testid="blog-template-source-switch"]');
    const templateSourceCustom = document.querySelector('[data-testid="blog-template-source-custom-frontend"]');
    const templateSourceBacky = document.querySelector('[data-testid="blog-template-source-backy-canvas"]');
    const templateSourceStatus = document.querySelector('[data-testid="blog-template-source-status"]');
    const payload = document.querySelector('[data-testid="blog-create-payload"]');
    const parsedPayload = (() => {
      try {
        return JSON.parse(payload?.textContent || '{}');
      } catch {
        return {};
      }
    })();
    const rect = (node) => {
      const box = node?.getBoundingClientRect();
      return box ? {
        width: Math.round(box.width),
        height: Math.round(box.height),
        left: Math.round(box.left),
        right: Math.round(box.right),
        top: Math.round(box.top),
      } : null;
    };

    return {
      label: ${JSON.stringify(label)},
      focus: ${JSON.stringify(focus)},
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      commandVisible: Boolean(commandCenter && rect(commandCenter)?.width > 320 && rect(commandCenter)?.height > 120),
      submitButtonVisible: Boolean(submitButton),
      submitControlState: submitButton?.getAttribute('data-state') || '',
      submitCanSubmit: submitButton?.getAttribute('data-can-submit') || '',
      submitBlockerVisible: Boolean(submitBlocker),
      submitBlockerState: submitBlocker?.getAttribute('data-state') || '',
      submitBlockerText: submitBlocker?.textContent || '',
      workspaceVisible: Boolean(workspaceGrid && rect(workspaceGrid)?.width > 320 && rect(workspaceGrid)?.height > 400),
      managementPanels: Boolean(managementPanels),
      managementLayout: workspaceGrid?.getAttribute('data-editor-management-layout') || '',
      managementPanelLayout: managementPanels?.getAttribute('data-editor-management-layout') || '',
      canvasShellRect: rect(canvasShell),
      canvasVisible: Boolean(canvasShell && rect(canvasShell)?.width > 320 && rect(canvasShell)?.height > 500),
      editorCanvasVisible: Boolean(editorCanvas && rect(editorCanvas)?.width > 260 && rect(editorCanvas)?.height > 240),
      componentLibraryVisible: Boolean(componentLibrary && rect(componentLibrary)?.width > 180 && rect(componentLibrary)?.height > 240),
      inspectorVisible: Boolean(inspector && rect(inspector)?.width > 180 && rect(inspector)?.height > 240),
      focusBannerVisible: Boolean(focusBanner && rect(focusBanner)?.width > 320 && rect(focusBanner)?.height > 80),
      focusDensity: focusBanner?.getAttribute('data-density') || '',
      controlMapVisible: Boolean(controlMap && rect(controlMap)?.width > 320 && rect(controlMap)?.height > 52),
      controlMapOpen: controlMap instanceof HTMLDetailsElement ? controlMap.open : null,
      draftPanel: Boolean(document.querySelector('#blog-create-draft')),
      seoPanel: Boolean(document.querySelector('#blog-create-seo')),
      mediaPanel: Boolean(document.querySelector('#blog-create-media')),
      publishPanel: Boolean(document.querySelector('#blog-create-publish')),
      taxonomyPanel: Boolean(document.querySelector('#blog-create-taxonomy')),
      writingPanel: Boolean(writingPanel),
      writingMetrics: Boolean(document.querySelector('[data-testid="blog-create-writing-metrics"]')),
      addSection: Boolean(document.querySelector('[data-testid="blog-create-add-section"]')),
      addQuote: Boolean(document.querySelector('[data-testid="blog-create-add-quote"]')),
      frontendTemplatePanel: Boolean(frontendTemplatePanel),
      templateSourceSwitch: Boolean(templateSourceSwitch),
      templateSourceActive: templateSourceSwitch?.getAttribute('data-active-source') || '',
      templateSourceCustomActive: templateSourceCustom?.getAttribute('data-active') || '',
      templateSourceBackyActive: templateSourceBacky?.getAttribute('data-active') || '',
      templateSourceStatus: templateSourceStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      frontendTemplateRoot: Boolean(frontendTemplateRoot),
      activeTemplate: activeTemplate?.getAttribute('data-active') || '',
      payloadTemplateId: parsedPayload?.template?.id || '',
      payloadTemplateSource: parsedPayload?.template?.source || '',
      payloadTemplateSourceMode: parsedPayload?.templateSource || '',
      payloadTemplateSourceLabel: parsedPayload?.templateSourceLabel || '',
      hasSavePreviewAction: bodyText.includes('Save draft and preview'),
      hasFocusAction: bodyText.includes('Focus canvas'),
      hasShowPanelsAction: bodyText.includes('Show panels'),
      groupShortcut: document.querySelector('[data-testid="editor-group-selection"]')?.getAttribute('aria-keyshortcuts') || '',
      siblingShortcut: document.querySelector('[data-testid="editor-select-sibling-layers"]')?.getAttribute('aria-keyshortcuts') || '',
      hasBreakpointControls: bodyText.includes('Desktop') && bodyText.includes('Tablet') && bodyText.includes('Mobile'),
      hasFrameworkOverlay: /Failed to compile|Unhandled Runtime Error|Vite Error|Internal Server Error/i.test(bodyText),
      body: bodyText.slice(0, 3000),
    };
  })()`);

  assert(state.workspaceVisible, `${label} workspace grid was not visibly rendered: ${JSON.stringify(state)}`);
  assert(state.canvasVisible && state.editorCanvasVisible, `${label} editor canvas was not visibly rendered: ${JSON.stringify(state)}`);
  assert(state.hasBreakpointControls && state.groupShortcut.includes('Control+G') && state.siblingShortcut.includes('Control+A'), `${label} editor breakpoint/grouping controls missing: ${JSON.stringify(state)}`);
  assert(state.hasSavePreviewAction, `${label} save-preview action missing: ${JSON.stringify(state)}`);
  assert(state.horizontalOverflow <= 4, `${label} has horizontal overflow: ${JSON.stringify(state)}`);
  assert(!state.hasFrameworkOverlay, `${label} rendered a framework/runtime overlay: ${JSON.stringify(state)}`);

  if (focus) {
    assert(state.focusBannerVisible && state.focusDensity === 'compact' && state.hasShowPanelsAction, `${label} focus banner/actions missing: ${JSON.stringify(state)}`);
    assert(!state.commandVisible && !state.draftPanel && !state.publishPanel, `${label} focus mode did not hide create panels: ${JSON.stringify(state)}`);
    assert(!state.componentLibraryVisible && !state.inspectorVisible, `${label} focus mode should start with editor side panels hidden: ${JSON.stringify(state)}`);
  } else {
    assert(state.commandVisible, `${label} command center missing: ${JSON.stringify(state)}`);
    assert(state.submitButtonVisible, `${label} submit action state missing: ${JSON.stringify(state)}`);
    assert(
      state.managementPanels &&
        state.managementLayout === 'below-canvas' &&
        state.managementPanelLayout === 'below-canvas' &&
        state.canvasShellRect?.width >= 900,
      `${label} must reserve horizontal editor width and keep management panels below the canvas: ${JSON.stringify(state)}`,
    );
    assert(state.controlMapVisible && state.controlMapOpen === false, `${label} control map should stay collapsed until requested: ${JSON.stringify(state)}`);
    assert(state.draftPanel && state.seoPanel && state.mediaPanel && state.publishPanel && state.taxonomyPanel && state.writingPanel, `${label} create panels missing: ${JSON.stringify(state)}`);
    assert(state.componentLibraryVisible && state.inspectorVisible, `${label} editor side panels were not visibly rendered: ${JSON.stringify(state)}`);
    assert(state.writingMetrics && state.addSection && state.addQuote, `${label} writing structure controls missing: ${JSON.stringify(state)}`);
    assert(
      state.frontendTemplatePanel &&
        state.templateSourceSwitch &&
        state.templateSourceActive === 'custom-frontend' &&
        state.templateSourceCustomActive === 'true' &&
        state.templateSourceBackyActive === 'false' &&
        state.frontendTemplateRoot &&
        state.activeTemplate === 'true' &&
        state.payloadTemplateId === FRONTEND_BLOG_TEMPLATE_ID &&
        state.payloadTemplateSourceMode === 'custom-frontend' &&
        state.payloadTemplateSourceLabel === 'Custom frontend',
      `${label} frontend template source handoff missing: ${JSON.stringify(state)}`,
    );
    assert(state.hasFocusAction, `${label} focus canvas action missing: ${JSON.stringify(state)}`);
  }

  await captureScreenshot(client, screenshotPath);
  return { ...state, screenshotPath };
};

const parseCssPixel = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getElementBox = async (client, elementId) => (
  evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${elementId}"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return {
      id: node.getAttribute('data-element-id'),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      left: style.left,
      top: style.top,
      cssWidth: style.width,
      cssHeight: style.height,
      text: node.textContent.trim().slice(0, 100),
    };
  })()`)
);

const readEditorElementState = async (client, elementIds) => {
  const entries = await Promise.all(elementIds.map(async (elementId) => {
    const box = await getElementBox(client, elementId);
    assert(box, `Missing element ${elementId} while reading editor state`);

    return [
      elementId,
      {
        x: Math.round(parseCssPixel(box.left) ?? box.x),
        y: Math.round(parseCssPixel(box.top) ?? box.y),
        width: Math.round(parseCssPixel(box.cssWidth) ?? box.width),
        height: Math.round(parseCssPixel(box.cssHeight) ?? box.height),
      },
    ];
  }));

  return Object.fromEntries(entries);
};

const clickButtonByAriaLabel = async (client, ariaLabel) => {
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('button[aria-label="${ariaLabel}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);

  assert(clicked, `Unable to click button with aria-label ${ariaLabel}`);
  await sleep(250);
};

const switchToPropertiesPanel = async (client) => {
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="editor-tab-properties"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);

  assert(clicked, 'Unable to switch editor inspector to Properties panel');
  await sleep(250);
};

const selectLayerById = async (client, elementId) => {
  const layersReady = await evaluate(client, `(() => {
    const layersButton = document.querySelector('[data-testid="editor-tab-layers"]');
    if (!(layersButton instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'missing-layers-tab',
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }
    layersButton.click();
    return { ok: true };
  })()`);

  assert(layersReady?.ok, `Unable to open Layers panel: ${JSON.stringify(layersReady)}`);
  await sleep(150);

  let clicked = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const layer = document.querySelector(${JSON.stringify(`[data-layer-id="${elementId}"]`)});
      if (!(layer instanceof HTMLElement)) {
        return {
          ok: false,
          availableLayerIds: Array.from(document.querySelectorAll('[data-layer-id]'))
            .map((node) => node.getAttribute('data-layer-id')),
          panelText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
        };
      }
      layer.click();
      return { ok: true };
    })()`);

    if (clicked?.ok) {
      break;
    }
    await sleep(100);
  }

  assert(clicked?.ok, `Unable to select layer ${elementId}: ${JSON.stringify(clicked)}`);
  await sleep(250);
  await switchToPropertiesPanel(client);
};

const setLayoutNumberInput = async (client, label, value) => {
  const testIdByLabel = {
    X: 'editor-layout-x',
    Y: 'editor-layout-y',
    Width: 'editor-layout-width',
    Height: 'editor-layout-height',
  };
  const testId = testIdByLabel[label];
  assert(testId, `Unknown layout label ${label}`);

  const focused = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="${testId}"]');
    if (!(input instanceof HTMLInputElement)) {
      return {
        ok: false,
        testId: ${JSON.stringify(testId)},
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }
    input.focus();
    input.select();
    return { ok: true };
  })()`);

  assert(focused?.ok, `Unable to focus ${label} layout input: ${JSON.stringify(focused)}`);
  const changed = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="${testId}"]');
    if (!(input instanceof HTMLInputElement)) {
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === ${JSON.stringify(String(value))};
  })()`);

  assert(changed, `Unable to change ${label} layout input to ${value}`);
  await sleep(250);
};

const waitForElementState = async (client, elementId, predicate, label) => {
  let lastState = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastState = (await readEditorElementState(client, [elementId]))[elementId];
    if (predicate(lastState)) {
      return lastState;
    }
    await sleep(100);
  }
  throw new Error(`${label}: ${JSON.stringify(lastState)}`);
};

const readBreakpointOverrideControls = async (client) => {
  const controls = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="editor-breakpoint-override"]');
    const layoutButton = document.querySelector('[data-testid="editor-breakpoint-reset-layout"]');
    return {
      panelText: panel?.textContent || '',
      layoutReset: layoutButton instanceof HTMLButtonElement
        ? { exists: true, disabled: layoutButton.disabled, title: layoutButton.getAttribute('title') || '' }
        : { exists: false },
    };
  })()`);

  assert(controls?.panelText, `Unable to read breakpoint override controls: ${JSON.stringify(controls)}`);
  return controls;
};

const assertMobileBreakpointAuthoring = async (client) => {
  const headingId = `frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}-heading`;
  await selectLayerById(client, headingId);
  await clickButtonByAriaLabel(client, 'Desktop canvas');
  await selectLayerById(client, headingId);
  const desktopBefore = (await readEditorElementState(client, [headingId]))[headingId];

  await clickButtonByAriaLabel(client, 'Mobile canvas');
  await selectLayerById(client, headingId);
  await setLayoutNumberInput(client, 'X', 24);
  await setLayoutNumberInput(client, 'Width', 320);

  const mobileAfter = await waitForElementState(
    client,
    headingId,
    (state) => state.x === 24 && state.width === 320,
    'Mobile heading override did not update editor element state',
  );
  const overrideControls = await readBreakpointOverrideControls(client);
  assert(
    /mobile override/i.test(overrideControls.panelText) && overrideControls.layoutReset.exists && overrideControls.layoutReset.disabled === false,
    `Mobile override controls did not expose active layout state: ${JSON.stringify(overrideControls)}`,
  );

  await clickButtonByAriaLabel(client, 'Desktop canvas');
  const desktopAfter = (await readEditorElementState(client, [headingId]))[headingId];
  assert(
    desktopAfter.x === desktopBefore.x && desktopAfter.width === desktopBefore.width,
    `Desktop layout changed while authoring mobile override: ${JSON.stringify({ desktopBefore, desktopAfter })}`,
  );

  await clickButtonByAriaLabel(client, 'Mobile canvas');
  await waitForElementState(
    client,
    headingId,
    (state) => state.x === 24 && state.width === 320,
    'Mobile heading override did not hydrate after breakpoint switch',
  );

  return {
    headingId,
    desktopBefore,
    desktopAfter,
    mobileAfter,
    overridePanel: overrideControls.panelText,
  };
};

const assertWritingStructureTools = async (client) => {
  for (const testId of ['blog-create-add-section', 'blog-create-add-quote']) {
    const clicked = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="${testId}"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, found: Boolean(button), disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);
    assert(clicked?.ok, `Unable to click ${testId}: ${JSON.stringify(clicked)}`);
    await sleep(300);
  }

  const state = await evaluate(client, `(() => {
    const metrics = document.querySelector('[data-testid="blog-create-writing-metrics"]')?.textContent || '';
    const section = document.querySelector('[data-element-id^="blog-longform-section-"]');
    const quote = document.querySelector('[data-element-id^="blog-longform-quote-"]');
    return {
      metrics,
      sectionId: section?.getAttribute('data-element-id') || '',
      quoteId: quote?.getAttribute('data-element-id') || '',
      hasSectionText: document.body?.innerText?.includes('New article section') || false,
      hasQuoteText: document.body?.innerText?.includes('memorable pull quote') || false,
    };
  })()`);

  assert(state.sectionId && state.quoteId, `Long-form canvas blocks were not inserted: ${JSON.stringify(state)}`);
  assert(state.hasSectionText && state.hasQuoteText, `Long-form inserted block text missing: ${JSON.stringify(state)}`);
  assert(/Total words/i.test(state.metrics) && /Reading time/i.test(state.metrics), `Writing metrics did not render: ${JSON.stringify(state)}`);
  return state;
};

const navigateToBlogCreate = async (client) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/blog/new?siteId=${encodeURIComponent(SITE_ID)}&frontendDesignTemplateId=${encodeURIComponent(FRONTEND_BLOG_TEMPLATE_ID)}` });

  for (let attempt = 0; attempt < BLOG_CREATE_CONTROL_WAIT_ATTEMPTS; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="blog-create-command-center"]')),
      title: document.body?.innerText?.includes('New Blog Post') || false,
      seo: Boolean(document.querySelector('#blog-create-seo')),
      media: Boolean(document.querySelector('#blog-create-media')),
      canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
      frontendTemplateRoot: Boolean(document.querySelector('[data-element-id="frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}"]')),
      frontendPanel: Boolean(document.querySelector('[data-testid="blog-frontend-template-options"]')),
      frontendTemplateActive: document.querySelector('[data-testid="blog-frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}"]')?.getAttribute('data-active') || '',
      frontendTemplateActionState: document.querySelector('[data-testid="blog-frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}"]')?.getAttribute('data-action-state') || '',
      frontendTemplateActionStatus: document.querySelector('[data-testid="blog-frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}"]')?.getAttribute('data-action-status') || '',
      frontendTemplateDescribedBy: document.querySelector('[data-testid="blog-frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}"]')?.getAttribute('aria-describedby') || '',
      frontendTemplateDisabledReason: document.querySelector('[data-testid="blog-frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}"]')?.getAttribute('data-disabled-reason') || '',
      templateSourceSwitch: Boolean(document.querySelector('[data-testid="blog-template-source-switch"]')),
      templateSourceActive: document.querySelector('[data-testid="blog-template-source-switch"]')?.getAttribute('data-active-source') || '',
      templateSourceSwitchActionState: document.querySelector('[data-testid="blog-template-source-switch"]')?.getAttribute('data-action-state') || '',
      templateSourceSwitchActionStatus: document.querySelector('[data-testid="blog-template-source-switch"]')?.getAttribute('data-action-status') || '',
      templateSourceSwitchDisabledReason: document.querySelector('[data-testid="blog-template-source-switch"]')?.getAttribute('data-disabled-reason') || '',
      templateSelectionStatusId: document.querySelector('[data-testid="blog-template-selection-action-status"]')?.id || '',
      templateSelectionStatusText: document.querySelector('[data-testid="blog-template-selection-action-status"]')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      templateSourceBackyActionState: document.querySelector('[data-testid="blog-template-source-backy-canvas"]')?.getAttribute('data-action-state') || '',
      templateSourceBackyActionStatus: document.querySelector('[data-testid="blog-template-source-backy-canvas"]')?.getAttribute('data-action-status') || '',
      templateSourceBackyDescribedBy: document.querySelector('[data-testid="blog-template-source-backy-canvas"]')?.getAttribute('aria-describedby') || '',
      templateSourceBackyDisabledReason: document.querySelector('[data-testid="blog-template-source-backy-canvas"]')?.getAttribute('data-disabled-reason') || '',
      templateSourceCustomActive: document.querySelector('[data-testid="blog-template-source-custom-frontend"]')?.getAttribute('data-active') || '',
      templateSourceCustomActionState: document.querySelector('[data-testid="blog-template-source-custom-frontend"]')?.getAttribute('data-action-state') || '',
      templateSourceCustomActionStatus: document.querySelector('[data-testid="blog-template-source-custom-frontend"]')?.getAttribute('data-action-status') || '',
      templateSourceCustomDescribedBy: document.querySelector('[data-testid="blog-template-source-custom-frontend"]')?.getAttribute('aria-describedby') || '',
      templateSourceCustomDisabledReason: document.querySelector('[data-testid="blog-template-source-custom-frontend"]')?.getAttribute('data-disabled-reason') || '',
      templateSourceStatus: document.querySelector('[data-testid="blog-template-source-status"]')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      submitState: document.querySelector('[data-testid="blog-create-submit-button"]')?.getAttribute('data-state') || '',
      submitCanSubmit: document.querySelector('[data-testid="blog-create-submit-button"]')?.getAttribute('data-can-submit') || '',
      submitBlocker: document.querySelector('[data-testid="blog-create-submit-blocker"]')?.textContent || '',
      commandStatusId: document.querySelector('[data-testid="blog-create-command-action-status"]')?.id || '',
      commandStatusText: document.querySelector('[data-testid="blog-create-command-action-status"]')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      secondaryStatusId: document.querySelector('[data-testid="blog-create-command-secondary-action-status"]')?.id || '',
      secondaryStatusText: document.querySelector('[data-testid="blog-create-command-secondary-action-status"]')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      secondaryGroupDescribedBy: document.querySelector('[data-testid="blog-create-secondary-actions"]')?.getAttribute('aria-describedby') || '',
      secondaryGroupStatus: document.querySelector('[data-testid="blog-create-secondary-actions"]')?.getAttribute('data-action-status') || '',
      secondaryGroupState: document.querySelector('[data-testid="blog-create-secondary-actions"]')?.getAttribute('data-action-state') || '',
      secondaryTargetSiteId: document.querySelector('[data-testid="blog-create-secondary-actions"]')?.getAttribute('data-target-site-id') || '',
      secondaryTargetRoute: document.querySelector('[data-testid="blog-create-secondary-actions"]')?.getAttribute('data-target-route') || '',
      backActionState: document.querySelector('[data-testid="blog-create-back-to-blog"]')?.getAttribute('data-action-state') || '',
      backActionStatus: document.querySelector('[data-testid="blog-create-back-to-blog"]')?.getAttribute('data-action-status') || '',
      backDescribedBy: document.querySelector('[data-testid="blog-create-back-to-blog"]')?.getAttribute('aria-describedby') || '',
      focusActionState: document.querySelector('[data-testid="blog-create-focus-toggle"]')?.getAttribute('data-action-state') || '',
      focusActionStatus: document.querySelector('[data-testid="blog-create-focus-toggle"]')?.getAttribute('data-action-status') || '',
      focusDescribedBy: document.querySelector('[data-testid="blog-create-focus-toggle"]')?.getAttribute('aria-describedby') || '',
      copyActionState: document.querySelector('[data-testid="blog-create-copy-handoff"]')?.getAttribute('data-action-state') || '',
      copyActionStatus: document.querySelector('[data-testid="blog-create-copy-handoff"]')?.getAttribute('data-action-status') || '',
      copyDescribedBy: document.querySelector('[data-testid="blog-create-copy-handoff"]')?.getAttribute('aria-describedby') || '',
      downloadActionState: document.querySelector('[data-testid="blog-create-download-handoff"]')?.getAttribute('data-action-state') || '',
      downloadActionStatus: document.querySelector('[data-testid="blog-create-download-handoff"]')?.getAttribute('data-action-status') || '',
      downloadDescribedBy: document.querySelector('[data-testid="blog-create-download-handoff"]')?.getAttribute('aria-describedby') || '',
      routeRetryTextInStatus: (document.querySelector('[data-testid="blog-create-command-action-status"]')?.textContent || '').includes('Retry blog route check available for'),
      payloadTemplateId: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}')?.template?.id || '',
      payloadTemplateSource: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}')?.template?.source || '',
      payloadTemplateSourceMode: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}')?.templateSource || '',
      payloadTemplateSourceLabel: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}')?.templateSourceLabel || '',
      body: document.body?.innerText?.slice(0, 200) || '',
    }))()`);

    if (
      state.ready
      && state.title
      && state.seo
      && state.media
      && state.canvas
      && state.frontendTemplateRoot
      && state.frontendPanel
      && state.frontendTemplateActive === 'true'
      && state.frontendTemplateActionState === 'selected'
      && state.frontendTemplateActionStatus.includes(FRONTEND_BLOG_TEMPLATE_NAME)
      && state.frontendTemplateDescribedBy === 'blog-template-selection-action-status'
      && state.frontendTemplateDisabledReason === ''
      && state.templateSourceSwitch
      && state.templateSourceActive === 'custom-frontend'
      && state.templateSourceSwitchActionState === 'ready'
      && state.templateSourceSwitchActionStatus.includes(FRONTEND_BLOG_TEMPLATE_NAME)
      && state.templateSourceSwitchDisabledReason === ''
      && state.templateSelectionStatusId === 'blog-template-selection-action-status'
      && state.templateSelectionStatusText.includes('Custom frontend blog template source selected')
      && state.templateSourceBackyActionState === 'ready'
      && state.templateSourceBackyActionStatus.includes('Switch to Backy canvas blog article template')
      && state.templateSourceBackyDescribedBy === 'blog-template-selection-action-status'
      && state.templateSourceBackyDisabledReason === ''
      && state.templateSourceCustomActive === 'true'
      && state.templateSourceCustomActionState === 'selected'
      && state.templateSourceCustomActionStatus.includes(FRONTEND_BLOG_TEMPLATE_NAME)
      && state.templateSourceCustomDescribedBy === 'blog-template-selection-action-status'
      && state.templateSourceCustomDisabledReason === ''
      && state.payloadTemplateId === FRONTEND_BLOG_TEMPLATE_ID
      && state.payloadTemplateSource === 'frontend-design'
      && state.payloadTemplateSourceMode === 'custom-frontend'
      && state.payloadTemplateSourceLabel === 'Custom frontend'
      && state.commandStatusId === 'blog-create-command-action-status'
      && state.secondaryStatusId === 'blog-create-command-secondary-action-status'
      && state.secondaryGroupDescribedBy === state.secondaryStatusId
      && state.secondaryGroupStatus === state.secondaryStatusText
      && state.secondaryGroupState === 'ready'
      && state.secondaryTargetSiteId === SITE_ID
      && state.secondaryTargetRoute === '/blog/smoke-contract'
      && state.backActionState === 'ready'
      && state.focusActionState === 'ready'
      && state.copyActionState === 'ready'
      && state.downloadActionState === 'ready'
      && state.backDescribedBy === state.commandStatusId
      && state.focusDescribedBy === state.commandStatusId
      && state.copyDescribedBy === state.secondaryStatusId
      && state.downloadDescribedBy === state.secondaryStatusId
      && state.backActionStatus.includes(`Back to Blog posts available for ${SITE_ID}`)
      && state.focusActionStatus.includes('Focus blog creation canvas available.')
      && state.copyActionStatus.includes(`Copy blog creation handoff available for ${SITE_ID}`)
      && state.downloadActionStatus.includes(`Download blog creation handoff available for ${SITE_ID}`)
      && state.secondaryStatusText.includes(state.copyActionStatus)
      && state.secondaryStatusText.includes(state.downloadActionStatus)
      && state.commandStatusText.includes(state.copyActionStatus)
      && state.commandStatusText.includes(state.downloadActionStatus)
      && state.routeRetryTextInStatus
    ) {
      return state;
    }

    if (attempt === BLOG_CREATE_CONTROL_WAIT_ATTEMPTS - 1) {
      throw new Error(`Blog create page did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertSubmitBlockerState = async (client) => {
  await evaluate(client, `(() => {
    const setInput = (selector, value) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };

    setInput('#blog-create-title', '');
    setInput('#blog-create-slug', '');
    return true;
  })()`);

  let state = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    state = await evaluate(client, `(() => {
      const submit = document.querySelector('[data-testid="blog-create-submit-button"]');
      const blocker = document.querySelector('[data-testid="blog-create-submit-blocker"]');
      const status = document.querySelector('[data-testid="blog-create-submit-action-status"]');
      const statusText = status?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        hasSubmit: Boolean(submit),
        submitState: submit?.getAttribute('data-state') || '',
        canSubmit: submit?.getAttribute('data-can-submit') || '',
        actionState: submit?.getAttribute('data-action-state') || '',
        actionStatus: submit?.getAttribute('data-action-status') || '',
        disabledReason: submit?.getAttribute('data-disabled-reason') || '',
        statusId: status?.id || '',
        statusText,
        blockerText: blocker?.textContent || '',
        blockerState: blocker?.getAttribute('data-state') || '',
        describedBy: submit?.getAttribute('aria-describedby') || '',
      };
    })()`);

    if (
      state.hasSubmit &&
      state.canSubmit === 'false' &&
      state.submitState !== 'ready' &&
      state.actionState === 'blocked' &&
      state.actionStatus === state.statusText &&
      state.statusText.includes('Save draft needs attention:') &&
      state.blockerText &&
      state.describedBy === 'blog-create-submit-action-status blog-create-submit-blocker'
    ) {
      return state;
    }

    await sleep(200);
  }

  throw new Error(`Blog create submit blocker did not render after clearing required fields: ${JSON.stringify(state)}`);
};

const fillBlogCreateForm = async (client, slug) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(client, `(() => {
      const title = document.querySelector('#blog-create-title');
      const checkbox = Array.from(document.querySelectorAll('#blog-create-seo label')).find((candidate) => (
        /No index/.test(candidate.textContent || '')
      ))?.querySelector('input[type="checkbox"]');
      return {
        titleReady: title instanceof HTMLInputElement && !title.disabled,
        checkboxReady: checkbox instanceof HTMLInputElement && !checkbox.disabled,
      };
    })()`);

    if (ready.titleReady && ready.checkboxReady) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Blog create controls stayed disabled: ${JSON.stringify(ready)}`);
    }

    await sleep(250);
  }

  const result = await evaluate(client, `(() => {
    const setInput = (selector, value) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };

    return {
      title: setInput('#blog-create-title', 'Smoke Blog Create'),
      slug: setInput('#blog-create-slug', '${slug}'),
      excerpt: setInput('#blog-create-excerpt', 'Smoke summary long enough for readiness, feeds, and search previews.'),
      seoTitle: setInput('#blog-create-seo-title', 'Smoke Blog Create SEO Title'),
      canonical: setInput('#blog-create-canonical', '/blog/${slug}'),
      seoDescription: setInput('#blog-create-seo-description', 'Smoke SEO description long enough to satisfy search preview readiness and frontend handoff validation.'),
      ogImage: setInput('#blog-create-og-image', 'https://example.com/smoke-og.jpg'),
      noIndex: (() => {
        const label = Array.from(document.querySelectorAll('#blog-create-seo label')).find((candidate) => (
          /No index/.test(candidate.textContent || '')
        ));
        const node = label?.querySelector('input[type="checkbox"]');
        if (!(node instanceof HTMLInputElement)) return false;
        if (!node.checked) {
          node.click();
        }
        return true;
      })(),
    };
  })()`);

  assert(Object.values(result).every(Boolean), `Unable to fill blog create controls: ${JSON.stringify(result)}`);
  await sleep(1100);
  return result;
};

const assertBlogCreateReadyActionStatus = async (client, slug) => {
  let state = null;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    state = await evaluate(client, `(() => {
      const submit = document.querySelector('[data-testid="blog-create-submit-button"]');
      const commandCenter = document.querySelector('[data-testid="blog-create-command-center"]');
      const commandCenterActionNodes = Array.from((commandCenter ? commandCenter.querySelectorAll('button, summary, details') : []));
      const commandCenterActionNames = commandCenterActionNodes.map((node, index) => ({
        index,
        tagName: node.tagName.toLowerCase(),
        text: (node.textContent || '').replace(/\\s+/g, ' ').trim(),
        testId: node.getAttribute('data-testid') || '',
        disabled: node instanceof HTMLButtonElement ? node.disabled : null,
      })).filter((node) => node.text);
      const preview = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').includes('Save draft and preview')
      ));
      const submitNodeIndex = commandCenterActionNames.findIndex((candidate) => (
        candidate.text.includes('Save draft') || candidate.text.includes('Publish post') || candidate.testId === 'blog-create-submit-button'
      ));
      const previewNodeIndex = commandCenterActionNames.findIndex((candidate) => candidate.text.includes('Save draft and preview'));
      const copyHandoffNodeIndex = commandCenterActionNames.findIndex((candidate) => candidate.text === 'Copy handoff');
      const downloadHandoffNodeIndex = commandCenterActionNames.findIndex((candidate) => candidate.text === 'Download JSON');
      const moreActionsNodeIndex = commandCenterActionNames.findIndex((candidate) => candidate.text.includes('More actions'));
      const primaryActionMaxIndex = Math.max(submitNodeIndex, previewNodeIndex);
      const handoffNodeCheck = moreActionsNodeIndex >= 0
        ? moreActionsNodeIndex > primaryActionMaxIndex && copyHandoffNodeIndex > moreActionsNodeIndex && downloadHandoffNodeIndex > moreActionsNodeIndex
        : copyHandoffNodeIndex > primaryActionMaxIndex && downloadHandoffNodeIndex > primaryActionMaxIndex;
      const submitStatus = document.querySelector('[data-testid="blog-create-submit-action-status"]');
      const previewStatus = document.querySelector('[data-testid="blog-create-preview-action-status"]');
      const secondary = document.querySelector('[data-testid="blog-create-secondary-actions"]');
      const secondaryStatus = document.querySelector('[data-testid="blog-create-command-secondary-action-status"]');
      const copyHandoff = document.querySelector('[data-testid="blog-create-copy-handoff"]');
      const downloadHandoff = document.querySelector('[data-testid="blog-create-download-handoff"]');
      const submitStatusText = submitStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const previewStatusText = previewStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const secondaryStatusText = secondaryStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      return {
        ready: submit instanceof HTMLButtonElement &&
          preview instanceof HTMLButtonElement &&
          submit.disabled === false &&
          preview.disabled === false &&
          handoffNodeCheck &&
          submit.getAttribute('aria-describedby') === 'blog-create-submit-action-status' &&
          preview.getAttribute('aria-describedby') === 'blog-create-preview-action-status' &&
          submit.getAttribute('data-action-state') === 'ready' &&
          preview.getAttribute('data-action-state') === 'ready' &&
          submit.getAttribute('data-action-status') === submitStatusText &&
          preview.getAttribute('data-action-status') === previewStatusText &&
          submit.getAttribute('data-disabled-reason') === null &&
          preview.getAttribute('data-disabled-reason') === null &&
          submit.getAttribute('data-target-site-id') === ${JSON.stringify(SITE_ID)} &&
          preview.getAttribute('data-target-site-id') === ${JSON.stringify(SITE_ID)} &&
          submit.getAttribute('data-target-route') === ${JSON.stringify(`/blog/${slug}`)} &&
          preview.getAttribute('data-target-route') === ${JSON.stringify(`/blog/${slug}`)} &&
          submit.getAttribute('data-target-status') === 'draft' &&
          preview.getAttribute('data-target-status') === 'draft' &&
          Boolean(submit.getAttribute('data-target-template')) &&
          Boolean(preview.getAttribute('data-target-template')) &&
          submitStatusText.includes(${JSON.stringify(`Save draft available for ${SITE_ID} at /blog/${slug}`)}) &&
          previewStatusText.includes(${JSON.stringify(`Preview draft available for ${SITE_ID} at /blog/${slug}`)}) &&
          secondary instanceof HTMLDetailsElement &&
          secondary.open === false &&
          secondary.getAttribute('data-default-collapsed') === 'true' &&
          secondary.getAttribute('aria-describedby') === 'blog-create-command-secondary-action-status' &&
          secondary.getAttribute('data-action-state') === 'ready' &&
          secondary.getAttribute('data-action-status') === secondaryStatusText &&
          secondary.getAttribute('data-target-site-id') === ${JSON.stringify(SITE_ID)} &&
          secondary.getAttribute('data-target-route') === ${JSON.stringify(`/blog/${slug}`)} &&
          copyHandoff?.getAttribute('aria-describedby') === 'blog-create-command-secondary-action-status' &&
          downloadHandoff?.getAttribute('aria-describedby') === 'blog-create-command-secondary-action-status' &&
          copyHandoff?.getAttribute('data-action-state') === 'ready' &&
          downloadHandoff?.getAttribute('data-action-state') === 'ready' &&
          secondaryStatusText.includes('Copy blog creation handoff available') &&
          secondaryStatusText.includes('Download blog creation handoff available'),
        submitDisabled: submit instanceof HTMLButtonElement ? submit.disabled : null,
        previewDisabled: preview instanceof HTMLButtonElement ? preview.disabled : null,
        submitDescribedBy: submit?.getAttribute('aria-describedby') || '',
        previewDescribedBy: preview?.getAttribute('aria-describedby') || '',
        submitActionState: submit?.getAttribute('data-action-state') || '',
        previewActionState: preview?.getAttribute('data-action-state') || '',
        submitActionStatus: submit?.getAttribute('data-action-status') || '',
        previewActionStatus: preview?.getAttribute('data-action-status') || '',
        commandCenterActionNames,
        handoffNodeCheck,
        submitStatusText,
        previewStatusText,
        submitTargetSiteId: submit?.getAttribute('data-target-site-id') || '',
        previewTargetSiteId: preview?.getAttribute('data-target-site-id') || '',
        submitTargetRoute: submit?.getAttribute('data-target-route') || '',
        previewTargetRoute: preview?.getAttribute('data-target-route') || '',
        submitTargetStatus: submit?.getAttribute('data-target-status') || '',
        previewTargetStatus: preview?.getAttribute('data-target-status') || '',
        submitTargetTemplate: submit?.getAttribute('data-target-template') || '',
        previewTargetTemplate: preview?.getAttribute('data-target-template') || '',
        body: document.body?.innerText?.slice(0, 500) || '',
      };
    })()`);

    if (state.ready) {
      return state;
    }

    await sleep(250);
  }

  throw new Error(`Blog create ready action status did not settle: ${JSON.stringify(state)}`);
};

const assertCanvasFocusMode = async (client) => {
  let clicked = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
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
  assert(clicked.ok, `Focus canvas button was not ready: ${JSON.stringify(clicked)}`);

  let focused = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    focused = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      banner: Boolean(document.querySelector('[data-testid="blog-create-focus-banner"]')),
      density: document.querySelector('[data-testid="blog-create-focus-banner"]')?.getAttribute('data-density') || '',
      commandCenter: Boolean(document.querySelector('[data-testid="blog-create-command-center"]')),
      draftPanel: Boolean(document.querySelector('#blog-create-draft')),
      publishPanel: Boolean(document.querySelector('#blog-create-publish')),
      canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
      shellFocusMode: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-focus-mode') || '',
      componentPanelVisible: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-component-panel-visible') || '',
      inspectorPanelVisible: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-inspector-panel-visible') || '',
      componentLibrary: Boolean(document.querySelector('[data-testid="editor-component-library"]')),
      inspector: Boolean(document.querySelector('[data-testid="editor-inspector"]')),
      adminSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
      adminHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
      showPanels: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'Show panels'),
    }))()`);

    if (
      focused.banner &&
      focused.density === 'compact' &&
      focused.canvas &&
      focused.showPanels &&
      focused.shellFocusMode === 'true' &&
      focused.componentPanelVisible === 'false' &&
      focused.inspectorPanelVisible === 'false' &&
      !focused.componentLibrary &&
      !focused.inspector &&
      !focused.commandCenter &&
      !focused.draftPanel &&
      !focused.publishPanel &&
      !focused.adminSidebar &&
      !focused.adminHeader &&
      focused.search.includes('focus=canvas')
    ) {
      break;
    }

    if (attempt === 59) {
      throw new Error(`Canvas focus mode did not hide create panels: ${JSON.stringify(focused)}`);
    }

    await sleep(200);
  }

  const focusVisualState = await assertBlogCreateVisualState(client, 'blog create focus', FOCUS_VISUAL_SCREENSHOT_PATH, { focus: true });

  let restored = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    restored = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').trim() === 'Show panels'
      ));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);

    if (restored.ok) {
      break;
    }

    await sleep(200);
  }
  assert(restored.ok, `Show panels button was not ready: ${JSON.stringify(restored)}`);

  let normal = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    normal = await evaluate(client, `(() => ({
      search: window.location.search,
      banner: Boolean(document.querySelector('[data-testid="blog-create-focus-banner"]')),
      commandCenter: Boolean(document.querySelector('[data-testid="blog-create-command-center"]')),
      draftPanel: Boolean(document.querySelector('#blog-create-draft')),
      publishPanel: Boolean(document.querySelector('#blog-create-publish')),
      adminSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
      adminHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
      sidebarCollapsed: document.querySelector('[data-testid="admin-sidebar-shell"]')?.getAttribute('data-collapsed') || '',
      sidebarMode: document.querySelector('[data-testid="admin-sidebar"]')?.getAttribute('data-nav-mode') || '',
      sidebarToggleDisabled: document.querySelector('[data-testid="admin-sidebar-toggle"]') instanceof HTMLButtonElement
        ? document.querySelector('[data-testid="admin-sidebar-toggle"]').disabled
        : null,
      sidebarToggleActionState: document.querySelector('[data-testid="admin-sidebar-toggle"]')?.getAttribute('data-action-state') || '',
      sidebarToggleExpanded: document.querySelector('[data-testid="admin-sidebar-toggle"]')?.getAttribute('aria-expanded') || '',
    }))()`);

    if (
      !normal.banner &&
      normal.commandCenter &&
      normal.draftPanel &&
      normal.publishPanel &&
      normal.adminSidebar &&
      normal.adminHeader &&
      normal.sidebarCollapsed === 'true' &&
      normal.sidebarMode === 'compact-rail' &&
      normal.sidebarToggleDisabled === false &&
      normal.sidebarToggleActionState === 'ready' &&
      normal.sidebarToggleExpanded === 'false' &&
      !normal.search.includes('focus=canvas')
    ) {
      break;
    }

    if (attempt === 59) {
      throw new Error(`Show panels did not restore create workspace: ${JSON.stringify(normal)}`);
    }

    await sleep(200);
  }

  return {
    focused,
    focusVisualState: {
      screenshotPath: focusVisualState.screenshotPath,
      horizontalOverflow: focusVisualState.horizontalOverflow,
      viewport: focusVisualState.viewport,
    },
    normal,
  };
};

const assertAutosaveWritten = async (client, slug) => {
  let state = null;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    state = await evaluate(client, `(() => {
      const raw = localStorage.getItem('backy:blog-new:draft:v1');
      const parsed = raw ? JSON.parse(raw) : null;
      const visit = (element) => {
        if (!element || typeof element !== 'object') return false;
        if (element.id === 'frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}' || element.props?.frontendTemplateId === '${FRONTEND_BLOG_TEMPLATE_ID}') {
          return true;
        }
        return Array.isArray(element.children) && element.children.some(visit);
      };
      const find = (elements, elementId) => {
        for (const element of elements || []) {
          if (element?.id === elementId) return element;
          const child = find(element?.children, elementId);
          if (child) return child;
        }
        return null;
      };
      const heading = find(parsed?.canvasElements || [], 'frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}-heading');
      const hasLongFormSection = Boolean((parsed?.canvasElements || []).some((element) => JSON.stringify(element).includes('blog-longform-section-')));
      const hasLongFormQuote = Boolean((parsed?.canvasElements || []).some((element) => JSON.stringify(element).includes('blog-longform-quote-')));
      return {
        hasDraft: Boolean(parsed),
        slug: parsed?.slug || null,
        title: parsed?.title || null,
        seoDescription: parsed?.seoDescription || null,
        noIndex: parsed?.noIndex ?? null,
        canvasCount: parsed?.canvasElements?.length || 0,
        designTemplateId: parsed?.designTemplateId || null,
        hasFrontendTemplateRoot: Array.isArray(parsed?.canvasElements) && parsed.canvasElements.some(visit),
        mobileOverride: heading?.responsive?.mobile || null,
        hasLongFormSection,
        hasLongFormQuote,
        badge: Array.from(document.querySelectorAll('span')).map((node) => node.textContent || '').find((text) => /Autosaved|Saving draft|Autosave/.test(text)) || '',
      };
    })()`);

    if (
      state.hasDraft
      && state.title === 'Smoke Blog Create'
      && state.slug === slug
      && state.noIndex === true
      && state.seoDescription.length > 50
      && state.canvasCount > 0
      && state.designTemplateId === FRONTEND_BLOG_TEMPLATE_ID
      && state.hasFrontendTemplateRoot === true
      && state.mobileOverride?.x === 24
      && state.mobileOverride?.width === 320
      && state.hasLongFormSection
      && state.hasLongFormQuote
    ) {
      break;
    }

    await sleep(250);
  }

  assert(state.hasDraft, `Autosave draft was not written: ${JSON.stringify(state)}`);
  assert(state.title === 'Smoke Blog Create', `Autosave draft title mismatch: ${JSON.stringify(state)}`);
  assert(state.slug === slug, `Autosave draft slug mismatch: ${JSON.stringify(state)}`);
  assert(state.noIndex === true, `Autosave did not retain robots toggle: ${JSON.stringify(state)}`);
  assert(state.canvasCount > 0, `Autosave did not retain canvas elements: ${JSON.stringify(state)}`);
  assert(state.designTemplateId === FRONTEND_BLOG_TEMPLATE_ID, `Autosave did not retain frontend template id: ${JSON.stringify(state)}`);
  assert(state.hasFrontendTemplateRoot === true, `Autosave did not retain frontend template canvas root: ${JSON.stringify(state)}`);
  assert(state.mobileOverride?.x === 24 && state.mobileOverride?.width === 320, `Autosave did not retain mobile breakpoint override: ${JSON.stringify(state)}`);
  assert(state.hasLongFormSection && state.hasLongFormQuote, `Autosave did not retain long-form writing blocks: ${JSON.stringify(state)}`);
  return state;
};

const assertFeaturedMediaPicker = async (client) => {
  const clicked = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      /Select image|Replace image/.test(candidate.textContent || '')
    ));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
    }
    button.click();
    return { ok: true, label: button.textContent || '' };
  })()`);

  assert(clicked.ok, `Featured media picker button was not ready: ${JSON.stringify(clicked)}`);

  let state = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    state = await evaluate(client, `(() => ({
      hasModal: document.body?.innerText?.includes('Media library') || false,
      hasContext: document.body?.innerText?.includes('Context:') && document.body?.innerText?.includes('Smoke Blog Create'),
      hasUploadTab: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'upload'),
      hasImageFilter: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'image'),
      hasScopeControls: document.body?.innerText?.includes('Selection controls') || false,
      closeButton: Boolean(document.querySelector('button[aria-label="Close media library"]')),
    }))()`);

    if (state.hasModal && state.hasContext && state.hasUploadTab && state.hasImageFilter && state.hasScopeControls && state.closeButton) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Featured media picker did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  const closed = await evaluate(client, `(() => {
    const button = document.querySelector('button[aria-label="Close media library"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  assert(closed, 'Unable to close featured media picker');
  await sleep(250);

  return {
    opened: clicked,
    modal: state,
  };
};

const assertRecoveryRestore = async (client, slug) => {
  const currentUrl = await evaluate(client, 'window.location.href');
  await client.send('Page.navigate', { url: currentUrl });
  await sleep(500);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      href: window.location.href,
      readyState: document.readyState,
      recovery: document.body?.innerText?.includes('Recovered unsaved blog draft') || false,
      statusId: document.querySelector('[data-testid="blog-create-recovery-action-status"]')?.id || '',
      statusText: document.querySelector('[data-testid="blog-create-recovery-action-status"]')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      discardState: document.querySelector('[data-testid="blog-create-discard-recovery"]')?.getAttribute('data-action-state') || '',
      discardStatus: document.querySelector('[data-testid="blog-create-discard-recovery"]')?.getAttribute('data-action-status') || '',
      discardDescribedBy: document.querySelector('[data-testid="blog-create-discard-recovery"]')?.getAttribute('aria-describedby') || '',
      restore: document.querySelector('[data-testid="blog-create-restore-recovery"]') instanceof HTMLButtonElement,
      restoreState: document.querySelector('[data-testid="blog-create-restore-recovery"]')?.getAttribute('data-action-state') || '',
      restoreStatus: document.querySelector('[data-testid="blog-create-restore-recovery"]')?.getAttribute('data-action-status') || '',
      restoreDescribedBy: document.querySelector('[data-testid="blog-create-restore-recovery"]')?.getAttribute('aria-describedby') || '',
      body: document.body?.innerText?.slice(0, 220) || '',
      errors: Array.from(document.querySelectorAll('[role="alert"], [data-testid*="error"]')).map((node) => node.textContent || '').slice(0, 3),
    }))()`);

    if (
      state.recovery &&
      state.statusId === 'blog-create-recovery-action-status' &&
      state.discardState === 'ready' &&
      state.restore &&
      state.restoreState === 'ready' &&
      state.discardDescribedBy === state.statusId &&
      state.restoreDescribedBy === state.statusId &&
      state.statusText.includes(state.discardStatus) &&
      state.statusText.includes(state.restoreStatus)
    ) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Autosave recovery banner did not render: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  let restored = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    restored = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="blog-create-restore-recovery"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { clicked: false, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { clicked: true };
    })()`);

    if (restored.clicked) {
      break;
    }

    await sleep(200);
  }
  assert(restored.clicked, `Restore draft button was not clickable: ${JSON.stringify(restored)}`);

  let state = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    state = await evaluate(client, `(() => ({
      slug: document.querySelector('#blog-create-slug')?.value || '',
      title: document.querySelector('#blog-create-title')?.value || '',
      seoDescription: document.querySelector('#blog-create-seo-description')?.value || '',
      noIndex: Array.from(document.querySelectorAll('#blog-create-seo input[type="checkbox"]'))[0]?.checked ?? null,
      frontendTemplateActive: document.querySelector('[data-testid="blog-frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}"]')?.getAttribute('data-active') || '',
      templateSourceActive: document.querySelector('[data-testid="blog-template-source-switch"]')?.getAttribute('data-active-source') || '',
      templateSourceCustomActive: document.querySelector('[data-testid="blog-template-source-custom-frontend"]')?.getAttribute('data-active') || '',
      payloadTemplateId: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}')?.template?.id || '',
      payloadTemplateSource: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}')?.template?.source || '',
      payloadTemplateSourceMode: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}')?.templateSource || '',
      notice: document.body?.innerText?.includes('Recovered local blog draft.') || false,
    }))()`);

    if (
      state.title === 'Smoke Blog Create'
      && state.slug === slug
      && state.noIndex === true
      && state.seoDescription.length > 50
      && state.frontendTemplateActive === 'true'
      && state.templateSourceActive === 'custom-frontend'
      && state.templateSourceCustomActive === 'true'
      && state.payloadTemplateId === FRONTEND_BLOG_TEMPLATE_ID
      && state.payloadTemplateSource === 'frontend-design'
      && state.payloadTemplateSourceMode === 'custom-frontend'
    ) {
      break;
    }

    await sleep(200);
  }

  assert(state.title === 'Smoke Blog Create', `Recovered draft did not restore title: ${JSON.stringify(state)}`);
  assert(state.slug === slug, `Recovered draft did not restore slug: ${JSON.stringify(state)}`);
  assert(state.noIndex === true, `Recovered draft did not restore robots toggle: ${JSON.stringify(state)}`);
  assert(state.seoDescription.length > 50, `Recovered draft did not restore SEO description: ${JSON.stringify(state)}`);
  assert(state.frontendTemplateActive === 'true', `Recovered draft did not restore frontend design template selection: ${JSON.stringify(state)}`);
  assert(state.payloadTemplateId === FRONTEND_BLOG_TEMPLATE_ID, `Recovered draft did not restore frontend design payload template: ${JSON.stringify(state)}`);
  return state;
};

const createPreviewFromUi = async (client) => {
  const beforeTargets = await fetchJson('/json/list');
  let clicked = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Save draft and preview'));
      const canPreview = button?.getAttribute('data-can-preview') === 'true';
      if (!(button instanceof HTMLButtonElement) || button.disabled || !canPreview) {
        return {
          ok: false,
          label: button?.textContent || null,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          canPreview,
          blocker: button?.getAttribute('data-blocker') || '',
          title: document.querySelector('#blog-create-title')?.value || '',
          slug: document.querySelector('#blog-create-slug')?.value || '',
          canonical: document.querySelector('#blog-create-canonical')?.value || '',
          payload: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}'),
          alerts: Array.from(document.querySelectorAll('[role="alert"], [data-testid*="error"]')).map((node) => node.textContent || '').slice(0, 4),
          buttons: Array.from(document.querySelectorAll('button')).filter((candidate) => (candidate.textContent || '').includes('Save')).map((candidate) => ({
            text: candidate.textContent || '',
            disabled: candidate instanceof HTMLButtonElement ? candidate.disabled : null,
            canPreview: candidate.getAttribute('data-can-preview') || '',
            state: candidate.getAttribute('data-state') || '',
            title: candidate.getAttribute('title') || '',
            blocker: candidate.getAttribute('data-blocker') || '',
          })),
          body: document.body?.innerText?.slice(0, 260) || '',
        };
      }
      button.click();
      return { ok: true, label: button.textContent || '' };
    })()`);

    if (clicked.ok) {
      break;
    }

    await sleep(250);
  }
  assert(clicked.ok, `Save draft and preview button was not ready: ${JSON.stringify(clicked)}`);

  let editPath = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      focusBanner: Boolean(document.querySelector('[data-testid="blog-editor-focus-banner"]')),
      focusDensity: document.querySelector('[data-testid="blog-editor-focus-banner"]')?.getAttribute('data-density') || '',
      commandCenter: Boolean(document.querySelector('[data-testid="blog-editor-command-center"]')),
      adminSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
      adminHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
      text: document.body?.innerText?.slice(0, 260) || '',
      fullText: document.body?.innerText?.slice(0, 1200) || '',
      storedDraft: localStorage.getItem('backy:blog-new:draft:v1'),
    }))()`);

    if (
      state.path.startsWith('/blog/') &&
      state.path !== '/blog/new' &&
      state.search.includes('focus=canvas') &&
      state.focusBanner &&
      state.focusDensity === 'compact' &&
      !state.commandCenter &&
      !state.adminSidebar &&
      !state.adminHeader
    ) {
      editPath = state.path;
      assert(state.storedDraft === null, `Autosave draft was not cleared after create: ${JSON.stringify(state)}`);
      break;
    }

    if (attempt === 99) {
      const browserErrors = client.events
        .filter((event) => (
          event.method === 'Runtime.exceptionThrown'
          || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error' && !isIgnorableBrowserLogError(event))
        ))
        .map((event) => event.params)
        .slice(0, 5);
      state.browserErrors = browserErrors;
      throw new Error(`Create preview did not navigate to focused edit canvas: ${JSON.stringify(state)}`);
    }

    await sleep(300);
  }

  const afterTargets = await fetchJson('/json/list');
  return {
    editPath,
    openedPreviewTargets: Math.max(0, afterTargets.length - beforeTargets.length),
  };
};

const normalizeCreatedContent = (content) => {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return content;
  }
  return {};
};

const flattenElements = (elements = []) => {
  const flat = [];
  const visit = (element) => {
    if (!element || typeof element !== 'object') return;
    flat.push(element);
    if (Array.isArray(element.children)) {
      element.children.forEach(visit);
    }
  };
  elements.forEach(visit);
  return flat;
};

const assertCreatedFrontendBlogPost = async (postId, slug) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/${postId}`);
  const post = payload.data?.post;

  assert(post, `Created blog post ${postId} detail was not returned`);
  assert(post.slug === slug, `Created blog slug mismatch: ${JSON.stringify({ slug: post.slug, expected: slug })}`);
  assert(post.meta?.templateSource === 'custom-frontend', `Created blog did not store template source: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.templateSourceLabel === 'Custom frontend', `Created blog did not store template source label: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignTemplateId === FRONTEND_BLOG_TEMPLATE_ID, `Created blog did not store frontend template id: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignTemplateName === FRONTEND_BLOG_TEMPLATE_NAME, `Created blog did not store frontend template name: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignSource?.type === 'custom-frontend', `Created blog did not store frontend design source: ${JSON.stringify(post.meta)}`);
  assert(Array.isArray(post.meta?.frontendDesignBindingHints) && post.meta.frontendDesignBindingHints.length === 2, `Created blog did not store frontend binding hints: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignCustomJs?.includes('__backySmokeBlogTemplate'), `Created blog did not store frontend custom JS provenance: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignThemeTokenRefs?.primary === 'tokens.colors.primary', `Created blog did not store frontend theme token refs: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignAssets?.media?.[0]?.id === 'media-smoke-blog-cover', `Created blog did not store keyed frontend asset provenance: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignAnimations?.titleEnter?.target === 'post.title', `Created blog did not store keyed frontend animation provenance: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignInteractions?.timeline?.[0]?.animation === 'slide-up', `Created blog did not store keyed frontend interaction provenance: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignEditableMap?.['post.hero.title']?.field === 'props.content', `Created blog did not store frontend editable map provenance: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignMetadata?.editableSurface === 'blog-create-smoke', `Created blog did not store frontend design metadata: ${JSON.stringify(post.meta)}`);

  const content = normalizeCreatedContent(post.content);
  const elements = Array.isArray(content.elements) ? content.elements : [];
  const allElements = flattenElements(elements);
  const byId = new Map(allElements.map((element) => [element.id, element]));
  const canvasSize = content.canvasSize || content.contentDocument?.metadata?.canvasSize || {};
  const contentDocument = content.contentDocument || null;
  const wrapper = byId.get(`frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}`);
  const heading = byId.get(`frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}-heading`);
  const bodyRegion = byId.get(`frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}-body-region`);
  const longFormSection = allElements.find((element) => typeof element.id === 'string' && element.id.startsWith('blog-longform-section-'));
  const longFormQuote = allElements.find((element) => typeof element.id === 'string' && element.id.startsWith('blog-longform-quote-'));

  assert(wrapper?.type === 'section', `Frontend blog template wrapper missing: ${JSON.stringify({ ids: allElements.map((element) => element.id).slice(0, 40) })}`);
  assert(wrapper.props?.frontendTemplateId === FRONTEND_BLOG_TEMPLATE_ID, `Frontend blog wrapper metadata mismatch: ${JSON.stringify(wrapper)}`);
  assert(heading?.props?.content === 'Smoke Blog Create', `Frontend blog heading does not use post title: ${JSON.stringify(heading?.props)}`);
  assert(heading?.responsive?.mobile?.x === 24 && heading?.responsive?.mobile?.width === 320, `Frontend blog heading did not persist mobile breakpoint override: ${JSON.stringify(heading?.responsive)}`);
  assert(Array.isArray(bodyRegion?.props?.bindingHints) && bodyRegion.props.bindingHints.length === 2, `Frontend blog body region missing binding hints: ${JSON.stringify(bodyRegion?.props)}`);
  assert(longFormSection && longFormQuote, `Created blog did not persist long-form writing blocks: ${JSON.stringify({ ids: allElements.map((element) => element.id).slice(0, 80) })}`);
  assert(canvasSize.width === 1260 && canvasSize.height >= 940, `Frontend blog canvas size mismatch: ${JSON.stringify(canvasSize)}`);
  assert(typeof content.customCSS === 'string' && content.customCSS.includes('--backy-smoke-blog-primary'), `Frontend blog custom CSS was not persisted: ${JSON.stringify(content.customCSS)}`);
  assert(typeof content.customJS === 'string' && content.customJS.includes('__backySmokeBlogTemplate'), `Frontend blog custom JS was not persisted: ${JSON.stringify(content.customJS)}`);
  assert(contentDocument?.metadata?.customJS?.includes('__backySmokeBlogTemplate'), `Frontend blog contentDocument custom JS missing: ${JSON.stringify(contentDocument?.metadata)}`);
  assert(contentDocument?.metadata?.templateSource === 'custom-frontend', `Frontend blog contentDocument template source missing: ${JSON.stringify(contentDocument?.metadata)}`);
  assert(contentDocument?.metadata?.templateSourceLabel === 'Custom frontend', `Frontend blog contentDocument template source label missing: ${JSON.stringify(contentDocument?.metadata)}`);
  assert(contentDocument?.metadata?.frontendDesignTemplateId === FRONTEND_BLOG_TEMPLATE_ID, `Frontend blog contentDocument frontend template id missing: ${JSON.stringify(contentDocument?.metadata)}`);
  assert(contentDocument?.themeTokenRefs?.primary === 'tokens.colors.primary', `Frontend blog theme token refs missing: ${JSON.stringify(contentDocument?.themeTokenRefs)}`);
  assert(contentDocument?.assets?.media?.[0]?.id === 'media-smoke-blog-cover', `Frontend blog asset manifest missing: ${JSON.stringify(contentDocument?.assets)}`);
  assert(contentDocument?.interactions?.timeline?.[0]?.animation === 'slide-up', `Frontend blog interaction manifest missing: ${JSON.stringify(contentDocument?.interactions)}`);
  assert(contentDocument?.dataBindings?.datasets?.[0]?.source === 'blog', `Frontend blog data bindings missing: ${JSON.stringify(contentDocument?.dataBindings)}`);
  assert(contentDocument?.editableMap?.['post.hero.title']?.field === 'props.content', `Frontend blog editable map missing: ${JSON.stringify(contentDocument?.editableMap)}`);
  assert(contentDocument?.seo?.titleTemplate === '{title} | Smoke Blog', `Frontend blog SEO manifest missing: ${JSON.stringify(contentDocument?.seo)}`);
  assert(contentDocument?.metadata?.animationTimeline?.[0]?.id === 'post-title-enter', `Frontend blog animation metadata missing: ${JSON.stringify(contentDocument?.metadata)}`);

  return {
    postId,
    slug: post.slug,
    meta: {
      frontendDesignTemplateId: post.meta?.frontendDesignTemplateId,
      templateSource: post.meta?.templateSource,
      frontendDesignTemplateName: post.meta?.frontendDesignTemplateName,
      frontendDesignSourceType: post.meta?.frontendDesignSource?.type,
      bindingHintCount: post.meta?.frontendDesignBindingHints?.length || 0,
      hasDesignState: Boolean(post.meta?.frontendDesignCustomJs && post.meta?.frontendDesignEditableMap),
    },
    content: {
      rootElementCount: elements.length,
      totalElementCount: allElements.length,
      canvasSize,
      wrapperId: wrapper.id,
      heading: heading?.props?.content,
      headingMobileOverride: heading?.responsive?.mobile,
      longFormSectionId: longFormSection?.id,
      longFormQuoteId: longFormQuote?.id,
      customCssStored: typeof content.customCSS === 'string',
      customJsStored: typeof content.customJS === 'string',
      contentTemplateSource: contentDocument?.metadata?.templateSource,
      editableMapKeys: Object.keys(contentDocument?.editableMap || {}),
    },
  };
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-blog-create-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1100',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const cleanup = async ({ client, childProcess, userDataDir, postId }) => {
  if (postId) {
    try {
      await requestApi(`/api/admin/sites/${SITE_ID}/blog/${postId}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke post ${postId}:`, error instanceof Error ? error.message : error);
    }
  }

  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
    client.close();
  }

  if (childProcess.exitCode === null && childProcess.signalCode === null) {
    childProcess.kill('SIGTERM');
    const exited = await waitForExit(childProcess);
    if (!exited) {
      childProcess.kill('SIGKILL');
      await waitForExit(childProcess, 500);
    }
  }

  fs.rmSync(userDataDir, { recursive: true, force: true });
};

const main = async () => {
  assertBlogCreateSourceContract();
  if (process.env.BACKY_BLOG_CREATE_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, guard: 'blog-create-source' }));
    return;
  }

  await withSmokeLock(`backy-frontend-design-${SITE_ID}`, async () => {
  await loginAdminApi();
  const slug = `blog-create-smoke-${Date.now().toString(36)}`;
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let postId = null;
  let originalFrontendDesign = null;

  try {
    originalFrontendDesign = await getFrontendDesign();
    await patchFrontendDesign(smokeFrontendDesignContract());
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken),
    });
    await seedBrowserAuthStorage(client, apiAdminSessionToken);

    const initialRender = await navigateToBlogCreate(client);
    const desktopVisual = await assertBlogCreateVisualState(client, 'blog create desktop', DESKTOP_VISUAL_SCREENSHOT_PATH);
    const submitBlocker = await assertSubmitBlockerState(client);
    const focusMode = await assertCanvasFocusMode(client);
    const mobileBreakpoint = await assertMobileBreakpointAuthoring(client);
    const writingStructure = await assertWritingStructureTools(client);
    const filled = await fillBlogCreateForm(client, slug);
    const readyActions = await assertBlogCreateReadyActionStatus(client, slug);
    const mediaPicker = await assertFeaturedMediaPicker(client);
    const autosave = await assertAutosaveWritten(client, slug);
    const recovery = await assertRecoveryRestore(client, slug);
    const preview = await createPreviewFromUi(client);
    postId = preview.editPath.split('/').filter(Boolean).at(-1);
    const frontendBlogPost = await assertCreatedFrontendBlogPost(postId, slug);

    await captureScreenshot(client, SCREENSHOT_PATH);

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error' && !isIgnorableBrowserLogError(event))
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    console.log(JSON.stringify({
      ok: true,
      url: `${ADMIN_BASE_URL}/blog/new?siteId=${encodeURIComponent(SITE_ID)}`,
      initialRender,
      desktopVisual: {
        screenshotPath: desktopVisual.screenshotPath,
        horizontalOverflow: desktopVisual.horizontalOverflow,
        viewport: desktopVisual.viewport,
      },
      submitBlocker,
      focusMode,
      mobileBreakpoint,
      writingStructure,
      filled,
      readyActions,
      mediaPicker,
      autosave,
      recovery,
      preview,
      frontendBlogPost,
      postId,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (originalFrontendDesign) {
      try {
        await patchFrontendDesign(originalFrontendDesign);
      } catch (error) {
        console.warn('Unable to restore original frontend design contract:', error instanceof Error ? error.message : error);
      }
    }
    await cleanup({ client, childProcess, userDataDir, postId });
  }
  });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

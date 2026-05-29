#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_SITE_DETAIL_CDP_PORT || 9387);
const SCREENSHOT_PATH = process.env.BACKY_SITE_DETAIL_SCREENSHOT || path.join(os.tmpdir(), 'backy-site-detail-smoke.png');
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertSiteDetailSourceContract = () => {
  const source = fs.readFileSync(new URL('../src/routes/sites.$siteId.tsx', import.meta.url), 'utf8');
  assert(source.includes('import { EmptyState } from "@/components/ui/EmptyState";'), 'Site detail route must use the shared EmptyState component');
  assert(source.includes('title="No frontend templates captured yet"'), 'Site detail template registry must keep the empty template title visible');
  assert(source.includes('Save a frontend design contract with page, blog, form, product, collection, or section templates to populate this registry.'), 'Site detail template registry empty state must explain how templates are captured');
  assert(source.includes('data-testid="site-template-version-readiness"'), 'Site detail template registry must expose version readiness for captured templates');
  assert(source.includes('data-testid="site-template-prepare-version-metadata"'), 'Site detail template registry must expose a version metadata preparation action');
  assert(source.includes('data-testid="site-template-copy-version-plan"'), 'Site detail template registry must expose a copyable template version action plan');
  assert(source.includes('backy.template-registry-version-action-plan.v1'), 'Site detail template version handoff must use a named action-plan schema');
  assert(
    source.includes('buildCustomFrontendAgentHandoff') &&
      source.includes('const buildAdminSiteCustomFrontendAgentHandoff =') &&
      source.includes('const siteCustomFrontendAgentHandoff = useMemo') &&
      source.includes('source: "admin-site-workspace-handoff"') &&
      source.includes('customFrontendAgentHandoff: siteCustomFrontendAgentHandoff') &&
      source.includes('data-testid="site-custom-frontend-agent-handoff"') &&
      source.includes('data-testid="site-copy-custom-frontend-agent-handoff"') &&
      source.includes('data-agent-handoff-direct={siteCustomFrontendAgentHandoff.endpoints.agentHandoff}') &&
      source.includes('data-testid="site-agent-content-entry-points"') &&
      source.includes('data-testid="site-agent-canvas-first-rule"') &&
      source.includes('const adminEntryPoints = buildCustomFrontendAgentAdminEntryPoints(siteIdParam);') &&
      source.includes('adminEntryPoints,') &&
      source.includes('siteCustomFrontendAgentHandoff.readOrder.map') &&
      source.includes('siteCustomFrontendAgentHandoff.endpoints.agentHandoff') &&
      source.includes('...baseHandoff.apiAlignment') &&
      source.includes('endpoint: `${publicSiteApiUrl}/agent-handoff`') &&
      source.includes('creationRoutes: adminEntryPoints') &&
      source.includes('renderEndpoint: `${publicSiteApiUrl}/render?path=/...`') &&
      source.includes('siteCustomFrontendAgentHandoff.contentCreation.canvasFirst.editorOutcome') &&
      source.includes('siteCustomFrontendAgentHandoff.contentCreation.canvasFirst.routeRevealGuarantee') &&
      source.includes('siteCustomFrontendAgentHandoff.designState.siteStyleSources.join') &&
      source.includes('CUSTOM_FRONTEND_AGENT_HANDOFF_DOC'),
    'Site detail must expose the custom frontend agent handoff with docs, endpoint metadata, and all content creation entry points.',
  );
  assert(source.includes('Template versioning'), 'Site workspace readiness must include template versioning as a publish/handoff check');
  assert(
    source.includes('frontendDesignTemplateId: template.id') &&
      source.includes('templateSource: "custom-frontend"') &&
      source.includes('focus: "canvas"') &&
      !source.includes('designTemplate: template.id'),
    'Site detail template registry page/blog actions must deep-link with frontendDesignTemplateId and templateSource, focusing page templates into canvas mode',
  );
  assert(
    source.includes('const siteWorkspaceCommandActionStatusId = "site-workspace-command-action-status";') &&
      source.includes('const siteWorkspaceCommandSecondaryActionStatusId = "site-workspace-command-secondary-action-status";') &&
      source.includes('const siteWorkspaceCommandActionStatus = [') &&
      source.includes('const siteWorkspaceCommandSecondaryActionStatus = [') &&
      source.includes('data-testid="site-workspace-command-actions"') &&
      source.includes('data-testid="site-workspace-command-action-status"') &&
      source.includes('data-testid="site-workspace-command-secondary-action-status"') &&
      source.includes('data-testid="site-workspace-primary-actions"') &&
      source.includes('data-testid="site-workspace-open-public-site"') &&
      source.includes('data-testid="site-workspace-site-settings"') &&
      source.includes('data-testid="site-workspace-secondary-actions"') &&
      source.includes('data-action-status={siteWorkspaceCommandSecondaryActionStatus}') &&
      source.includes('data-target-site-id={siteApiId || siteId}') &&
      source.includes('data-default-collapsed="true"') &&
      source.includes('data-testid="site-workspace-more-actions"') &&
      source.includes('data-testid="site-workspace-secondary-action-menu"') &&
      source.includes('data-testid="site-workspace-copy-api-url"') &&
      source.includes('data-testid="site-workspace-copy-handoff"') &&
      source.includes('data-testid="site-workspace-download-json"'),
    'Site detail command center must lead with public/settings actions and keep API/handoff exports behind collapsed More actions',
  );
  assert(source.includes('title="No site audit events yet"'), 'Site detail audit panel must keep the empty audit title visible');
  assert(source.includes('Save navigation, redirects, SEO, frontend design, or site settings to create request-id activity for this site.'), 'Site detail audit empty state must explain which actions populate activity');
  assert(
    source.includes('const auditLoadRequestRef = useRef(0);') &&
      source.includes('hydrated: false') &&
      source.includes('const isAuditInitialLoading =') &&
      source.includes('data-testid="site-audit-panel"') &&
      source.includes('data-hydrated={String(auditState.hydrated)}') &&
      source.includes('data-initial-loading={String(isAuditInitialLoading)}') &&
      source.includes('data-testid="site-audit-background-refresh"') &&
      source.includes('{isAuditInitialLoading ? (') &&
      !source.includes('{auditState.loading ? ('),
    'Site detail audit panel must keep existing activity visible during background refresh after hydration.',
  );
  assert(
    source.includes('const readinessLoadRequestRef = useRef(0);') &&
      source.includes('const [readinessHydrated, setReadinessHydrated] = useState(false);') &&
      source.includes('const isReadinessInitialLoading =') &&
      source.includes('data-testid="site-readiness-panel"') &&
      source.includes('data-hydrated={String(readinessHydrated)}') &&
      source.includes('data-initial-loading={String(isReadinessInitialLoading)}') &&
      source.includes('data-testid="site-readiness-background-refresh"') &&
      source.includes('Refreshing publish readiness in the background. Current') &&
      source.includes('!readinessError || readinessHydrated'),
    'Site detail readiness panel must keep existing readiness results visible during background refresh/error after hydration.',
  );
  assert(source.includes('title="No webhook endpoints configured"'), 'Site detail webhooks panel must keep the empty webhook title visible');
  assert(source.includes('Add an endpoint to deliver site lifecycle, navigation, SEO, and form events to downstream systems.'), 'Site detail webhooks empty state must explain how to configure delivery');
  assert(
    source.includes('const webhookLoadRequestRef = useRef(0);') &&
      source.includes('!webhookState.hydrated') &&
      source.includes('!webhookState.errorMessage') &&
      source.includes('Latest webhook configuration loaded in the background. Unsaved local edits were preserved.') &&
      source.includes('const isWebhookInitialLoading =') &&
      source.includes('const isWebhookConfigurationDisabled =') &&
      source.includes('const isWebhookSaveDisabled =') &&
      source.includes('data-hydrated={String(webhookState.hydrated)}') &&
      source.includes('data-dirty={String(webhookState.dirty)}') &&
      source.includes('data-draft-disabled={String(isWebhookConfigurationDisabled)}') &&
      source.includes('data-testid="site-webhooks-background-refresh"') &&
      source.includes('{isWebhookInitialLoading ? (') &&
      !source.includes('webhookState.loading || webhookState.saving || !canConfigureSite'),
    'Site detail webhooks controls must stay visible/editable after hydration during background refresh and preserve dirty local edits.',
  );
  assert(source.includes('title="No redirect or 410 rules configured"'), 'Site detail redirects panel must keep the empty redirects title visible');
  assert(source.includes('Add a redirect rule to preserve old URLs, point traffic to new content, or mark retired paths as gone.'), 'Site detail redirects empty state must explain redirect setup');
  assert(
    source.includes('const redirectLoadRequestRef = useRef(0);') &&
      source.includes('const redirectPreviewRequestRef = useRef(0);') &&
      source.includes('!redirectState.hydrated') &&
      source.includes('!redirectState.errorMessage') &&
      source.includes('Latest redirects loaded in the background. Unsaved local edits were preserved.') &&
      source.includes('const isRedirectInitialLoading =') &&
      source.includes('const isRedirectPreviewDisabled =') &&
      source.includes('const isRedirectSaveDisabled =') &&
      source.includes('data-hydrated={String(redirectState.hydrated)}') &&
      source.includes('data-dirty={String(redirectState.dirty)}') &&
      source.includes('data-draft-disabled={String(areRedirectEditsDisabled)}') &&
      source.includes('data-testid="site-redirects-background-refresh"') &&
      source.includes('{isRedirectInitialLoading ? (') &&
      !source.includes('redirectState.loading ||\\n    redirectState.saving ||\\n    redirectState.previewing') &&
      !source.includes('disabled={!siteApiId || areRedirectEditsDisabled}'),
    'Site detail redirect controls must stay visible/editable after hydration during background refresh and avoid stale preview locks.',
  );
  assert(source.includes('title="No route-level SEO overrides"'), 'Site detail SEO route override panel must keep the empty override title visible');
  assert(source.includes('Add route overrides for custom canonical paths, campaign landing pages, and dynamic collection route SEO.'), 'Site detail SEO route override empty state must explain override use cases');
  assert(
    source.includes('const seoLoadRequestRef = useRef(0);') &&
      source.includes('!seoState.hydrated') &&
      source.includes('!seoState.errorMessage') &&
      source.includes('Latest SEO settings loaded in the background. Unsaved local edits were preserved.') &&
      source.includes('const isSeoInitialLoading =') &&
      source.includes('const isSeoSaveDisabled =') &&
      source.includes('data-hydrated={String(seoState.hydrated)}') &&
      source.includes('data-dirty={String(seoState.dirty)}') &&
      source.includes('data-draft-disabled={String(areSeoEditsDisabled)}') &&
      source.includes('data-testid="site-seo-background-refresh"') &&
      source.includes('disabled={isSeoSaveDisabled}') &&
      !source.includes('seoState.loading || seoState.saving || !canConfigureSite') &&
      !source.includes('disabled={!siteApiId || areSeoEditsDisabled}'),
    'Site detail SEO controls must stay editable after hydration during background refresh and preserve dirty local edits.',
  );
  assert(source.includes('title="No navigation links yet"'), 'Site detail navigation editor must keep the empty menu title visible');
  assert(source.includes('Add route or URL links to build this menu for custom frontend navigation.'), 'Site detail navigation empty state must explain menu setup');
  assert(
    source.includes('const navigationLoadRequestRef = useRef(0);') &&
      source.includes('const applyNavigationEditorResponse =') &&
      source.includes('!navigationState.hydrated') &&
      source.includes('!navigationState.errorMessage') &&
      source.includes('Latest navigation loaded in the background. Unsaved local edits were preserved.') &&
      source.includes('const isNavigationDraftDisabled =') &&
      source.includes('data-hydrated={String(navigationState.hydrated)}') &&
      source.includes('data-dirty={String(navigationState.dirty)}') &&
      source.includes('data-draft-disabled={String(isNavigationDraftDisabled)}') &&
      source.includes('data-testid="site-navigation-background-refresh"') &&
      source.includes('loading={isNavigationInitialLoading}') &&
      source.includes('disabled={isNavigationDraftDisabled}') &&
      !source.includes('loading={navigationState.loading || !canConfigureSite}'),
    'Site detail navigation draft controls must stay visible/editable after hydration during background refresh and preserve dirty local edits.',
  );
  assert(
    source.includes('hydrated: Boolean(response)') &&
      source.includes('dirty: false') &&
      source.includes('const frontendDesignLoadRequestRef = useRef(0);') &&
      source.includes('if (!currentAdmin || isPermissionMatrixPending || (!permissionMatrix && !permissionError))') &&
      source.includes('!frontendDesignState.hydrated') &&
      source.includes('!frontendDesignState.errorMessage') &&
      source.includes('preserveDirtyDraft') &&
      source.includes('Unsaved local edits were preserved') &&
      source.includes('const isFrontendDesignDraftDisabled =') &&
      source.includes('data-hydrated={String(frontendDesignState.hydrated)}') &&
      source.includes('data-dirty={String(frontendDesignState.dirty)}') &&
      source.includes('data-draft-disabled={String(isFrontendDesignDraftDisabled)}') &&
      source.includes('data-testid="site-frontend-design-background-refresh"') &&
      !source.includes('disabled={frontendDesignState.loading || !canConfigureSite}'),
    'Site detail frontend-design draft controls must stay editable after hydration during background refresh and preserve dirty local edits.',
  );
  assert(source.includes('title="No form selected"'), 'Site detail forms workspace must keep the empty form selection title visible');
  assert(source.includes('Create a standalone form or choose an existing form from the Active Form selector to edit its fields and delivery settings.'), 'Site detail form selection empty state must explain how to start editing');
  assert(source.includes('title="No submissions in the selected state"'), 'Site detail submissions panel must keep the filtered empty submissions title visible');
  assert(source.includes('Submissions that match the active form and status filter will appear here after visitors complete the form.'), 'Site detail submissions empty state must explain filtered results');
  assert(source.includes('title="No contacts in the selected state"'), 'Site detail contacts panel must keep the filtered empty contacts title visible');
  assert(source.includes('Lead-share contacts that match the active form and status filter will appear here.'), 'Site detail contacts empty state must explain filtered contacts');
  assert(
    source.includes('const submissionLoadRequestRef = useRef(0);') &&
      source.includes('const contactLoadRequestRef = useRef(0);') &&
      source.includes('const [submissionsHydrated, setSubmissionsHydrated] = useState(false);') &&
      source.includes('const [contactsHydrated, setContactsHydrated] = useState(false);') &&
      source.includes('const isSubmissionInitialLoading =') &&
      source.includes('const isContactInitialLoading =') &&
      source.includes('data-testid="site-submissions-panel"') &&
      source.includes('data-hydrated={String(submissionsHydrated)}') &&
      source.includes('data-testid="site-submissions-background-refresh"') &&
      source.includes('{isSubmissionInitialLoading ? (') &&
      source.includes('data-testid="site-contacts-panel"') &&
      source.includes('data-hydrated={String(contactsHydrated)}') &&
      source.includes('data-testid="site-contacts-background-refresh"') &&
      source.includes('{isContactInitialLoading ? (') &&
      !source.includes('{state.submissionLoading ? (') &&
      !source.includes('{state.contactLoading ? ('),
    'Site detail submission/contact queues must keep existing rows visible during background refresh after hydration.',
  );
  assert(source.includes('title="No comments in the selected state"'), 'Site detail comments panel must keep the filtered empty comments title visible');
  assert(source.includes('Comments that match the active moderation status will appear here for review and bulk actions.'), 'Site detail comments empty state must explain filtered moderation results');
  assert(
    source.includes('const workflowLoadRequestRef = useRef(0);') &&
      source.includes('const [workflowHydrated, setWorkflowHydrated] = useState(false);') &&
      source.includes('const formBuilderDraftRef = useRef<FormDefinition | null>(null);') &&
      source.includes('const savedFormBuilderDraftRef = useRef<FormDefinition | null>(null);') &&
      source.includes('const isWorkflowInitialLoading =') &&
      source.includes('Latest form definition loaded in the background. Unsaved local edits were preserved.') &&
      source.includes('data-hydrated={String(workflowHydrated)}') &&
      source.includes('data-dirty={String(formBuilderDirty)}') &&
      source.includes('data-draft-disabled={String(isFormBuilderDisabled)}') &&
      source.includes('data-testid="site-form-builder-background-refresh"') &&
      source.includes('{isWorkflowInitialLoading ? (') &&
      !source.includes('const isFormViewDisabled = state.workflowLoading || !canViewForms;') &&
      !source.includes('state.workflowLoading;'),
    'Site detail form-builder controls must stay editable after workflow hydration during background refresh and preserve dirty local edits.',
  );
  assert(
    source.includes('const selectedCommentSet = useMemo') &&
      source.includes('const selectedLoadedComments = useMemo') &&
      source.includes('const hiddenSelectedCommentCount = Math.max') &&
      source.includes('const toggleLoadedCommentSelection') &&
      source.includes('data-testid="site-detail-comments-selection-summary"') &&
      source.includes('data-testid="site-detail-comments-clear-selection"') &&
      source.includes('outside this loaded view'),
    'Site detail comments moderation must summarize loaded selected comments and expose loaded-selection controls',
  );
  assert(
    source.includes('const commentsLoadRequestRef = useRef(0);') &&
      source.includes('const [commentsHydrated, setCommentsHydrated] = useState(false);') &&
      source.includes('const isCommentInitialLoading =') &&
      source.includes('data-testid="site-comments-moderation-panel"') &&
      source.includes('data-hydrated={String(commentsHydrated)}') &&
      source.includes('data-view-disabled={String(isCommentViewDisabled)}') &&
      source.includes('data-testid="site-comments-background-refresh"') &&
      source.includes('{isCommentInitialLoading ? (') &&
      !source.includes('const isCommentViewDisabled = state.commentsLoading || !canViewComments;'),
    'Site detail comments moderation controls must stay usable after hydration during background comment refresh.',
  );
  assert(
    source.includes('const selectedCommentIds = selectedLoadedCommentIds') &&
      source.includes('commentIds: selectedCommentIds'),
    'Site detail bulk comment moderation must apply only to selected loaded comments',
  );
  assert(source.includes('import { Notice } from "@/components/ui/Notice";'), 'Site detail workflow errors must use the shared Notice component');
  assert(source.includes('Workflow automation needs the Backy public API server'), 'Site detail workflow errors must explain public API setup/offline state');
  assert(source.includes('VITE_BACKY_PUBLIC_API_BASE_URL'), 'Site detail workflow setup message must name the public API base URL env var');
  assert((source.match(/readWorkflowApiPayload\(/g) || []).length >= 6, 'Site detail workflow public API calls must use the guarded JSON reader');
  assert(source.includes('data-testid="site-workflow-error"'), 'Site detail workflow error notice must expose a stable test id');
  assert(!source.includes('const payload = await response.json();'), 'Site detail workflow public API calls must not leak raw JSON parser errors');
  assert(
    source.includes('buildSiteSettingsInlineErrors') &&
      source.includes('const [siteSettingsSubmitted, setSiteSettingsSubmitted] = useState(false);') &&
      source.includes('data-testid="site-settings-form"') &&
      source.includes('noValidate') &&
      source.includes('data-testid="site-settings-inline-error"') &&
      source.includes('data-testid="site-settings-name-error"') &&
      source.includes('data-testid="site-settings-slug-error"') &&
      source.includes('data-testid="site-settings-custom-domain-error"') &&
      source.includes('aria-invalid={Boolean(') &&
      source.includes('aria-describedby=') &&
      source.includes('Fix site settings fields before saving.') &&
      source.includes('normalizeSiteSettingsDomain(formData.customDomain) || null'),
    'Site detail settings form must use source-guarded inline validation for saved site identity and custom domain updates',
  );
  assert(
    source.includes('const commentPolicyLoadRequestRef = useRef(0);') &&
      source.includes('const [commentPolicyHydrated, setCommentPolicyHydrated] = useState(false);') &&
      source.includes('const isCommentPolicyInitialLoading =') &&
      source.includes('const isSiteSettingsBusy = isLoading;') &&
      !source.includes('const isSiteSettingsBusy = isLoading || commentPolicySaving;') &&
      source.includes('Latest comment policy loaded in the background. Unsaved local edits were preserved.') &&
      source.includes('data-hydrated={String(commentPolicyHydrated)}') &&
      source.includes('data-dirty={String(commentPolicyDirty)}') &&
      source.includes('data-draft-disabled={String(isCommentPolicyDisabled)}') &&
      source.includes('data-testid="site-comment-policy-background-refresh"') &&
      source.includes('{isCommentPolicyInitialLoading ? (') &&
      !source.includes('commentPolicyLoading || commentPolicySaving || !canConfigureComments'),
    'Site detail comment policy controls must stay editable after hydration during background refresh and preserve dirty local edits.',
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
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
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
  const smokeMfaCode = process.env.BACKY_SITE_DETAIL_SMOKE_MFA_CODE
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

const createUser = async (input) => {
  const payload = await requestApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const user = payload.data?.user || payload.user;
  assert(user?.id, `Create site detail RBAC user did not return a user: ${JSON.stringify(payload).slice(0, 500)}`);
  return user;
};

const createInviteToken = async (userId) => {
  const payload = await requestApi(`/api/admin/users/${userId}/invite-link`, {
    method: 'POST',
    body: JSON.stringify({ expiresInMinutes: 60 }),
  });
  const invite = payload.data?.invite || payload.invite;
  assert(invite?.token, `Invite link endpoint did not return a token: ${JSON.stringify(payload).slice(0, 500)}`);
  return invite;
};

const acceptInviteToken = async (token) => {
  const payload = await requestApi('/api/admin/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  const session = payload.data?.session;
  assert(session?.token, `Invite accept did not return a user session: ${JSON.stringify(payload).slice(0, 500)}`);
  return session;
};

const deleteUser = async (userId) => {
  if (!userId) return;
  await requestApi(`/api/admin/users/${userId}`, { method: 'DELETE' });
};

const updateUser = async (userId, input) => {
  const payload = await requestApi(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.user || payload.user;
};

const listSites = async () => {
  const payload = await requestApi('/api/admin/sites?includeUnpublished=true');
  return payload.data?.sites || payload.sites || [];
};

const getSettings = async () => {
  const payload = await requestApi('/api/admin/settings');
  return payload.data?.settings || payload.settings || {};
};

const updateSettings = async (input) => {
  const payload = await requestApi('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.settings || payload.settings || {};
};

const temporarilyAllowSiteCreationQuota = async (extraSites = 1) => {
  const settings = await getSettings();
  const sites = await listSites();
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const currentSiteLimit = Number(originalCommerce.siteLimit || 0);
  const requiredSiteLimit = sites.length + extraSites;

  if (originalCommerce.overageMode !== 'block' || currentSiteLimit >= requiredSiteLimit) {
    return null;
  }

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        siteLimit: requiredSiteLimit,
        overageMode: 'warn',
      },
    },
  });

  return originalIntegrations;
};

const createSite = async ({ name, slug, customDomain }) => {
  const payload = await requestApi('/api/admin/sites', {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      customDomain,
      description: 'Temporary site detail smoke workspace.',
      status: 'draft',
    }),
  });
  const site = payload.data?.site || payload.site;
  assert(site?.id, `Create site did not return a site: ${JSON.stringify(payload).slice(0, 500)}`);
  return site;
};

const createPage = async (siteId, { title, slug, description }) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      slug,
      status: 'published',
      description,
      content: [],
      meta: {
        title,
        description,
        canonical: `/${slug}`,
      },
    }),
  });
  const page = payload.data?.page || payload.page;
  assert(page?.id, `Create site detail SEO page did not return a page: ${JSON.stringify(payload).slice(0, 500)}`);
  return page;
};

const deletePage = async (siteId, pageId) => {
  if (!siteId || !pageId) return;
  await requestApi(`/api/admin/sites/${siteId}/pages/${pageId}`, { method: 'DELETE' });
};

const deleteSite = async (siteId, sessionToken = apiAdminSessionToken) => {
  if (!siteId) return;
  await requestApi(`/api/admin/sites/${siteId}`, {
    method: 'DELETE',
    headers: sessionToken ? { authorization: `Bearer ${sessionToken}` } : {},
  });
};

const assertAdminSiteDeleteDenied = async (siteId) => {
  const response = await fetch(`${API_BASE_URL}/api/admin/sites/${siteId}`, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${apiAdminSessionToken}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  assert(response.status === 403, `Admin without sites.delete should not delete sites, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.error?.code === 'FORBIDDEN_PERMISSION', `Site delete denial should return FORBIDDEN_PERMISSION: ${JSON.stringify(payload).slice(0, 500)}`);
};

const findSiteBySlug = async (slug) => {
  const sites = await listSites();
  return sites.find((site) => site.slug === slug) || null;
};

const waitForSiteMissing = async (slug) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const site = await findSiteBySlug(slug);
    if (!site) {
      return;
    }
    await sleep(250);
  }

  throw new Error(`Temporary site ${slug} still exists after cleanup`);
};

const getNavigation = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/navigation`);
  return payload.data?.navigation || payload.navigation;
};

const getRedirects = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/redirects`);
  return payload.data?.redirects || payload.redirects;
};

const getSeo = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/seo`);
  return payload.data?.seo || payload.seo;
};

const getPublicSeo = async (siteId) => {
  const payload = await requestApi(`/api/sites/${siteId}/seo`);
  return payload.data || payload;
};

const getFrontendDesign = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/frontend-design`);
  return payload.data?.frontendDesign || payload.frontendDesign;
};

const getForms = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/forms`);
  return payload.data?.forms || payload.forms || [];
};

const getSite = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}`);
  return payload.data?.site || payload.site;
};

const getSiteAuditLogs = async (siteId) => {
  const payload = await requestApi(`/api/admin/audit-logs?${new URLSearchParams({
    siteId,
    limit: '50',
  }).toString()}`);
  return payload.data?.logs || payload.logs || [];
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

const authStorageScript = (
  sessionToken,
  user = { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' },
) => `
localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({
  state: {
    user,
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

const navigate = async (client, url, readyExpression, description) => {
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, readyExpression);
    if (state.ready) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const navigateToSites = (client, siteName) => navigate(
  client,
  `${ADMIN_BASE_URL}/sites`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="sites-command-center"]')) &&
      document.body?.innerText?.includes(${JSON.stringify(siteName)}),
    body: document.body?.innerText?.slice(0, 900) || '',
  }))()`,
  'Sites page',
);

const navigateToSiteDetail = (client, siteId, siteName) => navigate(
  client,
  `${ADMIN_BASE_URL}/sites/${encodeURIComponent(siteId)}`,
  `(() => ({
      ready: Boolean(document.querySelector('[data-testid="site-workspace-command-center"]')) &&
      Boolean(document.querySelector('[data-testid="site-domain-verification-panel"]')) &&
      Boolean(document.querySelector('[data-testid="site-theme-publish-panel"]')) &&
      Boolean(document.querySelector('[data-testid="site-webhooks-panel"]')) &&
      Boolean(document.querySelector('[data-testid="site-navigation-panel"]')) &&
      Boolean(document.querySelector('[data-testid="site-redirects-panel"]')) &&
      Boolean(document.querySelector('[data-testid="site-seo-panel"]')) &&
      Boolean(document.querySelector('[data-testid="site-form-builder-panel"]')) &&
      document.body?.innerText?.includes(${JSON.stringify(siteName)}),
    body: document.body?.innerText?.slice(0, 1200) || '',
    path: window.location.pathname,
  }))()`,
  'Site detail page',
);

const setInputValue = `
  const setNativeValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
`;

const clickButtonByText = async (client, selector, text) => {
  const result = await evaluate(client, `(() => {
    const root = document.querySelector(${JSON.stringify(selector)});
    if (!root) return { ok: false, reason: 'root-missing' };
    const button = Array.from(root.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(text)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'button-missing',
        buttons: Array.from(root.querySelectorAll('button')).map((candidate) => (candidate.textContent || '').replace(/\\s+/g, ' ').trim()).slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled', text: button.textContent || '' };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to click ${text}: ${JSON.stringify(result)}`);
};

const waitForText = async (client, selector, text, description) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      return {
        ready: Boolean(root && (root.textContent || '').includes(${JSON.stringify(text)})),
        text: root?.textContent?.replace(/\\s+/g, ' ').slice(0, 900) || '',
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`${description} did not appear: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForButtonEnabled = async (client, selector, text, description) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      const button = root
        ? Array.from(root.querySelectorAll('button')).find((candidate) => (
            (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(text)}
          ))
        : null;
      return {
        ready: button instanceof HTMLButtonElement && !button.disabled,
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        title: button instanceof HTMLButtonElement ? button.getAttribute('title') : null,
        text: root?.textContent?.replace(/\\s+/g, ' ').slice(0, 1200) || '',
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`${description} did not become enabled: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForWebhooksEditorReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-webhooks-panel"]');
      const text = section?.textContent || '';
      const addButton = section
        ? Array.from(section.querySelectorAll('button')).find((candidate) => (
            (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Add endpoint'
          ))
        : null;
      const draftControls = section
        ? Array.from(section.querySelectorAll('input, textarea')).filter((control) => (
            control instanceof HTMLInputElement ||
            control instanceof HTMLTextAreaElement
          ))
        : [];
      const disabledDraftControls = draftControls.filter((control) => control.disabled);
      return {
        ready: Boolean(section) &&
          section.getAttribute('data-hydrated') === 'true' &&
          section.getAttribute('data-draft-disabled') === 'false' &&
          addButton instanceof HTMLButtonElement &&
          !addButton.disabled &&
          draftControls.length >= 1 &&
          disabledDraftControls.length === 0 &&
          !text.includes('Loading webhooks...'),
        hydrated: section?.getAttribute('data-hydrated'),
        draftDisabled: section?.getAttribute('data-draft-disabled'),
        addDisabled: addButton instanceof HTMLButtonElement ? addButton.disabled : null,
        draftControlCount: draftControls.length,
        disabledDraftControlCount: disabledDraftControls.length,
        text: text.replace(/\\s+/g, ' ').slice(0, 1000),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Webhooks editor did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForRedirectsEditorReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-redirects-panel"]');
      const text = section?.textContent || '';
      const addButton = section
        ? Array.from(section.querySelectorAll('button')).find((candidate) => (
            (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Add rule'
          ))
        : null;
      return {
        ready: Boolean(section) &&
          section.getAttribute('data-hydrated') === 'true' &&
          section.getAttribute('data-draft-disabled') === 'false' &&
          addButton instanceof HTMLButtonElement &&
          !addButton.disabled &&
          !text.includes('Loading redirect rules...'),
        hydrated: section?.getAttribute('data-hydrated'),
        draftDisabled: section?.getAttribute('data-draft-disabled'),
        addDisabled: addButton instanceof HTMLButtonElement ? addButton.disabled : null,
        text: text.replace(/\\s+/g, ' ').slice(0, 1000),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Redirects editor did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForSeoEditorReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-seo-panel"]');
      const text = section?.textContent || '';
      const saveButton = section
        ? Array.from(section.querySelectorAll('button')).find((candidate) => (
            (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Save SEO'
          ))
        : null;
      const addOverrideButton = section
        ? Array.from(section.querySelectorAll('button')).find((candidate) => (
            (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Add route override'
          ))
        : null;
      const draftControls = section
        ? Array.from(section.querySelectorAll('select, input, textarea')).filter((control) => (
            control instanceof HTMLSelectElement ||
            control instanceof HTMLInputElement ||
            control instanceof HTMLTextAreaElement
          ))
        : [];
      const disabledDraftControls = draftControls.filter((control) => control.disabled);
      return {
        ready: Boolean(section) &&
          section.getAttribute('data-hydrated') === 'true' &&
          section.getAttribute('data-draft-disabled') === 'false' &&
          saveButton instanceof HTMLButtonElement &&
          !saveButton.disabled &&
          addOverrideButton instanceof HTMLButtonElement &&
          !addOverrideButton.disabled &&
          draftControls.length >= 10 &&
          disabledDraftControls.length === 0 &&
          !text.includes('Loading SEO'),
        hydrated: section?.getAttribute('data-hydrated'),
        draftDisabled: section?.getAttribute('data-draft-disabled'),
        saveDisabled: saveButton instanceof HTMLButtonElement ? saveButton.disabled : null,
        addOverrideDisabled: addOverrideButton instanceof HTMLButtonElement ? addOverrideButton.disabled : null,
        draftControlCount: draftControls.length,
        disabledDraftControlCount: disabledDraftControls.length,
        text: text.replace(/\\s+/g, ' ').slice(0, 1000),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`SEO editor did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForFormBuilderPanelReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-form-builder-panel"]');
      const text = section?.textContent || '';
      const newFormButton = section
        ? Array.from(section.querySelectorAll('button')).find((candidate) => (
            (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'New form'
          ))
        : null;
      return {
        ready: Boolean(section) &&
          section.getAttribute('data-hydrated') === 'true' &&
          section.getAttribute('data-draft-disabled') === 'false' &&
          newFormButton instanceof HTMLButtonElement &&
          !newFormButton.disabled &&
          !text.includes('Loading form workflow...'),
        hydrated: section?.getAttribute('data-hydrated'),
        draftDisabled: section?.getAttribute('data-draft-disabled'),
        newFormDisabled: newFormButton instanceof HTMLButtonElement ? newFormButton.disabled : null,
        text: text.replace(/\\s+/g, ' ').slice(0, 1000),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Form builder panel did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForFormBuilderEditorReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-form-builder-panel"]');
      const text = section?.textContent || '';
      const controls = [
        section?.querySelector('[aria-label="Site form title"]'),
        section?.querySelector('[aria-label="Site form machine name"]'),
        section?.querySelector('[aria-label="Site form description"]'),
        section?.querySelector('[aria-label="Site form audience"]'),
        section?.querySelector('[aria-label="Site form moderation"]'),
        section?.querySelector('[aria-label="Site form success message"]'),
      ];
      const controlsEnabled = controls.every((control) => (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) && !control.disabled);
      return {
        ready: Boolean(section) &&
          section.getAttribute('data-hydrated') === 'true' &&
          section.getAttribute('data-draft-disabled') === 'false' &&
          controlsEnabled &&
          !text.includes('Loading form workflow...'),
        hydrated: section?.getAttribute('data-hydrated'),
        draftDisabled: section?.getAttribute('data-draft-disabled'),
        controlsEnabled,
        text: text.replace(/\\s+/g, ' ').slice(0, 1000),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Form builder editor did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForFormQueuesReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const submissions = document.querySelector('[data-testid="site-submissions-panel"]');
      const contacts = document.querySelector('[data-testid="site-contacts-panel"]');
      const submissionsText = submissions?.textContent || '';
      const contactsText = contacts?.textContent || '';
      const submissionsReload = submissions
        ? Array.from(submissions.querySelectorAll('button')).find((candidate) => (
            (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Reload'
          ))
        : null;
      const contactsReload = contacts
        ? Array.from(contacts.querySelectorAll('button')).find((candidate) => (
            (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Reload'
          ))
        : null;
      return {
        ready: Boolean(submissions) &&
          Boolean(contacts) &&
          submissions.getAttribute('data-hydrated') === 'true' &&
          contacts.getAttribute('data-hydrated') === 'true' &&
          submissions.getAttribute('data-initial-loading') === 'false' &&
          contacts.getAttribute('data-initial-loading') === 'false' &&
          submissionsReload instanceof HTMLButtonElement &&
          !submissionsReload.disabled &&
          contactsReload instanceof HTMLButtonElement &&
          !contactsReload.disabled &&
          !submissionsText.includes('Loading submissions...') &&
          !contactsText.includes('Loading contacts...'),
        submissionsHydrated: submissions?.getAttribute('data-hydrated'),
        contactsHydrated: contacts?.getAttribute('data-hydrated'),
        submissionsInitialLoading: submissions?.getAttribute('data-initial-loading'),
        contactsInitialLoading: contacts?.getAttribute('data-initial-loading'),
        submissionsReloadDisabled: submissionsReload instanceof HTMLButtonElement ? submissionsReload.disabled : null,
        contactsReloadDisabled: contactsReload instanceof HTMLButtonElement ? contactsReload.disabled : null,
        submissionsText: submissionsText.replace(/\\s+/g, ' ').slice(0, 500),
        contactsText: contactsText.replace(/\\s+/g, ' ').slice(0, 500),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Form queues did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForCommentPolicyEditorReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-comment-policy-panel"]');
      const text = section?.textContent || '';
      const findCheckbox = (labelText) => Array.from(section?.querySelectorAll('label') || []).find((label) => (
        (label.textContent || '').includes(labelText)
      ))?.querySelector('input[type="checkbox"]');
      const requireEmail = findCheckbox('Require email');
      const reports = findCheckbox('Enable reports');
      const moderation = section?.querySelector('select[aria-label="Site default comment moderation"]');
      const sort = section?.querySelector('select[aria-label="Site default comment sort"]');
      const closed = section?.querySelector('input[aria-label="Site comment closed message"]');
      const blockedTerms = section?.querySelector('textarea[aria-label="Site comment blocked terms"]');
      const controls = [requireEmail, reports, moderation, sort, closed, blockedTerms];
      const controlsEnabled = controls.every((control) => (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) && !control.disabled);
      return {
        ready: Boolean(section) &&
          section.getAttribute('data-hydrated') === 'true' &&
          section.getAttribute('data-draft-disabled') === 'false' &&
          controlsEnabled &&
          !text.includes('Loading comment policy...'),
        hydrated: section?.getAttribute('data-hydrated'),
        draftDisabled: section?.getAttribute('data-draft-disabled'),
        controlsEnabled,
        text: text.replace(/\\s+/g, ' ').slice(0, 1000),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Comment policy editor did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForCommentsModerationReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-comments-moderation-panel"]');
      const text = section?.textContent || '';
      const status = section?.querySelector('select[aria-label="Site comment status filter"]');
      const target = section?.querySelector('select[aria-label="Site comment target filter"]');
      const targetId = section?.querySelector('input[aria-label="Site comment target id filter"]');
      const requestId = section?.querySelector('input[aria-label="Site comment request id filter"]');
      const search = section?.querySelector('input[aria-label="Site comment search filter"]');
      const controls = [status, target, targetId, requestId, search];
      const controlsEnabled = controls.every((control) => (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement
      ) && !control.disabled);
      return {
        ready: Boolean(section) &&
          section.getAttribute('data-hydrated') === 'true' &&
          section.getAttribute('data-view-disabled') === 'false' &&
          controlsEnabled &&
          !text.includes('Loading comments...'),
        hydrated: section?.getAttribute('data-hydrated'),
        viewDisabled: section?.getAttribute('data-view-disabled'),
        controlsEnabled,
        text: text.replace(/\\s+/g, ' ').slice(0, 1000),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Comments moderation panel did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForSiteAuditPanelReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-audit-panel"]');
      const text = section?.textContent || '';
      const refreshButton = section
        ? Array.from(section.querySelectorAll('button')).find((candidate) => (
            (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Refresh activity'
          ))
        : null;
      return {
        ready: Boolean(section) &&
          section.getAttribute('data-hydrated') === 'true' &&
          section.getAttribute('data-initial-loading') === 'false' &&
          refreshButton instanceof HTMLButtonElement &&
          !refreshButton.disabled &&
          !text.includes('Loading site audit activity...'),
        hydrated: section?.getAttribute('data-hydrated'),
        initialLoading: section?.getAttribute('data-initial-loading'),
        refreshDisabled: refreshButton instanceof HTMLButtonElement ? refreshButton.disabled : null,
        text: text.replace(/\\s+/g, ' ').slice(0, 1000),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Site audit panel did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForReadinessPanelReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-readiness-panel"]');
      const text = section?.textContent || '';
      const refreshButton = section
        ? Array.from(section.querySelectorAll('button')).find((candidate) => (
            (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Refresh'
          ))
        : null;
      return {
        ready: Boolean(section) &&
          section.getAttribute('data-hydrated') === 'true' &&
          section.getAttribute('data-initial-loading') === 'false' &&
          refreshButton instanceof HTMLButtonElement &&
          !refreshButton.disabled &&
          text.includes('Publish readiness'),
        hydrated: section?.getAttribute('data-hydrated'),
        initialLoading: section?.getAttribute('data-initial-loading'),
        refreshDisabled: refreshButton instanceof HTMLButtonElement ? refreshButton.disabled : null,
        text: text.replace(/\\s+/g, ' ').slice(0, 1000),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Readiness panel did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForNavigationEditorReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-navigation-panel"]');
      const text = section?.textContent || '';
      const draftControls = section
        ? Array.from(section.querySelectorAll('select, input, textarea')).filter((control) => (
            control instanceof HTMLSelectElement ||
            control instanceof HTMLInputElement ||
            control instanceof HTMLTextAreaElement
          ))
        : [];
      const disabledDraftControls = draftControls.filter((control) => control.disabled);
      return {
        ready: Boolean(section) &&
          section.getAttribute('data-hydrated') === 'true' &&
          section.getAttribute('data-draft-disabled') === 'false' &&
          text.includes('Primary menu') &&
          text.includes('Footer menu') &&
          draftControls.length >= 8 &&
          disabledDraftControls.length === 0 &&
          !text.includes('Loading navigation...'),
        hydrated: section?.getAttribute('data-hydrated'),
        draftDisabled: section?.getAttribute('data-draft-disabled'),
        draftControlCount: draftControls.length,
        disabledDraftControlCount: disabledDraftControls.length,
        text: text.replace(/\\s+/g, ' ').slice(0, 1000),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Navigation editor did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const assertSiteDetailLayout = async (client, siteName) => {
  let layout = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    layout = await evaluate(client, `(() => {
    const body = document.body?.innerText || '';
    const text = document.body?.textContent || body;
    const frontendPanel = document.querySelector('[data-testid="site-frontend-design-panel"]');
    const frontendText = frontendPanel?.textContent || text;
    const frontendDraftControls = frontendPanel
      ? Array.from(frontendPanel.querySelectorAll('select, input, textarea')).filter((control) => (
          control instanceof HTMLSelectElement ||
          control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement
        ))
      : [];
    const disabledFrontendDraftControls = frontendDraftControls.filter((control) => control.disabled);
    const frontendDesign = {
      hasPanel: Boolean(frontendPanel),
      hydrated: frontendPanel?.getAttribute('data-hydrated') === 'true',
      draftEnabled: frontendPanel?.getAttribute('data-draft-disabled') === 'false',
      draftControlsEnabled: frontendDraftControls.length >= 10 && disabledFrontendDraftControls.length === 0,
      hasRegistrySummary: Boolean(document.querySelector('[data-testid="site-template-registry-summary"]')),
      hasTemplateList: Boolean(document.querySelector('[data-testid="site-template-registry-template-list"]')),
      hasContractTitle: frontendText.includes('Frontend design contract'),
      hasCaptureAction: frontendText.includes('Capture current design'),
      hasSaveAction: frontendText.includes('Save contract'),
      hasRegistryTitle: frontendText.includes('Template registry'),
      hasVersionReadiness: frontendText.includes('Template version readiness'),
      hasPrepareVersions: frontendText.includes('Prepare versions'),
      hasCopyVersionPlan: frontendText.includes('Copy version plan'),
      hasCapturedTemplatesLabel: frontendText.includes('Captured templates'),
      hasCloneField: frontendText.includes('frontendDesignTemplateId'),
      hasSchema: frontendText.includes('backy.template-registry.v1'),
    };
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      path: window.location.pathname,
      hasSite: body.includes(${JSON.stringify(siteName)}),
      hasCommandCenter: Boolean(document.querySelector('[data-testid="site-workspace-command-center"]')) && body.includes('Site command center'),
      hasCommandActions: Boolean(document.querySelector('[data-testid="site-workspace-command-actions"]')),
      hasCommandStatus: Boolean(document.querySelector('[data-testid="site-workspace-command-action-status"]')),
      commandActionState: document.querySelector('[data-testid="site-workspace-command-actions"]')?.getAttribute('data-action-state') || '',
      primaryActionLabels: Array.from(document.querySelectorAll('[data-testid="site-workspace-primary-actions"] a')).map((link) => (link.textContent || '').replace(/\\s+/g, ' ').trim()),
      openPublicState: document.querySelector('[data-testid="site-workspace-open-public-site"]')?.getAttribute('data-action-state') || '',
      siteSettingsState: document.querySelector('[data-testid="site-workspace-site-settings"]')?.getAttribute('data-action-state') || '',
      secondaryStatusId: document.querySelector('[data-testid="site-workspace-command-secondary-action-status"]')?.id || '',
      secondaryStatusText: (document.querySelector('[data-testid="site-workspace-command-secondary-action-status"]')?.textContent || '').replace(/\\s+/g, ' ').trim(),
      hasSecondaryActions: Boolean(document.querySelector('[data-testid="site-workspace-secondary-actions"]')),
      secondaryDefaultCollapsed: document.querySelector('[data-testid="site-workspace-secondary-actions"]')?.getAttribute('data-default-collapsed') === 'true',
      secondaryOpen: document.querySelector('[data-testid="site-workspace-secondary-actions"]')?.hasAttribute('open') || false,
      secondaryDescribedBy: document.querySelector('[data-testid="site-workspace-secondary-actions"]')?.getAttribute('aria-describedby') || '',
      secondaryActionState: document.querySelector('[data-testid="site-workspace-secondary-actions"]')?.getAttribute('data-action-state') || '',
      secondaryActionStatus: document.querySelector('[data-testid="site-workspace-secondary-actions"]')?.getAttribute('data-action-status') || '',
      secondaryTargetSiteId: document.querySelector('[data-testid="site-workspace-secondary-actions"]')?.getAttribute('data-target-site-id') || '',
      hasMoreActions: Boolean(document.querySelector('[data-testid="site-workspace-more-actions"]')),
      moreActionsDescribedBy: document.querySelector('[data-testid="site-workspace-more-actions"]')?.getAttribute('aria-describedby') || '',
      secondaryActionLabels: Array.from(document.querySelectorAll('[data-testid="site-workspace-secondary-action-menu"] button')).map((button) => (button.textContent || '').replace(/\\s+/g, ' ').trim()),
      secondaryActionControls: Array.from(document.querySelectorAll('[data-testid="site-workspace-secondary-action-menu"] button')).map((button) => ({
        testId: button.getAttribute('data-testid') || '',
        describedBy: button.getAttribute('aria-describedby') || '',
        state: button.getAttribute('data-action-state') || '',
        status: button.getAttribute('data-action-status') || '',
        disabledReason: button.getAttribute('data-disabled-reason') || '',
        targetSiteId: button.getAttribute('data-target-site-id') || '',
      })),
      primaryHasHandoffActions: Boolean(document.querySelector('[data-testid="site-workspace-primary-actions"] [data-testid="site-workspace-copy-api-url"], [data-testid="site-workspace-primary-actions"] [data-testid="site-workspace-copy-handoff"], [data-testid="site-workspace-primary-actions"] [data-testid="site-workspace-download-json"]')),
      hasReadiness: Boolean(document.querySelector('[data-testid="site-readiness-panel"]')) && body.includes('Publish readiness'),
      hasDomainVerification: Boolean(document.querySelector('[data-testid="site-domain-verification-panel"]')) &&
        body.includes('Domain verification') &&
        body.includes('TXT host') &&
        body.includes('Prepare DNS record') &&
        body.includes('Mark verified'),
      hasThemePublish: Boolean(document.querySelector('[data-testid="site-theme-publish-panel"]')) &&
        body.includes('Theme and publish settings') &&
        body.includes('Brand colors') &&
        body.includes('Custom CSS') &&
        body.includes('Save theme & publish'),
      hasWebhooks: Boolean(document.querySelector('[data-testid="site-webhooks-panel"]')) &&
        body.includes('Webhooks') &&
        body.includes('Add endpoint') &&
        body.includes('Save webhooks'),
      hasNavigation: Boolean(document.querySelector('[data-testid="site-navigation-panel"]')) && body.includes('Site navigation') && body.includes('Primary menu') && body.includes('Footer menu'),
      frontendDesign,
      hasFrontendDesign: Object.values(frontendDesign).every(Boolean),
      hasRedirects: Boolean(document.querySelector('[data-testid="site-redirects-panel"]')) && body.includes('Redirects and retired routes'),
      hasSeo: Boolean(document.querySelector('[data-testid="site-seo-panel"]')) && body.includes('SEO defaults') && body.includes('JSON-LD defaults'),
      hasSettings: body.includes('Site Name') && body.includes('Custom Domain'),
      hasActivity: Boolean(document.querySelector('[data-testid="site-audit-panel"]')) && body.includes('Site activity') && body.includes('Audit trail'),
      hasAutomation: body.includes('Forms') && body.includes('Comments moderation'),
      hasCommentPolicy: Boolean(document.querySelector('[data-testid="site-comment-policy-panel"]')) && body.includes('Site comment policy') && body.includes('Save comment policy'),
      hasFormBuilder: Boolean(document.querySelector('[data-testid="site-form-builder-panel"]')) && body.includes('Site form builder') && body.includes('New form') && body.includes('Save form'),
      hasHandoff: body.includes('Frontend handoff') && body.includes('Public render') && body.includes('OpenAPI'),
      customFrontendAgentHandoff: {
        visible: Boolean(document.querySelector('[data-testid="site-custom-frontend-agent-handoff"]')),
        copyAction: Boolean(document.querySelector('[data-testid="site-copy-custom-frontend-agent-handoff"]')),
        contentEntryPoints: Boolean(document.querySelector('[data-testid="site-agent-content-entry-points"]')),
        canvasFirstRule: Boolean(document.querySelector('[data-testid="site-agent-canvas-first-rule"]')),
        schema: document.querySelector('[data-testid="site-custom-frontend-agent-handoff"]')?.getAttribute('data-agent-handoff-schema') || '',
        doc: document.querySelector('[data-testid="site-custom-frontend-agent-handoff"]')?.getAttribute('data-agent-handoff-doc') || '',
        direct: document.querySelector('[data-testid="site-custom-frontend-agent-handoff"]')?.getAttribute('data-agent-handoff-direct') || '',
        manifest: document.querySelector('[data-testid="site-custom-frontend-agent-handoff"]')?.getAttribute('data-agent-handoff-manifest') || '',
        openapi: document.querySelector('[data-testid="site-custom-frontend-agent-handoff"]')?.getAttribute('data-agent-handoff-openapi') || '',
        text: document.querySelector('[data-testid="site-custom-frontend-agent-handoff"]')?.textContent || '',
      },
    };
    })()`);
    if (layout.hasFrontendDesign) {
      break;
    }
    await sleep(150);
  }

  assert(layout, 'Site detail page layout could not be evaluated');
  assert(layout.scrollWidth <= layout.width + 8, `Site detail page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandActions &&
      layout.hasCommandStatus &&
      ['ready', 'blocked'].includes(layout.commandActionState),
    `Site detail command center should expose a named action-status contract: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.primaryActionLabels[0] === 'Open public site' &&
      layout.primaryActionLabels[1] === 'Site settings' &&
      ['ready', 'blocked'].includes(layout.openPublicState) &&
      ['ready', 'blocked'].includes(layout.siteSettingsState),
    `Site detail primary actions should prioritize public/site settings with action metadata: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.hasSecondaryActions &&
      layout.secondaryStatusId === 'site-workspace-command-secondary-action-status' &&
      layout.secondaryDescribedBy === layout.secondaryStatusId &&
      layout.secondaryActionStatus === layout.secondaryStatusText &&
      ['ready', 'blocked'].includes(layout.secondaryActionState) &&
      layout.secondaryTargetSiteId.length > 0 &&
      layout.secondaryDefaultCollapsed &&
      !layout.secondaryOpen &&
      layout.hasMoreActions &&
      layout.moreActionsDescribedBy === layout.secondaryStatusId &&
      layout.secondaryActionLabels[0] === 'Copy API URL' &&
      layout.secondaryActionLabels.includes('Copy handoff') &&
      layout.secondaryActionLabels.includes('Download JSON') &&
      layout.secondaryActionControls.length === 3 &&
      layout.secondaryActionControls.every((control) => (
        control.describedBy === layout.secondaryStatusId &&
        control.state === layout.secondaryActionState &&
        control.status.length > 0 &&
        control.targetSiteId === layout.secondaryTargetSiteId
      )) &&
      !layout.primaryHasHandoffActions,
    `Site detail API/handoff exports should stay nested behind collapsed More actions: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.path.startsWith('/sites/') &&
      layout.hasSite &&
      layout.hasCommandCenter &&
      layout.hasReadiness &&
      layout.hasDomainVerification &&
      layout.hasThemePublish &&
      layout.hasWebhooks &&
      layout.hasNavigation &&
      layout.hasFrontendDesign &&
      layout.hasRedirects &&
      layout.hasSeo &&
      layout.hasSettings &&
      layout.hasActivity &&
      layout.hasAutomation &&
      layout.hasCommentPolicy &&
      layout.hasFormBuilder &&
      layout.hasHandoff,
    `Site detail page missing expected regions: ${JSON.stringify(layout)}`,
  );
  assert(
      layout.customFrontendAgentHandoff.visible &&
      layout.customFrontendAgentHandoff.copyAction &&
      layout.customFrontendAgentHandoff.contentEntryPoints &&
      layout.customFrontendAgentHandoff.canvasFirstRule &&
      layout.customFrontendAgentHandoff.schema === 'backy.custom-frontend-agent-handoff.v1' &&
      layout.customFrontendAgentHandoff.doc === 'specs/custom-frontend-agent-handoff.md' &&
      layout.customFrontendAgentHandoff.direct.includes('/api/sites/') &&
      layout.customFrontendAgentHandoff.direct.endsWith('/agent-handoff') &&
      layout.customFrontendAgentHandoff.manifest.includes('/api/sites/') &&
      layout.customFrontendAgentHandoff.openapi.includes('/openapi') &&
      layout.customFrontendAgentHandoff.text.includes('Agent handoff') &&
      layout.customFrontendAgentHandoff.text.includes('/agent-handoff') &&
      layout.customFrontendAgentHandoff.text.includes('Agent read order') &&
      layout.customFrontendAgentHandoff.text.includes('frontendDesignManagement') &&
      layout.customFrontendAgentHandoff.text.includes('Canvas-first API alignment') &&
      layout.customFrontendAgentHandoff.text.includes('site fonts, colors, chrome') &&
      layout.customFrontendAgentHandoff.text.includes('manifest.data.site.frontendDesign') &&
      layout.customFrontendAgentHandoff.text.includes('frontendDesign.tokens.fonts') &&
      layout.customFrontendAgentHandoff.text.includes('frontendDesignTemplateId=:templateId') &&
      layout.customFrontendAgentHandoff.text.includes('templateSource=backy-canvas') &&
      layout.customFrontendAgentHandoff.text.includes('focus=canvas') &&
      layout.customFrontendAgentHandoff.text.includes('/products?') &&
      layout.customFrontendAgentHandoff.text.includes('/forms?') &&
      layout.customFrontendAgentHandoff.text.includes('/collections?') &&
      layout.customFrontendAgentHandoff.text.includes('/reusable-sections?'),
    `Site detail custom frontend agent handoff is incomplete: ${JSON.stringify(layout.customFrontendAgentHandoff)}`,
  );
  return layout;
};

const configureDomainVerificationThroughUi = async (client) => {
  await waitForText(client, '[data-testid="site-domain-verification-panel"]', 'TXT host', 'Domain verification TXT host');
  await waitForButtonEnabled(
    client,
    '[data-testid="site-domain-verification-panel"]',
    'Prepare DNS record',
    'Domain verification prepare button',
  );
  await clickButtonByText(client, '[data-testid="site-domain-verification-panel"]', 'Prepare DNS record');
  await waitForText(
    client,
    '[data-testid="site-workspace-command-center"]',
    'DNS verification record is ready.',
    'Domain verification prepare notice',
  );
  await waitForText(client, '[data-testid="site-domain-verification-panel"]', 'Pending DNS', 'Domain pending state');
  await waitForButtonEnabled(
    client,
    '[data-testid="site-domain-verification-panel"]',
    'Mark verified',
    'Domain verification verified button',
  );
  await clickButtonByText(client, '[data-testid="site-domain-verification-panel"]', 'Mark verified');
  await waitForText(
    client,
    '[data-testid="site-workspace-command-center"]',
    'domain verification marked verified.',
    'Domain verification verified notice',
  );
  await waitForText(client, '[data-testid="site-domain-verification-panel"]', 'Verified', 'Domain verified state');
};

const configureThemePublishThroughUi = async (client, expected) => {
  await waitForText(client, '[data-testid="site-theme-publish-panel"]', 'Theme and publish settings', 'Theme publish panel');
  const result = await evaluate(client, `(() => {
    ${setInputValue}
    const section = document.querySelector('[data-testid="site-theme-publish-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };
    const publishState = section.querySelector('[aria-label="Site publish state"]');
    const primary = section.querySelector('[aria-label="Theme primary color"]');
    const secondary = section.querySelector('[aria-label="Theme secondary color"]');
    const background = section.querySelector('[aria-label="Theme background color"]');
    const surface = section.querySelector('[aria-label="Theme surface color"]');
    const text = section.querySelector('[aria-label="Theme text color"]');
    const muted = section.querySelector('[aria-label="Theme muted text color"]');
    const heading = section.querySelector('[aria-label="Theme heading font"]');
    const body = section.querySelector('[aria-label="Theme body font"]');
    const mono = section.querySelector('[aria-label="Theme mono font"]');
    const unit = section.querySelector('[aria-label="Theme spacing unit"]');
    const scale = section.querySelector('[aria-label="Theme spacing scale"]');
    const customCss = section.querySelector('[aria-label="Theme custom CSS"]');
    const controls = [publishState, primary, secondary, background, surface, text, muted, heading, body, mono, unit, scale, customCss];
    if (
      !(publishState instanceof HTMLSelectElement) ||
      controls.some((control) => !(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement))
    ) {
      return {
        ok: false,
        reason: 'controls-missing',
        labels: Array.from(section.querySelectorAll('[aria-label]')).map((node) => node.getAttribute('aria-label')),
      };
    }
    setNativeValue(publishState, 'published');
    setNativeValue(primary, ${JSON.stringify(expected.themePrimary)});
    setNativeValue(secondary, ${JSON.stringify(expected.themeSecondary)});
    setNativeValue(background, ${JSON.stringify(expected.themeBackground)});
    setNativeValue(surface, ${JSON.stringify(expected.themeSurface)});
    setNativeValue(text, ${JSON.stringify(expected.themeText)});
    setNativeValue(muted, ${JSON.stringify(expected.themeTextMuted)});
    setNativeValue(heading, ${JSON.stringify(expected.themeHeading)});
    setNativeValue(body, ${JSON.stringify(expected.themeBody)});
    setNativeValue(mono, ${JSON.stringify(expected.themeMono)});
    setNativeValue(unit, String(${JSON.stringify(expected.themeSpacingUnit)}));
    setNativeValue(scale, String(${JSON.stringify(expected.themeSpacingScale)}));
    setNativeValue(customCss, ${JSON.stringify(expected.themeCustomCss)});
    return {
      ok: true,
      publishState: publishState.value,
      primary: primary.value,
      heading: heading.value,
      unit: unit.value,
      customCss: customCss.value,
    };
  })()`);
  assert(result.ok, `Unable to configure theme and publish settings through UI: ${JSON.stringify(result)}`);

  await clickButtonByText(client, '[data-testid="site-theme-publish-panel"]', 'Save theme & publish');
  await waitForText(
    client,
    '[data-testid="site-workspace-command-center"]',
    'theme and publish settings saved.',
    'Theme publish save notice',
  );
  await waitForText(client, '[data-testid="site-theme-publish-panel"]', 'published', 'Published theme state');
};

const configureWebhooksThroughUi = async (client, expected) => {
  await waitForText(client, '[data-testid="site-webhooks-panel"]', 'Webhooks', 'Webhooks panel');
  await waitForWebhooksEditorReady(client);
  await clickButtonByText(client, '[data-testid="site-webhooks-panel"]', 'Add endpoint');
  const result = await evaluate(client, `(() => {
    ${setInputValue}
    const section = document.querySelector('[data-testid="site-webhooks-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };
    const delivery = section.querySelector('input[aria-label="Enable site webhooks"]');
    const endpointEnabled = section.querySelector('input[aria-label="Enable site webhook endpoint"]');
    const name = section.querySelector('input[aria-label="Site webhook endpoint name"]');
    const url = section.querySelector('input[aria-label="Site webhook endpoint URL"]');
    const secret = section.querySelector('input[aria-label="Site webhook signing secret reference"]');
    const headers = section.querySelector('textarea[aria-label="Site webhook headers JSON"]');
    if (
      !(delivery instanceof HTMLInputElement) ||
      !(endpointEnabled instanceof HTMLInputElement) ||
      !(name instanceof HTMLInputElement) ||
      !(url instanceof HTMLInputElement) ||
      !(secret instanceof HTMLInputElement) ||
      !(headers instanceof HTMLTextAreaElement)
    ) {
      return {
        ok: false,
        reason: 'controls-missing',
        labels: Array.from(section.querySelectorAll('input, textarea')).map((control) => control.getAttribute('aria-label')).filter(Boolean),
        text: section.textContent?.slice(0, 1200) || '',
      };
    }
    if (!delivery.checked) delivery.click();
    if (!endpointEnabled.checked) endpointEnabled.click();
    setNativeValue(name, ${JSON.stringify(expected.webhookName)});
    setNativeValue(url, ${JSON.stringify(expected.webhookUrl)});
    setNativeValue(secret, ${JSON.stringify(expected.webhookSecretId)});
    setNativeValue(headers, ${JSON.stringify(expected.webhookHeadersText)});
    for (const eventKind of ${JSON.stringify(['form-submission', 'contact-shared', 'comment-submitted', 'comment-reported'])}) {
      const control = section.querySelector(\`input[aria-label="Site webhook event \${eventKind}"]\`);
      if (control instanceof HTMLInputElement && !control.checked) {
        control.click();
      }
    }
    return {
      ok: true,
      delivery: delivery.checked,
      endpointEnabled: endpointEnabled.checked,
      name: name.value,
      url: url.value,
      secret: secret.value,
      headers: headers.value,
    };
  })()`);
  assert(result.ok, `Unable to configure webhooks through UI: ${JSON.stringify(result)}`);

  await clickButtonByText(client, '[data-testid="site-webhooks-panel"]', 'Save webhooks');
  await waitForText(client, '[data-testid="site-workspace-command-center"]', 'Site webhook configuration saved.', 'Webhook save notice');
};

const configureFormBuilderThroughUi = async (client, expected) => {
  await waitForFormBuilderPanelReady(client);
  await waitForText(client, '[data-testid="site-form-builder-panel"]', 'Site form builder', 'Site form builder panel');
  await waitForButtonEnabled(client, '[data-testid="site-form-builder-panel"]', 'New form', 'New site form button');
  await clickButtonByText(client, '[data-testid="site-form-builder-panel"]', 'New form');
  await waitForText(client, '[data-testid="site-form-builder-panel"]', 'Standalone site form created.', 'Site form created notice');
  await clickButtonByText(client, '[data-testid="site-form-builder-panel"]', 'Add field');
  await waitForFormBuilderEditorReady(client);

  const result = await evaluate(client, `(() => {
    ${setInputValue}
    const section = document.querySelector('[data-testid="site-form-builder-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };
    const title = section.querySelector('[aria-label="Site form title"]');
    const name = section.querySelector('[aria-label="Site form machine name"]');
    const description = section.querySelector('[aria-label="Site form description"]');
    const audience = section.querySelector('[aria-label="Site form audience"]');
    const moderation = section.querySelector('[aria-label="Site form moderation"]');
    const successMessage = section.querySelector('[aria-label="Site form success message"]');
    const redirectUrl = section.querySelector('[aria-label="Site form redirect URL"]');
    const notificationEmail = section.querySelector('[aria-label="Site form notification email"]');
    const notificationWebhook = section.querySelector('[aria-label="Site form notification webhook"]');
    const active = section.querySelector('[aria-label="Site form active"]');
    const contactShare = section.querySelector('[aria-label="Site form contact share"]');
    const fieldKey = section.querySelector('[aria-label="Site form field 4 key"]');
    const fieldLabel = section.querySelector('[aria-label="Site form field 4 label"]');
    const fieldType = section.querySelector('[aria-label="Site form field 4 type"]');
    const fieldRequired = section.querySelector('[aria-label="Site form field 4 required"]');
    const fieldPlaceholder = section.querySelector('[aria-label="Site form field 4 placeholder"]');
    const fieldHelp = section.querySelector('[aria-label="Site form field 4 help text"]');
    const fieldOptions = section.querySelector('[aria-label="Site form field 4 options"]');

    if (
      !(title instanceof HTMLInputElement) ||
      !(name instanceof HTMLInputElement) ||
      !(description instanceof HTMLTextAreaElement) ||
      !(audience instanceof HTMLSelectElement) ||
      !(moderation instanceof HTMLSelectElement) ||
      !(successMessage instanceof HTMLInputElement) ||
      !(redirectUrl instanceof HTMLInputElement) ||
      !(notificationEmail instanceof HTMLInputElement) ||
      !(notificationWebhook instanceof HTMLInputElement) ||
      !(active instanceof HTMLInputElement) ||
      !(contactShare instanceof HTMLInputElement) ||
      !(fieldKey instanceof HTMLInputElement) ||
      !(fieldLabel instanceof HTMLInputElement) ||
      !(fieldType instanceof HTMLSelectElement) ||
      !(fieldRequired instanceof HTMLInputElement) ||
      !(fieldPlaceholder instanceof HTMLInputElement) ||
      !(fieldHelp instanceof HTMLInputElement) ||
      !(fieldOptions instanceof HTMLInputElement)
    ) {
      return {
        ok: false,
        reason: 'controls-missing',
        labels: Array.from(section.querySelectorAll('[aria-label]')).map((node) => node.getAttribute('aria-label')),
        text: section.textContent?.slice(0, 1800) || '',
      };
    }

    setNativeValue(title, ${JSON.stringify(expected.formTitle)});
    setNativeValue(name, ${JSON.stringify(expected.formName)});
    setNativeValue(description, ${JSON.stringify(expected.formDescription)});
    setNativeValue(audience, 'public');
    setNativeValue(moderation, 'auto-approve');
    setNativeValue(successMessage, ${JSON.stringify(expected.formSuccessMessage)});
    setNativeValue(redirectUrl, ${JSON.stringify(expected.formRedirectUrl)});
    setNativeValue(notificationEmail, ${JSON.stringify(expected.formNotificationEmail)});
    setNativeValue(notificationWebhook, ${JSON.stringify(expected.formNotificationWebhook)});
    if (!active.checked) active.click();
    if (!contactShare.checked) contactShare.click();
    setNativeValue(fieldKey, ${JSON.stringify(expected.formFieldKey)});
    setNativeValue(fieldLabel, ${JSON.stringify(expected.formFieldLabel)});
    setNativeValue(fieldType, 'select');
    if (!fieldRequired.checked) fieldRequired.click();
    setNativeValue(fieldPlaceholder, ${JSON.stringify(expected.formFieldPlaceholder)});
    setNativeValue(fieldHelp, ${JSON.stringify(expected.formFieldHelp)});
    setNativeValue(fieldOptions, ${JSON.stringify(expected.formFieldOptions)});

    return {
      ok: true,
      title: title.value,
      name: name.value,
      audience: audience.value,
      moderation: moderation.value,
      contactShare: contactShare.checked,
      fieldKey: fieldKey.value,
      fieldLabel: fieldLabel.value,
      fieldType: fieldType.value,
      fieldRequired: fieldRequired.checked,
      fieldOptions: fieldOptions.value,
    };
  })()`);
  assert(result.ok, `Unable to configure site form builder through UI: ${JSON.stringify(result)}`);

  await clickButtonByText(client, '[data-testid="site-form-builder-panel"]', 'Save form');
  await waitForText(client, '[data-testid="site-form-builder-panel"]', 'Site form builder changes saved.', 'Site form save notice');
};

const configureNavigationThroughUi = async (client, {
  routeLabel,
  routePath,
  navChildOneLabel,
  navChildOnePath,
  navChildTwoLabel,
  navChildTwoPath,
  footerLabel,
  footerHref,
}) => {
  await waitForNavigationEditorReady(client);

  const addResult = await evaluate(client, `(() => {
    const section = document.querySelector('[data-testid="site-navigation-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };

    const findMenuCard = (headingText) => {
      const heading = Array.from(section.querySelectorAll('h3')).find((candidate) => (
        (candidate.textContent || '').trim() === headingText
      ));
      let node = heading?.parentElement || null;
      while (node && node !== section) {
        const text = node.textContent || '';
        const buttons = Array.from(node.querySelectorAll('button')).map((button) => (
          (button.textContent || '').replace(/\\s+/g, ' ').trim()
        ));
        const hasEditorBody = Array.from(node.children).some((child) => (
          typeof child.className === 'string' && child.className.includes('space-y-3')
        ));
        if (text.includes(headingText) && buttons.includes('Route') && buttons.includes('URL') && hasEditorBody) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    };

    const primary = findMenuCard('Primary menu');
    const footer = findMenuCard('Footer menu');
    if (!primary || !footer) {
      return { ok: false, reason: 'menus-missing', text: section.textContent?.slice(0, 1200) || '' };
    }

    const primaryRouteButton = Array.from(primary.querySelectorAll('button')).find((button) => (
      (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Route'
    ));
    const footerUrlButton = Array.from(footer.querySelectorAll('button')).find((button) => (
      (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'URL'
    ));
    if (!(primaryRouteButton instanceof HTMLButtonElement) || !(footerUrlButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'add-buttons-missing' };
    }
    primaryRouteButton.click();
    footerUrlButton.click();
    return { ok: true };
  })()`);
  assert(addResult.ok, `Unable to add navigation items through UI: ${JSON.stringify(addResult)}`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await evaluate(client, `(() => {
      ${setInputValue}
      const section = document.querySelector('[data-testid="site-navigation-panel"]');
      if (!section) return { ok: false, reason: 'section-missing' };

      const findMenuCard = (headingText) => {
        const heading = Array.from(section.querySelectorAll('h3')).find((candidate) => (
          (candidate.textContent || '').trim() === headingText
        ));
        let node = heading?.parentElement || null;
        while (node && node !== section) {
          const text = node.textContent || '';
          const buttons = Array.from(node.querySelectorAll('button')).map((button) => (
            (button.textContent || '').replace(/\\s+/g, ' ').trim()
          ));
          const hasEditorBody = Array.from(node.children).some((child) => (
            typeof child.className === 'string' && child.className.includes('space-y-3')
          ));
          if (text.includes(headingText) && buttons.includes('Route') && buttons.includes('URL') && hasEditorBody) {
            return node;
          }
          node = node.parentElement;
        }
        return null;
      };

      const primary = findMenuCard('Primary menu');
      const footer = findMenuCard('Footer menu');
      if (!primary || !footer) {
        return { ok: false, reason: 'menus-missing', text: section.textContent?.slice(0, 1200) || '' };
      }

      const primaryLabel = Array.from(primary.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'Label');
      const primaryPath = Array.from(primary.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === '/about');
      const footerLabelInput = Array.from(footer.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'Label');
      const footerHrefInput = Array.from(footer.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'https://example.com');
      if (
        !(primaryLabel instanceof HTMLInputElement) ||
        !(primaryPath instanceof HTMLInputElement) ||
        !(footerLabelInput instanceof HTMLInputElement) ||
        !(footerHrefInput instanceof HTMLInputElement)
      ) {
        return {
          ok: false,
          reason: 'inputs-missing',
          primaryInputs: Array.from(primary.querySelectorAll('input')).map((input) => ({ placeholder: input.getAttribute('placeholder'), value: input.value })),
          footerInputs: Array.from(footer.querySelectorAll('input')).map((input) => ({ placeholder: input.getAttribute('placeholder'), value: input.value })),
        };
      }

      setNativeValue(primaryLabel, ${JSON.stringify(routeLabel)});
      setNativeValue(primaryPath, ${JSON.stringify(routePath)});
      setNativeValue(footerLabelInput, ${JSON.stringify(footerLabel)});
      setNativeValue(footerHrefInput, ${JSON.stringify(footerHref)});
      const childRouteButton = Array.from(primary.querySelectorAll('button')).find((button) => (
        (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Child route'
      ));
      if (childRouteButton instanceof HTMLButtonElement) {
        childRouteButton.click();
        childRouteButton.click();
      }

      const headerSearch = Array.from(section.querySelectorAll('label')).find((label) => (
        (label.textContent || '').includes('Search')
      ))?.querySelector('input[type="checkbox"]');
      if (headerSearch instanceof HTMLInputElement && !headerSearch.checked) {
        headerSearch.click();
      }

      return {
        ok: true,
        primaryLabel: primaryLabel.value,
        primaryPath: primaryPath.value,
        footerLabel: footerLabelInput.value,
        footerHref: footerHrefInput.value,
        headerSearch: headerSearch instanceof HTMLInputElement ? headerSearch.checked : null,
      };
    })()`);
    if (result.ok) {
      break;
    }
    if (attempt === 59) {
      throw new Error(`Unable to configure navigation through UI: ${JSON.stringify(result)}`);
    }
    await sleep(150);
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await evaluate(client, `(() => {
      ${setInputValue}
      const section = document.querySelector('[data-testid="site-navigation-panel"]');
      if (!section) return { ok: false, reason: 'section-missing' };
      const heading = Array.from(section.querySelectorAll('h3')).find((candidate) => (
        (candidate.textContent || '').trim() === 'Primary menu'
      ));
      let primary = heading?.parentElement || null;
      while (primary && primary !== section) {
        const text = primary.textContent || '';
        const buttons = Array.from(primary.querySelectorAll('button')).map((button) => (
          (button.textContent || '').replace(/\\s+/g, ' ').trim()
        ));
        const hasEditorBody = Array.from(primary.children).some((child) => (
          typeof child.className === 'string' && child.className.includes('space-y-3')
        ));
        if (text.includes('Primary menu') && buttons.includes('Route') && buttons.includes('URL') && hasEditorBody) break;
        primary = primary.parentElement;
      }
      if (!primary || primary === section) return { ok: false, reason: 'primary-missing' };
      const labelInputs = Array.from(primary.querySelectorAll('input')).filter((input) => input.getAttribute('placeholder') === 'Label');
      const pathInputs = Array.from(primary.querySelectorAll('input')).filter((input) => input.getAttribute('placeholder') === '/about');
      const firstChildLabel = labelInputs[1];
      const secondChildLabel = labelInputs[2];
      const firstChildPath = pathInputs[1];
      const secondChildPath = pathInputs[2];
      if (
        !(firstChildLabel instanceof HTMLInputElement) ||
        !(secondChildLabel instanceof HTMLInputElement) ||
        !(firstChildPath instanceof HTMLInputElement) ||
        !(secondChildPath instanceof HTMLInputElement)
      ) {
        return {
          ok: false,
          reason: 'child-inputs-missing',
          labels: labelInputs.map((input) => input.value),
          paths: pathInputs.map((input) => input.value),
        };
      }
      setNativeValue(firstChildLabel, ${JSON.stringify(navChildOneLabel)});
      setNativeValue(firstChildPath, ${JSON.stringify(navChildOnePath)});
      setNativeValue(secondChildLabel, ${JSON.stringify(navChildTwoLabel)});
      setNativeValue(secondChildPath, ${JSON.stringify(navChildTwoPath)});
      return {
        ok: true,
        childLabels: [firstChildLabel.value, secondChildLabel.value],
        childPaths: [firstChildPath.value, secondChildPath.value],
      };
    })()`);
    if (result.ok) {
      break;
    }
    if (attempt === 59) {
      throw new Error(`Unable to configure child navigation through UI: ${JSON.stringify(result)}`);
    }
    await sleep(150);
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-navigation-panel"]');
      if (!section) return { ok: false, reason: 'section-missing' };
      const primary = Array.from(section.querySelectorAll('[data-navigation-item-label]')).find((node) => (
        node.getAttribute('data-navigation-item-label') === ${JSON.stringify(routeLabel)}
      ));
      const firstChild = Array.from(section.querySelectorAll('[data-navigation-item-label]')).find((node) => (
        node.getAttribute('data-navigation-item-label') === ${JSON.stringify(navChildOneLabel)}
      ));
      const secondChild = Array.from(section.querySelectorAll('[data-navigation-item-label]')).find((node) => (
        node.getAttribute('data-navigation-item-label') === ${JSON.stringify(navChildTwoLabel)}
      ));
      if (!(primary instanceof HTMLElement) || !(firstChild instanceof HTMLElement) || !(secondChild instanceof HTMLElement)) {
        return {
          ok: false,
          reason: 'drag-nodes-missing',
          labels: Array.from(section.querySelectorAll('[data-navigation-item-label]')).map((node) => node.getAttribute('data-navigation-item-label')),
        };
      }
      const dropBeforeFirst = firstChild.querySelector(${JSON.stringify(`[aria-label="Drop before ${navChildOneLabel}"]`)});
      if (!(dropBeforeFirst instanceof HTMLElement)) {
        return { ok: false, reason: 'drop-zone-missing', html: firstChild.outerHTML.slice(0, 500) };
      }
      const dragHandle = secondChild.querySelector(${JSON.stringify(`[aria-label="Drag ${navChildTwoLabel}"]`)});
      if (!(dragHandle instanceof HTMLElement) || dragHandle.getAttribute('draggable') !== 'true') {
        return { ok: false, reason: 'drag-handle-missing', html: secondChild.outerHTML.slice(0, 500) };
      }
      return { ok: true };
    })()`);
    if (result.ok) {
      break;
    }
    if (attempt === 59) {
      throw new Error(`Unable to find nested navigation drag controls through UI: ${JSON.stringify(result)}`);
    }
    await sleep(150);
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-navigation-panel"]');
      if (!section) return { ok: false, reason: 'section-missing' };
      const firstChild = Array.from(section.querySelectorAll('[data-navigation-item-label]')).find((node) => (
        node.getAttribute('data-navigation-item-label') === ${JSON.stringify(navChildOneLabel)}
      ));
      const secondChild = Array.from(section.querySelectorAll('[data-navigation-item-label]')).find((node) => (
        node.getAttribute('data-navigation-item-label') === ${JSON.stringify(navChildTwoLabel)}
      ));
      if (!(firstChild instanceof HTMLElement) || !(secondChild instanceof HTMLElement)) {
        return { ok: false, reason: 'nested-nodes-missing' };
      }
      const orderedLabels = Array.from(firstChild.parentElement?.children || [])
        .map((node) => node instanceof HTMLElement ? node.getAttribute('data-navigation-item-label') : null)
        .filter(Boolean);
      if (orderedLabels[0] === ${JSON.stringify(navChildTwoLabel)}) {
        return { ok: true, mode: 'already-ordered', orderedLabels };
      }
      const moveUpButton = Array.from(secondChild.querySelectorAll('button')).find((button) => (
        button.getAttribute('aria-label') === 'Move up'
      ));
      if (!(moveUpButton instanceof HTMLButtonElement) || moveUpButton.disabled) {
        return { ok: false, reason: 'move-up-unavailable', orderedLabels };
      }
      moveUpButton.click();
      return { ok: true, mode: 'button-clicked', orderedLabels };
    })()`);
    assert(result.ok, `Unable to reorder nested navigation item through UI: ${JSON.stringify(result)}`);
    if (result.mode === 'already-ordered') {
      break;
    }
    await sleep(150);
    if (attempt === 59) {
      throw new Error(`Nested navigation item did not move into expected order: ${JSON.stringify(result)}`);
    }
  }

  await clickButtonByText(client, '[data-testid="site-navigation-panel"]', 'Save navigation');
  await waitForText(
    client,
    '[data-testid="site-navigation-panel"]',
    'Navigation saved and available to public/front-end contracts.',
    'Navigation save notice',
  );
};

const configureFrontendDesignThroughUi = async (client, { frontendLabel, frontendUrl, frontendRepository, frontendBranch }) => {
  await clickButtonByText(client, '[data-testid="site-frontend-design-panel"]', 'Capture current design');
  await waitForText(
    client,
    '[data-testid="site-frontend-design-panel"]',
    'Captured current Backy theme, navigation, and page templates',
    'Frontend design capture notice',
  );

  const result = await evaluate(client, `(() => {
    ${setInputValue}
    const section = document.querySelector('[data-testid="site-frontend-design-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };

    const status = Array.from(section.querySelectorAll('select')).find((select) => (
      Array.from(select.options).some((option) => option.value === 'synced')
    ));
    const sourceType = Array.from(section.querySelectorAll('select')).find((select) => (
      Array.from(select.options).some((option) => option.value === 'custom-frontend')
    ));
    const label = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder')?.includes('Marketing frontend'));
    const url = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'https://example.com');
    const branch = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'main');
    const repository = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'owner/frontend');
    const notes = Array.from(section.querySelectorAll('textarea')).find((textarea) => textarea.getAttribute('placeholder')?.includes('Extraction notes'));
    const textareas = Array.from(section.querySelectorAll('textarea'));
    const tokens = textareas.find((textarea) => textarea.previousElementSibling?.textContent?.includes('Tokens JSON'));
    const chrome = textareas.find((textarea) => textarea.previousElementSibling?.textContent?.includes('Chrome JSON'));
    const templates = textareas.find((textarea) => textarea.previousElementSibling?.textContent?.includes('Templates JSON'));
    const editableMap = textareas.find((textarea) => textarea.previousElementSibling?.textContent?.includes('Editable map JSON'));

    if (
      !(status instanceof HTMLSelectElement) ||
      !(sourceType instanceof HTMLSelectElement) ||
      !(label instanceof HTMLInputElement) ||
      !(url instanceof HTMLInputElement) ||
      !(branch instanceof HTMLInputElement) ||
      !(repository instanceof HTMLInputElement) ||
      !(notes instanceof HTMLTextAreaElement) ||
      !(tokens instanceof HTMLTextAreaElement) ||
      !(chrome instanceof HTMLTextAreaElement) ||
      !(templates instanceof HTMLTextAreaElement) ||
      !(editableMap instanceof HTMLTextAreaElement)
    ) {
      return {
        ok: false,
        reason: 'controls-missing',
        inputs: Array.from(section.querySelectorAll('input')).map((input) => ({ placeholder: input.getAttribute('placeholder'), value: input.value })),
        selects: Array.from(section.querySelectorAll('select')).map((select) => select.value),
        textareaLabels: textareas.map((textarea) => textarea.previousElementSibling?.textContent || ''),
      };
    }

    setNativeValue(status, 'synced');
    setNativeValue(sourceType, 'custom-frontend');
    setNativeValue(label, ${JSON.stringify(frontendLabel)});
    setNativeValue(url, ${JSON.stringify(frontendUrl)});
    setNativeValue(branch, ${JSON.stringify(frontendBranch)});
    setNativeValue(repository, ${JSON.stringify(frontendRepository)});
    setNativeValue(notes, 'Site detail smoke captured and customized this design contract.');
    setNativeValue(tokens, JSON.stringify({
      colors: { primary: '#0f766e', text: '#111827' },
      fonts: { heading: 'Inter', body: 'Inter' },
      spacing: { sectionY: 96 },
    }, null, 2));
    setNativeValue(chrome, JSON.stringify({
      header: { component: 'SmokeHeader' },
      navigation: { source: 'site.navigation.primary' },
      footer: { component: 'SmokeFooter' },
    }, null, 2));
    setNativeValue(templates, JSON.stringify([
      {
        id: 'smoke-page-contract',
        type: 'page',
        name: 'Smoke Page Contract',
        routePattern: '/smoke-page',
        canvasSize: { width: 1440, height: 1100 },
      },
      {
        id: 'smoke-blog-contract',
        type: 'blogPost',
        name: 'Smoke Blog Contract',
        routePattern: '/blog/{slug}',
      },
      {
        id: 'smoke-form-contract',
        type: 'form',
        name: 'Smoke Form Contract',
        routePattern: '/contact',
      },
      {
        id: 'smoke-product-contract',
        type: 'product',
        name: 'Smoke Product Contract',
        routePattern: '/products/{slug}',
      },
      {
        id: 'smoke-collection-contract',
        type: 'collection',
        name: 'Smoke Collection Contract',
        routePattern: '/directory/{slug}',
      },
      {
        id: 'smoke-section-contract',
        type: 'section',
        name: 'Smoke Section Contract',
      },
    ], null, 2));
    setNativeValue(editableMap, JSON.stringify([
      {
        selector: '[data-backy-role="site-header"]',
        role: 'site.header',
        binding: 'site.navigation.primary',
        fields: ['label', 'href'],
      },
    ], null, 2));

    return {
      ok: true,
      status: status.value,
      sourceType: sourceType.value,
      label: label.value,
      url: url.value,
      repository: repository.value,
      branch: branch.value,
    };
  })()`);
  assert(result.ok, `Unable to configure frontend design through UI: ${JSON.stringify(result)}`);

  await clickButtonByText(client, '[data-testid="site-frontend-design-panel"]', 'Save contract');
  await waitForText(
    client,
    '[data-testid="site-frontend-design-panel"]',
    'Frontend design contract saved and exposed in the public manifest.',
    'Frontend design save notice',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Smoke Page Contract',
    'Frontend design template registry list page template',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Smoke Blog Contract',
    'Frontend design template registry list blog template',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Smoke Form Contract',
    'Frontend design template registry list form template',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Smoke Product Contract',
    'Frontend design template registry list product template',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Smoke Collection Contract',
    'Frontend design template registry list collection template',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Smoke Section Contract',
    'Frontend design template registry list section template',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    '/api/admin/sites/',
    'Frontend design template registry clone target',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Create page',
    'Frontend design template registry page action',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Create post',
    'Frontend design template registry blog action',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Open forms',
    'Frontend design template registry form action',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Open products',
    'Frontend design template registry product action',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Open collections',
    'Frontend design template registry collection action',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-template-list"]',
    'Open sections',
    'Frontend design template registry section action',
  );
  await waitForText(
    client,
    '[data-testid="site-template-version-readiness"]',
    'Template version readiness',
    'Frontend design template version readiness panel',
  );
  await waitForText(
    client,
    '[data-testid="site-template-registry-summary"]',
    'Copy version plan',
    'Frontend design template version action plan button',
  );
};

const configureRedirectsThroughUi = async (client, { from, to }) => {
  await waitForRedirectsEditorReady(client);
  await clickButtonByText(client, '[data-testid="site-redirects-panel"]', 'Add rule');

  const result = await evaluate(client, `(() => {
    ${setInputValue}
    const section = document.querySelector('[data-testid="site-redirects-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };
    const sourceInputs = Array.from(section.querySelectorAll('input')).filter((input) => input.getAttribute('placeholder') === '/old-path');
    const destinationInputs = Array.from(section.querySelectorAll('input')).filter((input) => (input.getAttribute('placeholder') || '').includes('/new-path'));
    const statusSelects = Array.from(section.querySelectorAll('select'));
    const source = sourceInputs.at(-1);
    const destination = destinationInputs.at(-1);
    const status = statusSelects.at(-1);
    if (!(source instanceof HTMLInputElement) || !(destination instanceof HTMLInputElement) || !(status instanceof HTMLSelectElement)) {
      return {
        ok: false,
        reason: 'redirect-controls-missing',
        inputs: Array.from(section.querySelectorAll('input')).map((input) => ({ placeholder: input.getAttribute('placeholder'), value: input.value })).slice(-8),
        selects: statusSelects.map((select) => select.value),
      };
    }
    setNativeValue(source, ${JSON.stringify(from)});
    setNativeValue(destination, ${JSON.stringify(to)});
    setNativeValue(status, '302');
    return { ok: true, source: source.value, destination: destination.value, status: status.value };
  })()`);
  assert(result.ok, `Unable to configure redirect through UI: ${JSON.stringify(result)}`);

  await clickButtonByText(client, '[data-testid="site-redirects-panel"]', 'Preview conflicts');
  await waitForText(client, '[data-testid="site-redirects-panel"]', 'Preview found', 'Redirect preview notice');
  await clickButtonByText(client, '[data-testid="site-redirects-panel"]', 'Save redirects');
  await waitForText(client, '[data-testid="site-redirects-panel"]', 'Redirect rules saved', 'Redirect save notice');
};

const configureSeoThroughUi = async (client, {
  titleTemplate,
  description,
  ogImage,
  favicon,
  robotsRule,
  seoOverrideMatch,
  seoOverrideTitle,
  seoOverrideDescription,
  seoOverrideCanonical,
  seoOverrideOgImage,
  seoOverrideKeywords,
  seoOverridePriority,
  seoOverrideFrequency,
}) => {
  await waitForSeoEditorReady(client);
  if (seoOverrideMatch) {
    await clickButtonByText(client, '[data-testid="site-seo-route-overrides-panel"]', 'Add route override');
  }

  const result = await evaluate(client, `(() => {
    ${setInputValue}
    const section = document.querySelector('[data-testid="site-seo-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };
    const title = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === '%s | {siteName}');
    const og = Array.from(section.querySelectorAll('input')).find((input) => (input.getAttribute('placeholder') || '').includes('social-card'));
    const faviconInput = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === '/favicon.ico');
    const descriptionInput = Array.from(section.querySelectorAll('textarea')).find((textarea) => (
      (textarea.getAttribute('placeholder') || '').includes('Used when a page')
    ));
    const robots = Array.from(section.querySelectorAll('textarea')).find((textarea) => (
      textarea.getAttribute('placeholder') === 'Disallow: /private'
    ));
    const overrideMatch = section.querySelector('[aria-label="SEO route override 1 match"]');
    const overrideLabel = section.querySelector('[aria-label="SEO route override 1 label"]');
    const overrideTitle = section.querySelector('[aria-label="SEO route override 1 title"]');
    const overrideDescription = section.querySelector('[aria-label="SEO route override 1 description"]');
    const overrideCanonical = section.querySelector('[aria-label="SEO route override 1 canonical"]');
    const overrideOgImage = section.querySelector('[aria-label="SEO route override 1 Open Graph image"]');
    const overrideKeywords = section.querySelector('[aria-label="SEO route override 1 keywords"]');
    const overridePriority = section.querySelector('[aria-label="SEO route override 1 priority"]');
    const overrideFrequency = section.querySelector('[aria-label="SEO route override 1 frequency"]');
    const overrideIndex = section.querySelector('[aria-label="SEO route override 1 index"]');
    const overrideFollow = section.querySelector('[aria-label="SEO route override 1 follow"]');
    if (
      !(title instanceof HTMLInputElement) ||
      !(og instanceof HTMLInputElement) ||
      !(faviconInput instanceof HTMLInputElement) ||
      !(descriptionInput instanceof HTMLTextAreaElement) ||
      !(robots instanceof HTMLTextAreaElement) ||
      (${JSON.stringify(Boolean(seoOverrideMatch))} && (
        !(overrideMatch instanceof HTMLInputElement) ||
        !(overrideLabel instanceof HTMLInputElement) ||
        !(overrideTitle instanceof HTMLInputElement) ||
        !(overrideDescription instanceof HTMLTextAreaElement) ||
        !(overrideCanonical instanceof HTMLInputElement) ||
        !(overrideOgImage instanceof HTMLInputElement) ||
        !(overrideKeywords instanceof HTMLInputElement) ||
        !(overridePriority instanceof HTMLInputElement) ||
        !(overrideFrequency instanceof HTMLSelectElement) ||
        !(overrideIndex instanceof HTMLInputElement) ||
        !(overrideFollow instanceof HTMLInputElement)
      ))
    ) {
      return {
        ok: false,
        reason: 'seo-controls-missing',
        inputs: Array.from(section.querySelectorAll('input')).map((input) => ({ label: input.getAttribute('aria-label'), placeholder: input.getAttribute('placeholder'), value: input.value })).slice(0, 40),
        selects: Array.from(section.querySelectorAll('select')).map((select) => ({ label: select.getAttribute('aria-label'), value: select.value })),
        textareas: Array.from(section.querySelectorAll('textarea')).map((textarea) => ({ placeholder: textarea.getAttribute('placeholder'), value: textarea.value })).slice(0, 12),
      };
    }

    setNativeValue(title, ${JSON.stringify(titleTemplate)});
    setNativeValue(descriptionInput, ${JSON.stringify(description)});
    setNativeValue(og, ${JSON.stringify(ogImage)});
    setNativeValue(faviconInput, ${JSON.stringify(favicon)});
    setNativeValue(robots, ${JSON.stringify(robotsRule)});
    if (${JSON.stringify(Boolean(seoOverrideMatch))}) {
      setNativeValue(overrideLabel, 'Smoke route override');
      setNativeValue(overrideMatch, ${JSON.stringify(seoOverrideMatch || '')});
      setNativeValue(overrideTitle, ${JSON.stringify(seoOverrideTitle || '')});
      setNativeValue(overrideDescription, ${JSON.stringify(seoOverrideDescription || '')});
      setNativeValue(overrideCanonical, ${JSON.stringify(seoOverrideCanonical || '')});
      setNativeValue(overrideOgImage, ${JSON.stringify(seoOverrideOgImage || '')});
      setNativeValue(overrideKeywords, ${JSON.stringify(seoOverrideKeywords || '')});
      setNativeValue(overridePriority, String(${JSON.stringify(seoOverridePriority ?? 0.9)}));
      setNativeValue(overrideFrequency, ${JSON.stringify(seoOverrideFrequency || 'daily')});
      if (!overrideIndex.checked) overrideIndex.click();
      if (!overrideFollow.checked) overrideFollow.click();
    }
    return {
      ok: true,
      title: title.value,
      description: descriptionInput.value,
      og: og.value,
      favicon: faviconInput.value,
      robots: robots.value,
      overrideMatch: overrideMatch instanceof HTMLInputElement ? overrideMatch.value : null,
      overrideTitle: overrideTitle instanceof HTMLInputElement ? overrideTitle.value : null,
    };
  })()`);
  assert(result.ok, `Unable to configure SEO through UI: ${JSON.stringify(result)}`);

  await clickButtonByText(client, '[data-testid="site-seo-panel"]', 'Save SEO');
  await waitForText(client, '[data-testid="site-seo-panel"]', 'SEO defaults saved and reflected in public SEO discovery.', 'SEO save notice');
};

const configureCommentPolicyThroughUi = async (client, { blockedTerm, closedMessage }) => {
  await waitForCommentPolicyEditorReady(client);
  const result = await evaluate(client, `(() => {
    ${setInputValue}
    const section = document.querySelector('[data-testid="site-comment-policy-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };
    const findCheckbox = (labelText) => Array.from(section.querySelectorAll('label')).find((label) => (
      (label.textContent || '').includes(labelText)
    ))?.querySelector('input[type="checkbox"]');
    const requireEmail = findCheckbox('Require email');
    const reports = findCheckbox('Enable reports');
    const moderation = section.querySelector('select[aria-label="Site default comment moderation"]');
    const sort = section.querySelector('select[aria-label="Site default comment sort"]');
    const closed = section.querySelector('input[aria-label="Site comment closed message"]');
    const blockedTerms = section.querySelector('textarea[aria-label="Site comment blocked terms"]');
    if (
      !(requireEmail instanceof HTMLInputElement) ||
      !(reports instanceof HTMLInputElement) ||
      !(moderation instanceof HTMLSelectElement) ||
      !(sort instanceof HTMLSelectElement) ||
      !(closed instanceof HTMLInputElement) ||
      !(blockedTerms instanceof HTMLTextAreaElement)
    ) {
      return { ok: false, reason: 'controls-missing', text: section.textContent?.slice(0, 1200) || '' };
    }
    if (!requireEmail.checked) requireEmail.click();
    if (reports.checked) reports.click();
    setNativeValue(moderation, 'auto-approve');
    setNativeValue(sort, 'oldest');
    setNativeValue(closed, ${JSON.stringify(closedMessage)});
    setNativeValue(blockedTerms, ${JSON.stringify(blockedTerm)});
    return {
      ok: true,
      requireEmail: requireEmail.checked,
      reports: reports.checked,
      moderation: moderation.value,
      sort: sort.value,
      closed: closed.value,
      blockedTerms: blockedTerms.value,
    };
  })()`);
  assert(result.ok, `Unable to configure comment policy through UI: ${JSON.stringify(result)}`);

  await clickButtonByText(client, '[data-testid="site-comment-policy-panel"]', 'Save comment policy');
  await waitForText(client, '[data-testid="site-workspace-command-center"]', 'Site comment policy saved.', 'Comment policy save notice');
};

const assertApiReadback = async (siteId, expected) => {
  const navigation = await getNavigation(siteId);
  const redirects = await getRedirects(siteId);
  const seo = await getSeo(siteId);
  const frontendDesign = await getFrontendDesign(siteId);
  const site = await getSite(siteId);
  const auditLogs = await getSiteAuditLogs(siteId);
  const forms = await getForms(siteId);
  const domainVerification = site?.settings?.domainVerification;
  const webhooks = site?.settings?.webhooks;
  const webhookEndpoint = webhooks?.endpoints?.find((endpoint) => endpoint.url === expected.webhookUrl);
  const managedForm = forms.find((form) => form.name === expected.formName);
  const managedField = managedForm?.fields?.find((field) => field.key === expected.formFieldKey);

  assert(
    navigation?.settings?.primary?.some((item) => item.label === expected.routeLabel && item.path === expected.routePath),
    `Navigation API did not include primary route item: ${JSON.stringify(navigation).slice(0, 1000)}`,
  );
  const primaryRouteItem = navigation?.settings?.primary?.find((item) => item.label === expected.routeLabel);
  assert(
    primaryRouteItem?.children?.[0]?.label === expected.navChildTwoLabel &&
      primaryRouteItem?.children?.[0]?.path === expected.navChildTwoPath &&
      primaryRouteItem?.children?.[1]?.label === expected.navChildOneLabel &&
      primaryRouteItem?.children?.[1]?.path === expected.navChildOnePath,
    `Navigation API did not preserve drag-reordered child route order: ${JSON.stringify(primaryRouteItem).slice(0, 1200)}`,
  );
  assert(
    navigation?.settings?.footer?.some((item) => item.label === expected.footerLabel && item.href === expected.footerHref),
    `Navigation API did not include footer URL item: ${JSON.stringify(navigation).slice(0, 1000)}`,
  );
  assert(
    navigation?.settings?.layout?.header?.showSearch === true,
    `Navigation layout search toggle did not persist: ${JSON.stringify(navigation?.settings?.layout).slice(0, 500)}`,
  );
  assert(
    redirects?.rules?.some((rule) => rule.from === expected.redirectFrom && rule.to === expected.redirectTo && Number(rule.statusCode) === 302),
    `Redirect API did not include saved rule: ${JSON.stringify(redirects).slice(0, 1000)}`,
  );
  assert(
    seo?.titleTemplate === expected.titleTemplate &&
      seo?.defaultDescription === expected.description &&
      seo?.defaultOgImage === expected.ogImage &&
      seo?.favicon === expected.favicon &&
      seo?.robots?.extraRules === expected.robotsRule &&
      seo?.routeOverrides?.some((override) => (
        override.match === expected.seoOverrideMatch &&
        override.title === expected.seoOverrideTitle &&
        override.description === expected.seoOverrideDescription &&
        override.canonical === expected.seoOverrideCanonical &&
        override.ogImage === expected.seoOverrideOgImage &&
        override.priority === expected.seoOverridePriority &&
        override.changeFrequency === expected.seoOverrideFrequency &&
        override.keywords?.includes('route-override') &&
        override.robots?.index === true &&
        override.robots?.follow === true
      )),
    `SEO API did not include saved defaults: ${JSON.stringify(seo).slice(0, 1000)}`,
  );
  const publicSeo = await getPublicSeo(siteId);
  const overriddenRoute = publicSeo.routes?.find((route) => route.canonical === expected.seoOverrideCanonical);
  assert(
    overriddenRoute?.title === expected.seoOverrideTitle &&
      overriddenRoute?.description === expected.seoOverrideDescription &&
      overriddenRoute?.openGraph?.image === expected.seoOverrideOgImage &&
      overriddenRoute?.priority === expected.seoOverridePriority &&
      overriddenRoute?.changeFrequency === expected.seoOverrideFrequency &&
      overriddenRoute?.keywords?.includes('route-override') &&
      overriddenRoute?.robots?.index === true &&
      overriddenRoute?.robots?.follow === true,
    `Public SEO discovery did not expose route override: ${JSON.stringify({ overriddenRoute, routes: publicSeo.routes?.slice(0, 12) }).slice(0, 1800)}`,
  );
  assert(
    domainVerification?.status === 'verified' &&
      typeof domainVerification?.token === 'string' &&
      domainVerification.token.length > 0 &&
      typeof domainVerification?.txtValue === 'string' &&
      domainVerification.txtValue.includes('backy-site-verification=') &&
      typeof domainVerification?.verifiedAt === 'string' &&
      domainVerification.verifiedAt.length > 0,
    `Site API did not include verified domain verification state: ${JSON.stringify(domainVerification).slice(0, 1000)}`,
  );
  assert(
    site?.status === 'published' &&
      site?.isPublished === true &&
      site?.settings?.siteStatus === 'published' &&
      site?.theme?.colors?.primary === expected.themePrimary &&
      site?.theme?.colors?.secondary === expected.themeSecondary &&
      site?.theme?.colors?.background === expected.themeBackground &&
      site?.theme?.colors?.surface === expected.themeSurface &&
      site?.theme?.colors?.text === expected.themeText &&
      site?.theme?.colors?.textMuted === expected.themeTextMuted &&
      site?.theme?.fonts?.heading === expected.themeHeading &&
      site?.theme?.fonts?.body === expected.themeBody &&
      site?.theme?.fonts?.mono === expected.themeMono &&
      Number(site?.theme?.spacing?.unit) === expected.themeSpacingUnit &&
      Number(site?.theme?.spacing?.scale) === expected.themeSpacingScale &&
      site?.theme?.customCSS === expected.themeCustomCss,
    `Site API did not include saved theme and publish settings: ${JSON.stringify({ status: site?.status, isPublished: site?.isPublished, theme: site?.theme, siteStatus: site?.settings?.siteStatus }).slice(0, 1500)}`,
  );
  assert(
    site?.settings?.commentPolicy?.requireEmail === true &&
      site?.settings?.commentPolicy?.enableReports === false &&
      site?.settings?.commentPolicy?.moderationMode === 'auto-approve' &&
      site?.settings?.commentPolicy?.sort === 'oldest' &&
      site?.settings?.commentPolicy?.closedMessage === expected.commentClosedMessage &&
      site?.settings?.commentPolicy?.blockedTerms?.includes(expected.commentBlockedTerm),
    `Site API did not include saved comment policy: ${JSON.stringify(site?.settings?.commentPolicy).slice(0, 1000)}`,
  );
  assert(
    webhooks?.enabled === true &&
      webhookEndpoint?.name === expected.webhookName &&
      webhookEndpoint?.enabled === true &&
      webhookEndpoint?.secretId === expected.webhookSecretId &&
      webhookEndpoint?.headers?.['X-Backy-Smoke'] === expected.webhookHeaderValue &&
      webhookEndpoint?.eventKinds?.includes('form-submission') &&
      webhookEndpoint?.eventKinds?.includes('contact-shared') &&
      webhookEndpoint?.eventKinds?.includes('comment-submitted') &&
      webhookEndpoint?.eventKinds?.includes('comment-reported'),
    `Site API did not include saved webhooks: ${JSON.stringify(webhooks).slice(0, 1500)}`,
  );
  assert(
    managedForm?.title === expected.formTitle &&
      managedForm?.description === expected.formDescription &&
      managedForm?.audience === 'public' &&
      managedForm?.isActive === true &&
      managedForm?.moderationMode === 'auto-approve' &&
      managedForm?.notificationEmail === expected.formNotificationEmail &&
      managedForm?.notificationWebhook === expected.formNotificationWebhook &&
      managedForm?.successRedirectUrl === expected.formRedirectUrl &&
      managedForm?.successMessage === expected.formSuccessMessage &&
      managedForm?.contactShare?.enabled === true &&
      managedField?.label === expected.formFieldLabel &&
      managedField?.type === 'select' &&
      managedField?.required === true &&
      managedField?.placeholder === expected.formFieldPlaceholder &&
      managedField?.helpText === expected.formFieldHelp &&
      managedField?.options?.includes('Starter') &&
      managedField?.options?.includes('Growth') &&
      managedField?.options?.includes('Enterprise'),
    `Forms API did not include saved site form builder definition: ${JSON.stringify({ managedForm, managedField }).slice(0, 1800)}`,
  );
  assert(
    frontendDesign?.status === 'synced' &&
      frontendDesign?.source?.type === 'custom-frontend' &&
      frontendDesign?.source?.label === expected.frontendLabel &&
      frontendDesign?.source?.url === expected.frontendUrl &&
      frontendDesign?.source?.repository === expected.frontendRepository &&
      frontendDesign?.source?.branch === expected.frontendBranch &&
      frontendDesign?.tokens?.colors?.primary === '#0f766e' &&
      frontendDesign?.chrome?.header?.component === 'SmokeHeader' &&
      frontendDesign?.templates?.some((template) => template.id === 'smoke-page-contract' && template.type === 'page') &&
      frontendDesign?.editableMap?.some((entry) => entry.role === 'site.header'),
    `Frontend design API did not include saved contract: ${JSON.stringify(frontendDesign).slice(0, 1500)}`,
  );
  const auditActions = new Set(auditLogs.map((log) => log.action));
  for (const action of [
    'site.created',
    'site.navigation.updated',
    'site.redirects.updated',
    'site.seo.updated',
    'site.domainVerification.updated',
    'site.themePublish.updated',
    'site.webhooks.updated',
    'form.create',
    'form.update',
    'commentPolicy.update',
    'frontendDesign.capture',
    'frontendDesign.update',
  ]) {
    assert(auditActions.has(action), `Site audit logs did not include ${action}: ${JSON.stringify(auditLogs.map((log) => log.action)).slice(0, 1000)}`);
  }

  return { navigation, redirects, seo, frontendDesign, site, forms, auditLogs };
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-site-detail-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, siteId, ownerSessionToken, ownerUserId }) => {
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

  if (siteId) {
    try {
      await deleteSite(siteId, ownerSessionToken);
    } catch {
      // The site detail smoke owns only temporary sites.
    }
  }

  if (ownerUserId) {
    try {
      await deleteUser(ownerUserId);
    } catch {
      // Temporary RBAC users are deleted best-effort.
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let siteId;
  let seoPageId;
  let ownerUserId;
  let ownerSessionToken;
  let restoredQuotaIntegrations = null;
  const suffix = Date.now().toString(36);
  const siteName = `Site Detail Smoke ${suffix}`;
  const slug = `site-detail-smoke-${suffix}`;
  const expected = {
    routeLabel: `Smoke Route ${suffix}`,
    routePath: `/smoke-route-${suffix}`,
    navChildOneLabel: `Smoke Child Alpha ${suffix}`,
    navChildOnePath: `/smoke-child-alpha-${suffix}`,
    navChildTwoLabel: `Smoke Child Beta ${suffix}`,
    navChildTwoPath: `/smoke-child-beta-${suffix}`,
    footerLabel: `Smoke Docs ${suffix}`,
    footerHref: `https://docs.example.com/${suffix}`,
    redirectFrom: `/old-smoke-${suffix}`,
    redirectTo: `/new-smoke-${suffix}`,
    titleTemplate: `%s | ${siteName}`,
    description: `Default SEO description for ${siteName}.`,
    ogImage: `/uploads/${slug}/social-card.png`,
    favicon: `/uploads/${slug}/favicon.ico`,
    robotsRule: `Disallow: /private-${suffix}`,
    seoRouteSlug: `seo-route-${suffix}`,
    seoOverrideTitle: `Smoke SEO Override ${suffix}`,
    seoOverrideDescription: `Route-specific SEO override description for ${siteName}.`,
    seoOverrideCanonical: `/seo-route-${suffix}-canonical`,
    seoOverrideOgImage: `/uploads/${slug}/route-social-card.png`,
    seoOverrideKeywords: 'route-override, smoke-seo',
    seoOverridePriority: 0.9,
    seoOverrideFrequency: 'daily',
    commentBlockedTerm: `blocked-${suffix}`,
    commentClosedMessage: `Comments are closed for ${siteName}.`,
    frontendLabel: `Smoke Frontend ${suffix}`,
    frontendUrl: `https://${slug}.example.com`,
    frontendRepository: `backy/smoke-${suffix}`,
    frontendBranch: `design-${suffix}`,
    themePrimary: '#0f766e',
    themeSecondary: '#7c3aed',
    themeBackground: '#f8fafc',
    themeSurface: '#e0f2fe',
    themeText: '#111827',
    themeTextMuted: '#475569',
    themeHeading: 'Inter Tight',
    themeBody: 'Inter',
    themeMono: 'JetBrains Mono',
    themeSpacingUnit: 6,
    themeSpacingScale: 1.2,
    themeCustomCss: `.site-${slug} { scroll-behavior: smooth; }`,
    webhookName: `Smoke Webhook ${suffix}`,
    webhookUrl: `https://hooks.example.com/site-${suffix}`,
    webhookSecretId: `env:BACKY_SITE_WEBHOOK_SECRET_${suffix.toUpperCase()}`,
    webhookHeaderValue: `smoke-${suffix}`,
    webhookHeadersText: JSON.stringify({ 'X-Backy-Smoke': `smoke-${suffix}` }, null, 2),
    formTitle: `Smoke Lead Form ${suffix}`,
    formName: `smoke_lead_form_${suffix.toLowerCase()}`,
    formDescription: `Site detail managed lead form for ${siteName}.`,
    formSuccessMessage: `Thanks from ${siteName}.`,
    formRedirectUrl: `/thanks-${suffix}`,
    formNotificationEmail: `leads-${suffix}@example.com`,
    formNotificationWebhook: `https://hooks.example.com/forms/${suffix}`,
    formFieldLabel: `Budget ${suffix}`,
    formFieldKey: `budget_${suffix.toLowerCase()}`,
    formFieldPlaceholder: '5000',
    formFieldHelp: 'Approximate project budget.',
    formFieldOptions: 'Starter, Growth, Enterprise',
  };

  try {
    assertSiteDetailSourceContract();
    if (process.env.BACKY_SITE_DETAIL_SOURCE_ONLY === '1') {
      console.log(JSON.stringify({ ok: true, guard: 'site-detail-source' }));
      return;
    }
    await loginAdminApi();
    await updateUser('user-admin', { role: 'admin', status: 'active' });
    const existing = await findSiteBySlug(slug);
    assert(!existing, `Temporary site already exists: ${slug}`);
    restoredQuotaIntegrations = await temporarilyAllowSiteCreationQuota(1);
    const owner = await createUser({
      fullName: `Site Detail Owner ${suffix}`,
      email: `site-detail-owner-${suffix}@example.com`,
      role: 'owner',
      status: 'invited',
    });
    ownerUserId = owner.id;
    ownerSessionToken = (await acceptInviteToken((await createInviteToken(owner.id)).token)).token;

    const site = await createSite({
      name: siteName,
      slug,
      customDomain: `${slug}.example.com`,
    });
    siteId = site.id;
    await assertAdminSiteDeleteDenied(siteId);
    const seoPage = await createPage(site.id, {
      title: `SEO Route ${suffix}`,
      slug: expected.seoRouteSlug,
      description: `Temporary route for site-level SEO override smoke on ${siteName}.`,
    });
    seoPageId = seoPage.id;
    expected.seoOverrideMatch = `/${expected.seoRouteSlug}`;

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1680,
      height: 1180,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });

    await navigateToSites(client, siteName);
    await navigateToSiteDetail(client, site.id, siteName);
    await assertSiteDetailLayout(client, siteName);
    await waitForReadinessPanelReady(client);
    await waitForCommentsModerationReady(client);

    await configureDomainVerificationThroughUi(client);
    await configureThemePublishThroughUi(client, expected);
    await configureWebhooksThroughUi(client, expected);
    await configureFormBuilderThroughUi(client, expected);
    await waitForFormQueuesReady(client);
    await configureNavigationThroughUi(client, expected);
    await configureFrontendDesignThroughUi(client, expected);
    await configureRedirectsThroughUi(client, {
      from: expected.redirectFrom,
      to: expected.redirectTo,
    });
    await configureSeoThroughUi(client, expected);
    await configureCommentPolicyThroughUi(client, {
      blockedTerm: expected.commentBlockedTerm,
      closedMessage: expected.commentClosedMessage,
    });
    await assertApiReadback(site.id, expected);
    await waitForSiteAuditPanelReady(client);
    await clickButtonByText(client, '[data-testid="site-audit-panel"]', 'Refresh activity');
    await waitForText(client, '[data-testid="site-audit-panel"]', 'site.navigation.updated', 'Site activity audit row');
    await waitForText(client, '[data-testid="site-audit-panel"]', 'site.webhooks.updated', 'Site webhooks audit row');
    await waitForText(client, '[data-testid="site-audit-panel"]', 'form.update', 'Site form update audit row');
    await waitForText(client, '[data-testid="site-audit-panel"]', 'site.seo.updated', 'Site SEO audit row');

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deletePage(siteId, seoPageId);
    seoPageId = null;
    await deleteSite(siteId, ownerSessionToken);
    await waitForSiteMissing(slug);
    siteId = null;
    await deleteUser(ownerUserId);
    ownerUserId = null;

    console.log(JSON.stringify({
      ok: true,
      siteName,
      slug,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (restoredQuotaIntegrations) {
      await updateSettings({ integrations: restoredQuotaIntegrations }).catch(() => {});
    }
    await updateUser('user-admin', { role: 'owner', status: 'active' }).catch(() => {});
    if (siteId && seoPageId) {
      await deletePage(siteId, seoPageId).catch(() => {});
    }
    await cleanup({ client, childProcess, userDataDir, siteId, ownerSessionToken, ownerUserId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

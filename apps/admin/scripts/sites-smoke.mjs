#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_SITES_CDP_PORT || 9383);
const SCREENSHOT_PATH = process.env.BACKY_SITES_SCREENSHOT || path.join(os.tmpdir(), 'backy-sites-smoke.png');
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertSitesRouteSourceContract = () => {
  const source = fs.readFileSync(new URL('../src/routes/sites.tsx', import.meta.url), 'utf8');
  const createSource = fs.readFileSync(new URL('../src/routes/sites.new.tsx', import.meta.url), 'utf8');
  const detailSource = fs.readFileSync(new URL('../src/routes/sites.$siteId.tsx', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Sites route must use the shared EmptyState component');
  assert(source.includes('validateSearch') && source.includes('siteMatchesIdentifier(site, requestedSiteId)'), 'Sites route must allow selecting the API handoff site from the siteId search param');
  assert(source.includes('title="No site audit events yet"'), 'Sites audit panel must keep the empty audit title visible');
  assert(source.includes('Site creation, status changes, domain updates, quota refreshes, and delivery handoffs will appear here.'), 'Sites audit empty state must explain which actions populate activity');
  assert(source.includes('title="No deploy handoffs yet"'), 'Sites deploy history must keep the empty handoff title visible');
  assert(source.includes('Record a preview, production promotion, or rollback to keep Vercel delivery history attached to this site.'), 'Sites deploy history empty state must explain how to populate handoff history');
  assert(source.includes('title="No billing or quota events yet"'), 'Sites billing history must keep the empty quota title visible');
  assert(source.includes('Change plans or refresh usage to build a quota history for this workspace.'), 'Sites billing history empty state must explain how to populate quota history');
  assert(source.includes('title="No billing workspace selected"'), 'Sites billing workspace must keep the no-site selected empty title visible');
  assert(source.includes('Create or select a site to assign a plan, track quota usage, and review billing ownership.'), 'Sites billing workspace empty state must explain how to start billing setup');
  assert(
    source.includes('data-testid="sites-rbac-scope"') &&
      source.includes('data-testid="sites-control-map"') &&
      source.includes('data-default-collapsed="true"'),
    'Sites command center must keep dense RBAC and control-map details in progressive disclosure sections',
  );
  assert(
    source.includes('data-testid="sites-delivery-operations-details"') &&
      source.includes('data-testid="sites-delivery-operations-panels"') &&
      source.includes('Delivery, deployment, and quota operations') &&
      source.includes('DNS verification, Vercel handoffs, plan usage, and provider-adjacent site operations.') &&
      source.includes('data-testid="sites-audit-details"') &&
      source.includes('data-testid="sites-audit-disclosure-panel"') &&
      source.includes('Request-id-backed create, update, archive, duplicate, and delete evidence.'),
    'Sites route must keep provider-adjacent delivery/quota operations and audit evidence behind default-collapsed disclosures',
  );
  assert(source.includes('title="No domain verification workspace selected"'), 'Sites domain verification workspace must keep the no-site selected empty title visible');
  assert(source.includes('Create or select a site to prepare custom-domain DNS records and track verification status.'), 'Sites domain verification empty state must explain how to start DNS setup');
  assert(
    source.includes('agentHandoff: `${publicApiBase}/sites/${siteApiId}/agent-handoff`') &&
      source.includes('resolveWithHost: `${publicApiBase}/sites/${siteApiId}/resolve?path=/&domain={host}`') &&
      source.includes('renderWithHost: `${publicApiBase}/sites/${siteApiId}/render?path={path}&domain={host}`') &&
      source.includes('NEXT_PUBLIC_BACKY_API_BASE_URL: publicApiBase') &&
      source.includes('NEXT_PUBLIC_BACKY_SITE_ID: getSiteApiId(site)') &&
      source.includes('NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST: publicHost') &&
      source.includes('BACKY_PUBLIC_API_BASE_URL: publicApiBase') &&
      source.includes('BACKY_SITE_ID: getSiteApiId(site)') &&
      source.includes('BACKY_SITE_PUBLIC_HOST: publicHost') &&
      source.includes("browserSafeEnv: ['NEXT_PUBLIC_BACKY_API_BASE_URL', 'NEXT_PUBLIC_BACKY_SITE_ID', 'NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST']") &&
      source.includes("serverSideEnv: ['BACKY_PUBLIC_API_BASE_URL', 'BACKY_SITE_ID', 'BACKY_SITE_PUBLIC_HOST']") &&
      source.includes("domainOwner: 'custom-frontend-vercel-project'") &&
      source.includes("schemaVersion: 'backy.site-frontend-routing.v1'") &&
      source.includes("examples: ['blog.example.com', 'docs.example.com', 'studio.example.com']") &&
      source.includes('<SiteApiSnippet label="Agent handoff" value={publicAgentHandoffUrl} />') &&
      source.includes('<SiteApiSnippet label="Resolve with host" value={publicResolveWithHostUrl} />') &&
      source.includes('<SiteApiSnippet label="Render with host" value={publicRenderWithHostUrl} />') &&
      source.includes('<SiteApiSnippet label="Browser-safe frontend env" value={selectedBrowserSafeFrontendEnv} />') &&
      source.includes('<SiteApiSnippet label="Server-side loader env" value={selectedServerSideFrontendEnv} />'),
    'Sites frontend API panel must expose agent-handoff, host-aware render/resolve, public host env, and routing contract metadata.',
  );
  assert(source.includes('title="No deployment workspace selected"'), 'Sites deployment workspace must keep the no-site selected empty title visible');
  assert(source.includes('Create or select a site to prepare Vercel handoff commands, target URLs, and deploy history.'), 'Sites deployment empty state must explain how to start deployment setup');
  assert(source.includes('data-testid="sites-error-state"') && source.includes('Sites workspace needs attention'), 'Sites route must expose a labelled backend error state');
  assert(source.includes('aria-label="Retry loading sites"') && source.includes('Retry load'), 'Sites backend error state must expose a retry action');
  assert(source.includes('hasActiveFilters') && source.includes('Clear filters'), 'Sites backend error state must expose filter recovery when filters are active');
  assert(source.includes('data-testid="sites-permission-state"') && source.includes('Site permissions could not be verified'), 'Sites route must expose a labelled permission error state');
  assert(source.includes('aria-label="Retry loading site permissions"') && source.includes('Retry permissions'), 'Sites permission error state must expose a retry action');
  assert(source.includes('const loadSitePermissions = useCallback(() => {'), 'Sites route must keep permission loading in a reusable callback');
  assert(source.includes('return loadSitePermissions();'), 'Sites route must wire the permission-loading effect through the reusable callback');
  assert(source.includes('loadSitePermissions();') && source.includes('void loadSites();'), 'Sites workspace refresh must re-fetch permissions before reloading site data');
  assert(
    source.includes('const sitePageCountLoadRef = useRef(0);') &&
      source.includes('const pageCountRequestId = sitePageCountLoadRef.current + 1;') &&
      source.includes('setSites(backendSites);') &&
      source.includes('void Promise.all(') &&
      source.includes('if (sitePageCountLoadRef.current === pageCountRequestId)') &&
      source.indexOf('setSites(backendSites);') < source.indexOf('void Promise.all('),
    'Sites route must render backend sites immediately and hydrate page counts in the background so large workspaces do not stay on stale seeded data.',
  );
  assert(
    source.includes('const canUseSiteRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);') &&
      source.includes('const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseSiteRoleDefaults;') &&
      source.includes('const isSitesPermissionAllowed = (key: SitePermissionKey) => (') &&
      source.includes("const canViewSites = isSitesPermissionAllowed('sites.view');") &&
      source.includes("const canCreateSites = isSitesPermissionAllowed('sites.create');") &&
      source.includes("const canConfigureSites = isSitesPermissionAllowed('sites.configure');") &&
      source.includes("const canDeleteSites = isSitesPermissionAllowed('sites.delete');") &&
      source.includes("const canManageBilling = isSitesPermissionAllowed('settings.billing');") &&
      source.includes("const canExportActivity = isSitesPermissionAllowed('activity.export');") &&
      source.includes('const isSitesBusy = isLoading || isSiteMutationBusy;') &&
      !source.includes('const canViewSites = !isPermissionMatrixPending') &&
      !source.includes('const isSitesBusy = isLoading || isSiteMutationBusy || isPermissionMatrixPending;') &&
      source.includes('data-testid="sites-permission-state"') &&
      source.includes('Site permissions could not be verified'),
    'Sites route must expose permission recovery and keep role-default workflows usable while permission details hydrate',
  );
  assert(
    source.includes('data-testid={`sites-actions-${site.id}`}') &&
      source.includes('data-testid={`sites-actions-status-${site.id}`}') &&
      source.includes('data-action-status={siteActionStatus}') &&
      source.includes('aria-label={`Actions for ${site.name}`}') &&
      source.includes('Preview unavailable:') &&
      source.includes('Manage unavailable:') &&
      source.includes('Duplicate unavailable:') &&
      source.includes('Archive unavailable:') &&
      source.includes('Delete unavailable:') &&
      source.includes('data-action-state={archiveDisabledReason ?') &&
      source.includes('data-disabled-reason={deleteDisabledReason || undefined}') &&
      source.includes('This site is already archived.'),
    'Sites row actions must expose named groups, hidden status summaries, action-state metadata, and disabled reasons.',
  );
  assert(
    source.includes("const createSiteActionStatusId = 'sites-create-action-status';") &&
      source.includes('data-testid="sites-create-action-status"') &&
      source.includes('New site unavailable:') &&
      source.includes('aria-describedby={createSiteActionStatusId}') &&
      source.includes('data-action-state={createSiteActionDisabledReason ?') &&
      source.includes('data-action-status={createSiteActionStatus}') &&
      source.includes('data-disabled-reason={createSiteActionDisabledReason || undefined}'),
    'Sites New site entry points must share a create action status contract instead of relying on disabled styling or title text.',
  );
  assert(
    createSource.includes('const starterPageControlsDisabled = creationFormDisabled || !canEditPages || (statusSeedsPublishedPages && !canPublishPages);'),
    'Site create blueprint controls must disable starter-page blueprints when published page seeding lacks pages.publish',
  );
  assert(
    createSource.includes('Published starter page seeding needs pages.publish.'),
    'Site create route must explain the pages.publish requirement for published starter pages',
  );
  assert(
    createSource.includes('const loadSiteCreatePermissions = useCallback(() => {') &&
      createSource.includes('data-testid="site-create-permission-state"') &&
      createSource.includes('Site creation permissions need attention') &&
      createSource.includes('aria-label="Retry loading site creation permissions"') &&
      createSource.includes('Retry permissions') &&
      createSource.includes('to="/users"') &&
      createSource.includes('Review users'),
    'Site create permission state must expose retryable permission recovery and user-access handoff',
  );
  assert(
    createSource.includes('const canUseSiteCreateRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);') &&
      createSource.includes('const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseSiteCreateRoleDefaults;') &&
      createSource.includes('const isSiteCreateRoutePermissionAllowed = (key: SiteCreatePermissionKey) => (') &&
      createSource.includes("const canCreateSites = isSiteCreateRoutePermissionAllowed('sites.create');") &&
      createSource.includes("const canEditPages = isSiteCreateRoutePermissionAllowed('pages.edit');") &&
      createSource.includes("const canPublishPages = isSiteCreateRoutePermissionAllowed('pages.publish');") &&
      createSource.includes('const isCreateBusy = isLoading;') &&
      createSource.includes('data-testid="site-create-permission-sync-state"') &&
      !createSource.includes('const canCreateSites = !isPermissionMatrixPending') &&
      !createSource.includes('const isCreateBusy = isLoading || isPermissionMatrixPending;'),
    'Site create route must keep role-default create/page-seeding workflows usable while permission details hydrate',
  );
  assert(
    createSource.includes('buildSiteCreateInlineErrors') &&
      createSource.includes('const [siteCreateSubmitted, setSiteCreateSubmitted] = useState(false);') &&
      createSource.includes('data-testid="site-create-form"') &&
      createSource.includes('noValidate') &&
      createSource.includes('data-testid="site-create-inline-error"') &&
      createSource.includes('data-testid="site-create-name-error"') &&
      createSource.includes('data-testid="site-create-slug-error"') &&
      createSource.includes('data-testid="site-create-custom-domain-error"') &&
      createSource.includes('data-testid="site-create-billing-email-error"') &&
      createSource.includes('data-testid="site-create-template-import-url-error"') &&
      createSource.includes('aria-invalid={Boolean(showSiteCreateInlineErrors') &&
      createSource.includes('aria-describedby={showSiteCreateInlineErrors') &&
      createSource.includes("setError('Fix site creation fields before creating.')") &&
      createSource.includes('const canSubmit = canCreateSites && canSeedStarterPages;') &&
      createSource.includes("const siteCreateSubmitStatusId = 'site-create-submit-action-status';") &&
      createSource.includes('data-testid="site-create-submit-action-status"') &&
      createSource.includes('Create site unavailable:') &&
      createSource.includes('aria-describedby={siteCreateSubmitStatusId}') &&
      createSource.includes('data-action-state={siteCreateSubmitDisabledReason ?') &&
      createSource.includes('data-action-status={siteCreateSubmitStatus}') &&
      createSource.includes('data-disabled-reason={siteCreateSubmitDisabledReason || undefined}') &&
      createSource.includes("data-target-site-id={displaySlug || 'new-site'}") &&
      createSource.includes('data-target-blueprint={selectedBlueprint.id}'),
    'Site create form must keep the create action reachable for permitted users and show source-guarded inline validation before backend mutation',
  );
  assert(
    createSource.includes('Subdomains are valid custom domains. Save the exact host') &&
      createSource.includes('studio.example.com') &&
      createSource.includes('data-testid="site-create-agent-handoff-read-start"') &&
      createSource.includes('agentHandoff: `${publicApiBase}/sites/{siteId}/agent-handoff`') &&
      createSource.includes('publicManifest: `${publicApiBase}/sites/{siteId}/manifest`') &&
      createSource.includes('publicResolveWithHost: `${publicApiBase}/sites/{siteId}/resolve?path=/&domain={host}`') &&
      createSource.includes('publicRenderWithHost: `${publicApiBase}/sites/{siteId}/render?path=/...&domain={host}`') &&
      createSource.includes('NEXT_PUBLIC_BACKY_API_BASE_URL: publicApiBase') &&
      createSource.includes("NEXT_PUBLIC_BACKY_SITE_ID: '{siteId}'") &&
      createSource.includes("NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST: normalizedDomain || `${displaySlug || 'new-site'}.backy.app`") &&
      createSource.includes('BACKY_PUBLIC_API_BASE_URL: publicApiBase') &&
      createSource.includes("BACKY_SITE_ID: '{siteId}'") &&
      createSource.includes("BACKY_SITE_PUBLIC_HOST: normalizedDomain || `${displaySlug || 'new-site'}.backy.app`") &&
      createSource.includes("browserSafeEnv: ['NEXT_PUBLIC_BACKY_API_BASE_URL', 'NEXT_PUBLIC_BACKY_SITE_ID', 'NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST']") &&
      createSource.includes("serverSideEnv: ['BACKY_PUBLIC_API_BASE_URL', 'BACKY_SITE_ID', 'BACKY_SITE_PUBLIC_HOST']") &&
      createSource.includes("domainOwner: 'custom-frontend-vercel-project'") &&
      createSource.includes('data-testid="site-create-browser-safe-env"') &&
      createSource.includes('data-testid="site-create-server-side-env"') &&
      createSource.includes("schemaVersion: 'backy.site-create-routing-handoff.v1'") &&
      createSource.includes('Frontend agents should read /agent-handoff first'),
    'Site create handoff must expose subdomain examples, agent-handoff read start, host-aware render/resolve, and frontend env variables.',
  );
  assert(
    /const canUseSiteDetailRoleDefaults =\s*isPermissionsLoading && !permissionMatrix && Boolean\(currentAdmin\);/.test(detailSource) &&
      /const isPermissionMatrixPending =\s*isPermissionsLoading && !permissionMatrix && !canUseSiteDetailRoleDefaults;/.test(detailSource) &&
      detailSource.includes('const isSiteDetailRoutePermissionAllowed = (') &&
      detailSource.includes('const canViewSite = isSiteDetailRoutePermissionAllowed("sites.view");') &&
      /const canConfigureSite =\s*isSiteDetailRoutePermissionAllowed\("sites.configure"\);/.test(detailSource) &&
      detailSource.includes('const canDeleteSite = isSiteDetailRoutePermissionAllowed("sites.delete");') &&
      detailSource.includes('const canViewForms = isSiteDetailRoutePermissionAllowed("forms.view");') &&
      detailSource.includes('const canCreateForms = isSiteDetailRoutePermissionAllowed("forms.create");') &&
      detailSource.includes('const canEditForms = isSiteDetailRoutePermissionAllowed("forms.edit");') &&
      detailSource.includes('const canManageForms = isSiteDetailRoutePermissionAllowed("forms.manage");') &&
      detailSource.includes('const canViewComments = isSiteDetailRoutePermissionAllowed("comments.view");') &&
      /const canConfigureComments =\s*isSiteDetailRoutePermissionAllowed\("comments.configure"\);/.test(detailSource) &&
      /const canExportActivity =\s*isSiteDetailRoutePermissionAllowed\("activity.export"\);/.test(detailSource) &&
      detailSource.includes('const isSiteSettingsBusy = isLoading;') &&
      detailSource.includes('const isCommentPolicyDisabled =') &&
      !detailSource.includes('const isSiteSettingsBusy = isLoading || commentPolicySaving;') &&
      detailSource.includes('data-testid="site-detail-permission-sync-state"') &&
      !/const canViewSite =\s*!isPermissionMatrixPending/.test(detailSource) &&
      !detailSource.includes('isLoading || commentPolicySaving || isPermissionMatrixPending'),
    'Site detail route must keep role-default workspace/form/comment actions usable while permission details hydrate',
  );
  assert(
    detailSource.includes('const auditLoadRequestRef = useRef(0);') &&
      detailSource.includes('const isAuditInitialLoading =') &&
      detailSource.includes('data-testid="site-audit-panel"') &&
      detailSource.includes('data-hydrated={String(auditState.hydrated)}') &&
      detailSource.includes('data-initial-loading={String(isAuditInitialLoading)}') &&
      detailSource.includes('site-audit-background-refresh') &&
      detailSource.includes('{isAuditInitialLoading ? (') &&
      !detailSource.includes('{auditState.loading ? ('),
    'Site detail audit panel must keep existing activity visible during background audit refresh after hydration.',
  );
  assert(
    detailSource.includes('const readinessLoadRequestRef = useRef(0);') &&
      detailSource.includes('const [readinessHydrated, setReadinessHydrated] = useState(false);') &&
      detailSource.includes('const isReadinessInitialLoading =') &&
      detailSource.includes('data-testid="site-readiness-panel"') &&
      detailSource.includes('data-hydrated={String(readinessHydrated)}') &&
      detailSource.includes('data-initial-loading={String(isReadinessInitialLoading)}') &&
      detailSource.includes('site-readiness-background-refresh') &&
      detailSource.includes('!readinessError || readinessHydrated'),
    'Site detail readiness panel must keep existing readiness results visible during background readiness refresh/error after hydration.',
  );
  assert(
    detailSource.includes('const submissionLoadRequestRef = useRef(0);') &&
      detailSource.includes('const contactLoadRequestRef = useRef(0);') &&
      detailSource.includes('const [submissionsHydrated, setSubmissionsHydrated] = useState(false);') &&
      detailSource.includes('const [contactsHydrated, setContactsHydrated] = useState(false);') &&
      detailSource.includes('const isSubmissionInitialLoading =') &&
      detailSource.includes('const isContactInitialLoading =') &&
      detailSource.includes('data-testid="site-submissions-panel"') &&
      detailSource.includes('data-hydrated={String(submissionsHydrated)}') &&
      detailSource.includes('site-submissions-background-refresh') &&
      detailSource.includes('{isSubmissionInitialLoading ? (') &&
      detailSource.includes('data-testid="site-contacts-panel"') &&
      detailSource.includes('data-hydrated={String(contactsHydrated)}') &&
      detailSource.includes('site-contacts-background-refresh') &&
      detailSource.includes('{isContactInitialLoading ? (') &&
      !detailSource.includes('{state.submissionLoading ? (') &&
      !detailSource.includes('{state.contactLoading ? ('),
    'Site detail submission/contact queues must keep existing rows visible during background workflow refresh after hydration.',
  );
  assert(
    detailSource.includes('hydrated: Boolean(response)') &&
      detailSource.includes('const frontendDesignLoadRequestRef = useRef(0);') &&
      detailSource.includes('if (!currentAdmin || isPermissionMatrixPending || (!permissionMatrix && !permissionError))') &&
      detailSource.includes('!frontendDesignState.hydrated') &&
      detailSource.includes('!frontendDesignState.errorMessage') &&
      detailSource.includes('preserveDirtyDraft') &&
      detailSource.includes('const isFrontendDesignDraftDisabled =') &&
      detailSource.includes('data-draft-disabled={String(isFrontendDesignDraftDisabled)}') &&
      detailSource.includes('site-frontend-design-background-refresh') &&
      !detailSource.includes('disabled={frontendDesignState.loading || !canConfigureSite}'),
    'Site detail frontend-design draft controls must not be hard-disabled by background contract refresh after hydration.',
  );
  assert(
    detailSource.includes('const navigationLoadRequestRef = useRef(0);') &&
      detailSource.includes('const applyNavigationEditorResponse =') &&
      detailSource.includes('!navigationState.hydrated') &&
      detailSource.includes('!navigationState.errorMessage') &&
      detailSource.includes('Latest navigation loaded in the background. Unsaved local edits were preserved.') &&
      detailSource.includes('const isNavigationDraftDisabled =') &&
      detailSource.includes('data-draft-disabled={String(isNavigationDraftDisabled)}') &&
      detailSource.includes('site-navigation-background-refresh') &&
      detailSource.includes('loading={isNavigationInitialLoading}') &&
      detailSource.includes('disabled={isNavigationDraftDisabled}') &&
      !detailSource.includes('loading={navigationState.loading || !canConfigureSite}'),
    'Site detail navigation draft controls must not be hidden or hard-disabled by background navigation refresh after hydration.',
  );
  assert(
    detailSource.includes('const webhookLoadRequestRef = useRef(0);') &&
      detailSource.includes('!webhookState.hydrated') &&
      detailSource.includes('!webhookState.errorMessage') &&
      detailSource.includes('Latest webhook configuration loaded in the background. Unsaved local edits were preserved.') &&
      detailSource.includes('const isWebhookInitialLoading =') &&
      detailSource.includes('const isWebhookConfigurationDisabled =') &&
      detailSource.includes('const isWebhookSaveDisabled =') &&
      detailSource.includes('data-draft-disabled={String(isWebhookConfigurationDisabled)}') &&
      detailSource.includes('site-webhooks-background-refresh') &&
      detailSource.includes('{isWebhookInitialLoading ? (') &&
      !detailSource.includes('webhookState.loading || webhookState.saving || !canConfigureSite'),
    'Site detail webhooks draft controls must not be hidden or hard-disabled by background webhook refresh after hydration.',
  );
  assert(
    detailSource.includes('const redirectLoadRequestRef = useRef(0);') &&
      detailSource.includes('const redirectPreviewRequestRef = useRef(0);') &&
      detailSource.includes('!redirectState.hydrated') &&
      detailSource.includes('!redirectState.errorMessage') &&
      detailSource.includes('Latest redirects loaded in the background. Unsaved local edits were preserved.') &&
      detailSource.includes('const isRedirectInitialLoading =') &&
      detailSource.includes('const isRedirectPreviewDisabled =') &&
      detailSource.includes('const isRedirectSaveDisabled =') &&
      detailSource.includes('data-draft-disabled={String(areRedirectEditsDisabled)}') &&
      detailSource.includes('site-redirects-background-refresh') &&
      detailSource.includes('{isRedirectInitialLoading ? (') &&
      !detailSource.includes('disabled={!siteApiId || areRedirectEditsDisabled}'),
    'Site detail redirects draft controls must not be hidden or hard-disabled by background redirect refresh after hydration.',
  );
  assert(
    detailSource.includes('const seoLoadRequestRef = useRef(0);') &&
      detailSource.includes('!seoState.hydrated') &&
      detailSource.includes('!seoState.errorMessage') &&
      detailSource.includes('Latest SEO settings loaded in the background. Unsaved local edits were preserved.') &&
      detailSource.includes('const isSeoInitialLoading =') &&
      detailSource.includes('const isSeoSaveDisabled =') &&
      detailSource.includes('data-draft-disabled={String(areSeoEditsDisabled)}') &&
      detailSource.includes('site-seo-background-refresh') &&
      detailSource.includes('disabled={isSeoSaveDisabled}') &&
      !detailSource.includes('seoState.loading || seoState.saving || !canConfigureSite') &&
      !detailSource.includes('disabled={!siteApiId || areSeoEditsDisabled}'),
    'Site detail SEO draft controls must not be hidden or hard-disabled by background SEO refresh after hydration.',
  );
  assert(
    detailSource.includes('const commentPolicyLoadRequestRef = useRef(0);') &&
      detailSource.includes('const [commentPolicyHydrated, setCommentPolicyHydrated] = useState(false);') &&
      detailSource.includes('const isCommentPolicyInitialLoading =') &&
      detailSource.includes('Latest comment policy loaded in the background. Unsaved local edits were preserved.') &&
      detailSource.includes('data-draft-disabled={String(isCommentPolicyDisabled)}') &&
      detailSource.includes('site-comment-policy-background-refresh') &&
      detailSource.includes('{isCommentPolicyInitialLoading ? (') &&
      !detailSource.includes('commentPolicyLoading || commentPolicySaving || !canConfigureComments'),
    'Site detail comment policy draft controls must not be hidden or hard-disabled by background comment-policy refresh after hydration.',
  );
  assert(
    detailSource.includes('const workflowLoadRequestRef = useRef(0);') &&
      detailSource.includes('const [workflowHydrated, setWorkflowHydrated] = useState(false);') &&
      detailSource.includes('const formBuilderDraftRef = useRef<FormDefinition | null>(null);') &&
      detailSource.includes('const savedFormBuilderDraftRef = useRef<FormDefinition | null>(null);') &&
      detailSource.includes('const isWorkflowInitialLoading =') &&
      detailSource.includes('Latest form definition loaded in the background. Unsaved local edits were preserved.') &&
      detailSource.includes('data-draft-disabled={String(isFormBuilderDisabled)}') &&
      detailSource.includes('site-form-builder-background-refresh') &&
      detailSource.includes('{isWorkflowInitialLoading ? (') &&
      !detailSource.includes('const isFormViewDisabled = state.workflowLoading || !canViewForms;') &&
      !detailSource.includes('state.workflowLoading;'),
    'Site detail form-builder draft controls must not be hidden or hard-disabled by background workflow refresh after hydration.',
  );
  assert(
    detailSource.includes('const commentsLoadRequestRef = useRef(0);') &&
      detailSource.includes('const [commentsHydrated, setCommentsHydrated] = useState(false);') &&
      detailSource.includes('const isCommentInitialLoading =') &&
      detailSource.includes('data-testid="site-comments-moderation-panel"') &&
      detailSource.includes('data-hydrated={String(commentsHydrated)}') &&
      detailSource.includes('data-view-disabled={String(isCommentViewDisabled)}') &&
      detailSource.includes('site-comments-background-refresh') &&
      detailSource.includes('{isCommentInitialLoading ? (') &&
      !detailSource.includes('const isCommentViewDisabled = state.commentsLoading || !canViewComments;'),
    'Site detail comments moderation controls must not be hidden or hard-disabled by background comment refresh after hydration.',
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
  const smokeMfaCode = process.env.BACKY_SITES_SMOKE_MFA_CODE
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
  assert(user?.id, `Create sites RBAC user did not return a user: ${JSON.stringify(payload).slice(0, 500)}`);
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
  const user = payload.data?.user;
  assert(session?.token && user?.id, `Invite accept did not return a user session: ${JSON.stringify(payload).slice(0, 500)}`);
  return { session, user };
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

const listSites = async (sessionToken = apiAdminSessionToken) => {
  const payload = await requestApi('/api/admin/sites?includeUnpublished=true', sessionToken && sessionToken !== apiAdminSessionToken
    ? { headers: { authorization: `Bearer ${sessionToken}` } }
    : {});
  return payload.data?.sites || payload.sites || [];
};

const getSettings = async () => {
  const payload = await requestApi('/api/admin/settings');
  return payload.data?.settings || payload.settings;
};

const updateSettings = async (input) => {
  const payload = await requestApi('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.settings || payload.settings;
};

const getSite = async (siteId, sessionToken = apiAdminSessionToken) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}`, sessionToken && sessionToken !== apiAdminSessionToken
    ? { headers: { authorization: `Bearer ${sessionToken}` } }
    : {});
  return payload.data?.site || payload.site;
};

const listSitePages = async (siteId, sessionToken = apiAdminSessionToken) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/pages?includeUnpublished=true`, sessionToken && sessionToken !== apiAdminSessionToken
    ? { headers: { authorization: `Bearer ${sessionToken}` } }
    : {});
  return payload.data?.pages || payload.pages || [];
};

const listSiteAuditLogs = async (siteId) => {
  const payload = await requestApi(`/api/admin/audit-logs?entity=site&entityId=${encodeURIComponent(siteId)}&limit=20`);
  return payload.data?.logs || payload.logs || [];
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

const findSiteBySlug = async (slug, sessionToken) => {
  const sites = await listSites(sessionToken);
  return sites.find((site) => site.slug === slug) || null;
};

const waitForSite = async (slug, predicate = () => true, sessionToken) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const site = await findSiteBySlug(slug, sessionToken);
    if (site && predicate(site)) {
      return site;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for site ${slug}`);
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

const assertSiteBillingLimitEnforced = async (suffix) => {
  const settings = await getSettings();
  const existingSites = await listSites();
  const sourceSite = existingSites[0];
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};

  assert(sourceSite?.id, `Billing site-limit smoke needs an existing source site to duplicate: ${JSON.stringify(existingSites).slice(0, 500)}`);

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        siteLimit: Math.max(1, existingSites.length),
        overageMode: 'block',
      },
    },
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/sites`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        name: `Blocked Billing ${suffix}`,
        slug: `blocked-billing-${suffix}`,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 402, `Billing site limit should reject site creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'BILLING_SITE_LIMIT', `Billing site limit should return BILLING_SITE_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(!(await findSiteBySlug(`blocked-billing-${suffix}`)), 'Billing-limited site creation unexpectedly persisted a site.');

    const duplicateSlug = `blocked-billing-duplicate-${suffix}`;
    const duplicateResponse = await fetch(`${API_BASE_URL}/api/admin/sites/${encodeURIComponent(sourceSite.id)}/duplicate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        name: `Blocked Billing Duplicate ${suffix}`,
        slug: duplicateSlug,
      }),
    });
    const duplicatePayload = await duplicateResponse.json().catch(() => ({}));

    assert(duplicateResponse.status === 402, `Billing site limit should reject site duplication, got ${duplicateResponse.status}: ${JSON.stringify(duplicatePayload).slice(0, 500)}`);
    assert(duplicatePayload?.error?.code === 'BILLING_SITE_LIMIT', `Billing site-limited duplicate should return BILLING_SITE_LIMIT: ${JSON.stringify(duplicatePayload).slice(0, 500)}`);
    assert(!(await findSiteBySlug(duplicateSlug)), 'Billing-limited site duplication unexpectedly persisted a site.');
  } finally {
    await updateSettings({ integrations: originalIntegrations });
  }
};

const assertCustomDomainBillingLimitEnforced = async (suffix) => {
  const settings = await getSettings();
  const existingSites = await listSites();
  const sourceSite = existingSites.find((candidate) => !candidate.customDomain) || existingSites[0];
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};

  assert(sourceSite?.id, `Custom-domain billing smoke needs an existing source site: ${JSON.stringify(existingSites).slice(0, 500)}`);
  assert(!sourceSite.customDomain, `Custom-domain billing smoke needs a source site without an existing custom domain before setting the limit to zero: ${JSON.stringify(sourceSite).slice(0, 500)}`);

  const site = await getSite(sourceSite.id);
  const originalCustomDomain = site.customDomain || null;
  const originalSiteSettings = site.settings || {};
  const originalBillingQuota = originalSiteSettings.billingQuota || {};
  const originalLimits = originalBillingQuota.limits || {};
  const blockedDomain = `blocked-domain-${suffix}.example.com`;

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        overageMode: 'block',
      },
    },
  });
  await requestApi(`/api/admin/sites/${sourceSite.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      settings: {
        ...originalSiteSettings,
        billingQuota: {
          ...originalBillingQuota,
          limits: {
            ...originalLimits,
            customDomains: 0,
          },
        },
      },
    }),
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/sites/${sourceSite.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        customDomain: blockedDomain,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 402, `Billing custom-domain limit should reject domain updates, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'BILLING_CUSTOM_DOMAIN_LIMIT', `Billing custom-domain limit should return BILLING_CUSTOM_DOMAIN_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`);
    const persisted = await getSite(sourceSite.id);
    assert(persisted.customDomain !== blockedDomain, `Billing-limited custom domain unexpectedly persisted: ${JSON.stringify(persisted).slice(0, 500)}`);
  } finally {
    await updateSettings({ integrations: originalIntegrations });
    await requestApi(`/api/admin/sites/${sourceSite.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        customDomain: originalCustomDomain,
        settings: originalSiteSettings,
      }),
    });
  }
};

const temporarilyAllowSiteCreationQuota = async (extraSites = 2) => {
  const settings = await getSettings();
  const existingSites = await listSites();
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const currentSiteLimit = Number(originalCommerce.siteLimit || 0);

  if (originalCommerce.overageMode !== 'block') {
    return null;
  }

  // The admin list is scoped by role/team, while billing enforcement counts the
  // whole workspace. Use a small cushion so this smoke can exercise create and
  // duplicate paths without depending on hidden sites from other scopes.
  const requiredSiteLimit = Math.max(currentSiteLimit, existingSites.length) + extraSites + 5;

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

const waitForSeededPages = async (siteId, expectedSlugs, sessionToken) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const pages = await listSitePages(siteId, sessionToken);
    const slugs = new Set(pages.map((page) => page.slug));
    if (expectedSlugs.every((slug) => slugs.has(slug))) {
      return pages;
    }
    await sleep(250);
  }

  throw new Error(`Starter pages were not created for site ${siteId}`);
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

const navigateToCreateSite = (client) => navigate(
  client,
  `${ADMIN_BASE_URL}/sites/new`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="site-creation-command-center"]')) &&
      document.body?.innerText?.includes('Starter structure') &&
      document.body?.innerText?.includes('API handoff'),
    body: document.body?.innerText?.slice(0, 900) || '',
  }))()`,
  'Create site page',
);

const assertCreateSiteViewportShell = async (client) => {
  const state = await evaluate(client, `(() => {
    const adminShell = document.querySelector('[data-testid="admin-shell"]');
    const main = document.querySelector('[data-testid="admin-main-content"]');
    const sidebarShell = document.querySelector('[data-testid="admin-sidebar-shell"]');
    const footer = document.querySelector('[data-testid="admin-shell-footer"]');
    const form = document.querySelector('[data-testid="site-create-form"]');
    const submit = document.querySelector('button[type="submit"]');
    const appRoot = document.getElementById('root');
    const mainRect = main?.getBoundingClientRect();
    const rootRect = appRoot?.getBoundingClientRect();
    const windowScrollBeforeAttempt = window.scrollY;
    window.scrollTo(0, 9999);
    const windowScrollAfterAttempt = window.scrollY;
    return {
      viewportHeight: window.innerHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body?.scrollHeight || 0,
      windowScrollBeforeAttempt,
      windowScrollAfterAttempt,
      adminShellExists: adminShell instanceof HTMLElement,
      adminShellScrollLock: adminShell?.getAttribute('data-document-scroll-lock') || '',
      htmlShellClass: document.documentElement.classList.contains('backy-admin-shell-active'),
      bodyShellClass: document.body.classList.contains('backy-admin-shell-active'),
      rootOverflowY: getComputedStyle(document.documentElement).overflowY,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      appRootScrollLock: appRoot?.getAttribute('data-admin-shell-scroll-lock') || '',
      appRootHeight: Math.round(rootRect?.height || 0),
      mainExists: main instanceof HTMLElement,
      mainOverflowY: main instanceof HTMLElement ? getComputedStyle(main).overflowY : '',
      mainScrollHeight: main instanceof HTMLElement ? main.scrollHeight : 0,
      mainClientHeight: main instanceof HTMLElement ? main.clientHeight : 0,
      mainTop: Math.round(mainRect?.top || 0),
      mainBottom: Math.round(mainRect?.bottom || 0),
      sidebarExists: sidebarShell instanceof HTMLElement,
      footerExists: footer instanceof HTMLElement,
      footerText: footer?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      formExists: form instanceof HTMLFormElement,
      submitExists: submit instanceof HTMLButtonElement,
      body: document.body?.innerText?.slice(0, 1000) || '',
    };
  })()`);

  assert(
    state.adminShellExists &&
      state.adminShellScrollLock === 'html-body-root' &&
      state.htmlShellClass &&
      state.bodyShellClass &&
      state.appRootScrollLock === 'document' &&
      state.rootOverflowY !== 'visible' &&
      state.bodyOverflowY !== 'visible' &&
      state.windowScrollBeforeAttempt === 0 &&
      state.windowScrollAfterAttempt === 0 &&
      state.bodyScrollHeight <= state.viewportHeight + 8 &&
      state.appRootHeight <= state.viewportHeight + 4,
    `Create-site page leaked document/body scrolling and can expose blank shell space: ${JSON.stringify(state)}`,
  );
  assert(
    state.mainExists &&
      ['auto', 'scroll'].includes(state.mainOverflowY) &&
      state.mainClientHeight <= state.viewportHeight &&
      state.mainScrollHeight > state.mainClientHeight &&
      state.formExists &&
      state.submitExists,
    `Create-site content should scroll inside admin main, not the browser document: ${JSON.stringify(state)}`,
  );
  assert(
    state.footerExists &&
      state.footerText.includes('Backy admin') &&
      state.footerText.includes('Protected workspace'),
    `Create-site page should finish with the shared operational footer inside the main pane: ${JSON.stringify(state)}`,
  );

  return state;
};

const navigateToSites = (client, expectedText = 'Sites command center', siteId = '') => navigate(
  client,
  `${ADMIN_BASE_URL}/sites${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ''}`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="sites-command-center"]')) &&
      document.body?.innerText?.includes(${JSON.stringify(expectedText)}),
    body: document.body?.innerText?.slice(0, 900) || '',
  }))()`,
  'Sites page',
);

const setCreateSiteControl = async (client, labelText, value) => {
  let result = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    result = await evaluate(client, `(() => {
      const labelText = ${JSON.stringify(labelText)};
      const value = ${JSON.stringify(value)};
      const normalize = (text) => String(text || '').replace(/\\s+/g, ' ').trim();
      const labels = Array.from(document.querySelectorAll('label'));
      const label = labels.find((candidate) => {
        const firstSpan = candidate.querySelector('span');
        return normalize(firstSpan?.textContent || candidate.textContent) === labelText;
      });
      if (!(label instanceof HTMLLabelElement)) {
        return {
          ok: false,
          reason: 'label-missing',
          labelText,
          labels: labels.map((candidate) => normalize(candidate.querySelector('span')?.textContent || candidate.textContent)).slice(0, 80),
        };
      }
      const control = label.querySelector('input, select, textarea');
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
        return { ok: false, reason: 'control-missing', labelText };
      }
      if (control.disabled) return { ok: false, reason: 'control-disabled', labelText };
      const prototype = control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : control instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(control, String(value));
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      control.dispatchEvent(new Event('blur', { bubbles: true }));
      return { ok: true, value: control.value };
    })()`);
    if (result.ok) break;
    if (result.reason !== 'control-disabled') break;
    await sleep(250);
  }
  assert(result?.ok, `Unable to set create-site ${labelText}: ${JSON.stringify(result)}`);
  await sleep(150);
  return result;
};

const setCreateSiteBlueprint = async (client, blueprint) => {
  const result = await evaluate(client, `(() => {
    const input = document.querySelector('input[name="site-blueprint"][value="' + CSS.escape(${JSON.stringify(blueprint)}) + '"]');
    if (!(input instanceof HTMLInputElement)) {
      return {
        ok: false,
        reason: 'blueprint-missing',
        blueprints: Array.from(document.querySelectorAll('input[name="site-blueprint"]')).map((candidate) => candidate.value),
      };
    }
    if (input.disabled) return { ok: false, reason: 'blueprint-disabled' };
    input.click();
    return { ok: true, checked: input.checked, value: input.value };
  })()`);
  assert(result.ok, `Unable to select create-site blueprint: ${JSON.stringify(result)}`);
  await sleep(150);
  return result;
};

const assertCreateSiteSubmitActionStatus = async (client, expectation) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const status = document.querySelector('[data-testid="site-create-submit-action-status"]');
      const statusId = status?.id || '';
      const button = document.querySelector('button[type="submit"]');
      return {
        statusId,
        statusText: status?.textContent || '',
        buttonExists: button instanceof HTMLButtonElement,
        buttonText: button?.textContent || '',
        describedBy: button?.getAttribute('aria-describedby') || '',
        actionState: button?.getAttribute('data-action-state') || '',
        actionStatus: button?.getAttribute('data-action-status') || '',
        disabledReason: button?.getAttribute('data-disabled-reason') || '',
        targetSiteId: button?.getAttribute('data-target-site-id') || '',
        targetBlueprint: button?.getAttribute('data-target-blueprint') || '',
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        body: document.body?.innerText?.slice(0, 1200) || '',
      };
    })()`);
    const matches = state.statusId &&
      state.buttonExists &&
      state.describedBy === state.statusId &&
      state.actionStatus === state.statusText &&
      state.actionState === expectation.state &&
      state.statusText.includes(expectation.statusIncludes) &&
      (expectation.disabled === undefined || state.disabled === expectation.disabled) &&
      (!expectation.targetSiteId || state.targetSiteId === expectation.targetSiteId) &&
      (!expectation.targetBlueprint || state.targetBlueprint === expectation.targetBlueprint) &&
      (!expectation.reasonIncludes || state.disabledReason.includes(expectation.reasonIncludes));
    if (matches) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Create-site submit action status did not match: ${JSON.stringify({ state, expectation })}`);
    }
    await sleep(250);
  }

  return null;
};

const submitCreateSiteForm = async (client) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button[type="submit"]')).find((candidate) => (
      (candidate.textContent || '').includes('Create site')
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'submit-missing',
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.textContent || '').slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'submit-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to submit create-site form: ${JSON.stringify(result)}`);
};

const createSiteThroughUi = async (client, { siteName, slug, customDomain, sessionToken }) => {
  await setCreateSiteControl(client, 'Site name', siteName);
  await setCreateSiteControl(client, 'URL slug', slug);
  await setCreateSiteControl(client, 'Custom domain', customDomain);
  await setCreateSiteControl(client, 'Database team ID', `team-${slug}`);
  await setCreateSiteControl(client, 'Description', 'Temporary storefront workspace created through the Backy admin UI smoke.');
  await setCreateSiteControl(client, 'Vercel project ID', `prj_${slug}`);
  await setCreateSiteControl(client, 'Vercel team slug', `team-${slug}`);
  await setCreateSiteControl(client, 'Production domain', customDomain);
  await setCreateSiteControl(client, 'Billing plan', 'business');
  await setCreateSiteControl(client, 'Billing email', `billing-${slug}@example.com`);
  await setCreateSiteControl(client, 'Template source', 'starter-marketplace');
  await setCreateSiteControl(client, 'Marketplace template ID', `marketplace-${slug}`);
  await setCreateSiteControl(client, 'Status', 'published');
  await setCreateSiteBlueprint(client, 'storefront');
  await assertCreateSiteSubmitActionStatus(client, {
    state: 'ready',
    disabled: false,
    statusIncludes: `Create site available: Storefront will create ${slug}.`,
    targetSiteId: slug,
    targetBlueprint: 'storefront',
  });
  await submitCreateSiteForm(client);

  const created = await waitForSite(slug, (site) => site.status === 'published' || site.isPublished === true, sessionToken);
  assert(
    created.settings?.domainVerification?.status === 'pending' &&
      created.settings.domainVerification.domain === customDomain &&
      Boolean(created.settings.domainVerification.txtValue),
    `Create-site form did not persist domain verification setup: ${JSON.stringify(created.settings?.domainVerification)}`,
  );
  assert(
    created.settings?.vercelDeployment?.status === 'preview_queued' &&
      created.settings.vercelDeployment.projectId === `prj_${slug}` &&
      created.settings.vercelDeployment.productionDomain === customDomain &&
      (created.settings.vercelDeployment.history || []).length >= 1,
    `Create-site form did not persist Vercel deployment setup: ${JSON.stringify(created.settings?.vercelDeployment)}`,
  );
  assert(
    created.settings?.billingQuota?.plan === 'business' &&
      created.settings.billingQuota.billingEmail === `billing-${slug}@example.com` &&
      created.settings.billingQuota.limits.pages >= 250,
    `Create-site form did not persist billing quota setup: ${JSON.stringify(created.settings?.billingQuota)}`,
  );
  assert(
    created.settings?.frontendDesign?.status === 'captured' &&
      created.settings.frontendDesign.templates?.some((template) => template.id === `marketplace-${slug}-shop`),
    `Create-site form did not persist template marketplace setup: ${JSON.stringify(created.settings?.frontendDesign).slice(0, 900)}`,
  );
  const siteId = created.publicSiteId || created.id;
  const pages = await waitForSeededPages(siteId, ['index', 'shop', 'contact'], sessionToken);
  const homepage = pages.find((page) => page.slug === 'index');
  assert(homepage?.isHomepage === true, `Storefront blueprint did not create a homepage: ${JSON.stringify(pages).slice(0, 700)}`);
  assert(pages.every((page) => page.status === 'published'), `Storefront blueprint pages did not inherit published status: ${JSON.stringify(pages).slice(0, 700)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      body: document.body?.innerText?.slice(0, 700) || '',
    }))()`);
    if (state.path === '/pages' && state.search.includes(siteId)) {
      return { site: created, pages };
    }
    await sleep(250);
  }

  throw new Error(`Create-site form did not route to the seeded page workspace for ${slug}`);
};

const waitForSitesPageSite = async (client, siteName) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="sites-command-center"]')),
      hasSite: document.body?.innerText?.includes(${JSON.stringify(siteName)}) || false,
      path: window.location.pathname,
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);
    if (state.ready && state.hasSite && state.path === '/sites') {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Sites page did not show temporary site: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertCreateSiteActionStatus = async (client, expectation) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const status = document.querySelector('[data-testid="sites-create-action-status"]');
      const statusId = status?.id || '';
      const buttons = Array.from(document.querySelectorAll('button')).filter((button) => (
        (button.textContent || '').trim() === 'New site' &&
        button.getAttribute('aria-describedby') === statusId
      ));
      return {
        statusId,
        statusText: status?.textContent || '',
        buttons: buttons.map((button) => ({
          text: (button.textContent || '').trim(),
          state: button.getAttribute('data-action-state') || '',
          status: button.getAttribute('data-action-status') || '',
          reason: button.getAttribute('data-disabled-reason') || '',
          disabled: button.disabled,
          describedBy: button.getAttribute('aria-describedby') || '',
        })),
        body: document.body?.innerText?.slice(0, 1200) || '',
      };
    })()`);
    if (state.statusId && state.buttons.length > 0) {
      const matchesExpectation = state.statusText.includes(expectation.statusIncludes) &&
        state.buttons.every((button) => (
          button.describedBy === state.statusId &&
          button.status === state.statusText &&
          button.state === expectation.state &&
          (expectation.disabled === undefined || button.disabled === expectation.disabled) &&
          (!expectation.reasonIncludes || button.reason.includes(expectation.reasonIncludes))
        ));
      if (matchesExpectation) {
        return state;
      }
    }
    if (attempt === 79) {
      throw new Error(`Sites create action status did not render: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertSiteActionStatus = async (client, siteName, expectations) => {
  await waitForSitesControlsEnabled(client);
  await setSitesFilter(client, 'Search sites', siteName);
  await waitForSitesPageSite(client, siteName);
  const state = await evaluate(client, `(() => {
    const group = Array.from(document.querySelectorAll('[data-testid^="sites-actions-"]')).find((candidate) => (
      candidate.getAttribute('aria-label') === ${JSON.stringify(`Actions for ${siteName}`)}
    ));
    const statusId = group?.getAttribute('aria-describedby') || '';
    const status = statusId ? document.getElementById(statusId) : null;
    const action = (label) => {
      const element = Array.from(group?.querySelectorAll('a, button') || []).find((candidate) => (
        candidate.getAttribute('aria-label') === label + ' ' + ${JSON.stringify(siteName)}
      ));
      return {
        exists: Boolean(element),
        describedBy: element?.getAttribute('aria-describedby') || '',
        state: element?.getAttribute('data-action-state') || '',
        reason: element?.getAttribute('data-disabled-reason') || '',
        disabled: element instanceof HTMLButtonElement ? element.disabled : element?.getAttribute('aria-disabled') === 'true',
      };
    };
    return {
      groupExists: Boolean(group),
      groupLabel: group?.getAttribute('aria-label') || '',
      groupRole: group?.getAttribute('role') || '',
      describedBy: statusId,
      statusText: status?.textContent || '',
      groupStatus: group?.getAttribute('data-action-status') || '',
      preview: action('Preview'),
      manage: action('Manage'),
      duplicate: action('Duplicate'),
      archive: action('Archive'),
      delete: action('Delete'),
    };
  })()`);

  assert(state.groupExists, `Site action group did not render for ${siteName}: ${JSON.stringify(state)}`);
  assert(state.groupRole === 'group', `Site action cluster must be a named group: ${JSON.stringify(state)}`);
  assert(state.groupLabel === `Actions for ${siteName}`, `Site action group label drifted: ${JSON.stringify(state)}`);
  assert(state.describedBy && state.statusText === state.groupStatus, `Site action group must expose matching hidden status text: ${JSON.stringify(state)}`);

  for (const [actionName, expectation] of Object.entries(expectations)) {
    const observed = state[actionName];
    assert(observed?.exists, `Site ${actionName} action did not render: ${JSON.stringify(state)}`);
    assert(observed.describedBy === state.describedBy, `Site ${actionName} action is not tied to the group status: ${JSON.stringify(state)}`);
    if (expectation.state) {
      assert(observed.state === expectation.state, `Site ${actionName} action state mismatch: ${JSON.stringify({ observed, expectation, state })}`);
    }
    if (expectation.reasonIncludes) {
      assert(observed.reason.includes(expectation.reasonIncludes), `Site ${actionName} disabled reason mismatch: ${JSON.stringify({ observed, expectation, state })}`);
      assert(state.statusText.includes(expectation.statusIncludes || `${expectation.label || actionName} unavailable`), `Site ${actionName} status text did not describe blocker: ${JSON.stringify({ observed, expectation, state })}`);
    }
  }

  return state;
};

const waitForSelectedSiteOperations = async (client, siteName) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      const domainPanel = document.querySelector('[data-testid="sites-domain-verification"]');
      const frontendApiPanel = document.querySelector('#sites-api');
      return {
        ready: Boolean(frontendApiPanel?.textContent?.includes(${JSON.stringify(siteName)})) &&
          Boolean(domainPanel?.textContent?.includes(${JSON.stringify(siteName)})),
        path: window.location.pathname,
        search: window.location.search,
        frontendApiText: frontendApiPanel?.textContent?.slice(0, 700) || '',
        domainText: domainPanel?.textContent?.slice(0, 700) || '',
        body: body.slice(0, 1200),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Sites operations panels did not select ${siteName}: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const setSiteStatusSelect = async (client, siteName, status) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const select = Array.from(document.querySelectorAll('select')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Change status for ${siteName}`)}
      ));
      if (!(select instanceof HTMLSelectElement)) {
        return {
          ok: false,
          reason: 'select-missing',
          labels: Array.from(document.querySelectorAll('select')).map((candidate) => candidate.getAttribute('aria-label') || '').slice(0, 40),
        };
      }
      if (select.disabled) return { ok: false, reason: 'select-disabled' };
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      descriptor?.set?.call(select, ${JSON.stringify(status)});
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: select.value };
    })()`);

    if (result.ok) {
      return result;
    }
    if (attempt === 79) {
      throw new Error(`Unable to set site status to ${status}: ${JSON.stringify(result)}`);
    }
    await sleep(250);
  }

  return null;
};

const setSitesFilter = async (client, ariaLabel, value) => {
  const result = await evaluate(client, `(() => {
    const control = document.querySelector('[aria-label="' + CSS.escape(${JSON.stringify(ariaLabel)}) + '"]');
    const value = ${JSON.stringify(value)};
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
      return { ok: false, ariaLabel: ${JSON.stringify(ariaLabel)}, controls: Array.from(document.querySelectorAll('input, select')).map((candidate) => candidate.getAttribute('aria-label') || candidate.getAttribute('placeholder') || '').slice(0, 60) };
    }
    if (control.disabled) return { ok: false, reason: 'control-disabled', ariaLabel: ${JSON.stringify(ariaLabel)} };
    const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: control.value };
  })()`);
  assert(result.ok, `Unable to set ${ariaLabel}: ${JSON.stringify(result)}`);
  await sleep(250);
  return result;
};

const waitForSitesControlsEnabled = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const search = document.querySelector('[aria-label="Search sites"]');
      return {
        ready: search instanceof HTMLInputElement && !search.disabled,
        disabled: search instanceof HTMLInputElement ? search.disabled : null,
        body: document.body?.innerText?.slice(0, 1000) || '',
      };
    })()`);
    if (state.ready) return state;
    if (attempt === 79) {
      throw new Error(`Sites controls did not become enabled: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const exerciseSitesFilters = async (client, siteName) => {
  await waitForSitesControlsEnabled(client);
  await setSitesFilter(client, 'Search sites', siteName);
  await waitForSitesPageSite(client, siteName);
  await setSitesFilter(client, 'Filter sites by domain', 'custom');
  await waitForSitesPageSite(client, siteName);
  await setSitesFilter(client, 'Filter sites by page coverage', 'with-pages');
  await waitForSitesPageSite(client, siteName);
  await setSitesFilter(client, 'Filter sites by status', 'published');
  await waitForSitesPageSite(client, siteName);
  await setSitesFilter(client, 'Filter sites by status', 'all');
  await setSitesFilter(client, 'Filter sites by domain', 'all');
  await setSitesFilter(client, 'Filter sites by page coverage', 'all');
  await setSitesFilter(client, 'Search sites', '');
};

const clickSiteAction = async (client, siteName, action) => {
  await waitForSitesPageSite(client, siteName);
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`${action} ${siteName}`)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        action: ${JSON.stringify(action)},
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 100),
      };
    }
    if (button.disabled) return { ok: false, reason: 'action-disabled', action: ${JSON.stringify(action)} };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to click ${action} for ${siteName}: ${JSON.stringify(result)}`);
  await sleep(350);
  return result;
};

const duplicateSiteThroughUi = async (client, siteName, originalSlug, sessionToken) => {
  await evaluate(client, `(() => {
    window.__backySiteDuplicateRequests = [];
    if (!window.__backyOriginalFetchForSiteDuplicateSmoke) {
      window.__backyOriginalFetchForSiteDuplicateSmoke = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const requestUrl = String(args[0]?.url || args[0] || '');
        const response = await window.__backyOriginalFetchForSiteDuplicateSmoke(...args);
        if (requestUrl.includes('/api/admin/sites/') && requestUrl.includes('/duplicate')) {
          const entry = { url: requestUrl, status: response.status, ok: response.ok };
          try {
            entry.payload = await response.clone().json();
          } catch {
            entry.payload = null;
          }
          window.__backySiteDuplicateRequests.push(entry);
        }
        return response;
      };
    }
  })()`);
  await clickSiteAction(client, siteName, 'Duplicate');

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const sites = await listSites(sessionToken);
    const duplicate = sites.find((site) => (
      site.name === `${siteName} Copy` &&
      site.slug.startsWith(`${originalSlug}-copy-`) &&
      site.status === 'draft' &&
      !site.customDomain
    ));
    if (duplicate) {
      return duplicate;
    }
    await sleep(250);
  }

  const diagnostics = await evaluate(client, `(() => {
    const duplicateButton = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Duplicate ${siteName}`)}
    ));
    return {
      requests: window.__backySiteDuplicateRequests || [],
      notice: document.querySelector('[role="status"], [aria-live="polite"]')?.textContent?.slice(0, 700) || '',
      duplicateButton: duplicateButton instanceof HTMLButtonElement ? {
        disabled: duplicateButton.disabled,
        actionState: duplicateButton.getAttribute('data-action-state') || '',
        disabledReason: duplicateButton.getAttribute('data-disabled-reason') || '',
      } : null,
      matchingSitesText: Array.from(document.querySelectorAll('[data-testid^="sites-actions-"]')).map((candidate) => candidate.getAttribute('aria-label') || '').filter((label) => label.includes(${JSON.stringify(siteName)})).slice(0, 20),
      body: document.body?.innerText?.slice(0, 1200) || '',
    };
  })()`);
  throw new Error(`Duplicated site was not created for ${siteName}: ${JSON.stringify(diagnostics)}`);
};

const collectNavigationPageIds = (items = [], ids = new Set()) => {
  for (const item of items) {
    if (item?.pageId) ids.add(item.pageId);
    if (Array.isArray(item?.children)) {
      collectNavigationPageIds(item.children, ids);
    }
  }
  return ids;
};

const assertDuplicatedSiteContent = async ({ sourcePages, duplicateSiteId, sessionToken }) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const duplicatePages = await listSitePages(duplicateSiteId, sessionToken);
    const duplicateSlugs = new Set(duplicatePages.map((page) => page.slug));
    const copiedExpectedPages = sourcePages.filter((page) => !['archived'].includes(page.status));
    const hasCopiedPages = copiedExpectedPages.every((page) => duplicateSlugs.has(page.slug));

    if (hasCopiedPages) {
      assert(
        duplicatePages.every((page) => page.status === 'draft'),
        `Duplicated site pages should be draft copies: ${JSON.stringify(duplicatePages).slice(0, 700)}`,
      );
      const duplicateSite = await getSite(duplicateSiteId, sessionToken);
      const duplicatePageIds = new Set(duplicatePages.map((page) => page.id));
      const navigationPageIds = collectNavigationPageIds([
        ...(duplicateSite?.settings?.navigation?.primary || []),
        ...(duplicateSite?.settings?.navigation?.footer || []),
      ]);
      assert(
        Array.from(navigationPageIds).every((pageId) => duplicatePageIds.has(pageId)),
        `Duplicated navigation should point at copied pages: ${JSON.stringify({
          navigationPageIds: Array.from(navigationPageIds),
          duplicatePageIds: Array.from(duplicatePageIds),
        }).slice(0, 700)}`,
      );
      return duplicatePages;
    }

    await sleep(250);
  }

  throw new Error(`Duplicated site ${duplicateSiteId} did not copy source pages`);
};

const archiveSiteThroughUi = async (client, siteName, slug, sessionToken) => {
  await clickSiteAction(client, siteName, 'Archive');
  return waitForSite(slug, (site) => site.status === 'archived', sessionToken);
};

const deleteSiteThroughUi = async (client, siteName) => {
  await waitForSitesPageSite(client, siteName);
  const openResult = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Delete ${siteName}`)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'delete-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(openResult.ok, `Unable to open site delete confirmation: ${JSON.stringify(openResult)}`);

  const typedResult = await evaluate(client, `(() => {
    const input = document.querySelector('[aria-label="Confirm site deletion name"]');
    if (!(input instanceof HTMLInputElement)) {
      return { ok: false, reason: 'input-missing' };
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(siteName)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: input.value };
  })()`);
  assert(typedResult.ok, `Unable to type delete confirmation: ${JSON.stringify(typedResult)}`);

  const confirmResult = await evaluate(client, `(() => {
    const dialog = Array.from(document.querySelectorAll('[class*="fixed"]')).find((candidate) => (
      (candidate.textContent || '').includes(${JSON.stringify(`Delete ${siteName}?`)})
    ));
    const button = dialog && Array.from(dialog.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === 'Delete site'
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'confirm-missing', dialog: dialog?.textContent?.slice(0, 500) || '' };
    }
    if (button.disabled) return { ok: false, reason: 'confirm-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(confirmResult.ok, `Unable to confirm site deletion: ${JSON.stringify(confirmResult)}`);
};

const assertLayout = async (client, siteName) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="sites-command-center"]')),
    hasSite: document.body?.innerText?.includes(${JSON.stringify(siteName)}) || false,
    hasFrontendApi: document.body?.innerText?.includes('Site frontend API') || false,
    hasDeliveryOperationsDetails: Boolean(document.querySelector('[data-testid="sites-delivery-operations-details"]')),
    deliveryOperationsDefaultCollapsed: document.querySelector('[data-testid="sites-delivery-operations-details"]')?.getAttribute('data-default-collapsed') === 'true',
    deliveryOperationsOpen: document.querySelector('[data-testid="sites-delivery-operations-details"]')?.hasAttribute('open') || false,
    hasDeliveryOperationsPanels: Boolean(document.querySelector('[data-testid="sites-delivery-operations-panels"]')),
    hasDomainVerification: Boolean(document.querySelector('[data-testid="sites-domain-verification"]')),
    hasVercelDeployment: Boolean(document.querySelector('[data-testid="sites-vercel-deployment"]')),
    hasBillingQuotas: Boolean(document.querySelector('[data-testid="sites-billing-quotas"]')),
    hasFeatureContract: document.body?.innerText?.includes('Website feature contract') || false,
    hasAgentHandoffContract: (document.body?.innerText || '').includes('/agent-handoff') &&
      (document.body?.innerText || '').includes('Resolve with host') &&
      (document.body?.innerText || '').includes('Render with host') &&
      (document.body?.innerText || '').includes('NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST') &&
      (document.body?.innerText || '').includes('Server-side loader env'),
    hasRequiredControls: document.body?.innerText?.includes('What Backy still needs here') || false,
    hasAuditDetails: Boolean(document.querySelector('[data-testid="sites-audit-details"]')),
    auditDefaultCollapsed: document.querySelector('[data-testid="sites-audit-details"]')?.getAttribute('data-default-collapsed') === 'true',
    auditOpen: document.querySelector('[data-testid="sites-audit-details"]')?.hasAttribute('open') || false,
    hasAuditDisclosurePanel: Boolean(document.querySelector('[data-testid="sites-audit-disclosure-panel"]')),
    hasAuditPanel: Boolean(document.querySelector('[data-testid="sites-audit-panel"]')),
    hasLibrary: Boolean(document.querySelector('input[aria-label="Search sites"]')),
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Sites page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasDeliveryOperationsDetails && layout.deliveryOperationsDefaultCollapsed && !layout.deliveryOperationsOpen && layout.hasDeliveryOperationsPanels, `Sites delivery/deployment/quota operations should start collapsed but remain available: ${JSON.stringify(layout)}`);
  assert(layout.hasAuditDetails && layout.auditDefaultCollapsed && !layout.auditOpen && layout.hasAuditDisclosurePanel, `Sites audit evidence should start collapsed but remain available: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter && layout.hasSite && layout.hasFrontendApi && layout.hasDomainVerification && layout.hasVercelDeployment && layout.hasBillingQuotas && layout.hasFeatureContract && layout.hasAgentHandoffContract && layout.hasRequiredControls && layout.hasAuditPanel && layout.hasLibrary,
    `Sites page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
};

const exerciseDomainVerification = async (client, { siteId, siteName, sessionToken }) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="sites-domain-verification"]');
      const text = panel?.textContent || '';
      const prepare = document.querySelector(${JSON.stringify(`[aria-label="Prepare domain verification for ${siteName}"]`)});
      const verify = document.querySelector(${JSON.stringify(`[aria-label="Mark domain verified for ${siteName}"]`)});
      return {
        ready: prepare instanceof HTMLButtonElement && !prepare.disabled && verify instanceof HTMLButtonElement && !verify.disabled,
        prepareDisabled: prepare instanceof HTMLButtonElement ? prepare.disabled : null,
        verifyDisabled: verify instanceof HTMLButtonElement ? verify.disabled : null,
        hasPanel: Boolean(panel),
        text: text.slice(0, 1400),
      };
    })()`);
    if (state.ready) break;
    if (attempt === 79) {
      throw new Error(`Domain verification controls did not render for ${siteName}: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  for (const action of ['Prepare domain verification for', 'Mark domain verified for']) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const button = document.querySelector(${JSON.stringify(`[aria-label="${action} ${siteName}"]`)});
        const panel = document.querySelector('[data-testid="sites-domain-verification"]');
        return {
          ready: button instanceof HTMLButtonElement && !button.disabled,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          text: panel?.textContent?.slice(0, 1400) || '',
        };
      })()`);
      if (state.ready) break;
      if (attempt === 79) {
        throw new Error(`Domain verification action stayed disabled: ${JSON.stringify({ action, ...state })}`);
      }
      await sleep(250);
    }

    const result = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[aria-label="${action} ${siteName}"]`)});
      if (!(button instanceof HTMLButtonElement)) {
        return {
          ok: false,
          action: ${JSON.stringify(action)},
          buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 120),
        };
      }
      if (button.disabled) return { ok: false, reason: 'button-disabled', action: ${JSON.stringify(action)} };
      button.click();
      return { ok: true };
    })()`);
    assert(result.ok, `Unable to run domain verification action: ${JSON.stringify(result)}`);
    await sleep(550);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const site = await getSite(siteId, sessionToken);
    const verification = site?.settings?.domainVerification;
    if (
      verification?.status === 'verified' &&
      verification?.token &&
      verification?.txtValue &&
      verification?.verifiedAt
    ) {
      const state = await evaluate(client, `(() => {
        const panel = document.querySelector('[data-testid="sites-domain-verification"]');
        const text = panel?.textContent || '';
        return {
          hasPanel: Boolean(panel),
          hasVerified: text.includes('Verified'),
          hasToken: text.includes(${JSON.stringify(verification.token)}),
          text: text.slice(0, 1400),
        };
      })()`);
      assert(state.hasPanel && state.hasVerified && state.hasToken, `Domain verification panel did not render persisted state: ${JSON.stringify(state)}`);
      return verification;
    }
    await sleep(250);
  }

  throw new Error(`Domain verification did not persist for ${siteName}`);
};

const exerciseVercelDeployment = async (client, { siteId, siteName, sessionToken }) => {
  const actions = [
    'Prepare Vercel preview deploy for',
    'Record Vercel preview deploy for',
    'Record Vercel production deploy for',
  ];

  for (const action of actions) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const button = document.querySelector(${JSON.stringify(`[aria-label="${action} ${siteName}"]`)});
        const panel = document.querySelector('[data-testid="sites-vercel-deployment"]');
        return {
          ready: button instanceof HTMLButtonElement && !button.disabled,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          text: panel?.textContent?.slice(0, 1600) || '',
        };
      })()`);
      if (state.ready) break;
      if (attempt === 79) {
        throw new Error(`Vercel deployment action stayed disabled: ${JSON.stringify({ action, ...state })}`);
      }
      await sleep(250);
    }

    const result = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[aria-label="${action} ${siteName}"]`)});
      if (!(button instanceof HTMLButtonElement)) {
        return {
          ok: false,
          action: ${JSON.stringify(action)},
          buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 140),
        };
      }
      if (button.disabled) return { ok: false, reason: 'button-disabled', action: ${JSON.stringify(action)} };
      button.click();
      return { ok: true };
    })()`);
    assert(result.ok, `Unable to run Vercel deployment action: ${JSON.stringify(result)}`);
    await sleep(550);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const site = await getSite(siteId, sessionToken);
    const deployment = site?.settings?.vercelDeployment;
    if (
      deployment?.status === 'production_ready' &&
      deployment?.previewUrl &&
      deployment?.productionUrl &&
      deployment?.history?.length >= 3
    ) {
      const state = await evaluate(client, `(() => {
        const panel = document.querySelector('[data-testid="sites-vercel-deployment"]');
        const text = panel?.textContent || '';
        return {
          hasPanel: Boolean(panel),
          hasProduction: text.includes('Production ready'),
          hasPreviewUrl: text.includes(${JSON.stringify(deployment.previewUrl)}),
          hasHistory: text.includes('promote production') || text.includes('record preview'),
          text: text.slice(0, 1600),
        };
      })()`);
      assert(state.hasPanel && state.hasProduction && state.hasPreviewUrl && state.hasHistory, `Vercel deployment panel did not render persisted state: ${JSON.stringify(state)}`);
      return deployment;
    }
    await sleep(250);
  }

  throw new Error(`Vercel deployment workflow did not persist for ${siteName}`);
};

const exerciseBillingQuotas = async (client, { siteId, siteName, sessionToken }) => {
  const actions = [
    `Set Pro plan for ${siteName}`,
    `Set Business plan for ${siteName}`,
    `Refresh quota usage for ${siteName}`,
  ];

  for (const ariaLabel of actions) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const button = document.querySelector(${JSON.stringify(`[aria-label="${ariaLabel}"]`)});
        const panel = document.querySelector('[data-testid="sites-billing-quotas"]');
        return {
          ready: button instanceof HTMLButtonElement && !button.disabled,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          text: panel?.textContent?.slice(0, 1600) || '',
        };
      })()`);
      if (state.ready) break;
      if (attempt === 79) {
        throw new Error(`Billing quota action stayed disabled: ${JSON.stringify({ ariaLabel, ...state })}`);
      }
      await sleep(250);
    }

    const result = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[aria-label="${ariaLabel}"]`)});
      if (!(button instanceof HTMLButtonElement)) {
        return {
          ok: false,
          ariaLabel: ${JSON.stringify(ariaLabel)},
          buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 160),
        };
      }
      if (button.disabled) return { ok: false, reason: 'button-disabled', ariaLabel: ${JSON.stringify(ariaLabel)} };
      button.click();
      return { ok: true };
    })()`);
    assert(result.ok, `Unable to run billing quota action: ${JSON.stringify(result)}`);
    await sleep(550);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const site = await getSite(siteId, sessionToken);
    const quota = site?.settings?.billingQuota;
    if (
      quota?.plan === 'business' &&
      quota?.lastAction === 'refresh-usage' &&
      quota?.history?.length >= 3 &&
      quota?.usage?.pages >= 3
    ) {
      const state = await evaluate(client, `(() => {
        const panel = document.querySelector('[data-testid="sites-billing-quotas"]');
        const text = panel?.textContent || '';
        return {
          hasPanel: Boolean(panel),
          hasBusiness: text.includes('Business'),
          hasRefresh: text.includes('refresh usage'),
          hasPages: text.includes(${JSON.stringify(`${quota.usage.pages}/${quota.limits.pages}`)}),
          text: text.slice(0, 1600),
        };
      })()`);
      assert(state.hasPanel && state.hasBusiness && state.hasRefresh && state.hasPages, `Billing quota panel did not render persisted state: ${JSON.stringify(state)}`);
      return quota;
    }
    await sleep(250);
  }

  throw new Error(`Billing quota workflow did not persist for ${siteName}`);
};

const assertSiteAuditTrail = async (client, { siteId, siteName }) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const logs = await listSiteAuditLogs(siteId);
    const actions = new Set(logs.map((log) => log.action));
    if (actions.has('site.created') && actions.has('site.updated')) {
      break;
    }
    if (attempt === 39) {
      throw new Error(`Site audit API did not record create/update actions: ${JSON.stringify(logs).slice(0, 900)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="sites-audit-panel"]');
      const text = panel?.textContent || '';
      return {
        hasPanel: Boolean(panel),
        hasRows: document.querySelectorAll('[data-testid="sites-audit-row"]').length > 0,
        hasSite: text.includes(${JSON.stringify(siteName)}),
        hasUpdate: text.includes('Updated') || text.includes('Created'),
        text: text.slice(0, 1000),
      };
    })()`);
    if (state.hasPanel && state.hasRows && state.hasSite && state.hasUpdate) {
      return;
    }
    await evaluate(client, `document.querySelector('[data-testid="sites-audit-panel"] button')?.click()`);
    if (attempt === 39) {
      throw new Error(`Site audit panel did not render site activity: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }
};

const assertSitesRbacFiltering = async (client, viewerSession, siteName, preloadScriptIdentifier, siteId) => {
  if (preloadScriptIdentifier) {
    await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: preloadScriptIdentifier });
  }
  const viewerPreload = await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: authStorageScript(viewerSession.session.token, viewerSession.user),
  });
  await seedBrowserSessionCookie(client, viewerSession.session.token);
  await navigateToSites(client, 'Sites command center', siteId);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const bodyText = document.body?.innerText || '';
      const rbacPanel = document.querySelector('[data-testid="sites-rbac-scope"]');
      const rbacText = rbacPanel?.textContent || '';
      const newSiteButtons = Array.from(document.querySelectorAll('button')).filter((button) => (
        (button.textContent || '').trim() === 'New site'
      ));
      const newSiteStatus = document.querySelector('[data-testid="sites-create-action-status"]');
      const newSiteStatusId = newSiteStatus?.id || '';
      const newSiteActionStates = newSiteButtons.map((button) => ({
        state: button.getAttribute('data-action-state') || '',
        reason: button.getAttribute('data-disabled-reason') || '',
        status: button.getAttribute('data-action-status') || '',
        describedBy: button.getAttribute('aria-describedby') || '',
      }));
      const statusSelect = Array.from(document.querySelectorAll('select')).find((select) => (
        (select.getAttribute('aria-label') || '') === ${JSON.stringify(`Change status for ${siteName}`)}
      ));
      const duplicateButton = document.querySelector(${JSON.stringify(`[aria-label="Duplicate ${siteName}"]`)});
      const archiveButton = document.querySelector(${JSON.stringify(`[aria-label="Archive ${siteName}"]`)});
      const deleteButton = document.querySelector(${JSON.stringify(`[aria-label="Delete ${siteName}"]`)});
      const prepareDomainButtons = Array.from(document.querySelectorAll('button')).filter((button) => (
        (button.getAttribute('aria-label') || '').startsWith('Prepare domain verification for ')
      ));
      const verifyDomainButtons = Array.from(document.querySelectorAll('button')).filter((button) => (
        (button.getAttribute('aria-label') || '').startsWith('Mark domain verified for ')
      ));
      const auditPanel = document.querySelector('[data-testid="sites-audit-panel"]');
      const deployButtons = Array.from(document.querySelectorAll('button')).filter((button) => (
        (button.getAttribute('aria-label') || '').startsWith('Prepare Vercel preview deploy for ') ||
        (button.getAttribute('aria-label') || '').startsWith('Record Vercel preview deploy for ') ||
        (button.getAttribute('aria-label') || '').startsWith('Record Vercel production deploy for ') ||
        (button.getAttribute('aria-label') || '').startsWith('Record Vercel rollback for ')
      ));
      const billingButtons = Array.from(document.querySelectorAll('button')).filter((button) => (
        (button.getAttribute('aria-label') || '').startsWith('Set Free plan for ') ||
        (button.getAttribute('aria-label') || '').startsWith('Set Pro plan for ') ||
        (button.getAttribute('aria-label') || '').startsWith('Set Business plan for ') ||
        (button.getAttribute('aria-label') || '').startsWith('Set Enterprise plan for ') ||
        (button.getAttribute('aria-label') || '').startsWith('Refresh quota usage for ')
      ));
      const auditText = auditPanel?.textContent || '';
      const auditRefreshButton = Array.from(auditPanel?.querySelectorAll('button') || []).find((button) => (
        (button.textContent || '').includes('Refresh activity')
      ));
      return {
        ready: Boolean(rbacPanel),
        rbacText,
        newSiteDisabled: newSiteButtons.length === 0 || newSiteButtons.every((button) => button.disabled),
        newSiteStatusId,
        newSiteStatusText: newSiteStatus?.textContent || '',
        newSiteActionStates,
        statusDisabled: statusSelect instanceof HTMLSelectElement ? statusSelect.disabled : null,
        duplicateDisabled: duplicateButton instanceof HTMLButtonElement ? duplicateButton.disabled : null,
        archiveDisabled: archiveButton instanceof HTMLButtonElement ? archiveButton.disabled : null,
        deleteDisabled: deleteButton instanceof HTMLButtonElement ? deleteButton.disabled : null,
        prepareDomainDisabled: prepareDomainButtons.length === 0 || prepareDomainButtons.every((button) => button.disabled),
        verifyDomainDisabled: verifyDomainButtons.length === 0 || verifyDomainButtons.every((button) => button.disabled),
        deployActionsDisabled: deployButtons.length === 0 || deployButtons.every((button) => button.disabled),
        billingActionsDisabled: billingButtons.length === 0 || billingButtons.every((button) => button.disabled),
        auditRefreshDisabled: auditRefreshButton instanceof HTMLButtonElement ? auditRefreshButton.disabled : null,
        auditDenied: auditText.includes('role does not include') ||
          auditText.includes('Blocked by viewer') ||
          rbacText.includes('Permission matrix unavailable'),
        hasFrameworkOverlay: /Failed to compile|Unhandled Runtime Error|Vite Error|Internal Server Error/i.test(bodyText),
        body: bodyText.slice(0, 2600),
      };
    })()`);
    if (state.ready) {
      assert(/viewer/i.test(state.rbacText), `Viewer sites page did not show viewer RBAC scope: ${JSON.stringify(state)}`);
      assert(state.rbacText.includes('Create sites') && state.rbacText.includes('Hidden'), `Viewer sites page did not hide create permission: ${JSON.stringify(state)}`);
      assert(state.rbacText.includes('Configure sites') && state.rbacText.includes('Hidden'), `Viewer sites page did not hide configure permission: ${JSON.stringify(state)}`);
      assert(state.rbacText.includes('Archive/delete') && state.rbacText.includes('Hidden'), `Viewer sites page did not hide delete permission: ${JSON.stringify(state)}`);
      assert(state.newSiteDisabled === true, `Viewer sites page left New site enabled: ${JSON.stringify(state)}`);
      assert(state.newSiteStatusText.includes('New site unavailable:'), `Viewer sites page did not explain disabled New site controls: ${JSON.stringify(state)}`);
      assert(
        state.newSiteActionStates.length > 0 &&
          state.newSiteActionStates.every((action) => (
            action.state === 'blocked' &&
            action.describedBy === state.newSiteStatusId &&
            action.status === state.newSiteStatusText &&
            action.reason.length > 0
          )),
        `Viewer New site controls did not expose blocked action metadata: ${JSON.stringify(state)}`,
      );
      assert(state.statusDisabled !== false, `Viewer sites page left status control enabled: ${JSON.stringify(state)}`);
      assert(state.duplicateDisabled !== false, `Viewer sites page left duplicate enabled: ${JSON.stringify(state)}`);
      assert(state.archiveDisabled !== false, `Viewer sites page left archive enabled: ${JSON.stringify(state)}`);
      assert(state.deleteDisabled !== false, `Viewer sites page left delete enabled: ${JSON.stringify(state)}`);
      assert(state.prepareDomainDisabled === true, `Viewer sites page left domain prepare enabled: ${JSON.stringify(state)}`);
      assert(state.verifyDomainDisabled === true, `Viewer sites page left domain verify enabled: ${JSON.stringify(state)}`);
      assert(state.deployActionsDisabled === true, `Viewer sites page left Vercel deployment actions enabled: ${JSON.stringify(state)}`);
      assert(state.billingActionsDisabled === true, `Viewer sites page left billing quota actions enabled: ${JSON.stringify(state)}`);
      assert(state.auditRefreshDisabled !== false && state.auditDenied, `Viewer sites page did not hide audit activity: ${JSON.stringify(state)}`);
      assert(!state.hasFrameworkOverlay, `Viewer sites page rendered a framework/runtime overlay: ${JSON.stringify(state)}`);
      return { state, preloadScriptIdentifier: viewerPreload.identifier };
    }
    if (attempt === 79) {
      throw new Error(`Viewer sites RBAC scope did not render: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return { state: null, preloadScriptIdentifier: viewerPreload.identifier };
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-sites-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, siteId, ownerSessionToken }) => {
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
      // The UI flow may already have removed the temporary site.
    }
  }
};

const main = async () => {
  assertSitesRouteSourceContract();
  if (process.env.BACKY_SITES_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, guard: 'sites-source' }));
    return;
  }
  let client;
  let childProcess;
  let userDataDir;
  let createdSiteId;
  let duplicatedSiteId;
  let ownerUserId;
  let viewerUserId;
  let ownerSessionToken;
  let restoredQuotaIntegrations = null;
  const suffix = Date.now().toString(36);
  const siteName = `Sites Smoke ${suffix}`;
  const slug = `sites-smoke-${suffix}`;
  const customDomain = `${slug}.example.com`;
  const ownerEmail = `sites-owner-${suffix}@example.com`;
  const viewerEmail = `sites-viewer-${suffix}@example.com`;

  try {
    await loginAdminApi();
    await updateUser('user-admin', { role: 'admin', status: 'active' });
    const existing = await findSiteBySlug(slug);
    assert(!existing, `Temporary site already exists: ${slug}`);
    await assertSiteBillingLimitEnforced(suffix);
    await assertCustomDomainBillingLimitEnforced(suffix);
    restoredQuotaIntegrations = await temporarilyAllowSiteCreationQuota(2);
    const owner = await createUser({
      fullName: `Sites Owner ${suffix}`,
      email: ownerEmail,
      role: 'owner',
      status: 'invited',
    });
    ownerUserId = owner.id;
    const ownerInvite = await createInviteToken(owner.id);
    const ownerSession = await acceptInviteToken(ownerInvite.token);
    ownerSessionToken = ownerSession.session.token;
    const viewer = await createUser({
      fullName: `Sites Viewer ${suffix}`,
      email: viewerEmail,
      role: 'viewer',
      status: 'invited',
    });
    viewerUserId = viewer.id;
    const invite = await createInviteToken(viewer.id);
    const viewerSession = await acceptInviteToken(invite.token);

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
    await seedBrowserSessionCookie(client, ownerSession.session.token);
    const authPreload = await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(ownerSession.session.token, ownerSession.user),
    });

    await navigateToCreateSite(client);
    await assertCreateSiteViewportShell(client);
    const { site: created, pages } = await createSiteThroughUi(client, {
      siteName,
      slug,
      customDomain,
      sessionToken: ownerSession.session.token,
    });
    createdSiteId = created.id;
    const createdSelectionId = created.publicSiteId || created.id;
    await assertAdminSiteDeleteDenied(createdSiteId);
    assert(created.status === 'published', `Unexpected created site status: ${JSON.stringify(created)}`);
    assert(pages.length >= 3, `Storefront blueprint did not seed enough pages: ${JSON.stringify(pages).slice(0, 700)}`);

    await navigateToSites(client, siteName, createdSelectionId);
    await assertCreateSiteActionStatus(client, {
      state: 'ready',
      disabled: false,
      statusIncludes: 'New site available.',
    });
    await waitForSitesPageSite(client, siteName);
    await assertSiteActionStatus(client, siteName, {
      preview: { state: 'ready' },
      manage: { state: 'ready' },
      duplicate: { state: 'ready' },
      archive: { state: 'ready' },
      delete: { state: 'ready' },
    });
    await waitForSelectedSiteOperations(client, siteName);
    await assertLayout(client, siteName);
    await exerciseDomainVerification(client, { siteId: createdSiteId, siteName, sessionToken: ownerSession.session.token });
    await exerciseVercelDeployment(client, { siteId: createdSiteId, siteName, sessionToken: ownerSession.session.token });
    await exerciseBillingQuotas(client, { siteId: createdSiteId, siteName, sessionToken: ownerSession.session.token });

    await setSiteStatusSelect(client, siteName, 'draft');
    await waitForSite(slug, (site) => site.status === 'draft' || site.isPublished === false, ownerSession.session.token);
    await setSiteStatusSelect(client, siteName, 'published');
    const published = await waitForSite(slug, (site) => site.status === 'published' || site.isPublished === true, ownerSession.session.token);
    assert((await getSite(published.id, ownerSession.session.token)).status === 'published', 'Site status update did not persist through the admin API.');
    await exerciseSitesFilters(client, siteName);

    const duplicated = await duplicateSiteThroughUi(client, siteName, slug, ownerSession.session.token);
    duplicatedSiteId = duplicated.id;
    assert((await getSite(duplicated.id, ownerSession.session.token)).status === 'draft', 'Duplicated site did not persist as a draft through the admin API.');
    await assertDuplicatedSiteContent({ sourcePages: pages, duplicateSiteId: duplicated.id, sessionToken: ownerSession.session.token });

    await archiveSiteThroughUi(client, siteName, slug, ownerSession.session.token);
    assert((await getSite(createdSiteId, ownerSession.session.token)).status === 'archived', 'Archive action did not persist through the admin API.');
    await assertSiteActionStatus(client, siteName, {
      preview: { state: 'ready' },
      manage: { state: 'ready' },
      duplicate: { state: 'ready' },
      archive: {
        state: 'blocked',
        reasonIncludes: 'This site is already archived.',
        statusIncludes: 'Archive unavailable: This site is already archived.',
      },
      delete: { state: 'ready' },
    });
    await assertSiteAuditTrail(client, { siteId: createdSiteId, siteName });

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await setSitesFilter(client, 'Search sites', siteName);
    await deleteSiteThroughUi(client, siteName);
    await waitForSiteMissing(slug);
    createdSiteId = null;

    await deleteSite(duplicatedSiteId, ownerSessionToken);
    duplicatedSiteId = null;
    const viewerRbac = await assertSitesRbacFiltering(client, viewerSession, 'Sites command center', authPreload.identifier);
    if (viewerRbac?.preloadScriptIdentifier) {
      await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: viewerRbac.preloadScriptIdentifier });
    }
    await deleteUser(viewerUserId);
    viewerUserId = null;
    await deleteUser(ownerUserId);
    ownerUserId = null;

    console.log(JSON.stringify({
      ok: true,
      siteName,
      slug,
      duplicatedSlug: duplicated.slug,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (restoredQuotaIntegrations) {
      await updateSettings({ integrations: restoredQuotaIntegrations }).catch(() => {});
    }
    await updateUser('user-admin', { role: 'owner', status: 'active' }).catch(() => {});
    await cleanup({ client, childProcess, userDataDir, siteId: createdSiteId, ownerSessionToken });
    if (duplicatedSiteId) {
      await deleteSite(duplicatedSiteId, ownerSessionToken).catch(() => {});
    }
    if (viewerUserId) {
      await deleteUser(viewerUserId).catch(() => {});
    }
    if (ownerUserId) {
      await deleteUser(ownerUserId).catch(() => {});
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

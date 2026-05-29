#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_PAGES_LIST_CDP_PORT || 9374);
const HIERARCHY_SITE_ID = process.env.BACKY_PAGES_LIST_HIERARCHY_SITE_ID || 'site-demo';
const EMPTY_SITE_ID = process.env.BACKY_PAGES_LIST_EMPTY_SITE_ID || 'site-cook';
const SCREENSHOT_PATH = process.env.BACKY_PAGES_LIST_SCREENSHOT || path.join(os.tmpdir(), 'backy-pages-list-smoke.png');
const VISUAL_SCREENSHOT_DIR = process.env.BACKY_PAGES_LIST_VISUAL_SCREENSHOT_DIR || os.tmpdir();
const API_TIMEOUT_MS = Number(process.env.BACKY_PAGES_LIST_API_TIMEOUT_MS || 30000);
const LOG_PROGRESS = process.env.BACKY_PAGES_LIST_PROGRESS === '1';
const VISUAL_SCREENSHOT_PATHS = {
  empty: path.join(VISUAL_SCREENSHOT_DIR, 'backy-pages-list-empty-state.png'),
  delivery: path.join(VISUAL_SCREENSHOT_DIR, 'backy-pages-list-delivery-row.png'),
  bulkModal: path.join(VISUAL_SCREENSHOT_DIR, 'backy-pages-list-bulk-publish-modal.png'),
  postPublish: path.join(VISUAL_SCREENSHOT_DIR, 'backy-pages-list-post-publish-row.png'),
};
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const logProgress = (message) => {
  if (LOG_PROGRESS) {
    process.stderr.write(`[pages-list-smoke] ${message}\n`);
  }
};

const withSmokeStep = async (label, task) => {
  logProgress(`start ${label}`);
  const result = await task();
  logProgress(`done ${label}`);
  return result;
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${url} timed out after ${API_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const assertPagesListSourceContract = () => {
  const source = fs.readFileSync(new URL('../src/routes/pages.tsx', import.meta.url), 'utf8');
  const smokeSource = fs.readFileSync(new URL(import.meta.url), 'utf8');
  const canvasEditorSource = fs.readFileSync(new URL('../src/components/editor/CanvasEditor.tsx', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Pages list route must use the shared EmptyState component');
  assert(source.includes('No saved snapshots yet'), 'Pages revision column must keep an explicit empty revision title visible');
  assert(source.includes('Save this page in the editor to capture a rollback-ready revision.'), 'Pages revision empty state must explain how snapshots are captured');
  assert(
    source.includes('const PAGE_REVISION_SUMMARY_TIMEOUT_MS = 10000') &&
      source.includes('const PAGE_REVISION_SUMMARY_MAX_ATTEMPTS = 2') &&
      source.includes('const visibleRevisionSummaryTargets = useMemo') &&
      source.includes('getPageRevisionSummaryWithTimeout(page.siteId || siteId, page.id)') &&
      source.includes('loadPageRevisionSummariesWithRetry(activeSiteId, missingPages)') &&
      source.includes('data-testid={`pages-revisions-${page.id}`}') &&
      source.includes('Checking revisions...'),
    'Pages revision summaries must keep the revision cell visible and avoid indefinite metadata loading.',
  );
  assert(
      source.includes('const hasLoadedActiveSitePages = activeSiteIdentifiers.some((siteId) => loadedPageSiteIds.has(siteId))') &&
      source.includes('const isInitialPageLoad = isLoading && activeSitePages.length === 0 && !hasLoadedActiveSitePages') &&
      source.includes('const isBlockingInitialPageLoad = isInitialPageLoad && !canEditPages') &&
      source.includes('const isPageLibraryBusy = isBlockingInitialPageLoad;') &&
      source.includes('const isPageBulkControlsBusy = isBlockingInitialPageLoad || isBulkBusy;') &&
      source.includes('const isPageRowMutationBusy = isBulkBusy || mutatingPageId !== null;') &&
      source.includes('const isPagePreviewBusy = previewingPageId !== null;') &&
      !source.includes('const isPageLibraryBusy = isBlockingInitialPageLoad || isPageMutationBusy') &&
      source.includes("const canEditPages = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', PAGE_PERMISSION_ROLE_DEFAULTS)") &&
      source.includes('setPagesForSite(sitePageIdentifiers, backendPages)') &&
      source.includes('markPagesLoadedForSite(sitePageIdentifiers)') &&
      source.includes('loading={isBlockingInitialPageLoad}') &&
      source.includes('Current rows stay usable while Backy syncs.'),
    'Pages list must keep existing rows, filters, handoffs, and unrelated actions available during background refreshes and scoped row mutations without clearing other site pages.',
  );
  assert(
    source.includes('const PAGE_READINESS_PREFLIGHT_TIMEOUT_MS = 10000') &&
      source.includes('const getPageReadinessPreflight = async') &&
      source.includes('controller.abort()') &&
      source.includes('readiness: await getPageReadinessPreflight(page.siteId || activeSiteId, page.id)'),
    'Pages publish actions must not leave the UI stuck while live readiness preflight refreshes are slow.',
  );
  assert(
    source.includes("navigate({ to: '/pages/$pageId/edit', params: { pageId: page.id }, search: { siteId: activeSiteId, focus: 'canvas' } })"),
    'Pages list edit actions must open the compact focused canvas editor.',
  );
  assert(source.includes('data-testid="pages-error-state"') && source.includes('Pages workspace needs attention'), 'Pages list must expose a labelled backend error state');
  assert(source.includes('aria-label="Retry loading pages"') && source.includes('Retry load'), 'Pages list backend error state must expose a retry action');
  assert(source.includes('hasPageFilters') && source.includes('Clear filters'), 'Pages list backend error state must expose filter recovery when filters are active');
  assert(source.includes('data-testid="pages-permission-state"') && source.includes('Page permissions could not be verified'), 'Pages list must expose a labelled permission error state');
  assert(source.includes('const loadPagePermissions = useCallback(() => {'), 'Pages list must keep permission loading in a reusable retryable callback');
  assert(source.includes('aria-label="Retry loading page permissions"') && source.includes('Retry permissions'), 'Pages permission error state must expose a retry action');
  assert(source.includes('to="/users"') && source.includes('Review users'), 'Pages permission error state must link to user access management');
  assert(
      source.includes('const selectedFilteredPages = filteredPages.filter') &&
      source.includes('const allFilteredPagesSelected = filteredPages.length > 0 && selectedFilteredPages.length === filteredPages.length') &&
      source.includes('const bulkSelectionStatusId = useId();') &&
      source.includes('const bulkActionStatusId = useId();') &&
      source.includes('const visibleSelectedCount = selectedTablePages.length;') &&
      source.includes('const bulkSelectionStatus = selectedPages.length === 0') &&
      source.includes('const bulkActionReady = Boolean(') &&
      source.includes('const bulkActionStatus = selectedPages.length === 0') &&
      source.includes('const selectVisibleDisabledReason = data.length === 0') &&
      source.includes('const selectFilteredDisabledReason = filteredPages.length === 0') &&
      source.includes('const bulkActionSelectDisabledReason = bulkControlsBusyReason || bulkSelectionPermissionReason') &&
      source.includes('const bulkActionApplyDisabledReason = selectedPages.length === 0') &&
      source.includes('const clearSelectionDisabledReason = isPageBulkControlsBusy') &&
      source.includes('const bulkGroupActionStatus = `${bulkSelectionStatus} ${bulkActionStatus}`') &&
      source.includes('data-testid="pages-bulk-toolbar"') &&
      source.includes('role="group"') &&
      source.includes('aria-label="Bulk page actions"') &&
      source.includes('aria-describedby={`${bulkSelectionStatusId} ${bulkActionStatusId}`}') &&
      source.includes('data-action-state={bulkActionReady ? \'ready\' : \'blocked\'}') &&
      source.includes('data-action-status={bulkGroupActionStatus}') &&
      source.includes('data-selected-count={selectedPages.length}') &&
      source.includes('data-visible-selected-count={visibleSelectedCount}') &&
      source.includes('data-hidden-selected-count={hiddenSelectedCount}') &&
      source.includes('data-filtered-selected-count={selectedFilteredPages.length}') &&
      source.includes('data-bulk-action={bulkAction || \'none\'}') &&
      source.includes('data-bulk-action-ready={bulkActionReady ? \'true\' : \'false\'}') &&
      source.includes('data-testid="pages-bulk-selection-status"') &&
      source.includes('aria-live="polite"') &&
      source.includes('data-testid="pages-bulk-select-visible"') &&
      source.includes("aria-label={selectedTablePages.length === data.length && data.length > 0 ? 'Clear visible page selection' : 'Select visible pages'}") &&
      source.includes('data-action-status={selectVisibleDisabledReason || bulkSelectionStatus}') &&
      source.includes('data-disabled-reason={selectVisibleDisabledReason || undefined}') &&
      source.includes('data-testid="pages-bulk-select-filtered"') &&
      source.includes('aria-label={allFilteredPagesSelected ? `Clear all ${filteredPages.length} filtered page selections` : `Select all ${filteredPages.length} filtered pages`}') &&
      source.includes('data-action-status={selectFilteredDisabledReason || bulkSelectionStatus}') &&
      source.includes('data-disabled-reason={selectFilteredDisabledReason || undefined}') &&
      source.includes('aria-label="Choose bulk page action"') &&
      source.includes('aria-describedby={bulkActionStatusId}') &&
      source.includes('data-action-status={bulkActionSelectDisabledReason || bulkActionStatus}') &&
      source.includes('aria-label={bulkAction ? `Apply bulk action: ${bulkActionLabel}` : \'Apply selected bulk action\'}') &&
      source.includes('aria-disabled={Boolean(bulkActionApplyDisabledReason)}') &&
      source.includes('data-action-state={bulkActionApplyDisabledReason ? \'blocked\' : \'ready\'}') &&
      source.includes('data-action-status={bulkActionStatus}') &&
      source.includes('data-disabled-reason={bulkActionApplyDisabledReason || undefined}') &&
      source.includes('data-bulk-action-status={bulkActionStatus}') &&
      source.includes('data-testid="pages-bulk-action-status"') &&
      source.includes('data-testid="pages-bulk-clear-selection"') &&
      source.includes('data-action-status={clearSelectionDisabledReason || bulkSelectionStatus}') &&
      source.includes('data-testid="pages-bulk-clear-non-visible"') &&
      source.includes('setPendingBulkUnpublish(false);') &&
      source.includes('setPendingBulkArchive(false);') &&
      source.includes('Select all filtered') &&
      source.includes('setPageSelection(filteredPages, !allFilteredPagesSelected)') &&
      smokeSource.includes('BACKY_PAGES_LIST_BULK_SELECTION_STATUS_SMOKE') &&
      smokeSource.includes('BACKY_PAGES_LIST_BULK_ACTION_STATUS_SMOKE') &&
      smokeSource.includes('assertPagesBulkSelectionStatus') &&
      smokeSource.includes('assertPagesBulkActionStatus') &&
      smokeSource.includes('runPagesBulkSelectionStatusSmoke') &&
      smokeSource.includes('runPagesBulkActionStatusSmoke'),
    'Pages list bulk toolbar must support selecting every page matching the current filters, expose labelled selection controls, live selection/action status, and clear pending review state when the chosen action changes.',
  );
  assert(
    source.includes('aria-label="Search pages by title, slug, route, or template"') &&
      source.includes('data-testid="pages-search-input"') &&
      source.includes('data-testid={`pages-metric-filter-${metric.key}`}') &&
      source.includes('aria-pressed={metric.active}') &&
      source.includes('aria-label={metric.ariaLabel}') &&
      source.includes('data-testid={`pages-status-filter-${status}`}') &&
      source.includes('aria-pressed={statusFilter === status && healthFilter === \'all\'}') &&
      source.includes('aria-label={`Filter pages by ${status === \'all\' ? \'all statuses\' : `${status} status`}`}') &&
      source.includes('data-testid="pages-health-filter-select"') &&
      source.includes('data-testid="pages-filter-refresh"') &&
      source.includes('aria-label="Refresh page table"') &&
      source.includes('data-testid="pages-clear-filters"') &&
      source.includes('aria-label="Clear page search and filters"') &&
      source.includes('data-testid="pages-empty-clear-filters"'),
    'Pages filters must expose labelled search, metric filters, status chips, readiness select, refresh, and clear-filter recovery controls.',
  );
  assert(source.includes('function PageTemplateCell') && source.includes('data-testid={`pages-template-${page.id}`}'), 'Pages list must render page template provenance per row');
  assert(source.includes("'template_source'") && source.includes("'frontend_design_template_id'") && source.includes("'collection_dataset_slug'"), 'Pages CSV export must include template provenance columns');
  assert(source.includes('const templateInfo = pageTemplateInfo(page)') && source.includes('template: templateInfo') && source.includes("pageMetaString(page, 'frontendDesignTemplateId')") && source.includes("pageMetaRecord(page, 'collectionDataset')"), 'Pages handoff must expose starter, frontend-design, and dataset page provenance');
  assert(
    source.includes('data-testid="pages-starter-library"') &&
      source.includes('data-disclosure="advanced-page-workflows"') &&
      source.includes('Starters, connected workflows, and handoff shortcuts stay here when needed.') &&
      source.includes('data-testid="pages-starter-drawer"') &&
      source.includes('Show {PAGE_CREATION_SHORTCUTS.length} starters') &&
      source.includes('data-testid="pages-starter-scroll-region"') &&
      source.includes('data-testid={`pages-create-${shortcut.key}`}'),
    'Pages list starter catalog and connected workflows must stay collapsed by default while preserving every direct starter handoff link.',
  );
  assert(
    source.includes('data-testid="pages-command-create"') &&
      source.includes('data-testid="pages-command-refresh"') &&
      source.includes('aria-label="Refresh page library"') &&
      source.includes('data-testid="pages-refresh-delivery-health"') &&
      source.includes('aria-label="Refresh delivery health for published pages"') &&
      source.includes('data-testid="pages-command-secondary-actions"') &&
      source.includes("const pagesCommandSecondaryActionStatusId = 'pages-command-secondary-action-status';") &&
      source.includes('data-testid="pages-command-secondary-action-status"') &&
      source.includes('aria-describedby={pagesCommandSecondaryActionStatusId}') &&
      source.includes('data-action-state={pagesCommandSecondaryActionState}') &&
      source.includes('data-action-status={pagesCommandSecondaryActionStatus}') &&
      source.includes('aria-label="Show page export and handoff actions"') &&
      source.includes('data-testid="pages-command-copy-handoff"') &&
      source.includes('data-action-status={pagesCommandCopyActionStatus}') &&
      source.includes('aria-label="Copy pages handoff manifest"') &&
      source.includes('data-testid="pages-command-download-handoff"') &&
      source.includes('data-action-status={pagesCommandDownloadActionStatus}') &&
      source.includes('aria-label="Download pages handoff JSON"') &&
      source.includes('data-testid="pages-command-export-csv"') &&
      source.includes('data-action-status={pagesCommandExportActionStatus}') &&
      source.includes('data-disabled-reason={pagesCommandExportDisabledReason || undefined}') &&
      source.includes('aria-label="Export filtered pages CSV"') &&
      source.includes('More actions') &&
      source.indexOf('data-testid="pages-command-create"') < source.indexOf('data-testid="pages-command-secondary-actions"'),
    'Pages command center must keep New Page primary while grouping labelled refresh, handoff, and export actions behind a secondary disclosure with ready/blocked state metadata.',
  );
  assert(
    source.includes('pageTitle={page.title}') &&
      source.includes('pageTitle: string;') &&
      source.includes('aria-label={`Refresh delivery health for ${pageTitle}`}'),
    'Pages delivery health row refresh controls must name the page they refresh.',
  );
  assert(
    source.includes('tableMinWidth="2100px"') &&
      source.includes("width: '420px'") &&
      source.includes("width: '168px'") &&
      source.includes('className="flex max-w-full items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground"') &&
      source.includes('data-testid={`pages-delivery-health-details-${pageId}`}') &&
      source.includes('data-testid={`pages-delivery-history-${pageId}`}') &&
      source.includes('data-default-collapsed="true"') &&
      source.includes('Health details') &&
      source.includes('Recent probes'),
    'Pages table must reserve enough width for delivery/status columns and collapse delivery health diagnostics plus probe history to prevent row overlap.',
  );
  assert(
    source.includes('const createPageLinkDisabled = !canEditPages') &&
      source.includes("templateSource: 'backy-canvas' as const") &&
      source.includes("focus: 'canvas' as const") &&
      source.includes('const buildBackyCanvasPageCreateRoute = useCallback') &&
      source.includes("params.set('template', template);") &&
      source.includes("const createPageActionStatusId = 'pages-create-action-status';") &&
      source.includes('const createPageActionDisabledReason = createPageLinkDisabled') &&
      source.includes('const createPageActionStatus = createPageActionDisabledReason') &&
      source.includes('data-testid="pages-create-action-status"') &&
      source.includes('aria-disabled={createPageLinkDisabled}') &&
      source.includes('aria-describedby={createPageActionStatusId}') &&
      source.includes('data-action-state={createPageActionDisabledReason ?') &&
      source.includes('data-action-status={createPageActionStatus}') &&
      source.includes('data-disabled-reason={createPageActionDisabledReason || undefined}') &&
      source.includes('data-target-site-id={activeSiteId}') &&
      source.includes("createPageLinkDisabled && 'pointer-events-none opacity-60'") &&
      !source.includes('aria-disabled={isPageLibraryBusy || !canEditPages}') &&
      smokeSource.includes("clickEmptyCreate(\n      client,\n      'pages-command-create'"),
    'Pages create links must stay reachable during background page loading and mutation, expose shared action-status metadata, only disable when pages.edit is unavailable, and the rendered smoke must click the primary command create link.',
  );
  assert(
    source.includes('const handlePagePublishDialogKeyDown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || mutatingPageId === pendingPublishPage.id) return;") &&
      source.includes("document.addEventListener('keydown', handlePagePublishDialogKeyDown, true)") &&
      source.includes('aria-label={`Publish ${page.title}`}') &&
      source.includes('aria-labelledby="pages-publish-confirm-title"') &&
      source.includes('aria-describedby="pages-publish-confirm-description pages-publish-confirm-impact"') &&
      source.includes('data-testid="pages-publish-modal"') &&
      source.includes('id="pages-publish-confirm-title"') &&
      source.includes('id="pages-publish-confirm-description"') &&
      source.includes('id="pages-publish-confirm-impact"') &&
      source.includes('data-testid="pages-publish-preview-button"') &&
      source.includes('aria-label={`Preview ${pendingPublishPage.title} before publishing`}') &&
      source.includes('aria-label={`Cancel publishing ${pendingPublishPage.title}`}') &&
      source.includes('aria-label={`Confirm publishing ${pendingPublishPage.title}`}') &&
      smokeSource.includes('BACKY_PAGES_LIST_PUBLISH_DIALOG_SMOKE') &&
      smokeSource.includes('assertPagesPublishDialogRecovery'),
    'Pages single-page publish confirmation must expose accessible dialog semantics, explicit actions, and Escape recovery.',
  );
  assert(
    source.includes('const [pendingUnpublishPage, setPendingUnpublishPage] = useState<Page | null>(null);') &&
      source.includes('const handlePageUnpublishDialogKeyDown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || mutatingPageId === pendingUnpublishPage.id) return;") &&
      source.includes("document.addEventListener('keydown', handlePageUnpublishDialogKeyDown, true)") &&
      source.includes('setPendingUnpublishPage(page)') &&
      source.includes('aria-label={`Unpublish ${page.title}`}') &&
      source.includes('aria-labelledby="pages-unpublish-confirm-title"') &&
      source.includes('aria-describedby="pages-unpublish-confirm-description pages-unpublish-confirm-impact"') &&
      source.includes('data-testid="pages-unpublish-modal"') &&
      source.includes('id="pages-unpublish-confirm-title"') &&
      source.includes('id="pages-unpublish-confirm-description"') &&
      source.includes('id="pages-unpublish-confirm-impact"') &&
      source.includes('data-testid="pages-unpublish-preview-button"') &&
      source.includes('aria-label={`Preview ${pendingUnpublishPage.title} before unpublishing`}') &&
      source.includes('aria-label={`Cancel unpublishing ${pendingUnpublishPage.title}`}') &&
      source.includes('aria-label={`Confirm unpublishing ${pendingUnpublishPage.title}`}') &&
      smokeSource.includes('BACKY_PAGES_LIST_UNPUBLISH_DIALOG_SMOKE') &&
      smokeSource.includes('assertPagesUnpublishDialogRecovery') &&
      smokeSource.includes('runPagesUnpublishDialogSmoke'),
    'Pages single-page unpublish confirmation must expose accessible dialog semantics, explicit actions, and Escape recovery.',
  );
  assert(
    source.includes('const [pendingArchivePage, setPendingArchivePage] = useState<Page | null>(null);') &&
      source.includes('const handlePageArchiveDialogKeyDown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || mutatingPageId === pendingArchivePage.id) return;") &&
      source.includes("document.addEventListener('keydown', handlePageArchiveDialogKeyDown, true)") &&
      source.includes('setPendingArchivePage(page)') &&
      source.includes('aria-label={`Archive ${page.title}`}') &&
      source.includes('aria-labelledby="pages-archive-confirm-title"') &&
      source.includes('aria-describedby="pages-archive-confirm-description pages-archive-confirm-impact"') &&
      source.includes('data-testid="pages-archive-modal"') &&
      source.includes('id="pages-archive-confirm-title"') &&
      source.includes('id="pages-archive-confirm-description"') &&
      source.includes('id="pages-archive-confirm-impact"') &&
      source.includes('data-testid="pages-archive-preview-button"') &&
      source.includes('aria-label={`Preview ${pendingArchivePage.title} before archiving`}') &&
      source.includes('aria-label={`Cancel archiving ${pendingArchivePage.title}`}') &&
      source.includes('aria-label={`Confirm archiving ${pendingArchivePage.title}`}') &&
      smokeSource.includes('BACKY_PAGES_LIST_ARCHIVE_DIALOG_SMOKE') &&
      smokeSource.includes('assertPagesArchiveDialogRecovery') &&
      smokeSource.includes('runPagesArchiveDialogSmoke'),
    'Pages single-page archive confirmation must expose accessible dialog semantics, explicit actions, and Escape recovery.',
  );
  assert(
    source.includes('aria-label={`Publish ${page.title}`}') &&
      source.includes('aria-label={`Unpublish ${page.title}`}') &&
      source.includes('aria-label={`Archive ${page.title}`}') &&
      source.includes('aria-label={`Open published page ${page.title}`}') &&
      source.includes('const rowActionStatusId = `pages-actions-status-${page.id}`;') &&
      source.includes('const rowActionStatus = [') &&
      source.includes('role="group"') &&
      source.includes('aria-label={`Actions for ${page.title}`}') &&
      source.includes('aria-describedby={rowActionStatusId}') &&
      source.includes('data-testid={`pages-actions-${page.id}`}') &&
      source.includes('data-action-status={rowActionStatus}') &&
      source.includes('data-testid={`pages-actions-status-${page.id}`}') &&
      source.includes('data-action-state={publishDisabledReason ? \'blocked\' : \'ready\'}') &&
      source.includes('data-disabled-reason={publishDisabledReason || undefined}') &&
      source.includes('data-action-state={previewDisabledReason ? \'blocked\' : \'ready\'}') &&
      source.includes('data-testid={`pages-open-${page.id}`}') &&
      source.includes('data-action-state="ready"') &&
      source.includes('aria-label={`Preview ${page.title}`}') &&
      source.includes('aria-label={`Edit ${page.title}`}') &&
      source.includes('aria-label={`Delete ${page.title}`}') &&
      smokeSource.includes('BACKY_PAGES_LIST_ROW_ACTION_LABEL_SMOKE') &&
      smokeSource.includes('assertPagesRowActionLabels') &&
      smokeSource.includes('assertPagesCommandSecondaryEmptyExportState') &&
      smokeSource.includes('runPagesRowActionLabelSmoke'),
    'Pages row icon actions must expose page-specific accessible names, row action group semantics, status descriptions, and ready/blocked metadata for publish, unpublish, archive, open, preview, edit, and delete.',
  );
  assert(
    source.includes('const handlePageDeleteDialogKeyDown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || mutatingPageId === pendingDeletePage.id) return;") &&
      source.includes("document.addEventListener('keydown', handlePageDeleteDialogKeyDown, true)") &&
      source.includes('aria-label={`Delete ${page.title}`}') &&
      source.includes('role="dialog"') &&
      source.includes('aria-modal="true"') &&
      source.includes('aria-labelledby="pages-delete-confirm-title"') &&
      source.includes('aria-describedby="pages-delete-confirm-description pages-delete-confirm-impact"') &&
      source.includes('data-testid="pages-delete-confirm-dialog"') &&
      source.includes('id="pages-delete-confirm-title"') &&
      source.includes('id="pages-delete-confirm-description"') &&
      source.includes('id="pages-delete-confirm-impact"') &&
      source.includes('data-testid="pages-delete-cancel-button"') &&
      source.includes('data-testid="pages-delete-confirm-button"') &&
      source.includes('aria-label={`Cancel deleting ${pendingDeletePage.title}`}') &&
      source.includes('aria-label={`Confirm deleting ${pendingDeletePage.title}`}') &&
      smokeSource.includes('BACKY_PAGES_LIST_DELETE_DIALOG_SMOKE') &&
      smokeSource.includes('assertPagesDeleteDialogRecovery'),
    'Pages single-page delete confirmation must expose accessible dialog semantics, explicit actions, and Escape recovery.',
  );
  assert(
    source.includes('const handlePagesBulkDeleteDialogKeyDown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || isBulkBusy) return;") &&
      source.includes("document.addEventListener('keydown', handlePagesBulkDeleteDialogKeyDown, true)") &&
      source.includes('aria-labelledby="pages-bulk-delete-confirm-title"') &&
      source.includes('aria-describedby="pages-bulk-delete-confirm-description pages-bulk-delete-confirm-impact"') &&
      source.includes('data-testid="pages-bulk-delete-confirm-dialog"') &&
      source.includes('id="pages-bulk-delete-confirm-title"') &&
      source.includes('id="pages-bulk-delete-confirm-description"') &&
      source.includes('id="pages-bulk-delete-confirm-impact"') &&
      source.includes('data-testid="pages-bulk-delete-cancel-button"') &&
      source.includes('data-testid="pages-bulk-delete-confirm-button"') &&
      source.includes('aria-label={`Cancel deleting ${selectedPages.length} selected page${selectedPages.length === 1 ? \'\' : \'s\'}`}') &&
      source.includes('aria-label={`Confirm deleting ${selectedPages.length} selected page${selectedPages.length === 1 ? \'\' : \'s\'}`}') &&
      smokeSource.includes('BACKY_PAGES_LIST_BULK_DELETE_DIALOG_SMOKE') &&
      smokeSource.includes('assertPagesBulkDeleteDialogRecovery'),
    'Pages bulk delete confirmation must expose accessible dialog semantics, explicit actions, and Escape recovery.',
  );
  assert(
    source.includes('const handlePagesBulkPublishDialogKeyDown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || isBulkBusy) return;") &&
      source.includes("document.addEventListener('keydown', handlePagesBulkPublishDialogKeyDown, true)") &&
      source.includes('aria-labelledby="pages-bulk-publish-confirm-title"') &&
      source.includes('aria-describedby="pages-bulk-publish-confirm-description pages-bulk-publish-confirm-impact"') &&
      source.includes('data-testid="pages-bulk-publish-modal"') &&
      source.includes('id="pages-bulk-publish-confirm-title"') &&
      source.includes('id="pages-bulk-publish-confirm-description"') &&
      source.includes('id="pages-bulk-publish-confirm-impact"') &&
      source.includes('data-testid="pages-bulk-publish-cancel-button"') &&
      source.includes('data-testid="pages-bulk-publish-confirm-button"') &&
      source.includes('aria-label={`Cancel publishing ${selectedPages.length} selected page${selectedPages.length === 1 ? \'\' : \'s\'}`}') &&
      source.includes('aria-label={`Confirm publishing ${selectedPages.length} selected page${selectedPages.length === 1 ? \'\' : \'s\'}`}') &&
      smokeSource.includes('BACKY_PAGES_LIST_BULK_PUBLISH_DIALOG_SMOKE') &&
      smokeSource.includes('assertPagesBulkPublishDialogRecovery'),
    'Pages bulk publish confirmation must expose accessible dialog semantics, explicit actions, and Escape recovery.',
  );
  assert(
    source.includes('const [pendingBulkUnpublish, setPendingBulkUnpublish] = useState(false);') &&
      source.includes('const selectedUnpublishablePages = selectedPages.filter((page) => page.status === \'published\' || page.status === \'scheduled\');') &&
      source.includes('const handlePagesBulkUnpublishDialogKeyDown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || isBulkBusy) return;") &&
      source.includes("document.addEventListener('keydown', handlePagesBulkUnpublishDialogKeyDown, true)") &&
      source.includes('setPendingBulkUnpublish(true)') &&
      source.includes('aria-labelledby="pages-bulk-unpublish-confirm-title"') &&
      source.includes('aria-describedby="pages-bulk-unpublish-confirm-description pages-bulk-unpublish-confirm-impact"') &&
      source.includes('data-testid="pages-bulk-unpublish-modal"') &&
      source.includes('id="pages-bulk-unpublish-confirm-title"') &&
      source.includes('id="pages-bulk-unpublish-confirm-description"') &&
      source.includes('id="pages-bulk-unpublish-confirm-impact"') &&
      source.includes('data-testid="pages-bulk-unpublish-cancel-button"') &&
      source.includes('data-testid="pages-bulk-unpublish-confirm-button"') &&
      source.includes('aria-label={`Cancel unpublishing ${selectedUnpublishablePages.length} selected page${selectedUnpublishablePages.length === 1 ? \'\' : \'s\'}`}') &&
      source.includes('aria-label={`Confirm unpublishing ${selectedUnpublishablePages.length} selected page${selectedUnpublishablePages.length === 1 ? \'\' : \'s\'}`}') &&
      smokeSource.includes('BACKY_PAGES_LIST_BULK_UNPUBLISH_DIALOG_SMOKE') &&
      smokeSource.includes('assertPagesBulkUnpublishDialogRecovery') &&
      smokeSource.includes('runPagesBulkUnpublishDialogSmoke'),
    'Pages bulk unpublish confirmation must expose accessible dialog semantics, explicit actions, and Escape recovery.',
  );
  assert(
    source.includes('const [pendingBulkArchive, setPendingBulkArchive] = useState(false);') &&
      source.includes('const selectedArchivablePages = selectedPages.filter((page) => page.status !== \'archived\');') &&
      source.includes('const handlePagesBulkArchiveDialogKeyDown = (event: KeyboardEvent) => {') &&
      source.includes("if (event.key !== 'Escape' || isBulkBusy) return;") &&
      source.includes("document.addEventListener('keydown', handlePagesBulkArchiveDialogKeyDown, true)") &&
      source.includes('setPendingBulkArchive(true)') &&
      source.includes('aria-labelledby="pages-bulk-archive-confirm-title"') &&
      source.includes('aria-describedby="pages-bulk-archive-confirm-description pages-bulk-archive-confirm-impact"') &&
      source.includes('data-testid="pages-bulk-archive-modal"') &&
      source.includes('id="pages-bulk-archive-confirm-title"') &&
      source.includes('id="pages-bulk-archive-confirm-description"') &&
      source.includes('id="pages-bulk-archive-confirm-impact"') &&
      source.includes('data-testid="pages-bulk-archive-cancel-button"') &&
      source.includes('data-testid="pages-bulk-archive-confirm-button"') &&
      source.includes('aria-label={`Cancel archiving ${selectedArchivablePages.length} selected page${selectedArchivablePages.length === 1 ? \'\' : \'s\'}`}') &&
      source.includes('aria-label={`Confirm archiving ${selectedArchivablePages.length} selected page${selectedArchivablePages.length === 1 ? \'\' : \'s\'}`}') &&
      smokeSource.includes('BACKY_PAGES_LIST_BULK_ARCHIVE_DIALOG_SMOKE') &&
      smokeSource.includes('assertPagesBulkArchiveDialogRecovery') &&
      smokeSource.includes('runPagesBulkArchiveDialogSmoke'),
    'Pages bulk archive confirmation must expose accessible dialog semantics, explicit actions, and Escape recovery.',
  );
  assert(
    source.includes('Refreshing pages in the background. Current rows stay usable while Backy syncs. Create actions stay usable too.') &&
      source.includes('data-testid="pages-readiness-details"') &&
      source.includes('data-testid="pages-api-contract"') &&
      source.includes('data-disclosure="page-api-contract"') &&
      source.includes('data-testid="pages-api-details"') &&
      source.includes('API, readiness, and frontend handoff details') &&
      source.includes('Page library readiness and workflow') &&
      source.includes('detail: `${pageDesignReadiness.readyCount}/${pageDesignReadiness.total} checks`'),
    'Pages command center must stay compact, keep create actions usable during refresh, and move detailed readiness/workflow/API diagnostics behind disclosure.',
  );
  assert(
    canvasEditorSource.includes('const hasBrowserUserActivation = (): boolean => {') &&
      canvasEditorSource.includes('(navigator as NavigatorWithUserActivation).userActivation') &&
      canvasEditorSource.includes('if (!hasBrowserUserActivation())') &&
      canvasEditorSource.includes('event.returnValue = \'\';'),
    'Canvas editor beforeunload protection must only request a browser confirmation after real user activation so list-route editor navigation does not emit Chrome intervention errors.',
  );
  assert(
    source.includes("schema: 'backy.page-launch-readiness.v1'") &&
      source.includes('const selectedPageLaunchHandoff = useMemo(() => {') &&
      source.includes('selectedPageLaunchHandoffText') &&
      source.includes('data-testid="pages-selected-launch-handoff"') &&
      source.includes("copyPageApiText(selectedPageLaunchHandoffText, 'Selected page launch readiness handoff')") &&
      source.includes('pageTemplateInfo(apiPage)') &&
      source.includes('deliveryHealthMap[apiPage.id]') &&
      source.includes('deliveryHealthHistoryMap[apiPage.id]') &&
      source.includes('revisionSummaryMap[apiPage.id]') &&
      source.includes('adminReadinessUrl') &&
      source.includes('renderApi: renderUrl') &&
      source.includes('resolveApi: resolveUrl') &&
      source.includes('createRoute: buildBackyCanvasPageCreateRoute()') &&
      source.includes('selectedPageLaunchReadiness: selectedPageLaunchHandoff'),
    'Pages list must expose a selected page launch/readiness handoff with template provenance, revision, delivery health, focused creation route, and frontend API endpoints.',
  );
  assert(
      source.includes("key: 'member-login'") &&
      source.includes("key: 'member-account'") &&
      source.includes('data-testid={`pages-create-${shortcut.key}`}') &&
      source.includes("key: 'landing'") &&
      source.includes('landingPageTemplate') &&
      source.includes("key: 'storefront'") &&
      source.includes('storefrontPageTemplate') &&
      source.includes("key: 'contact'") &&
      source.includes('contactPageTemplate') &&
      source.includes("key: 'newsletter'") &&
      source.includes('newsletterPageTemplate') &&
      source.includes("key: 'survey'") &&
      source.includes('surveyPageTemplate') &&
      source.includes('memberLoginPageTemplate') &&
      source.includes('memberAccountPageTemplate') &&
      source.includes("key: 'product-detail'") &&
      source.includes('productDetailPageTemplate') &&
      source.includes("key: 'pricing'") &&
      source.includes('pricingPageTemplate') &&
      source.includes("key: 'services'") &&
      source.includes('servicesPageTemplate') &&
      source.includes("key: 'booking'") &&
      source.includes('bookingPageTemplate') &&
      source.includes("key: 'portfolio'") &&
      source.includes('portfolioPageTemplate') &&
      source.includes("key: 'gallery'") &&
      source.includes('galleryPageTemplate') &&
      source.includes("key: 'events'") &&
      source.includes('eventsPageTemplate') &&
      source.includes("key: 'privacy'") &&
      source.includes('privacyPageTemplate') &&
      source.includes("key: 'terms'") &&
      source.includes('termsPageTemplate') &&
      source.includes("key: 'cookie-policy'") &&
      source.includes('cookiePolicyPageTemplate') &&
      source.includes("key: 'accessibility-statement'") &&
      source.includes('accessibilityStatementPageTemplate') &&
      source.includes("key: 'refund-policy'") &&
      source.includes('refundPolicyPageTemplate') &&
      source.includes("key: 'shipping-policy'") &&
      source.includes('shippingPolicyPageTemplate') &&
      source.includes("key: 'cart'") &&
      source.includes('cartPageTemplate') &&
      source.includes("key: 'checkout'") &&
      source.includes('checkoutPageTemplate') &&
      source.includes("key: 'order-confirmation'") &&
      source.includes('orderConfirmationPageTemplate') &&
      source.includes("key: 'help-center'") &&
      source.includes('helpCenterPageTemplate') &&
      source.includes("key: 'faq'") &&
      source.includes('faqPageTemplate') &&
      source.includes("key: 'testimonials'") &&
      source.includes('testimonialsPageTemplate') &&
      source.includes("key: 'blog-index'") &&
      source.includes('blogIndexPageTemplate') &&
      source.includes("key: 'blog-post'") &&
      source.includes('blogPostPageTemplate') &&
      source.includes("key: 'team'") &&
      source.includes('teamPageTemplate') &&
      source.includes("key: 'careers'") &&
      source.includes('careersPageTemplate') &&
      source.includes("key: 'about'") &&
      source.includes('aboutPageTemplate') &&
      source.includes("blankPageTemplate: buildBackyCanvasPageCreateRoute()") &&
      source.includes("landingPageTemplate: buildBackyCanvasPageCreateRoute('landing')") &&
      source.includes("contactPageTemplate: buildBackyCanvasPageCreateRoute('contact')") &&
      source.includes("blogIndexPageTemplate: buildBackyCanvasPageCreateRoute('blog-index')") &&
      source.includes("blank: buildBackyCanvasPageCreateRoute()") &&
      source.includes("landing: buildBackyCanvasPageCreateRoute('landing')") &&
      source.includes("contact: buildBackyCanvasPageCreateRoute('contact')") &&
      source.includes("blogIndex: buildBackyCanvasPageCreateRoute('blog-index')") &&
      source.includes('templateSource=backy-canvas, and focus=canvas'),
    'Pages list must expose the landing, contact, member, newsletter, survey, commerce, pricing, services, booking, portfolio, gallery, events, privacy, terms, cookie policy, accessibility statement, refund policy, shipping policy, help-center, FAQ, testimonials, blog, team, careers, and about starters with focused Backy-canvas handoff routes',
  );
};

const assertSharedDataGridSourceContract = () => {
  const source = fs.readFileSync(new URL('../src/components/ui/DataGrid.tsx', import.meta.url), 'utf8');
  const hookSource = fs.readFileSync(new URL('../src/hooks/useDataTable.ts', import.meta.url), 'utf8');
  const smokeSource = fs.readFileSync(new URL(import.meta.url), 'utf8');
  assert(
    source.includes("import { useId } from 'react';") &&
      source.includes('className="min-w-0 max-w-full space-y-3 overflow-x-clip"') &&
      source.includes("data-overflow-containment=\"inline-size\"") &&
      source.includes("contain: 'layout paint inline-size'") &&
      source.includes("maxInlineSize: 'min(100%, calc(100vw - 8rem))'") &&
      source.includes("maxInlineSize: '100%'") &&
      source.includes('data-testid="admin-data-grid-scroll"') &&
      source.includes('className="w-full table-fixed text-left text-sm"') &&
      source.includes('data-layout-policy="viewport-contained-wrapped-table"') &&
      source.includes("'min-w-0 overflow-hidden whitespace-normal break-words px-4 py-4 align-top [overflow-wrap:anywhere]'") &&
      source.includes('data-cell-overflow-policy="clip-and-wrap"') &&
      source.includes('data-testid="admin-data-grid-cell-content"') &&
      source.includes('data-cell-content-policy="constrained-wrapped-content"') &&
      source.includes('data-testid="admin-data-grid"') &&
      source.includes('data-testid="admin-data-grid-loading"') &&
      source.includes('data-testid="admin-data-grid-empty"') &&
      source.includes('data-testid="admin-data-grid-summary"') &&
      source.includes('data-testid="admin-data-grid-body"') &&
      source.includes('data-testid="admin-data-grid-row"') &&
      source.includes('data-row-id={item.id}'),
    'Shared admin DataGrid must expose stable loading/empty/body/row state for list QA and custom admin clients.',
  );
  assert(
    hookSource.includes('width?: string;') &&
      source.includes('tableMinWidth?: string;') &&
      source.includes('style={tableMinWidth ? { minInlineSize: tableMinWidth } : undefined}') &&
      source.includes('data-table-min-width={tableMinWidth || undefined}') &&
      source.includes('data-testid="admin-data-grid-column-widths"') &&
      source.includes('data-column-width={column.width || undefined}'),
    'Shared admin DataGrid must support explicit table and column widths so dense admin lists scroll instead of overlapping content.',
  );
  assert(
    source.includes('const getColumnKey = (column: Column<T>) => String(column.key);') &&
      source.includes('const getColumnLabel = (column: Column<T>) => {') &&
      source.includes("return getColumnKey(column) === 'actions' ? 'Actions' : 'Column';") &&
      source.includes('const getColumnHeaderId = (column: Column<T>) => `${descriptionId}-header-${getSafeColumnKey(getColumnKey(column))}`;') &&
      source.includes('scope="col"') &&
      source.includes('aria-label={columnLabel}') &&
      source.includes('id={columnHeaderId}') &&
      source.includes('data-column-label={columnLabel}') &&
      source.includes('col.label.trim() ? col.label : <span className="sr-only">{columnLabel}</span>') &&
      source.includes('headers={getColumnHeaderId(col)}') &&
      smokeSource.includes('BACKY_PAGES_LIST_DATAGRID_HEADER_SMOKE') &&
      smokeSource.includes('assertPagesDataGridHeaderSemantics') &&
      smokeSource.includes('runPagesDataGridHeaderSmoke'),
    'Shared admin DataGrid must associate body cells with named column headers, including blank action columns.',
  );
  assert(
    source.includes('const canSortColumn = Boolean(onSort) && !interactionDisabled;') &&
      source.includes('const activeDirection = isSorted ? sortConfig?.direction ?? \'asc\' : null;') &&
      source.includes('const nextSortDirection = activeDirection === \'asc\' ? \'desc\' : \'asc\';') &&
      source.includes('const sortDisabledReason = !onSort') &&
      source.includes('const sortStatusId = `${descriptionId}-sort-status-${getSafeColumnKey(columnKey)}`;') &&
      source.includes('const SortIcon = activeDirection === \'asc\'') &&
      source.includes('disabled={!canSortColumn}') &&
      source.includes('aria-disabled={!canSortColumn}') &&
      source.includes('aria-label={sortAriaLabel}') &&
      source.includes('aria-describedby={sortStatusId}') &&
      source.includes('data-testid={`admin-data-grid-sort-${columnKey}`}') &&
      source.includes('data-sort-active={isSorted ? \'true\' : \'false\'}') &&
      source.includes('data-sort-state={sortDirection}') &&
      source.includes('data-sort-next-direction={nextSortDirection}') &&
      source.includes('data-sort-icon-direction={activeDirection ?? \'unsorted\'}') &&
      source.includes('data-sort-disabled-reason={sortDisabledReason}') &&
      source.includes('data-testid={`admin-data-grid-sort-status-${columnKey}`}') &&
      smokeSource.includes('BACKY_PAGES_LIST_DATAGRID_SORT_SMOKE') &&
      smokeSource.includes('assertPagesDataGridSortControls') &&
      smokeSource.includes('runPagesDataGridSortSmoke'),
    'Shared admin DataGrid sortable headers must expose active/next direction, unavailable-state reasons, visual direction, and a rendered sort smoke.',
  );
  assert(
    source.includes('const safeTotalPages = Math.max(1, totalPages);') &&
      source.includes('const safeCurrentPage = Math.min(Math.max(currentPage, 1), safeTotalPages);') &&
      source.includes('const paginationStatusId = useId();') &&
      source.includes('const previousPage = Math.max(1, safeCurrentPage - 1);') &&
      source.includes('const nextPage = Math.min(safeTotalPages, safeCurrentPage + 1);') &&
      source.includes('const previousPageLabel = safeCurrentPage === 1') &&
      source.includes('const nextPageLabel = safeCurrentPage === safeTotalPages') &&
      source.includes('data-testid="admin-data-grid-pagination"') &&
      source.includes('aria-describedby={paginationStatusId}') &&
      source.includes('data-testid="admin-data-grid-pagination-summary"') &&
      source.includes('aria-live="polite"') &&
      source.includes('data-testid="admin-data-grid-page-indicator"') &&
      source.includes('aria-current="page"') &&
      source.includes('data-testid="admin-data-grid-previous-page"') &&
      source.includes('aria-label={previousPageLabel}') &&
      source.includes('data-target-page={previousPage}') &&
      source.includes('data-testid="admin-data-grid-next-page"') &&
      source.includes('aria-label={nextPageLabel}') &&
      source.includes('data-target-page={nextPage}') &&
      smokeSource.includes('BACKY_PAGES_LIST_DATAGRID_PAGINATION_SMOKE') &&
      smokeSource.includes('assertPagesDataGridPaginationControls') &&
      smokeSource.includes('runPagesDataGridPaginationSmoke'),
    'Shared admin DataGrid pagination must clamp stale page inputs and expose stable, context-aware previous/next state.',
  );
};

const requestApi = async (endpoint, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (endpoint.startsWith('/api/admin/') && apiAdminSessionToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiAdminSessionToken}`);
  }

  const response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 300)}`);
  }

  return payload;
};

const requestApiRaw = async (endpoint, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (endpoint.startsWith('/api/admin/') && apiAdminSessionToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiAdminSessionToken}`);
  }

  const response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const getSite = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${encodeURIComponent(siteId)}`);
  return payload.data?.site || payload.site;
};

const updateSite = async (siteId, input) => {
  const payload = await requestApi(`/api/admin/sites/${encodeURIComponent(siteId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.site || payload.site;
};

const listPages = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${encodeURIComponent(siteId)}/pages?includeUnpublished=true`);
  return payload.data?.pages || payload.pages || [];
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

const loginAdminApi = async () => {
  const login = (twoFactorCode) => fetchWithTimeout(`${API_BASE_URL}/api/admin/auth/login`, {
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
  const smokeMfaCode = process.env.BACKY_PAGES_LIST_SMOKE_MFA_CODE
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
  assert(user?.id, `Create pages RBAC user did not return a user: ${JSON.stringify(payload).slice(0, 500)}`);
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

const assertPageBillingLimitEnforced = async (suffix) => {
  const site = await getSite(HIERARCHY_SITE_ID);
  const settings = await getSettings();
  const existingPages = await listPages(HIERARCHY_SITE_ID);
  const originalSettings = site.settings || {};
  const originalBillingQuota = originalSettings.billingQuota || {};
  const originalLimits = originalBillingQuota.limits || {};
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const blockedSlug = `blocked-page-limit-${suffix}`;

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        overageMode: 'block',
      },
    },
  });
  await updateSite(HIERARCHY_SITE_ID, {
    settings: {
      ...originalSettings,
      billingQuota: {
        ...originalBillingQuota,
        limits: {
          ...originalLimits,
          pages: existingPages.length,
        },
      },
    },
  });

  try {
    const { response, payload } = await requestApiRaw(`/api/admin/sites/${encodeURIComponent(HIERARCHY_SITE_ID)}/pages`, {
      method: 'POST',
      body: JSON.stringify({
        title: `Blocked Page Limit ${suffix}`,
        slug: blockedSlug,
        status: 'draft',
        description: 'Temporary page that should be blocked by billing quota.',
        content: [],
      }),
    });

    assert(response.status === 402, `Billing page limit should reject page creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'BILLING_PAGE_LIMIT', `Billing page limit should return BILLING_PAGE_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`);
    const afterPages = await listPages(HIERARCHY_SITE_ID);
    assert(!afterPages.some((page) => page.slug === blockedSlug), 'Billing-limited page creation unexpectedly persisted a page.');
  } finally {
    await updateSite(HIERARCHY_SITE_ID, { settings: originalSettings });
    await updateSettings({ integrations: originalIntegrations });
  }
};

const temporarilyAllowPagesListSeedQuota = async (extraPages = 4) => {
  const site = await getSite(HIERARCHY_SITE_ID);
  const settings = await getSettings();
  const existingPages = await listPages(HIERARCHY_SITE_ID);
  const originalSettings = site.settings || {};
  const originalBillingQuota = originalSettings.billingQuota || {};
  const originalLimits = originalBillingQuota.limits || {};
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const currentPageLimit = Number(originalLimits.pages || 0);
  const nextPageLimit = Math.max(currentPageLimit, existingPages.length + extraPages);

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        overageMode: 'allow',
      },
    },
  });
  await updateSite(HIERARCHY_SITE_ID, {
    settings: {
      ...originalSettings,
      billingQuota: {
        ...originalBillingQuota,
        limits: {
          ...originalLimits,
          pages: nextPageLimit,
        },
      },
    },
  });

  return {
    siteSettings: originalSettings,
    integrations: originalIntegrations,
  };
};

const restorePagesListSeedQuota = async (restoreState) => {
  if (!restoreState) return;
  await updateSite(HIERARCHY_SITE_ID, { settings: restoreState.siteSettings });
  await updateSettings({ integrations: restoreState.integrations });
};

const deleteUser = async (userId) => {
  if (!userId) return;
  await requestApi(`/api/admin/users/${userId}`, { method: 'DELETE' });
};

const createHierarchyPages = async () => {
  const suffix = Date.now().toString(36);
  const parentTitle = `Smoke Hierarchy Parent ${suffix}`;
  const childTitle = `Smoke Hierarchy Child ${suffix}`;
  const parentSlug = `smoke-hierarchy-parent-${suffix}`;
  const childSlug = `smoke-hierarchy-child-${suffix}`;
  const parentPayload = await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: parentTitle,
      slug: parentSlug,
      status: 'published',
      description: 'Temporary parent page for pages list hierarchy smoke.',
      content: [],
      meta: {
        title: parentTitle,
        description: 'Temporary parent page for pages list hierarchy smoke.',
        canonical: `/${parentSlug}`,
        template: 'landing',
      },
    }),
  });
  const parentPage = parentPayload.data.page;
  const childPayload = await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: childTitle,
      slug: childSlug,
      status: 'draft',
      parentId: parentPage.id,
      description: 'Temporary child page for pages list hierarchy smoke.',
      content: [],
      meta: {
        title: childTitle,
        description: 'Temporary child page for pages list hierarchy smoke.',
        canonical: `/${childSlug}`,
        parentPageId: parentPage.id,
        parentPageTitle: parentPage.title,
        navigationPlacement: 'primary',
        navigationLabel: 'Smoke Child Link',
        template: 'about',
      },
    }),
  });
  await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${childPayload.data.page.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: childTitle,
      slug: childSlug,
      status: 'draft',
      description: 'Temporary child page with a saved revision for pages list smoke.',
      revisionNote: 'Pages list revision smoke snapshot',
    }),
  });

  return { parentPage, childPage: childPayload.data.page };
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

const removeDirectoryWithRetry = async (directory, attempts = 5) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === attempts - 1) {
        throw error;
      }
      await sleep(250 * (attempt + 1));
    }
  }
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

const authStorageScript = (sessionToken, user = { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' }) => `
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

const fetchDiagnosticsScript = `
window.__backyPagesListFetchLog = [];
if (!window.__backyOriginalFetchForPagesListDiagnostics) {
  window.__backyOriginalFetchForPagesListDiagnostics = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const input = args[0];
    const init = args[1] || {};
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = init.method || input?.method || 'GET';
    const startedAt = Date.now();
    const entry = { url, method, startedAt, status: 'pending' };
    window.__backyPagesListFetchLog.push(entry);
    try {
      const response = await window.__backyOriginalFetchForPagesListDiagnostics(...args);
      entry.status = response.status;
      entry.ok = response.ok;
      entry.durationMs = Date.now() - startedAt;
      return response;
    } catch (error) {
      entry.status = 'error';
      entry.error = error instanceof Error ? error.message : String(error);
      entry.durationMs = Date.now() - startedAt;
      throw error;
    }
  };
}
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

const captureScreenshot = async (client, screenshotPath) => {
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return screenshotPath;
};

const assertPagesVisualState = async (client, label, screenshotPath, options = {}) => {
  const state = await evaluate(client, `(() => {
    const expectedText = ${JSON.stringify(options.expectedText || '')};
    const bodyText = document.body?.innerText || '';
    const tableRows = Array.from(document.querySelectorAll('tbody tr'));
    const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
    const deliveryPanels = Array.from(document.querySelectorAll('[data-testid^="pages-delivery-"]'));
    const commandCenter = document.querySelector('[data-testid="pages-command-center"]');
    const bindingContract = document.querySelector('[data-testid="pages-binding-contract"]');
    const starterDrawer = document.querySelector('[data-testid="pages-starter-drawer"]');
    const apiDetails = document.querySelector('[data-testid="pages-api-details"]');
    const dataGrid = document.querySelector('[data-testid="admin-data-grid"]');
    const dataGridRows = Array.from(document.querySelectorAll('[data-testid="admin-data-grid-row"]'));
    const sortButtons = Array.from(document.querySelectorAll('[data-testid^="admin-data-grid-sort-"]'));
    const starterScrollRegion = document.querySelector('[data-testid="pages-starter-scroll-region"]');
    const starterDrawerOpen = starterDrawer instanceof HTMLDetailsElement ? starterDrawer.open : null;
    const apiDetailsOpen = apiDetails instanceof HTMLDetailsElement ? apiDetails.open : null;
    const commandRect = commandCenter?.getBoundingClientRect();
    const starterRect = starterScrollRegion?.getBoundingClientRect();
    const searchableText = [
      bodyText,
      modal?.textContent || '',
      ...tableRows.map((row) => row.textContent || ''),
      ...deliveryPanels.map((panel) => panel.textContent || ''),
      bindingContract?.textContent || '',
    ].join('\\n');
    const overflowingElements = Array.from(document.querySelectorAll('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          testId: element.getAttribute('data-testid') || '',
          className: typeof element.className === 'string' ? element.className : '',
          text: (element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      })
      .filter((element) => element.right > window.innerWidth + 4 || element.left < -4)
      .sort((a, b) => b.right - a.right)
      .slice(0, 10);
    return {
      label: ${JSON.stringify(label)},
      ready: Boolean(commandCenter),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      overflowingElements,
      commandCenterVisible: Boolean(commandRect && commandRect.width > 300 && commandRect.height > 120),
      tableRowCount: tableRows.length,
      emptyCreateVisible: Boolean(
        document.querySelector('[data-testid="pages-empty-create"]') ||
        document.querySelector('[data-testid="pages-create-blank"]')
      ),
      starterDrawerPresent: Boolean(starterDrawer),
      starterDrawerOpen,
      starterCatalogVisible: Boolean(starterDrawerOpen && starterRect && starterRect.width > 320 && starterRect.height > 120),
      apiDetailsPresent: Boolean(apiDetails),
      apiDetailsOpen,
      dataGrid: dataGrid ? {
        exists: true,
        rowCount: Number(dataGrid.getAttribute('data-row-count') || 0),
        totalItems: Number(dataGrid.getAttribute('data-total-items') || 0),
        currentPage: Number(dataGrid.getAttribute('data-current-page') || 0),
        totalPages: Number(dataGrid.getAttribute('data-total-pages') || 0),
        interactionDisabled: dataGrid.getAttribute('data-interaction-disabled') || '',
        renderedRowCount: dataGridRows.length,
        rowsHaveIds: dataGridRows.every((row) => Boolean(row.getAttribute('data-row-id'))),
        sortCount: sortButtons.length,
        sortStates: sortButtons.map((button) => button.getAttribute('data-sort-state') || ''),
        sortableDisabled: sortButtons.some((button) => button.getAttribute('aria-disabled') === 'true'),
        summary: document.querySelector('[data-testid="admin-data-grid-summary"]')?.textContent || '',
      } : { exists: false },
      bindingContractVisible: Boolean(bindingContract) && bindingContract.textContent.includes('Page data-binding contract') && bindingContract.textContent.includes('Collection repeaters'),
      modalOpen: Boolean(modal),
      modalText: modal?.textContent || '',
      hasExpectedText: expectedText ? searchableText.includes(expectedText) : true,
      hasFrameworkOverlay: /Failed to compile|Unhandled Runtime Error|Vite Error|Internal Server Error/i.test(bodyText),
      body: bodyText.slice(0, 4000),
    };
  })()`);

  assert(state.ready && state.commandCenterVisible, `${label} pages command center was not visibly rendered: ${JSON.stringify(state)}`);
  assert(state.bindingContractVisible, `${label} did not render the page data-binding contract: ${JSON.stringify(state)}`);
  assert(state.starterDrawerPresent && state.starterDrawerOpen === false && !state.starterCatalogVisible, `${label} starter catalog should stay collapsed until requested: ${JSON.stringify(state)}`);
  assert(state.apiDetailsPresent && state.apiDetailsOpen === false, `${label} API/readiness details should stay collapsed until requested: ${JSON.stringify(state)}`);
  assert(state.horizontalOverflow <= 4, `${label} has horizontal overflow: ${JSON.stringify(state)}`);
  assert(!state.hasFrameworkOverlay, `${label} rendered a framework/runtime overlay: ${JSON.stringify(state)}`);

  if (options.empty) {
    assert(state.emptyCreateVisible && state.body.includes('Create a page for this site') && state.body.includes('New Page'), `${label} did not render the empty state controls: ${JSON.stringify(state)}`);
  }

  if (options.table) {
    assert(state.tableRowCount >= 1 && state.body.includes('Page library'), `${label} did not render a populated page table: ${JSON.stringify(state)}`);
    assert(
      state.dataGrid?.exists &&
        state.dataGrid.rowCount === state.dataGrid.renderedRowCount &&
        state.dataGrid.rowCount >= 1 &&
        state.dataGrid.totalItems >= state.dataGrid.rowCount &&
        state.dataGrid.currentPage >= 1 &&
        state.dataGrid.totalPages >= 1 &&
        state.dataGrid.rowsHaveIds &&
        state.dataGrid.sortCount >= 1 &&
        state.dataGrid.sortStates.some((state) => state === 'asc' || state === 'desc' || state === 'none') &&
        state.dataGrid.sortableDisabled === false &&
        state.dataGrid.summary.includes('Showing'),
      `${label} shared DataGrid state was not inspectable or interactive: ${JSON.stringify(state.dataGrid)}`,
    );
  }

  if (options.expectedText) {
    assert(state.hasExpectedText, `${label} did not include expected text "${options.expectedText}": ${JSON.stringify(state)}`);
  }

  if (options.modal) {
    assert(state.modalOpen && state.modalText.includes('Publish 1 selected page?'), `${label} did not render the bulk publish modal: ${JSON.stringify(state)}`);
  }

  await captureScreenshot(client, screenshotPath);
  return { ...state, screenshotPath };
};

const waitForPagesEmptyState = async (client) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(EMPTY_SITE_ID)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const emptyCreate = document.querySelector('[data-testid="pages-empty-create"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        emptyCreate: Boolean(emptyCreate),
        emptyCreateTag: emptyCreate?.tagName || null,
        emptyCreateHref: emptyCreate?.getAttribute('href') || '',
        selectValue: document.querySelector('#pages-active-site')?.value || '',
        body: document.body?.innerText?.slice(0, 500) || '',
      };
    })()`);

    if (
      state.ready
      && !state.loading
      && state.emptyCreate
      && state.emptyCreateTag === 'A'
      && state.emptyCreateHref.includes('/pages/new')
      && state.emptyCreateHref.includes(`siteId=${encodeURIComponent(EMPTY_SITE_ID)}`)
      && state.selectValue === EMPTY_SITE_ID
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Pages empty state did not render expected create link: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const clickEmptyCreate = async (client, testId, expectedSearch, expectedCreate = {}) => {
  logProgress(`checking empty-create shortcut ${testId}`);
  await waitForPagesEmptyState(client);

  let clicked = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const link = document.querySelector('[data-testid="${testId}"]');
      const status = document.querySelector('[data-testid="pages-create-action-status"]');
      const shortcuts = Array.from(document.querySelectorAll('a[data-testid^="pages-create-"]')).map((node) => ({
        id: node.getAttribute('data-testid') || '',
        tag: node.tagName,
        href: node.getAttribute('href') || '',
      }));
      if (!(link instanceof HTMLAnchorElement)) {
        return {
          clicked: false,
          tag: link?.tagName || null,
          href: link?.getAttribute('href') || null,
          path: window.location.pathname,
          search: window.location.search,
          ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
          loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
          shortcuts,
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
        actionState.statusId !== 'pages-create-action-status' ||
        actionState.describedBy !== actionState.statusId ||
        actionState.statusText !== actionState.dataStatus ||
        !actionState.statusText.includes('New page available') ||
        actionState.dataState !== 'ready' ||
        actionState.disabledReason !== '' ||
        actionState.targetSiteId !== ${JSON.stringify(EMPTY_SITE_ID)} ||
        actionState.ariaDisabled === 'true'
      ) {
        return { clicked: false, reason: 'create-action-status', actionState, href: link.href, ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')) };
      }
      link.scrollIntoView({ block: 'center', inline: 'center' });
      link.click();
      return { clicked: true, href: link.href, shortcuts, actionState };
    })()`);
    if (clicked.clicked) {
      break;
    }
    await sleep(250);
  }
  assert(clicked.clicked, `Unable to click ${testId}: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      ready: Boolean(document.querySelector('[data-testid="page-creation-command-center"]')),
      targetSite: document.querySelector('#page-target-site')?.value || '',
      title: document.querySelector('#page-title')?.value || '',
      slug: document.querySelector('#page-slug')?.value || '',
      template: document.querySelector('input[name="template"]:checked')?.value || '',
      homepage: document.querySelector('#page-basics input[type="checkbox"]')?.checked ?? false,
      createButton: Boolean(document.querySelector('[data-testid="page-create-submit-button"]')),
      createDisabled: document.querySelector('[data-testid="page-create-submit-button"]')?.disabled ?? null,
      createState: document.querySelector('[data-testid="page-create-submit-button"]')?.getAttribute('data-state') || '',
      createText: document.querySelector('[data-testid="page-create-submit-button"]')?.textContent || '',
      body: document.body?.innerText?.slice(0, 300) || '',
    }))()`);

    if (
      state.path === '/pages/new'
      && state.search.includes(`siteId=${encodeURIComponent(EMPTY_SITE_ID)}`)
      && expectedSearch.every((fragment) => state.search.includes(fragment))
      && state.ready
      && state.targetSite === EMPTY_SITE_ID
      && (!expectedCreate.title || state.title === expectedCreate.title)
      && (!expectedCreate.slug || state.slug === expectedCreate.slug)
      && (!expectedCreate.template || state.template === expectedCreate.template)
      && (typeof expectedCreate.homepage !== 'boolean' || state.homepage === expectedCreate.homepage)
      && state.createButton
      && (expectedCreate.allowDisabled === true || state.createDisabled === false)
    ) {
      logProgress(`verified empty-create shortcut ${testId}`);
      return { clicked, state };
    }

    if (attempt === 79) {
      throw new Error(`${testId} did not navigate to a usable page create workspace: ${JSON.stringify({ state, expectedCreate })}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForHierarchyRow = async (client, page, expectedText, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const hierarchy = document.querySelector('[data-testid="pages-hierarchy-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        refreshing: document.body?.innerText?.includes('Refreshing pages from backend.') || false,
        selectValue: document.querySelector('#pages-active-site')?.value || '',
        hierarchyText: hierarchy?.textContent || '',
        fetchLog: (window.__backyPagesListFetchLog || [])
          .filter((entry) => entry.url.includes('/revisions') || entry.url.includes('/api/admin/sites/') && entry.url.includes('/pages'))
          .slice(-20),
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (
      state.ready
      && !state.loading
      && state.hierarchyText.includes(expectedText)
    ) {
      return { url, state };
    }

    if (attempt === 179) {
      throw new Error(`Hierarchy row did not render expected text "${expectedText}": ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForTemplateRow = async (client, page, expectedText, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const template = document.querySelector('[data-testid="pages-template-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        templateText: template?.textContent || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (
      state.ready
      && !state.loading
      && state.templateText.includes(expectedText)
    ) {
      return { url, state };
    }

    if (attempt === 179) {
      throw new Error(`Template row did not render expected text "${expectedText}": ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForRevisionRow = async (client, page, expectedText, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const revisions = document.querySelector('[data-testid="pages-revisions-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        revisionsText: revisions?.textContent || '',
        fetchLog: (window.__backyPagesListFetchLog || [])
          .filter((entry) => entry.url.includes('/revisions') || (entry.url.includes('/api/admin/sites/') && entry.url.includes('/pages')))
          .slice(-20),
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (
      state.ready
      && !state.loading
      && state.revisionsText.includes(expectedText)
    ) {
      return { url, state };
    }

    if (attempt === 179) {
      throw new Error(`Revision row did not render expected text "${expectedText}": ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForRouteRow = async (client, page, expectedText, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const route = document.querySelector('[data-testid="pages-route-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        routeText: route?.textContent || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (
      state.ready
      && !state.loading
      && state.routeText.includes(expectedText)
    ) {
      return { url, state };
    }

    if (attempt === 179) {
      throw new Error(`Route row did not render expected text "${expectedText}": ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForDeliveryRow = async (client, page, expectedText, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const delivery = document.querySelector('[data-testid="pages-delivery-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        deliveryText: delivery?.textContent || '',
        renderLink: delivery?.querySelector('a[href*="/render?path="]')?.getAttribute('href') || '',
        resolveLink: delivery?.querySelector('a[href*="/resolve?path="]')?.getAttribute('href') || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (
      state.ready
      && !state.loading
      && state.deliveryText.includes(expectedText)
      && state.renderLink.includes('/api/sites/')
      && state.resolveLink.includes('/api/sites/')
    ) {
      return { url, state };
    }

    if (attempt === 179) {
      throw new Error(`Delivery row did not render expected text "${expectedText}": ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertDeliveryRefreshControl = async (client, page, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const globalRefresh = document.querySelector('[data-testid="pages-refresh-delivery-health"]');
      const rowRefresh = document.querySelector('[data-testid="pages-delivery-refresh-${page.id}"]');
      const delivery = document.querySelector('[data-testid="pages-delivery-${page.id}"]');
      const history = document.querySelector('[data-testid="pages-delivery-history-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        globalRefresh: Boolean(globalRefresh),
        globalDisabled: globalRefresh?.disabled === true,
        rowRefresh: Boolean(rowRefresh),
        rowDisabled: rowRefresh?.disabled === true,
        deliveryText: delivery?.textContent || '',
        historyText: history?.textContent || '',
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (
      state.ready
      && state.globalRefresh
      && state.rowRefresh
      && !state.rowDisabled
      && state.deliveryText.includes('Health')
    ) {
      const clicked = await evaluate(client, `(() => {
        const rowRefresh = document.querySelector('[data-testid="pages-delivery-refresh-${page.id}"]');
        rowRefresh?.click();
        return { clicked: Boolean(rowRefresh) };
      })()`);
      assert(clicked.clicked, `Unable to click delivery refresh: ${JSON.stringify(clicked)}`);

      let lastRefreshState = null;
      for (let refreshAttempt = 0; refreshAttempt < 100; refreshAttempt += 1) {
        const refreshed = await evaluate(client, `(() => {
          const rowRefresh = document.querySelector('[data-testid="pages-delivery-refresh-${page.id}"]');
          const delivery = document.querySelector('[data-testid="pages-delivery-${page.id}"]');
          const history = document.querySelector('[data-testid="pages-delivery-history-${page.id}"]');
          return {
            rowDisabled: rowRefresh?.disabled === true,
            deliveryText: delivery?.textContent || '',
            historyText: history?.textContent || '',
          };
        })()`);
        lastRefreshState = refreshed;

        if (
          !refreshed.rowDisabled
          && refreshed.deliveryText.includes('Health')
          && refreshed.deliveryText.includes('Recent probes')
          && refreshed.historyText.includes('public')
          && refreshed.historyText.includes('render')
          && refreshed.historyText.includes('resolve')
          && !refreshed.deliveryText.includes('Refreshing public, render, and resolve endpoint health.')
        ) {
          return { url, state, clicked, refreshed };
        }

        await sleep(250);
      }

      throw new Error(`Delivery refresh control did not finish refreshing: ${JSON.stringify(lastRefreshState)}`);
    }

    if (attempt === 99) {
      throw new Error(`Delivery refresh controls did not render: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertPublishReviewModal = async (client, page, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="pages-publish-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        hasButton: Boolean(button),
        disabled: button?.disabled === true,
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (state.ready && state.hasButton && !state.disabled) {
      break;
    }

    if (attempt === 99) {
      throw new Error(`Publish button was not ready for review modal: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  const opened = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="pages-publish-${page.id}"]');
    button?.click();
    const modal = document.querySelector('[data-testid="pages-publish-modal"]');
    return {
      clicked: Boolean(button),
      modalText: modal?.textContent || '',
      confirm: Boolean(document.querySelector('[data-testid="pages-publish-confirm"]')),
      cancel: Boolean(document.querySelector('[data-testid="pages-publish-cancel"]')),
    };
  })()`);

  assert(opened.clicked, `Unable to click publish button: ${JSON.stringify(opened)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const modal = document.querySelector('[data-testid="pages-publish-modal"]');
      return {
        modalText: modal?.textContent || '',
        confirm: Boolean(document.querySelector('[data-testid="pages-publish-confirm"]')),
        cancel: Boolean(document.querySelector('[data-testid="pages-publish-cancel"]')),
      };
    })()`);

    if (
      state.modalText.includes(`Publish ${page.title}?`)
      && state.modalText.includes('Render API')
      && state.modalText.includes('Resolve API')
      && state.confirm
      && state.cancel
    ) {
      await evaluate(client, `(() => {
        document.querySelector('[data-testid="pages-publish-cancel"]')?.click();
      })()`);
      for (let cancelAttempt = 0; cancelAttempt < 40; cancelAttempt += 1) {
        const cancelled = await evaluate(client, `(() => !document.querySelector('[data-testid="pages-publish-modal"]'))()`);
        if (cancelled) {
          return { url, opened, state, cancelled };
        }
        await sleep(100);
      }

      throw new Error('Publish review modal did not close after cancel.');
    }

    if (attempt === 79) {
      throw new Error(`Publish review modal did not render expected details: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const clearVisibleBulkSelection = async (client) => evaluate(client, `(() => {
  const setSelectValue = (select, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    descriptor?.set?.call(select, value);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')]
    .filter((input) => input.getAttribute('aria-label')?.startsWith('Select '));
  checkboxes.forEach((checkbox) => {
    if (checkbox.checked) {
      checkbox.click();
    }
  });

  const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
  if (select) {
    setSelectValue(select, '');
  }

  return {
    clearedVisible: checkboxes.length,
    selectedVisible: checkboxes.filter((checkbox) => checkbox.checked).length,
    selectValue: select?.value || '',
  };
})()`);

const assertBulkPublishReviewModal = async (client, page, expectedSearch = page.title, screenshotPath = null) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const checkbox = document.querySelector('[data-testid="pages-select-${page.id}"]');
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        checkbox: Boolean(checkbox),
        checked: checkbox?.checked === true,
        checkboxDisabled: checkbox?.disabled === true,
        select: Boolean(select),
        selectDisabled: select?.disabled === true,
        rowText: row?.textContent || '',
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (
      state.ready &&
      state.checkbox &&
      !state.checkboxDisabled &&
      state.select &&
      !state.selectDisabled &&
      state.rowText.includes(page.title)
    ) {
      break;
    }

    if (attempt === 99) {
      throw new Error(`Bulk publish controls were not ready: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  await clearVisibleBulkSelection(client);

  let prepared = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    prepared = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const checkbox = document.querySelector('[data-testid="pages-select-${page.id}"]');
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      if (checkbox instanceof HTMLInputElement && !checkbox.checked && !checkbox.disabled) {
        checkbox.click();
      }
      if (select instanceof HTMLSelectElement && select.value !== 'publish' && !select.disabled) {
        setSelectValue(select, 'publish');
      }

      return {
        prepared: Boolean(checkbox && select),
        checked: checkbox instanceof HTMLInputElement ? checkbox.checked : false,
        checkboxDisabled: checkbox instanceof HTMLInputElement ? checkbox.disabled : null,
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        selectDisabled: select instanceof HTMLSelectElement ? select.disabled : null,
        applyText: document.querySelector('[data-testid="pages-bulk-action-apply"]')?.textContent || '',
        selectedText: document.body?.innerText?.match(/\\d+ selected/)?.[0] || '',
        rowText: row?.textContent || '',
      };
    })()`);
    if (prepared.prepared && prepared.checked && prepared.selectValue === 'publish' && prepared.rowText.includes(page.title)) {
      break;
    }
    await sleep(250);
  }

  assert(prepared?.prepared && prepared.checked && prepared.selectValue === 'publish', `Unable to prepare bulk publish controls: ${JSON.stringify(prepared)}`);

  let openedState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const opened = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
      const applyButton = modal ? null : document.querySelector('[data-testid="pages-bulk-action-apply"]');
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      if (!modal && select instanceof HTMLSelectElement && select.value !== 'publish') {
        setSelectValue(select, 'publish');
      }
      if (!modal && applyButton && !applyButton.disabled) {
        applyButton.click();
      }
      return {
        hasButton: Boolean(applyButton || modal),
        disabled: applyButton?.disabled === true,
        buttonText: applyButton?.textContent || '',
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        modalText: modal?.textContent || document.querySelector('[data-testid="pages-bulk-publish-modal"]')?.textContent || '',
      };
    })()`);

    if (opened.hasButton && !opened.disabled) {
      openedState = opened;
      break;
    }

    if (attempt === 79) {
      throw new Error(`Bulk publish apply button was not ready: ${JSON.stringify(opened)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
      return {
        modalText: modal?.textContent || '',
        cancel: [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Cancel'),
        confirm: [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Publish 1 page')),
      };
    })()`);

    if (
      state.modalText.includes('Publish 1 selected page?')
      && state.modalText.includes(page.title)
      && state.cancel
      && state.confirm
    ) {
      const visualState = screenshotPath
        ? await assertPagesVisualState(client, 'bulk publish review modal', screenshotPath, {
          modal: true,
          expectedText: page.title,
        })
        : null;
      await evaluate(client, `(() => {
        [...document.querySelectorAll('button')]
          .find((button) => button.textContent.trim() === 'Cancel')
          ?.click();
      })()`);
      for (let cancelAttempt = 0; cancelAttempt < 40; cancelAttempt += 1) {
        const cancelled = await evaluate(client, `(() => !document.querySelector('[data-testid="pages-bulk-publish-modal"]'))()`);
        if (cancelled) {
          const cleared = await clearVisibleBulkSelection(client);
          return { url, prepared, opened: openedState, state, visualState, cleared };
        }
        await sleep(100);
      }

      throw new Error('Bulk publish review modal did not close after cancel.');
    }

    if (attempt === 79) {
      throw new Error(`Bulk publish review modal did not render expected details: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertBulkPublishMutation = async (client, page, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  const beforePage = await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${page.id}`);
  const expectedUpdatedAt = beforePage.data?.page?.updatedAt;
  assert(expectedUpdatedAt, `Bulk publish page did not expose updatedAt before mutation: ${JSON.stringify(beforePage.data?.page).slice(0, 500)}`);
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const checkbox = document.querySelector('[data-testid="pages-select-${page.id}"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        checkbox: Boolean(checkbox),
        checkboxDisabled: checkbox?.disabled === true,
        rowText: row?.textContent || '',
        select: Boolean(select),
        selectDisabled: select?.disabled === true,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (
      state.ready
      && state.checkbox
      && !state.checkboxDisabled
      && state.select
      && !state.selectDisabled
      && state.rowText.includes('Draft')
    ) {
      break;
    }

    if (attempt === 99) {
      throw new Error(`Bulk publish mutation controls were not ready for draft page: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  await clearVisibleBulkSelection(client);

  let prepared = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    prepared = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const checkbox = document.querySelector('[data-testid="pages-select-${page.id}"]');
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      if (checkbox instanceof HTMLInputElement && !checkbox.checked && !checkbox.disabled) {
        checkbox.click();
      }
      if (select instanceof HTMLSelectElement && select.value !== 'publish' && !select.disabled) {
        setSelectValue(select, 'publish');
      }

      return {
        prepared: Boolean(checkbox && select),
        checked: checkbox instanceof HTMLInputElement ? checkbox.checked : false,
        checkboxDisabled: checkbox instanceof HTMLInputElement ? checkbox.disabled : null,
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        selectDisabled: select instanceof HTMLSelectElement ? select.disabled : null,
        applyText: document.querySelector('[data-testid="pages-bulk-action-apply"]')?.textContent || '',
        selectedText: document.body?.innerText?.match(/\\d+ selected/)?.[0] || '',
        rowText: row?.textContent || '',
      };
    })()`);
    if (prepared.prepared && prepared.checked && prepared.selectValue === 'publish' && prepared.rowText.includes(page.title)) {
      break;
    }
    await sleep(250);
  }
  assert(prepared?.prepared && prepared.checked && prepared.selectValue === 'publish', `Unable to prepare bulk publish mutation controls: ${JSON.stringify(prepared)}`);

  const captureInstalled = await evaluate(client, `(() => {
    window.__backyPagesListPublishBodies = [];
    if (!window.__backyOriginalFetchForPagesListPublish) {
      window.__backyOriginalFetchForPagesListPublish = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(input instanceof Request ? input.url : input || '');
        const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'POST' && url.includes(${JSON.stringify(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${page.id}/publish`)})) {
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
          window.__backyPagesListPublishBodies.push({ url, method, body: parsed });
        }
        return window.__backyOriginalFetchForPagesListPublish(input, init);
      };
    }
    return true;
  })()`);
  assert(captureInstalled, 'Unable to install pages list publish request capture');

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const opened = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
      const applyButton = modal ? null : document.querySelector('[data-testid="pages-bulk-action-apply"]');
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      if (!modal && select instanceof HTMLSelectElement && select.value !== 'publish') {
        setSelectValue(select, 'publish');
      }
      if (!modal && applyButton && !applyButton.disabled) {
        applyButton.click();
      }
      return {
        hasButton: Boolean(applyButton || modal),
        disabled: applyButton?.disabled === true,
        buttonText: applyButton?.textContent || '',
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        modalText: modal?.textContent || document.querySelector('[data-testid="pages-bulk-publish-modal"]')?.textContent || '',
      };
    })()`);

    if (opened.modalText.includes('Publish 1 selected page?') && opened.modalText.includes(page.title)) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Bulk publish mutation modal did not open: ${JSON.stringify(opened)}`);
    }

    await sleep(250);
  }

  const confirmed = await evaluate(client, `(() => {
    const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent.includes('Publish 1 page'));
    if (button && !button.disabled) {
      button.click();
    }
    return {
      modalText: modal?.textContent || '',
      clicked: Boolean(button),
      disabled: button?.disabled === true,
    };
  })()`);
  assert(confirmed.clicked && !confirmed.disabled, `Unable to confirm bulk publish mutation: ${JSON.stringify(confirmed)}`);

  let uiState = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    uiState = await evaluate(client, `(() => {
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      return {
        modalOpen: Boolean(document.querySelector('[data-testid="pages-bulk-publish-modal"]')),
        notice: document.body?.innerText?.includes('1 page published.') || false,
        rowText: row?.textContent || '',
        modalText: document.querySelector('[data-testid="pages-bulk-publish-modal"]')?.textContent || '',
        errorText: document.querySelector('[data-testid="pages-error-state"]')?.textContent || '',
        fetchLog: (window.__backyPagesListFetchLog || [])
          .filter((entry) => entry.url.includes('/readiness') || entry.url.includes('/publish') || (entry.url.includes('/api/admin/sites/') && entry.url.includes('/pages')))
          .slice(-24),
        selectedText: [...document.querySelectorAll('input[type="checkbox"]')]
          .filter((input) => input.getAttribute('aria-label')?.startsWith('Select ') && input.checked)
          .length,
        bulkSelectValue: document.querySelector('[data-testid="pages-bulk-action-select"]')?.value || '',
      };
    })()`);

    if (
      !uiState.modalOpen
      && uiState.notice
      && uiState.rowText.includes('Published')
      && uiState.selectedText === 0
      && uiState.bulkSelectValue === ''
    ) {
      break;
    }

    if (attempt === 119) {
      throw new Error(`Bulk publish mutation did not update the UI: ${JSON.stringify(uiState)}`);
    }

    await sleep(250);
  }

  const apiPage = await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${page.id}`);
  const status = apiPage.data?.page?.status;
  assert(status === 'published', `Bulk publish mutation did not persist published status: ${JSON.stringify(apiPage.data?.page)}`);
  const capturedBodies = await evaluate(client, `window.__backyPagesListPublishBodies || []`);
  const publishBody = capturedBodies.find((entry) => entry?.body && Object.prototype.hasOwnProperty.call(entry.body, 'expectedUpdatedAt'));
  assert(
    publishBody?.body?.expectedUpdatedAt === expectedUpdatedAt,
    `Bulk publish mutation did not send expectedUpdatedAt guard: ${JSON.stringify(capturedBodies).slice(0, 500)}`,
  );

  return {
    url,
    prepared,
    confirmed,
    uiState,
    api: {
      pageId: page.id,
      status,
      publishedAt: apiPage.data?.page?.publishedAt || null,
      expectedUpdatedAt: publishBody.body.expectedUpdatedAt,
    },
  };
};

const assertViewerRbac = async (client, viewerSession, page) => {
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: authStorageScript(viewerSession.session.token, viewerSession.user),
  });
  await client.send('Runtime.evaluate', {
    expression: authStorageScript(viewerSession.session.token, viewerSession.user),
    awaitPromise: true,
  });
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}` });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
      hasRow: document.body?.innerText?.includes(${JSON.stringify(page.title)}) || false,
      path: window.location.pathname,
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);
    if (state.ready && state.hasRow && state.path === '/pages') {
      break;
    }
    if (attempt === 79) {
      throw new Error(`Viewer pages RBAC pass did not load page list: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  const state = await evaluate(client, `(() => {
    const disabledState = (selector) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      return {
        count: nodes.length,
        disabled: nodes.every((node) => (
          node instanceof HTMLButtonElement || node instanceof HTMLSelectElement || node instanceof HTMLInputElement
            ? node.disabled
            : node.getAttribute('aria-disabled') === 'true'
        )),
      };
    };
    const pageId = ${JSON.stringify(page.id)};
    return {
      headerCreateDisabled: document.querySelector('[data-testid="pages-header-create"]')?.getAttribute('aria-disabled') === 'true',
      shortcutLinksDisabled: disabledState('a[data-testid^="pages-create-"]'),
      bulkSelectDisabled: document.querySelector('[data-testid="pages-bulk-action-select"]')?.disabled === true,
      bulkApplyDisabled: document.querySelector('[data-testid="pages-bulk-action-apply"]')?.disabled === true,
      rowCheckboxesDisabled: disabledState('input[aria-label^="Select "]'),
      publishDisabled: disabledState('[data-testid^="pages-publish-"]'),
      unpublishDisabled: disabledState('[data-testid^="pages-unpublish-"]'),
      archiveDisabled: disabledState('[data-testid^="pages-archive-"]'),
      previewDisabled: disabledState('[data-testid^="pages-preview-"]'),
      editDisabled: disabledState('[data-testid^="pages-edit-"]'),
      deleteDisabled: disabledState('[data-testid^="pages-delete-"]'),
      deliveryRefreshAvailable: document.querySelector('[data-testid="pages-delivery-refresh-' + CSS.escape(pageId) + '"]')?.disabled === false,
      body: document.body?.innerText?.slice(0, 1000) || '',
    };
  })()`);

  assert(state.headerCreateDisabled, `Viewer pages page left header create enabled: ${JSON.stringify(state)}`);
  assert(state.shortcutLinksDisabled.count > 0 && state.shortcutLinksDisabled.disabled, `Viewer pages page left create shortcuts enabled: ${JSON.stringify(state)}`);
  assert(state.bulkSelectDisabled && state.bulkApplyDisabled, `Viewer pages page left bulk controls enabled: ${JSON.stringify(state)}`);
  assert(state.rowCheckboxesDisabled.count > 0 && state.rowCheckboxesDisabled.disabled, `Viewer pages page left row selection enabled: ${JSON.stringify(state)}`);
  assert(state.publishDisabled.disabled, `Viewer pages page left publish controls enabled: ${JSON.stringify(state)}`);
  assert(state.unpublishDisabled.count > 0 && state.unpublishDisabled.disabled, `Viewer pages page left unpublish controls enabled: ${JSON.stringify(state)}`);
  assert(state.archiveDisabled.count > 0 && state.archiveDisabled.disabled, `Viewer pages page left archive controls enabled: ${JSON.stringify(state)}`);
  assert(state.previewDisabled.count > 0 && state.previewDisabled.disabled, `Viewer pages page left preview controls enabled: ${JSON.stringify(state)}`);
  assert(state.editDisabled.count > 0 && state.editDisabled.disabled, `Viewer pages page left edit controls enabled: ${JSON.stringify(state)}`);
  assert(state.deleteDisabled.count > 0 && state.deleteDisabled.disabled, `Viewer pages page left delete controls enabled: ${JSON.stringify(state)}`);
  assert(state.deliveryRefreshAvailable, `Viewer pages page should keep read-only delivery refresh available: ${JSON.stringify(state)}`);

  return state;
};

const waitForPagesListRow = async (client, page) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}` });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const deleteButton = document.querySelector(${JSON.stringify(`[data-testid="pages-delete-${page.id}"]`)});
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        path: window.location.pathname,
        hasRow: document.body?.innerText?.includes(${JSON.stringify(page.title)}) || false,
        deleteFound: Boolean(deleteButton),
        deleteDisabled: deleteButton instanceof HTMLButtonElement ? deleteButton.disabled : null,
        deleteLabel: deleteButton?.getAttribute('aria-label') || '',
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (state.ready && state.path === '/pages' && state.hasRow && state.deleteFound && state.deleteDisabled === false) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(`Pages list did not expose deletable row: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForPagesPublishRow = async (client, page) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}` });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const publishButton = document.querySelector(${JSON.stringify(`[data-testid="pages-publish-${page.id}"]`)});
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        path: window.location.pathname,
        hasRow: document.body?.innerText?.includes(${JSON.stringify(page.title)}) || false,
        publishFound: Boolean(publishButton),
        publishDisabled: publishButton instanceof HTMLButtonElement ? publishButton.disabled : null,
        publishLabel: publishButton?.getAttribute('aria-label') || '',
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (state.ready && state.path === '/pages' && state.hasRow && state.publishFound && state.publishDisabled === false) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(`Pages list did not expose publishable row: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForPagesUnpublishRow = async (client, page) => {
  const query = new URLSearchParams({
    siteId: HIERARCHY_SITE_ID,
    q: page.title,
  });
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/pages?${query.toString()}` });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const unpublishButton = document.querySelector(${JSON.stringify(`[data-testid="pages-unpublish-${page.id}"]`)});
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        path: window.location.pathname,
        hasRow: document.body?.innerText?.includes(${JSON.stringify(page.title)}) || false,
        unpublishFound: Boolean(unpublishButton),
        unpublishDisabled: unpublishButton instanceof HTMLButtonElement ? unpublishButton.disabled : null,
        unpublishLabel: unpublishButton?.getAttribute('aria-label') || '',
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (state.ready && state.path === '/pages' && state.hasRow && state.unpublishFound && state.unpublishDisabled === false) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(`Pages list did not expose unpublishable row: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForPagesArchiveRow = async (client, page) => {
  const query = new URLSearchParams({
    siteId: HIERARCHY_SITE_ID,
    q: page.title,
  });
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/pages?${query.toString()}` });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const archiveButton = document.querySelector(${JSON.stringify(`[data-testid="pages-archive-${page.id}"]`)});
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        path: window.location.pathname,
        hasRow: document.body?.innerText?.includes(${JSON.stringify(page.title)}) || false,
        archiveFound: Boolean(archiveButton),
        archiveDisabled: archiveButton instanceof HTMLButtonElement ? archiveButton.disabled : null,
        archiveLabel: archiveButton?.getAttribute('aria-label') || '',
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (state.ready && state.path === '/pages' && state.hasRow && state.archiveFound && state.archiveDisabled === false) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(`Pages list did not expose archivable row: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const openPagesPublishDialog = async (client, page) => {
  const rowState = await waitForPagesPublishRow(client, page);
  assert(rowState.publishLabel === `Publish ${page.title}`, `Pages row publish action lacks an accessible label: ${JSON.stringify(rowState)}`);

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector(${JSON.stringify(`[data-testid="pages-publish-${page.id}"]`)});
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return {
        ok: false,
        found: Boolean(button),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        label: button?.getAttribute('aria-label') || '',
      };
    }
    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.click();
    return { ok: true, publishButtonLabel: button.getAttribute('aria-label') || '' };
  })()`);
  assert(clicked.ok, `Pages publish row action was not clickable: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const dialog = document.querySelector('[data-testid="pages-publish-modal"]');
      const titleNode = document.querySelector('#pages-publish-confirm-title');
      const description = document.querySelector('#pages-publish-confirm-description');
      const impact = document.querySelector('#pages-publish-confirm-impact');
      const previewButton = document.querySelector('[data-testid="pages-publish-preview-button"]');
      const cancelButton = document.querySelector('[data-testid="pages-publish-cancel"]');
      const confirmButton = document.querySelector('[data-testid="pages-publish-confirm"]');
      return {
        ok: Boolean(dialog),
        publishButtonLabel: ${JSON.stringify(clicked.publishButtonLabel)},
        role: dialog?.getAttribute('role') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        describedBy: dialog?.getAttribute('aria-describedby') || '',
        title: titleNode?.textContent?.trim() || '',
        description: description?.textContent?.trim() || '',
        impact: impact?.textContent?.trim() || '',
        previewLabel: previewButton?.getAttribute('aria-label') || '',
        cancelLabel: cancelButton?.getAttribute('aria-label') || '',
        confirmLabel: confirmButton?.getAttribute('aria-label') || '',
        cancelDisabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null,
        confirmDisabled: confirmButton instanceof HTMLButtonElement ? confirmButton.disabled : null,
      };
    })()`);

    if (state.ok) {
      return state;
    }

    if (attempt === 59) {
      throw new Error(`Pages publish dialog did not open: ${JSON.stringify(state)}`);
    }

    await sleep(150);
  }

  return null;
};

const waitForPagesPublishDialogClosed = async (client, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      open: Boolean(document.querySelector('[data-testid="pages-publish-modal"]')),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (!state.open) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Pages publish dialog did not close after ${label}`);
};

const assertPagesPublishDialogRecovery = async (client, page) => {
  const semantics = await openPagesPublishDialog(client, page);
  assert(semantics.publishButtonLabel === `Publish ${page.title}`, `Pages publish row action lacks an accessible label: ${JSON.stringify(semantics)}`);
  assert(semantics.role === 'dialog', `Pages publish confirmation must use role=dialog: ${JSON.stringify(semantics)}`);
  assert(semantics.modal === 'true', `Pages publish confirmation must be modal: ${JSON.stringify(semantics)}`);
  assert(semantics.labelledBy === 'pages-publish-confirm-title', `Pages publish confirmation must link its title: ${JSON.stringify(semantics)}`);
  assert(
    semantics.describedBy === 'pages-publish-confirm-description pages-publish-confirm-impact',
    `Pages publish confirmation must describe delivery impact and endpoints: ${JSON.stringify(semantics)}`,
  );
  assert(semantics.title.includes(`Publish ${page.title}?`), `Pages publish confirmation title did not name the page: ${JSON.stringify(semantics)}`);
  assert(semantics.description.includes('Review the route, readiness, and frontend delivery endpoints'), `Pages publish confirmation did not explain frontend delivery impact: ${JSON.stringify(semantics)}`);
  assert(semantics.impact.includes('Render API') && semantics.impact.includes('Resolve API'), `Pages publish confirmation did not expose delivery endpoints: ${JSON.stringify(semantics)}`);
  assert(semantics.previewLabel === `Preview ${page.title} before publishing`, `Pages publish preview action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelLabel === `Cancel publishing ${page.title}`, `Pages publish cancel action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmLabel === `Confirm publishing ${page.title}`, `Pages publish confirm action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelDisabled === false, `Pages publish cancel action should be available before publishing starts: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmDisabled === false, `Pages publish confirm action should be available before publishing starts: ${JSON.stringify(semantics)}`);

  const escapeResult = await evaluate(client, `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return {
      stillOpen: Boolean(document.querySelector('[data-testid="pages-publish-modal"]')),
      path: window.location.pathname,
    };
  })()`);
  assert(escapeResult.path === '/pages', `Pages publish Escape recovery navigated unexpectedly: ${JSON.stringify(escapeResult)}`);
  await waitForPagesPublishDialogClosed(client, 'Escape');

  await openPagesPublishDialog(client, page);
  const cancelResult = await evaluate(client, `(() => {
    const cancelButton = document.querySelector('[data-testid="pages-publish-cancel"]');
    if (!(cancelButton instanceof HTMLButtonElement) || cancelButton.disabled) {
      return { ok: false, found: Boolean(cancelButton), disabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null };
    }
    cancelButton.click();
    return { ok: true };
  })()`);
  assert(cancelResult.ok, `Pages publish cancel button was not clickable: ${JSON.stringify(cancelResult)}`);
  await waitForPagesPublishDialogClosed(client, 'Cancel');

  return semantics;
};

const openPagesUnpublishDialog = async (client, page) => {
  const rowState = await waitForPagesUnpublishRow(client, page);
  assert(rowState.unpublishLabel === `Unpublish ${page.title}`, `Pages row unpublish action lacks an accessible label: ${JSON.stringify(rowState)}`);

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector(${JSON.stringify(`[data-testid="pages-unpublish-${page.id}"]`)});
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return {
        ok: false,
        found: Boolean(button),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        label: button?.getAttribute('aria-label') || '',
      };
    }
    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.click();
    return { ok: true, unpublishButtonLabel: button.getAttribute('aria-label') || '' };
  })()`);
  assert(clicked.ok, `Pages unpublish row action was not clickable: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const dialog = document.querySelector('[data-testid="pages-unpublish-modal"]');
      const titleNode = document.querySelector('#pages-unpublish-confirm-title');
      const description = document.querySelector('#pages-unpublish-confirm-description');
      const impact = document.querySelector('#pages-unpublish-confirm-impact');
      const previewButton = document.querySelector('[data-testid="pages-unpublish-preview-button"]');
      const cancelButton = document.querySelector('[data-testid="pages-unpublish-cancel"]');
      const confirmButton = document.querySelector('[data-testid="pages-unpublish-confirm"]');
      return {
        ok: Boolean(dialog),
        unpublishButtonLabel: ${JSON.stringify(clicked.unpublishButtonLabel)},
        role: dialog?.getAttribute('role') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        describedBy: dialog?.getAttribute('aria-describedby') || '',
        title: titleNode?.textContent?.trim() || '',
        description: description?.textContent?.trim() || '',
        impact: impact?.textContent?.trim() || '',
        previewLabel: previewButton?.getAttribute('aria-label') || '',
        cancelLabel: cancelButton?.getAttribute('aria-label') || '',
        confirmLabel: confirmButton?.getAttribute('aria-label') || '',
        cancelDisabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null,
        confirmDisabled: confirmButton instanceof HTMLButtonElement ? confirmButton.disabled : null,
      };
    })()`);

    if (state.ok) {
      return state;
    }

    if (attempt === 59) {
      throw new Error(`Pages unpublish dialog did not open: ${JSON.stringify(state)}`);
    }

    await sleep(150);
  }

  return null;
};

const waitForPagesUnpublishDialogClosed = async (client, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      open: Boolean(document.querySelector('[data-testid="pages-unpublish-modal"]')),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (!state.open) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Pages unpublish dialog did not close after ${label}`);
};

const assertPagesUnpublishDialogRecovery = async (client, page) => {
  const semantics = await openPagesUnpublishDialog(client, page);
  assert(semantics.unpublishButtonLabel === `Unpublish ${page.title}`, `Pages unpublish row action lacks an accessible label: ${JSON.stringify(semantics)}`);
  assert(semantics.role === 'dialog', `Pages unpublish confirmation must use role=dialog: ${JSON.stringify(semantics)}`);
  assert(semantics.modal === 'true', `Pages unpublish confirmation must be modal: ${JSON.stringify(semantics)}`);
  assert(semantics.labelledBy === 'pages-unpublish-confirm-title', `Pages unpublish confirmation must link its title: ${JSON.stringify(semantics)}`);
  assert(
    semantics.describedBy === 'pages-unpublish-confirm-description pages-unpublish-confirm-impact',
    `Pages unpublish confirmation must describe public delivery impact and endpoints: ${JSON.stringify(semantics)}`,
  );
  assert(semantics.title.includes(`Unpublish ${page.title}?`), `Pages unpublish confirmation title did not name the page: ${JSON.stringify(semantics)}`);
  assert(semantics.description.includes('removes the page from public delivery'), `Pages unpublish confirmation did not explain public delivery impact: ${JSON.stringify(semantics)}`);
  assert(semantics.impact.includes('Render API') && semantics.impact.includes('Resolve API'), `Pages unpublish confirmation did not expose frontend delivery endpoints: ${JSON.stringify(semantics)}`);
  assert(semantics.previewLabel === `Preview ${page.title} before unpublishing`, `Pages unpublish preview action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelLabel === `Cancel unpublishing ${page.title}`, `Pages unpublish cancel action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmLabel === `Confirm unpublishing ${page.title}`, `Pages unpublish confirm action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelDisabled === false, `Pages unpublish cancel action should be available before unpublishing starts: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmDisabled === false, `Pages unpublish confirm action should be available before unpublishing starts: ${JSON.stringify(semantics)}`);

  const escapeResult = await evaluate(client, `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return {
      stillOpen: Boolean(document.querySelector('[data-testid="pages-unpublish-modal"]')),
      path: window.location.pathname,
    };
  })()`);
  assert(escapeResult.path === '/pages', `Pages unpublish Escape recovery navigated unexpectedly: ${JSON.stringify(escapeResult)}`);
  await waitForPagesUnpublishDialogClosed(client, 'Escape');

  await openPagesUnpublishDialog(client, page);
  const cancelResult = await evaluate(client, `(() => {
    const cancelButton = document.querySelector('[data-testid="pages-unpublish-cancel"]');
    if (!(cancelButton instanceof HTMLButtonElement) || cancelButton.disabled) {
      return { ok: false, found: Boolean(cancelButton), disabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null };
    }
    cancelButton.click();
    return { ok: true };
  })()`);
  assert(cancelResult.ok, `Pages unpublish cancel button was not clickable: ${JSON.stringify(cancelResult)}`);
  await waitForPagesUnpublishDialogClosed(client, 'Cancel');

  return semantics;
};

const openPagesArchiveDialog = async (client, page) => {
  const rowState = await waitForPagesArchiveRow(client, page);
  assert(rowState.archiveLabel === `Archive ${page.title}`, `Pages row archive action lacks an accessible label: ${JSON.stringify(rowState)}`);

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector(${JSON.stringify(`[data-testid="pages-archive-${page.id}"]`)});
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return {
        ok: false,
        found: Boolean(button),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        label: button?.getAttribute('aria-label') || '',
      };
    }
    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.click();
    return { ok: true, archiveButtonLabel: button.getAttribute('aria-label') || '' };
  })()`);
  assert(clicked.ok, `Pages archive row action was not clickable: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const dialog = document.querySelector('[data-testid="pages-archive-modal"]');
      const titleNode = document.querySelector('#pages-archive-confirm-title');
      const description = document.querySelector('#pages-archive-confirm-description');
      const impact = document.querySelector('#pages-archive-confirm-impact');
      const previewButton = document.querySelector('[data-testid="pages-archive-preview-button"]');
      const cancelButton = document.querySelector('[data-testid="pages-archive-cancel"]');
      const confirmButton = document.querySelector('[data-testid="pages-archive-confirm"]');
      return {
        ok: Boolean(dialog),
        archiveButtonLabel: ${JSON.stringify(clicked.archiveButtonLabel)},
        role: dialog?.getAttribute('role') || '',
        modal: dialog?.getAttribute('aria-modal') || '',
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        describedBy: dialog?.getAttribute('aria-describedby') || '',
        title: titleNode?.textContent?.trim() || '',
        description: description?.textContent?.trim() || '',
        impact: impact?.textContent?.trim() || '',
        previewLabel: previewButton?.getAttribute('aria-label') || '',
        cancelLabel: cancelButton?.getAttribute('aria-label') || '',
        confirmLabel: confirmButton?.getAttribute('aria-label') || '',
        cancelDisabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null,
        confirmDisabled: confirmButton instanceof HTMLButtonElement ? confirmButton.disabled : null,
      };
    })()`);

    if (state.ok) {
      return state;
    }

    if (attempt === 59) {
      throw new Error(`Pages archive dialog did not open: ${JSON.stringify(state)}`);
    }

    await sleep(150);
  }

  return null;
};

const waitForPagesArchiveDialogClosed = async (client, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      open: Boolean(document.querySelector('[data-testid="pages-archive-modal"]')),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (!state.open) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Pages archive dialog did not close after ${label}`);
};

const assertPagesArchiveDialogRecovery = async (client, page) => {
  const semantics = await openPagesArchiveDialog(client, page);
  assert(semantics.archiveButtonLabel === `Archive ${page.title}`, `Pages archive row action lacks an accessible label: ${JSON.stringify(semantics)}`);
  assert(semantics.role === 'dialog', `Pages archive confirmation must use role=dialog: ${JSON.stringify(semantics)}`);
  assert(semantics.modal === 'true', `Pages archive confirmation must be modal: ${JSON.stringify(semantics)}`);
  assert(semantics.labelledBy === 'pages-archive-confirm-title', `Pages archive confirmation must link its title: ${JSON.stringify(semantics)}`);
  assert(
    semantics.describedBy === 'pages-archive-confirm-description pages-archive-confirm-impact',
    `Pages archive confirmation must describe authoring and public delivery impact: ${JSON.stringify(semantics)}`,
  );
  assert(semantics.title.includes(`Archive ${page.title}?`), `Pages archive confirmation title did not name the page: ${JSON.stringify(semantics)}`);
  assert(semantics.description.includes('keeps the page in Backy for later editing'), `Pages archive confirmation did not explain authoring retention: ${JSON.stringify(semantics)}`);
  assert(semantics.impact.includes('Route') && semantics.impact.includes('Current status'), `Pages archive confirmation did not expose route/status impact: ${JSON.stringify(semantics)}`);
  assert(semantics.previewLabel === `Preview ${page.title} before archiving`, `Pages archive preview action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelLabel === `Cancel archiving ${page.title}`, `Pages archive cancel action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmLabel === `Confirm archiving ${page.title}`, `Pages archive confirm action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelDisabled === false, `Pages archive cancel action should be available before archiving starts: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmDisabled === false, `Pages archive confirm action should be available before archiving starts: ${JSON.stringify(semantics)}`);

  const escapeResult = await evaluate(client, `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return {
      stillOpen: Boolean(document.querySelector('[data-testid="pages-archive-modal"]')),
      path: window.location.pathname,
    };
  })()`);
  assert(escapeResult.path === '/pages', `Pages archive Escape recovery navigated unexpectedly: ${JSON.stringify(escapeResult)}`);
  await waitForPagesArchiveDialogClosed(client, 'Escape');

  await openPagesArchiveDialog(client, page);
  const cancelResult = await evaluate(client, `(() => {
    const cancelButton = document.querySelector('[data-testid="pages-archive-cancel"]');
    if (!(cancelButton instanceof HTMLButtonElement) || cancelButton.disabled) {
      return { ok: false, found: Boolean(cancelButton), disabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null };
    }
    cancelButton.click();
    return { ok: true };
  })()`);
  assert(cancelResult.ok, `Pages archive cancel button was not clickable: ${JSON.stringify(cancelResult)}`);
  await waitForPagesArchiveDialogClosed(client, 'Cancel');

  return semantics;
};

const assertPagesRowActionLabelsForPage = async (client, page, { published }) => {
  const query = new URLSearchParams({
    siteId: HIERARCHY_SITE_ID,
    q: page.title,
  });
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/pages?${query.toString()}` });

	  let state = null;
	  for (let attempt = 0; attempt < 100; attempt += 1) {
	    state = await evaluate(client, `(() => {
	      const labelFor = (testId) => document.querySelector(\`[data-testid="\${testId}"]\`)?.getAttribute('aria-label') || '';
	      const attrFor = (testId, attr) => document.querySelector(\`[data-testid="\${testId}"]\`)?.getAttribute(attr) || '';
	      const exists = (testId) => Boolean(document.querySelector(\`[data-testid="\${testId}"]\`));
	      const pageId = ${JSON.stringify(page.id)};
	      const actions = document.querySelector(\`[data-testid="pages-actions-\${pageId}"]\`);
	      const actionStatus = document.querySelector(\`[data-testid="pages-actions-status-\${pageId}"]\`);
	      const commandSecondaryActions = document.querySelector('[data-testid="pages-command-secondary-actions"]');
	      const commandSecondaryStatus = document.querySelector('[data-testid="pages-command-secondary-action-status"]');
	      return {
	        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
	        path: window.location.pathname,
	        hasRow: document.body?.innerText?.includes(${JSON.stringify(page.title)}) || false,
	        commandSecondaryCollapsed: commandSecondaryActions instanceof HTMLDetailsElement && commandSecondaryActions.open === false,
	        commandSecondaryDescribedBy: commandSecondaryActions?.getAttribute('aria-describedby') || '',
	        commandSecondaryStatusId: commandSecondaryStatus?.id || '',
	        commandSecondaryStatusText: commandSecondaryStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
	        commandSecondaryStatusData: commandSecondaryActions?.getAttribute('data-action-status') || '',
	        commandSecondaryState: commandSecondaryActions?.getAttribute('data-action-state') || '',
	        commandCopyLabel: labelFor('pages-command-copy-handoff'),
	        commandCopyDescribedBy: attrFor('pages-command-copy-handoff', 'aria-describedby'),
	        commandCopyState: attrFor('pages-command-copy-handoff', 'data-action-state'),
	        commandCopyStatus: attrFor('pages-command-copy-handoff', 'data-action-status'),
	        commandCopyDisabledReasonReady: attrFor('pages-command-copy-handoff', 'data-disabled-reason') === '',
	        commandDownloadLabel: labelFor('pages-command-download-handoff'),
	        commandDownloadDescribedBy: attrFor('pages-command-download-handoff', 'aria-describedby'),
	        commandDownloadState: attrFor('pages-command-download-handoff', 'data-action-state'),
	        commandDownloadStatus: attrFor('pages-command-download-handoff', 'data-action-status'),
	        commandDownloadDisabledReasonReady: attrFor('pages-command-download-handoff', 'data-disabled-reason') === '',
	        commandExportLabel: labelFor('pages-command-export-csv'),
	        commandExportDescribedBy: attrFor('pages-command-export-csv', 'aria-describedby'),
	        commandExportState: attrFor('pages-command-export-csv', 'data-action-state'),
	        commandExportStatus: attrFor('pages-command-export-csv', 'data-action-status'),
	        commandExportDisabledReasonReady: attrFor('pages-command-export-csv', 'data-disabled-reason') === '',
	        actionsRole: actions?.getAttribute('role') || '',
	        actionsLabel: actions?.getAttribute('aria-label') || '',
	        actionsDescribedBy: actions?.getAttribute('aria-describedby') || '',
	        actionsStatusId: actionStatus?.id || '',
	        actionsStatusText: actionStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
	        actionsStatusData: actions?.getAttribute('data-action-status') || '',
	        publish: labelFor(\`pages-publish-\${pageId}\`),
	        publishExists: exists(\`pages-publish-\${pageId}\`),
	        publishDescribedBy: attrFor(\`pages-publish-\${pageId}\`, 'aria-describedby'),
	        publishState: attrFor(\`pages-publish-\${pageId}\`, 'data-action-state'),
	        publishReason: attrFor(\`pages-publish-\${pageId}\`, 'data-disabled-reason'),
	        unpublish: labelFor(\`pages-unpublish-\${pageId}\`),
	        unpublishExists: exists(\`pages-unpublish-\${pageId}\`),
	        unpublishDescribedBy: attrFor(\`pages-unpublish-\${pageId}\`, 'aria-describedby'),
	        unpublishState: attrFor(\`pages-unpublish-\${pageId}\`, 'data-action-state'),
	        unpublishReason: attrFor(\`pages-unpublish-\${pageId}\`, 'data-disabled-reason'),
	        archive: labelFor(\`pages-archive-\${pageId}\`),
	        archiveExists: exists(\`pages-archive-\${pageId}\`),
	        archiveDescribedBy: attrFor(\`pages-archive-\${pageId}\`, 'aria-describedby'),
	        archiveState: attrFor(\`pages-archive-\${pageId}\`, 'data-action-state'),
	        archiveReason: attrFor(\`pages-archive-\${pageId}\`, 'data-disabled-reason'),
		        open: labelFor(\`pages-open-\${pageId}\`),
		        openExists: exists(\`pages-open-\${pageId}\`),
		        openHref: document.querySelector(\`[data-testid="pages-open-\${pageId}"]\`)?.getAttribute('href') || '',
	        openDescribedBy: attrFor(\`pages-open-\${pageId}\`, 'aria-describedby'),
	        openState: attrFor(\`pages-open-\${pageId}\`, 'data-action-state'),
		        preview: labelFor(\`pages-preview-\${pageId}\`),
	        previewDescribedBy: attrFor(\`pages-preview-\${pageId}\`, 'aria-describedby'),
	        previewState: attrFor(\`pages-preview-\${pageId}\`, 'data-action-state'),
	        previewReason: attrFor(\`pages-preview-\${pageId}\`, 'data-disabled-reason'),
		        edit: labelFor(\`pages-edit-\${pageId}\`),
	        editDescribedBy: attrFor(\`pages-edit-\${pageId}\`, 'aria-describedby'),
	        editState: attrFor(\`pages-edit-\${pageId}\`, 'data-action-state'),
	        editReason: attrFor(\`pages-edit-\${pageId}\`, 'data-disabled-reason'),
		        delete: labelFor(\`pages-delete-\${pageId}\`),
	        deleteDescribedBy: attrFor(\`pages-delete-\${pageId}\`, 'aria-describedby'),
	        deleteState: attrFor(\`pages-delete-\${pageId}\`, 'data-action-state'),
	        deleteReason: attrFor(\`pages-delete-\${pageId}\`, 'data-disabled-reason'),
		        deliveryRefresh: labelFor(\`pages-delivery-refresh-\${pageId}\`),
		        deliveryRefreshExists: exists(\`pages-delivery-refresh-\${pageId}\`),
	        searchLabel: labelFor('pages-search-input'),
	        metricAllLabel: labelFor('pages-metric-filter-all'),
	        metricAllPressed: document.querySelector('[data-testid="pages-metric-filter-all"]')?.getAttribute('aria-pressed') || '',
	        statusAllLabel: labelFor('pages-status-filter-all'),
	        statusAllPressed: document.querySelector('[data-testid="pages-status-filter-all"]')?.getAttribute('aria-pressed') || '',
	        healthFilterLabel: labelFor('pages-health-filter-select'),
	        filterRefreshLabel: labelFor('pages-filter-refresh'),
	        bulkToolbarRole: document.querySelector('[data-testid="pages-bulk-toolbar"]')?.getAttribute('role') || '',
	        bulkToolbarLabel: document.querySelector('[data-testid="pages-bulk-toolbar"]')?.getAttribute('aria-label') || '',
	        selectVisibleLabel: labelFor('pages-bulk-select-visible'),
	        bulkActionSelectLabel: labelFor('pages-bulk-action-select'),
	        bulkApplyLabel: labelFor('pages-bulk-action-apply'),
	        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
	        body: document.body?.innerText?.slice(0, 900) || '',
	      };
    })()`);

    if (state.ready && state.path === '/pages' && state.hasRow && !state.loading) {
      break;
    }

    if (attempt === 99) {
      throw new Error(`Pages row did not render for action-label check: ${JSON.stringify(state)}`);
    }

	    await sleep(250);
	  }

	  assert(state.commandSecondaryCollapsed, `Pages command secondary actions should stay collapsed by default: ${JSON.stringify(state)}`);
	  assert(state.commandSecondaryDescribedBy === state.commandSecondaryStatusId, `Pages command secondary actions must be described by their shared status summary: ${JSON.stringify(state)}`);
	  assert(state.commandSecondaryState === 'ready', `Pages command secondary actions should be ready when filtered pages are available: ${JSON.stringify(state)}`);
	  assert(state.commandSecondaryStatusText && state.commandSecondaryStatusData === state.commandSecondaryStatusText, `Pages command secondary action status data must mirror hidden status copy: ${JSON.stringify(state)}`);
	  assert(
	    state.commandSecondaryStatusText.includes('Copy handoff available') &&
	      state.commandSecondaryStatusText.includes('Download JSON available') &&
	      state.commandSecondaryStatusText.includes('Export CSV available for'),
	    `Pages command secondary action status should summarize copy, download, and export availability: ${JSON.stringify(state)}`,
	  );
	  assert(state.commandCopyLabel === 'Copy pages handoff manifest', `Pages command copy handoff action lacks an accessible label: ${JSON.stringify(state)}`);
	  assert(state.commandCopyState === 'ready' && state.commandCopyDescribedBy === state.commandSecondaryStatusId && state.commandCopyStatus.includes('Copy handoff available') && state.commandCopyDisabledReasonReady, `Pages command copy handoff action must expose ready state metadata: ${JSON.stringify(state)}`);
	  assert(state.commandDownloadLabel === 'Download pages handoff JSON', `Pages command download handoff action lacks an accessible label: ${JSON.stringify(state)}`);
	  assert(state.commandDownloadState === 'ready' && state.commandDownloadDescribedBy === state.commandSecondaryStatusId && state.commandDownloadStatus.includes('Download JSON available') && state.commandDownloadDisabledReasonReady, `Pages command download handoff action must expose ready state metadata: ${JSON.stringify(state)}`);
	  assert(state.commandExportLabel === 'Export filtered pages CSV', `Pages command export action lacks an accessible label: ${JSON.stringify(state)}`);
	  assert(state.commandExportState === 'ready' && state.commandExportDescribedBy === state.commandSecondaryStatusId && state.commandExportStatus.includes('Export CSV available for') && state.commandExportDisabledReasonReady, `Pages command export action must expose ready state metadata: ${JSON.stringify(state)}`);

	  if (published) {
	    assert(!state.publishExists, `Published page should not expose a publish row action: ${JSON.stringify(state)}`);
		    assert(state.unpublish === `Unpublish ${page.title}`, `Published page unpublish action lacks an accessible label: ${JSON.stringify(state)}`);
		    assert(state.open === `Open published page ${page.title}`, `Published page open action lacks an accessible label: ${JSON.stringify(state)}`);
		    assert(state.openHref.includes(page.slug), `Published page open action does not point at the page slug: ${JSON.stringify(state)}`);
		    assert(state.unpublishState === 'ready' && state.unpublishDescribedBy === state.actionsStatusId, `Published page unpublish action should be marked ready and described by row action status: ${JSON.stringify(state)}`);
		    assert(state.openState === 'ready' && state.openDescribedBy === state.actionsStatusId, `Published page open action should be marked ready and described by row action status: ${JSON.stringify(state)}`);
		    assert(state.deliveryRefresh === `Refresh delivery health for ${page.title}`, `Published page delivery health refresh lacks a page-specific accessible label: ${JSON.stringify(state)}`);
		    assert(state.actionsStatusText.includes('Unpublish available.') && state.actionsStatusText.includes('Open published page available.'), `Published page action status should summarize available row actions: ${JSON.stringify(state)}`);
		  } else {
		    assert(state.publish === `Publish ${page.title}`, `Draft page publish action lacks an accessible label: ${JSON.stringify(state)}`);
		    assert(!state.unpublishExists, `Draft page should not expose an unpublish row action: ${JSON.stringify(state)}`);
		    assert(!state.openExists, `Draft page should not expose a published-page open action: ${JSON.stringify(state)}`);
		    assert(state.publishState === 'ready' && state.publishDescribedBy === state.actionsStatusId, `Draft page publish action should be marked ready and described by row action status: ${JSON.stringify(state)}`);
		    assert(!state.deliveryRefreshExists, `Draft page should not expose published delivery health refresh: ${JSON.stringify(state)}`);
		    assert(state.actionsStatusText.includes('Publish available.'), `Draft page action status should summarize publish availability: ${JSON.stringify(state)}`);
		  }

		  assert(state.actionsRole === 'group' && state.actionsLabel === `Actions for ${page.title}`, `Page row actions must be a named group: ${JSON.stringify(state)}`);
		  assert(state.actionsDescribedBy === state.actionsStatusId, `Page row action group must be described by its status summary: ${JSON.stringify(state)}`);
		  assert(state.actionsStatusText && state.actionsStatusData === state.actionsStatusText, `Page row action status data must mirror hidden status copy: ${JSON.stringify(state)}`);
		  assert(state.archive === `Archive ${page.title}`, `Page archive action lacks an accessible label: ${JSON.stringify(state)}`);
		  assert(state.archiveState === 'ready' && state.archiveDescribedBy === state.actionsStatusId, `Page archive action should be marked ready and described by row action status: ${JSON.stringify(state)}`);
		  assert(state.preview === `Preview ${page.title}`, `Page preview action lacks an accessible label: ${JSON.stringify(state)}`);
		  assert(state.previewState === 'ready' && state.previewDescribedBy === state.actionsStatusId, `Page preview action should be marked ready and described by row action status: ${JSON.stringify(state)}`);
		  assert(state.edit === `Edit ${page.title}`, `Page edit action lacks an accessible label: ${JSON.stringify(state)}`);
		  assert(state.editState === 'ready' && state.editDescribedBy === state.actionsStatusId, `Page edit action should be marked ready and described by row action status: ${JSON.stringify(state)}`);
		  assert(state.delete === `Delete ${page.title}`, `Page delete action lacks an accessible label: ${JSON.stringify(state)}`);
		  assert(state.deleteState === 'ready' && state.deleteDescribedBy === state.actionsStatusId, `Page delete action should be marked ready and described by row action status: ${JSON.stringify(state)}`);
	  assert(state.searchLabel === 'Search pages by title, slug, route, or template', `Pages search input lacks an accessible label: ${JSON.stringify(state)}`);
	  assert(state.metricAllLabel.startsWith('Show all ') && state.metricAllLabel.endsWith(' pages'), `Pages metric filter lacks a count-aware accessible label: ${JSON.stringify(state)}`);
	  assert(state.metricAllPressed === 'true', `Pages all metric filter should expose pressed state: ${JSON.stringify(state)}`);
	  assert(state.statusAllLabel === 'Filter pages by all statuses', `Pages status filter chip lacks an accessible label: ${JSON.stringify(state)}`);
	  assert(state.statusAllPressed === 'true', `Pages all status filter chip should expose pressed state: ${JSON.stringify(state)}`);
	  assert(state.healthFilterLabel === 'Filter pages by library readiness', `Pages readiness filter lacks an accessible label: ${JSON.stringify(state)}`);
	  assert(state.filterRefreshLabel === 'Refresh page table', `Pages filter refresh lacks an accessible label: ${JSON.stringify(state)}`);
	  assert(state.bulkToolbarRole === 'group' && state.bulkToolbarLabel === 'Bulk page actions', `Pages bulk toolbar lacks group semantics: ${JSON.stringify(state)}`);
	  assert(state.selectVisibleLabel === 'Select visible pages', `Pages select-visible bulk action lacks an accessible label: ${JSON.stringify(state)}`);
	  assert(state.bulkActionSelectLabel === 'Choose bulk page action', `Pages bulk action select lacks an accessible label: ${JSON.stringify(state)}`);
	  assert(state.bulkApplyLabel === 'Apply selected bulk action', `Pages bulk action apply lacks an accessible label before action selection: ${JSON.stringify(state)}`);

	  return state;
	};

const assertPagesRowActionLabels = async (client, { draftPage, publishedPage }) => ({
  draft: await assertPagesRowActionLabelsForPage(client, draftPage, { published: false }),
  published: await assertPagesRowActionLabelsForPage(client, publishedPage, { published: true }),
});

const assertPagesCommandSecondaryEmptyExportState = async (client) => {
  const query = new URLSearchParams({
    siteId: HIERARCHY_SITE_ID,
    q: `__backy_no_filtered_pages_${Date.now()}__`,
  });
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/pages?${query.toString()}` });

  let state = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    state = await evaluate(client, `(() => {
      const attrFor = (testId, attr) => document.querySelector(\`[data-testid="\${testId}"]\`)?.getAttribute(attr) || '';
      const hasDisabled = (testId) => document.querySelector(\`[data-testid="\${testId}"]\`)?.hasAttribute('disabled') || false;
      const commandSecondaryActions = document.querySelector('[data-testid="pages-command-secondary-actions"]');
      const commandSecondaryStatus = document.querySelector('[data-testid="pages-command-secondary-action-status"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        path: window.location.pathname,
        search: window.location.search,
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        commandSecondaryCollapsed: commandSecondaryActions instanceof HTMLDetailsElement && commandSecondaryActions.open === false,
        commandSecondaryDescribedBy: commandSecondaryActions?.getAttribute('aria-describedby') || '',
        commandSecondaryStatusId: commandSecondaryStatus?.id || '',
        commandSecondaryStatusText: commandSecondaryStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        commandSecondaryStatusData: commandSecondaryActions?.getAttribute('data-action-status') || '',
        commandSecondaryState: commandSecondaryActions?.getAttribute('data-action-state') || '',
        commandCopyState: attrFor('pages-command-copy-handoff', 'data-action-state'),
        commandCopyStatus: attrFor('pages-command-copy-handoff', 'data-action-status'),
        commandCopyDisabledReason: attrFor('pages-command-copy-handoff', 'data-disabled-reason'),
        commandDownloadState: attrFor('pages-command-download-handoff', 'data-action-state'),
        commandDownloadStatus: attrFor('pages-command-download-handoff', 'data-action-status'),
        commandDownloadDisabledReason: attrFor('pages-command-download-handoff', 'data-disabled-reason'),
        commandExportState: attrFor('pages-command-export-csv', 'data-action-state'),
        commandExportStatus: attrFor('pages-command-export-csv', 'data-action-status'),
        commandExportDisabledReason: attrFor('pages-command-export-csv', 'data-disabled-reason'),
        commandExportDisabled: hasDisabled('pages-command-export-csv'),
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (state.ready && state.path === '/pages' && !state.loading && state.commandSecondaryStatusText) {
      break;
    }

    if (attempt === 99) {
      throw new Error(`Pages command secondary empty-export state did not render: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  assert(state.commandSecondaryCollapsed, `Pages command secondary actions should stay collapsed in empty-filter state: ${JSON.stringify(state)}`);
  assert(state.commandSecondaryDescribedBy === state.commandSecondaryStatusId, `Pages command secondary empty-filter actions must be described by their shared status summary: ${JSON.stringify(state)}`);
  assert(state.commandSecondaryState === 'ready', `Pages command secondary group should stay ready when copy/download are available and export is blocked: ${JSON.stringify(state)}`);
  assert(state.commandSecondaryStatusText && state.commandSecondaryStatusData === state.commandSecondaryStatusText, `Pages command secondary empty-filter status data must mirror hidden status copy: ${JSON.stringify(state)}`);
  assert(state.commandCopyState === 'ready' && state.commandCopyStatus.includes('Copy handoff available') && state.commandCopyDisabledReason === '', `Pages command copy handoff should remain ready with no filtered pages: ${JSON.stringify(state)}`);
  assert(state.commandDownloadState === 'ready' && state.commandDownloadStatus.includes('Download JSON available') && state.commandDownloadDisabledReason === '', `Pages command download handoff should remain ready with no filtered pages: ${JSON.stringify(state)}`);
  assert(state.commandExportDisabled, `Pages command export should be disabled with no filtered pages: ${JSON.stringify(state)}`);
  assert(state.commandExportState === 'blocked', `Pages command export should expose blocked state with no filtered pages: ${JSON.stringify(state)}`);
  assert(state.commandExportDisabledReason === 'No filtered pages are available to export.', `Pages command export should explain the empty-filter disabled state: ${JSON.stringify(state)}`);
  assert(state.commandExportStatus === `Export CSV blocked: ${state.commandExportDisabledReason}`, `Pages command export status should mirror the empty-filter disabled reason: ${JSON.stringify(state)}`);
  assert(
    state.commandSecondaryStatusText.includes('Copy handoff available') &&
      state.commandSecondaryStatusText.includes('Download JSON available') &&
      state.commandSecondaryStatusText.includes('Export CSV blocked: No filtered pages are available to export.'),
    `Pages command secondary empty-filter status should summarize ready copy/download actions and blocked export: ${JSON.stringify(state)}`,
  );

  return state;
};

const waitForPagesBulkSelectionState = async (client, label, expectedSelectedCount = null) => {
  let state = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    state = await evaluate(client, `(() => {
      const toolbar = document.querySelector('[data-testid="pages-bulk-toolbar"]');
      const status = document.querySelector('[data-testid="pages-bulk-selection-status"]');
      const selectVisible = document.querySelector('[data-testid="pages-bulk-select-visible"]');
      const selectFiltered = document.querySelector('[data-testid="pages-bulk-select-filtered"]');
      const bulkActionSelect = document.querySelector('[data-testid="pages-bulk-action-select"]');
      const bulkActionApply = document.querySelector('[data-testid="pages-bulk-action-apply"]');
      const bulkActionStatus = document.querySelector('[data-testid="pages-bulk-action-status"]');
      const clearSelection = document.querySelector('[data-testid="pages-bulk-clear-selection"]');
      const clearNonVisible = document.querySelector('[data-testid="pages-bulk-clear-non-visible"]');
      const rowCheckboxes = Array.from(document.querySelectorAll('[data-testid^="pages-select-"]'));
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        path: window.location.pathname,
        search: window.location.search,
        toolbar: Boolean(toolbar),
        toolbarLabel: toolbar?.getAttribute('aria-label') || '',
        toolbarDescribedBy: toolbar?.getAttribute('aria-describedby') || '',
        toolbarActionState: toolbar?.getAttribute('data-action-state') || '',
        toolbarActionStatus: toolbar?.getAttribute('data-action-status') || '',
        selectedCount: Number(toolbar?.getAttribute('data-selected-count') || 0),
        visibleSelectedCount: Number(toolbar?.getAttribute('data-visible-selected-count') || 0),
        hiddenSelectedCount: Number(toolbar?.getAttribute('data-hidden-selected-count') || 0),
        filteredSelectedCount: Number(toolbar?.getAttribute('data-filtered-selected-count') || 0),
        filteredTotalCount: Number(toolbar?.getAttribute('data-filtered-total-count') || 0),
        bulkAction: toolbar?.getAttribute('data-bulk-action') || '',
        bulkActionReady: toolbar?.getAttribute('data-bulk-action-ready') || '',
        statusId: status?.id || '',
        statusLive: status?.getAttribute('aria-live') || '',
        statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        bulkActionStatusId: bulkActionStatus?.id || '',
        bulkActionStatusLive: bulkActionStatus?.getAttribute('aria-live') || '',
        bulkActionStatusText: bulkActionStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        bulkActionSelectValue: bulkActionSelect instanceof HTMLSelectElement ? bulkActionSelect.value : '',
        bulkActionSelectDescribedBy: bulkActionSelect?.getAttribute('aria-describedby') || '',
        bulkActionSelectActionState: bulkActionSelect?.getAttribute('data-action-state') || '',
        bulkActionSelectActionStatus: bulkActionSelect?.getAttribute('data-action-status') || '',
        bulkActionSelectDisabledReason: bulkActionSelect?.getAttribute('data-disabled-reason') || '',
        bulkActionApplyLabel: bulkActionApply?.getAttribute('aria-label') || '',
        bulkActionApplyDescribedBy: bulkActionApply?.getAttribute('aria-describedby') || '',
        bulkActionApplyAriaDisabled: bulkActionApply?.getAttribute('aria-disabled') || '',
        bulkActionApplyDisabled: bulkActionApply instanceof HTMLButtonElement ? bulkActionApply.disabled : null,
        bulkActionApplyReady: bulkActionApply?.getAttribute('data-bulk-action-ready') || '',
        bulkActionApplyStatus: bulkActionApply?.getAttribute('data-bulk-action-status') || '',
        bulkActionApplyActionState: bulkActionApply?.getAttribute('data-action-state') || '',
        bulkActionApplyActionStatus: bulkActionApply?.getAttribute('data-action-status') || '',
        bulkActionApplyDisabledReason: bulkActionApply?.getAttribute('data-disabled-reason') || '',
        selectVisibleLabel: selectVisible?.getAttribute('aria-label') || '',
        selectVisibleDescribedBy: selectVisible?.getAttribute('aria-describedby') || '',
        selectVisibleActionState: selectVisible?.getAttribute('data-action-state') || '',
        selectVisibleActionStatus: selectVisible?.getAttribute('data-action-status') || '',
        selectVisibleDisabledReason: selectVisible?.getAttribute('data-disabled-reason') || '',
        selectVisibleText: selectVisible?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        selectVisibleDisabled: selectVisible instanceof HTMLButtonElement ? selectVisible.disabled : null,
        selectFilteredPresent: Boolean(selectFiltered),
        selectFilteredLabel: selectFiltered?.getAttribute('aria-label') || '',
        selectFilteredDescribedBy: selectFiltered?.getAttribute('aria-describedby') || '',
        selectFilteredActionState: selectFiltered?.getAttribute('data-action-state') || '',
        selectFilteredActionStatus: selectFiltered?.getAttribute('data-action-status') || '',
        selectFilteredDisabledReason: selectFiltered?.getAttribute('data-disabled-reason') || '',
        selectFilteredText: selectFiltered?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        clearSelectionPresent: Boolean(clearSelection),
        clearSelectionLabel: clearSelection?.getAttribute('aria-label') || '',
        clearSelectionDescribedBy: clearSelection?.getAttribute('aria-describedby') || '',
        clearSelectionActionState: clearSelection?.getAttribute('data-action-state') || '',
        clearSelectionActionStatus: clearSelection?.getAttribute('data-action-status') || '',
        clearSelectionDisabledReason: clearSelection?.getAttribute('data-disabled-reason') || '',
        clearNonVisiblePresent: Boolean(clearNonVisible),
        clearNonVisibleLabel: clearNonVisible?.getAttribute('aria-label') || '',
        clearNonVisibleDescribedBy: clearNonVisible?.getAttribute('aria-describedby') || '',
        clearNonVisibleActionState: clearNonVisible?.getAttribute('data-action-state') || '',
        clearNonVisibleActionStatus: clearNonVisible?.getAttribute('data-action-status') || '',
        clearNonVisibleDisabledReason: clearNonVisible?.getAttribute('data-disabled-reason') || '',
        rowCheckboxCount: rowCheckboxes.length,
        checkedRowCount: rowCheckboxes.filter((checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked).length,
        body: document.body?.innerText?.slice(0, 1200) || '',
      };
    })()`);

    const selectedMatches = expectedSelectedCount === null || state.selectedCount === expectedSelectedCount;
    if (state.ready && state.path === '/pages' && state.toolbar && state.rowCheckboxCount > 0 && selectedMatches) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(`Pages bulk selection state did not reach ${label}: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return state;
};

const clickPagesBulkControl = async (client, testId) => evaluate(client, `(() => {
  const control = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
  if (!(control instanceof HTMLButtonElement) || control.disabled) {
    return {
      clicked: false,
      found: Boolean(control),
      disabled: control instanceof HTMLButtonElement ? control.disabled : null,
      label: control?.getAttribute('aria-label') || '',
      text: control?.textContent?.replace(/\\s+/g, ' ').trim() || '',
    };
  }
  control.click();
  return {
    clicked: true,
    label: control.getAttribute('aria-label') || '',
    text: control.textContent?.replace(/\\s+/g, ' ').trim() || '',
  };
})()`);

const choosePagesBulkAction = async (client, action) => evaluate(client, `(() => {
  const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
  if (!(select instanceof HTMLSelectElement) || select.disabled) {
    return {
      changed: false,
      found: Boolean(select),
      disabled: select instanceof HTMLSelectElement ? select.disabled : null,
      value: select instanceof HTMLSelectElement ? select.value : '',
    };
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setter?.call(select, ${JSON.stringify(action)});
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return {
    changed: true,
    value: select.value,
    describedBy: select.getAttribute('aria-describedby') || '',
  };
})()`);

const assertPagesBulkSelectionStatus = async (client) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&page=1`;
  await client.send('Page.navigate', { url });

  const initial = await waitForPagesBulkSelectionState(client, 'initial no selection', 0);
  assert(initial.toolbarLabel === 'Bulk page actions', `Bulk toolbar must stay named: ${JSON.stringify(initial)}`);
  assert(initial.toolbarDescribedBy === `${initial.statusId} ${initial.bulkActionStatusId}` && initial.statusId && initial.bulkActionStatusId, `Bulk toolbar must describe itself with selection and action status: ${JSON.stringify(initial)}`);
  assert(initial.toolbarActionState === 'blocked' && initial.toolbarActionStatus.includes(initial.statusText) && initial.toolbarActionStatus.includes(initial.bulkActionStatusText), `Bulk toolbar must expose combined blocked action status before selection: ${JSON.stringify(initial)}`);
  assert(initial.statusLive === 'polite', `Bulk selection status must be a polite live region: ${JSON.stringify(initial)}`);
  assert(initial.statusText === `No pages selected. ${initial.rowCheckboxCount} visible pages on this table page.`, `Initial bulk selection status was not specific: ${JSON.stringify(initial)}`);
  assert(initial.selectVisibleLabel === 'Select visible pages' && initial.selectVisibleDisabled === false, `Select visible control must start enabled and named: ${JSON.stringify(initial)}`);
  assert(initial.selectVisibleDescribedBy === initial.bulkActionStatusId && initial.selectVisibleActionState === 'ready' && initial.selectVisibleActionStatus === initial.statusText && !initial.selectVisibleDisabledReason, `Select visible must expose ready action status metadata: ${JSON.stringify(initial)}`);
  assert(initial.selectFilteredPresent && initial.selectFilteredLabel === `Select all ${initial.filteredTotalCount} filtered pages`, `Select all filtered control must include the filtered count: ${JSON.stringify(initial)}`);
  assert(initial.selectFilteredDescribedBy === initial.bulkActionStatusId && initial.selectFilteredActionState === 'ready' && initial.selectFilteredActionStatus === initial.statusText && !initial.selectFilteredDisabledReason, `Select all filtered must expose ready action status metadata: ${JSON.stringify(initial)}`);

  const visibleClick = await clickPagesBulkControl(client, 'pages-bulk-select-visible');
  assert(visibleClick.clicked, `Unable to click select visible: ${JSON.stringify(visibleClick)}`);
  const visibleSelected = await waitForPagesBulkSelectionState(client, 'visible selection', initial.rowCheckboxCount);
  assert(visibleSelected.visibleSelectedCount === initial.rowCheckboxCount && visibleSelected.hiddenSelectedCount === 0, `Visible selection counts are wrong: ${JSON.stringify(visibleSelected)}`);
  assert(visibleSelected.checkedRowCount === initial.rowCheckboxCount, `Visible row checkboxes did not reflect selected state: ${JSON.stringify(visibleSelected)}`);
  assert(visibleSelected.statusText === `${initial.rowCheckboxCount} pages selected. ${initial.rowCheckboxCount} visible, 0 not visible, ${initial.rowCheckboxCount} of ${visibleSelected.filteredTotalCount} filtered pages selected.`, `Visible selection status was not announced: ${JSON.stringify(visibleSelected)}`);
  assert(visibleSelected.selectVisibleLabel === 'Clear visible page selection' && visibleSelected.clearSelectionPresent, `Visible selection must retarget select-visible and expose clear selection: ${JSON.stringify(visibleSelected)}`);
  assert(visibleSelected.toolbarActionState === 'blocked' && visibleSelected.clearSelectionDescribedBy === visibleSelected.bulkActionStatusId && visibleSelected.clearSelectionActionState === 'ready' && visibleSelected.clearSelectionActionStatus === visibleSelected.statusText, `Selected bulk toolbar must keep clear-selection action metadata ready while no bulk action is chosen: ${JSON.stringify(visibleSelected)}`);

  const clearVisible = await clickPagesBulkControl(client, 'pages-bulk-clear-selection');
  assert(clearVisible.clicked, `Unable to clear visible selection: ${JSON.stringify(clearVisible)}`);
  const cleared = await waitForPagesBulkSelectionState(client, 'clear visible selection', 0);
  assert(cleared.statusText === `No pages selected. ${cleared.rowCheckboxCount} visible pages on this table page.`, `Clear selection did not restore no-selection status: ${JSON.stringify(cleared)}`);

  const filteredClick = await clickPagesBulkControl(client, 'pages-bulk-select-filtered');
  assert(filteredClick.clicked, `Unable to click select all filtered: ${JSON.stringify(filteredClick)}`);
  const allFiltered = await waitForPagesBulkSelectionState(client, 'all filtered selection', cleared.filteredTotalCount);
  assert(allFiltered.selectedCount === allFiltered.filteredTotalCount && allFiltered.hiddenSelectedCount === allFiltered.filteredTotalCount - allFiltered.rowCheckboxCount, `All-filtered selection counts are wrong: ${JSON.stringify(allFiltered)}`);
  assert(allFiltered.clearNonVisiblePresent && allFiltered.clearNonVisibleLabel === `Clear ${allFiltered.hiddenSelectedCount} non-visible selected pages`, `All-filtered selection must expose non-visible recovery: ${JSON.stringify(allFiltered)}`);
  assert(allFiltered.statusText === `${allFiltered.filteredTotalCount} pages selected. ${allFiltered.rowCheckboxCount} visible, ${allFiltered.hiddenSelectedCount} not visible, ${allFiltered.filteredTotalCount} of ${allFiltered.filteredTotalCount} filtered pages selected.`, `All-filtered status was not announced: ${JSON.stringify(allFiltered)}`);
  assert(allFiltered.clearNonVisibleDescribedBy === allFiltered.bulkActionStatusId && allFiltered.clearNonVisibleActionState === 'ready' && allFiltered.clearNonVisibleActionStatus === allFiltered.statusText, `Non-visible recovery must expose ready action metadata: ${JSON.stringify(allFiltered)}`);

  const clearNonVisible = await clickPagesBulkControl(client, 'pages-bulk-clear-non-visible');
  assert(clearNonVisible.clicked, `Unable to clear non-visible selection: ${JSON.stringify(clearNonVisible)}`);
  const visibleAfterNonVisibleClear = await waitForPagesBulkSelectionState(client, 'non-visible cleared', cleared.rowCheckboxCount);
  assert(visibleAfterNonVisibleClear.hiddenSelectedCount === 0 && visibleAfterNonVisibleClear.visibleSelectedCount === visibleAfterNonVisibleClear.rowCheckboxCount, `Clearing non-visible selection did not leave only visible rows selected: ${JSON.stringify(visibleAfterNonVisibleClear)}`);
  assert(!visibleAfterNonVisibleClear.clearNonVisiblePresent, `Non-visible recovery should disappear after clearing hidden selections: ${JSON.stringify(visibleAfterNonVisibleClear)}`);

  const finalClear = await clickPagesBulkControl(client, 'pages-bulk-clear-selection');
  assert(finalClear.clicked, `Unable to clear final visible selection: ${JSON.stringify(finalClear)}`);
  const finalState = await waitForPagesBulkSelectionState(client, 'final clear selection', 0);
  assert(finalState.checkedRowCount === 0 && finalState.statusText === `No pages selected. ${finalState.rowCheckboxCount} visible pages on this table page.`, `Final clear did not restore unselected state: ${JSON.stringify(finalState)}`);

  return { initial, visibleClick, visibleSelected, clearVisible, cleared, filteredClick, allFiltered, clearNonVisible, visibleAfterNonVisibleClear, finalClear, finalState };
};

const assertPagesBulkActionStatus = async (client) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&page=1`;
  await client.send('Page.navigate', { url });

  const initial = await waitForPagesBulkSelectionState(client, 'bulk action initial state', 0);
  assert(initial.bulkAction === 'none' && initial.bulkActionReady === 'false', `Bulk action should start unset and not ready: ${JSON.stringify(initial)}`);
  assert(initial.bulkActionStatusLive === 'polite', `Bulk action status must be a polite live region: ${JSON.stringify(initial)}`);
  assert(initial.bulkActionStatusText === 'Select one or more pages to enable bulk actions.', `Initial bulk action status should explain the disabled apply button: ${JSON.stringify(initial)}`);
  assert(initial.bulkActionSelectDescribedBy === initial.bulkActionStatusId && initial.bulkActionApplyDescribedBy === initial.bulkActionStatusId, `Bulk action select/apply must be described by action status: ${JSON.stringify(initial)}`);
  assert(initial.bulkActionSelectActionState === 'ready' && initial.bulkActionSelectActionStatus === initial.bulkActionStatusText && !initial.bulkActionSelectDisabledReason, `Bulk action select should expose ready action status before selection: ${JSON.stringify(initial)}`);
  assert(initial.bulkActionApplyDisabled === true && initial.bulkActionApplyAriaDisabled === 'true' && initial.bulkActionApplyReady === 'false', `Apply button should expose disabled state before selection/action: ${JSON.stringify(initial)}`);
  assert(initial.bulkActionApplyActionState === 'blocked' && initial.bulkActionApplyDisabledReason === 'Select one or more pages before applying this bulk action.', `Apply button should expose a no-selection disabled reason: ${JSON.stringify(initial)}`);
  assert(initial.bulkActionApplyStatus === initial.bulkActionStatusText && initial.bulkActionApplyActionStatus === initial.bulkActionStatusText, `Apply button data status should mirror the visible status: ${JSON.stringify(initial)}`);

  const visibleClick = await clickPagesBulkControl(client, 'pages-bulk-select-visible');
  assert(visibleClick.clicked, `Unable to select visible pages for bulk action status: ${JSON.stringify(visibleClick)}`);
  const selectedNoAction = await waitForPagesBulkSelectionState(client, 'selected rows without action', initial.rowCheckboxCount);
  assert(selectedNoAction.bulkAction === 'none' && selectedNoAction.bulkActionReady === 'false', `Bulk action should remain unset after row selection: ${JSON.stringify(selectedNoAction)}`);
  assert(selectedNoAction.bulkActionStatusText === `${selectedNoAction.selectedCount} pages selected. Choose a bulk action for ${selectedNoAction.selectedCount} selected pages.`
    || selectedNoAction.bulkActionStatusText === `Choose a bulk action for ${selectedNoAction.selectedCount} selected pages.`, `Selected-without-action status should ask for an action: ${JSON.stringify(selectedNoAction)}`);
  assert(selectedNoAction.bulkActionApplyActionState === 'blocked' && selectedNoAction.bulkActionApplyDisabledReason === 'Choose a bulk action before applying it.', `Selected-without-action apply control must expose the chosen-action blocker: ${JSON.stringify(selectedNoAction)}`);

  const choseArchive = await choosePagesBulkAction(client, 'archive');
  assert(choseArchive.changed && choseArchive.value === 'archive', `Unable to choose archive bulk action: ${JSON.stringify(choseArchive)}`);
  const archiveReady = await waitForPagesBulkSelectionState(client, 'archive action ready', selectedNoAction.selectedCount);
  assert(archiveReady.bulkAction === 'archive', `Bulk action toolbar did not expose archive action: ${JSON.stringify(archiveReady)}`);
  assert(archiveReady.bulkActionReady === 'true' && archiveReady.bulkActionApplyReady === 'true', `Archive bulk action should be ready after selecting rows: ${JSON.stringify(archiveReady)}`);
  assert(archiveReady.bulkActionApplyDisabled === false && archiveReady.bulkActionApplyAriaDisabled === 'false', `Apply button should enable for archive-ready selection: ${JSON.stringify(archiveReady)}`);
  assert(archiveReady.toolbarActionState === 'ready' && archiveReady.bulkActionApplyActionState === 'ready' && !archiveReady.bulkActionApplyDisabledReason, `Archive-ready controls must expose ready action metadata: ${JSON.stringify(archiveReady)}`);
  assert(archiveReady.bulkActionApplyLabel === `Apply bulk action: Review archive for ${archiveReady.selectedCount} page${archiveReady.selectedCount === 1 ? '' : 's'}`, `Archive apply label should name the review step and count: ${JSON.stringify(archiveReady)}`);
  assert(archiveReady.bulkActionStatusText === `Ready to review archive for ${archiveReady.selectedCount} pages.`, `Archive-ready status should explain the next action: ${JSON.stringify(archiveReady)}`);
  assert(archiveReady.bulkActionApplyStatus === archiveReady.bulkActionStatusText && archiveReady.bulkActionApplyActionStatus === archiveReady.bulkActionStatusText, `Apply data status should mirror archive-ready text: ${JSON.stringify(archiveReady)}`);

  const cleared = await clickPagesBulkControl(client, 'pages-bulk-clear-selection');
  assert(cleared.clicked, `Unable to clear bulk action selection: ${JSON.stringify(cleared)}`);
  const clearedWithAction = await waitForPagesBulkSelectionState(client, 'cleared selection keeps action status disabled', 0);
  assert(clearedWithAction.bulkAction === 'archive' && clearedWithAction.bulkActionReady === 'false', `Clearing selected rows should leave chosen action but mark it unavailable: ${JSON.stringify(clearedWithAction)}`);
  assert(clearedWithAction.bulkActionApplyDisabled === true && clearedWithAction.bulkActionStatusText === 'Select one or more pages to enable bulk actions.', `Cleared selection should explain why Apply is disabled: ${JSON.stringify(clearedWithAction)}`);
  assert(clearedWithAction.bulkActionApplyActionState === 'blocked' && clearedWithAction.bulkActionApplyDisabledReason === 'Select one or more pages before applying this bulk action.', `Cleared selection should expose the no-selection disabled reason on Apply: ${JSON.stringify(clearedWithAction)}`);

  return { initial, visibleClick, selectedNoAction, choseArchive, archiveReady, cleared, clearedWithAction };
};

const waitForPagesDataGridHeaderState = async (client, label) => {
  let state = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    state = await evaluate(client, `(() => {
      const grid = document.querySelector('[data-testid="admin-data-grid"]');
      const scroll = document.querySelector('[data-testid="admin-data-grid-scroll"]');
      const table = scroll?.querySelector('table');
      const headerCells = Array.from(document.querySelectorAll('[data-testid="admin-data-grid-head"] th'));
      const firstRow = document.querySelector('[data-testid="admin-data-grid-row"]');
      const bodyCells = firstRow ? Array.from(firstRow.children).filter((cell) => cell instanceof HTMLTableCellElement) : [];
      const columnWidths = Array.from(document.querySelectorAll('[data-testid="admin-data-grid-column-widths"] col')).map((column) => ({
        key: column.getAttribute('data-column-key') || '',
        width: column.getAttribute('data-column-width') || '',
      }));
      const headers = headerCells.map((header) => ({
        key: header.getAttribute('data-column-key') || '',
        id: header.id || '',
        scope: header.getAttribute('scope') || '',
        ariaLabel: header.getAttribute('aria-label') || '',
        dataLabel: header.getAttribute('data-column-label') || '',
        text: header.textContent?.replace(/\\s+/g, ' ').trim() || '',
        ariaSort: header.getAttribute('aria-sort') || '',
      }));
      const cells = bodyCells.map((cell) => {
        const headerId = cell.getAttribute('headers') || '';
        const header = headerId ? document.getElementById(headerId) : null;
        const content = cell.querySelector('[data-testid="admin-data-grid-cell-content"]');
        const cellRect = cell.getBoundingClientRect();
        const contentRect = content?.getBoundingClientRect();
        return {
          key: cell.getAttribute('data-column-key') || '',
          dataLabel: cell.getAttribute('data-column-label') || '',
          overflowPolicy: cell.getAttribute('data-cell-overflow-policy') || '',
          contentPolicy: content?.getAttribute('data-cell-content-policy') || '',
          contentFitsCell: Boolean(contentRect && contentRect.left >= cellRect.left - 1 && contentRect.right <= cellRect.right + 1),
          headers: headerId,
          headerExists: Boolean(header),
          headerKey: header?.getAttribute('data-column-key') || '',
          headerLabel: header?.getAttribute('data-column-label') || '',
          headerAriaLabel: header?.getAttribute('aria-label') || '',
        };
      });
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        path: window.location.pathname,
        search: window.location.search,
        grid: Boolean(grid),
        rowCount: Number(grid?.getAttribute('data-row-count') || 0),
        totalItems: Number(grid?.getAttribute('data-total-items') || 0),
        tableMinWidth: table?.getAttribute('data-table-min-width') || '',
        tableClientWidth: Math.round(table?.getBoundingClientRect().width || 0),
        scrollClientWidth: Math.round(scroll?.clientWidth || 0),
        scrollWidth: Math.round(scroll?.scrollWidth || 0),
        hasHorizontalScroll: Boolean(scroll && scroll.scrollWidth > scroll.clientWidth + 2),
        columnWidths,
        headerCount: headers.length,
        cellCount: cells.length,
        headers,
        cells,
        body: document.body?.innerText?.slice(0, 1200) || '',
      };
    })()`);

    if (state.ready && state.grid && state.rowCount > 0 && state.headerCount > 0 && state.cellCount > 0) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(`Pages DataGrid header state did not reach ${label}: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return state;
};

const assertPagesDataGridHeaderSemantics = async (client) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}`;
  await client.send('Page.navigate', { url });

  const state = await waitForPagesDataGridHeaderState(client, 'pages table headers');
  assert(state.headerCount === state.cellCount, `DataGrid first row cells must match column headers: ${JSON.stringify(state)}`);
  assert(state.headers.every((header) => header.id && header.scope === 'col' && header.ariaLabel && header.dataLabel), `Every DataGrid header must have id, scope, aria label, and data label: ${JSON.stringify(state.headers)}`);
  assert(state.cells.every((cell) => cell.headers && cell.headerExists && cell.key === cell.headerKey && cell.dataLabel === cell.headerLabel && cell.dataLabel === cell.headerAriaLabel), `Every DataGrid body cell must reference its matching named column header: ${JSON.stringify(state.cells)}`);
  assert(state.cells.every((cell) => cell.overflowPolicy === 'clip-and-wrap'), `Every dense DataGrid body cell must clip and wrap content instead of painting into neighboring columns: ${JSON.stringify(state.cells)}`);
  assert(state.cells.every((cell) => cell.contentPolicy === 'constrained-wrapped-content'), `Every dense DataGrid body cell must constrain rendered children inside the cell: ${JSON.stringify(state.cells)}`);
  assert(state.cells.every((cell) => cell.contentFitsCell), `Every dense DataGrid body cell wrapper must stay within its owning cell: ${JSON.stringify(state.cells)}`);
  assert(state.tableMinWidth === '2100px' && state.hasHorizontalScroll, `Pages DataGrid must render as a horizontally scrollable dense table instead of compressing columns: ${JSON.stringify(state)}`);
  assert(
    state.columnWidths.some((column) => column.key === 'siteId' && column.width === '420px') &&
      state.columnWidths.some((column) => column.key === 'title' && column.width === '240px') &&
      state.columnWidths.some((column) => column.key === 'actions' && column.width === '168px'),
    `Pages DataGrid must render explicit column widths for dense delivery and action cells: ${JSON.stringify(state.columnWidths)}`,
  );

  const selectHeader = state.headers.find((header) => header.key === 'id');
  assert(selectHeader?.ariaLabel === 'Select' && selectHeader?.dataLabel === 'Select', `Select column header must stay named: ${JSON.stringify(selectHeader)}`);

  const titleHeader = state.headers.find((header) => header.key === 'title');
  assert(titleHeader?.ariaLabel === 'Page Title' && titleHeader?.scope === 'col', `Page title header must expose the visible column name: ${JSON.stringify(titleHeader)}`);

  const actionsHeader = state.headers.find((header) => header.key === 'actions');
  assert(actionsHeader?.ariaLabel === 'Actions' && actionsHeader?.dataLabel === 'Actions' && actionsHeader?.text.includes('Actions'), `Blank action header must expose a screen-reader column name: ${JSON.stringify(actionsHeader)}`);

  const actionsCell = state.cells.find((cell) => cell.key === 'actions');
  assert(actionsCell?.dataLabel === 'Actions' && actionsCell?.headerLabel === 'Actions', `Actions body cell must reference the named action header: ${JSON.stringify(actionsCell)}`);

  return state;
};

const waitForPagesDataGridSortState = async (client, label, expectedKey = null, expectedDirection = null) => {
  let state = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    state = await evaluate(client, `(() => {
      const grid = document.querySelector('[data-testid="admin-data-grid"]');
      const buttons = Array.from(document.querySelectorAll('[data-testid^="admin-data-grid-sort-"]'))
        .filter((button) => !button.getAttribute('data-testid')?.startsWith('admin-data-grid-sort-status-'));
      const sortButtons = buttons.map((button) => {
        const header = button.closest('th');
        const describedBy = button.getAttribute('aria-describedby') || '';
        const status = describedBy ? document.getElementById(describedBy) : null;
        return {
          key: header?.getAttribute('data-column-key') || '',
          label: button.textContent?.replace(/\\s+/g, ' ').trim() || '',
          ariaLabel: button.getAttribute('aria-label') || '',
          title: button.getAttribute('title') || '',
          describedBy,
          statusId: status?.id || '',
          statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          state: button.getAttribute('data-sort-state') || '',
          active: button.getAttribute('data-sort-active') || '',
          nextDirection: button.getAttribute('data-sort-next-direction') || '',
          iconDirection: button.getAttribute('data-sort-icon-direction') || '',
          disabledReason: button.getAttribute('data-sort-disabled-reason') || '',
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          ariaDisabled: button.getAttribute('aria-disabled') || '',
          headerAriaSort: header?.getAttribute('aria-sort') || '',
        };
      });
      const activeSort = sortButtons.find((button) => button.active === 'true') || null;
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        path: window.location.pathname,
        search: window.location.search,
        grid: Boolean(grid),
        rowCount: Number(grid?.getAttribute('data-row-count') || 0),
        totalItems: Number(grid?.getAttribute('data-total-items') || 0),
        sortButtons,
        activeSort,
        body: document.body?.innerText?.slice(0, 1200) || '',
      };
    })()`);

    const expectedMatches = !expectedKey || (
      state.activeSort?.key === expectedKey &&
      (!expectedDirection || state.activeSort?.state === expectedDirection)
    );

    if (state.ready && state.grid && state.rowCount > 0 && state.sortButtons.length >= 1 && expectedMatches) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(`Pages DataGrid sort state did not reach ${label}: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return state;
};

const clickPagesDataGridSortButton = async (client, key) => evaluate(client, `(() => {
  const button = document.querySelector(${JSON.stringify(`[data-testid="admin-data-grid-sort-${key}"]`)});
  if (!(button instanceof HTMLButtonElement) || button.disabled) {
    return {
      clicked: false,
      found: Boolean(button),
      disabled: button instanceof HTMLButtonElement ? button.disabled : null,
      ariaLabel: button?.getAttribute('aria-label') || '',
      state: button?.getAttribute('data-sort-state') || '',
    };
  }
  button.click();
  return {
    clicked: true,
    ariaLabel: button.getAttribute('aria-label') || '',
    state: button.getAttribute('data-sort-state') || '',
    nextDirection: button.getAttribute('data-sort-next-direction') || '',
  };
})()`);

const assertPagesDataGridSortControls = async (client) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}`;
  await client.send('Page.navigate', { url });

  const initial = await waitForPagesDataGridSortState(client, 'default last-updated sort', 'lastUpdated', 'desc');
  assert(initial.activeSort.headerAriaSort === 'descending', `Default sorted header must expose descending aria-sort: ${JSON.stringify(initial.activeSort)}`);
  assert(initial.activeSort.ariaLabel === 'Sort by Last Updated ascending', `Default sorted header must name the next direction: ${JSON.stringify(initial.activeSort)}`);
  assert(initial.activeSort.title === initial.activeSort.ariaLabel, `Default sorted header title must match the accessible action: ${JSON.stringify(initial.activeSort)}`);
  assert(initial.activeSort.statusText === 'Currently sorted descending. Activate to sort ascending.', `Default sorted header must describe current and next direction: ${JSON.stringify(initial.activeSort)}`);
  assert(initial.activeSort.describedBy === initial.activeSort.statusId && initial.activeSort.statusId, `Default sorted header must describe itself with the status text: ${JSON.stringify(initial.activeSort)}`);
  assert(initial.activeSort.nextDirection === 'asc', `Default sorted header must expose next direction: ${JSON.stringify(initial.activeSort)}`);
  assert(initial.activeSort.iconDirection === 'desc', `Default sorted header must expose descending visual icon direction: ${JSON.stringify(initial.activeSort)}`);
  assert(initial.activeSort.disabled === false && initial.activeSort.ariaDisabled === 'false' && initial.activeSort.disabledReason === '', `Default sorted header must be enabled: ${JSON.stringify(initial.activeSort)}`);

  const pageTitleInitial = initial.sortButtons.find((button) => button.key === 'title');
  assert(pageTitleInitial, `Page title sort button was not rendered: ${JSON.stringify(initial)}`);
  assert(pageTitleInitial.state === 'none' && pageTitleInitial.active === 'false', `Page title sort should start inactive: ${JSON.stringify(pageTitleInitial)}`);
  assert(pageTitleInitial.ariaLabel === 'Sort by Page Title ascending', `Inactive page title sort label must name the first direction: ${JSON.stringify(pageTitleInitial)}`);
  assert(pageTitleInitial.statusText === 'Not currently sorted. Activate to sort ascending.', `Inactive page title sort must describe current state: ${JSON.stringify(pageTitleInitial)}`);
  assert(pageTitleInitial.nextDirection === 'asc', `Inactive page title sort must expose next direction: ${JSON.stringify(pageTitleInitial)}`);
  assert(pageTitleInitial.iconDirection === 'unsorted', `Inactive page title sort must expose unsorted visual icon direction: ${JSON.stringify(pageTitleInitial)}`);
  assert(pageTitleInitial.headerAriaSort === '', `Inactive page title header should not publish aria-sort: ${JSON.stringify(pageTitleInitial)}`);

  const clickedTitleAsc = await clickPagesDataGridSortButton(client, 'title');
  assert(clickedTitleAsc.clicked, `Page title sort button was not clickable: ${JSON.stringify(clickedTitleAsc)}`);

  const titleAsc = await waitForPagesDataGridSortState(client, 'page title ascending sort', 'title', 'asc');
  const ascParams = new URLSearchParams(titleAsc.search.startsWith('?') ? titleAsc.search.slice(1) : titleAsc.search);
  assert(ascParams.get('sortBy') === 'title' && ascParams.get('sortDirection') === 'asc', `Page title ascending sort did not synchronize URL search: ${JSON.stringify(titleAsc)}`);
  assert(titleAsc.activeSort.headerAriaSort === 'ascending', `Page title ascending header must expose aria-sort: ${JSON.stringify(titleAsc.activeSort)}`);
  assert(titleAsc.activeSort.ariaLabel === 'Sort by Page Title descending', `Page title ascending label must name descending as next action: ${JSON.stringify(titleAsc.activeSort)}`);
  assert(titleAsc.activeSort.statusText === 'Currently sorted ascending. Activate to sort descending.', `Page title ascending status must describe current and next direction: ${JSON.stringify(titleAsc.activeSort)}`);
  assert(titleAsc.activeSort.nextDirection === 'desc', `Page title ascending sort must expose descending as next direction: ${JSON.stringify(titleAsc.activeSort)}`);
  assert(titleAsc.activeSort.iconDirection === 'asc', `Page title ascending sort must expose ascending visual icon direction: ${JSON.stringify(titleAsc.activeSort)}`);

  const clickedTitleDesc = await clickPagesDataGridSortButton(client, 'title');
  assert(clickedTitleDesc.clicked, `Page title second sort click failed: ${JSON.stringify(clickedTitleDesc)}`);

  const titleDesc = await waitForPagesDataGridSortState(client, 'page title descending sort', 'title', 'desc');
  const descParams = new URLSearchParams(titleDesc.search.startsWith('?') ? titleDesc.search.slice(1) : titleDesc.search);
  assert(descParams.get('sortBy') === 'title' && !descParams.has('sortDirection'), `Page title descending sort should keep sortBy and omit default desc direction: ${JSON.stringify(titleDesc)}`);
  assert(titleDesc.activeSort.headerAriaSort === 'descending', `Page title descending header must expose aria-sort: ${JSON.stringify(titleDesc.activeSort)}`);
  assert(titleDesc.activeSort.ariaLabel === 'Sort by Page Title ascending', `Page title descending label must name ascending as next action: ${JSON.stringify(titleDesc.activeSort)}`);
  assert(titleDesc.activeSort.statusText === 'Currently sorted descending. Activate to sort ascending.', `Page title descending status must describe current and next direction: ${JSON.stringify(titleDesc.activeSort)}`);
  assert(titleDesc.activeSort.nextDirection === 'asc', `Page title descending sort must expose ascending as next direction: ${JSON.stringify(titleDesc.activeSort)}`);
  assert(titleDesc.activeSort.iconDirection === 'desc', `Page title descending sort must expose descending visual icon direction: ${JSON.stringify(titleDesc.activeSort)}`);

  return { initial, clickedTitleAsc, titleAsc, clickedTitleDesc, titleDesc };
};

const waitForPagesDataGridPaginationState = async (client, label, expectedPage = null) => {
  let state = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    state = await evaluate(client, `(() => {
      const grid = document.querySelector('[data-testid="admin-data-grid"]');
      const pagination = document.querySelector('[data-testid="admin-data-grid-pagination"]');
      const summary = document.querySelector('[data-testid="admin-data-grid-pagination-summary"]');
      const indicator = document.querySelector('[data-testid="admin-data-grid-page-indicator"]');
      const previous = document.querySelector('[data-testid="admin-data-grid-previous-page"]');
      const next = document.querySelector('[data-testid="admin-data-grid-next-page"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        path: window.location.pathname,
        search: window.location.search,
        grid: Boolean(grid),
        rowCount: Number(grid?.getAttribute('data-row-count') || 0),
        totalItems: Number(grid?.getAttribute('data-total-items') || 0),
        currentPage: Number(grid?.getAttribute('data-current-page') || 0),
        totalPages: Number(grid?.getAttribute('data-total-pages') || 0),
        pagination: Boolean(pagination),
        paginationDescribedBy: pagination?.getAttribute('aria-describedby') || '',
        summaryId: summary?.id || '',
        summaryText: summary?.textContent?.trim() || '',
        summaryLive: summary?.getAttribute('aria-live') || '',
        indicatorText: indicator?.textContent?.trim() || '',
        indicatorAriaCurrent: indicator?.getAttribute('aria-current') || '',
        indicatorCurrentPage: Number(indicator?.getAttribute('data-current-page') || 0),
        indicatorTotalPages: Number(indicator?.getAttribute('data-total-pages') || 0),
        previousLabel: previous?.getAttribute('aria-label') || '',
        previousDisabled: previous instanceof HTMLButtonElement ? previous.disabled : null,
        previousAriaDisabled: previous?.getAttribute('aria-disabled') || '',
        previousCurrentPage: Number(previous?.getAttribute('data-current-page') || 0),
        previousTargetPage: Number(previous?.getAttribute('data-target-page') || 0),
        nextLabel: next?.getAttribute('aria-label') || '',
        nextDisabled: next instanceof HTMLButtonElement ? next.disabled : null,
        nextAriaDisabled: next?.getAttribute('aria-disabled') || '',
        nextCurrentPage: Number(next?.getAttribute('data-current-page') || 0),
        nextTargetPage: Number(next?.getAttribute('data-target-page') || 0),
        body: document.body?.innerText?.slice(0, 1200) || '',
      };
    })()`);

    const pageMatches = expectedPage === null || state.currentPage === expectedPage;
    if (state.ready && state.grid && state.pagination && state.totalPages > 1 && pageMatches) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(`Pages DataGrid pagination did not reach ${label}: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return state;
};

const assertPagesDataGridPaginationControls = async (client) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&page=1`;
  await client.send('Page.navigate', { url });

  const firstPage = await waitForPagesDataGridPaginationState(client, 'first page', 1);
  assert(firstPage.paginationDescribedBy === firstPage.summaryId && firstPage.summaryId, `DataGrid pagination must describe itself with the live summary: ${JSON.stringify(firstPage)}`);
  assert(firstPage.summaryLive === 'polite' && firstPage.summaryText.includes('Showing'), `DataGrid pagination summary must be polite and visible to assistive tech: ${JSON.stringify(firstPage)}`);
  assert(firstPage.indicatorAriaCurrent === 'page' && firstPage.indicatorText === `Page 1 of ${firstPage.totalPages}`, `DataGrid current page indicator must expose current page state: ${JSON.stringify(firstPage)}`);
  assert(firstPage.previousDisabled === true && firstPage.previousAriaDisabled === 'true', `DataGrid previous page must be disabled on the first page: ${JSON.stringify(firstPage)}`);
  assert(firstPage.previousLabel === 'Previous page unavailable. Page 1 is the first page.', `DataGrid previous page label lacks first-page context: ${JSON.stringify(firstPage)}`);
  assert(firstPage.nextDisabled === false && firstPage.nextAriaDisabled === 'false', `DataGrid next page must be enabled when more pages exist: ${JSON.stringify(firstPage)}`);
  assert(firstPage.nextTargetPage === 2 && firstPage.nextLabel === `Go to next page, page 2 of ${firstPage.totalPages}.`, `DataGrid next page label lacks target-page context: ${JSON.stringify(firstPage)}`);

  const clicked = await evaluate(client, `(() => {
    const next = document.querySelector('[data-testid="admin-data-grid-next-page"]');
    if (!(next instanceof HTMLButtonElement) || next.disabled) {
      return { clicked: false, found: Boolean(next), disabled: next instanceof HTMLButtonElement ? next.disabled : null };
    }
    next.click();
    return { clicked: true, label: next.getAttribute('aria-label') || '', target: next.getAttribute('data-target-page') || '' };
  })()`);
  assert(clicked.clicked, `DataGrid next page button was not clickable: ${JSON.stringify(clicked)}`);

  const secondPage = await waitForPagesDataGridPaginationState(client, 'second page after next click', 2);
  assert(secondPage.search.includes('page=2'), `DataGrid next page click did not update route search: ${JSON.stringify(secondPage)}`);
  assert(secondPage.previousDisabled === false && secondPage.previousAriaDisabled === 'false', `DataGrid previous page must enable after moving forward: ${JSON.stringify(secondPage)}`);
  assert(secondPage.previousTargetPage === 1 && secondPage.previousLabel === `Go to previous page, page 1 of ${secondPage.totalPages}.`, `DataGrid previous page label lacks target-page context after navigation: ${JSON.stringify(secondPage)}`);
  assert(secondPage.nextTargetPage === Math.min(secondPage.totalPages, 3), `DataGrid next page target did not update after navigation: ${JSON.stringify(secondPage)}`);
  assert(secondPage.indicatorAriaCurrent === 'page' && secondPage.indicatorText === `Page 2 of ${secondPage.totalPages}`, `DataGrid current page indicator did not update after navigation: ${JSON.stringify(secondPage)}`);

  return { firstPage, clicked, secondPage };
};

const waitForPagesDeleteDialogClosed = async (client, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      open: Boolean(document.querySelector('[data-testid="pages-delete-confirm-dialog"]')),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (!state.open) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Pages delete dialog did not close after ${label}`);
};

const openPagesDeleteDialog = async (client, page) => {
  await waitForPagesListRow(client, page);
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector(${JSON.stringify(`[data-testid="pages-delete-${page.id}"]`)});
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return {
        ok: false,
        found: Boolean(button),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        label: button?.getAttribute('aria-label') || '',
      };
    }
    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.click();
    return {
      ok: true,
      deleteButtonLabel: button.getAttribute('aria-label') || '',
    };
  })()`);
  assert(clicked.ok, `Pages delete row action was not clickable: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => {
    const dialog = document.querySelector('[data-testid="pages-delete-confirm-dialog"]');
    const titleNode = document.querySelector('#pages-delete-confirm-title');
    const description = document.querySelector('#pages-delete-confirm-description');
    const impact = document.querySelector('#pages-delete-confirm-impact');
    const cancelButton = document.querySelector('[data-testid="pages-delete-cancel-button"]');
    const confirmButton = document.querySelector('[data-testid="pages-delete-confirm-button"]');
    return {
      ok: Boolean(dialog),
      deleteButtonLabel: ${JSON.stringify(clicked.deleteButtonLabel)},
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

    if (attempt === 39) {
      throw new Error(`Pages delete dialog did not open: ${JSON.stringify(state)}`);
    }

    await sleep(150);
  }

  return null;
};

const assertPagesDeleteDialogRecovery = async (client, page) => {
  const semantics = await openPagesDeleteDialog(client, page);
  assert(semantics.deleteButtonLabel === `Delete ${page.title}`, `Pages row delete action lacks an accessible label: ${JSON.stringify(semantics)}`);
  assert(semantics.role === 'dialog', `Pages delete confirmation must use role=dialog: ${JSON.stringify(semantics)}`);
  assert(semantics.modal === 'true', `Pages delete confirmation must be modal: ${JSON.stringify(semantics)}`);
  assert(semantics.labelledBy === 'pages-delete-confirm-title', `Pages delete confirmation must link its title: ${JSON.stringify(semantics)}`);
  assert(
    semantics.describedBy === 'pages-delete-confirm-description pages-delete-confirm-impact',
    `Pages delete confirmation must describe public API impact and route: ${JSON.stringify(semantics)}`,
  );
  assert(semantics.title.includes(`Delete ${page.title}?`), `Pages delete confirmation title did not name the page: ${JSON.stringify(semantics)}`);
  assert(semantics.description.includes('removes the page from the backend and the public API'), `Pages delete confirmation did not explain API impact: ${JSON.stringify(semantics)}`);
  assert(semantics.impact.includes(page.slug), `Pages delete confirmation did not name the route slug: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelLabel === `Cancel deleting ${page.title}`, `Pages delete cancel action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmLabel === `Confirm deleting ${page.title}`, `Pages delete confirm action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelDisabled === false, `Pages delete cancel action should be available before deletion starts: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmDisabled === false, `Pages delete confirm action should be available before deletion starts: ${JSON.stringify(semantics)}`);

  const escapeResult = await evaluate(client, `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return {
      stillOpen: Boolean(document.querySelector('[data-testid="pages-delete-confirm-dialog"]')),
      path: window.location.pathname,
    };
  })()`);
  assert(escapeResult.path === '/pages', `Pages delete Escape recovery navigated unexpectedly: ${JSON.stringify(escapeResult)}`);
  await waitForPagesDeleteDialogClosed(client, 'Escape');

  await openPagesDeleteDialog(client, page);
  const cancelResult = await evaluate(client, `(() => {
    const cancelButton = document.querySelector('[data-testid="pages-delete-cancel-button"]');
    if (!(cancelButton instanceof HTMLButtonElement) || cancelButton.disabled) {
      return { ok: false, found: Boolean(cancelButton), disabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null };
    }
    cancelButton.click();
    return { ok: true };
  })()`);
  assert(cancelResult.ok, `Pages delete cancel button was not clickable: ${JSON.stringify(cancelResult)}`);
  await waitForPagesDeleteDialogClosed(client, 'Cancel');

  return semantics;
};

const openPagesBulkUnpublishDialog = async (client, page) => {
  await waitForPagesUnpublishRow(client, page);
  await clearVisibleBulkSelection(client);

  let prepared = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    prepared = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const checkbox = document.querySelector(${JSON.stringify(`[data-testid="pages-select-${page.id}"]`)});
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      if (checkbox instanceof HTMLInputElement && !checkbox.checked && !checkbox.disabled) {
        checkbox.click();
      }
      if (select instanceof HTMLSelectElement && select.value !== 'unpublish' && !select.disabled) {
        setSelectValue(select, 'unpublish');
      }
      return {
        prepared: Boolean(checkbox && select),
        checked: checkbox instanceof HTMLInputElement ? checkbox.checked : false,
        checkboxDisabled: checkbox instanceof HTMLInputElement ? checkbox.disabled : null,
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        selectDisabled: select instanceof HTMLSelectElement ? select.disabled : null,
        applyText: document.querySelector('[data-testid="pages-bulk-action-apply"]')?.textContent || '',
        rowText: row?.textContent || '',
      };
    })()`);
    if (prepared.prepared && prepared.checked && prepared.selectValue === 'unpublish' && prepared.rowText.includes(page.title)) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`Unable to prepare pages bulk unpublish controls: ${JSON.stringify(prepared)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const opened = await evaluate(client, `(() => {
      const dialog = document.querySelector('[data-testid="pages-bulk-unpublish-modal"]');
      const applyButton = dialog ? null : document.querySelector('[data-testid="pages-bulk-action-apply"]');
      if (!dialog && applyButton instanceof HTMLButtonElement && !applyButton.disabled) {
        applyButton.click();
      }
      return {
        hasApply: Boolean(applyButton || dialog),
        applyDisabled: applyButton instanceof HTMLButtonElement ? applyButton.disabled : null,
        dialogOpen: Boolean(dialog),
        applyText: applyButton?.textContent || '',
      };
    })()`);

    if (opened.dialogOpen) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Pages bulk unpublish dialog did not open: ${JSON.stringify(opened)}`);
    }

    await sleep(150);
  }

  const state = await evaluate(client, `(() => {
    const dialog = document.querySelector('[data-testid="pages-bulk-unpublish-modal"]');
    const titleNode = document.querySelector('#pages-bulk-unpublish-confirm-title');
    const description = document.querySelector('#pages-bulk-unpublish-confirm-description');
    const impact = document.querySelector('#pages-bulk-unpublish-confirm-impact');
    const cancelButton = document.querySelector('[data-testid="pages-bulk-unpublish-cancel-button"]');
    const confirmButton = document.querySelector('[data-testid="pages-bulk-unpublish-confirm-button"]');
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
  assert(state.ok, `Pages bulk unpublish dialog did not expose semantics after open: ${JSON.stringify(state)}`);
  return { prepared, state };
};

const waitForPagesBulkUnpublishDialogClosed = async (client, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      open: Boolean(document.querySelector('[data-testid="pages-bulk-unpublish-modal"]')),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (!state.open) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Pages bulk unpublish dialog did not close after ${label}`);
};

const assertPagesBulkUnpublishDialogRecovery = async (client, page) => {
  const firstOpen = await openPagesBulkUnpublishDialog(client, page);
  const semantics = firstOpen.state;
  assert(semantics.role === 'dialog', `Pages bulk unpublish confirmation must use role=dialog: ${JSON.stringify(semantics)}`);
  assert(semantics.modal === 'true', `Pages bulk unpublish confirmation must be modal: ${JSON.stringify(semantics)}`);
  assert(semantics.labelledBy === 'pages-bulk-unpublish-confirm-title', `Pages bulk unpublish confirmation must link its title: ${JSON.stringify(semantics)}`);
  assert(
    semantics.describedBy === 'pages-bulk-unpublish-confirm-description pages-bulk-unpublish-confirm-impact',
    `Pages bulk unpublish confirmation must describe public delivery impact and selected pages: ${JSON.stringify(semantics)}`,
  );
  assert(semantics.title.includes('Unpublish 1 selected page?'), `Pages bulk unpublish confirmation title did not name selected count: ${JSON.stringify(semantics)}`);
  assert(semantics.description.includes('remove these pages from public delivery'), `Pages bulk unpublish confirmation did not explain public delivery impact: ${JSON.stringify(semantics)}`);
  assert(semantics.impact.includes(page.title) && semantics.impact.includes('Public delivery disabled after confirm'), `Pages bulk unpublish confirmation did not list selected page impact: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelLabel === 'Cancel unpublishing 1 selected page', `Pages bulk unpublish cancel action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmLabel === 'Confirm unpublishing 1 selected page', `Pages bulk unpublish confirm action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelDisabled === false, `Pages bulk unpublish cancel action should be available before unpublishing starts: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmDisabled === false, `Pages bulk unpublish confirm action should be available before unpublishing starts: ${JSON.stringify(semantics)}`);

  const escapeResult = await evaluate(client, `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return {
      stillOpen: Boolean(document.querySelector('[data-testid="pages-bulk-unpublish-modal"]')),
      path: window.location.pathname,
    };
  })()`);
  assert(escapeResult.path === '/pages', `Pages bulk unpublish Escape recovery navigated unexpectedly: ${JSON.stringify(escapeResult)}`);
  await waitForPagesBulkUnpublishDialogClosed(client, 'Escape');

  await openPagesBulkUnpublishDialog(client, page);
  const cancelResult = await evaluate(client, `(() => {
    const cancelButton = document.querySelector('[data-testid="pages-bulk-unpublish-cancel-button"]');
    if (!(cancelButton instanceof HTMLButtonElement) || cancelButton.disabled) {
      return { ok: false, found: Boolean(cancelButton), disabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null };
    }
    cancelButton.click();
    return { ok: true };
  })()`);
  assert(cancelResult.ok, `Pages bulk unpublish cancel button was not clickable: ${JSON.stringify(cancelResult)}`);
  await waitForPagesBulkUnpublishDialogClosed(client, 'Cancel');
  await clearVisibleBulkSelection(client);

  return { prepared: firstOpen.prepared, semantics };
};

const openPagesBulkArchiveDialog = async (client, page) => {
  await waitForPagesArchiveRow(client, page);
  await clearVisibleBulkSelection(client);

  let prepared = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    prepared = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const checkbox = document.querySelector(${JSON.stringify(`[data-testid="pages-select-${page.id}"]`)});
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      if (checkbox instanceof HTMLInputElement && !checkbox.checked && !checkbox.disabled) {
        checkbox.click();
      }
      if (select instanceof HTMLSelectElement && select.value !== 'archive' && !select.disabled) {
        setSelectValue(select, 'archive');
      }
      return {
        prepared: Boolean(checkbox && select),
        checked: checkbox instanceof HTMLInputElement ? checkbox.checked : false,
        checkboxDisabled: checkbox instanceof HTMLInputElement ? checkbox.disabled : null,
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        selectDisabled: select instanceof HTMLSelectElement ? select.disabled : null,
        applyText: document.querySelector('[data-testid="pages-bulk-action-apply"]')?.textContent || '',
        rowText: row?.textContent || '',
      };
    })()`);
    if (prepared.prepared && prepared.checked && prepared.selectValue === 'archive' && prepared.rowText.includes(page.title)) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`Unable to prepare pages bulk archive controls: ${JSON.stringify(prepared)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const opened = await evaluate(client, `(() => {
      const dialog = document.querySelector('[data-testid="pages-bulk-archive-modal"]');
      const applyButton = dialog ? null : document.querySelector('[data-testid="pages-bulk-action-apply"]');
      if (!dialog && applyButton instanceof HTMLButtonElement && !applyButton.disabled) {
        applyButton.click();
      }
      return {
        hasApply: Boolean(applyButton || dialog),
        applyDisabled: applyButton instanceof HTMLButtonElement ? applyButton.disabled : null,
        dialogOpen: Boolean(dialog),
        applyText: applyButton?.textContent || '',
      };
    })()`);

    if (opened.dialogOpen) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Pages bulk archive dialog did not open: ${JSON.stringify(opened)}`);
    }

    await sleep(150);
  }

  const state = await evaluate(client, `(() => {
    const dialog = document.querySelector('[data-testid="pages-bulk-archive-modal"]');
    const titleNode = document.querySelector('#pages-bulk-archive-confirm-title');
    const description = document.querySelector('#pages-bulk-archive-confirm-description');
    const impact = document.querySelector('#pages-bulk-archive-confirm-impact');
    const cancelButton = document.querySelector('[data-testid="pages-bulk-archive-cancel-button"]');
    const confirmButton = document.querySelector('[data-testid="pages-bulk-archive-confirm-button"]');
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
  assert(state.ok, `Pages bulk archive dialog did not expose semantics after open: ${JSON.stringify(state)}`);
  return { prepared, state };
};

const waitForPagesBulkArchiveDialogClosed = async (client, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      open: Boolean(document.querySelector('[data-testid="pages-bulk-archive-modal"]')),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (!state.open) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Pages bulk archive dialog did not close after ${label}`);
};

const assertPagesBulkArchiveDialogRecovery = async (client, page) => {
  const firstOpen = await openPagesBulkArchiveDialog(client, page);
  const semantics = firstOpen.state;
  assert(firstOpen.prepared.applyText === 'Review archive for 1 page', `Pages bulk archive apply button should review before archive: ${JSON.stringify(firstOpen.prepared)}`);
  assert(semantics.role === 'dialog', `Pages bulk archive confirmation must use role=dialog: ${JSON.stringify(semantics)}`);
  assert(semantics.modal === 'true', `Pages bulk archive confirmation must be modal: ${JSON.stringify(semantics)}`);
  assert(semantics.labelledBy === 'pages-bulk-archive-confirm-title', `Pages bulk archive confirmation must link its title: ${JSON.stringify(semantics)}`);
  assert(
    semantics.describedBy === 'pages-bulk-archive-confirm-description pages-bulk-archive-confirm-impact',
    `Pages bulk archive confirmation must describe archive impact and selected pages: ${JSON.stringify(semantics)}`,
  );
  assert(semantics.title.includes('Archive 1 selected page?'), `Pages bulk archive confirmation title did not name selected count: ${JSON.stringify(semantics)}`);
  assert(semantics.description.includes('move these pages out of active authoring'), `Pages bulk archive confirmation did not explain authoring impact: ${JSON.stringify(semantics)}`);
  assert(semantics.impact.includes(page.title) && semantics.impact.includes('Moved to archive after confirm'), `Pages bulk archive confirmation did not list selected page impact: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelLabel === 'Cancel archiving 1 selected page', `Pages bulk archive cancel action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmLabel === 'Confirm archiving 1 selected page', `Pages bulk archive confirm action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelDisabled === false, `Pages bulk archive cancel action should be available before archiving starts: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmDisabled === false, `Pages bulk archive confirm action should be available before archiving starts: ${JSON.stringify(semantics)}`);

  const escapeResult = await evaluate(client, `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return {
      stillOpen: Boolean(document.querySelector('[data-testid="pages-bulk-archive-modal"]')),
      path: window.location.pathname,
    };
  })()`);
  assert(escapeResult.path === '/pages', `Pages bulk archive Escape recovery navigated unexpectedly: ${JSON.stringify(escapeResult)}`);
  await waitForPagesBulkArchiveDialogClosed(client, 'Escape');

  await openPagesBulkArchiveDialog(client, page);
  const cancelResult = await evaluate(client, `(() => {
    const cancelButton = document.querySelector('[data-testid="pages-bulk-archive-cancel-button"]');
    if (!(cancelButton instanceof HTMLButtonElement) || cancelButton.disabled) {
      return { ok: false, found: Boolean(cancelButton), disabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null };
    }
    cancelButton.click();
    return { ok: true };
  })()`);
  assert(cancelResult.ok, `Pages bulk archive cancel button was not clickable: ${JSON.stringify(cancelResult)}`);
  await waitForPagesBulkArchiveDialogClosed(client, 'Cancel');
  await clearVisibleBulkSelection(client);

  return { prepared: firstOpen.prepared, semantics };
};

const openPagesBulkDeleteDialog = async (client, page) => {
  await waitForPagesListRow(client, page);
  await clearVisibleBulkSelection(client);

  let prepared = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    prepared = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const checkbox = document.querySelector(${JSON.stringify(`[data-testid="pages-select-${page.id}"]`)});
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      if (checkbox instanceof HTMLInputElement && !checkbox.checked && !checkbox.disabled) {
        checkbox.click();
      }
      if (select instanceof HTMLSelectElement && select.value !== 'delete' && !select.disabled) {
        setSelectValue(select, 'delete');
      }
      return {
        prepared: Boolean(checkbox && select),
        checked: checkbox instanceof HTMLInputElement ? checkbox.checked : false,
        checkboxDisabled: checkbox instanceof HTMLInputElement ? checkbox.disabled : null,
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        selectDisabled: select instanceof HTMLSelectElement ? select.disabled : null,
        applyText: document.querySelector('[data-testid="pages-bulk-action-apply"]')?.textContent || '',
        rowText: row?.textContent || '',
      };
    })()`);
    if (prepared.prepared && prepared.checked && prepared.selectValue === 'delete' && prepared.rowText.includes(page.title)) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`Unable to prepare pages bulk delete controls: ${JSON.stringify(prepared)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const opened = await evaluate(client, `(() => {
      const dialog = document.querySelector('[data-testid="pages-bulk-delete-confirm-dialog"]');
      const applyButton = dialog ? null : document.querySelector('[data-testid="pages-bulk-action-apply"]');
      if (!dialog && applyButton instanceof HTMLButtonElement && !applyButton.disabled) {
        applyButton.click();
      }
      return {
        hasApply: Boolean(applyButton || dialog),
        applyDisabled: applyButton instanceof HTMLButtonElement ? applyButton.disabled : null,
        dialogOpen: Boolean(dialog),
        applyText: applyButton?.textContent || '',
      };
    })()`);

    if (opened.dialogOpen) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Pages bulk delete dialog did not open: ${JSON.stringify(opened)}`);
    }

    await sleep(150);
  }

  const state = await evaluate(client, `(() => {
    const dialog = document.querySelector('[data-testid="pages-bulk-delete-confirm-dialog"]');
    const titleNode = document.querySelector('#pages-bulk-delete-confirm-title');
    const description = document.querySelector('#pages-bulk-delete-confirm-description');
    const impact = document.querySelector('#pages-bulk-delete-confirm-impact');
    const cancelButton = document.querySelector('[data-testid="pages-bulk-delete-cancel-button"]');
    const confirmButton = document.querySelector('[data-testid="pages-bulk-delete-confirm-button"]');
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
  assert(state.ok, `Pages bulk delete dialog did not expose semantics after open: ${JSON.stringify(state)}`);
  return { prepared, state };
};

const waitForPagesBulkDeleteDialogClosed = async (client, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      open: Boolean(document.querySelector('[data-testid="pages-bulk-delete-confirm-dialog"]')),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (!state.open) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Pages bulk delete dialog did not close after ${label}`);
};

const assertPagesBulkDeleteDialogRecovery = async (client, page) => {
  const firstOpen = await openPagesBulkDeleteDialog(client, page);
  const semantics = firstOpen.state;
  assert(semantics.role === 'dialog', `Pages bulk delete confirmation must use role=dialog: ${JSON.stringify(semantics)}`);
  assert(semantics.modal === 'true', `Pages bulk delete confirmation must be modal: ${JSON.stringify(semantics)}`);
  assert(semantics.labelledBy === 'pages-bulk-delete-confirm-title', `Pages bulk delete confirmation must link its title: ${JSON.stringify(semantics)}`);
  assert(
    semantics.describedBy === 'pages-bulk-delete-confirm-description pages-bulk-delete-confirm-impact',
    `Pages bulk delete confirmation must describe API impact and selected count: ${JSON.stringify(semantics)}`,
  );
  assert(semantics.title.includes('Delete 1 selected page?'), `Pages bulk delete confirmation title did not name selected count: ${JSON.stringify(semantics)}`);
  assert(semantics.description.includes('removed from the site and from frontend API delivery'), `Pages bulk delete confirmation did not explain frontend API impact: ${JSON.stringify(semantics)}`);
  assert(semantics.impact.includes('Selected: 1'), `Pages bulk delete confirmation did not expose selected count impact: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelLabel === 'Cancel deleting 1 selected page', `Pages bulk delete cancel action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmLabel === 'Confirm deleting 1 selected page', `Pages bulk delete confirm action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelDisabled === false, `Pages bulk delete cancel action should be available before deletion starts: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmDisabled === false, `Pages bulk delete confirm action should be available before deletion starts: ${JSON.stringify(semantics)}`);

  const escapeResult = await evaluate(client, `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return {
      stillOpen: Boolean(document.querySelector('[data-testid="pages-bulk-delete-confirm-dialog"]')),
      path: window.location.pathname,
    };
  })()`);
  assert(escapeResult.path === '/pages', `Pages bulk delete Escape recovery navigated unexpectedly: ${JSON.stringify(escapeResult)}`);
  await waitForPagesBulkDeleteDialogClosed(client, 'Escape');

  await openPagesBulkDeleteDialog(client, page);
  const cancelResult = await evaluate(client, `(() => {
    const cancelButton = document.querySelector('[data-testid="pages-bulk-delete-cancel-button"]');
    if (!(cancelButton instanceof HTMLButtonElement) || cancelButton.disabled) {
      return { ok: false, found: Boolean(cancelButton), disabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null };
    }
    cancelButton.click();
    return { ok: true };
  })()`);
  assert(cancelResult.ok, `Pages bulk delete cancel button was not clickable: ${JSON.stringify(cancelResult)}`);
  await waitForPagesBulkDeleteDialogClosed(client, 'Cancel');
  await clearVisibleBulkSelection(client);

  return { prepared: firstOpen.prepared, semantics };
};

const openPagesBulkPublishDialog = async (client, page) => {
  await waitForPagesListRow(client, page);
  await clearVisibleBulkSelection(client);

  let prepared = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    prepared = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const checkbox = document.querySelector(${JSON.stringify(`[data-testid="pages-select-${page.id}"]`)});
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      if (checkbox instanceof HTMLInputElement && !checkbox.checked && !checkbox.disabled) {
        checkbox.click();
      }
      if (select instanceof HTMLSelectElement && select.value !== 'publish' && !select.disabled) {
        setSelectValue(select, 'publish');
      }
      return {
        prepared: Boolean(checkbox && select),
        checked: checkbox instanceof HTMLInputElement ? checkbox.checked : false,
        checkboxDisabled: checkbox instanceof HTMLInputElement ? checkbox.disabled : null,
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        selectDisabled: select instanceof HTMLSelectElement ? select.disabled : null,
        applyText: document.querySelector('[data-testid="pages-bulk-action-apply"]')?.textContent || '',
        rowText: row?.textContent || '',
      };
    })()`);
    if (prepared.prepared && prepared.checked && prepared.selectValue === 'publish' && prepared.rowText.includes(page.title)) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`Unable to prepare pages bulk publish controls: ${JSON.stringify(prepared)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const opened = await evaluate(client, `(() => {
      const dialog = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
      const applyButton = dialog ? null : document.querySelector('[data-testid="pages-bulk-action-apply"]');
      if (!dialog && applyButton instanceof HTMLButtonElement && !applyButton.disabled) {
        applyButton.click();
      }
      return {
        hasApply: Boolean(applyButton || dialog),
        applyDisabled: applyButton instanceof HTMLButtonElement ? applyButton.disabled : null,
        dialogOpen: Boolean(dialog),
        applyText: applyButton?.textContent || '',
      };
    })()`);

    if (opened.dialogOpen) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Pages bulk publish dialog did not open: ${JSON.stringify(opened)}`);
    }

    await sleep(150);
  }

  const state = await evaluate(client, `(() => {
    const dialog = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
    const titleNode = document.querySelector('#pages-bulk-publish-confirm-title');
    const description = document.querySelector('#pages-bulk-publish-confirm-description');
    const impact = document.querySelector('#pages-bulk-publish-confirm-impact');
    const cancelButton = document.querySelector('[data-testid="pages-bulk-publish-cancel-button"]');
    const confirmButton = document.querySelector('[data-testid="pages-bulk-publish-confirm-button"]');
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
  assert(state.ok, `Pages bulk publish dialog did not expose semantics after open: ${JSON.stringify(state)}`);
  return { prepared, state };
};

const waitForPagesBulkPublishDialogClosed = async (client, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      open: Boolean(document.querySelector('[data-testid="pages-bulk-publish-modal"]')),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (!state.open) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Pages bulk publish dialog did not close after ${label}`);
};

const assertPagesBulkPublishDialogRecovery = async (client, page) => {
  const firstOpen = await openPagesBulkPublishDialog(client, page);
  const semantics = firstOpen.state;
  assert(semantics.role === 'dialog', `Pages bulk publish confirmation must use role=dialog: ${JSON.stringify(semantics)}`);
  assert(semantics.modal === 'true', `Pages bulk publish confirmation must be modal: ${JSON.stringify(semantics)}`);
  assert(semantics.labelledBy === 'pages-bulk-publish-confirm-title', `Pages bulk publish confirmation must link its title: ${JSON.stringify(semantics)}`);
  assert(
    semantics.describedBy === 'pages-bulk-publish-confirm-description pages-bulk-publish-confirm-impact',
    `Pages bulk publish confirmation must describe readiness impact and selected pages: ${JSON.stringify(semantics)}`,
  );
  assert(semantics.title.includes('Publish 1 selected page?'), `Pages bulk publish confirmation title did not name selected count: ${JSON.stringify(semantics)}`);
  assert(semantics.description.includes('run readiness again before publishing'), `Pages bulk publish confirmation did not explain readiness impact: ${JSON.stringify(semantics)}`);
  assert(semantics.impact.includes(page.title), `Pages bulk publish confirmation did not list the selected page: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelLabel === 'Cancel publishing 1 selected page', `Pages bulk publish cancel action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmLabel === 'Confirm publishing 1 selected page', `Pages bulk publish confirm action lacks an explicit label: ${JSON.stringify(semantics)}`);
  assert(semantics.cancelDisabled === false, `Pages bulk publish cancel action should be available before publishing starts: ${JSON.stringify(semantics)}`);
  assert(semantics.confirmDisabled === false, `Pages bulk publish confirm action should be available before publishing starts: ${JSON.stringify(semantics)}`);

  const escapeResult = await evaluate(client, `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return {
      stillOpen: Boolean(document.querySelector('[data-testid="pages-bulk-publish-modal"]')),
      path: window.location.pathname,
    };
  })()`);
  assert(escapeResult.path === '/pages', `Pages bulk publish Escape recovery navigated unexpectedly: ${JSON.stringify(escapeResult)}`);
  await waitForPagesBulkPublishDialogClosed(client, 'Escape');

  await openPagesBulkPublishDialog(client, page);
  const cancelResult = await evaluate(client, `(() => {
    const cancelButton = document.querySelector('[data-testid="pages-bulk-publish-cancel-button"]');
    if (!(cancelButton instanceof HTMLButtonElement) || cancelButton.disabled) {
      return { ok: false, found: Boolean(cancelButton), disabled: cancelButton instanceof HTMLButtonElement ? cancelButton.disabled : null };
    }
    cancelButton.click();
    return { ok: true };
  })()`);
  assert(cancelResult.ok, `Pages bulk publish cancel button was not clickable: ${JSON.stringify(cancelResult)}`);
  await waitForPagesBulkPublishDialogClosed(client, 'Cancel');
  await clearVisibleBulkSelection(client);

  return { prepared: firstOpen.prepared, semantics };
};

const isExpectedBrowserError = (params) => {
  const entry = params?.entry || {};
  const text = String(entry.text || '');
  const url = String(entry.url || '');

  return (
    entry.source === 'network' &&
    /403 \(Forbidden\)/i.test(text) &&
    /\/api\/admin\/settings(?:$|\?)/.test(url)
  );
};

const assertEditButtonOpensFocusedCanvas = async (client, page) => {
  const query = new URLSearchParams({
    siteId: HIERARCHY_SITE_ID,
    q: page.title,
  });
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/pages?${query.toString()}` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
      hasRow: document.body?.innerText?.includes(${JSON.stringify(page.title)}) || false,
      path: window.location.pathname,
      loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
      editFound: Boolean(Array.from(document.querySelectorAll('button')).find((candidate) => (
        candidate.getAttribute('data-testid') === ${JSON.stringify(`pages-edit-${page.id}`)}
      ))),
      editDisabled: Array.from(document.querySelectorAll('button')).find((candidate) => (
        candidate.getAttribute('data-testid') === ${JSON.stringify(`pages-edit-${page.id}`)}
      ))?.disabled ?? null,
      body: document.body?.innerText?.slice(0, 600) || '',
    }))()`);
    if (state.ready && !state.loading && state.hasRow && state.path === '/pages' && state.editFound && state.editDisabled === false) {
      break;
    }
    if (attempt === 119) {
      throw new Error(`Pages list did not load before edit focus assertion: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  const clicked = await evaluate(client, `((pageId) => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      candidate.getAttribute('data-testid') === \`pages-edit-\${pageId}\`
    ));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, found: Boolean(button), disabled: button instanceof HTMLButtonElement ? button.disabled : null };
    }
    button.click();
    return { ok: true };
  })(${JSON.stringify(page.id)})`);
  assert(clicked.ok, `Pages edit button was not ready: ${JSON.stringify(clicked)}`);

  let focused = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    focused = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      focusBanner: Boolean(document.querySelector('[data-testid="page-editor-focus-banner"]')),
      focusDensity: document.querySelector('[data-testid="page-editor-focus-banner"]')?.getAttribute('data-density') || '',
      commandCenter: Boolean(document.querySelector('[data-testid="page-editor-command-center"]')),
      canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
      shellFocusMode: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-focus-mode') || '',
      componentPanelVisible: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-component-panel-visible') || '',
      inspectorPanelVisible: document.querySelector('[data-testid="editor-shell-layout"]')?.getAttribute('data-inspector-panel-visible') || '',
      componentLibrary: Boolean(document.querySelector('[data-testid="editor-component-library"]')),
      inspector: Boolean(document.querySelector('[data-testid="editor-inspector"]')),
      adminSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
      adminHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
      focusShowPanelsState: document.querySelector('[data-testid="page-editor-focus-banner-show-panels"]')?.getAttribute('data-action-state') || '',
      focusShowPanelsStatus: document.querySelector('[data-testid="page-editor-focus-banner-show-panels"]')?.getAttribute('data-action-status') || '',
      body: document.body?.innerText?.slice(0, 700) || '',
    }))()`);

    if (
      focused.path === `/pages/${page.id}/edit` &&
      focused.search.includes('focus=canvas') &&
      focused.focusBanner &&
      focused.focusDensity === 'compact' &&
      focused.canvas &&
      focused.shellFocusMode === 'true' &&
      focused.componentPanelVisible === 'false' &&
      focused.inspectorPanelVisible === 'false' &&
      !focused.componentLibrary &&
      !focused.inspector &&
      !focused.commandCenter &&
      !focused.adminSidebar &&
      !focused.adminHeader &&
      focused.focusShowPanelsState === 'ready' &&
      /Show page panels available/i.test(focused.focusShowPanelsStatus)
    ) {
      break;
    }

    if (attempt === 99) {
      throw new Error(`Pages edit button did not open focused canvas editor: ${JSON.stringify(focused)}`);
    }

    await sleep(250);
  }

  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}` });

  return focused;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-pages-list-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, hierarchyPages, viewerUserId }) => {
  if (hierarchyPages?.childPage?.id) {
    try {
      await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${hierarchyPages.childPage.id}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke child page ${hierarchyPages.childPage.id}:`, error instanceof Error ? error.message : error);
    }
  }

  if (hierarchyPages?.parentPage?.id) {
    try {
      await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${hierarchyPages.parentPage.id}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke parent page ${hierarchyPages.parentPage.id}:`, error instanceof Error ? error.message : error);
    }
  }

  if (viewerUserId) {
    try {
      await deleteUser(viewerUserId);
    } catch (error) {
      console.warn(`Unable to delete smoke viewer user ${viewerUserId}:`, error instanceof Error ? error.message : error);
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

  if (childProcess && childProcess.exitCode === null && childProcess.signalCode === null) {
    childProcess.kill('SIGTERM');
    const exited = await waitForExit(childProcess);
    if (!exited) {
      childProcess.kill('SIGKILL');
      await waitForExit(childProcess, 500);
    }
  }

  if (userDataDir) {
    await removeDirectoryWithRetry(userDataDir);
  }
};

const runPagesDeleteDialogSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;
  let restoredQuotaState = null;

  try {
    restoredQuotaState = await temporarilyAllowPagesListSeedQuota(2);
    hierarchyPages = await createHierarchyPages();
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages delete dialog smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const deleteDialog = await assertPagesDeleteDialogRecovery(client, hierarchyPages.childPage);
    const pagesAfterRecovery = await listPages(HIERARCHY_SITE_ID);
    assert(
      pagesAfterRecovery.some((pageRecord) => pageRecord.id === hierarchyPages.childPage.id),
      'Pages delete dialog Escape/cancel recovery removed the smoke child page unexpectedly.',
    );

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-delete-dialog',
      siteId: HIERARCHY_SITE_ID,
      pageId: hierarchyPages.childPage.id,
      slug: hierarchyPages.childPage.slug,
      deleteDialog,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages });
    await restorePagesListSeedQuota(restoredQuotaState);
  }
};

const runPagesPublishDialogSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;
  let restoredQuotaState = null;

  try {
    restoredQuotaState = await temporarilyAllowPagesListSeedQuota(2);
    hierarchyPages = await createHierarchyPages();
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages publish dialog smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const publishDialog = await assertPagesPublishDialogRecovery(client, hierarchyPages.childPage);
    const pagesAfterRecovery = await listPages(HIERARCHY_SITE_ID);
    const childAfterRecovery = pagesAfterRecovery.find((pageRecord) => pageRecord.id === hierarchyPages.childPage.id);
    assert(childAfterRecovery, 'Pages publish dialog Escape/cancel recovery removed the smoke child page unexpectedly.');
    assert(childAfterRecovery.status === 'draft', `Pages publish dialog Escape/cancel recovery changed page status: ${JSON.stringify(childAfterRecovery).slice(0, 500)}`);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-publish-dialog',
      siteId: HIERARCHY_SITE_ID,
      pageId: hierarchyPages.childPage.id,
      slug: hierarchyPages.childPage.slug,
      status: childAfterRecovery.status,
      publishDialog,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages });
    await restorePagesListSeedQuota(restoredQuotaState);
  }
};

const runPagesUnpublishDialogSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;
  let restoredQuotaState = null;

  try {
    restoredQuotaState = await temporarilyAllowPagesListSeedQuota(2);
    hierarchyPages = await createHierarchyPages();
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages unpublish dialog smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const unpublishDialog = await assertPagesUnpublishDialogRecovery(client, hierarchyPages.parentPage);
    const pagesAfterRecovery = await listPages(HIERARCHY_SITE_ID);
    const parentAfterRecovery = pagesAfterRecovery.find((pageRecord) => pageRecord.id === hierarchyPages.parentPage.id);
    assert(parentAfterRecovery, 'Pages unpublish dialog Escape/cancel recovery removed the smoke parent page unexpectedly.');
    assert(parentAfterRecovery.status === 'published', `Pages unpublish dialog Escape/cancel recovery changed page status: ${JSON.stringify(parentAfterRecovery).slice(0, 500)}`);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-unpublish-dialog',
      siteId: HIERARCHY_SITE_ID,
      pageId: hierarchyPages.parentPage.id,
      slug: hierarchyPages.parentPage.slug,
      status: parentAfterRecovery.status,
      unpublishDialog,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages });
    await restorePagesListSeedQuota(restoredQuotaState);
  }
};

const runPagesBulkUnpublishDialogSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;
  let restoredQuotaState = null;

  try {
    restoredQuotaState = await temporarilyAllowPagesListSeedQuota(2);
    hierarchyPages = await createHierarchyPages();
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages bulk unpublish dialog smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const bulkUnpublishDialog = await assertPagesBulkUnpublishDialogRecovery(client, hierarchyPages.parentPage);
    const pagesAfterRecovery = await listPages(HIERARCHY_SITE_ID);
    const parentAfterRecovery = pagesAfterRecovery.find((pageRecord) => pageRecord.id === hierarchyPages.parentPage.id);
    assert(parentAfterRecovery, 'Pages bulk unpublish dialog Escape/cancel recovery removed the smoke parent page unexpectedly.');
    assert(parentAfterRecovery.status === 'published', `Pages bulk unpublish dialog Escape/cancel recovery changed page status: ${JSON.stringify(parentAfterRecovery).slice(0, 500)}`);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-bulk-unpublish-dialog',
      siteId: HIERARCHY_SITE_ID,
      pageId: hierarchyPages.parentPage.id,
      slug: hierarchyPages.parentPage.slug,
      status: parentAfterRecovery.status,
      bulkUnpublishDialog,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages });
    await restorePagesListSeedQuota(restoredQuotaState);
  }
};

const runPagesBulkArchiveDialogSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;
  let restoredQuotaState = null;

  try {
    restoredQuotaState = await temporarilyAllowPagesListSeedQuota(2);
    hierarchyPages = await createHierarchyPages();
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages bulk archive dialog smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const bulkArchiveDialog = await assertPagesBulkArchiveDialogRecovery(client, hierarchyPages.parentPage);
    const pagesAfterRecovery = await listPages(HIERARCHY_SITE_ID);
    const parentAfterRecovery = pagesAfterRecovery.find((pageRecord) => pageRecord.id === hierarchyPages.parentPage.id);
    assert(parentAfterRecovery, 'Pages bulk archive dialog Escape/cancel recovery removed the smoke parent page unexpectedly.');
    assert(parentAfterRecovery.status === 'published', `Pages bulk archive dialog Escape/cancel recovery changed page status: ${JSON.stringify(parentAfterRecovery).slice(0, 500)}`);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-bulk-archive-dialog',
      siteId: HIERARCHY_SITE_ID,
      pageId: hierarchyPages.parentPage.id,
      slug: hierarchyPages.parentPage.slug,
      status: parentAfterRecovery.status,
      bulkArchiveDialog,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages });
    await restorePagesListSeedQuota(restoredQuotaState);
  }
};

const runPagesArchiveDialogSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;
  let restoredQuotaState = null;

  try {
    restoredQuotaState = await temporarilyAllowPagesListSeedQuota(2);
    hierarchyPages = await createHierarchyPages();
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages archive dialog smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const archiveDialog = await assertPagesArchiveDialogRecovery(client, hierarchyPages.parentPage);
    const pagesAfterRecovery = await listPages(HIERARCHY_SITE_ID);
    const parentAfterRecovery = pagesAfterRecovery.find((pageRecord) => pageRecord.id === hierarchyPages.parentPage.id);
    assert(parentAfterRecovery, 'Pages archive dialog Escape/cancel recovery removed the smoke parent page unexpectedly.');
    assert(parentAfterRecovery.status === 'published', `Pages archive dialog Escape/cancel recovery changed page status: ${JSON.stringify(parentAfterRecovery).slice(0, 500)}`);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-archive-dialog',
      siteId: HIERARCHY_SITE_ID,
      pageId: hierarchyPages.parentPage.id,
      slug: hierarchyPages.parentPage.slug,
      status: parentAfterRecovery.status,
      archiveDialog,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages });
    await restorePagesListSeedQuota(restoredQuotaState);
  }
};

const runPagesBulkDeleteDialogSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;
  let restoredQuotaState = null;

  try {
    restoredQuotaState = await temporarilyAllowPagesListSeedQuota(2);
    hierarchyPages = await createHierarchyPages();
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages bulk delete dialog smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const bulkDeleteDialog = await assertPagesBulkDeleteDialogRecovery(client, hierarchyPages.childPage);
    const pagesAfterRecovery = await listPages(HIERARCHY_SITE_ID);
    assert(
      pagesAfterRecovery.some((pageRecord) => pageRecord.id === hierarchyPages.childPage.id),
      'Pages bulk delete dialog Escape/cancel recovery removed the smoke child page unexpectedly.',
    );

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-bulk-delete-dialog',
      siteId: HIERARCHY_SITE_ID,
      pageId: hierarchyPages.childPage.id,
      slug: hierarchyPages.childPage.slug,
      bulkDeleteDialog,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages });
    await restorePagesListSeedQuota(restoredQuotaState);
  }
};

const runPagesBulkPublishDialogSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;
  let restoredQuotaState = null;

  try {
    restoredQuotaState = await temporarilyAllowPagesListSeedQuota(2);
    hierarchyPages = await createHierarchyPages();
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages bulk publish dialog smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const bulkPublishDialog = await assertPagesBulkPublishDialogRecovery(client, hierarchyPages.childPage);
    const pagesAfterRecovery = await listPages(HIERARCHY_SITE_ID);
    const childAfterRecovery = pagesAfterRecovery.find((pageRecord) => pageRecord.id === hierarchyPages.childPage.id);
    assert(childAfterRecovery, 'Pages bulk publish dialog Escape/cancel recovery removed the smoke child page unexpectedly.');
    assert(childAfterRecovery.status === 'draft', `Pages bulk publish dialog Escape/cancel recovery changed page status: ${JSON.stringify(childAfterRecovery).slice(0, 500)}`);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-bulk-publish-dialog',
      siteId: HIERARCHY_SITE_ID,
      pageId: hierarchyPages.childPage.id,
      slug: hierarchyPages.childPage.slug,
      status: childAfterRecovery.status,
      bulkPublishDialog,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages });
    await restorePagesListSeedQuota(restoredQuotaState);
  }
};

const runPagesRowActionLabelSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;
  let restoredQuotaState = null;

  try {
    restoredQuotaState = await temporarilyAllowPagesListSeedQuota(2);
    hierarchyPages = await createHierarchyPages();
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages row action label smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const rowActionLabels = await assertPagesRowActionLabels(client, {
      draftPage: hierarchyPages.childPage,
      publishedPage: hierarchyPages.parentPage,
    });
    const commandSecondaryEmptyExportState = await assertPagesCommandSecondaryEmptyExportState(client);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-row-action-labels',
      siteId: HIERARCHY_SITE_ID,
      draftPageId: hierarchyPages.childPage.id,
      publishedPageId: hierarchyPages.parentPage.id,
      rowActionLabels,
      commandSecondaryEmptyExportState,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages });
    await restorePagesListSeedQuota(restoredQuotaState);
  }
};

const runPagesDataGridPaginationSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;

  try {
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages DataGrid pagination smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const dataGridPagination = await assertPagesDataGridPaginationControls(client);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-datagrid-pagination',
      siteId: HIERARCHY_SITE_ID,
      currentPage: dataGridPagination.secondPage.currentPage,
      totalPages: dataGridPagination.secondPage.totalPages,
      dataGridPagination,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir });
  }
};

const runPagesDataGridSortSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;

  try {
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages DataGrid sort smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const dataGridSort = await assertPagesDataGridSortControls(client);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-datagrid-sort',
      siteId: HIERARCHY_SITE_ID,
      activeSort: dataGridSort.titleDesc.activeSort,
      search: dataGridSort.titleDesc.search,
      dataGridSort,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir });
  }
};

const runPagesDataGridHeaderSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;

  try {
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages DataGrid header smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const dataGridHeaders = await assertPagesDataGridHeaderSemantics(client);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-datagrid-headers',
      siteId: HIERARCHY_SITE_ID,
      headerCount: dataGridHeaders.headerCount,
      cellCount: dataGridHeaders.cellCount,
      actionHeader: dataGridHeaders.headers.find((header) => header.key === 'actions'),
      dataGridHeaders,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir });
  }
};

const runPagesBulkSelectionStatusSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;

  try {
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages bulk selection status smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const bulkSelection = await assertPagesBulkSelectionStatus(client);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-bulk-selection-status',
      siteId: HIERARCHY_SITE_ID,
      initialStatus: bulkSelection.initial.statusText,
      allFilteredStatus: bulkSelection.allFiltered.statusText,
      finalStatus: bulkSelection.finalState.statusText,
      bulkSelection,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir });
  }
};

const runPagesBulkActionStatusSmoke = async (adminLogin) => {
  const { childProcess, userDataDir } = launchChrome();
  let client;

  try {
    const page = await waitForUsablePageTarget();
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found for pages bulk action status smoke');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });

    const bulkActionStatus = await assertPagesBulkActionStatus(client);

    console.log(JSON.stringify({
      ok: true,
      guard: 'pages-list-bulk-action-status',
      siteId: HIERARCHY_SITE_ID,
      initialStatus: bulkActionStatus.initial.bulkActionStatusText,
      readyStatus: bulkActionStatus.archiveReady.bulkActionStatusText,
      clearedStatus: bulkActionStatus.clearedWithAction.bulkActionStatusText,
      bulkActionStatus,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir });
  }
};

const main = async () => {
  assertPagesListSourceContract();
  assertSharedDataGridSourceContract();
  if (process.env.BACKY_PAGES_LIST_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, guard: 'pages-list-source' }));
    return;
  }
  const adminLogin = await loginAdminApi();
  if (process.env.BACKY_PAGES_LIST_ROW_ACTION_LABEL_SMOKE === '1') {
    await runPagesRowActionLabelSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_DATAGRID_PAGINATION_SMOKE === '1') {
    await runPagesDataGridPaginationSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_DATAGRID_SORT_SMOKE === '1') {
    await runPagesDataGridSortSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_DATAGRID_HEADER_SMOKE === '1') {
    await runPagesDataGridHeaderSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_BULK_SELECTION_STATUS_SMOKE === '1') {
    await runPagesBulkSelectionStatusSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_BULK_ACTION_STATUS_SMOKE === '1') {
    await runPagesBulkActionStatusSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_PUBLISH_DIALOG_SMOKE === '1') {
    await runPagesPublishDialogSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_UNPUBLISH_DIALOG_SMOKE === '1') {
    await runPagesUnpublishDialogSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_ARCHIVE_DIALOG_SMOKE === '1') {
    await runPagesArchiveDialogSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_BULK_UNPUBLISH_DIALOG_SMOKE === '1') {
    await runPagesBulkUnpublishDialogSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_BULK_ARCHIVE_DIALOG_SMOKE === '1') {
    await runPagesBulkArchiveDialogSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_BULK_PUBLISH_DIALOG_SMOKE === '1') {
    await runPagesBulkPublishDialogSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_BULK_DELETE_DIALOG_SMOKE === '1') {
    await runPagesBulkDeleteDialogSmoke(adminLogin);
    return;
  }
  if (process.env.BACKY_PAGES_LIST_DELETE_DIALOG_SMOKE === '1') {
    await runPagesDeleteDialogSmoke(adminLogin);
    return;
  }
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;
  let viewerUserId = null;
  let restoredQuotaState = null;
  const suffix = Date.now().toString(36);

  try {
    const viewer = await createUser({
      fullName: `Pages Viewer ${suffix}`,
      email: `pages-viewer-${suffix}@example.com`,
      role: 'viewer',
      status: 'pending',
    });
    viewerUserId = viewer.id;
    const viewerInvite = await createInviteToken(viewer.id);
    const viewerSession = await acceptInviteToken(viewerInvite.token);
    await assertPageBillingLimitEnforced(suffix);
    restoredQuotaState = await temporarilyAllowPagesListSeedQuota(4);
    hierarchyPages = await createHierarchyPages();
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
      source: authStorageScript(apiAdminSessionToken, adminLogin.user),
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: fetchDiagnosticsScript,
    });

    const initialRender = await waitForPagesEmptyState(client);
    const emptyVisual = await assertPagesVisualState(client, 'pages empty state', VISUAL_SCREENSHOT_PATHS.empty, {
      empty: true,
      expectedText: 'Create a page for this site',
    });
    logProgress('verified pages empty state visual');
    const commandCreate = await clickEmptyCreate(
      client,
      'pages-command-create',
      ['templateSource=backy-canvas', 'focus=canvas'],
      { template: 'blank', homepage: false, allowDisabled: true },
    );
    await waitForPagesEmptyState(client);
    const emptyCreate = await clickEmptyCreate(
      client,
      'pages-empty-create',
      ['templateSource=backy-canvas', 'focus=canvas'],
      { template: 'blank', homepage: false, allowDisabled: true },
    );
    await waitForPagesEmptyState(client);
    const landingShortcut = await clickEmptyCreate(
      client,
      'pages-create-landing',
      ['template=landing'],
      { title: 'Landing page', slug: 'landing', template: 'landing', homepage: false },
    );
    const storefrontShortcut = await clickEmptyCreate(
      client,
      'pages-create-storefront',
      ['template=storefront'],
      { title: 'Storefront', slug: 'store', template: 'storefront', homepage: false },
    );
    const aboutShortcut = await clickEmptyCreate(
      client,
      'pages-create-about',
      ['template=about'],
      { title: 'About', slug: 'about', template: 'about', homepage: false },
    );
    const contactShortcut = await clickEmptyCreate(
      client,
      'pages-create-contact',
      ['template=contact'],
      { title: 'Contact', slug: 'contact', template: 'contact', homepage: false },
    );
    const registrationShortcut = await clickEmptyCreate(
      client,
      'pages-create-registration',
      ['template=registration'],
      { title: 'Member registration', slug: 'register', template: 'registration', homepage: false },
    );
    const newsletterShortcut = await clickEmptyCreate(
      client,
      'pages-create-newsletter',
      ['template=newsletter'],
      { title: 'Newsletter', slug: 'newsletter', template: 'newsletter', homepage: false },
    );
    const surveyShortcut = await clickEmptyCreate(
      client,
      'pages-create-survey',
      ['template=survey'],
      { title: 'Survey', slug: 'survey', template: 'survey', homepage: false },
    );
    const memberLoginShortcut = await clickEmptyCreate(
      client,
      'pages-create-member-login',
      ['template=member-login'],
      { title: 'Member login', slug: 'login', template: 'member-login', homepage: false },
    );
    const memberAccountShortcut = await clickEmptyCreate(
      client,
      'pages-create-member-account',
      ['template=member-account'],
      { title: 'Member account', slug: 'account', template: 'member-account', homepage: false },
    );
    const blogIndexShortcut = await clickEmptyCreate(
      client,
      'pages-create-blog-index',
      ['template=blog-index'],
      { title: 'Blog', slug: 'blog', template: 'blog-index', homepage: false },
    );
    const productDetailShortcut = await clickEmptyCreate(
      client,
      'pages-create-product-detail',
      ['template=product-detail'],
      { title: 'Product detail', slug: 'product', template: 'product-detail', homepage: false },
    );
    const pricingShortcut = await clickEmptyCreate(
      client,
      'pages-create-pricing',
      ['template=pricing'],
      { title: 'Pricing', slug: 'pricing', template: 'pricing', homepage: false },
    );
    const servicesShortcut = await clickEmptyCreate(
      client,
      'pages-create-services',
      ['template=services'],
      { title: 'Services', slug: 'services', template: 'services', homepage: false },
    );
    const bookingShortcut = await clickEmptyCreate(
      client,
      'pages-create-booking',
      ['template=booking'],
      { title: 'Book an appointment', slug: 'booking', template: 'booking', homepage: false },
    );
    const portfolioShortcut = await clickEmptyCreate(
      client,
      'pages-create-portfolio',
      ['template=portfolio'],
      { title: 'Portfolio', slug: 'portfolio', template: 'portfolio', homepage: false },
    );
    const galleryShortcut = await clickEmptyCreate(
      client,
      'pages-create-gallery',
      ['template=gallery'],
      { title: 'Gallery', slug: 'gallery', template: 'gallery', homepage: false },
    );
    const eventsShortcut = await clickEmptyCreate(
      client,
      'pages-create-events',
      ['template=events'],
      { title: 'Events', slug: 'events', template: 'events', homepage: false },
    );
    const privacyShortcut = await clickEmptyCreate(
      client,
      'pages-create-privacy',
      ['template=privacy'],
      { title: 'Privacy policy', slug: 'privacy', template: 'privacy', homepage: false },
    );
    const termsShortcut = await clickEmptyCreate(
      client,
      'pages-create-terms',
      ['template=terms'],
      { title: 'Terms and conditions', slug: 'terms', template: 'terms', homepage: false },
    );
    const cookiePolicyShortcut = await clickEmptyCreate(
      client,
      'pages-create-cookie-policy',
      ['template=cookie-policy'],
      { title: 'Cookie policy', slug: 'cookie-policy', template: 'cookie-policy', homepage: false },
    );
    const accessibilityStatementShortcut = await clickEmptyCreate(
      client,
      'pages-create-accessibility-statement',
      ['template=accessibility-statement'],
      { title: 'Accessibility statement', slug: 'accessibility', template: 'accessibility-statement', homepage: false },
    );
    const refundPolicyShortcut = await clickEmptyCreate(
      client,
      'pages-create-refund-policy',
      ['template=refund-policy'],
      { title: 'Refund policy', slug: 'refund-policy', template: 'refund-policy', homepage: false },
    );
    const shippingPolicyShortcut = await clickEmptyCreate(
      client,
      'pages-create-shipping-policy',
      ['template=shipping-policy'],
      { title: 'Shipping policy', slug: 'shipping-policy', template: 'shipping-policy', homepage: false },
    );
    const cartShortcut = await clickEmptyCreate(
      client,
      'pages-create-cart',
      ['template=cart'],
      { title: 'Cart', slug: 'cart', template: 'cart', homepage: false },
    );
    const checkoutShortcut = await clickEmptyCreate(
      client,
      'pages-create-checkout',
      ['template=checkout'],
      { title: 'Checkout', slug: 'checkout', template: 'checkout', homepage: false },
    );
    const orderConfirmationShortcut = await clickEmptyCreate(
      client,
      'pages-create-order-confirmation',
      ['template=order-confirmation'],
      { title: 'Order confirmation', slug: 'order-confirmation', template: 'order-confirmation', homepage: false },
    );
    const helpCenterShortcut = await clickEmptyCreate(
      client,
      'pages-create-help-center',
      ['template=help-center'],
      { title: 'Help center', slug: 'help', template: 'help-center', homepage: false },
    );
    const blogPostShortcut = await clickEmptyCreate(
      client,
      'pages-create-blog-post',
      ['template=blog-post'],
      { title: 'Article', slug: 'article', template: 'blog-post', homepage: false },
    );
    const teamShortcut = await clickEmptyCreate(
      client,
      'pages-create-team',
      ['template=team'],
      { title: 'Team', slug: 'team', template: 'team', homepage: false },
    );
    const faqShortcut = await clickEmptyCreate(
      client,
      'pages-create-faq',
      ['template=faq'],
      { title: 'FAQ', slug: 'faq', template: 'faq', homepage: false },
    );
    const testimonialsShortcut = await clickEmptyCreate(
      client,
      'pages-create-testimonials',
      ['template=testimonials'],
      { title: 'Testimonials', slug: 'testimonials', template: 'testimonials', homepage: false },
    );
    const careersShortcut = await clickEmptyCreate(
      client,
      'pages-create-careers',
      ['template=careers'],
      { title: 'Careers', slug: 'careers', template: 'careers', homepage: false },
    );
    const childHierarchy = await withSmokeStep('child hierarchy row', () => waitForHierarchyRow(
      client,
      hierarchyPages.childPage,
      `Nested under ${hierarchyPages.parentPage.title}`,
    ));
    const parentHierarchy = await withSmokeStep('parent hierarchy row', () => waitForHierarchyRow(
      client,
      hierarchyPages.parentPage,
      '1 child page',
    ));
    const parentTemplate = await withSmokeStep('parent template row', () => waitForTemplateRow(
      client,
      hierarchyPages.parentPage,
      'Landing',
    ));
    const editFocusedCanvas = await withSmokeStep('edit button focused canvas', () => assertEditButtonOpensFocusedCanvas(
      client,
      hierarchyPages.parentPage,
    ));
    const parentDeliveryHealth = await withSmokeStep('parent delivery health row', () => waitForDeliveryRow(
      client,
      hierarchyPages.parentPage,
      'Health',
    ));
    const deliveryVisual = await withSmokeStep('delivery visual state', () => assertPagesVisualState(client, 'pages delivery row', VISUAL_SCREENSHOT_PATHS.delivery, {
      table: true,
      expectedText: 'Health',
    }));
    const deliveryRefresh = await withSmokeStep('delivery refresh control', () => assertDeliveryRefreshControl(
      client,
      hierarchyPages.parentPage,
    ));
    const childRevisions = await withSmokeStep('child revision row', () => waitForRevisionRow(
      client,
      hierarchyPages.childPage,
      'Pages list revision smoke snapshot',
    ));
    const childRoute = await withSmokeStep('child route row', () => waitForRouteRow(
      client,
      hierarchyPages.childPage,
      'Route is available.',
    ));
    const childDelivery = await withSmokeStep('child delivery row', () => waitForDeliveryRow(
      client,
      hierarchyPages.childPage,
      'Preview Only',
    ));
    const publishReview = await withSmokeStep('publish review modal', () => assertPublishReviewModal(
      client,
      hierarchyPages.childPage,
    ));
    const bulkPublishReview = await withSmokeStep('bulk publish review modal', () => assertBulkPublishReviewModal(
      client,
      hierarchyPages.childPage,
      hierarchyPages.childPage.title,
      VISUAL_SCREENSHOT_PATHS.bulkModal,
    ));
    const bulkPublishMutation = await withSmokeStep('bulk publish mutation', () => assertBulkPublishMutation(
      client,
      hierarchyPages.childPage,
    ));
    const postPublishVisual = await withSmokeStep('post-publish visual state', () => assertPagesVisualState(client, 'pages post-publish table row', VISUAL_SCREENSHOT_PATHS.postPublish, {
      table: true,
      expectedText: 'Published',
    }));
    const viewerRbac = await withSmokeStep('viewer RBAC controls', () => assertViewerRbac(client, viewerSession, hierarchyPages.childPage));

    await captureScreenshot(client, SCREENSHOT_PATH);

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params)
      .filter((params) => !isExpectedBrowserError(params));

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    console.log(JSON.stringify({
      ok: true,
      initialRender,
      visualStates: {
        empty: emptyVisual,
        delivery: deliveryVisual,
        postPublish: postPublishVisual,
      },
      commandCreate,
      emptyCreate,
      landingShortcut,
      storefrontShortcut,
      aboutShortcut,
      contactShortcut,
      newsletterShortcut,
      surveyShortcut,
      registrationShortcut,
      memberLoginShortcut,
      memberAccountShortcut,
      blogIndexShortcut,
      productDetailShortcut,
      pricingShortcut,
      servicesShortcut,
      bookingShortcut,
      portfolioShortcut,
      galleryShortcut,
      eventsShortcut,
      privacyShortcut,
      termsShortcut,
      cookiePolicyShortcut,
      accessibilityStatementShortcut,
      refundPolicyShortcut,
      shippingPolicyShortcut,
      cartShortcut,
      checkoutShortcut,
      orderConfirmationShortcut,
      helpCenterShortcut,
      blogPostShortcut,
      teamShortcut,
      faqShortcut,
      testimonialsShortcut,
      careersShortcut,
      childHierarchy,
      parentHierarchy,
      parentTemplate,
      editFocusedCanvas,
      parentDeliveryHealth,
      deliveryRefresh,
      childRevisions,
      childRoute,
      childDelivery,
      publishReview,
      bulkPublishReview,
      bulkPublishMutation,
      viewerRbac: {
        headerCreateDisabled: viewerRbac.headerCreateDisabled,
        rowCheckboxesDisabled: viewerRbac.rowCheckboxesDisabled,
        editDisabled: viewerRbac.editDisabled,
        deleteDisabled: viewerRbac.deleteDisabled,
      },
      visualScreenshotPaths: VISUAL_SCREENSHOT_PATHS,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await restorePagesListSeedQuota(restoredQuotaState).catch((error) => {
      console.warn('Unable to restore pages list seed quota:', error instanceof Error ? error.message : error);
    });
    await cleanup({ client, childProcess, userDataDir, hierarchyPages, viewerUserId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

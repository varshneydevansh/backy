#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_USERS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_USERS_CDP_PORT || 9382);
const SCREENSHOT_PATH = process.env.BACKY_USERS_SCREENSHOT || path.join(os.tmpdir(), 'backy-users-smoke.png');
let apiAdminSessionToken = '';

const getSmokeMfaCode = () => (
  process.env.BACKY_USERS_SMOKE_MFA_CODE ||
  process.env.BACKY_ADMIN_MFA_CODE ||
  process.env.BACKY_ADMIN_2FA_CODE ||
  'backy-dev-mfa'
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertUsersEmptyStatesUseSharedComponent = () => {
  const source = fs.readFileSync(new URL('../src/routes/users.tsx', import.meta.url), 'utf8');
  const createSource = fs.readFileSync(new URL('../src/routes/users.new.tsx', import.meta.url), 'utf8');
  const detailSource = fs.readFileSync(new URL('../src/routes/users.$userId.tsx', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Users route must use the shared EmptyState component');
  assert(source.includes('title="No user audit events yet"'), 'Users audit panel must keep the empty audit title visible');
  assert(source.includes('Create, update, import, delete, or review users to populate this access timeline.'), 'Users audit empty state must explain which actions populate the timeline');
  assert(!source.includes('window.confirm'), 'Users route must not use browser confirm dialogs for account mutations or import rollback');
  assert(!source.includes('title="Next controls"') && !source.includes('Backlog for parity'), 'Users route must not expose stale backlog panels in the product UI');
  assert(
      !source.includes('remain future work') &&
      !source.includes('not complete yet') &&
      !source.includes('not yet public member APIs') &&
      !source.includes('credentialed member auth is not wired yet') &&
      !source.includes('Supabase/Auth integration is complete'),
    'Users membership panel must not expose stale future-work copy for current member-page workflows.',
  );
	  assert(
	    source.includes('data-testid="users-access-workflows-panel"') &&
      source.includes('data-testid="users-access-open-detail"') &&
      source.includes('data-testid={`users-open-detail-${user.id}`}') &&
      source.includes('data-testid={`users-edit-detail-${user.id}`}') &&
      source.includes('data-user-full-name={user.fullName}') &&
      source.includes('query?: string;') &&
      source.includes('query: normalizedUsersSearchString(search.query)') &&
      source.includes("initialSearch: routeSearch.query || ''") &&
      source.includes("const routeQueryRef = useRef('')") &&
      source.includes('routeQueryRef.current === routeQuery') &&
      source.includes('rollback.restoredUserIds.includes(user.id)') &&
      source.includes('query: restoredUsers[0].email') &&
      source.includes('data-testid="users-access-invite"') &&
      source.includes('data-testid="users-access-delivery-settings"') &&
      source.includes('data-testid="users-access-teams"') &&
      source.includes('data-testid="users-access-permissions"'),
	    'Users route must expose actionable access workflow controls, route-backed directory search, and stable user detail buttons instead of a static backlog list.',
	  );
  assert(
    source.includes('const userActionStatusId = `users-actions-status-${user.id.replace') &&
      source.includes('data-testid={`users-actions-${user.id}`}') &&
      source.includes('data-testid={`users-actions-status-${user.id}`}') &&
      source.includes('data-action-status={userActionStatus}') &&
      source.includes('aria-label={`Actions for ${user.fullName}`}') &&
      source.includes('aria-describedby={userActionStatusId}') &&
      source.includes('Edit available.') &&
      source.includes('Remove available.') &&
      source.includes('You cannot remove your own signed-in account from this directory.') &&
      source.includes('data-action-state={editDisabledReason ?') &&
      source.includes('data-action-state={removeDisabledReason ?') &&
      source.includes('data-disabled-reason={editDisabledReason || undefined}') &&
      source.includes('data-disabled-reason={removeDisabledReason || undefined}') &&
      source.includes('data-testid={`users-remove-${user.id}`}'),
    'Users row actions must expose a named action-status group with ready/blocked state metadata.',
  );
  assert(
    source.includes('data-testid="users-control-map-details"') &&
      source.includes('data-testid="users-control-map"') &&
      source.includes('data-testid="users-api-details"') &&
      source.includes('data-default-collapsed="true"') &&
      source.includes('Show map') &&
      source.includes('Hide map') &&
      source.includes('Show API') &&
      source.includes('Hide API') &&
      source.includes('Jump links for access health, API contracts, directory controls, people, and role permissions.'),
    'Users command center must keep the low-frequency control map and API handoff packet behind default-collapsed progressive disclosure',
  );
  {
    const commandCenterBlockStart = source.indexOf('data-testid="users-command-center"');
    const commandCenterBlockEnd = source.indexOf('<div className="mt-5 grid gap-3', commandCenterBlockStart);
    const commandCenterBlock = commandCenterBlockStart >= 0
      ? source.slice(commandCenterBlockStart, commandCenterBlockEnd >= 0 ? commandCenterBlockEnd : commandCenterBlockStart + 4200)
      : '';
    const primaryActionsIndex = commandCenterBlock.indexOf('data-testid="users-primary-actions"');
    const inviteIndex = commandCenterBlock.indexOf('data-testid="users-command-invite"');
    const importIndex = commandCenterBlock.indexOf('data-testid="users-import-button"');
    const secondaryActionsIndex = commandCenterBlock.indexOf('data-testid="users-secondary-actions"');
    const moreActionsIndex = commandCenterBlock.indexOf('data-testid="users-more-actions"');
    const copyIndex = commandCenterBlock.indexOf('data-testid="users-command-copy-manifest"');
    const downloadIndex = commandCenterBlock.indexOf('data-testid="users-command-download-json"');
    assert(
      primaryActionsIndex >= 0 &&
        inviteIndex > primaryActionsIndex &&
        importIndex > inviteIndex &&
        secondaryActionsIndex > importIndex &&
        commandCenterBlock.includes('data-default-collapsed="true"') &&
        moreActionsIndex > secondaryActionsIndex &&
        copyIndex > moreActionsIndex &&
        downloadIndex > moreActionsIndex,
      'Users command center must lead with invite/import actions and move manifest/JSON handoff behind More actions.',
    );
  }
  assert(
    source.includes("const usersCommandSecondaryActionStatusId = 'users-command-secondary-action-status';") &&
      source.includes('data-testid="users-command-secondary-action-status"') &&
      source.includes('aria-describedby={usersCommandSecondaryActionStatusId}') &&
      source.includes('data-action-status={usersCommandSecondaryActionStatus}') &&
      source.includes('data-action-status={usersCommandExportActionStatus}') &&
      source.includes('data-action-status={usersCommandCsvTemplateActionStatus}') &&
      source.includes('data-action-status={usersCommandImportModeActionStatus}') &&
      source.includes('data-action-status={usersCommandCopyActionStatus}') &&
      source.includes('data-action-status={usersCommandDownloadActionStatus}') &&
      source.includes('data-disabled-reason={usersCommandExportDisabledReason || undefined}') &&
      source.includes('data-disabled-reason={usersCommandCopyDisabledReason || undefined}'),
    'Users command center secondary actions must expose ready/blocked action metadata for every overflow action.',
  );
  assert(
    source.includes("const canViewUsers = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.view', USER_PERMISSION_ROLE_DEFAULTS);") &&
      source.includes("const canCreateUsers = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.create', USER_PERMISSION_ROLE_DEFAULTS);") &&
      source.includes("const canManageUsers = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.manage', USER_PERMISSION_ROLE_DEFAULTS);") &&
      source.includes('const isUsersBusy = isLoading || isUserMutationBusy;') &&
      source.includes('const userInviteActionDisabled = isUserMutationBusy || !canCreateUsers;') &&
      source.includes("const userImportActionDisabled = isUserMutationBusy || !canCreateUsers || (importMode === 'upsert' && !canManageUsers);") &&
      source.includes('disabled={userInviteActionDisabled}') &&
      source.includes('disabled={userImportActionDisabled}') &&
      source.includes('disabled={Boolean(usersCommandImportModeDisabledReason)}') &&
      source.includes('if (isUserMutationBusy) return;') &&
      !source.includes('const canViewUsers = !isPermissionMatrixPending') &&
      !source.includes('const canCreateUsers = !isPermissionMatrixPending') &&
      !source.includes('if (isPermissionMatrixPending) return;'),
    'Users invite/import controls must use role-default permission access while matrices hydrate and must not disable account creation entry points during directory loading.',
  );
  assert(
    createSource.includes('query: created.user.email') &&
      createSource.includes('createdInvite.email || formData.email.trim().toLowerCase()'),
    'User invite success must return to the directory with the created account focused by search query.',
  );
  {
    const inviteCommandCenterStart = createSource.indexOf('data-testid="user-invite-command-center"');
    const inviteCommandCenterEnd = createSource.indexOf('{noticeMessage && (', inviteCommandCenterStart);
    const inviteCommandCenterBlock = inviteCommandCenterStart >= 0
      ? createSource.slice(inviteCommandCenterStart, inviteCommandCenterEnd >= 0 ? inviteCommandCenterEnd : inviteCommandCenterStart + 3600)
      : '';
    const primaryActionsIndex = inviteCommandCenterBlock.indexOf('data-testid="user-invite-primary-actions"');
    const submitIndex = inviteCommandCenterBlock.indexOf('data-testid="user-invite-submit-primary"');
    const secondaryActionsIndex = inviteCommandCenterBlock.indexOf('data-testid="user-invite-secondary-actions"');
    const moreActionsIndex = inviteCommandCenterBlock.indexOf('data-testid="user-invite-more-actions"');
    const copyIndex = inviteCommandCenterBlock.indexOf('data-testid="user-invite-copy-manifest"');
    const downloadIndex = inviteCommandCenterBlock.indexOf('data-testid="user-invite-download-json"');
    assert(
      createSource.includes("const inviteHandoffActionStatusId = 'user-invite-handoff-action-status';") &&
        createSource.includes('data-testid="user-invite-handoff-action-status"') &&
        primaryActionsIndex >= 0 &&
        submitIndex > primaryActionsIndex &&
        secondaryActionsIndex > submitIndex &&
        inviteCommandCenterBlock.includes('data-testid="user-invite-secondary-actions" data-default-collapsed="true"') &&
        moreActionsIndex > secondaryActionsIndex &&
        copyIndex > moreActionsIndex &&
        downloadIndex > copyIndex,
      'User invite command center must lead with Send invite/Create user and move manifest/JSON handoff behind More actions.',
    );
  }
  assert(
    source.includes("template: 'member-login'") &&
      source.includes("template: 'member-account'") &&
      source.includes('Seed an email-based access page') &&
      source.includes('Seed an editable account page') &&
      source.includes('Registration capture and member page shells are available through Backy content systems') &&
      source.includes('Use Supabase Auth settings to enforce credentialed sessions on the seeded member pages.'),
    'Users membership handoff must route authors to member login/account page templates and provider-gated auth settings.',
  );
  assert(
    source.includes("const MEMBER_ACCESS_HANDOFF_SCHEMA_VERSION = 'backy.member-access-handoff.v1'") &&
      source.includes('editableRegions: MEMBERSHIP_EDITABLE_REGIONS') &&
      source.includes('dataBindings: MEMBERSHIP_DATA_BINDINGS') &&
      source.includes('actionBindings: MEMBERSHIP_ACTION_BINDINGS') &&
      source.includes("providerFamily: 'supabase-auth-or-compatible'") &&
      source.includes('data-testid="users-member-access-handoff"') &&
      source.includes('Copy member handoff') &&
      source.includes('private admin user records') &&
      source.includes('auth provider secrets'),
    'Users membership handoff must expose a versioned custom frontend member-access contract with bindings, actions, provider gate, and privacy boundaries.',
  );
  assert(
    source.includes('aria-labelledby="users-import-rollback-confirm-title"') &&
      source.includes('aria-describedby="users-import-rollback-confirm-description"') &&
      source.includes('data-testid="users-import-rollback-confirm-dialog"') &&
      source.includes('data-testid="users-import-rollback-confirm"') &&
      source.includes('aria-label="Confirm user import rollback"'),
    'Users import rollback must expose an accessible in-app confirmation dialog with testable actions.',
  );
  assert(
    source.includes('const USER_IMPORT_REQUIRED_COLUMNS = [') &&
      source.includes('validateUserImportCsvFile') &&
      source.includes('parseUserImportCsvRows') &&
      source.includes('data-testid="users-import-inline-error"') &&
      source.includes('role="alert"') &&
      source.includes('data-testid="users-import-preview-button"') &&
      source.includes('data-testid="users-import-button"') &&
      source.includes("aria-describedby={userImportInlineError ? 'users-import-inline-error' : undefined}") &&
      source.includes('Upload a .csv file exported from the Backy users template.') &&
      source.includes('Users import CSV is missing required columns:'),
    'Users import controls must preflight CSV files with inline errors before backend mutation.',
  );
  assert(detailSource.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'User detail route must use the shared EmptyState component');
  assert(detailSource.includes('title="No active admin sessions"'), 'User detail sessions empty state must keep the shared title visible');
  assert(detailSource.includes('title="No invite link generated"'), 'User detail invite empty state must keep the shared title visible');
  assert(detailSource.includes('title="No reset token generated"'), 'User detail reset empty state must keep the shared title visible');
  assert(detailSource.includes('title="No matching user activity"'), 'User detail activity empty state must keep the shared title visible');
  assert(
    source.includes('const selectedUserIdSet = useMemo') &&
      source.includes('const selectedVisibleActionableUsers = useMemo') &&
      source.includes('const hiddenSelectedUserCount = Math.max') &&
      source.includes('data-testid="users-bulk-selection-summary"') &&
      source.includes('data-testid="users-bulk-clear-selection"') &&
      source.includes('outside this view'),
    'Users bulk toolbar must summarize selected actionable users outside the current table view',
  );
  assert(
    source.includes("const usersBulkActionStatusId = 'users-bulk-action-status';") &&
      source.includes('const usersBulkActionStatus = [') &&
      source.includes('const usersBulkGroupActionState = selectedActionableUsers.length === 0') &&
      source.includes('role="group"') &&
      source.includes('aria-label="Selected user bulk actions"') &&
      source.includes('data-testid="users-bulk-actions"') &&
      source.includes('data-testid="users-bulk-action-status"') &&
      source.includes('data-action-state={usersBulkGroupActionState}') &&
      source.includes('data-action-status={usersBulkActionStatus}') &&
      source.includes('data-selected-count={selectedActionableUsers.length}') &&
      source.includes('data-testid="users-bulk-select-visible"') &&
      source.includes('data-testid="users-bulk-status-select"') &&
      source.includes('data-testid="users-bulk-apply-status"') &&
      source.includes('data-testid="users-bulk-delete"') &&
      source.includes("const usersBulkDeleteDialogStatusId = 'users-bulk-delete-confirm-action-status';") &&
      source.includes('data-testid="users-bulk-delete-confirm-action-status"') &&
      source.includes('data-testid="users-bulk-delete-cancel"') &&
      source.includes('data-testid="users-bulk-delete-confirm"') &&
      source.includes('data-action-status={`${usersBulkDeleteCancelActionStatus} ${usersBulkDeleteConfirmActionStatus}`}') &&
      source.includes("data-action-state={usersBulkStatusDisabledReason ? 'blocked' : 'ready'}") &&
      source.includes('data-disabled-reason={usersBulkDeleteActionDisabledReason || undefined}'),
    'Users bulk actions must expose named shared status groups, selected-count metadata, stable hooks, and ready/blocked reasons for status, delete, and delete-confirmation actions.',
  );
  assert(
    createSource.includes('const loadUserInvitePermissions = useCallback(() => {') &&
      createSource.includes('const canUseUserInviteRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);') &&
      createSource.includes('const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseUserInviteRoleDefaults;') &&
      createSource.includes('const isUserInvitePermissionAllowed = (key: UserInvitePermissionKey) => (') &&
      createSource.includes("const canCreateUsers = isUserInvitePermissionAllowed('users.create');") &&
      createSource.includes('const isInviteBusy = isLoading;') &&
      createSource.includes('const inviteSubmitActionStatusId =') &&
      createSource.includes('data-testid="user-invite-submit-action-status"') &&
      createSource.includes('noValidate') &&
      createSource.includes('data-action-state={inviteSubmitActionState}') &&
      createSource.includes('data-action-status={inviteSubmitActionStatus}') &&
      createSource.includes('data-disabled-reason={inviteSubmitDisabledReason || undefined}') &&
      createSource.includes('data-target-email={formData.email.trim().toLowerCase() || undefined}') &&
      createSource.includes('data-target-role={formData.role}') &&
      createSource.includes('data-target-status={formData.status}') &&
      createSource.includes('disabled={isInviteBusy || !canCreateUsers}') &&
      !createSource.includes('disabled={isInviteBusy || !canSubmit || !canCreateUsers}') &&
      !createSource.includes('const canCreateUsers = !isPermissionMatrixPending') &&
      !createSource.includes('const isInviteBusy = isLoading || isPermissionMatrixPending;') &&
      createSource.includes('data-testid="user-invite-permission-state"') &&
      createSource.includes('User invite permissions need attention') &&
      createSource.includes('aria-label="Retry loading user invite permissions"') &&
      createSource.includes('Retry permissions') &&
      createSource.includes('to="/users"') &&
      createSource.includes('Review users'),
    'User invite permission state and submit actions must expose retryable permission recovery plus shared ready/blocked submit metadata',
  );
  assert(
    detailSource.includes('const loadCurrentAdminUserPermissions = useCallback(() => {') &&
      detailSource.includes('const canUseCurrentAdminRoleDefaults = isLoadingCurrentAdminPermissions && !currentAdminPermissionMatrix && Boolean(currentAdmin);') &&
      detailSource.includes('const isCurrentAdminPermissionMatrixPending = isLoadingCurrentAdminPermissions && !currentAdminPermissionMatrix && !canUseCurrentAdminRoleDefaults;') &&
      detailSource.includes('const isUserDetailPermissionAllowed = (key: UserDetailPermissionKey) => (') &&
      detailSource.includes("const canViewUsers = isUserDetailPermissionAllowed('users.view');") &&
      detailSource.includes("const canManageUsers = isUserDetailPermissionAllowed('users.manage');") &&
      detailSource.includes("const canDeleteUsers = isUserDetailPermissionAllowed('users.delete');") &&
      detailSource.includes("const canExportActivity = isUserDetailPermissionAllowed('activity.export');") &&
      detailSource.includes('const isUserDetailBusy = isLoadingUser || isLoading;') &&
      !detailSource.includes('const canViewUsers = !isCurrentAdminPermissionMatrixPending') &&
      !detailSource.includes('const isUserDetailBusy = isLoadingUser || isLoading || isCurrentAdminPermissionMatrixPending;') &&
      detailSource.includes('data-testid="user-detail-permission-state"') &&
      detailSource.includes('data-testid="user-detail-rbac-permission-state"') &&
      detailSource.includes('data-testid="user-detail-matrix-permission-state"') &&
      detailSource.includes('User detail permissions need attention') &&
      detailSource.includes('User permission matrix could not be verified') &&
      detailSource.includes('aria-label="Retry loading user detail permissions"') &&
      detailSource.includes('aria-label="Retry loading selected user permissions"') &&
      detailSource.includes('Retry permissions') &&
      detailSource.includes('to="/users"') &&
      detailSource.includes('Review users'),
    'User detail permission states must expose retryable permission recovery and role-default interaction while backend permission details hydrate',
  );
  assert(
    detailSource.includes("const userDetailRecoveryActionStatusId = 'user-detail-recovery-action-status';") &&
      detailSource.includes("const userDetailCommandActionStatusId = 'user-detail-command-action-status';") &&
      detailSource.includes("const userDetailApiActionStatusId = 'user-detail-api-action-status';") &&
      detailSource.includes("const userDetailActivityActionStatusId = 'user-detail-activity-action-status';") &&
      detailSource.includes("const userDetailSessionsActionStatusId = 'user-detail-sessions-action-status';") &&
      detailSource.includes("const userDetailMfaActionStatusId = 'user-detail-mfa-action-status';") &&
      detailSource.includes("const userDetailOwnershipActionStatusId = 'user-detail-ownership-action-status';") &&
      detailSource.includes("const userDetailDangerActionStatusId = 'user-detail-danger-action-status';") &&
      detailSource.includes('data-testid="user-detail-command-action-status"') &&
      detailSource.includes('data-testid="user-detail-api-action-status"') &&
      detailSource.includes('data-testid="user-detail-activity-action-status"') &&
      detailSource.includes('data-testid="user-detail-sessions-action-status"') &&
      detailSource.includes('data-testid="user-detail-recovery-action-status"') &&
      detailSource.includes('data-testid="user-detail-mfa-action-status"') &&
      detailSource.includes('data-testid="user-detail-ownership-action-status"') &&
      detailSource.includes('data-testid="user-detail-danger-action-status"') &&
      detailSource.includes('data-action-state={userDetailCommandActionState}') &&
      detailSource.includes('data-action-status={userDetailCommandActionStatus}') &&
      detailSource.includes('data-action-status={userDetailApiActionStatus}') &&
      detailSource.includes('data-action-state={userDetailActivityActionState}') &&
      detailSource.includes('data-action-status={userDetailActivityActionStatus}') &&
      detailSource.includes('data-action-state={userDetailSessionsActionState}') &&
      detailSource.includes('data-action-status={userDetailSessionsActionStatus}') &&
      detailSource.includes('data-action-state={userDetailRecoveryActionState}') &&
      detailSource.includes('data-action-status={userDetailRecoveryActionStatus}') &&
      detailSource.includes('data-action-state={userDetailMfaActionState}') &&
      detailSource.includes('data-action-status={userDetailMfaActionStatus}') &&
      detailSource.includes("data-action-state={ownershipTransferDisabledReason ? 'blocked' : 'ready'}") &&
      detailSource.includes('data-action-status={userDetailOwnershipActionStatus}') &&
      detailSource.includes("data-action-state={userDetailDangerActionDisabledReason ? 'blocked' : 'ready'}") &&
      detailSource.includes('data-action-status={userDetailDangerActionStatus}') &&
      detailSource.includes('const userDetailActionMetadata = (statusId: string, actionStatus: string, disabledReason = \'\') => ({') &&
      detailSource.includes('{...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, inviteTokenActionDisabledReason)}') &&
      detailSource.includes('{...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, resetTokenActionDisabledReason)}') &&
      detailSource.includes('{...userDetailActionMetadata(userDetailMfaActionStatusId, userDetailMfaActionStatus, mfaManageActionDisabledReason)}') &&
      detailSource.includes('{...userDetailActionMetadata(userDetailOwnershipActionStatusId, userDetailOwnershipActionStatus, ownershipTransferDisabledReason)}') &&
      detailSource.includes('{...userDetailActionMetadata(userDetailDangerActionStatusId, userDetailDangerActionStatus, userDetailDangerActionDisabledReason)}') &&
      detailSource.includes('data-testid="user-detail-primary-actions"') &&
      detailSource.includes('data-testid="user-detail-secondary-actions"') &&
      detailSource.includes('data-testid="user-detail-more-actions"') &&
      detailSource.includes('data-testid="user-detail-command-copy-manifest"') &&
      detailSource.includes('data-testid="user-detail-command-download-json"') &&
      detailSource.includes('data-testid="user-detail-command-save"') &&
      detailSource.includes('data-testid="user-detail-api-copy-url"') &&
      detailSource.includes('data-testid="user-detail-activity-refresh"') &&
      detailSource.includes('data-testid="user-detail-sessions-refresh"') &&
      detailSource.includes('data-testid={`user-detail-session-revoke-${session.id}`}') &&
      detailSource.includes('data-testid="user-detail-generate-invite-link"') &&
      detailSource.includes('data-testid="user-detail-generate-reset-token"') &&
      detailSource.includes('data-testid="user-detail-remove-user"'),
    'User detail recovery, MFA, ownership, and destructive controls must expose shared ready/blocked action status metadata.',
  );
  {
    const commandCenterBlockStart = detailSource.indexOf('data-testid="user-detail-command-center"');
    const commandCenterBlockEnd = detailSource.indexOf('<div className="mt-5 grid gap-3', commandCenterBlockStart);
    const commandCenterBlock = commandCenterBlockStart >= 0
      ? detailSource.slice(commandCenterBlockStart, commandCenterBlockEnd >= 0 ? commandCenterBlockEnd : commandCenterBlockStart + 3800)
      : '';
    const saveIndex = commandCenterBlock.indexOf('data-testid="user-detail-command-save"');
    const moreActionsIndex = commandCenterBlock.indexOf('data-testid="user-detail-more-actions"');
    const copyIndex = commandCenterBlock.indexOf('data-testid="user-detail-command-copy-manifest"');
    const downloadIndex = commandCenterBlock.indexOf('data-testid="user-detail-command-download-json"');
    assert(
      saveIndex >= 0 &&
        moreActionsIndex > saveIndex &&
        copyIndex > moreActionsIndex &&
        downloadIndex > moreActionsIndex,
      'User detail command center must keep Save changes first and move manifest/JSON handoff behind More actions.',
    );
  }
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
      ...(apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
};

const loginAdminApi = async () => {
  const login = (twoFactorCode = '') => fetch(`${API_BASE_URL}/api/admin/auth/login`, {
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
  const smokeMfaCode = getSmokeMfaCode();
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

const assertUsersApiRequiresAuth = async () => {
  const response = await fetch(`${API_BASE_URL}/api/admin/users`);
  const payload = await response.json().catch(() => ({}));

  assert(response.status === 401, `Users API should reject missing auth, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.success === false && payload?.error?.code === 'UNAUTHORIZED', `Users API missing auth envelope: ${JSON.stringify(payload).slice(0, 500)}`);
};

const assertUserPermissionOverridesAreEnforced = async () => {
  await requestApi('/api/admin/users/user-admin/permissions', {
    method: 'PATCH',
    body: JSON.stringify({
      overrides: {
        'users.create': 'deny',
      },
    }),
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        fullName: 'Denied Permission Smoke',
        email: `denied-${Date.now()}@example.com`,
        role: 'viewer',
        status: 'invited',
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 403, `Denied users.create override should reject user creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'FORBIDDEN_PERMISSION', `Denied override should return FORBIDDEN_PERMISSION: ${JSON.stringify(payload).slice(0, 500)}`);
  } finally {
    await requestApi('/api/admin/users/user-admin/permissions', {
      method: 'PATCH',
      body: JSON.stringify({
        overrides: {
          'users.create': null,
        },
      }),
    });
  }
};

const listUsers = async () => {
  const payload = await requestApi('/api/admin/users');
  return payload.data?.users || payload.users || [];
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

const listUsersPage = async (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const payload = await requestApi(`/api/admin/users${query.size ? `?${query.toString()}` : ''}`);
  return {
    users: payload.data?.users || payload.users || [],
    pagination: payload.data?.pagination || payload.pagination || null,
  };
};

const assertUsersApiPagination = async ({ search, expectedIds }) => {
  const firstPage = await listUsersPage({ search, limit: 1, offset: 0 });
  const secondPage = await listUsersPage({ search, limit: 1, offset: 1 });

  assert(firstPage.pagination?.limit === 1, `Users API first page limit metadata was wrong: ${JSON.stringify(firstPage).slice(0, 500)}`);
  assert(firstPage.pagination?.offset === 0, `Users API first page offset metadata was wrong: ${JSON.stringify(firstPage).slice(0, 500)}`);
  assert(firstPage.pagination?.total === expectedIds.length, `Users API first page total did not match created users: ${JSON.stringify(firstPage).slice(0, 500)}`);
  assert(firstPage.pagination?.hasMore === true, `Users API first page should report hasMore: ${JSON.stringify(firstPage).slice(0, 500)}`);
  assert(firstPage.users.length === 1, `Users API first page should return exactly one user: ${JSON.stringify(firstPage).slice(0, 500)}`);

  assert(secondPage.pagination?.limit === 1, `Users API second page limit metadata was wrong: ${JSON.stringify(secondPage).slice(0, 500)}`);
  assert(secondPage.pagination?.offset === 1, `Users API second page offset metadata was wrong: ${JSON.stringify(secondPage).slice(0, 500)}`);
  assert(secondPage.pagination?.total === firstPage.pagination.total, `Users API pagination total changed between pages: ${JSON.stringify({ firstPage, secondPage }).slice(0, 500)}`);
  assert(secondPage.users.length === 1, `Users API second page should return exactly one user: ${JSON.stringify(secondPage).slice(0, 500)}`);
  assert(firstPage.users[0]?.id !== secondPage.users[0]?.id, `Users API pagination returned duplicate rows: ${JSON.stringify({ firstPage, secondPage }).slice(0, 500)}`);

  const seenIds = new Set([firstPage.users[0]?.id, secondPage.users[0]?.id]);
  expectedIds.forEach((id) => {
    assert(seenIds.has(id), `Users API paginated search did not include expected user ${id}: ${JSON.stringify({ firstPage, secondPage }).slice(0, 500)}`);
  });

  return {
    total: firstPage.pagination.total,
    firstId: firstPage.users[0]?.id,
    secondId: secondPage.users[0]?.id,
    hasMore: firstPage.pagination.hasMore,
  };
};

const assertUsersApiFilters = async ({ search, adminUserId, viewerUserId }) => {
  const all = await listUsersPage({ search, limit: 10, offset: 0 });
  const admin = await listUsersPage({ search, role: 'admin', limit: 10, offset: 0 });
  const viewer = await listUsersPage({ search, role: 'viewer', limit: 10, offset: 0 });
  const invited = await listUsersPage({ search, status: 'invited', limit: 10, offset: 0 });
  const active = await listUsersPage({ search, status: 'active', limit: 10, offset: 0 });
  const viewerActive = await listUsersPage({ search, role: 'viewer', status: 'active', limit: 10, offset: 0 });

  const assertIds = (label, result, expectedIds) => {
    const ids = result.users.map((user) => user.id).sort();
    const expected = [...expectedIds].sort();
    assert(result.pagination?.total === expected.length, `${label} total was wrong: ${JSON.stringify(result).slice(0, 500)}`);
    assert(JSON.stringify(ids) === JSON.stringify(expected), `${label} ids were wrong: ${JSON.stringify({ ids, expected, result }).slice(0, 500)}`);
  };

  assertIds('Users API search filter', all, [adminUserId, viewerUserId]);
  assertIds('Users API role=admin filter', admin, [adminUserId]);
  assertIds('Users API role=viewer filter', viewer, [viewerUserId]);
  assertIds('Users API status=invited filter', invited, [adminUserId]);
  assertIds('Users API status=active filter', active, [viewerUserId]);
  assertIds('Users API role+status filter', viewerActive, [viewerUserId]);

  return {
    searchTotal: all.pagination.total,
    adminTotal: admin.pagination.total,
    viewerTotal: viewer.pagination.total,
    invitedTotal: invited.pagination.total,
    activeTotal: active.pagination.total,
    viewerActiveTotal: viewerActive.pagination.total,
  };
};

const assertUsersApiSorting = async ({ search, adminUserId, viewerUserId }) => {
  const byNameAsc = await listUsersPage({
    search,
    sortBy: 'fullName',
    sortDirection: 'asc',
    limit: 1,
    offset: 0,
  });
  const byNameDesc = await listUsersPage({
    search,
    sortBy: 'fullName',
    sortDirection: 'desc',
    limit: 1,
    offset: 0,
  });
  const byRoleAsc = await listUsersPage({
    search,
    sortBy: 'role',
    sortDirection: 'asc',
    limit: 2,
    offset: 0,
  });

  assert(byNameAsc.pagination?.total === 2, `Users API sorted name asc total was wrong: ${JSON.stringify(byNameAsc).slice(0, 500)}`);
  assert(byNameDesc.pagination?.total === 2, `Users API sorted name desc total was wrong: ${JSON.stringify(byNameDesc).slice(0, 500)}`);
  assert(byNameAsc.users[0]?.id === viewerUserId, `Users API fullName asc did not put bulk viewer first: ${JSON.stringify(byNameAsc).slice(0, 500)}`);
  assert(byNameDesc.users[0]?.id === adminUserId, `Users API fullName desc did not put smoke admin first: ${JSON.stringify(byNameDesc).slice(0, 500)}`);

  const roleSortedIds = byRoleAsc.users.map((user) => user.id);
  assert(
    JSON.stringify(roleSortedIds) === JSON.stringify([adminUserId, viewerUserId]),
    `Users API role asc sort was wrong: ${JSON.stringify({ roleSortedIds, byRoleAsc }).slice(0, 500)}`,
  );

  return {
    fullNameAscFirst: byNameAsc.users[0]?.id,
    fullNameDescFirst: byNameDesc.users[0]?.id,
    roleAscIds: roleSortedIds,
  };
};

const createUser = async ({ fullName, email, role = 'admin', status = 'invited' }) => {
  const payload = await requestApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      fullName,
      email,
      role,
      status,
    }),
  });
  const user = payload.data?.user || payload.user;
  assert(user?.id, `Create user did not return a user: ${JSON.stringify(payload).slice(0, 500)}`);
  if (status === 'invited') {
    const invite = payload.data?.invite || payload.invite;
    const inviteDelivery = payload.data?.inviteDelivery;
    assert(invite?.inviteUrl?.includes('/accept-invite?token='), `Invited user create did not return an invite URL: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(invite.deliveryConfigured === true, `Invited user create did not queue invite delivery: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(inviteDelivery?.provider && inviteDelivery.status === 'queued', `Invited user create did not expose delivery metadata: ${JSON.stringify(inviteDelivery).slice(0, 500)}`);
    const inviteToken = new URL(invite.inviteUrl, 'https://backy.local').searchParams.get('token');
    assert(inviteToken, `Invited user create did not expose a token in invite URL: ${JSON.stringify(invite).slice(0, 500)}`);
    user.inviteToken = inviteToken;
  }
  return user;
};

const bulkUpdateUsers = async (input) => {
  const payload = await requestApi('/api/admin/users/bulk', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.data;
};

const getUser = async (userId) => {
  const payload = await requestApi(`/api/admin/users/${userId}`);
  return payload.data?.user || payload.user;
};

const updateUser = async (userId, input) => {
  const payload = await requestApi(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.user || payload.user;
};

const transferUserOwnership = async (userId) => {
  const payload = await requestApi(`/api/admin/users/${userId}/transfer-ownership`, {
    method: 'POST',
  });
  return payload.data?.transfer || payload.transfer;
};

const listUserAuditLogs = async (userId) => {
  const params = new URLSearchParams({ entity: 'user', entityId: userId, limit: '20' });
  const payload = await requestApi(`/api/admin/audit-logs?${params.toString()}`);
  return payload.data?.logs || payload.logs || [];
};

const getUserMfa = async (userId) => {
  const payload = await requestApi(`/api/admin/users/${userId}/mfa`);
  return payload.data?.mfa;
};

const loginWithCredentials = async ({ email, password, twoFactorCode }) => {
  const response = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const deleteUser = async (userId) => {
  if (!userId) return;
  await requestApi(`/api/admin/users/${userId}`, { method: 'DELETE' });
};

const findUserByEmail = async (email) => {
  const users = await listUsers();
  return users.find((user) => user.email === email) || null;
};

const assertUserBillingSeatLimitEnforced = async (suffix) => {
  const settings = await getSettings();
  const existingUsers = await listUsers();
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const blockedEmail = `blocked-seat-${suffix}@example.com`;

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        seatLimit: Math.max(1, existingUsers.length),
        overageMode: 'block',
      },
    },
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        fullName: `Blocked Seat ${suffix}`,
        email: blockedEmail,
        role: 'viewer',
        status: 'invited',
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 402, `Billing seat limit should reject user creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'BILLING_SEAT_LIMIT', `Billing seat limit should return BILLING_SEAT_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(!(await findUserByEmail(blockedEmail)), 'Billing-limited user creation unexpectedly persisted a user.');
  } finally {
    await updateSettings({ integrations: originalIntegrations });
  }
};

const assertUserImportBillingSeatLimitEnforced = async (suffix) => {
  const settings = await getSettings();
  const existingUsers = await listUsers();
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const blockedEmail = `blocked-import-seat-${suffix}@example.com`;

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        seatLimit: Math.max(1, existingUsers.length),
        overageMode: 'block',
      },
    },
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/users/import`, {
      method: 'POST',
      headers: {
        'content-type': 'text/csv',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: [
        'full_name,email,role,status',
        `Blocked Import Seat ${suffix},${blockedEmail},viewer,invited`,
      ].join('\n'),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 402, `Billing seat limit should reject user import creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'BILLING_SEAT_LIMIT', `Billing seat-limited import should return BILLING_SEAT_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.details?.requestedCreateCount === 1, `Billing seat-limited import should report requestedCreateCount: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(!(await findUserByEmail(blockedEmail)), 'Billing-limited user import unexpectedly persisted a user.');
  } finally {
    await updateSettings({ integrations: originalIntegrations });
  }
};

const waitForUser = async (email, predicate = () => true) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const user = await findUserByEmail(email);
    if (user && predicate(user)) {
      return user;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for user ${email}`);
};

const waitForUserMissing = async (email) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const user = await findUserByEmail(email);
    if (!user) {
      return;
    }
    await sleep(250);
  }

  throw new Error(`Temporary user ${email} still exists after cleanup`);
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
    if ((attempt === 40 || attempt === 80) && !(state.body || '').trim()) {
      await client.send('Page.navigate', { url });
    }
    if (attempt === 119) {
      throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const setInputValue = async (client, selector, value) => {
  const result = await evaluate(client, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement)) return { ok: false, reason: 'input-missing', selector: ${JSON.stringify(selector)} };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: input.value };
  })()`);
  assert(result.ok, `Unable to set ${selector}: ${JSON.stringify(result)}`);
  return result;
};

const clickButton = async (client, label) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === ${JSON.stringify(label)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'button-missing',
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.textContent || '').slice(0, 40),
      };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled', label: ${JSON.stringify(label)} };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to click ${label}: ${JSON.stringify(result)}`);
};

const pressKey = async (client, key) => {
  const codeByKey = {
    Escape: 'Escape',
    Enter: 'Enter',
  };
  const virtualKeyByKey = {
    Escape: 27,
    Enter: 13,
  };

  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code: codeByKey[key] || key,
    windowsVirtualKeyCode: virtualKeyByKey[key] || 0,
    nativeVirtualKeyCode: virtualKeyByKey[key] || 0,
  });
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code: codeByKey[key] || key,
    windowsVirtualKeyCode: virtualKeyByKey[key] || 0,
    nativeVirtualKeyCode: virtualKeyByKey[key] || 0,
  });
  await sleep(150);
};

const signInAdmin = async (client) => {
  await navigate(
    client,
    `${ADMIN_BASE_URL}/login`,
    `(() => ({
      ready: document.body?.innerText?.includes('Authenticated admin access') &&
        Boolean(document.querySelector('#email')) &&
        Boolean(document.querySelector('#password')),
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`,
    'Login page',
  );

  const loginResult = await evaluate(client, `(async () => {
    const login = (twoFactorCode) => fetch(${JSON.stringify(`${API_BASE_URL}/api/admin/auth/login`)}, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@backy.io',
        password: ${JSON.stringify(process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123')},
        ...(twoFactorCode ? { twoFactorCode } : {}),
      }),
    });
    let response = await login('');
    let payload = await response.json().catch(() => ({}));
    const smokeMfaCode = ${JSON.stringify(getSmokeMfaCode())};
    if (!response.ok && payload?.error?.code === 'MFA_REQUIRED' && smokeMfaCode) {
      response = await login(smokeMfaCode);
      payload = await response.json().catch(() => ({}));
    }
    if (!response.ok || payload.success === false || !payload.data?.user || !payload.data?.session) {
      return { ok: false, status: response.status, payload };
    }
    localStorage.setItem('backy-auth-storage', JSON.stringify({
      state: {
        user: payload.data.user,
        session: payload.data.session,
      },
      version: 0,
    }));
    return {
      ok: true,
      userEmail: payload.data.user.email,
      hasSession: Boolean(payload.data.session.expiresAt),
    };
  })()`);
  assert(loginResult.ok, `Unable to create browser admin session: ${JSON.stringify(loginResult).slice(0, 1000)}`);

  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const stored = JSON.parse(localStorage.getItem('backy-auth-storage') || '{}');
      return {
        ready: (
          (window.location.pathname === '/' && Boolean(document.querySelector('[data-testid="dashboard-command-center"]'))) ||
          Boolean(document.querySelector('[data-testid="dashboard-command-center"]'))
        ) &&
          stored?.state?.user?.email === 'admin@backy.io' &&
          Boolean(stored?.state?.session?.expiresAt),
        path: window.location.pathname,
        hasSession: Boolean(stored?.state?.session?.expiresAt),
        userEmail: stored?.state?.user?.email || '',
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);
    if (state.ready) return state;
    if (attempt === 119) throw new Error(`Dashboard after login did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }

  return null;
};

const navigateToInvite = (client) => navigate(
  client,
  `${ADMIN_BASE_URL}/users/new?siteId=${encodeURIComponent(SITE_ID)}`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="user-invite-command-center"]')) &&
      document.body?.innerText?.includes('Invitation details'),
    body: document.body?.innerText?.slice(0, 800) || '',
  }))()`,
  'Invite page',
);

const navigateToUsers = (client, expectedText = 'Users command center') => {
  const params = new URLSearchParams({ siteId: SITE_ID });
  if (expectedText !== 'Users command center') {
    params.set('query', expectedText);
  }

  return navigate(
    client,
    `${ADMIN_BASE_URL}/users?${params.toString()}`,
    `(() => ({
      ready: Boolean(document.querySelector('[data-testid="users-command-center"]')) &&
        document.body?.innerText?.includes(${JSON.stringify(expectedText)}),
      body: document.body?.innerText?.slice(0, 800) || '',
    }))()`,
    'Users page',
  );
};

const assertInviteCommandCenterLayout = async (client) => {
  const state = await evaluate(client, `(() => {
    const commandCenter = document.querySelector('[data-testid="user-invite-command-center"]');
    const primaryActions = document.querySelector('[data-testid="user-invite-primary-actions"]');
    const primaryActionText = Array.from(primaryActions?.querySelectorAll('button') || [])
      .map((button) => (button.textContent || '').replace(/\\s+/g, ' ').trim());
    const primaryActionIds = Array.from(primaryActions?.querySelectorAll('[data-testid]') || [])
      .map((element) => element.getAttribute('data-testid') || '')
      .filter(Boolean);
    const secondaryActions = document.querySelector('[data-testid="user-invite-secondary-actions"]');
    const secondaryMenu = document.querySelector('[data-testid="user-invite-secondary-action-menu"]');
    const handoffStatus = document.querySelector('[data-testid="user-invite-handoff-action-status"]');
    const readButton = (testId) => {
      const button = document.querySelector('[data-testid="' + testId + '"]');
      return button instanceof HTMLButtonElement ? {
        exists: true,
        disabled: button.disabled,
        describedBy: button.getAttribute('aria-describedby') || '',
        state: button.getAttribute('data-action-state') || '',
        status: button.getAttribute('data-action-status') || '',
        reason: button.getAttribute('data-disabled-reason') || '',
        nested: Boolean(secondaryMenu?.querySelector('[data-testid="' + testId + '"]')),
      } : { exists: false };
    };
    return {
      hasCommandCenter: commandCenter instanceof HTMLElement,
      firstPrimaryActionText: primaryActionText[0] || '',
      primaryActionIds,
      secondaryCollapsed: secondaryActions instanceof HTMLDetailsElement &&
        secondaryActions.open === false &&
        secondaryActions.getAttribute('data-default-collapsed') === 'true',
      hasMoreActions: Boolean(document.querySelector('[data-testid="user-invite-more-actions"]')),
      handoffStatusId: handoffStatus?.id || '',
      handoffStatusText: handoffStatus?.textContent || '',
      copy: readButton('user-invite-copy-manifest'),
      download: readButton('user-invite-download-json'),
      body: document.body?.innerText?.slice(0, 1200) || '',
    };
  })()`);

  assert(state.hasCommandCenter, `Invite command center missing: ${JSON.stringify(state)}`);
  assert(state.firstPrimaryActionText === 'Send invite', `Invite command center must lead with Send invite: ${JSON.stringify(state)}`);
  assert(
    ['user-invite-copy-manifest', 'user-invite-download-json'].every((testId) => !state.primaryActionIds.includes(testId)),
    `Invite handoff controls must not be duplicated in primary actions: ${JSON.stringify(state)}`,
  );
  assert(state.secondaryCollapsed && state.hasMoreActions, `Invite handoff actions must live behind collapsed More actions: ${JSON.stringify(state)}`);
  for (const action of [state.copy, state.download]) {
    assert(
      action.exists &&
        action.nested &&
        action.describedBy === state.handoffStatusId &&
        action.state === 'ready' &&
        action.status.length > 0 &&
        action.disabled === false,
      `Invite handoff action is missing ready-state metadata or nesting: ${JSON.stringify(state)}`,
    );
  }
  assert(
    state.handoffStatusText.includes('Copy manifest available.') &&
      state.handoffStatusText.includes('Download JSON available.'),
    `Invite handoff status text is incomplete: ${JSON.stringify(state)}`,
  );
  return state;
};

const assertInviteSubmitActionStatus = async (client, expectation) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const status = document.querySelector('[data-testid="user-invite-submit-action-status"]');
      const statusId = status?.id || '';
      const primarySubmit = document.querySelector('[data-testid="user-invite-submit-primary"]');
      const footerSubmit = document.querySelector('[data-testid="user-invite-submit-footer"]');
      const action = (button) => button instanceof HTMLButtonElement ? {
        describedBy: button.getAttribute('aria-describedby') || '',
        state: button.getAttribute('data-action-state') || '',
        actionStatus: button.getAttribute('data-action-status') || '',
        disabledReason: button.getAttribute('data-disabled-reason') || '',
        targetEmail: button.getAttribute('data-target-email') || '',
        targetRole: button.getAttribute('data-target-role') || '',
        targetStatus: button.getAttribute('data-target-status') || '',
        disabled: button.disabled,
      } : null;
      return {
        statusId,
        statusText: status?.textContent || '',
        primary: action(primarySubmit),
        footer: action(footerSubmit),
        body: document.body?.innerText?.slice(0, 1200) || '',
      };
    })()`);
    const actions = [state.primary, state.footer].filter(Boolean);
    const matches = state.statusId &&
      state.statusText.includes(expectation.statusIncludes) &&
      actions.length === 2 &&
      actions.every((action) => (
        action.describedBy === state.statusId &&
        action.state === expectation.state &&
        action.actionStatus === state.statusText &&
        action.disabled === expectation.disabled &&
        (!expectation.disabledReasonIncludes || action.disabledReason.includes(expectation.disabledReasonIncludes)) &&
        (!expectation.targetEmail || action.targetEmail === expectation.targetEmail) &&
        (!expectation.targetRole || action.targetRole === expectation.targetRole) &&
        (!expectation.targetStatus || action.targetStatus === expectation.targetStatus)
      ));
    if (matches) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Invite submit action status did not match: ${JSON.stringify({ state, expectation })}`);
    }
    await sleep(250);
  }

  return null;
};

const fillInviteForm = async (client, { fullName, email }) => {
  let result = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    result = await evaluate(client, `(() => {
      const setInputValue = (input, value) => {
        const previousValue = input.value;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(input, value);
        input._valueTracker?.setValue(previousValue);
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      };
      const nameInput = document.querySelector('[data-testid="user-invite-full-name"]');
      const emailInput = document.querySelector('[data-testid="user-invite-email"]');
      const adminRole = document.querySelector('[data-testid="user-invite-role-admin"]');
      const invitedStatus = document.querySelector('[data-testid="user-invite-status-invited"]');
      if (!(nameInput instanceof HTMLInputElement) || !(emailInput instanceof HTMLInputElement)) {
        return { ok: false, reason: 'inputs-missing', body: document.body?.innerText?.slice(0, 900) || '' };
      }
      if (nameInput.value !== ${JSON.stringify(fullName)}) {
        nameInput.focus();
        setInputValue(nameInput, ${JSON.stringify(fullName)});
      }
      if (emailInput.value !== ${JSON.stringify(email)}) {
        emailInput.focus();
        setInputValue(emailInput, ${JSON.stringify(email)});
      }
      if (adminRole instanceof HTMLInputElement && !adminRole.checked) {
        adminRole.click();
      }
      if (invitedStatus instanceof HTMLInputElement && !invitedStatus.checked) {
        invitedStatus.click();
      }
      const form = document.querySelector('[data-testid="user-invite-form"]');
      const payloadPreview = document.querySelector('[data-testid="user-invite-payload-preview"]');
      const payload = JSON.parse(payloadPreview?.textContent || '{}');
      const submitStatus = document.querySelector('[data-testid="user-invite-submit-action-status"]');
      const submitStatusId = submitStatus?.id || '';
      const primarySubmit = document.querySelector('[data-testid="user-invite-submit-primary"]');
      const footerSubmit = document.querySelector('[data-testid="user-invite-submit-footer"]');
      const primaryAction = primarySubmit instanceof HTMLButtonElement ? {
        describedBy: primarySubmit.getAttribute('aria-describedby') || '',
        state: primarySubmit.getAttribute('data-action-state') || '',
        actionStatus: primarySubmit.getAttribute('data-action-status') || '',
        reason: primarySubmit.getAttribute('data-disabled-reason') || '',
        targetEmail: primarySubmit.getAttribute('data-target-email') || '',
        targetRole: primarySubmit.getAttribute('data-target-role') || '',
        targetStatus: primarySubmit.getAttribute('data-target-status') || '',
      } : null;
      const footerAction = footerSubmit instanceof HTMLButtonElement ? {
        describedBy: footerSubmit.getAttribute('aria-describedby') || '',
        state: footerSubmit.getAttribute('data-action-state') || '',
        actionStatus: footerSubmit.getAttribute('data-action-status') || '',
        reason: footerSubmit.getAttribute('data-disabled-reason') || '',
        targetEmail: footerSubmit.getAttribute('data-target-email') || '',
        targetRole: footerSubmit.getAttribute('data-target-role') || '',
        targetStatus: footerSubmit.getAttribute('data-target-status') || '',
      } : null;
      return {
        ok: nameInput.value === ${JSON.stringify(fullName)} &&
          emailInput.value === ${JSON.stringify(email)} &&
          form?.getAttribute('data-can-submit') === 'true' &&
          form?.getAttribute('data-selected-role') === 'admin' &&
          form?.getAttribute('data-selected-status') === 'invited' &&
          payload.fullName === ${JSON.stringify(fullName)} &&
          payload.email === ${JSON.stringify(email.toLowerCase())} &&
          payload.role === 'admin' &&
          payload.status === 'invited' &&
          payload.createInvite === true &&
          primarySubmit instanceof HTMLButtonElement &&
          primarySubmit.disabled === false &&
          primaryAction?.describedBy === submitStatusId &&
          primaryAction?.state === 'ready' &&
          primaryAction?.actionStatus === submitStatus?.textContent &&
          primaryAction?.targetEmail === ${JSON.stringify(email.toLowerCase())} &&
          primaryAction?.targetRole === 'admin' &&
          primaryAction?.targetStatus === 'invited' &&
          footerSubmit instanceof HTMLButtonElement &&
          footerSubmit.disabled === false &&
          footerAction?.describedBy === submitStatusId &&
          footerAction?.state === 'ready' &&
          footerAction?.actionStatus === submitStatus?.textContent &&
          footerAction?.targetEmail === ${JSON.stringify(email.toLowerCase())} &&
          footerAction?.targetRole === 'admin' &&
          footerAction?.targetStatus === 'invited',
        name: nameInput.value,
        email: emailInput.value,
        canSubmit: form?.getAttribute('data-can-submit') || '',
        selectedRole: form?.getAttribute('data-selected-role') || '',
        selectedStatus: form?.getAttribute('data-selected-status') || '',
        payload,
        submitStatusText: submitStatus?.textContent || '',
        submitStatusId,
        primaryAction,
        footerAction,
        primaryDisabled: primarySubmit instanceof HTMLButtonElement ? primarySubmit.disabled : null,
        footerDisabled: footerSubmit instanceof HTMLButtonElement ? footerSubmit.disabled : null,
      };
    })()`);
    if (result.ok) return result;
    await sleep(250);
  }

  assert(result?.ok, `Unable to fill invite form: ${JSON.stringify(result)}`);
};

const submitInviteFormAndAssertLink = async (client, email) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="user-invite-submit-primary"]') ||
        Array.from(document.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').trim() === 'Send invite');
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'button-missing' };
      }
      if (button.disabled) {
        return {
          ok: false,
          reason: 'button-disabled',
          values: {
            name: document.querySelector('[data-testid="user-invite-full-name"]') instanceof HTMLInputElement ? document.querySelector('[data-testid="user-invite-full-name"]').value : null,
            email: document.querySelector('[data-testid="user-invite-email"]') instanceof HTMLInputElement ? document.querySelector('[data-testid="user-invite-email"]').value : null,
            canSubmit: document.querySelector('[data-testid="user-invite-form"]')?.getAttribute('data-can-submit') || '',
            body: document.body?.innerText?.slice(0, 700) || '',
          },
        };
      }
      button.click();
      return { ok: true };
    })()`);
    if (clicked.ok) break;
    if (attempt === 79) {
      throw new Error(`Unable to click Send invite: ${JSON.stringify(clicked)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-invite-created-panel"]');
      const text = panel?.textContent || '';
      return {
        hasPanel: Boolean(panel),
        hasNotice: (document.body?.innerText || '').includes('Invited user created and invite email delivery was queued') ||
          (document.body?.innerText || '').includes('Invited user created. Copy the invite link below for manual delivery.'),
        hasDeliveryBackup: text.includes('Transactional delivery was queued') || text.includes('Delivery is still manual'),
        hasLink: text.includes('/accept-invite?token='),
        hasCopy: text.includes('Copy link'),
        hasEmail: (document.body?.innerText || '').includes(${JSON.stringify(email)}),
        text: text.slice(0, 900),
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);
    if (state.hasPanel && state.hasNotice && state.hasDeliveryBackup && state.hasLink && state.hasCopy && state.hasEmail) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Invite form did not expose manual invite link after create: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const setUsersDirectorySearch = async (client, query) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const commandCenter = document.querySelector('[data-testid="users-command-center"]');
      const input = document.querySelector('input[aria-label="Search users"]');
      const roleSelect = document.querySelector('select[aria-label="Filter users by role"]');
      const reviewSelect = document.querySelector('select[aria-label="Filter users by access review"]');
      const statusSelect = document.querySelector('select[aria-label="Filter users by status"]');

      if (!commandCenter || !(input instanceof HTMLInputElement)) {
        return {
          ok: false,
          reason: 'users-search-not-ready',
          path: window.location.pathname,
          body: document.body?.innerText?.slice(0, 800) || '',
        };
      }
      if (input.disabled || roleSelect?.disabled || reviewSelect?.disabled || statusSelect?.disabled) {
        return {
          ok: false,
          reason: 'users-search-disabled',
          path: window.location.pathname,
          query: input.value,
          body: document.body?.innerText?.slice(0, 800) || '',
        };
      }

      const setInputValue = (element, value) => {
        const previousValue = element.value;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(element, value);
        element._valueTracker?.setValue(previousValue);
        element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const setSelectValue = (element, value) => {
        if (!(element instanceof HTMLSelectElement) || element.value === value) return;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };

      setSelectValue(roleSelect, 'all');
      setSelectValue(reviewSelect, 'all');
      setSelectValue(statusSelect, 'all');
      if (input.value !== ${JSON.stringify(query)}) {
        setInputValue(input, ${JSON.stringify(query)});
      }

      return {
        ok: true,
        query: input.value,
        role: roleSelect instanceof HTMLSelectElement ? roleSelect.value : '',
        review: reviewSelect instanceof HTMLSelectElement ? reviewSelect.value : '',
        status: statusSelect instanceof HTMLSelectElement ? statusSelect.value : '',
      };
    })()`);
    if (result.ok) return result;
    if (attempt === 79) {
      throw new Error(`Unable to set users directory search to ${query}: ${JSON.stringify(result)}`);
    }
    await sleep(250);
  }

  return null;
};

const waitForUsersPageUser = async (client, email) => {
  let searchedDirectory = false;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const target = ${JSON.stringify(email)};
      const rows = Array.from(document.querySelectorAll('tbody tr')).map((row) => row.textContent || '');
      const detailButtons = Array.from(document.querySelectorAll('[data-testid^="users-open-detail-"], [data-testid^="users-edit-detail-"]')).map((button) => ({
        ariaLabel: button.getAttribute('aria-label') || '',
        userFullName: button.getAttribute('data-user-full-name') || '',
        text: button.textContent || '',
      }));
      return {
        ready: Boolean(document.querySelector('[data-testid="users-command-center"]')),
        hasUser: rows.some((row) => row.includes(target)) ||
          detailButtons.some((button) => button.ariaLabel.includes(target) || button.userFullName === target || button.text.includes(target)),
        path: window.location.pathname,
        query: document.querySelector('input[aria-label="Search users"]')?.value || '',
        rows: rows.slice(0, 12),
        detailButtons: detailButtons.slice(0, 12),
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);
    if (state.ready && state.hasUser && state.path === '/users') {
      return state;
    }
    if (state.ready && state.path === '/users' && !state.hasUser && !searchedDirectory) {
      await setUsersDirectorySearch(client, email);
      searchedDirectory = true;
    }
    if (attempt === 119) {
      throw new Error(`Users page did not show target user ${email}: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const waitForUsersSelfProtection = async (client) => {
  await setUsersDirectorySearch(client, 'admin@backy.io');
  let lastState = null;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const roleSelect = document.querySelector('select[aria-label="Change role for Admin User"]');
      const statusSelect = document.querySelector('select[aria-label="Change status for Admin User"]');
      const removeButton = document.querySelector('button[aria-label="Self removal locked for Admin User"]');
      const actionGroup = document.querySelector('[aria-label="Actions for Admin User"]');
      const actionStatus = actionGroup?.querySelector('[data-testid^="users-actions-status-"]');
      const actionStatusId = actionStatus?.id || '';
      const actionStatusText = (actionStatus?.textContent || '').replace(/\\s+/g, ' ').trim();
      return {
        hasYouPill: document.body?.innerText?.includes('You') || false,
        hasRoleLock: document.body?.innerText?.includes('Self role locked') || false,
        hasStatusLock: document.body?.innerText?.includes('Self status locked') || false,
        roleDisabled: roleSelect instanceof HTMLSelectElement && roleSelect.disabled,
        statusDisabled: statusSelect instanceof HTMLSelectElement && statusSelect.disabled,
        removeDisabled: removeButton instanceof HTMLButtonElement && removeButton.disabled,
        actionGroupRole: actionGroup?.getAttribute('role') || '',
        actionGroupDescribedBy: actionGroup?.getAttribute('aria-describedby') || '',
        actionGroupStatus: actionGroup?.getAttribute('data-action-status') || '',
        actionStatusId,
        actionStatusText,
        removeState: removeButton?.getAttribute('data-action-state') || '',
        removeReason: removeButton?.getAttribute('data-disabled-reason') || '',
        removeDescribedBy: removeButton?.getAttribute('aria-describedby') || '',
        query: document.querySelector('input[aria-label="Search users"]')?.value || '',
        rows: Array.from(document.querySelectorAll('tbody tr')).map((row) => row.textContent || '').slice(0, 10),
        body: document.body?.innerText?.slice(0, 1600) || '',
      };
    })()`);
    lastState = state;
    if (
      state.hasYouPill &&
      state.hasRoleLock &&
      state.hasStatusLock &&
      state.roleDisabled &&
      state.statusDisabled &&
      state.removeDisabled &&
      state.actionGroupRole === 'group' &&
      state.actionGroupDescribedBy === state.actionStatusId &&
      state.actionGroupStatus === state.actionStatusText &&
      state.actionStatusText.includes('Edit available.') &&
      state.actionStatusText.includes('Remove unavailable: You cannot remove your own signed-in account from this directory.') &&
      state.removeState === 'blocked' &&
      state.removeReason === 'You cannot remove your own signed-in account from this directory.' &&
      state.removeDescribedBy === state.actionStatusId
    ) {
      return state;
    }
    await sleep(250);
  }

  throw new Error(`Users self-protection controls did not render for Admin User: ${JSON.stringify(lastState)}`);
};

const setDirectoryUserSelect = async (client, fullName, labelPrefix, value) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const select = Array.from(document.querySelectorAll('select')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '').startsWith(${JSON.stringify(labelPrefix)}) &&
        (candidate.getAttribute('aria-label') || '').includes(${JSON.stringify(fullName)})
      ));
      if (!(select instanceof HTMLSelectElement)) {
        return {
          ok: false,
          reason: 'select-missing',
          labels: Array.from(document.querySelectorAll('select')).map((candidate) => candidate.getAttribute('aria-label') || ''),
        };
      }
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      descriptor?.set?.call(select, ${JSON.stringify(value)});
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()`);

    if (result.ok) {
      return;
    }
    if (attempt === 79) {
      throw new Error(`Unable to set ${labelPrefix} to ${value}: ${JSON.stringify(result)}`);
    }
    await sleep(250);
  }
};

const openUserDetail = async (client, fullName) => {
  const locationState = await evaluate(client, `(() => ({ path: window.location.pathname }))()`);
  if (locationState.path === '/users') {
    await waitForUsersPageUser(client, fullName);
  }

  const result = await evaluate(client, `(() => {
    const expectedEditLabel = ${JSON.stringify(`Edit ${fullName}`)};
    const expectedOpenLabel = ${JSON.stringify(`Open ${fullName}`)};
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => {
      const ariaLabel = candidate.getAttribute('aria-label') || '';
      const userFullName = candidate.getAttribute('data-user-full-name') || '';
      const testId = candidate.getAttribute('data-testid') || '';
      return ariaLabel === expectedEditLabel ||
        ariaLabel === expectedOpenLabel ||
        (userFullName === ${JSON.stringify(fullName)} && (testId.startsWith('users-edit-detail-') || testId.startsWith('users-open-detail-')));
    });
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => ({
          ariaLabel: candidate.getAttribute('aria-label') || '',
          text: (candidate.textContent || '').trim(),
          testId: candidate.getAttribute('data-testid') || '',
          userFullName: candidate.getAttribute('data-user-full-name') || '',
        })).slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled' };
    button.click();
    return { ok: true };
  })()`);

  assert(result.ok, `Unable to open user detail: ${JSON.stringify(result)}`);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="user-detail-command-center"]')) &&
        document.body?.innerText?.includes(${JSON.stringify(fullName)}),
      path: window.location.pathname,
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);
    if (state.ready && state.path.startsWith('/users/')) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`User detail did not render: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertUserDetailActionStatusContracts = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const readGroup = (selector, statusSelector) => {
        const group = document.querySelector(selector);
        const status = document.querySelector(statusSelector);
        const statusText = (status?.textContent || '').replace(/\\s+/g, ' ').trim();
        return {
          present: group instanceof HTMLElement,
          role: group?.getAttribute('role') || '',
          describedBy: group?.getAttribute('aria-describedby') || '',
          statusId: status?.id || '',
          statusText,
          statusAttr: group?.getAttribute('data-action-status') || '',
          state: group?.getAttribute('data-action-state') || '',
        };
      };
      const readControl = (selector) => {
        const control = document.querySelector(selector);
        return {
          present: control instanceof HTMLElement,
          disabled: control instanceof HTMLButtonElement || control instanceof HTMLSelectElement ? control.disabled : null,
          ariaDisabled: control?.getAttribute('aria-disabled') || '',
          describedBy: control?.getAttribute('aria-describedby') || '',
          state: control?.getAttribute('data-action-state') || '',
          status: control?.getAttribute('data-action-status') || '',
          reason: control?.getAttribute('data-disabled-reason') || '',
          text: (control?.textContent || '').replace(/\\s+/g, ' ').trim(),
        };
      };
      const command = readGroup('[data-testid="user-detail-command-center"]', '[data-testid="user-detail-command-action-status"]');
      const commandCenterActionNodes = Array.from(document.querySelector('[data-testid="user-detail-command-center"]')?.querySelectorAll('button, summary, details') || []);
      const commandCenterActionNames = commandCenterActionNodes.map((node, index) => ({
        index,
        tagName: node.tagName.toLowerCase(),
        text: (node.textContent || '').replace(/\\s+/g, ' ').trim(),
        testId: node.getAttribute('data-testid') || '',
      })).filter((node) => node.text);
      const saveNodeIndex = commandCenterActionNames.findIndex((node) => node.testId === 'user-detail-command-save');
      const moreActionsNodeIndex = commandCenterActionNames.findIndex((node) => node.testId === 'user-detail-more-actions');
      const copyNodeIndex = commandCenterActionNames.findIndex((node) => node.testId === 'user-detail-command-copy-manifest');
      const downloadNodeIndex = commandCenterActionNames.findIndex((node) => node.testId === 'user-detail-command-download-json');
      const commandHierarchyReady = saveNodeIndex >= 0 &&
        moreActionsNodeIndex > saveNodeIndex &&
        copyNodeIndex > moreActionsNodeIndex &&
        downloadNodeIndex > moreActionsNodeIndex;
      const api = readGroup('[data-testid="user-detail-api"]', '[data-testid="user-detail-api-action-status"]');
      const activity = readGroup('[data-testid="user-detail-activity"]', '[data-testid="user-detail-activity-action-status"]');
      const sessions = readGroup('[data-testid="user-detail-sessions"]', '[data-testid="user-detail-sessions-action-status"]');
      const recovery = readGroup('[data-testid="user-detail-recovery"]', '[data-testid="user-detail-recovery-action-status"]');
      const mfa = readGroup('[data-testid="user-detail-mfa"]', '[data-testid="user-detail-mfa-action-status"]');
      const ownership = readGroup('[data-testid="user-detail-ownership-transfer"]', '[data-testid="user-detail-ownership-action-status"]');
      const danger = readGroup('[data-testid="user-detail-danger"]', '[data-testid="user-detail-danger-action-status"]');
      const lifecycle = Array.from(document.querySelectorAll('[data-testid^="user-detail-lifecycle-"]')).map((control) => ({
        describedBy: control.getAttribute('aria-describedby') || '',
        state: control.getAttribute('data-action-state') || '',
        status: control.getAttribute('data-action-status') || '',
        reason: control.getAttribute('data-disabled-reason') || '',
        disabled: control instanceof HTMLButtonElement ? control.disabled : null,
        text: (control.textContent || '').replace(/\\s+/g, ' ').trim(),
      }));
      return {
        command,
        commandCenterActionNames,
        commandHierarchyReady,
        back: readControl('[data-testid="user-detail-back-to-users"]'),
        commandCopy: readControl('[data-testid="user-detail-command-copy-manifest"]'),
        commandDownload: readControl('[data-testid="user-detail-command-download-json"]'),
        commandSave: readControl('[data-testid="user-detail-command-save"]'),
        footerSave: readControl('[data-testid="user-detail-footer-save"]'),
        footerCancel: readControl('[data-testid="user-detail-footer-cancel"]'),
        api,
        apiCopyUrl: readControl('[data-testid="user-detail-api-copy-url"]'),
        apiCopyManifest: readControl('[data-testid="user-detail-api-copy-manifest"]'),
        activity,
        activityRefresh: readControl('[data-testid="user-detail-activity-refresh"]'),
        activityActionFilter: readControl('[data-testid="user-detail-activity-filter-action"]'),
        activityRequestFilter: readControl('[data-testid="user-detail-activity-filter-request"]'),
        activityApply: readControl('[data-testid="user-detail-activity-filter-apply"]'),
        activityClear: readControl('[data-testid="user-detail-activity-filter-clear"]'),
        sessions,
        sessionsRefresh: readControl('[data-testid="user-detail-sessions-refresh"]'),
        recovery,
        invite: readControl('[data-testid="user-detail-generate-invite-link"]'),
        reset: readControl('[data-testid="user-detail-generate-reset-token"]'),
        email: readControl('[data-testid="user-detail-email-reset-instructions"]'),
        lifecycle,
        mfa,
        mfaRefresh: readControl('[data-testid="user-detail-mfa-refresh"]'),
        mfaToggle: readControl('[data-testid="user-detail-mfa-toggle"]'),
        mfaGenerate: readControl('[data-testid="user-detail-mfa-generate-recovery"]'),
        ownership,
        transfer: readControl('[data-testid="user-detail-transfer-ownership-button"]'),
        danger,
        remove: readControl('[data-testid="user-detail-remove-user"]'),
      };
    })()`);

    const groupsReady =
      state.command.present &&
      state.api.present &&
      state.activity.present &&
      state.sessions.present &&
      state.commandCopy.present &&
      state.apiCopyUrl.present &&
      state.activityRefresh.present &&
      state.sessionsRefresh.present &&
      state.recovery.present &&
      state.mfa.present &&
      state.ownership.present &&
      state.danger.present &&
      state.mfaToggle.present &&
      state.mfaGenerate.present;
    if (!groupsReady) {
      if (attempt === 99) {
        throw new Error(`User detail action status groups did not render: ${JSON.stringify(state).slice(0, 2200)}`);
      }
      await sleep(250);
      continue;
    }

    const groupContracts = [state.command, state.api, state.activity, state.sessions, state.recovery, state.mfa, state.ownership, state.danger].every((group) => (
      group.role === 'group' &&
      group.describedBy === group.statusId &&
      group.statusText.length > 20 &&
      group.statusAttr === group.statusText &&
      ['ready', 'blocked'].includes(group.state)
    ));
    const commandContracts =
      state.command.statusText.includes('Copy manifest available.') &&
      state.command.statusText.includes('Download JSON available.') &&
      state.command.statusText.includes('Save changes unavailable: No account changes to save.') &&
      state.commandHierarchyReady === true &&
      state.back.describedBy === state.command.statusId &&
      state.back.state === 'ready' &&
      state.commandCopy.describedBy === state.command.statusId &&
      state.commandCopy.state === 'ready' &&
      state.commandDownload.describedBy === state.command.statusId &&
      state.commandDownload.state === 'ready' &&
      state.commandSave.describedBy === state.command.statusId &&
      state.commandSave.state === 'blocked' &&
      state.commandSave.reason.includes('No account changes') &&
      state.footerSave.describedBy === state.command.statusId &&
      state.footerSave.state === 'blocked' &&
      state.footerCancel.describedBy === state.command.statusId &&
      state.footerCancel.state === 'ready';
    const apiContracts =
      state.api.statusText.includes('Copy API URL available.') &&
      state.api.statusText.includes('Copy API manifest available.') &&
      state.apiCopyUrl.describedBy === state.api.statusId &&
      state.apiCopyUrl.state === 'ready' &&
      state.apiCopyManifest.describedBy === state.api.statusId &&
      state.apiCopyManifest.state === 'ready';
    const activityContracts =
      state.activity.statusText.includes('Activity refresh available.') &&
      state.activityRefresh.describedBy === state.activity.statusId &&
      state.activityRefresh.state === 'ready' &&
      state.activityActionFilter.describedBy === state.activity.statusId &&
      state.activityActionFilter.state === 'ready' &&
      state.activityRequestFilter.describedBy === state.activity.statusId &&
      state.activityRequestFilter.state === 'ready' &&
      state.activityApply.describedBy === state.activity.statusId &&
      state.activityApply.state === 'ready' &&
      state.activityClear.describedBy === state.activity.statusId &&
      state.activityClear.state === 'blocked' &&
      state.activityClear.reason.includes('No activity filters');
    const sessionsContracts =
      state.sessions.statusText.includes('Session refresh available.') &&
      state.sessionsRefresh.describedBy === state.sessions.statusId &&
      state.sessionsRefresh.state === 'ready';
    const recoveryContracts =
      state.recovery.statusText.includes('Invite link available.') &&
      state.recovery.statusText.includes('Reset token available.') &&
      state.invite.describedBy === state.recovery.statusId &&
      state.invite.state === 'ready' &&
      state.invite.disabled === false &&
      state.reset.describedBy === state.recovery.statusId &&
      state.reset.state === 'ready' &&
      state.reset.disabled === false &&
      state.email.describedBy === state.recovery.statusId &&
      state.email.state === 'ready' &&
      state.email.ariaDisabled === 'false' &&
      state.lifecycle.length === 4 &&
      state.lifecycle.some((item) => item.state === 'ready' && item.disabled === false) &&
      state.lifecycle.some((item) => item.state === 'blocked' && item.reason.includes('already active')) &&
      state.lifecycle.every((item) => item.describedBy === state.recovery.statusId && item.status === state.recovery.statusText);
    const mfaContracts =
      state.mfa.statusText.includes('MFA updates available.') &&
      state.mfaRefresh.describedBy === state.mfa.statusId &&
      ['ready', 'blocked'].includes(state.mfaRefresh.state) &&
      state.mfaToggle.describedBy === state.mfa.statusId &&
      state.mfaToggle.state === 'ready' &&
      state.mfaToggle.disabled === false &&
      state.mfaGenerate.describedBy === state.mfa.statusId &&
      state.mfaGenerate.state === 'ready' &&
      state.mfaGenerate.disabled === false;
    const ownershipContracts =
      state.ownership.statusText.includes('Ownership transfer unavailable') &&
      state.transfer.describedBy === state.ownership.statusId &&
      state.transfer.state === 'blocked' &&
      state.transfer.disabled === true &&
      state.transfer.reason.includes('Activate the target user');
    const dangerContracts =
      state.danger.statusText.includes('Remove user available.') &&
      state.remove.describedBy === state.danger.statusId &&
      state.remove.state === 'ready' &&
      state.remove.disabled === false;

    assert(
      groupContracts && commandContracts && apiContracts && activityContracts && sessionsContracts && recoveryContracts && mfaContracts && ownershipContracts && dangerContracts,
      `User detail action status contracts are incomplete: ${JSON.stringify(state).slice(0, 3500)}`,
    );
    return state;
  }

  return null;
};

const waitForUserDetailSelfProtection = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const accessSelects = Array.from(document.querySelectorAll('#user-detail-access select'));
      const lifecycleButtons = Array.from(document.querySelectorAll('button')).filter((button) => (
        ['Activate', 'Set invited', 'Mark inactive', 'Suspend'].some((label) => (button.textContent || '').includes(label))
      ));
      const removeButton = Array.from(document.querySelectorAll('button')).find((button) => (
        (button.textContent || '').trim() === 'Remove user'
      ));
      const text = document.body?.innerText || '';
      return {
        hasSelfNotice: text.includes('You are editing your signed-in account'),
        roleDisabled: accessSelects[0] instanceof HTMLSelectElement && accessSelects[0].disabled,
        statusDisabled: accessSelects[1] instanceof HTMLSelectElement && accessSelects[1].disabled,
        lifecycleDisabled: lifecycleButtons.length >= 3 && lifecycleButtons.every((button) => button.disabled),
        removeDisabled: removeButton instanceof HTMLButtonElement && removeButton.disabled,
        body: text.slice(0, 1600),
      };
    })()`);
    if (state.hasSelfNotice && state.roleDisabled && state.statusDisabled && state.lifecycleDisabled && state.removeDisabled) {
      return state;
    }
    await sleep(250);
  }

  throw new Error('User detail self-protection controls did not render for Admin User');
};

const waitForUserDetailSessions = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-sessions"]');
      const status = document.querySelector('[data-testid="user-detail-sessions-action-status"]');
      const refresh = panel?.querySelector('[data-testid="user-detail-sessions-refresh"]');
      const text = panel?.textContent || '';
      const protectedButton = Array.from(panel?.querySelectorAll('button') || []).find((button) => (
        (button.textContent || '').includes('Protected')
      ));
      const statusId = status?.id || '';
      const statusText = (status?.textContent || '').replace(/\\s+/g, ' ').trim();
      return {
        ready: Boolean(panel),
        role: panel?.getAttribute('role') || '',
        describedBy: panel?.getAttribute('aria-describedby') || '',
        statusId,
        statusText,
        statusAttr: panel?.getAttribute('data-action-status') || '',
        panelState: panel?.getAttribute('data-action-state') || '',
        hasSessions: text.includes('Admin sessions'),
        hasCurrent: text.includes('Current session'),
        hasLocalDemo: text.includes('local-demo'),
        refreshDescribedBy: refresh?.getAttribute('aria-describedby') || '',
        refreshState: refresh?.getAttribute('data-action-state') || '',
        protectedDisabled: protectedButton instanceof HTMLButtonElement && protectedButton.disabled,
        protectedDescribedBy: protectedButton?.getAttribute('aria-describedby') || '',
        protectedState: protectedButton?.getAttribute('data-action-state') || '',
        protectedReason: protectedButton?.getAttribute('data-disabled-reason') || '',
        text: text.slice(0, 1600),
      };
    })()`);
    if (
      state.ready &&
      state.role === 'group' &&
      state.describedBy === state.statusId &&
      state.statusAttr === state.statusText &&
      state.panelState === 'ready' &&
      state.hasSessions &&
      state.hasCurrent &&
      state.hasLocalDemo &&
      state.refreshDescribedBy === state.statusId &&
      state.refreshState === 'ready' &&
      state.protectedDisabled &&
      state.protectedDescribedBy === state.statusId &&
      state.protectedState === 'blocked' &&
      state.protectedReason.includes('Current session is protected')
    ) {
      return state;
    }
    await sleep(250);
  }

  throw new Error('User detail sessions panel did not show the protected current session');
};

const waitForUserDetailPermissionMatrix = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('#user-detail-permissions');
      const text = panel?.textContent || '';
      return {
        ready: Boolean(panel),
        hasMatrix: text.includes('Backend permission matrix'),
        hasUsersAccess: text.includes('Users and access'),
        hasSettings: text.includes('Settings and integrations'),
        hasAllowedSummary: text.includes('Allowed capabilities') && text.includes('/'),
        hasStatusGate: text.includes('Status gate'),
        text: text.slice(0, 1800),
      };
    })()`);
    if (state.ready && state.hasMatrix && state.hasUsersAccess && state.hasSettings && state.hasAllowedSummary && state.hasStatusGate) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`User detail permission matrix did not render: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const setUserDetailPermissionOverride = async (client, userId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="permission-activity.export-deny"]');
      if (button instanceof HTMLButtonElement && !button.disabled) {
        button.click();
      }
      const panel = document.querySelector('#user-detail-permissions');
      const text = panel?.textContent || '';
      const row = document.querySelector('[data-testid="permission-activity.export"]');
      return {
        clicked: button instanceof HTMLButtonElement,
        saved: text.includes('Saved deny override for activity.export'),
        hasOverride: (row?.textContent || '').includes('Override'),
        text: text.slice(0, 1800),
      };
    })()`);

    if (state.saved || state.hasOverride) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`User detail permission override did not save: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  const payload = await requestApi(`/api/admin/users/${userId}/permissions`);
  const groups = payload.data?.permissions?.groups || [];
  const rule = groups
    .flatMap((group) => group.permissions || [])
    .find((permission) => permission.key === 'activity.export');

  assert(rule?.override === 'deny', `Permission override API did not persist deny: ${JSON.stringify(rule).slice(0, 500)}`);
};

const generateUserDetailInviteLink = async (client, email) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-recovery"]');
      const text = panel?.textContent || '';
      const button = Array.from(panel?.querySelectorAll('button') || []).find((candidate) => (
        (candidate.textContent || '').trim() === 'Generate invite link'
      ));
      return {
        ready: Boolean(panel),
        hasPanel: text.includes('Account recovery'),
        hasEmail: document.body?.innerText?.includes(${JSON.stringify(email)}) || false,
        buttonEnabled: button instanceof HTMLButtonElement && !button.disabled,
        text: text.slice(0, 1600),
      };
    })()`);
    if (state.ready && state.hasPanel && state.hasEmail && state.buttonEnabled) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`User detail invite panel was not ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  const expiryResult = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="user-detail-recovery"]');
    const select = panel?.querySelector('select[aria-label="Invite link expiry"]');
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'invite-expiry-missing' };
    }
    select.value = '43200';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  })()`);
  assert(expiryResult.ok && expiryResult.value === '43200', `Unable to set invite expiry: ${JSON.stringify(expiryResult)}`);

  await clickButton(client, 'Generate invite link');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-recovery"]');
      const text = panel?.textContent || '';
      return {
        ready: Boolean(panel),
        hasNotice: text.includes('Local invite link generated') || text.includes('Invite delivery was queued'),
        hidesInviteUrl: text.includes('Invite URL hidden') && !text.includes('/accept-invite?token=bit_'),
        hasMaskedToken: /bit_[a-z0-9]{2}\.\.\.[a-z0-9]{4}/.test(text),
        hasTokenId: text.includes('invite_'),
        hasCopyControls: text.includes('Copy invite URL') && text.includes('Copy invite token'),
        token: '',
        text: text.slice(0, 1800),
      };
    })()`);
    if (state.ready && state.hasNotice && state.hidesInviteUrl && state.hasMaskedToken && state.hasTokenId && state.hasCopyControls) {
      const copied = await evaluate(client, `(async () => {
        window.__backyUsersSmokeClipboard = '';
        const clipboard = {
          writeText: async (value) => {
            window.__backyUsersSmokeClipboard = String(value || '');
          },
        };
        try {
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
        } catch {
          navigator.clipboard.writeText = clipboard.writeText;
        }
        const panel = document.querySelector('[data-testid="user-detail-recovery"]');
        const button = Array.from(panel?.querySelectorAll('button') || []).find((candidate) => (
          (candidate.textContent || '').trim() === 'Copy invite token'
        ));
        if (!(button instanceof HTMLButtonElement) || button.disabled) {
          return { ok: false, reason: 'copy-token-button-unavailable' };
        }
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ok: /^bit_[a-z0-9]+$/.test(window.__backyUsersSmokeClipboard || ''), token: window.__backyUsersSmokeClipboard || '' };
      })()`);
      assert(copied.ok, `Invite token copy action did not expose a usable token to clipboard: ${JSON.stringify(copied)}`);
      return { ...state, token: copied.token };
    }
    if (attempt === 99) {
      throw new Error(`Invite link UI did not render masked generated token state: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const acceptUserInviteToken = async (token, userId) => {
  assert(token, 'Invite token was not captured from the detail page');
  const payload = await requestApi('/api/admin/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

  assert(payload.data?.accepted === true, `Invite accept endpoint did not accept token: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload.data?.session?.token, `Invite accept endpoint did not return a session: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload.data?.user?.id === userId, `Invite accept returned the wrong user: ${JSON.stringify(payload.data?.user).slice(0, 500)}`);

  const acceptedUser = await getUser(userId);
  assert(acceptedUser.status === 'active', `Invite acceptance did not activate user: ${JSON.stringify(acceptedUser).slice(0, 500)}`);
};

const generateUserDetailResetToken = async (client, email) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-recovery"]');
      const text = panel?.textContent || '';
      const button = Array.from(panel?.querySelectorAll('button') || []).find((candidate) => (
        (candidate.textContent || '').trim() === 'Generate reset token'
      ));
      return {
        ready: Boolean(panel),
        hasPanel: text.includes('Account recovery'),
        hasEmail: document.body?.innerText?.includes(${JSON.stringify(email)}) || false,
        buttonEnabled: button instanceof HTMLButtonElement && !button.disabled,
        text: text.slice(0, 1600),
      };
    })()`);
    if (state.ready && state.hasPanel && state.hasEmail && state.buttonEnabled) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`User detail recovery panel was not ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  const expiryResult = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="user-detail-recovery"]');
    const select = panel?.querySelector('select[aria-label="Reset link expiry"]');
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'reset-expiry-missing' };
    }
    select.value = '240';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  })()`);
  assert(expiryResult.ok && expiryResult.value === '240', `Unable to set reset expiry: ${JSON.stringify(expiryResult)}`);

  await clickButton(client, 'Generate reset token');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-recovery"]');
      const text = panel?.textContent || '';
      return {
        ready: Boolean(panel),
        hasNotice: text.includes('Local reset token generated') || text.includes('Password reset delivery was queued'),
        hidesResetUrl: text.includes('Reset URL hidden') && !text.includes('/reset-password?token=bpr_'),
        hasMaskedToken: /bpr_[a-z0-9]{2}\.\.\.[a-z0-9]{4}/.test(text),
        hasTokenId: text.includes('reset_'),
        hasCopyControls: text.includes('Copy reset URL') && text.includes('Copy token'),
        token: '',
        text: text.slice(0, 1800),
      };
    })()`);
    if (state.ready && state.hasNotice && state.hidesResetUrl && state.hasMaskedToken && state.hasTokenId && state.hasCopyControls) {
      const copied = await evaluate(client, `(async () => {
        window.__backyUsersSmokeClipboard = '';
        const clipboard = {
          writeText: async (value) => {
            window.__backyUsersSmokeClipboard = String(value || '');
          },
        };
        try {
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
        } catch {
          navigator.clipboard.writeText = clipboard.writeText;
        }
        const panel = document.querySelector('[data-testid="user-detail-recovery"]');
        const button = Array.from(panel?.querySelectorAll('button') || []).find((candidate) => (
          (candidate.textContent || '').trim() === 'Copy token'
        ));
        if (!(button instanceof HTMLButtonElement) || button.disabled) {
          return { ok: false, reason: 'copy-token-button-unavailable' };
        }
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ok: /^bpr_[a-z0-9]+$/.test(window.__backyUsersSmokeClipboard || ''), token: window.__backyUsersSmokeClipboard || '' };
      })()`);
      assert(copied.ok, `Reset token copy action did not expose a usable token to clipboard: ${JSON.stringify(copied)}`);
      return { ...state, token: copied.token };
    }
    if (attempt === 99) {
      throw new Error(`Reset token UI did not render masked generated token state: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const resetUserPasswordToken = async (token, userId, email, password) => {
  assert(token, 'Password reset token was not captured from the detail page');
  const payload = await requestApi('/api/admin/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });

  assert(payload.data?.reset === true, `Password reset endpoint did not accept token: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload.data?.session?.token, `Password reset endpoint did not return a session: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload.data?.user?.id === userId, `Password reset returned the wrong user: ${JSON.stringify(payload.data?.user).slice(0, 500)}`);

  const loginResponse = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const loginPayload = await loginResponse.json().catch(() => ({}));
  assert(
    (loginResponse.ok && loginPayload.data?.session?.token) ||
      (loginResponse.status === 401 && loginPayload.error?.code === 'MFA_REQUIRED'),
    `New password did not sign in or reach the MFA challenge: ${JSON.stringify(loginPayload).slice(0, 500)}`,
  );
};

const configureUserDetailMfa = async (client, { userId, email, password }) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-mfa"]');
      const text = panel?.textContent || '';
      const toggle = panel?.querySelector('[data-testid="user-detail-mfa-toggle"]');
      const generate = panel?.querySelector('[data-testid="user-detail-mfa-generate-recovery"]');
      return {
        ready: Boolean(panel),
        hasPanel: text.includes('Per-user MFA'),
        hasEmail: document.body?.innerText?.includes(${JSON.stringify(email)}) || false,
        toggleEnabled: toggle instanceof HTMLButtonElement && !toggle.disabled,
        generateEnabled: generate instanceof HTMLButtonElement && !generate.disabled,
        text: text.slice(0, 1600),
      };
    })()`);
    if (state.ready && state.hasPanel && state.hasEmail && state.toggleEnabled && state.generateEnabled) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`User detail MFA panel was not ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  await clickButton(client, 'Enable per-user MFA');

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-mfa"]');
      const text = panel?.textContent || '';
      const generate = panel?.querySelector('[data-testid="user-detail-mfa-generate-recovery"]');
      return {
        enabled: panel?.querySelector('[data-testid="user-detail-mfa-status"]')?.textContent?.includes('Enabled') || false,
        notice: text.includes('Per-user MFA enabled'),
        generateEnabled: generate instanceof HTMLButtonElement && !generate.disabled,
        text: text.slice(0, 1600),
      };
    })()`);
    if (state.enabled && state.notice && state.generateEnabled) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`User detail MFA enable state did not persist: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  await clickButton(client, 'Generate recovery codes');

  const recoveryState = await (async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const panel = document.querySelector('[data-testid="user-detail-mfa"]');
        const text = panel?.textContent || '';
        const codes = Array.from(panel?.querySelectorAll('[data-testid="user-detail-mfa-recovery-codes"] code') || [])
          .map((node) => node.textContent?.trim() || '')
          .filter(Boolean);
        return {
          hasNotice: text.includes('New recovery codes generated'),
          hasCodePanel: Boolean(panel?.querySelector('[data-testid="user-detail-mfa-recovery-codes"]')),
          countText: panel?.querySelector('[data-testid="user-detail-mfa-recovery-count"]')?.textContent || '',
          codes,
          text: text.slice(0, 2000),
        };
      })()`);
      if (state.hasNotice && state.hasCodePanel && state.codes.length === 10 && state.codes.every((code) => /^mfa_[a-f0-9]{10}$/.test(code))) {
        return state;
      }
      if (attempt === 99) {
        throw new Error(`User detail MFA recovery codes did not render: ${JSON.stringify(state)}`);
      }
      await sleep(250);
    }
    return null;
  })();

  const copied = await evaluate(client, `(async () => {
    window.__backyUsersSmokeClipboard = '';
    const clipboard = {
      writeText: async (value) => {
        window.__backyUsersSmokeClipboard = String(value || '');
      },
    };
    try {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    } catch {
      navigator.clipboard.writeText = clipboard.writeText;
    }
    const button = document.querySelector('[data-testid="user-detail-mfa-copy-recovery"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: 'copy-recovery-button-unavailable' };
    }
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const codes = (window.__backyUsersSmokeClipboard || '').split(/\\n+/).filter(Boolean);
    return { ok: codes.length === 10 && codes.every((code) => /^mfa_[a-f0-9]{10}$/.test(code)), codes };
  })()`);
  assert(copied.ok, `MFA recovery code copy action did not expose usable codes: ${JSON.stringify(copied)}`);

  const missingMfa = await loginWithCredentials({ email, password });
  assert(missingMfa.response.status === 401, `Per-user MFA should require a second factor, got ${missingMfa.response.status}: ${JSON.stringify(missingMfa.payload).slice(0, 500)}`);
  assert(missingMfa.payload?.error?.code === 'MFA_REQUIRED', `Missing MFA should return MFA_REQUIRED: ${JSON.stringify(missingMfa.payload).slice(0, 500)}`);

  const [recoveryCode] = copied.codes;
  const recoveredLogin = await loginWithCredentials({ email, password, twoFactorCode: recoveryCode });
  assert(recoveredLogin.response.ok && recoveredLogin.payload?.data?.session?.token, `Recovery code did not complete login: ${JSON.stringify(recoveredLogin.payload).slice(0, 500)}`);
  assert(recoveredLogin.payload?.data?.user?.id === userId, `Recovery login returned wrong user: ${JSON.stringify(recoveredLogin.payload?.data?.user).slice(0, 500)}`);

  const reusedLogin = await loginWithCredentials({ email, password, twoFactorCode: recoveryCode });
  assert(reusedLogin.response.status === 401, `Reused recovery code should be rejected, got ${reusedLogin.response.status}: ${JSON.stringify(reusedLogin.payload).slice(0, 500)}`);
  assert(reusedLogin.payload?.error?.code === 'INVALID_MFA_CODE', `Reused recovery code should return INVALID_MFA_CODE: ${JSON.stringify(reusedLogin.payload).slice(0, 500)}`);

  const mfa = await getUserMfa(userId);
  assert(mfa.enabled === true, `MFA endpoint did not report enabled after setup: ${JSON.stringify(mfa).slice(0, 500)}`);
  assert(mfa.recoveryCodesRemaining === 9, `MFA recovery code was not consumed exactly once: ${JSON.stringify(mfa).slice(0, 500)}`);

  return {
    generatedCount: copied.codes.length,
    remainingAfterUse: mfa.recoveryCodesRemaining,
    firstCode: recoveryCode,
    uiCountText: recoveryState.countText,
  };
};

const setUserDetailLifecycle = async (client, label) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').includes(${JSON.stringify(label)})
      ));
      if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'button-missing' };
      if (button.disabled) return { ok: false, reason: 'button-disabled' };
      button.click();
      return { ok: true };
    })()`);

    if (result.ok) {
      return;
    }
    if (attempt === 79) {
      throw new Error(`Unable to run user lifecycle action ${label}: ${JSON.stringify(result)}`);
    }
    await sleep(250);
  }
};

const transferOwnershipFromDetail = async (client, fullName) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-ownership-transfer"]');
      const button = document.querySelector('[data-testid="user-detail-transfer-ownership-button"]');
      const text = panel?.textContent || '';
      return {
        ready: Boolean(panel),
        hasTarget: text.includes(${JSON.stringify(fullName)}),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        text: text.slice(0, 1000),
      };
    })()`);

    if (state.ready && state.hasTarget && state.disabled === false) {
      break;
    }
    if (attempt === 99) {
      throw new Error(`Ownership transfer panel was not ready: ${JSON.stringify(state).slice(0, 1600)}`);
    }
    await sleep(250);
  }

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="user-detail-transfer-ownership-button"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'button-missing' };
    if (button.disabled) return { ok: false, reason: 'button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to click ownership transfer: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-ownership-transfer"]');
      const text = panel?.textContent || '';
      return {
        ok: text.includes('is now workspace owner') && text.includes('was moved to admin'),
        text: text.slice(0, 1000),
      };
    })()`);
    if (result.ok) {
      return result;
    }
    await sleep(250);
  }

  throw new Error('Ownership transfer UI did not show success state.');
};

const removeUserFromDirectory = async (client, fullName) => {
  await waitForUsersPageUser(client, fullName);
  const actionStatusState = await evaluate(client, `(() => {
    const actionGroup = document.querySelector(${JSON.stringify(`[aria-label="Actions for ${fullName}"]`)});
    const actionStatus = actionGroup?.querySelector('[data-testid^="users-actions-status-"]');
    const editButton = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Edit ${fullName}`)}
    ));
    const removeButton = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Remove ${fullName}`)}
    ));
    const actionStatusId = actionStatus?.id || '';
    const actionStatusText = (actionStatus?.textContent || '').replace(/\\s+/g, ' ').trim();
    return {
      hasGroup: actionGroup instanceof HTMLElement,
      groupRole: actionGroup?.getAttribute('role') || '',
      groupLabel: actionGroup?.getAttribute('aria-label') || '',
      groupDescribedBy: actionGroup?.getAttribute('aria-describedby') || '',
      groupStatus: actionGroup?.getAttribute('data-action-status') || '',
      statusId: actionStatusId,
      statusText: actionStatusText,
      editState: editButton?.getAttribute('data-action-state') || '',
      editReason: editButton?.getAttribute('data-disabled-reason') || '',
      editDescribedBy: editButton?.getAttribute('aria-describedby') || '',
      removeState: removeButton?.getAttribute('data-action-state') || '',
      removeReason: removeButton?.getAttribute('data-disabled-reason') || '',
      removeDescribedBy: removeButton?.getAttribute('aria-describedby') || '',
      removeDisabled: removeButton instanceof HTMLButtonElement && removeButton.disabled,
    };
  })()`);
  assert(
    actionStatusState.hasGroup &&
      actionStatusState.groupRole === 'group' &&
      actionStatusState.groupLabel === `Actions for ${fullName}` &&
      actionStatusState.groupDescribedBy === actionStatusState.statusId &&
      actionStatusState.groupStatus === actionStatusState.statusText &&
      actionStatusState.statusText.includes('Edit available.') &&
      actionStatusState.statusText.includes('Remove available.') &&
      actionStatusState.editState === 'ready' &&
      actionStatusState.editReason === '' &&
      actionStatusState.editDescribedBy === actionStatusState.statusId &&
      actionStatusState.removeState === 'ready' &&
      actionStatusState.removeReason === '' &&
      actionStatusState.removeDescribedBy === actionStatusState.statusId &&
      actionStatusState.removeDisabled === false,
    `Users row action status is incomplete for ${fullName}: ${JSON.stringify(actionStatusState)}`,
  );
  const openDeleteDialog = async () => evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Remove ${fullName}`)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'remove-disabled' };
    button.click();
    return { ok: true };
  })()`);
  const openResult = await openDeleteDialog();
  assert(openResult.ok, `Unable to open delete confirmation: ${JSON.stringify(openResult)}`);

  const dialogState = await evaluate(client, `(() => {
    const dialog = document.querySelector('[data-testid="users-delete-confirm-dialog"]');
    return {
      hasDialog: dialog instanceof HTMLElement,
      role: dialog?.getAttribute('role') || '',
      ariaModal: dialog?.getAttribute('aria-modal') || '',
      labelledBy: dialog?.getAttribute('aria-labelledby') || '',
      title: dialog?.querySelector('h2')?.textContent || '',
      text: dialog?.textContent?.slice(0, 500) || '',
    };
  })()`);
  assert(
    dialogState.hasDialog &&
      dialogState.role === 'dialog' &&
      dialogState.ariaModal === 'true' &&
      dialogState.labelledBy === 'users-delete-confirm-title' &&
      dialogState.title === `Remove ${fullName}?`,
    `User delete confirmation is missing dialog semantics: ${JSON.stringify(dialogState)}`,
  );

  await pressKey(client, 'Escape');
  const escapeClosed = await evaluate(client, `(() => ({
    closed: !document.querySelector('[data-testid="users-delete-confirm-dialog"]'),
    stillHasUser: document.body?.innerText?.includes(${JSON.stringify(fullName)}) || false,
  }))()`);
  assert(
    escapeClosed.closed && escapeClosed.stillHasUser,
    `Escape did not dismiss user delete confirmation safely: ${JSON.stringify(escapeClosed)}`,
  );

  const reopenResult = await openDeleteDialog();
  assert(reopenResult.ok, `Unable to reopen delete confirmation after Escape: ${JSON.stringify(reopenResult)}`);

  const confirmResult = await evaluate(client, `(() => {
    const dialog = document.querySelector('[data-testid="users-delete-confirm-dialog"]');
    const button = dialog && Array.from(dialog.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === 'Remove user'
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'confirm-missing', dialog: dialog?.textContent?.slice(0, 500) || '' };
    }
    if (button.disabled) return { ok: false, reason: 'confirm-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(confirmResult.ok, `Unable to confirm user deletion: ${JSON.stringify(confirmResult)}`);
};

const assertUserDetailDeleteDialogEscape = async (client, fullName) => {
  const openResult = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === 'Remove user'
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'button-missing',
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.textContent || '').slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(openResult.ok, `Unable to open user detail delete confirmation: ${JSON.stringify(openResult)}`);

  const dialogState = await evaluate(client, `(() => {
    const dialog = document.querySelector('[data-testid="user-detail-delete-confirm-dialog"]');
    return {
      hasDialog: dialog instanceof HTMLElement,
      role: dialog?.getAttribute('role') || '',
      ariaModal: dialog?.getAttribute('aria-modal') || '',
      labelledBy: dialog?.getAttribute('aria-labelledby') || '',
      title: dialog?.querySelector('h2')?.textContent || '',
      text: dialog?.textContent?.slice(0, 500) || '',
    };
  })()`);
  assert(
    dialogState.hasDialog &&
      dialogState.role === 'dialog' &&
      dialogState.ariaModal === 'true' &&
      dialogState.labelledBy === 'user-detail-delete-confirm-title' &&
      dialogState.title === `Remove ${fullName}?`,
    `User detail delete confirmation is missing dialog semantics: ${JSON.stringify(dialogState)}`,
  );

  await pressKey(client, 'Escape');
  const closed = await evaluate(client, `(() => ({
    closed: !document.querySelector('[data-testid="user-detail-delete-confirm-dialog"]'),
    stillOnDetail: document.body?.innerText?.includes(${JSON.stringify(fullName)}) || false,
  }))()`);
  assert(
    closed.closed && closed.stillOnDetail,
    `Escape did not dismiss user detail delete confirmation safely: ${JSON.stringify(closed)}`,
  );

  return { dialogState, closed };
};

const setUsersBulkStatus = async (client, fullNames, status) => {
  await navigateToUsers(client);
  const commonSearchToken = fullNames.length > 1
    ? (fullNames[0].split(/\s+/)
      .filter((token) => token.length > 2 && fullNames.every((name) => name.includes(token)))
      .sort((left, right) => right.length - left.length)[0] || fullNames[0])
    : fullNames[0];
  await setUsersDirectorySearch(client, commonSearchToken);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr')).map((row) => row.textContent || '');
      const names = ${JSON.stringify(fullNames)};
      return {
        ready: names.every((name) => rows.some((row) => row.includes(name))),
        rows: rows.slice(0, 20),
        query: document.querySelector('input[aria-label="Search users"]')?.value || '',
      };
    })()`);
    if (state.ready) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`Bulk users were not visible together: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  const clearExistingSelection = await evaluate(client, `(() => {
    const clear = document.querySelector('[data-testid="users-bulk-clear-selection"]');
    if (clear instanceof HTMLButtonElement && !clear.disabled) {
      clear.click();
      return { cleared: true };
    }
    return { cleared: false };
  })()`);
  if (clearExistingSelection.cleared) {
    await sleep(250);
  }

  const noSelection = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="users-bulk-actions"]');
    const status = document.querySelector('[data-testid="users-bulk-action-status"]');
    const summary = document.querySelector('[data-testid="users-bulk-selection-summary"]');
    const statusText = (status?.textContent || '').replace(/\\s+/g, ' ').trim();
    const statusId = status?.id || '';
    const summaryId = summary?.id || '';
    const readControl = (testId) => {
      const control = document.querySelector('[data-testid="' + testId + '"]');
      return {
        testId,
        found: control instanceof HTMLElement,
        state: control?.getAttribute('data-action-state') || '',
        actionStatus: control?.getAttribute('data-action-status') || '',
        disabledReason: control?.getAttribute('data-disabled-reason') || '',
        describedBy: control?.getAttribute('aria-describedby') || '',
        disabled: control instanceof HTMLButtonElement || control instanceof HTMLSelectElement || control instanceof HTMLInputElement ? control.disabled : null,
      };
    };
    return {
      role: panel?.getAttribute('role') || '',
      label: panel?.getAttribute('aria-label') || '',
      describedBy: panel?.getAttribute('aria-describedby') || '',
      actionState: panel?.getAttribute('data-action-state') || '',
      actionStatus: panel?.getAttribute('data-action-status') || '',
      selectedCount: panel?.getAttribute('data-selected-count') || '',
      visibleSelectedCount: panel?.getAttribute('data-visible-selected-count') || '',
      hiddenSelectedCount: panel?.getAttribute('data-hidden-selected-count') || '',
      statusId,
      statusText,
      summaryId,
      summaryText: (summary?.textContent || '').replace(/\\s+/g, ' ').trim(),
      selectVisible: readControl('users-bulk-select-visible'),
      statusSelect: readControl('users-bulk-status-select'),
      applyStatus: readControl('users-bulk-apply-status'),
      deleteSelected: readControl('users-bulk-delete'),
    };
  })()`);
  assert(
    noSelection.role === 'group' &&
      noSelection.label === 'Selected user bulk actions' &&
      noSelection.describedBy.includes(noSelection.summaryId) &&
      noSelection.describedBy.includes(noSelection.statusId) &&
      noSelection.actionState === 'blocked' &&
      noSelection.actionStatus === noSelection.statusText &&
      noSelection.selectedCount === '0' &&
      noSelection.visibleSelectedCount === '0' &&
      noSelection.hiddenSelectedCount === '0' &&
      noSelection.summaryText.startsWith('0 selected') &&
      noSelection.statusText.includes('Select visible available for') &&
      noSelection.statusText.includes('Bulk status unavailable: Select one or more non-current users first.') &&
      noSelection.statusText.includes('Apply status unavailable: Select one or more non-current users first.') &&
      noSelection.statusText.includes('Delete selected unavailable: Select one or more non-current users first.') &&
      noSelection.selectVisible.state === 'ready' &&
      noSelection.statusSelect.state === 'blocked' &&
      noSelection.applyStatus.state === 'blocked' &&
      noSelection.deleteSelected.state === 'blocked' &&
      noSelection.statusSelect.disabledReason === 'Select one or more non-current users first.' &&
      noSelection.applyStatus.disabledReason === 'Select one or more non-current users first.' &&
      noSelection.deleteSelected.disabledReason === 'Select one or more non-current users first.',
    `Users bulk no-selection action status drifted: ${JSON.stringify(noSelection)}`,
  );

  const selectResult = await evaluate(client, `(() => {
    const names = ${JSON.stringify(fullNames)};
    for (const name of names) {
      const row = Array.from(document.querySelectorAll('tbody tr')).find((candidate) => (
        (candidate.textContent || '').includes(name)
      ));
      const checkbox = row?.querySelector('input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement)) {
        return { ok: false, reason: 'checkbox-missing', name };
      }
      if (checkbox.disabled) {
        return { ok: false, reason: 'checkbox-disabled', name };
      }
      if (!checkbox.checked) {
        checkbox.click();
      }
    }
    return { ok: true };
  })()`);
  assert(selectResult.ok, `Unable to select users for bulk action: ${JSON.stringify(selectResult)}`);
  await sleep(250);

  let selectedState = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    selectedState = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="users-bulk-actions"]');
      const status = document.querySelector('[data-testid="users-bulk-action-status"]');
      const summary = document.querySelector('[data-testid="users-bulk-selection-summary"]');
      const statusText = (status?.textContent || '').replace(/\\s+/g, ' ').trim();
      const statusId = status?.id || '';
      const readControl = (testId) => {
        const control = document.querySelector('[data-testid="' + testId + '"]');
        return {
          testId,
          found: control instanceof HTMLElement,
          state: control?.getAttribute('data-action-state') || '',
          actionStatus: control?.getAttribute('data-action-status') || '',
          disabledReason: control?.getAttribute('data-disabled-reason') || '',
          describedBy: control?.getAttribute('aria-describedby') || '',
          disabled: control instanceof HTMLButtonElement || control instanceof HTMLSelectElement || control instanceof HTMLInputElement ? control.disabled : null,
        };
      };
      return {
        role: panel?.getAttribute('role') || '',
        label: panel?.getAttribute('aria-label') || '',
        actionState: panel?.getAttribute('data-action-state') || '',
        actionStatus: panel?.getAttribute('data-action-status') || '',
        selectedCount: panel?.getAttribute('data-selected-count') || '',
        visibleSelectedCount: panel?.getAttribute('data-visible-selected-count') || '',
        hiddenSelectedCount: panel?.getAttribute('data-hidden-selected-count') || '',
        statusId,
        statusText,
        summaryText: (summary?.textContent || '').replace(/\\s+/g, ' ').trim(),
        selectVisible: readControl('users-bulk-select-visible'),
        statusSelect: readControl('users-bulk-status-select'),
        applyStatus: readControl('users-bulk-apply-status'),
        deleteSelected: readControl('users-bulk-delete'),
        clearSelection: readControl('users-bulk-clear-selection'),
      };
  })()`);
    if (
      selectedState.actionState === 'ready' &&
      selectedState.selectedCount === String(fullNames.length) &&
      selectedState.statusText.includes(`Bulk status available for ${fullNames.length} selected non-current user`) &&
      selectedState.statusSelect.state === 'ready' &&
      selectedState.applyStatus.state === 'ready' &&
      selectedState.deleteSelected.state === 'ready' &&
      selectedState.clearSelection.state === 'ready'
    ) {
      break;
    }
    await sleep(250);
  }
  assert(
    selectedState?.role === 'group' &&
      selectedState.label === 'Selected user bulk actions' &&
      selectedState.actionState === 'ready' &&
      selectedState.actionStatus === selectedState.statusText &&
      selectedState.selectedCount === String(fullNames.length) &&
      selectedState.visibleSelectedCount === String(fullNames.length) &&
      selectedState.hiddenSelectedCount === '0' &&
      selectedState.summaryText.includes(`${fullNames.length} selected`) &&
      selectedState.statusText.includes(`Apply status available for ${fullNames.length} selected non-current user`) &&
      selectedState.statusText.includes(`Delete selected available for ${fullNames.length} selected non-current user`) &&
      selectedState.statusText.includes(`Clear selection available for ${fullNames.length} selected non-current user`) &&
      [selectedState.statusSelect, selectedState.applyStatus, selectedState.deleteSelected, selectedState.clearSelection].every((control) => (
        control.found &&
        control.state === 'ready' &&
        control.actionStatus === selectedState.statusText &&
        control.disabledReason === '' &&
        control.describedBy === selectedState.statusId &&
        control.disabled === false
      )),
    `Users bulk selected action status drifted: ${JSON.stringify(selectedState)}`,
  );

  const result = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="users-bulk-actions"]');
    const select = panel?.querySelector('[data-testid="users-bulk-status-select"]');
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'bulk-select-missing' };
    }
    select.value = ${JSON.stringify(status)};
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const button = panel?.querySelector('[data-testid="users-bulk-apply-status"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'apply-button-missing', panel: panel?.textContent?.slice(0, 500) || '' };
    }
    if (button.disabled) {
      return { ok: false, reason: 'apply-button-disabled', panel: panel?.textContent?.slice(0, 500) || '' };
    }
    button.click();
    return { ok: true };
  })()`);

  assert(result.ok, `Unable to run users bulk status action: ${JSON.stringify(result)}`);
};

const removeUserWithBulkDeleteDialog = async (client, fullName, email) => {
  await navigateToUsers(client, fullName);
  await waitForUsersPageUser(client, fullName);

  const clearExistingSelection = await evaluate(client, `(() => {
    const clear = document.querySelector('[data-testid="users-bulk-clear-selection"]');
    if (clear instanceof HTMLButtonElement && !clear.disabled) {
      clear.click();
      return { cleared: true };
    }
    return { cleared: false };
  })()`);
  if (clearExistingSelection.cleared) {
    await sleep(250);
  }

  const selectResult = await evaluate(client, `(() => {
    const row = Array.from(document.querySelectorAll('tbody tr')).find((candidate) => (
      (candidate.textContent || '').includes(${JSON.stringify(fullName)})
    ));
    const checkbox = row?.querySelector('input[type="checkbox"]');
    if (!(checkbox instanceof HTMLInputElement)) {
      return { ok: false, reason: 'checkbox-missing', rows: Array.from(document.querySelectorAll('tbody tr')).map((row) => row.textContent || '').slice(0, 12) };
    }
    if (checkbox.disabled) return { ok: false, reason: 'checkbox-disabled' };
    if (!checkbox.checked) checkbox.click();
    return { ok: true };
  })()`);
  assert(selectResult.ok, `Unable to select ${fullName} for bulk delete: ${JSON.stringify(selectResult)}`);

  let readyState = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    readyState = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="users-bulk-actions"]');
      const status = document.querySelector('[data-testid="users-bulk-action-status"]');
      const deleteButton = document.querySelector('[data-testid="users-bulk-delete"]');
      return {
        selectedCount: panel?.getAttribute('data-selected-count') || '',
        actionState: panel?.getAttribute('data-action-state') || '',
        statusText: (status?.textContent || '').replace(/\\s+/g, ' ').trim(),
        deleteState: deleteButton?.getAttribute('data-action-state') || '',
        deleteStatus: deleteButton?.getAttribute('data-action-status') || '',
        deleteDisabledReason: deleteButton?.getAttribute('data-disabled-reason') || '',
        deleteDisabled: deleteButton instanceof HTMLButtonElement ? deleteButton.disabled : null,
      };
    })()`);
    if (
      readyState.selectedCount === '1' &&
      readyState.actionState === 'ready' &&
      readyState.deleteState === 'ready' &&
      readyState.deleteDisabled === false
    ) {
      break;
    }
    await sleep(250);
  }
  assert(
    readyState?.selectedCount === '1' &&
      readyState.actionState === 'ready' &&
      readyState.deleteState === 'ready' &&
      readyState.deleteStatus === readyState.statusText &&
      readyState.deleteDisabledReason === '' &&
      readyState.deleteDisabled === false,
    `Users bulk delete action did not become ready: ${JSON.stringify(readyState)}`,
  );

  const openDialog = async () => evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="users-bulk-delete"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'delete-button-missing' };
    if (button.disabled) return { ok: false, reason: 'delete-button-disabled' };
    button.click();
    return { ok: true };
  })()`);

  const assertDialogReady = async () => {
    const state = await evaluate(client, `(() => {
      const dialog = document.querySelector('[data-testid="users-bulk-delete-confirm-dialog"]');
      const status = document.querySelector('[data-testid="users-bulk-delete-confirm-action-status"]');
      const cancel = document.querySelector('[data-testid="users-bulk-delete-cancel"]');
      const confirm = document.querySelector('[data-testid="users-bulk-delete-confirm"]');
      const statusId = status?.id || '';
      const statusText = (status?.textContent || '').replace(/\\s+/g, ' ').trim();
      return {
        hasDialog: dialog instanceof HTMLElement,
        role: dialog?.getAttribute('role') || '',
        ariaModal: dialog?.getAttribute('aria-modal') || '',
        labelledBy: dialog?.getAttribute('aria-labelledby') || '',
        describedBy: dialog?.getAttribute('aria-describedby') || '',
        actionState: dialog?.getAttribute('data-action-state') || '',
        actionStatus: dialog?.getAttribute('data-action-status') || '',
        selectedCount: dialog?.getAttribute('data-selected-count') || '',
        hiddenSelectedCount: dialog?.getAttribute('data-hidden-selected-count') || '',
        title: dialog?.querySelector('h2')?.textContent || '',
        text: dialog?.textContent?.slice(0, 500) || '',
        statusId,
        statusText,
        cancelState: cancel?.getAttribute('data-action-state') || '',
        cancelStatus: cancel?.getAttribute('data-action-status') || '',
        cancelDescribedBy: cancel?.getAttribute('aria-describedby') || '',
        cancelDisabledReason: cancel?.getAttribute('data-disabled-reason') || '',
        cancelDisabled: cancel instanceof HTMLButtonElement ? cancel.disabled : null,
        confirmState: confirm?.getAttribute('data-action-state') || '',
        confirmStatus: confirm?.getAttribute('data-action-status') || '',
        confirmDescribedBy: confirm?.getAttribute('aria-describedby') || '',
        confirmDisabledReason: confirm?.getAttribute('data-disabled-reason') || '',
        confirmDisabled: confirm instanceof HTMLButtonElement ? confirm.disabled : null,
      };
    })()`);
    assert(
      state.hasDialog &&
        state.role === 'dialog' &&
        state.ariaModal === 'true' &&
        state.labelledBy === 'users-bulk-delete-confirm-title' &&
        state.describedBy.includes('users-bulk-delete-confirm-description') &&
        state.describedBy.includes(state.statusId) &&
        state.actionState === 'ready' &&
        state.actionStatus === state.statusText &&
        state.selectedCount === '1' &&
        state.hiddenSelectedCount === '0' &&
        state.title === 'Remove selected users?' &&
        state.text.includes('This revokes admin access for 1 selected account') &&
        state.cancelState === 'ready' &&
        state.cancelStatus.includes('Cancel bulk user deletion available.') &&
        state.cancelDescribedBy === state.statusId &&
        state.cancelDisabledReason === '' &&
        state.cancelDisabled === false &&
        state.confirmState === 'ready' &&
        state.confirmStatus.includes('Remove selected users available for 1 selected non-current user.') &&
        state.confirmDescribedBy === state.statusId &&
        state.confirmDisabledReason === '' &&
        state.confirmDisabled === false,
      `Users bulk delete confirmation action status drifted: ${JSON.stringify(state)}`,
    );
    return state;
  };

  const openResult = await openDialog();
  assert(openResult.ok, `Unable to open users bulk delete confirmation: ${JSON.stringify(openResult)}`);
  const firstDialogState = await assertDialogReady();

  const cancelResult = await evaluate(client, `(() => {
    const cancel = document.querySelector('[data-testid="users-bulk-delete-cancel"]');
    if (!(cancel instanceof HTMLButtonElement)) return { ok: false, reason: 'cancel-missing' };
    if (cancel.disabled) return { ok: false, reason: 'cancel-disabled' };
    cancel.click();
    return { ok: true };
  })()`);
  assert(cancelResult.ok, `Unable to cancel users bulk delete confirmation: ${JSON.stringify(cancelResult)}`);
  const canceled = await evaluate(client, `(() => ({
    closed: !document.querySelector('[data-testid="users-bulk-delete-confirm-dialog"]'),
    stillHasUser: document.body?.innerText?.includes(${JSON.stringify(fullName)}) || false,
  }))()`);
  assert(canceled.closed && canceled.stillHasUser, `Users bulk delete cancel did not close safely: ${JSON.stringify(canceled)}`);

  const reopenResult = await openDialog();
  assert(reopenResult.ok, `Unable to reopen users bulk delete confirmation: ${JSON.stringify(reopenResult)}`);
  await assertDialogReady();
  const confirmResult = await evaluate(client, `(() => {
    const confirm = document.querySelector('[data-testid="users-bulk-delete-confirm"]');
    if (!(confirm instanceof HTMLButtonElement)) return { ok: false, reason: 'confirm-missing' };
    if (confirm.disabled) return { ok: false, reason: 'confirm-disabled' };
    confirm.click();
    return { ok: true };
  })()`);
  assert(confirmResult.ok, `Unable to confirm users bulk delete: ${JSON.stringify(confirmResult)}`);

  await waitForUserMissing(email);
  return firstDialogState;
};

const waitForUsersImportReady = async (client) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const modeSelect = document.querySelector('select[aria-label="User import duplicate handling"]');
      const input = document.querySelector('input[aria-label="Import users CSV"]');
      const importButtons = Array.from(document.querySelectorAll('button')).filter((button) => {
        const text = button.textContent || '';
        return text.includes('Preview CSV') || text.includes('Import CSV') || text.includes('Previewing') || text.includes('Importing');
      });
      return {
        ready: Boolean(document.querySelector('[data-testid="users-command-center"]')) &&
          modeSelect instanceof HTMLSelectElement &&
          input instanceof HTMLInputElement &&
          !modeSelect.disabled &&
          importButtons.length >= 2 &&
          importButtons.every((button) => !button.disabled),
        hasInput: input instanceof HTMLInputElement,
        modeDisabled: modeSelect instanceof HTMLSelectElement ? modeSelect.disabled : null,
        importButtons: importButtons.map((button) => ({
          text: (button.textContent || '').trim(),
          disabled: button.disabled,
        })),
        body: document.body?.innerText?.slice(0, 800) || '',
      };
    })()`);
    if (state.ready) return state;
    if (attempt === 119) {
      throw new Error(`Users import controls did not become ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const importUsersThroughUi = async (client, csvPath, expectedName, options = {}) => {
  const {
    mode = 'create',
    dryRun = false,
    created = 1,
    updated = 0,
    skipped = 1,
  } = options;
  await navigateToUsers(client);
  await waitForUsersImportReady(client);
  await setUsersDirectorySearch(client, dryRun ? '' : expectedName);

  const markResult = await evaluate(client, `(() => {
    const modeSelect = document.querySelector('select[aria-label="User import duplicate handling"]');
    if (!(modeSelect instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'import-mode-missing' };
    }
    if (modeSelect.disabled) {
      return { ok: false, reason: 'import-mode-disabled' };
    }
    modeSelect.value = ${JSON.stringify(mode)};
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const input = document.querySelector('input[aria-label="Import users CSV"]');
    if (!(input instanceof HTMLInputElement)) {
      return {
        ok: false,
        reason: 'import-input-missing',
        inputs: Array.from(document.querySelectorAll('input')).map((candidate) => candidate.getAttribute('aria-label') || candidate.type).slice(0, 40),
      };
    }
    input.setAttribute('data-users-smoke-import-input', 'true');
    input.setAttribute('data-import-dry-run', ${JSON.stringify(dryRun ? 'true' : 'false')});
    return { ok: true };
  })()`);
  assert(markResult.ok, `Unable to find users import input: ${JSON.stringify(markResult)}`);

  await client.send('DOM.enable');
  const documentResult = await client.send('DOM.getDocument', { depth: 1 });
  const queryResult = await client.send('DOM.querySelector', {
    nodeId: documentResult.root.nodeId,
    selector: 'input[data-users-smoke-import-input="true"]',
  });
  assert(queryResult.nodeId, `Unable to resolve users import input node: ${JSON.stringify(queryResult)}`);
  await client.send('DOM.setFileInputFiles', {
    nodeId: queryResult.nodeId,
    files: [csvPath],
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const result = document.querySelector('[data-testid="users-import-result"]');
      const text = result?.textContent || '';
      return {
        hasResult: Boolean(result),
        hasPreview: ${JSON.stringify(dryRun)} ? text.includes('Import preview') && text.includes('No changes applied') : text.includes('Import result'),
        hasCreated: text.includes(${JSON.stringify(`${created} created`)}),
        hasUpdated: text.includes(${JSON.stringify(`${updated} updated`)}),
        hasSkipped: text.includes(${JSON.stringify(`${skipped} skipped`)}),
        hasUser: ${JSON.stringify(dryRun)} ? true : (document.body?.innerText?.includes(${JSON.stringify(expectedName)}) || false),
        text: text.slice(0, 800),
      };
    })()`);
    if (state.hasResult && state.hasPreview && state.hasCreated && state.hasUpdated && state.hasSkipped && state.hasUser) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Users import UI did not finish: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const rollbackLatestUsersImport = async (client, email, restoredName) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="users-import-rollback-button"]');
      return {
        ready: button instanceof HTMLButtonElement && button.disabled === false,
        hasButton: Boolean(button),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);
    if (state.ready) break;
    if (attempt === 119) throw new Error(`Users import rollback button did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }
  const clickResult = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="users-import-rollback-button"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'button-missing' };
    button.click();
    return { ok: true };
  })()`);
  assert(clickResult.ok, `Unable to click users import rollback: ${JSON.stringify(clickResult)}`);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const dialog = document.querySelector('[data-testid="users-import-rollback-confirm-dialog"]');
      const confirm = document.querySelector('[data-testid="users-import-rollback-confirm"]');
      const text = dialog?.textContent || '';
      return {
        ready: Boolean(dialog) &&
          confirm instanceof HTMLButtonElement &&
          text.includes('Roll back imported users?') &&
          text.includes('created') &&
          text.includes('updated'),
        text: text.slice(0, 900),
      };
    })()`);
    if (state.ready) break;
    if (attempt === 79) throw new Error(`Users import rollback confirmation did not open: ${JSON.stringify(state)}`);
    await sleep(250);
  }
  const confirmResult = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="users-import-rollback-confirm"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'confirm-missing' };
    if (button.disabled) return { ok: false, reason: 'confirm-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(confirmResult.ok, `Unable to confirm users import rollback: ${JSON.stringify(confirmResult)}`);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return {
        ready: body.includes('Rolled back import') &&
          body.includes('1 update restored') &&
          body.includes(${JSON.stringify(restoredName)}) &&
          body.includes(${JSON.stringify(email)}),
        body: body.slice(0, 1200),
      };
    })()`);
    if (state.ready) return state;
    if (attempt === 119) throw new Error(`Users import rollback result did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }
  return null;
};

const assertLayout = async (client, expectedName) => {
  const layout = await evaluate(client, `(() => {
    const secondaryActions = document.querySelector('[data-testid="users-secondary-actions"]');
    const secondaryStatus = document.querySelector('[data-testid="users-command-secondary-action-status"]');
    const secondaryStatusId = secondaryStatus?.id || '';
    const readCommandAction = (testId) => {
      const element = document.querySelector('[data-testid="' + testId + '"]');
      return {
        exists: Boolean(element),
        actionState: element?.getAttribute('data-action-state') || '',
        actionStatus: element?.getAttribute('data-action-status') || '',
        disabledReason: element?.getAttribute('data-disabled-reason') || '',
        describedBy: element?.getAttribute('aria-describedby') || '',
      };
    };

    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hasCommandCenter: Boolean(document.querySelector('[data-testid="users-command-center"]')),
      firstPrimaryActionText: document.querySelector('[data-testid="users-primary-actions"] button')?.textContent?.trim() || '',
      secondaryActionsCollapsed: secondaryActions instanceof HTMLDetailsElement &&
        secondaryActions.open === false &&
        secondaryActions.getAttribute('data-default-collapsed') === 'true',
      hasMoreActionsTrigger: Boolean(document.querySelector('[data-testid="users-more-actions"]')),
      hasHandoffActionsNested: Boolean(
        document.querySelector('[data-testid="users-secondary-action-menu"] [data-testid="users-command-copy-manifest"]') &&
        document.querySelector('[data-testid="users-secondary-action-menu"] [data-testid="users-command-download-json"]'),
      ),
      secondaryActionStatusId: secondaryStatusId,
      secondaryActionStatusText: secondaryStatus?.textContent?.trim() || '',
      secondaryActionGroupStatus: secondaryActions?.getAttribute('data-action-status') || '',
      secondaryActionGroupState: secondaryActions?.getAttribute('data-action-state') || '',
      secondaryActionGroupDescribedBy: secondaryActions?.getAttribute('aria-describedby') || '',
      exportAction: readCommandAction('users-command-export-csv'),
      csvTemplateAction: readCommandAction('users-command-csv-template'),
      importModeAction: readCommandAction('users-command-import-mode'),
      copyAction: readCommandAction('users-command-copy-manifest'),
      downloadAction: readCommandAction('users-command-download-json'),
      controlMapCollapsed: document.querySelector('[data-testid="users-control-map-details"]') instanceof HTMLDetailsElement &&
        document.querySelector('[data-testid="users-control-map-details"]')?.open === false &&
        document.querySelector('[data-testid="users-control-map-details"]')?.getAttribute('data-default-collapsed') === 'true',
      apiDetailsCollapsed: document.querySelector('[data-testid="users-api-details"]') instanceof HTMLDetailsElement &&
        document.querySelector('[data-testid="users-api-details"]')?.open === false &&
        document.querySelector('[data-testid="users-api-details"]')?.getAttribute('data-default-collapsed') === 'true',
      hasControlMap: Boolean(document.querySelector('[data-testid="users-control-map"]')) &&
        (document.querySelector('[data-testid="users-control-map-details"]')?.textContent || '').includes('Users control map') &&
        (document.querySelector('[data-testid="users-control-map-details"]')?.textContent || '').includes('Show map'),
      hasDirectory: document.body?.innerText?.includes('People directory') || document.body?.innerText?.includes(${JSON.stringify(expectedName)}) || false,
      hasApi: document.body?.innerText?.includes('User access API') || false,
      hasMembership: document.body?.innerText?.includes('Membership registration') || false,
      hasMemberAuthBoundary: Boolean(document.querySelector('[data-testid="users-member-auth-boundary"]')) &&
        document.body?.innerText?.includes('Member auth boundary') &&
        document.body?.innerText?.includes('Credentialed member login') &&
        document.body?.innerText?.includes('Self-service member portal'),
      hasMemberAccessHandoff: Boolean(document.querySelector('[data-testid="users-member-access-handoff"]')) &&
        document.body?.innerText?.includes('backy.member-access-handoff.v1') &&
        document.body?.innerText?.includes('Copy member handoff') &&
        document.body?.innerText?.includes('Editable regions') &&
        document.body?.innerText?.includes('Data bindings'),
      hasActivity: document.body?.innerText?.includes('Access activity') || false,
    };
  })()`);
  assert(layout.scrollWidth <= layout.width + 8, `Users page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter &&
      layout.firstPrimaryActionText === 'Invite user' &&
      layout.secondaryActionsCollapsed &&
      layout.hasMoreActionsTrigger &&
      layout.hasHandoffActionsNested &&
      layout.controlMapCollapsed &&
      layout.apiDetailsCollapsed &&
      layout.hasControlMap &&
      layout.hasDirectory &&
      layout.hasApi &&
      layout.hasMembership &&
      layout.hasMemberAuthBoundary &&
      layout.hasMemberAccessHandoff &&
      layout.hasActivity,
    `Users page missing expected regions or action hierarchy: ${JSON.stringify(layout)}`,
  );
  const secondaryCommandActions = [
    layout.exportAction,
    layout.csvTemplateAction,
    layout.importModeAction,
    layout.copyAction,
    layout.downloadAction,
  ];
  assert(
    layout.secondaryActionStatusId === 'users-command-secondary-action-status' &&
      layout.secondaryActionGroupDescribedBy === layout.secondaryActionStatusId &&
      layout.secondaryActionGroupState === 'ready' &&
      layout.secondaryActionGroupStatus === layout.secondaryActionStatusText &&
      layout.secondaryActionStatusText.includes('Export CSV available') &&
      layout.secondaryActionStatusText.includes('CSV template available') &&
      layout.secondaryActionStatusText.includes('Import duplicate handling available') &&
      layout.secondaryActionStatusText.includes('Copy manifest available') &&
      layout.secondaryActionStatusText.includes('Download JSON available') &&
      secondaryCommandActions.every((action) => (
        action.exists &&
        action.actionState === 'ready' &&
        action.actionStatus &&
        action.disabledReason === '' &&
        action.describedBy === layout.secondaryActionStatusId
      )),
    `Users command center secondary actions missing ready action metadata: ${JSON.stringify(layout)}`,
  );
  return layout;
};

const waitForUserActivity = async (client, email) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: document.body?.innerText?.includes('Access activity') || false,
      hasUser: document.body?.innerText?.includes(${JSON.stringify(email)}) || false,
      hasUpdated: document.body?.innerText?.includes('Updated') || false,
      body: document.body?.innerText?.slice(0, 1600) || '',
    }))()`);
    if (state.ready && state.hasUser && state.hasUpdated) {
      return state;
    }
    await sleep(250);
  }

  throw new Error(`Users activity panel did not show ${email}: timed out`);
};

const waitForUserDetailActivity = async (client, email) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-activity"]');
      const text = panel?.textContent || '';
      const filters = document.querySelector('[data-testid="user-detail-activity-filters"]');
      const detail = document.querySelector('[data-testid="user-detail-activity-detail"]');
      return {
        ready: Boolean(panel),
        hasFilters: Boolean(filters),
        hasDetail: Boolean(detail),
        hasDetailPayload: (detail?.textContent || '').includes('Audit event detail') &&
          (detail?.textContent || '').includes('After') &&
          (detail?.textContent || '').includes('Metadata'),
        hasUser: text.includes(${JSON.stringify(email)}),
        hasUpdated: text.includes('Updated'),
        hasSuspended: text.includes('suspended'),
        text: text.slice(0, 1600),
      };
    })()`);
    if (state.ready && state.hasFilters && state.hasDetail && state.hasDetailPayload && state.hasUser && state.hasUpdated && state.hasSuspended) {
      break;
    }
    await sleep(250);
    if (attempt === 99) {
      throw new Error(`User detail activity panel did not show ${email}: ${JSON.stringify(state).slice(0, 2000)}`);
    }
  }

  const selected = await evaluate(client, `(() => {
    const action = document.querySelector('[data-testid="user-detail-activity-filter-action"]');
    if (!(action instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'missing-action-filter' };
    }
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    valueSetter?.call(action, 'update');
    action.dispatchEvent(new Event('input', { bubbles: true }));
    action.dispatchEvent(new Event('change', { bubbles: true }));
    const detailButton = document.querySelector('[data-testid="user-detail-activity-view-detail"]');
    if (detailButton instanceof HTMLButtonElement) {
      detailButton.click();
    }
    return { ok: true, value: action.value };
  })()`);
  assert(selected.ok && selected.value === 'update', `Unable to select user detail activity filter: ${JSON.stringify(selected)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const filtered = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-activity"]');
      const action = document.querySelector('[data-testid="user-detail-activity-filter-action"]');
      const results = document.querySelector('[data-testid="user-detail-activity-results"]');
      const detail = document.querySelector('[data-testid="user-detail-activity-detail"]');
      const text = panel?.textContent || '';
      const detailText = detail?.textContent || '';
      return {
        actionValue: action instanceof HTMLSelectElement ? action.value : '',
        hasFilteredCopy: text.includes('for updated'),
        hasUpdated: (results?.textContent || '').includes('Updated'),
        hasSuspended: text.includes('suspended'),
        hasDetailPayload: detailText.includes('Audit event detail') &&
          detailText.includes('Action') &&
          detailText.includes('After') &&
          detailText.includes('Metadata'),
        detailText: detailText.slice(0, 1200),
        text: text.slice(0, 1600),
      };
    })()`);
    if (filtered.actionValue === 'update' && filtered.hasFilteredCopy && filtered.hasUpdated && filtered.hasSuspended && filtered.hasDetailPayload) {
      return filtered;
    }
    await sleep(250);
  }

  throw new Error(`User detail activity filters/detail did not show ${email}: timed out`);
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-users-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, userId }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
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

  if (userId) {
    try {
      await deleteUser(userId);
    } catch {
      // The UI flow may already have removed the temporary user.
    }
  }
};

const main = async () => {
  assertUsersEmptyStatesUseSharedComponent();
  if (process.env.BACKY_USERS_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, guard: 'users-source' }));
    return;
  }

  let client;
  let childProcess;
  let userDataDir;
  let createdUserId;
  let bulkUserId;
  let importedUserId;
  let previewInviteUserId;
  const suffix = Date.now().toString(36);
  const fullName = `Users Smoke ${suffix}`;
  const email = `users-smoke-${suffix}@example.com`;
  const bulkFullName = `Users Bulk ${suffix}`;
  const bulkEmail = `users-bulk-${suffix}@example.com`;
  const previewFullName = `${fullName} Preview`;
  const previewEmail = `preview-${email}`;
  const importedFullName = `Users Import ${suffix}`;
  const importedUpdatedFullName = `Users Import Updated ${suffix}`;
  const importedEmail = `users-import-${suffix}@example.com`;

  try {
    await loginAdminApi();
    await updateUser('user-admin', { role: 'owner', status: 'active' });
    await assertUsersApiRequiresAuth();
    await assertUserPermissionOverridesAreEnforced();
    await assertUserBillingSeatLimitEnforced(suffix);
    await assertUserImportBillingSeatLimitEnforced(suffix);
    const existing = await findUserByEmail(email);
    assert(!existing, `Temporary user already exists: ${email}`);

    const created = await createUser({ fullName, email });
    createdUserId = created.id;
    assert(created.role === 'admin' && created.status === 'invited', `Unexpected created user state: ${JSON.stringify(created)}`);
    const bulkCreated = await createUser({ fullName: bulkFullName, email: bulkEmail, role: 'viewer', status: 'invited' });
    bulkUserId = bulkCreated.id;
    await acceptUserInviteToken(bulkCreated.inviteToken, bulkUserId);
    const pagination = await assertUsersApiPagination({
      search: suffix,
      expectedIds: [createdUserId, bulkUserId],
    });
    const filters = await assertUsersApiFilters({
      search: suffix,
      adminUserId: createdUserId,
      viewerUserId: bulkUserId,
    });
    const sorting = await assertUsersApiSorting({
      search: suffix,
      adminUserId: createdUserId,
      viewerUserId: bulkUserId,
    });

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
    await signInAdmin(client);

    await navigateToInvite(client);
    await assertInviteCommandCenterLayout(client);
    await assertInviteSubmitActionStatus(client, {
      state: 'blocked',
      disabled: false,
      statusIncludes: 'Send invite needs a full name and a valid email address.',
      targetRole: 'editor',
      targetStatus: 'invited',
    });
    await fillInviteForm(client, { fullName: previewFullName, email: previewEmail });
    await assertInviteSubmitActionStatus(client, {
      state: 'ready',
      disabled: false,
      statusIncludes: `Send invite available for ${previewEmail}.`,
      targetEmail: previewEmail,
      targetRole: 'admin',
      targetStatus: 'invited',
    });
    await submitInviteFormAndAssertLink(client, previewEmail);
    const previewInviteUser = await waitForUser(previewEmail, (user) => (
      user.fullName === previewFullName && user.status === 'invited'
    ));
    previewInviteUserId = previewInviteUser.id;
    await clickButton(client, 'Back to users');
    await waitForUsersPageUser(client, previewEmail);
    await waitForUsersPageUser(client, email);
    await waitForUsersPageUser(client, bulkEmail);
    const importCsvPath = path.join(os.tmpdir(), `backy-users-import-${suffix}.csv`);
    fs.writeFileSync(
      importCsvPath,
      [
        'full_name,email,role,status',
        `${importedFullName},${importedEmail},editor,invited`,
        `Duplicate ${fullName},${email},viewer,invited`,
      ].join('\n'),
      'utf8',
    );
    await importUsersThroughUi(client, importCsvPath, importedFullName, { dryRun: true });
    const previewOnlyUser = await findUserByEmail(importedEmail);
    assert(!previewOnlyUser, `Dry-run import should not create users: ${JSON.stringify(previewOnlyUser).slice(0, 500)}`);
    await importUsersThroughUi(client, importCsvPath, importedFullName);
    const importedUser = await waitForUser(importedEmail, (user) => user.fullName === importedFullName && user.role === 'editor' && user.status === 'invited');
    importedUserId = importedUser.id;
    const importAuditLogs = await listUserAuditLogs('import');
    assert(
      importAuditLogs.some((log) => log.action === 'user.import.create' && log.metadata?.created === 1 && log.metadata?.skipped === 1),
      `User import audit log was not recorded: ${JSON.stringify(importAuditLogs).slice(0, 500)}`,
    );
    const upsertCsvPath = path.join(os.tmpdir(), `backy-users-import-upsert-${suffix}.csv`);
    fs.writeFileSync(
      upsertCsvPath,
      [
        'full_name,email,role,status',
        `${importedUpdatedFullName},${importedEmail},viewer,invited`,
      ].join('\n'),
      'utf8',
    );
    await importUsersThroughUi(client, upsertCsvPath, importedUpdatedFullName, {
      mode: 'upsert',
      created: 0,
      updated: 1,
      skipped: 0,
    });
    await waitForUser(importedEmail, (user) => user.fullName === importedUpdatedFullName && user.role === 'viewer' && user.status === 'invited');
    const upsertAuditLogs = await listUserAuditLogs('import');
    assert(
      upsertAuditLogs.some((log) => log.action === 'user.import.upsert' && log.metadata?.updated === 1 && log.metadata?.mode === 'upsert'),
      `User import upsert audit log was not recorded: ${JSON.stringify(upsertAuditLogs).slice(0, 500)}`,
    );
    await rollbackLatestUsersImport(client, importedEmail, importedFullName);
    await waitForUser(importedEmail, (user) => user.fullName === importedFullName && user.role === 'editor' && user.status === 'invited');
    const rollbackAuditLogs = await listUserAuditLogs('import');
    assert(
      rollbackAuditLogs.some((log) => log.action === 'user.import.rollback' && log.metadata?.restoredUserIds?.includes(importedUserId)),
      `User import rollback audit log was not recorded: ${JSON.stringify(rollbackAuditLogs).slice(0, 500)}`,
    );
    await waitForUsersSelfProtection(client);
    await openUserDetail(client, 'Admin User');
    await waitForUserDetailSelfProtection(client);
    await waitForUserDetailSessions(client);
    await navigateToUsers(client);
    await waitForUsersPageUser(client, email);

    await openUserDetail(client, fullName);
    await waitForUserDetailPermissionMatrix(client);
    await assertUserDetailActionStatusContracts(client);
    await setUserDetailPermissionOverride(client, createdUserId);
    const inviteState = await generateUserDetailInviteLink(client, email);
    await acceptUserInviteToken(inviteState?.token, createdUserId);
    const resetState = await generateUserDetailResetToken(client, email);
    const resetPassword = `Reset-${suffix}-123`;
    await resetUserPasswordToken(resetState?.token, createdUserId, email, resetPassword);
    const mfaState = await configureUserDetailMfa(client, { userId: createdUserId, email, password: resetPassword });
    const recoveryAuditLogs = await listUserAuditLogs(createdUserId);
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.invite.accept'),
      `User invite acceptance audit log was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.permission_overrides.update'),
      `User permission override audit log was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.invite_token.create' && log.metadata?.expiresInMinutes === 43200),
      `User invite token audit log with selected expiry was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.password_reset_token.create' && log.metadata?.expiresInMinutes === 240),
      `User reset token audit log with selected expiry was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.password_reset.accept'),
      `User reset acceptance audit log was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.mfa.update' && log.after?.enabled === true),
      `User MFA enable audit log was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.mfa.recovery_codes.rotate' && log.metadata?.recoveryCodesRemaining === 10),
      `User MFA recovery-code rotation audit log was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    await navigateToUsers(client);
    await waitForUsersPageUser(client, email);
    await openUserDetail(client, fullName);
    await transferOwnershipFromDetail(client, fullName);
    const transferTarget = await waitForUser(email, (user) => user.id === createdUserId && user.role === 'owner' && user.status === 'active');
    assert(transferTarget.role === 'owner', `Ownership transfer did not promote target user: ${JSON.stringify(transferTarget).slice(0, 500)}`);
    const demotedAdmin = await getUser('user-admin');
    assert(demotedAdmin.role === 'admin', `Ownership transfer did not demote the previous owner: ${JSON.stringify(demotedAdmin).slice(0, 500)}`);
    const ownershipAuditLogs = await listUserAuditLogs(createdUserId);
    assert(
      ownershipAuditLogs.some((log) => log.action === 'user.ownership.transfer' && log.metadata?.previousOwnerId === 'user-admin' && log.metadata?.newOwnerId === createdUserId),
      `Ownership transfer audit log was not recorded: ${JSON.stringify(ownershipAuditLogs).slice(0, 500)}`,
    );
    await updateUser('user-admin', { role: 'owner', status: 'active' });
    await waitForUser('admin@backy.io', (admin) => admin.role === 'owner' && admin.status === 'active');
    await navigateToUsers(client);
    await waitForUsersPageUser(client, email);

    await setDirectoryUserSelect(client, fullName, 'Change role for', 'viewer');
    await waitForUser(email, (user) => user.role === 'viewer');
    await setDirectoryUserSelect(client, fullName, 'Change status for', 'inactive');
    await waitForUser(email, (user) => user.role === 'viewer' && user.status === 'inactive');
    const updateAuditLogs = await listUserAuditLogs(createdUserId);
    assert(updateAuditLogs.some((log) => log.action === 'update'), `User update audit log was not recorded: ${JSON.stringify(updateAuditLogs).slice(0, 500)}`);

    await openUserDetail(client, fullName);
    await setUserDetailLifecycle(client, 'Suspend');
    const suspended = await waitForUser(email, (user) => user.fullName === fullName && user.role === 'viewer' && user.status === 'suspended');
    assert((await getUser(suspended.id)).status === 'suspended', 'User detail lifecycle action did not persist suspended status.');
    await waitForUserDetailActivity(client, email);
    const detailDeleteDialog = await assertUserDetailDeleteDialogEscape(client, fullName);

    await navigateToUsers(client, fullName);
    await waitForUsersPageUser(client, fullName);
    await setUsersBulkStatus(client, [fullName, bulkFullName], 'inactive');
    await waitForUser(email, (user) => user.status === 'inactive');
    await waitForUser(bulkEmail, (user) => user.status === 'inactive');
    const bulkAuditLogs = await listUserAuditLogs('bulk');
    assert(
      bulkAuditLogs.some((log) => log.action === 'user.bulk.status.update'),
      `Bulk status audit log was not recorded: ${JSON.stringify(bulkAuditLogs).slice(0, 500)}`,
    );

    const bulkDeleteDialog = await removeUserWithBulkDeleteDialog(client, bulkFullName, bulkEmail);
    bulkUserId = null;

    await navigateToUsers(client, fullName);
    await waitForUsersPageUser(client, fullName);
    await waitForUserActivity(client, email);
    await assertLayout(client, fullName);
    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await removeUserFromDirectory(client, fullName);
    await waitForUserMissing(email);
    createdUserId = null;

    console.log(JSON.stringify({
      ok: true,
      createdEmail: email,
      fullName,
      pagination,
      filters,
      sorting,
      mfa: {
        generatedRecoveryCodes: mfaState.generatedCount,
        remainingAfterUse: mfaState.remainingAfterUse,
      },
      detailDeleteDialog,
      bulkDeleteDialog,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await updateUser('user-admin', { role: 'owner', status: 'active' }).catch(() => undefined);
    await cleanup({ client, childProcess, userDataDir, userId: createdUserId });
    if (importedUserId) {
      await deleteUser(importedUserId).catch(() => undefined);
    }
    if (bulkUserId) {
      await deleteUser(bulkUserId).catch(() => undefined);
    }
    if (previewInviteUserId) {
      await deleteUser(previewInviteUserId).catch(() => undefined);
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
